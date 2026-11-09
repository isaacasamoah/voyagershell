use super::{Caller, Configuration, failed_response, platform};
use crate::client::Client;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{BufRead, BufReader, Read, Write},
    os::unix::{
        fs::{MetadataExt, PermissionsExt},
        net::{UnixListener, UnixStream},
        process::CommandExt,
    },
    path::{Path, PathBuf},
    process::Command,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use voyager_contract::{
    ContentId, FleetId,
    coordination::{Decision, Operation, Outcome, Participant, Request, Response, RunId},
};

#[derive(Deserialize, Serialize)]
#[serde(tag = "method", rename_all = "kebab-case", deny_unknown_fields)]
enum Wire {
    Enroll {
        content: ContentId,
    },
    Call {
        content: ContentId,
        request: Request,
    },
}

pub struct Endpoint {
    socket: PathBuf,
    image: (u64, u64),
    stopped: Arc<AtomicBool>,
    listener: Option<thread::JoinHandle<()>>,
}

impl Drop for Endpoint {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Release);
        let _ = UnixStream::connect(&self.socket);
        if let Some(listener) = self.listener.take() {
            let _ = listener.join();
        }
        if platform::image(&self.socket).ok() == Some(self.image) {
            let _ = fs::remove_file(&self.socket);
        }
    }
}

