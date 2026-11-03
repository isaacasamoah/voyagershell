use serde_json::Value;
use std::path::PathBuf;
use voyager_contract::conversation::{Focus, Phase};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Support {
    Unavailable,
    Protocol,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Capabilities {
    pub text: Support,
    pub tools: Support,
    pub interruption: Support,
    pub voice: Support,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Operation {
    Initialize,
    OpenConversation,
    StartTurn,
    InterruptTurn,
}

pub(crate) struct ToolDefinition {
    pub name: &'static str,
    pub description: &'static str,
    pub schema: Value,
}

pub(crate) enum Command {
    Initialize,
    OpenConversation {
        model: String,
        effort: String,
        cwd: PathBuf,
        tools: Vec<ToolDefinition>,
        instructions: &'static str,
    },
    StartTurn {
        thread: String,
        text: String,
        effort: String,
        focus: Option<Focus>,
    },
    InterruptTurn {
        thread: String,
        turn: String,
    },
}

impl Command {
    pub fn operation(&self) -> Operation {
        match self {
            Self::Initialize => Operation::Initialize,
            Self::OpenConversation { .. } => Operation::OpenConversation,
            Self::StartTurn { .. } => Operation::StartTurn,
            Self::InterruptTurn { .. } => Operation::InterruptTurn,
        }
    }
}

pub(crate) enum Answer {
    Initialized,
    Conversation {
        thread: String,
        model: Option<String>,
    },
    Turn {
        id: String,
    },
    Acknowledged,
}

pub(crate) enum Outcome {
    Applied(Answer),
    Rejected(String),
    Unconfirmed(String),
}

#[derive(Clone, Debug)]
pub(crate) enum Visible {
    Message {
        thread: String,
        turn: String,
        item: String,
        text: String,
        complete: bool,
    },
    Started {
        thread: String,
        turn: String,
    },
    Completed {
        thread: String,
        turn: String,
        phase: Phase,
        error: Option<String>,
    },
    Error {
        thread: String,
        turn: String,
        message: String,
        retrying: bool,
    },
}

#[derive(Clone, Debug)]
pub(crate) struct ToolCall {
    pub id: Value,
    pub thread: String,
    pub turn: String,
    pub call: String,
    pub name: String,
    pub namespace: Option<Value>,
    pub arguments: Value,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ToolResult {
    pub success: bool,
    pub text: String,
}

pub(crate) enum ToolReply {
    Result {
        id: Value,
        result: ToolResult,
    },
    Error {
        id: Value,
        code: i64,
        message: String,
    },
}

pub(crate) enum Event {
    Response {
        id: u64,
        outcome: Outcome,
    },
    Visible(Visible),
    Tool(Box<ToolCall>),
    CallbackError {
        id: Value,
        code: i64,
        message: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn codex_normalizes_visible_identity_and_filters_private_items() {
        let event = json!({"method":"item/completed","params":{"threadId":"private","turnId":"turn","item":{"type":"agentMessage","id":"answer","text":"visible"}}});
        assert!(
            matches!(crate::codex::normalize(event.clone(), None), Some(Event::Visible(Visible::Message { thread, turn, item, text, complete: true })) if thread == "private" && turn == "turn" && item == "answer" && text == "visible")
        );
        let mut reasoning = event;
        reasoning["params"]["item"]["type"] = "reasoning".into();
        assert!(crate::codex::normalize(reasoning, None).is_none());
        assert!(crate::codex::normalize(json!({"method":"item/agentMessage/delta","params":{"threadId":"private","itemId":"answer","delta":"unbound"}}), None).is_none());
    }

    #[test]
    fn codex_normalizes_only_the_correlated_reply_and_exact_callback_identity() {
        let reply = json!({"id":7,"result":{"turn":{"id":"actual-turn"}}});
        assert!(crate::codex::normalize(reply.clone(), Some((6, Operation::StartTurn))).is_none());
        assert!(
            matches!(crate::codex::normalize(reply, Some((7, Operation::StartTurn))), Some(Event::Response { id: 7, outcome: Outcome::Applied(Answer::Turn { id }) }) if id == "actual-turn")
        );
        assert!(matches!(
            crate::codex::normalize(json!({"id":7,"result":{}}), Some((7, Operation::StartTurn))),
            Some(Event::Response {
                outcome: Outcome::Unconfirmed(_),
                ..
            })
        ));
        assert!(
            matches!(crate::codex::normalize(json!({"id":7,"error":{"message":"known refusal"}}), Some((7, Operation::InterruptTurn))), Some(Event::Response { outcome: Outcome::Rejected(message), .. }) if message == "known refusal")
        );
        for id in [json!("callback"), json!(u64::MAX)] {
            let callback = json!({"id":id,"method":"item/tool/call","params":{"threadId":"thread","turnId":"turn","callId":"call","tool":"voyager_workspace","arguments":{"expectedVersion":"0","action":{"operation":"inspect"}}}});
            let Some(Event::Tool(call)) = crate::codex::normalize(callback.clone(), None) else {
                panic!("Missing normalized tool call");
            };
            assert_eq!(call.id, id);
            assert_eq!(
                (&call.thread, &call.turn, &call.call, &call.name),
                (
                    &"thread".into(),
                    &"turn".into(),
                    &"call".into(),
                    &"voyager_workspace".into()
                )
            );
            assert_eq!(call.arguments, callback["params"]["arguments"]);
            let reply = crate::codex::encode_tool_reply(&ToolReply::Result {
                id: call.id,
                result: ToolResult {
                    success: false,
                    text: "Rejected".into(),
                },
            });
            assert_eq!(reply["id"], id);
            assert_eq!(reply["result"]["success"], false);
            assert_eq!(reply["result"]["contentItems"][0]["text"], "Rejected");
        }
        let error = crate::codex::encode_tool_reply(&ToolReply::Error {
            id: json!("callback"),
            code: -32001,
            message: "Response capacity reached".into(),
        });
        assert_eq!(
            error,
            json!({"id":"callback","error":{"code":-32001,"message":"Response capacity reached"}})
        );
    }

    #[test]
    fn unavailable_voice_keeps_the_text_and_tool_boundary_usable() {
        let capabilities = Capabilities {
            text: Support::Protocol,
            tools: Support::Protocol,
            interruption: Support::Protocol,
            voice: Support::Unavailable,
        };
        let mut state = voyager_contract::conversation::Snapshot {
            thread: Some("thread".into()),
            turn: Some("turn".into()),
            phase: Phase::Working,
            ..Default::default()
        };
        assert!(crate::conversation::notification(
            &mut state,
            &Visible::Message {
                thread: "thread".into(),
                turn: "turn".into(),
                item: "answer".into(),
                text: "Text remains available".into(),
                complete: true
            },
            "request"
        ));
        assert_eq!(state.messages[0].text, "Text remains available");
        assert!(state.messages[0].tool.is_none());
        assert_eq!(capabilities.voice, Support::Unavailable);
        assert_eq!(capabilities.tools, Support::Protocol);
    }
}
