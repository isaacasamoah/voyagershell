use crate::{client::Client, core::Core};
use std::{
    thread,
    time::{Duration, Instant},
};
use voyager_contract::{Action, Request};

#[cfg(unix)]
pub fn running(session: &str) -> bool {
    std::os::unix::net::UnixStream::connect(crate::core_endpoint::endpoint(session)).is_ok()
}

#[cfg(not(unix))]
pub fn running(_session: &str) -> bool {
    false
}

pub struct SessionGuard {
    session: String,
    clients: Vec<Client>,
}

impl SessionGuard {
    pub fn new(prefix: &str) -> Self {
        Self::named(format!("{prefix}-{}", std::process::id()))
    }

    pub fn named(session: String) -> Self {
        Self {
            session,
            clients: Vec::new(),
        }
    }

    pub fn session(&self) -> &str {
        &self.session
    }

    pub fn open(&mut self, cwd: &str) -> Client {
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
