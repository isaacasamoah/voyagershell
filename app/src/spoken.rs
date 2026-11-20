use std::collections::HashMap;
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
        "A prompt that starts with {MARKER} came by voice. Act first, then answer with the result in one short plain sentence, a blank line, then any detail. Put no ids, paths or code in that sentence."
    )
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Kind {
    Spoken,
    Typed,
}

#[derive(Debug, Default)]
pub struct TurnLedger {
    pending: HashMap<String, usize>,
    turns: HashMap<String, HashMap<String, Kind>>,
}

impl TurnLedger {
    pub fn spoken_prompt(&mut self, vessel: &VesselId) {
        *self.pending.entry(vessel.0.clone()).or_default() += 1;
    }

    pub fn observe(&mut self, vessel: &VesselId, turn: &str) -> Kind {
        let turns = self.turns.entry(vessel.0.clone()).or_default();
        if let Some(kind) = turns.get(turn) {
            return *kind;
        }
        let kind = match self.pending.get_mut(&vessel.0) {
            Some(marks) if *marks > 0 => {
                *marks -= 1;
                Kind::Spoken
            }
            _ => Kind::Typed,
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
        assert!(rule.contains("one short plain sentence"));
        assert!(rule.contains("no ids, paths or code"));
    }

    #[test]
    fn the_turn_after_a_spoken_prompt_is_spoken_and_keeps_its_mark() {
        let mut ledger = TurnLedger::default();
        let voyager = vessel("v1");
        ledger.spoken_prompt(&voyager);
        assert_eq!(ledger.observe(&voyager, "turn-1"), Kind::Spoken);
        assert_eq!(ledger.observe(&voyager, "turn-1"), Kind::Spoken);
    }

    #[test]
    fn two_spoken_prompts_before_any_turn_give_two_spoken_turns_in_order() {
        let mut ledger = TurnLedger::default();
        let voyager = vessel("v1");
        ledger.spoken_prompt(&voyager);
        ledger.spoken_prompt(&voyager);
        assert_eq!(ledger.observe(&voyager, "turn-1"), Kind::Spoken);
        assert_eq!(ledger.observe(&voyager, "turn-2"), Kind::Spoken);
        assert_eq!(ledger.observe(&voyager, "turn-3"), Kind::Typed);
        assert_eq!(ledger.observe(&voyager, "turn-1"), Kind::Spoken);
    }

    #[test]
    fn a_turn_with_no_spoken_prompt_before_it_is_typed() {
        let mut ledger = TurnLedger::default();
        let voyager = vessel("v1");
        assert_eq!(ledger.observe(&voyager, "turn-1"), Kind::Typed);
        ledger.spoken_prompt(&voyager);
        assert_eq!(ledger.observe(&voyager, "turn-2"), Kind::Spoken);
        assert_eq!(ledger.observe(&voyager, "turn-3"), Kind::Typed);
        assert_eq!(ledger.observe(&voyager, "turn-2"), Kind::Spoken);
    }

    #[test]
    fn a_late_event_of_an_earlier_turn_does_not_take_the_mark() {
        let mut ledger = TurnLedger::default();
        let voyager = vessel("v1");
        assert_eq!(ledger.observe(&voyager, "turn-1"), Kind::Typed);
        ledger.spoken_prompt(&voyager);
        assert_eq!(ledger.observe(&voyager, "turn-1"), Kind::Typed);
        assert_eq!(ledger.observe(&voyager, "turn-2"), Kind::Spoken);
    }

    #[test]
    fn a_mark_belongs_to_the_vessel_that_sent_it() {
        let mut ledger = TurnLedger::default();
        ledger.spoken_prompt(&vessel("v1"));
        assert_eq!(ledger.observe(&vessel("v2"), "turn-1"), Kind::Typed);
        assert_eq!(ledger.observe(&vessel("v1"), "turn-1"), Kind::Spoken);
    }

    #[test]
    fn a_vessel_that_is_gone_loses_its_marks() {
        let mut ledger = TurnLedger::default();
        ledger.spoken_prompt(&vessel("v1"));
        ledger.observe(&vessel("v2"), "turn-1");
        ledger.keep_only(|vessel| vessel == "v2");
        assert_eq!(ledger.observe(&vessel("v1"), "turn-1"), Kind::Typed);
        assert_eq!(ledger.observe(&vessel("v2"), "turn-1"), Kind::Typed);
    }
}
