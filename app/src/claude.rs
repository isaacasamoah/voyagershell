use crate::provider::{
    Answer, Capabilities, Command as ProviderCommand, Event, Operation, Outcome, Support, ToolCall,
    ToolDefinition, ToolReply, Visible,
};
use crate::voice_host::Package;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex, mpsc::SyncSender},
    thread,
    time::{Duration, Instant},
};
use voyager_contract::conversation::Phase;

const FRAME_LIMIT: usize = 2 * crate::content::ENVELOPE_LIMIT + 4096;
const SERVER: &str = "voyager";

#[derive(Default)]
pub(crate) struct Session {
    pending: Option<(u64, Operation)>,
    thread: String,
    model: String,
    turn: String,
    texts: u64,
    interrupted: bool,
    calls: HashMap<String, Value>,
    tools: Vec<Value>,
}

pub(crate) fn translate(value: &Value, session: &mut Session) -> (Option<Event>, Option<Value>) {
    match value["type"].as_str() {
        Some("control_request") => {
            let Some(id) = value["request_id"]
                .as_str()
                .filter(|id| !id.is_empty() && id.len() <= 128)
            else {
                return (None, None);
            };
            let request = &value["request"];
            if request["subtype"].as_str() != Some("mcp_message")
                || request["server_name"].as_str() != Some(SERVER)
            {
                return (
                    None,
                    Some(
                        json!({"type":"control_response","response":{"subtype":"error","request_id":id,"error":"Unsupported request; nothing was dispatched"}}),
                    ),
                );
            }
            let message = &request["message"];
            let answer = |body: Value| {
                Some(
                    json!({"type":"control_response","response":{"subtype":"success","request_id":id,"response":{"mcp_response":body}}}),
                )
            };
            match (message["method"].as_str(), message.get("id").cloned()) {
                (Some("tools/call"), Some(rpc)) => {
                    session.calls.insert(id.to_owned(), rpc);
                    let call = ToolCall {
                        id: Value::String(id.to_owned()),
                        thread: session.thread.clone(),
                        turn: session.turn.clone(),
                        call: id.to_owned(),
                        name: message["params"]["name"]
                            .as_str()
                            .unwrap_or_default()
                            .to_owned(),
                        namespace: None,
                        arguments: message["params"]["arguments"].clone(),
                    };
                    (Some(Event::Tool(Box::new(call))), None)
                }
                (Some("initialize"), Some(rpc)) => (
                    None,
                    answer(
                        json!({"jsonrpc":"2.0","id":rpc,"result":{"protocolVersion":message["params"]["protocolVersion"].as_str().unwrap_or("2025-06-18"),"capabilities":{"tools":{}},"serverInfo":{"name":SERVER,"version":env!("CARGO_PKG_VERSION")}}}),
                    ),
                ),
                (Some("tools/list"), Some(rpc)) => (
                    None,
                    answer(json!({"jsonrpc":"2.0","id":rpc,"result":{"tools":session.tools}})),
                ),
                (_, Some(rpc)) => (
                    None,
                    answer(
                        json!({"jsonrpc":"2.0","id":rpc,"error":{"code":-32601,"message":"Unsupported method"}}),
                    ),
                ),
                (_, None) => (None, answer(json!({"jsonrpc":"2.0","result":{}}))),
            }
        }
        Some("control_response") => {
            let Some((id, operation)) = session.pending else {
                return (None, None);
            };
            if value["response"]["request_id"].as_str() != Some(format!("voyager-{id}").as_str()) {
                return (None, None);
            }
            session.pending = None;
            let outcome = if value["response"]["subtype"].as_str() == Some("success") {
                Outcome::Applied(match operation {
                    Operation::OpenConversation => Answer::Conversation {
                        thread: session.thread.clone(),
                        model: Some(session.model.clone()),
                    },
                    _ => Answer::Acknowledged,
                })
            } else {
                Outcome::Rejected(
                    value["response"]["error"]
                        .as_str()
                        .unwrap_or("Claude refused the request")
                        .to_owned(),
                )
            };
            (Some(Event::Response { id, outcome }), None)
        }
        Some("assistant") => {
            let text = value["message"]["content"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|block| block["type"] == "text")
                .filter_map(|block| block["text"].as_str())
                .collect::<Vec<_>>()
                .join("\n");
            if text.trim().is_empty() {
                return (None, None);
            }
            session.texts += 1;
            let message = Visible::Message {
                thread: session.thread.clone(),
                turn: session.turn.clone(),
                item: format!("{}-text-{}", session.turn, session.texts),
                text,
                complete: true,
            };
            (Some(Event::Visible(message)), None)
        }
        Some("result") => {
            let failed = value["is_error"].as_bool() != Some(false);
            let phase = if session.interrupted {
                Phase::Interrupted
            } else if failed {
                Phase::Failed
            } else {
                Phase::Completed
            };
            session.interrupted = false;
            let completed = Visible::Completed {
                thread: session.thread.clone(),
                turn: session.turn.clone(),
                phase,
                error: failed.then(|| {
                    value["result"]
                        .as_str()
                        .unwrap_or("Claude reported an error")
                        .to_owned()
                }),
            };
            (Some(Event::Visible(completed)), None)
        }
        _ => (None, None),
    }
}

