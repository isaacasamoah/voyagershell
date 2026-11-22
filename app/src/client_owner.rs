use super::content_calls::{configure, select_note};
use super::core_calls::{
    Listing, Notices, Observer, Subscription, changed_layout, close_exited, commit, connect, live,
    reports,
};
use super::terminal_start::{self, CreatedTerminal};
use super::{Client, ContentReply, Message, Receipt};
use crate::adoption::{Adoptions, Unsaved};
use crate::content::requests;
use crate::core::{Core, Error, Viewer};
use crate::families::terminal::Lifecycle;
use crate::families::voyage_close::{Closing, RenameRelease, SaveTicket};
use crate::front_door::{Admission, Envelope, FrontDoor};
use crate::layout_parts::Part;
use crate::layout_store::{LayoutRevision, Seen, load, rejected, save};
use crate::vessel_socket::{Call, Sockets};
use crate::voyager_binding::Binding;
use std::{
    collections::{HashMap, VecDeque},
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
        mpsc::SyncSender,
    },
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use voyager_contract::administrator::{ProcessRequest, ProcessResponse};
use voyager_contract::{
    Context, CoreTerminalId, Layout, Request, Response, Status, TerminalRequest, VesselId,
};

#[path = "client_structure.rs"]
mod structure_calls;
#[path = "client_voyager.rs"]
mod voyager_calls;
#[path = "client_worktree.rs"]
mod worktree_calls;

struct Departure {
    before: Arc<Layout>,
    candidate: Layout,
    expected: LayoutRevision,
    reopening: Vec<VesselId>,
    created_notes: bool,
}

struct Flight {
    request: Request,
    scope: Option<Context>,
    program: Option<VesselId>,
    reply: SyncSender<Response>,
    departure: Box<Departure>,
}

enum Step {
    Done,
    Deferred,
    List,
    Save(Box<Departure>),
}

enum Start {
    Waiting(Option<Error>),
    Created,
    Ready,
}

struct Owner {
    cwd: String,
    launches: Option<PathBuf>,
    content: Option<crate::content::Owner>,
    client: Client,
    sender: async_channel::Sender<Message>,
    core: Result<Core, Error>,
    subscription: Subscription,
    exits: Vec<CoreTerminalId>,
    adoptions: Adoptions,
    sockets: Sockets,
    layout: Arc<Layout>,
    version: LayoutRevision,
    seen: Seen,
    fresh: bool,
    start: Start,
    door: FrontDoor<Receipt>,
    held: VecDeque<Message>,
    flight: Option<Flight>,
    unconfirmed: HashMap<String, String>,
    created_vessels: Vec<CreatedTerminal>,
    live_bindings: Vec<CoreTerminalId>,
    voyager_started: bool,
    listing: Listing,
    notices: Notices,
    closing: Closing,
    renaming: Option<(SaveTicket, crate::content::rename::Plan, RenameRelease)>,
}

impl Client {
    pub fn open_with_profile(session: String, cwd: String, profile: PathBuf) -> Self {
        Self::start_with_profile(session, cwd, None, Some(profile))
    }

    pub(super) fn start_with_profile(
        session: String,
        cwd: String,
        content: Option<crate::content::Owner>,
        profile: Option<PathBuf>,
    ) -> Self {
        let (sender, receiver) = async_channel::bounded::<Message>(8);
        let package_revision = Arc::new(AtomicU64::new(0));
        let client = Self {
            sender: sender.clone(),
            sequence: Arc::new(AtomicU64::new(0)),
            package_revision: package_revision.clone(),
            activity: Arc::default(),
            prepared_context: Arc::default(),
            placement_notice: Arc::default(),
            workspace_words: Arc::default(),
            replies: crate::replies::Replies::default(),
            identity: format!(
                "{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
            ),
        };
        let owner = client.clone();
        thread::spawn(move || {
            Owner::new(
                session,
                cwd,
                content,
                profile,
                owner,
                sender,
                package_revision,
            )
            .run(&receiver);
        });
        client
    }
}

