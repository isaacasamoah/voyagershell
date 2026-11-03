use std::sync::Arc;
use voyager_contract::{
    Action, ContentDestination, Context, Fleet, Layout, PanelInsertion, PanelOwner, RenameTarget,
    Split, Voyage,
};

pub(crate) fn project(layout: &Arc<Layout>, scope: Option<&Context>) -> Arc<Layout> {
    let Some(scope) = scope.filter(|scope| **scope != Context::Workspace) else {
        return Arc::clone(layout);
    };
    let mut scoped = Layout {
        context: scope.clone(),
        canvas: layout.canvas.clone(),
        next_id: layout.next_id,
        view: layout.view.clone(),
        ..Layout::default()
    };
    for voyage in layout.containers() {
        if matches!(scope, Context::Voyage { id } if id == &voyage.id) {
            if layout
                .home
                .as_ref()
                .is_some_and(|home| home.id == voyage.id)
            {
                scoped.home = Some(voyage.clone());
            } else {
                scoped.voyages.push(voyage.clone());
            }
            break;
        }
        let mut selected = Voyage {
            id: voyage.id.clone(),
            name: voyage.name.clone(),
            fleets: Vec::new(),
            portals: Vec::new(),
            portal_layout: None,
            cwd: None,
        };
        for fleet in &voyage.fleets {
            if matches!(scope, Context::Fleet { id } if id == &fleet.id) {
                selected.fleets.push(fleet.clone());
            }
            if let Context::Vessel { id } = scope
                && let Some(vessel) = fleet.vessels.iter().find(|vessel| &vessel.id == id)
            {
                selected.fleets.push(Fleet {
                    id: fleet.id.clone(),
                    name: fleet.name.clone(),
                    vessels: vec![vessel.clone()],
                    maximized_placement: fleet
                        .maximized_placement
                        .as_ref()
                        .filter(|selected| *selected == id)
                        .cloned(),
                    root: crate::panels::contains(&fleet.root, id).then(|| Split::Leaf {
                        placement: id.clone(),
                    }),
                });
            }
        }
        if let Context::Portal { id } = scope
            && let Some(portal) = voyage.portals.iter().find(|portal| &portal.id == id)
        {
            selected.portals.push(portal.clone());
        }
        if !selected.fleets.is_empty() || !selected.portals.is_empty() {
            if layout
                .home
                .as_ref()
                .is_some_and(|home| home.id == selected.id)
            {
                scoped.home = Some(selected);
            } else {
                scoped.voyages.push(selected);
            }
            break;
        }
    }
    scoped.contents = layout
        .contents
        .iter()
        .filter(|content| {
            scoped.containers().any(|voyage| {
                voyage
                    .fleets
                    .iter()
                    .flat_map(|fleet| &fleet.vessels)
                    .chain(&voyage.portals)
                    .any(|vessel| vessel.content == content.id)
            })
        })
        .cloned()
        .collect();
    if matches!(scope, Context::Voyage { .. } | Context::Fleet { .. }) {
        scoped.saved_layouts = layout
            .saved_layouts
            .iter()
            .filter(|saved| match &saved.owner {
                PanelOwner::Fleet { id } => scoped
                    .containers()
                    .any(|voyage| voyage.fleets.iter().any(|fleet| &fleet.id == id)),
                PanelOwner::Portals { voyage: id } => {
                    matches!(scope, Context::Voyage { id: visible } if visible == id)
                }
            })
            .cloned()
            .collect();
    }
    scoped.selected_voyage = layout
        .selected_voyage
        .as_ref()
        .filter(|id| scoped.voyages.iter().any(|voyage| &voyage.id == *id))
        .cloned();
    scoped.selected_fleet = layout
        .selected_fleet
        .as_ref()
        .filter(|id| {
            scoped
                .containers()
                .flat_map(|voyage| &voyage.fleets)
                .any(|fleet| &fleet.id == *id)
        })
        .cloned();
    Arc::new(scoped)
}

