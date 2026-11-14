use crate::x11::Geometry;
use anyhow::{Context, Result};
use serde::Serialize;
use std::fmt;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use voyager_contract::inspection::{Element, Frame, Rect, Role};
use voyager_contract::{FleetId, PlacementId, RenameTarget, VoyageId};

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Target {
    role: Role,
    key: String,
}

impl Target {
    pub const AVATAR: Self = Self::single(Role::Avatar);
    pub const SIDEBAR_TOGGLE: Self = Self::single(Role::SidebarToggle);
    pub const CREATE_VOYAGE: Self = Self::single(Role::CreateVoyage);

    const fn single(role: Role) -> Self {
        Self {
            role,
            key: String::new(),
        }
    }

    fn keyed(role: Role, key: &str) -> Self {
        Self {
            role,
            key: key.to_owned(),
        }
    }

    pub fn terminal(placement: &PlacementId) -> Self {
        Self::keyed(Role::Terminal, &placement.0)
    }

    pub fn split_right(placement: &PlacementId) -> Self {
        Self::keyed(Role::SplitRight, &placement.0)
    }

    pub fn create_fleet(voyage: &VoyageId) -> Self {
        Self::keyed(Role::CreateFleet, &voyage.0)
    }

    pub fn worker(launch: &str) -> Self {
        Self::keyed(Role::CreateWorker, launch)
    }

    pub fn name(subject: &RenameTarget) -> Self {
        match subject {
            RenameTarget::Voyage { id } => Self::keyed(Role::VoyageName, &id.0),
            RenameTarget::Fleet { id } => Self::keyed(Role::FleetName, &id.0),
            RenameTarget::Vessel { id } => Self::keyed(Role::VesselName, &id.0),
            RenameTarget::Portal { id } => Self::keyed(Role::PortalName, &id.0),
        }
    }

    pub fn editor(subject: &RenameTarget) -> Self {
        let (RenameTarget::Voyage { id: VoyageId(id) }
        | RenameTarget::Fleet { id: FleetId(id) }
        | RenameTarget::Vessel {
            id: PlacementId(id),
        }
        | RenameTarget::Portal {
            id: PlacementId(id),
        }) = subject;
        Self::keyed(Role::NameEditor, id)
    }

    pub fn find<'a>(&self, frame: &'a Frame) -> Option<&'a Element> {
        frame.elements.iter().find(|element| self.names(element))
    }

    pub fn ambiguous(&self, frame: &Frame) -> bool {
        frame.ambiguous.iter().any(|element| self.names(element))
    }

    fn names(&self, element: &Element) -> bool {
        element.role == self.role && element.key == self.key
    }
}

impl fmt::Display for Target {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} {:?}", Role::NAMES[self.role as usize], self.key)
    }
}

#[derive(Debug)]
pub struct Unseen(pub String);

impl std::fmt::Display for Unseen {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "The candidate never showed {} within the deadline",
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

pub fn contains(region: Geometry, point: (i16, i16)) -> bool {
    let inside = |at: i16, start: i16, length: u16| {
        (i32::from(start)..i32::from(start) + i32::from(length)).contains(&i32::from(at))
    };
    inside(point.0, region.x, region.width) && inside(point.1, region.y, region.height)
}

pub fn clear_of(target: Geometry, obstacle: Option<Geometry>) -> Option<(i16, i16)> {
    let Some(obstacle) = obstacle.filter(|obstacle| contains(*obstacle, centre(target))) else {
        return Some(centre(target));
    };
    let edges = |region: Geometry| {
        let (left, top) = (i32::from(region.x), i32::from(region.y));
        (
            left,
            top,
            left + i32::from(region.width),
            top + i32::from(region.height),
        )
    };
    let (left, top, right, bottom) = edges(target);
    let (covered_left, covered_top, covered_right, covered_bottom) = edges(obstacle);
    let side = |left: i32, top: i32, right: i32, bottom: i32| {
        (right > left && bottom > top).then(|| Geometry {
            x: left as i16,
            y: top as i16,
            width: (right - left) as u16,
            height: (bottom - top) as u16,
        })
    };
    [
        side(left, top, covered_left.min(right), bottom),
        side(covered_right.max(left), top, right, bottom),
        side(left, top, right, covered_top.min(bottom)),
        side(left, covered_bottom.max(top), right, bottom),
    ]
    .into_iter()
    .flatten()
    .max_by_key(|side| u32::from(side.width) * u32::from(side.height))
    .map(centre)
}

#[cfg(test)]
mod tests {
    use super::*;
    use voyager_contract::Context as Dock;
    use voyager_contract::inspection::Window;

