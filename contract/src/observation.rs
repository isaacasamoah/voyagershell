use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{ContentId, CoreTerminalId, PlacementId, context::Branch};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Directory {
    Live { path: String },
    Voyage { path: String },
    Starting { path: String },
    Unavailable,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Corner {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Position {
    #[schemars(transform = crate::administrator::standard_integer)]
    pub column: u16,
    #[schemars(transform = crate::administrator::standard_integer)]
    pub row: u16,
    #[schemars(transform = crate::administrator::standard_integer)]
    pub columns: u16,
    #[schemars(transform = crate::administrator::standard_integer)]
    pub rows: u16,
    pub corners: Vec<Corner>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PanelObservation {
    pub placement_id: PlacementId,
    pub content_id: ContentId,
    pub backend: Option<CoreTerminalId>,
    pub directory: Directory,
    pub program: Option<String>,
    pub conversation_name: Option<String>,
    pub effective_name: String,
    pub address: String,
    pub position: Option<Position>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceObservation {
    #[serde(with = "crate::decimal")]
    #[schemars(with = "String")]
    pub version: u64,
    pub active: Option<PlacementId>,
    pub directory: Directory,
    pub panels: Vec<PanelObservation>,
    pub branch: Branch,
}
