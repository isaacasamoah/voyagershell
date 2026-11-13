use crate::x11::Geometry;
use anyhow::{Context, Result};
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use voyager_contract::inspection::{Element, Frame, Rect, Role};

#[derive(Debug)]
pub struct Unseen(pub String);

impl std::fmt::Display for Unseen {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "The inspection frame never showed {} within the deadline",
            self.0
        )
    }
}

impl std::error::Error for Unseen {}

pub fn read(path: &Path) -> Result<Option<Frame>> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .context("Invalid inspection frame"),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

pub fn named(role: Role, key: &str) -> String {
    format!("{} {key:?}", Role::NAMES[role as usize])
}

pub fn find<'a>(frame: &'a Frame, role: Role, key: &str) -> Option<&'a Element> {
    frame
        .elements
        .iter()
        .find(|element| element.role == role && element.key == key)
}

pub fn drawn_for(frame: &Frame, window: Geometry) -> bool {
    let device = |logical: f32| (logical * frame.window.scale).round();
    device(frame.window.width) == f32::from(window.width)
        && device(frame.window.height) == f32::from(window.height)
}

pub fn region(frame: &Frame, bounds: &Rect) -> Geometry {
    let scale = frame.window.scale;
    let (left, top) = ((bounds.x * scale).ceil(), (bounds.y * scale).ceil());
    let right = ((bounds.x + bounds.width) * scale).floor().max(left);
    let bottom = ((bounds.y + bounds.height) * scale).floor().max(top);
    Geometry {
        x: left as i16,
        y: top as i16,
        width: (right - left) as u16,
        height: (bottom - top) as u16,
    }
}

pub fn centre(region: Geometry) -> (i16, i16) {
    (
        region.x + (region.width / 2) as i16,
        region.y + (region.height / 2) as i16,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use voyager_contract::Context as Dock;
    use voyager_contract::inspection::Window;

    fn frame(scale: f32) -> Frame {
        Frame {
            sequence: 1,
            window: Window {
                width: 725.0,
                height: 470.0,
                scale,
            },
            dock: Dock::Workspace,
            elements: vec![Element {
                role: Role::SidebarToggle,
                key: String::new(),
                bounds: Rect {
                    x: 6.5,
                    y: 3.0,
                    width: 16.0,
                    height: 16.0,
                },
            }],
            ambiguous: Vec::new(),
        }
    }

    #[test]
    fn logical_bounds_become_device_pixels_inside_the_control() {
        let frame = frame(2.0);
        let toggle = find(&frame, Role::SidebarToggle, "").expect("toggle");
        let region = region(&frame, &toggle.bounds);
        assert_eq!(
            region,
            Geometry {
                x: 13,
                y: 6,
                width: 32,
                height: 32
            }
        );
        assert_eq!(centre(region), (29, 22));
        assert!(find(&frame, Role::SidebarToggle, "other").is_none());
        assert_eq!(
            named(Role::Terminal, "placement-3"),
            "terminal \"placement-3\""
        );
    }

    #[test]
    fn a_frame_drawn_for_another_size_is_stale() {
        let window = |width, height| Geometry {
            x: 0,
            y: 0,
            width,
            height,
        };
        assert!(drawn_for(&frame(2.0), window(1450, 940)));
        assert!(!drawn_for(&frame(2.0), window(1180, 820)));
        assert!(!drawn_for(&frame(1.0), window(1450, 940)));
    }
}