impl Owner {
    fn new(
        session: String,
        cwd: String,
        content: Option<crate::content::Owner>,
        profile: Option<PathBuf>,
        client: Client,
        sender: async_channel::Sender<Message>,
        packages: Arc<AtomicU64>,
    ) -> Self {
        if let Ok(mut activity) = client.activity.lock() {
            let wake = sender.clone();
            activity.wake_with(Box::new(move || {
                let _ = wake.try_send(Message::CoreReported);
            }));
        }
        let mut core = connect(&session, client.activity.clone());
        let mut subscription = Subscription::default();
        subscription.begin(&mut core, false, &sender);
        let caller = client.clone();
        let call: Call = Arc::new(move |vessel, request| caller.program_call(vessel, request));
        let observer = client.clone();
        let activities: crate::vessel_socket::Activities =
            Arc::new(move || observer.reported_activity().terminals);
        let binding = profile
            .as_deref()
            .map_or_else(Binding::unbound, Binding::load);
        Self {
            cwd,
            launches: profile.map(|profile| profile.join("launches.json")),
            content,
            adoptions: Adoptions::new(client.placement_notice.clone()),
            sockets: Sockets::new(
                &session,
                crate::vessel_socket::Services { call, activities },
                binding,
                client.replies(),
            ),
            notices: Notices::new(client.activity.clone(), packages),
            client,
            sender,
            core,
            subscription,
            exits: Vec::new(),
            layout: Arc::new(Layout::default()),
            version: LayoutRevision::default(),
            seen: Seen::default(),
            fresh: false,
            start: Start::Waiting(None),
            door: FrontDoor::default(),
            held: VecDeque::new(),
            flight: None,
            unconfirmed: HashMap::new(),
            created_vessels: Vec::new(),
            live_bindings: Vec::new(),
            voyager_started: false,
            listing: Listing::default(),
            closing: Closing::default(),
            renaming: None,
        }
    }

    fn run(mut self, receiver: &async_channel::Receiver<Message>) {
        loop {
            self.observe();
            let waiting = (!self.door.flying())
                .then(|| self.held.pop_front())
                .flatten();
            let Ok(message) = waiting.map_or_else(|| receiver.recv_blocking(), Ok) else {
                break;
            };
            if self.door.flying() && message.waits(self.held.len()) {
                self.held.push_back(message);
                continue;
            }
            self.handle(message);
        }
        if let Ok(core) = self.core
            && let Err(error) = core.close()
        {
            eprintln!("Core bridge cleanup: {error:?}");
        }
    }

    fn observe(&mut self) {
        self.seen.note(self.version, &self.layout);
        let door = &self.door;
        let reported = reports(
            &self.client.activity,
            &self.layout,
            &mut self.exits,
            &mut self.adoptions,
            |event| door.gate(&Envelope::report(event)).is_ok(),
        );
        let before = self.version;
        self.prepare();
        let unbound = self.voyager();
        if self.version != before
            && let Some(owner) = self.content.as_mut()
        {
            owner.refresh_views();
        }
        let mut noticed = false;
        if !self.door.flying() && self.adoptions.waiting() {
            if self
                .door
                .gate(&Envelope::observed(
                    self.client.request_id(),
                    self.version.structure,
                ))
                .is_err()
            {
                self.adoptions.drop_all();
            } else if self.fresh
                && let Ok(core) = self.core.as_mut()
            {
                let saved = (&mut self.layout, &mut self.version, &mut self.fresh);
                let save = |candidate: &Layout, at| {
                    save(core, candidate, at).map_err(|error| match error {
                        Error::Rejected { message, .. } => Unsaved::Refused(message),
                        Error::Uncertain(message) => Unsaved::Unconfirmed(message),
                    })
                };
                noticed = self.adoptions.settle(save, saved, &mut self.live_bindings);
            }
        }
        if !self.door.flying() && !self.exits.is_empty() {
            let closure = Envelope::observed(self.client.request_id(), self.version.structure);
            if self.door.gate(&closure).is_err() {
                self.exits.clear();
            } else if self.fresh
                && let Ok(core) = self.core.as_mut()
            {
                let live = live(&self.live_bindings, &self.closing);
                let ended = std::mem::take(&mut self.exits);
                let saved = (&mut self.layout, &mut self.version, &mut self.fresh);
                close_exited(core, saved, &ended, &live);
            }
        }
        if reported || noticed || unbound || self.version != before {
            self.notices.send(self.version, self.closing.revision);
        }
        self.sockets.sync(&self.layout);
        if !self.door.quitting()
            && let Ok(core) = self.core.as_mut()
        {
            self.listing
                .start(core, &self.layout, self.version, self.fresh, &self.sender);
        }
        self.seen.note(self.version, &self.layout);
        self.publish_words();
    }

