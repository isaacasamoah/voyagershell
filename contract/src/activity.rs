use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ActivityState {
    Unknown,
    Working,
    Blocked,
    Idle,
    Done,
    Error,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReportedActivity {
    pub state: ActivityState,
    pub reason: Option<String>,
    pub reported: bool,
    pub app: Option<String>,
    pub kind: Option<String>,
    #[schemars(range(max = 100), transform = percent_schema)]
    pub progress: Option<u8>,
    pub source_ms: Option<String>,
    pub observed_ms: Option<String>,
    pub sequence: Option<String>,
    pub limited: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Projection {
    pub terminals: std::collections::BTreeMap<String, ReportedActivity>,
}

fn percent_schema(schema: &mut schemars::Schema) {
    schema.remove("format");
}
