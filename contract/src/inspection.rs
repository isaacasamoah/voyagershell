use crate::Context;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Frame {
    pub sequence: u64,
    pub window: Window,
    pub dock: Context,
    #[serde(rename = "dockFocus", default, skip_serializing_if = "Option::is_none")]
    pub dock_focus: Option<Context>,
    pub prepared: bool,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
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
    Terminal => "terminal",
    SplitRight => "split-right",
    SplitBottom => "split-bottom",
    SidebarToggle => "sidebar-toggle",
    CreateNotes => "create-notes",
    CreateAgents => "create-agents",
    CreateWorker => "create-worker",
    CreateVoyage => "create-voyage",
    CreateFleet => "create-fleet",
    NameEditor => "name-editor",
    Avatar => "avatar",
    CloseVoyage => "close-voyage",
    RecentVoyages => "recent-voyages",
    ReopenVoyage => "reopen-voyage",
    VoyageCloseEntry => "voyage-close-entry",
    VoyageCloseCancel => "voyage-close-cancel",
    VoyageCloseConfirm => "voyage-close-confirm",
    TogglePortals => "toggle-portals",
    ClosePanel => "close-panel",
    HiddenPanels => "hidden-panels",
    ReopenPanel => "reopen-panel",
    WorkspaceDock => "workspace-dock",
    PortalArea => "portal-area",
    GoThere => "go-there",
    ChatToggle => "chat-toggle",
    ChatComposer => "chat-composer",
    ChatSend => "chat-send",
    ChatMessages => "chat-messages",
    ChatMessage => "chat-message",
    ChatStatus => "chat-status",
    ChatError => "chat-error",
    SplitDivider => "split-divider",
    MaximizePanel => "maximize-panel",
    MovePreview => "move-preview",
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
