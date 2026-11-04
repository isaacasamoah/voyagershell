use std::collections::BTreeSet;
use voyager_contract::{
    Axis, Content, Layout, PanelInsertion, PanelOwner, PlacementId, PortalLayout, Side, Split,
    SplitShare, Vessel,
};

pub(crate) fn apply(layout: &mut Layout, action: voyager_contract::Action) -> Result<(), String> {
    use voyager_contract::{Action, SavedLayout, SplitChild, WorkspaceView};
    match action {
        Action::SavePanelLayout { owner, name } => {
            let name = name.trim().to_owned();
            if name.is_empty() || name.len() > 128 {
                return Err("A layout name must contain 1 to 128 bytes".into());
            }
            let current = group(layout, &owner)?;
            let saved = SavedLayout {
                owner: owner.clone(),
                name: name.clone(),
                root: visible(current.root, current.members),
            };
            if let Some(existing) = layout
                .saved_layouts
                .iter_mut()
                .find(|item| item.owner == owner && item.name == name)
            {
                *existing = saved;
            } else {
                layout.saved_layouts.push(saved);
            }
        }
        Action::LoadPanelLayout { owner, name } => {
            let root = layout
                .saved_layouts
                .iter()
                .find(|item| item.owner == owner && item.name == name.trim())
                .ok_or("Saved layout not found for this arrangement")?
                .root
                .clone();
            validate_tree(&root, group(layout, &owner)?.members, &layout.contents)?;
            let current = group_mut(layout, &owner)?;
            for panel in current.members.iter_mut() {
                if contains(&root, &panel.id) {
                    panel.hidden = false;
                }
            }
            *current.root = root;
            repair_maximized(current);
        }
        Action::RemovePanelLayout { owner, name } => {
            group(layout, &owner)?;
            let index = layout
                .saved_layouts
                .iter()
                .position(|saved| saved.owner == owner && saved.name == name.trim())
                .ok_or("Saved layout not found for this arrangement")?;
            layout.saved_layouts.remove(index);
        }
        Action::ResizePanelSplit { owner, path, share } => {
            if path.len() > 128 {
                return Err("Split path exceeds 128 steps".into());
            }
            let mut node = group_mut(layout, &owner)?
                .root
                .as_mut()
                .ok_or("Split branch not found")?;
            for child in path {
                node = match (node, child) {
                    (Split::Branch { first, .. }, SplitChild::First) => first,
                    (Split::Branch { second, .. }, SplitChild::Second) => second,
                    _ => return Err("Split branch not found".into()),
                };
            }
            let Split::Branch { share: current, .. } = node else {
                return Err("Split branch not found".into());
            };
            *current = share;
        }
        Action::SetPanelMaximized { id, maximized } => {
            let owner = owner_of(layout, &id)?;
            let current = group_mut(layout, &owner)?;
            let shown = visible(current.root, current.members);
            if !contains(&shown, &id)
                || (maximized && !matches!(shown, Some(Split::Branch { .. })))
                || (!maximized && current.maximized.as_ref() != Some(&id))
            {
                return Err("Panel cannot change maximization".into());
            }
            *current.maximized = maximized.then_some(id);
        }
        Action::SetPanelHidden { id, hidden } => {
            let owner = owner_of(layout, &id)?;
            let current = group_mut(layout, &owner)?;
            if !contains(current.root, &id) {
                return Err("Panel is not in this layout".into());
            }
            current
                .members
                .iter_mut()
                .find(|panel| panel.id == id)
                .ok_or("Panel not found")?
                .hidden = hidden;
            repair_maximized(current);
        }
        Action::RemovePanel { id } => {
            let owner = owner_of(layout, &id)?;
            let current = group_mut(layout, &owner)?;
            if !contains(current.root, &id) {
                return Err("Panel is not in this layout".into());
            }
            let root = current.root.take().ok_or("Panel layout is empty")?;
            *current.root = remove_leaf(root, &id).0;
            repair_maximized(current);
        }
        Action::MovePanel { id, target, side } => {
            let owner = owner_of(layout, &id)?;
            if owner_of(layout, &target)? != owner {
                return Err("Panels must belong to the same arrangement".into());
            }
            let current = group_mut(layout, &owner)?;
            let shown = visible(current.root, current.members);
            if !contains(&shown, &id) || !contains(&shown, &target) {
                return Err("Panel placement is not visible in this arrangement".into());
            }
            if id == target {
                return Ok(());
            }
            let root = current.root.clone().ok_or("Panel layout is empty")?;
            let (root, _) = remove_leaf(root, &id);
            let mut root = root.ok_or("Panel has no destination")?;
            if !insert_leaf(&mut root, &target, &id, side) {
                return Err("Panel destination changed".into());
            }
            *current.root = Some(root);
            repair_maximized(current);
        }
        Action::ReopenPanel {
            id,
            destination: voyager_contract::ContentDestination::Panel { owner, insertion },
        } => {
            let source = owner_of(layout, &id)?;
            if source != owner {
                let same_voyage = matches!((&source, &owner),
                    (PanelOwner::Fleet { id: source }, PanelOwner::Fleet { id: target })
                        if layout.containers().any(|voyage|
                            voyage.fleets.iter().any(|fleet| &fleet.id == source)
                                && voyage.fleets.iter().any(|fleet| &fleet.id == target)));
                if !same_voyage {
                    return Err("Panel must remain in its Voyage and arrangement kind".into());
                }
            }
            let current = group(layout, &source)?;
            if contains(&visible(current.root, current.members), &id) {
                return Err("Panel is already placed in its arrangement".into());
            }
            insertion_cwd(layout, &owner, &insertion)?;
            let current = group_mut(layout, &source)?;
            let index = current
                .members
                .iter()
                .position(|panel| panel.id == id)
                .ok_or("Panel not found")?;
            let mut panel = current.members.remove(index);
            panel.hidden = false;
            if let Some(root) = current.root.take() {
                *current.root = remove_leaf(root, &id).0;
            }
            repair_maximized(current);
            if source != owner {
                for saved in layout
                    .saved_layouts
                    .iter_mut()
                    .filter(|saved| saved.owner == source)
                {
                    if let Some(root) = saved.root.take() {
                        saved.root = remove_leaf(root, &id).0;
                    }
                }
            }
            insert(group_mut(layout, &owner)?, &owner, insertion, panel)?;
        }
        Action::RevealPanel { id } => {
            let owner = owner_of(layout, &id)?;
            let current = group_mut(layout, &owner)?;
            current
                .members
                .iter_mut()
                .find(|panel| panel.id == id)
                .ok_or("Panel not found")?
                .hidden = false;
            if !contains(current.root, &id) {
                let leaf = Split::Leaf {
                    placement: id.clone(),
                };
                *current.root = Some(match current.root.take() {
                    None => leaf,
                    Some(root) => Split::Branch {
                        axis: if matches!(owner, PanelOwner::Fleet { .. }) {
                            Axis::Horizontal
                        } else {
                            Axis::Vertical
                        },
                        share: Default::default(),
                        first: Box::new(root),
                        second: Box::new(leaf),
                    },
                });
            }
            if current.maximized.as_ref() != Some(&id) {
                *current.maximized = None;
            }
            repair_maximized(current);
            let voyage = layout
                .containers()
                .find(|voyage| match &owner {
                    PanelOwner::Fleet { id } => voyage.fleets.iter().any(|fleet| &fleet.id == id),
                    PanelOwner::Portals { voyage: id } => &voyage.id == id,
                })
                .ok_or("Panel owner not found")?;
            let voyage_id = voyage.id.clone();
            let fleet_id = match &owner {
                PanelOwner::Fleet { id } => Some(id.clone()),
                PanelOwner::Portals { .. } => layout
                    .selected_fleet
                    .clone()
                    .filter(|id| voyage.fleets.iter().any(|fleet| &fleet.id == id))
                    .or_else(|| voyage.fleets.first().map(|fleet| fleet.id.clone())),
            };
            let home = layout
                .home
                .as_ref()
                .is_some_and(|home| home.id == voyage_id);
            if matches!(owner, PanelOwner::Portals { .. }) {
                layout
                    .containers_mut()
                    .find(|voyage| voyage.id == voyage_id)
                    .and_then(|voyage| voyage.portal_layout.as_mut())
                    .ok_or("Portal arrangement not found")?
                    .visible = true;
            }
            layout.view = if home {
                WorkspaceView::Home
            } else {
                layout.selected_voyage = Some(voyage_id);
                layout.selected_fleet = fleet_id;
                WorkspaceView::Fleet
            };
        }
        Action::SetPortalPresentation {
            voyage,
            visible,
            mode,
            width,
        } => {
            if visible.is_none() && mode.is_none() && width.is_none() {
                return Err("No Portal presentation change was supplied".into());
            }
            if width.is_some_and(|width| width == 0 || width > 4096) {
                return Err("Portal width must be between 1 and 4096".into());
            }
            let column = layout
                .containers_mut()
                .find(|item| item.id == voyage)
                .and_then(|item| item.portal_layout.as_mut())
                .ok_or("Portal arrangement not found")?;
            if let Some(visible) = visible {
                column.visible = visible;
            }
            if let Some(mode) = mode {
                column.mode = mode;
            }
            if let Some(width) = width {
                column.width = width;
            }
        }
        _ => return Err("Unsupported panel action".into()),
    }
    Ok(())
}

