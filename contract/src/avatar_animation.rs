use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Configuration {
    #[schemars(range(min = 1, max = 1))]
    pub version: u8,
    pub pack: String,
    pub rest_pose: String,
    pub triggers: Triggers,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Triggers {
    pub hover: Option<String>,
    pub click: Option<String>,
    pub dock: Option<String>,
    pub undock: Option<String>,
}

#[derive(Clone, Copy, Debug)]
pub enum Trigger {
    Hover,
    Click,
    Dock,
    Undock,
}

impl Triggers {
    pub fn clip(&self, trigger: Trigger) -> Option<&str> {
        match trigger {
            Trigger::Hover => self.hover.as_deref(),
            Trigger::Click => self.click.as_deref(),
            Trigger::Dock => self.dock.as_deref(),
            Trigger::Undock => self.undock.as_deref(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Pack {
    #[schemars(range(min = 1, max = 1))]
    pub version: u8,
    pub id: String,
    pub canvas: Canvas,
    pub images: BTreeMap<String, String>,
    pub poses: BTreeMap<String, Pose>,
    pub clips: BTreeMap<String, Clip>,
    #[schemars(length(max = 0))]
    pub effects: BTreeMap<String, ()>,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Canvas {
    pub size: [u32; 2],
    pub anchor: [f32; 2],
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Pose {
    pub image: String,
    pub rect: [u32; 4],
    pub anchor: [f32; 2],
    pub scale: f32,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Clip {
    pub from: String,
    pub steps: Vec<Step>,
    pub easing: [f32; 4],
    #[schemars(length(max = 0))]
    pub effects: Vec<()>,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Step {
    pub pose: String,
    pub fade_ms: u32,
    pub hold_ms: u32,
}
