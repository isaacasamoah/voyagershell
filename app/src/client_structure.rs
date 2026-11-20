use super::super::core_calls::{post, relist, worktree_changes};
use super::super::terminal_start::{CreatedTerminal, require_finished};
use super::super::{Message, Receipt, Settled};
use super::{Departure, Flight, Owner, Start, Step};
use crate::content::ViewBinding;
use crate::content::rename::Plan;
use crate::content::requests;
use crate::core::{CallError, Core, Error};
use crate::core_shapes::Terminal;
use crate::families::structure::{self, Route};
use crate::families::voyage_close::{
    Closing, Observed, RenameRelease, RenamedNotes, SaveRequest, SaveTicket,
};
use crate::front_door::{Admission, Envelope, Outcome};
use crate::layout_store::{
    LayoutRevision, begin_save, carry_notice, load, rejected, save, settle_save,
};
use crate::vessel_type::NOTES_TYPE;
use std::sync::{Arc, mpsc::SyncSender};
use std::thread;
use voyager_contract::{
    Action, Context, CoreTerminalId, DirectorySource, Layout, Request, Response, VesselId, VoyageId,
};

#[derive(Default)]
struct Resume {
    landed: Option<Result<Step, Error>>,
    listed: Option<Result<Vec<Terminal>, Error>>,
    note_exit: Option<(ViewBinding, String)>,
    rename_ready: Option<(SaveTicket, Plan, Result<Option<String>, CallError>)>,
    rename_release: Option<RenameRelease>,
    program: Option<VesselId>,
}

struct Effects<'a> {
    core: &'a mut Core,
    closing: &'a Closing,
    content: Option<&'a mut crate::content::Owner>,
}

impl structure::Calls for Effects<'_> {
    fn closing(&self, candidate: &Layout) -> Result<(), Error> {
        self.closing.check_layout(candidate)
    }

    fn reopening(
        &mut self,
        candidate: &mut Layout,
        voyage: &VoyageId,
    ) -> Result<Vec<VesselId>, Error> {
        let terminals = self.core.terminal_list()?;
        Ok(crate::families::terminal::prepare_voyage_reopen(
            candidate, &terminals, voyage,
        ))
    }

    fn finished(&mut self, backend: &CoreTerminalId) -> Result<(), Error> {
        let observed = self.core.terminal_get(&backend.0)?;
        require_finished(&observed, backend)
    }

    fn terminal(&mut self, backend: &CoreTerminalId) -> Result<Terminal, Error> {
        self.core.terminal_get(&backend.0)
    }

    fn created(&mut self, before: &Layout, candidate: &mut Layout) -> Result<bool, Error> {
        if let Some(owner) = self.content.as_deref_mut() {
            return requests::initialize_created(owner, before, candidate)
                .map_err(Error::Uncertain);
        }
        if candidate.vessels.iter().any(|item| {
            item.type_id == NOTES_TYPE && !before.vessels.iter().any(|old| old.id == item.id)
        }) {
            return Err(rejected(
                "Content owner unavailable; Notes was not created".into(),
            ));
        }
        Ok(false)
    }
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

impl Owner {
    pub(super) fn prepare(&mut self) {
        if !matches!(self.start, Start::Waiting(_)) || self.door.flying() || self.door.quitting() {
            return;
        }
        let Ok(core) = self.core.as_mut() else {
            return;
        };
        let prepared = (|| {
            let (mut layout, mut revision, missing) =
                load(core, &self.cwd, &self.layout, self.version)?;
            if missing {
                layout = structure::first_voyage(layout, &self.cwd)?;
                revision = save(core, &layout, revision)?;
            }
            let terminals = core.terminal_list()?;
            let (ready, closed) =
                crate::families::terminal::prepare_reopen(&mut layout, &terminals);
            if closed || !ready.is_empty() {
                revision = save(core, &layout, revision)?;
                self.created_vessels
                    .extend(ready.into_iter().map(|id| CreatedTerminal {
                        id,
                        launch: voyager_contract::launch::Launch::Terminal,
                        backend: None,
                        shell_intent: None,
                    }));
            }
            self.live_bindings = terminals
                .iter()
                .filter(|terminal| terminal.is_live())
                .map(|terminal| CoreTerminalId(terminal.address.clone()))
                .collect();
            self.layout = Arc::new(layout);
            self.version = revision;
            Ok(missing)
        })();
        self.start = match prepared {
            Ok(true) => Start::Created,
            Ok(false) => Start::Ready,
            Err(error) => Start::Waiting(Some(error)),
        };
    }

