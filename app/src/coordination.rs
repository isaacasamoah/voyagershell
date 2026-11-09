use std::collections::VecDeque;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Condvar, Mutex},
    time::Duration,
};
use voyager_contract::{
    ContentId, FleetId, Layout, PlacementId, VoyageId,
    coordination::{
        Agent, Operation, Outcome, Participant, Payload, Request, Response, RunId, Snapshot,
    },
    rank::Rank,
};

#[cfg(target_os = "linux")]
use super::coordination_linux as platform;

#[cfg(target_os = "linux")]
#[path = "coordination_transport.rs"]
pub mod command;

#[path = "coordination_inbox.rs"]
mod inbox;
#[path = "coordination_launch.rs"]
mod launch;
use inbox::Inbox;

#[derive(Default)]
pub(crate) struct Signal {
    pub(super) enabled: std::sync::atomic::AtomicBool,
    revision: Mutex<u32>,
    changed: Condvar,
}

impl Signal {
    pub(super) fn publish(&self, revision: u32) {
        if let Ok(mut current) = self.revision.lock()
            && *current != revision
        {
            *current = revision;
            self.changed.notify_all();
        }
    }
}

impl super::Client {
    pub fn coordination_enabled(&self) -> bool {
        self.coordination_signal
            .enabled
            .load(std::sync::atomic::Ordering::Acquire)
    }
    pub fn coordination_revision(&self) -> Result<u32, String> {
        self.coordination_signal
            .revision
            .lock()
            .map(|value| *value)
            .map_err(|e| e.to_string())
    }

