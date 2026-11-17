use crate::Context;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Directory {
    Known { path: String },
    Multiple,
    Unavailable,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Branch {
    Named { name: String },
    Detached,
    Unavailable,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Facts {
    #[serde(with = "crate::decimal")]
    #[schemars(with = "String")]
    pub version: u64,
    pub scope: Context,
    pub path: Vec<String>,
    pub directory: Directory,
    pub branch: Branch,
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
