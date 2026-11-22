use crate::core::{Core, Error, Viewer};
use crate::core_shapes::{RunParams, Terminal};
use crate::layout_store::{LayoutRevision, rejected, save};
use std::{collections::HashMap, sync::Arc};
use voyager_contract::{CoreTerminalId, Layout, TerminalRequest, VesselId};

const LABEL: &str = "voyager-operation";

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct CreatedTerminal {
    pub(super) id: VesselId,
    pub(super) launch: voyager_contract::launch::Launch,
    pub(super) backend: Option<CoreTerminalId>,
    pub(super) shell_intent: Option<String>,
}

impl CreatedTerminal {
    pub(super) fn matches(&self, content: &voyager_contract::Vessel) -> bool {
        self.id == content.id
            && self.backend == content.backend
            && self.shell_intent == content.shell_intent
            && &self.launch
                == content
                    .launch
                    .as_ref()
                    .unwrap_or(&voyager_contract::launch::Launch::Terminal)
    }

    pub(super) fn eligible(&self, content: &voyager_contract::Vessel) -> bool {
        self.matches(content)
            && voyager_contract::launch::is_terminal_backed(&content.type_id)
            && (content.backend.is_none() || self.shell_intent.is_some())
            && content.start_pending.is_none()
    }
}

pub(super) fn require_finished(
    observed: &crate::core_shapes::Terminal,
    expected: &CoreTerminalId,
) -> Result<(), Error> {
    if observed.address != expected.0 || !observed.has_ended() {
        return Err(rejected(
            "The selected program is not confirmed ended; no new shell was authorized".into(),
        ));
    }
    Ok(())
}

fn settle_run(core: &mut Core, operation: &str, message: String) -> Result<Terminal, Error> {
    let labelled = HashMap::from([(LABEL.into(), operation.into())]);
    let listed = core
        .begin_labelled_list(labelled)
        .and_then(|pending| pending.wait())
        .map(|listed| listed.terminals);
    match listed.map(<[Terminal; 1]>::try_from) {
        Ok(Ok([started])) => Ok(started),
        _ => Err(Error::Uncertain(format!(
            "{message}; Core listed no single terminal for {operation}, and a start may still be in progress, so it was not repeated"
        ))),
    }
}

fn run_params(argv: Vec<String>, cwd: &str, operation: &str, path: Option<String>) -> RunParams {
    RunParams {
        argv,
        cwd: Some(cwd.into()),
        no_parent: true,
        labels: HashMap::from([(LABEL.into(), operation.into())]),
        env: path
            .map(|path| HashMap::from([("PATH".into(), path)]))
            .unwrap_or_default(),
        ..Default::default()
    }
}

pub(super) struct Owned<'a> {
    pub(super) core: &'a mut Core,
    pub(super) layout: &'a mut Arc<Layout>,
    pub(super) version: &'a mut LayoutRevision,
    pub(super) fresh: &'a mut bool,
    pub(super) unconfirmed: &'a mut HashMap<String, String>,
    pub(super) created_vessels: &'a mut Vec<CreatedTerminal>,
    pub(super) launches: Option<&'a std::path::Path>,
}

pub(super) fn open_terminal(
    mut owned: Owned<'_>,
    request: &TerminalRequest,
) -> Result<(Viewer, bool), Error> {
    let (terminal, created) = start_terminal(&mut owned, request)?;
    let core = owned.core;
    let address = &terminal.address;
    let attached = core
        .terminal_attach(&terminal)
        .map_err(|error| attach_failure(error, created, address))?;
    Ok((core.viewer(&attached)?, created))
}

