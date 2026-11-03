use crate::ContentId;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Catalog {
    pub types: Vec<Description>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Description {
    pub type_id: String,
    pub name: String,
    pub host: NativeHost,
    pub view: NativeView,
    pub placements: Vec<Placement>,
    pub configuration: Option<DataDescription>,
    pub state: Option<DataDescription>,
    pub actions: Actions,
    pub backend: Option<Backend>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeHost {
    pub runtime: String,
    pub version: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeView {
    pub module: String,
    pub component: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Placement {
    Fleet,
    Voyage,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DataDescription {
    pub schema: Option<serde_json::Value>,
    pub defaults: serde_json::Value,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Actions {
    pub tool: String,
    pub names: Vec<String>,
    pub input_schema: serde_json::Value,
    pub result_schema: serde_json::Value,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Backend {
    CoreTerminal,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Notes {
    pub title: String,
    pub text: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "operation",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Action {
    Describe {
        content_id: ContentId,
    },
    Inspect {
        content_id: ContentId,
    },
    Update {
        content_id: ContentId,
        expected_revision: String,
        data: Notes,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "operation",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Receipt {
    Describe {
        content_id: ContentId,
    },
    Inspect {
        content_id: ContentId,
    },
    Update {
        content_id: ContentId,
        expected_revision: String,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Input {
    #[serde(with = "crate::decimal")]
    #[schemars(with = "String")]
    pub expected_version: u64,
    pub action: Action,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "operation",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Request {
    #[serde(rename = "content.describe")]
    Describe {
        version: Version,
        request_id: String,
        content_id: ContentId,
    },
    #[serde(rename = "content.inspect")]
    Inspect {
        version: Version,
        request_id: String,
        content_id: ContentId,
    },
    #[serde(rename = "content.update")]
    Update {
        version: Version,
        request_id: String,
        content_id: ContentId,
        expected_revision: String,
        data: Notes,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
pub enum Version {
    #[serde(rename = "1")]
    V1,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    pub content_id: ContentId,
    pub revision: String,
    pub data: Notes,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "status", rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum Response {
    #[serde(rename = "limited")]
    Limited {
        version: Version,
        request_id: String,
        content_id: ContentId,
        revision: Option<String>,
        warning_present: bool,
        message: String,
    },
    #[serde(rename = "described")]
    Described {
        version: Version,
        request_id: String,
        content_id: ContentId,
        schema_declared: bool,
        state_schema: Option<serde_json::Value>,
    },
    #[serde(rename = "snapshot")]
    Snapshot {
        version: Version,
        request_id: String,
        content_id: ContentId,
        snapshot: Snapshot,
    },
    #[serde(rename = "applied")]
    Applied {
        version: Version,
        request_id: String,
        content_id: ContentId,
        snapshot: Snapshot,
    },
    #[serde(rename = "rejected")]
    Rejected {
        version: Version,
        request_id: String,
        content_id: ContentId,
        expected_revision: Option<String>,
        message: String,
    },
    #[serde(rename = "uncertain")]
    Uncertain {
        version: Version,
        request_id: String,
        content_id: ContentId,
        expected_revision: String,
        message: String,
    },
}
