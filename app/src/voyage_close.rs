use crate::{
    client::{CallError, Client},
    core::{Core, Error},
    core_state::TerminalState,
    panels,
};
use async_channel::{Receiver, Sender};
use voyager_contract::administrator::{ProcessAction, ProcessInput, ProcessOutput, ProcessRequest};
use voyager_contract::voyage_close::{Entry, Phase, Plan};
use voyager_contract::{Action, ContentId, Context, CoreTerminalId, Layout, Status, VoyageId};

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
        contents: Vec<ContentId>,
        reply: Sender<Result<(), CallError>>,
    },
    Release {
        ticket: SaveTicket,
        contents: Vec<ContentId>,
    },
    PrepareRename {
        ticket: SaveTicket,
        contents: Vec<ContentId>,
        files: Vec<(ContentId, voyager_contract::content::NotesFile)>,
        reply: Sender<Result<Option<String>, CallError>>,
    },
    ReleaseRename {
        ticket: SaveTicket,
        contents: Vec<ContentId>,
        rebind: Option<RenamedNotes>,
    },
}

pub struct RenamedNotes {
    pub files: Vec<(ContentId, voyager_contract::content::NotesFile)>,
    pub workspace_version: u64,
    pub snapshot: voyager_contract::content::Snapshot,
}

pub(crate) struct RenameRelease {
    pub rebind: Option<RenamedNotes>,
    sender: Sender<SaveRequest>,
    ticket: SaveTicket,
    contents: Vec<ContentId>,
}

impl RenameRelease {
    pub fn new(sender: Sender<SaveRequest>, ticket: SaveTicket, contents: Vec<ContentId>) -> Self {
        Self {
            sender,
            ticket,
            contents,
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
                contents: std::mem::take(&mut self.contents),
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
    contents: Vec<voyager_contract::Content>,
}

impl Target {
    pub fn check(&self, layout: &Layout) -> Result<(), Error> {
        if layout
            .voyages
            .iter()
            .find(|voyage| voyage.id == self.voyage.id)
            != Some(&self.voyage)
            || self.contents.iter().any(|content| {
                layout.contents.iter().find(|item| item.id == content.id) != Some(content)
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
    notes: Vec<ContentId>,
    target: Option<Target>,
}

impl Closing {
    pub fn projected(
        &self,
        layout: &std::sync::Arc<Layout>,
        scope: Option<&Context>,
    ) -> Option<Plan> {
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
        core: &mut Core,
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
            .and_then(|cwd| {
                let directory = std::path::Path::new(cwd);
                crate::worktrees::list(directory)
                    .ok()
                    .filter(|checkouts| {
                        checkouts
                            .iter()
                            .any(|checkout| !checkout.main && directory.starts_with(&checkout.path))
                    })
                    .map(|_| crate::worktrees::uncommitted_changes(directory))
            })
            .transpose()
            .map_err(|error| refused(&format!("Could not inspect worktree changes: {error:?}")))?;
        let terminals = core.terminal_list()?;
        let placements: Vec<_> = voyage
            .fleets
            .iter()
            .flat_map(|fleet| fleet.vessels.iter())
            .chain(voyage.portals.iter())
            .collect();
        self.notes.clear();
        let mut entries = Vec::new();
        for content in layout
            .contents
            .iter()
            .filter(|content| placements.iter().any(|panel| panel.content == content.id))
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
            let note = content.type_id == crate::content_type::NOTES_TYPE;
            if note {
                self.notes.push(content.id.clone());
            }
            let visible_note = note
                && (voyage
                    .fleets
                    .iter()
                    .filter(|fleet| !fleet.closed)
                    .any(|fleet| {
                        let root = panels::visible(&fleet.root, &fleet.vessels);
                        fleet.vessels.iter().any(|panel| {
                            panel.content == content.id && panels::contains(&root, &panel.id)
                        })
                    })
                    || voyage.portal_layout.as_ref().is_some_and(|column| {
                        let root = panels::visible(&column.root, &voyage.portals);
                        voyage.portals.iter().any(|panel| {
                            panel.content == content.id && panels::contains(&root, &panel.id)
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
                .find(|panel| panel.content == content.id)
                .ok_or_else(|| refused("Placement is unavailable"))?;
            entries.push(Entry {
                content: content.id.clone(),
                name: panel.name.clone(),
                type_id: content.type_id.clone(),
                terminal: live.map(|terminal| CoreTerminalId(terminal.address.clone())),
                pid: live.and_then(|terminal| terminal.pid),
            });
        }
        self.target = Some(Target {
            voyage: voyage.clone(),
            contents: layout
                .contents
                .iter()
                .filter(|content| placements.iter().any(|panel| panel.content == content.id))
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
                    contents: self.notes.clone(),
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
        id: &ContentId,
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

    pub fn blocks_terminal(&self, id: &ContentId) -> bool {
        self.ticket.is_some()
            && self
                .target
                .as_ref()
                .is_some_and(|target| target.contents.iter().any(|content| &content.id == id))
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
                Err(error) => {
                    format!("Voyage remains open. Inspect before another close: {error:?}")
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
                contents: self.notes.clone(),
            });
        }
    }
}

pub(crate) fn execute(client: &Client, confirmed: Confirmed) -> Result<(), Error> {
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
    for entry in &plan.entries {
        let (Some(address), Some(pid)) = (&entry.terminal, entry.pid) else {
            continue;
        };
        let current = client
            .call(voyager_contract::Request {
                request_id: client.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            })
            .map_err(|error| Error::Uncertain(error.to_string()))?;
        if current.status != Status::Applied || !current.fresh {
            return Err(refused("Workspace could not be inspected before shutdown"));
        }
        target.check(&current.layout)?;
        let result = client
            .process(
                Context::Voyage {
                    id: plan.voyage.clone(),
                },
                ProcessRequest {
                    request_id: client.request_id(),
                    input: ProcessInput {
                        expected_version: current.version,
                        action: ProcessAction::Stop {
                            terminal_id: address.clone(),
                            content_id: entry.content.clone(),
                            pid,
                        },
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
    }
    Ok(())
}

pub(crate) fn refused(message: &str) -> Error {
    Error::Rejected {
        kind: "voyage_close".into(),
        message: message.into(),
    }
}