pub(super) fn start_terminal(
    owned: &mut Owned<'_>,
    request: &TerminalRequest,
) -> Result<(Terminal, bool), Error> {
    let core = &mut *owned.core;
    let layout = &mut *owned.layout;
    let version = &mut *owned.version;
    let fresh = &mut *owned.fresh;
    let unconfirmed = &mut *owned.unconfirmed;
    let created_vessels = &mut *owned.created_vessels;
    let launches = owned.launches;
    let content = &request.vessel_id;
    let request_id = &request.request_id;
    let target = layout
        .vessels
        .iter()
        .find(|item| &item.id == content)
        .ok_or_else(|| rejected("Terminal content not found".into()))?;
    if !voyager_contract::launch::is_terminal_backed(&target.type_id) {
        return Err(rejected("Content is not a terminal".into()));
    }
    if let Some(operation) = &target.start_pending {
        return Err(Error::Uncertain(format!(
            "Terminal start {operation} is unconfirmed. Inspect Core terminals with voyager-operation={operation}; no start was repeated"
        )));
    }
    let cwd = target.cwd.clone();
    let launch = target.launch.clone().unwrap_or_default();
    let accepted = created_vessels
        .iter()
        .find(|pending| &pending.id == content);
    let new_shell = target.shell_intent.is_some() && accepted.is_some();
    let voyager = crate::workspace::is_voyager(target);
    let argv = if voyager {
        crate::focus_hook::session(target)
            .ok_or_else(|| "Voyager's saved launch lost its session".to_owned())
            .and_then(|session| crate::voyager_start::command(launches, session, new_shell, &cwd))
    } else {
        crate::launch::terminal_command(&launch, &cwd)
    };
    if accepted.is_some_and(|pending| !pending.matches(target)) {
        return Err(rejected(
            "The creation launch changed; no program was started".into(),
        ));
    }
    if new_shell {
        let backend = target
            .backend
            .as_ref()
            .ok_or_else(|| rejected("New shell intent lost its original binding".into()))?;
        if !voyager {
            require_finished(&core.terminal_get(&backend.0)?, backend)?;
        }
    }
    if target.backend.is_none()
        && (target.shell_intent.is_some()
            || !matches!(launch, voyager_contract::launch::Launch::Terminal))
        && accepted.is_none()
    {
        return Err(rejected(
            "This saved worker has no new-creation permission; no command was restarted".into(),
        ));
    }
    let mut created = false;
    let terminal = if let Some(address) = &target.backend
        && !new_shell
    {
        core.terminal_get(&address.0)?
    } else {
        let operation = format!("voyager-start-{request_id}");
        let mut pending = (**layout).clone();
        let item = pending
            .vessels
            .iter_mut()
            .find(|item| &item.id == content)
            .ok_or_else(|| rejected("Terminal content disappeared".into()))?;
        item.start_pending = Some(operation.clone());
        match save(core, &pending, *version) {
            Ok(saved) => {
                *layout = Arc::new(pending);
                *version = saved;
            }
            Err(error) => {
                *fresh = false;
                return Err(match error {
                    Error::Rejected { kind, message } => Error::Rejected {
                        kind,
                        message: format!(
                            "Terminal start marker was refused: {message}; no start was issued"
                        ),
                    },
                    Error::Uncertain(message) => Error::Uncertain(format!(
                        "Terminal start marker was not confirmed: {message}; no start was issued"
                    )),
                });
            }
        }
        let run = argv.map_err(rejected).and_then(|argv| {
            let params = run_params(argv, &cwd, &operation, crate::launch::path_with_command());
            match core.terminal_run_with(params) {
                Err(Error::Uncertain(message)) => settle_run(core, &operation, message),
                run => run,
            }
        });
        if !matches!(run, Err(Error::Rejected { .. })) {
            created_vessels.retain(|item| &item.id != content);
        }
        let started = match run {
            Ok(result) => result,
            Err(Error::Uncertain(message)) => {
                let message = format!(
                    "Terminal start {operation} is unconfirmed: {message}. Inspect Core terminals with voyager-operation={operation}; no start was repeated"
                );
                unconfirmed.insert(content.0.clone(), message.clone());
                return Err(Error::Uncertain(message));
            }
            Err(error) => {
                let mut cleared = (**layout).clone();
                if let Some(item) = cleared.vessels.iter_mut().find(|item| &item.id == content) {
                    item.start_pending = None;
                }
                match save(core, &cleared, *version) {
                    Ok(saved) => {
                        *layout = Arc::new(cleared);
                        *version = saved;
                    }
                    Err(cleanup) => {
                        *fresh = false;
                        return Err(Error::Uncertain(format!(
                            "Terminal start was refused but marker cleanup is unconfirmed: {cleanup:?}"
                        )));
                    }
                }
                return Err(error);
            }
        };
        let address = started.address.clone();
        if started.lifecycle().is_unknown() || started.start_unconfirmed() {
            let message = format!(
                "Terminal {address} for {operation} has an unconfirmed start; inspect it in Core. No start was repeated"
            );
            unconfirmed.insert(content.0.clone(), message.clone());
            return Err(Error::Uncertain(message));
        }
        let mut candidate = (**layout).clone();
        let item = candidate
            .vessels
            .iter_mut()
            .find(|item| &item.id == content)
            .ok_or_else(|| Error::Uncertain("Terminal content disappeared after start".into()))?;
        item.backend = Some(CoreTerminalId(address.clone()));
        item.start_pending = None;
        item.shell_intent = None;
        match save(core, &candidate, *version) {
            Ok(saved) => {
                *layout = Arc::new(candidate);
                *version = saved;
                created = true;
            }
            Err(error) => {
                *fresh = false;
                let message = format!(
                    "Terminal {address} started but workspace save failed: {error:?}; no start was repeated"
                );
                unconfirmed.insert(content.0.clone(), message.clone());
                return Err(Error::Uncertain(message));
            }
        }
        started
    };
    Ok((terminal, created))
}