    fn toggle() -> Element {
        Element {
            role: Role::SidebarToggle,
            key: String::new(),
            label: None,
            bounds: Rect {
                x: 6.5,
                y: 3.0,
                width: 16.0,
                height: 16.0,
            },
        }
    }

    fn frame(scale: f32) -> Frame {
        Frame {
            sequence: 1,
            window: Window {
                width: 725.0,
                height: 470.0,
                scale,
            },
            dock: Dock::Workspace,
            dock_focus: None,
            prepared: true,
            elements: vec![toggle()],
            ambiguous: Vec::new(),
        }
    }

    fn area(x: i16, y: i16, width: u16, height: u16) -> Geometry {
        Geometry {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn logical_bounds_become_device_pixels_inside_the_control() {
        let frame = frame(2.0);
        let toggle = Target::SIDEBAR_TOGGLE.find(&frame).expect("toggle");
        let region = region(&frame, &toggle.bounds);
        assert_eq!(region, area(13, 6, 32, 32));
        assert_eq!(centre(region), (29, 22));
        let terminal = Target::terminal(&PlacementId("placement-3".into()));
        assert!(terminal.find(&frame).is_none());
        assert_eq!(terminal.to_string(), "terminal \"placement-3\"");
    }

    #[test]
    fn a_name_and_its_editor_share_the_renamed_id() {
        let fleet = RenameTarget::Fleet {
            id: FleetId("fleet-4".into()),
        };
        assert_eq!(Target::name(&fleet).to_string(), "fleet-name \"fleet-4\"");
        assert_eq!(
            Target::editor(&fleet).to_string(),
            "name-editor \"fleet-4\""
        );
        let vessel = RenameTarget::Vessel {
            id: PlacementId("placement-9".into()),
        };
        assert_eq!(
            Target::name(&vessel).to_string(),
            "vessel-name \"placement-9\""
        );
        assert_eq!(
            Target::editor(&vessel).to_string(),
            "name-editor \"placement-9\""
        );
    }

    #[test]
    fn a_control_drawn_twice_is_ambiguous_and_not_found() {
        let mut frame = frame(2.0);
        frame.ambiguous = vec![toggle(), toggle()];
        frame.elements.clear();
        assert!(Target::SIDEBAR_TOGGLE.ambiguous(&frame));
        assert!(Target::SIDEBAR_TOGGLE.find(&frame).is_none());
        assert!(!Target::AVATAR.ambiguous(&frame));
    }

    #[test]
    fn the_aim_point_is_the_centre_unless_the_avatar_covers_it() {
        let vessel = area(100, 100, 400, 300);
        assert_eq!(clear_of(vessel, None), Some((300, 250)));
        assert_eq!(
            clear_of(vessel, Some(area(110, 110, 94, 94))),
            Some((300, 250))
        );
        let docked = area(280, 203, 94, 94);
        let aim = clear_of(vessel, Some(docked)).expect("a clear side");
        assert_eq!(aim, (190, 250));
        assert!(contains(vessel, aim) && !contains(docked, aim));
        assert_eq!(clear_of(area(300, 220, 24, 24), Some(docked)), None);
        assert!(!contains(vessel, (500, 250)) && contains(vessel, (499, 399)));
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
