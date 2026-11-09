use voyager_contract::canvas::{Canvas, Node, PortalMode, Region, Size};

pub(crate) fn validate(canvas: &Canvas) -> Result<(), String> {
    fn visit(
        node: &Node,
        depth: usize,
        count: &mut usize,
        regions: &mut Vec<Region>,
        overlay: bool,
    ) -> Result<(bool, bool), String> {
        *count += 1;
        if depth > 12 || *count > 64 {
            return Err("Canvas exceeds its 12-level or 64-node limit".into());
        }
        let size = match node {
            Node::Row { size, .. }
            | Node::Column { size, .. }
            | Node::Stack { size, .. }
            | Node::Block { size, .. } => size,
        };
        if matches!(size, Size::Fixed { pixels } if !(1..=4096).contains(pixels)) {
            return Err("Canvas fixed sizes must contain 1 to 4096 logical pixels".into());
        }
        match node {
            Node::Stack {
                selected, children, ..
            } => {
                if usize::from(*selected) >= children.len() {
                    return Err("Canvas stack selection must name an existing child".into());
                }
                let start = regions.len();
                let mut expected: Option<Vec<Region>> = None;
                let mut owners = (false, false);
                for child in children {
                    regions.truncate(start);
                    owners = visit(child, depth + 1, count, regions, overlay)?;
                    if owners.1 && !owners.0 {
                        return Err(
                            "Canvas stacks must keep Portals beside their active Fleet".into()
                        );
                    }
                    let contributed = &regions[start..];
                    if let Some(expected) = &expected {
                        if contributed.len() != expected.len()
                            || !contributed.iter().all(|region| expected.contains(region))
                        {
                            return Err(
                                "Canvas stack alternatives must retain the same regions".into()
                            );
                        }
                    } else {
                        expected = Some(contributed.to_vec());
                    }
                }
                Ok(owners)
            }
            Node::Row { children, .. } | Node::Column { children, .. } => {
                if children.is_empty() {
                    return Err("Canvas containers need at least one child".into());
                }
                let mut active_fleet = false;
                let mut portals = false;
                for (index, child) in children.iter().enumerate() {
                    if let Node::Block {
                        region: Region::Portals,
                        size,
                    } = child
                    {
                        if !matches!(node, Node::Row { .. })
                            || index + 1 != children.len()
                            || !active_fleet
                        {
                            return Err(
                                "Portals must be the rightmost column beside the active Fleet"
                                    .into(),
                            );
                        }
                        if overlay && matches!(size, Size::Content) {
                            return Err("Overlay Portals need fixed or fill sizing".into());
                        }
                    }
                    let (child_fleet, child_portals) =
                        visit(child, depth + 1, count, regions, overlay)?;
                    if child_portals
                        && matches!(node, Node::Row { .. })
                        && index + 1 != children.len()
                    {
                        return Err("The Portal column must remain on the right edge".into());
                    }
                    active_fleet |= child_fleet;
                    portals |= child_portals;
                }
                Ok((active_fleet, portals))
            }
            Node::Block { region, .. } => {
                if regions.contains(region) {
                    return Err("Each canvas region can appear only once".into());
                }
                regions.push(*region);
                Ok((*region == Region::ActiveFleet, *region == Region::Portals))
            }
        }
    }
    let mut regions = Vec::new();
    let mut count = 0;
    visit(
        &canvas.root,
        1,
        &mut count,
        &mut regions,
        canvas.portal_mode == PortalMode::Overlay,
    )?;
    if [
        Region::Sidebar,
        Region::FleetStrip,
        Region::ActiveFleet,
        Region::Portals,
        Region::ContextBar,
    ]
    .iter()
    .any(|region| !regions.contains(region))
    {
        return Err(
            "Canvas must retain sidebar, Fleet strip, active Fleet, Portals and context bar".into(),
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use voyager_contract::{Action, Context};

    #[test]
    fn stack_retains_selection_and_rejects_invalid_alternatives_atomically() {
        let original = Canvas::default();
        let tree = serde_json::to_value(&original.root).unwrap();
        let mut second = tree.clone();
        second["children"][0]["size"]["pixels"] = 260.into();
        second["children"][1]["children"][1]["children"][1]["size"]["pixels"] = 480.into();
        let mut value = serde_json::to_value(&original).unwrap();
        value["root"] = serde_json::json!({
            "kind": "stack", "selected": 1, "children": [tree, second]
        });
        let selected: Canvas = serde_json::from_value(value.clone()).unwrap();
        let mut model = crate::workspace::Model::default();
        model
            .apply(Action::UpdateCanvas {
                canvas: selected.clone(),
            })
            .unwrap();
        assert_eq!(model.layout.canvas, selected);
        let restored: Canvas =
            serde_json::from_slice(&serde_json::to_vec(&selected).unwrap()).unwrap();
        assert_eq!(restored, selected);
        model
            .apply(Action::CreateVoyage {
                name: "Work".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        model.layout.voyages[0].portal_layout = None;
        crate::panels::normalize(&mut model.layout).unwrap();
        assert_eq!(
            model.layout.voyages[0]
                .portal_layout
                .as_ref()
                .unwrap()
                .width,
            480
        );
        for invalid in [
            {
                let mut v = value.clone();
                v["root"]["selected"] = 2.into();
                v
            },
            {
                let mut v = value.clone();
                v["root"]["children"][0]["children"]
                    .as_array_mut()
                    .unwrap()
                    .pop();
                v
            },
            {
                let mut v = value.clone();
                v["root"]["children"][0]["children"]
                    .as_array_mut()
                    .unwrap()
                    .swap(0, 1);
                v
            },
            {
                let mut v = value.clone();
                v["root"]["children"] = vec![value["root"]["children"][0].clone(); 8].into();
                v
            },
        ] {
            let before = model.layout.clone();
            let invalid = serde_json::from_value(invalid).unwrap();
            assert!(
                model
                    .apply(Action::UpdateCanvas { canvas: invalid })
                    .is_err()
            );
            assert_eq!(model.layout, before);
        }
    }

    #[test]
    fn canvas_admission_keeps_global_authority_and_bounded_structure() {
        let mut model = crate::workspace::Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Work".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        let fleet = model.layout.voyages[0].fleets[0].id.clone();
        let layout = Arc::new(model.layout);
        let action = Action::UpdateCanvas {
            canvas: Canvas::default(),
        };
        assert!(crate::scope::check(&layout, Some(&Context::Workspace), &action).is_ok());
        assert!(
            crate::scope::check(
                &layout,
                Some(&Context::Fleet { id: fleet.clone() }),
                &action
            )
            .is_err()
        );
        assert!(
            crate::scope::check(
                &layout,
                Some(&Context::Fleet { id: fleet }),
                &Action::SetSidebar { collapsed: true }
            )
            .is_err()
        );
        let mut positioned = Canvas {
            root: Node::Row {
                size: Size::Fill,
                children: [
                    Region::Sidebar,
                    Region::FleetStrip,
                    Region::Portals,
                    Region::ActiveFleet,
                    Region::ContextBar,
                ]
                .map(|region| Node::Block {
                    region,
                    size: Size::Fixed { pixels: 240 },
                })
                .into(),
            },
            ..Canvas::default()
        };
        assert!(validate(&positioned).is_err());
        positioned.portal_mode = voyager_contract::canvas::PortalMode::MakeRoom;
        assert!(validate(&positioned).is_err());
        for mode in [PortalMode::Overlay, PortalMode::MakeRoom] {
            let canonical = Canvas {
                portal_mode: mode,
                ..Canvas::default()
            };
            assert!(validate(&canonical).is_ok());
            let mut nested = canonical.clone();
            if let Node::Row { children, .. } = &mut nested.root {
                children.swap(0, 1);
            }
            assert!(validate(&nested).is_err());
            for (row, portal_index) in [(true, 0), (true, 2), (false, 0), (false, 4)] {
                let mut children: Vec<_> = [
                    Region::Sidebar,
                    Region::FleetStrip,
                    Region::ActiveFleet,
                    Region::ContextBar,
                ]
                .map(|region| Node::Block {
                    region,
                    size: Size::Fill,
                })
                .into();
                children.insert(
                    portal_index,
                    Node::Block {
                        region: Region::Portals,
                        size: Size::Fixed { pixels: 340 },
                    },
                );
                let invalid = Canvas {
                    root: if row {
                        Node::Row {
                            size: Size::Fill,
                            children,
                        }
                    } else {
                        Node::Column {
                            size: Size::Fill,
                            children,
                        }
                    },
                    portal_mode: mode,
                    ..Canvas::default()
                };
                let mut model = crate::workspace::Model {
                    layout: (*layout).clone(),
                };
                let before = model.layout.clone();
                assert!(
                    model
                        .apply(Action::UpdateCanvas { canvas: invalid })
                        .is_err()
                );
                assert_eq!(model.layout, before);
            }
        }
        for pixels in [0, 4097] {
            let mut invalid = Canvas::default();
            if let Node::Row { size, .. } = &mut invalid.root {
                *size = Size::Fixed { pixels };
            }
            assert!(validate(&invalid).is_err());
        }
        let mut deep = Canvas::default();
        for _ in 0..12 {
            deep.root = Node::Column {
                size: Size::Fill,
                children: vec![deep.root],
            };
        }
        assert!(validate(&deep).is_err());
        assert!(
            validate(&Canvas {
                root: Node::Row {
                    size: Size::Fill,
                    children: vec![]
                },
                ..Canvas::default()
            })
            .is_err()
        );
    }
}