    fn inspect(&mut self, scope: Option<&Context>, response: &mut Response) -> Result<Step, Error> {
        if let Start::Waiting(error) = &self.start {
            return Err(error.clone().unwrap_or_else(|| {
                rejected("The workspace is not prepared yet; inspect again".into())
            }));
        }
        let core = self.core.as_mut().map_err(|error| error.clone())?;
        let (layout, revision, missing) = load(core, &self.cwd, &self.layout, self.version)?;
        if missing {
            self.start = Start::Waiting(None);
            return Err(rejected(
                "The stored workspace is missing; Voyager is recreating it, so inspect again"
                    .into(),
            ));
        }
        if matches!(self.start, Start::Created) {
            response.created_workspace = true;
            self.start = Start::Ready;
        }
        self.unconfirmed.retain(|id, _| {
            layout
                .vessels
                .iter()
                .any(|item| &item.id.0 == id && item.start_pending.is_some())
        });
        self.created_vessels.retain(|pending| {
            layout.vessels.iter().any(|item| {
                item.id == pending.id
                    && (item.backend.is_none() || pending.shell_intent.is_some())
                    && item.start_pending.is_none()
            })
        });
        self.layout = Arc::new(layout);
        self.version = revision;
        self.fresh = true;
        crate::scope::check(&self.layout, scope, &Action::Inspect).map_err(rejected)?;
        Ok(Step::Done)
    }

    pub(super) fn workspace(
        &mut self,
        request: Request,
        scope: Option<Context>,
        program: Option<VesselId>,
        reply: SyncSender<Response>,
        queued_at: std::time::Instant,
    ) {
        if std::env::var_os("VOYAGER_TRACE_TOOLS").is_some() {
            eprintln!(
                "voyager_timing request={} family=workspace phase=actor-receive queued_us={}",
                request.request_id,
                queued_at.elapsed().as_micros()
            );
        }
        let before = (self.version, self.closing.revision);
        let resume = Resume {
            program,
            ..Resume::default()
        };
        self.decide(request, scope, reply, resume, before);
    }

    pub(super) fn note_exit(
        &mut self,
        view: ViewBinding,
        revision: String,
        request: Request,
        reply: SyncSender<Response>,
    ) {
        let before = (self.version, self.closing.revision);
        let resume = Resume {
            note_exit: Some((view, revision)),
            ..Resume::default()
        };
        self.decide(request, None, reply, resume, before);
    }

    pub(super) fn rename_ready(
        &mut self,
        request: Request,
        scope: Option<Context>,
        program: Option<VesselId>,
        reply: SyncSender<Response>,
        result: Result<Option<String>, CallError>,
    ) {
        let before = (self.version, self.closing.revision);
        let mut resume = Resume {
            program,
            ..Resume::default()
        };
        if self
            .renaming
            .as_ref()
            .is_some_and(|(ticket, _, _)| *ticket == SaveTicket::new(&request.request_id))
        {
            resume.rename_ready = self.renaming.take().map(|(ticket, plan, release)| {
                resume.rename_release = Some(release);
                (ticket, plan, result)
            });
            self.door.forget(&request.request_id);
        }
        self.decide(request, scope, reply, resume, before);
    }

    pub(super) fn relisted(
        &mut self,
        request: Request,
        scope: Option<Context>,
        reply: SyncSender<Response>,
        terminals: Result<Vec<Terminal>, Error>,
    ) {
        let before = (self.version, self.closing.revision);
        self.door.land();
        self.door.forget(&request.request_id);
        let resume = Resume {
            listed: Some(terminals),
            ..Resume::default()
        };
        self.decide(request, scope, reply, resume, before);
    }

