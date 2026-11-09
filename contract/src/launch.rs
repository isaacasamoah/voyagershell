use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Launch {
    #[default]
    Terminal,
    Codex {
        #[serde(default = "model")]
        model: String,
        #[serde(default)]
        effort: Effort,
        #[serde(default)]
        permissions: Permissions,
    },
    Program {
        argv: Vec<String>,
    },
}

fn model() -> String {
    "gpt-6.1-sol".into()
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
    pub launch: Launch,
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

impl Default for LaunchSettings {
    fn default() -> Self {
        Self {
            default: "terminal".into(),
            entries: vec![
                LaunchEntry {
                    id: "terminal".into(),
                    name: "Terminal".into(),
                    launch: Launch::Terminal,
                },
                LaunchEntry {
                    id: "codex".into(),
                    name: "Codex".into(),
                    launch: Launch::Codex {
                        model: model(),
                        effort: Effort::default(),
                        permissions: Permissions::default(),
                    },
                },
                LaunchEntry {
                    id: "claude".into(),
                    name: "Claude".into(),
                    launch: Launch::Program {
                        argv: vec!["claude".into()],
                    },
                },
            ],
        }
    }
}
