use crate::content::requests;
pub use crate::core::CallError;
use crate::core::{Error, Viewer, WeakViewer};
pub use crate::families::terminal::Lifecycle;
pub use crate::families::voyage_close::{SaveRequest, SaveTicket};
use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
        mpsc::{self, SyncSender},
    },
    time::Duration,
};
use voyager_contract::administrator::{ProcessRequest, ProcessResponse};
use voyager_contract::{Action, Context, Layout, Request, Response, VesselId};

#[path = "client_content.rs"]
mod content_calls;
#[path = "client_core.rs"]
mod core_calls;
#[path = "client_owner.rs"]
mod owner;
#[path = "client_reply.rs"]
mod reply;
#[path = "client_terminal.rs"]
mod terminal_start;
use crate::activity::Activity;
use crate::front_door::{Claim, Envelope, WAITING};
use crate::layout_store::rejected;
pub use core_calls::WorkspaceNotice;

pub use crate::layout_store::CHANGED;
pub(crate) const WORKSPACE_WAIT: Duration = Duration::from_secs(22);
const _: () = assert!(crate::core::DEADLINE.as_secs() < WORKSPACE_WAIT.as_secs());

enum Message {
    PrepareContext {
        scope: Context,
        version: u64,
    },
    CloseSaves {
        sender: async_channel::Sender<SaveRequest>,
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
        close_ticket: Option<SaveTicket>,
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
        completed: crate::families::terminal::Completed,
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
    ) -> Result<voyager_contract::context::Focus, String> {
        let mut focus = crate::context::focus(layout, version)?;
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
        if requests::is_write(&request) {
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
        ticket: Option<SaveTicket>,
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

    pub fn close_save_requests(&self) -> Result<async_channel::Receiver<SaveRequest>, String> {
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
        close_ticket: Option<SaveTicket>,
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
    use crate::workspace::Model;

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

#[cfg(test)]
#[path = "client_admission_tests.rs"]
mod content_admission_tests;
