#[cfg(target_os = "linux")]
use super::platform;
use super::{Owner, Workspace, level, may_create, places};
use std::{collections::HashMap, sync::Arc};
use voyager_contract::{
    ContentId, Layout,
    coordination::{Agent, Operation, Participant, Payload, Request, RunId},
    rank::Rank,
};

#[cfg(target_os = "linux")]
pub(super) struct LaunchTicket {
    operation: String,
    argv: Vec<String>,
    image: (u64, u64),
    shell: Option<platform::Identity>,
    backend: Option<String>,
    supervisor: Option<RunId>,
}

impl Owner {
    pub(crate) fn refused_launch(&mut self, content: &ContentId, operation: &str) {
        #[cfg(target_os = "linux")]
        if self
            .tickets
            .get(content)
            .is_some_and(|ticket| ticket.operation == operation && ticket.backend.is_none())
        {
            self.tickets.remove(content);
        }
        #[cfg(not(target_os = "linux"))]
        let _ = (content, operation);
    }

    #[cfg(target_os = "linux")]
    pub(crate) fn prepare_launch(
        &mut self,
        content: &ContentId,
        launch: &voyager_contract::launch::Launch,
        cwd: &str,
        operation: &str,
    ) -> Result<(Vec<String>, HashMap<String, String>), String> {
        let Some(configuration) = &self.configuration else {
            return Ok((
                crate::launch::terminal_command(launch, cwd)?,
                HashMap::new(),
            ));
        };
        let mut argv = crate::launch::command(launch, cwd)?;
        if argv
            .first()
            .and_then(|arg| std::path::Path::new(arg).file_name())
            .and_then(|name| name.to_str())
            != Some("codex")
        {
            return Ok((
                crate::launch::terminal_command(launch, cwd)?,
                HashMap::new(),
            ));
        }
        if !argv.iter().any(|arg| arg == "--no-daemon") {
            return Err(
                "This coordination trial requires a native Codex launch with --no-daemon".into(),
            );
        }
        let mut magic = [0u8; 4];
        use std::io::Read;
        std::fs::File::open(&argv[0])
            .map_err(|e| e.to_string())?
            .read_exact(&mut magic)
            .map_err(|e| e.to_string())?;
        if magic != *b"\x7fELF" {
            return Err(
                "Coordination requires the native Codex executable, not a spawning wrapper".into(),
            );
        }
        let image = platform::image(std::path::Path::new(&argv[0]))?;
        let command = configuration
            .command
            .to_str()
            .ok_or("Agent command path is not UTF-8")?
            .to_owned();
        let env = HashMap::from([
            (
                "VOYAGER_AGENT_SOCKET".into(),
                configuration.socket.to_string_lossy().into_owned(),
            ),
            ("VOYAGER_AGENT_CONTENT".into(), content.0.clone()),
            ("VOYAGER_AGENT_BIN".into(), command.clone()),
        ]);
        argv.splice(1..1, codex_settings(&env)?);
        let mut wrapped = vec![command.clone(), "launch".into()];
        wrapped.extend(argv);
        let shell = crate::launch::shell_command(launch, wrapped.clone())?;
        if self.tickets.len() >= 8 || self.agents.len() >= 64 {
            return Err("This experiment has no capacity for another agent launch".into());
        }
        self.tickets.insert(
            content.clone(),
            LaunchTicket {
                operation: operation.into(),
                argv: wrapped,
                image,
                shell: None,
                backend: None,
                supervisor: None,
            },
        );
        Ok((shell, env))
    }

    #[cfg(not(target_os = "linux"))]
    pub(crate) fn prepare_launch(
        &mut self,
        _content: &ContentId,
        launch: &voyager_contract::launch::Launch,
        cwd: &str,
        _operation: &str,
    ) -> Result<(Vec<String>, HashMap<String, String>), String> {
        Ok((
            crate::launch::terminal_command(launch, cwd)?,
            HashMap::new(),
        ))
    }

