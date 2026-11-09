use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
#[schemars(inline)]
pub enum Rank {
    #[default]
    Crew,
    Captain,
    Commodore,
    Admiral,
}

impl Rank {
    pub fn is_crew(&self) -> bool {
        *self == Self::Crew
    }
}
