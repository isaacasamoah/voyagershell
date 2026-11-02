use crate::wire::Frame;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, VecDeque},
    env,
    io::{BufRead, BufReader, Read, Write},
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, Receiver, SyncSender},
    },
    thread,
    time::Duration,
};

const VIEW_LIMIT: usize = 1024 * 1024;
const TOTAL_LIMIT: usize = 16 * 1024 * 1024;
pub const MAX_INPUT_BYTES: usize = 65536;

#[derive(Clone, Debug)]
pub enum Error {
    Rejected { kind: String, message: String },
    Uncertain(String),
}

impl From<std::io::Error> for Error {
    fn from(error: std::io::Error) -> Self {
        Self::Uncertain(error.to_string())
    }
}

struct Stream {
    bytes: VecDeque<u8>,
    closed: bool,
    wake: async_channel::Sender<()>,
    ready: async_channel::Receiver<()>,
}

impl Default for Stream {
    fn default() -> Self {
        let (wake, ready) = async_channel::bounded(1);
        Self {
            bytes: VecDeque::new(),
            closed: false,
            wake,
            ready,
        }
    }
}

#[derive(Default)]
struct Streams {
    buffers: HashMap<u32, Stream>,
    total: usize,
}

#[derive(Clone)]
pub struct Viewer {
    channel: u32,
    streams: Arc<Mutex<Streams>>,
    input: SyncSender<Frame>,
    control: SyncSender<Frame>,
    connected: Arc<AtomicBool>,
}

impl Viewer {
    pub fn ensure_open(&self) -> Result<(), Error> {
        if !self.connected() {
            return Err(Error::Uncertain(
                "Core connection is unavailable; no attachment was repeated".into(),
            ));
        }
        let streams = self
            .streams
            .lock()
            .map_err(|error| Error::Uncertain(error.to_string()))?;
        if streams
            .buffers
            .get(&self.channel)
            .is_none_or(|stream| stream.closed)
        {
            return Err(Error::Rejected {
                kind: "viewer_expired".into(),
                message: "The original request attached a viewer that has since closed; no attachment was repeated".into(),
            });
        }
        Ok(())
    }

    pub fn same_channel(&self, other: &Self) -> bool {
        self.channel == other.channel && Arc::ptr_eq(&self.streams, &other.streams)
    }

    pub fn take(&self, limit: usize) -> Result<Vec<u8>, Error> {
        let mut streams = self
            .streams
            .lock()
            .map_err(|e| Error::Uncertain(e.to_string()))?;
        let buffer = streams
            .buffers
            .get_mut(&self.channel)
            .ok_or_else(|| Error::Uncertain("Viewer is closed".into()))?;
        let count = limit.min(65536).min(buffer.bytes.len());
        let bytes = buffer.bytes.drain(..count).collect();
        if !buffer.bytes.is_empty() {
            let _ = buffer.wake.try_send(());
        }
        streams.total -= count;
        Ok(bytes)
    }

    pub fn credit(&self, bytes: u32) -> Result<(), Error> {
        self.send(&self.control, 1, bytes.to_le_bytes().to_vec())
    }

    pub async fn ready(&self) -> Result<(), Error> {
        let ready = self
            .streams
            .lock()
            .map_err(|e| Error::Uncertain(e.to_string()))?
            .buffers
            .get(&self.channel)
            .ok_or_else(|| Error::Uncertain("Viewer is closed".into()))?
            .ready
            .clone();
        ready
            .recv()
            .await
            .map_err(|_| Error::Uncertain("Viewer is closed".into()))
    }

    pub fn input(&self, bytes: Vec<u8>) -> Result<(), Error> {
        if bytes.len() > MAX_INPUT_BYTES {
            return Err(Error::Rejected {
                kind: "too_large".into(),
                message: "Terminal input exceeds 64 KiB".into(),
            });
        }
        self.send(&self.input, 0, bytes)
    }

    pub fn focus(&self, focused: bool) -> Result<(), Error> {
        self.send(&self.control, 4, vec![u8::from(focused)])
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), Error> {
        let mut payload = Vec::with_capacity(4);
        payload.extend_from_slice(&cols.to_le_bytes());
        payload.extend_from_slice(&rows.to_le_bytes());
        self.send(&self.control, 3, payload)
    }