    pub fn wait_coordination(&self, after: u32) -> Result<(), String> {
        let current = self
            .coordination_signal
            .revision
            .lock()
            .map_err(|e| e.to_string())?;
        let _guard = self
            .coordination_signal
            .changed
            .wait_timeout_while(current, Duration::from_secs(25), |revision| {
                *revision == after
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn coordinate(&self, request: Request) -> Result<Response, super::CallError> {
        self.coordinate_from(Caller::User, request)
    }

    pub(crate) fn coordinate_from(
        &self,
        caller: Caller,
        request: Request,
    ) -> Result<Response, super::CallError> {
        let (reply, receive) = std::sync::mpsc::sync_channel(1);
        self.sender
            .try_send(super::Message::Coordination {
                caller,
                request,
                reply,
            })
            .map_err(|_| {
                super::CallError::Rejected(
                    "Workspace busy; no coordination request was queued".into(),
                )
            })?;
        receive.recv_timeout(Duration::from_secs(25)).map_err(|_| super::CallError::Unconfirmed("Coordination result is unconfirmed. Inspect before doing anything else; do not repeat the operation".into()))
    }
}

pub fn failed_response(request_id: String, error: super::CallError) -> Response {
    let (outcome, message) = match error {
        super::CallError::Rejected(message) => (Outcome::Refused, message),
        super::CallError::Unconfirmed(message) => (Outcome::Uncertain, message),
    };
    Response {
        request_id,
        outcome,
        message: Some(message),
        snapshot: None,
        created: None,
    }
}

#[derive(Clone, Debug)]
pub(crate) struct Configuration {
    pub socket: PathBuf,
    pub command: PathBuf,
}

#[derive(Clone, Debug)]
pub(crate) enum Caller {
    User,
    #[cfg(target_os = "linux")]
    Agent {
        content: ContentId,
        peer: platform::Identity,
    },
}

struct Receipt {
    caller: Participant,
    request: Request,
    outcome: Outcome,
    message: Option<String>,
    created: Option<ContentId>,
}

pub(super) struct Workspace<'a> {
    pub core: &'a mut crate::core::Core,
    pub layout: &'a mut Arc<Layout>,
    pub version: &'a mut u64,
    pub fresh: &'a mut bool,
    pub unconfirmed: &'a mut HashMap<String, String>,
    pub created_contents: &'a mut Vec<super::CreatedTerminal>,
    pub launches: Option<&'a std::path::Path>,
}

#[derive(Default)]
pub(super) struct Owner {
    pub configuration: Option<Configuration>,
    agents: Vec<Agent>,
    #[cfg(target_os = "linux")]
    identities: HashMap<RunId, platform::Identity>,
    #[cfg(target_os = "linux")]
    images: HashMap<RunId, (u64, u64)>,
    #[cfg(target_os = "linux")]
    tickets: HashMap<ContentId, launch::LaunchTicket>,
    supervisors: HashMap<RunId, RunId>,
    inbox: Inbox,
    receipts: VecDeque<Receipt>,
}

fn places(layout: &Layout) -> Vec<(ContentId, PlacementId, VoyageId, Option<FleetId>, String)> {
    layout
        .containers()
        .filter(|voyage| !voyage.closed)
        .flat_map(|voyage| {
            voyage
                .fleets
                .iter()
                .flat_map(|fleet| {
                    fleet.vessels.iter().map(|placement| {
                        (
                            placement.content.clone(),
                            placement.id.clone(),
                            voyage.id.clone(),
                            Some(fleet.id.clone()),
                            placement.name.clone(),
                        )
                    })
                })
                .chain(voyage.portals.iter().map(|placement| {
                    (
                        placement.content.clone(),
                        placement.id.clone(),
                        voyage.id.clone(),
                        None,
                        placement.name.clone(),
                    )
                }))
        })
        .collect()
}

impl Owner {
    pub(super) fn changed(&mut self) {
        self.inbox.revision = self.inbox.revision.saturating_add(1);
    }
    pub(super) fn revision(&self) -> u32 {
        self.inbox.revision
    }

    #[cfg(target_os = "linux")]
    fn refresh(&mut self, layout: &Layout, core: &mut crate::core::Core) -> Result<(), String> {
        let previous = self.agents.clone();
        let terminals = core
            .terminal_list()
            .map_err(|e| format!("Core agents are unavailable: {e:?}"))?;
        for agent in &mut self.agents {
            agent.live = false;
        }
        for (content, placement, voyage, fleet, name) in places(layout) {
            let Some(item) = layout.contents.iter().find(|item| item.id == content) else {
                continue;
            };
            let Some(terminal) = terminals.iter().find(|terminal| {
                item.backend
                    .as_ref()
                    .is_some_and(|id| id.0 == terminal.address)
            }) else {
                continue;
            };
            let Some(foreground) = terminal
                .foreground
                .as_ref()
                .filter(|_| terminal.state == "live")
            else {
                continue;
            };
            if foreground.name != "codex" {
                continue;
            }
            let Ok(pid) = u32::try_from(foreground.pid) else {
                continue;
            };
            let Ok(identity) = platform::identity(pid) else {
                continue;
            };
            let id = RunId(format!("{}-{pid}-{}", content.0, identity.start));
            if self.identities.get(&id) != Some(&identity)
                || !platform::process_image(pid)
                    .is_ok_and(|image| self.images.get(&id) == Some(&image))
            {
                continue;
            }
            if let Some(agent) = self.agents.iter_mut().find(|agent| agent.id == id) {
                agent.live = true;
                agent.rank = item.rank;
                agent.placement = placement;
                agent.voyage = voyage;
                agent.fleet = fleet;
                agent.name = name;
                agent.supervisor = self.supervisors.get(&id).cloned();
            }
        }
        if self.agents != previous {
            self.inbox.revision = self
                .inbox
                .revision
                .checked_add(1)
                .ok_or("Experiment revision limit reached")?;
        }
        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    fn refresh(&mut self, _layout: &Layout, _core: &mut crate::core::Core) -> Result<(), String> {
        Err("This agent authority experiment currently supports Linux only".into())
    }

    fn participant(&self, caller: &Caller) -> Result<Participant, String> {
        match caller {
            Caller::User => Ok(Participant::User),
            #[cfg(target_os = "linux")]
            Caller::Agent { content, peer } => {
                let agent = self
                    .agents
                    .iter()
                    .find(|agent| agent.live && &agent.content == content)
                    .ok_or("The selected content has no current supported agent run")?;
                let root = self
                    .identities
                    .get(&agent.id)
                    .ok_or("The agent's original process is unavailable")?;
                platform::belongs_to(*peer, *root)?;
                Ok(Participant::Agent {
                    id: agent.id.clone(),
                })
            }
        }
    }

    fn agent(&self, id: &RunId) -> Result<&Agent, String> {
        self.agents
            .iter()
            .find(|agent| &agent.id == id && agent.live)
            .ok_or_else(|| {
                "That agent run has exited or is unavailable. It was not replaced".into()
            })
    }

    fn sender_name(&self, current: &Participant) -> Result<String, String> {
        match current {
            Participant::User => Ok("You".into()),
            Participant::Agent { id } => Ok(self.agent(id)?.name.clone()),
        }
    }

    fn supervisor(&self, target: &Agent) -> Result<Option<RunId>, String> {
        if let Some(id) = &target.supervisor
            && let Ok(supervisor) = self.agent(id)
            && may_direct(supervisor, target).is_ok()
        {
            return Ok(Some(id.clone()));
        }
        for rank in [Rank::Commodore, Rank::Admiral] {
            let choices: Vec<_> = self
                .agents
                .iter()
                .filter(|candidate| {
                    candidate.live
                        && candidate.rank == rank
                        && candidate.id != target.id
                        && may_direct(candidate, target).is_ok()
                })
                .collect();
            match choices.as_slice() {
                [supervisor] => return Ok(Some(supervisor.id.clone())),
                [] => (),
                _ => return Err("Several agents could supervise this scope. Assign the intended supervisor explicitly; conversation remains available".into()),
            }
        }
        Ok(None)
    }

    fn route(&self, source: &Participant, target: &Agent) -> Result<RunId, String> {
        let ceiling = match source {
            Participant::User => 4,
            Participant::Agent { id } => level(self.agent(id)?.rank),
        };
        let mut destination = target.id.clone();
        let mut lower = target;
        for _ in 0..3 {
            let Some(supervisor) = self.supervisor(lower)? else {
                break;
            };
            if source
                == &(Participant::Agent {
                    id: supervisor.clone(),
                })
            {
                break;
            }
            let higher = self.agent(&supervisor)?;
            if level(higher.rank) >= ceiling {
                break;
            }
            destination = supervisor;
            lower = higher;
        }
        Ok(destination)
    }

    fn direct(&self, source: &Participant, target: &Agent) -> Result<(), String> {
        if let Participant::Agent { id } = source {
            may_direct(self.agent(id)?, target)?;
        }
        Ok(())
    }

    fn snapshot(&self, current: Participant) -> Snapshot {
        let messages = if current == Participant::User {
            self.inbox.messages.iter().cloned().collect()
        } else {
            let mut messages = self.inbox.read(&current);
            messages.extend(
                self.inbox
                    .messages
                    .iter()
                    .filter(|message| message.from == current && message.to != current)
                    .cloned(),
            );
            messages
        };
        Snapshot {
            revision: self.inbox.revision,
            current,
            agents: self
                .agents
                .iter()
                .filter(|agent| agent.live)
                .cloned()
                .collect(),
            messages,
        }
    }

    pub(super) fn handle(
        &mut self,
        caller: Caller,
        request: Request,
        workspace: Workspace<'_>,
    ) -> Response {
        let admitted = (|| {
            if self.configuration.is_none() {
                return Err("Agent coordination is not enabled in this profile".into());
            }
            if request.request_id.is_empty() || request.request_id.len() > 128 {
                return Err("Use a nonempty request ID of at most 128 bytes".into());
            }
            if serde_json::to_vec(&request)
                .map_err(|e| e.to_string())?
                .len()
                > 8192
            {
                return Err("The coordination request exceeds 8 KiB".into());
            }
            self.refresh(workspace.layout, workspace.core)?;
            self.participant(&caller)
        })();
        let current = match admitted {
            Ok(current) => current,
            Err(message) => {
                return Response {
                    request_id: request.request_id,
                    outcome: Outcome::Refused,
                    message: Some(message),
                    snapshot: None,
                    created: None,
                };
            }
        };
        if let Operation::InspectRequest { id } = &request.action {
            return self.inspect_receipt(current, request.request_id, id);
        }
        if let Some(prior) = self
            .receipts
            .iter()
            .find(|prior| prior.caller == current && prior.request.request_id == request.request_id)
        {
            return Response {
                request_id: request.request_id.clone(),
                outcome: if prior.request == request {
                    prior.outcome.clone()
                } else {
                    Outcome::Refused
                },
                message: if prior.request == request {
                    prior.message.clone()
                } else {
                    Some("This request ID already names a different operation".into())
                },
                created: if prior.request == request {
                    prior.created.clone()
                } else {
                    None
                },
                snapshot: Some(self.snapshot(current)),
            };
        }
        if self.receipts.len() >= 32
            && self
                .receipts
                .iter()
                .all(|receipt| receipt.outcome == Outcome::Uncertain)
            && !matches!(request.action, Operation::Inspect | Operation::Wait { .. })
        {
            return Response { request_id: request.request_id, outcome: Outcome::Refused, message: Some("Unresolved operations fill this experiment's receipt limit. Nothing new was attempted".into()), created: None, snapshot: Some(self.snapshot(current)) };
        }
        let mut created = None;
        let result = if matches!(request.action, Operation::Start { .. }) {
            self.start_agent(&current, &request, workspace, &mut created)
        } else {
            self.perform(&current, &request.action)
                .map(|_| None)
                .map_err(super::rejected)
        };
        let (outcome, message) = match result {
            Ok(message) => (Outcome::Applied, message),
            Err(crate::core::Error::Rejected { message, .. }) => (
                if created.is_some() {
                    Outcome::Partial
                } else {
                    Outcome::Refused
                },
                Some(message),
            ),
            Err(crate::core::Error::Uncertain(message)) => (Outcome::Uncertain, Some(message)),
        };
        if !matches!(request.action, Operation::Inspect | Operation::Wait { .. }) {
            if self.receipts.len() == 32
                && let Some(index) = self
                    .receipts
                    .iter()
                    .position(|receipt| receipt.outcome != Outcome::Uncertain)
            {
                self.receipts.remove(index);
            }
            self.receipts.push_back(Receipt {
                caller: current.clone(),
                request: request.clone(),
                outcome: outcome.clone(),
                message: message.clone(),
                created: created.clone(),
            });
        }
        Response {
            request_id: request.request_id,
            outcome,
            message,
            snapshot: Some(self.snapshot(current)),
            created,
        }
    }

    fn inspect_receipt(&self, current: Participant, request_id: String, id: &str) -> Response {
        let prior = self
            .receipts
            .iter()
            .find(|receipt| receipt.caller == current && receipt.request.request_id == id);
        Response {
            request_id,
            outcome: prior.map_or(Outcome::Uncertain, |receipt| receipt.outcome.clone()),
            message: prior.map_or_else(|| Some("The retained receipt is unavailable. Inspect messages and the actual workspace; do not repeat the old operation".into()), |receipt| receipt.message.clone()),
            created: prior.and_then(|receipt| receipt.created.clone()),
            snapshot: Some(self.snapshot(current)),
        }
    }

    fn perform(&mut self, current: &Participant, operation: &Operation) -> Result<(), String> {
        match operation {
            Operation::Inspect | Operation::Wait { .. } | Operation::InspectRequest { .. } => {
                Ok(())
            }
            Operation::Send { to, text } => {
                if let Participant::Agent { id } = to {
                    self.agent(id)?;
                }
                if text.trim().is_empty() {
                    return Err("Write a message before sending".into());
                }
                let name = match current {
                    Participant::User => "You".into(),
                    Participant::Agent { id } => self.agent(id)?.name.clone(),
                };
                self.inbox.post(
                    current.clone(),
                    name,
                    to.clone(),
                    Payload::Conversation { text: text.clone() },
                )?;
                Ok(())
            }
            Operation::Acknowledge { id } => self.inbox.acknowledge(current, id),
            Operation::Instruct { target, task } => {
                if task.trim().is_empty() {
                    return Err("Describe the work to assign".into());
                }
                let target_agent = self.agent(target)?;
                self.direct(current, target_agent)?;
                let recipient = self.route(current, target_agent)?;
                self.inbox.post(
                    current.clone(),
                    self.sender_name(current)?,
                    Participant::Agent { id: recipient },
                    Payload::Instruction {
                        task: task.clone(),
                        target: target.clone(),
                    },
                )?;
                Ok(())
            }
            Operation::Forward { id } => {
                let message = self
                    .inbox
                    .messages
                    .iter()
                    .find(|message| &message.id == id && &message.to == current)
                    .cloned()
                    .ok_or("That instruction is not addressed to you")?;
                let Payload::Instruction { target, .. } = &message.payload else {
                    return Err("Only an instruction can be forwarded".into());
                };
                let target_agent = self.agent(target)?;
                self.direct(current, target_agent)?;
                let recipient = Participant::Agent {
                    id: self.route(current, target_agent)?,
                };
                if &recipient == current {
                    return Err(
                        "You are the final target; carry out the instruction instead of forwarding"
                            .into(),
                    );
                }
                self.inbox.room(&recipient)?;
                let index = self
                    .inbox
                    .messages
                    .iter()
                    .position(|item| item.id == message.id)
                    .ok_or("Instruction unavailable")?;
                if let Participant::Agent { id } = current {
                    self.inbox.messages[index].via.push(id.clone());
                }
                self.inbox.messages[index].to = recipient;
                self.inbox.messages[index].acknowledged = false;
                self.inbox.revision = self
                    .inbox
                    .revision
                    .checked_add(1)
                    .ok_or("Message limit reached")?;
                Ok(())
            }
            Operation::Assign { agent, supervisor } => {
                let mut target = self.agent(agent)?.clone();
                self.direct(current, &target)?;
                if let Some(id) = supervisor {
                    let higher = self.agent(id)?;
                    if current != &(Participant::Agent { id: id.clone() }) {
                        self.direct(current, higher)?;
                    }
                    target.supervisor = Some(id.clone());
                    may_direct(higher, &target)?;
                    self.supervisors.insert(agent.clone(), id.clone());
                } else {
                    self.supervisors.remove(agent);
                }
                if let Some(current) = self.agents.iter_mut().find(|item| &item.id == agent) {
                    current.supervisor = supervisor.clone();
                }
                self.inbox.revision = self
                    .inbox
                    .revision
                    .checked_add(1)
                    .ok_or("Message limit reached")?;
                Ok(())
            }
            Operation::Escalate {
                title,
                context,
                decision,
                blast_radius,
            } => {
                if [title, context, decision, blast_radius]
                    .iter()
                    .any(|value| value.trim().is_empty())
                {
                    return Err(
                        "Include a title, context, decision needed and affected work".into(),
                    );
                }
                let Participant::Agent { id } = current else {
                    return Err("An escalation must come from an actual agent run".into());
                };
                let recipient = match self.supervisor(self.agent(id)?)? {
                    Some(id) => Participant::Agent { id },
                    None => Participant::User,
                };
                self.inbox.post(
                    current.clone(),
                    self.sender_name(current)?,
                    recipient,
                    Payload::Escalation {
                        title: title.clone(),
                        context: context.clone(),
                        decision: decision.clone(),
                        blast_radius: blast_radius.clone(),
                    },
                )?;
                Ok(())
            }
            Operation::Resolve { id, decision } => {
                let message = self
                    .inbox
                    .messages
                    .iter()
                    .find(|message| {
                        &message.id == id && &message.to == current && !message.resolved
                    })
                    .cloned()
                    .ok_or("That escalation is unavailable or already answered")?;
                if !matches!(message.payload, Payload::Escalation { .. }) {
                    return Err("This item is not an escalation".into());
                }
                if let voyager_contract::coordination::Decision::Reply { text } = decision
                    && text.trim().is_empty()
                {
                    return Err("Write a reply before sending".into());
                }
                let Participant::Agent { id: origin } = &message.from else {
                    return Err("The original agent is unavailable".into());
                };
                self.agent(origin)?;
                self.inbox.post(
                    current.clone(),
                    self.sender_name(current)?,
                    message.from,
                    Payload::Decision {
                        in_reply_to: id.clone(),
                        decision: decision.clone(),
                    },
                )?;
                let original = self
                    .inbox
                    .messages
                    .iter_mut()
                    .find(|message| &message.id == id)
                    .ok_or("The original escalation is unavailable")?;
                original.resolved = true;
                original.acknowledged = true;
                Ok(())
            }
            Operation::Start { .. } => {
                Err("Agent creation requires its application effect context".into())
            }
        }
    }
}

fn level(rank: Rank) -> u8 {
    match rank {
        Rank::Crew => 0,
        Rank::Captain => 1,
        Rank::Commodore => 2,
        Rank::Admiral => 3,
    }
}

pub fn may_direct(sender: &Agent, target: &Agent) -> Result<(), String> {
    if !sender.live || !target.live || sender.id == target.id {
        return Err("This operation needs two different live agent runs".into());
    }
    if level(sender.rank) <= level(target.rank) {
        return Err("Your rank cannot direct this agent. Conversation remains available".into());
    }
    let same_fleet = sender.fleet.is_some() && sender.fleet == target.fleet;
    let allowed = sender.voyage == target.voyage
        && match sender.rank {
            Rank::Crew => false,
            Rank::Captain => same_fleet && target.supervisor.as_ref() == Some(&sender.id),
            Rank::Commodore => same_fleet,
            Rank::Admiral => true,
        };
    if allowed {
        Ok(())
    } else {
        Err("This agent is outside your assigned scope. Conversation remains available".into())
    }
}

pub fn may_create(
    sender: &Agent,
    voyage: &VoyageId,
    fleet: &FleetId,
    rank: Rank,
) -> Result<(), String> {
    if !sender.live || sender.voyage != *voyage || level(rank) >= level(sender.rank) {
        return Err("Your current rank cannot start that agent in this scope. Conversation remains available".into());
    }
    if sender.rank == Rank::Admiral || sender.fleet.as_ref() == Some(fleet) {
        Ok(())
    } else {
        Err("Start lower-ranked work inside your own Fleet. Conversation remains available".into())
    }
}

#[cfg(test)]
#[path = "coordination_tests.rs"]
mod tests;
