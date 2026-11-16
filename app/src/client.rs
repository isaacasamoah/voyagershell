pub use crate::terminal_lifecycle::Lifecycle;
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
    Action, Context, CoreTerminalId, Layout, Request, Response, Status, TerminalRequest, VesselId,
};

#[path = "client_core.rs"]
mod core_calls;
#[path = "client_reply.rs"]
mod reply;
#[path = "client_terminal.rs"]
mod terminal_start;
use crate::adoption::{Adoptions, Unsaved};
use crate::front_door::{Admission, Claim, Envelope, FrontDoor, Outcome, WAITING};
use crate::layout_store::{begin_save, carry_notice, load, rejected, save, settle_save};
use crate::vessel_socket::{Call, Sockets};
use core_calls::{
    Listing, Notices, Observer, Subscription, changed_layout, close_exited, commit, connect, live,
    live_directories, post, relist, reports, unlisted,
};
use terminal_start::{CreatedTerminal, require_finished};

pub(crate) const WORKSPACE_WAIT: Duration = Duration::from_secs(22);
const _: () = assert!(crate::core::DEADLINE.as_secs() < WORKSPACE_WAIT.as_secs());

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
    CoreReported,
    RefreshActivity {
        reply: async_channel::Sender<()>,
    },
    Subscribed,
    Quit {
        operation: Lifecycle,
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
    Listed {
        terminals: Result<Vec<crate::core_shapes::Terminal>, Error>,
    },
    WorkspaceChanges {
        after: Option<WorkspaceNotice>,
        reply: async_channel::Sender<async_channel::Receiver<WorkspaceNotice>>,
    },
    BindContent {
        id: VesselId,
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
        scope: Option<Context>,
        request: voyager_contract::worktree::Request,
        source_directory: String,
        reply: SyncSender<Result<Vec<String>, String>>,
    },
    RemovalListed {
        reply: SyncSender<Result<Vec<String>, String>>,
        terminals: Result<Vec<crate::core_shapes::Terminal>, Error>,
    },
    WorktreeDone {
        scope: Option<Context>,
        request: voyager_contract::worktree::Request,
        source_directory: String,
        response: voyager_contract::worktree::Response,
        reply: SyncSender<Arc<voyager_contract::worktree::Response>>,
    },
    Process {
        scope: Context,
        request: ProcessRequest,
        reply: SyncSender<Arc<ProcessResponse>>,
        queued_at: std::time::Instant,
        claim: Claim,
    },
    ProcessDone {
        request_id: String,
        completed: crate::process::Completed,
        reply: SyncSender<Arc<ProcessResponse>>,
    },
    Workspace {
        request: Request,
        scope: Option<Context>,
        program: Option<VesselId>,
        reply: SyncSender<Response>,
        queued_at: std::time::Instant,
        claim: Claim,
    },
    NoteExit {
        view: crate::content::ViewBinding,
        revision: String,
        request: Request,
        reply: SyncSender<Response>,
        claim: Claim,
    },
    NoteRenameReady {
        request: Request,
        scope: Option<Context>,
        program: Option<VesselId>,
        reply: SyncSender<Response>,
        result: Result<Option<String>, CallError>,
    },
    Terminal {
        content: VesselId,
        request_id: String,
        expected_version: u64,
        reply: SyncSender<Result<Viewer, Error>>,
        claim: Claim,
    },
    Saved {
        result: Result<u64, Error>,
    },
    Relisted {
        request: Request,
        scope: Option<Context>,
        reply: SyncSender<Response>,
        terminals: Result<Vec<crate::core_shapes::Terminal>, Error>,
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

#[derive(Clone)]
struct Settled {
    status: voyager_contract::Outcome,
    message: Option<String>,
    created_workspace: bool,
    close_plan: Option<voyager_contract::voyage_close::Plan>,
}

#[derive(Clone)]
enum Receipt {
    Workspace(Settled),
    Content(Arc<voyager_contract::content::Response>),
    Worktree(Arc<voyager_contract::worktree::Response>),
    Process(Arc<ProcessResponse>),
    Terminal(Result<WeakViewer, Error>),
}

impl Receipt {
    fn workspace(&self) -> Option<Settled> {
        match self {
            Self::Workspace(settled) => Some(settled.clone()),
            _ => None,
        }
    }

    fn content(&self) -> Option<Arc<voyager_contract::content::Response>> {
        match self {
            Self::Content(response) => Some(Arc::clone(response)),
            _ => None,
        }
    }

    fn worktree(&self) -> Option<Arc<voyager_contract::worktree::Response>> {
        match self {
            Self::Worktree(response) => Some(Arc::clone(response)),
            _ => None,
        }
    }

    fn process(&self) -> Option<Arc<ProcessResponse>> {
        match self {
            Self::Process(response) => Some(Arc::clone(response)),
            _ => None,
        }
    }

    fn terminal(&self) -> Option<Result<WeakViewer, Error>> {
        match self {
            Self::Terminal(result) => Some(result.clone()),
            _ => None,
        }
    }
}

struct Departure {
    before: Arc<Layout>,
    candidate: Layout,
    expected: u64,
    reopening: Vec<VesselId>,
    created_notes: bool,
}

struct Flight {
    request: Request,
    scope: Option<Context>,
    reply: SyncSender<Response>,
    departure: Box<Departure>,
}

enum Step {
    Done,
    Deferred,
    List,
    Save(Box<Departure>),
}

fn unbound(created_notes: bool, error: Error) -> Error {
    if created_notes {
        Error::Uncertain(format!(
            "A Notes file was created but workspace binding is unconfirmed; inspect before retry: {error:?}"
        ))
    } else {
        error
    }
}

impl Message {
    fn waits(&self, held: usize) -> bool {
        let effect = match self {
            Self::Workspace { request, scope, .. } => {
                Envelope::workspace(scope.as_ref(), request).effect
            }
            Self::NoteExit { request, .. } => Envelope::workspace(None, request).effect,
            Self::Content {
                access, request, ..
            } => Envelope::content(access, request).effect,
            Self::Process { scope, request, .. } => Envelope::process(scope, request).effect,
            Self::Worktree { .. } | Self::Terminal { .. } => true,
            Self::CloseDone { .. }
            | Self::Quit { .. }
            | Self::Listed { .. }
            | Self::WorktreeRemoveReady { .. }
            | Self::WorktreeDone { .. }
            | Self::NoteRenameReady { .. } => return true,
            Self::PrepareContext { .. }
            | Self::CloseSaves { .. }
            | Self::CoreReported
            | Self::RefreshActivity { .. }
            | Self::Subscribed
            | Self::RemovalListed { .. }
            | Self::Relisted { .. }
            | Self::Launches { .. }
            | Self::RefreshContentViews
            | Self::RegisterView { .. }
            | Self::ContextFacts { .. }
            | Self::WorkspaceObservation { .. }
            | Self::WorkspaceChanges { .. }
            | Self::BindContent { .. }
            | Self::ContentChanges { .. }
            | Self::ProcessDone { .. }
            | Self::Saved { .. } => return false,
        };
        effect && held < WAITING
    }
}

#[derive(Clone, Debug)]
pub enum CallError {
    Rejected(String),
    Unconfirmed(String),
}

pub(crate) struct PendingCall(mpsc::Receiver<Response>, Duration, Claim);

impl PendingCall {
    pub(crate) fn wait(self) -> Result<Response, CallError> {
        answer(&self.0, self.1, &self.2, "Workspace")
    }
}

fn answer<T>(
    receive: &mpsc::Receiver<T>,
    within: Duration,
    claim: &Claim,
    what: &str,
) -> Result<T, CallError> {
    receive.recv_timeout(within).map_err(|_| {
        if claim.cancel() {
            CallError::Rejected(format!(
                "Workspace busy; the {} request was still queued when its wait ended, so it was cancelled and nothing was sent",
                what.to_lowercase()
            ))
        } else {
            CallError::Unconfirmed(format!("{what} result unconfirmed; do not repeat the request"))
        }
    })
}

#[derive(Clone)]
pub struct Client {
    sender: async_channel::Sender<Message>,
    sequence: Arc<AtomicU64>,
    package_revision: Arc<AtomicU64>,
    identity: String,
    activity: Arc<Mutex<Activity>>,
    prepared_context: Arc<Mutex<Option<crate::context::Prepared>>>,
    placement_notice: Arc<Mutex<Option<String>>>,
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
            placement_notice: Arc::default(),
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
        let core_sender = sender.clone();
        thread::spawn(move || {
            if let Ok(mut activity) = observed_activity.lock() {
                activity.wake_with(Box::new(move || {
                    let _ = activity_sender.try_send(Message::CoreReported);
                }));
            }
            let mut core = connect(&session, observed_activity.clone());
            let mut subscription = Subscription::default();
            subscription.begin(&mut core, false, &core_sender);
            let mut exits = Vec::<CoreTerminalId>::new();
            let mut adoptions = Adoptions::new(close_client.placement_notice.clone());
            let caller = close_client.clone();
            let call: Call = Arc::new(move |vessel, request| caller.program_call(vessel, request));
            let mut vessel_sockets = Sockets::new(&session, call);
            let mut layout = Arc::new(Layout::default());
            let mut version = 0;
            let mut fresh = false;
            let mut door = FrontDoor::<Receipt>::default();
            let mut held = VecDeque::<Message>::new();
            let mut flight: Option<Flight> = None;
            let mut unconfirmed = HashMap::<String, String>::new();
            let mut created_vessels = Vec::<CreatedTerminal>::new();
            let mut reopened = false;
            let mut live_bindings = Vec::<CoreTerminalId>::new();
            let mut listing = Listing::default();
            let mut notices = Notices::new(observed_activity.clone(), published_packages);
            let mut closing = crate::voyage_close::Closing::default();
            let mut renaming: Option<(
                crate::voyage_close::SaveTicket,
                crate::content::rename::Plan,
                crate::voyage_close::RenameRelease,
            )> = None;
            loop {
                let gate = |event: &_| door.gate(&Envelope::report(event)).is_ok();
                let reported = reports(
                    &observed_activity,
                    &layout,
                    &mut exits,
                    &mut adoptions,
                    gate,
                );
                let before = version;
                let mut noticed = false;
                if !door.flying() && adoptions.waiting() {
                    if door
                        .gate(&Envelope::observed(close_client.request_id(), version))
                        .is_err()
                    {
                        adoptions.drop_all();
                    } else if fresh && let Ok(current_core) = core.as_mut() {
                        let saved = (&mut layout, &mut version, &mut fresh);
                        let save = |candidate: &Layout, at| {
                            save(current_core, candidate, at).map_err(|error| match error {
                                Error::Rejected { message, .. } => Unsaved::Refused(message),
                                Error::Uncertain(message) => Unsaved::Unconfirmed(message),
                            })
                        };
                        noticed = adoptions.settle(save, saved, &mut live_bindings);
                    }
                }
                if !door.flying() && !exits.is_empty() {
                    let closure = Envelope::observed(close_client.request_id(), version);
                    if door.gate(&closure).is_err() {
                        exits.clear();
                    } else if fresh && let Ok(current_core) = core.as_mut() {
                        let live = live(&live_bindings, &closing);
                        let ended = std::mem::take(&mut exits);
                        let saved = (&mut layout, &mut version, &mut fresh);
                        close_exited(current_core, saved, &ended, &live);
                    }
                }
                if reported || noticed || version != before {
                    notices.send(version, closing.revision);
                }
                vessel_sockets.sync(&layout);
                if !door.quitting()
                    && let Ok(current_core) = core.as_mut()
                {
                    listing.start(current_core, &layout, version, fresh, &core_sender);
                }
                let waiting = (!door.flying()).then(|| held.pop_front()).flatten();
                let Ok(message) = waiting.map_or_else(|| receiver.recv_blocking(), Ok) else {
                    break;
                };
                if door.flying() && message.waits(held.len()) {
                    held.push_back(message);
                    continue;
                }
                let previous_version = version;
                let previous_close_revision = closing.revision;
                let mut landed = None;
                let mut listed = None;
                let mut note_exit = None;
                let mut rename_ready = None;
                let mut rename_rebind = None;
                let mut rename_release = None;
                let mut program = None;
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
                        program: from,
                        reply,
                        result,
                    } => {
                        program = from;
                        if renaming.as_ref().is_some_and(|(ticket, _, _)| {
                            *ticket == crate::voyage_close::SaveTicket::new(&request.request_id)
                        }) {
                            rename_ready = renaming.take().map(|(ticket, plan, release)| {
                                rename_release = Some(release);
                                (ticket, plan, result)
                            });
                            door.forget(&request.request_id);
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
                        let status = Outcome::from(result.clone()).status();
                        if status == voyager_contract::Outcome::Uncertain {
                            fresh = false;
                        }
                        closing.finish(result);
                        let plan = closing.projected(&layout, scope.as_ref());
                        let response = Response {
                            request_id: request.request_id.clone(),
                            status: status.clone(),
                            version,
                            layout: crate::scope::project(&layout, scope.as_ref()),
                            fresh,
                            created_workspace: false,
                            created_vessels: eligible_contents(
                                &layout,
                                scope.as_ref(),
                                &created_vessels,
                            ),
                            message: plan.as_ref().and_then(|plan| plan.message.clone()),
                            close_plan: plan.clone(),
                        };
                        door.settle(
                            &request.request_id,
                            Receipt::Workspace(Settled {
                                status,
                                message: response.message.clone(),
                                created_workspace: false,
                                close_plan: plan,
                            }),
                        );
                        notices.send(version, closing.revision);
                        let _ = reply.send(response);
                        continue;
                    }
                    Message::CoreReported => continue,
                    Message::RefreshActivity { reply } => {
                        subscription.refresh(&mut core, door.quitting(), &core_sender, reply);
                        continue;
                    }
                    Message::Subscribed => {
                        subscription.landed();
                        continue;
                    }
                    Message::Quit { operation, reply } => {
                        let result = door.end(operation, &mut core);
                        created_vessels.clear();
                        fresh = false;
                        let _ = reply.try_send(result);
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
                        let observer = Observer {
                            scope,
                            version: expected,
                            active,
                            reply,
                        };
                        match &core {
                            Ok(_) if !door.quitting() => listing.observe(observer),
                            _ => observer.answer(&layout, version, fresh, None),
                        }
                        continue;
                    }
                    Message::Listed { terminals } => {
                        let (begun, terminals) = (listing.listed(), terminals.ok());
                        let observed =
                            Envelope::observed(close_client.request_id(), begun.unwrap_or(version));
                        let closed = (|| -> Result<(), String> {
                            let (Some(terminals), Ok(current_core), Ok(()), true) =
                                (&terminals, core.as_mut(), door.gate(&observed), fresh)
                            else {
                                return Ok(());
                            };
                            let current = begun == Some(version);
                            let live = live(&live_bindings, &closing);
                            if let Some(candidate) =
                                changed_layout(&layout, terminals, &live, current)?
                            {
                                commit(
                                    current_core,
                                    &mut layout,
                                    &mut version,
                                    &mut fresh,
                                    candidate,
                                )?;
                                notices.send(version, closing.revision);
                            }
                            if current {
                                live_bindings = terminals
                                    .iter()
                                    .filter(|terminal| terminal.is_live())
                                    .map(|terminal| CoreTerminalId(terminal.address.clone()))
                                    .collect();
                            }
                            Ok(())
                        })();
                        let listed = closed.map(|()| terminals.as_deref());
                        listing.answer(begun, listed, &layout, version, fresh);
                        continue;
                    }
                    Message::WorkspaceChanges { after, reply } => {
                        let (send, receive) = async_channel::bounded(1);
                        let current = notices.current(version, closing.revision);
                        if after != Some(current) {
                            let _ = send.try_send(current);
                        }
                        notices.listener = Some(send);
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
                        let agent = match &access {
                            crate::content::Access::Agent {
                                expected_version, ..
                            } => Some(*expected_version),
                            crate::content::Access::View(_) => None,
                        };
                        let ticket = match door.admit(
                            &Envelope::content(&access, &request),
                            &(&request, agent),
                            Receipt::content,
                        ) {
                            Admission::New(ticket) => ticket,
                            Admission::Repeat(first) => {
                                reply.deliver(first);
                                continue;
                            }
                            Admission::Pending(message) | Admission::Refused(message) => {
                                reply.deliver(Arc::new(crate::content::reject(&request, message)));
                                continue;
                            }
                        };
                        let result = (|| {
                            if renaming.as_ref().is_some_and(|(ticket, plan, _)| {
                                plan.vessels.contains(crate::content::identity(&request).0)
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
                        if version != previous_version {
                            notices.send(version, closing.revision);
                        }
                        door.record(ticket, Receipt::Content(Arc::clone(&response)));
                        reply.deliver(response);
                        continue;
                    }
                    Message::WorktreeRemoveReady {
                        scope,
                        request,
                        source_directory,
                        reply,
                    } => {
                        let preflight = (|| -> Result<_, String> {
                            door.gate(&Envelope::worktree(scope.as_ref(), &request))
                                .map_err(|_| {
                                    "Voyager is quitting; no worktree was removed".to_owned()
                                })?;
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
                            if !matches!(&scope, None | Some(Context::Workspace))
                                && !matches!(&scope, Some(Context::Voyage { id }) if id == &request.voyage)
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
                            core.begin_terminal_list().map_err(unlisted)
                        })();
                        match preflight {
                            Ok(pending) => {
                                door.depart();
                                post(&core_sender, pending, move |listed| {
                                    Message::RemovalListed {
                                        reply,
                                        terminals: listed.map(|listed| listed.terminals),
                                    }
                                });
                            }
                            Err(error) => drop(reply.send(Err(error))),
                        }
                        continue;
                    }
                    Message::RemovalListed { reply, terminals } => {
                        door.land();
                        let _ = reply.send(live_directories(terminals));
                        continue;
                    }
                    Message::WorktreeDone {
                        scope,
                        request,
                        source_directory,
                        mut response,
                        reply,
                    } => {
                        use voyager_contract::worktree::{
                            Action as WorktreeAction, Status as WorktreeStatus,
                        };
                        if response.status == WorktreeStatus::Applied
                            && matches!(
                                request.action,
                                WorktreeAction::Create { .. }
                                    | WorktreeAction::Open { .. }
                                    | WorktreeAction::Remove { .. }
                            )
                        {
                            let completion = (|| -> Result<(), String> {
                                door.gate(&Envelope::worktree(scope.as_ref(), &request))
                                    .map_err(|_| "Voyager is quitting".to_owned())?;
                                let checkout = response
                                    .checkouts
                                    .first()
                                    .ok_or("Git did not return the selected checkout")?;
                                let core = core
                                    .as_mut()
                                    .map_err(|error| format!("Core unavailable: {error:?}"))?;
                                let (current, revision, missing) = load(core, &cwd)
                                    .map_err(|error| format!("Workspace unavailable: {error:?}"))?;
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
                                    let current =
                                        std::fs::canonicalize(current_source).map_err(|error| {
                                            format!("Current Voyage directory unavailable: {error}")
                                        })?;
                                    if original != current {
                                        return Err("Source Voyage directory changed".into());
                                    }
                                }
                                let mut candidate = Model {
                                    layout: (*layout).clone(),
                                };
                                let actions = if let WorktreeAction::Remove { path } =
                                    &request.action
                                {
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
                                    vec![worktree_voyage_action(&candidate.layout, &checkout.path)?]
                                };
                                for action in actions {
                                    crate::scope::check(&layout, scope.as_ref(), &action)?;
                                    candidate.apply(action)?;
                                }
                                let saved =
                                    save(core, &candidate.layout, version).map_err(|error| {
                                        format!("Workspace save not confirmed: {error:?}")
                                    })?;
                                record_created_terminals(
                                    &mut created_vessels,
                                    &layout,
                                    &candidate.layout,
                                );
                                layout = Arc::new(candidate.layout);
                                version = saved;
                                if let Some(owner) = content.as_mut() {
                                    owner.refresh_views();
                                }
                                notices.send(version, closing.revision);
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
                        door.settle(&request.request_id, Receipt::Worktree(Arc::clone(&answer)));
                        let _ = reply.send(answer);
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
                        let ticket = match door.admit(
                            &Envelope::worktree(scope.as_ref(), &request),
                            &request,
                            Receipt::worktree,
                        ) {
                            Admission::New(ticket) => ticket,
                            Admission::Repeat(first) => {
                                let _ = reply.send(first);
                                continue;
                            }
                            Admission::Pending(message) => {
                                let _ = reply.send(Arc::new(WorktreeResponse {
                                    request_id: request.request_id.clone(),
                                    status: WorktreeStatus::Uncertain,
                                    message: Some(message),
                                    checkouts: Vec::new(),
                                }));
                                continue;
                            }
                            Admission::Refused(message) => {
                                let _ = reply.send(rejected(message));
                                continue;
                            }
                        };
                        let prepared = (|| -> Result<(String, Vec<String>), String> {
                            if door.crowded(&Envelope::worktree(scope.as_ref(), &request)) {
                                return Err("A worktree operation is already pending".into());
                            }
                            if !fresh || version != request.expected_version {
                                return Err(
                                    "Inspect the current workspace before using worktrees".into()
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
                                let answer = rejected(message);
                                door.record(ticket, Receipt::Worktree(Arc::clone(&answer)));
                                let _ = reply.send(answer);
                            }
                            Ok((directory, live)) => {
                                door.open(ticket);
                                let task_request = request;
                                let task_sender = worktree_sender.clone();
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
                                            task_sender.send_blocking(Message::WorktreeRemoveReady { scope: scope.clone(), request: task_request.clone(), source_directory: directory.clone(), reply: approval }).map_err(|_| crate::worktrees::Error::Rejected("Owner unavailable; no worktree was removed".into()))?;
                                            let live = receive.recv().map_err(|_| crate::worktrees::Error::Rejected("Owner check unavailable; no worktree was removed".into()))?.map_err(crate::worktrees::Error::Rejected)?;
                                            crate::worktrees::check_live_directories(
                                                &checkout.path,
                                                &live,
                                            )
                                            .map_err(
                                                |error| {
                                                    crate::worktrees::Error::Rejected(format!(
                                                        "{error:?}"
                                                    ))
                                                },
                                            )?;
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
                                        scope,
                                        request: task_request,
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
                        claim,
                    } => {
                        if !claim.take() {
                            continue;
                        }
                        if std::env::var_os("VOYAGER_TRACE_TOOLS").is_some() {
                            eprintln!(
                                "voyager_timing request={} family=process phase=actor-receive queued_us={}",
                                request.request_id,
                                queued_at.elapsed().as_micros()
                            );
                        }
                        let answered = |status: Status, message: String| {
                            Arc::new(ProcessResponse {
                                request_id: request.request_id.clone(),
                                status,
                                version,
                                fresh,
                                output: None,
                                message: Some(message),
                            })
                        };
                        let ticket = match door.admit(
                            &Envelope::process(&scope, &request),
                            &request,
                            Receipt::process,
                        ) {
                            Admission::New(ticket) => ticket,
                            Admission::Repeat(first) => {
                                let _ = reply.send(first);
                                continue;
                            }
                            Admission::Pending(message) => {
                                let _ = reply.send(answered(Status::Uncertain, message));
                                continue;
                            }
                            Admission::Refused(message) => {
                                let _ = reply.send(answered(Status::Rejected, message));
                                continue;
                            }
                        };
                        let result = if door.crowded(&Envelope::process(&scope, &request)) {
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
                        let error = match result {
                            Ok(effect) => {
                                door.open(ticket);
                                let sender = process_sender.clone();
                                thread::spawn(move || {
                                    let completed = effect.wait(version);
                                    let _ = sender.send_blocking(Message::ProcessDone {
                                        request_id: request.request_id,
                                        completed,
                                        reply,
                                    });
                                });
                                continue;
                            }
                            Err(error) => error,
                        };
                        let answer = process_response(
                            request.request_id.clone(),
                            version,
                            &mut fresh,
                            Err(error).into(),
                        );
                        door.record(ticket, Receipt::Process(Arc::clone(&answer)));
                        let _ = reply.send(answer);
                        continue;
                    }
                    Message::ProcessDone {
                        request_id,
                        completed,
                        reply,
                    } => {
                        let completed = completed.settle(core.as_mut().ok());
                        let outcome = process_response(
                            request_id.clone(),
                            completed.read_at.unwrap_or(version),
                            &mut fresh,
                            completed.result.into(),
                        );
                        door.settle(&request_id, Receipt::Process(Arc::clone(&outcome)));
                        let _ = reply.send(outcome);
                        continue;
                    }
                    Message::Saved { result } => {
                        door.land();
                        let Some(Flight {
                            request,
                            scope,
                            reply,
                            departure,
                        }) = flight.take()
                        else {
                            continue;
                        };
                        let Departure {
                            before,
                            candidate,
                            expected,
                            reopening,
                            created_notes,
                        } = *departure;
                        let result = match (result, core.as_mut()) {
                            (Err(Error::Uncertain(message)), Ok(connected)) => {
                                settle_save(connected, &candidate, expected, message)
                            }
                            (result, _) => result,
                        };
                        landed = Some(result.map_err(|error| unbound(created_notes, error)).map(
                            |revision| {
                                created_vessels.extend(reopening.into_iter().map(|id| {
                                    CreatedTerminal {
                                        id,
                                        launch: voyager_contract::launch::Launch::Terminal,
                                        backend: None,
                                        shell_intent: None,
                                    }
                                }));
                                if let Action::StartNewShell {
                                    vessel_id,
                                    expected_backend,
                                } = &request.action
                                {
                                    grant_new_shell(
                                        &mut created_vessels,
                                        vessel_id,
                                        expected_backend,
                                        &request.request_id,
                                    );
                                    unconfirmed.remove(&vessel_id.0);
                                }
                                if (scope.is_some()
                                    || matches!(
                                        request.action,
                                        Action::CreateVessel { .. }
                                            | Action::CreateVoyageFromSource { .. }
                                            | Action::CreateFleetWithVessel { .. }
                                    ))
                                    && matches!(
                                        request.action,
                                        Action::CreateVoyage { .. }
                                            | Action::CreateVoyageFromSource { .. }
                                            | Action::CreateFleet { .. }
                                            | Action::CreateFleetWithVessel { .. }
                                            | Action::CreateVessel { .. }
                                    )
                                {
                                    record_created_terminals(
                                        &mut created_vessels,
                                        &before,
                                        &candidate,
                                    );
                                }
                                if revision > version {
                                    layout = Arc::new(candidate);
                                    version = revision;
                                }
                                Step::Done
                            },
                        ));
                        (request, scope, reply)
                    }
                    Message::Relisted {
                        request,
                        scope,
                        reply,
                        terminals,
                    } => {
                        door.land();
                        door.forget(&request.request_id);
                        listed = Some(terminals);
                        (request, scope, reply)
                    }
                    Message::Workspace {
                        request,
                        scope,
                        program: from,
                        reply,
                        queued_at,
                        claim,
                    } => {
                        if !claim.take() {
                            continue;
                        }
                        program = from;
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
                        claim,
                    } => {
                        if !claim.take() {
                            continue;
                        }
                        note_exit = Some((view, revision));
                        (request, None, reply)
                    }
                    Message::Terminal {
                        content,
                        request_id,
                        expected_version,
                        reply,
                        claim,
                    } => {
                        if !claim.take() {
                            continue;
                        }
                        let request = TerminalRequest {
                            request_id,
                            vessel_id: content.clone(),
                            expected_version,
                        };
                        let ticket = match door.admit(
                            &Envelope::terminal(&request),
                            &request,
                            Receipt::terminal,
                        ) {
                            Admission::New(ticket) => ticket,
                            Admission::Repeat(first) => {
                                let _ = reply.send(first.and_then(|viewer| viewer.upgrade()));
                                continue;
                            }
                            Admission::Pending(message) => {
                                let _ = reply.send(Err(Error::Uncertain(message)));
                                continue;
                            }
                            Admission::Refused(message) => {
                                let _ = reply.send(Err(rejected(message)));
                                continue;
                            }
                        };
                        let result = if !fresh {
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
                        } else if created_vessels.iter().any(|pending| pending.id == content)
                            && !visible_content(&layout, &content)
                        {
                            Err(rejected(
                                "Created content is not currently visible; no terminal was started"
                                    .into(),
                            ))
                        } else {
                            match core.as_mut() {
                                Ok(core) => terminal_start::open_terminal(
                                    core,
                                    &mut layout,
                                    &mut version,
                                    &mut fresh,
                                    &mut unconfirmed,
                                    &mut created_vessels,
                                    &request,
                                ),
                                Err(error) => Err(error.clone()),
                            }
                        };
                        if result.is_ok()
                            && let Some(backend) = layout
                                .vessels
                                .iter()
                                .find(|item| item.id == content)
                                .and_then(|item| item.backend.clone())
                            && !live_bindings.contains(&backend)
                        {
                            live_bindings.push(backend);
                        }
                        settle_created_content(&mut created_vessels, &content, &result);
                        door.record(ticket, Receipt::Terminal(result.clone().map(Into::into)));
                        if reply.send(result).is_err() {
                            eprintln!("Terminal result receiver closed");
                        }
                        continue;
                    }
                };
                let mut package_changed = false;
                let inspecting = matches!(request.action, Action::Inspect);
                let mut response = Response {
                    request_id: request.request_id.clone(),
                    status: voyager_contract::Outcome::Refused,
                    version,
                    layout: crate::scope::project(&layout, scope.as_ref()),
                    fresh,
                    created_workspace: false,
                    created_vessels: eligible_contents(&layout, scope.as_ref(), &created_vessels),
                    message: None,
                    close_plan: closing.projected(&layout, scope.as_ref()),
                };
                let mut ticket = None;
                let result = if let Some(step) = landed {
                    step
                } else {
                    match door.admit(
                        &Envelope::admitted(program.as_ref(), scope.as_ref(), &request),
                        &request,
                        Receipt::workspace,
                    ) {
                        Admission::New(admitted) => ticket = Some(admitted),
                        Admission::Repeat(first) => {
                            response.status = first.status;
                            response.message = first.message;
                            response.created_workspace = first.created_workspace;
                            response.close_plan = first.close_plan;
                            let _ = reply.send(response);
                            continue;
                        }
                        Admission::Pending(message) => {
                            response.status = voyager_contract::Outcome::Uncertain;
                            response.message = Some(message);
                            let _ = reply.send(response);
                            continue;
                        }
                        Admission::Refused(message) => {
                            response.message = Some(message);
                            let _ = reply.send(response);
                            continue;
                        }
                    }
                    if door.quitting() {
                        response.status = voyager_contract::Outcome::Applied;
                        response.fresh = false;
                        let _ = reply.send(response);
                        continue;
                    }
                    match core.as_mut() {
                        Err(error) => Err(error.clone()),
                        Ok(core) => {
                            (|| {
                                if let Some((view, revision)) = &note_exit {
                                    if !view.is_active()
                                        || !matches!(&request.action, Action::RemovePlacement { id }
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
                                            vessel_id: view.binding.id().clone(),
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
                                            created_vessels.extend(ready.into_iter().map(|id| CreatedTerminal {
                                                id, launch: voyager_contract::launch::Launch::Terminal,
                                                backend: None, shell_intent: None,
                                            }));
                                        }
                                        live_bindings = terminals.iter().filter(|terminal| terminal.is_live())
                                            .map(|terminal| CoreTerminalId(terminal.address.clone())).collect();
                                        reopened = true;
                                    }
                                    unconfirmed.retain(|id, _| {
                                        candidate.layout.vessels.iter().any(|item| {
                                            &item.id.0 == id && item.start_pending.is_some()
                                        })
                                    });
                                    created_vessels.retain(|pending| {
                                        candidate.layout.vessels.iter().any(|item| {
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
                                    Ok(Step::Done)
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
                                            let Some(terminals) = listed.take() else {
                                                return Ok(Step::List);
                                            };
                                            closing.prepare(
                                                &layout,
                                                version,
                                                id,
                                                &request.request_id,
                                                &terminals?,
                                            )?;
                                            response.message = Some(
                                                "Confirm the Voyage shutdown; no work has stopped"
                                                    .into(),
                                            );
                                            return Ok(Step::Done);
                                        }
                                        Action::CancelVoyageClose { id, plan } => {
                                            if scope.is_some() {
                                                return Err(rejected("Only the native user can cancel a Voyage confirmation".into()));
                                            }
                                            closing.cancel(id, plan)?;
                                            return Ok(Step::Done);
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
                                            return Ok(Step::Deferred);
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
                                        let snapshot = plan.snapshot(plan.vessels[0].clone()).map_err(|error| Error::Uncertain(format!("The file moved to {}/{} but reading it failed: {error}. Inspect before another rename.", moved.directory, moved.filename)))?;
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
                                            for id in &plan.vessels {
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
                                        return Ok(Step::Done);
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
                                        saves.try_send(crate::voyage_close::SaveRequest::PrepareRename { ticket: ticket.clone(), vessels: plan.vessels.clone(), files: plan.files.clone(), reply: ready }).map_err(|_| rejected("Notes save service is busy; nothing was renamed".into()))?;
                                        let release = crate::voyage_close::RenameRelease::new(
                                            saves.clone(),
                                            ticket.clone(),
                                            plan.vessels.clone(),
                                        );
                                        renaming = Some((ticket, plan, release));
                                        let sender = close_sender.clone();
                                        let (request, scope) = (request.clone(), scope.clone());
                                        let (program, reply) = (program.clone(), reply.clone());
                                        thread::spawn(move || {
                                            let result = waiting.recv_blocking().unwrap_or_else(|_| Err(CallError::Unconfirmed("Notes save acknowledgement was lost; inspect before another rename".into())));
                                            let _ =
                                                sender.send_blocking(Message::NoteRenameReady {
                                                    request,
                                                    scope,
                                                    program,
                                                    reply,
                                                    result,
                                                });
                                        });
                                        return Ok(Step::Deferred);
                                    }
                                    if let Action::RemoveVesselPackage { type_id }
                                    | Action::RestoreVesselPackage { type_id } = &request.action
                                    {
                                        let (current, revision, missing) = load(core, &cwd).map_err(|error| rejected(format!("Workspace observation unavailable; no Vessel package was changed: {error:?}")))?;
                                        layout = Arc::new(current);
                                        version = revision;
                                        fresh = true;
                                        if missing || request.expected_version != version {
                                            return Err(rejected("Workspace changed; inspect before changing a Vessel package".into()));
                                        }
                                        crate::scope::check(
                                            &layout,
                                            scope.as_ref(),
                                            &request.action,
                                        )
                                        .map_err(rejected)?;
                                        if type_id == crate::vessel_type::NOTES_TYPE
                                            && layout.vessels.iter().any(|item| {
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
                                            Action::RemoveVesselPackage { .. } => {
                                                owner.remove_package(type_id)
                                            }
                                            _ => owner.restore_package(type_id),
                                        }
                                        .map_err(rejected)?;
                                        package_changed = true;
                                        return Ok(Step::Done);
                                    }
                                    if let Action::CreateVessel { type_id, .. }
                                    | Action::CreateFleetWithVessel { type_id, .. } =
                                        &request.action
                                        && let Some(owner) = &content
                                    {
                                        owner.require_available(type_id).map_err(rejected)?;
                                    }
                                    if let Action::CreateVoyageFromSource { source }
                                    | Action::CreateFleetWithVessel { source, .. } =
                                        &request.action
                                    {
                                        let terminals = if matches!(
                                            source,
                                            voyager_contract::DirectorySource::Live { .. }
                                        ) {
                                            let Some(terminals) = listed.take() else {
                                                return Ok(Step::List);
                                            };
                                            Some(terminals.map_err(|error| {
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
                                        Action::StartNewShell { .. }
                                            | Action::ReopenPlacement { .. }
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
                                    Action::StartNewShell { vessel_id, expected_backend } => {
                                        candidate.start_new_shell(vessel_id, expected_backend, &request.request_id)
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
                                        if let Action::ReopenPlacement { id, .. } = &request.action
                                            && let Some(backend) = reopen_backend(&layout, id, &unconfirmed).map_err(rejected)? {
                                                let observed = core.terminal_get(&backend.0)
                                                    .map_err(|error| rejected(format!("Terminal liveness unavailable; no viewer was reopened: {error:?}")))?;
                                                require_live(&observed, backend)?;
                                            }
                                        let created_notes = if let Some(owner) = content.as_mut() {
                                            crate::content::initialize_created(owner, &layout, &mut candidate.layout).map_err(Error::Uncertain)?
                                        } else if candidate.layout.vessels.iter().any(|item| item.type_id == crate::vessel_type::NOTES_TYPE && !layout.vessels.iter().any(|old| old.id == item.id)) {
                                            return Err(rejected("Content owner unavailable; Notes was not created".into()));
                                        } else { false };
                                        let pending = begin_save(core, &candidate.layout, version)
                                            .map_err(|error| unbound(created_notes, error))?;
                                        post(&core_sender, pending, |result| Message::Saved {
                                            result: result.map(|saved| saved.version),
                                        });
                                        Ok(Step::Save(Box::new(Departure {
                                            before: Arc::clone(&layout),
                                            candidate: candidate.layout,
                                            expected: version,
                                            reopening,
                                            created_notes,
                                        })))
                                    })
                                }
                            })()
                        }
                    }
                };
                let step = match result {
                    Ok(Step::Save(departure)) => {
                        if let Some(ticket) = ticket {
                            door.open(ticket);
                        }
                        door.depart();
                        flight = Some(Flight {
                            request,
                            scope,
                            reply,
                            departure,
                        });
                        continue;
                    }
                    Ok(Step::List) => {
                        match relist(&mut core, &core_sender, &request, scope.as_ref(), &reply) {
                            Ok(()) => {
                                if let Some(ticket) = ticket {
                                    door.open(ticket);
                                }
                                door.depart();
                                continue;
                            }
                            Err(error) => Err(error),
                        }
                    }
                    other => other,
                };
                let deferred = matches!(step, Ok(Step::Deferred));
                match Outcome::from(step) {
                    Outcome::Applied(_) => response.status = voyager_contract::Outcome::Applied,
                    Outcome::Refused { kind, message } => {
                        if inspecting || kind == "conflict" {
                            fresh = false;
                        }
                        response.message = Some(format!("{kind}: {message}"));
                    }
                    Outcome::Uncertain(message) => {
                        fresh = false;
                        response.status = voyager_contract::Outcome::Uncertain;
                        response.message = Some(message);
                    }
                }
                if let Ok(core) = core.as_mut() {
                    carry_notice(&mut core.layout.notice, &request.action, &mut response);
                }
                response.version = version;
                response.layout = crate::scope::project(&layout, scope.as_ref());
                response.created_vessels =
                    eligible_contents(&layout, scope.as_ref(), &created_vessels);
                response.fresh = fresh;
                response.close_plan = closing.projected(&layout, scope.as_ref());
                if let Some(mut release) = rename_release {
                    release.rebind = rename_rebind;
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
                        notices.packages.fetch_add(1, Ordering::Relaxed);
                    }
                    notices.send(version, closing.revision);
                }
                let prepare_dock = matches!(request.action, Action::Dock { .. })
                    && response.status == voyager_contract::Outcome::Applied
                    && fresh;
                let receipt = Receipt::Workspace(Settled {
                    status: response.status.clone(),
                    message: response.message.clone(),
                    created_workspace: response.created_workspace,
                    close_plan: response.close_plan.clone(),
                });
                match ticket {
                    Some(ticket) if deferred => door.open(ticket),
                    Some(ticket) => door.record(ticket, receipt),
                    None => door.settle(&request.request_id, receipt),
                }
                if !deferred {
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

    pub async fn bind_content(&self, id: VesselId) -> Result<crate::content::Binding, String> {
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
        id: VesselId,
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

    pub async fn end(&self, operation: Lifecycle) -> Result<(), Error> {
        let (reply, receive) = async_channel::bounded(1);
        self.sender
            .send(Message::Quit { operation, reply })
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
        if observed.status != voyager_contract::Outcome::Applied || !observed.fresh {
            return Err(CallError::Rejected(
                "Inspect the workspace before closing Notes".into(),
            ));
        }
        Ok(Request {
            request_id: self.request_id(),
            expected_version: observed.version,
            action: Action::RemovePlacement {
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
        let claim = Claim::default();
        self.sender
            .try_send(Message::NoteExit {
                view,
                revision,
                request,
                reply,
                claim: claim.clone(),
            })
            .map_err(|_| CallError::Rejected("Workspace busy; Notes Exit was not queued".into()))?;
        PendingCall(receive, Duration::from_secs(20), claim).wait()
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

    pub fn scoped_call(&self, scope: Context, request: Request) -> Result<Response, CallError> {
        self.ask(Some(scope), None, request)
    }

    fn ask(
        &self,
        scope: Option<Context>,
        program: Option<VesselId>,
        request: Request,
    ) -> Result<Response, CallError> {
        let first = self
            .queue_workspace(scope.clone(), program.clone(), request.clone())
            .and_then(PendingCall::wait);
        if !matches!(first, Err(CallError::Unconfirmed(_))) {
            return first;
        }
        self.queue_workspace(scope, program, request)
            .and_then(PendingCall::wait)
            .or(first)
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
        let first = self.queue_process(scope.clone(), request.clone());
        if !matches!(first, Err(CallError::Unconfirmed(_))) {
            return first;
        }
        self.queue_process(scope, request).or(first)
    }

    fn queue_process(
        &self,
        scope: Context,
        request: ProcessRequest,
    ) -> Result<Arc<ProcessResponse>, CallError> {
        let (reply, receive) = mpsc::sync_channel(1);
        let claim = Claim::default();
        self.sender
            .try_send(Message::Process {
                scope,
                request,
                reply,
                queued_at: std::time::Instant::now(),
                claim: claim.clone(),
            })
            .map_err(|_| {
                CallError::Rejected(
                    "Workspace busy or unavailable; no process request was queued".into(),
                )
            })?;
        answer(&receive, Duration::from_secs(25), &claim, "Process")
    }

    pub(crate) fn queue_inspection(&self) -> Result<PendingCall, CallError> {
        self.queue_workspace(
            None,
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
        program: Option<VesselId>,
        request: Request,
    ) -> Result<PendingCall, CallError> {
        let (reply, receive) = mpsc::sync_channel(1);
        let timeout = if matches!(request.action, Action::ConfirmVoyageClose { .. }) {
            Duration::from_secs(120)
        } else {
            WORKSPACE_WAIT
        };
        let claim = Claim::default();
        self.sender
            .try_send(Message::Workspace {
                request,
                scope,
                program,
                reply,
                queued_at: std::time::Instant::now(),
                claim: claim.clone(),
            })
            .map_err(|_| {
                CallError::Rejected("Workspace busy or unavailable; nothing was queued".into())
            })?;
        Ok(PendingCall(receive, timeout, claim))
    }

    pub fn terminal(
        &self,
        content: VesselId,
        request_id: String,
        expected_version: u64,
    ) -> Result<Viewer, Error> {
        let open = || -> Result<Result<Viewer, Error>, CallError> {
            let (reply, receive) = mpsc::sync_channel(1);
            let claim = Claim::default();
            self.sender
                .try_send(Message::Terminal {
                    content: content.clone(),
                    request_id: request_id.clone(),
                    expected_version,
                    reply,
                    claim: claim.clone(),
                })
                .map_err(|_| {
                    CallError::Rejected(
                        "Workspace busy or unavailable; no terminal was started".into(),
                    )
                })?;
            answer(&receive, Duration::from_secs(25), &claim, "Terminal")
        };
        let first = open();
        let answered = if matches!(first, Err(CallError::Unconfirmed(_))) {
            open().or(first)
        } else {
            first
        };
        answered.map_err(|error| match error {
            CallError::Rejected(message) => rejected(message),
            CallError::Unconfirmed(message) => Error::Uncertain(message),
        })?
    }
}

fn note_exit_target(
    layout: &Layout,
    content: &VesselId,
) -> Result<voyager_contract::PlacementId, String> {
    if !layout
        .vessels
        .iter()
        .any(|item| &item.id == content && item.type_id == crate::vessel_type::NOTES_TYPE)
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
                    fleet.placements.iter().filter(|panel| {
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
        .filter(|panel| &panel.vessel == content);
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
        let shell = model.layout.voyages[0].fleets[0].placements[0]
            .vessel
            .clone();
        assert!(note_exit_target(&model.layout, &shell).is_err());
        model
            .apply(Action::CreateVessel {
                type_id: crate::vessel_type::NOTES_TYPE.into(),
                destination: voyager_contract::ContentDestination::Placement {
                    owner: voyager_contract::PlacementOwner::Fleet { id: fleet },
                    insertion: voyager_contract::PlacementInsertion::Beside {
                        id: model.layout.voyages[0].fleets[0].placements[0].id.clone(),
                        side: voyager_contract::Side::Right,
                    },
                },
                launch: None,
            })
            .unwrap();
        let note = model.layout.voyages[0].fleets[0].placements[1].clone();
        assert_eq!(
            note_exit_target(&model.layout, &note.vessel).unwrap(),
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
        fleet.placements.push(duplicate.clone());
        assert!(note_exit_target(&model.layout, &note.vessel).is_err());
        model
            .apply(Action::RemovePlacement { id: duplicate.id })
            .unwrap();
        model
            .apply(Action::RemovePlacement { id: note.id })
            .unwrap();
        assert!(note_exit_target(&model.layout, &note.vessel).is_err());
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
            placement_notice: Arc::default(),
            package_revision: Arc::new(AtomicU64::new(0)),
        };
        let _inspection = client.queue_inspection().unwrap();
        let _later = client
            .queue_workspace(
                None,
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
    content: &VesselId,
    result: &Result<Viewer, Error>,
) {
    if matches!(result, Err(Error::Uncertain(_))) {
        pending.retain(|item| &item.id != content);
    }
}

fn visible_content(layout: &Layout, content: &VesselId) -> bool {
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
            &panel.vessel == content
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
        let root = crate::panels::visible(&fleet.root, &fleet.placements);
        fleet.placements.iter().any(|panel| {
            &panel.vessel == content
                && crate::panels::contains(&root, &panel.id)
                && fleet
                    .maximized_placement
                    .as_ref()
                    .is_none_or(|id| id == &panel.id)
        })
    })
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
        .vessels
        .iter()
        .find(|item| item.id == panel.vessel)
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
    content: &VesselId,
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
            .vessels
            .iter()
            .filter(|item| {
                item.type_id == "terminal" && !previous.vessels.iter().any(|old| old.id == item.id)
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
) -> Vec<VesselId> {
    let projection = crate::scope::project(layout, scope);
    pending
        .iter()
        .filter(|pending| projection.vessels.iter().any(|item| pending.eligible(item)))
        .map(|pending| pending.id.clone())
        .collect()
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
    let (request_id, vessel_id, expected_version) = match request {
        Request::MigrateNote {
            request_id,
            vessel_id,
            expected_version,
            ..
        }
        | Request::NewNote {
            request_id,
            vessel_id,
            expected_version,
            ..
        }
        | Request::OpenNote {
            request_id,
            vessel_id,
            expected_version,
            ..
        } => (request_id, vessel_id, expected_version),
        _ => return crate::content::reject(request, "Expected a note selection".into()),
    };
    let mut created = None;
    let selected = (|| {
        crate::content::admit(owner, layout, *version, access, request)?;
        if expected_version != version {
            return Err("Workspace changed; inspect before selecting a note".to_owned());
        }
        let directory = crate::content::notes_directory(layout, vessel_id)?;
        if matches!(request, Request::MigrateNote { .. }) {
            let current = crate::content::configuration(owner, layout, vessel_id, *version)?
                .ok_or("Notes configuration is unavailable")?;
            if current.configuration.notes_file.is_some() {
                return Err("This note already has a Markdown file".into());
            }
            let file = owner.migrate_file(vessel_id, &directory)?;
            created = Some(directory.join(&file.filename));
            let snapshot = owner.select_file(vessel_id, file.clone())?;
            let mut candidate = (**layout).clone();
            let content = candidate
                .vessels
                .iter_mut()
                .find(|item| item.id == *vessel_id)
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
            crate::content::rename::label(&mut candidate, vessel_id, &file.filename);
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
        let snapshot = owner.select_file(vessel_id, file.clone())?;
        let mut candidate = (**layout).clone();
        let content = candidate
            .vessels
            .iter_mut()
            .find(|item| item.id == *vessel_id)
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
        crate::content::rename::label(&mut candidate, vessel_id, &file.filename);
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
                    vessel_id: vessel_id.clone(),
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
                vessel_id: vessel_id.clone(),
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
                vessel_id: vessel_id.clone(),
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
        vessel_id,
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
        let current = crate::content::configuration(owner, layout, vessel_id, *version)?
            .ok_or("Notes configuration is unavailable")?;
        if configuration.notes_file != current.configuration.notes_file {
            return Err("Use a note selection action to change the selected file".into());
        }
        let mut candidate = (**layout).clone();
        candidate
            .vessels
            .iter_mut()
            .find(|content| content.id == *vessel_id)
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
                vessel_id: vessel_id.clone(),
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
                vessel_id: vessel_id.clone(),
                expected_revision: expected_version.to_string(),
                message,
            }
        }
    }
}

#[cfg(test)]
mod terminal_outcome_tests {
    use super::*;
    use voyager_contract::Outcome;

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
            assert_eq!(initial.status, Outcome::Applied);
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
        use voyager_contract::{ContentDestination, PlacementInsertion, PlacementOwner};
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
            assert_eq!(initial.status, Outcome::Applied, "{:?}", initial.message);
            let panel = initial.layout.voyages[0].fleets[0].placements[0].clone();
            let _viewer = client
                .terminal(panel.vessel.clone(), client.request_id(), initial.version)
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
            assert_eq!(created.status, Outcome::Applied);
            let target = created.layout.voyages[0].fleets[1].clone();
            let _other_viewer = client
                .terminal(
                    target.placements[0].vessel.clone(),
                    client.request_id(),
                    created.version,
                )
                .unwrap();
            let bound = client.call(request(0, Action::Inspect)).unwrap();
            let backend = bound
                .layout
                .vessels
                .iter()
                .find(|item| item.id == panel.vessel)
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
                .vessels
                .iter_mut()
                .find(|item| item.id == panel.vessel)
                .unwrap()
                .start_pending = Some("pending".into());
            assert!(reopen_backend(&uncertain, &panel.id, &HashMap::new()).is_err());
            assert!(
                reopen_backend(
                    &bound.layout,
                    &panel.id,
                    &HashMap::from([(panel.vessel.0.clone(), "uncertain".into())])
                )
                .is_err()
            );
            let closed = client
                .call(request(
                    bound.version,
                    Action::RemovePlacement {
                        id: panel.id.clone(),
                    },
                ))
                .unwrap();
            assert_eq!(closed.status, Outcome::Applied);
            let action = Action::ReopenPlacement {
                id: panel.id.clone(),
                destination: ContentDestination::Placement {
                    owner: PlacementOwner::Fleet {
                        id: target.id.clone(),
                    },
                    insertion: PlacementInsertion::Beside {
                        id: target.placements[0].id.clone(),
                        side: voyager_contract::Side::Right,
                    },
                },
            };
            let external = core
                .document_set("voyager-layout-v2", &closed.layout, closed.version)
                .unwrap();
            let stale = client
                .call(request(closed.version, action.clone()))
                .unwrap();
            assert_eq!(stale.status, Outcome::Refused);
            assert_eq!(stale.version, external.version);
            assert_eq!(stale.layout, closed.layout);
            let inspected = client.call(request(0, Action::Inspect)).unwrap();
            let reopen = request(inspected.version, action.clone());
            let opened = client.call(reopen.clone()).unwrap();
            assert_eq!(opened.status, Outcome::Applied);
            assert_eq!(client.call(reopen).unwrap(), opened);
            assert_eq!(opened.layout.vessels, bound.layout.vessels);
            assert!(opened.layout.voyages[0].fleets[0].placements.is_empty());
            let placed = &opened.layout.voyages[0].fleets[1].placements;
            assert_eq!(placed[0], target.placements[0]);
            assert_eq!(placed[1], panel);
            assert_eq!(placed[0].name, placed[1].name);
            assert_ne!(placed[0].id, placed[1].id);
            assert_eq!(core.terminal_get(&backend.0).unwrap().pid, live.pid);
            assert_eq!(core.terminal_list().unwrap().len(), 2);
            let closed = client
                .call(request(
                    opened.version,
                    Action::RemovePlacement { id: panel.id },
                ))
                .unwrap();
            core.terminal_kill(&backend.0).unwrap();
            let deadline = std::time::Instant::now() + Duration::from_secs(5);
            while core.terminal_get(&backend.0).unwrap().state == "live" {
                assert!(std::time::Instant::now() < deadline);
                thread::sleep(Duration::from_millis(10));
            }
            let refused = client.call(request(closed.version, action)).unwrap();
            assert_eq!(refused.status, Outcome::Refused);
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
            .apply(Action::CreateVessel {
                type_id: "terminal".into(),
                destination: voyager_contract::ContentDestination::Placement {
                    owner: voyager_contract::PlacementOwner::Portals {
                        voyage: model.layout.voyages[0].id.clone(),
                    },
                    insertion: voyager_contract::PlacementInsertion::Empty,
                },
                launch: None,
            })
            .unwrap();
        let id = model.layout.vessels[0].id.clone();
        let backend = CoreTerminalId("t1".into());
        model.layout.vessels[0].backend = Some(backend.clone());
        model.layout.vessels[0].launch = Some(voyager_contract::launch::Launch::Codex {
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
            vessel_id: id.clone(),
            expected_backend: backend.clone(),
        };
        let scope = Context::Vessel {
            id: model.layout.voyages[0].fleets[0].placements[0].id.clone(),
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
                vessel_id: model.layout.voyages[0].portals[0].vessel.clone(),
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
        expected.vessels[0].launch = Some(voyager_contract::launch::Launch::Terminal);
        expected.vessels[0].shell_intent = Some("intent".into());
        assert_eq!(model.layout, expected);
        let mut pending = Vec::new();
        assert!(eligible_contents(&Arc::new(model.layout.clone()), None, &pending).is_empty());
        grant_new_shell(&mut pending, &id, &backend, "intent");
        model.layout.vessels[0].shell_intent = Some("changed".into());
        assert!(eligible_contents(&Arc::new(model.layout.clone()), None, &pending).is_empty());
        model.layout.vessels[0].shell_intent = Some("intent".into());
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
        let after = model.layout.voyages[0].fleets[0].placements[0].id.clone();
        let terminal = model.layout.vessels[0].id.clone();
        let previous = model.layout.clone();
        model
            .apply(Action::CreateVessel {
                launch: None,
                type_id: crate::vessel_type::NOTES_TYPE.into(),
                destination: voyager_contract::ContentDestination::Placement {
                    owner: voyager_contract::PlacementOwner::Fleet { id: fleet.clone() },
                    insertion: voyager_contract::PlacementInsertion::Beside {
                        id: after.clone(),
                        side: voyager_contract::Side::Right,
                    },
                },
            })
            .unwrap();
        let notes = model.layout.vessels.last().unwrap().id.clone();
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
            .apply(Action::CreateVessel {
                launch: None,
                type_id: "terminal".into(),
                destination: voyager_contract::ContentDestination::Placement {
                    owner: voyager_contract::PlacementOwner::Fleet { id: fleet },
                    insertion: voyager_contract::PlacementInsertion::Beside {
                        id: after,
                        side: voyager_contract::Side::Bottom,
                    },
                },
            })
            .unwrap();
        let new_terminal = model.layout.vessels.last().unwrap().id.clone();
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
            .vessels
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
            .vessels
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
                voyager_contract::PlacementOwner::Portals {
                    voyage: model.layout.voyages[0].id.clone(),
                }
            } else {
                voyager_contract::PlacementOwner::Fleet {
                    id: model.layout.voyages[0].fleets[0].id.clone(),
                }
            };
            if portals {
                model
                    .apply(Action::CreateVessel {
                        type_id: "terminal".into(),
                        launch: None,
                        destination: voyager_contract::ContentDestination::Placement {
                            owner: owner.clone(),
                            insertion: voyager_contract::PlacementInsertion::Empty,
                        },
                    })
                    .unwrap();
            }
            let first = crate::panels::group(&model.layout, &owner).unwrap().members[0].clone();
            model
                .apply(Action::CreateVessel {
                    type_id: "terminal".into(),
                    launch: None,
                    destination: voyager_contract::ContentDestination::Placement {
                        owner: owner.clone(),
                        insertion: voyager_contract::PlacementInsertion::Beside {
                            id: first.id.clone(),
                            side: voyager_contract::Side::Right,
                        },
                    },
                })
                .unwrap();
            let second = crate::panels::group(&model.layout, &owner).unwrap().members[1].clone();
            let pending = vec![CreatedTerminal {
                id: second.vessel.clone(),
                launch: Default::default(),
                backend: None,
                shell_intent: None,
            }];
            assert_eq!(
                eligible_contents(&Arc::new(model.layout.clone()), None, &pending),
                vec![second.vessel.clone()]
            );
            model
                .apply(Action::SetPlacementMaximized {
                    id: first.id.clone(),
                    maximized: true,
                })
                .unwrap();
            assert!(!visible_content(&model.layout, &second.vessel));
            assert_eq!(
                eligible_contents(&Arc::new(model.layout.clone()), None, &pending),
                vec![second.vessel.clone()]
            );
            model
                .apply(Action::SetPlacementMaximized {
                    id: first.id,
                    maximized: false,
                })
                .unwrap();
            assert_eq!(
                eligible_contents(&Arc::new(model.layout), None, &pending),
                vec![second.vessel]
            );
        }
    }

    #[test]
    fn uncertain_start_discards_only_its_automatic_eligibility() {
        let first = VesselId("first".into());
        let other = VesselId("other".into());
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
        let error = terminal_start::attach_failure(
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
            terminal_start::attach_failure(Error::Uncertain("connection lost".into()), true, "t1"),
            Error::Uncertain(_)
        ));
    }
}

fn process_response(
    request_id: String,
    version: u64,
    fresh: &mut bool,
    outcome: Outcome<voyager_contract::administrator::ProcessOutput>,
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
    match outcome {
        Outcome::Applied(output) => match serde_json::to_vec(&output) {
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
        Outcome::Refused { message, .. } => response.message = Some(message),
        Outcome::Uncertain(message) => {
            *fresh = false;
            response.status = Status::Uncertain;
            response.message = Some(message);
        }
    }
    response.fresh = *fresh;
    Arc::new(response)
}

#[cfg(test)]
#[path = "client_admission_tests.rs"]
mod content_admission_tests;
