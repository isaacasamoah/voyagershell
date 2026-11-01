use crate::{
    client::Client as Workspace,
    codex::Codex,
    conversation::{fail, notification},
};
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    fs,
    path::PathBuf,
    sync::{
        Arc, Condvar, Mutex,
        atomic::{AtomicU64, Ordering},
        mpsc::{self, SyncSender},
    },
    thread,
    time::{Duration, Instant},
};
use voyager_contract::conversation::{
    Action, Delivery, Message, Phase, Reply, Request, Role, Snapshot,
};
use voyager_contract::{Action as WorkspaceAction, Request as WorkspaceRequest, Status};

struct Projection {
    value: Mutex<Snapshot>,
    changed: Condvar,
}

impl Projection {
    fn edit(&self, edit: impl FnOnce(&mut Snapshot) -> bool) -> Result<(), String> {
        let mut state = self
            .value
            .lock()
            .map_err(|_| "Conversation state unavailable")?;
        if edit(&mut state) {
            state.version = state.version.saturating_add(1);
            self.changed.notify_all();
        }
        Ok(())
    }

    fn read<T>(&self, read: impl FnOnce(&Snapshot) -> T) -> Result<T, String> {
        let state = self
            .value
            .lock()
            .map_err(|_| "Conversation state unavailable")?;
        Ok(read(&state))
    }
}

struct Call {
    request: Request,
    reply: SyncSender<Reply>,
}

#[derive(Clone)]
pub struct Client {
    sender: SyncSender<Call>,
    projection: Arc<Projection>,
    sequence: Arc<AtomicU64>,
}

