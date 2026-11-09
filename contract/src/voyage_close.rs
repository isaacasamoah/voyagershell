use crate::{ContentId, CoreTerminalId, VoyageId};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Entry {
    pub content: ContentId,
    pub name: String,
    pub type_id: String,
    pub terminal: Option<CoreTerminalId>,
    #[schemars(transform = crate::administrator::standard_integer)]
    pub pid: Option<u32>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Phase {
    Ready,
    Saving,
    Incomplete,
    Closed,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Plan {
    pub id: String,
    pub voyage: VoyageId,
    pub name: String,
    #[serde(with = "crate::decimal")]
    #[schemars(with = "String")]
    pub version: u64,
    pub phase: Phase,
    pub entries: Vec<Entry>,
    #[serde(default)]
    #[schemars(transform = crate::administrator::standard_integer)]
    pub uncommitted_changes: Option<u32>,
    pub message: Option<String>,
}
