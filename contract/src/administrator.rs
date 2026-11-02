use crate::Action;
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