    pub(super) fn saved(&mut self, result: Result<u64, Error>) {
        let before = (self.version, self.closing.revision);
        self.door.land();
        let Some(Flight {
            request,
            scope,
            reply,
            departure,
        }) = self.flight.take()
        else {
            return;
        };
        let Departure {
            before: held,
            candidate,
            expected,
            reopening,
            created_notes,
        } = *departure;
        let result = match (result, self.core.as_mut()) {
            (Err(Error::Uncertain(message)), Ok(connected)) => {
                settle_save(connected, &candidate, expected, message)
            }
            (result, _) => result,
        };
        let landed = result
            .map_err(|error| unbound(created_notes, error))
            .map(|revision| {
                self.created_vessels
                    .extend(reopening.into_iter().map(|id| CreatedTerminal {
                        id,
                        launch: voyager_contract::launch::Launch::Terminal,
                        backend: None,
                        shell_intent: None,
                    }));
                if let Action::StartNewShell {
                    vessel_id,
                    expected_backend,
                } = &request.action
                {
                    grant_new_shell(
                        &mut self.created_vessels,
                        vessel_id,
                        expected_backend,
                        &request.request_id,
                    );
                    self.unconfirmed.remove(&vessel_id.0);
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
                    record_created_terminals(&mut self.created_vessels, &held, &candidate);
                }
                if revision > self.version.document {
                    self.version = self.version.after(revision, &held, &candidate);
                    self.layout = Arc::new(candidate);
                }
                Step::Done
            });
        let resume = Resume {
            landed: Some(landed),
            ..Resume::default()
        };
        self.decide(request, scope, reply, resume, before);
    }

    pub(super) fn close_done(
        &mut self,
        request: &Request,
        scope: Option<&Context>,
        reply: &SyncSender<Response>,
        result: Result<(), Error>,
    ) {
        let result = result.and_then(|()| {
            self.closing.check_layout(&self.layout)?;
            let plan = self
                .closing
                .plan
                .as_ref()
                .ok_or_else(|| rejected("Close plan is unavailable".into()))?;
            let close = Action::CloseVoyage {
                id: plan.voyage.clone(),
            };
            crate::scope::check(&self.layout, scope, &close).map_err(rejected)?;
            let mut candidate = crate::workspace::Model {
                layout: (*self.layout).clone(),
            };
            candidate.apply(close).map_err(rejected)?;
            let connected = self.core.as_mut().map_err(|error| error.clone())?;
            let saved = save(connected, &candidate.layout, self.version)?;
            let closing = &self.closing;
            self.live_bindings
                .retain(|address| !closing.owns_terminal(address));
            self.layout = Arc::new(candidate.layout);
            self.version = saved;
            if let Some(owner) = self.content.as_mut() {
                owner.refresh_views();
            }
            Ok(())
        });
        let status = Outcome::from(result.clone()).status();
        if status == voyager_contract::Outcome::Uncertain {
            self.fresh = false;
        }
        self.closing.finish(result);
        let plan = self.closing.projected(&self.layout, scope);
        let response = Response {
            request_id: request.request_id.clone(),
            status: status.clone(),
            version: self.version.structure,
            layout: crate::scope::project(&self.layout, scope),
            fresh: self.fresh,
            created_workspace: false,
            created_vessels: eligible_contents(&self.layout, scope, &self.created_vessels),
            message: plan.as_ref().and_then(|plan| plan.message.clone()),
            close_plan: plan.clone(),
        };
        self.door.settle(
            &request.request_id,
            Receipt::Workspace(Settled {
                status,
                message: response.message.clone(),
                created_workspace: false,
                close_plan: plan,
            }),
        );
        self.notices.send(self.version, self.closing.revision);
        let _ = reply.send(response);
    }

