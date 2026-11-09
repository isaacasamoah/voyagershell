use crate::{
    activity::Activity,
    core_shapes::{
        AttachParams, AttachResult, DocGetParams, DocGetResult, DocSetParams, DocSetResult,
        GetParams, HelloParams, HelloResult, InterruptParams, InterruptResult, KillParams,
        ListParams, ReadParams, ReadResult, RunParams, SendParams, SendResult, StatusParams,
        StatusResult, StopParams, StopResult, SubscribeParams, SubscribeResult, Terminal,
    },
    wire::Frame,
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, VecDeque},
    env,
    io::{BufRead, BufReader, Read, Write},
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, SyncSender},
    },
    thread,
    time::{Duration, Instant},
};

#[path = "core_pending.rs"]
mod pending;
pub(crate) use pending::Pending;
use pending::Replies;

#[derive(Deserialize)]
struct TerminalList {
    terminals: Vec<Terminal>,
}

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
    initial_size: (u16, u16),
    streams: Arc<Mutex<Streams>>,
    input: SyncSender<Frame>,
    control: SyncSender<Frame>,
    connected: Arc<AtomicBool>,
    input_open: Arc<Mutex<bool>>,
}

impl Viewer {
    pub fn initial_size(&self) -> (u16, u16) {
        self.initial_size
    }

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
        let open = self
            .input_open
            .lock()
            .map_err(|error| Error::Uncertain(error.to_string()))?;
        if !*open {
            return Err(Error::Rejected {
                kind: "quitting".into(),
                message: "Voyager is quitting; no terminal input was queued".into(),
            });
        }
        self.input_frame(bytes)
    }

    pub fn protocol_reply(&self, bytes: Vec<u8>) -> Result<(), Error> {
        self.input_frame(bytes)
    }

    fn input_frame(&self, bytes: Vec<u8>) -> Result<(), Error> {
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
    identity: String,
    control: SyncSender<Frame>,
    input: SyncSender<Frame>,
    replies: Replies,
    streams: Arc<Mutex<Streams>>,
    attaching: Arc<AtomicU64>,
    connected: Arc<AtomicBool>,
    input_open: Arc<Mutex<bool>>,
    sequence: u64,
    activity: Arc<Mutex<Activity>>,
    activity_supported: bool,
}

impl Core {
    fn write_frame(frame: &Frame, input: &mut impl Write) -> std::io::Result<()> {
        let terminal = frame.channel != 0 && frame.kind == 0;
        if terminal {
            crate::typing_trace::transport(
                "input_write_started",
                frame.channel,
                frame.payload.len(),
            );
        }
        let result = frame.write_to(input).and_then(|()| input.flush());
        if terminal {
            crate::typing_trace::transport(
                if result.is_ok() {
                    "input_write_finished"
                } else {
                    "input_write_failed"
                },
                frame.channel,
                frame.payload.len(),
            );
        }
        result
    }

    pub fn connect(session: &str) -> Result<Self, Error> {
        Self::connect_activity(session, Arc::default())
    }

