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
            panic!(
                "Clear ambient {key}: run cargo test behind env {}",
                AMBIENT.map(|key| format!("-u {key}")).join(" ")
            );
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
        self.start(|session| Client::open(session, cwd.into()))
    }

    pub(crate) fn start(&mut self, make: impl FnOnce(String) -> Client) -> Client {
        let client = make(self.session.clone());
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
    fn ambient_probe() {
        if std::env::var_os("VOYAGER_GUARD_PROBE").is_some() {
            let _guard = SessionGuard::new("voyager-probe");
        }
    }

    #[test]
    fn a_guard_refuses_to_start_when_any_one_ambient_variable_is_set() {
        for key in AMBIENT {
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "core_session::tests::ambient_probe"])
                .env("VOYAGER_GUARD_PROBE", "1")
                .env(key, "set")
                .output()
                .unwrap();
            assert!(!output.status.success(), "{key} did not stop the guard");
            let text = format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            assert!(
                text.contains(&format!("Clear ambient {key}: run cargo test behind env -u HC_SOCKET -u HC_SESSION -u HC_TERMINAL_ID -u HC_SCOPE -u HC_TERMINAL_SOCKET")),
                "{key}: {text}"
            );
        }
        assert_eq!(ambient(|_| false), None);
    }

    fn private_runtime() -> std::path::PathBuf {
        let runtime = std::path::Path::new("/tmp").join(format!(
            "vg{:x}-{}",
            std::process::id(),
            SERIAL.fetch_add(1, Ordering::Relaxed)
        ));
        let longest = runtime
            .join("herdr-core")
            .join("voyager-gd-4294967295-99.sock");
        assert!(
            longest.as_os_str().len() <= 107,
            "socket path too long ({} bytes, Core allows 107): {}",
            longest.as_os_str().len(),
            longest.display()
        );
        std::fs::create_dir_all(&runtime).unwrap();
        std::fs::set_permissions(
            &runtime,
            std::os::unix::fs::PermissionsExt::from_mode(0o700),
        )
        .unwrap();
        runtime
    }

    #[test]
    fn delayed_connect_probe() {
        if std::env::var_os("VOYAGER_GUARD_DELAY_PROBE").is_none() {
            return;
        }
        let mut guard = SessionGuard::new("voyager-gd");
        let session = guard.session().to_owned();
        guard.open("/tmp");
        let mark = std::path::PathBuf::from(std::env::var_os("VOYAGER_DELAY_MARK").unwrap());
        let deadline = Instant::now() + Duration::from_secs(5);
        while !mark.exists() {
            assert!(
                Instant::now() < deadline,
                "the Client never started its connection"
            );
            thread::sleep(Duration::from_millis(5));
        }
        drop(guard);
        thread::sleep(Duration::from_secs(4));
        let leaked = running(&session);
        if leaked {
            let mut core = Core::connect(&session).unwrap();
            let _ = core.server_stop();
            let _ = core.close();
        }
        assert!(
            !leaked,
            "a first connection that landed late left its Core running"
        );
    }

    #[test]
    fn a_first_connection_that_lands_late_leaves_no_core_behind() {
        let runtime = private_runtime();
        let script = runtime.join("slow-first-connect.sh");
        std::fs::write(
            &script,
            concat!(
                "#!/bin/sh\n",
                "if mkdir \"$VOYAGER_DELAY_MARK\" 2>/dev/null; then\n",
                "  socket=\"$XDG_RUNTIME_DIR/herdr-core/$3.sock\"\n",
                "  seen=0\n",
                "  waited=0\n",
                "  while [ $waited -lt 500 ]; do\n",
                "    if [ -e \"$socket\" ]; then seen=1; elif [ $seen = 1 ]; then break; fi\n",
                "    sleep 0.01\n",
                "    waited=$((waited + 1))\n",
                "  done\n",
                "fi\n",
                "exec \"$VOYAGER_REAL_HC\" \"$@\"\n",
            ),
        )
        .unwrap();
        std::fs::set_permissions(&script, std::os::unix::fs::PermissionsExt::from_mode(0o755))
            .unwrap();
        let real = std::env::var_os("VOYAGER_HC").unwrap_or_else(|| "hc".into());
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "core_session::tests::delayed_connect_probe"])
            .env("VOYAGER_GUARD_DELAY_PROBE", "1")
            .env("XDG_RUNTIME_DIR", &runtime)
            .env("VOYAGER_HC", &script)
            .env("VOYAGER_REAL_HC", real)
            .env("VOYAGER_DELAY_MARK", runtime.join("first-connect"))
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        let _ = std::fs::remove_dir_all(&runtime);
    }

    #[test]
    fn a_run_leaves_no_core_behind_whether_it_passes_or_fails() {
        let mut passed = SessionGuard::new("voyager-guard-check-pass");
        let passed_session = passed.session().to_owned();
        let mut failed = SessionGuard::new("voyager-guard-check-fail");
        let failed_session = failed.session().to_owned();
        let outcome = catch_unwind(AssertUnwindSafe(move || {
            start(&mut failed);
            panic!("deliberate failure");
        }));
        assert!(outcome.is_err());
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
