use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub mod administrator;
pub mod content;
pub mod conversation;

macro_rules! id {
    ($name:ident) => {
        #[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
        #[serde(transparent)]
        pub struct $name(pub String);
    };
}

id!(VoyageId);
id!(FleetId);
id!(PlacementId);
id!(ContentId);
id!(CoreTerminalId);

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Axis {
    Horizontal,
    Vertical,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Left,
    Right,
    Top,
    Bottom,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Context {
    #[default]
    Workspace,
    Voyage {
        id: VoyageId,
    },
    Fleet {
        id: FleetId,
    },
    Vessel {
        id: PlacementId,
    },
    Portal {
        id: PlacementId,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Split {
    Leaf {
        placement: PlacementId,
    },
    Branch {
        axis: Axis,
        first: Box<Split>,
        second: Box<Split>,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Content {
    pub id: ContentId,
    pub type_id: String,
    pub cwd: String,
    pub backend: Option<CoreTerminalId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_pending: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Vessel {
    pub id: PlacementId,
    pub content: ContentId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum RenameTarget {
    Voyage { id: VoyageId },
    Fleet { id: FleetId },
    Vessel { id: PlacementId },
    Portal { id: PlacementId },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Fleet {
    pub id: FleetId,
    pub name: String,
    pub vessels: Vec<Vessel>,
    pub root: Split,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Voyage {
    pub id: VoyageId,
    pub name: String,
    pub fleets: Vec<Fleet>,
    pub portals: Vec<Vessel>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceView {
    Home,
    #[default]
    Fleet,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedLayout {
    pub fleet: FleetId,
    pub name: String,
    pub root: Split,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Layout {
    pub voyages: Vec<Voyage>,
    pub contents: Vec<Content>,
    pub selected_voyage: Option<VoyageId>,
    pub selected_fleet: Option<FleetId>,
    pub context: Context,
    #[serde(default)]
    pub view: WorkspaceView,
    #[serde(default)]
    pub saved_layouts: Vec<SavedLayout>,
    #[serde(with = "decimal")]
    #[schemars(with = "String")]
    pub next_id: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ContentDestination {
    Vessel {
        fleet: FleetId,
        after: PlacementId,
        axis: Axis,
    },
    Portal {
        voyage: VoyageId,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Action {
    Inspect,
    Home,
    SaveLayout {
        fleet: FleetId,
        name: String,
    },
    LoadLayout {
        fleet: FleetId,
        name: String,
    },
    CreateVoyage {
        name: String,
        cwd: String,
    },
    CreateFleet {
        voyage: VoyageId,
        name: String,
    },
    CreatePortal {
        voyage: VoyageId,
    },
    CreateContent {
        #[serde(rename = "typeId")]
        type_id: String,
        destination: ContentDestination,
    },
    Rename {
        target: RenameTarget,
        name: String,
    },
    Split {
        fleet: FleetId,
        after: PlacementId,
        axis: Axis,
    },
    MoveVessel {
        id: PlacementId,
        target: PlacementId,
        side: Side,
    },
    MoveVoyage {
        id: VoyageId,
        target: VoyageId,
        before: bool,
    },
    MoveFleet {
        id: FleetId,
        target: FleetId,
        before: bool,
    },
    SelectVoyage {
        id: VoyageId,
    },
    SelectFleet {
        id: FleetId,
    },
    RevealVessel {
        id: PlacementId,
    },
    Dock {
        context: Context,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub request_id: String,
    #[serde(with = "decimal")]
    #[schemars(with = "String")]
    pub expected_version: u64,
    pub action: Action,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Applied,
    Rejected,
    Uncertain,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TerminalRequest {
    pub request_id: String,
    pub content_id: ContentId,
    #[serde(with = "decimal")]
    #[schemars(with = "String")]
    pub expected_version: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TerminalResponse {
    pub request_id: String,
    pub content_id: ContentId,
    pub status: Status,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Response {
    pub request_id: String,
    pub status: Status,
    #[serde(with = "decimal")]
    #[schemars(with = "String")]
    pub version: u64,
    pub layout: Arc<Layout>,
    pub fresh: bool,
    pub created_workspace: bool,
    pub created_contents: Vec<ContentId>,
    pub message: Option<String>,
}

mod decimal {
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(value: &u64, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(value)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u64, D::Error> {
        let value = String::deserialize(deserializer)?;
        value.parse().map_err(serde::de::Error::custom)
    }
}