    fn decide(
        &mut self,
        request: Request,
        scope: Option<Context>,
        reply: SyncSender<Response>,
        mut resume: Resume,
        (previous_version, previous_close): (LayoutRevision, u64),
    ) {
        let inspecting = matches!(request.action, Action::Inspect);
        let mut response = Response {
            request_id: request.request_id.clone(),
            status: voyager_contract::Outcome::Refused,
            version: self.version.structure,
            layout: crate::scope::project(&self.layout, scope.as_ref()),
            fresh: self.fresh,
            created_workspace: false,
            created_vessels: eligible_contents(&self.layout, scope.as_ref(), &self.created_vessels),
            message: None,
            close_plan: self.closing.projected(&self.layout, scope.as_ref()),
        };
        let mut ticket = None;
        let mut effect = Effect::default();
        let result = if let Some(step) = resume.landed.take() {
            step
        } else {
            match self.door.admit(
                &Envelope::admitted(resume.program.as_ref(), scope.as_ref(), &request),
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
                    return;
                }
                Admission::Pending(message) => {
                    response.status = voyager_contract::Outcome::Uncertain;
                    response.message = Some(message);
                    let _ = reply.send(response);
                    return;
                }
                Admission::Refused(message) => {
                    response.message = Some(message);
                    let _ = reply.send(response);
                    return;
                }
            }
            if self.door.quitting() {
                response.status = voyager_contract::Outcome::Applied;
                response.fresh = false;
                let _ = reply.send(response);
                return;
            }
            self.change(
                &request,
                scope.as_ref(),
                &reply,
                &mut resume,
                &mut response,
                &mut effect,
            )
        };
        let step = match result {
            Ok(Step::Save(departure)) => {
                if let Some(ticket) = ticket {
                    self.door.open(ticket);
                }
                self.door.depart();
                self.flight = Some(Flight {
                    request,
                    scope,
                    reply,
                    departure,
                });
                return;
            }
            Ok(Step::List) => {
                match relist(
                    &mut self.core,
                    &self.sender,
                    &request,
                    scope.as_ref(),
                    &reply,
                ) {
                    Ok(()) => {
                        if let Some(ticket) = ticket {
                            self.door.open(ticket);
                        }
                        self.door.depart();
                        return;
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
                    self.fresh = false;
                }
                response.message = Some(format!("{kind}: {message}"));
            }
            Outcome::Uncertain(message) => {
                self.fresh = false;
                response.status = voyager_contract::Outcome::Uncertain;
                response.message = Some(message);
            }
        }
        if let Ok(core) = self.core.as_mut() {
            carry_notice(&mut core.layout.notice, &request.action, &mut response);
        }
        response.version = self.version.structure;
        response.layout = crate::scope::project(&self.layout, scope.as_ref());
        response.created_vessels =
            eligible_contents(&self.layout, scope.as_ref(), &self.created_vessels);
        response.fresh = self.fresh;
        response.close_plan = self.closing.projected(&self.layout, scope.as_ref());
        if let Some(mut release) = resume.rename_release {
            release.rebind = effect.rebind;
        }
        self.publish(
            previous_version,
            scope.is_some(),
            effect.packages,
            previous_close,
        );
        let prepare_dock = matches!(request.action, Action::Dock { .. })
            && response.status == voyager_contract::Outcome::Applied
            && self.fresh;
        let receipt = Receipt::Workspace(Settled {
            status: response.status.clone(),
            message: response.message.clone(),
            created_workspace: response.created_workspace,
            close_plan: response.close_plan.clone(),
        });
        match ticket {
            Some(ticket) if deferred => self.door.open(ticket),
            Some(ticket) => self.door.record(ticket, receipt),
            None => self.door.settle(&request.request_id, receipt),
        }
        if !deferred {
            let _ = reply.send(response);
        }
        if prepare_dock {
            if let Ok(mut prepared) = self.client.prepared_context.lock() {
                *prepared = None;
            }
            let _ = self.sender.try_send(Message::PrepareContext {
                scope: self.layout.context.clone(),
                version: self.version.structure,
            });
        }
    }