pub(crate) struct Group<'a> {
    pub members: &'a [Vessel],
    pub root: &'a Option<Split>,
    pub maximized: &'a Option<PlacementId>,
}

pub(crate) struct GroupMut<'a> {
    pub members: &'a mut Vec<Vessel>,
    pub root: &'a mut Option<Split>,
    pub maximized: &'a mut Option<PlacementId>,
}

pub(crate) fn group<'a>(layout: &'a Layout, owner: &PanelOwner) -> Result<Group<'a>, String> {
    for voyage in layout.containers() {
        match owner {
            PanelOwner::Fleet { id } => {
                if let Some(fleet) = voyage.fleets.iter().find(|fleet| &fleet.id == id) {
                    return Ok(Group {
                        members: &fleet.vessels,
                        root: &fleet.root,
                        maximized: &fleet.maximized_placement,
                    });
                }
            }
            PanelOwner::Portals { voyage: id } if &voyage.id == id => {
                let presentation = voyage
                    .portal_layout
                    .as_ref()
                    .ok_or("Portal arrangement is unavailable")?;
                return Ok(Group {
                    members: &voyage.portals,
                    root: &presentation.root,
                    maximized: &presentation.maximized_placement,
                });
            }
            _ => (),
        }
    }
    Err("Panel arrangement not found".into())
}

