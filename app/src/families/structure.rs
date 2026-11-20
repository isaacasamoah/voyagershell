use crate::{core::Error, core_shapes::Terminal, observation, panels, scope, workspace::Model};
use std::{collections::HashMap, sync::Arc};
use voyager_contract::{
    Action, Context, CoreTerminalId, DirectorySource, Layout, PlacementId, Request, VesselId,
    VoyageId, WorkspaceView,
};

pub(crate) trait Calls {
    fn closing(&self, candidate: &Layout) -> Result<(), Error>;
    fn reopening(
        &mut self,
        candidate: &mut Layout,
        voyage: &VoyageId,
    ) -> Result<Vec<VesselId>, Error>;
    fn finished(&mut self, backend: &CoreTerminalId) -> Result<(), Error>;
    fn terminal(&mut self, backend: &CoreTerminalId) -> Result<Terminal, Error>;
    fn created(&mut self, before: &Layout, candidate: &mut Layout) -> Result<bool, Error>;
}

pub(crate) enum Route<'a> {
    Close(&'a VoyageId),
    CancelClose { id: &'a VoyageId, plan: &'a str },
    ConfirmClose { id: &'a VoyageId, plan: &'a str },
    Package { type_id: &'a str },
    Edit,
}

pub(crate) struct Edit {
    pub(crate) candidate: Layout,
    pub(crate) reopening: Vec<VesselId>,
    pub(crate) created_notes: bool,
}

pub(crate) fn route<'a>(
    fresh: bool,
    current: impl FnOnce() -> bool,
    layout: &Arc<Layout>,
    scope: Option<&Context>,
    action: &'a Action,
) -> Result<Route<'a>, Error> {
    let cancelling = matches!(action, Action::CancelVoyageClose { .. });
    if !fresh && !cancelling {
        return Err(refused("Inspect the workspace before making a change"));
    }
    if !action.is_navigation() && !cancelling && !current() {
        return Err(refused(
            "Layout changed; inspect it before making a new request",
        ));
    }
    scope::check(layout, scope, action).map_err(refused)?;
    Ok(match action {
        Action::CloseVoyage { id } => Route::Close(id),
        Action::CancelVoyageClose { id, plan } => {
            native(
                scope,
                "Only the native user can cancel a Voyage confirmation",
            )?;
            Route::CancelClose { id, plan }
        }
        Action::ConfirmVoyageClose { id, plan } => {
            native(
                scope,
                "Human confirmation is required; agents cannot confirm Voyage shutdown",
            )?;
            Route::ConfirmClose { id, plan }
        }
        Action::RemoveVesselPackage { type_id } | Action::RestoreVesselPackage { type_id } => {
            Route::Package { type_id }
        }
        _ => Route::Edit,
    })
}

pub(crate) fn check_package(
    layout: &Arc<Layout>,
    scope: Option<&Context>,
    action: &Action,
    changed: bool,
    (type_id, notes_type): (&str, &str),
    closing: impl Fn(&VesselId) -> bool,
) -> Result<(), Error> {
    if changed {
        return Err(refused(
            "Workspace changed; inspect before changing a Vessel package",
        ));
    }
    scope::check(layout, scope, action).map_err(refused)?;
    if type_id == notes_type
        && layout
            .vessels
            .iter()
            .any(|item| item.type_id == type_id && closing(&item.id))
    {
        return Err(refused(
            "Notes must remain available while their Voyage closes",
        ));
    }
    Ok(())
}

pub(crate) fn source(action: &Action) -> Option<&DirectorySource> {
    match action {
        Action::CreateVoyageFromSource { source }
        | Action::CreateFleetWithVessel { source, .. } => Some(source),
        _ => None,
    }
}

pub(crate) fn check_source(
    layout: &Arc<Layout>,
    version: u64,
    source: &DirectorySource,
    listed: Option<Result<Vec<Terminal>, Error>>,
) -> Result<(), Error> {
    let terminals = listed
        .map(|listed| {
            listed.map_err(|error| {
                refused(format!("Live directory observation unavailable: {error:?}"))
            })
        })
        .transpose()?;
    observation::validate_source(layout, version, source, terminals.as_deref()).map_err(refused)
}

pub(crate) fn reloads_viewer(action: &Action) -> bool {
    matches!(
        action,
        Action::StartNewShell { .. } | Action::ReopenPlacement { .. }
    )
}

pub(crate) fn check_viewer(
    changed: bool,
    layout: &Arc<Layout>,
    scope: Option<&Context>,
    action: &Action,
) -> Result<(), Error> {
    if changed {
        return Err(refused(
            "Workspace changed; inspect before changing a terminal viewer",
        ));
    }
    scope::check(layout, scope, action).map_err(refused)
}