    #[cfg(target_os = "linux")]
    pub(crate) fn confirm_launch(
        &mut self,
        content: &ContentId,
        terminal: &crate::core_shapes::Terminal,
    ) -> Result<(), String> {
        if let Some(ticket) = self.tickets.get_mut(content) {
            if terminal.labels.get("voyager-operation") != Some(&ticket.operation) {
                return Err(
                    "The started Core program does not match the reserved coordination launch"
                        .into(),
                );
            }
            ticket.shell = Some(platform::identity(
                terminal.pid.ok_or("The Core shell PID is unavailable")?,
            )?);
            ticket.backend = Some(terminal.address.clone());
        }
        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    pub(crate) fn confirm_launch(
        &mut self,
        _content: &ContentId,
        _terminal: &crate::core_shapes::Terminal,
    ) -> Result<(), String> {
        Ok(())
    }

    #[cfg(target_os = "linux")]
    pub(crate) fn enroll(
        &mut self,
        content: &ContentId,
        peer: platform::Identity,
        layout: &Layout,
        core: &mut crate::core::Core,
    ) -> Result<(), String> {
        let ticket = self
            .tickets
            .get(content)
            .ok_or("No unused launch enrollment exists for this content")?;
        let shell = ticket.shell.ok_or(
            "The original Core launch binding is not confirmed; enrollment was not granted",
        )?;
        let backend = ticket
            .backend
            .as_ref()
            .ok_or("The Core backend is unavailable")?;
        let terminal = core
            .terminal_get(backend)
            .map_err(|e| format!("Core binding unavailable: {e:?}"))?;
        let configuration = self
            .configuration
            .as_ref()
            .ok_or("Coordination is disabled")?;
        let command_image = platform::image(&configuration.command)?;
        let peer_image = platform::process_image(peer.pid)?;
        if terminal.state != "live"
            || terminal.pid != Some(shell.pid)
            || terminal.labels.get("voyager-operation") != Some(&ticket.operation)
            || platform::identity(shell.pid)? != shell
            || platform::parent(peer.pid)? != shell.pid
            || platform::arguments(peer.pid)? != ticket.argv
            || command_image != peer_image
        {
            return Err("The enrollment does not belong to the reserved native launch".into());
        }
        platform::belongs_to(peer, shell)?;
        let item = layout
            .contents
            .iter()
            .find(|item| {
                &item.id == content && item.backend.as_ref().is_some_and(|id| &id.0 == backend)
            })
            .ok_or("The launch no longer has its saved content binding")?;
        let (_, placement, voyage, fleet, name) = places(layout)
            .into_iter()
            .find(|(id, ..)| id == content)
            .ok_or("The agent placement is unavailable")?;
        let id = RunId(format!("{}-{}-{}", content.0, peer.pid, peer.start));
        self.identities.insert(id.clone(), peer);
        self.images.insert(id.clone(), ticket.image);
        if let Some(supervisor) = &ticket.supervisor {
            self.supervisors.insert(id.clone(), supervisor.clone());
        }
        self.agents.push(Agent {
            id,
            content: content.clone(),
            placement,
            name,
            rank: item.rank,
            voyage,
            fleet,
            supervisor: ticket.supervisor.clone(),
            live: false,
        });
        self.tickets.remove(content);
        self.inbox.revision = self
            .inbox
            .revision
            .checked_add(1)
            .ok_or("Experiment revision limit reached")?;
        Ok(())
    }
    pub(super) fn start_agent(
        &mut self,
        current: &Participant,
        request: &Request,
        workspace: Workspace<'_>,
        created: &mut Option<ContentId>,
    ) -> Result<Option<String>, crate::core::Error> {
        use voyager_contract::{
            Action, ContentDestination, PanelInsertion, PanelOwner, RenameTarget, Side,
            TerminalRequest,
            launch::{Launch, LaunchSettings},
        };
        let Operation::Start {
            fleet,
            rank,
            name,
            task,
        } = &request.action
        else {
            return Err(crate::client::rejected(
                "Expected an agent creation operation".into(),
            ));
        };
        if name.trim().is_empty() || name.len() > 128 || task.trim().is_empty() {
            return Err(crate::client::rejected(
                "Include a short agent name and a concrete task".into(),
            ));
        }
        let voyage = workspace
            .layout
            .containers()
            .find(|voyage| {
                !voyage.closed
                    && voyage
                        .fleets
                        .iter()
                        .any(|candidate| &candidate.id == fleet && !candidate.closed)
            })
            .ok_or_else(|| crate::client::rejected("The target Fleet is unavailable".into()))?;
        if let Participant::Agent { id } = current {
            may_create(
                self.agent(id).map_err(crate::client::rejected)?,
                &voyage.id,
                fleet,
                *rank,
            )
            .map_err(crate::client::rejected)?;
        }
        crate::rank::eligible(&PanelOwner::Fleet { id: fleet.clone() }, *rank)
            .map_err(crate::client::rejected)?;
        if let Participant::Agent { id } = current
            && self.agent(id).map_err(crate::client::rejected)?.rank == Rank::Admiral
            && level(*rank) < level(Rank::Commodore)
        {
            let supervisors: Vec<_> = self
                .agents
                .iter()
                .filter(|agent| {
                    agent.live
                        && agent.rank == Rank::Commodore
                        && agent.voyage == voyage.id
                        && agent.fleet.as_ref() == Some(fleet)
                })
                .collect();
            if supervisors.len() > 1 {
                return Err(crate::client::rejected(
                    "Choose the Fleet's supervisor before routing this creation request".into(),
                ));
            }
            if let Some(supervisor) = supervisors.first() {
                let destination = supervisor.id.clone();
                self.inbox
                    .post(
                        current.clone(),
                        self.sender_name(current).map_err(crate::client::rejected)?,
                        Participant::Agent { id: destination },
                        Payload::Start {
                            fleet: fleet.clone(),
                            rank: *rank,
                            name: name.clone(),
                            task: task.clone(),
                        },
                    )
                    .map_err(crate::client::rejected)?;
                return Ok(Some("The creation request was routed through the Fleet's Commodore. No child has started yet; inspect the conversation for its result".into()));
            }
        }
        let target_fleet = voyage
            .fleets
            .iter()
            .find(|candidate| &candidate.id == fleet)
            .ok_or_else(|| crate::client::rejected("Fleet unavailable".into()))?;
        let insertion = target_fleet
            .vessels
            .iter()
            .find(|placement| !placement.hidden)
            .map(|placement| PanelInsertion::Beside {
                id: placement.id.clone(),
                side: Side::Right,
            })
            .unwrap_or(PanelInsertion::Empty);
        let settings = workspace
            .launches
            .map(crate::launch::load)
            .transpose()
            .map_err(crate::client::rejected)?
            .unwrap_or_else(LaunchSettings::default);
        let launch = settings
            .entries
            .iter()
            .find(|entry| {
                entry.id == settings.default && matches!(entry.launch, Launch::Codex { .. })
            })
            .or_else(|| {
                settings
                    .entries
                    .iter()
                    .find(|entry| matches!(entry.launch, Launch::Codex { .. }))
            })
            .ok_or_else(|| {
                crate::client::rejected(
                    "Configure a native Codex launch entry for this trial".into(),
                )
            })?;
        let mut argv = crate::launch::argv(&launch.launch).map_err(crate::client::rejected)?;
        argv.extend(["--".into(), task.clone()]);
        let previous = workspace.layout.clone();
        let mut model = crate::client::Model {
            layout: (**workspace.layout).clone(),
        };
        model
            .apply(Action::CreateContent {
                type_id: "terminal".into(),
                destination: ContentDestination::Panel {
                    owner: PanelOwner::Fleet { id: fleet.clone() },
                    insertion,
                },
                launch: Some(Launch::Program { argv }),
            })
            .map_err(crate::client::rejected)?;
        let content = model
            .layout
            .contents
            .iter_mut()
            .find(|item| !previous.contents.iter().any(|old| old.id == item.id))
            .ok_or_else(|| crate::client::rejected("The new content was not created".into()))?;
        content.rank = *rank;
        let content_id = content.id.clone();
        let placement = model
            .layout
            .containers()
            .flat_map(|voyage| &voyage.fleets)
            .flat_map(|fleet| &fleet.vessels)
            .find(|placement| placement.content == content_id)
            .ok_or_else(|| crate::client::rejected("The new placement is unavailable".into()))?
            .id
            .clone();
        model
            .apply(Action::Rename {
                target: RenameTarget::Vessel { id: placement },
                name: name.clone(),
            })
            .map_err(crate::client::rejected)?;
        crate::rank::validate(&model.layout).map_err(crate::client::rejected)?;
        let saved = match crate::client::save(workspace.core, &model.layout, *workspace.version) {
            Ok(saved) => saved,
            Err(error) => {
                *workspace.fresh = false;
                if matches!(error, crate::core::Error::Uncertain(_)) {
                    *created = Some(content_id);
                }
                return Err(error);
            }
        };
        crate::client::record_created_terminals(
            workspace.created_contents,
            &previous,
            &model.layout,
        );
        *workspace.layout = Arc::new(model.layout);
        *workspace.version = saved;
        *created = Some(content_id.clone());
        let terminal_request = TerminalRequest {
            request_id: format!("coordination-{}", request.request_id),
            content_id: content_id.clone(),
            expected_version: saved,
        };
        crate::client::start_terminal(
            workspace.core,
            crate::client::TerminalOwner {
                layout: workspace.layout,
                version: workspace.version,
                fresh: workspace.fresh,
                unconfirmed: workspace.unconfirmed,
                created_contents: workspace.created_contents,
                coordination: self,
            },
            &terminal_request,
        )?;
        #[cfg(target_os = "linux")]
        if let Some(ticket) = self.tickets.get_mut(&content_id)
            && let Participant::Agent { id } = current
        {
            ticket.supervisor = Some(id.clone());
        }
        Ok(Some("The child program started in its new Vessel. Enrollment, task receipt and completed work are separate observations".into()))
    }
}

#[cfg(target_os = "linux")]
fn codex_settings(env: &HashMap<String, String>) -> Result<Vec<String>, String> {
    let guide = include_str!("../../experiments/agent-authority/AGENTS.md");
    let mut settings = vec![
        "-c".into(),
        format!(
            "developer_instructions={}",
            serde_json::to_string(guide).map_err(|error| error.to_string())?
        ),
    ];
    for (key, value) in env {
        settings.extend([
            "-c".into(),
            format!(
                "shell_environment_policy.set.{key}={}",
                serde_json::to_string(value).map_err(|error| error.to_string())?
            ),
        ]);
    }
    Ok(settings)
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn codex_commands_receive_only_the_explicit_binding_without_broad_inheritance() {
        let binding = HashMap::from([
            (
                "VOYAGER_AGENT_BIN".into(),
                "/tmp/space and \"quote/voyager-agent".into(),
            ),
            ("VOYAGER_AGENT_CONTENT".into(), "content-11".into()),
            ("VOYAGER_AGENT_SOCKET".into(), "/tmp/agent.sock".into()),
        ]);
        let settings = codex_settings(&binding).unwrap();
        assert_eq!(settings.len(), 8);
        for pair in settings.chunks_exact(2) {
            assert_eq!(pair[0], "-c");
        }
        for (key, value) in binding {
            let prefix = format!("shell_environment_policy.set.{key}=");
            let setting = settings
                .iter()
                .find(|item| item.starts_with(prefix.as_str()))
                .unwrap();
            let decoded: String =
                serde_json::from_str(setting.strip_prefix(prefix.as_str()).unwrap()).unwrap();
            assert_eq!(decoded, value);
        }
        assert!(!settings.iter().any(|item| item.contains("inherit=")));
    }
}