pub(crate) fn group_mut<'a>(
    layout: &'a mut Layout,
    owner: &PanelOwner,
) -> Result<GroupMut<'a>, String> {
    for voyage in layout.containers_mut() {
        match owner {
            PanelOwner::Fleet { id } => {
                if let Some(fleet) = voyage.fleets.iter_mut().find(|fleet| &fleet.id == id) {
                    return Ok(GroupMut {
                        members: &mut fleet.vessels,
                        root: &mut fleet.root,
                        maximized: &mut fleet.maximized_placement,
                    });
                }
            }
            PanelOwner::Portals { voyage: id } if &voyage.id == id => {
                let presentation = voyage
                    .portal_layout
                    .as_mut()
                    .ok_or("Portal arrangement is unavailable")?;
                return Ok(GroupMut {
                    members: &mut voyage.portals,
                    root: &mut presentation.root,
                    maximized: &mut presentation.maximized_placement,
                });
            }
            _ => (),
        }
    }
    Err("Panel arrangement not found".into())
}

pub(crate) fn owner_of(layout: &Layout, id: &PlacementId) -> Result<PanelOwner, String> {
    for voyage in layout.containers() {
        for fleet in &voyage.fleets {
            if fleet.vessels.iter().any(|panel| &panel.id == id) {
                return Ok(PanelOwner::Fleet {
                    id: fleet.id.clone(),
                });
            }
        }
        if voyage.portals.iter().any(|panel| &panel.id == id) {
            return Ok(PanelOwner::Portals {
                voyage: voyage.id.clone(),
            });
        }
    }
    Err("Panel not found".into())
}