pub(super) fn attach_failure(error: Error, created: bool, address: &str) -> Error {
    match (created, error) {
        (true, Error::Rejected { kind, message }) => Error::Rejected {
            kind,
            message: format!(
                "Terminal {address} started and its binding was saved, but viewer attachment was refused: {message}. No start was repeated"
            ),
        },
        (true, Error::Uncertain(message)) => Error::Uncertain(format!(
            "Terminal {address} started and its binding was saved, but viewer attachment is unconfirmed: {message}. No start was repeated"
        )),
        (false, error) => error,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::Model;
    use serde_json::json;
    use voyager_contract::{Action, ContentDestination, PlacementInsertion, PlacementOwner, Side};

    #[test]
    fn a_terminal_created_beside_a_placement_starts_in_its_cwd_with_only_path_in_env() {
        let mut model = Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Crew".into(),
                cwd: "/work/crew".into(),
            })
            .unwrap();
        let fleet = &model.layout.voyages[0].fleets[0];
        let owner = PlacementOwner::Fleet {
            id: fleet.id.clone(),
        };
        let beside = fleet.placements[0].id.clone();
        let first = fleet.placements[0].vessel.clone();
        model
            .layout
            .vessels
            .iter_mut()
            .find(|vessel| vessel.id == first)
            .unwrap()
            .cwd = "/work/elsewhere".into();
        model
            .apply_from(
                Some(&VesselId("content-9".into())),
                voyager_contract::caller::Caller::Agent,
                Action::CreateVessel {
                    type_id: "terminal".into(),
                    destination: ContentDestination::Placement {
                        owner,
                        insertion: PlacementInsertion::Beside {
                            id: beside,
                            side: Side::Right,
                        },
                    },
                    launch: None,
                },
            )
            .unwrap();
        let created = model.layout.vessels.last().unwrap();
        assert_eq!(created.cwd, "/work/elsewhere");
        let params = run_params(
            vec!["bash".into()],
            &created.cwd,
            "voyager-start-r1",
            Some("/opt/voyager:/usr/bin".into()),
        );
        let sent = serde_json::to_value(&params).unwrap();
        assert_eq!(sent["cwd"], "/work/elsewhere");
        assert_eq!(sent["env"], json!({"PATH": "/opt/voyager:/usr/bin"}));
        assert_eq!(
            sent["labels"],
            json!({"voyager-operation": "voyager-start-r1"})
        );
        let bare = serde_json::to_value(run_params(vec![], "/w", "o", None)).unwrap();
        assert!(bare["env"].as_object().is_none_or(|env| env.is_empty()));
    }
}
