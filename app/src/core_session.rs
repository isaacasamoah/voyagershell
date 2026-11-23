use crate::{client::Client, core::Core};
use std::{
    sync::atomic::{AtomicU64, Ordering},
    thread,
    time::{Duration, Instant},
};
use voyager_contract::{Action, Request};

static SERIAL: AtomicU64 = AtomicU64::new(0);

const AMBIENT: [&str; 5] = [
    "HC_SOCKET",
    "HC_SESSION",
    "HC_TERMINAL_ID",
    "HC_SCOPE",
    "HC_TERMINAL_SOCKET",
];

fn ambient(is_set: impl Fn(&str) -> bool) -> Option<&'static str> {
    AMBIENT.into_iter().find(|key| is_set(key))
}

fn running(session: &str) -> bool {
    std::os::unix::net::UnixStream::connect(crate::core_endpoint::endpoint(session)).is_ok()
}

pub(crate) struct SessionGuard {
    session: String,
    clients: Vec<Client>,
}

impl SessionGuard {
    pub(crate) fn new(prefix: &str) -> Self {
        let serial = SERIAL.fetch_add(1, Ordering::Relaxed);
        let session = format!("{prefix}-{}-{serial}", std::process::id());
        if let Some(key) = ambient(|key| std::env::var_os(key).is_some()) {
            panic!("Clear ambient {key}");
        }
        Self {
            session,
            clients: Vec::new(),
        }
    }

    pub(crate) fn session(&self) -> &str {
        &self.session
    }

    pub(crate) fn open(&mut self, cwd: &str) -> Client {
        let client = Client::open(self.session.clone(), cwd.into());
        self.clients.push(client.clone());
        client
    }

    fn settle(&mut self) {
        for client in self.clients.drain(..) {
            let _ = client.call(Request {
                request_id: client.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            });
        }
    }

    fn stop(&self) -> Result<(), String> {
        let mut core = Core::connect(&self.session).map_err(|error| format!("{error:?}"))?;
        let stopped = core.server_stop();
        let closed = core.close();
        stopped.map_err(|error| format!("{error:?}"))?;
        closed.map_err(|error| format!("{error:?}"))
    }

    fn gone(&self) -> bool {
        let deadline = Instant::now() + Duration::from_secs(5);
        while running(&self.session) {
            if Instant::now() >= deadline {
                return false;
            }
            thread::sleep(Duration::from_millis(10));
        }
        true
    }
}

impl Drop for SessionGuard {
    fn drop(&mut self) {
        self.settle();
        let stopped = self.stop();
        let gone = self.gone();
        if thread::panicking() {
            if let Err(error) = &stopped {
                eprintln!("Core {} stop failed: {error}", self.session);
            }
            if !gone {
                eprintln!("Core {} is still running", self.session);
            }
            return;
        }
        if let Err(error) = stopped {
            panic!("Core {} stop failed: {error}", self.session);
        }
        assert!(gone, "Core {} is still running", self.session);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::panic::{AssertUnwindSafe, catch_unwind};

    fn start(guard: &mut SessionGuard) {
        let client = guard.open("/tmp");
        client
            .call(Request {
                request_id: client.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            })
            .unwrap();
        assert!(running(guard.session()));
    }

    #[test]
    fn a_guard_names_only_a_session_made_from_its_prefix_the_pid_and_a_serial() {
        let pid = std::process::id();
        let first = SessionGuard::new("voyager-trial");
        let second = SessionGuard::new("voyager-trial");
        assert_ne!(first.session(), "voyager-trial");
        assert!(
            first
                .session()
                .starts_with(&format!("voyager-trial-{pid}-"))
        );
        assert_ne!(first.session(), second.session());
        assert!(!running(first.session()));
    }

    #[test]
    fn a_guard_refuses_to_start_when_any_one_ambient_variable_is_set() {
        for key in AMBIENT {
            assert_eq!(ambient(|set| set == key), Some(key));
        }
        assert_eq!(ambient(|_| false), None);
    }

    #[test]
    fn a_run_leaves_no_core_behind_whether_it_passes_or_fails() {
        let mut passed = SessionGuard::new("voyager-guard-check-pass");
        let passed_session = passed.session().to_owned();
        let failed_session = {
            let mut failed = SessionGuard::new("voyager-guard-check-fail");
            let session = failed.session().to_owned();
            let outcome = catch_unwind(AssertUnwindSafe(|| {
                start(&mut failed);
                panic!("deliberate failure");
            }));
            assert!(outcome.is_err());
            drop(failed);
            session
        };
        start(&mut passed);
        drop(passed);
        assert!(
            !running(&failed_session),
            "a failing run left its Core running"
        );
        assert!(
            !running(&passed_session),
            "a passing run left its Core running"
        );
    }

    #[test]
    fn a_guard_stops_only_its_own_session() {
        let mut kept = SessionGuard::new("voyager-guard-keep");
        start(&mut kept);
        let mut dropped = SessionGuard::new("voyager-guard-drop");
        start(&mut dropped);
        let dropped_session = dropped.session().to_owned();
        drop(dropped);
        assert!(!running(&dropped_session));
        assert!(running(kept.session()));
    }
}