pub(crate) fn reply_frame(reply: &ToolReply, session: &Session) -> Value {
    let (id, mut body) = match reply {
        ToolReply::Result { id, result } => (
            id,
            json!({"result":{"content":[{"type":"text","text":result.text}],"isError":!result.success}}),
        ),
        ToolReply::Error { id, code, message } => {
            (id, json!({"error":{"code":code,"message":message}}))
        }
    };
    let request = id.as_str().unwrap_or_default();
    match session.calls.get(request) {
        Some(rpc) => {
            body["jsonrpc"] = "2.0".into();
            body["id"] = rpc.clone();
            json!({"type":"control_response","response":{"subtype":"success","request_id":request,"response":{"mcp_response":body}}})
        }
        None => {
            json!({"type":"control_response","response":{"subtype":"error","request_id":request,"error":"Unknown tool call; nothing was dispatched"}})
        }
    }
}

fn send(input: &Mutex<ChildStdin>, value: &Value, limit: usize) -> Result<(), String> {
    let mut bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    if bytes.len() > limit {
        return Err("Provider request exceeds its transport byte limit; nothing was sent".into());
    }
    bytes.push(b'\n');
    let mut input = input.lock().map_err(|_| "Claude input unavailable")?;
    input
        .write_all(&bytes)
        .and_then(|()| input.flush())
        .map_err(|error| error.to_string())
}

pub(crate) struct Claude {
    cwd: PathBuf,
    events: SyncSender<Result<Event, String>>,
    child: Option<Child>,
    input: Option<Arc<Mutex<ChildStdin>>>,
    session: Arc<Mutex<Session>>,
    turns: u64,
}

impl Claude {
    pub(crate) fn executable() -> Result<PathBuf, String> {
        crate::provider::executable("VOYAGER_CLAUDE_BIN", "claude", "Claude Code")
    }

    pub(crate) fn open(
        cwd: &Path,
        events: SyncSender<Result<Event, String>>,
    ) -> Result<Self, String> {
        Self::executable()?;
        Ok(Self {
            cwd: cwd.to_owned(),
            events,
            child: None,
            input: None,
            session: Arc::new(Mutex::new(Session::default())),
            turns: 0,
        })
    }

    pub(crate) fn capabilities(voice: voyager_contract::voice::Capability) -> Capabilities {
        let support = if Self::executable().is_ok() {
            Support::Protocol
        } else {
            Support::Unavailable
        };
        Capabilities {
            text: support,
            tools: support,
            interruption: support,
            voice,
        }
    }

