use crate::{Action, CoreTerminalId, Status, VesselId, standard_integer};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceInput {
    #[serde(with = "crate::decimal")]
    #[schemars(with = "String")]
    pub expected_version: u64,
    pub action: Action,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProcessInput {
    #[serde(with = "crate::decimal")]
    #[schemars(with = "String")]
    pub expected_version: u64,
    pub action: ProcessAction,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(
    tag = "operation",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ProcessAction {
    List,
    Read {
        vessel_id: VesselId,
        terminal_id: CoreTerminalId,
        #[schemars(range(max = 160), transform = standard_integer)]
        lines: u32,
    },
    Send {
        vessel_id: VesselId,
        terminal_id: CoreTerminalId,
        #[schemars(transform = standard_integer)]
        pid: u32,
        text: String,
    },
    Interrupt {
        vessel_id: VesselId,
        terminal_id: CoreTerminalId,
        #[schemars(transform = standard_integer)]
        pid: u32,
    },
    Stop {
        vessel_id: VesselId,
        terminal_id: CoreTerminalId,
        #[schemars(transform = standard_integer)]
        pid: u32,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProcessRequest {
    pub request_id: String,
    pub input: ProcessInput,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProcessInfo {
    pub vessel_id: VesselId,
    pub terminal_id: CoreTerminalId,
    #[schemars(transform = standard_integer)]
    pub pid: Option<u32>,
    pub cwd: String,
    pub state: String,
    pub foreground: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_name: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub placement_names: Vec<PlacementName>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reported_activity: Option<std::sync::Arc<crate::activity::ReportedActivity>>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlacementName {
    pub placement_id: crate::PlacementId,
    pub effective_name: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(
    tag = "operation",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ProcessOutput {
    List {
        processes: Vec<ProcessInfo>,
        unavailable: Vec<VesselId>,
    },
    Read {
        target: ProcessInfo,
        text: String,
        complete: bool,
        how: String,
        why: Option<String>,
        limited: bool,
    },
    Send {
        target: ProcessInfo,
        #[serde(with = "crate::decimal")]
        #[schemars(with = "String")]
        turn: u64,
        started: Option<bool>,
        status: Option<String>,
    },
    Interrupt {
        target: ProcessInfo,
        key: String,
        outcome: String,
    },
    Stop {
        target: ProcessInfo,
        observed: ProcessInfo,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProcessResponse {
    pub request_id: String,
    pub status: Status,
    #[serde(with = "crate::decimal")]
    #[schemars(with = "String")]
    pub version: u64,
    pub fresh: bool,
    pub output: Option<ProcessOutput>,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(
    tag = "tool",
    content = "action",
    rename_all = "lowercase",
    deny_unknown_fields
)]
pub enum ToolAction {
    Workspace(Action),
    Process(ProcessAction),
    Content(crate::content::Receipt),
    Worktree(crate::worktree::Input),
}
