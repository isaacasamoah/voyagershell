use crate::{
    core::{CallError, Error},
    core_shapes::Terminal,
    core_state::TerminalState,
};
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
}

#[derive(Default)]
pub(crate) struct Closing {
    pub plan: Option<Plan>,
    pub revision: u64,
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
        terminals: &[Terminal],
        changes: impl FnOnce(&Path) -> Result<Option<u32>, String>,
    ) -> Result<(), Error> {
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
            let Some(live) = content
                .backend
                .as_ref()
                .and_then(|address| {
                    terminals
                        .iter()
                        .find(|terminal| terminal.address == address.0)
                })
                .filter(|terminal| terminal.is_live())
            else {
                continue;
            };
            if live.pid.is_none() {
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
                terminal: Some(CoreTerminalId(live.address.clone())),
                pid: live.pid,
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
            message: Some("Confirm shutdown. Running programs will be stopped.".into()),
        });
        self.revision = self.revision.saturating_add(1);
        Ok(())
    }

    pub fn confirm(
        &mut self,
        id: &VoyageId,
        plan_id: &str,
        version: u64,
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
        let mut plan = plan.clone();
        plan.phase = Phase::Saving;
        plan.message = Some("Closing programs…".into());
        self.plan = Some(plan.clone());
        self.revision = self.revision.saturating_add(1);
        Ok(Confirmed {
            plan,
            target: self
                .target
                .clone()
                .ok_or_else(|| refused("Close identity unavailable"))?,
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
        self.plan = None;
        self.revision = self.revision.saturating_add(1);
        Ok(())
    }

    fn confirmed(&self) -> bool {
        self.plan
            .as_ref()
            .is_some_and(|plan| plan.phase == Phase::Saving)
    }

    pub fn check_layout(&self, layout: &Layout) -> Result<(), Error> {
        if self.confirmed()
            && let Some(target) = &self.target
        {
            target.check(layout)?;
        }
        Ok(())
    }

    pub fn blocks_terminal(&self, id: &VesselId) -> bool {
        self.confirmed()
            && self
                .target
                .as_ref()
                .is_some_and(|target| target.vessels.iter().any(|content| &content.id == id))
    }

    pub fn owns_terminal(&self, address: &CoreTerminalId) -> bool {
        self.confirmed()
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
        self.revision = self.revision.saturating_add(1);
    }
}

pub(crate) fn execute(calls: &impl Calls, confirmed: Confirmed) -> Result<(), Error> {
    let Confirmed { plan, target } = confirmed;
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
    fn a_confirmed_close_freezes_its_voyage_until_it_finishes() {
        let mut model = crate::workspace::Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Demo".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        let address = CoreTerminalId("t1".into());
        model.layout.vessels[0].backend = Some(address.clone());
        model
            .apply(Action::CreateVessel {
                launch: None,
                type_id: "dashboard".into(),
                destination: voyager_contract::ContentDestination::Placement {
                    owner: voyager_contract::PlacementOwner::Portals {
                        voyage: model.layout.voyages[0].id.clone(),
                    },
                    insertion: voyager_contract::PlacementInsertion::Empty,
                },
            })
            .unwrap();
        let layout = model.layout;
        let voyage = layout.voyages[0].id.clone();
        let shell = layout.vessels[0].id.clone();
        let running: Terminal = serde_json::from_value(serde_json::json!({
            "address": "t1", "labels": {}, "argv": ["bash"], "cwd": "/tmp", "state": "live", "pid": 123,
            "created_ms": 1, "screen": "exact", "cols": 80, "rows": 24
        }))
        .unwrap();
        let mut edited = layout.clone();
        edited.voyages[0].name = "Renamed".into();
        let mut closing = Closing::default();
        closing
            .prepare(&layout, 4, &voyage, "plan-1", &[running], |_| Ok(None))
            .unwrap();
        let plan = closing.plan.clone().unwrap();
        assert_eq!(plan.phase, Phase::Ready);
        assert_eq!(plan.entries.len(), 1);
        assert_eq!(plan.entries[0].vessel, shell);
        assert_eq!(plan.entries[0].terminal, Some(address.clone()));
        assert_eq!(plan.entries[0].pid, Some(123));
        assert!(closing.check_layout(&edited).is_ok());
        assert!(!closing.blocks_terminal(&shell));
        assert!(!closing.owns_terminal(&address));
        assert!(closing.confirm(&voyage, "plan-1", 5).is_err());
        closing.confirm(&voyage, "plan-1", 4).unwrap();
        assert!(closing.check_layout(&layout).is_ok());
        assert!(closing.check_layout(&edited).is_err());
        assert!(closing.blocks_terminal(&shell));
        assert!(closing.owns_terminal(&address));
        assert!(closing.cancel(&voyage, "plan-1").is_err());
        closing.finish(Ok(()));
        assert_eq!(closing.plan.as_ref().unwrap().phase, Phase::Closed);
        assert!(closing.check_layout(&edited).is_ok());
        assert!(!closing.blocks_terminal(&shell));
        assert!(!closing.owns_terminal(&address));
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