    fn publish_words(&self) {
        let words: Vec<String> = self
            .layout
            .containers()
            .flat_map(|voyage| {
                std::iter::once(voyage.name.clone())
                    .chain(voyage.fleets.iter().map(|fleet| fleet.name.clone()))
            })
            .collect();
        if let Ok(mut held) = self.client.workspace_words.lock()
            && *held != words
        {
            *held = words;
        }
    }

    fn handle(&mut self, message: Message) {
        match message {
            Message::PrepareContext { scope, version } => self.prepare_context(&scope, version),
            Message::NoteRenameReady {
                request,
                scope,
                program,
                reply,
                result,
            } => self.rename_ready(request, scope, program, reply, result),
            Message::CloseSaves { sender } => self.closing.saves = Some(sender),
            Message::CloseDone {
                request,
                scope,
                reply,
                result,
            } => self.close_done(&request, scope.as_ref(), &reply, result),
            Message::CoreReported => (),
            Message::RefreshActivity { reply } => {
                self.subscription.refresh(
                    &mut self.core,
                    self.door.quitting(),
                    &self.sender,
                    reply,
                );
            }
            Message::Subscribed => self.subscription.landed(),
            Message::Quit { operation, reply } => self.quit(operation, &reply),
            Message::Service { request, reply } => match self.core.as_mut() {
                Ok(core) => super::service::perform(core, request, reply),
                Err(error) => {
                    let _ = reply.try_send(Err(error.clone()));
                }
            },
            Message::Launches { reply } => {
                let _ = reply.try_send(crate::launch::catalog(self.launches.as_deref(), &self.cwd));
            }
            Message::RefreshContentViews => {
                if let Some(owner) = &mut self.content {
                    owner.refresh_views();
                }
            }
            Message::RegisterView { binding, reply } => {
                let result = self
                    .content
                    .as_mut()
                    .ok_or_else(|| "Content owner unavailable".to_owned())
                    .and_then(|owner| owner.register_view(binding));
                let _ = reply.try_send(result);
            }
            Message::ContextFacts { reply } => {
                let _ = reply.try_send(crate::context::capture(
                    &self.layout,
                    self.version.structure,
                ));
            }
            Message::WorkspaceObservation {
                scope,
                version,
                active,
                reply,
            } => {
                let observer = Observer {
                    scope,
                    version,
                    active,
                    reply,
                };
                match &self.core {
                    Ok(_) if !self.door.quitting() => self.listing.observe(observer),
                    _ => observer.answer(&self.layout, self.version, self.fresh, None),
                }
            }
            Message::Listed { terminals } => self.listed(terminals),
            Message::WorkspaceChanges { after, reply } => {
                let (send, receive) = async_channel::bounded(1);
                let current = self.notices.current(self.version, self.closing.revision);
                if after != Some(current) {
                    let _ = send.try_send(current);
                }
                self.notices.listener = Some(send);
                let _ = reply.try_send(receive);
            }
            Message::BindContent { id, reply } => {
                let _ = reply.try_send(self.bind_content(&id));
            }
            Message::ContentChanges {
                binding,
                after,
                reply,
            } => {
                let result = self
                    .content
                    .as_mut()
                    .ok_or_else(|| "Content owner unavailable".into())
                    .map(|owner| owner.subscribe(&binding, after));
                let _ = reply.try_send(result);
            }
            Message::Content {
                access,
                request,
                reply,
                close_ticket,
                native_save,
            } => self.content_request(&access, &request, reply, close_ticket.as_ref(), native_save),
            Message::WorktreeRemoveReady {
                scope,
                request,
                source_directory,
                reply,
            } => self.worktree_remove_ready(scope, &request, &source_directory, reply),
            Message::RemovalListed { reply, terminals } => self.removal_listed(&reply, terminals),
            Message::WorktreeDone {
                scope,
                request,
                source_directory,
                response,
                reply,
            } => self.worktree_done(
                scope.as_ref(),
                &request,
                &source_directory,
                response,
                &reply,
            ),
            Message::Worktree {
                scope,
                request,
                reply,
            } => self.worktree(scope, request, reply),
            Message::Process {
                scope,
                request,
                reply,
                queued_at,
                claim,
            } => {
                if claim.take() {
                    self.process(scope, request, reply, queued_at);
                }
            }
            Message::ProcessDone {
                request_id,
                completed,
                reply,
            } => {
                let completed = completed.settle(self.core.as_mut().ok());
                let outcome = crate::families::terminal::response(
                    request_id.clone(),
                    completed.read_at.unwrap_or(self.version.structure),
                    &mut self.fresh,
                    completed.result,
                );
                self.door
                    .settle(&request_id, Receipt::Process(Arc::clone(&outcome)));
                let _ = reply.send(outcome);
            }
            Message::Saved { result } => self.saved(result),
            Message::Relisted {
                request,
                scope,
                reply,
                terminals,
            } => self.relisted(request, scope, reply, terminals),
            Message::Workspace {
                request,
                scope,
                program,
                reply,
                queued_at,
                claim,
            } => {
                if claim.take() {
                    self.workspace(request, scope, program, reply, queued_at);
                }
            }
            Message::NoteExit {
                view,
                revision,
                request,
                reply,
                claim,
            } => {
                if claim.take() {
                    self.note_exit(view, revision, request, reply);
                }
            }
            Message::Terminal {
                content,
                request_id,
                expected_version,
                reply,
                claim,
            } => {
                if claim.take() {
                    self.terminal(content, request_id, expected_version, &reply);
                }
            }
        }
    }