    fn change(
        &mut self,
        request: &Request,
        scope: Option<&Context>,
        reply: &SyncSender<Response>,
        resume: &mut Resume,
        response: &mut Response,
        effect: &mut Effect,
    ) -> Result<Step, Error> {
        if let Err(error) = &self.core {
            return Err(error.clone());
        }
        if let Some((view, revision)) = &resume.note_exit {
            self.check_note_exit(request, view, revision)?;
        }
        if matches!(request.action, Action::Inspect) {
            return self.inspect(scope, response);
        }
        let route = structure::route(
            self.fresh,
            || {
                self.seen
                    .current(request.expected_version, self.version, &self.layout, || {
                        crate::layout_parts::parts(&self.layout, &request.action)
                    })
            },
            &self.layout,
            scope,
            &request.action,
        )?;
        match route {
            Route::Close(id) => {
                let Some(terminals) = resume.listed.take() else {
                    return Ok(Step::List);
                };
                self.closing.prepare(
                    &self.layout,
                    self.version.structure,
                    id,
                    &request.request_id,
                    Observed {
                        terminals: &terminals?,
                        notes_type: NOTES_TYPE,
                    },
                    worktree_changes,
                )?;
                response.message = Some("Confirm the Voyage shutdown; no work has stopped".into());
                return Ok(Step::Done);
            }
            Route::CancelClose { id, plan } => {
                self.closing.cancel(id, plan)?;
                return Ok(Step::Done);
            }
            Route::ConfirmClose { id, plan } => {
                let confirmed =
                    self.closing
                        .confirm(id, plan, self.version.structure, &request.request_id)?;
                let worker = self.client.clone();
                let sender = self.sender.clone();
                let (request, scope, reply) = (request.clone(), scope.cloned(), reply.clone());
                thread::spawn(move || {
                    let result = crate::families::voyage_close::execute(&worker, confirmed);
                    let _ = sender.send_blocking(Message::CloseDone {
                        request,
                        scope,
                        reply,
                        result,
                    });
                });
                return Ok(Step::Deferred);
            }
            Route::Package { .. } | Route::Edit => (),
        }
        if let Some((_, plan, prepared)) = &resume.rename_ready {
            effect.rebind = Some(self.finish_rename(request, scope, plan, prepared)?);
            return Ok(Step::Done);
        }
        if let Some(plan) = Plan::capture(&self.layout, scope, &request.action).map_err(rejected)? {
            return self.begin_rename(plan, request, scope, resume.program.as_ref(), reply);
        }
        if let Route::Package { type_id } = route {
            self.package(request, scope, type_id)?;
            effect.packages = true;
            return Ok(Step::Done);
        }
        if let Action::CreateVessel { type_id, .. } | Action::CreateFleetWithVessel { type_id, .. } =
            &request.action
            && let Some(owner) = &self.content
        {
            owner.require_available(type_id).map_err(rejected)?;
        }
        if let Some(source) = structure::source(&request.action) {
            let listed = if matches!(source, DirectorySource::Live { .. }) {
                let Some(terminals) = resume.listed.take() else {
                    return Ok(Step::List);
                };
                Some(terminals)
            } else {
                None
            };
            structure::check_source(&self.layout, self.version.structure, source, listed)?;
        }
        if structure::reloads_viewer(&request.action) {
            let core = self.core.as_mut().map_err(|error| error.clone())?;
            let (current, revision, missing) = load(core, &self.cwd, &self.layout, self.version)?;
            self.layout = Arc::new(current);
            self.version = revision;
            let changed = missing
                || !self
                    .seen
                    .current(request.expected_version, self.version, &self.layout, || {
                        crate::layout_parts::parts(&self.layout, &request.action)
                    });
            structure::check_viewer(changed, &self.layout, scope, &request.action)?;
        }
        let core = self.core.as_mut().map_err(|error| error.clone())?;
        let edit = structure::edit(
            &mut Effects {
                core,
                closing: &self.closing,
                content: self.content.as_mut(),
            },
            &self.layout,
            resume.program.as_ref(),
            request,
            &self.unconfirmed,
        )?;
        let pending = begin_save(core, &edit.candidate, self.version)
            .map_err(|error| unbound(edit.created_notes, error))?;
        post(&self.sender, pending, |result| Message::Saved {
            result: result.map(|saved| saved.version),
        });
        Ok(Step::Save(Box::new(Departure {
            before: Arc::clone(&self.layout),
            candidate: edit.candidate,
            expected: self.version,
            reopening: edit.reopening,
            created_notes: edit.created_notes,
        })))
    }

    fn check_note_exit(
        &mut self,
        request: &Request,
        view: &ViewBinding,
        revision: &str,
    ) -> Result<(), Error> {
        if !view.is_active()
            || !matches!(&request.action, Action::RemovePlacement { id }
                if super::super::note_exit_target(&self.layout, view.binding.id()).as_ref() == Ok(id))
        {
            return Err(rejected(
                "The Notes view or placement changed; nothing was closed".into(),
            ));
        }
        let owner = self
            .content
            .as_mut()
            .ok_or_else(|| rejected("Notes data is unavailable".into()))?;
        let observed = owner.call(
            &view.binding,
            voyager_contract::content::Request::Inspect {
                version: voyager_contract::content::Version::V1,
                request_id: format!("{}-read", request.request_id),
                vessel_id: view.binding.id().clone(),
            },
        );
        if !matches!(observed, voyager_contract::content::Response::Snapshot { snapshot, .. } if snapshot.revision == revision)
        {
            return Err(rejected(
                "Notes changed after saving; the view remains open".into(),
            ));
        }
        Ok(())
    }