pub(crate) fn check(
    layout: &Arc<Layout>,
    scope: Option<&Context>,
    action: &Action,
) -> Result<(), String> {
    let Some(scope) = scope.filter(|scope| **scope != Context::Workspace) else {
        return Ok(());
    };
    let scoped = project(layout, Some(scope));
    if scoped.containers().next().is_none() {
        return Err("The request's captured focus no longer exists".into());
    }
    let fleet = |id: &voyager_contract::FleetId| {
        scoped
            .containers()
            .flat_map(|voyage| &voyage.fleets)
            .find(|fleet| &fleet.id == id)
    };
    let allowed = match action {
        Action::Inspect | Action::Dock { .. } | Action::Home => true,
        Action::SavePanelLayout { owner, .. }
        | Action::LoadPanelLayout { owner, .. }
        | Action::RemovePanelLayout { owner, .. }
        | Action::ResizePanelSplit { owner, .. } => match owner {
            PanelOwner::Fleet { id } => {
                matches!(scope, Context::Voyage { .. } | Context::Fleet { .. })
                    && fleet(id).is_some()
            }
            PanelOwner::Portals { voyage } => {
                matches!(scope, Context::Voyage { id } if id == voyage)
            }
        },
        Action::SetPortalPresentation { voyage, .. } => {
            matches!(scope, Context::Voyage { id } if id == voyage)
        }
        Action::CreateVoyage { .. } => false,
        Action::UpdateCanvas { .. } | Action::SetSidebar { .. } => false,
        Action::RemoveContentPackage { .. } | Action::RestoreContentPackage { .. } => false,
        Action::StartNewShell { content_id, .. } => {
            scoped.contents.iter().any(|item| &item.id == content_id)
        }
        Action::MoveVoyage { .. } => false,
        Action::MoveFleet { id, target, .. } => {
            matches!(scope, Context::Voyage { .. })
                && fleet(id).is_some()
                && fleet(target).is_some()
        }
        Action::MovePanel { id, target, .. } => scoped.containers().any(|voyage| {
            voyage
                .fleets
                .iter()
                .map(|fleet| fleet.vessels.as_slice())
                .chain(std::iter::once(voyage.portals.as_slice()))
                .any(|members| {
                    members.iter().any(|panel| &panel.id == id)
                        && members.iter().any(|panel| &panel.id == target)
                })
        }),
        Action::CreateFleet { voyage, .. } | Action::SelectVoyage { id: voyage } => {
            matches!(scope, Context::Voyage { id } if id == voyage)
        }
        Action::CreateContent {
            destination: ContentDestination::Panel { owner, insertion },
            ..
        } => {
            let members = scoped.containers().find_map(|voyage| match owner {
                PanelOwner::Fleet { id } => voyage
                    .fleets
                    .iter()
                    .find(|fleet| &fleet.id == id)
                    .map(|fleet| fleet.vessels.as_slice()),
                PanelOwner::Portals { voyage: id } if &voyage.id == id => {
                    Some(voyage.portals.as_slice())
                }
                _ => None,
            });
            members.is_some_and(|members| match insertion {
                PanelInsertion::Beside { id, .. } => members.iter().any(|panel| &panel.id == id),
                PanelInsertion::Empty => match owner {
                    PanelOwner::Fleet { .. } => {
                        matches!(scope, Context::Voyage { .. } | Context::Fleet { .. })
                    }
                    PanelOwner::Portals { voyage } => {
                        matches!(scope, Context::Voyage { id } if id == voyage)
                    }
                },
            })
        }
        Action::Rename { target, .. } => match target {
            RenameTarget::Voyage { id } => {
                matches!(scope, Context::Voyage { id: visible } if visible == id)
            }
            RenameTarget::Fleet { id } => {
                matches!(scope, Context::Voyage { .. } | Context::Fleet { .. })
                    && fleet(id).is_some()
            }
            RenameTarget::Vessel { id } => scoped
                .containers()
                .flat_map(|voyage| &voyage.fleets)
                .flat_map(|fleet| &fleet.vessels)
                .any(|vessel| &vessel.id == id),
            RenameTarget::Portal { id } => scoped
                .containers()
                .flat_map(|voyage| &voyage.portals)
                .any(|portal| &portal.id == id),
        },
        Action::RevealPanel { id }
        | Action::SetPanelMaximized { id, .. }
        | Action::SetPanelHidden { id, .. }
        | Action::RemovePanel { id } => scoped.containers().any(|voyage| {
            voyage
                .fleets
                .iter()
                .flat_map(|fleet| &fleet.vessels)
                .chain(&voyage.portals)
                .any(|panel| &panel.id == id)
        }),
        Action::SelectFleet { id } => fleet(id).is_some(),
    };
    if allowed {
        Ok(())
    } else {
        Err("That target is outside this request's captured avatar focus. Ask the human before changing focus.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::Model;

    #[test]
    fn shared_panels_home_names_and_scopes_are_owned_not_rendered() {
        let mut model = Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Work".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        let ordinary = model.layout.voyages[0].id.clone();
        let home = model.layout.home.as_ref().unwrap();
        let owner = PanelOwner::Fleet {
            id: home.fleets[0].id.clone(),
        };
        model
            .apply(Action::CreateContent {
                type_id: "notes".into(),
                destination: ContentDestination::Panel {
                    owner,
                    insertion: PanelInsertion::Empty,
                },
                launch: None,
            })
            .unwrap();
        let panel = model.layout.home.as_ref().unwrap().fleets[0].vessels[0].clone();
        model
            .apply(Action::Dock {
                context: Context::Vessel {
                    id: panel.id.clone(),
                },
            })
            .unwrap();
        assert_eq!(
            crate::conversation::focus(&model.layout, 1).unwrap().path,
            ["Home", "Notes 1"]
        );
        let snapshot = Arc::new(model.layout.clone());
        let normal = project(
            &snapshot,
            Some(&Context::Voyage {
                id: ordinary.clone(),
            }),
        );
        assert!(normal.home.is_none());
        assert!(
            !normal
                .contents
                .iter()
                .any(|content| content.id == panel.content)
        );
        let narrow = project(
            &snapshot,
            Some(&Context::Vessel {
                id: panel.id.clone(),
            }),
        );
        assert!(narrow.voyages.is_empty());
        assert_eq!(narrow.contents.len(), 1);
        assert_eq!(
            narrow.home.as_ref().unwrap().fleets[0].vessels.as_slice(),
            std::slice::from_ref(&panel)
        );
        assert!(
            check(
                &snapshot,
                Some(&Context::Voyage { id: ordinary }),
                &Action::RemovePanel {
                    id: panel.id.clone()
                }
            )
            .is_err()
        );
        model
            .apply(Action::RemovePanel {
                id: panel.id.clone(),
            })
            .unwrap();
        let removed = project(
            &Arc::new(model.layout),
            Some(&Context::Vessel { id: panel.id }),
        );
        assert!(removed.home.as_ref().unwrap().fleets[0].root.is_none());
    }
}
