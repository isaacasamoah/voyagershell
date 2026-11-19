use crate::{
    core::{CallError, Error},
    core_shapes::Terminal,
    core_state::TerminalState,
    panels,
};
use async_channel::{Receiver, Sender};
use std::{path::Path, sync::Arc};
use voyager_contract::administrator::{
    ProcessAction, ProcessInput, ProcessOutput, ProcessResponse,
};
use voyager_contract::voyage_close::{Entry, Phase, Plan};
use voyager_contract::{
    Action, Context, CoreTerminalId, Layout, Outcome, Response, Status, Unanswered, Unapplied,
    VesselId, VoyageId,
};

pub(crate) trait Calls {
    fn inspected(&self) -> Result<Response, Unanswered>;
    fn stopped(
        &self,
        scope: Context,
        input: ProcessInput,
    ) -> Result<Arc<ProcessResponse>, CallError>;
}

pub(crate) struct Observed<'a> {
    pub terminals: &'a [Terminal],
    pub notes_type: &'a str,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SaveTicket(String);

impl SaveTicket {
    pub(crate) fn new(request: &str) -> Self {
        Self(request.into())
    }
}

pub enum SaveRequest {
    Prepare {
        ticket: SaveTicket,
        vessels: Vec<VesselId>,
        reply: Sender<Result<(), CallError>>,
    },
    Release {
        ticket: SaveTicket,
        vessels: Vec<VesselId>,
    },
    PrepareRename {
        ticket: SaveTicket,
        vessels: Vec<VesselId>,
        files: Vec<(VesselId, voyager_contract::content::NotesFile)>,
        reply: Sender<Result<Option<String>, CallError>>,
    },
    ReleaseRename {
        ticket: SaveTicket,
        vessels: Vec<VesselId>,
        rebind: Option<RenamedNotes>,
    },
}

pub struct RenamedNotes {
    pub files: Vec<(VesselId, voyager_contract::content::NotesFile)>,
    pub workspace_version: u64,
    pub snapshot: voyager_contract::content::Snapshot,
}

pub(crate) struct RenameRelease {
    pub rebind: Option<RenamedNotes>,
    sender: Sender<SaveRequest>,
    ticket: SaveTicket,
    vessels: Vec<VesselId>,
}

impl RenameRelease {
    pub fn new(sender: Sender<SaveRequest>, ticket: SaveTicket, vessels: Vec<VesselId>) -> Self {
        Self {
            sender,
            ticket,
            vessels,
            rebind: None,
        }
    }
}

impl Drop for RenameRelease {
    fn drop(&mut self) {
        if self
            .sender
            .try_send(SaveRequest::ReleaseRename {
                ticket: self.ticket.clone(),
                vessels: std::mem::take(&mut self.vessels),
                rebind: self.rebind.take(),
            })
            .is_err()
        {
            eprintln!("Native Notes rename release was not delivered");
        }
    }
}

#[derive(Clone)]
pub(crate) struct Target {
    voyage: voyager_contract::Voyage,
    vessels: Vec<voyager_contract::Vessel>,
}

impl Target {
    pub fn check(&self, layout: &Layout) -> Result<(), Error> {
        if layout
            .voyages
            .iter()
            .find(|voyage| voyage.id == self.voyage.id)
            != Some(&self.voyage)
            || self.vessels.iter().any(|content| {
                layout.vessels.iter().find(|item| item.id == content.id) != Some(content)
            })
        {
            return Err(refused(
                "This Voyage changed; inspect it before another close",
            ));
        }
        Ok(())
    }
}

pub(crate) struct Confirmed {
    plan: Plan,
    target: Target,
    saves: Option<Receiver<Result<(), CallError>>>,
}

#[derive(Default)]
pub(crate) struct Closing {
    pub plan: Option<Plan>,
    pub revision: u64,
    pub saves: Option<Sender<SaveRequest>>,
    ticket: Option<SaveTicket>,
    notes: Vec<VesselId>,
    target: Option<Target>,
}

impl Closing {
    pub fn projected(&self, layout: &Arc<Layout>, scope: Option<&Context>) -> Option<Plan> {
        self.plan
            .as_ref()
            .filter(|plan| {
                crate::scope::check(
                    layout,
                    scope,
                    &Action::CloseVoyage {
                        id: plan.voyage.clone(),
                    },
                )
                .is_ok()
            })
            .cloned()
    }

