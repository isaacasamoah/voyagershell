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

#[derive(Default)]
struct Open {
    turn: Turn,
    pending: Vec<Pending>,
    bytes: usize,
}

#[derive(Default)]
struct State {
    open: Option<Open>,
    closed: VecDeque<Turn>,
    unreadable: Option<Unreadable>,
}

#[derive(Clone, Default)]
pub struct Replies {
    state: Arc<Mutex<State>>,
}

impl Replies {
    pub fn snapshot(&self) -> Snapshot {
        let state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        let mut turns: Vec<Turn> = state.closed.iter().cloned().collect();
        turns.extend(state.open.iter().map(|open| open.turn.clone()));
        Snapshot {
            turns,
            unreadable: state.unreadable.clone(),
        }
    }

    pub fn stop_missing(&self, done_since: Option<Instant>, now: Instant) -> bool {
        let state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        state.open.is_some()
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
            } => self.text(&turn, &message, index, last, text),
            ReplyEvent::TurnEnd { text } => self.end(|open| settle(open, text)),
            ReplyEvent::TurnFailed { error } => self.end(|_| Ending::Failed { error }),
        }
    }

    fn text(&mut self, turn: &str, message: &str, index: u32, last: bool, text: String) -> Step {
        if self.closed.iter().any(|closed| closed.id == turn) {
            return Step::Streaming;
        }
        let mut started = false;
        if self.open.as_ref().is_some_and(|open| open.turn.id != turn) {
            self.close(|_| Ending::Lost);
        }
        let open = self.open.get_or_insert_with(|| {
            started = true;
            Open {
                turn: Turn {
                    id: turn.into(),
                    ..Turn::default()
                },
                ..Open::default()
            }
        });
        open.take(message, index, last, text);
        if started {
            Step::Started(turn.into())
        } else {
            Step::Streaming
        }
    }

    fn end(&mut self, ending: impl FnOnce(&Open) -> Ending) -> Step {
        let streamed = self.open.is_some();
        if !streamed {
            self.open = Some(Open::default());
        }
        self.close(ending);
        if streamed { Step::Ended } else { Step::Silent }
    }

    fn close(&mut self, ending: impl FnOnce(&Open) -> Ending) {
        if let Some(mut open) = self.open.take() {
            open.turn.ending = Some(ending(&open));
            self.closed.push_back(open.turn);
            while self.closed.len() > TURNS_KEPT {
                self.closed.pop_front();
            }
        }
    }
}

impl Open {
    fn take(&mut self, message: &str, index: u32, last: bool, text: String) {
        let slot = match self
            .turn
            .messages
            .iter()
            .position(|seen| seen.id == message)
        {
            Some(slot) => slot,
            None => {
                self.turn.messages.push(Message {
                    id: message.into(),
                    ..Message::default()
                });
                self.pending.push(Pending::default());
                self.turn.messages.len() - 1
            }
        };
        let pending = &mut self.pending[slot];
        if index < pending.next || pending.held.contains_key(&index) {
            return;
        }
        if self.bytes + text.len() > TURN_BYTES {
            self.turn.truncated = true;
            return;
        }
        self.bytes += text.len();
        pending.held.insert(index, (text, last));
        let message = &mut self.turn.messages[slot];
        while let Some((text, last)) = pending.held.remove(&pending.next) {
            message.text.push_str(&text);
            message.complete |= last;
            pending.next += 1;
        }
    }

    fn whole(&self) -> bool {
        !self.turn.truncated && self.turn.messages.iter().all(|message| message.complete)
    }
}

fn settle(open: &Open, text: String) -> Ending {
    let matched = open.whole()
        && open
            .turn
            .messages
            .last()
            .is_some_and(|message| message.text.trim_end() == text.trim_end());
    Ending::Stopped { text, matched }
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

    fn end(text: &str) -> ReplyEvent {
        ReplyEvent::TurnEnd { text: text.into() }
    }

    fn only(replies: &Replies) -> Turn {
        let mut turns = replies.snapshot().turns;
        assert_eq!(turns.len(), 1);
        turns.remove(0)
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
        assert_eq!(replies.accept(end("Done.")), Step::Ended);
        assert_eq!(
            only(&replies).ending,
            Some(Ending::Stopped {
                text: "Done.".into(),
                matched: true
            })
        );
    }

    #[test]
    fn a_lost_chunk_leaves_the_turn_taking_the_stop_text_marked_unmatched() {
        let replies = Replies::default();
        replies.accept(chunk("t1", "m1", 0, false, "a\n"));
        replies.accept(chunk("t1", "m1", 2, true, "c"));
        replies.accept(end("a\nb\nc"));
        assert_eq!(
            only(&replies).ending,
            Some(Ending::Stopped {
                text: "a\nb\nc".into(),
                matched: false
            })
        );
    }

    #[test]
    fn a_differing_stop_text_is_unmatched_even_when_every_chunk_arrived() {
        let replies = Replies::default();
        replies.accept(chunk("t1", "m1", 0, true, "streamed"));
        replies.accept(end("different"));
        assert!(matches!(
            only(&replies).ending,
            Some(Ending::Stopped { matched: false, .. })
        ));
    }

    #[test]
    fn a_chunk_for_a_closed_turn_is_dropped() {
        let replies = Replies::default();
        replies.accept(chunk("t1", "m1", 0, false, "a"));
        replies.accept(end("ab"));
        assert_eq!(
            replies.accept(chunk("t1", "m1", 1, true, "b")),
            Step::Streaming
        );
        assert_eq!(replies.snapshot().turns.len(), 1);
        assert_eq!(only(&replies).messages[0].text, "a");
    }

    #[test]
    fn a_failed_turn_closes_with_its_error() {
        let replies = Replies::default();
        replies.accept(chunk("t1", "m1", 0, false, "a"));
        assert_eq!(
            replies.accept(ReplyEvent::TurnFailed {
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
    fn a_turn_that_ends_with_no_streamed_text_is_silent_and_still_recorded() {
        let replies = Replies::default();
        assert_eq!(replies.accept(end("Only the stop text")), Step::Silent);
        assert_eq!(
            only(&replies).ending,
            Some(Ending::Stopped {
                text: "Only the stop text".into(),
                matched: false
            })
        );
    }

    #[test]
    fn a_new_turn_closes_a_turn_whose_stop_never_came() {
        let replies = Replies::default();
        replies.accept(chunk("t1", "m1", 0, true, "a"));
        assert_eq!(
            replies.accept(chunk("t2", "m2", 0, true, "b")),
            Step::Started("t2".into())
        );
        let turns = replies.snapshot().turns;
        assert_eq!(turns[0].ending, Some(Ending::Lost));
        assert_eq!(turns[1].ending, None);
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
        replies.accept(end(&format!("{big}y")));
        assert!(matches!(
            only(&replies).ending,
            Some(Ending::Stopped { matched: false, .. })
        ));
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
        replies.accept(end("a"));
        assert!(!replies.stop_missing(Some(done), done + STOP_GRACE));
    }
}
