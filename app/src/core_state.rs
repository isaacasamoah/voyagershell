use crate::core_shapes::Terminal;
use std::{
    collections::BTreeSet,
    sync::{Mutex, OnceLock},
};

const LIVE: &str = "live";
const FINISHED: &str = "finished";
const EXITED: &str = "exited";
const SPAWN_PENDING: &str = "spawn_pending";

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TerminalState {
    Live,
    Finished,
    Unknown(String),
}

impl TerminalState {
    pub fn parse(word: &str) -> Self {
        match word {
            LIVE => Self::Live,
            FINISHED => Self::Finished,
            other => {
                if first_sighting(other) {
                    eprintln!(
                        "Core reported unknown terminal state {other:?}; the terminal is kept"
                    );
                }
                Self::Unknown(other.to_owned())
            }
        }
    }

    pub fn is_unknown(&self) -> bool {
        matches!(self, Self::Unknown(_))
    }
}

fn first_sighting(word: &str) -> bool {
    static SEEN: OnceLock<Mutex<BTreeSet<String>>> = OnceLock::new();
    SEEN.get_or_init(Mutex::default)
        .lock()
        .map(|mut seen| seen.insert(word.to_owned()))
        .unwrap_or(false)
}

impl Terminal {
    pub fn lifecycle(&self) -> TerminalState {
        TerminalState::parse(&self.state)
    }

    pub fn is_live(&self) -> bool {
        self.lifecycle() == TerminalState::Live
    }

    pub fn start_unconfirmed(&self) -> bool {
        self.reason.as_deref() == Some(SPAWN_PENDING)
    }

    pub fn has_ended(&self) -> bool {
        self.lifecycle() == TerminalState::Finished && !self.start_unconfirmed()
    }

    pub fn has_exited(&self) -> bool {
        self.has_ended() && self.reason.as_deref() == Some(EXITED)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn terminal(state: &str, reason: Option<&str>) -> Terminal {
        serde_json::from_value(serde_json::json!({
            "address":"t1", "labels":{}, "argv":["bash"], "cwd":"/tmp",
            "state":state, "reason":reason, "created_ms":0, "screen":"exact", "cols":80, "rows":24
        }))
        .unwrap()
    }

    #[test]
    fn core_words_parse_to_their_state_and_unknown_words_are_kept() {
        assert_eq!(TerminalState::parse("live"), TerminalState::Live);
        assert_eq!(TerminalState::parse("finished"), TerminalState::Finished);
        assert_eq!(
            TerminalState::parse("paused-by-core"),
            TerminalState::Unknown("paused-by-core".into())
        );
        assert!(TerminalState::parse("").is_unknown());
    }

    #[test]
    fn an_unknown_word_is_reported_once() {
        assert!(first_sighting("a-word-only-this-test-uses"));
        assert!(!first_sighting("a-word-only-this-test-uses"));
    }

    #[test]
    fn ended_needs_a_finished_state_and_a_confirmed_start() {
        assert!(terminal("finished", Some("exited")).has_exited());
        assert!(terminal("finished", Some("killed")).has_ended());
        assert!(!terminal("finished", Some("killed")).has_exited());
        assert!(!terminal("finished", Some("spawn_pending")).has_ended());
        assert!(!terminal("live", None).has_ended());
        assert!(!terminal("unknown", None).has_ended());
        assert!(terminal("live", None).is_live());
        assert!(!terminal("unknown", None).is_live());
    }
}
