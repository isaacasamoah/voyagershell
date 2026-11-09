use std::sync::Arc;

use crate::{core_shapes::Terminal, scope};
use voyager_contract::{
    Content, Context, DirectorySource, Layout, NameOrigin, PlacementId, Vessel, WorkspaceView,
    context::{Branch, Directory as ContextDirectory, Facts},
    observation::{Directory, PanelObservation, WorkspaceObservation},
};

pub(crate) fn effective_name(
    placement: &Vessel,
    content: &Content,
    directory: &Directory,
) -> String {
    if placement.name_origin == NameOrigin::Deliberate || content.type_id != "terminal" {
        return placement.name.clone();
    }
    match directory {
        Directory::Live { path } | Directory::Starting { path } | Directory::Voyage { path } => {
            std::path::Path::new(path)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("/")
                .to_owned()
        }
        Directory::Unavailable => "Folder unavailable".into(),
    }
}

pub(crate) fn agent_name(directory: &Directory) -> Option<String> {
    let Directory::Live { path } = directory else {
        return None;
    };
    Some(
        std::path::Path::new(path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("/")
            .to_owned(),
    )
}

pub(crate) fn directory(content: &Content, terminal: Option<&Terminal>) -> Directory {
    if content.type_id == "terminal" && content.backend.is_some() {
        terminal
            .and_then(|terminal| terminal.foreground.as_ref())
            .filter(|process| !process.cwd.is_empty())
            .map_or(Directory::Unavailable, |process| Directory::Live {
                path: process.cwd.clone(),
            })
    } else {
        Directory::Starting {
            path: content.cwd.clone(),
        }
    }
}

pub(crate) fn validate_source(
    layout: &Arc<Layout>,
    version: u64,
    source: &DirectorySource,
    terminals: Option<&[Terminal]>,
) -> Result<(), String> {
    let active = match source {
        DirectorySource::Live { placement_id, .. }
        | DirectorySource::Starting { placement_id, .. } => Some(placement_id.clone()),
        DirectorySource::Voyage { .. } => None,
    };
    let facts = capture(
        layout,
        version,
        &Context::Workspace,
        active.clone(),
        terminals,
    )?;
    let valid = match source {
        DirectorySource::Live {
            placement_id,
            content_id,
            backend,
            cwd,
        } => facts.panels.iter().any(|panel| {
            &panel.placement_id == placement_id
                && &panel.content_id == content_id
                && panel.backend.as_ref() == Some(backend)
                && matches!(&panel.directory, Directory::Live { path } if path == cwd)
        }),
        DirectorySource::Starting {
            placement_id,
            content_id,
            cwd,
        } => facts.panels.iter().any(|panel| {
            &panel.placement_id == placement_id
                && &panel.content_id == content_id
                && matches!(&panel.directory, Directory::Starting { path } if path == cwd)
        }),
        DirectorySource::Voyage { voyage_id, cwd } => {
            let selected = match &layout.view {
                WorkspaceView::Home => layout.home.as_ref(),
                WorkspaceView::Fleet => layout
                    .voyages
                    .iter()
                    .find(|voyage| Some(&voyage.id) == layout.selected_voyage.as_ref()),
            };
            selected
                .is_some_and(|voyage| &voyage.id == voyage_id && voyage.cwd.as_ref() == Some(cwd))
        }
    };
    if valid {
        Ok(())
    } else {
        Err("Working directory changed or is unavailable; reopen the choice".into())
    }
}

pub(crate) fn capture(
    layout: &Arc<Layout>,
    version: u64,
    scope: &Context,
    active: Option<PlacementId>,
    terminals: Option<&[Terminal]>,
) -> Result<WorkspaceObservation, String> {
    let visible = scope::project(layout, Some(scope));
    let panels = visible
        .containers()
        .flat_map(|voyage| {
            voyage
                .fleets
                .iter()
                .flat_map(|fleet| &fleet.vessels)
                .chain(&voyage.portals)
        })
        .filter_map(|placement| {
            let content = visible
                .contents
                .iter()
                .find(|item| item.id == placement.content)?;
            let terminal = content.backend.as_ref().and_then(|backend| {
                terminals?
                    .iter()
                    .find(|terminal| terminal.address == backend.0)
            });
            let foreground = terminal.and_then(|terminal| terminal.foreground.as_ref());
            let directory = directory(content, terminal);
            let name = effective_name(placement, content, &directory);
            Some(PanelObservation {
                placement_id: placement.id.clone(),
                content_id: content.id.clone(),
                backend: content.backend.clone(),
                directory,
                program: foreground.map(|process| process.name.clone()),
                conversation_name: None,
                effective_name: name,
            })
        })
        .collect::<Vec<_>>();
    if let Some(id) = &active {
        let selected = match &layout.view {
            WorkspaceView::Home => layout.home.as_ref(),
            WorkspaceView::Fleet => layout
                .voyages
                .iter()
                .find(|voyage| Some(&voyage.id) == layout.selected_voyage.as_ref()),
        };
        let found = selected.is_some_and(|voyage| {
            voyage.fleets.iter().any(|fleet| {
                (matches!(layout.view, WorkspaceView::Home)
                    || Some(&fleet.id) == layout.selected_fleet.as_ref())
                    && crate::panels::contains(
                        &crate::panels::visible(&fleet.root, &fleet.vessels),
                        id,
                    )
                    && fleet
                        .maximized_placement
                        .as_ref()
                        .is_none_or(|selected| selected == id)
            }) || voyage.portal_layout.as_ref().is_some_and(|column| {
                column.visible
                    && crate::panels::contains(
                        &crate::panels::visible(&column.root, &voyage.portals),
                        id,
                    )
                    && column
                        .maximized_placement
                        .as_ref()
                        .is_none_or(|selected| selected == id)
            })
        });
        if !found || !panels.iter().any(|panel| &panel.placement_id == id) {
            return Err("Active placement is not visible in the selected workspace".into());
        }
    }
    let ended = active
        .as_ref()
        .and_then(|id| panels.iter().find(|panel| &panel.placement_id == id))
        .and_then(|panel| panel.backend.as_ref())
        .and_then(|backend| {
            terminals?
                .iter()
                .find(|terminal| terminal.address == backend.0)
        })
        .is_some_and(|terminal| {
            terminal.state == "finished" && terminal.reason.as_deref() != Some("spawn_pending")
        });
    let directory = active
        .as_ref()
        .and_then(|id| panels.iter().find(|panel| &panel.placement_id == id))
        .and_then(|panel| (!ended).then(|| panel.directory.clone()))
        .or_else(|| {
            let voyage = match &visible.view {
                WorkspaceView::Home => visible.home.as_ref(),
                WorkspaceView::Fleet => visible
                    .voyages
                    .iter()
                    .find(|voyage| Some(&voyage.id) == visible.selected_voyage.as_ref()),
            }?;
            voyage
                .cwd
                .as_ref()
                .map(|path| Directory::Voyage { path: path.clone() })
        })
        .unwrap_or(Directory::Unavailable);
    Ok(WorkspaceObservation {
        version,
        active,
        directory,
        panels,
        branch: Branch::Unavailable,
    })
}

pub fn resolve(mut observation: WorkspaceObservation) -> WorkspaceObservation {
    let path = match &observation.directory {
        Directory::Live { path } | Directory::Voyage { path } | Directory::Starting { path } => {
            Some(path.clone())
        }
        Directory::Unavailable => None,
    };
    if let Some(path) = path {
        observation.branch = crate::context::resolve(Facts {
            version: observation.version,
            scope: Context::Workspace,
            path: Vec::new(),
            directory: ContextDirectory::Known { path },
            branch: Branch::Unavailable,
        })
        .branch;
    }
    observation
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::Model;
    use voyager_contract::{Action, CoreTerminalId};

    #[test]
    fn bound_terminal_without_live_observation_never_reports_starting_cwd_as_live() {
        let mut model = Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Project".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        let placement = model.layout.voyages[0].fleets[0].vessels[0].id.clone();
        let content_id = model.layout.voyages[0].fleets[0].vessels[0].content.clone();
        model
            .layout
            .contents
            .iter_mut()
            .find(|content| content.id == content_id)
            .unwrap()
            .backend = Some(CoreTerminalId("t1".into()));
        let layout = Arc::new(model.layout);
        let observed = capture(
            &layout,
            7,
            &Context::Workspace,
            Some(placement.clone()),
            None,
        )
        .unwrap();
        let panel = observed
            .panels
            .iter()
            .find(|panel| panel.placement_id == placement)
            .unwrap();
        assert_eq!(panel.directory, Directory::Unavailable);
        assert_eq!(panel.backend, Some(CoreTerminalId("t1".into())));
        assert_eq!(observed.branch, Branch::Unavailable);
        let terminal: Terminal = serde_json::from_value(serde_json::json!({
            "address": "t1", "labels": {}, "argv": ["bash"], "cwd": "/tmp/old", "state": "finished", "pid": 123,
            "created_ms": 1, "screen": "", "cols": 80, "rows": 24
        })).unwrap();
        let ended = capture(
            &layout,
            7,
            &Context::Workspace,
            Some(placement.clone()),
            Some(&[terminal]),
        )
        .unwrap();
        assert_eq!(
            ended.directory,
            Directory::Voyage {
                path: "/tmp".into()
            }
        );
        assert_eq!(
            ended
                .panels
                .iter()
                .find(|panel| panel.placement_id == placement)
                .unwrap()
                .directory,
            Directory::Unavailable
        );
        assert!(
            capture(
                &layout,
                7,
                &Context::Workspace,
                Some(PlacementId("missing".into())),
                None
            )
            .is_err()
        );
    }

    #[test]
    fn selected_voyage_directory_is_bound_to_its_identity() {
        let mut model = Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Project".into(),
                cwd: "/tmp/project".into(),
            })
            .unwrap();
        let voyage = model.layout.voyages[0].id.clone();
        let layout = Arc::new(model.layout);
        let source = DirectorySource::Voyage {
            voyage_id: voyage,
            cwd: "/tmp/project".into(),
        };
        assert!(validate_source(&layout, 7, &source, None).is_ok());
        let stale = DirectorySource::Voyage {
            voyage_id: voyager_contract::VoyageId("wrong".into()),
            cwd: "/tmp/project".into(),
        };
        assert!(validate_source(&layout, 7, &stale, None).is_err());
        let mut candidate = Model {
            layout: (*layout).clone(),
        };
        candidate
            .apply(Action::CreateVoyageFromSource { source })
            .unwrap();
        let selected = candidate.layout.voyages.last().unwrap();
        assert_eq!(selected.name, "project");
        assert_eq!(selected.cwd.as_deref(), Some("/tmp/project"));
        assert_eq!(
            candidate.layout.selected_voyage.as_ref(),
            Some(&selected.id)
        );
        assert_eq!(
            candidate.layout.selected_fleet.as_ref(),
            Some(&selected.fleets[0].id)
        );
    }

    #[test]
    fn chosen_fleet_creates_only_the_selected_content_in_the_captured_directory() {
        let mut model = Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Project".into(),
                cwd: "/tmp/project".into(),
            })
            .unwrap();
        let voyage = model.layout.voyages[0].id.clone();
        let source = DirectorySource::Voyage {
            voyage_id: voyage.clone(),
            cwd: "/tmp/project".into(),
        };
        let before = model.layout.contents.len();
        model
            .apply(Action::CreateFleetWithContent {
                voyage: voyage.clone(),
                name: "Fleet 2".into(),
                source: source.clone(),
                type_id: "notes".into(),
                launch: None,
            })
            .unwrap();
        let fleet = model.layout.voyages[0].fleets.last().unwrap();
        assert_eq!(model.layout.selected_fleet.as_ref(), Some(&fleet.id));
        assert_eq!(model.layout.contents.len(), before + 1);
        let content = model
            .layout
            .contents
            .iter()
            .find(|content| content.id == fleet.vessels[0].content)
            .unwrap();
        assert_eq!(content.type_id, "notes");
        assert_eq!(content.cwd, "/tmp/project");
        assert!(content.backend.is_none());
        let saved = model.layout.clone();
        assert!(
            model
                .apply(Action::CreateFleetWithContent {
                    voyage: voyager_contract::VoyageId("wrong".into()),
                    name: "Fleet".into(),
                    source,
                    type_id: "terminal".into(),
                    launch: None
                })
                .is_err()
        );
        assert_eq!(model.layout, saved);
    }

    #[test]
    fn legacy_and_explicit_names_survive_while_automatic_names_follow_directory() {
        let legacy: Vessel = serde_json::from_value(
            serde_json::json!({"id":"p", "content":"c", "name":"Terminal 1"}),
        )
        .unwrap();
        assert_eq!(legacy.name_origin, NameOrigin::Deliberate);
        assert_eq!(
            agent_name(&Directory::Live {
                path: "/tmp/project".into()
            })
            .as_deref(),
            Some("project")
        );
        assert_eq!(agent_name(&Directory::Unavailable), None);
        assert_eq!(
            agent_name(&Directory::Starting {
                path: "/tmp/project".into()
            }),
            None
        );
        let mut model = Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Project".into(),
                cwd: "/tmp/project".into(),
            })
            .unwrap();
        let panel = &model.layout.voyages[0].fleets[0].vessels[0];
        let id = panel.id.clone();
        let content = model
            .layout
            .contents
            .iter()
            .find(|content| content.id == panel.content)
            .unwrap();
        let dir = Directory::Live {
            path: "/tmp/changed".into(),
        };
        assert_eq!(effective_name(panel, content, &dir), "changed");
        model
            .apply(Action::Rename {
                target: voyager_contract::RenameTarget::Vessel { id },
                name: "My task".into(),
            })
            .unwrap();
        let panel = &model.layout.voyages[0].fleets[0].vessels[0];
        let content = model
            .layout
            .contents
            .iter()
            .find(|content| content.id == panel.content)
            .unwrap();
        assert_eq!(panel.name_origin, NameOrigin::Deliberate);
        assert_eq!(effective_name(panel, content, &dir), "My task");
    }

    #[test]
    fn closed_containers_reopen_the_same_content_without_changing_context() {
        let mut model = Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Project".into(),
                cwd: "/tmp/project".into(),
            })
            .unwrap();
        let voyage = model.layout.voyages[0].id.clone();
        let fleet = model.layout.voyages[0].fleets[0].id.clone();
        let panel = model.layout.voyages[0].fleets[0].vessels[0].clone();
        model
            .layout
            .contents
            .iter_mut()
            .find(|content| content.id == panel.content)
            .unwrap()
            .backend = Some(CoreTerminalId("t1".into()));
        model
            .apply(Action::Dock {
                context: Context::Vessel {
                    id: panel.id.clone(),
                },
            })
            .unwrap();
        let context = model.layout.context.clone();
        model
            .apply(Action::CloseFleet { id: fleet.clone() })
            .unwrap();
        assert_eq!(model.layout.selected_fleet, None);
        assert_eq!(model.layout.context, context);
        assert!(model.layout.voyages[0].fleets[0].closed);
        model
            .apply(Action::ReopenFleet { id: fleet.clone() })
            .unwrap();
        model
            .apply(Action::CloseVoyage { id: voyage.clone() })
            .unwrap();
        assert_eq!(model.layout.view, WorkspaceView::Home);
        assert_eq!(model.layout.voyages[0].closed_order, 1);
        assert_eq!(model.layout.context, context);
        model
            .apply(Action::ReopenVoyage { id: voyage.clone() })
            .unwrap();
        model
            .apply(Action::CloseVoyage { id: voyage.clone() })
            .unwrap();
        assert_eq!(model.layout.voyages[0].closed_order, 2);
        model.apply(Action::ReopenVoyage { id: voyage }).unwrap();
        assert_eq!(model.layout.selected_fleet.as_ref(), Some(&fleet));
        assert_eq!(model.layout.voyages[0].fleets[0].vessels[0].id, panel.id);
        assert_eq!(
            model
                .layout
                .contents
                .iter()
                .find(|content| content.id == panel.content)
                .unwrap()
                .backend,
            Some(CoreTerminalId("t1".into()))
        );
    }
}
