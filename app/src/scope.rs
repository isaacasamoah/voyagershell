use std::sync::Arc;
use voyager_contract::{Action, Context, Fleet, Layout, RenameTarget, Split, Voyage};

pub(crate) fn project(layout: &Arc<Layout>, scope: Option<&Context>) -> Arc<Layout> {
    let Some(scope) = scope.filter(|scope| **scope != Context::Workspace) else {
        return Arc::clone(layout);
    };
    let mut scoped = Layout {
        context: scope.clone(),
        next_id: layout.next_id,
        ..Layout::default()
    };
    for voyage in &layout.voyages {
        if matches!(scope, Context::Voyage { id } if id == &voyage.id) {
            scoped.voyages.push(voyage.clone());
            break;
        }
        let mut selected = Voyage {
            id: voyage.id.clone(),
            name: voyage.name.clone(),
            fleets: Vec::new(),
            portals: Vec::new(),
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
                    root: Split::Leaf {
                        placement: id.clone(),
                    },
                });
            }
        }
        if let Context::Portal { id } = scope
            && let Some(portal) = voyage.portals.iter().find(|portal| &portal.id == id)
        {
            selected.portals.push(portal.clone());
        }
        if !selected.fleets.is_empty() || !selected.portals.is_empty() {
            scoped.voyages.push(selected);
            break;
        }
    }
    scoped.contents = layout
        .contents
        .iter()
        .filter(|content| {
            scoped.voyages.iter().any(|voyage| {
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
                .voyages
                .iter()
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
    if scoped.voyages.is_empty() {
        return Err("The request's captured focus no longer exists".into());
    }
    let fleet = |id: &voyager_contract::FleetId| {
        scoped
            .voyages
            .iter()
            .flat_map(|voyage| &voyage.fleets)
            .find(|fleet| &fleet.id == id)
    };
    let allowed = match action {
        Action::Inspect | Action::Dock { .. } => true,
        Action::CreateVoyage { .. } => false,
        Action::MoveVoyage { .. } => false,
        Action::MoveFleet { id, target, .. } => {
            matches!(scope, Context::Voyage { .. })
                && fleet(id).is_some()
                && fleet(target).is_some()
        }
        Action::MoveVessel { id, target, .. } => scoped
            .voyages
            .iter()
            .flat_map(|voyage| &voyage.fleets)
            .any(|fleet| {
                fleet.vessels.iter().any(|item| &item.id == id)
                    && fleet.vessels.iter().any(|item| &item.id == target)
            }),
        Action::CreateFleet { voyage, .. } | Action::SelectVoyage { id: voyage } => {
            matches!(scope, Context::Voyage { id } if id == voyage)
        }
        Action::CreatePortal { voyage } => {
            matches!(scope, Context::Voyage { id } if id == voyage)
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
                .voyages
                .iter()
                .flat_map(|voyage| &voyage.fleets)
                .flat_map(|fleet| &fleet.vessels)
                .any(|vessel| &vessel.id == id),
            RenameTarget::Portal { id } => scoped
                .voyages
                .iter()
                .flat_map(|voyage| &voyage.portals)
                .any(|portal| &portal.id == id),
        },
        Action::SelectFleet { id } => fleet(id).is_some(),
        Action::Split {
            fleet: id, after, ..
        } => fleet(id).is_some_and(|fleet| fleet.vessels.iter().any(|vessel| &vessel.id == after)),
    };
    if allowed {
        Ok(())
    } else {
        Err("That target is outside this request's captured avatar focus. Ask the human before changing focus.".into())
    }
}
