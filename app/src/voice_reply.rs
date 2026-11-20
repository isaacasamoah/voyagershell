use crate::speech::{Phrase, SpokenText, Standing};
use std::{
    collections::{HashMap, HashSet},
    time::{Duration, Instant},
};

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

pub const SETTLE: Duration = Duration::from_millis(600);

#[derive(Debug)]
struct Settling {
    key: String,
    since: Instant,
}

#[derive(Debug, Default)]
pub struct Watcher {
    ended: HashSet<String>,
    blocked: HashSet<String>,
    settling: HashMap<String, Settling>,
}

fn settle_key(ending: &Ending) -> Option<String> {
    match ending {
        Ending::Text(text) => Some(format!("text:{text}")),
        Ending::Failed => Some("failed".to_owned()),
        Ending::Open | Ending::Lost => None,
    }
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

    pub fn lines(
        &mut self,
        turns: &[Turn],
        now: Instant,
        mut standing: impl FnMut() -> Option<Standing>,
    ) -> Vec<Line> {
        let mut lines = Vec::new();
        let mut asked: Option<Option<Standing>> = None;
        let mut standing_now = || *asked.get_or_insert_with(&mut standing);
        for turn in turns.iter().filter(|turn| turn.spoken) {
            if self.ended.contains(&turn.id) {
                continue;
            }
            let Some(key) = settle_key(&turn.ending) else {
                self.settling.remove(&turn.id);
                if turn.ending == Ending::Open
                    && !self.blocked.contains(&turn.id)
                    && standing_now() == Some(Standing::Blocked)
                {
                    self.blocked.insert(turn.id.clone());
                    lines.push(Line::Said(Phrase::Blocked));
                }
                continue;
            };
            let settling = self.settling.entry(turn.id.clone()).or_insert(Settling {
                key: key.clone(),
                since: now,
            });
            if settling.key != key {
                *settling = Settling { key, since: now };
                continue;
            }
            if now.saturating_duration_since(settling.since) < SETTLE {
                continue;
            }
            if matches!(standing_now(), None | Some(Standing::Working)) {
                continue;
            }
            self.ended.insert(turn.id.clone());
            self.settling.remove(&turn.id);
            match &turn.ending {
                Ending::Text(text) => {
                    if let Some(reply) = SpokenText::from_reply(text) {
                        lines.push(Line::Reply(reply));
                    }
                }
                _ => lines.push(Line::Said(Phrase::Failed)),
            }
        }
        lines
    }

    pub fn waiting_on_voyager(&self, turns: &[Turn]) -> bool {
        turns.iter().any(|turn| {
            turn.spoken
                && !self.ended.contains(&turn.id)
                && (settle_key(&turn.ending).is_some()
                    || (turn.ending == Ending::Open && !self.blocked.contains(&turn.id)))
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

    fn text(id: &str, words: &str) -> Turn {
        turn(id, true, Ending::Text(words.into()))
    }

    fn idle() -> Option<Standing> {
        Some(Standing::Idle)
    }

    struct Clock(Instant);

    impl Clock {
        fn after(&self, millis: u64) -> Instant {
            self.0 + Duration::from_millis(millis)
        }
    }

    fn clock() -> Clock {
        Clock(Instant::now())
    }

    fn settled(watcher: &mut Watcher, turns: &[Turn], clock: &Clock, at: u64) -> Vec<Line> {
        watcher.lines(turns, clock.after(at), idle)
    }

    #[test]
    fn a_spoken_turn_is_spoken_once_after_its_ending_has_held_still() {
        let (mut watcher, clock) = (Watcher::default(), clock());
        let turns = [text("p1", "Renamed the fleet.\n\nI also tidied the tabs.")];
        assert!(settled(&mut watcher, &turns, &clock, 0).is_empty());
        assert!(settled(&mut watcher, &turns, &clock, 300).is_empty());
        let lines = settled(&mut watcher, &turns, &clock, 700);
        assert_eq!(lines.len(), 1);
        let Line::Reply(reply) = &lines[0] else {
            panic!("expected a reply")
        };
        assert_eq!(
            reply.as_str(),
            "Renamed the fleet. The rest is in the chat."
        );
        assert!(settled(&mut watcher, &turns, &clock, 2000).is_empty());
    }

    #[test]
    fn a_turn_that_reopens_and_settles_again_is_spoken_once_with_its_final_paragraph() {
        let (mut watcher, clock) = (Watcher::default(), clock());
        let first = [text("p1", "Docked it.")];
        let reopened = [turn("p1", true, Ending::Open)];
        let second = [text("p1", "Docked it, then renamed the fleet.\n\nMore.")];
        assert!(settled(&mut watcher, &first, &clock, 0).is_empty());
        assert!(settled(&mut watcher, &first, &clock, 300).is_empty());
        assert!(settled(&mut watcher, &reopened, &clock, 400).is_empty());
        assert!(settled(&mut watcher, &second, &clock, 500).is_empty());
        assert!(settled(&mut watcher, &second, &clock, 900).is_empty());
        let lines = settled(&mut watcher, &second, &clock, 1200);
        assert_eq!(lines.len(), 1);
        let Line::Reply(reply) = &lines[0] else {
            panic!("expected a reply")
        };
        assert_eq!(
            reply.as_str(),
            "Docked it, then renamed the fleet. The rest is in the chat."
        );
        assert!(settled(&mut watcher, &second, &clock, 5000).is_empty());
    }

    #[test]
    fn a_settle_that_changes_its_text_without_a_reopen_starts_the_wait_again() {
        let (mut watcher, clock) = (Watcher::default(), clock());
        assert!(settled(&mut watcher, &[text("p1", "First.")], &clock, 0).is_empty());
        assert!(settled(&mut watcher, &[text("p1", "Second.")], &clock, 500).is_empty());
        assert!(settled(&mut watcher, &[text("p1", "Second.")], &clock, 900).is_empty());
        assert_eq!(
            settled(&mut watcher, &[text("p1", "Second.")], &clock, 1200).len(),
            1
        );
    }

    #[test]
    fn nothing_is_spoken_while_voyager_is_still_working_or_its_standing_is_unknown() {
        let (mut watcher, clock) = (Watcher::default(), clock());
        let turns = [text("p1", "Done.")];
        watcher.lines(&turns, clock.after(0), idle);
        assert!(
            watcher
                .lines(&turns, clock.after(1000), || Some(Standing::Working))
                .is_empty()
        );
        assert!(watcher.lines(&turns, clock.after(1100), || None).is_empty());
        assert_eq!(watcher.lines(&turns, clock.after(1200), idle).len(), 1);
    }

    #[test]
    fn a_turn_the_ledger_did_not_mark_spoken_stays_silent_whatever_it_says() {
        let (mut watcher, clock) = (Watcher::default(), clock());
        let turns = [
            turn("typed", false, Ending::Text("Done.".into())),
            turn("failed", false, Ending::Failed),
        ];
        settled(&mut watcher, &turns, &clock, 0);
        assert!(
            watcher
                .lines(&turns, clock.after(5000), || Some(Standing::Blocked))
                .is_empty()
        );
    }

    #[test]
    fn a_failed_spoken_turn_says_the_fixed_failure_line_once() {
        let (mut watcher, clock) = (Watcher::default(), clock());
        let turns = [turn("p1", true, Ending::Failed)];
        settled(&mut watcher, &turns, &clock, 0);
        assert_eq!(
            settled(&mut watcher, &turns, &clock, 700),
            vec![Line::Said(Phrase::Failed)]
        );
        assert!(settled(&mut watcher, &turns, &clock, 1500).is_empty());
    }

    #[test]
    fn a_spoken_turn_that_is_blocked_says_so_once_and_still_speaks_when_it_ends() {
        let (mut watcher, clock) = (Watcher::default(), clock());
        let open = [turn("p1", true, Ending::Open)];
        assert_eq!(
            watcher.lines(&open, clock.after(0), || Some(Standing::Blocked)),
            vec![Line::Said(Phrase::Blocked)]
        );
        assert!(
            watcher
                .lines(&open, clock.after(100), || Some(Standing::Blocked))
                .is_empty()
        );
        let ended = [text("p1", "Done. Opened it.")];
        settled(&mut watcher, &ended, &clock, 200);
        assert_eq!(settled(&mut watcher, &ended, &clock, 900).len(), 1);
    }

    #[test]
    fn standing_is_asked_only_for_a_spoken_turn_still_open_or_ready_to_speak() {
        let (mut watcher, clock) = (Watcher::default(), clock());
        let asked = std::cell::Cell::new(0);
        let count = || {
            asked.set(asked.get() + 1);
            Some(Standing::Working)
        };
        watcher.lines(&[turn("p1", false, Ending::Open)], clock.after(0), count);
        assert_eq!(asked.get(), 0);
        assert!(!watcher.waiting_on_voyager(&[turn("p1", false, Ending::Open)]));
        assert!(watcher.waiting_on_voyager(&[turn("p2", true, Ending::Open)]));
    }

    #[test]
    fn turns_that_ended_before_the_watcher_started_are_never_spoken() {
        let clock = clock();
        let before = [text("old", "Old news."), turn("open", true, Ending::Open)];
        let mut watcher = Watcher::starting_at(&before);
        assert!(
            watcher
                .lines(&before, clock.after(0), || Some(Standing::Blocked))
                .is_empty()
        );
        let later = [before[0].clone(), text("open", "Now done.")];
        settled(&mut watcher, &later, &clock, 100);
        assert_eq!(settled(&mut watcher, &later, &clock, 800).len(), 1);
    }

    #[test]
    fn a_lost_turn_and_a_reply_with_nothing_speakable_say_nothing() {
        let (mut watcher, clock) = (Watcher::default(), clock());
        let turns = [
            turn("lost", true, Ending::Lost),
            text("code", "```\nonly code\n```"),
        ];
        settled(&mut watcher, &turns, &clock, 0);
        assert!(settled(&mut watcher, &turns, &clock, 1000).is_empty());
    }
}
