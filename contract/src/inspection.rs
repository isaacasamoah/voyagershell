use crate::Context;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Frame {
    pub sequence: u64,
    pub window: Window,
    pub dock: Context,
    pub elements: Vec<Element>,
    pub ambiguous: Vec<Element>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
pub struct Window {
    pub width: f32,
    pub height: f32,
    pub scale: f32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Element {
    pub role: Role,
    pub key: String,
    pub bounds: Rect,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

macro_rules! roles {
    ($($variant:ident => $name:literal),+ $(,)?) => {
        #[derive(Clone, Copy, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
        pub enum Role {
            $(#[serde(rename = $name)] $variant),+
        }

        impl Role {
            pub const NAMES: &'static [&'static str] = &[$($name),+];

            pub fn parse(name: &str) -> Option<Self> {
                match name {
                    $($name => Some(Self::$variant),)+
                    _ => None,
                }
            }
        }
    };
}

roles! {
    VoyageName => "voyage-name",
    FleetName => "fleet-name",
    VesselName => "vessel-name",
    PortalName => "portal-name",
    SplitRight => "split-right",
    SplitBottom => "split-bottom",
    SidebarToggle => "sidebar-toggle",
    CreateNotes => "create-notes",
    CreateAgents => "create-agents",
    CreateWorker => "create-worker",
    Avatar => "avatar",
}

#[cfg(test)]
mod tests {
    use super::Frame;

    #[test]
    fn the_documented_frame_is_the_shape_the_app_writes() {
        let guide = include_str!("../../docs/inspection.md");
        let example = guide.split("```json\n").nth(1).unwrap();
        let example = example.split("```").next().unwrap();
        let documented: serde_json::Value = serde_json::from_str(example).unwrap();
        let frame: Frame = serde_json::from_value(documented.clone()).unwrap();
        assert_eq!(serde_json::to_value(frame).unwrap(), documented);
    }
}
