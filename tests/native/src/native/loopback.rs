use anyhow::Result;
use std::fs;
use std::io::{self, BufRead, BufReader, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread::{self, JoinHandle};
use std::time::Duration;

const READ_PATIENCE: Duration = Duration::from_secs(5);
const NET_DEV: &str = "/proc/net/dev";

pub(super) struct Loopback {
    port: u16,
    requests: Arc<Mutex<Vec<String>>>,
    stop: Arc<AtomicBool>,
    serving: Option<JoinHandle<()>>,
}

impl Loopback {
    pub(super) fn serve(folder: PathBuf) -> Result<Self> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
        let port = listener.local_addr()?.port();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let stop = Arc::new(AtomicBool::new(false));
        let serving = thread::spawn({
            let requests = Arc::clone(&requests);
            let stop = Arc::clone(&stop);
            move || {
                for stream in listener.incoming() {
                    if stop.load(Ordering::SeqCst) {
                        break;
                    }
                    if let Ok(stream) = stream {
                        drop(answer(&folder, stream, &requests));
                    }
                }
            }
        });
        Ok(Self {
            port,
            requests,
            stop,
            serving: Some(serving),
        })
    }

    pub(super) fn url(&self) -> String {
        format!("http://{}:{}", Ipv4Addr::LOCALHOST, self.port)
    }

    pub(super) fn requests(&self) -> Vec<String> {
        self.requests
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

impl Drop for Loopback {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        drop(TcpStream::connect((Ipv4Addr::LOCALHOST, self.port)));
        if let Some(serving) = self.serving.take() {
            drop(serving.join());
        }
    }
}

fn answer(folder: &Path, mut stream: TcpStream, requests: &Mutex<Vec<String>>) -> io::Result<()> {
    stream.set_read_timeout(Some(READ_PATIENCE))?;
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut line = String::new();
    reader.read_line(&mut line)?;
    let request = line.trim_end().to_owned();
    requests
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .push(request.clone());
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header)? == 0 || header.trim_end().is_empty() {
            break;
        }
    }
    let served = request
        .strip_prefix("GET /")
        .and_then(|rest| rest.split(' ').next())
        .filter(|name| !name.is_empty() && !name.contains('/') && !name.starts_with('.'))
        .and_then(|name| fs::read(folder.join(name)).ok());
    match served {
        Some(body) => {
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            )?;
            stream.write_all(&body)?;
        }
        None => stream.write_all(
            b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )?,
    }
    stream.flush()
}

pub(super) fn interfaces() -> Result<Vec<String>> {
    Ok(fs::read_to_string(NET_DEV)?
        .lines()
        .skip(2)
        .filter_map(|line| line.split_once(':'))
        .map(|(name, _)| name.trim().to_owned())
        .collect())
}