    fn prepare_context(&mut self, scope: &Context, expected: u64) {
        if self.fresh
            && self.version.structure == expected
            && self.layout.context == *scope
            && let Ok(core) = self.core.as_mut()
        {
            let started = std::time::Instant::now();
            let result = crate::context::prepare(
                &self.layout,
                self.version.structure,
                core,
                self.content.as_mut(),
            );
            if let Ok(mut prepared) = self.client.prepared_context.lock() {
                *prepared = result.ok();
            }
            if std::env::var_os("VOYAGER_TRACE_TOOLS").is_some() {
                eprintln!(
                    "voyager_timing operation=dock-preview elapsed_us={}",
                    started.elapsed().as_micros()
                );
            }
        }
    }

    fn quit(&mut self, operation: Lifecycle, reply: &async_channel::Sender<Result<(), Error>>) {
        let result = self.door.end(operation, &mut self.core);
        self.created_vessels.clear();
        self.fresh = false;
        let _ = reply.try_send(result);
    }

    fn listed(&mut self, terminals: Result<Vec<crate::core_shapes::Terminal>, Error>) {
        let (begun, terminals) = (self.listing.listed(), terminals.ok());
        let observed = Envelope::observed(
            self.client.request_id(),
            begun.unwrap_or(self.version.structure),
        );
        let closed = (|| -> Result<(), String> {
            let (Some(terminals), Ok(core), Ok(()), true) = (
                &terminals,
                self.core.as_mut(),
                self.door.gate(&observed),
                self.fresh,
            ) else {
                return Ok(());
            };
            let current = begun == Some(self.version.structure);
            let live = live(&self.live_bindings, &self.closing);
            if let Some(candidate) = changed_layout(&self.layout, terminals, &live, current)? {
                commit(
                    core,
                    &mut self.layout,
                    &mut self.version,
                    &mut self.fresh,
                    candidate,
                )?;
                self.notices.send(self.version, self.closing.revision);
            }
            if current {
                self.live_bindings = terminals
                    .iter()
                    .filter(|terminal| terminal.is_live())
                    .map(|terminal| CoreTerminalId(terminal.address.clone()))
                    .collect();
            }
            Ok(())
        })();
        let listed = closed.map(|()| terminals.as_deref());
        self.listing
            .answer(begun, listed, &self.layout, self.version, self.fresh);
    }

    fn bind_content(&mut self, id: &VesselId) -> Result<crate::content::Binding, String> {
        let core = self.core.as_mut().map_err(|error| format!("{error:?}"))?;
        let (current, revision, _) = load(core, &self.cwd, &self.layout, self.version)
            .map_err(|error| format!("{error:?}"))?;
        self.layout = Arc::new(current);
        self.version = revision;
        self.fresh = true;
        let owner = self.content.as_mut().ok_or("Content owner unavailable")?;
        requests::bind(owner, &self.layout, id)
    }

