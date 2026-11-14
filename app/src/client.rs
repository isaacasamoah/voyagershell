use crate::{
    activity::Activity,
    core::{Core, Error, Viewer, WeakViewer},
    workspace::Model,
};
use std::{
    collections::{HashMap, VecDeque},
    sync::{
        Arc, Mutex,
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
    pub activity_revision: u64,
    pub close_revision: u64,
}

enum Message {
    PrepareContext {
        scope: Context,
        version: u64,
    },
    CloseSaves {
        sender: async_channel::Sender<crate::voyage_close::SaveRequest>,
    },
    CloseDone {
        request: Request,
        scope: Option<Context>,
        reply: SyncSender<Response>,
        result: Result<(), Error>,
    },
    ActivityChanged,
    RefreshActivity {
        reply: async_channel::Sender<()>,
    },
    Quit {
        reply: async_channel::Sender<Result<(), Error>>,
    },
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
    WorkspaceObservation {
        scope: Context,
        version: u64,
        active: Option<voyager_contract::PlacementId>,
        reply: async_channel::Sender<
            Result<voyager_contract::observation::WorkspaceObservation, String>,
        >,
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
        close_ticket: Option<crate::voyage_close::SaveTicket>,
        native_save: bool,
    },
    Worktree {
        scope: Option<Context>,
        request: voyager_contract::worktree::Request,
        reply: SyncSender<Arc<voyager_contract::worktree::Response>>,
    },
    WorktreeRemoveReady {
        request_id: String,
        source_directory: String,
        checkout: voyager_contract::worktree::Checkout,
        reply: SyncSender<Result<(), String>>,
    },
    WorktreeDone {
        request_id: String,
        source_directory: String,
        response: voyager_contract::worktree::Response,
        reply: SyncSender<Arc<voyager_contract::worktree::Response>>,
    },
    Process {
        scope: Context,
        request: ProcessRequest,
        reply: SyncSender<Arc<ProcessResponse>>,
        queued_at: std::time::Instant,
    },
    ProcessDone {
        request_id: String,
        result: Result<voyager_contract::administrator::ProcessOutput, Error>,
        reply: SyncSender<Arc<ProcessResponse>>,
    },
    Workspace {
        request: Request,
        scope: Option<Context>,
        reply: SyncSender<Response>,
        queued_at: std::time::Instant,
    },
    NoteExit {
        view: crate::content::ViewBinding,
        revision: String,
        request: Request,
        reply: SyncSender<Response>,
    },
    NoteRenameReady {
        request: Request,
        scope: Option<Context>,
        reply: SyncSender<Response>,
        result: Result<Option<String>, CallError>,
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
    close_plan: Option<voyager_contract::voyage_close::Plan>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct CreatedTerminal {
    id: ContentId,
    launch: voyager_contract::launch::Launch,
    backend: Option<CoreTerminalId>,
    shell_intent: Option<String>,
}

impl CreatedTerminal {
    fn matches(&self, content: &voyager_contract::Content) -> bool {
        self.id == content.id
            && self.backend == content.backend
            && self.shell_intent == content.shell_intent
            && &self.launch
                == content
                    .launch
                    .as_ref()
                    .unwrap_or(&voyager_contract::launch::Launch::Terminal)
    }

    fn eligible(&self, content: &voyager_contract::Content) -> bool {
        self.matches(content)
            && content.type_id == "terminal"
            && (content.backend.is_none() || self.shell_intent.is_some())
            && content.start_pending.is_none()
    }
}

struct ContentReceipt {
    access: crate::content::Access,
    request_id: String,
    fingerprint: [u8; 32],
    result: Arc<voyager_contract::content::Response>,
}

#[derive(Clone, Debug)]
pub enum CallError {
    Rejected(String),
    Unconfirmed(String),
}

pub(crate) struct PendingCall(mpsc::Receiver<Response>, Duration);

impl PendingCall {
    pub(crate) fn wait(self) -> Result<Response, CallError> {
        self.0.recv_timeout(self.1).map_err(|_| {
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
    activity: Arc<Mutex<Activity>>,
    prepared_context: Arc<Mutex<Option<crate::context::Prepared>>>,
}

fn next_message(
    receiver: &async_channel::Receiver<Message>,
    activity: &Arc<Mutex<Activity>>,
    layout: &Layout,
    mut notice: WorkspaceNotice,
    listener: Option<&async_channel::Sender<WorkspaceNotice>>,
) -> Result<Message, async_channel::RecvError> {
    let message = receiver.recv_blocking()?;
    if let Ok(mut activity) = activity.lock() {
        activity.bind(
            layout
                .contents
                .iter()
                .filter_map(|content| content.backend.as_ref().map(|backend| backend.0.as_str())),
        );
        if activity.take_dirty()
            && let Some(listener) = listener
        {
            notice.activity_revision = activity.revision;
            let _ = listener.try_send(notice);
        }
    }
    Ok(message)
}

impl Client {
    pub(crate) fn conversation_focus(
        &self,
        layout: &Layout,
        version: u64,
    ) -> Result<voyager_contract::conversation::Focus, String> {
        let mut focus = crate::conversation::focus(layout, version)?;
        focus.preview = self.prepared_context.lock().ok().and_then(|prepared| {
            prepared
                .as_ref()
                .and_then(|prepared| prepared.preview(&focus))
        });
        Ok(focus)
    }
    pub fn reported_activity(&self) -> voyager_contract::activity::Projection {
        self.activity
            .lock()
            .map(|activity| activity.projection())
            .unwrap_or_else(|_| voyager_contract::activity::Projection {
                reason: Some("Activity observation is unavailable".into()),
                ..Default::default()
            })
    }

    pub async fn refresh_activity(&self) -> Result<(), String> {
        let (reply, result) = async_channel::bounded(1);
        self.sender
            .try_send(Message::RefreshActivity { reply })
            .map_err(|_| "Workspace owner is unavailable".to_owned())?;
        result
            .recv()
            .await
            .map_err(|_| "Activity refresh is unconfirmed".to_owned())
    }

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
        let activity = Arc::new(Mutex::new(Activity::default()));
        let observed_activity = activity.clone();
        let activity_sender = sender.clone();
        let worktree_sender = sender.clone();
        let process_sender = sender.clone();
        let prepared_context = Arc::new(Mutex::new(None));
        let published_context = prepared_context.clone();
        let client = Self {
            sender: sender.clone(),
            sequence: Arc::new(AtomicU64::new(0)),
            package_revision,
            activity,
            prepared_context,
            identity: format!(
                "{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
            ),
        };
        let close_client = client.clone();
        let close_sender = sender.clone();
        thread::spawn(move || {
            let mut core = Core::connect_activity(&session, observed_activity.clone());
            if let Ok(core) = &mut core {
                core.observe_activity(Box::new(move || {
                    let _ = activity_sender.try_send(Message::ActivityChanged);
                }));
            }
            let mut layout = Arc::new(Layout::default());
            let mut version = 0;
            let mut fresh = false;
            let mut receipts: VecDeque<(Request, Option<Context>, Outcome)> = VecDeque::new();
            let mut unconfirmed = HashMap::<String, String>::new();
            let mut created_contents = Vec::<CreatedTerminal>::new();
            let mut reopened = false;
            let mut live_bindings = Vec::<CoreTerminalId>::new();
            let mut terminal_requests: VecDeque<(TerminalRequest, Result<WeakViewer, Error>)> =
                VecDeque::new();
            let mut process_requests: VecDeque<(
                Context,
                ProcessRequest,
                Option<Arc<ProcessResponse>>,
            )> = VecDeque::new();
            let mut content_requests: VecDeque<ContentReceipt> = VecDeque::new();
            let mut worktree_requests: VecDeque<(
                Option<Context>,
                voyager_contract::worktree::Request,
                Option<Arc<voyager_contract::worktree::Response>>,
            )> = VecDeque::new();
            let mut workspace_listener: Option<async_channel::Sender<WorkspaceNotice>> = None;
            let mut quit_result: Option<Result<(), Error>> = None;
            let mut closing = crate::voyage_close::Closing::default();
            let mut renaming: Option<(
                crate::voyage_close::SaveTicket,
                crate::content::rename::Plan,
                crate::voyage_close::RenameRelease,
            )> = None;
            while let Ok(message) = next_message(
                &receiver,
                &observed_activity,
                &layout,
                WorkspaceNotice {
                    revision: version,
                    package_revision: published_packages.load(Ordering::Relaxed),
                    activity_revision: 0,
                    close_revision: closing.revision,
                },
                workspace_listener.as_ref(),
            ) {
                let mut note_exit = None;
                let mut rename_ready = None;
                let mut rename_rebind = None;
                let mut rename_release = None;
                let (request, scope, reply) = match message {
                    Message::PrepareContext {
                        scope,
                        version: expected,
                    } => {
                        if fresh
                            && version == expected
                            && layout.context == scope
                            && let Ok(core) = core.as_mut()
                        {
                            let started = std::time::Instant::now();
                            let result =
                                crate::context::prepare(&layout, version, core, content.as_mut());
                            if let Ok(mut prepared) = published_context.lock() {
                                *prepared = result.ok();
                            }
                            if std::env::var_os("VOYAGER_TRACE_TOOLS").is_some() {
                                eprintln!(
                                    "voyager_timing operation=dock-preview elapsed_us={}",
                                    started.elapsed().as_micros()
                                );
                            }
                        }
                        continue;
                    }
                    Message::NoteRenameReady {
                        request,
                        scope,
                        reply,
                        result,
                    } => {
                        if renaming.as_ref().is_some_and(|(ticket, _, _)| {
                            *ticket == crate::voyage_close::SaveTicket::new(&request.request_id)
                        }) {
                            rename_ready = renaming.take().map(|(ticket, plan, release)| {
                                rename_release = Some(release);
                                (ticket, plan, result)
                            });
                            receipts.retain(|(prior, _, _)| prior.request_id != request.request_id);
                        }
                        (request, scope, reply)
                    }
                    Message::CloseSaves { sender } => {
                        closing.saves = Some(sender);
                        continue;
                    }
                    Message::CloseDone {
                        request,
                        scope,
                        reply,
                        result,
                    } => {
                        let result = result.and_then(|()| {
                            closing.check_layout(&layout)?;
                            let plan = closing
                                .plan
                                .as_ref()
                                .ok_or_else(|| rejected("Close plan is unavailable".into()))?;
                            crate::scope::check(
                                &layout,
                                scope.as_ref(),
                                &Action::CloseVoyage {
                                    id: plan.voyage.clone(),
                                },
                            )
                            .map_err(rejected)?;
                            let mut candidate = Model {
                                layout: (*layout).clone(),
                            };
                            candidate
                                .apply(Action::CloseVoyage {
                                    id: plan.voyage.clone(),
                                })
                                .map_err(rejected)?;
                            let connected = core.as_mut().map_err(|error| error.clone())?;
                            let saved = save(connected, &candidate.layout, version)?;
                            live_bindings.retain(|address| !closing.owns_terminal(address));
                            layout = Arc::new(candidate.layout);
                            version = saved;
                            if let Some(owner) = content.as_mut() {
                                owner.refresh_views();
                            }
                            Ok(())
                        });
                        if matches!(result, Err(Error::Uncertain(_))) {
                            fresh = false;
                        }
                        let status = match &result {
                            Ok(()) => Status::Applied,
                            Err(Error::Rejected { .. }) => Status::Rejected,
                            Err(Error::Uncertain(_)) => Status::Uncertain,
                        };
                        closing.finish(result);
                        let plan = closing.projected(&layout, scope.as_ref());
                        let response = Response {
                            request_id: request.request_id.clone(),
                            status: status.clone(),
                            version,
                            layout: crate::scope::project(&layout, scope.as_ref()),
                            fresh,
                            created_workspace: false,
                            created_contents: eligible_contents(
                                &layout,
                                scope.as_ref(),
                                &created_contents,
                            ),
                            message: plan.as_ref().and_then(|plan| plan.message.clone()),
                            close_plan: plan.clone(),
                        };
                        if let Some((_, _, receipt)) = receipts
                            .iter_mut()
                            .find(|(prior, _, _)| prior.request_id == request.request_id)
                        {
                            *receipt = Outcome {
                                status,
                                message: response.message.clone(),
                                created_workspace: false,
                                close_plan: plan,
                            };
                        }
                        if let Some(listener) = &workspace_listener {
                            let _ = listener.try_send(WorkspaceNotice {
                                revision: version,
                                close_revision: closing.revision,
                                package_revision: published_packages.load(Ordering::Relaxed),
                                activity_revision: core
                                    .as_ref()
                                    .map(Core::activity_revision)
                                    .unwrap_or(0),
                            });
                        }
                        let _ = reply.send(response);
                        continue;
                    }
                    Message::ActivityChanged => continue,
                    Message::RefreshActivity { reply } => {
                        if quit_result.is_none()
                            && let Ok(core) = &mut core
                        {
                            core.refresh_activity();
                        }
                        let _ = reply.try_send(());
                        continue;
                    }
                    Message::Quit { reply } => {
                        let result = quit_result.get_or_insert_with(|| {
                            core.as_mut().map_err(|error| error.clone())?.quit()
                        });
                        created_contents.clear();
                        fresh = false;
                        let _ = reply.try_send(result.clone());
                        continue;
                    }
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
                    Message::WorkspaceObservation {
                        scope,
                        version: expected,
                        active,
                        reply,
                    } => {
                        let result = (|| -> Result<voyager_contract::observation::WorkspaceObservation, String> {
                            if !fresh || expected != version { return Err("Workspace changed; observe it again".into()); }
                            let terminals = core.as_mut().ok().and_then(|core| core.terminal_list().ok());
                            if let Some(terminals) = &terminals {
                                let names = crate::observation::voyage_names(&layout, terminals);
                                if !names.is_empty() || terminals.iter().any(|terminal| terminal.has_exited()
                                    && live_bindings.iter().any(|id| id.0 == terminal.address)) {
                                let mut candidate = Model { layout: (*layout).clone() };
                                let renamed = !names.is_empty();
                                for (id, name) in names {
                                    if let Some(voyage) = candidate.layout.voyages.iter_mut().find(|voyage| voyage.id == id) {
                                        voyage.name = name;
                                    }
                                }
                                let live: Vec<_> = live_bindings.iter().filter(|address| !closing.owns_terminal(address)).cloned().collect();
                                if crate::terminal_lifecycle::close_exited(&mut candidate, terminals, &live)? || renamed {
                                    let current_core = core.as_mut().map_err(|error| format!("{error:?}"))?;
                                    match save(current_core, &candidate.layout, version) {
                                        Ok(saved) => { version = saved; layout = Arc::new(candidate.layout); }
                                        Err(error) => { fresh = false; return Err(format!("Exited panel closure unconfirmed: {error:?}")); }
                                    }
                                    if let Some(listener) = &workspace_listener {
                                        let _ = listener.try_send(WorkspaceNotice { revision: version, close_revision: closing.revision,
                                            package_revision: published_packages.load(Ordering::Relaxed),
                                            activity_revision: current_core.activity_revision() });
                                    }
                                }
                                }
                                live_bindings = terminals.iter().filter(|terminal| terminal.is_live())
                                    .map(|terminal| CoreTerminalId(terminal.address.clone())).collect();
                            }
                            crate::observation::capture(&layout, version, &scope, active, terminals.as_deref())
                        })();
                        let _ = reply.try_send(result);
                        continue;
                    }
                    Message::WorkspaceChanges { after, reply } => {
                        let (send, receive) = async_channel::bounded(1);
                        let current = WorkspaceNotice {
                            close_revision: closing.revision,
                            revision: version,
                            activity_revision: core
                                .as_ref()
                                .map(Core::activity_revision)
                                .unwrap_or(0),
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
                                load(core, &cwd).map_err(|error| format!("{error:?}"))?;
                            layout = Arc::new(current);
                            version = revision;
                            fresh = true;
                            crate::content::member(&layout, None, &id)?;
                            let owner = content.as_mut().ok_or("Content owner unavailable")?;
                            let binding = crate::content::register_content(owner, &layout, &id)?;
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
                        close_ticket,
                        native_save,
                    } => {
                        let previous_version = version;
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
                            if renaming.as_ref().is_some_and(|(ticket, plan, _)| {
                                plan.contents.contains(crate::content::identity(&request).0)
                                    && !matches!(
                                        request,
                                        voyager_contract::content::Request::Inspect { .. }
                                            | voyager_contract::content::Request::Describe { .. }
                                            | voyager_contract::content::Request::ListNotes { .. }
                                    )
                                    && !(native_save && close_ticket.as_ref() == Some(ticket))
                            }) {
                                return Err(
                                    "This Note is being renamed; wait for the saved result".into(),
                                );
                            }
                            if matches!(
                                request,
                                voyager_contract::content::Request::Update { .. }
                                    | voyager_contract::content::Request::Configure { .. }
                                    | voyager_contract::content::Request::MigrateNote { .. }
                                    | voyager_contract::content::Request::NewNote { .. }
                                    | voyager_contract::content::Request::OpenNote { .. }
                            ) && closing.blocks_content(
                                crate::content::identity(&request).0,
                                close_ticket.as_ref(),
                                native_save,
                            ) {
                                return Err(
                                    "This Voyage is closing; its Notes are temporarily read-only"
                                        .into(),
                                );
                            }
                            if quit_result.is_some()
                                && matches!(
                                    request,
                                    voyager_contract::content::Request::Update { .. }
                                        | voyager_contract::content::Request::Configure { .. }
                                        | voyager_contract::content::Request::MigrateNote { .. }
                                        | voyager_contract::content::Request::NewNote { .. }
                                        | voyager_contract::content::Request::OpenNote { .. }
                                )
                            {
                                return Err("Voyager is quitting; no content was changed".into());
                            }
                            if request_id.is_empty()
                                || request_id.len() > 128
                                || expected.is_some_and(|revision| {
                                    revision.is_empty() || revision.len() > 128
                                })
                            {
                                return Err("Invalid content request identity".into());
                            }
                            if worktree_requests
                                .iter()
                                .any(|(_, prior, _)| prior.request_id == request_id)
                                || receipts
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
                                load(core, &cwd).map_err(|error| format!("{error:?}"))?;
                            layout = Arc::new(current);
                            version = revision;
                            fresh = true;
                            let owner = content.as_mut().ok_or("Content owner unavailable")?;
                            if matches!(
                                request,
                                voyager_contract::content::Request::MigrateNote { .. }
                                    | voyager_contract::content::Request::NewNote { .. }
                                    | voyager_contract::content::Request::OpenNote { .. }
                            ) {
                                return Ok(select_note(
                                    core,
                                    &mut layout,
                                    &mut version,
                                    &mut fresh,
                                    owner,
                                    &access,
                                    &request,
                                ));
                            }
                            if matches!(
                                request,
                                voyager_contract::content::Request::Configure { .. }
                            ) {
                                return Ok(configure(
                                    core,
                                    &mut layout,
                                    &mut version,
                                    &mut fresh,
                                    owner,
                                    &access,
                                    &request,
                                ));
                            }
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
                        if (matches!(
                            &*response,
                            voyager_contract::content::Response::Configured { .. }
                                | voyager_contract::content::Response::NoteOpened { .. }
                        ) || (matches!(
                            request,
                            voyager_contract::content::Request::Configure { .. }
                                | voyager_contract::content::Request::NewNote { .. }
                                | voyager_contract::content::Request::OpenNote { .. }
                                | voyager_contract::content::Request::MigrateNote { .. }
                        ) && matches!(
                            &*response,
                            voyager_contract::content::Response::Uncertain { .. }
                        ))) && let Some(owner) = content.as_mut()
                        {
                            owner.notify(&response);
                        }
                        if version != previous_version
                            && let Some(owner) = content.as_mut()
                        {
                            owner.refresh_views();
                        }
                        if version != previous_version
                            && let Some(listener) = &workspace_listener
                        {
                            let _ = listener.try_send(WorkspaceNotice {
                                close_revision: closing.revision,
                                package_revision: published_packages.load(Ordering::Relaxed),
                                revision: version,
                                activity_revision: core
                                    .as_ref()
                                    .map(Core::activity_revision)
                                    .unwrap_or(0),
                            });
                        }
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
                    Message::WorktreeRemoveReady {
                        request_id,
                        source_directory,
                        checkout,
                        reply,
                    } => {
                        let preflight = (|| -> Result<(), String> {
                            let (scope, request, _) = worktree_requests
                                .iter()
                                .find(|(_, request, result)| {
                                    request.request_id == request_id && result.is_none()
                                })
                                .ok_or("Worktree request is no longer pending")?;
                            if quit_result.is_some() {
                                return Err("Voyager is quitting; no worktree was removed".into());
                            }
                            let core = core
                                .as_mut()
                                .map_err(|error| format!("Core unavailable: {error:?}"))?;
                            let (current, revision, missing) = load(core, &cwd)
                                .map_err(|error| format!("Workspace unavailable: {error:?}"))?;
                            layout = Arc::new(current);
                            version = revision;
                            fresh = !missing;
                            if missing || version != request.expected_version {
                                return Err("Workspace changed; no worktree was removed".into());
                            }
                            if !matches!(scope, None | Some(Context::Workspace))
                                && !matches!(scope, Some(Context::Voyage { id }) if id == &request.voyage)
                            {
                                return Err(
                                    "Captured focus no longer authorizes this Voyage".into()
                                );
                            }
                            let source = layout
                                .voyages
                                .iter()
                                .find(|voyage| voyage.id == request.voyage)
                                .and_then(|voyage| voyage.cwd.as_deref())
                                .ok_or("Source Voyage is unavailable")?;
                            let original = std::fs::canonicalize(&source_directory)
                                .map_err(|error| error.to_string())?;
                            let current =
                                std::fs::canonicalize(source).map_err(|error| error.to_string())?;
                            if original != current {
                                return Err(
                                    "Source Voyage directory changed; no worktree was removed"
                                        .into(),
                                );
                            }
                            let mut live = Vec::new();
                            for terminal in core.terminal_list().map_err(|error| {
                                format!("Cannot check live process directories: {error:?}")
                            })? {
                                if terminal.is_live() {
                                    if terminal.cwd.is_empty() {
                                        return Err("A live terminal directory is unavailable; no worktree was removed".into());
                                    }
                                    live.push(terminal.cwd);
                                    let foreground = terminal.foreground.ok_or("A live foreground process directory is unavailable; no worktree was removed")?;
                                    if foreground.cwd.is_empty() {
                                        return Err("A live foreground process directory is unavailable; no worktree was removed".into());
                                    }
                                    live.push(foreground.cwd);
                                }
                            }
                            crate::worktrees::check_live_directories(&checkout.path, &live)
                                .map_err(|error| format!("{error:?}"))?;
                            Ok(())
                        })();
                        let _ = reply.send(preflight);
                        continue;
                    }
                    Message::WorktreeDone {
                        request_id,
                        source_directory,
                        mut response,
                        reply,
                    } => {
                        use voyager_contract::worktree::{
                            Action as WorktreeAction, Status as WorktreeStatus,
                        };
                        if let Some((scope, request, result)) = worktree_requests
                            .iter_mut()
                            .find(|(_, request, _)| request.request_id == request_id)
                        {
                            if response.status == WorktreeStatus::Applied
                                && matches!(
                                    request.action,
                                    WorktreeAction::Create { .. }
                                        | WorktreeAction::Open { .. }
                                        | WorktreeAction::Remove { .. }
                                )
                            {
                                let completion = (|| -> Result<(), String> {
                                    if quit_result.is_some() {
                                        return Err("Voyager is quitting".into());
                                    }
                                    let checkout = response
                                        .checkouts
                                        .first()
                                        .ok_or("Git did not return the selected checkout")?;
                                    let core = core
                                        .as_mut()
                                        .map_err(|error| format!("Core unavailable: {error:?}"))?;
                                    let (current, revision, missing) =
                                        load(core, &cwd).map_err(|error| {
                                            format!("Workspace unavailable: {error:?}")
                                        })?;
                                    layout = Arc::new(current);
                                    version = revision;
                                    fresh = !missing;
                                    if missing {
                                        return Err("Workspace is unavailable".into());
                                    }
                                    if version != request.expected_version {
                                        return Err("Workspace changed after Git dispatch".into());
                                    }
                                    let current_source = layout
                                        .voyages
                                        .iter()
                                        .find(|voyage| voyage.id == request.voyage)
                                        .and_then(|voyage| voyage.cwd.as_deref())
                                        .ok_or("Source Voyage is unavailable")?;
                                    let removing =
                                        matches!(request.action, WorktreeAction::Remove { .. });
                                    if removing {
                                        if current_source != source_directory {
                                            return Err("Source Voyage directory changed".into());
                                        }
                                    } else {
                                        let original = std::fs::canonicalize(&source_directory)
                                            .map_err(|error| {
                                                format!("Source directory unavailable: {error}")
                                            })?;
                                        let current = std::fs::canonicalize(current_source)
                                            .map_err(|error| {
                                                format!(
                                                    "Current Voyage directory unavailable: {error}"
                                                )
                                            })?;
                                        if original != current {
                                            return Err("Source Voyage directory changed".into());
                                        }
                                    }
                                    let mut candidate = Model {
                                        layout: (*layout).clone(),
                                    };
                                    let actions =
                                        if let WorktreeAction::Remove { path } = &request.action {
                                            candidate
                                                .layout
                                                .voyages
                                                .iter()
                                                .filter(|voyage| {
                                                    voyage.cwd.as_ref().is_some_and(|cwd| {
                                                        std::path::Path::new(cwd).starts_with(path)
                                                    })
                                                })
                                                .map(|voyage| Action::CloseVoyage {
                                                    id: voyage.id.clone(),
                                                })
                                                .collect::<Vec<_>>()
                                        } else {
                                            vec![worktree_voyage_action(
                                                &candidate.layout,
                                                &checkout.path,
                                            )?]
                                        };
                                    for action in actions {
                                        crate::scope::check(&layout, scope.as_ref(), &action)?;
                                        candidate.apply(action)?;
                                    }
                                    let saved = save(core, &candidate.layout, version).map_err(
                                        |error| format!("Workspace save not confirmed: {error:?}"),
                                    )?;
                                    record_created_terminals(
                                        &mut created_contents,
                                        &layout,
                                        &candidate.layout,
                                    );
                                    layout = Arc::new(candidate.layout);
                                    version = saved;
                                    if let Some(owner) = content.as_mut() {
                                        owner.refresh_views();
                                    }
                                    if let Some(listener) = &workspace_listener {
                                        let _ = listener.try_send(WorkspaceNotice {
                                            close_revision: closing.revision,
                                            revision: version,
                                            package_revision: published_packages
                                                .load(Ordering::Relaxed),
                                            activity_revision: core.activity_revision(),
                                        });
                                    }
                                    Ok(())
                                })();
                                if let Err(error) = completion {
                                    response.status = WorktreeStatus::Uncertain;
                                    response.message = Some(format!(
                                        "Git completed, but updating its Voyage was not confirmed: {error}. Inspect the checkout and workspace; do not repeat creation."
                                    ));
                                }
                            }
                            let answer = Arc::new(response);
                            *result = Some(Arc::clone(&answer));
                            let _ = reply.send(answer);
                        }
                        continue;
                    }
                    Message::Worktree {
                        scope,
                        request,
                        reply,
                    } => {
                        use voyager_contract::worktree::{
                            Action as WorktreeAction, Response as WorktreeResponse,
                            Status as WorktreeStatus,
                        };
                        let rejected = |message: String| {
                            Arc::new(WorktreeResponse {
                                request_id: request.request_id.clone(),
                                status: WorktreeStatus::Rejected,
                                message: Some(message),
                                checkouts: Vec::new(),
                            })
                        };
                        if let Some((previous_scope, previous, result)) = worktree_requests
                            .iter()
                            .find(|(_, prior, _)| prior.request_id == request.request_id)
                        {
                            let answer = if previous != &request || previous_scope != &scope {
                                rejected("Worktree request identity was reused with different arguments or scope".into())
                            } else {
                                result.clone().unwrap_or_else(|| {
                                    Arc::new(WorktreeResponse {
                                        request_id: request.request_id.clone(),
                                        status: WorktreeStatus::Uncertain,
                                        message: Some(
                                            "Worktree request is still pending; do not repeat"
                                                .into(),
                                        ),
                                        checkouts: Vec::new(),
                                    })
                                })
                            };
                            let _ = reply.send(answer);
                            continue;
                        }
                        let prepared = (|| -> Result<(String, Vec<String>), String> {
                            if request.request_id.is_empty() || request.request_id.len() > 128 {
                                return Err("Invalid worktree request identity".into());
                            }
                            if quit_result.is_some() {
                                return Err(
                                    "Voyager is quitting; no worktree operation was dispatched"
                                        .into(),
                                );
                            }
                            if worktree_requests
                                .iter()
                                .any(|(_, _, result)| result.is_none())
                            {
                                return Err("A worktree operation is already pending".into());
                            }
                            if !fresh || version != request.expected_version {
                                return Err(
                                    "Inspect the current workspace before using worktrees".into()
                                );
                            }
                            if receipts
                                .iter()
                                .any(|(prior, _, _)| prior.request_id == request.request_id)
                                || content_requests
                                    .iter()
                                    .any(|prior| prior.request_id == request.request_id)
                                || process_requests
                                    .iter()
                                    .any(|(_, prior, _)| prior.request_id == request.request_id)
                                || terminal_requests
                                    .iter()
                                    .any(|(prior, _)| prior.request_id == request.request_id)
                            {
                                return Err(
                                    "This request identity belongs to another operation".into()
                                );
                            }
                            if !matches!(&scope, None | Some(Context::Workspace))
                                && !matches!(&scope, Some(Context::Voyage { id }) if id == &request.voyage)
                            {
                                return Err(
                                    "The request's captured focus does not authorize this Voyage"
                                        .into(),
                                );
                            }
                            let core = core
                                .as_mut()
                                .map_err(|error| format!("Core unavailable: {error:?}"))?;
                            let (current, revision, missing) = load(core, &cwd)
                                .map_err(|error| format!("Workspace unavailable: {error:?}"))?;
                            layout = Arc::new(current);
                            version = revision;
                            if missing || version != request.expected_version {
                                return Err(
                                    "Workspace changed; inspect before using worktrees".into()
                                );
                            }
                            let voyage = layout
                                .containers()
                                .find(|voyage| voyage.id == request.voyage)
                                .ok_or("Voyage not found")?;
                            let directory = voyage
                                .cwd
                                .clone()
                                .filter(|value| !value.is_empty())
                                .ok_or("Voyage working directory is unavailable")?;
                            if matches!(request.action, WorktreeAction::Create { .. }) {
                                crate::scope::check(
                                    &layout,
                                    scope.as_ref(),
                                    &Action::CreateVoyage {
                                        name: "worktree".into(),
                                        cwd: directory.clone(),
                                    },
                                )?;
                            }
                            Ok((directory, Vec::new()))
                        })();
                        match prepared {
                            Err(message) => {
                                let _ = reply.send(rejected(message));
                            }
                            Ok((directory, live)) => {
                                let task_request = request.clone();
                                let task_sender = worktree_sender.clone();
                                worktree_requests.push_back((scope, request, None));
                                if worktree_requests.len() > 32
                                    && worktree_requests
                                        .front()
                                        .is_some_and(|(_, _, result)| result.is_some())
                                {
                                    worktree_requests.pop_front();
                                }
                                thread::spawn(move || {
                                    let result = if let WorktreeAction::Remove { path } =
                                        &task_request.action
                                    {
                                        (|| {
                                            let checkout = crate::worktrees::open(
                                                std::path::Path::new(&directory),
                                                path,
                                            )?;
                                            if checkout.main {
                                                return Err(crate::worktrees::Error::Rejected(
                                                    "Cannot remove the main checkout".into(),
                                                ));
                                            }
                                            let (approval, receive) = mpsc::sync_channel(1);
                                            task_sender.send_blocking(Message::WorktreeRemoveReady { request_id: task_request.request_id.clone(), source_directory: directory.clone(), checkout: checkout.clone(), reply: approval }).map_err(|_| crate::worktrees::Error::Rejected("Owner unavailable; no worktree was removed".into()))?;
                                            receive.recv().map_err(|_| crate::worktrees::Error::Rejected("Owner check unavailable; no worktree was removed".into()))?.map_err(crate::worktrees::Error::Rejected)?;
                                            crate::worktrees::remove(
                                                std::path::Path::new(&directory),
                                                &checkout.path,
                                            )
                                        })()
                                    } else {
                                        crate::worktrees::execute(
                                            std::path::Path::new(&directory),
                                            &task_request.action,
                                            &live,
                                        )
                                    };
                                    let (status, message, checkouts) = match result {
                                        Ok(checkouts) => (WorktreeStatus::Applied, None, checkouts),
                                        Err(crate::worktrees::Error::Rejected(message)) => {
                                            (WorktreeStatus::Rejected, Some(message), Vec::new())
                                        }
                                        Err(crate::worktrees::Error::Uncertain(message)) => {
                                            (WorktreeStatus::Uncertain, Some(message), Vec::new())
                                        }
                                    };
                                    let response = WorktreeResponse {
                                        request_id: task_request.request_id.clone(),
                                        status,
                                        message,
                                        checkouts,
                                    };
                                    let _ = task_sender.send_blocking(Message::WorktreeDone {
                                        request_id: task_request.request_id,
                                        source_directory: directory,
                                        response,
                                        reply,
                                    });
                                });
                            }
                        }
                        continue;
                    }
                    Message::Process {
                        scope,
                        request,
                        reply,
                        queued_at,
                    } => {
                        if std::env::var_os("VOYAGER_TRACE_TOOLS").is_some() {
                            eprintln!(
                                "voyager_timing request={} family=process phase=actor-receive queued_us={}",
                                request.request_id,
                                queued_at.elapsed().as_micros()
                            );
                        }
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
                            let outcome = if prior != &request || prior_scope != &scope {
                                response.message = Some("Process request identity was reused with different arguments or scope".into());
                                Arc::new(response)
                            } else if let Some(result) = result {
                                Arc::clone(result)
                            } else {
                                response.message = Some(
                                    "Process request is still pending; it was not repeated".into(),
                                );
                                Arc::new(response)
                            };
                            let _ = reply.send(outcome);
                            continue;
                        }
                        let result = if quit_result.is_some()
                            && !matches!(
                                request.input.action,
                                voyager_contract::administrator::ProcessAction::List
                                    | voyager_contract::administrator::ProcessAction::Read { .. }
                            ) {
                            Err(rejected(
                                "Voyager is quitting; no process effect was dispatched".into(),
                            ))
                        } else if request.request_id.is_empty() || request.request_id.len() > 128 {
                            Err(rejected("Invalid process request identity".into()))
                        } else if worktree_requests
                            .iter()
                            .any(|(_, prior, _)| prior.request_id == request.request_id)
                        {
                            Err(rejected(
                                "This request identity belongs to a worktree operation".into(),
                            ))
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
                        } else if process_requests
                            .iter()
                            .filter(|(_, _, result)| result.is_none())
                            .count()
                            >= 8
                            && !matches!(
                                request.input.action,
                                voyager_contract::administrator::ProcessAction::List
                                    | voyager_contract::administrator::ProcessAction::Read { .. }
                            )
                        {
                            Err(rejected(
                                "Process request limit reached; no effect was queued".into(),
                            ))
                        } else if !fresh || version != request.input.expected_version {
                            Err(rejected(
                                "Inspect the current workspace revision before using processes"
                                    .into(),
                            ))
                        } else {
                            match core.as_mut() {
                                    Ok(core) => load(core, &cwd).and_then(|(current, revision, _)| {
                                        layout = Arc::new(current);
                                        version = revision;
                                        if version != request.input.expected_version {
                                            return Err(rejected("Workspace revision changed before process dispatch; inspect again".into()));
                                        }
                                        crate::process::start(core, &layout, &scope, &request.input.action)
                                    }),
                                    Err(error) => Err(error.clone()),
                                }
                        };
                        if process_requests.len() >= 32
                            && let Some(index) = process_requests
                                .iter()
                                .position(|(_, _, result)| result.is_some())
                        {
                            process_requests.remove(index);
                        }
                        match result {
                            Ok(crate::process::Started::Waiting(effect)) => {
                                process_requests.push_back((scope, request.clone(), None));
                                let sender = process_sender.clone();
                                thread::spawn(move || {
                                    let result = effect.wait();
                                    let _ = sender.send_blocking(Message::ProcessDone {
                                        request_id: request.request_id,
                                        result,
                                        reply,
                                    });
                                });
                            }
                            Ok(crate::process::Started::Ready(output)) => {
                                let outcome = process_response(
                                    request.request_id.clone(),
                                    version,
                                    &mut fresh,
                                    Ok(output),
                                );
                                process_requests.push_back((
                                    scope,
                                    request,
                                    Some(Arc::clone(&outcome)),
                                ));
                                let _ = reply.send(outcome);
                            }
                            Err(error) => {
                                let output = Err(error);
                                let outcome = process_response(
                                    request.request_id.clone(),
                                    version,
                                    &mut fresh,
                                    output,
                                );
                                process_requests.push_back((
                                    scope,
                                    request,
                                    Some(Arc::clone(&outcome)),
                                ));
                                let _ = reply.send(outcome);
                            }
                        }
                        continue;
                    }
                    Message::ProcessDone {
                        request_id,
                        result,
                        reply,
                    } => {
                        let outcome =
                            process_response(request_id.clone(), version, &mut fresh, result);
                        if let Some((_, _, receipt)) = process_requests
                            .iter_mut()
                            .find(|(_, request, _)| request.request_id == request_id)
                        {
                            *receipt = Some(Arc::clone(&outcome));
                        }
                        let _ = reply.send(outcome);
                        continue;
                    }
                    Message::Workspace {
                        request,
                        scope,
                        reply,
                        queued_at,
                    } => {
                        if std::env::var_os("VOYAGER_TRACE_TOOLS").is_some() {
                            eprintln!(
                                "voyager_timing request={} family=workspace phase=actor-receive queued_us={}",
                                request.request_id,
                                queued_at.elapsed().as_micros()
                            );
                        }
                        (request, scope, reply)
                    }
                    Message::NoteExit {
                        view,
                        revision,
                        request,
                        reply,
                    } => {
                        note_exit = Some((view, revision));
                        (request, None, reply)
                    }
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
                                outcome.clone().and_then(|viewer| viewer.upgrade())
                            } else {
                                Err(rejected(
                                    "Terminal request identity was reused with different content"
                                        .into(),
                                ))
                            }
                        } else if quit_result.is_some() {
                            Err(rejected(
                                "Voyager is quitting; no terminal was opened".into(),
                            ))
                        } else if worktree_requests
                            .iter()
                            .any(|(_, prior, _)| prior.request_id == request_id)
                        {
                            Err(rejected(
                                "This request identity belongs to a worktree operation".into(),
                            ))
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
                        } else if closing.blocks_terminal(&content) {
                            Err(rejected(
                                "This Voyage is closing; no terminal was opened".into(),
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
                        if result.is_ok()
                            && let Some(backend) = layout
                                .contents
                                .iter()
                                .find(|item| item.id == content)
                                .and_then(|item| item.backend.clone())
                            && !live_bindings.contains(&backend)
                        {
                            live_bindings.push(backend);
                        }
                        if previous.is_none() {
                            settle_created_content(&mut created_contents, &content, &result);
                            terminal_requests.push_back((request, result.clone().map(Into::into)));
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
                let previous_close_revision = closing.revision;
                let mut deferred_reply = false;
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
                    close_plan: closing.projected(&layout, scope.as_ref()),
                };
                if worktree_requests
                    .iter()
                    .any(|(_, prior, _)| prior.request_id == request.request_id)
                {
                    response.message =
                        Some("This request identity belongs to a worktree operation".into());
                    let _ = reply.send(response);
                    continue;
                }
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
                        response.close_plan = result.close_plan.clone();
                        let _ = reply.send(response);
                        continue;
                    }
                    response.message =
                        Some("Changed request identity; nothing was repeated".into());
                } else if request.request_id.is_empty() || request.request_id.len() > 128 {
                    response.message = Some("Invalid request identity".into());
                } else if quit_result.is_some() {
                    if matches!(request.action, Action::Inspect) {
                        response.status = Status::Applied;
                        response.fresh = false;
                    } else {
                        response.message =
                            Some("Voyager is quitting; no workspace effect was dispatched".into());
                    }
                    let _ = reply.send(response);
                    continue;
                } else {
                    let inspecting = matches!(request.action, Action::Inspect);
                    let result = match core.as_mut() {
                        Err(error) => Err(error.clone()),
                        Ok(core) => {
                            (|| {
                                if let Some((view, revision)) = &note_exit {
                                    if !view.is_active()
                                        || !matches!(&request.action, Action::RemovePanel { id }
                                            if note_exit_target(&layout, view.binding.id()).as_ref() == Ok(id))
                                    {
                                        return Err(rejected("The Notes view or placement changed; nothing was closed".into()));
                                    }
                                    let owner = content.as_mut().ok_or_else(|| {
                                        rejected("Notes data is unavailable".into())
                                    })?;
                                    let observed = owner.call(
                                        &view.binding,
                                        voyager_contract::content::Request::Inspect {
                                            version: voyager_contract::content::Version::V1,
                                            request_id: format!("{}-read", request.request_id),
                                            content_id: view.binding.id().clone(),
                                        },
                                    );
                                    if !matches!(observed, voyager_contract::content::Response::Snapshot { snapshot, .. } if &snapshot.revision == revision)
                                    {
                                        return Err(rejected(
                                            "Notes changed after saving; the view remains open"
                                                .into(),
                                        ));
                                    }
                                }
                                if matches!(request.action, Action::Inspect) {
                                    load(core, &cwd).and_then(|(loaded, revision, missing)| {
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
                                    if !reopened {
                                        let terminals = core.terminal_list()?;
                                        let ready = crate::terminal_lifecycle::prepare_reopen(&mut candidate.layout, &terminals);
                                        if !ready.is_empty() {
                                            revision = save(core, &candidate.layout, revision)?;
                                            created_contents.extend(ready.into_iter().map(|id| CreatedTerminal {
                                                id, launch: voyager_contract::launch::Launch::Terminal,
                                                backend: None, shell_intent: None,
                                            }));
                                        }
                                        live_bindings = terminals.iter().filter(|terminal| terminal.is_live())
                                            .map(|terminal| CoreTerminalId(terminal.address.clone())).collect();
                                        reopened = true;
                                    }
                                    unconfirmed.retain(|id, _| {
                                        candidate.layout.contents.iter().any(|item| {
                                            &item.id.0 == id && item.start_pending.is_some()
                                        })
                                    });
                                    created_contents.retain(|pending| {
                                        candidate.layout.contents.iter().any(|item| {
                                            item.id == pending.id
                                                && (item.backend.is_none()
                                                    || pending.shell_intent.is_some())
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
                                } else if !fresh
                                    && !matches!(request.action, Action::CancelVoyageClose { .. })
                                {
                                    Err(rejected(
                                        "Inspect the workspace before making a change".into(),
                                    ))
                                } else if request.expected_version != version
                                    && !matches!(request.action, Action::CancelVoyageClose { .. })
                                {
                                    Err(rejected(
                                        "Layout changed; inspect it before making a new request"
                                            .into(),
                                    ))
                                } else {
                                    crate::scope::check(&layout, scope.as_ref(), &request.action)
                                        .map_err(rejected)?;
                                    match &request.action {
                                        Action::CloseVoyage { id } => {
                                            closing.prepare(
                                                &layout,
                                                version,
                                                id,
                                                &request.request_id,
                                                core,
                                            )?;
                                            response.message = Some(
                                                "Confirm the Voyage shutdown; no work has stopped"
                                                    .into(),
                                            );
                                            return Ok(());
                                        }
                                        Action::CancelVoyageClose { id, plan } => {
                                            if scope.is_some() {
                                                return Err(rejected("Only the native user can cancel a Voyage confirmation".into()));
                                            }
                                            closing.cancel(id, plan)?;
                                            return Ok(());
                                        }
                                        Action::ConfirmVoyageClose { id, plan } => {
                                            if scope.is_some() {
                                                return Err(rejected("Human confirmation is required; agents cannot confirm Voyage shutdown".into()));
                                            }
                                            let confirmed = closing.confirm(
                                                id,
                                                plan,
                                                version,
                                                &request.request_id,
                                            )?;
                                            let worker = close_client.clone();
                                            let sender = close_sender.clone();
                                            let request = request.clone();
                                            let scope = scope.clone();
                                            let reply = reply.clone();
                                            thread::spawn(move || {
                                                let result = crate::voyage_close::execute(
                                                    &worker, confirmed,
                                                );
                                                let _ = sender.send_blocking(Message::CloseDone {
                                                    request,
                                                    scope,
                                                    reply,
                                                    result,
                                                });
                                            });
                                            deferred_reply = true;
                                            return Ok(());
                                        }
                                        _ => (),
                                    }
                                    if let Some((_, plan, prepared)) = &rename_ready {
                                        let expected = prepared
                                            .as_ref()
                                            .map_err(|error| match error {
                                                CallError::Rejected(message) => {
                                                    rejected(message.clone())
                                                }
                                                CallError::Unconfirmed(message) => {
                                                    Error::Uncertain(message.clone())
                                                }
                                            })?
                                            .as_deref()
                                            .unwrap_or(&plan.revision);
                                        let observed = crate::content::rename::Plan::capture(
                                            &layout,
                                            scope.as_ref(),
                                            &request.action,
                                        )
                                        .map_err(rejected)?
                                        .ok_or_else(|| {
                                            rejected("The Notes rename target changed".into())
                                        })?;
                                        if observed.file != plan.file
                                            || observed.files != plan.files
                                        {
                                            return Err(rejected("The Notes file bindings changed; nothing was renamed".into()));
                                        }
                                        let candidate = plan.layout(&layout).map_err(rejected)?;
                                        closing.check_layout(&candidate)?;
                                        crate::content::rename::move_file(
                                            &plan.file,
                                            &plan.filename,
                                            expected,
                                        )
                                        .map_err(rejected)?;
                                        let moved = plan.moved_file();
                                        let snapshot = plan.snapshot(plan.contents[0].clone()).map_err(|error| Error::Uncertain(format!("The file moved to {}/{} but reading it failed: {error}. Inspect before another rename.", moved.directory, moved.filename)))?;
                                        if snapshot.revision != expected {
                                            return Err(Error::Uncertain(format!(
                                                "The file moved to {}/{} but its bytes changed during rename. Inspect both paths; do not repeat the rename.",
                                                moved.directory, moved.filename
                                            )));
                                        }
                                        let saved = save(core, &candidate, version).map_err(|error| Error::Uncertain(format!("The file moved to {}/{} but workspace confirmation is unknown: {error:?}. Do not repeat the rename.", moved.directory, moved.filename)))?;
                                        layout = Arc::new(candidate);
                                        version = saved;
                                        if let Some(owner) = content.as_mut() {
                                            for id in &plan.contents {
                                                crate::content::register_content(
                                                    owner, &layout, id,
                                                )
                                                .map_err(Error::Uncertain)?;
                                            }
                                        }
                                        rename_rebind = Some(crate::voyage_close::RenamedNotes {
                                            files: plan.moved_files(),
                                            workspace_version: version,
                                            snapshot,
                                        });
                                        return Ok(());
                                    }
                                    if let Some(plan) = crate::content::rename::Plan::capture(
                                        &layout,
                                        scope.as_ref(),
                                        &request.action,
                                    )
                                    .map_err(rejected)?
                                    {
                                        if renaming.is_some() {
                                            return Err(rejected(
                                                "Finish the current Notes rename first".into(),
                                            ));
                                        }
                                        let saves = closing.saves.as_ref().ok_or_else(|| rejected("The native Notes save service is unavailable; nothing was renamed".into()))?;
                                        let ticket = crate::voyage_close::SaveTicket::new(
                                            &request.request_id,
                                        );
                                        let (ready, waiting) = async_channel::bounded(1);
                                        saves.try_send(crate::voyage_close::SaveRequest::PrepareRename { ticket: ticket.clone(), contents: plan.contents.clone(), files: plan.files.clone(), reply: ready }).map_err(|_| rejected("Notes save service is busy; nothing was renamed".into()))?;
                                        let release = crate::voyage_close::RenameRelease::new(
                                            saves.clone(),
                                            ticket.clone(),
                                            plan.contents.clone(),
                                        );
                                        renaming = Some((ticket, plan, release));
                                        let sender = close_sender.clone();
                                        let request = request.clone();
                                        let scope = scope.clone();
                                        let reply = reply.clone();
                                        thread::spawn(move || {
                                            let result = waiting.recv_blocking().unwrap_or_else(|_| Err(CallError::Unconfirmed("Notes save acknowledgement was lost; inspect before another rename".into())));
                                            let _ =
                                                sender.send_blocking(Message::NoteRenameReady {
                                                    request,
                                                    scope,
                                                    reply,
                                                    result,
                                                });
                                        });
                                        deferred_reply = true;
                                        return Ok(());
                                    }
                                    if let Action::RemoveContentPackage { type_id }
                                    | Action::RestoreContentPackage { type_id } = &request.action
                                    {
                                        let (current, revision, missing) = load(core, &cwd).map_err(|error| rejected(format!("Workspace observation unavailable; no content package was changed: {error:?}")))?;
                                        layout = Arc::new(current);
                                        version = revision;
                                        fresh = true;
                                        if missing || request.expected_version != version {
                                            return Err(rejected("Workspace changed; inspect before changing a content package".into()));
                                        }
                                        crate::scope::check(
                                            &layout,
                                            scope.as_ref(),
                                            &request.action,
                                        )
                                        .map_err(rejected)?;
                                        if type_id == crate::content_type::NOTES_TYPE
                                            && layout.contents.iter().any(|item| {
                                                item.type_id == *type_id
                                                    && closing.blocks_terminal(&item.id)
                                            })
                                        {
                                            return Err(rejected("Notes must remain available while their Voyage closes".into()));
                                        }
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
                                    if let Action::CreateContent { type_id, .. }
                                    | Action::CreateFleetWithContent { type_id, .. } =
                                        &request.action
                                        && let Some(owner) = &content
                                    {
                                        owner.require_available(type_id).map_err(rejected)?;
                                    }
                                    if let Action::CreateVoyageFromSource { source }
                                    | Action::CreateFleetWithContent { source, .. } =
                                        &request.action
                                    {
                                        let terminals = if matches!(
                                            source,
                                            voyager_contract::DirectorySource::Live { .. }
                                        ) {
                                            Some(core.terminal_list().map_err(|error| {
                                            rejected(format!(
                                                "Live directory observation unavailable: {error:?}"
                                            ))
                                        })?)
                                        } else {
                                            None
                                        };
                                        crate::observation::validate_source(
                                            &layout,
                                            version,
                                            source,
                                            terminals.as_deref(),
                                        )
                                        .map_err(rejected)?;
                                    }
                                    if matches!(
                                        request.action,
                                        Action::StartNewShell { .. } | Action::ReopenPanel { .. }
                                    ) {
                                        let (current, revision, missing) = load(core, &cwd)?;
                                        layout = Arc::new(current);
                                        version = revision;
                                        if missing || request.expected_version != version {
                                            return Err(rejected("Workspace changed; inspect before changing a terminal viewer".into()));
                                        }
                                        crate::scope::check(
                                            &layout,
                                            scope.as_ref(),
                                            &request.action,
                                        )
                                        .map_err(rejected)?;
                                    }
                                    let mut candidate = Model {
                                        layout: (*layout).clone(),
                                    };
                                    match &request.action {
                                    Action::StartNewShell { content_id, expected_backend } => {
                                        candidate.start_new_shell(content_id, expected_backend, &request.request_id)
                                    }
                                    _ => candidate.apply(request.action.clone()),
                                }
                                    .map_err(rejected)
                                    .and_then(|()| {
                                        closing.check_layout(&candidate.layout)?;
                                        let reopening = if let Action::ReopenVoyage { id } = &request.action {
                                            crate::terminal_lifecycle::prepare_voyage_reopen(&mut candidate.layout, &core.terminal_list()?, id)
                                        } else { Vec::new() };
                                        if let Action::StartNewShell { expected_backend, .. } = &request.action {
                                            let observed = core.terminal_get(&expected_backend.0)?;
                                            require_finished(&observed, expected_backend)?;
                                        }
                                        if let Action::ReopenPanel { id, .. } = &request.action
                                            && let Some(backend) = reopen_backend(&layout, id, &unconfirmed).map_err(rejected)? {
                                                let observed = core.terminal_get(&backend.0)
                                                    .map_err(|error| rejected(format!("Terminal liveness unavailable; no viewer was reopened: {error:?}")))?;
                                                require_live(&observed, backend)?;
                                            }
                                        let created_notes = if let Some(owner) = content.as_mut() {
                                            crate::content::initialize_created(owner, &layout, &mut candidate.layout).map_err(Error::Uncertain)?
                                        } else if candidate.layout.contents.iter().any(|item| item.type_id == crate::content_type::NOTES_TYPE && !layout.contents.iter().any(|old| old.id == item.id)) {
                                            return Err(rejected("Content owner unavailable; Notes was not created".into()));
                                        } else { false };
                                        let revision = save(core, &candidate.layout, version).map_err(|error| {
                                            if created_notes { Error::Uncertain(format!("A Notes file was created but workspace binding is unconfirmed; inspect before retry: {error:?}")) } else { error }
                                        })?;
                                        created_contents.extend(reopening.into_iter().map(|id| CreatedTerminal { id, launch: voyager_contract::launch::Launch::Terminal, backend: None, shell_intent: None }));
                                        if let Action::StartNewShell { content_id, expected_backend } = &request.action {
                                            grant_new_shell(&mut created_contents, content_id, expected_backend, &request.request_id);
                                            unconfirmed.remove(&content_id.0);
                                        }
                                        if (scope.is_some() || matches!(request.action, Action::CreateContent { .. } | Action::CreateVoyageFromSource { .. } | Action::CreateFleetWithContent { .. }))
                                            && matches!(
                                                request.action,
                                                Action::CreateVoyage { .. }
                                                    | Action::CreateVoyageFromSource { .. }
                                                    | Action::CreateFleet { .. }
                                                    | Action::CreateFleetWithContent { .. }
                                                    | Action::CreateContent { .. }
                                            )
                                        {
                                            record_created_terminals(
                                                &mut created_contents,
                                                &layout,
                                                &candidate.layout,
                                            );
                                        }
                                        layout = Arc::new(candidate.layout);
                                        version = revision;
                                        Ok(())
                                    })
                                }
                            })()
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
                response.layout = crate::scope::project(&layout, scope.as_ref());
                response.created_contents =
                    eligible_contents(&layout, scope.as_ref(), &created_contents);
                response.fresh = fresh;
                response.close_plan = closing.projected(&layout, scope.as_ref());
                if let Some(mut release) = rename_release {
                    release.rebind = rename_rebind;
                }
                if deferred_reply {
                    response.status = Status::Uncertain;
                    response.message = Some("The workspace operation is in progress; inspect its result instead of repeating it".into());
                }
                if version != previous_version
                    && let Some(owner) = content.as_mut()
                {
                    owner.refresh_views();
                }
                if version != previous_version
                    || package_changed
                    || closing.revision != previous_close_revision
                {
                    if package_changed {
                        let next = published_packages.load(Ordering::Relaxed).saturating_add(1);
                        published_packages.store(next, Ordering::Relaxed);
                    }
                    if let Some(listener) = &workspace_listener {
                        let _ = listener.try_send(WorkspaceNotice {
                            package_revision: published_packages.load(Ordering::Relaxed),
                            revision: version,
                            activity_revision: core
                                .as_ref()
                                .map(Core::activity_revision)
                                .unwrap_or(0),
                            close_revision: closing.revision,
                        });
                    }
                }
                let prepare_dock = matches!(request.action, Action::Dock { .. })
                    && response.status == Status::Applied
                    && fresh;
                receipts.push_back((
                    request,
                    scope,
                    Outcome {
                        status: response.status.clone(),
                        message: response.message.clone(),
                        created_workspace: response.created_workspace,
                        close_plan: response.close_plan.clone(),
                    },
                ));
                if receipts.len() > 32 {
                    receipts.pop_front();
                }
                if !deferred_reply {
                    let _ = reply.send(response);
                }
                if prepare_dock {
                    if let Ok(mut prepared) = published_context.lock() {
                        *prepared = None;
                    }
                    let _ = close_sender.try_send(Message::PrepareContext {
                        scope: layout.context.clone(),
                        version,
                    });
                }
            }
            if let Ok(core) = core
                && let Err(error) = core.close()
            {
                eprintln!("Core bridge cleanup: {error:?}");
            }
        });
        client
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

    pub async fn quit(&self) -> Result<(), Error> {
        let (reply, receive) = async_channel::bounded(1);
        self.sender
            .send(Message::Quit { reply })
            .await
            .map_err(|_| Error::Uncertain("The workspace shutdown owner is unavailable".into()))?;
        receive.recv().await.map_err(|_| {
            Error::Uncertain("Session shutdown was not confirmed; do not repeat it".into())
        })?
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
        if matches!(
            &request,
            voyager_contract::content::Request::Update { .. }
                | voyager_contract::content::Request::Configure { .. }
                | voyager_contract::content::Request::MigrateNote { .. }
                | voyager_contract::content::Request::NewNote { .. }
                | voyager_contract::content::Request::OpenNote { .. }
        ) {
            return Err(CallError::Rejected(
                "Content effects cannot use read-only admission".into(),
            ));
        }
        check_content_size(&request)?;
        let (reply, receive) = async_channel::bounded(1);
        let message = Message::Content {
            access,
            request,
            reply: ContentReply::Asynchronous(reply),
            close_ticket: None,
            native_save: false,
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
        self.content_inner(access, request, None, None, false)
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
            None,
            false,
        )
    }

    pub fn content_native_save(
        &self,
        ticket: Option<crate::voyage_close::SaveTicket>,
        view: &crate::content::ViewBinding,
        request: voyager_contract::content::Request,
    ) -> Result<Arc<voyager_contract::content::Response>, CallError> {
        if !matches!(request, voyager_contract::content::Request::Update { .. }) {
            return Err(CallError::Rejected(
                "A close lease only permits saving its native Note".into(),
            ));
        }
        self.content_inner(
            crate::content::Access::View(view.binding.clone()),
            request,
            Some(view),
            ticket,
            true,
        )
    }

    pub fn close_save_requests(
        &self,
    ) -> Result<async_channel::Receiver<crate::voyage_close::SaveRequest>, String> {
        let (sender, receiver) = async_channel::bounded(4);
        self.sender
            .try_send(Message::CloseSaves { sender })
            .map_err(|_| "The Notes shutdown bridge could not be registered".to_owned())?;
        Ok(receiver)
    }

    fn content_inner(
        &self,
        access: crate::content::Access,
        request: voyager_contract::content::Request,
        view: Option<&crate::content::ViewBinding>,
        close_ticket: Option<crate::voyage_close::SaveTicket>,
        native_save: bool,
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
                close_ticket,
                native_save,
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

    pub fn note_exit_request(
        &self,
        view: &crate::content::ViewBinding,
    ) -> Result<Request, CallError> {
        if !view.is_active() {
            return Err(CallError::Rejected("Notes view is not active".into()));
        }
        let observed = self.queue_inspection()?.wait()?;
        if observed.status != Status::Applied || !observed.fresh {
            return Err(CallError::Rejected(
                "Inspect the workspace before closing Notes".into(),
            ));
        }
        Ok(Request {
            request_id: self.request_id(),
            expected_version: observed.version,
            action: Action::RemovePanel {
                id: note_exit_target(&observed.layout, view.binding.id())
                    .map_err(CallError::Rejected)?,
            },
        })
    }

    pub fn exit_note(
        &self,
        view: crate::content::ViewBinding,
        revision: String,
        request: Request,
    ) -> Result<Response, CallError> {
        let (reply, receive) = mpsc::sync_channel(1);
        self.sender
            .try_send(Message::NoteExit {
                view,
                revision,
                request,
                reply,
            })
            .map_err(|_| CallError::Rejected("Workspace busy; Notes Exit was not queued".into()))?;
        PendingCall(receive, Duration::from_secs(20)).wait()
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

    pub async fn workspace_observation(
        &self,
        scope: Context,
        version: u64,
        active: Option<voyager_contract::PlacementId>,
    ) -> Result<voyager_contract::observation::WorkspaceObservation, String> {
        let (reply, receive) = async_channel::bounded(1);
        self.sender
            .try_send(Message::WorkspaceObservation {
                scope,
                version,
                active,
                reply,
            })
            .map_err(|_| "Workspace observation is unavailable".to_owned())?;
        receive
            .recv()
            .await
            .map_err(|_| "Workspace observation was not confirmed".to_owned())?
    }

    pub fn call(&self, request: Request) -> Result<Response, String> {
        self.bound_call(None, request).map_err(|error| match error {
            CallError::Rejected(message) | CallError::Unconfirmed(message) => message,
        })
    }

    pub fn scoped_call(&self, scope: Context, request: Request) -> Result<Response, CallError> {
        self.bound_call(Some(scope), request)
    }

    pub fn worktree(
        &self,
        scope: Option<Context>,
        request: voyager_contract::worktree::Request,
    ) -> Result<Arc<voyager_contract::worktree::Response>, CallError> {
        let (reply, receive) = mpsc::sync_channel(1);
        self.sender
            .try_send(Message::Worktree {
                scope,
                request,
                reply,
            })
            .map_err(|_| {
                CallError::Rejected(
                    "Workspace busy or unavailable; no worktree request was queued".into(),
                )
            })?;
        receive.recv_timeout(Duration::from_secs(25)).map_err(|_| {
            CallError::Unconfirmed("Worktree result unconfirmed; do not repeat the request".into())
        })
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
                queued_at: std::time::Instant::now(),
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
        let timeout = if matches!(request.action, Action::ConfirmVoyageClose { .. }) {
            Duration::from_secs(120)
        } else {
            Duration::from_secs(20)
        };
        self.sender
            .try_send(Message::Workspace {
                request,
                scope,
                reply,
                queued_at: std::time::Instant::now(),
            })
            .map_err(|_| {
                CallError::Rejected("Workspace busy or unavailable; nothing was queued".into())
            })?;
        Ok(PendingCall(receive, timeout))
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

fn note_exit_target(
    layout: &Layout,
    content: &ContentId,
) -> Result<voyager_contract::PlacementId, String> {
    if !layout
        .contents
        .iter()
        .any(|item| &item.id == content && item.type_id == crate::content_type::NOTES_TYPE)
    {
        return Err("This view is not Notes".into());
    }
    let mut targets = layout
        .containers()
        .filter(|voyage| !voyage.closed)
        .flat_map(|voyage| {
            voyage
                .fleets
                .iter()
                .filter(|fleet| !fleet.closed)
                .flat_map(|fleet| {
                    fleet.vessels.iter().filter(|panel| {
                        !panel.hidden && crate::panels::contains(&fleet.root, &panel.id)
                    })
                })
                .chain(voyage.portals.iter().filter(|panel| {
                    !panel.hidden
                        && voyage
                            .portal_layout
                            .as_ref()
                            .is_some_and(|column| crate::panels::contains(&column.root, &panel.id))
                }))
        })
        .filter(|panel| &panel.content == content);
    let id = targets
        .next()
        .ok_or("The Notes placement is closed")?
        .id
        .clone();
    if targets.next().is_some() {
        return Err("Notes has multiple placements; close the intended panel directly".into());
    }
    Ok(id)
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
    fn note_exit_requires_one_visible_notes_placement() {
        let mut model = Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Work".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        let fleet = model.layout.voyages[0].fleets[0].id.clone();
        let shell = model.layout.voyages[0].fleets[0].vessels[0].content.clone();
        assert!(note_exit_target(&model.layout, &shell).is_err());
        model
            .apply(Action::CreateContent {
                type_id: crate::content_type::NOTES_TYPE.into(),
                destination: voyager_contract::ContentDestination::Panel {
                    owner: voyager_contract::PanelOwner::Fleet { id: fleet },
                    insertion: voyager_contract::PanelInsertion::Beside {
                        id: model.layout.voyages[0].fleets[0].vessels[0].id.clone(),
                        side: voyager_contract::Side::Right,
                    },
                },
                launch: None,
            })
            .unwrap();
        let note = model.layout.voyages[0].fleets[0].vessels[1].clone();
        assert_eq!(
            note_exit_target(&model.layout, &note.content).unwrap(),
            note.id
        );
        let mut duplicate = note.clone();
        duplicate.id = voyager_contract::PlacementId("duplicate".into());
        let fleet = &mut model.layout.voyages[0].fleets[0];
        fleet.root = Some(voyager_contract::Split::Branch {
            axis: voyager_contract::Axis::Horizontal,
            share: Default::default(),
            first: Box::new(fleet.root.take().unwrap()),
            second: Box::new(voyager_contract::Split::Leaf {
                placement: duplicate.id.clone(),
            }),
        });
        fleet.vessels.push(duplicate.clone());
        assert!(note_exit_target(&model.layout, &note.content).is_err());
        model
            .apply(Action::RemovePanel { id: duplicate.id })
            .unwrap();
        model.apply(Action::RemovePanel { id: note.id }).unwrap();
        assert!(note_exit_target(&model.layout, &note.content).is_err());
    }

    #[test]
    fn voice_inspection_enters_the_owner_queue_before_later_navigation() {
        let (sender, receive) = async_channel::bounded(8);
        let client = Client {
            sender,
            sequence: Arc::new(AtomicU64::new(0)),
            identity: "voice-scope-test".into(),
            activity: Arc::default(),
            prepared_context: Arc::default(),
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
    let voyage = if layout.view == voyager_contract::WorkspaceView::Home {
        layout.home.as_ref()
    } else {
        layout
            .voyages
            .iter()
            .find(|voyage| Some(&voyage.id) == layout.selected_voyage.as_ref())
    };
    let Some(voyage) = voyage else {
        return false;
    };
    if let Some(column) = &voyage.portal_layout
        && column.visible
    {
        let root = crate::panels::visible(&column.root, &voyage.portals);
        if voyage.portals.iter().any(|panel| {
            &panel.content == content
                && crate::panels::contains(&root, &panel.id)
                && column
                    .maximized_placement
                    .as_ref()
                    .is_none_or(|id| id == &panel.id)
        }) {
            return true;
        }
    }
    let fleet = if layout.view == voyager_contract::WorkspaceView::Home {
        voyage.fleets.first()
    } else {
        voyage
            .fleets
            .iter()
            .find(|fleet| Some(&fleet.id) == layout.selected_fleet.as_ref())
    };
    fleet.is_some_and(|fleet| {
        let root = crate::panels::visible(&fleet.root, &fleet.vessels);
        fleet.vessels.iter().any(|panel| {
            &panel.content == content
                && crate::panels::contains(&root, &panel.id)
                && fleet
                    .maximized_placement
                    .as_ref()
                    .is_none_or(|id| id == &panel.id)
        })
    })
}

fn require_finished(
    observed: &crate::core_shapes::Terminal,
    expected: &CoreTerminalId,
) -> Result<(), Error> {
    if observed.address != expected.0 || !observed.has_ended() {
        return Err(rejected(
            "The selected program is not confirmed ended; no new shell was authorized".into(),
        ));
    }
    Ok(())
}

fn reopen_backend<'a>(
    layout: &'a Layout,
    id: &voyager_contract::PlacementId,
    unconfirmed: &HashMap<String, String>,
) -> Result<Option<&'a CoreTerminalId>, String> {
    let owner = crate::panels::owner_of(layout, id)?;
    let panel = crate::panels::group(layout, &owner)?
        .members
        .iter()
        .find(|panel| &panel.id == id)
        .ok_or("Panel not found")?;
    let content = layout
        .contents
        .iter()
        .find(|item| item.id == panel.content)
        .ok_or("Panel content not found")?;
    if content.type_id != "terminal" {
        return Ok(None);
    }
    if content.start_pending.is_some()
        || content.shell_intent.is_some()
        || unconfirmed.contains_key(&content.id.0)
    {
        return Err("Terminal binding is unconfirmed; no viewer was reopened".into());
    }
    content
        .backend
        .as_ref()
        .map(Some)
        .ok_or_else(|| "Terminal has no confirmed backend; no program was started".into())
}

fn require_live(
    observed: &crate::core_shapes::Terminal,
    expected: &CoreTerminalId,
) -> Result<(), Error> {
    if observed.address != expected.0
        || !observed.is_live()
        || observed.pid.is_none_or(|pid| pid == 0)
        || observed.start_unconfirmed()
    {
        return Err(rejected(
            "Terminal is not confirmed live; no program was started".into(),
        ));
    }
    Ok(())
}

fn grant_new_shell(
    pending: &mut Vec<CreatedTerminal>,
    content: &ContentId,
    backend: &CoreTerminalId,
    intent: &str,
) {
    pending.retain(|item| &item.id != content);
    pending.push(CreatedTerminal {
        id: content.clone(),
        launch: voyager_contract::launch::Launch::Terminal,
        backend: Some(backend.clone()),
        shell_intent: Some(intent.into()),
    });
}

fn worktree_voyage_action(layout: &Layout, checkout: &str) -> Result<Action, String> {
    let target = std::fs::canonicalize(checkout)
        .map_err(|error| format!("Checkout unavailable: {error}"))?;
    if let Some(voyage) = layout.voyages.iter().find(|voyage| {
        voyage
            .cwd
            .as_ref()
            .and_then(|cwd| std::fs::canonicalize(cwd).ok())
            .as_ref()
            == Some(&target)
    }) {
        return Ok(if voyage.closed {
            Action::ReopenVoyage {
                id: voyage.id.clone(),
            }
        } else {
            Action::SelectVoyage {
                id: voyage.id.clone(),
            }
        });
    }
    let name = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("/")
        .to_owned();
    let cwd = target
        .to_str()
        .ok_or("Checkout path is not UTF-8")?
        .to_owned();
    Ok(Action::CreateVoyage { name, cwd })
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
                backend: None,
                shell_intent: None,
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
            projection
                .contents
                .iter()
                .any(|item| pending.eligible(item))
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
    let accepted = created_contents
        .iter()
        .find(|pending| &pending.id == content);
    let new_shell = target.shell_intent.is_some() && accepted.is_some();
    if accepted.is_some_and(|pending| !pending.matches(target)) {
        return Err(rejected(
            "The creation launch changed; no program was started".into(),
        ));
    }
    if new_shell {
        let backend = target
            .backend
            .as_ref()
            .ok_or_else(|| rejected("New shell intent lost its original binding".into()))?;
        require_finished(&core.terminal_get(&backend.0)?, backend)?;
    }
    if target.backend.is_none()
        && (target.shell_intent.is_some()
            || !matches!(launch, voyager_contract::launch::Launch::Terminal))
        && accepted.is_none()
    {
        return Err(rejected(
            "This saved worker has no new-creation permission; no command was restarted".into(),
        ));
    }
    let mut created = false;
    let terminal = if let Some(address) = &target.backend
        && !new_shell
    {
        core.terminal_get(&address.0)?
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
        let run = crate::launch::terminal_command(&launch, &cwd)
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
        if started.lifecycle().is_unknown() || started.start_unconfirmed() {
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
        item.shell_intent = None;
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
        started
    };
    let address = &terminal.address;
    let attached = core
        .terminal_attach(&terminal)
        .map_err(|error| attach_failure(error, created, address))?;
    core.viewer(&attached)
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

fn load(core: &mut Core, cwd: &str) -> Result<(Layout, u64, bool), Error> {
    let doc = core.document_get("voyager-layout-v1")?;
    let version = doc.version;
    let value = doc.value;
    if value.is_null() {
        return Ok((Layout::default(), version, true));
    }
    let layout: Layout = serde_json::from_value(value)
        .map_err(|e| rejected(format!("Stored workspace is invalid: {e}")))?;
    crate::canvas::validate(&layout.canvas).map_err(rejected)?;
    let mut layout = Model::prepare(layout, cwd).map_err(rejected)?;
    crate::content::rename::synchronize_labels(&mut layout);
    Ok((layout, version, false))
}

fn save(core: &mut Core, layout: &Layout, version: u64) -> Result<u64, Error> {
    Ok(core
        .document_set("voyager-layout-v1", layout, version)?
        .version)
}

fn select_note(
    core: &mut Core,
    layout: &mut Arc<Layout>,
    version: &mut u64,
    fresh: &mut bool,
    owner: &mut crate::content::Owner,
    access: &crate::content::Access,
    request: &voyager_contract::content::Request,
) -> voyager_contract::content::Response {
    use voyager_contract::content::{NotesConfiguration, NotesFile, Request, Response, Version};
    let (request_id, content_id, expected_version) = match request {
        Request::MigrateNote {
            request_id,
            content_id,
            expected_version,
            ..
        }
        | Request::NewNote {
            request_id,
            content_id,
            expected_version,
            ..
        }
        | Request::OpenNote {
            request_id,
            content_id,
            expected_version,
            ..
        } => (request_id, content_id, expected_version),
        _ => return crate::content::reject(request, "Expected a note selection".into()),
    };
    let mut created = None;
    let selected = (|| {
        crate::content::admit(owner, layout, *version, access, request)?;
        if expected_version != version {
            return Err("Workspace changed; inspect before selecting a note".to_owned());
        }
        let directory = crate::content::notes_directory(layout, content_id)?;
        if matches!(request, Request::MigrateNote { .. }) {
            let current = crate::content::configuration(owner, layout, content_id, *version)?
                .ok_or("Notes configuration is unavailable")?;
            if current.configuration.notes_file.is_some() {
                return Err("This note already has a Markdown file".into());
            }
            let file = owner.migrate_file(content_id, &directory)?;
            created = Some(directory.join(&file.filename));
            let snapshot = owner.select_file(content_id, file.clone())?;
            let mut candidate = (**layout).clone();
            let content = candidate
                .contents
                .iter_mut()
                .find(|item| item.id == *content_id)
                .ok_or("Content is unavailable")?;
            let mut configuration = current.configuration;
            configuration.notes_file = Some(file.clone());
            content.configuration = Some(
                serde_json::to_value(&configuration)
                    .map_err(|error| error.to_string())?
                    .as_object()
                    .ok_or("Invalid Notes configuration")?
                    .clone(),
            );
            crate::content::rename::label(&mut candidate, content_id, &file.filename);
            return Ok((candidate, configuration, snapshot));
        }
        let filename = match request {
            Request::NewNote { title, .. } => {
                let filename = owner.create_file(&directory, title)?;
                created = Some(directory.join(&filename));
                filename
            }
            Request::OpenNote { filename, .. } => filename.clone(),
            _ => unreachable!(),
        };
        let file = NotesFile {
            directory: directory.to_string_lossy().into_owned(),
            filename,
        };
        let snapshot = owner.select_file(content_id, file.clone())?;
        let mut candidate = (**layout).clone();
        let content = candidate
            .contents
            .iter_mut()
            .find(|item| item.id == *content_id)
            .ok_or("Content is unavailable")?;
        let mut configuration = content
            .configuration
            .as_ref()
            .map(|value| {
                serde_json::from_value::<NotesConfiguration>(serde_json::Value::Object(
                    value.clone(),
                ))
            })
            .transpose()
            .map_err(|error| error.to_string())?
            .unwrap_or_default();
        configuration.notes_file = Some(file.clone());
        content.configuration = Some(
            serde_json::to_value(&configuration)
                .map_err(|error| error.to_string())?
                .as_object()
                .ok_or("Invalid Notes configuration")?
                .clone(),
        );
        crate::content::rename::label(&mut candidate, content_id, &file.filename);
        Ok((candidate, configuration, snapshot))
    })();
    let (candidate, configuration, snapshot) = match selected {
        Ok(value) => value,
        Err(error) => {
            if created.is_some() || error.contains("creation is unconfirmed") {
                *fresh = false;
                return Response::Uncertain {
                    version: Version::V1,
                    request_id: request_id.clone(),
                    content_id: content_id.clone(),
                    expected_revision: expected_version.to_string(),
                    message: format!(
                        "Note creation or selection is unconfirmed at {created:?}: {error}; inspect before retry"
                    ),
                };
            }
            return crate::content::reject(request, error);
        }
    };
    match save(core, &candidate, *version) {
        Ok(revision) => {
            *layout = Arc::new(candidate);
            *version = revision;
            Response::NoteOpened {
                version: Version::V1,
                request_id: request_id.clone(),
                content_id: content_id.clone(),
                snapshot,
                configuration,
                workspace_version: revision,
            }
        }
        Err(error) => {
            *fresh = false;
            Response::Uncertain {
                version: Version::V1,
                request_id: request_id.clone(),
                content_id: content_id.clone(),
                expected_revision: expected_version.to_string(),
                message: format!(
                    "Note selection or creation was not confirmed; inspect the selected file and workspace before another attempt: {error:?}"
                ),
            }
        }
    }
}

fn configure(
    core: &mut Core,
    layout: &mut Arc<Layout>,
    version: &mut u64,
    fresh: &mut bool,
    owner: &mut crate::content::Owner,
    access: &crate::content::Access,
    request: &voyager_contract::content::Request,
) -> voyager_contract::content::Response {
    use voyager_contract::content::{Request, Response, Version};
    let Request::Configure {
        request_id,
        content_id,
        expected_version,
        configuration,
        ..
    } = request
    else {
        return crate::content::reject(request, "Expected a configuration request".into());
    };
    let candidate = (|| {
        crate::content::admit(owner, layout, *version, access, request)?;
        if expected_version != version {
            return Err("Workspace changed; inspect before configuring content".into());
        }
        owner.require_configure()?;
        let current = crate::content::configuration(owner, layout, content_id, *version)?
            .ok_or("Notes configuration is unavailable")?;
        if configuration.notes_file != current.configuration.notes_file {
            return Err("Use a note selection action to change the selected file".into());
        }
        let mut candidate = (**layout).clone();
        candidate
            .contents
            .iter_mut()
            .find(|content| content.id == *content_id)
            .ok_or("Content is unavailable")?
            .configuration = Some(
            serde_json::to_value(configuration)
                .expect("Configuration serializes")
                .as_object()
                .expect("Configuration is an object")
                .clone(),
        );
        Ok(candidate)
    })();
    let candidate = match candidate {
        Ok(candidate) => candidate,
        Err(message) => return crate::content::reject(request, message),
    };
    match save(core, &candidate, *version) {
        Ok(revision) => {
            *layout = Arc::new(candidate);
            *version = revision;
            Response::Configured {
                version: Version::V1,
                request_id: request_id.clone(),
                content_id: content_id.clone(),
                configuration: configuration.clone(),
                workspace_version: revision,
            }
        }
        Err(Error::Rejected { kind, message }) => {
            *fresh = false;
            crate::content::reject(request, format!("{kind}: {message}"))
        }
        Err(Error::Uncertain(message)) => {
            *fresh = false;
            Response::Uncertain {
                version: Version::V1,
                request_id: request_id.clone(),
                content_id: content_id.clone(),
                expected_revision: expected_version.to_string(),
                message,
            }
        }
    }
}

#[cfg(test)]
mod terminal_outcome_tests {
    use super::*;

    #[test]
    fn worktree_creation_opens_one_voyage_and_reopens_its_identity() {
        use voyager_contract::worktree::{
            Action as GitAction, Request as GitRequest, Status as GitStatus,
        };
        let root = std::env::temp_dir().join(format!(
            "voyager-worktree-owner-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&root).unwrap();
        for args in [
            &["init", "-q"][..],
            &["config", "user.name", "Voyager test"],
            &["config", "user.email", "test@example.invalid"],
            &["commit", "--allow-empty", "-qm", "initial"],
        ] {
            let output = std::process::Command::new("git")
                .arg("-C")
                .arg(&root)
                .args(args)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
        let session = format!("voyager-git-{}", std::process::id());
        let client = Client::open(session.clone(), root.to_string_lossy().into_owned());
        let checked = std::panic::catch_unwind(|| {
            let inspect = || {
                client
                    .call(Request {
                        request_id: client.request_id(),
                        expected_version: 0,
                        action: Action::Inspect,
                    })
                    .unwrap()
            };
            let initial = inspect();
            assert_eq!(initial.status, Status::Applied);
            let source = initial.layout.voyages[0].id.clone();
            let refused = client
                .worktree(
                    Some(Context::Voyage { id: source.clone() }),
                    GitRequest {
                        request_id: client.request_id(),
                        expected_version: initial.version,
                        voyage: source.clone(),
                        action: GitAction::Create {
                            name: "forbidden".into(),
                            branch: "forbidden".into(),
                            base: "HEAD".into(),
                        },
                    },
                )
                .unwrap();
            assert_eq!(refused.status, GitStatus::Rejected);
            assert!(!root.join(".worktree/forbidden").exists());
            let created = client
                .worktree(
                    None,
                    GitRequest {
                        request_id: client.request_id(),
                        expected_version: initial.version,
                        voyage: source.clone(),
                        action: GitAction::Create {
                            name: "branch".into(),
                            branch: "test-branch".into(),
                            base: "HEAD".into(),
                        },
                    },
                )
                .unwrap();
            assert_eq!(created.status, GitStatus::Applied, "{:?}", created.message);
            let checkout = created.checkouts[0].path.clone();
            let after = inspect();
            let selected = after.layout.selected_voyage.clone().unwrap();
            assert_eq!(
                after
                    .layout
                    .voyages
                    .iter()
                    .find(|voyage| voyage.id == selected)
                    .unwrap()
                    .cwd
                    .as_deref(),
                Some(checkout.as_str())
            );
            let closed = client
                .call(Request {
                    request_id: client.request_id(),
                    expected_version: after.version,
                    action: Action::CloseVoyage {
                        id: selected.clone(),
                    },
                })
                .unwrap();
            let reopened = client
                .worktree(
                    None,
                    GitRequest {
                        request_id: client.request_id(),
                        expected_version: closed.version,
                        voyage: source,
                        action: GitAction::Open {
                            path: checkout.clone(),
                        },
                    },
                )
                .unwrap();
            assert_eq!(
                reopened.status,
                GitStatus::Applied,
                "{:?}",
                reopened.message
            );
            let after = inspect();
            assert_eq!(after.layout.selected_voyage, Some(selected));
            assert_eq!(
                after
                    .layout
                    .voyages
                    .iter()
                    .filter(|voyage| voyage.cwd.as_deref() == Some(checkout.as_str()))
                    .count(),
                1
            );
        });
        let mut cleanup = Core::connect(&session).unwrap();
        cleanup.server_stop().unwrap();
        cleanup.close().unwrap();
        std::fs::remove_dir_all(root).unwrap();
        if let Err(error) = checked {
            std::panic::resume_unwind(error);
        }
    }

    #[test]
    fn reopen_uses_live_core_identity_and_refuses_stale_or_ended_programs() {
        use voyager_contract::{ContentDestination, PanelInsertion, PanelOwner};
        for key in ["HC_SOCKET", "HC_SESSION", "HC_TERMINAL_ID"] {
            assert!(std::env::var_os(key).is_none(), "Clear ambient {key}");
        }
        let runtime = std::path::PathBuf::from(std::env::var_os("XDG_RUNTIME_DIR").unwrap());
        let session = format!("voyager-reopen-{}", std::process::id());
        assert!(
            !runtime
                .join("herdr-core")
                .join(format!("{session}.sock"))
                .exists()
        );
        let client = Client::open(session.clone(), "/tmp".into());
        let checked = std::panic::catch_unwind(|| {
            let request = |version, action| Request {
                request_id: client.request_id(),
                expected_version: version,
                action,
            };
            let initial = client.call(request(0, Action::Inspect)).unwrap();
            assert_eq!(initial.status, Status::Applied, "{:?}", initial.message);
            let panel = initial.layout.voyages[0].fleets[0].vessels[0].clone();
            let _viewer = client
                .terminal(panel.content.clone(), client.request_id(), initial.version)
                .unwrap();
            let bound = client.call(request(0, Action::Inspect)).unwrap();
            let created = client
                .call(request(
                    bound.version,
                    Action::CreateFleet {
                        voyage: bound.layout.voyages[0].id.clone(),
                        name: "Next".into(),
                    },
                ))
                .unwrap();
            assert_eq!(created.status, Status::Applied);
            let target = created.layout.voyages[0].fleets[1].clone();
            let _other_viewer = client
                .terminal(
                    target.vessels[0].content.clone(),
                    client.request_id(),
                    created.version,
                )
                .unwrap();
            let bound = client.call(request(0, Action::Inspect)).unwrap();
            let backend = bound
                .layout
                .contents
                .iter()
                .find(|item| item.id == panel.content)
                .unwrap()
                .backend
                .clone()
                .unwrap();
            let mut core = Core::connect(&session).unwrap();
            let live = core.terminal_get(&backend.0).unwrap();
            require_live(&live, &backend).unwrap();
            for state in ["finished", "unknown"] {
                let mut invalid = live.clone();
                invalid.state = state.into();
                assert!(require_live(&invalid, &backend).is_err());
            }
            assert!(require_live(&live, &CoreTerminalId("other".into())).is_err());
            let mut uncertain = (*bound.layout).clone();
            uncertain
                .contents
                .iter_mut()
                .find(|item| item.id == panel.content)
                .unwrap()
                .start_pending = Some("pending".into());
            assert!(reopen_backend(&uncertain, &panel.id, &HashMap::new()).is_err());
            assert!(
                reopen_backend(
                    &bound.layout,
                    &panel.id,
                    &HashMap::from([(panel.content.0.clone(), "uncertain".into())])
                )
                .is_err()
            );
            let closed = client
                .call(request(
                    bound.version,
                    Action::RemovePanel {
                        id: panel.id.clone(),
                    },
                ))
                .unwrap();
            assert_eq!(closed.status, Status::Applied);
            let action = Action::ReopenPanel {
                id: panel.id.clone(),
                destination: ContentDestination::Panel {
                    owner: PanelOwner::Fleet {
                        id: target.id.clone(),
                    },
                    insertion: PanelInsertion::Beside {
                        id: target.vessels[0].id.clone(),
                        side: voyager_contract::Side::Right,
                    },
                },
            };
            let external = core
                .document_set("voyager-layout-v1", &closed.layout, closed.version)
                .unwrap();
            let stale = client
                .call(request(closed.version, action.clone()))
                .unwrap();
            assert_eq!(stale.status, Status::Rejected);
            assert_eq!(stale.version, external.version);
            assert_eq!(stale.layout, closed.layout);
            let inspected = client.call(request(0, Action::Inspect)).unwrap();
            let reopen = request(inspected.version, action.clone());
            let opened = client.call(reopen.clone()).unwrap();
            assert_eq!(opened.status, Status::Applied);
            assert_eq!(client.call(reopen).unwrap(), opened);
            assert_eq!(opened.layout.contents, bound.layout.contents);
            assert!(opened.layout.voyages[0].fleets[0].vessels.is_empty());
            let placed = &opened.layout.voyages[0].fleets[1].vessels;
            assert_eq!(placed[0], target.vessels[0]);
            assert_eq!(placed[1], panel);
            assert_eq!(placed[0].name, placed[1].name);
            assert_ne!(placed[0].id, placed[1].id);
            assert_eq!(core.terminal_get(&backend.0).unwrap().pid, live.pid);
            assert_eq!(core.terminal_list().unwrap().len(), 2);
            let closed = client
                .call(request(
                    opened.version,
                    Action::RemovePanel { id: panel.id },
                ))
                .unwrap();
            core.terminal_kill(&backend.0).unwrap();
            let deadline = std::time::Instant::now() + Duration::from_secs(5);
            while core.terminal_get(&backend.0).unwrap().state == "live" {
                assert!(std::time::Instant::now() < deadline);
                thread::sleep(Duration::from_millis(10));
            }
            let refused = client.call(request(closed.version, action)).unwrap();
            assert_eq!(refused.status, Status::Rejected);
            assert_eq!(refused.layout, closed.layout);
            assert_eq!(refused.version, closed.version);
            assert_eq!(core.terminal_list().unwrap().len(), 2);
            core.close().unwrap();
        });
        let mut cleanup = Core::connect(&session).unwrap();
        let stopped = cleanup.server_stop();
        cleanup.close().unwrap();
        drop(client);
        stopped.unwrap();
        checked.unwrap();
    }

    #[test]
    fn explicit_new_shell_preserves_placement_and_grants_only_a_fresh_shell() {
        let mut model = Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Voyage".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        model
            .apply(Action::CreateContent {
                type_id: "terminal".into(),
                destination: voyager_contract::ContentDestination::Panel {
                    owner: voyager_contract::PanelOwner::Portals {
                        voyage: model.layout.voyages[0].id.clone(),
                    },
                    insertion: voyager_contract::PanelInsertion::Empty,
                },
                launch: None,
            })
            .unwrap();
        let id = model.layout.contents[0].id.clone();
        let backend = CoreTerminalId("t1".into());
        model.layout.contents[0].backend = Some(backend.clone());
        model.layout.contents[0].launch = Some(voyager_contract::launch::Launch::Codex {
            model: "old-worker".into(),
            effort: Default::default(),
            permissions: Default::default(),
        });
        let mut observed: crate::core_shapes::Terminal = serde_json::from_value(serde_json::json!({
            "address": "t1", "labels": {}, "argv": ["old-agent"], "cwd": "/tmp", "state": "finished", "pid": 123,
            "created_ms": 1, "screen": "exact", "cols": 80, "rows": 24
        })).unwrap();
        assert_eq!(observed.pid, Some(123));
        require_finished(&observed, &backend).unwrap();
        for state in ["live", "unknown"] {
            observed.state = state.into();
            assert!(require_finished(&observed, &backend).is_err());
        }
        observed.state = "finished".into();
        assert!(require_finished(&observed, &CoreTerminalId("another".into())).is_err());
        let before = model.layout.clone();
        let action = Action::StartNewShell {
            content_id: id.clone(),
            expected_backend: backend.clone(),
        };
        let scope = Context::Vessel {
            id: model.layout.voyages[0].fleets[0].vessels[0].id.clone(),
        };
        crate::scope::check(&Arc::new(before.clone()), Some(&scope), &action).unwrap();
        assert!(
            crate::scope::check(
                &Arc::new(before.clone()),
                Some(&Context::Portal {
                    id: model.layout.voyages[0].portals[0].id.clone()
                }),
                &action
            )
            .is_err()
        );
        crate::scope::check(
            &Arc::new(before.clone()),
            Some(&Context::Portal {
                id: model.layout.voyages[0].portals[0].id.clone(),
            }),
            &Action::StartNewShell {
                content_id: model.layout.voyages[0].portals[0].content.clone(),
                expected_backend: CoreTerminalId("t2".into()),
            },
        )
        .unwrap();
        model
            .start_new_shell(&id, &CoreTerminalId("wrong".into()), "intent")
            .unwrap_err();
        assert_eq!(model.layout, before);
        model.start_new_shell(&id, &backend, "intent").unwrap();
        let mut expected = before;
        expected.contents[0].launch = Some(voyager_contract::launch::Launch::Terminal);
        expected.contents[0].shell_intent = Some("intent".into());
        assert_eq!(model.layout, expected);
        let mut pending = Vec::new();
        assert!(eligible_contents(&Arc::new(model.layout.clone()), None, &pending).is_empty());
        grant_new_shell(&mut pending, &id, &backend, "intent");
        model.layout.contents[0].shell_intent = Some("changed".into());
        assert!(eligible_contents(&Arc::new(model.layout.clone()), None, &pending).is_empty());
        model.layout.contents[0].shell_intent = Some("intent".into());
        assert_eq!(
            eligible_contents(&Arc::new(model.layout), None, &pending),
            vec![id.clone()]
        );
        settle_created_content(&mut pending, &id, &Err(Error::Uncertain("lost".into())));
        assert!(pending.is_empty());
    }

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
                type_id: crate::content_type::NOTES_TYPE.into(),
                destination: voyager_contract::ContentDestination::Panel {
                    owner: voyager_contract::PanelOwner::Fleet { id: fleet.clone() },
                    insertion: voyager_contract::PanelInsertion::Beside {
                        id: after.clone(),
                        side: voyager_contract::Side::Right,
                    },
                },
            })
            .unwrap();
        let notes = model.layout.contents.last().unwrap().id.clone();
        let record = |id| CreatedTerminal {
            id,
            launch: Default::default(),
            backend: None,
            shell_intent: None,
        };
        let mut pending = vec![record(terminal.clone())];
        record_created_terminals(&mut pending, &previous, &model.layout);
        assert_eq!(pending, vec![record(terminal.clone())]);
        let previous = model.layout.clone();
        model
            .apply(Action::CreateContent {
                launch: None,
                type_id: "terminal".into(),
                destination: voyager_contract::ContentDestination::Panel {
                    owner: voyager_contract::PanelOwner::Fleet { id: fleet },
                    insertion: voyager_contract::PanelInsertion::Beside {
                        id: after,
                        side: voyager_contract::Side::Bottom,
                    },
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
    fn maximized_groups_exclude_occluded_pending_terminals() {
        for portals in [false, true] {
            let mut model = Model::default();
            model
                .apply(Action::CreateVoyage {
                    name: "Work".into(),
                    cwd: "/tmp".into(),
                })
                .unwrap();
            let owner = if portals {
                voyager_contract::PanelOwner::Portals {
                    voyage: model.layout.voyages[0].id.clone(),
                }
            } else {
                voyager_contract::PanelOwner::Fleet {
                    id: model.layout.voyages[0].fleets[0].id.clone(),
                }
            };
            if portals {
                model
                    .apply(Action::CreateContent {
                        type_id: "terminal".into(),
                        launch: None,
                        destination: voyager_contract::ContentDestination::Panel {
                            owner: owner.clone(),
                            insertion: voyager_contract::PanelInsertion::Empty,
                        },
                    })
                    .unwrap();
            }
            let first = crate::panels::group(&model.layout, &owner).unwrap().members[0].clone();
            model
                .apply(Action::CreateContent {
                    type_id: "terminal".into(),
                    launch: None,
                    destination: voyager_contract::ContentDestination::Panel {
                        owner: owner.clone(),
                        insertion: voyager_contract::PanelInsertion::Beside {
                            id: first.id.clone(),
                            side: voyager_contract::Side::Right,
                        },
                    },
                })
                .unwrap();
            let second = crate::panels::group(&model.layout, &owner).unwrap().members[1].clone();
            let pending = vec![CreatedTerminal {
                id: second.content.clone(),
                launch: Default::default(),
                backend: None,
                shell_intent: None,
            }];
            assert_eq!(
                eligible_contents(&Arc::new(model.layout.clone()), None, &pending),
                vec![second.content.clone()]
            );
            model
                .apply(Action::SetPanelMaximized {
                    id: first.id.clone(),
                    maximized: true,
                })
                .unwrap();
            assert!(!visible_content(&model.layout, &second.content));
            assert_eq!(
                eligible_contents(&Arc::new(model.layout.clone()), None, &pending),
                vec![second.content.clone()]
            );
            model
                .apply(Action::SetPanelMaximized {
                    id: first.id,
                    maximized: false,
                })
                .unwrap();
            assert_eq!(
                eligible_contents(&Arc::new(model.layout), None, &pending),
                vec![second.content]
            );
        }
    }

    #[test]
    fn uncertain_start_discards_only_its_automatic_eligibility() {
        let first = ContentId("first".into());
        let other = ContentId("other".into());
        let record = |id| CreatedTerminal {
            id,
            launch: Default::default(),
            backend: None,
            shell_intent: None,
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
                        reply,
                        queued_at: std::time::Instant::now(),
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
            activity: Arc::default(),
            prepared_context: Arc::default(),
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
            close_ticket,
            native_save,
        } = next(&receive)
        else {
            panic!("Expected read");
        };
        assert_eq!(access, crate::content::Access::View(binding.clone()));
        assert!(close_ticket.is_none());
        assert!(!native_save);
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

#[cfg(test)]
mod activity_notice_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reported_activity_full_mailbox_is_published_before_a_continuing_message() {
        let (sender, receiver) = async_channel::bounded(8);
        for _ in 0..8 {
            sender.try_send(Message::RefreshContentViews).unwrap();
        }
        let activity = Arc::new(Mutex::new(Activity::default()));
        let mut model = Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Status".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        model.layout.contents[0].backend = Some(CoreTerminalId("t1".into()));
        {
            let mut facts = activity.lock().unwrap();
            facts.bind(["t1"]);
            facts.begin();
            facts
                .install(json!({"seq":0,"channel":7,"terminals":[]}))
                .unwrap();
            facts.take_dirty();
            facts.wake_with(Box::new(move || {
                let _ = sender.try_send(Message::ActivityChanged);
            }));
            facts.notification(json!({"jsonrpc":"2.0","method":"event","params":{"seq":1,"type":"status","terminal":"t1","data":{"status":{"state":"done"},"reported":true}}})).unwrap();
        }
        let (listener, changed) = async_channel::bounded(1);
        let notice = WorkspaceNotice {
            close_revision: 0,
            revision: 55,
            package_revision: 7,
            activity_revision: 0,
        };
        assert!(matches!(
            next_message(&receiver, &activity, &model.layout, notice, Some(&listener)).unwrap(),
            Message::RefreshContentViews
        ));
        let actual = changed.try_recv().unwrap();
        assert_eq!((actual.revision, actual.package_revision), (55, 7));
        assert!(actual.activity_revision > 0);
        assert_eq!(
            activity.lock().unwrap().get("t1").state,
            voyager_contract::activity::ActivityState::Done
        );
    }
}

fn process_response(
    request_id: String,
    version: u64,
    fresh: &mut bool,
    result: Result<voyager_contract::administrator::ProcessOutput, Error>,
) -> Arc<ProcessResponse> {
    use voyager_contract::administrator::ProcessOutput;
    let mut response = ProcessResponse {
        request_id,
        status: Status::Rejected,
        version,
        fresh: *fresh,
        output: None,
        message: None,
    };
    match result {
        Ok(output) => match serde_json::to_vec(&output) {
            Ok(bytes) if bytes.len() <= 24 * 1024 => {
                response.status = Status::Applied;
                response.output = Some(output);
            }
            _ if matches!(output, ProcessOutput::Send { .. } | ProcessOutput::Interrupt { .. } | ProcessOutput::Stop { .. }) => {
                response.status = Status::Applied;
                response.message = Some("The requested process operation was submitted; its details exceed the response limit. Read the terminal to inspect the result.".into());
            }
            _ => response.message = Some("Process result exceeds the tool response limit. Inspect a narrower focus or read less history.".into()),
        },
        Err(Error::Rejected { message, .. }) => response.message = Some(message),
        Err(Error::Uncertain(message)) => {
            *fresh = false;
            response.status = Status::Uncertain;
            response.message = Some(message);
        }
    }
    response.fresh = *fresh;
    Arc::new(response)
}