    fn finish_rename(
        &mut self,
        request: &Request,
        scope: Option<&Context>,
        plan: &Plan,
        prepared: &Result<Option<String>, CallError>,
    ) -> Result<RenamedNotes, Error> {
        let expected = prepared
            .as_ref()
            .map_err(|error| match error {
                CallError::Rejected(message) => rejected(message.clone()),
                CallError::Unconfirmed(message) => Error::Uncertain(message.clone()),
            })?
            .as_deref()
            .unwrap_or(&plan.revision);
        let observed = Plan::capture(&self.layout, scope, &request.action)
            .map_err(rejected)?
            .ok_or_else(|| rejected("The Notes rename target changed".into()))?;
        if observed.file != plan.file || observed.files != plan.files {
            return Err(rejected(
                "The Notes file bindings changed; nothing was renamed".into(),
            ));
        }
        let candidate = plan.layout(&self.layout).map_err(rejected)?;
        self.closing.check_layout(&candidate)?;
        crate::content::rename::move_file(&plan.file, &plan.filename, expected)
            .map_err(rejected)?;
        let moved = plan.moved_file();
        let snapshot = plan.snapshot(plan.vessels[0].clone()).map_err(|error| {
            Error::Uncertain(format!(
                "The file moved to {}/{} but reading it failed: {error}. Inspect before another rename.",
                moved.directory, moved.filename
            ))
        })?;
        if snapshot.revision != expected {
            return Err(Error::Uncertain(format!(
                "The file moved to {}/{} but its bytes changed during rename. Inspect both paths; do not repeat the rename.",
                moved.directory, moved.filename
            )));
        }
        let core = self.core.as_mut().map_err(|error| error.clone())?;
        let saved = save(core, &candidate, self.version).map_err(|error| {
            Error::Uncertain(format!(
                "The file moved to {}/{} but workspace confirmation is unknown: {error:?}. Do not repeat the rename.",
                moved.directory, moved.filename
            ))
        })?;
        self.layout = Arc::new(candidate);
        self.version = saved;
        if let Some(owner) = self.content.as_mut() {
            for id in &plan.vessels {
                requests::register_content(owner, &self.layout, id).map_err(Error::Uncertain)?;
            }
        }
        Ok(RenamedNotes {
            files: plan.moved_files(),
            workspace_version: self.version.structure,
            snapshot,
        })
    }

    fn begin_rename(
        &mut self,
        plan: Plan,
        request: &Request,
        scope: Option<&Context>,
        program: Option<&VesselId>,
        reply: &SyncSender<Response>,
    ) -> Result<Step, Error> {
        if self.renaming.is_some() {
            return Err(rejected("Finish the current Notes rename first".into()));
        }
        let saves = self.closing.saves.as_ref().ok_or_else(|| {
            rejected("The native Notes save service is unavailable; nothing was renamed".into())
        })?;
        let ticket = SaveTicket::new(&request.request_id);
        let (ready, waiting) = async_channel::bounded(1);
        saves
            .try_send(SaveRequest::PrepareRename {
                ticket: ticket.clone(),
                vessels: plan.vessels.clone(),
                files: plan.files.clone(),
                reply: ready,
            })
            .map_err(|_| rejected("Notes save service is busy; nothing was renamed".into()))?;
        let release = RenameRelease::new(saves.clone(), ticket.clone(), plan.vessels.clone());
        self.renaming = Some((ticket, plan, release));
        let sender = self.sender.clone();
        let (request, scope) = (request.clone(), scope.cloned());
        let (program, reply) = (program.cloned(), reply.clone());
        thread::spawn(move || {
            let result = waiting.recv_blocking().unwrap_or_else(|_| {
                Err(CallError::Unconfirmed(
                    "Notes save acknowledgement was lost; inspect before another rename".into(),
                ))
            });
            let _ = sender.send_blocking(Message::NoteRenameReady {
                request,
                scope,
                program,
                reply,
                result,
            });
        });
        Ok(Step::Deferred)
    }

    fn package(
        &mut self,
        request: &Request,
        scope: Option<&Context>,
        type_id: &str,
    ) -> Result<(), Error> {
        let core = self.core.as_mut().map_err(|error| error.clone())?;
        let (current, revision, missing) = load(core, &self.cwd, &self.layout, self.version)
            .map_err(|error| {
                rejected(format!(
                    "Workspace observation unavailable; no Vessel package was changed: {error:?}"
                ))
            })?;
        self.layout = Arc::new(current);
        self.version = revision;
        self.fresh = true;
        let closing = &self.closing;
        structure::check_package(
            &self.layout,
            scope,
            &request.action,
            missing || request.expected_version != self.version.structure,
            (type_id, NOTES_TYPE),
            |id| closing.blocks_terminal(id),
        )?;
        let owner = self
            .content
            .as_mut()
            .ok_or_else(|| rejected("Content owner unavailable".into()))?;
        match &request.action {
            Action::RemoveVesselPackage { .. } => owner.remove_package(type_id),
            _ => owner.restore_package(type_id),
        }
        .map_err(rejected)
    }
}

#[derive(Default)]
struct Effect {
    rebind: Option<RenamedNotes>,
    packages: bool,
}

pub(super) fn grant_new_shell(
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

pub(super) fn record_created_terminals(
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

pub(super) fn eligible_contents(
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