pub(crate) fn owners(layout: &Layout) -> Vec<PanelOwner> {
    layout
        .containers()
        .flat_map(|voyage| {
            voyage
                .fleets
                .iter()
                .map(|fleet| PanelOwner::Fleet {
                    id: fleet.id.clone(),
                })
                .chain(std::iter::once(PanelOwner::Portals {
                    voyage: voyage.id.clone(),
                }))
        })
        .collect()
}

pub(crate) fn contains(root: &Option<Split>, id: &PlacementId) -> bool {
    root.as_ref().is_some_and(|root| contains_leaf(root, id))
}

fn contains_leaf(root: &Split, id: &PlacementId) -> bool {
    match root {
        Split::Leaf { placement } => placement == id,
        Split::Branch { first, second, .. } => {
            contains_leaf(first, id) || contains_leaf(second, id)
        }
    }
}

pub(crate) fn visible(root: &Option<Split>, members: &[Vessel]) -> Option<Split> {
    fn prune(root: &Split, members: &[Vessel]) -> Option<Split> {
        match root {
            Split::Leaf { placement } => members
                .iter()
                .any(|panel| &panel.id == placement && !panel.hidden)
                .then(|| root.clone()),
            Split::Branch {
                axis,
                share,
                first,
                second,
            } => match (prune(first, members), prune(second, members)) {
                (Some(first), Some(second)) => Some(Split::Branch {
                    axis: *axis,
                    share: *share,
                    first: Box::new(first),
                    second: Box::new(second),
                }),
                (Some(child), None) | (None, Some(child)) => Some(child),
                (None, None) => None,
            },
        }
    }
    root.as_ref().and_then(|root| prune(root, members))
}

pub(crate) fn repair_maximized(group: GroupMut<'_>) {
    let shown = visible(group.root, group.members);
    if group
        .maximized
        .as_ref()
        .is_some_and(|id| !contains(&shown, id) || !matches!(shown, Some(Split::Branch { .. })))
    {
        *group.maximized = None;
    }
}

pub(crate) fn insertion_cwd(
    layout: &Layout,
    owner: &PanelOwner,
    insertion: &PanelInsertion,
) -> Result<String, String> {
    let target = group(layout, owner)?;
    let shown = visible(target.root, target.members);
    match insertion {
        PanelInsertion::Empty if shown.is_none() => (),
        PanelInsertion::Beside { id, .. } if contains(&shown, id) => {
            let content = target
                .members
                .iter()
                .find(|panel| &panel.id == id)
                .and_then(|panel| {
                    layout
                        .contents
                        .iter()
                        .find(|content| content.id == panel.content)
                })
                .ok_or("Panel content not found")?;
            return Ok(content.cwd.clone());
        }
        _ => return Err("Panel insertion target changed".into()),
    }
    let voyage = layout
        .containers()
        .find(|voyage| match owner {
            PanelOwner::Fleet { id } => voyage.fleets.iter().any(|fleet| &fleet.id == id),
            PanelOwner::Portals { voyage: id } => &voyage.id == id,
        })
        .ok_or("Panel owner not found")?;
    voyage
        .cwd
        .clone()
        .or_else(|| {
            voyage
                .fleets
                .iter()
                .flat_map(|fleet| &fleet.vessels)
                .chain(&voyage.portals)
                .find_map(|panel| {
                    layout
                        .contents
                        .iter()
                        .find(|content| content.id == panel.content)
                        .map(|content| content.cwd.clone())
                })
        })
        .ok_or_else(|| "Panel owner has no configured folder".into())
}

