use super::super::core_calls::{post, relist, worktree_changes};
use super::super::terminal_start::{CreatedTerminal, require_finished};
use super::super::{Message, Receipt, Settled};
use super::{Departure, Flight, Owner, Start, Step};
use crate::core::{Core, Error};
use crate::core_shapes::Terminal;
use crate::families::structure::{self, Route};
use crate::families::voyage_close::Closing;
use crate::front_door::{Admission, Envelope, Outcome};
use crate::layout_store::{
    LayoutRevision, begin_save, carry_notice, load, rejected, save, settle_save,
};
use std::sync::{Arc, mpsc::SyncSender};
use std::thread;
use voyager_contract::{
    Action, Context, CoreTerminalId, DirectorySource, Layout, Request, Response, VesselId, VoyageId,
};

#[derive(Default)]
struct Resume {
    landed: Option<Result<Step, Error>>,
    listed: Option<Result<Vec<Terminal>, Error>>,
    program: Option<VesselId>,
}

struct Effects<'a> {
    core: &'a mut Core,
    closing: &'a Closing,
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
            program,
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
        } = *departure;
        let result = match (result, self.core.as_mut()) {
            (Err(Error::Uncertain(message)), Ok(connected)) => {
                settle_save(connected, &candidate, expected, message)
            }
            (result, _) => result,
        };
        if records_created(scope.as_ref(), &request.action) {
            settle_created_terminals(&mut self.created_vessels, &held, &candidate, &result);
        }
        let landed = result.map(|revision| {
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
                let launch = candidate
                    .vessels
                    .iter()
                    .find(|item| &item.id == vessel_id)
                    .and_then(|item| item.launch.clone())
                    .unwrap_or_default();
                grant_new_shell(
                    &mut self.created_vessels,
                    vessel_id,
                    expected_backend,
                    &request.request_id,
                    launch,
                );
                self.unconfirmed.remove(&vessel_id.0);
            }
            if revision > self.version.document {
                self.version = self.version.after(revision, &held, &candidate);
                self.layout = Arc::new(candidate);
            }
            Step::Done
        });
        let resume = Resume {
            landed: Some(landed),
            program,
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
                    program: resume.program,
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
        let docked = matches!(request.action, Action::Dock { .. })
            && response.status == voyager_contract::Outcome::Applied;
        self.publish(
            previous_version,
            scope.is_some() || resume.program.is_some(),
            effect.packages,
            docked,
            previous_close,
        );
        let prepare_dock = docked && self.fresh;
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
        if matches!(request.action, Action::Inspect) {
            return self.inspect(scope, response);
        }
        let route = structure::route(
            self.fresh,
            structure::Versions {
                sent: request.expected_version,
                now: self.version.structure,
            },
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
                    &terminals?,
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
                let confirmed = self.closing.confirm(id, plan, self.version.structure)?;
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
            },
            &self.layout,
            resume.program.as_ref(),
            self.sockets
                .binding()
                .caller(&self.layout, resume.program.as_ref()),
            request,
            &self.unconfirmed,
        )?;
        let pending = begin_save(core, &edit.candidate, self.version)?;
        if records_created(scope, &request.action) {
            record_created_terminals(&mut self.created_vessels, &self.layout, &edit.candidate);
        }
        post(&self.sender, pending, |result| Message::Saved {
            result: result.map(|saved| saved.version),
        });
        Ok(Step::Save(Box::new(Departure {
            before: Arc::clone(&self.layout),
            candidate: edit.candidate,
            expected: self.version,
            reopening: edit.reopening,
        })))
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
        structure::check_package(
            &self.layout,
            scope,
            &request.action,
            missing || request.expected_version != self.version.structure,
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
    packages: bool,
}

pub(super) fn grant_new_shell(
    pending: &mut Vec<CreatedTerminal>,
    content: &VesselId,
    backend: &CoreTerminalId,
    intent: &str,
    launch: voyager_contract::launch::Launch,
) {
    pending.retain(|item| &item.id != content);
    pending.push(CreatedTerminal {
        id: content.clone(),
        launch,
        backend: Some(backend.clone()),
        shell_intent: Some(intent.into()),
    });
}

pub(super) fn record_created_terminals(
    pending: &mut Vec<CreatedTerminal>,
    previous: &Layout,
    current: &Layout,
) {
    let created: Vec<CreatedTerminal> = current
        .vessels
        .iter()
        .filter(|item| {
            voyager_contract::launch::is_terminal_backed(&item.type_id)
                && !previous.vessels.iter().any(|old| old.id == item.id)
                && !pending.iter().any(|known| known.id == item.id)
        })
        .map(|item| CreatedTerminal {
            id: item.id.clone(),
            launch: item.launch.clone().unwrap_or_default(),
            backend: None,
            shell_intent: None,
        })
        .collect();
    pending.extend(created);
}

fn records_created(scope: Option<&Context>, action: &Action) -> bool {
    (scope.is_some()
        || matches!(
            action,
            Action::CreateVessel { .. }
                | Action::CreateVoyageFromSource { .. }
                | Action::CreateFleetWithVessel { .. }
        ))
        && matches!(
            action,
            Action::CreateVoyage { .. }
                | Action::CreateVoyageFromSource { .. }
                | Action::CreateFleet { .. }
                | Action::CreateFleetWithVessel { .. }
                | Action::CreateVessel { .. }
        )
}

pub(super) fn settle_created_terminals(
    pending: &mut Vec<CreatedTerminal>,
    previous: &Layout,
    current: &Layout,
    saved: &Result<u64, Error>,
) {
    if saved.is_ok() {
        record_created_terminals(pending, previous, current);
    } else {
        pending.retain(|item| {
            previous.vessels.iter().any(|old| old.id == item.id)
                || !current.vessels.iter().any(|new| new.id == item.id)
        });
    }
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
