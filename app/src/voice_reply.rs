use crate::speech::{Phrase, SpokenText, Standing};
use std::collections::HashSet;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Ending {
    Open,
    Text(String),
    Failed,
    Lost,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Turn {
    pub id: String,
    pub spoken: bool,
    pub ending: Ending,
}

pub trait Turns: Send + Sync {
    fn turns(&self) -> Vec<Turn>;
}

pub struct Silent;

impl Turns for Silent {
    fn turns(&self) -> Vec<Turn> {
        Vec::new()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Line {
    Reply(SpokenText),
    Said(Phrase),
}

#[derive(Debug, Default)]
pub struct Watcher {
    ended: HashSet<String>,
    blocked: HashSet<String>,
}

impl Watcher {
    pub fn starting_at(turns: &[Turn]) -> Self {
        let mut watcher = Self::default();
        for turn in turns {
            if turn.ending != Ending::Open {
                watcher.ended.insert(turn.id.clone());
            }
            watcher.blocked.insert(turn.id.clone());
        }
        watcher
    }

    pub fn lines(&mut self, turns: &[Turn], standing: impl FnOnce() -> Standing) -> Vec<Line> {
        let mut lines = Vec::new();
        let mut standing = Some(standing);
        for turn in turns.iter().filter(|turn| turn.spoken) {
            match &turn.ending {
                Ending::Text(text) if self.ended.insert(turn.id.clone()) => {
                    if let Some(reply) = SpokenText::from_reply(text) {
                        lines.push(Line::Reply(reply));
                    }
                }
                Ending::Failed if self.ended.insert(turn.id.clone()) => {
                    lines.push(Line::Said(Phrase::Failed));
                }
                Ending::Open if !self.blocked.contains(&turn.id) => {
                    let blocked = standing
                        .take()
                        .is_some_and(|standing| standing() == Standing::Blocked);
                    if blocked {
                        self.blocked.insert(turn.id.clone());
                        lines.push(Line::Said(Phrase::Blocked));
                    }
                }
                _ => {}
            }
        }
        lines
    }

    pub fn waiting_on_voyager(&self, turns: &[Turn]) -> bool {
        turns.iter().any(|turn| {
            turn.spoken && turn.ending == Ending::Open && !self.blocked.contains(&turn.id)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn turn(id: &str, spoken: bool, ending: Ending) -> Turn {
        Turn {
            id: id.into(),
            spoken,
            ending,
        }
    }

    fn idle() -> Standing {
        Standing::Idle
    }

    #[test]
    fn a_spoken_turn_that_ends_with_text_speaks_its_first_paragraph_once() {
        let mut watcher = Watcher::default();
        let turns = [turn(
            "p1",
            true,
            Ending::Text("Renamed the fleet.\n\nI also tidied the tabs.".into()),
        )];
        let lines = watcher.lines(&turns, idle);
        assert_eq!(lines.len(), 1);
        let Line::Reply(reply) = &lines[0] else {
            panic!("expected a reply")
        };
        assert_eq!(
            reply.as_str(),
            "Renamed the fleet. The rest is in the chat."
        );
        assert!(watcher.lines(&turns, idle).is_empty());
    }

    #[test]
    fn a_turn_the_ledger_did_not_mark_spoken_stays_silent_whatever_it_says() {
        let mut watcher = Watcher::default();
        let turns = [
            turn("typed", false, Ending::Text("Done.".into())),
            turn("failed", false, Ending::Failed),
        ];
        assert!(watcher.lines(&turns, || Standing::Blocked).is_empty());
    }

    #[test]
    fn a_failed_spoken_turn_says_the_fixed_failure_line_once() {
        let mut watcher = Watcher::default();
        let turns = [turn("p1", true, Ending::Failed)];
        assert_eq!(
            watcher.lines(&turns, idle),
            vec![Line::Said(Phrase::Failed)]
        );
        assert!(watcher.lines(&turns, idle).is_empty());
    }

    #[test]
    fn a_spoken_turn_that_is_blocked_says_so_once_and_still_speaks_when_it_ends() {
        let mut watcher = Watcher::default();
        let open = [turn("p1", true, Ending::Open)];
        assert_eq!(
            watcher.lines(&open, || Standing::Blocked),
            vec![Line::Said(Phrase::Blocked)]
        );
        assert!(watcher.lines(&open, || Standing::Blocked).is_empty());
        let ended = [turn("p1", true, Ending::Text("Done. Opened it.".into()))];
        assert_eq!(watcher.lines(&ended, idle).len(), 1);
    }

    #[test]
    fn standing_is_asked_only_for_a_spoken_turn_still_open() {
        let mut watcher = Watcher::default();
        let asked = std::cell::Cell::new(0);
        let count = || {
            asked.set(asked.get() + 1);
            Standing::Working
        };
        watcher.lines(&[turn("p1", false, Ending::Open)], count);
        assert_eq!(asked.get(), 0);
        assert!(!watcher.waiting_on_voyager(&[turn("p1", false, Ending::Open)]));
        assert!(watcher.waiting_on_voyager(&[turn("p2", true, Ending::Open)]));
    }

    #[test]
    fn turns_that_ended_before_the_watcher_started_are_never_spoken() {
        let before = [
            turn("old", true, Ending::Text("Old news.".into())),
            turn("open", true, Ending::Open),
        ];
        let mut watcher = Watcher::starting_at(&before);
        assert!(watcher.lines(&before, || Standing::Blocked).is_empty());
        let later = [
            before[0].clone(),
            turn("open", true, Ending::Text("Now done.".into())),
        ];
        assert_eq!(watcher.lines(&later, idle).len(), 1);
    }

    #[test]
    fn a_lost_turn_and_a_reply_with_nothing_speakable_say_nothing() {
        let mut watcher = Watcher::default();
        let turns = [
            turn("lost", true, Ending::Lost),
            turn("code", true, Ending::Text("```\nonly code\n```".into())),
        ];
        assert!(watcher.lines(&turns, idle).is_empty());
    }
}
