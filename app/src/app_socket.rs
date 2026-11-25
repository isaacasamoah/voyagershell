use std::{
    fs,
    io::{self, BufRead, BufReader, Read, Write},
    os::unix::{
        fs::DirBuilderExt,
        net::{UnixListener, UnixStream},
    },
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

const RAISE: &str = "raise";
const RAISED: &str = "raised";
const WAIT: Duration = Duration::from_secs(2);

pub fn path(session: &str) -> Option<PathBuf> {
    crate::vessel_socket::directory(session)
        .map(|directory| directory.with_file_name(format!("{session}.app.sock")))
}

#[derive(Debug, Eq, PartialEq)]
pub enum Raised {
    Raised,
    NotRunning,
}

pub fn listening(session: &str) -> bool {
    path(session).is_some_and(|path| UnixStream::connect(path).is_ok())
}

pub fn raise(session: &str) -> io::Result<Raised> {
    let path = path(session).ok_or_else(|| io::Error::other("Invalid session name"))?;
    let mut stream = match UnixStream::connect(&path) {
        Ok(stream) => stream,
        Err(error)
            if matches!(
                error.kind(),
                io::ErrorKind::NotFound | io::ErrorKind::ConnectionRefused
            ) =>
        {
            return Ok(Raised::NotRunning);
        }
        Err(error) => return Err(error),
    };
    stream.set_read_timeout(Some(WAIT))?;
    stream.write_all(format!("{RAISE}\n").as_bytes())?;
    let mut line = String::new();
    BufReader::new(stream.take(64)).read_line(&mut line)?;
    if line.trim_end() == RAISED {
        Ok(Raised::Raised)
    } else {
        Err(io::Error::other(format!(
            "The running app answered {line:?} instead of {RAISED}"
        )))
    }
}

pub struct Listener {
    path: PathBuf,
    closed: Arc<AtomicBool>,
}

impl Listener {
    pub fn bind(session: &str, raise: impl Fn() + Send + Sync + 'static) -> io::Result<Self> {
        let path = path(session).ok_or_else(|| io::Error::other("Invalid session name"))?;
        let directory = path
            .parent()
            .ok_or_else(|| io::Error::other("App socket has no directory"))?;
        fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(directory)?;
        if UnixStream::connect(&path).is_ok() {
            return Err(io::Error::new(
                io::ErrorKind::AddrInUse,
                format!("Another app answers on {}", path.display()),
            ));
        }
        match fs::remove_file(&path) {
            Err(error) if error.kind() != io::ErrorKind::NotFound => return Err(error),
            _ => (),
        }
        let listener = UnixListener::bind(&path)?;
        let closed = Arc::new(AtomicBool::new(false));
        let stopped = closed.clone();
        let raise = Arc::new(raise);
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                if stopped.load(Ordering::SeqCst) {
                    break;
                }
                let Ok(stream) = stream else {
                    continue;
                };
                let raise = raise.clone();
                std::thread::spawn(move || {
                    let _ = stream.set_read_timeout(Some(WAIT));
                    let mut line = String::new();
                    if BufReader::new((&stream).take(64))
                        .read_line(&mut line)
                        .is_ok()
                        && line.trim_end() == RAISE
                    {
                        raise();
                        let _ = (&stream).write_all(format!("{RAISED}\n").as_bytes());
                    }
                });
            }
        });
        Ok(Self { path, closed })
    }
}

impl Drop for Listener {
    fn drop(&mut self) {
        self.closed.store(true, Ordering::SeqCst);
        let _ = UnixStream::connect(&self.path);
        let _ = fs::remove_file(&self.path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_live_app_keeps_its_socket_and_a_dead_one_is_replaced() {
        let session = format!("voyager-app-socket-{}", std::process::id());
        let first = Listener::bind(&session, || ()).unwrap();
        let refusal = Listener::bind(&session, || ()).err().unwrap();
        assert_eq!(refusal.kind(), io::ErrorKind::AddrInUse);
        assert!(listening(&session));
        assert_eq!(raise(&session).unwrap(), Raised::Raised);
        drop(first);
        assert!(!listening(&session));
        let stale = path(&session).unwrap();
        drop(UnixListener::bind(&stale).unwrap());
        assert!(stale.exists() && !listening(&session));
        let second = Listener::bind(&session, || ()).unwrap();
        assert!(listening(&session));
        drop(second);
        assert_eq!(raise(&session).unwrap(), Raised::NotRunning);
    }
}
