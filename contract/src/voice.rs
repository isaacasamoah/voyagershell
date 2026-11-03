use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Capability {
    Checking,
    Unavailable { reason: String },
    Candidate { version: String },
    Compatible { version: String },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Phase {
    Off,
    Preparing,
    Negotiating,
    Active,
    Stopping,
    Failed,
    Unconfirmed,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct State {
    #[serde(with = "crate::decimal")]
    #[schemars(with = "String")]
    pub version: u64,
    #[serde(with = "crate::decimal")]
    #[schemars(with = "String")]
    pub generation: u64,
    pub phase: Phase,
    pub capability: Capability,
    pub thread: Option<String>,
    pub turn: Option<String>,
    pub realtime_session: Option<String>,
    #[schemars(schema_with = "peak")]
    pub microphone_peak: u16,
    #[schemars(schema_with = "peak")]
    pub speaker_peak: u16,
    pub error: Option<String>,
}

fn peak(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
    schemars::json_schema!({"type":"integer","minimum":0,"maximum":u16::MAX})
}
