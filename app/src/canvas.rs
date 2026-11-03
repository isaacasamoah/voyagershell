use voyager_contract::canvas::{Canvas, Node, PortalMode, Region, Size};

pub(crate) fn validate(canvas: &Canvas) -> Result<(), String> {
    fn visit(
        node: &Node,
        depth: usize,
        count: &mut usize,
        regions: &mut Vec<Region>,
        overlay: bool,
    ) -> Result<(), String> {
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
                for (index, child) in children.iter().enumerate() {
                    if overlay
                        && let Node::Block {
                            region: Region::Portals,
                            size,
                        } = child
                    {
                        if index != 0 && index + 1 != children.len() {
                            return Err("Overlay Portals must be the first or last child of their row or column".into());
                        }
                        if matches!(size, Size::Content) {
                            return Err("Overlay Portals need fixed or fill sizing".into());
                        }
                    }
                    visit(child, depth + 1, count, regions, overlay)?;
                }
            }
            Node::Block { region, .. } => {
                if regions.contains(region) {
                    return Err("Each canvas region can appear only once".into());
                }
                regions.push(*region);
            }
        }
        Ok(())
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
        assert!(validate(&positioned).is_ok());
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