    pub fn prepare(
        &mut self,
        layout: &Layout,
        version: u64,
        id: &VoyageId,
        request: &str,
        observed: Observed,
        changes: impl FnOnce(&Path) -> Result<Option<u32>, String>,
    ) -> Result<(), Error> {
        let Observed {
            terminals,
            notes_type,
        } = observed;
        if self
            .plan
            .as_ref()
            .is_some_and(|plan| matches!(plan.phase, Phase::Ready | Phase::Saving))
        {
            return Err(refused(
                "Finish or cancel the current Voyage confirmation first",
            ));
        }
        let voyage = layout
            .voyages
            .iter()
            .find(|voyage| &voyage.id == id)
            .ok_or_else(|| refused("Voyage not found"))?;
        if voyage.closed {
            return Err(refused("This Voyage is already closed"));
        }
        let uncommitted_changes = voyage
            .cwd
            .as_ref()
            .map(|cwd| changes(Path::new(cwd)))
            .transpose()
            .map_err(|error| refused(&format!("Could not inspect worktree changes: {error}")))?
            .flatten();
        let placements: Vec<_> = voyage
            .fleets
            .iter()
            .flat_map(|fleet| fleet.placements.iter())
            .chain(voyage.portals.iter())
            .collect();
        self.notes.clear();
        let mut entries = Vec::new();
        for content in layout
            .vessels
            .iter()
            .filter(|content| placements.iter().any(|panel| panel.vessel == content.id))
        {
            if content.start_pending.is_some() || content.shell_intent.is_some() {
                return Err(refused(
                    "A program start is unresolved; inspect it before closing the Voyage",
                ));
            }
            let terminal = content.backend.as_ref().and_then(|address| {
                terminals
                    .iter()
                    .find(|terminal| terminal.address == address.0)
            });
            let live = terminal.filter(|terminal| terminal.is_live());
            let note = content.type_id == notes_type;
            if note {
                self.notes.push(content.id.clone());
            }
            let visible_note = note
                && (voyage
                    .fleets
                    .iter()
                    .filter(|fleet| !fleet.closed)
                    .any(|fleet| {
                        let root = panels::visible(&fleet.root, &fleet.placements);
                        fleet.placements.iter().any(|panel| {
                            panel.vessel == content.id && panels::contains(&root, &panel.id)
                        })
                    })
                    || voyage.portal_layout.as_ref().is_some_and(|column| {
                        let root = panels::visible(&column.root, &voyage.portals);
                        voyage.portals.iter().any(|panel| {
                            panel.vessel == content.id && panels::contains(&root, &panel.id)
                        })
                    }));
            if live.is_none() && !visible_note {
                continue;
            }
            if live.is_some_and(|terminal| terminal.pid.is_none()) {
                return Err(refused("A running program has no verified PID"));
            }
            let panel = placements
                .iter()
                .find(|panel| panel.vessel == content.id)
                .ok_or_else(|| refused("Placement is unavailable"))?;
            entries.push(Entry {
                vessel: content.id.clone(),
                name: panel.name.clone(),
                type_id: content.type_id.clone(),
                terminal: live.map(|terminal| CoreTerminalId(terminal.address.clone())),
                pid: live.and_then(|terminal| terminal.pid),
            });
        }
        self.target = Some(Target {
            voyage: voyage.clone(),
            vessels: layout
                .vessels
                .iter()
                .filter(|content| placements.iter().any(|panel| panel.vessel == content.id))
                .cloned()
                .collect(),
        });
        self.plan = Some(Plan {
            id: request.into(),
            voyage: id.clone(),
            name: voyage.name.clone(),
            version,
            phase: Phase::Ready,
            entries,
            uncommitted_changes,
            message: Some(
                "Confirm shutdown. Notes will be saved and running programs stopped.".into(),
            ),
        });
        self.revision = self.revision.saturating_add(1);
        Ok(())
    }

    pub fn confirm(
        &mut self,
        id: &VoyageId,
        plan_id: &str,
        version: u64,
        request: &str,
    ) -> Result<Confirmed, Error> {
        let plan = self
            .plan
            .as_ref()
            .filter(|plan| {
                &plan.voyage == id
                    && plan.id == plan_id
                    && plan.version == version
                    && plan.phase == Phase::Ready
            })
            .ok_or_else(|| refused("The close confirmation changed; inspect the Voyage again"))?;
        let ticket = SaveTicket(request.into());
        let waiting = if self.notes.is_empty() {
            None
        } else {
            let saves = self.saves.as_ref().ok_or_else(|| {
                refused("The native Notes save service is unavailable; nothing was stopped")
            })?;
            let (reply, receive) = async_channel::bounded(1);
            saves
                .try_send(SaveRequest::Prepare {
                    ticket: ticket.clone(),
                    vessels: self.notes.clone(),
                    reply,
                })
                .map_err(|_| refused("Notes save could not be requested; nothing was stopped"))?;
            Some(receive)
        };
        let mut plan = plan.clone();
        plan.phase = Phase::Saving;
        plan.message = Some("Saving Notes before stopping programs…".into());
        self.ticket = Some(ticket);
        self.plan = Some(plan.clone());
        self.revision = self.revision.saturating_add(1);
        Ok(Confirmed {
            plan,
            target: self
                .target
                .clone()
                .ok_or_else(|| refused("Close identity unavailable"))?,
            saves: waiting,
        })
    }