pub(crate) fn edit(
    calls: &mut impl Calls,
    layout: &Layout,
    program: Option<&VesselId>,
    request: &Request,
    unconfirmed: &HashMap<String, String>,
) -> Result<Edit, Error> {
    let mut candidate = Model {
        layout: layout.clone(),
    };
    match &request.action {
        Action::StartNewShell {
            vessel_id,
            expected_backend,
        } => candidate.start_new_shell(vessel_id, expected_backend, &request.request_id),
        _ => candidate.apply_from(program, request.action.clone()),
    }
    .map_err(refused)?;
    calls.closing(&candidate.layout)?;
    let reopening = match &request.action {
        Action::ReopenVoyage { id } => calls.reopening(&mut candidate.layout, id)?,
        _ => Vec::new(),
    };
    if let Action::StartNewShell {
        expected_backend, ..
    } = &request.action
    {
        calls.finished(expected_backend)?;
    }
    if let Action::ReopenPlacement { id, .. } = &request.action
        && let Some(backend) = reopen_backend(layout, id, unconfirmed).map_err(refused)?
    {
        let observed = calls.terminal(backend).map_err(|error| {
            refused(format!(
                "Terminal liveness unavailable; no viewer was reopened: {error:?}"
            ))
        })?;
        require_live(&observed, backend)?;
    }
    let created_notes = calls.created(layout, &mut candidate.layout)?;
    Ok(Edit {
        candidate: candidate.layout,
        reopening,
        created_notes,
    })
}

pub(crate) fn first_voyage(layout: Layout, cwd: &str) -> Result<Layout, Error> {
    let mut model = Model { layout };
    model
        .apply(Action::CreateVoyage {
            name: "Voyager".into(),
            cwd: cwd.into(),
        })
        .map_err(refused)?;
    Ok(model.layout)
}

pub(crate) fn visible_content(layout: &Layout, content: &VesselId) -> bool {
    let voyage = if layout.view == WorkspaceView::Home {
        layout.home.as_ref()
    } else {
        layout
            .voyages
            .iter()
            .find(|voyage| Some(&voyage.id) == layout.selected_voyage.as_ref())
    };
    let Some(voyage) = voyage else {
        return false;
    };
    if let Some(column) = &voyage.portal_layout
        && column.visible
    {
        let root = panels::visible(&column.root, &voyage.portals);
        if voyage.portals.iter().any(|panel| {
            &panel.vessel == content
                && panels::contains(&root, &panel.id)
                && column
                    .maximized_placement
                    .as_ref()
                    .is_none_or(|id| id == &panel.id)
        }) {
            return true;
        }
    }
    let fleet = if layout.view == WorkspaceView::Home {
        voyage.fleets.first()
    } else {
        voyage
            .fleets
            .iter()
            .find(|fleet| Some(&fleet.id) == layout.selected_fleet.as_ref())
    };
    fleet.is_some_and(|fleet| {
        let root = panels::visible(&fleet.root, &fleet.placements);
        fleet.placements.iter().any(|panel| {
            &panel.vessel == content
                && panels::contains(&root, &panel.id)
                && fleet
                    .maximized_placement
                    .as_ref()
                    .is_none_or(|id| id == &panel.id)
        })
    })
}

pub(crate) fn reopen_backend<'a>(
    layout: &'a Layout,
    id: &PlacementId,
    unconfirmed: &HashMap<String, String>,
) -> Result<Option<&'a CoreTerminalId>, String> {
    let owner = panels::owner_of(layout, id)?;
    let panel = panels::group(layout, &owner)?
        .members
        .iter()
        .find(|panel| &panel.id == id)
        .ok_or("Panel not found")?;
    let content = layout
        .vessels
        .iter()
        .find(|item| item.id == panel.vessel)
        .ok_or("Panel content not found")?;
    if content.type_id != "terminal" {
        return Ok(None);
    }
    if content.start_pending.is_some()
        || content.shell_intent.is_some()
        || unconfirmed.contains_key(&content.id.0)
    {
        return Err("Terminal binding is unconfirmed; no viewer was reopened".into());
    }
    content
        .backend
        .as_ref()
        .map(Some)
        .ok_or_else(|| "Terminal has no confirmed backend; no program was started".into())
}

pub(crate) fn require_live(observed: &Terminal, expected: &CoreTerminalId) -> Result<(), Error> {
    if observed.address != expected.0
        || !observed.is_live()
        || observed.pid.is_none_or(|pid| pid == 0)
        || observed.start_unconfirmed()
    {
        return Err(refused(
            "Terminal is not confirmed live; no program was started",
        ));
    }
    Ok(())
}

fn native(scope: Option<&Context>, refusal: &str) -> Result<(), Error> {
    match scope {
        Some(_) => Err(refused(refusal)),
        None => Ok(()),
    }
}

fn refused(message: impl Into<String>) -> Error {
    Error::Rejected {
        kind: "invalid_workspace".into(),
        message: message.into(),
    }
}