    pub fn display(
        &self,
        width: u32,
        height: u32,
        fg: String,
        bg: String,
        cursor: Option<String>,
    ) -> Result<(), Error> {
        self.send(
            &self.control,
            5,
            serde_json::to_vec(
                &json!({ "cell": [width, height], "fg": fg, "bg": bg, "cursor": cursor }),
            )
            .map_err(|error| Error::Uncertain(error.to_string()))?,
        )
    }

    pub fn close(&self) -> Result<(), Error> {
        self.send(&self.control, 2, Vec::new())?;
        let mut streams = self
            .streams
            .lock()
            .map_err(|e| Error::Uncertain(e.to_string()))?;
        if let Some(buffer) = streams.buffers.remove(&self.channel) {
            streams.total -= buffer.bytes.len();
        }
        Ok(())
    }

    pub fn connected(&self) -> bool {
        self.connected.load(Ordering::Acquire)
    }

    pub fn finished(&self) -> Result<bool, Error> {
        let streams = self
            .streams
            .lock()
            .map_err(|e| Error::Uncertain(e.to_string()))?;
        let stream = streams
            .buffers
            .get(&self.channel)
            .ok_or_else(|| Error::Uncertain("Viewer is closed".into()))?;
        Ok(stream.closed && stream.bytes.is_empty())
    }

    fn send(&self, queue: &SyncSender<Frame>, kind: u8, payload: Vec<u8>) -> Result<(), Error> {
        queue
            .try_send(Frame {
                channel: self.channel,
                kind,
                payload,
            })
            .map_err(|_| Error::Rejected {
                kind: "busy".into(),
                message: "Core output queue is unavailable; frame was not queued".into(),
            })
    }
}

pub struct Core {
    child: Child,
    control: SyncSender<Frame>,
    input: SyncSender<Frame>,
    replies: Receiver<Value>,
    streams: Arc<Mutex<Streams>>,
    expected: Arc<AtomicU64>,
    attaching: Arc<AtomicU64>,
    connected: Arc<AtomicBool>,
    sequence: u64,
}

