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
        Arc, Mutex, OnceLock,
        mpsc::{self, SyncSender},
    },
    thread,
    time::{Duration, Instant},
};

#[path = "core_pending.rs"]
mod pending;
pub(crate) use pending::Pending;
#[path = "core_reader.rs"]
mod reader;
#[path = "core_viewer.rs"]
mod viewer;
use pending::Replies;
use reader::{Attaches, Reader};
use viewer::Lease;
pub use viewer::{Viewer, WeakViewer};

#[derive(Deserialize)]
struct TerminalList {
    terminals: Vec<Terminal>,
}

const VIEW_LIMIT: usize = 1024 * 1024;
const TOTAL_LIMIT: usize = 16 * 1024 * 1024;
const VIEWER_LIMIT: usize = 64;
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

impl Stream {
    fn occupied(&self) -> bool {
        !self.closed || !self.bytes.is_empty()
    }
}

#[derive(Default)]
struct Streams {
    buffers: HashMap<u32, Stream>,
    total: usize,
}

impl Streams {
    fn occupied(&self) -> usize {
        self.buffers
            .values()
            .filter(|stream| stream.occupied())
            .count()
    }
}

fn lost(link: &OnceLock<String>, reason: String) {
    let report = format!("Core bridge disconnected: {reason}");
    if link.set(reason).is_ok() {
        eprintln!("{report}");
    }
}

fn disconnected(reason: &str, unsent: &str) -> Error {
    Error::Rejected {
        kind: "disconnected".into(),
        message: format!("Core connection ended ({reason}); {unsent}"),
    }
}

fn enqueue(
    link: &OnceLock<String>,
    queue: &SyncSender<Frame>,
    frame: Frame,
    unsent: &str,
) -> Result<(), Error> {
    if let Some(reason) = link.get() {
        return Err(disconnected(reason, unsent));
    }
    queue.try_send(frame).map_err(|_| match link.get() {
        Some(reason) => disconnected(reason, unsent),
        None => Error::Rejected {
            kind: "busy".into(),
            message: format!("Core output queue is full; {unsent}"),
        },
    })
}

pub struct Core {
    child: Child,
    identity: String,
    control: SyncSender<Frame>,
    input: SyncSender<Frame>,
    replies: Replies,
    streams: Arc<Mutex<Streams>>,
    attaches: Attaches,
    link: Arc<OnceLock<String>>,
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
        let attaches = Attaches::default();
        let link: Arc<OnceLock<String>> = Arc::default();
        let writer_link = link.clone();
        let writer_streams = streams.clone();
        let writer_activity = activity.clone();
        let writer_replies = replies.clone();
        thread::spawn(move || {
            let reason = loop {
                if let Some(reason) = writer_link.get() {
                    break reason.clone();
                }
                let frame = match controls.try_recv() {
                    Ok(frame) => frame,
                    Err(_) => match inputs.recv_timeout(Duration::from_millis(5)) {
                        Ok(frame) => frame,
                        Err(mpsc::RecvTimeoutError::Timeout) => continue,
                        Err(_) => break "Core input queue closed".into(),
                    },
                };
                if let Err(error) = Self::write_frame(&frame, &mut input) {
                    break format!("write failed: {:?}", error.kind());
                }
                if let Ok(frame) = inputs.try_recv()
                    && let Err(error) = Self::write_frame(&frame, &mut input)
                {
                    break format!("write failed: {:?}", error.kind());
                }
            };
            lost(&writer_link, reason);
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
        let reader = Reader {
            streams: streams.clone(),
            replies: replies.clone(),
            attaches: attaches.clone(),
            activity: activity.clone(),
            control: control.clone(),
        };
        let reader_link = link.clone();
        thread::spawn(move || {
            let reason = loop {
                if let Some(reason) = reader_link.get() {
                    break reason.clone();
                }
                let frame = match Frame::read_from(&mut output) {
                    Ok(frame) => frame,
                    Err(error) => break format!("read failed: {:?}", error.kind()),
                };
                if let Err(reason) = reader.receive(frame) {
                    break reason;
                }
            };
            lost(&reader_link, reason);
            reader.fail();
        });
        Ok(Self {
            child,
            identity,
            control,
            input: data,
            replies,
            streams,
            attaches,
            link,
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
        if !self.activity_supported || self.link.get().is_some() {
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
        if self
            .streams
            .lock()
            .map_err(|error| Error::Uncertain(error.to_string()))?
            .occupied()
            >= VIEWER_LIMIT
        {
            return Err(Error::Rejected {
                kind: "viewer_limit".into(),
                message: format!(
                    "{VIEWER_LIMIT} terminal viewers are attached; no attachment was sent"
                ),
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
        let _ = self.link.set("Voyager stopped the Core session".into());
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
        let pending = Pending::register(id, method, &self.replies, &self.link)?;
        let attach = method == "terminal.attach";
        if attach {
            self.attaches
                .lock()
                .map_err(|error| Error::Uncertain(error.to_string()))?
                .insert(id);
        }
        let queued = enqueue(
            &self.link,
            &self.control,
            Frame {
                channel: 0,
                kind: 0,
                payload: bytes,
            },
            "request was not queued",
        );
        if attach
            && queued.is_err()
            && let Ok(mut attaches) = self.attaches.lock()
        {
            attaches.remove(&id);
        }
        queued?;
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
            lease: Arc::new(Lease {
                channel,
                streams: self.streams.clone(),
                control: self.control.clone(),
                link: self.link.clone(),
            }),
            initial_size,
            input: self.input.clone(),
            input_open: self.input_open.clone(),
        })
    }

    pub fn close(mut self) -> Result<(), Error> {
        let _ = self.link.set("Voyager closed the Core connection".into());
        if self.child.try_wait()?.is_none() {
            self.child.kill()?;
        }
        self.child.wait()?;
        Ok(())
    }
}

impl Drop for Core {
    fn drop(&mut self) {
        let _ = self.link.set("Voyager closed the Core connection".into());
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
#[path = "core_adapter_tests.rs"]
mod adapter_tests;

#[cfg(test)]
#[path = "core_slot_tests.rs"]
mod slot_tests;

#[cfg(test)]
mod resize_tests {
    use super::{Lease, Streams, Viewer};
    use std::sync::{Arc, Mutex, mpsc};

    #[test]
    fn viewer_queues_core_size_and_display_facts_on_its_channel() {
        let (control, received) = mpsc::sync_channel(2);
        let (input, _) = mpsc::sync_channel(1);
        let viewer = Viewer {
            lease: Arc::new(Lease {
                channel: 7,
                streams: Arc::new(Mutex::new(Streams::default())),
                control,
                link: Arc::default(),
            }),
            initial_size: (80, 24),
            input,
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