    pub fn cancel(&mut self, id: &VoyageId, plan_id: &str) -> Result<(), Error> {
        let plan = self
            .plan
            .as_ref()
            .filter(|plan| &plan.voyage == id && plan.id == plan_id)
            .ok_or_else(|| refused("Close confirmation not found"))?;
        if plan.phase == Phase::Saving {
            return Err(refused(
                "Shutdown is already in progress; inspect its result",
            ));
        }
        self.release();
        self.plan = None;
        self.revision = self.revision.saturating_add(1);
        Ok(())
    }

    pub fn blocks_content(
        &self,
        id: &VesselId,
        ticket: Option<&SaveTicket>,
        native_save: bool,
    ) -> bool {
        self.ticket.is_some()
            && self.notes.contains(id)
            && (!native_save || (ticket.is_some() && ticket != self.ticket.as_ref()))
    }

    pub fn check_layout(&self, layout: &Layout) -> Result<(), Error> {
        if self.ticket.is_some()
            && let Some(target) = &self.target
        {
            target.check(layout)?;
        }
        Ok(())
    }

    pub fn blocks_terminal(&self, id: &VesselId) -> bool {
        self.ticket.is_some()
            && self
                .target
                .as_ref()
                .is_some_and(|target| target.vessels.iter().any(|content| &content.id == id))
    }

    pub fn owns_terminal(&self, address: &CoreTerminalId) -> bool {
        self.ticket.is_some()
            && self.plan.as_ref().is_some_and(|plan| {
                plan.entries
                    .iter()
                    .any(|entry| entry.terminal.as_ref() == Some(address))
            })
    }

    pub fn finish(&mut self, result: Result<(), Error>) {
        if let Some(plan) = &mut self.plan {
            plan.phase = if result.is_ok() {
                Phase::Closed
            } else {
                Phase::Incomplete
            };
            plan.message = Some(match result {
                Ok(()) => "Voyage saved and closed".into(),
                Err(Error::Uncertain(message)) => {
                    format!("Shutdown is unconfirmed. Inspect before another close: {message}")
                }
                Err(Error::Rejected { kind, message }) => {
                    format!("Voyage remains open. Inspect before another close: {kind}: {message}")
                }
            });
        }
        self.release();
        self.revision = self.revision.saturating_add(1);
    }

    fn release(&mut self) {
        if let Some(ticket) = self.ticket.take()
            && let Some(saves) = &self.saves
        {
            let _ = saves.try_send(SaveRequest::Release {
                ticket,
                vessels: self.notes.clone(),
            });
        }
    }
}

pub(crate) fn execute(calls: &impl Calls, confirmed: Confirmed) -> Result<(), Error> {
    let Confirmed {
        plan,
        target,
        saves,
    } = confirmed;
    if let Some(saves) = saves {
        match saves.recv_blocking().map_err(|_| {
            Error::Uncertain("Notes save acknowledgement was lost; no stop was sent".into())
        })? {
            Ok(()) => (),
            Err(CallError::Rejected(message)) => return Err(refused(&message)),
            Err(CallError::Unconfirmed(message)) => return Err(Error::Uncertain(message)),
        }
    }
    let mut stopped = 0;
    for entry in &plan.entries {
        let (Some(address), Some(pid)) = (&entry.terminal, entry.pid) else {
            continue;
        };
        stop(calls, &plan, &target, entry, address, pid)
            .map_err(|error| once_stopped(stopped, error))?;
        stopped += 1;
    }
    Ok(())
}

