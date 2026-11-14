use crate::sandbox::PROVIDER_SOCKET;
use crate::system::TimedOut;
use anyhow::{Context, Result};
use serde::Serialize;
use serde_json::{Value, json};
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufRead, BufReader, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::Duration;

const RELAY_NAME: &str = "codex";
const THREAD: &str = "stand-in-thread";
const USER_AGENT: &str = "voyager-stand-in/0.0.0";

pub fn invoked_as_relay() -> bool {
    std::env::args_os()
        .next()
        .and_then(|name| Path::new(&name).file_name().map(|name| name == RELAY_NAME))
        .unwrap_or(false)
}

pub fn relay() -> i32 {
    match relay_lines() {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("Stand-in relay: {error:#}");
            3
        }
    }
}

fn relay_lines() -> Result<()> {
    let socket = UnixStream::connect(PROVIDER_SOCKET).context("Stand-in provider socket")?;
    let mut upstream = socket.try_clone()?;
    let args: Vec<String> = std::env::args().skip(1).collect();
    writeln!(
        upstream,
        "{}",
        json!({"relay":"hello","pid":std::process::id(),"args":args})
    )?;
    thread::spawn(move || {
        for line in io::stdin().lock().lines() {
            let Ok(line) = line else { return };
            if writeln!(upstream, "{line}").is_err() {
                return;
            }
        }
    });
    let mut stdout = io::stdout().lock();
    for line in BufReader::new(socket).lines() {
        writeln!(stdout, "{}", line?)?;
        stdout.flush()?;
    }
    Ok(())
}

#[derive(Clone, Debug, Serialize)]
pub struct Turn {
    pub thread: String,
    pub id: String,
    pub text: String,
    pub params: Value,
}

#[derive(Default)]
struct State {
    writer: Option<UnixStream>,
    connections: u32,
    relay_pid: Option<u32>,
    thread_starts: Vec<Value>,
    turn_starts: Vec<Value>,
    ledger: Option<File>,
    turns: u32,
}

pub struct Provider {
    state: Arc<Mutex<State>>,
    turns: Receiver<Turn>,
    ledger: PathBuf,
}

impl Provider {
    pub fn listen(evidence: &Path) -> Result<Self> {
        if Path::new(PROVIDER_SOCKET).exists() {
            fs::remove_file(PROVIDER_SOCKET)?;
        }
        let listener = UnixListener::bind(PROVIDER_SOCKET).context("Stand-in provider socket")?;
        let ledger = evidence.join("provider.jsonl");
        let state = Arc::new(Mutex::new(State {
            ledger: Some(OpenOptions::new().create(true).append(true).open(&ledger)?),
            ..State::default()
        }));
        let (sender, turns) = mpsc::channel();
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
            turns,
            ledger,
        })
    }

    pub fn ledger(&self) -> &Path {
        &self.ledger
    }

    pub fn next_turn(&self, within: Duration) -> Result<Turn> {
        match self.turns.recv_timeout(within) {
            Ok(turn) => Ok(turn),
            Err(RecvTimeoutError::Timeout) => {
                Err(TimedOut("a turn/start from the app".into()).into())
            }
            Err(RecvTimeoutError::Disconnected) => {
                anyhow::bail!("The stand-in provider stopped listening")
            }
        }
    }

    pub fn connections(&self) -> u32 {
        lock(&self.state).connections
    }

    pub fn relay_pid(&self) -> Option<u32> {
        lock(&self.state).relay_pid
    }

    pub fn thread_starts(&self) -> Vec<Value> {
        lock(&self.state).thread_starts.clone()
    }

    pub fn turn_starts(&self) -> Vec<Value> {
        lock(&self.state).turn_starts.clone()
    }

    pub fn started(&self, turn: &Turn) -> Result<()> {
        self.notify(
            "turn/started",
            json!({"threadId":turn.thread,"turn":{"id":turn.id,"status":"inProgress"}}),
        )
    }

    pub fn item_started(&self, turn: &Turn, item: &str) -> Result<()> {
        self.notify(
            "item/started",
            json!({"threadId":turn.thread,"turnId":turn.id,"item":{"type":"agentMessage","id":item,"text":""}}),
        )
    }

    pub fn delta(&self, turn: &Turn, item: &str, text: &str) -> Result<()> {
        self.notify(
            "item/agentMessage/delta",
            json!({"threadId":turn.thread,"turnId":turn.id,"itemId":item,"delta":text}),
        )
    }

    pub fn finish(&self, turn: &Turn, item: &str, text: &str) -> Result<()> {
        self.notify(
            "item/completed",
            json!({"threadId":turn.thread,"turnId":turn.id,"item":{"type":"agentMessage","id":item,"text":text}}),
        )
    }

    pub fn fail(&self, turn: &Turn, message: &str) -> Result<()> {
        self.notify(
            "error",
            json!({"threadId":turn.thread,"turnId":turn.id,"willRetry":false,"error":{"message":message}}),
        )?;
        self.notify(
            "turn/completed",
            json!({"threadId":turn.thread,"turn":{"id":turn.id,"status":"failed","error":{"message":message}}}),
        )
    }

    pub fn complete(&self, turn: &Turn) -> Result<()> {
        self.notify(
            "turn/completed",
            json!({"threadId":turn.thread,"turn":{"id":turn.id,"status":"completed"}}),
        )
    }

    fn notify(&self, method: &str, params: Value) -> Result<()> {
        let mut state = lock(&self.state);
        write(&mut state, &json!({"method":method,"params":params}))
    }
}

