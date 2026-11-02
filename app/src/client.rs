use crate::{
    core::{Core, Error, Viewer},
    core_shapes::{AttachParams, AttachResult, RunParams, RunResult},
    workspace::Model,
};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, VecDeque},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
        mpsc::{self, SyncSender},
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use voyager_contract::{
    Action, ContentId, Context, CoreTerminalId, Layout, Request, Response, Status, TerminalRequest,
};

enum Message {
    Workspace {
        request: Request,
        scope: Option<Context>,
        reply: SyncSender<Response>,
    },
    Terminal {
        content: ContentId,
        request_id: String,
        expected_version: u64,
        reply: SyncSender<Result<Viewer, Error>>,
    },
}

struct Outcome {
    status: Status,
    message: Option<String>,
    created_workspace: bool,
}

#[derive(Debug)]
pub enum CallError {
    Rejected(String),
    Unconfirmed(String),
}

#[derive(Clone)]
pub struct Client {
    sender: SyncSender<Message>,
    sequence: Arc<AtomicU64>,
    identity: String,
}

impl Client {
    pub fn open(session: String, cwd: String) -> Self {
        let (sender, receiver) = mpsc::sync_channel::<Message>(8);
        thread::spawn(move || {
            let mut core = Core::connect(&session);
            let mut layout = Arc::new(Layout::default());
            let mut version = 0;
            let mut fresh = false;
            let mut receipts: VecDeque<(Request, Option<Context>, Outcome)> = VecDeque::new();
            let mut unconfirmed = HashMap::<String, String>::new();
            let mut terminal_requests: VecDeque<(TerminalRequest, Result<Viewer, Error>)> =
                VecDeque::new();
            while let Ok(message) = receiver.recv() {
                let (request, scope, reply) = match message {
                    Message::Workspace {
                        request,
                        scope,
                        reply,
                    } => (request, scope, reply),
                    Message::Terminal {
                        content,
                        request_id,
                        expected_version,
                        reply,
                    } => {
                        let request = TerminalRequest {
                            request_id: request_id.clone(),
                            content_id: content.clone(),
                            expected_version,
                        };
                        let previous = terminal_requests
                            .iter()
                            .find(|(prior, _)| prior.request_id == request_id);
                        let result = if let Some((prior, outcome)) = previous {
                            if prior == &request {
                                outcome.clone()
                            } else {
                                Err(rejected(
                                    "Terminal request identity was reused with different content"
                                        .into(),
                                ))
                            }
                        } else if request_id.is_empty() || request_id.len() > 128 {
                            Err(rejected("Invalid terminal request identity".into()))
                        } else if !fresh {
                            Err(rejected(
                                "Inspect the workspace before opening a terminal".into(),
                            ))
                        } else if version != expected_version {
                            Err(rejected(
                                "Layout changed; inspect before opening a terminal".into(),
                            ))
                        } else if let Some(message) = unconfirmed.get(&content.0) {
                            Err(Error::Uncertain(message.clone()))
                        } else {
                            match core.as_mut() {
                                Ok(core) => open_terminal(
                                    core,
                                    &mut layout,
                                    &mut version,
                                    &mut fresh,
                                    &mut unconfirmed,
                                    &content,
                                    &request_id,
                                ),
                                Err(error) => Err(error.clone()),
                            }
                        };
                        if previous.is_none() {
                            terminal_requests.push_back((request, result.clone()));
                            if terminal_requests.len() > 32 {
                                terminal_requests.pop_front();
                            }
                        }
                        if reply.send(result).is_err() {
                            eprintln!("Terminal result receiver closed");
                        }
                        continue;
                    }
                };
                let mut response = Response {
                    request_id: request.request_id.clone(),
                    status: Status::Rejected,
                    version,
                    layout: crate::scope::project(&layout, scope.as_ref()),
                    fresh,
                    created_workspace: false,
                    message: None,
                };
                if let Some((previous, previous_scope, result)) = receipts
                    .iter()
                    .find(|(r, _, _)| r.request_id == request.request_id)
                {
                    if previous == &request && previous_scope == &scope {
                        response.status = result.status.clone();
                        response.message = result.message.clone();
                        response.created_workspace = result.created_workspace;
                        let _ = reply.send(response);
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
                        Ok(core) => (|| {
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
                                        response.created_workspace = true;
                                    }
                                    unconfirmed.retain(|id, _| {
                                        candidate.layout.contents.iter().any(|item| {
                                            &item.id.0 == id && item.start_pending.is_some()
                                        })
                                    });
                                    layout = Arc::new(candidate.layout);
                                    version = revision;
                                    fresh = true;
                                    crate::scope::check(&layout, scope.as_ref(), &request.action)
                                        .map_err(rejected)?;
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
                                crate::scope::check(&layout, scope.as_ref(), &request.action)
                                    .map_err(rejected)?;
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
                        })(),
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
                response.layout = crate::scope::project(&layout, scope.as_ref());
                response.fresh = fresh;
                receipts.push_back((
                    request,
                    scope,
                    Outcome {
                        status: response.status.clone(),
                        message: response.message.clone(),
                        created_workspace: response.created_workspace,
                    },
                ));
                if receipts.len() > 32 {
                    receipts.pop_front();
                }
                let _ = reply.send(response);
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
            identity: format!(
                "{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
            ),
        }
    }

    pub fn request_id(&self) -> String {
        format!(
            "workspace-{}-{}",
            self.identity,
            self.sequence.fetch_add(1, Ordering::Relaxed)
        )
    }

    pub fn call(&self, request: Request) -> Result<Response, String> {
        self.bound_call(None, request).map_err(|error| match error {
            CallError::Rejected(message) | CallError::Unconfirmed(message) => message,
        })
    }

    pub fn scoped_call(&self, scope: Context, request: Request) -> Result<Response, CallError> {
        self.bound_call(Some(scope), request)
    }

    fn bound_call(&self, scope: Option<Context>, request: Request) -> Result<Response, CallError> {
        let (reply, receive) = mpsc::sync_channel(1);
        self.sender
            .try_send(Message::Workspace {
                request,
                scope,
                reply,
            })
            .map_err(|_| {
                CallError::Rejected("Workspace busy or unavailable; nothing was queued".into())
            })?;
        receive.recv_timeout(Duration::from_secs(20)).map_err(|_| {
            CallError::Unconfirmed("Workspace result unconfirmed; do not repeat the request".into())
        })
    }

    pub fn terminal(
        &self,
        content: ContentId,
        request_id: String,
        expected_version: u64,
    ) -> Result<Viewer, Error> {
        let (reply, receive) = mpsc::sync_channel(1);
        self.sender
            .try_send(Message::Terminal {
                content,
                request_id,
                expected_version,
                reply,
            })
            .map_err(|_| {
                rejected("Workspace busy or unavailable; no terminal was started".into())
            })?;
        receive.recv_timeout(Duration::from_secs(25)).map_err(|_| {
            Error::Uncertain("Terminal result unconfirmed; no request was repeated".into())
        })?
    }
}

fn open_terminal(
    core: &mut Core,
    layout: &mut Arc<Layout>,
    version: &mut u64,
    fresh: &mut bool,
    unconfirmed: &mut HashMap<String, String>,
    content: &ContentId,
    request_id: &str,
) -> Result<Viewer, Error> {
    let target = layout
        .contents
        .iter()
        .find(|item| &item.id == content)
        .ok_or_else(|| rejected("Terminal content not found".into()))?;
    if target.type_id != "terminal" {
        return Err(rejected("Content is not a terminal".into()));
    }
    if let Some(operation) = &target.start_pending {
        return Err(Error::Uncertain(format!(
            "Terminal start {operation} is unconfirmed. Inspect Core terminals with voyager-operation={operation}; no start was repeated"
        )));
    }
    let cwd = target.cwd.clone();
    let mut created = false;
    let address = if let Some(address) = &target.backend {
        address.0.clone()
    } else {
        let operation = format!("voyager-start-{request_id}");
        let params: RunParams = serde_json::from_value(
            json!({"cwd": cwd, "no_parent": true, "labels": {"voyager-operation": operation}}),
        )
        .map_err(|error| rejected(format!("Invalid Core run parameters: {error}")))?;
        let params = serde_json::to_value(params).map_err(|error| rejected(error.to_string()))?;
        let mut pending = (**layout).clone();
        let item = pending
            .contents
            .iter_mut()
            .find(|item| &item.id == content)
            .ok_or_else(|| rejected("Terminal content disappeared".into()))?;
        item.start_pending = Some(operation.clone());
        match save(core, &pending, *version) {
            Ok(saved) => {
                *layout = Arc::new(pending);
                *version = saved;
            }
            Err(error) => {
                *fresh = false;
                return Err(match error {
                    Error::Rejected { kind, message } => Error::Rejected {
                        kind,
                        message: format!(
                            "Terminal start marker was refused: {message}; no start was issued"
                        ),
                    },
                    Error::Uncertain(message) => Error::Uncertain(format!(
                        "Terminal start marker was not confirmed: {message}; no start was issued"
                    )),
                });
            }
        }
        let started = match core.rpc("terminal.run", params) {
            Ok(value) => match serde_json::from_value::<RunResult>(value) {
                Ok(result) => result,
                Err(error) => {
                    let message = format!(
                        "Terminal start {operation} returned an invalid result: {error}. Inspect Core terminals with voyager-operation={operation}; no start was repeated"
                    );
                    unconfirmed.insert(content.0.clone(), message.clone());
                    return Err(Error::Uncertain(message));
                }
            },
            Err(Error::Uncertain(message)) => {
                let message = format!(
                    "Terminal start {operation} is unconfirmed: {message}. Inspect Core terminals with voyager-operation={operation}; no start was repeated"
                );
                unconfirmed.insert(content.0.clone(), message.clone());
                return Err(Error::Uncertain(message));
            }
            Err(error) => {
                let mut cleared = (**layout).clone();
                if let Some(item) = cleared.contents.iter_mut().find(|item| &item.id == content) {
                    item.start_pending = None;
                }
                match save(core, &cleared, *version) {
                    Ok(saved) => {
                        *layout = Arc::new(cleared);
                        *version = saved;
                    }
                    Err(cleanup) => {
                        *fresh = false;
                        return Err(Error::Uncertain(format!(
                            "Terminal start was refused but marker cleanup is unconfirmed: {cleanup:?}"
                        )));
                    }
                }
                return Err(error);
            }
        };
        let address = started.address.clone();
        if !matches!(started.state.as_str(), "live" | "finished")
            || started.reason.as_deref() == Some("spawn_pending")
        {
            let message = format!(
                "Terminal {address} for {operation} has an unconfirmed start; inspect it in Core. No start was repeated"
            );
            unconfirmed.insert(content.0.clone(), message.clone());
            return Err(Error::Uncertain(message));
        }
        let mut candidate = (**layout).clone();
        let item = candidate
            .contents
            .iter_mut()
            .find(|item| &item.id == content)
            .ok_or_else(|| Error::Uncertain("Terminal content disappeared after start".into()))?;
        item.backend = Some(CoreTerminalId(address.clone()));
        item.start_pending = None;
        match save(core, &candidate, *version) {
            Ok(saved) => {
                *layout = Arc::new(candidate);
                *version = saved;
                created = true;
            }
            Err(error) => {
                *fresh = false;
                let message = format!(
                    "Terminal {address} started but workspace save failed: {error:?}; no start was repeated"
                );
                unconfirmed.insert(content.0.clone(), message.clone());
                return Err(Error::Uncertain(message));
            }
        }
        address
    };
    let params: AttachParams =
        serde_json::from_value(json!({"terminal": address, "cols": 80, "rows": 24}))
            .map_err(|error| rejected(format!("Invalid Core attach parameters: {error}")))?;
    let attached = core
        .rpc(
            "terminal.attach",
            serde_json::to_value(params).map_err(|error| rejected(error.to_string()))?,
        )
        .map_err(|error| attach_failure(error, created, &address))?;
    let attached: AttachResult = serde_json::from_value(attached)
        .map_err(|error| Error::Uncertain(format!("Invalid Core attach result: {error}")))?;
    core.viewer(attached.channel)
}

fn rejected(message: String) -> Error {
    Error::Rejected {
        kind: "invalid_workspace".into(),
        message,
    }
}

fn attach_failure(error: Error, created: bool, address: &str) -> Error {
    match (created, error) {
        (true, Error::Rejected { kind, message }) => Error::Rejected {
            kind,
            message: format!(
                "Terminal {address} started and its binding was saved, but viewer attachment was refused: {message}. No start was repeated"
            ),
        },
        (true, Error::Uncertain(message)) => Error::Uncertain(format!(
            "Terminal {address} started and its binding was saved, but viewer attachment is unconfirmed: {message}. No start was repeated"
        )),
        (false, error) => error,
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

#[cfg(test)]
mod terminal_outcome_tests {
    use super::*;

    #[test]
    fn known_finished_attach_is_not_an_unconfirmed_start() {
        let error = attach_failure(
            Error::Rejected {
                kind: "finished".into(),
                message: "Terminal has exited".into(),
            },
            true,
            "t1",
        );
        assert!(
            matches!(error, Error::Rejected { kind, message } if kind == "finished" && message.contains("t1"))
        );
        assert!(matches!(
            attach_failure(Error::Uncertain("connection lost".into()), true, "t1"),
            Error::Uncertain(_)
        ));
    }
}
