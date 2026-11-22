pub use crate::core::CallError;
use crate::core::{Error, Viewer, WeakViewer};
pub use crate::families::terminal::Lifecycle;
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

#[path = "client_core.rs"]
mod core_calls;
#[path = "client_owner.rs"]
mod owner;
#[path = "client_reply.rs"]
mod reply;
#[path = "client_service.rs"]
mod service;
#[path = "client_terminal.rs"]
mod terminal_start;
use crate::activity::Activity;
use crate::front_door::{Claim, Envelope, WAITING};
use crate::layout_store::rejected;
pub use core_calls::WorkspaceNotice;
pub use service::{ProgramError, ProgramReply, ProgramRequest, ProgramSpec};

pub use crate::layout_store::CHANGED;
pub(crate) const WORKSPACE_WAIT: Duration = Duration::from_secs(22);
const _: () = assert!(crate::core::DEADLINE.as_secs() < WORKSPACE_WAIT.as_secs());
const _: () = assert!(service::WAIT.as_secs() < WORKSPACE_WAIT.as_secs());

enum Message {
    PrepareContext {
        scope: Context,
        version: u64,
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
    Service {
        request: ProgramRequest,
        reply: SyncSender<Result<ProgramReply, Error>>,
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
    Content {
        access: crate::content::Access,
        request: voyager_contract::content::Request,
        reply: SyncSender<Arc<voyager_contract::content::Response>>,
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
            Self::Content {
                access, request, ..
            } => Envelope::content(access, request).effect,
            Self::Process { scope, request, .. } => Envelope::process(scope, request).effect,
            Self::Worktree { .. } | Self::Terminal { .. } | Self::Service { .. } => true,
            Self::CloseDone { .. }
            | Self::Quit { .. }
            | Self::Listed { .. }
            | Self::WorktreeRemoveReady { .. }
            | Self::WorktreeDone { .. } => return true,
            Self::PrepareContext { .. }
            | Self::CoreReported
            | Self::RefreshActivity { .. }
            | Self::Subscribed
            | Self::RemovalListed { .. }
            | Self::Relisted { .. }
            | Self::Launches { .. }
            | Self::ContextFacts { .. }
            | Self::WorkspaceObservation { .. }
            | Self::WorkspaceChanges { .. }
            | Self::BindContent { .. }
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
    workspace_words: Arc<Mutex<Vec<String>>>,
    replies: crate::replies::Replies,
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

    pub fn service(&self, request: ProgramRequest) -> Result<ProgramReply, Error> {
        let (reply, receive) = mpsc::sync_channel(1);
        self.sender
            .send_blocking(Message::Service { request, reply })
            .map_err(|_| Error::Uncertain("The workspace owner is unavailable".into()))?;
        receive.recv_timeout(service::WAIT).map_err(|_| {
            Error::Uncertain("The workspace owner did not answer the program request".into())
        })?
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

    pub fn with_content_and_profile(
        session: String,
        cwd: String,
        owner: crate::content::Owner,
        profile: std::path::PathBuf,
    ) -> Self {
        Self::start_with_profile(session, cwd, Some(owner), Some(profile))
    }

    fn start(session: String, cwd: String, content: Option<crate::content::Owner>) -> Self {
        Self::start_with_profile(session, cwd, content, None)
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

    pub fn content(
        &self,
        access: crate::content::Access,
        request: voyager_contract::content::Request,
    ) -> Result<Arc<voyager_contract::content::Response>, CallError> {
        check_content_size(&request)?;
        let (reply, receive) = mpsc::sync_channel(1);
        self.sender
            .try_send(Message::Content {
                access,
                request,
                reply,
            })
            .map_err(|_| {
                CallError::Rejected("Workspace busy; no content operation was queued".into())
            })?;
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
#[path = "client_admission_tests.rs"]
mod content_admission_tests;
