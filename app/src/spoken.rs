use std::collections::{HashMap, VecDeque};
use voyager_contract::VesselId;

pub const MARKER: &str = "[spoken]";

pub fn prompt(words: &str) -> String {
    format!("{MARKER} {words}")
}

pub fn is_spoken(prompt: &str) -> bool {
    prompt
        .trim_start()
        .strip_prefix(MARKER)
        .is_some_and(|rest| rest.is_empty() || rest.starts_with(char::is_whitespace))
}

pub fn policy_rule() -> String {
    format!(
        "A prompt that starts with {MARKER} came by voice. Act first, then answer aloud in full, brief and plain, with no ids, paths or code. Say the reason when something fails. Summarise a very long answer, such as a list, and offer more. Never point to the chat."
    )
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Kind {
    Spoken,
    Typed,
}

const PENDING_LIMIT: usize = 16;

#[derive(Debug, Default)]
pub struct TurnLedger {
    pending: HashMap<String, VecDeque<String>>,
    turns: HashMap<String, HashMap<String, Kind>>,
}

impl TurnLedger {
    pub fn spoken_prompt(&mut self, vessel: &VesselId, prompt: &str) {
        let marks = self.pending.entry(vessel.0.clone()).or_default();
        if !marks.iter().any(|mark| mark == prompt) {
            marks.push_back(prompt.into());
        }
        while marks.len() > PENDING_LIMIT {
            marks.pop_front();
        }
    }

    pub fn observe(&mut self, vessel: &VesselId, turn: &str) -> Kind {
        let turns = self.turns.entry(vessel.0.clone()).or_default();
        if let Some(kind) = turns.get(turn) {
            return *kind;
        }
        let marked = self.pending.get_mut(&vessel.0).and_then(|marks| {
            let at = marks.iter().position(|mark| mark == turn)?;
            marks.remove(at)
        });
        let kind = if marked.is_some() {
            Kind::Spoken
        } else {
            Kind::Typed
        };
        turns.insert(turn.into(), kind);
        kind
    }

    pub fn keep_only(&mut self, live: impl Fn(&str) -> bool) {
        self.pending.retain(|vessel, _| live(vessel));
        self.turns.retain(|vessel, _| live(vessel));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vessel(id: &str) -> VesselId {
        VesselId(id.into())
    }

    #[test]
    fn a_prompt_built_for_voice_is_read_back_as_spoken() {
        assert!(is_spoken(&prompt("rename the build tab")));
        assert!(is_spoken("  [spoken] open the roadmap"));
        assert!(is_spoken("[spoken]"));
    }

    #[test]
    fn only_a_leading_marker_makes_a_prompt_spoken() {
        assert!(!is_spoken("rename the build tab"));
        assert!(!is_spoken("please [spoken] rename"));
        assert!(!is_spoken("[spokenly] rename"));
        assert!(!is_spoken("[Spoken] rename"));
    }

    #[test]
    fn the_policy_rule_names_the_marker_the_prompt_carries() {
        let rule = policy_rule();
        assert!(rule.starts_with(&format!("A prompt that starts with {MARKER} ")));
        assert!(rule.contains("answer aloud in full"));
        assert!(rule.contains("no ids, paths or code"));
        assert!(rule.contains("Say the reason when something fails."));
        assert!(rule.ends_with("Never point to the chat."));
        assert!(!rule.contains("one short"));
    }

    #[test]
    fn the_turn_after_a_spoken_prompt_is_spoken_and_keeps_its_mark() {
        let mut ledger = TurnLedger::default();
        let voyager = vessel("v1");
        ledger.spoken_prompt(&voyager, "turn-1");
        assert_eq!(ledger.observe(&voyager, "turn-1"), Kind::Spoken);
        assert_eq!(ledger.observe(&voyager, "turn-1"), Kind::Spoken);
    }

    #[test]
    fn two_spoken_prompts_before_any_turn_give_two_spoken_turns_in_order() {
        let mut ledger = TurnLedger::default();
        let voyager = vessel("v1");
        ledger.spoken_prompt(&voyager, "turn-1");
        ledger.spoken_prompt(&voyager, "turn-2");
        assert_eq!(ledger.observe(&voyager, "turn-1"), Kind::Spoken);
        assert_eq!(ledger.observe(&voyager, "turn-2"), Kind::Spoken);
        assert_eq!(ledger.observe(&voyager, "turn-3"), Kind::Typed);
        assert_eq!(ledger.observe(&voyager, "turn-1"), Kind::Spoken);
    }

    #[test]
    fn a_spoken_prompt_marks_only_its_own_turn_whatever_order_the_turns_start_in() {
        let mut ledger = TurnLedger::default();
        let voyager = vessel("v1");
        assert_eq!(ledger.observe(&voyager, "turn-1"), Kind::Typed);
        ledger.spoken_prompt(&voyager, "turn-2");
        assert_eq!(ledger.observe(&voyager, "turn-2"), Kind::Spoken);
        assert_eq!(ledger.observe(&voyager, "turn-3"), Kind::Typed);
        assert_eq!(ledger.observe(&voyager, "turn-2"), Kind::Spoken);
    }

    #[test]
    fn a_late_event_of_an_earlier_turn_does_not_take_the_mark() {
        let mut ledger = TurnLedger::default();
        let voyager = vessel("v1");
        assert_eq!(ledger.observe(&voyager, "turn-1"), Kind::Typed);
        ledger.spoken_prompt(&voyager, "turn-2");
        assert_eq!(ledger.observe(&voyager, "turn-1"), Kind::Typed);
        assert_eq!(ledger.observe(&voyager, "turn-2"), Kind::Spoken);
    }

    #[test]
    fn a_mark_belongs_to_the_vessel_that_sent_it() {
        let mut ledger = TurnLedger::default();
        ledger.spoken_prompt(&vessel("v1"), "turn-1");
        assert_eq!(ledger.observe(&vessel("v2"), "turn-1"), Kind::Typed);
        assert_eq!(ledger.observe(&vessel("v1"), "turn-1"), Kind::Spoken);
    }

    #[test]
    fn a_vessel_that_is_gone_loses_its_marks() {
        let mut ledger = TurnLedger::default();
        ledger.spoken_prompt(&vessel("v1"), "turn-1");
        ledger.observe(&vessel("v2"), "turn-1");
        ledger.keep_only(|vessel| vessel == "v2");
        assert_eq!(ledger.observe(&vessel("v1"), "turn-1"), Kind::Typed);
        assert_eq!(ledger.observe(&vessel("v2"), "turn-1"), Kind::Typed);
    }

    #[test]
    fn a_typed_prompt_between_two_spoken_ones_does_not_take_a_mark() {
        let mut ledger = TurnLedger::default();
        let voyager = vessel("v1");
        ledger.spoken_prompt(&voyager, "p1");
        ledger.spoken_prompt(&voyager, "p3");
        assert_eq!(ledger.observe(&voyager, "p1"), Kind::Spoken);
        assert_eq!(ledger.observe(&voyager, "p2"), Kind::Typed);
        assert_eq!(ledger.observe(&voyager, "p3"), Kind::Spoken);
    }

    #[test]
    fn a_prompt_that_never_produced_a_turn_leaves_no_mark_for_a_later_one() {
        let mut ledger = TurnLedger::default();
        let voyager = vessel("v1");
        ledger.spoken_prompt(&voyager, "p1");
        assert_eq!(ledger.observe(&voyager, "p2"), Kind::Typed);
    }

    #[test]
    fn pending_marks_are_bounded_and_the_oldest_goes_first() {
        let mut ledger = TurnLedger::default();
        let voyager = vessel("v1");
        for number in 0..=PENDING_LIMIT {
            ledger.spoken_prompt(&voyager, &format!("p{number}"));
        }
        assert_eq!(ledger.observe(&voyager, "p0"), Kind::Typed);
        assert_eq!(ledger.observe(&voyager, "p1"), Kind::Spoken);
    }
}
