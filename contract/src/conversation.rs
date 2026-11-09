use crate::Context;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Action {
    Send { text: String },
    Interrupt,
    StartVoice,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub request_id: String,
    pub action: Action,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Delivery {
    Accepted,
    Rejected,
    Unconfirmed,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Reply {
    pub request_id: String,
    pub delivery: Delivery,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Idle,
    Starting,
    Working,
    Completed,
    Interrupted,
    Failed,
    Unconfirmed,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
    Tool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Message {
    pub id: String,
    pub request_id: String,
    pub role: Role,
    pub text: String,
    pub context: Option<Focus>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool: Option<ToolOutcome>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ToolOutcome {
    pub name: String,
    pub call_id: String,
    pub callback_ids: Vec<CallbackId>,
    pub request_id: String,
    pub action: crate::administrator::ToolAction,
    pub status: crate::Status,
    pub version: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(
    tag = "kind",
    content = "value",
    rename_all = "lowercase",
    deny_unknown_fields
)]
pub enum CallbackId {
    String(String),
    Integer(#[schemars(regex(pattern = "^-?[0-9]+$"))] String),
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Focus {
    pub scope: Context,
    pub path: Vec<String>,
    pub cwd: Option<String>,
    #[serde(with = "crate::decimal")]
    #[schemars(with = "String")]
    pub revision: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(length(max = 8192))]
    pub preview: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    #[serde(with = "crate::decimal")]
    #[schemars(with = "String")]
    pub version: u64,
    pub thread: Option<String>,
    pub turn: Option<String>,
    pub model: Option<String>,
    pub phase: Phase,
    pub messages: Vec<Message>,
    pub error: Option<String>,
    pub limited: bool,
    #[serde(with = "crate::decimal")]
    #[schemars(with = "String")]
    pub omitted: u64,
}

impl Default for Snapshot {
    fn default() -> Self {
        Self {
            version: 0,
            thread: None,
            turn: None,
            model: None,
            phase: Phase::Idle,
            messages: Vec::new(),
            error: None,
            limited: false,
            omitted: 0,
        }
    }
}
