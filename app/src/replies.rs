use crate::spoken::{has_reply_marker, strip_reply_marker};
use std::{
    collections::{BTreeMap, VecDeque},
    io::Write,
    sync::{Arc, Mutex, PoisonError},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
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
    pub spoken: bool,
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
    spoken: bool,
    miss_noted: bool,
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
        self.accept_with(event, |_| false)
    }

    pub fn accept_with(&self, event: ReplyEvent, observe: impl FnOnce(&str) -> bool) -> Step {
        let (step, missed) = {
            let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
            state.accept(event, observe)
        };
        if missed {
            note_miss(&mut std::io::stderr(), SystemTime::now());
        }
        step
    }
}

fn note_miss(out: &mut impl Write, now: SystemTime) {
    let seconds = now
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs());
    let _ = writeln!(
        out,
        "Voyager's reply came without the reply marker at unix time {seconds}"
    );
}

impl State {
    fn accept(&mut self, event: ReplyEvent, observe: impl FnOnce(&str) -> bool) -> (Step, bool) {
        match event {
            ReplyEvent::Unreadable { event, error } => {
                self.unreadable = Some(Unreadable { event, error });
                (Step::Streaming, false)
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
                    slot.spoken = observe(&turn);
                    (Step::Started(turn), false)
                } else {
                    (Step::Streaming, false)
                }
            }
            ReplyEvent::TurnEnd { turn, text } => {
                self.stop(Some(turn), Stopping::Text(text), observe)
            }
            ReplyEvent::TurnFailed { turn, error } => {
                self.stop(turn, Stopping::Failed(error), observe)
            }
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

    fn stop(
        &mut self,
        turn: Option<String>,
        stopping: Stopping,
        observe: impl FnOnce(&str) -> bool,
    ) -> (Step, bool) {
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
        if !known {
            slot.spoken = observe(&id);
        }
        let step = if known { Step::Ended } else { Step::Silent };
        (step, slot.marker_missed())
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
            spoken: false,
            miss_noted: false,
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

    fn marker_missed(&mut self) -> bool {
        let Some(Stopping::Text(text)) = &self.stop else {
            return false;
        };
        let missed = !self.miss_noted
            && !text.trim().is_empty()
            && !has_reply_marker(text)
            && !self
                .messages
                .iter()
                .any(|message| has_reply_marker(&message.text));
        self.miss_noted |= missed;
        missed
    }

    fn whole(&self) -> bool {
        !self.truncated && self.messages.iter().all(|message| message.complete)
    }

    fn view(&self) -> Turn {
        let messages: Vec<Message> = self
            .messages
            .iter()
            .map(|message| Message {
                text: strip_reply_marker(&message.text).into_owned(),
                ..message.clone()
            })
            .collect();
        let ending = match &self.stop {
            Some(Stopping::Text(text)) => {
                let text = strip_reply_marker(text);
                Some(Ending::Stopped {
                    text: text.clone().into_owned(),
                    matched: self.whole()
                        && messages
                            .last()
                            .is_some_and(|message| message.text.trim_end() == text.trim_end()),
                })
            }
            Some(Stopping::Failed(error)) => Some(Ending::Failed {
                error: error.clone(),
            }),
            None => self.lost.then_some(Ending::Lost),
        };
        Turn {
            id: self.id.clone(),
            messages,
            ending,
            truncated: self.truncated,
            spoken: self.spoken,
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
    fn the_reply_marker_is_gone_from_the_streamed_message_and_the_stop_text() {
        let replies = Replies::default();
        replies.accept(chunk("t1", "m1", 0, false, "[v"));
        assert_eq!(only(&replies).messages[0].text, "[v");
        replies.accept(chunk("t1", "m1", 1, false, "y] Done.\n"));
        replies.accept(chunk("t1", "m1", 2, true, "More."));
        replies.accept(end("t1", "[vy] Done.\nMore."));
        let turn = only(&replies);
        assert_eq!(turn.messages[0].text, "Done.\nMore.");
        assert_eq!(turn.ending, stopped("Done.\nMore.", true));
    }

    fn missed(state: &mut State, event: ReplyEvent) -> bool {
        state.accept(event, |_| false).1
    }

    #[test]
    fn a_stop_without_the_marker_is_a_miss_once_per_turn() {
        let mut state = State::default();
        assert!(!missed(&mut state, chunk("t1", "m1", 0, true, "Done.")));
        assert!(missed(&mut state, end("t1", "Done.")));
        assert!(!missed(&mut state, end("t1", "Done.")));
        assert!(missed(&mut state, end("t2", "Again.")));
    }

    #[test]
    fn a_marked_reply_an_empty_stop_and_a_failure_are_no_miss() {
        let mut state = State::default();
        assert!(!missed(&mut state, end("t1", "[vy] Done.")));
        assert!(!missed(&mut state, end("t2", "  ")));
        let failed = ReplyEvent::TurnFailed {
            turn: Some("t3".into()),
            error: "rate_limit".into(),
        };
        assert!(!missed(&mut state, failed));
        assert!(!missed(
            &mut state,
            chunk("t4", "m1", 0, true, "[vy] First.")
        ));
        assert!(!missed(&mut state, end("t4", "Second message.")));
    }

    #[test]
    fn the_miss_line_gives_the_time_and_no_reply_text() {
        let mut out = Vec::new();
        note_miss(&mut out, UNIX_EPOCH + Duration::from_secs(1_700_000_000));
        assert_eq!(
            String::from_utf8(out).unwrap(),
            "Voyager's reply came without the reply marker at unix time 1700000000\n"
        );
    }

    #[test]
    fn a_reply_without_the_marker_reads_unchanged() {
        let replies = Replies::default();
        replies.accept(chunk("t1", "m1", 0, true, "Done."));
        replies.accept(end("t1", "Done."));
        let turn = only(&replies);
        assert_eq!(turn.messages[0].text, "Done.");
        assert_eq!(turn.ending, stopped("Done.", true));
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
