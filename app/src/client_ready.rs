use crate::core::Error;
use std::{
    sync::{Condvar, Mutex, PoisonError},
    time::Duration,
};

const INSTALLER: &str = "Run Herdr Core's installer to update Core, then start VoyagerShell again.";

#[derive(Debug, Eq, PartialEq)]
pub enum FirstConnect {
    Usable,
    UnsupportedCore(String),
}

fn first_connect(result: Result<(), Error>) -> FirstConnect {
    match result {
        Err(Error::Rejected { kind, message }) if kind == "unsupported_core" => {
            FirstConnect::UnsupportedCore(format!("{message}. {INSTALLER}"))
        }
        _ => FirstConnect::Usable,
    }
}

struct State {
    connected: Option<Result<(), Error>>,
    ready: bool,
}

pub(super) struct Readiness {
    state: Mutex<State>,
    changed: Condvar,
}

impl Readiness {
    pub(super) fn held() -> Self {
        Self::new(false)
    }

    pub(super) fn open() -> Self {
        Self::new(true)
    }

    fn new(ready: bool) -> Self {
        Self {
            state: Mutex::new(State {
                connected: None,
                ready,
            }),
            changed: Condvar::new(),
        }
    }

    pub(super) fn connected(&self, result: Result<(), Error>) {
        let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        state.connected.get_or_insert(result);
        self.changed.notify_all();
    }

    pub(super) fn ready(&self) {
        let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        state.ready = true;
        self.changed.notify_all();
    }

    pub(super) fn is_ready(&self) -> bool {
        self.state
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .ready
    }

    pub(super) fn first_connect(&self) -> FirstConnect {
        let state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        let state = self
            .changed
            .wait_while(state, |state| state.connected.is_none())
            .unwrap_or_else(PoisonError::into_inner);
        first_connect(state.connected.clone().unwrap_or(Ok(())))
    }

    pub(super) fn wait_ready(&self, within: Duration) -> bool {
        let state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        self.changed
            .wait_timeout_while(state, within, |state| !state.ready)
            .is_ok_and(|(state, _)| state.ready)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::Incompatible;

    #[test]
    fn a_core_below_the_minimum_is_never_ready_and_names_the_installer() {
        let readiness = Readiness::held();
        readiness.connected(Err(Incompatible::Release("0.1.17".into()).into()));
        let FirstConnect::UnsupportedCore(message) = readiness.first_connect() else {
            panic!("An unsupported Core was usable");
        };
        assert!(message.contains("0.1.17"), "{message}");
        assert!(message.contains("Herdr Core's installer"), "{message}");
        assert!(!readiness.is_ready());
        assert!(!readiness.wait_ready(Duration::ZERO));
    }

    #[test]
    fn any_other_first_connect_result_keeps_todays_start() {
        for result in [
            Ok(()),
            Err(Error::Rejected {
                kind: "disconnected".into(),
                message: "Core is not connected".into(),
            }),
            Err(Error::Uncertain("no answer".into())),
        ] {
            let readiness = Readiness::held();
            readiness.connected(result);
            assert_eq!(readiness.first_connect(), FirstConnect::Usable);
            assert!(!readiness.is_ready());
            readiness.ready();
            assert!(readiness.wait_ready(Duration::ZERO));
        }
        assert!(Readiness::open().is_ready());
    }
}
