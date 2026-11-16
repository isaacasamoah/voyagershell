use voyager_contract::{
    Action, Fleet, FleetId, Layout, Placement, PlacementId, VesselId, Voyage, VoyageId,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum Part {
    Workspace,
    Voyage(VoyageId),
    Fleet(FleetId),
    Placement(PlacementId),
    Vessel(VesselId),
    Vessels,
}

impl Part {
    pub(crate) fn same(&self, before: &Layout, after: &Layout) -> bool {
        match self {
            Self::Workspace => same_workspace(before, after),
            Self::Voyage(id) => both(voyage(before, id), voyage(after, id), same_voyage),
            Self::Fleet(id) => both(fleet(before, id), fleet(after, id), same_fleet),
            Self::Placement(id) => placement(before, id) == placement(after, id),
            Self::Vessels => before.vessels == after.vessels,
            Self::Vessel(id) => {
                before.vessels.iter().find(|vessel| &vessel.id == id)
                    == after.vessels.iter().find(|vessel| &vessel.id == id)
            }
        }
    }
}

fn voyage<'a>(layout: &'a Layout, id: &VoyageId) -> Option<&'a Voyage> {
    layout.containers().find(|voyage| &voyage.id == id)
}

fn fleet<'a>(layout: &'a Layout, id: &FleetId) -> Option<&'a Fleet> {
    layout
        .containers()
        .flat_map(|voyage| &voyage.fleets)
        .find(|fleet| &fleet.id == id)
}

fn placement<'a>(layout: &'a Layout, id: &PlacementId) -> Option<&'a Placement> {
    layout
        .containers()
        .flat_map(|voyage| {
            voyage
                .fleets
                .iter()
                .flat_map(|fleet| &fleet.placements)
                .chain(&voyage.portals)
        })
        .find(|placement| &placement.id == id)
}

pub(crate) fn written(before: &Layout, after: &Layout) -> Vec<Part> {
    let mut parts = vec![Part::Workspace];
    for layout in [before, after] {
        for voyage in layout.containers() {
            parts.push(Part::Voyage(voyage.id.clone()));
            for fleet in &voyage.fleets {
                parts.push(Part::Fleet(fleet.id.clone()));
                parts.extend(
                    fleet
                        .placements
                        .iter()
                        .map(|placement| Part::Placement(placement.id.clone())),
                );
            }
            parts.extend(
                voyage
                    .portals
                    .iter()
                    .map(|placement| Part::Placement(placement.id.clone())),
            );
        }
        parts.extend(
            layout
                .vessels
                .iter()
                .map(|vessel| Part::Vessel(vessel.id.clone())),
        );
    }
    let mut changed = Vec::new();
    for part in parts {
        if !changed.contains(&part) && !part.same(before, after) {
            changed.push(part);
        }
    }
    changed
}

pub(crate) fn parts(layout: &Layout, action: &Action) -> Option<Vec<Part>> {
    let mut model = crate::workspace::Model {
        layout: layout.clone(),
    };
    match action {
        Action::StartNewShell {
            vessel_id,
            expected_backend,
        } => model.start_new_shell(vessel_id, expected_backend, ""),
        _ => model.apply(action.clone()),
    }
    .ok()?;
    Some(written(layout, &model.layout))
}

fn both<T>(before: Option<&T>, after: Option<&T>, same: fn(&T, &T) -> bool) -> bool {
    match (before, after) {
        (Some(before), Some(after)) => same(before, after),
        (None, None) => true,
        _ => false,
    }
}

fn same_workspace(before: &Layout, after: &Layout) -> bool {
    let Layout {
        voyages,
        home,
        vessels: _,
        selected_voyage: _,
        selected_fleet: _,
        context: _,
        canvas,
        view: _,
        arrangements,
        next_id: _,
        navigation: _,
    } = before;
    voyages
        .iter()
        .map(|voyage| &voyage.id)
        .eq(after.voyages.iter().map(|voyage| &voyage.id))
        && home.as_ref().map(|home| &home.id) == after.home.as_ref().map(|home| &home.id)
        && canvas == &after.canvas
        && arrangements == &after.arrangements
}

fn same_voyage(before: &Voyage, after: &Voyage) -> bool {
    let Voyage {
        id,
        name,
        name_origin,
        primary_placement,
        closed,
        closed_order,
        fleets,
        portals,
        portal_layout,
        cwd,
    } = before;
    id == &after.id
        && name == &after.name
        && name_origin == &after.name_origin
        && primary_placement == &after.primary_placement
        && closed == &after.closed
        && closed_order == &after.closed_order
        && fleets
            .iter()
            .map(|fleet| &fleet.id)
            .eq(after.fleets.iter().map(|fleet| &fleet.id))
        && portals
            .iter()
            .map(|placement| &placement.id)
            .eq(after.portals.iter().map(|placement| &placement.id))
        && portal_layout == &after.portal_layout
        && cwd == &after.cwd
}

fn same_fleet(before: &Fleet, after: &Fleet) -> bool {
    let Fleet {
        id,
        name,
        closed,
        placements,
        root,
        maximized_placement,
    } = before;
    id == &after.id
        && name == &after.name
        && closed == &after.closed
        && placements
            .iter()
            .map(|placement| &placement.id)
            .eq(after.placements.iter().map(|placement| &placement.id))
        && root == &after.root
        && maximized_placement == &after.maximized_placement
}
