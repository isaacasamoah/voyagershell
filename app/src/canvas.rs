use voyager_contract::canvas::{Canvas, Node, PortalMode, Region, Size};

pub(crate) fn validate(canvas: &Canvas) -> Result<(), String> {
    fn visit(
        node: &Node,
        depth: usize,
        count: &mut usize,
        regions: &mut Vec<Region>,
        overlay: bool,
    ) -> Result<bool, String> {
        *count += 1;
        if depth > 12 || *count > 64 {
            return Err("Canvas exceeds its 12-level or 64-node limit".into());
        }
        let size = match node {
            Node::Row { size, .. } | Node::Column { size, .. } | Node::Block { size, .. } => size,
        };
        if matches!(size, Size::Fixed { pixels } if !(1..=4096).contains(pixels)) {
            return Err("Canvas fixed sizes must contain 1 to 4096 logical pixels".into());
        }
        match node {
            Node::Row { children, .. } | Node::Column { children, .. } => {
                if children.is_empty() {
                    return Err("Canvas containers need at least one child".into());
                }
                let mut active_fleet = false;
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
                    active_fleet |= visit(child, depth + 1, count, regions, overlay)?;
                }
                Ok(active_fleet)
            }
            Node::Block { region, .. } => {
                if regions.contains(region) {
                    return Err("Each canvas region can appear only once".into());
                }
                regions.push(*region);
                Ok(*region == Region::ActiveFleet)
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