pub(crate) fn insert(
    group: GroupMut<'_>,
    owner: &PanelOwner,
    insertion: PanelInsertion,
    panel: Vessel,
) -> Result<(), String> {
    match insertion {
        PanelInsertion::Beside { id, side } => {
            if !group
                .root
                .as_mut()
                .is_some_and(|root| insert_leaf(root, &id, &panel.id, side))
            {
                return Err("Panel insertion target changed".into());
            }
        }
        PanelInsertion::Empty => {
            let leaf = Split::Leaf {
                placement: panel.id.clone(),
            };
            *group.root = Some(match group.root.take() {
                None => leaf,
                Some(root) => Split::Branch {
                    axis: if matches!(owner, PanelOwner::Fleet { .. }) {
                        Axis::Horizontal
                    } else {
                        Axis::Vertical
                    },
                    share: SplitShare::default(),
                    first: Box::new(root),
                    second: Box::new(leaf),
                },
            });
        }
    }
    group.members.push(panel);
    *group.maximized = None;
    Ok(())
}

pub(crate) fn default_name(members: &[Vessel], type_id: &str) -> String {
    let base = match type_id {
        "notes" => "Notes",
        "agents" => "Agents",
        _ => "Terminal",
    };
    let mut suffix = 1_u64;
    loop {
        let candidate = format!("{base} {suffix}");
        if members.iter().all(|panel| panel.name != candidate) {
            return candidate;
        }
        suffix += 1;
    }
}

pub(crate) fn normalize(layout: &mut Layout) -> Result<(), String> {
    let contents = layout.contents.clone();
    let mode = layout.canvas.portal_mode;
    fn width(node: &voyager_contract::canvas::Node) -> Option<u16> {
        use voyager_contract::canvas::{Node, Region, Size};
        match node {
            Node::Block {
                region: Region::Portals,
                size: Size::Fixed { pixels },
            } => Some(*pixels),
            Node::Row { children, .. } | Node::Column { children, .. } => {
                children.iter().find_map(width)
            }
            _ => None,
        }
    }
    let portal_width = width(&layout.canvas.root).unwrap_or(340);
    for voyage in layout.containers_mut() {
        if voyage.portal_layout.is_none() {
            let mut root = None;
            for (index, panel) in voyage.portals.iter().enumerate() {
                let leaf = Split::Leaf {
                    placement: panel.id.clone(),
                };
                root = Some(match root {
                    None => leaf,
                    Some(first) => Split::Branch {
                        axis: Axis::Vertical,
                        share: SplitShare::try_from(
                            (index * 10000 / (index + 1)).clamp(1, 9999) as u16
                        )
                        .unwrap_or_default(),
                        first: Box::new(first),
                        second: Box::new(leaf),
                    },
                });
            }
            voyage.portal_layout = Some(PortalLayout {
                visible: root.is_some(),
                root,
                mode,
                width: portal_width,
                ..PortalLayout::default()
            });
        }
        if let Some(cwd) = &voyage.cwd
            && !std::path::Path::new(cwd).is_absolute()
        {
            return Err("Stored Voyage folder must be absolute".into());
        }
        for members in voyage
            .fleets
            .iter_mut()
            .map(|fleet| &mut fleet.vessels)
            .chain(std::iter::once(&mut voyage.portals))
        {
            for index in 0..members.len() {
                if members[index].name.is_empty() {
                    let content = contents
                        .iter()
                        .find(|content| content.id == members[index].content)
                        .ok_or("Stored panel content is missing")?;
                    members[index].name = default_name(members, &content.type_id);
                }
            }
        }
    }
    validate(layout)
}

