use super::{effect, instance, registry::Entry};
use voyager_contract::{
    Context, Layout, VesselId,
    content::{Manifest, Rebase, Request, Response, StateSnapshot, Version},
};

pub(crate) fn placed(
    layout: &std::sync::Arc<Layout>,
    scope: Option<&Context>,
    id: &VesselId,
) -> Result<(), String> {
    let projected = crate::scope::project(layout, scope);
    let visible = projected.vessels.iter().any(|content| content.id == *id)
        && projected.containers().any(|voyage| {
            voyage
                .portals
                .iter()
                .chain(voyage.fleets.iter().flat_map(|fleet| &fleet.placements))
                .any(|placement| placement.vessel == *id)
        });
    visible
        .then_some(())
        .ok_or_else(|| "That Vessel is outside the captured workspace scope".into())
}

fn snapshot(id: &VesselId, stored: &instance::Instance) -> StateSnapshot {
    StateSnapshot {
        vessel_id: id.clone(),
        revision: stored.revision.to_string(),
        state: stored.state.clone(),
    }
}

pub(crate) fn respond(
    root: &std::path::Path,
    limit: usize,
    entry: Entry,
    id: &VesselId,
    request_id: &str,
    request: &Request,
) -> Result<Response, String> {
    if entry.removed {
        return Err("Vessel package is removed".into());
    }
    let manifest = entry.manifest.ok_or_else(|| {
        format!(
            "Vessel type is unavailable: {}",
            entry
                .problems
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join("; ")
        )
    })?;
    let request_id = request_id.to_owned();
    let stored = instance::load(root, &id.0, &manifest, limit)?;
    match request {
        Request::Describe { .. } => Ok(Response::Described {
            version: Version::V1,
            request_id,
            vessel_id: id.clone(),
            schema_declared: true,
            state_schema: Some(manifest.state.schema.clone()),
            configuration: None,
        }),
        Request::Inspect { .. } => Ok(Response::State {
            version: Version::V1,
            request_id,
            vessel_id: id.clone(),
            snapshot: snapshot(id, &stored),
        }),
        Request::Invoke {
            action,
            args,
            expected_revision,
            ..
        } => {
            let snapshot = invoke(
                (root, limit),
                &manifest,
                id,
                stored,
                (action, args, expected_revision),
            )?;
            Ok(Response::Invoked {
                version: Version::V1,
                request_id,
                vessel_id: id.clone(),
                snapshot,
            })
        }
        _ => Err("This Vessel type does not support that operation".into()),
    }
}

fn invoke(
    (root, limit): (&std::path::Path, usize),
    manifest: &Manifest,
    id: &VesselId,
    mut stored: instance::Instance,
    (action, args, expected_revision): (&str, &serde_json::Value, &str),
) -> Result<StateSnapshot, String> {
    let expected: u64 = expected_revision
        .parse()
        .map_err(|_| "The expected revision is not a number".to_owned())?;
    if expected != stored.revision && effect::rebase(manifest, action) == Some(Rebase::Refuse) {
        return Err(format!(
            "Stale: you saw revision {expected}, the current revision is {}; inspect and retry",
            stored.revision
        ));
    }
    let seed = format!("{}:{}", id.0, stored.revision);
    stored.state = effect::run(manifest, action, args, &stored.state, &seed)?;
    stored.revision += 1;
    instance::save(root, &id.0, &stored, limit)?;
    Ok(snapshot(id, &stored))
}
