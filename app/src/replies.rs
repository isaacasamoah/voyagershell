use std::{
    collections::{BTreeMap, VecDeque},
    sync::{Arc, Mutex, PoisonError},
    time::{Duration, Instant},
};
use voyager_contract::reply::ReplyEvent;

pub const TURN_BYTES: usize = 256 * 1024;
pub const STOP_GRACE: Duration = Duration::from_secs(2);
const TURNS_KEPT: usize = 8;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Ending {
    Stopped { text: String, matched: bool },
    Failed { error: String },
    Lost,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Message {
    pub id: String,
    pub text: String,
    pub complete: bool,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Turn {
    pub id: String,
    pub messages: Vec<Message>,
    pub ending: Option<Ending>,
    pub truncated: bool,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Unreadable {
    pub event: String,
    pub error: String,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Snapshot {
    pub turns: Vec<Turn>,
    pub unreadable: Option<Unreadable>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Step {
    Streaming,
    Started(String),
    Ended,
    Silent,
}

#[derive(Default)]
struct Pending {
    next: u32,
    held: BTreeMap<u32, (String, bool)>,
}

enum Stopping {
    Text(String),
    Failed(String),
}

struct Slot {
    id: String,
    messages: Vec<Message>,
    pending: Vec<Pending>,
    bytes: usize,
    truncated: bool,
    stop: Option<Stopping>,
    lost: bool,
}

#[derive(Default)]
struct State {
    turns: VecDeque<Slot>,
    unreadable: Option<Unreadable>,
}

#[derive(Clone, Default)]
pub struct Replies {
    state: Arc<Mutex<State>>,
}

impl Replies {
    pub fn snapshot(&self) -> Snapshot {
        let state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        Snapshot {
            turns: state.turns.iter().map(Slot::view).collect(),
            unreadable: state.unreadable.clone(),
        }
    }

    pub fn stop_missing(&self, done_since: Option<Instant>, now: Instant) -> bool {
        let state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        state.turns.back().is_some_and(|slot| slot.stop.is_none())
            && done_since.is_some_and(|since| now.saturating_duration_since(since) >= STOP_GRACE)
    }

    pub fn accept(&self, event: ReplyEvent) -> Step {
        let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        state.accept(event)
    }
}

impl State {
    fn accept(&mut self, event: ReplyEvent) -> Step {
        match event {
            ReplyEvent::Unreadable { event, error } => {
                self.unreadable = Some(Unreadable { event, error });
                Step::Streaming
            }
            ReplyEvent::Text {
                turn,
                message,
                index,
                last,
                text,
            } => {
                let (slot, started) = self.slot(&turn);
                slot.take(&message, index, last, text);
                if started {
                    Step::Started(turn)
                } else {
                    Step::Streaming
                }
            }
            ReplyEvent::TurnEnd { turn, text } => self.stop(Some(turn), Stopping::Text(text)),
            ReplyEvent::TurnFailed { turn, error } => self.stop(turn, Stopping::Failed(error)),
        }
    }

    fn slot(&mut self, turn: &str) -> (&mut Slot, bool) {
        let found = self.turns.iter().position(|slot| slot.id == turn);
        let started = found.is_none();
        if started {
            if let Some(previous) = self.turns.back_mut().filter(|slot| slot.stop.is_none()) {
                previous.lost = true;
            }
            self.turns.push_back(Slot::new(turn));
            while self.turns.len() > TURNS_KEPT {
                self.turns.pop_front();
            }
        }
        let index = found.unwrap_or(self.turns.len() - 1);
        (&mut self.turns[index], started)
    }

    fn stop(&mut self, turn: Option<String>, stopping: Stopping) -> Step {
        let known = match &turn {
            Some(turn) => self.turns.iter().any(|slot| &slot.id == turn),
            None => !self.turns.is_empty(),
        };
        let id = turn.unwrap_or_else(|| {
            self.turns
                .back()
                .map(|slot| slot.id.clone())
                .unwrap_or_default()
        });
        let (slot, _) = self.slot(&id);
        slot.stop = Some(stopping);
        if known { Step::Ended } else { Step::Silent }
    }
}

impl Slot {
    fn new(id: &str) -> Self {
        Self {
            id: id.into(),
            messages: Vec::new(),
            pending: Vec::new(),
            bytes: 0,
            truncated: false,
            stop: None,
            lost: false,
        }
    }

    fn take(&mut self, message: &str, index: u32, last: bool, text: String) {
        let slot = match self.messages.iter().position(|seen| seen.id == message) {
            Some(slot) => slot,
            None => {
                self.stop = None;
                self.messages.push(Message {
                    id: message.into(),
                    ..Message::default()
                });
                self.pending.push(Pending::default());
                self.messages.len() - 1
            }
        };
        let pending = &mut self.pending[slot];
        if index < pending.next || pending.held.contains_key(&index) {
            return;
        }
        if self.bytes + text.len() > TURN_BYTES {
            self.truncated = true;
            return;
        }
        self.bytes += text.len();
        pending.held.insert(index, (text, last));
        let message = &mut self.messages[slot];
        while let Some((text, last)) = pending.held.remove(&pending.next) {
            message.text.push_str(&text);
            message.complete |= last;
            pending.next += 1;
        }
    }

    fn whole(&self) -> bool {
        !self.truncated && self.messages.iter().all(|message| message.complete)
    }

    fn view(&self) -> Turn {
        let ending = match &self.stop {
            Some(Stopping::Text(text)) => Some(Ending::Stopped {
                text: text.clone(),
                matched: self.whole()
                    && self
                        .messages
                        .last()
                        .is_some_and(|message| message.text.trim_end() == text.trim_end()),
            }),
            Some(Stopping::Failed(error)) => Some(Ending::Failed {
                error: error.clone(),
            }),
            None => self.lost.then_some(Ending::Lost),
        };
        Turn {
            id: self.id.clone(),
            messages: self.messages.clone(),
            ending,
            truncated: self.truncated,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chunk(turn: &str, message: &str, index: u32, last: bool, text: &str) -> ReplyEvent {
        ReplyEvent::Text {
            turn: turn.into(),
            message: message.into(),
            index,
            last,
            text: text.into(),
        }
    }

    fn end(turn: &str, text: &str) -> ReplyEvent {
        ReplyEvent::TurnEnd {
            turn: turn.into(),
            text: text.into(),
        }
    }

    fn only(replies: &Replies) -> Turn {
        let mut turns = replies.snapshot().turns;
        assert_eq!(turns.len(), 1);
        turns.remove(0)
    }

    fn stopped(text: &str, matched: bool) -> Option<Ending> {
        Some(Ending::Stopped {
            text: text.into(),
            matched,
        })
    }

    #[test]
    fn chunks_arriving_out_of_order_and_twice_read_in_order() {
        let replies = Replies::default();
        for (index, last, text) in [
            (2, true, "three"),
            (0, false, "one "),
            (0, false, "one "),
            (1, false, "two "),
            (2, true, "three"),
        ] {
            replies.accept(chunk("t1", "m1", index, last, text));
        }
        let turn = only(&replies);
        assert_eq!(turn.messages[0].text, "one two three");
        assert!(turn.messages[0].complete);
    }

    #[test]
    fn a_chunk_after_a_gap_waits_for_the_missing_one() {
        let replies = Replies::default();
        replies.accept(chunk("t1", "m1", 0, false, "a"));
        replies.accept(chunk("t1", "m1", 2, true, "c"));
        let turn = only(&replies);
        assert_eq!(turn.messages[0].text, "a");
        assert!(!turn.messages[0].complete);
        replies.accept(chunk("t1", "m1", 1, false, "b"));
        let turn = only(&replies);
        assert_eq!(turn.messages[0].text, "abc");
        assert!(turn.messages[0].complete);
    }

    #[test]
    fn the_turn_end_is_seen_and_matches_the_streamed_final_message() {
        let replies = Replies::default();
        assert_eq!(
            replies.accept(chunk("t1", "m1", 0, false, "Done.\n")),
            Step::Started("t1".into())
        );
        assert_eq!(
            replies.accept(chunk("t1", "m1", 1, true, "")),
            Step::Streaming
        );
        assert_eq!(replies.accept(end("t1", "Done.")), Step::Ended);
        assert_eq!(only(&replies).ending, stopped("Done.", true));
    }

    #[test]
    fn a_lost_chunk_leaves_the_turn_taking_the_stop_text_marked_unmatched() {
        let replies = Replies::default();
        replies.accept(chunk("t1", "m1", 0, false, "a\n"));
        replies.accept(chunk("t1", "m1", 2, true, "c"));
        replies.accept(end("t1", "a\nb\nc"));
        assert_eq!(only(&replies).ending, stopped("a\nb\nc", false));
    }

    #[test]
    fn a_differing_stop_text_is_unmatched_even_when_every_chunk_arrived() {
        let replies = Replies::default();
        replies.accept(chunk("t1", "m1", 0, true, "streamed"));
        replies.accept(end("t1", "different"));
        assert_eq!(only(&replies).ending, stopped("different", false));
    }

    #[test]
    fn the_final_chunk_arriving_just_after_the_stop_still_matches() {
        let replies = Replies::default();
        replies.accept(chunk("t1", "m1", 0, false, "a"));
        replies.accept(end("t1", "ab"));
        assert_eq!(only(&replies).ending, stopped("ab", false));
        assert_eq!(
            replies.accept(chunk("t1", "m1", 1, true, "b")),
            Step::Streaming
        );
        let turn = only(&replies);
        assert_eq!(turn.messages[0].text, "ab");
        assert_eq!(turn.ending, stopped("ab", true));
    }

    #[test]
    fn a_stop_hook_that_continues_a_turn_reopens_it_and_the_second_stop_settles_it() {
        let replies = Replies::default();
        replies.accept(chunk("t1", "m1", 0, true, "first"));
        replies.accept(end("t1", "first"));
        assert_eq!(only(&replies).ending, stopped("first", true));
        assert_eq!(
            replies.accept(chunk("t1", "m2", 0, true, "second")),
            Step::Streaming
        );
        assert_eq!(only(&replies).ending, None);
        assert_eq!(replies.accept(end("t1", "second")), Step::Ended);
        let turn = only(&replies);
        assert_eq!(turn.messages.len(), 2);
        assert_eq!(turn.ending, stopped("second", true));
    }

    #[test]
    fn a_failed_turn_closes_with_its_error() {
        let replies = Replies::default();
        replies.accept(chunk("t1", "m1", 0, false, "a"));
        assert_eq!(
            replies.accept(ReplyEvent::TurnFailed {
                turn: Some("t1".into()),
                error: "rate_limit".into()
            }),
            Step::Ended
        );
        assert_eq!(
            only(&replies).ending,
            Some(Ending::Failed {
                error: "rate_limit".into()
            })
        );
    }

    #[test]
    fn a_failure_with_no_turn_closes_the_latest_turn() {
        let replies = Replies::default();
        replies.accept(chunk("t1", "m1", 0, false, "a"));
        replies.accept(ReplyEvent::TurnFailed {
            turn: None,
            error: "server_error".into(),
        });
        assert_eq!(
            only(&replies).ending,
            Some(Ending::Failed {
                error: "server_error".into()
            })
        );
    }

    #[test]
    fn a_turn_that_ends_with_no_streamed_text_is_silent_and_still_recorded() {
        let replies = Replies::default();
        assert_eq!(
            replies.accept(end("t1", "Only the stop text")),
            Step::Silent
        );
        let turn = only(&replies);
        assert_eq!(turn.id, "t1");
        assert_eq!(turn.ending, stopped("Only the stop text", false));
    }

    #[test]
    fn each_stop_settles_its_own_turn_whatever_order_the_hooks_arrive_in() {
        let replies = Replies::default();
        replies.accept(chunk("t1", "m1", 0, true, "a"));
        replies.accept(chunk("t2", "m2", 0, true, "b"));
        replies.accept(end("t1", "a"));
        replies.accept(end("t2", "b"));
        let turns = replies.snapshot().turns;
        assert_eq!(turns[0].ending, stopped("a", true));
        assert_eq!(turns[1].ending, stopped("b", true));
    }

    #[test]
    fn a_new_turn_marks_a_turn_whose_stop_has_not_come_as_lost_until_it_does() {
        let replies = Replies::default();
        replies.accept(chunk("t1", "m1", 0, true, "a"));
        assert_eq!(
            replies.accept(chunk("t2", "m2", 0, true, "b")),
            Step::Started("t2".into())
        );
        let turns = replies.snapshot().turns;
        assert_eq!(turns[0].ending, Some(Ending::Lost));
        assert_eq!(turns[1].ending, None);
        replies.accept(end("t1", "a"));
        assert_eq!(replies.snapshot().turns[0].ending, stopped("a", true));
    }

    #[test]
    fn a_turn_is_capped_and_then_marked_truncated_and_unmatched() {
        let replies = Replies::default();
        let big = "x".repeat(TURN_BYTES);
        replies.accept(chunk("t1", "m1", 0, false, &big));
        replies.accept(chunk("t1", "m1", 1, true, "y"));
        let turn = only(&replies);
        assert!(turn.truncated);
        assert_eq!(turn.messages[0].text.len(), TURN_BYTES);
        replies.accept(end("t1", &format!("{big}y")));
        assert_eq!(only(&replies).ending, stopped(&format!("{big}y"), false));
    }

    #[test]
    fn only_the_latest_turns_are_kept() {
        let replies = Replies::default();
        for number in 0..TURNS_KEPT + 3 {
            replies.accept(chunk(&format!("t{number}"), "m", 0, true, "x"));
        }
        let turns = replies.snapshot().turns;
        assert_eq!(turns.len(), TURNS_KEPT);
        assert_eq!(turns[0].id, "t3");
    }

    #[test]
    fn an_unreadable_event_is_kept_for_the_chat_to_show() {
        let replies = Replies::default();
        replies.accept(ReplyEvent::Unreadable {
            event: "Stop".into(),
            error: "missing field".into(),
        });
        assert_eq!(
            replies.snapshot().unreadable,
            Some(Unreadable {
                event: "Stop".into(),
                error: "missing field".into()
            })
        );
    }

    #[test]
    fn a_missing_stop_is_reported_only_after_the_grace_once_core_says_done() {
        let replies = Replies::default();
        let done = Instant::now();
        assert!(!replies.stop_missing(Some(done), done + STOP_GRACE));
        replies.accept(chunk("t1", "m1", 0, false, "a"));
        assert!(!replies.stop_missing(None, done + STOP_GRACE));
        assert!(!replies.stop_missing(Some(done), done + STOP_GRACE / 2));
        assert!(replies.stop_missing(Some(done), done + STOP_GRACE));
        replies.accept(end("t1", "a"));
        assert!(!replies.stop_missing(Some(done), done + STOP_GRACE));
    }
}