    fn content_request(
        &mut self,
        access: &crate::content::Access,
        request: &voyager_contract::content::Request,
        reply: ContentReply,
        close_ticket: Option<&SaveTicket>,
        native_save: bool,
    ) {
        let previous_version = self.version;
        let agent = match access {
            crate::content::Access::Agent {
                expected_version, ..
            } => Some(*expected_version),
            crate::content::Access::View(_) => None,
        };
        let ticket = match self.door.admit(
            &Envelope::content(access, request),
            &(request, agent),
            Receipt::content,
        ) {
            Admission::New(ticket) => ticket,
            Admission::Repeat(first) => return reply.deliver(first),
            Admission::Pending(message) | Admission::Refused(message) => {
                return reply.deliver(Arc::new(crate::content::reject(request, message)));
            }
        };
        let result = (|| {
            if self.renaming.as_ref().is_some_and(|(ticket, plan, _)| {
                plan.vessels.contains(crate::content::identity(request).0)
                    && requests::is_write(request)
                    && !(native_save && close_ticket == Some(ticket))
            }) {
                return Err("This Note is being renamed; wait for the saved result".into());
            }
            if requests::is_write(request)
                && self.closing.blocks_content(
                    crate::content::identity(request).0,
                    close_ticket,
                    native_save,
                )
            {
                return Err("This Voyage is closing; its Notes are temporarily read-only".into());
            }
            requests::check_envelope(request)?;
            let core = self.core.as_mut().map_err(|error| format!("{error:?}"))?;
            let (current, revision, _) = load(core, &self.cwd, &self.layout, self.version)
                .map_err(|error| format!("{error:?}"))?;
            self.layout = Arc::new(current);
            self.version = revision;
            self.fresh = true;
            let access = requests::current_access(
                access,
                self.version.structure,
                crate::content::identity(request).0,
                |expected, id| {
                    self.seen.current(expected, self.version, &self.layout, || {
                        Some(vec![Part::Vessel(id.clone())])
                    })
                },
            );
            let owner = self.content.as_mut().ok_or("Content owner unavailable")?;
            let held = (&mut self.layout, &mut self.version, &mut self.fresh);
            if requests::is_selection(request) {
                return Ok(select_note(core, held, &self.seen, owner, &access, request));
            }
            if matches!(
                request,
                voyager_contract::content::Request::Configure { .. }
            ) {
                return Ok(configure(core, held, &self.seen, owner, &access, request));
            }
            Ok(requests::run(
                owner,
                &self.layout,
                self.version.structure,
                &access,
                request.clone(),
            ))
        })();
        let response = result.unwrap_or_else(|message| crate::content::reject(request, message));
        let response = Arc::new(requests::bounded_response(request, response));
        if requests::notifies(request, &response)
            && let Some(owner) = self.content.as_mut()
        {
            owner.notify(&response);
        }
        if self.version != previous_version {
            if let Some(owner) = self.content.as_mut() {
                owner.refresh_views();
            }
            self.notices.send(self.version, self.closing.revision);
        }
        self.door
            .record(ticket, Receipt::Content(Arc::clone(&response)));
        reply.deliver(response);
    }

