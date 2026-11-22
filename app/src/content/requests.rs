use super::{Access, Binding, ENVELOPE_LIMIT, Owner, identity, reject};
use voyager_contract::{
    Layout, VesselId,
    content::{Request, Response, Version},
};

const NO_CONTENT: &str = "This Vessel's type has no content actions";

pub(crate) fn bounded_response(request: &Request, response: Response) -> Response {
    if serde_json::to_vec(&response)
        .expect("Content response serializes")
        .len()
        <= ENVELOPE_LIMIT
    {
        return response;
    }
    if matches!(
        response,
        Response::Invoked { .. } | Response::Uncertain { .. }
    ) {
        let (id, request_id, expected) = identity(request);
        Response::Uncertain {
            version: Version::V1, request_id: request_id.into(), vessel_id: id.clone(), expected_revision: expected.unwrap_or_default().into(),
            message: "The dispatched write's complete confirmation exceeds the content envelope limit. Inspect it; do not repeat the update.".into(),
        }
    } else {
        let (id, request_id, _) = identity(request);
        let (revision, warning_present) = match &response {
            Response::State { snapshot, .. } => (Some(snapshot.revision.clone()), false),
            Response::Rejected { .. } => (None, true),
            _ => (None, false),
        };
        Response::Limited { version: Version::V1, request_id: request_id.into(), vessel_id: id.clone(), revision, warning_present, message: "The complete read or refusal, including any warning details, exceeds the content envelope limit. No complete snapshot is supplied.".into() }
    }
}

pub(crate) fn run(
    owner: &mut Owner,
    layout: &std::sync::Arc<Layout>,
    version: u64,
    access: &Access,
    request: Request,
) -> Response {
    owner
        .manifest_call(layout, version, access, &request)
        .unwrap_or_else(|| reject(&request, NO_CONTENT.into()))
}

pub(crate) fn bind(
    owner: &mut Owner,
    layout: &std::sync::Arc<Layout>,
    id: &VesselId,
) -> Result<Binding, String> {
    if owner.manifest_entry(layout, id).is_none() {
        return Err(NO_CONTENT.into());
    }
    super::manifest::placed(layout, None, id)?;
    Ok(Binding(id.clone()))
}

pub(crate) fn check_envelope(request: &Request) -> Result<(), String> {
    if serde_json::to_vec(request)
        .map_err(|error| error.to_string())?
        .len()
        > ENVELOPE_LIMIT
    {
        return Err("Content request exceeds the envelope limit".into());
    }
    Ok(())
}

pub(crate) fn current_access(
    access: &Access,
    structure: u64,
    target: &VesselId,
    current: impl FnOnce(u64, &VesselId) -> bool,
) -> Access {
    match access {
        Access::Agent {
            scope,
            expected_version,
        } if current(*expected_version, target) => Access::Agent {
            scope: scope.clone(),
            expected_version: structure,
        },
        other => other.clone(),
    }
}