fn stop(
    calls: &impl Calls,
    plan: &Plan,
    target: &Target,
    entry: &Entry,
    address: &CoreTerminalId,
    pid: u32,
) -> Result<(), Error> {
    let current = calls.inspected().map_err(uninspected)?;
    if current.status != Outcome::Applied || !current.fresh {
        return Err(refused("Workspace could not be inspected before shutdown"));
    }
    target.check(&current.layout)?;
    let result = calls
        .stopped(
            Context::Voyage {
                id: plan.voyage.clone(),
            },
            ProcessInput {
                expected_version: current.version,
                action: ProcessAction::Stop {
                    terminal_id: address.clone(),
                    vessel_id: entry.vessel.clone(),
                    pid,
                },
            },
        )
        .map_err(|error| match error {
            CallError::Rejected(message) => refused(&message),
            CallError::Unconfirmed(message) => Error::Uncertain(message),
        })?;
    match result.status {
        Status::Applied => (),
        Status::Rejected => {
            return Err(refused(
                result
                    .message
                    .as_deref()
                    .unwrap_or("Program stop was refused"),
            ));
        }
        Status::Uncertain => {
            return Err(Error::Uncertain(
                result
                    .message
                    .clone()
                    .unwrap_or_else(|| "Program stop was not confirmed".into()),
            ));
        }
    }
    match &result.output {
        Some(ProcessOutput::Stop { target, observed })
            if target.terminal_id == *address
                && target.pid == Some(pid)
                && observed.terminal_id == *address
                && TerminalState::parse(&observed.state) == TerminalState::Finished => {}
        _ => {
            return Err(Error::Uncertain(
                "Program exit is not confirmed; no stop was repeated".into(),
            ));
        }
    }
    Ok(())
}

fn once_stopped(stopped: usize, error: Error) -> Error {
    match error {
        Error::Rejected { kind, message } if stopped > 0 => Error::Uncertain(format!(
            "{kind}: {message}. {stopped} of this Voyage's programs had already stopped"
        )),
        other => other,
    }
}

fn uninspected(unanswered: Unanswered) -> Error {
    match unanswered.status {
        Unapplied::Refused => refused(&unanswered.message),
        Unapplied::Uncertain => Error::Uncertain(unanswered.message),
    }
}

pub(crate) fn refused(message: &str) -> Error {
    Error::Rejected {
        kind: "voyage_close".into(),
        message: message.into(),
    }
}

#[cfg(test)]
impl Confirmed {
    pub(crate) fn stopping(voyage: voyager_contract::Voyage, entries: Vec<Entry>) -> Self {
        Self {
            plan: Plan {
                id: "plan".into(),
                voyage: voyage.id.clone(),
                name: voyage.name.clone(),
                version: 1,
                phase: Phase::Saving,
                entries,
                uncommitted_changes: None,
                message: None,
            },
            target: Target {
                voyage,
                vessels: Vec::new(),
            },
            saves: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn closing() -> Closing {
        Closing {
            plan: Some(Plan {
                id: "plan".into(),
                voyage: VoyageId("voyage".into()),
                name: "Demo".into(),
                version: 1,
                phase: Phase::Saving,
                entries: Vec::new(),
                uncommitted_changes: None,
                message: None,
            }),
            ..Closing::default()
        }
    }

    #[test]
    fn an_inspect_that_was_never_queued_refuses_the_close_and_a_silent_one_leaves_it_uncertain() {
        let never_queued = uninspected(Unanswered::refused(
            "inspect".into(),
            "Workspace busy or unavailable; nothing was queued".into(),
        ));
        assert!(matches!(
            never_queued,
            Error::Rejected { kind, message }
                if kind == "voyage_close" && message.ends_with("nothing was queued")
        ));
        let silent = uninspected(Unanswered::uncertain(
            "inspect".into(),
            "Workspace result unconfirmed; do not repeat the request".into(),
        ));
        assert!(matches!(
            silent,
            Error::Uncertain(message) if message.starts_with("Workspace result unconfirmed")
        ));
    }

    #[test]
    fn a_refused_close_gives_its_reason_and_an_unconfirmed_one_says_so() {
        let mut declined = closing();
        declined.finish(Err(refused(
            "Workspace could not be inspected before shutdown",
        )));
        let plan = declined.plan.unwrap();
        assert_eq!(plan.phase, Phase::Incomplete);
        assert_eq!(
            plan.message.as_deref(),
            Some(
                "Voyage remains open. Inspect before another close: voyage_close: Workspace could not be inspected before shutdown"
            )
        );
        let mut unconfirmed = closing();
        unconfirmed.finish(Err(Error::Uncertain(
            "Core result unconfirmed; no request was repeated".into(),
        )));
        let plan = unconfirmed.plan.unwrap();
        assert_eq!(plan.phase, Phase::Incomplete);
        assert_eq!(
            plan.message.as_deref(),
            Some(
                "Shutdown is unconfirmed. Inspect before another close: Core result unconfirmed; no request was repeated"
            )
        );
    }
}
