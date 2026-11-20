use crate::{
    replies::{Ending, Turn},
    speech::{Phrase, SpokenText, Standing},
};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Line {
    Reply(SpokenText),
    Said(Phrase),
    Partial,
}

pub const PARTIAL: &str = "spoken reply was partial; turn reopened";

#[derive(Debug, Default)]
pub struct Watcher {
    ended: HashSet<String>,
    blocked: HashSet<String>,
    read: HashMap<String, String>,
    partial: HashSet<String>,
}

impl Watcher {
    pub fn starting_at(turns: &[Turn]) -> Self {
        let mut watcher = Self::default();
        for turn in turns {
            if turn.ending.is_some() {
                watcher.ended.insert(turn.id.clone());
            }
            watcher.blocked.insert(turn.id.clone());
        }
        watcher
    }

    pub fn lines(
        &mut self,
        turns: &[Turn],
        mut standing: impl FnMut(bool) -> Option<Standing>,
    ) -> Vec<Line> {
        let mut lines = Vec::new();
        let mut known: Option<Standing> = None;
        let mut ask = |urgent: bool| {
            if known.is_none() {
                known = standing(urgent);
            }
            known
        };
        for turn in turns.iter().filter(|turn| turn.spoken) {
            if let Some(said) = self.read.get(&turn.id) {
                let reopened = match &turn.ending {
                    None => true,
                    Some(Ending::Stopped { text, .. }) => text != said,
                    Some(_) => false,
                };
                if reopened && self.partial.insert(turn.id.clone()) {
                    lines.push(Line::Partial);
                }
                continue;
            }
            if self.ended.contains(&turn.id) {
                continue;
            }
            match &turn.ending {
                Some(Ending::Stopped { text, .. }) => {
                    if matches!(
                        ask(true),
                        None | Some(Standing::Working | Standing::Unknown)
                    ) {
                        continue;
                    }
                    self.ended.insert(turn.id.clone());
                    self.read.insert(turn.id.clone(), text.clone());
                    if let Some(reply) = SpokenText::from_reply(text) {
                        lines.push(Line::Reply(reply));
                    }
                }
                Some(Ending::Failed { .. }) => {
                    if matches!(
                        ask(true),
                        None | Some(Standing::Working | Standing::Unknown)
                    ) {
                        continue;
                    }
                    self.ended.insert(turn.id.clone());
                    lines.push(Line::Said(Phrase::Failed));
                }
                Some(Ending::Lost) => {}
                None => {
                    if !self.blocked.contains(&turn.id) && ask(false) == Some(Standing::Blocked) {
                        self.blocked.insert(turn.id.clone());
                        lines.push(Line::Said(Phrase::Blocked));
                    }
                }
            }
        }
        lines
    }

