use crate::VesselId;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub problems: Vec<String>,
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

fn plain_integer(schema: &mut schemars::Schema) {
    schema.remove("format");
    if schema.get("maximum").is_none() {
        schema.insert("maximum".into(), serde_json::json!(u32::MAX));
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    #[schemars(transform = plain_integer)]
    pub contract: u32,
    pub id: String,
    pub name: String,
    #[schemars(transform = plain_integer)]
    pub version: u32,
    pub state: StateDecl,
    #[serde(default)]
    pub local: Option<StateDecl>,
    #[serde(default)]
    pub concurrency: Concurrency,
    pub actions: BTreeMap<String, ActionDecl>,
    pub view: ViewDecl,
    #[serde(default)]
    pub lifecycle: Lifecycle,
    #[serde(default)]
    pub presence: Presence,
    #[serde(default)]
    pub orbit: Vec<OrbitEntry>,
    #[serde(default)]
    pub dock: Vec<DockEntry>,
    #[serde(default)]
    pub backend: Option<BackendDecl>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StateDecl {
    pub schema: serde_json::Value,
    pub initial: serde_json::Value,
    #[serde(default)]
    pub migrations: Vec<Migration>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Migration {
    #[schemars(transform = plain_integer)]
    pub from: u32,
    pub set: BTreeMap<String, serde_json::Value>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Concurrency {
    #[serde(default)]
    pub default: ConcurrencyMode,
    #[serde(default)]
    pub merge: Vec<String>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ConcurrencyMode {
    #[default]
    Turns,
    Merge,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionDecl {
    #[serde(default)]
    pub params: BTreeMap<String, String>,
    pub rebase: Rebase,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub risk: Option<Risk>,
    pub effect: Vec<Effect>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Rebase {
    ByKey,
    Always,
    Refuse,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Risk {
    Confirm,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "op", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Effect {
    Set {
        path: String,
        value: serde_json::Value,
    },
    Push {
        path: String,
        value: serde_json::Value,
    },
    Remove {
        path: String,
    },
    Move {
        path: String,
        to: String,
        index: String,
    },
    Backend,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ViewDecl {
    pub source: String,
    #[serde(default)]
    pub islands: BTreeMap<String, Island>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Island {
    pub script: String,
    #[serde(default)]
    pub props: BTreeMap<String, String>,
    #[serde(default)]
    pub actions: Vec<String>,
    pub budget: Budget,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Budget {
    #[schemars(transform = plain_integer)]
    pub ms: u32,
    #[schemars(transform = plain_integer)]
    pub mb: u32,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Lifecycle {
    #[serde(default)]
    pub open: OpenMode,
    #[serde(default)]
    pub close: CloseMode,
    #[serde(default)]
    pub retire: RetireMode,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum OpenMode {
    #[default]
    Render,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum CloseMode {
    #[default]
    KeepState,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum RetireMode {
    #[default]
    RefuseNewActions,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Presence {
    #[serde(default)]
    pub attribution: Attribution,
    #[serde(default)]
    pub show: Vec<PresenceShow>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Attribution {
    #[default]
    None,
    PerEntity,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum PresenceShow {
    Avatars,
    LastActor,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OrbitEntry {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub short: Option<String>,
    pub icon: String,
    pub group: OrbitGroup,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pinned: Option<bool>,
    pub run: Run,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum OrbitGroup {
    Act,
    Ask,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Run {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub args: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub ask: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DockEntry {
    pub id: String,
    pub label: String,
    pub trigger: DockTrigger,
    pub default: Toggle,
    pub read: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum DockTrigger {
    OnDock,
    WhileDocked,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Toggle {
    On,
    Off,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackendDecl {
    pub kind: BackendKind,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum BackendKind {
    CoreDocument,
    CoreTerminal,
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
