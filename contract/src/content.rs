use crate::ContentId;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Notes {
    pub title: String,
    pub text: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
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

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
pub enum Version {
    #[serde(rename = "1")]
    V1,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    pub content_id: ContentId,
    pub revision: String,
    pub data: Notes,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "status", rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum Response {
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
