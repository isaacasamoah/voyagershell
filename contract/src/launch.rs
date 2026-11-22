use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Launch {
    #[default]
    Terminal,
    Program {
        argv: Vec<String>,
    },
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Deserialize, Serialize, JsonSchema)]
#[serde(try_from = "LaunchRecord", into = "LaunchRecord")]
#[schemars(with = "LaunchRecord")]
pub enum LaunchSpec {
    #[default]
    Terminal,
    Program {
        argv: Vec<String>,
    },
    Agent {
        kind: String,
        model: Option<String>,
        effort: Option<Effort>,
        permissions: Option<Permissions>,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LaunchRecord {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub argv: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<Effort>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permissions: Option<Permissions>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Defaults {
    Table,
    Plain,
}

pub const TERMINAL_TYPE: &str = "terminal";
pub const AGENT_TYPE: &str = "agent";

pub fn is_terminal_backed(type_id: &str) -> bool {
    type_id == TERMINAL_TYPE || type_id == AGENT_TYPE
}

pub const TERMINAL_KIND: &str = "terminal";
pub const PROGRAM_KIND: &str = "program";

impl TryFrom<LaunchRecord> for LaunchSpec {
    type Error = String;

    fn try_from(record: LaunchRecord) -> Result<Self, String> {
        let LaunchRecord {
            kind,
            argv,
            model,
            effort,
            permissions,
        } = record;
        match kind.as_str() {
            TERMINAL_KIND
                if argv.is_none()
                    && model.is_none()
                    && effort.is_none()
                    && permissions.is_none() =>
            {
                Ok(Self::Terminal)
            }
            TERMINAL_KIND => Err("A terminal launch takes no settings".into()),
            PROGRAM_KIND if model.is_none() && effort.is_none() && permissions.is_none() => argv
                .map(|argv| Self::Program { argv })
                .ok_or_else(|| "A program launch needs an argv".into()),
            PROGRAM_KIND => Err("A program launch takes only an argv".into()),
            _ if argv.is_some() => Err("An agent launch takes no argv".into()),
            _ if kind.trim().is_empty() => Err("An agent launch needs a kind".into()),
            _ => Ok(Self::Agent {
                kind,
                model,
                effort,
                permissions,
            }),
        }
    }
}

impl From<LaunchSpec> for LaunchRecord {
    fn from(spec: LaunchSpec) -> Self {
        let empty = |kind: &str| Self {
            kind: kind.into(),
            argv: None,
            model: None,
            effort: None,
            permissions: None,
        };
        match spec {
            LaunchSpec::Terminal => empty(TERMINAL_KIND),
            LaunchSpec::Program { argv } => Self {
                argv: Some(argv),
                ..empty(PROGRAM_KIND)
            },
            LaunchSpec::Agent {
                kind,
                model,
                effort,
                permissions,
            } => Self {
                model,
                effort,
                permissions,
                ..empty(&kind)
            },
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Effort {
    Low,
    Medium,
    #[default]
    High,
    Xhigh,
    Max,
    Ultra,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Permissions {
    #[default]
    Yolo,
    WorkspaceWrite,
    ReadOnly,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LaunchEntry {
    pub id: String,
    pub name: String,
    pub launch: LaunchSpec,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LaunchSettings {
    pub default: String,
    pub entries: Vec<LaunchEntry>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Catalog {
    pub settings: LaunchSettings,
    pub available: Vec<String>,
    pub errors: Vec<String>,
    pub path: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentTable {
    pub agents: Vec<AgentProgram>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentProgram {
    pub id: String,
    pub name: String,
    pub programs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default)]
    pub seeded: bool,
    #[serde(default)]
    pub launch: AgentLaunch,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentLaunch {
    #[serde(default)]
    pub argv: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<ModelSetting>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<EffortSetting>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permissions: Option<PermissionSetting>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelSetting {
    pub default: String,
    pub flags: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EffortSetting {
    pub default: Effort,
    pub flags: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PermissionSetting {
    pub default: Permissions,
    pub yolo: Vec<String>,
    pub workspace_write: Vec<String>,
    pub read_only: Vec<String>,
}