impl Client {
    pub fn serve_agents(&self, directory: &Path, command: &Path) -> Result<Endpoint, String> {
        match fs::create_dir(directory) {
            Ok(()) => fs::set_permissions(directory, fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
            Err(error) => return Err(error.to_string()),
        }
        let metadata = fs::symlink_metadata(directory).map_err(|e| e.to_string())?;
        if !metadata.is_dir()
            || metadata.uid() != platform::identity(std::process::id())?.uid
            || metadata.mode() & 0o077 != 0
        {
            return Err("The coordination directory must be private and owned by this user".into());
        }
        let socket = directory.join("agent.sock");
        if socket.as_os_str().as_encoded_bytes().len() >= 104 {
            return Err("Use a shorter isolated profile path for this Unix socket".into());
        }
        let command = command.canonicalize().map_err(|e| e.to_string())?;
        let listener = UnixListener::bind(&socket)
            .map_err(|e| format!("The coordination endpoint was not replaced: {e}"))?;
        let image = platform::image(&socket)?;
        let stopped = Arc::new(AtomicBool::new(false));
        let mut endpoint = Endpoint {
            socket: socket.clone(),
            image,
            stopped: stopped.clone(),
            listener: None,
        };
        fs::set_permissions(&socket, fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
        let (reply, receive) = std::sync::mpsc::sync_channel(1);
        self.sender
            .try_send(crate::client::Message::EnableCoordination {
                configuration: Configuration {
                    socket: socket.clone(),
                    command,
                },
                reply,
            })
            .map_err(|_| "Workspace owner is unavailable")?;
        receive
            .recv_timeout(Duration::from_secs(25))
            .map_err(|_| "Endpoint setup was not confirmed")??;
        let check = stopped.clone();
        let client = self.clone();
        let active = Arc::new(AtomicUsize::new(0));
        let thread = thread::Builder::new()
            .name("voyager-agent-commands".into())
            .spawn(move || {
                for stream in listener.incoming() {
                    if check.load(Ordering::Acquire) {
                        break;
                    }
                    let Ok(mut stream) = stream else { break };
                    if active
                        .try_update(Ordering::AcqRel, Ordering::Acquire, |n| {
                            (n < 8).then_some(n + 1)
                        })
                        .is_err()
                    {
                        let _ = stream.write_all(
                            b"{\"error\":\"Coordination busy; no request was queued\"}\n",
                        );
                        continue;
                    }
                    let owned = active.clone();
                    let client = client.clone();
                    let spawned = thread::Builder::new()
                        .name("voyager-agent-call".into())
                        .spawn(move || {
                            let result = exchange(&client, &mut stream);
                            if let Err(error) = result {
                                let _ = writeln!(stream, "{}", serde_json::json!({"error":error}));
                            }
                            owned.fetch_sub(1, Ordering::AcqRel);
                        });
                    if spawned.is_err() {
                        active.fetch_sub(1, Ordering::AcqRel);
                    }
                }
            })
            .map_err(|e| e.to_string())?;
        endpoint.listener = Some(thread);
        Ok(endpoint)
    }
}

fn exchange(client: &Client, stream: &mut UnixStream) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;
    let peer = platform::peer(stream)?;
    let mut line = String::new();
    BufReader::new((&*stream).take(9217))
        .read_line(&mut line)
        .map_err(|e| e.to_string())?;
    if line.len() > 9216 || !line.ends_with('\n') {
        return Err("The command envelope is incomplete or too large".into());
    }
    match serde_json::from_str::<Wire>(&line).map_err(|e| e.to_string())? {
        Wire::Enroll { content } => {
            let (reply, receive) = std::sync::mpsc::sync_channel(1);
            client
                .sender
                .try_send(crate::client::Message::EnrollAgent {
                    content,
                    peer,
                    reply,
                })
                .map_err(|_| "Workspace busy; enrollment was not queued")?;
            receive
                .recv_timeout(Duration::from_secs(25))
                .map_err(|_| "Enrollment result is unknown; exec was not attempted")??;
            writeln!(stream, "{{\"enrolled\":true}}").map_err(|e| e.to_string())?;
        }
        Wire::Call { content, request } => {
            let caller = Caller::Agent { content, peer };
            let after = match request.action {
                Operation::Wait { after } => Some(after),
                _ => None,
            };
            let mut response = client
                .coordinate_from(caller.clone(), request.clone())
                .unwrap_or_else(|error| failed_response(request.request_id.clone(), error));
            if let Some(after) = after
                && matches!(response.outcome, Outcome::Applied)
                && response
                    .snapshot
                    .as_ref()
                    .is_some_and(|snapshot| snapshot.revision == after)
            {
                client.wait_coordination(after)?;
                response = client
                    .coordinate_from(
                        caller,
                        Request {
                            action: Operation::Inspect,
                            ..request.clone()
                        },
                    )
                    .unwrap_or_else(|error| failed_response(request.request_id.clone(), error));
            }
            writeln!(
                stream,
                "{}",
                serde_json::to_string(&response).map_err(|e| e.to_string())?
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn send(wire: Wire) -> Result<serde_json::Value, String> {
    let socket = std::env::var_os("VOYAGER_AGENT_SOCKET")
        .ok_or("This agent has no Voyager coordination binding")?;
    let mut stream = UnixStream::connect(socket)
        .map_err(|e| format!("Coordination is unavailable; nothing was submitted: {e}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(80)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;
    writeln!(
        stream,
        "{}",
        serde_json::to_string(&wire).map_err(|e| e.to_string())?
    )
    .map_err(|e| format!("Command submission is uncertain: {e}; do not repeat it"))?;
    let mut response = String::new();
    BufReader::new(stream.take(4 * 1024 * 1024 + 1))
        .read_line(&mut response)
        .map_err(|e| format!("Result unavailable: {e}; inspect before acting, do not repeat"))?;
    if response.len() > 4 * 1024 * 1024 {
        return Err("The response exceeded the experiment limit".into());
    }
    let value: serde_json::Value = serde_json::from_str(&response).map_err(|e| e.to_string())?;
    if let Some(error) = value.get("error").and_then(|value| value.as_str()) {
        return Err(error.into());
    }
    Ok(value)
}

fn argument(args: &[String], index: usize) -> Result<String, String> {
    args.get(index)
        .cloned()
        .ok_or_else(|| "Missing command argument; run help for syntax".into())
}

pub fn run(args: Vec<String>) -> Result<(), String> {
    let action = args.get(1).map(String::as_str).unwrap_or("help");
    if matches!(action, "help" | "--help" | "-h") {
        println!(
            "Voyager agent commands\ninspect\nresult REQUEST_ID\nforward MESSAGE_ID\nwait REVISION\nsend RUN_OR_user MESSAGE\nacknowledge MESSAGE_ID\ninstruct RUN TASK\nstart FLEET crew|captain|commodore NAME TASK\nescalate TITLE CONTEXT DECISION BLAST_RADIUS\nresolve MESSAGE_ID approve|deny|reply [TEXT]\nassign RUN SUPERVISOR_OR_none\nUse JSON request input as a single argument to keep an explicit requestId. Never repeat an uncertain operation. Conversation does not grant work-changing authority."
        );
        return Ok(());
    }
    let content = ContentId(
        std::env::var("VOYAGER_AGENT_CONTENT")
            .map_err(|_| "This process has no Voyager content binding")?,
    );
    if action == "launch" {
        let value = send(Wire::Enroll { content })?;
        if value.get("enrolled") != Some(&serde_json::Value::Bool(true)) {
            return Err("Enrollment was not confirmed; Codex was not executed".into());
        }
        let executable = argument(&args, 2)?;
        return Err(Command::new(executable).args(&args[3..]).exec().to_string());
    }
    let request = if action.starts_with('{') {
        serde_json::from_str(action).map_err(|e| format!("Invalid typed request: {e}"))?
    } else {
        let action = match action {
            "inspect" => Operation::Inspect,
            "result" => Operation::InspectRequest {
                id: argument(&args, 2)?,
            },
            "forward" => Operation::Forward {
                id: argument(&args, 2)?,
            },
            "wait" => Operation::Wait {
                after: argument(&args, 2)?
                    .parse()
                    .map_err(|_| "Use the numeric revision from inspect")?,
            },
            "send" => Operation::Send {
                to: match argument(&args, 2)?.as_str() {
                    "user" => Participant::User,
                    id => Participant::Agent {
                        id: RunId(id.into()),
                    },
                },
                text: argument(&args, 3)?,
            },
            "acknowledge" => Operation::Acknowledge {
                id: argument(&args, 2)?,
            },
            "instruct" => Operation::Instruct {
                target: RunId(argument(&args, 2)?),
                task: argument(&args, 3)?,
            },
            "start" => Operation::Start {
                fleet: FleetId(argument(&args, 2)?),
                rank: serde_json::from_value(serde_json::Value::String(argument(&args, 3)?))
                    .map_err(|_| "Unknown rank")?,
                name: argument(&args, 4)?,
                task: argument(&args, 5)?,
            },
            "escalate" => Operation::Escalate {
                title: argument(&args, 2)?,
                context: argument(&args, 3)?,
                decision: argument(&args, 4)?,
                blast_radius: argument(&args, 5)?,
            },
            "resolve" => Operation::Resolve {
                id: argument(&args, 2)?,
                decision: match argument(&args, 3)?.as_str() {
                    "approve" => Decision::Approve,
                    "deny" => Decision::Deny,
                    "reply" => Decision::Reply {
                        text: argument(&args, 4)?,
                    },
                    _ => return Err("Choose approve, deny or reply".into()),
                },
            },
            "assign" => {
                let supervisor = argument(&args, 3)?;
                Operation::Assign {
                    agent: RunId(argument(&args, 2)?),
                    supervisor: (supervisor != "none").then_some(RunId(supervisor)),
                }
            }
            _ => return Err("Unknown command; run help".into()),
        };
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        Request {
            request_id: format!("agent-{}-{now}", std::process::id()),
            action,
        }
    };
    let request_id = request.request_id.clone();
    eprintln!("Request {request_id}");
    let value = send(Wire::Call { content, request }).map_err(|error| {
        format!("{error}. Request {request_id}; inspect this request instead of resubmitting it")
    })?;
    let response: Response = serde_json::from_value(value).map_err(|e| e.to_string())?;
    println!(
        "{}",
        serde_json::to_string(&response).map_err(|e| e.to_string())?
    );
    if response.outcome != Outcome::Applied {
        return Err(
            "The operation did not apply. Use the reported reason; do not bypass it".into(),
        );
    }
    Ok(())
}
