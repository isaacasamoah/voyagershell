use crate::{
    core::{Core, Error, Viewer},
    workspace::Model,
};
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
use voyager_contract::administrator::{ProcessRequest, ProcessResponse};
use voyager_contract::{
    Action, ContentId, Context, CoreTerminalId, Layout, Request, Response, Status, TerminalRequest,
};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct WorkspaceNotice {
    pub package_revision: u64,
    pub revision: u64,
}

enum Message {
    Launches {
        reply: async_channel::Sender<Result<voyager_contract::launch::Catalog, String>>,
    },
    RefreshContentViews,
    RegisterView {
        binding: crate::content::Binding,
        reply: async_channel::Sender<Result<crate::content::ViewBinding, String>>,
    },
    ContextFacts {
        reply: async_channel::Sender<Result<voyager_contract::context::Facts, String>>,
    },
    WorkspaceChanges {
        after: Option<WorkspaceNotice>,
        reply: async_channel::Sender<async_channel::Receiver<WorkspaceNotice>>,
    },
    BindContent {
        id: ContentId,
        reply: async_channel::Sender<Result<crate::content::Binding, String>>,
    },
    ContentChanges {
        binding: crate::content::Binding,
        after: Option<u64>,
        reply: async_channel::Sender<Result<async_channel::Receiver<u64>, String>>,
    },
    Content {
        access: crate::content::Access,
        request: voyager_contract::content::Request,
        reply: ContentReply,
    },
    Process {
        scope: Context,
        request: ProcessRequest,
        reply: SyncSender<Arc<ProcessResponse>>,
    },
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

enum ContentReply {
    Blocking(SyncSender<Arc<voyager_contract::content::Response>>),
    Asynchronous(async_channel::Sender<Arc<voyager_contract::content::Response>>),
}

impl ContentReply {
    fn deliver(self, response: Arc<voyager_contract::content::Response>) {
        match self {
            Self::Blocking(reply) => {
                let _ = reply.send(response);
            }
            Self::Asynchronous(reply) => {
                let _ = reply.try_send(response);
            }
        }
    }
}

struct Outcome {
    status: Status,
    message: Option<String>,
    created_workspace: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct CreatedTerminal {
    id: ContentId,
    launch: voyager_contract::launch::Launch,
}

impl CreatedTerminal {
    fn matches(&self, content: &voyager_contract::Content) -> bool {
        self.id == content.id
            && &self.launch
                == content
                    .launch
                    .as_ref()
                    .unwrap_or(&voyager_contract::launch::Launch::Terminal)
    }
}

struct ContentReceipt {
    access: crate::content::Access,
    request_id: String,
    fingerprint: [u8; 32],
    result: Arc<voyager_contract::content::Response>,
}

#[derive(Debug)]
pub enum CallError {
    Rejected(String),
    Unconfirmed(String),
}

pub(crate) struct PendingCall(mpsc::Receiver<Response>);

impl PendingCall {
    pub(crate) fn wait(self) -> Result<Response, CallError> {
        self.0.recv_timeout(Duration::from_secs(20)).map_err(|_| {
            CallError::Unconfirmed("Workspace result unconfirmed; do not repeat the request".into())
        })
    }
}

#[derive(Clone)]
pub struct Client {
    sender: async_channel::Sender<Message>,
    sequence: Arc<AtomicU64>,
    package_revision: Arc<AtomicU64>,
    identity: String,
}

impl Client {
    pub fn open(session: String, cwd: String) -> Self {
        Self::start(session, cwd, None)
    }

    pub fn with_content(session: String, cwd: String, owner: crate::content::Owner) -> Self {
        Self::start(session, cwd, Some(owner))
    }

    pub fn with_content_and_launches(
        session: String,
        cwd: String,
        owner: crate::content::Owner,
        launches: std::path::PathBuf,
    ) -> Self {
        Self::start_with_launches(session, cwd, Some(owner), Some(launches))
    }

    fn start(session: String, cwd: String, content: Option<crate::content::Owner>) -> Self {
        Self::start_with_launches(session, cwd, content, None)
    }

