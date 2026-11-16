use crate::sandbox::CLAUDE_SOCKET;
use crate::system::TimedOut;
use anyhow::{Context, Result, bail};
use serde_json::{Value, json};
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::Duration;

#[derive(Default)]
struct State {
    writer: Option<UnixStream>,
    connections: u32,
    hello: Option<Value>,
    ledger: Option<File>,
}

pub struct Claude {
    state: Arc<Mutex<State>>,
    lines: Receiver<Value>,
    ledger: PathBuf,
}

impl Claude {
    pub fn listen(evidence: &Path) -> Result<Self> {
        if Path::new(CLAUDE_SOCKET).exists() {
            fs::remove_file(CLAUDE_SOCKET)?;
        }
        let listener = UnixListener::bind(CLAUDE_SOCKET).context("Stand-in Claude socket")?;
        let ledger = evidence.join("claude.jsonl");
        let state = Arc::new(Mutex::new(State {
            ledger: Some(OpenOptions::new().create(true).append(true).open(&ledger)?),
            ..State::default()
        }));
        let (sender, lines) = mpsc::channel();
        let shared = Arc::clone(&state);
        thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let shared = Arc::clone(&shared);
                let sender = sender.clone();
                thread::spawn(move || {
                    let _ = serve(&shared, stream, &sender);
                });
            }
        });
        Ok(Self {
            state,
            lines,
            ledger,
        })
    }

    pub fn ledger(&self) -> &Path {
        &self.ledger
    }

    pub fn connections(&self) -> u32 {
        lock(&self.state).connections
    }

    pub fn hello(&self) -> Value {
        lock(&self.state).hello.clone().unwrap_or(Value::Null)
    }

    pub fn next(&self, kind: &str, within: Duration) -> Result<Value> {
        loop {
            match self.lines.recv_timeout(within) {
                Ok(line) if line["type"] == kind => return Ok(line),
                Ok(_) => {}
                Err(RecvTimeoutError::Timeout) => {
                    return Err(TimedOut(format!("a {kind} line from the app")).into());
                }
                Err(RecvTimeoutError::Disconnected) => {
                    bail!("The stand-in Claude stopped listening")
                }
            }
        }
    }

    pub fn send(&self, line: &Value) -> Result<()> {
        let mut state = lock(&self.state);
        record(&mut state, "stand-in", line);
        let writer = state
            .writer
            .as_mut()
            .context("No relay is connected to the stand-in Claude")?;
        writeln!(writer, "{line}")?;
        writer.flush()?;
        Ok(())
    }

    pub fn replay(&self, user: &Value) -> Result<()> {
        let mut replayed = user.clone();
        replayed["isReplay"] = json!(true);
        replayed["session_id"] = json!("stand-in-session");
        self.send(&replayed)
    }

    pub fn start_message(&self, id: &str) -> Result<()> {
        self.send(&json!({"type":"stream_event","event":{"type":"message_start","message":{"id":id,"role":"assistant","content":[]}},"parent_tool_use_id":null}))
    }

    pub fn delta(&self, text: &str) -> Result<()> {
        self.send(&json!({"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":text}},"parent_tool_use_id":null}))
    }

    pub fn tool_use(&self, message: &str, id: &str, command: &str) -> Result<()> {
        self.send(&json!({"type":"assistant","message":{"id":message,"role":"assistant","content":[{"type":"tool_use","id":id,"name":"Bash","input":{"command":command,"description":"Read the workspace"}}]},"parent_tool_use_id":null}))
    }

    pub fn tool_result(&self, id: &str, output: &str) -> Result<()> {
        self.send(&json!({"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":id,"content":output,"is_error":false}]},"parent_tool_use_id":null}))
    }

    pub fn control_success(&self, request: &str) -> Result<()> {
        self.send(&json!({"type":"control_response","response":{"subtype":"success","request_id":request}}))
    }

    pub fn result(&self, subtype: &str, is_error: bool) -> Result<()> {
        self.send(&json!({"type":"result","subtype":subtype,"is_error":is_error,"result":"","session_id":"stand-in-session"}))
    }
}

fn lock(state: &Mutex<State>) -> MutexGuard<'_, State> {
    state
        .lock()
        .expect("the stand-in state is never held across a panic")
}

fn record(state: &mut State, direction: &str, line: &Value) {
    let connection = state.connections;
    if let Some(ledger) = state.ledger.as_mut() {
        let _ = writeln!(
            ledger,
            "{}",
            json!({"direction":direction,"connection":connection,"line":line})
        );
    }
}

fn serve(state: &Mutex<State>, stream: UnixStream, lines: &Sender<Value>) -> Result<()> {
    {
        let mut state = lock(state);
        state.connections += 1;
        state.writer = Some(stream.try_clone()?);
    }
    let mut incoming = BufReader::new(stream).lines();
    if let Some(hello) = incoming.next() {
        let hello: Value = serde_json::from_str(&hello?)?;
        let mut state = lock(state);
        record(&mut state, "relay", &hello);
        state.hello = Some(hello);
    }
    for line in incoming {
        let line: Value = serde_json::from_str(&line?)?;
        record(&mut lock(state), "app", &line);
        let _ = lines.send(line);
    }
    Ok(())
}
