use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub mod activity;
pub mod avatar_animation;
mod panels;
pub use panels::{PanelInsertion, PanelOwner, PortalLayout, SavedLayout};
pub mod administrator;
pub mod canvas;
pub mod content;
pub mod context;
pub mod conversation;
pub mod inspection;
pub mod launch;
pub mod observation;
pub mod rank;
pub mod voice;
pub mod voyage_close;
pub mod worktree;

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

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "u16", into = "u16")]
#[schemars(transform = share_schema)]
pub struct SplitShare(u16);

impl SplitShare {
    pub const TOTAL: u16 = 10000;
}

fn share_schema(schema: &mut schemars::Schema) {
    schema.remove("format");
    schema.insert("minimum".into(), serde_json::json!(1));
    schema.insert("maximum".into(), serde_json::json!(SplitShare::TOTAL - 1));
}

impl Default for SplitShare {
    fn default() -> Self {
        Self(Self::TOTAL / 2)
    }
}

impl TryFrom<u16> for SplitShare {
    type Error = &'static str;

    fn try_from(value: u16) -> Result<Self, Self::Error> {
        (1..Self::TOTAL)
            .contains(&value)
            .then_some(Self(value))
            .ok_or("Split share must be between 1 and 9999")
    }
}

impl From<SplitShare> for u16 {
    fn from(value: SplitShare) -> Self {
        value.0
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum SplitChild {
    First,
    Second,
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
        #[serde(default)]
        share: SplitShare,
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
    pub configuration: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_pending: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launch: Option<launch::Launch>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shell_intent: Option<String>,
    #[serde(default, skip_serializing_if = "rank::Rank::is_crew")]
    pub rank: rank::Rank,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Vessel {
    pub id: PlacementId,
    pub content: ContentId,
    pub name: String,
    #[serde(
        default,
        rename = "nameOrigin",
        skip_serializing_if = "NameOrigin::is_deliberate"
    )]
    pub name_origin: NameOrigin,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub hidden: bool,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum NameOrigin {
    Automatic,
    #[default]
    Deliberate,
}

impl NameOrigin {
    fn is_deliberate(&self) -> bool {
        *self == Self::Deliberate
    }
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
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub closed: bool,
    pub vessels: Vec<Vessel>,
    pub root: Option<Split>,
    #[serde(
        default,
        rename = "maximizedPlacement",
        skip_serializing_if = "Option::is_none"
    )]
    pub maximized_placement: Option<PlacementId>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Voyage {
    pub id: VoyageId,
    pub name: String,
    #[serde(default, rename = "nameOrigin")]
    pub name_origin: NameOrigin,
    #[serde(
        default,
        rename = "primaryVessel",
        skip_serializing_if = "Option::is_none"
    )]
    pub primary_vessel: Option<PlacementId>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub closed: bool,
    #[serde(default, rename = "closedOrder", with = "decimal")]
    #[schemars(with = "String")]
    pub closed_order: u64,
    pub fleets: Vec<Fleet>,
    pub portals: Vec<Vessel>,
    #[serde(
        default,
        rename = "portalLayout",
        skip_serializing_if = "Option::is_none"
    )]
    pub portal_layout: Option<PortalLayout>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum DirectorySource {
    Live {
        placement_id: PlacementId,
        content_id: ContentId,
        backend: CoreTerminalId,
        cwd: String,
    },
    Voyage {
        voyage_id: VoyageId,
        cwd: String,
    },
    Starting {
        placement_id: PlacementId,
        content_id: ContentId,
        cwd: String,
    },
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceView {
    Home,
    #[default]
    Fleet,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Layout {
    pub voyages: Vec<Voyage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub home: Option<Voyage>,
    pub contents: Vec<Content>,
    pub selected_voyage: Option<VoyageId>,
    pub selected_fleet: Option<FleetId>,
    pub context: Context,
    #[serde(default)]
    pub canvas: canvas::Canvas,
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
    Panel {
        owner: PanelOwner,
        insertion: PanelInsertion,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Action {
    Inspect,
    Home,
    UpdateCanvas {
        canvas: canvas::Canvas,
    },
    SetSidebar {
        collapsed: bool,
    },
    SavePanelLayout {
        owner: PanelOwner,
        name: String,
    },
    LoadPanelLayout {
        owner: PanelOwner,
        name: String,
    },
    CreateVoyage {
        name: String,
        cwd: String,
    },
    CreateVoyageFromSource {
        source: DirectorySource,
    },
    CreateFleet {
        voyage: VoyageId,
        name: String,
    },
    CreateFleetWithContent {
        voyage: VoyageId,
        name: String,
        source: DirectorySource,
        #[serde(rename = "typeId")]
        type_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        launch: Option<launch::Launch>,
    },
    CreateContent {
        #[serde(rename = "typeId")]
        type_id: String,
        destination: ContentDestination,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        launch: Option<launch::Launch>,
    },
    StartNewShell {
        #[serde(rename = "contentId")]
        content_id: ContentId,
        #[serde(rename = "expectedBackend")]
        expected_backend: CoreTerminalId,
    },
    RemoveContentPackage {
        #[serde(rename = "typeId")]
        type_id: String,
    },
    RestoreContentPackage {
        #[serde(rename = "typeId")]
        type_id: String,
    },
    Rename {
        target: RenameTarget,
        name: String,
    },
    ResizePanelSplit {
        owner: PanelOwner,
        #[schemars(length(max = 128))]
        path: Vec<SplitChild>,
        share: SplitShare,
    },
    MovePanel {
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
    CloseVoyage {
        id: VoyageId,
    },
    ConfirmVoyageClose {
        id: VoyageId,
        plan: String,
    },
    CancelVoyageClose {
        id: VoyageId,
        plan: String,
    },
    ReopenVoyage {
        id: VoyageId,
    },
    SelectFleet {
        id: FleetId,
    },
    CloseFleet {
        id: FleetId,
    },
    ReopenFleet {
        id: FleetId,
    },
    RevealPanel {
        id: PlacementId,
    },
    ReopenPanel {
        id: PlacementId,
        destination: ContentDestination,
    },
    Dock {
        context: Context,
    },
    SetPanelMaximized {
        id: PlacementId,
        maximized: bool,
    },
    SetPanelHidden {
        id: PlacementId,
        hidden: bool,
    },
    RemovePanel {
        id: PlacementId,
    },
    RemovePanelLayout {
        owner: PanelOwner,
        name: String,
    },
    SetPortalPresentation {
        voyage: VoyageId,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        visible: Option<bool>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        mode: Option<canvas::PortalMode>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(range(min = 1, max = 4096), transform = panels::width_schema)]
        width: Option<u16>,
    },
    SetAgentRank {
        id: PlacementId,
        rank: rank::Rank,
    },
}

impl Layout {
    pub fn containers(&self) -> impl Iterator<Item = &Voyage> {
        self.voyages.iter().chain(self.home.iter())
    }

    pub fn containers_mut(&mut self) -> impl Iterator<Item = &mut Voyage> {
        self.voyages.iter_mut().chain(self.home.iter_mut())
    }
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<TerminalReason>,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum TerminalReason {
    Ended,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_plan: Option<voyage_close::Plan>,
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
