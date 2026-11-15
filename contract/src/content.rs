use crate::VesselId;
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
    pub availability: Availability,
    pub host: NativeHost,
    pub view: NativeView,
    pub placements: Vec<Placement>,
    pub configuration: Option<DataDescription>,
    pub state: Option<DataDescription>,
    pub actions: Option<Actions>,
    pub backend: Option<Backend>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "status", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Availability {
    Ready,
    Removed,
    Unavailable { reason: String },
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NotesConfiguration {
    pub show_heading: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes_file: Option<NotesFile>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NotesFile {
    pub directory: String,
    pub filename: String,
}

impl Default for NotesConfiguration {
    fn default() -> Self {
        Self {
            show_heading: true,
            notes_file: None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConfigurationSnapshot {
    pub configuration: NotesConfiguration,
    #[serde(with = "crate::decimal")]
    #[schemars(with = "String")]
    pub workspace_version: u64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "operation",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Action {
    Configure {
        vessel_id: VesselId,
        configuration: NotesConfiguration,
    },
    Describe {
        vessel_id: VesselId,
    },
    Inspect {
        vessel_id: VesselId,
    },
    MigrateNote {
        vessel_id: VesselId,
    },
    ListNotes {
        vessel_id: VesselId,
    },
    NewNote {
        vessel_id: VesselId,
        title: String,
    },
    OpenNote {
        vessel_id: VesselId,
        filename: String,
    },
    Update {
        vessel_id: VesselId,
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
    Configure {
        vessel_id: VesselId,
    },
    Describe {
        vessel_id: VesselId,
    },
    Inspect {
        vessel_id: VesselId,
    },
    MigrateNote {
        vessel_id: VesselId,
    },
    ListNotes {
        vessel_id: VesselId,
    },
    NewNote {
        vessel_id: VesselId,
        title: String,
    },
    OpenNote {
        vessel_id: VesselId,
        filename: String,
    },
    Update {
        vessel_id: VesselId,
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
    #[serde(rename = "content.configure")]
    Configure {
        version: Version,
        request_id: String,
        vessel_id: VesselId,
        #[serde(with = "crate::decimal")]
        #[schemars(with = "String")]
        expected_version: u64,
        configuration: NotesConfiguration,
    },
    #[serde(rename = "content.describe")]
    Describe {
        version: Version,
        request_id: String,
        vessel_id: VesselId,
    },
    #[serde(rename = "content.inspect")]
    Inspect {
        version: Version,
        request_id: String,
        vessel_id: VesselId,
    },
    #[serde(rename = "content.migrate-note")]
    MigrateNote {
        version: Version,
        request_id: String,
        vessel_id: VesselId,
        #[serde(with = "crate::decimal")]
        #[schemars(with = "String")]
        expected_version: u64,
    },
    #[serde(rename = "content.list-notes")]
    ListNotes {
        version: Version,
        request_id: String,
        vessel_id: VesselId,
    },
    #[serde(rename = "content.new-note")]
    NewNote {
        version: Version,
        request_id: String,
        vessel_id: VesselId,
        #[serde(with = "crate::decimal")]
        #[schemars(with = "String")]
        expected_version: u64,
        title: String,
    },
    #[serde(rename = "content.open-note")]
    OpenNote {
        version: Version,
        request_id: String,
        vessel_id: VesselId,
        #[serde(with = "crate::decimal")]
        #[schemars(with = "String")]
        expected_version: u64,
        filename: String,
    },
    #[serde(rename = "content.update")]
    Update {
        version: Version,
        request_id: String,
        vessel_id: VesselId,
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
    pub vessel_id: VesselId,
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
        vessel_id: VesselId,
        revision: Option<String>,
        warning_present: bool,
        message: String,
    },
    #[serde(rename = "described")]
    Described {
        version: Version,
        request_id: String,
        vessel_id: VesselId,
        schema_declared: bool,
        state_schema: Option<serde_json::Value>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        configuration: Option<DataDescription>,
    },
    #[serde(rename = "snapshot")]
    Snapshot {
        version: Version,
        request_id: String,
        vessel_id: VesselId,
        snapshot: Snapshot,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        configuration: Option<ConfigurationSnapshot>,
    },
    #[serde(rename = "notes-list")]
    NotesList {
        version: Version,
        request_id: String,
        vessel_id: VesselId,
        filenames: Vec<String>,
    },
    #[serde(rename = "note-opened")]
    NoteOpened {
        version: Version,
        request_id: String,
        vessel_id: VesselId,
        snapshot: Snapshot,
        configuration: NotesConfiguration,
        #[serde(with = "crate::decimal")]
        #[schemars(with = "String")]
        workspace_version: u64,
    },
    #[serde(rename = "configured")]
    Configured {
        version: Version,
        request_id: String,
        vessel_id: VesselId,
        configuration: NotesConfiguration,
        #[serde(with = "crate::decimal")]
        #[schemars(with = "String")]
        workspace_version: u64,
    },
    #[serde(rename = "applied")]
    Applied {
        version: Version,
        request_id: String,
        vessel_id: VesselId,
        snapshot: Snapshot,
    },
    #[serde(rename = "rejected")]
    Rejected {
        version: Version,
        request_id: String,
        vessel_id: VesselId,
        expected_revision: Option<String>,
        message: String,
    },
    #[serde(rename = "uncertain")]
    Uncertain {
        version: Version,
        request_id: String,
        vessel_id: VesselId,
        expected_revision: String,
        message: String,
    },
}

#[cfg(test)]
mod tests {
    #[test]
    fn configuration_request_requires_a_boolean_and_rejects_unknown_fields() {
        let request = serde_json::json!({"operation":"content.configure", "version":"1", "requestId":"configure", "vesselId":"note", "expectedVersion":"3", "configuration":{"showHeading":false}});
        assert!(serde_json::from_value::<super::Request>(request.clone()).is_ok());
        for configuration in [
            serde_json::json!({"showHeading":"false"}),
            serde_json::json!({"showHeading":false,"extra":true}),
        ] {
            let mut invalid = request.clone();
            invalid["configuration"] = configuration;
            assert!(serde_json::from_value::<super::Request>(invalid).is_err());
        }
    }
}
