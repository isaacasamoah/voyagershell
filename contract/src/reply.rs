use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ReplyEvent {
    Text {
        turn: String,
        message: String,
        #[schemars(transform = crate::administrator::standard_integer)]
        index: u32,
        last: bool,
        text: String,
    },
    TurnEnd {
        text: String,
    },
    TurnFailed {
        error: String,
    },
    Unreadable {
        event: String,
        error: String,
    },
}