    pub fn waiting_on_voyager(&self, turns: &[Turn]) -> bool {
        turns.iter().any(|turn| {
            turn.spoken
                && match self.read.get(&turn.id) {
                    Some(said) => {
                        !self.partial.contains(&turn.id)
                            && match &turn.ending {
                                None => true,
                                Some(Ending::Stopped { text, .. }) => text != said,
                                Some(_) => false,
                            }
                    }
                    None => {
                        !self.ended.contains(&turn.id)
                            && match &turn.ending {
                                Some(Ending::Stopped { .. } | Ending::Failed { .. }) => true,
                                Some(Ending::Lost) => false,
                                None => !self.blocked.contains(&turn.id),
                            }
                    }
                }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::replies::Replies;
    use voyager_contract::reply::ReplyEvent;

    fn text(turn: &str, message: &str, index: u32, last: bool, words: &str) -> ReplyEvent {
        ReplyEvent::Text {
            turn: turn.into(),
            message: message.into(),
            index,
            last,
            text: words.into(),
        }
    }

    fn end(turn: &str, words: &str) -> ReplyEvent {
        ReplyEvent::TurnEnd {
            turn: turn.into(),
            text: words.into(),
        }
    }

    fn spoken(replies: &Replies, event: ReplyEvent) {
        replies.accept_with(event, |_| true);
    }

    fn typed(replies: &Replies, event: ReplyEvent) {
        replies.accept(event);
    }

    fn idle(_: bool) -> Option<Standing> {
        Some(Standing::Idle)
    }

    fn working(_: bool) -> Option<Standing> {
        Some(Standing::Working)
    }

    fn tick(
        watcher: &mut Watcher,
        replies: &Replies,
        standing: impl FnMut(bool) -> Option<Standing>,
    ) -> Vec<String> {
        watcher
            .lines(&replies.snapshot().turns, standing)
            .into_iter()
            .map(|line| match line {
                Line::Reply(text) => text.as_str().to_owned(),
                Line::Said(phrase) => phrase.key().to_owned(),
                Line::Partial => "partial".to_owned(),
            })
            .collect()
    }

    #[test]
    fn a_spoken_turn_is_spoken_once_the_moment_its_stop_has_arrived() {
        let (replies, mut watcher) = (Replies::default(), Watcher::default());
        spoken(
            &replies,
            text("p1", "m1", 0, true, "Renamed the fleet.\n\nMore."),
        );
        assert!(tick(&mut watcher, &replies, idle).is_empty());
        spoken(&replies, end("p1", "Renamed the fleet.\n\nMore."));
        assert_eq!(
            tick(&mut watcher, &replies, idle),
            vec!["Renamed the fleet. The rest is in the chat."]
        );
        assert!(tick(&mut watcher, &replies, idle).is_empty());
    }

    #[test]
    fn a_stop_that_arrives_twice_is_spoken_once() {
        let (replies, mut watcher) = (Replies::default(), Watcher::default());
        spoken(&replies, text("p1", "m1", 0, true, "Done."));
        for _ in 0..3 {
            spoken(&replies, end("p1", "Done."));
        }
        assert_eq!(tick(&mut watcher, &replies, idle), vec!["Done."]);
        spoken(&replies, end("p1", "Done."));
        assert!(tick(&mut watcher, &replies, idle).is_empty());
    }

    #[test]
    fn a_late_chunk_of_the_same_message_after_the_stop_makes_no_second_or_partial_reply() {
        let (replies, mut watcher) = (Replies::default(), Watcher::default());
        spoken(&replies, text("p1", "m1", 0, false, "Docked it. "));
        spoken(&replies, end("p1", "Docked it. Then renamed the fleet."));
        assert_eq!(
            tick(&mut watcher, &replies, idle),
            vec!["Docked it. Then renamed the fleet."]
        );
        spoken(
            &replies,
            text("p1", "m1", 1, true, "Then renamed the fleet."),
        );
        assert!(tick(&mut watcher, &replies, idle).is_empty());
    }

    #[test]
    fn a_new_message_that_reopens_the_turn_while_voyager_works_speaks_only_the_final_paragraph() {
        let (replies, mut watcher) = (Replies::default(), Watcher::default());
        spoken(&replies, text("p1", "m1", 0, true, "Docked it."));
        spoken(&replies, end("p1", "Docked it."));
        assert!(tick(&mut watcher, &replies, working).is_empty());
        spoken(
            &replies,
            text(
                "p1",
                "m2",
                0,
                true,
                "Docked it, then renamed the fleet.\n\nMore.",
            ),
        );
        assert!(tick(&mut watcher, &replies, working).is_empty());
        spoken(
            &replies,
            end("p1", "Docked it, then renamed the fleet.\n\nMore."),
        );
        assert!(tick(&mut watcher, &replies, working).is_empty());
        assert_eq!(
            tick(&mut watcher, &replies, idle),
            vec!["Docked it, then renamed the fleet. The rest is in the chat."]
        );
        assert!(tick(&mut watcher, &replies, idle).is_empty());
    }

    #[test]
    fn a_reopen_after_the_turn_was_spoken_is_never_spoken_again() {
        let (replies, mut watcher) = (Replies::default(), Watcher::default());
        spoken(&replies, text("p1", "m1", 0, true, "First answer."));
        spoken(&replies, end("p1", "First answer."));
        assert_eq!(tick(&mut watcher, &replies, idle), vec!["First answer."]);
        spoken(&replies, text("p1", "m2", 0, true, "Second answer."));
        spoken(&replies, end("p1", "Second answer."));
        assert_eq!(tick(&mut watcher, &replies, idle), vec!["partial"]);
        assert!(tick(&mut watcher, &replies, idle).is_empty());
    }

    fn unknown(_: bool) -> Option<Standing> {
        Some(Standing::Unknown)
    }

    #[test]
    fn a_standing_core_could_not_answer_never_speaks() {
        let (replies, mut watcher) = (Replies::default(), Watcher::default());
        spoken(&replies, text("p1", "m1", 0, true, "Part one."));
        spoken(&replies, end("p1", "Part one."));
        for _ in 0..3 {
            assert!(tick(&mut watcher, &replies, unknown).is_empty());
        }
        assert_eq!(tick(&mut watcher, &replies, idle), vec!["Part one."]);
    }

    #[test]
    fn a_flicker_that_lets_the_first_stop_speak_logs_one_partial_when_the_turn_reopens() {
        let (replies, mut watcher) = (Replies::default(), Watcher::default());
        spoken(&replies, text("p1", "m1", 0, true, "Part one."));
        spoken(&replies, end("p1", "Part one."));
        assert_eq!(tick(&mut watcher, &replies, idle), vec!["Part one."]);
        assert!(!watcher.waiting_on_voyager(&replies.snapshot().turns));
        spoken(&replies, text("p1", "m2", 0, true, "Part two."));
        assert!(watcher.waiting_on_voyager(&replies.snapshot().turns));
        assert_eq!(tick(&mut watcher, &replies, idle), vec!["partial"]);
        spoken(&replies, end("p1", "Part one. Part two."));
        assert!(tick(&mut watcher, &replies, idle).is_empty());
        assert!(tick(&mut watcher, &replies, idle).is_empty());
        assert!(!watcher.waiting_on_voyager(&replies.snapshot().turns));
    }

    #[test]
    fn a_stop_text_that_changes_after_it_was_read_logs_one_partial_and_is_not_read_again() {
        let (replies, mut watcher) = (Replies::default(), Watcher::default());
        spoken(&replies, text("p1", "m1", 0, true, "First."));
        spoken(&replies, end("p1", "First."));
        assert_eq!(tick(&mut watcher, &replies, idle), vec!["First."]);
        spoken(&replies, end("p1", "First. Second."));
        assert_eq!(tick(&mut watcher, &replies, idle), vec!["partial"]);
        assert!(tick(&mut watcher, &replies, idle).is_empty());
    }

    #[test]
    fn a_turn_read_once_and_never_reopened_logs_nothing() {
        let (replies, mut watcher) = (Replies::default(), Watcher::default());
        spoken(&replies, text("p1", "m1", 0, true, "Done."));
        spoken(&replies, end("p1", "Done."));
        assert_eq!(tick(&mut watcher, &replies, idle), vec!["Done."]);
        for _ in 0..3 {
            spoken(&replies, end("p1", "Done."));
            assert!(tick(&mut watcher, &replies, idle).is_empty());
        }
    }

    #[test]
    fn nothing_is_spoken_while_voyagers_standing_is_unknown() {
        let (replies, mut watcher) = (Replies::default(), Watcher::default());
        spoken(&replies, text("p1", "m1", 0, true, "Done."));
        spoken(&replies, end("p1", "Done."));
        assert!(tick(&mut watcher, &replies, |_| None).is_empty());
        assert_eq!(tick(&mut watcher, &replies, idle), vec!["Done."]);
    }

    #[test]
    fn a_turn_the_ledger_did_not_mark_spoken_stays_silent_whatever_it_says() {
        let (replies, mut watcher) = (Replies::default(), Watcher::default());
        typed(&replies, text("t1", "m1", 0, true, "Typed answer."));
        typed(&replies, end("t1", "Typed answer."));
        typed(
            &replies,
            ReplyEvent::TurnFailed {
                turn: Some("t2".into()),
                error: "rate_limit".into(),
            },
        );
        assert!(tick(&mut watcher, &replies, |_| Some(Standing::Blocked)).is_empty());
    }

    #[test]
    fn a_failed_spoken_turn_says_the_fixed_failure_line_once() {
        let (replies, mut watcher) = (Replies::default(), Watcher::default());
        spoken(&replies, text("p1", "m1", 0, true, "Working on it."));
        spoken(
            &replies,
            ReplyEvent::TurnFailed {
                turn: Some("p1".into()),
                error: "rate_limit".into(),
            },
        );
        assert_eq!(tick(&mut watcher, &replies, idle), vec!["failed"]);
        assert!(tick(&mut watcher, &replies, idle).is_empty());
    }

    #[test]
    fn a_spoken_turn_that_is_blocked_says_so_once_and_still_speaks_when_it_ends() {
        let (replies, mut watcher) = (Replies::default(), Watcher::default());
        spoken(&replies, text("p1", "m1", 0, false, "Starting. "));
        assert_eq!(
            tick(&mut watcher, &replies, |_| Some(Standing::Blocked)),
            vec!["blocked"]
        );
        assert!(tick(&mut watcher, &replies, |_| Some(Standing::Blocked)).is_empty());
        spoken(&replies, text("p1", "m1", 1, true, "Done."));
        spoken(&replies, end("p1", "Starting. Done."));
        assert_eq!(tick(&mut watcher, &replies, idle), vec!["Starting. Done."]);
    }

    #[test]
    fn standing_is_not_asked_for_a_turn_nobody_will_speak() {
        let (replies, mut watcher) = (Replies::default(), Watcher::default());
        typed(&replies, text("t1", "m1", 0, true, "Typed."));
        let asked = std::cell::Cell::new(0);
        tick(&mut watcher, &replies, |_| {
            asked.set(asked.get() + 1);
            Some(Standing::Idle)
        });
        assert_eq!(asked.get(), 0);
        assert!(!watcher.waiting_on_voyager(&replies.snapshot().turns));
    }

    #[test]
    fn turns_that_ended_before_the_watcher_started_are_never_spoken() {
        let replies = Replies::default();
        spoken(&replies, text("old", "m1", 0, true, "Old news."));
        spoken(&replies, end("old", "Old news."));
        spoken(&replies, text("open", "m1", 0, false, "Working. "));
        let mut watcher = Watcher::starting_at(&replies.snapshot().turns);
        assert!(tick(&mut watcher, &replies, |_| Some(Standing::Blocked)).is_empty());
        spoken(&replies, end("open", "Working. Now done."));
        assert_eq!(
            tick(&mut watcher, &replies, idle),
            vec!["Working. Now done."]
        );
    }

    #[test]
    fn a_reply_with_nothing_speakable_says_nothing() {
        let (replies, mut watcher) = (Replies::default(), Watcher::default());
        spoken(&replies, text("code", "m1", 0, true, "```\nonly code\n```"));
        spoken(&replies, end("code", "```\nonly code\n```"));
        assert!(tick(&mut watcher, &replies, idle).is_empty());
    }
}