pub(crate) fn validate(layout: &Layout) -> Result<(), String> {
    let mut placements = BTreeSet::new();
    let mut content_ids = BTreeSet::new();
    for owner in owners(layout) {
        let current = group(layout, &owner)?;
        for panel in current.members {
            if !placements.insert(&panel.id.0) || !content_ids.insert(&panel.content.0) {
                return Err("Stored panel belongs to multiple arrangements".into());
            }
        }
        validate_tree(current.root, current.members, &layout.contents)?;
        let shown = visible(current.root, current.members);
        if current
            .maximized
            .as_ref()
            .is_some_and(|id| !contains(&shown, id) || !matches!(shown, Some(Split::Branch { .. })))
        {
            return Err("Stored panel maximization is invalid".into());
        }
    }
    for voyage in layout.containers() {
        if voyage
            .portal_layout
            .as_ref()
            .is_some_and(|column| column.width == 0 || column.width > 4096)
        {
            return Err("Stored Portal width is invalid".into());
        }
    }
    Ok(())
}

pub(crate) fn validate_tree(
    root: &Option<Split>,
    members: &[Vessel],
    contents: &[Content],
) -> Result<(), String> {
    fn check(
        root: &Split,
        members: &[Vessel],
        contents: &[Content],
        seen: &mut BTreeSet<String>,
    ) -> Result<(), String> {
        match root {
            Split::Leaf { placement } => {
                let panel = members
                    .iter()
                    .find(|panel| &panel.id == placement)
                    .ok_or("Stored panel is outside its arrangement")?;
                if !seen.insert(placement.0.clone())
                    || !contents.iter().any(|content| content.id == panel.content)
                {
                    return Err("Stored panel is duplicated or its content is missing".into());
                }
            }
            Split::Branch { first, second, .. } => {
                check(first, members, contents, seen)?;
                check(second, members, contents, seen)?;
            }
        }
        Ok(())
    }
    if let Some(root) = root {
        check(root, members, contents, &mut BTreeSet::new())?;
    }
    Ok(())
}

pub(crate) fn remove_leaf(root: Split, id: &PlacementId) -> (Option<Split>, bool) {
    match root {
        Split::Leaf { placement } if &placement == id => (None, true),
        Split::Leaf { .. } => (Some(root), false),
        Split::Branch {
            axis,
            share,
            first,
            second,
        } => {
            let (first, removed) = remove_leaf(*first, id);
            let (second, removed) = if removed {
                (Some(*second), true)
            } else {
                remove_leaf(*second, id)
            };
            (
                match (first, second) {
                    (Some(first), Some(second)) => Some(Split::Branch {
                        axis,
                        share,
                        first: Box::new(first),
                        second: Box::new(second),
                    }),
                    (Some(child), None) | (None, Some(child)) => Some(child),
                    (None, None) => None,
                },
                removed,
            )
        }
    }
}