    pub(crate) fn connect_activity(
        session: &str,
        activity: Arc<Mutex<Activity>>,
    ) -> Result<Self, Error> {
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
            .env("HC_SOCKET", crate::core_endpoint::endpoint(session))
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
        let handshake = (|| -> Result<(String, bool), Error> {
            let params = Self::hello_params();
            let mut hello = serde_json::to_vec(
                &json!({"jsonrpc":"2.0","id":1,"method":"hello","params":params}),
            )
            .map_err(|e| Error::Rejected {
                kind: "invalid".into(),
                message: e.to_string(),
            })?;
            hello.push(b'\n');
            input.write_all(&hello)?;
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
            let supported = result
                .pointer("/result/methods")
                .and_then(Value::as_array)
                .is_some_and(|methods| {
                    methods
                        .iter()
                        .any(|method| method.as_str() == Some("events.subscribe"))
                });
            Self::validate_hello(result).map(|identity| (identity, supported))
        })();
        let (identity, activity_supported) = match handshake {
            Ok(identity) => identity,
            Err(error) => {
                if let Err(cleanup) = child.kill() {
                    eprintln!("Core bridge startup cleanup failed: {cleanup}");
                }
                if let Err(cleanup) = child.wait() {
                    eprintln!("Core bridge startup wait failed: {cleanup}");
                }
                return Err(error);
            }
        };
        let (control, controls) = mpsc::sync_channel::<Frame>(64);
        let (data, inputs) = mpsc::sync_channel::<Frame>(64);
        let replies = Replies::default();
        let streams = Arc::new(Mutex::new(Streams::default()));
        let attaching = Arc::new(AtomicU64::new(0));
        let connected = Arc::new(AtomicBool::new(true));
        let writer_alive = connected.clone();
        let writer_streams = streams.clone();
        let writer_activity = activity.clone();
        let writer_replies = replies.clone();
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
                if Self::write_frame(&frame, &mut input).is_err() {
                    break;
                }
                if let Ok(frame) = inputs.try_recv()
                    && Self::write_frame(&frame, &mut input).is_err()
                {
                    break;
                }
            }
            writer_alive.store(false, Ordering::Release);
            if let Ok(mut replies) = writer_replies.lock() {
                replies.clear();
            }
            if let Ok(mut activity) = writer_activity.lock() {
                activity.fail("Core is disconnected");
            }
            if let Ok(streams) = writer_streams.lock() {
                for stream in streams.buffers.values() {
                    let _ = stream.wake.try_send(());
                }
            }
        });
        let reader_streams = streams.clone();
        let reader_replies = replies.clone();
        let reader_attaching = attaching.clone();
        let reader_alive = connected.clone();
        let reader_activity = activity.clone();
        let reader_control = control.clone();
        thread::spawn(move || {
            while reader_alive.load(Ordering::Acquire) {
                let Ok(frame) = Frame::read_from(&mut output) else {
                    break;
                };
                let terminal_channel = reader_streams
                    .lock()
                    .is_ok_and(|streams| streams.buffers.contains_key(&frame.channel));
                if !terminal_channel
                    && Self::activity_frame(&reader_activity, &reader_control, &frame)
                {
                    continue;
                }
                if frame.channel == 0 && frame.kind == 0 {
                    let Ok(message) = serde_json::from_slice::<Value>(&frame.payload) else {
                        break;
                    };
                    let Some(id) = message.get("id").and_then(Value::as_u64) else {
                        continue;
                    };
                    let Ok(mut replies) = reader_replies.lock() else {
                        break;
                    };
                    let Some(reply) = replies.remove(&id) else {
                        continue;
                    };
                    if id == reader_attaching.load(Ordering::Acquire)
                        && Self::response(message.clone(), id).is_ok()
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
                    let _ = reply.try_send(message);
                } else if frame.channel != 0 && frame.kind == 0 {
                    if terminal_channel {
                        crate::typing_trace::transport(
                            "output_frame_received",
                            frame.channel,
                            frame.payload.len(),
                        );
                    }
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
            if let Ok(mut replies) = reader_replies.lock() {
                replies.clear();
            }
            if let Ok(mut activity) = reader_activity.lock() {
                activity.fail("Core is disconnected");
            }
            if let Ok(streams) = reader_streams.lock() {
                for stream in streams.buffers.values() {
                    let _ = stream.wake.try_send(());
                }
            }
        });
        Ok(Self {
            child,
            identity,
            control,
            input: data,
            replies,
            streams,
            attaching,
            connected,
            input_open: Arc::new(Mutex::new(true)),
            sequence: 1,
            activity,
            activity_supported,
        })
    }

    fn activity_flow(activity: &Arc<Mutex<Activity>>, control: &SyncSender<Frame>, credit: u32) {
        let (channel, close) = match activity.lock() {
            Ok(mut activity) => (activity.channel, activity.take_close()),
            Err(_) => return,
        };
        if let Some(channel) = close {
            let _ = control.try_send(Frame {
                channel,
                kind: 2,
                payload: Vec::new(),
            });
        }
        if credit != 0
            && let Some(channel) = channel
            && control
                .try_send(Frame {
                    channel,
                    kind: 1,
                    payload: credit.to_le_bytes().to_vec(),
                })
                .is_err()
            && let Ok(mut activity) = activity.lock()
        {
            activity.fail("Activity credit is unavailable");
        }
    }

    fn activity_frame(
        activity: &Arc<Mutex<Activity>>,
        control: &SyncSender<Frame>,
        frame: &Frame,
    ) -> bool {
        let credit = {
            let Ok(mut activity) = activity.lock() else {
                return false;
            };
            if !activity.accepts(frame.channel) {
                return false;
            }
            match frame.kind {
                0 => activity.data(frame.channel, &frame.payload),
                2 => {
                    activity.fail("Activity channel closed");
                    0
                }
                _ => {
                    activity.fail("Invalid activity frame");
                    0
                }
            }
        };
        Self::activity_flow(activity, control, credit);
        true
    }

    pub(crate) fn observe_activity(&mut self, wake: Box<dyn Fn() + Send + Sync>) {
        if let Ok(mut activity) = self.activity.lock() {
            activity.wake_with(wake);
        }
        self.refresh_activity();
    }

    pub(crate) fn refresh_activity(&mut self) {
        if !self.activity_supported || !self.connected.load(Ordering::Acquire) {
            if let Ok(mut activity) = self.activity.lock() {
                activity.fail("Activity subscription is unavailable");
            }
            return;
        }
        if let Ok(mut activity) = self.activity.lock() {
            activity.begin();
        }
        Self::activity_flow(&self.activity, &self.control, 0);
        let result: Result<SubscribeResult, Error> =
            self.call("events.subscribe", SubscribeParams::default());
        let result = result
            .map_err(|error| format!("{error:?}"))
            .and_then(|result| serde_json::to_value(result).map_err(|error| error.to_string()));
        let credit = if let Ok(mut activity) = self.activity.lock() {
            match result.and_then(|result| {
                if result
                    .get("channel")
                    .and_then(Value::as_u64)
                    .is_some_and(|channel| {
                        self.streams
                            .lock()
                            .is_ok_and(|streams| streams.buffers.contains_key(&(channel as u32)))
                    })
                {
                    return Err("Activity channel conflicts with a terminal".into());
                }
                activity.install(result)
            }) {
                Ok(credit) => credit,
                Err(_) => {
                    activity.fail("Activity subscription is unavailable");
                    0
                }
            }
        } else {
            0
        };
        Self::activity_flow(&self.activity, &self.control, credit);
    }

    pub(crate) fn activity_revision(&self) -> u64 {
        self.activity
            .lock()
            .map(|activity| activity.revision)
            .unwrap_or(0)
    }

    pub(crate) fn reported_activity(
        terminal: &Terminal,
    ) -> voyager_contract::activity::ReportedActivity {
        Activity::inspect(serde_json::to_value(terminal).unwrap_or(Value::Null))
    }

    fn hello_params() -> HelloParams {
        HelloParams {
            framed: true,
            generation: Some(1),
            ..Default::default()
        }
    }

    fn call<P: Serialize, R: DeserializeOwned>(
        &mut self,
        method: &'static str,
        params: P,
    ) -> Result<R, Error> {
        let params = serde_json::to_value(params).map_err(|error| Error::Rejected {
            kind: "invalid".into(),
            message: error.to_string(),
        })?;
        Self::decode(method, self.rpc(method, params)?)
    }

    fn decode<R: DeserializeOwned>(method: &str, result: Value) -> Result<R, Error> {
        serde_json::from_value(result)
            .map_err(|error| Error::Uncertain(format!("Invalid Core {method} result: {error}")))
    }

    pub fn document_get(&mut self, name: &str) -> Result<DocGetResult, Error> {
        self.call(
            "doc.get",
            DocGetParams {
                name: name.into(),
                on: None,
            },
        )
    }

    pub fn document_set<T: Serialize + ?Sized>(
        &mut self,
        name: &str,
        value: &T,
        version: u64,
    ) -> Result<DocSetResult, Error> {
        let value = serde_json::to_value(value).map_err(|error| Error::Rejected {
            kind: "invalid".into(),
            message: error.to_string(),
        })?;
        self.call(
            "doc.set",
            DocSetParams {
                name: name.into(),
                on: None,
                value,
                version,
            },
        )
    }

    pub fn terminal_run(&mut self, cwd: &str, operation: &str) -> Result<Terminal, Error> {
        self.terminal_run_with(RunParams {
            cwd: Some(cwd.into()),
            no_parent: true,
            labels: HashMap::from([("voyager-operation".into(), operation.into())]),
            ..Default::default()
        })
    }

    pub fn terminal_run_with(&mut self, params: RunParams) -> Result<Terminal, Error> {
        self.call("terminal.run", params)
    }

    pub fn server_status(&mut self) -> Result<StatusResult, Error> {
        self.call("server.status", StatusParams(Default::default()))
    }

    fn activity_seed_start(&self, terminal: &str) -> u64 {
        self.activity
            .lock()
            .map(|mut activity| {
                activity.track(terminal);
                activity.revision
            })
            .unwrap_or(0)
    }

    fn activity_seed_finish(&self, terminal: &Terminal, before: u64) {
        if let Ok(mut activity) = self.activity.lock()
            && activity
                .seed(
                    serde_json::to_value(terminal).unwrap_or(Value::Null),
                    before,
                )
                .is_err()
        {
            activity.fail("Invalid terminal activity metadata");
        }
    }

    pub fn terminal_attach(&mut self, terminal: &Terminal) -> Result<AttachResult, Error> {
        if terminal.cols == 0 || terminal.rows == 0 {
            return Err(Error::Rejected {
                kind: "invalid_terminal_geometry".into(),
                message: "Terminal dimensions are unavailable; no attachment was sent".into(),
            });
        }
        let before = self.activity_seed_start(&terminal.address);
        let result: AttachResult = self.call(
            "terminal.attach",
            AttachParams {
                caller: None,
                cols: terminal.cols,
                display: Default::default(),
                history: 0,
                observe: false,
                resumed: false,
                rows: terminal.rows,
                terminal: terminal.address.clone(),
            },
        )?;
        if result.terminal.address != terminal.address
            || result.terminal.cols == 0
            || result.terminal.rows == 0
        {
            return Err(Error::Uncertain(
                "Core attachment returned invalid terminal identity or dimensions; nothing was repeated".into(),
            ));
        }
        self.activity_seed_finish(&result.terminal, before);
        Ok(result)
    }

    pub fn terminal_get(&mut self, terminal: &str) -> Result<Terminal, Error> {
        let before = self.activity_seed_start(terminal);
        let result: Terminal = self.call(
            "terminal.get",
            GetParams {
                caller: None,
                terminal: terminal.into(),
            },
        )?;
        if result.address != terminal {
            return Err(Error::Uncertain(
                "Core observation returned a different terminal identity; no action was sent"
                    .into(),
            ));
        }
        self.activity_seed_finish(&result, before);
        Ok(result)
    }

    pub fn terminal_list(&mut self) -> Result<Vec<Terminal>, Error> {
        let result: TerminalList = self.call(
            "terminal.list",
            ListParams {
                all: true,
                ..Default::default()
            },
        )?;
        Ok(result.terminals)
    }

    pub fn terminal_read(&mut self, terminal: &str, lines: u32) -> Result<ReadResult, Error> {
        self.call(
            "terminal.read",
            ReadParams {
                caller: None,
                lines,
                terminal: terminal.into(),
            },
        )
    }

    pub fn terminal_send(&mut self, terminal: &str, text: &str) -> Result<SendResult, Error> {
        self.begin_terminal_send(terminal, text)?.wait()
    }

    pub(crate) fn begin_terminal_send(
        &mut self,
        terminal: &str,
        text: &str,
    ) -> Result<Pending<SendResult>, Error> {
        self.begin(
            "terminal.send",
            SendParams {
                caller: None,
                force: false,
                if_: None,
                terminal: terminal.into(),
                text: text.into(),
                timeout: None,
                wait: false,
            },
        )
    }

    pub fn terminal_interrupt(&mut self, terminal: &str) -> Result<InterruptResult, Error> {
        self.begin_terminal_interrupt(terminal)?.wait()
    }

    pub(crate) fn begin_terminal_interrupt(
        &mut self,
        terminal: &str,
    ) -> Result<Pending<InterruptResult>, Error> {
        self.begin(
            "terminal.interrupt",
            InterruptParams {
                terminal: terminal.into(),
                timeout: Some(5.0),
            },
        )
    }

    pub fn terminal_kill(&mut self, terminal: &str) -> Result<Terminal, Error> {
        self.begin_terminal_kill(terminal)?.wait()
    }

    pub(crate) fn begin_terminal_kill(
        &mut self,
        terminal: &str,
    ) -> Result<Pending<Terminal>, Error> {
        self.begin(
            "terminal.kill",
            KillParams {
                caller: None,
                terminal: terminal.into(),
            },
        )
    }

    pub fn server_stop(&mut self) -> Result<StopResult, Error> {
        self.call("server.stop", StopParams(Default::default()))
    }

    pub(crate) fn quit(&mut self) -> Result<(), Error> {
        *self
            .input_open
            .lock()
            .map_err(|error| Error::Uncertain(error.to_string()))? = false;
        if let Ok(mut activity) = self.activity.lock() {
            activity.fail("Voyager is quitting");
        }
        Self::activity_flow(&self.activity, &self.control, 0);
        let actual = self.server_status()?;
        if actual.core.id != self.identity {
            return Err(Error::Rejected {
                kind: "changed_core".into(),
                message: "The connected Core identity changed; no session was stopped".into(),
            });
        }
        if !self.server_stop()?.stopped {
            return Err(Error::Uncertain(
                "Core did not confirm session shutdown".into(),
            ));
        }
        self.connected.store(false, Ordering::Release);
        if self.child.try_wait()?.is_none() {
            self.child.kill()?;
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if self.child.try_wait()?.is_some() {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err(Error::Uncertain(
                    "Core connector exit is unconfirmed".into(),
                ));
            }
            thread::sleep(Duration::from_millis(10));
        }
    }

    fn rpc(&mut self, method: &'static str, params: Value) -> Result<Value, Error> {
        self.begin(method, params)?.wait()
    }

    fn begin<P: Serialize, R: DeserializeOwned>(
        &mut self,
        method: &'static str,
        params: P,
    ) -> Result<Pending<R>, Error> {
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
                .map_err(|error| Error::Rejected {
                kind: "invalid".into(),
                message: error.to_string(),
            })?;
        if bytes.len() > 1024 * 1024 {
            return Err(Error::Rejected {
                kind: "too_large".into(),
                message: "Core request exceeds 1 MiB".into(),
            });
        }
        let pending =
            Pending::register(id, method, &self.replies, &self.attaching, &self.connected)?;
        if method == "terminal.attach" {
            self.attaching.store(id, Ordering::Release);
        }
        self.control
            .try_send(Frame {
                channel: 0,
                kind: 0,
                payload: bytes,
            })
            .map_err(|_| Error::Rejected {
                kind: "busy".into(),
                message: "Core control queue unavailable; request was not queued".into(),
            })?;
        Ok(pending)
    }

    fn response(response: Value, id: u64) -> Result<Value, Error> {
        let malformed = || {
            Error::Uncertain(
                "Core returned an invalid or ambiguous reply; no request was repeated".into(),
            )
        };
        if response.get("jsonrpc").and_then(Value::as_str) != Some("2.0")
            || response.get("id").and_then(Value::as_u64) != Some(id)
        {
            return Err(malformed());
        }
        match (response.get("result"), response.get("error")) {
            (Some(result), None) => Ok(result.clone()),
            (None, Some(error)) => {
                let Some(code) = error.get("code").and_then(Value::as_i64) else {
                    return Err(malformed());
                };
                let Some(message) = error.get("message").and_then(Value::as_str) else {
                    return Err(malformed());
                };
                let Some(kind) = error
                    .pointer("/data/kind")
                    .and_then(Value::as_str)
                    .filter(|kind| !kind.is_empty())
                else {
                    return Err(malformed());
                };
                if code == -32603
                    || !matches!(
                        kind,
                        "parse_error"
                            | "invalid_request"
                            | "unknown_method"
                            | "invalid_params"
                            | "unsupported_generation"
                            | "conflict"
                            | "not_found"
                            | "machine_unknown"
                            | "unavailable"
                            | "needs_update"
                            | "name_taken"
                            | "spawn_failed"
                            | "invalid_template"
                            | "config"
                            | "finished"
                            | "needs_framed"
                            | "blocked"
                            | "status_mismatch"
                    )
                {
                    return Err(Error::Uncertain(format!(
                        "Core {kind}: {message}; no request was repeated"
                    )));
                }
                Err(Error::Rejected {
                    kind: kind.into(),
                    message: message.into(),
                })
            }
            _ => Err(malformed()),
        }
    }

    const REQUIRED_METHODS: &'static [&'static str] = &[
        "hello",
        "doc.get",
        "doc.set",
        "terminal.get",
        "terminal.run",
        "terminal.attach",
        "terminal.list",
        "terminal.read",
        "terminal.send",
        "terminal.interrupt",
        "terminal.kill",
        "server.status",
        "server.stop",
    ];

    fn validate_hello(response: Value) -> Result<String, Error> {
        let result = Self::response(response, 1)?;
        let hello: HelloResult = Self::decode("hello", result)?;
        if hello.generation != 1
            || !hello.framed
            || hello.core.id.is_empty()
            || !Self::REQUIRED_METHODS
                .iter()
                .all(|required| hello.methods.iter().any(|actual| actual == required))
            || !["framed", "attach", "shell"]
                .iter()
                .all(|required| hello.features.iter().any(|actual| actual == required))
        {
            return Err(Error::Rejected {
                kind: "unsupported_core".into(),
                message: "Core does not provide the required protocol generation and capabilities"
                    .into(),
            });
        }
        Ok(hello.core.id)
    }

    pub fn viewer(&self, attached: &AttachResult) -> Result<Viewer, Error> {
        let channel = attached.channel;
        let initial_size = (attached.terminal.cols, attached.terminal.rows);
        if initial_size.0 == 0 || initial_size.1 == 0 {
            return Err(Error::Uncertain(
                "Attached terminal dimensions are invalid".into(),
            ));
        }
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
            initial_size,
            streams: self.streams.clone(),
            input: self.input.clone(),
            control: self.control.clone(),
            connected: self.connected.clone(),
            input_open: self.input_open.clone(),
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
        if let Ok(mut replies) = self.replies.lock() {
            replies.clear();
        }
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
mod adapter_tests {
    use super::*;

    #[test]
    fn reported_activity_frames_credit_close_and_control_are_separate() {
        let activity = Arc::new(Mutex::new(Activity::default()));
        let (control, receive) = mpsc::sync_channel(4);
        {
            let mut facts = activity.lock().unwrap();
            facts.bind(["t1"]);
            facts.begin();
        }
        let mut payload = serde_json::to_vec(&json!({"jsonrpc":"2.0","method":"event","params":{"seq":1,"type":"status","terminal":"t1","data":{"status":{"state":"working"},"reported":true}}})).unwrap();
        payload.push(b'\n');
        let frame = Frame {
            channel: 7,
            kind: 0,
            payload,
        };
        let mut wire = Vec::new();
        frame.write_to(&mut wire).unwrap();
        let actual = Frame::read_from(&mut wire.as_slice()).unwrap();
        assert!(Core::activity_frame(&activity, &control, &actual));
        assert!(receive.try_recv().is_err());
        let credit = activity
            .lock()
            .unwrap()
            .install(json!({"seq":0,"channel":7,"terminals":[]}))
            .unwrap();
        Core::activity_flow(&activity, &control, credit);
        let returned = receive.try_recv().unwrap();
        assert_eq!((returned.channel, returned.kind), (7, 1));
        assert_eq!(
            returned.payload,
            (actual.payload.len() as u32).to_le_bytes()
        );
        assert_eq!(
            activity.lock().unwrap().get("t1").state,
            voyager_contract::activity::ActivityState::Working
        );
        assert!(!Core::activity_frame(
            &activity,
            &control,
            &Frame {
                channel: 0,
                kind: 0,
                payload: Vec::new()
            }
        ));
        assert!(Core::activity_frame(
            &activity,
            &control,
            &Frame {
                channel: 7,
                kind: 2,
                payload: Vec::new()
            }
        ));
        assert_eq!(receive.try_recv().unwrap().kind, 2);
        assert_eq!(
            activity.lock().unwrap().get("t1").state,
            voyager_contract::activity::ActivityState::Unknown
        );
    }

    #[test]
    fn quit_fences_cloned_viewer_input_without_closing_output_or_control() {
        let (control, requests) = mpsc::sync_channel::<Frame>(2);
        let (input, queued) = mpsc::sync_channel(2);
        let replies = Replies::default();
        let responses = replies.clone();
        let attached: AttachResult = serde_json::from_value(json!({
            "channel": 7,
            "terminal": {
                "address": "t1",
                "argv": [],
                "cwd": "/tmp",
                "cols": 80,
                "rows": 24,
                "state": "live",
                "created_ms": 0,
                "labels": {},
                "screen": "exact"
            }
        }))
        .unwrap();
        let mut wrong_terminal = serde_json::to_value(&attached.terminal).unwrap();
        wrong_terminal["address"] = "wrong".into();
        let mut invalid_attachment = serde_json::to_value(&attached).unwrap();
        invalid_attachment["terminal"]["rows"] = 0.into();
        let worker = thread::spawn(move || {
            for (method, result) in [
                ("terminal.get", wrong_terminal),
                ("terminal.attach", invalid_attachment),
            ] {
                let request = requests.recv().unwrap();
                let value: Value = serde_json::from_slice(&request.payload).unwrap();
                assert_eq!(value["method"], method);
                let id = value["id"].as_u64().unwrap();
                responses
                    .lock()
                    .unwrap()
                    .remove(&id)
                    .unwrap()
                    .send(json!({"jsonrpc":"2.0","id":id,"result":result}))
                    .unwrap();
            }
            let request = requests.recv().unwrap();
            let value: Value = serde_json::from_slice(&request.payload).unwrap();
            assert_eq!(value["method"], "server.status");
            let id = value["id"].as_u64().unwrap();
            responses.lock().unwrap().remove(&id).unwrap().send(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32000,"message":"fixture refusal","data":{"kind":"blocked"}}})).unwrap();
            requests.recv().unwrap()
        });
        let child = Command::new(env::current_exe().unwrap())
            .arg("--list")
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        let mut streams = Streams::default();
        streams.buffers.insert(
            7,
            Stream {
                bytes: VecDeque::from([42]),
                ..Default::default()
            },
        );
        streams.total = 1;
        let mut core = Core {
            child,
            identity: "static-core".into(),
            control,
            input,
            replies,
            streams: Arc::new(Mutex::new(streams)),
            attaching: Arc::default(),
            connected: Arc::new(AtomicBool::new(true)),
            input_open: Arc::new(Mutex::new(true)),
            sequence: 1,
            activity: Arc::default(),
            activity_supported: false,
        };
        assert!(matches!(
            core.terminal_get("expected"),
            Err(Error::Uncertain(_))
        ));
        assert!(matches!(
            core.terminal_attach(&attached.terminal),
            Err(Error::Uncertain(_))
        ));
        let viewer = core.viewer(&attached).unwrap();
        let cloned = viewer.clone();
        viewer.input(b"before".to_vec()).unwrap();
        let activity = core.activity.clone();
        let paused_metadata = activity.lock().unwrap();
        let closing = thread::spawn(move || {
            let result = core.quit();
            (core, result)
        });
        let deadline = Instant::now() + Duration::from_secs(5);
        while *viewer.input_open.lock().unwrap() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(1));
        }
        let gate_closed = !*viewer.input_open.lock().unwrap();
        let refused = cloned.input(b"after".to_vec());
        drop(paused_metadata);
        let (core, quit) = closing.join().unwrap();
        let before = queued.recv().unwrap();
        let empty = queued.try_recv().is_err();
        viewer.protocol_reply(b"reply".to_vec()).unwrap();
        let protocol = queued.recv().unwrap();
        viewer.credit(1).unwrap();
        let output = cloned.take(1).unwrap();
        let close = core.close();
        let credit = worker.join().unwrap();
        assert!(close.is_ok());
        assert!(
            gate_closed,
            "Quit waited for metadata before closing input admission"
        );
        assert!(matches!(quit, Err(Error::Rejected {kind, ..}) if kind == "blocked"));
        assert!(matches!(refused, Err(Error::Rejected {kind, ..}) if kind == "quitting"));
        assert_eq!(before.payload, b"before");
        assert!(empty);
        assert_eq!(
            (protocol.channel, protocol.kind, protocol.payload),
            (7, 0, b"reply".to_vec())
        );
        assert_eq!((credit.channel, credit.kind), (7, 1));
        assert_eq!(output, [42]);
    }

    #[test]
    fn protocol_envelopes_preserve_refusals_and_uncertainty() {
        let valid = json!({"jsonrpc":"2.0","id":2,"result":{"value":null},"extra":true});
        assert_eq!(Core::response(valid, 2).unwrap(), json!({"value":null}));
        let refused = json!({"jsonrpc":"2.0","id":2,"error":{"code":-32000,"message":"stale","data":{"kind":"conflict","hint":"inspect"}}});
        assert!(
            matches!(Core::response(refused, 2), Err(Error::Rejected { kind, .. }) if kind == "conflict")
        );
        let unknown = json!({"jsonrpc":"2.0","id":2,"error":{"code":-32000,"message":"unknown outcome","data":{"kind":"future_error"}}});
        assert!(
            matches!(Core::response(unknown, 2), Err(Error::Uncertain(message)) if message.contains("future_error"))
        );
        for value in [
            json!({"jsonrpc":"2.0","id":2,"error":null}),
            json!({"jsonrpc":"2.0","id":2,"error":{"code":-32000}}),
            json!({"jsonrpc":"2.0","id":2,"result":{},"error":{"code":-32000,"message":"bad","data":{"kind":"conflict"}}}),
            json!({"jsonrpc":"2.0","id":3,"result":{}}),
            json!({"jsonrpc":"1.0","id":2,"result":{}}),
            json!({"jsonrpc":"2.0","id":2}),
        ] {
            assert!(matches!(Core::response(value, 2), Err(Error::Uncertain(_))));
        }
    }

    #[test]
    fn dispatched_request_never_treats_malformed_or_lost_reply_as_refusal() {
        for reply in [
            Some(json!({"jsonrpc":"2.0","id":2,"error":null})),
            Some(
                json!({"jsonrpc":"2.0","id":2,"error":{"code":-32000,"message":"stale","data":{"kind":"conflict"}}}),
            ),
            None,
        ] {
            let expected_refusal = reply
                .as_ref()
                .is_some_and(|value| value.pointer("/error/data/kind") == Some(&json!("conflict")));
            let (control, requests) = mpsc::sync_channel::<Frame>(1);
            let (input, _) = mpsc::sync_channel(1);
            let replies = Replies::default();
            let responses = replies.clone();
            let worker = thread::spawn(move || {
                let frame = requests.recv().unwrap();
                assert_eq!((frame.channel, frame.kind), (0, 0));
                let message: Value = serde_json::from_slice(&frame.payload).unwrap();
                assert_eq!(message["method"], "doc.set");
                let send = responses.lock().unwrap().remove(&2).unwrap();
                if let Some(reply) = reply {
                    send.send(reply).unwrap();
                }
            });
            let child = Command::new(env::current_exe().unwrap())
                .arg("--list")
                .stdout(Stdio::null())
                .spawn()
                .unwrap();
            let mut core = Core {
                child,
                identity: "test-core".into(),
                control,
                input,
                replies,
                streams: Arc::default(),
                attaching: Arc::default(),
                connected: Arc::new(AtomicBool::new(true)),
                input_open: Arc::new(Mutex::new(true)),
                sequence: 1,
                activity: Arc::default(),
                activity_supported: false,
            };
            let result = core.rpc("doc.set", json!({}));
            worker.join().unwrap();
            assert!(if expected_refusal {
                matches!(result, Err(Error::Rejected { .. }))
            } else {
                matches!(result, Err(Error::Uncertain(_)))
            });
        }
    }

    #[test]
    fn hello_requires_consumed_capabilities_not_exact_version_or_extra_fields() {
        let mut hello = json!({"jsonrpc":"2.0","id":1,"result":{"framed":true,"generation":1,"version":"future-compatible","core":{"id":"stable","name":"test"},"methods":Core::REQUIRED_METHODS,"features":["framed","attach","shell","future"],"extra":true}});
        hello["result"]["methods"]
            .as_array_mut()
            .unwrap()
            .push("future.method".into());
        assert_eq!(Core::validate_hello(hello.clone()).unwrap(), "stable");
        hello["result"]["generation"] = 2.into();
        assert!(Core::validate_hello(hello.clone()).is_err());
        hello["result"]["generation"] = 1.into();
        hello["result"]["features"] = json!(["framed"]);
        assert!(Core::validate_hello(hello.clone()).is_err());
        hello["result"]["features"] = json!(["framed", "attach", "shell"]);
        hello["result"]["methods"] = json!(["hello"]);
        assert!(Core::validate_hello(hello).is_err());
    }

    #[test]
    fn typed_hello_keeps_the_existing_handshake() {
        let params = Core::hello_params();
        assert_eq!(
            serde_json::to_value(params).unwrap(),
            json!({"framed":true,"generation":1})
        );
    }

    #[test]
    fn terminal_list_accepts_observed_minimal_result() {
        let result: TerminalList = serde_json::from_value(json!({"terminals":[]})).unwrap();
        assert!(result.terminals.is_empty());
        assert!(serde_json::from_value::<TerminalList>(json!({})).is_err());
        assert!(matches!(
            Core::decode::<Terminal>("terminal.get", json!({})),
            Err(Error::Uncertain(_))
        ));
    }

    #[test]
    fn typed_document_preserves_null_and_nested_values() {
        for value in [Value::Null, json!({"nested": [1, {"name": "Voyage"}]})] {
            let params = DocSetParams {
                name: "voyager-layout-v1".into(),
                on: None,
                value: value.clone(),
                version: 9,
            };
            let encoded = serde_json::to_value(params).unwrap();
            assert_eq!(encoded["value"], value);
            assert_eq!(encoded["version"], 9);
            let result: DocGetResult =
                serde_json::from_value(json!({"value":value,"version":9})).unwrap();
            assert_eq!(result.value, value);
            assert_eq!(result.version, 9);
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
            initial_size: (80, 24),
            streams: Arc::new(Mutex::new(Streams::default())),
            input,
            control,
            connected: Arc::new(AtomicBool::new(true)),
            input_open: Arc::new(Mutex::new(true)),
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

    #[test]
    fn diagnostic_write_preserves_frame_and_flush_failure() {
        struct FailingFlush(Vec<u8>);
        impl std::io::Write for FailingFlush {
            fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
                self.0.extend_from_slice(bytes);
                Ok(bytes.len())
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Err(std::io::Error::other("flush failed"))
            }
        }
        let frame = crate::wire::Frame {
            channel: 7,
            kind: 0,
            payload: vec![120],
        };
        let mut expected = Vec::new();
        frame.write_to(&mut expected).unwrap();
        let mut actual = Vec::new();
        super::Core::write_frame(&frame, &mut actual).unwrap();
        assert_eq!(actual, expected);
        let mut failure = FailingFlush(Vec::new());
        assert!(super::Core::write_frame(&frame, &mut failure).is_err());
        assert_eq!(failure.0, expected);
    }
}
