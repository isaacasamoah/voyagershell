use crate::panels;
use voyager_contract::{Layout, VesselId};

pub(crate) fn discard_vessels(layout: &mut Layout, vessels: &[VesselId]) -> Result<bool, String> {
    if vessels.is_empty() {
        return Ok(false);
    }
    let mut candidate = layout.clone();
    let placements: Vec<_> = layout
        .containers()
        .flat_map(|voyage| {
            voyage
                .fleets
                .iter()
                .flat_map(|fleet| fleet.placements.iter())
                .chain(voyage.portals.iter())
        })
        .filter(|panel| vessels.contains(&panel.vessel))
        .map(|panel| panel.id.clone())
        .collect();
    for id in &placements {
        panels::discard(&mut candidate, id)?;
    }
    candidate
        .vessels
        .retain(|content| !vessels.contains(&content.id));
    let changed = candidate != *layout;
    *layout = candidate;
    Ok(changed)
}