pub(crate) fn insert_leaf(
    root: &mut Split,
    target: &PlacementId,
    id: &PlacementId,
    side: Side,
) -> bool {
    match root {
        Split::Leaf { placement } if placement == target => {
            let (axis, before) = match side {
                Side::Left => (Axis::Horizontal, true),
                Side::Right => (Axis::Horizontal, false),
                Side::Top => (Axis::Vertical, true),
                Side::Bottom => (Axis::Vertical, false),
            };
            let source = Split::Leaf {
                placement: id.clone(),
            };
            let destination = Split::Leaf {
                placement: target.clone(),
            };
            let (first, second) = if before {
                (source, destination)
            } else {
                (destination, source)
            };
            *root = Split::Branch {
                axis,
                share: SplitShare::default(),
                first: Box::new(first),
                second: Box::new(second),
            };
            true
        }
        Split::Branch { first, second, .. } => {
            insert_leaf(first, target, id, side) || insert_leaf(second, target, id, side)
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::Model;
    use voyager_contract::{Action, ContentDestination};

    #[test]
    fn reopen_transfers_only_the_retained_panel_inside_its_voyage() {
        let mut model = Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Work".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        let voyage = model.layout.voyages[0].id.clone();
        let first = model.layout.voyages[0].fleets[0].vessels[0].clone();
        model
            .apply(Action::CreateContent {
                type_id: "notes".into(),
                destination: ContentDestination::Panel {
                    owner: PanelOwner::Fleet {
                        id: model.layout.voyages[0].fleets[0].id.clone(),
                    },
                    insertion: PanelInsertion::Beside {
                        id: first.id.clone(),
                        side: Side::Right,
                    },
                },
                launch: None,
            })
            .unwrap();
        let source = model.layout.voyages[0].fleets[0].clone();
        let panel = source.vessels[0].clone();
        let retained = source.vessels[1].clone();
        model
            .apply(Action::SavePanelLayout {
                owner: PanelOwner::Fleet {
                    id: source.id.clone(),
                },
                name: "Original".into(),
            })
            .unwrap();
        model
            .apply(Action::RemovePanel {
                id: panel.id.clone(),
            })
            .unwrap();
        model
            .apply(Action::CreateFleet {
                voyage,
                name: "Next".into(),
            })
            .unwrap();
        let target = &mut model.layout.voyages[0].fleets[1];
        let owner = PanelOwner::Fleet {
            id: target.id.clone(),
        };
        let insertion = PanelInsertion::Beside {
            id: target.vessels[0].id.clone(),
            side: Side::Left,
        };
        let action = Action::ReopenPanel {
            id: panel.id.clone(),
            destination: ContentDestination::Panel {
                owner: owner.clone(),
                insertion: insertion.clone(),
            },
        };
        let snapshot = std::sync::Arc::new(model.layout.clone());
        crate::scope::check(
            &snapshot,
            Some(&voyager_contract::Context::Voyage {
                id: model.layout.voyages[0].id.clone(),
            }),
            &action,
        )
        .unwrap();
        for scope in [
            voyager_contract::Context::Fleet {
                id: source.id.clone(),
            },
            voyager_contract::Context::Fleet {
                id: model.layout.voyages[0].fleets[1].id.clone(),
            },
            voyager_contract::Context::Vessel {
                id: panel.id.clone(),
            },
        ] {
            assert!(crate::scope::check(&snapshot, Some(&scope), &action).is_err());
        }
        for destination in [
            PanelOwner::Portals {
                voyage: model.layout.voyages[0].id.clone(),
            },
            PanelOwner::Fleet {
                id: model.layout.home.as_ref().unwrap().fleets[0].id.clone(),
            },
        ] {
            let before = model.layout.clone();
            assert!(
                model
                    .apply(Action::ReopenPanel {
                        id: panel.id.clone(),
                        destination: ContentDestination::Panel {
                            owner: destination,
                            insertion: PanelInsertion::Empty
                        }
                    })
                    .is_err()
            );
            assert_eq!(model.layout, before);
        }
        let contents = model.layout.contents.clone();
        let context = model.layout.context.clone();
        let selected = model.layout.selected_fleet.clone();
        model.apply(action).unwrap();
        assert_eq!(model.layout.contents, contents);
        assert_eq!(model.layout.context, context);
        assert_eq!(model.layout.selected_fleet, selected);
        assert_eq!(
            model.layout.voyages[0].fleets[0].vessels.as_slice(),
            std::slice::from_ref(&retained)
        );
        let target = group(&model.layout, &owner).unwrap();
        assert_eq!(target.members[0].name, "Terminal 1");
        assert_eq!(target.members[1].name, "Terminal 1");
        assert_ne!(target.members[0].id, target.members[1].id);
        assert_eq!(
            group(&model.layout, &owner).unwrap().members.last(),
            Some(&panel)
        );
        assert!(contains(
            group(&model.layout, &owner).unwrap().root,
            &panel.id
        ));
        assert_eq!(
            model.layout.saved_layouts[0].root,
            Some(Split::Leaf {
                placement: retained.id
            })
        );
        let before = model.layout.clone();
        assert!(
            model
                .apply(Action::ReopenPanel {
                    id: panel.id.clone(),
                    destination: ContentDestination::Panel { owner, insertion }
                })
                .is_err()
        );
        assert_eq!(model.layout, before);
    }
}