fn lock(state: &Mutex<State>) -> MutexGuard<'_, State> {
    state
        .lock()
        .expect("the stand-in state is never held across a panic")
}

fn record(state: &mut State, direction: &str, frame: &Value) {
    let connection = state.connections;
    if let Some(ledger) = state.ledger.as_mut() {
        let _ = writeln!(
            ledger,
            "{}",
            json!({"direction":direction,"connection":connection,"frame":frame})
        );
    }
}

fn write(state: &mut State, frame: &Value) -> Result<()> {
    record(state, "stand-in", frame);
    let writer = state
        .writer
        .as_mut()
        .context("No relay is connected to the stand-in provider")?;
    writeln!(writer, "{frame}")?;
    writer.flush()?;
    Ok(())
}

fn serve(state: &Mutex<State>, stream: UnixStream, turns: &Sender<Turn>) -> Result<()> {
    {
        let mut state = lock(state);
        state.connections += 1;
        state.writer = Some(stream.try_clone()?);
    }
    let mut lines = BufReader::new(stream).lines();
    if let Some(hello) = lines.next() {
        let hello: Value = serde_json::from_str(&hello?)?;
        let mut state = lock(state);
        record(&mut state, "relay", &hello);
        state.relay_pid = hello["pid"]
            .as_u64()
            .and_then(|pid| u32::try_from(pid).ok());
    }
    for line in lines {
        let frame: Value = serde_json::from_str(&line?)?;
        let mut state = lock(state);
        record(&mut state, "app", &frame);
        let (Some(method), Some(id)) = (frame["method"].as_str(), frame.get("id").cloned()) else {
            continue;
        };
        let params = frame["params"].clone();
        let reply = match method {
            "initialize" => json!({"id":id,"result":{"userAgent":USER_AGENT}}),
            "thread/start" => {
                state.thread_starts.push(params);
                json!({"id":id,"result":{"thread":{"id":THREAD},"model":"stand-in"}})
            }
            "turn/start" => {
                state.turns += 1;
                let turn = Turn {
                    thread: params["threadId"].as_str().unwrap_or_default().to_owned(),
                    id: format!("stand-in-turn-{}", state.turns),
                    text: params
                        .pointer("/input/0/text")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_owned(),
                    params: params.clone(),
                };
                state.turn_starts.push(params);
                let reply = json!({"id":id,"result":{"turn":{"id":turn.id,"status":"inProgress"}}});
                write(&mut state, &reply)?;
                let _ = turns.send(turn);
                continue;
            }
            _ => {
                json!({"id":id,"error":{"code":-32601,"message":"The stand-in provider does not answer this request"}})
            }
        };
        write(&mut state, &reply)?;
    }
    Ok(())
}
