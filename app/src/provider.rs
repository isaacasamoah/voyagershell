use crate::voice_host::Package;
use serde_json::Value;
use std::path::PathBuf;
use voyager_contract::{
    context::Focus,
    conversation::{Phase, Role},
};

pub(crate) trait Provider {
    fn request(&mut self, id: u64, command: Command) -> Result<(), String>;
    fn initialized(&mut self, version: Option<String>) -> Result<(), String>;
    fn reply(&mut self, reply: &ToolReply, content: bool) -> Result<(), String>;
    fn voice_package(&self) -> Result<Package, String>;
    fn shutdown(&mut self) -> Result<(), String>;
}

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
    pub voice: voyager_contract::voice::Capability,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Operation {
    Initialize,
    OpenConversation,
    StartTurn,
    InterruptTurn,
    ReadAccount,
    StartAudio,
    StopAudio,
}

impl Operation {
    pub fn audio(self) -> bool {
        matches!(self, Self::ReadAccount | Self::StartAudio | Self::StopAudio)
    }
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
        instructions: String,
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
    ReadAccount,
    StartAudio {
        thread: String,
        session: String,
        offer: String,
        focus: Focus,
        instructions: &'static str,
    },
    StopAudio {
        thread: String,
    },
}

impl Command {
    pub fn operation(&self) -> Operation {
        match self {
            Self::Initialize => Operation::Initialize,
            Self::OpenConversation { .. } => Operation::OpenConversation,
            Self::StartTurn { .. } => Operation::StartTurn,
            Self::InterruptTurn { .. } => Operation::InterruptTurn,
            Self::ReadAccount => Operation::ReadAccount,
            Self::StartAudio { .. } => Operation::StartAudio,
            Self::StopAudio { .. } => Operation::StopAudio,
        }
    }
}

pub(crate) enum Answer {
    Initialized {
        version: Option<String>,
    },
    Conversation {
        thread: String,
        model: Option<String>,
    },
    Turn {
        id: String,
    },
    Account {
        native: bool,
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

#[derive(Clone, Debug)]
pub(crate) struct Transcript {
    pub thread: String,
    pub session: Option<String>,
    pub item: String,
    pub role: Option<Role>,
    pub text: String,
    pub delta: bool,
}

pub(crate) enum AudioEvent {
    Started {
        thread: String,
        session: String,
        supported: bool,
    },
    Answer {
        thread: String,
        answer: String,
    },
    Closed {
        thread: String,
    },
    Failed {
        thread: String,
    },
    Transcript(Transcript),
}

pub(crate) enum Event {
    Response {
        id: u64,
        outcome: Outcome,
    },
    Visible(Visible),
    Tool(Box<ToolCall>),
    Audio(AudioEvent),
    CallbackError {
        id: Value,
        code: i64,
        message: String,
    },
}

#[cfg(test)]
pub(crate) struct StandIn(pub std::sync::Arc<std::sync::Mutex<Vec<String>>>);

#[cfg(test)]
impl Provider for StandIn {
    fn request(&mut self, id: u64, command: Command) -> Result<(), String> {
        let seen = match command {
            Command::OpenConversation {
                model,
                effort,
                instructions,
                ..
            } => format!("{id} open {model} {effort} {instructions}"),
            Command::StartTurn { text, effort, .. } => format!("{id} turn {text} {effort}"),
            other => format!("{id} {:?}", other.operation()),
        };
        self.0
            .lock()
            .map_err(|_| "Stand-in record unavailable")?
            .push(seen);
        Ok(())
    }

    fn initialized(&mut self, _: Option<String>) -> Result<(), String> {
        let mut seen = self.0.lock().map_err(|_| "Stand-in record unavailable")?;
        seen.push("initialized".into());
        Ok(())
    }

    fn reply(&mut self, _: &ToolReply, _: bool) -> Result<(), String> {
        Err("The stand-in offers no tools".into())
    }

    fn voice_package(&self) -> Result<Package, String> {
        Err("The stand-in has no voice".into())
    }

    fn shutdown(&mut self) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unavailable_voice_keeps_the_text_and_tool_boundary_usable() {
        let capabilities = Capabilities {
            text: Support::Protocol,
            tools: Support::Protocol,
            interruption: Support::Protocol,
            voice: voyager_contract::voice::Capability::Unavailable {
                reason: "Text-only provider".into(),
            },
        };
        let audio = crate::voice::Shared::new(capabilities.voice.clone());
        let lease = audio.binding().unwrap();
        assert!(audio.begin(&lease).is_err());
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
        assert_eq!(audio.snapshot().unwrap().generation, 0);
        assert_eq!(capabilities.tools, Support::Protocol);
    }
}