    fn start_with_launches(
        session: String,
        cwd: String,
        mut content: Option<crate::content::Owner>,
        launches: Option<std::path::PathBuf>,
    ) -> Self {
        let (sender, receiver) = async_channel::bounded::<Message>(8);
        let package_revision = Arc::new(AtomicU64::new(0));
        let published_packages = package_revision.clone();
        thread::spawn(move || {
            let mut core = Core::connect(&session);
            let mut layout = Arc::new(Layout::default());
            let mut version = 0;
            let mut fresh = false;
            let mut receipts: VecDeque<(Request, Option<Context>, Outcome)> = VecDeque::new();
            let mut unconfirmed = HashMap::<String, String>::new();
            let mut created_contents = Vec::<CreatedTerminal>::new();
            let mut terminal_requests: VecDeque<(TerminalRequest, Result<Viewer, Error>)> =
                VecDeque::new();
            let mut process_requests: VecDeque<(Context, ProcessRequest, Arc<ProcessResponse>)> =
                VecDeque::new();
            let mut content_requests: VecDeque<ContentReceipt> = VecDeque::new();
            let mut workspace_listener: Option<async_channel::Sender<WorkspaceNotice>> = None;
            while let Ok(message) = receiver.recv_blocking() {
                let (request, scope, reply) = match message {
                    Message::Launches { reply } => {
                        let _ = reply.try_send(crate::launch::catalog(launches.as_deref(), &cwd));
                        continue;
                    }
                    Message::RefreshContentViews => {
                        if let Some(owner) = &mut content {
                            owner.refresh_views();
                        }
                        continue;
                    }
                    Message::RegisterView { binding, reply } => {
                        let result = content
                            .as_mut()
                            .ok_or_else(|| "Content owner unavailable".to_owned())
                            .and_then(|owner| owner.register_view(binding));
                        let _ = reply.try_send(result);
                        continue;
                    }
                    Message::ContextFacts { reply } => {
                        let _ = reply.try_send(crate::context::capture(&layout, version));
                        continue;
                    }
                    Message::WorkspaceChanges { after, reply } => {
                        let (send, receive) = async_channel::bounded(1);
                        let current = WorkspaceNotice {
                            revision: version,
                            package_revision: published_packages.load(Ordering::Relaxed),
                        };
                        if after != Some(current) {
                            let _ = send.try_send(current);
                        }
                        workspace_listener = Some(send);
                        let _ = reply.try_send(receive);
                        continue;
                    }
                    Message::BindContent { id, reply } => {
                        let result = (|| {
                            let core = core.as_mut().map_err(|error| format!("{error:?}"))?;
                            let (current, revision, _) =
                                load(core).map_err(|error| format!("{error:?}"))?;
                            layout = Arc::new(current);
                            version = revision;
                            fresh = true;
                            crate::content::member(&layout, None, &id)?;
                            let owner = content.as_mut().ok_or("Content owner unavailable")?;
                            let binding = owner
                                .register_existing(&id)
                                .map_err(|error| error.to_string())?;
                            Ok(binding)
                        })();
                        let _ = reply.try_send(result);
                        continue;
                    }
                    Message::ContentChanges {
                        binding,
                        after,
                        reply,
                    } => {
                        let result = content
                            .as_mut()
                            .ok_or_else(|| "Content owner unavailable".into())
                            .map(|owner| owner.subscribe(&binding, after));
                        let _ = reply.try_send(result);
                        continue;
                    }
                    Message::Content {
                        access,
                        request,
                        reply,
                    } => {
                        let (_, request_id, expected) = crate::content::identity(&request);
                        let fingerprint = crate::content::fingerprint(&request);
                        if let Some(previous) = content_requests
                            .iter()
                            .find(|prior| prior.request_id == request_id)
                        {
                            let response = if previous.access == access
                                && previous.fingerprint == fingerprint
                            {
                                Arc::clone(&previous.result)
                            } else {
                                Arc::new(crate::content::reject(
                                    &request,
                                    "Content request identity changed; nothing was repeated".into(),
                                ))
                            };
                            reply.deliver(response);
                            continue;
                        }
                        let result = (|| {
                            if request_id.is_empty()
                                || request_id.len() > 128
                                || expected.is_some_and(|revision| {
                                    revision.is_empty() || revision.len() > 128
                                })
                            {
                                return Err("Invalid content request identity".into());
                            }
                            if receipts
                                .iter()
                                .any(|(prior, _, _)| prior.request_id == request_id)
                                || process_requests
                                    .iter()
                                    .any(|(_, prior, _)| prior.request_id == request_id)
                                || terminal_requests
                                    .iter()
                                    .any(|(prior, _)| prior.request_id == request_id)
                            {
                                return Err(
                                    "This request identity belongs to another operation".into()
                                );
                            }
                            if serde_json::to_vec(&request)
                                .map_err(|error| error.to_string())?
                                .len()
                                > crate::content::ENVELOPE_LIMIT
                            {
                                return Err("Content request exceeds the envelope limit".into());
                            }
                            let core = core.as_mut().map_err(|error| format!("{error:?}"))?;
                            let (current, revision, _) =
                                load(core).map_err(|error| format!("{error:?}"))?;
                            layout = Arc::new(current);
                            version = revision;
                            fresh = true;
                            let owner = content.as_mut().ok_or("Content owner unavailable")?;
                            Ok(crate::content::run(
                                owner,
                                &layout,
                                version,
                                &access,
                                request.clone(),
                            ))
                        })();
                        let response = result
                            .unwrap_or_else(|message| crate::content::reject(&request, message));
                        let response =
                            Arc::new(crate::content::bounded_response(&request, response));
                        content_requests.push_back(ContentReceipt {
                            access,
                            request_id: request_id.into(),
                            fingerprint,
                            result: Arc::clone(&response),
                        });
                        if content_requests.len() > 32 {
                            content_requests.pop_front();
                        }
                        reply.deliver(response);
                        continue;
                    }
                    Message::Process {
                        scope,
                        request,
                        reply,
                    } => {
                        let previous = process_requests
                            .iter()
                            .find(|(_, prior, _)| prior.request_id == request.request_id);
                        let mut response = ProcessResponse {
                            request_id: request.request_id.clone(),
                            status: Status::Rejected,
                            version,
                            fresh,
                            output: None,
                            message: None,
                        };
                        if let Some((prior_scope, prior, result)) = previous {
                            let outcome = if prior == &request && prior_scope == &scope {
                                Arc::clone(result)
                            } else {
                                response.message = Some("Process request identity was reused with different arguments or scope".into());
                                Arc::new(response)
                            };
                            let _ = reply.send(outcome);
                            continue;
                        }
                        let result = if request.request_id.is_empty()
                            || request.request_id.len() > 128
                        {
                            Err(rejected("Invalid process request identity".into()))
                        } else if content_requests
                            .iter()
                            .any(|prior| prior.request_id == request.request_id)
                        {
                            Err(rejected(
                                "This request identity belongs to a content operation".into(),
                            ))
                        } else if receipts
                            .iter()
                            .any(|(prior, _, _)| prior.request_id == request.request_id)
                            || terminal_requests
                                .iter()
                                .any(|(prior, _)| prior.request_id == request.request_id)
                        {
                            Err(rejected(
                                "This request identity belongs to another operation".into(),
                            ))
                        } else if !fresh || version != request.input.expected_version {
                            Err(rejected(
                                "Inspect the current workspace revision before using processes"
                                    .into(),
                            ))
                        } else {
                            match core.as_mut() {
                                    Ok(core) => load(core).and_then(|(current, revision, _)| {
                                        layout = Arc::new(current);
                                        version = revision;
                                        if version != request.input.expected_version {
                                            return Err(rejected("Workspace revision changed before process dispatch; inspect again".into()));
                                        }
                                        crate::process::run(core, &layout, &scope, &request.input.action)
                                    }),
                                    Err(error) => Err(error.clone()),
                                }
                        };
                        match result {
                            Ok(output) => {
                                match serde_json::to_vec(&output) {
                                    Ok(bytes) if bytes.len() <= 24 * 1024 => {
                                        response.status = Status::Applied;
                                        response.output = Some(output);
                                    }
                                    _ if matches!(output, voyager_contract::administrator::ProcessOutput::Send { .. } | voyager_contract::administrator::ProcessOutput::Interrupt { .. } | voyager_contract::administrator::ProcessOutput::Stop { .. }) => {
                                        response.status = Status::Applied;
                                        response.message = Some("The requested process operation was submitted; its details exceed the response limit. Read the terminal to inspect the result.".into());
                                    }
                                    _ => response.message = Some("Process result exceeds the tool response limit. Inspect a narrower focus or read less history.".into()),
                                }
                            }
                            Err(Error::Rejected { message, .. }) => response.message = Some(message),
                            Err(Error::Uncertain(message)) => {
                                fresh = false;
                                response.status = Status::Uncertain;
                                response.message = Some(message);
                            }
                        }
                        response.version = version;
                        response.fresh = fresh;
                        let outcome = Arc::new(response);
                        process_requests.push_back((scope, request, Arc::clone(&outcome)));
                        if process_requests.len() > 32 {
                            process_requests.pop_front();
                        }
                        let _ = reply.send(outcome);
                        continue;
                    }
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
                        } else if content_requests
                            .iter()
                            .any(|prior| prior.request_id == request_id)
                        {
                            Err(rejected(
                                "This request identity belongs to a content operation".into(),
                            ))
                        } else if process_requests
                            .iter()
                            .any(|(_, prior, _)| prior.request_id == request_id)
                        {
                            Err(rejected(
                                "This request identity belongs to a process operation".into(),
                            ))
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
                        } else if created_contents.iter().any(|pending| pending.id == content)
                            && !visible_content(&layout, &content)
                        {
                            Err(rejected(
                                "Created content is not currently visible; no terminal was started"
                                    .into(),
                            ))
                        } else {
                            match core.as_mut() {
                                Ok(core) => open_terminal(
                                    core,
                                    &mut layout,
                                    &mut version,
                                    &mut fresh,
                                    &mut unconfirmed,
                                    &mut created_contents,
                                    &request,
                                ),
                                Err(error) => Err(error.clone()),
                            }
                        };
                        if previous.is_none() {
                            settle_created_content(&mut created_contents, &content, &result);
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
                let previous_version = version;
                let mut package_changed = false;
                let mut response = Response {
                    request_id: request.request_id.clone(),
                    status: Status::Rejected,
                    version,
                    layout: crate::scope::project(&layout, scope.as_ref()),
                    fresh,
                    created_workspace: false,
                    created_contents: eligible_contents(&layout, scope.as_ref(), &created_contents),
                    message: None,
                };
                if content_requests
                    .iter()
                    .any(|prior| prior.request_id == request.request_id)
                {
                    response.message =
                        Some("This request identity belongs to a content operation".into());
                    let _ = reply.send(response);
                    continue;
                }
                if process_requests
                    .iter()
                    .any(|(_, prior, _)| prior.request_id == request.request_id)
                {
                    response.message =
                        Some("This request identity belongs to a process operation".into());
                    let _ = reply.send(response);
                    continue;
                }
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
                                    created_contents.retain(|pending| {
                                        candidate.layout.contents.iter().any(|item| {
                                            item.id == pending.id
                                                && item.backend.is_none()
                                                && item.start_pending.is_none()
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
                                if let Action::RemoveContentPackage { type_id }
                                | Action::RestoreContentPackage { type_id } = &request.action
                                {
                                    let (current, revision, missing) = load(core).map_err(|error| rejected(format!("Workspace observation unavailable; no content package was changed: {error:?}")))?;
                                    layout = Arc::new(current);
                                    version = revision;
                                    fresh = true;
                                    if missing || request.expected_version != version {
                                        return Err(rejected("Workspace changed; inspect before changing a content package".into()));
                                    }
                                    crate::scope::check(&layout, scope.as_ref(), &request.action)
                                        .map_err(rejected)?;
                                    let owner = content.as_mut().ok_or_else(|| {
                                        rejected("Content owner unavailable".into())
                                    })?;
                                    match &request.action {
                                        Action::RemoveContentPackage { .. } => {
                                            owner.remove_package(type_id)
                                        }
                                        _ => owner.restore_package(type_id),
                                    }
                                    .map_err(rejected)?;
                                    package_changed = true;
                                    return Ok(());
                                }
                                if let Action::CreateContent { type_id, .. } = &request.action
                                    && let Some(owner) = &content
                                {
                                    owner.require_available(type_id).map_err(rejected)?;
                                }
                                let mut candidate = Model {
                                    layout: (*layout).clone(),
                                };
                                candidate
                                    .apply(request.action.clone())
                                    .map_err(rejected)
                                    .and_then(|()| {
                                        let revision = save(core, &candidate.layout, version)?;
                                        if (scope.is_some() || matches!(request.action, Action::CreateContent { .. }))
                                            && matches!(
                                                request.action,
                                                Action::CreateVoyage { .. }
                                                    | Action::CreateFleet { .. }
                                                    | Action::CreatePortal { .. }
                                                    | Action::CreateContent { .. }
                                                    | Action::Split { .. }
                                            )
                                        {
                                            record_created_terminals(
                                                &mut created_contents,
                                                &layout,
                                                &candidate.layout,
                                            );
                                        }
                                        let previous = Arc::clone(&layout);
                                        layout = Arc::new(candidate.layout);
                                        version = revision;
                                        if let Some(owner) = content.as_mut() {
                                            crate::content::initialize_created(owner, &previous, &layout).map_err(Error::Uncertain)?;
                                        } else if layout.contents.iter().any(|item| item.type_id == "notes" && !previous.contents.iter().any(|old| old.id == item.id)) {
                                            return Err(Error::Uncertain("Workspace created Notes, but no content owner is installed".into()));
                                        }
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
                response.created_contents =
                    eligible_contents(&layout, scope.as_ref(), &created_contents);
                response.fresh = fresh;
                if version != previous_version || package_changed {
                    if package_changed {
                        let next = published_packages.load(Ordering::Relaxed).saturating_add(1);
                        published_packages.store(next, Ordering::Relaxed);
                    }
                    if let Some(listener) = &workspace_listener {
                        let _ = listener.try_send(WorkspaceNotice {
                            package_revision: published_packages.load(Ordering::Relaxed),
                            revision: version,
                        });
                    }
                }
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
            package_revision,
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

    pub async fn bind_content(&self, id: ContentId) -> Result<crate::content::Binding, String> {
        let (reply, receive) = async_channel::bounded(1);
        self.sender
            .send(Message::BindContent { id, reply })
            .await
            .map_err(|_| "Content binding unavailable")?;
        receive
            .recv()
            .await
            .map_err(|_| "Content binding unconfirmed".to_owned())?
    }

    pub fn package_revision(&self) -> u64 {
        self.package_revision.load(Ordering::Relaxed)
    }

    pub async fn refresh_content_views(&self) -> Result<(), String> {
        self.sender
            .send(Message::RefreshContentViews)
            .await
            .map_err(|_| "Content refresh unavailable".into())
    }

    pub async fn workspace_changes(
        &self,
        after: Option<WorkspaceNotice>,
    ) -> Result<async_channel::Receiver<WorkspaceNotice>, String> {
        let (reply, receive) = async_channel::bounded(1);
        self.sender
            .send(Message::WorkspaceChanges { after, reply })
            .await
            .map_err(|_| "Workspace observer unavailable")?;
        receive
            .recv()
            .await
            .map_err(|_| "Workspace observer unconfirmed".into())
    }

    pub async fn launches(&self) -> Result<voyager_contract::launch::Catalog, String> {
        let (reply, receive) = async_channel::bounded(1);
        self.sender
            .send(Message::Launches { reply })
            .await
            .map_err(|_| "Worker settings owner is unavailable")?;
        receive
            .recv()
            .await
            .map_err(|_| "Worker settings read was not confirmed")?
    }

    pub async fn bind_content_view(
        &self,
        id: ContentId,
    ) -> Result<crate::content::ViewBinding, String> {
        let binding = self.bind_content(id).await?;
        let (reply, receive) = async_channel::bounded(1);
        self.sender
            .send(Message::RegisterView { binding, reply })
            .await
            .map_err(|_| "Content view registration unavailable".to_owned())?;
        receive
            .recv()
            .await
            .map_err(|_| "Content view registration unconfirmed".to_owned())?
    }

    async fn admit_view(
        &self,
        view: &crate::content::ViewBinding,
        message: Message,
    ) -> Result<(), CallError> {
        use std::future::Future as _;
        let mut sending = std::pin::pin!(self.sender.send(message));
        let mut retired = std::pin::pin!(view.gate.retired.recv());
        let mut published = std::pin::pin!(view.gate.published.recv());
        std::future::poll_fn(|cx| {
            let active = view.lock();
            if *active == crate::content::ViewPhase::Retired {
                return std::task::Poll::Ready(Err(CallError::Rejected(
                    "Notes view was retired; nothing was queued".into(),
                )));
            }
            if *active == crate::content::ViewPhase::Pending {
                let _ = published.as_mut().poll(cx);
                return std::task::Poll::Pending;
            }
            let _ = retired.as_mut().poll(cx);
            sending.as_mut().poll(cx).map(|result| {
                result.map_err(|_| {
                    CallError::Rejected("Content view unavailable; nothing was queued".into())
                })
            })
        })
        .await
    }

    pub async fn view_changed(
        &self,
        view: &crate::content::ViewBinding,
        after: Option<u64>,
    ) -> Result<u64, CallError> {
        use std::future::Future as _;
        let (reply, receive) = async_channel::bounded(1);
        self.admit_view(
            view,
            Message::ContentChanges {
                binding: view.binding.clone(),
                after,
                reply,
            },
        )
        .await?;
        let changes = receive
            .recv()
            .await
            .map_err(|_| CallError::Unconfirmed("Content observer unconfirmed".into()))?
            .map_err(CallError::Rejected)?;
        let mut next = std::pin::pin!(changes.recv());
        let mut retired = std::pin::pin!(view.gate.retired.recv());
        std::future::poll_fn(|cx| {
            if retired.as_mut().poll(cx).is_ready() {
                return std::task::Poll::Ready(Err(CallError::Rejected(
                    "Notes view was retired".into(),
                )));
            }
            next.as_mut().poll(cx).map(|result| {
                result.map_err(|_| CallError::Rejected("Content observer replaced".into()))
            })
        })
        .await
    }

    pub async fn content_changes(
        &self,
        binding: crate::content::Binding,
        after: Option<u64>,
    ) -> Result<async_channel::Receiver<u64>, String> {
        let (reply, receive) = async_channel::bounded(1);
        self.sender
            .send(Message::ContentChanges {
                binding,
                after,
                reply,
            })
            .await
            .map_err(|_| "Content notification subscription unavailable")?;
        receive
            .recv()
            .await
            .map_err(|_| "Content notification subscription unconfirmed".to_owned())?
    }

    pub async fn read_content(
        &self,
        access: crate::content::Access,
        request: voyager_contract::content::Request,
    ) -> Result<Arc<voyager_contract::content::Response>, CallError> {
        self.read_content_inner(access, request, None).await
    }

    pub async fn read_content_view(
        &self,
        view: &crate::content::ViewBinding,
        request: voyager_contract::content::Request,
    ) -> Result<Arc<voyager_contract::content::Response>, CallError> {
        self.read_content_inner(
            crate::content::Access::View(view.binding.clone()),
            request,
            Some(view),
        )
        .await
    }

    async fn read_content_inner(
        &self,
        access: crate::content::Access,
        request: voyager_contract::content::Request,
        view: Option<&crate::content::ViewBinding>,
    ) -> Result<Arc<voyager_contract::content::Response>, CallError> {
        if matches!(&request, voyager_contract::content::Request::Update { .. }) {
            return Err(CallError::Rejected(
                "Updates cannot use read-only admission".into(),
            ));
        }
        check_content_size(&request)?;
        let (reply, receive) = async_channel::bounded(1);
        let message = Message::Content {
            access,
            request,
            reply: ContentReply::Asynchronous(reply),
        };
        if let Some(view) = view {
            self.admit_view(view, message).await?;
        } else {
            self.sender.send(message).await.map_err(|_| {
                CallError::Rejected("Content read unavailable; nothing was queued".into())
            })?;
        }
        receive
            .recv()
            .await
            .map_err(|_| CallError::Unconfirmed("Content read unconfirmed".into()))
    }

    pub fn content(
        &self,
        access: crate::content::Access,
        request: voyager_contract::content::Request,
    ) -> Result<Arc<voyager_contract::content::Response>, CallError> {
        self.content_inner(access, request, None)
    }

    pub fn content_view(
        &self,
        view: &crate::content::ViewBinding,
        request: voyager_contract::content::Request,
    ) -> Result<Arc<voyager_contract::content::Response>, CallError> {
        self.content_inner(
            crate::content::Access::View(view.binding.clone()),
            request,
            Some(view),
        )
    }

    fn content_inner(
        &self,
        access: crate::content::Access,
        request: voyager_contract::content::Request,
        view: Option<&crate::content::ViewBinding>,
    ) -> Result<Arc<voyager_contract::content::Response>, CallError> {
        check_content_size(&request)?;
        let (reply, receive) = mpsc::sync_channel(1);
        let active = view.map(|view| view.lock());
        if active
            .as_ref()
            .is_some_and(|active| **active != crate::content::ViewPhase::Active)
        {
            return Err(CallError::Rejected(
                "Notes view was retired; nothing was queued".into(),
            ));
        }
        self.sender
            .try_send(Message::Content {
                access,
                request,
                reply: ContentReply::Blocking(reply),
            })
            .map_err(|_| {
                CallError::Rejected("Workspace busy; no content operation was queued".into())
            })?;
        drop(active);
        receive.recv_timeout(Duration::from_secs(25)).map_err(|_| {
            CallError::Unconfirmed("Content result unconfirmed; do not repeat the request".into())
        })
    }

    pub fn request_id(&self) -> String {
        format!(
            "workspace-{}-{}",
            self.identity,
            self.sequence.fetch_add(1, Ordering::Relaxed)
        )
    }

    pub async fn context_facts(&self) -> Result<voyager_contract::context::Facts, String> {
        let (reply, receive) = async_channel::bounded(1);
        self.sender
            .send(Message::ContextFacts { reply })
            .await
            .map_err(|_| "Workspace context is unavailable".to_owned())?;
        receive
            .recv()
            .await
            .map_err(|_| "Workspace context read was not confirmed".to_owned())?
    }

    pub fn call(&self, request: Request) -> Result<Response, String> {
        self.bound_call(None, request).map_err(|error| match error {
            CallError::Rejected(message) | CallError::Unconfirmed(message) => message,
        })
    }

    pub fn scoped_call(&self, scope: Context, request: Request) -> Result<Response, CallError> {
        self.bound_call(Some(scope), request)
    }

    pub fn process(
        &self,
        scope: Context,
        request: ProcessRequest,
    ) -> Result<Arc<ProcessResponse>, CallError> {
        let (reply, receive) = mpsc::sync_channel(1);
        self.sender
            .try_send(Message::Process {
                scope,
                request,
                reply,
            })
            .map_err(|_| {
                CallError::Rejected(
                    "Workspace busy or unavailable; no process request was queued".into(),
                )
            })?;
        receive.recv_timeout(Duration::from_secs(25)).map_err(|_| {
            CallError::Unconfirmed("Process result unconfirmed; do not repeat the request".into())
        })
    }

    fn bound_call(&self, scope: Option<Context>, request: Request) -> Result<Response, CallError> {
        self.queue_workspace(scope, request)?.wait()
    }

    pub(crate) fn queue_inspection(&self) -> Result<PendingCall, CallError> {
        self.queue_workspace(
            None,
            Request {
                request_id: self.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            },
        )
    }

    fn queue_workspace(
        &self,
        scope: Option<Context>,
        request: Request,
    ) -> Result<PendingCall, CallError> {
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
        Ok(PendingCall(receive))
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

fn check_content_size(request: &voyager_contract::content::Request) -> Result<(), CallError> {
    if serde_json::to_vec(request)
        .map_err(|error| CallError::Rejected(error.to_string()))?
        .len()
        > crate::content::ENVELOPE_LIMIT
    {
        return Err(CallError::Rejected(
            "Content request exceeds the envelope limit; nothing was queued".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod voice_scope_tests {
    use super::*;

    #[test]
    fn voice_inspection_enters_the_owner_queue_before_later_navigation() {
        let (sender, receive) = async_channel::bounded(8);
        let client = Client {
            sender,
            sequence: Arc::new(AtomicU64::new(0)),
            identity: "voice-scope-test".into(),
            package_revision: Arc::new(AtomicU64::new(0)),
        };
        let _inspection = client.queue_inspection().unwrap();
        let _later = client
            .queue_workspace(
                None,
                Request {
                    request_id: "later-navigation".into(),
                    expected_version: 0,
                    action: Action::Dock {
                        context: Context::Workspace,
                    },
                },
            )
            .unwrap();
        let Message::Workspace { request, scope, .. } = receive.try_recv().unwrap() else {
            panic!("Expected the voice inspection");
        };
        assert!(matches!(request.action, Action::Inspect));
        assert_eq!(request.expected_version, 0);
        assert!(scope.is_none());
        let Message::Workspace { request, .. } = receive.try_recv().unwrap() else {
            panic!("Expected later navigation");
        };
        assert_eq!(request.request_id, "later-navigation");
    }
}

fn settle_created_content(
    pending: &mut Vec<CreatedTerminal>,
    content: &ContentId,
    result: &Result<Viewer, Error>,
) {
    if matches!(result, Err(Error::Uncertain(_))) {
        pending.retain(|item| &item.id != content);
    }
}

fn visible_content(layout: &Layout, content: &ContentId) -> bool {
    if layout.view == voyager_contract::WorkspaceView::Home {
        return false;
    }
    let Some(voyage) = layout
        .voyages
        .iter()
        .find(|voyage| Some(&voyage.id) == layout.selected_voyage.as_ref())
    else {
        return false;
    };
    if voyage
        .portals
        .iter()
        .any(|portal| &portal.content == content)
    {
        return true;
    }
    let Some(fleet) = voyage
        .fleets
        .iter()
        .find(|fleet| Some(&fleet.id) == layout.selected_fleet.as_ref())
    else {
        return false;
    };
    fn contains(
        tree: &voyager_contract::Split,
        fleet: &voyager_contract::Fleet,
        content: &ContentId,
    ) -> bool {
        match tree {
            voyager_contract::Split::Leaf { placement } => fleet
                .vessels
                .iter()
                .any(|vessel| &vessel.id == placement && &vessel.content == content),
            voyager_contract::Split::Branch { first, second, .. } => {
                contains(first, fleet, content) || contains(second, fleet, content)
            }
        }
    }
    contains(&fleet.root, fleet, content)
}

fn record_created_terminals(
    pending: &mut Vec<CreatedTerminal>,
    previous: &Layout,
    current: &Layout,
) {
    pending.extend(
        current
            .contents
            .iter()
            .filter(|item| {
                item.type_id == "terminal" && !previous.contents.iter().any(|old| old.id == item.id)
            })
            .map(|item| CreatedTerminal {
                id: item.id.clone(),
                launch: item.launch.clone().unwrap_or_default(),
            }),
    );
}

fn eligible_contents(
    layout: &Arc<Layout>,
    scope: Option<&Context>,
    pending: &[CreatedTerminal],
) -> Vec<ContentId> {
    let projection = crate::scope::project(layout, scope);
    pending
        .iter()
        .filter(|pending| {
            projection.contents.iter().any(|item| {
                pending.matches(item)
                    && item.type_id == "terminal"
                    && item.backend.is_none()
                    && item.start_pending.is_none()
            })
        })
        .map(|pending| pending.id.clone())
        .collect()
}

fn open_terminal(
    core: &mut Core,
    layout: &mut Arc<Layout>,
    version: &mut u64,
    fresh: &mut bool,
    unconfirmed: &mut HashMap<String, String>,
    created_contents: &mut Vec<CreatedTerminal>,
    request: &TerminalRequest,
) -> Result<Viewer, Error> {
    let content = &request.content_id;
    let request_id = &request.request_id;
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
    let launch = target.launch.clone().unwrap_or_default();
    if target.backend.is_none() {
        let accepted = created_contents
            .iter()
            .find(|pending| &pending.id == content);
        if accepted.is_some_and(|pending| !pending.matches(target)) {
            return Err(rejected(
                "The creation launch changed; no program was started".into(),
            ));
        }
        if !matches!(launch, voyager_contract::launch::Launch::Terminal) && accepted.is_none() {
            return Err(rejected(
                "This saved worker has no new-creation permission; no command was restarted".into(),
            ));
        }
    }
    let mut created = false;
    let address = if let Some(address) = &target.backend {
        address.0.clone()
    } else {
        let operation = format!("voyager-start-{request_id}");
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
        let run = crate::launch::command(&launch, &cwd)
            .map_err(rejected)
            .and_then(|argv| {
                core.terminal_run_with(crate::core_shapes::RunParams {
                    argv,
                    cwd: Some(cwd.clone()),
                    no_parent: true,
                    labels: HashMap::from([("voyager-operation".into(), operation.clone())]),
                    ..Default::default()
                })
            });
        if !matches!(run, Err(Error::Rejected { .. })) {
            created_contents.retain(|item| &item.id != content);
        }
        let started = match run {
            Ok(result) => result,
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
    let attached = core
        .terminal_attach(&address)
        .map_err(|error| attach_failure(error, created, &address))?;
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
    let doc = core.document_get("voyager-layout-v1")?;
    let version = doc.version;
    let value = doc.value;
    if value.is_null() {
        return Ok((Layout::default(), version, true));
    }
    let layout: Layout = serde_json::from_value(value)
        .map_err(|e| rejected(format!("Stored workspace is invalid: {e}")))?;
    crate::canvas::validate(&layout.canvas).map_err(rejected)?;
    Ok((layout, version, false))
}

fn save(core: &mut Core, layout: &Layout, version: u64) -> Result<u64, Error> {
    Ok(core
        .document_set("voyager-layout-v1", layout, version)?
        .version)
}

#[cfg(test)]
mod terminal_outcome_tests {
    use super::*;

    #[test]
    fn automatic_terminal_eligibility_excludes_notes() {
        let mut model = Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Voyage".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        let fleet = model.layout.voyages[0].fleets[0].id.clone();
        let after = model.layout.voyages[0].fleets[0].vessels[0].id.clone();
        let terminal = model.layout.contents[0].id.clone();
        let previous = model.layout.clone();
        model
            .apply(Action::CreateContent {
                launch: None,
                type_id: "notes".into(),
                destination: voyager_contract::ContentDestination::Vessel {
                    fleet: fleet.clone(),
                    after: after.clone(),
                    axis: voyager_contract::Axis::Horizontal,
                },
            })
            .unwrap();
        let notes = model.layout.contents.last().unwrap().id.clone();
        let record = |id| CreatedTerminal {
            id,
            launch: Default::default(),
        };
        let mut pending = vec![record(terminal.clone())];
        record_created_terminals(&mut pending, &previous, &model.layout);
        assert_eq!(pending, vec![record(terminal.clone())]);
        let previous = model.layout.clone();
        model
            .apply(Action::CreateContent {
                launch: None,
                type_id: "terminal".into(),
                destination: voyager_contract::ContentDestination::Vessel {
                    fleet,
                    after,
                    axis: voyager_contract::Axis::Vertical,
                },
            })
            .unwrap();
        let new_terminal = model.layout.contents.last().unwrap().id.clone();
        record_created_terminals(&mut pending, &previous, &model.layout);
        assert_eq!(
            pending,
            vec![record(terminal.clone()), record(new_terminal.clone())]
        );
        let mut layout = Arc::new(model.layout);
        pending.push(record(notes));
        assert_eq!(
            eligible_contents(&layout, None, &pending),
            vec![terminal.clone(), new_terminal.clone()]
        );
        let changed = Arc::make_mut(&mut layout)
            .contents
            .iter_mut()
            .find(|item| item.id == new_terminal)
            .unwrap();
        changed.launch = Some(voyager_contract::launch::Launch::Program {
            argv: vec!["/different".into()],
        });
        assert_eq!(
            eligible_contents(&layout, None, &pending),
            vec![terminal.clone()]
        );
        let changed = Arc::make_mut(&mut layout)
            .contents
            .iter_mut()
            .find(|item| item.id == new_terminal)
            .unwrap();
        changed.launch = Some(voyager_contract::launch::Launch::Terminal);
        assert_eq!(
            eligible_contents(&layout, None, &pending),
            vec![terminal, new_terminal]
        );
    }

    #[test]
    fn uncertain_start_discards_only_its_automatic_eligibility() {
        let first = ContentId("first".into());
        let other = ContentId("other".into());
        let record = |id| CreatedTerminal {
            id,
            launch: Default::default(),
        };
        let mut pending = vec![record(first.clone()), record(other.clone())];
        let refused = Err(Error::Rejected {
            kind: "refused".into(),
            message: "not started".into(),
        });
        settle_created_content(&mut pending, &first, &refused);
        assert_eq!(pending, vec![record(first.clone()), record(other.clone())]);
        let uncertain = Err(Error::Uncertain("marker cleanup not confirmed".into()));
        settle_created_content(&mut pending, &first, &uncertain);
        assert_eq!(pending, vec![record(other)]);
    }

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

#[cfg(test)]
mod content_admission_tests {
    use super::*;
    use std::{
        future::Future,
        task::{Context as TaskContext, Poll, Waker},
    };
    use voyager_contract::content::{
        Notes, Request as ContentRequest, Response as ContentResponse, Version,
    };

    fn fill(client: &Client) {
        for _ in 0..8 {
            let (reply, _) = mpsc::sync_channel(1);
            assert!(
                client
                    .sender
                    .try_send(Message::Workspace {
                        request: Request {
                            request_id: "filler".into(),
                            expected_version: 0,
                            action: Action::Inspect
                        },
                        scope: None,
                        reply
                    })
                    .is_ok()
            );
        }
    }

    fn next(receive: &async_channel::Receiver<Message>) -> Message {
        loop {
            let message = receive.try_recv().unwrap();
            if !matches!(message, Message::Workspace { .. }) {
                return message;
            }
        }
    }

    #[test]
    fn reads_wait_for_queue_space_and_cancel_without_replaying_effects() {
        let directory =
            std::env::temp_dir().join(format!("voyager-n3-mailbox-{}", std::process::id()));
        std::fs::create_dir_all(directory.join("mods/notes")).unwrap();
        std::fs::write(
            directory.join("mods/notes/mod.json"),
            br#"{"name":"Notes"}"#,
        )
        .unwrap();
        let mut owner = crate::content::Owner::open(&directory).unwrap();
        let id = ContentId("notes".into());
        owner.initialize(&id).unwrap();
        let (sender, receive) = async_channel::bounded(8);
        let client = Client {
            sender,
            sequence: Arc::new(AtomicU64::new(0)),
            identity: "mailbox-test".into(),
            package_revision: Arc::new(AtomicU64::new(0)),
        };
        let mut cx = TaskContext::from_waker(Waker::noop());
        fill(&client);
        let mut cancelled = Box::pin(client.bind_content(id.clone()));
        assert!(cancelled.as_mut().poll(&mut cx).is_pending());
        drop(cancelled);
        for _ in 0..8 {
            receive.try_recv().unwrap();
        }
        assert!(receive.is_empty());
        fill(&client);
        let mut binding = Box::pin(client.bind_content(id.clone()));
        assert!(binding.as_mut().poll(&mut cx).is_pending());
        receive.try_recv().unwrap();
        assert!(binding.as_mut().poll(&mut cx).is_pending());
        let Message::BindContent { id, reply } = next(&receive) else {
            panic!("Expected binding");
        };
        reply
            .try_send(
                owner
                    .register_existing(&id)
                    .map_err(|error| error.to_string()),
            )
            .unwrap();
        let Poll::Ready(Ok(binding)) = binding.as_mut().poll(&mut cx) else {
            panic!("Binding did not complete");
        };
        fill(&client);
        let mut subscribed = Box::pin(client.content_changes(binding.clone(), Some(0)));
        assert!(subscribed.as_mut().poll(&mut cx).is_pending());
        receive.try_recv().unwrap();
        assert!(subscribed.as_mut().poll(&mut cx).is_pending());
        let Message::ContentChanges {
            binding: observed,
            after,
            reply,
        } = next(&receive)
        else {
            panic!("Expected subscription");
        };
        reply
            .try_send(Ok(owner.subscribe(&observed, after)))
            .unwrap();
        let Poll::Ready(Ok(changes)) = subscribed.as_mut().poll(&mut cx) else {
            panic!("Subscription did not complete");
        };
        fill(&client);
        let inspect = ContentRequest::Inspect {
            version: Version::V1,
            request_id: "read".into(),
            content_id: id.clone(),
        };
        let mut read =
            Box::pin(client.read_content(crate::content::Access::View(binding.clone()), inspect));
        assert!(read.as_mut().poll(&mut cx).is_pending());
        receive.try_recv().unwrap();
        assert!(read.as_mut().poll(&mut cx).is_pending());
        let Message::Content {
            access,
            request,
            reply,
        } = next(&receive)
        else {
            panic!("Expected read");
        };
        assert_eq!(access, crate::content::Access::View(binding.clone()));
        reply.deliver(Arc::new(owner.call(&binding, request)));
        let Poll::Ready(Ok(snapshot)) = read.as_mut().poll(&mut cx) else {
            panic!("Read did not complete");
        };
        let ContentResponse::Snapshot { snapshot, .. } = &*snapshot else {
            panic!("Expected snapshot");
        };
        let update = ContentRequest::Update {
            version: Version::V1,
            request_id: "update".into(),
            content_id: id,
            expected_revision: snapshot.revision.clone(),
            data: Notes {
                title: "Updated".into(),
                text: "Body".into(),
            },
        };
        assert!(matches!(
            owner.call(&binding, update.clone()),
            ContentResponse::Applied { .. }
        ));
        assert_eq!(changes.try_recv().unwrap(), 1);
        fill(&client);
        assert!(matches!(
            client.content(
                crate::content::Access::View(binding.clone()),
                update.clone()
            ),
            Err(CallError::Rejected(_))
        ));
        let mut forbidden =
            Box::pin(client.read_content(crate::content::Access::View(binding.clone()), update));
        assert!(matches!(
            forbidden.as_mut().poll(&mut cx),
            Poll::Ready(Err(CallError::Rejected(_)))
        ));
        assert_eq!(receive.len(), 8);
        let view = crate::content::ViewBinding::new(binding.clone());
        view.activate().unwrap();
        let inspect = ContentRequest::Inspect {
            version: Version::V1,
            request_id: "retired-read".into(),
            content_id: binding.id().clone(),
        };
        let mut retired = Box::pin(client.read_content_view(&view, inspect.clone()));
        assert!(retired.as_mut().poll(&mut cx).is_pending());
        view.retire();
        assert!(matches!(
            retired.as_mut().poll(&mut cx),
            Poll::Ready(Err(CallError::Rejected(_)))
        ));
        assert_eq!(receive.len(), 8);
        for _ in 0..8 {
            receive.try_recv().unwrap();
        }
        let pending = crate::content::ViewBinding::new(binding.clone());
        let mut staged = Box::pin(client.read_content_view(&pending, inspect.clone()));
        assert!(staged.as_mut().poll(&mut cx).is_pending());
        assert!(receive.is_empty());
        assert!(matches!(
            client.content_view(
                &pending,
                ContentRequest::Inspect {
                    version: Version::V1,
                    request_id: "staged-effect".into(),
                    content_id: binding.id().clone(),
                }
            ),
            Err(CallError::Rejected(_))
        ));
        assert!(receive.is_empty());
        pending.activate().unwrap();
        assert!(staged.as_mut().poll(&mut cx).is_pending());
        let Message::Content { request, reply, .. } = receive.try_recv().unwrap() else {
            panic!("Expected published read")
        };
        reply.deliver(Arc::new(owner.call(&binding, request)));
        assert!(matches!(staged.as_mut().poll(&mut cx), Poll::Ready(Ok(_))));
        let mut observed = Box::pin(client.view_changed(&pending, Some(1)));
        assert!(observed.as_mut().poll(&mut cx).is_pending());
        let Message::ContentChanges { after, reply, .. } = receive.try_recv().unwrap() else {
            panic!("Expected published subscription")
        };
        reply
            .try_send(Ok(owner.subscribe(&binding, after)))
            .unwrap();
        assert!(observed.as_mut().poll(&mut cx).is_pending());
        pending.retire();
        assert!(matches!(
            observed.as_mut().poll(&mut cx),
            Poll::Ready(Err(CallError::Rejected(_)))
        ));
        let ContentResponse::Snapshot { snapshot, .. } = owner.call(&binding, inspect) else {
            panic!("Expected current data")
        };
        let accepted = crate::content::ViewBinding::new(binding.clone());
        accepted.activate().unwrap();
        let request = ContentRequest::Update {
            version: Version::V1,
            request_id: "accepted-save".into(),
            content_id: binding.id().clone(),
            expected_revision: snapshot.revision,
            data: Notes {
                title: "Accepted".into(),
                text: "After retirement".into(),
            },
        };
        let writing = {
            let client = client.clone();
            let view = accepted.clone();
            std::thread::spawn(move || client.content_view(&view, request))
        };
        let Message::Content { request, reply, .. } = receive.recv_blocking().unwrap() else {
            panic!("Expected accepted save")
        };
        accepted.retire();
        reply.deliver(Arc::new(owner.call(&binding, request)));
        assert!(matches!(
            &*writing.join().unwrap().unwrap(),
            ContentResponse::Applied { .. }
        ));
        assert!(receive.is_empty());
        std::fs::remove_dir_all(directory).unwrap();
    }
}