impl Core {
    pub fn connect(session: &str) -> Result<Self, Error> {
        if !session.starts_with("voyager-")
            || !session
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        {
            return Err(Error::Rejected {
                kind: "invalid_session".into(),
                message: "Use a dedicated voyager- session".into(),
            });
        }
        let mut child = Command::new(env::var_os("VOYAGER_HC").unwrap_or_else(|| "hc".into()))
            .args(["connect", "--session", session])
            .env("HC_SESSION", session)
            .env_remove("HC_TERMINAL_ID")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()?;
        let mut input = child
            .stdin
            .take()
            .ok_or_else(|| Error::Uncertain("Core input pipe missing".into()))?;
        let mut output = BufReader::new(
            child
                .stdout
                .take()
                .ok_or_else(|| Error::Uncertain("Core output pipe missing".into()))?,
        );
        let handshake = (|| -> Result<(), Error> {
            input.write_all(b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"hello\",\"params\":{\"framed\":true,\"generation\":1}}\n")?;
            input.flush()?;
            let mut line = Vec::new();
            output
                .by_ref()
                .take(1024 * 1024 + 1)
                .read_until(b'\n', &mut line)?;
            if line.is_empty() || line.len() > 1024 * 1024 {
                return Err(Error::Uncertain(
                    "Core handshake missing or oversized".into(),
                ));
            }
            let result: Value =
                serde_json::from_slice(&line).map_err(|e| Error::Uncertain(e.to_string()))?;
            if result.get("id") != Some(&json!(1))
                || result.pointer("/result/framed") != Some(&json!(true))
            {
                return Err(Error::Uncertain(
                    "Core did not accept framed protocol".into(),
                ));
            }
            Ok(())
        })();
        if let Err(error) = handshake {
            if let Err(cleanup) = child.kill() {
                eprintln!("Core bridge startup cleanup failed: {cleanup}");
            }
            if let Err(cleanup) = child.wait() {
                eprintln!("Core bridge startup wait failed: {cleanup}");
            }
            return Err(error);
        }
        let (control, controls) = mpsc::sync_channel::<Frame>(64);
        let (data, inputs) = mpsc::sync_channel::<Frame>(64);
        let (reply, replies) = mpsc::sync_channel(1);
        let streams = Arc::new(Mutex::new(Streams::default()));
        let expected = Arc::new(AtomicU64::new(0));
        let attaching = Arc::new(AtomicU64::new(0));
        let connected = Arc::new(AtomicBool::new(true));
        let writer_alive = connected.clone();
        let writer_streams = streams.clone();
        thread::spawn(move || {
            while writer_alive.load(Ordering::Acquire) {
                let frame = match controls.try_recv() {
                    Ok(frame) => frame,
                    Err(_) => match inputs.recv_timeout(Duration::from_millis(5)) {
                        Ok(frame) => frame,
                        Err(mpsc::RecvTimeoutError::Timeout) => continue,
                        Err(_) => break,
                    },
                };
                if frame
                    .write_to(&mut input)
                    .and_then(|()| input.flush())
                    .is_err()
                {
                    break;
                }
                if let Ok(frame) = inputs.try_recv()
                    && frame
                        .write_to(&mut input)
                        .and_then(|()| input.flush())
                        .is_err()
                {
                    break;
                }
            }
            writer_alive.store(false, Ordering::Release);
            if let Ok(streams) = writer_streams.lock() {
                for stream in streams.buffers.values() {
                    let _ = stream.wake.try_send(());
                }
            }
        });
        let reader_streams = streams.clone();
        let reader_expected = expected.clone();
        let reader_attaching = attaching.clone();
        let reader_alive = connected.clone();
        thread::spawn(move || {
            while reader_alive.load(Ordering::Acquire) {
                let Ok(frame) = Frame::read_from(&mut output) else {
                    break;
                };
                if frame.channel == 0 && frame.kind == 0 {
                    let Ok(message) = serde_json::from_slice::<Value>(&frame.payload) else {
                        break;
                    };
                    let Some(id) = message.get("id").and_then(Value::as_u64) else {
                        continue;
                    };
                    if id != reader_expected.load(Ordering::Acquire) {
                        continue;
                    }
                    if id == reader_attaching.load(Ordering::Acquire)
                        && let Some(channel) = message
                            .pointer("/result/channel")
                            .and_then(Value::as_u64)
                            .and_then(|id| u32::try_from(id).ok())
                    {
                        let Ok(mut streams) = reader_streams.lock() else {
                            break;
                        };
                        if channel == 0
                            || streams.buffers.len() >= 64
                            || streams.buffers.insert(channel, Stream::default()).is_some()
                        {
                            break;
                        }
                    }
                    if reply.try_send(message).is_err() {
                        break;
                    }
                } else if frame.channel != 0 && frame.kind == 0 {
                    let Ok(mut streams) = reader_streams.lock() else {
                        break;
                    };
                    if streams.total + frame.payload.len() > TOTAL_LIMIT {
                        break;
                    }
                    let Some(buffer) = streams.buffers.get_mut(&frame.channel) else {
                        continue;
                    };
                    if buffer.closed || buffer.bytes.len() + frame.payload.len() > VIEW_LIMIT {
                        break;
                    }
                    let count = frame.payload.len();
                    buffer.bytes.extend(frame.payload);
                    let _ = buffer.wake.try_send(());
                    streams.total += count;
                } else if frame.channel != 0
                    && frame.kind == 2
                    && let Ok(mut streams) = reader_streams.lock()
                    && let Some(buffer) = streams.buffers.get_mut(&frame.channel)
                {
                    buffer.closed = true;
                    let _ = buffer.wake.try_send(());
                }
            }
            reader_alive.store(false, Ordering::Release);
            if let Ok(streams) = reader_streams.lock() {
                for stream in streams.buffers.values() {
                    let _ = stream.wake.try_send(());
                }
            }
        });
        Ok(Self {
            child,
            control,
            input: data,
            replies,
            streams,
            expected,
            attaching,
            connected,
            sequence: 1,
        })
    }