    fn process(
        &mut self,
        scope: Context,
        request: ProcessRequest,
        reply: SyncSender<Arc<ProcessResponse>>,
        queued_at: std::time::Instant,
    ) {
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
                version: self.version.structure,
                fresh: self.fresh,
                output: None,
                message: Some(message),
            })
        };
        let ticket = match self.door.admit(
            &Envelope::process(&scope, &request),
            &request,
            Receipt::process,
        ) {
            Admission::New(ticket) => ticket,
            Admission::Repeat(first) => return drop(reply.send(first)),
            Admission::Pending(message) => {
                return drop(reply.send(answered(Status::Uncertain, message)));
            }
            Admission::Refused(message) => {
                return drop(reply.send(answered(Status::Rejected, message)));
            }
        };
        let crowded = self.door.crowded(&Envelope::process(&scope, &request));
        let parts = || Some(crate::families::terminal::parts(&request.input.action));
        let result = if let Some(refusal) =
            crate::families::terminal::decide(crowded, self.fresh, || {
                self.seen.current(
                    request.input.expected_version,
                    self.version,
                    &self.layout,
                    parts,
                )
            }) {
            Err(rejected(refusal.into()))
        } else {
            match self.core.as_mut() {
                Ok(core) => load(core, &self.cwd, &self.layout, self.version).and_then(
                    |(current, revision, _)| {
                        self.layout = Arc::new(current);
                        self.version = revision;
                        if !self.seen.current(
                            request.input.expected_version,
                            self.version,
                            &self.layout,
                            parts,
                        ) {
                            return Err(rejected(
                                "Workspace revision changed before process dispatch; inspect again"
                                    .into(),
                            ));
                        }
                        crate::families::terminal::start(
                            core,
                            &self.layout,
                            &scope,
                            &request.input.action,
                        )
                    },
                ),
                Err(error) => Err(error.clone()),
            }
        };
        let error = match result {
            Ok(effect) => {
                self.door.open(ticket);
                let sender = self.sender.clone();
                let version = self.version.structure;
                thread::spawn(move || {
                    let completed = effect.wait(version);
                    let _ = sender.send_blocking(Message::ProcessDone {
                        request_id: request.request_id,
                        completed,
                        reply,
                    });
                });
                return;
            }
            Err(error) => error,
        };
        let answer = crate::families::terminal::response(
            request.request_id.clone(),
            self.version.structure,
            &mut self.fresh,
            Err(error),
        );
        self.door
            .record(ticket, Receipt::Process(Arc::clone(&answer)));
        let _ = reply.send(answer);
    }

    fn terminal(
        &mut self,
        content: VesselId,
        request_id: String,
        expected_version: u64,
        reply: &SyncSender<Result<Viewer, Error>>,
    ) {
        let request = TerminalRequest {
            request_id,
            vessel_id: content.clone(),
            expected_version,
        };
        let ticket =
            match self
                .door
                .admit(&Envelope::terminal(&request), &request, Receipt::terminal)
            {
                Admission::New(ticket) => ticket,
                Admission::Repeat(first) => {
                    return drop(reply.send(first.and_then(|viewer| viewer.upgrade())));
                }
                Admission::Pending(message) => {
                    return drop(reply.send(Err(Error::Uncertain(message))));
                }
                Admission::Refused(message) => return drop(reply.send(Err(rejected(message)))),
            };
        let mut started = false;
        let result = if !self.fresh {
            Err(rejected(
                "Inspect the workspace before opening a terminal".into(),
            ))
        } else if !self
            .seen
            .current(expected_version, self.version, &self.layout, || {
                Some(vec![Part::Vessel(content.clone())])
            })
        {
            Err(self
                .seen
                .stale_terminal(expected_version, self.version, &self.layout, &content))
        } else if self.closing.blocks_terminal(&content) {
            Err(rejected(
                "This Voyage is closing; no terminal was opened".into(),
            ))
        } else if let Some(message) = self.unconfirmed.get(&content.0) {
            Err(Error::Uncertain(message.clone()))
        } else if self
            .created_vessels
            .iter()
            .any(|pending| pending.id == content)
            && !crate::families::structure::visible_content(&self.layout, &content)
        {
            Err(rejected(
                "Created content is not currently visible; no terminal was started".into(),
            ))
        } else {
            match self.core.as_mut() {
                Ok(core) => terminal_start::open_terminal(
                    terminal_start::Owned {
                        core,
                        layout: &mut self.layout,
                        version: &mut self.version,
                        fresh: &mut self.fresh,
                        unconfirmed: &mut self.unconfirmed,
                        created_vessels: &mut self.created_vessels,
                        launches: self.launches.as_deref(),
                    },
                    &request,
                )
                .map(|(viewer, created)| {
                    started = created;
                    viewer
                }),
                Err(error) => Err(error.clone()),
            }
        };
        let opened = self
            .layout
            .vessels
            .iter()
            .find(|item| item.id == content)
            .and_then(|item| Some((item.backend.clone()?, crate::workspace::is_voyager(item))));
        if result.is_ok()
            && let Some((backend, voyager)) = opened
        {
            if voyager && started {
                self.bind_voyager(&backend);
            }
            if !self.live_bindings.contains(&backend) {
                self.live_bindings.push(backend);
            }
        }
        settle_created_content(&mut self.created_vessels, &content, &result);
        self.door
            .record(ticket, Receipt::Terminal(result.clone().map(Into::into)));
        if reply.send(result).is_err() {
            eprintln!("Terminal result receiver closed");
        }
    }

    fn publish(
        &mut self,
        previous: LayoutRevision,
        scoped: bool,
        packages: bool,
        docked: bool,
        close: u64,
    ) {
        if self.version != previous
            && let Some(owner) = self.content.as_mut()
        {
            owner.refresh_views();
        }
        if self.version != previous || packages || docked || self.closing.revision != close {
            if packages {
                self.notices.packages.fetch_add(1, Ordering::Relaxed);
            }
            self.notices.after(
                previous,
                self.version,
                scoped,
                docked,
                self.closing.revision,
            );
        }
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

#[cfg(test)]
#[path = "client_owner_tests.rs"]
mod tests;
