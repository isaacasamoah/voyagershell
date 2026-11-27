use crate::sandbox;
use crate::system::{PATIENCE, poll};
use anyhow::{Context as _, Result, anyhow};
use serde::Serialize;
use std::fs;
use std::io::{self, Read as _, Write as _};
use std::net::Shutdown;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

const SETTLE_POLL: Duration = Duration::from_millis(20);
const FOLDER: &str = "relay";

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize)]
pub struct Traffic {
    pub connections: usize,
    pub requests: usize,
    pub replies: usize,
}

#[derive(Default)]
struct Count {
    traffic: Traffic,
    open: usize,
}

pub struct RequestRelay {
    runtime: String,
    count: Arc<Mutex<Count>>,
}

impl RequestRelay {
    pub fn vessel(session: &str, terminal: &str) -> Result<Self> {
        let socket = |runtime: &Path| {
            runtime
                .join("herdr-core")
                .join(format!("{session}.vessels"))
                .join(format!("{terminal}.sock"))
        };
        let runtime = Path::new(sandbox::RUNTIME).join(FOLDER);
        Self::between(
            socket(Path::new(sandbox::RUNTIME)),
            &socket(&runtime),
            &runtime,
        )
    }

    fn between(real: PathBuf, at: &Path, runtime: &Path) -> Result<Self> {
        fs::create_dir_all(at.parent().context("The relay socket has no folder")?)?;
        let listener = UnixListener::bind(at)?;
        let count = Arc::new(Mutex::new(Count::default()));
        let shared = count.clone();
        thread::spawn(move || {
            for client in listener.incoming().flatten() {
                let (shared, real) = (shared.clone(), real.clone());
                thread::spawn(move || carry(client, &real, &shared));
            }
        });
        Ok(Self {
            runtime: runtime
                .to_str()
                .context("Non-UTF8 relay folder")?
                .to_owned(),
            count,
        })
    }

    pub fn runtime(&self) -> &str {
        &self.runtime
    }

    pub fn counted(&self, during: impl FnOnce() -> Result<()>) -> Result<Traffic> {
        let before = self.read()?.traffic;
        during()?;
        let after = poll(PATIENCE, SETTLE_POLL, true, || {
            let now = self.read()?;
            Ok((now.open == 0).then_some(now.traffic))
        })?
        .context("A relayed connection never closed")?;
        Ok(Traffic {
            connections: after.connections - before.connections,
            requests: after.requests - before.requests,
            replies: after.replies - before.replies,
        })
    }

    fn read(&self) -> Result<Count> {
        self.count
            .lock()
            .map(|count| Count {
                traffic: count.traffic,
                open: count.open,
            })
            .map_err(|_| anyhow!("The relay's count was poisoned"))
    }
}

fn carry(client: UnixStream, real: &Path, count: &Mutex<Count>) {
    let change = |change: &dyn Fn(&mut Count)| {
        if let Ok(mut count) = count.lock() {
            change(&mut count);
        }
    };
    change(&|count| {
        count.traffic.connections += 1;
        count.open += 1;
    });
    let (requests, replies) = both_ways(client, real).unwrap_or_default();
    change(&|count| {
        count.traffic.requests += requests;
        count.traffic.replies += replies;
        count.open -= 1;
    });
}

fn both_ways(client: UnixStream, real: &Path) -> io::Result<(usize, usize)> {
    let server = UnixStream::connect(real)?;
    let (mut from_client, mut to_server) = (client.try_clone()?, server.try_clone()?);
    let upstream = thread::spawn(move || {
        let lines = copy_lines(&mut from_client, &mut to_server);
        let _ = to_server.shutdown(Shutdown::Write);
        lines
    });
    let (mut from_server, mut to_client) = (server, client);
    let replies = copy_lines(&mut from_server, &mut to_client);
    let _ = to_client.shutdown(Shutdown::Write);
    Ok((upstream.join().unwrap_or_default(), replies))
}

fn copy_lines(from: &mut UnixStream, to: &mut UnixStream) -> usize {
    let (mut buffer, mut lines) = ([0; 8192], 0);
    while let Ok(read @ 1..) = from.read(&mut buffer) {
        lines += buffer[..read].iter().filter(|byte| **byte == b'\n').count();
        if to.write_all(&buffer[..read]).is_err() {
            break;
        }
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::Scratch;
    use std::io::{BufRead, BufReader};

    fn answering(at: &Path) -> Result<()> {
        let listener = UnixListener::bind(at)?;
        thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let mut line = String::new();
                let _ = BufReader::new(&stream).read_line(&mut line);
                let _ = (&stream).write_all(b"{\"answer\":1}\n");
            }
        });
        Ok(())
    }

    fn ask(at: &Path, lines: &[u8]) -> Result<String> {
        let mut stream = UnixStream::connect(at)?;
        stream.write_all(lines)?;
        let mut reply = String::new();
        BufReader::new(&stream).read_line(&mut reply)?;
        Ok(reply)
    }

    #[test]
    fn one_request_and_its_reply_count_as_one_of_each() -> Result<()> {
        let scratch = Scratch::new("relay-one")?;
        let real = scratch.path().join("real.sock");
        let at = scratch.path().join("relay").join("at.sock");
        answering(&real)?;
        let relay = RequestRelay::between(real, &at, scratch.path())?;
        let mut reply = String::new();
        let traffic = relay.counted(|| {
            reply = ask(&at, b"{\"ask\":1}\n")?;
            Ok(())
        })?;
        assert_eq!(reply, "{\"answer\":1}\n");
        let one = Traffic {
            connections: 1,
            requests: 1,
            replies: 1,
        };
        assert_eq!(traffic, one);
        Ok(())
    }

    #[test]
    fn a_second_request_on_the_same_connection_is_counted() -> Result<()> {
        let scratch = Scratch::new("relay-two")?;
        let real = scratch.path().join("real.sock");
        let at = scratch.path().join("relay").join("at.sock");
        answering(&real)?;
        let relay = RequestRelay::between(real, &at, scratch.path())?;
        let traffic = relay.counted(|| ask(&at, b"{\"ask\":1}\n{\"ask\":1}\n").map(drop))?;
        assert_eq!(traffic.connections, 1);
        assert_eq!(traffic.requests, 2);
        Ok(())
    }
}
