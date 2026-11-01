use crate::{
    core::{Core, Error},
    workspace::Model,
};
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
        mpsc::{self, SyncSender},
    },
    thread,
    time::Duration,
};
use voyager_contract::{Action, Layout, Request, Response, Status};

struct Message {
    request: Request,
    reply: SyncSender<Response>,
}

struct Outcome {
    status: Status,
    message: Option<String>,
}

#[derive(Clone)]
pub struct Client {
    sender: SyncSender<Message>,
    sequence: Arc<AtomicU64>,
}

impl Client {
    pub fn open(session: String, cwd: String) -> Self {
        let (sender, receiver) = mpsc::sync_channel::<Message>(8);
        thread::spawn(move || {
            let mut core = Core::connect(&session);
            let mut layout = Arc::new(Layout::default());
            let mut version = 0;
            let mut fresh = false;
            let mut receipts: VecDeque<(Request, Outcome)> = VecDeque::new();
            while let Ok(message) = receiver.recv() {
                let request = message.request;
                let mut response = Response {
                    request_id: request.request_id.clone(),
                    status: Status::Rejected,
                    version,
                    layout: Arc::clone(&layout),
                    fresh,
                    message: None,
                };
                if let Some((previous, result)) = receipts
                    .iter()
                    .find(|(r, _)| r.request_id == request.request_id)
                {
                    if previous == &request {
                        response.status = result.status.clone();
                        response.message = result.message.clone();
                        let _ = message.reply.send(response);
                        continue;
                    }
                    response.message =
                        Some("Changed request identity; nothing was repeated".into());
                } else if request.request_id.is_empty() || request.request_id.len() > 128 {
                    response.message = Some("Invalid request identity".into());
                } else {
                    let inspecting = matches!(request.action, Action::Inspect);
                    let result = match core.as_mut() {
                        Err(error) => Err(error.clone()),
                        Ok(core) => {
                            if matches!(request.action, Action::Inspect) {
                                load(core).and_then(|(loaded, revision, missing)| {
                                    let mut candidate = Model { layout: loaded };
                                    let mut revision = revision;
                                    if missing {
                                        candidate
                                            .apply(Action::CreateVoyage {
                                                name: "Voyager".into(),
                                                cwd: cwd.clone(),
                                            })
                                            .map_err(rejected)?;
                                        revision = save(core, &candidate.layout, revision)?;
                                    }
                                    layout = Arc::new(candidate.layout);
                                    version = revision;
                                    fresh = true;
                                    Ok(())
                                })
                            } else if !fresh {
                                Err(rejected(
                                    "Inspect the workspace before making a change".into(),
                                ))
                            } else if request.expected_version != version {
                                Err(rejected(
                                    "Layout changed; inspect it before making a new request".into(),
                                ))
                            } else {
                                let mut candidate = Model {
                                    layout: (*layout).clone(),
                                };
                                candidate
                                    .apply(request.action.clone())
                                    .map_err(rejected)
                                    .and_then(|()| {
                                        let revision = save(core, &candidate.layout, version)?;
                                        layout = Arc::new(candidate.layout);
                                        version = revision;
                                        Ok(())
                                    })
                            }
                        }
                    };
                    match result {
                        Ok(()) => response.status = Status::Applied,
                        Err(Error::Rejected { kind, message }) => {
                            if inspecting || kind == "conflict" {
                                fresh = false;
                            }
                            response.message = Some(format!("{kind}: {message}"))
                        }
                        Err(Error::Uncertain(message)) => {
                            fresh = false;
                            response.status = Status::Uncertain;
                            response.message = Some(message);
                        }
                    }
                }
                response.version = version;
                response.layout = Arc::clone(&layout);
                response.fresh = fresh;
                receipts.push_back((
                    request,
                    Outcome {
                        status: response.status.clone(),
                        message: response.message.clone(),
                    },
                ));
                if receipts.len() > 32 {
                    receipts.pop_front();
                }
                let _ = message.reply.send(response);
            }
            if let Ok(core) = core
                && let Err(error) = core.close()
            {
                eprintln!("Core bridge cleanup: {error:?}");
            }
        });
        Self {
            sender,
            sequence: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn request_id(&self) -> String {
        format!(
            "workspace-{}",
            self.sequence.fetch_add(1, Ordering::Relaxed)
        )
    }

    pub fn call(&self, request: Request) -> Result<Response, String> {
        let (reply, receive) = mpsc::sync_channel(1);
        self.sender
            .try_send(Message { request, reply })
            .map_err(|_| "Workspace busy or unavailable; nothing was queued".to_string())?;
        receive
            .recv_timeout(Duration::from_secs(20))
            .map_err(|_| "Workspace result unconfirmed; do not repeat the request".to_string())
    }
}

fn rejected(message: String) -> Error {
    Error::Rejected {
        kind: "invalid_workspace".into(),
        message,
    }
}

fn load(core: &mut Core) -> Result<(Layout, u64, bool), Error> {
    let doc = core.rpc("doc.get", json!({"name":"voyager-layout-v1"}))?;
    let version = doc
        .get("version")
        .and_then(Value::as_u64)
        .ok_or_else(|| Error::Uncertain("Core document revision missing".into()))?;
    let value = doc
        .get("value")
        .cloned()
        .ok_or_else(|| Error::Uncertain("Core document value missing".into()))?;
    if value.is_null() {
        return Ok((Layout::default(), version, true));
    }
    let layout = serde_json::from_value(value)
        .map_err(|e| rejected(format!("Stored workspace is invalid: {e}")))?;
    Ok((layout, version, false))
}

fn save(core: &mut Core, layout: &Layout, version: u64) -> Result<u64, Error> {
    let result = core.rpc(
        "doc.set",
        json!({"name":"voyager-layout-v1","value":layout,"version":version}),
    )?;
    result
        .get("version")
        .and_then(Value::as_u64)
        .ok_or_else(|| Error::Uncertain("Core save result has no revision".into()))
}