    pub fn rpc(&mut self, method: &str, params: Value) -> Result<Value, Error> {
        self.sequence = self
            .sequence
            .checked_add(1)
            .ok_or_else(|| Error::Rejected {
                kind: "exhausted".into(),
                message: "Core request identity exhausted".into(),
            })?;
        let id = self.sequence;
        let bytes =
            serde_json::to_vec(&json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}))
                .map_err(|e| Error::Rejected {
                kind: "invalid".into(),
                message: e.to_string(),
            })?;
        if bytes.len() > 1024 * 1024 {
            return Err(Error::Rejected {
                kind: "too_large".into(),
                message: "Core request exceeds 1 MiB".into(),
            });
        }
        while self.replies.try_recv().is_ok() {}
        self.expected.store(id, Ordering::Release);
        if method == "terminal.attach" {
            self.attaching.store(id, Ordering::Release);
        }
        if self
            .control
            .try_send(Frame {
                channel: 0,
                kind: 0,
                payload: bytes,
            })
            .is_err()
        {
            self.expected.store(0, Ordering::Release);
            self.attaching.store(0, Ordering::Release);
            return Err(Error::Rejected {
                kind: "busy".into(),
                message: "Core control queue unavailable; request was not queued".into(),
            });
        }
        let response = self
            .replies
            .recv_timeout(Duration::from_secs(20))
            .map_err(|_| {
                Error::Uncertain("Core result unconfirmed; no request was repeated".into())
            });
        self.expected.store(0, Ordering::Release);
        self.attaching.store(0, Ordering::Release);
        let response = response?;
        if response.get("id").and_then(Value::as_u64) != Some(id) {
            return Err(Error::Uncertain(
                "Core returned a mismatched reply; no request was repeated".into(),
            ));
        }
        if let Some(error) = response.get("error") {
            return Err(Error::Rejected {
                kind: error
                    .pointer("/data/kind")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .into(),
                message: error
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("Core refused the request")
                    .into(),
            });
        }
        response
            .get("result")
            .cloned()
            .ok_or_else(|| Error::Uncertain("Core reply has no result".into()))
    }

    pub fn viewer(&self, channel: u32) -> Result<Viewer, Error> {
        if !self
            .streams
            .lock()
            .map_err(|e| Error::Uncertain(e.to_string()))?
            .buffers
            .contains_key(&channel)
        {
            return Err(Error::Uncertain("Attached channel is unavailable".into()));
        }
        Ok(Viewer {
            channel,
            streams: self.streams.clone(),
            input: self.input.clone(),
            control: self.control.clone(),
            connected: self.connected.clone(),
        })
    }

    pub fn close(mut self) -> Result<(), Error> {
        self.connected.store(false, Ordering::Release);
        if self.child.try_wait()?.is_none() {
            self.child.kill()?;
        }
        self.child.wait()?;
        Ok(())
    }
}

impl Drop for Core {
    fn drop(&mut self) {
        self.connected.store(false, Ordering::Release);
        match self.child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => {
                if let Err(error) = self.child.kill() {
                    eprintln!("Core bridge shutdown failed: {error}");
                }
            }
            Err(error) => eprintln!("Core bridge status failed: {error}"),
        }
        if let Err(error) = self.child.wait() {
            eprintln!("Core bridge wait failed: {error}");
        }
    }
}

#[cfg(test)]
mod resize_tests {
    use super::{Streams, Viewer};
    use std::sync::{Arc, Mutex, atomic::AtomicBool, mpsc};

    #[test]
    fn viewer_queues_core_size_and_display_facts_on_its_channel() {
        let (control, received) = mpsc::sync_channel(2);
        let (input, _) = mpsc::sync_channel(1);
        let viewer = Viewer {
            channel: 7,
            streams: Arc::new(Mutex::new(Streams::default())),
            input,
            control,
            connected: Arc::new(AtomicBool::new(true)),
        };
        viewer.resize(120, 38).unwrap();
        viewer
            .display(9, 18, "#eeeeee".into(), "#111111".into(), None)
            .unwrap();
        let size = received.recv().unwrap();
        assert_eq!(
            (size.channel, size.kind, size.payload),
            (7, 3, vec![120, 0, 38, 0])
        );
        let facts = received.recv().unwrap();
        assert_eq!((facts.channel, facts.kind), (7, 5));
        let data: serde_json::Value = serde_json::from_slice(&facts.payload).unwrap();
        assert_eq!(data["cell"], serde_json::json!([9, 18]));
        assert_eq!(data["fg"], "#eeeeee");
    }
}