impl Client {
    pub fn open(profile: PathBuf, workspace: Workspace) -> Self {
        let (sender, commands) = mpsc::sync_channel::<Call>(8);
        let projection = Arc::new(Projection {
            value: Mutex::new(Snapshot::default()),
            changed: Condvar::new(),
        });
        let sequence = Arc::new(AtomicU64::new(0));
        let shared = projection.clone();
        let issued = sequence.clone();
        thread::spawn(move || {
            let (events, incoming) = mpsc::sync_channel(32);
            let mut owner = Owner {
                projection: shared,
                provider: None,
                disconnected: false,
                started: false,
                pending: None,
                sequence: 0,
                effort: "high".into(),
                active: String::new(),
                interrupt: false,
                deferred: VecDeque::new(),
                profile,
                workspace,
                receipts: VecDeque::new(),
                seen: None,
            };
            loop {
                match commands.try_recv() {
                    Ok(call) => {
                        let reply = owner.call(&call.request, &issued, &events);
                        let _ = call.reply.send(reply);
                    }
                    Err(mpsc::TryRecvError::Disconnected) => break,
                    Err(mpsc::TryRecvError::Empty) => (),
                }
                match incoming.recv_timeout(Duration::from_millis(10)) {
                    Ok(Ok(value)) => {
                        if let Err(error) = owner.event(value) {
                            owner.fail(error, Phase::Unconfirmed);
                        }
                    }
                    Ok(Err(error)) => {
                        owner.disconnected = true;
                        owner.pending = None;
                        owner.fail(error, Phase::Unconfirmed);
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => (),
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
                if owner
                    .pending
                    .as_ref()
                    .is_some_and(|pending| pending.deadline < Instant::now())
                {
                    owner.pending = None;
                    owner.fail(
                        "Provider acknowledgement unconfirmed; nothing was resubmitted".into(),
                        Phase::Unconfirmed,
                    );
                }
            }
            if let Some(provider) = owner.provider.take()
                && let Err(error) = provider.close()
            {
                eprintln!("Private provider cleanup: {error}");
            }
        });
        Self {
            sender,
            projection,
            sequence,
        }
    }

    pub fn request_id(&self) -> String {
        format!(
            "conversation-{}",
            self.sequence.fetch_add(1, Ordering::Relaxed)
        )
    }

    pub fn call(&self, request: Request) -> Result<Reply, String> {
        let (reply, result) = mpsc::sync_channel(1);
        self.sender
            .try_send(Call { request, reply })
            .map_err(|_| "Conversation busy or unavailable; nothing was queued")?;
        result
            .recv_timeout(Duration::from_secs(25))
            .map_err(|_| "Conversation result unconfirmed; do not repeat this request".into())
    }

    pub fn snapshot(&self, after: Option<u64>) -> Result<Option<Snapshot>, String> {
        let state = self
            .projection
            .value
            .lock()
            .map_err(|_| "Conversation state unavailable")?;
        let state = if after == Some(state.version) {
            self.projection
                .changed
                .wait_timeout_while(state, Duration::from_secs(20), |state| {
                    after == Some(state.version)
                })
                .map_err(|_| "Conversation state unavailable")?
                .0
        } else {
            state
        };
        Ok((after != Some(state.version)).then(|| state.clone()))
    }
}

struct Pending {
    id: u64,
    method: &'static str,
    deadline: Instant,
}

struct Owner {
    projection: Arc<Projection>,
    provider: Option<Codex>,
    disconnected: bool,
    started: bool,
    pending: Option<Pending>,
    sequence: u64,
    effort: String,
    active: String,
    interrupt: bool,
    deferred: VecDeque<Value>,
    profile: PathBuf,
    workspace: Workspace,
    receipts: VecDeque<(Request, Reply)>,
    seen: Option<u64>,
}

impl Owner {
    fn fail(&self, error: String, phase: Phase) {
        let _ = self.projection.edit(|state| fail(state, error, phase));
    }

    fn rpc(&mut self, method: &'static str, params: Value) -> Result<(), String> {
        self.sequence = self
            .sequence
            .checked_add(1)
            .ok_or("Provider identity exhausted")?;
        self.pending = Some(Pending {
            id: self.sequence,
            method,
            deadline: Instant::now() + Duration::from_secs(25),
        });
        self.provider
            .as_mut()
            .ok_or("Private provider unavailable")?
            .request(self.sequence, method, params)
    }

    fn call(
        &mut self,
        request: &Request,
        issued: &AtomicU64,
        events: &SyncSender<Result<Value, String>>,
    ) -> Reply {
        if let Some((previous, reply)) = self
            .receipts
            .iter()
            .find(|(p, _)| p.request_id == request.request_id)
        {
            return if previous == request {
                reply.clone()
            } else {
                Reply {
                    request_id: request.request_id.clone(),
                    delivery: Delivery::Rejected,
                    error: Some("Changed request identity; nothing was repeated".into()),
                }
            };
        }
        let previous_sequence = self.sequence;
        let result = request
            .request_id
            .strip_prefix("conversation-")
            .and_then(|id| id.parse::<u64>().ok())
            .filter(|id| {
                *id < issued.load(Ordering::Relaxed) && self.seen.is_none_or(|seen| *id > seen)
            })
            .ok_or_else(|| {
                "Expired or unissued conversation request; nothing was repeated".to_owned()
            })
            .and_then(|id| {
                self.seen = Some(id);
                self.apply(request, events)
            });
        let delivery = if result.is_ok() {
            Delivery::Accepted
        } else if self.sequence != previous_sequence {
            self.fail(
                result.as_ref().err().cloned().unwrap_or_default(),
                Phase::Unconfirmed,
            );
            Delivery::Unconfirmed
        } else {
            Delivery::Rejected
        };
        let reply = Reply {
            request_id: request.request_id.clone(),
            delivery,
            error: result.err(),
        };
        self.receipts.push_back((request.clone(), reply.clone()));
        if self.receipts.len() > 32 {
            self.receipts.pop_front();
        }
        reply
    }

    fn apply(
        &mut self,
        request: &Request,
        events: &SyncSender<Result<Value, String>>,
    ) -> Result<(), String> {
        if self.disconnected {
            return Err(
                "The private provider disconnected; nothing was restarted or resubmitted".into(),
            );
        }
        if matches!(request.action, Action::Interrupt) {
            if !self
                .projection
                .read(|s| matches!(s.phase, Phase::Starting | Phase::Working))?
            {
                return Err("Voyager has no active turn to interrupt".into());
            }
            self.interrupt = true;
            if self.pending.is_none() {
                self.interrupt_turn()?;
            }
            return Ok(());
        }
        let Action::Send { text } = &request.action else {
            return Err("Unsupported conversation action".into());
        };
        if text.trim().is_empty() || text.len() > 8192 {
            return Err("Use a message between 1 and 8192 bytes".into());
        }
        if self.projection.read(|s| {
            matches!(
                s.phase,
                Phase::Starting | Phase::Working | Phase::Unconfirmed
            )
        })? {
            return Err("Voyager is still handling the previous request".into());
        }
        if self.started && self.projection.read(|s| s.thread.is_none())? {
            return Err(
                "Private connection unavailable; nothing was restarted or resubmitted".into(),
            );
        }
        let workspace = self.workspace.call(WorkspaceRequest {
            request_id: self.workspace.request_id(),
            expected_version: 0,
            action: WorkspaceAction::Inspect,
        })?;
        if workspace.status != Status::Applied || !workspace.fresh {
            return Err("Inspect the workspace before starting this conversation".into());
        }
        let context = workspace.layout.context.clone();
        self.active = request.request_id.clone();
        self.interrupt = false;
        self.deferred.clear();
        self.projection.edit(|state| {
            while state.messages.len() >= 64
                || state.messages.iter().map(|m| m.text.len()).sum::<usize>() > 192 * 1024
            {
                state.messages.remove(0);
                state.omitted = state.omitted.saturating_add(1);
            }
            state.messages.push(Message {
                id: request.request_id.clone(),
                request_id: request.request_id.clone(),
                role: Role::User,
                text: text.clone(),
                context: Some(context),
            });
            state.phase = Phase::Starting;
            state.turn = None;
            state.error = None;
            state.limited = false;
            true
        })?;
        if !self.started {
            self.started = true;
            let cwd = self.profile.join("conversation");
            let result = fs::create_dir_all(&cwd)
                .map_err(|e| e.to_string())
                .and_then(|()| Codex::open(&cwd, events.clone()));
            match result {
                Ok(provider) => self.provider = Some(provider),
                Err(error) => {
                    self.fail(error, Phase::Failed);
                    return Ok(());
                }
            }
            self.rpc("initialize", json!({"clientInfo":{"name":"voyager_native","version":"0.1.0"},"capabilities":{"experimentalApi":true}}))
        } else {
            self.start_turn()
        }
    }

    fn start_turn(&mut self) -> Result<(), String> {
        let (thread, message, context) = self.projection.read(|state| {
            (
                state.thread.clone(),
                state.messages.last().map(|m| m.text.clone()),
                state.messages.last().and_then(|m| m.context.clone()),
            )
        })?;
        self.projection.edit(|state| {
            state.phase = Phase::Working;
            true
        })?;
        self.rpc("turn/start", json!({"threadId":thread.ok_or("Missing private thread identity")?, "input":[{"type":"text","text":message.ok_or("Missing accepted user message")?}],"effort":self.effort,"additionalContext":{"voyager.focus":{"kind":"application","value":serde_json::to_string(&context).map_err(|e|e.to_string())?}}}))
    }

    fn interrupt_turn(&mut self) -> Result<(), String> {
        let (thread, turn) = self
            .projection
            .read(|state| (state.thread.clone(), state.turn.clone()))?;
        if let (Some(thread), Some(turn)) = (thread, turn) {
            self.rpc("turn/interrupt", json!({"threadId":thread,"turnId":turn}))?;
            self.interrupt = false;
        }
        Ok(())
    }

    fn event(&mut self, value: Value) -> Result<(), String> {
        if value.get("id").is_some() && value.get("method").is_some() {
            return self.provider.as_mut().ok_or("Private provider unavailable")?.write(json!({"id":value["id"],"error":{"code":-32601,"message":"This conversation supports private text only; application tools are not installed yet"}}));
        }
        if let Some(id) = value.get("id").and_then(Value::as_u64) {
            if self.pending.as_ref().is_none_or(|p| p.id != id) {
                return Ok(());
            }
            let pending = self
                .pending
                .take()
                .ok_or("Missing provider request identity")?;
            if let Some(error) = value.pointer("/error/message").and_then(Value::as_str) {
                self.fail(error.into(), Phase::Failed);
                return Ok(());
            }
            let result = value
                .get("result")
                .ok_or("Provider response missing its result")?;
            match pending.method {
                "initialize" => {
                    self.provider
                        .as_mut()
                        .ok_or("Private provider unavailable")?
                        .write(json!({"method":"initialized"}))?;
                    let config_path = self.profile.join("conversation.json");
                    let config: Value = match fs::read(&config_path) {
                        Ok(bytes) => serde_json::from_slice(&bytes)
                            .map_err(|e| format!("Invalid conversation settings: {e}"))?,
                        Err(e) if e.kind() == std::io::ErrorKind::NotFound => json!({}),
                        Err(e) => return Err(e.to_string()),
                    };
                    let model = config
                        .get("model")
                        .and_then(Value::as_str)
                        .unwrap_or("gpt-6.1-sol");
                    if config.get("model").is_some_and(|v| !v.is_string())
                        || config.get("effort").is_some_and(|v| !v.is_string())
                        || !config.is_object()
                        || config.as_object().is_some_and(|object| {
                            object.keys().any(|key| key != "model" && key != "effort")
                        })
                        || model.trim().is_empty()
                        || model.len() > 128
                    {
                        return Err("Conversation settings require model and effort strings".into());
                    }
                    self.effort = config
                        .get("effort")
                        .and_then(Value::as_str)
                        .unwrap_or("high")
                        .to_owned();
                    if self.effort.is_empty() || self.effort.len() > 32 {
                        return Err("Invalid reasoning effort".into());
                    }
                    self.rpc("thread/start", json!({"model":model,"allowProviderModelFallback":false,"ephemeral":true,"cwd":self.profile.join("conversation"),"approvalPolicy":"never","sandbox":"read-only","config":{"model_reasoning_effort":self.effort},"baseInstructions":"You are Voyager, the human's concise private workspace administrator. Each request carries an explicit avatar context. Keyboard navigation does not change that context. Reply briefly and accurately. This first native text checkpoint has no application tools. Explain that limitation when asked to perform an action. Never claim an effect occurred. Do not execute shell commands, edit files, invoke MCP tools, create agents or change projects. Working Vessels perform project work. No native session restoration or automatic replay is permitted."}))
                }
                "thread/start" => {
                    let thread = result
                        .pointer("/thread/id")
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                        .ok_or("Provider did not return a private thread identity")?
                        .to_owned();
                    let model = result
                        .get("model")
                        .and_then(Value::as_str)
                        .map(str::to_owned);
                    self.projection.edit(|state| {
                        state.thread = Some(thread);
                        state.model = model;
                        true
                    })?;
                    self.start_turn()
                }
                "turn/start" => {
                    let turn = result
                        .pointer("/turn/id")
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                        .ok_or("Provider did not return its accepted turn identity")?
                        .to_owned();
                    self.projection.edit(|state| {
                        state.turn = Some(turn);
                        true
                    })?;
                    while let Some(value) = self.deferred.pop_front() {
                        self.reduce(value)?;
                    }
                    if self.interrupt {
                        self.interrupt_turn()?;
                    }
                    Ok(())
                }
                _ => Ok(()),
            }
        } else if self
            .pending
            .as_ref()
            .is_some_and(|p| p.method == "turn/start")
        {
            if self.deferred.len() >= 16 {
                return Err("Provider exceeded the pre-acknowledgement event bound".into());
            }
            self.deferred.push_back(value);
            Ok(())
        } else {
            self.reduce(value)
        }
    }

    fn reduce(&self, value: Value) -> Result<(), String> {
        self.projection
            .edit(|state| notification(state, &value, &self.active))
    }
}
