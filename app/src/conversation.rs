use serde_json::Value;
use voyager_contract::conversation::{Message, Phase, Role, Snapshot};

pub(crate) fn fail(state: &mut Snapshot, error: String, phase: Phase) -> bool {
    if !matches!(
        state.phase,
        Phase::Completed | Phase::Interrupted | Phase::Failed
    ) {
        state.phase = phase;
    }
    state.error = Some(error);
    true
}

pub(crate) fn notification(state: &mut Snapshot, value: &Value, request: &str) -> bool {
    let Some(params) = value.get("params") else {
        return false;
    };
    let Some(thread) = state.thread.as_deref() else {
        return false;
    };
    if params.get("threadId").and_then(Value::as_str) != Some(thread) {
        return false;
    }
    match value.get("method").and_then(Value::as_str) {
        Some("item/agentMessage/delta" | "item/completed") if state.phase == Phase::Working => {
            if state.limited {
                return false;
            }
            let Some(turn) = state.turn.as_deref() else {
                return false;
            };
            if params.get("turnId").and_then(Value::as_str) != Some(turn) {
                return false;
            }
            let completed = value["method"] == "item/completed";
            if completed
                && params.pointer("/item/type").and_then(Value::as_str) != Some("agentMessage")
            {
                return false;
            }
            let (Some(id), Some(text)) = (if completed {
                (
                    params.pointer("/item/id").and_then(Value::as_str),
                    params.pointer("/item/text").and_then(Value::as_str),
                )
            } else {
                (
                    params.get("itemId").and_then(Value::as_str),
                    params.get("delta").and_then(Value::as_str),
                )
            }) else {
                return false;
            };
            if id.is_empty() {
                return false;
            }
            let existing = state.messages.iter().find(|message| {
                message.id == id && message.role == Role::Assistant && message.request_id == request
            });
            let next_size = if completed {
                text.len()
            } else {
                existing.map_or(0, |m| m.text.len()) + text.len()
            };
            let retained = state
                .messages
                .iter()
                .map(|message| message.text.len())
                .sum::<usize>();
            if next_size > 65536
                || retained + next_size.saturating_sub(existing.map_or(0, |m| m.text.len()))
                    > 256 * 1024
                || state.messages.len() >= 128
            {
                state.limited = true;
                state.error=Some("The private response exceeded its display bound. It was not truncated or replayed.".into());
                return true;
            }
            if let Some(message) = state.messages.iter_mut().find(|message| {
                message.id == id && message.role == Role::Assistant && message.request_id == request
            }) {
                if completed {
                    message.text = text.into();
                } else {
                    message.text.push_str(text);
                }
            } else {
                let context = state
                    .messages
                    .iter()
                    .rev()
                    .find(|message| message.role == Role::User && message.request_id == request)
                    .and_then(|message| message.context.clone());
                state.messages.push(Message {
                    id: id.into(),
                    request_id: request.into(),
                    role: Role::Assistant,
                    text: text.into(),
                    context,
                });
            }
        }
        Some("error")
            if state.turn.is_some()
                && params.get("turnId").and_then(Value::as_str) == state.turn.as_deref() =>
        {
            state.error = params
                .pointer("/error/message")
                .and_then(Value::as_str)
                .map(str::to_owned);
            if params.get("willRetry").and_then(Value::as_bool) != Some(true) {
                state.phase = Phase::Failed;
            }
        }
        Some("turn/completed")
            if state.turn.is_some()
                && params.pointer("/turn/id").and_then(Value::as_str) == state.turn.as_deref() =>
        {
            state.phase = match params.pointer("/turn/status").and_then(Value::as_str) {
                Some("completed") => Phase::Completed,
                Some("interrupted") => Phase::Interrupted,
                _ => Phase::Failed,
            };
            if !state.limited {
                state.error = params
                    .pointer("/turn/error/message")
                    .and_then(Value::as_str)
                    .map(str::to_owned);
            }
        }
        _ => return false,
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn missing_provider_identity_cannot_become_a_visible_message() {
        let mut state = Snapshot {
            thread: Some("private".into()),
            phase: Phase::Working,
            ..Snapshot::default()
        };
        let incomplete = json!({"method":"item/agentMessage/delta","params":{"threadId":"private","itemId":"answer","delta":"Unbound text"}});
        assert!(!notification(&mut state, &incomplete, "request-one"));
        assert!(!notification(
            &mut state,
            &json!({"method":"turn/started","params":{"threadId":"private","turn":{"id":"unconfirmed-turn"}}}),
            "request-one"
        ));
        assert!(state.turn.is_none());
        assert!(state.messages.is_empty());
    }

    #[test]
    fn private_projection_accepts_only_visible_messages_from_its_actual_turn() {
        let mut state = Snapshot {
            thread: Some("private".into()),
            turn: Some("turn-one".into()),
            phase: Phase::Working,
            ..Snapshot::default()
        };
        let visible = json!({"method":"item/agentMessage/delta","params":{"threadId":"private","turnId":"turn-one","itemId":"answer","delta":"Hello"}});
        assert!(notification(&mut state, &visible, "request-one"));
        let before = state.clone();
        for (method, thread, turn) in [
            ("item/reasoning/textDelta", "private", "turn-one"),
            ("item/agentMessage/delta", "other", "turn-one"),
            ("item/agentMessage/delta", "private", "other"),
        ] {
            let mut wrong = visible.clone();
            wrong["method"] = method.into();
            wrong["params"]["threadId"] = thread.into();
            wrong["params"]["turnId"] = turn.into();
            assert!(!notification(&mut state, &wrong, "request-one"));
            assert_eq!(state, before);
        }
        assert!(notification(
            &mut state,
            &json!({"method":"item/completed","params":{"threadId":"private","turnId":"turn-one","item":{"type":"agentMessage","id":"answer","text":"Hello world"}}}),
            "request-one"
        ));
        assert_eq!(state.messages[0].text, "Hello world");
        assert!(notification(
            &mut state,
            &json!({"method":"turn/completed","params":{"threadId":"private","turn":{"id":"turn-one","status":"completed","error":null}}}),
            "request-one"
        ));
        assert_eq!(state.phase, Phase::Completed);
        assert_eq!(state.messages[0].request_id, "request-one");
    }

    #[test]
    fn oversized_visible_output_keeps_its_display_error_after_completion() {
        let mut state = Snapshot {
            thread: Some("private".into()),
            turn: Some("turn".into()),
            phase: Phase::Working,
            ..Snapshot::default()
        };
        assert!(notification(
            &mut state,
            &json!({"method":"item/agentMessage/delta","params":{"threadId":"private","turnId":"turn","itemId":"answer","delta":"x".repeat(65537)}}),
            "request"
        ));
        assert_eq!(state.phase, Phase::Working);
        assert!(state.limited);
        assert!(state.messages.is_empty());
        assert!(state.error.is_some());
        notification(
            &mut state,
            &json!({"method":"turn/completed","params":{"threadId":"private","turn":{"id":"turn","status":"completed","error":null}}}),
            "request",
        );
        assert!(
            state.error.is_some(),
            "Native completion hid the display-bound error"
        );
    }

    #[test]
    fn connection_loss_preserves_a_confirmed_completed_turn() {
        let mut state = Snapshot {
            phase: Phase::Completed,
            ..Snapshot::default()
        };
        fail(
            &mut state,
            "Private provider disconnected".into(),
            Phase::Unconfirmed,
        );
        assert_eq!(state.phase, Phase::Completed);
        fail(
            &mut state,
            "Late acknowledgement refused".into(),
            Phase::Failed,
        );
        assert_eq!(state.phase, Phase::Completed);
        assert!(state.error.is_some());
    }
}