    fn session(&self) -> Result<std::sync::MutexGuard<'_, Session>, String> {
        self.session
            .lock()
            .map_err(|_| "Claude session state unavailable".into())
    }

    fn emit(&self, event: Event) -> Result<(), String> {
        self.events
            .try_send(Ok(event))
            .map_err(|_| "Conversation owner unavailable; nothing was resubmitted".into())
    }

    fn write(&self, value: &Value, limit: usize) -> Result<(), String> {
        send(
            self.input.as_ref().ok_or("Claude is not running")?,
            value,
            limit,
        )
    }

    fn control(&self, id: u64, operation: Operation, request: Value) -> Result<(), String> {
        self.session()?.pending = Some((id, operation));
        self.write(
            &json!({"type":"control_request","request_id":format!("voyager-{id}"),"request":request}),
            65536,
        )
    }

    fn start(
        &mut self,
        model: &str,
        effort: &str,
        tools: Vec<ToolDefinition>,
        instructions: &str,
    ) -> Result<(), String> {
        let allowed = tools
            .iter()
            .map(|tool| format!("mcp__{SERVER}__{}", tool.name))
            .collect::<Vec<_>>()
            .join(",");
        let instructions = instructions.replace(
            "Do not invoke MCP tools or native internal subagents.",
            "Voyager's tools reach you through its own MCP server. Use no other tools; this session has no native file tools.",
        );
        let mut command = Command::new(Self::executable()?);
        command
            .args(["-p", "--input-format", "stream-json", "--output-format"])
            .args(["stream-json", "--verbose", "--model", model, "--effort"])
            .args([effort, "--system-prompt", &instructions, "--mcp-config"])
            .arg(json!({"mcpServers":{"voyager":{"type":"sdk","name":SERVER}}}).to_string())
            .args([
                "--strict-mcp-config",
                "--tools",
                "",
                "--allowedTools",
                &allowed,
            ])
            .args(["--setting-sources", "", "--disable-slash-commands"])
            .arg("--no-session-persistence")
            .current_dir(&self.cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        for (key, _) in std::env::vars_os() {
            if key.to_string_lossy().starts_with("CLAUDE") && key != "CLAUDE_CONFIG_DIR" {
                command.env_remove(key);
            }
        }
        let mut child = command
            .spawn()
            .map_err(|error| format!("Starting the private Claude runtime: {error}"))?;
        let input = Arc::new(Mutex::new(
            child.stdin.take().ok_or("Claude input unavailable")?,
        ));
        let output = child.stdout.take().ok_or("Claude output unavailable")?;
        {
            let mut session = self.session()?;
            session.thread = format!("claude-{}", child.id());
            session.model = model.to_owned();
            session.tools = tools
                .into_iter()
                .map(|tool| json!({"name":tool.name,"description":tool.description,"inputSchema":tool.schema}))
                .collect();
        }
        let (session, writer, events) = (self.session.clone(), input.clone(), self.events.clone());
        thread::spawn(move || {
            let mut output = BufReader::new(output);
            loop {
                let mut bytes = Vec::new();
                match output
                    .by_ref()
                    .take(FRAME_LIMIT as u64 + 1)
                    .read_until(b'\n', &mut bytes)
                {
                    Ok(0) | Err(_) => break,
                    Ok(_) if bytes.len() > FRAME_LIMIT => break,
                    Ok(_) => (),
                }
                let Ok(value) = serde_json::from_slice::<Value>(&bytes) else {
                    continue;
                };
                let Ok(mut state) = session.lock() else {
                    break;
                };
                let (event, reply) = translate(&value, &mut state);
                drop(state);
                if let Some(reply) = reply
                    && send(&writer, &reply, 65536).is_err()
                {
                    break;
                }
                if let Some(event) = event
                    && events.send(Ok(event)).is_err()
                {
                    return;
                }
            }
            let _ = events.send(Err(
                "Private Claude disconnected or exceeded the bounded frame size. Nothing was resubmitted.".into(),
            ));
        });
        self.child = Some(child);
        self.input = Some(input);
        Ok(())
    }

    pub(crate) fn request(&mut self, id: u64, command: ProviderCommand) -> Result<(), String> {
        let operation = command.operation();
        match command {
            ProviderCommand::Initialize => self.emit(Event::Response {
                id,
                outcome: Outcome::Applied(Answer::Initialized { version: None }),
            }),
            ProviderCommand::OpenConversation {
                model,
                effort,
                tools,
                instructions,
                ..
            } => {
                self.start(&model, &effort, tools, instructions)?;
                self.control(
                    id,
                    operation,
                    json!({"subtype":"initialize","hooks":null,"sdkMcpServers":[SERVER]}),
                )
            }
            ProviderCommand::StartTurn {
                text,
                focus,
                panels,
                ..
            } => {
                self.turns += 1;
                let (thread, turn) = {
                    let mut session = self.session()?;
                    session.turn = format!("{}-turn-{}", session.thread, self.turns);
                    session.texts = 0;
                    session.calls.clear();
                    (session.thread.clone(), session.turn.clone())
                };
                let mut prompt = format!(
                    "voyager.focus: {}\n",
                    serde_json::to_string(&focus).map_err(|error| error.to_string())?
                );
                if !panels.is_empty() {
                    let panels =
                        serde_json::to_string(&panels).map_err(|error| error.to_string())?;
                    prompt.push_str(&format!("voyager.panels: {panels}\n"));
                }
                prompt.push('\n');
                prompt.push_str(&text);
                self.write(
                    &json!({"type":"user","message":{"role":"user","content":[{"type":"text","text":prompt}]}}),
                    65536,
                )?;
                self.emit(Event::Response {
                    id,
                    outcome: Outcome::Applied(Answer::Turn { id: turn.clone() }),
                })?;
                self.emit(Event::Visible(Visible::Started { thread, turn }))
            }
            ProviderCommand::InterruptTurn { .. } => {
                self.session()?.interrupted = true;
                self.control(id, operation, json!({"subtype":"interrupt"}))
            }
            ProviderCommand::ReadAccount
            | ProviderCommand::StartAudio { .. }
            | ProviderCommand::StopAudio { .. } => self.emit(Event::Response {
                id,
                outcome: Outcome::Rejected(
                    "Claude has no native voice. Text and accepted work remain available.".into(),
                ),
            }),
        }
    }

    pub(crate) fn reply(&mut self, reply: &ToolReply, content: bool) -> Result<(), String> {
        let frame = reply_frame(reply, &*self.session()?);
        self.write(&frame, if content { FRAME_LIMIT } else { 65536 })
    }

    pub(crate) fn voice_package(&self) -> Result<Package, String> {
        Err("Claude has no native voice. Text and accepted work remain available.".into())
    }

    pub(crate) fn shutdown(&mut self) -> Result<(), String> {
        let Some(child) = self.child.as_mut() else {
            return Ok(());
        };
        if child.try_wait().map_err(|e| e.to_string())?.is_none() {
            child.kill().map_err(|e| e.to_string())?;
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if child.try_wait().map_err(|e| e.to_string())?.is_some() {
                self.child = None;
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err("Private provider exit is unconfirmed".into());
            }
            thread::sleep(Duration::from_millis(10));
        }
    }

    pub(crate) fn close(mut self) -> Result<(), String> {
        self.shutdown()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::ToolResult;

    #[test]
    fn tool_messages_ride_the_pipe_and_replies_keep_their_identity() {
        let mut session = Session {
            thread: "claude-1".into(),
            turn: "claude-1-turn-1".into(),
            tools: vec![json!({"name":"voyager_workspace"})],
            ..Session::default()
        };
        let call = json!({"type":"control_request","request_id":"r1","request":{"subtype":"mcp_message","server_name":"voyager","message":{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"voyager_workspace","arguments":{"expectedVersion":"9"}}}}});
        let (Some(Event::Tool(tool)), None) = translate(&call, &mut session) else {
            panic!("a tool call must reach the dispatcher");
        };
        assert_eq!(
            [&tool.thread, &tool.turn, &tool.call, &tool.name],
            ["claude-1", "claude-1-turn-1", "r1", "voyager_workspace"]
        );
        assert_eq!(tool.arguments, json!({"expectedVersion":"9"}));
        let result = ToolReply::Result {
            id: tool.id.clone(),
            result: ToolResult {
                success: true,
                text: "done".into(),
            },
        };
        assert_eq!(
            reply_frame(&result, &session)["response"]["response"]["mcp_response"],
            json!({"jsonrpc":"2.0","id":7,"result":{"content":[{"type":"text","text":"done"}],"isError":false}})
        );
        let list = json!({"type":"control_request","request_id":"r2","request":{"subtype":"mcp_message","server_name":"voyager","message":{"jsonrpc":"2.0","id":1,"method":"tools/list"}}});
        assert_eq!(
            translate(&list, &mut session).1.unwrap()["response"]["response"]["mcp_response"]["result"]
                ["tools"],
            json!([{"name":"voyager_workspace"}])
        );
        let other = json!({"type":"control_request","request_id":"r3","request":{"subtype":"can_use_tool"}});
        assert_eq!(
            translate(&other, &mut session).1.unwrap()["response"]["subtype"],
            "error"
        );
        let done = json!({"type":"result","is_error":false,"result":"oru: done"});
        assert!(matches!(
            translate(&done, &mut session).0,
            Some(Event::Visible(Visible::Completed {
                phase: Phase::Completed,
                error: None,
                ..
            }))
        ));
    }
}
