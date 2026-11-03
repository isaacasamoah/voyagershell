use crate::provider::Transcript;
use voyager_contract::conversation::{Message, Snapshot};

pub(crate) fn notification(
    state: &mut Snapshot,
    value: &Transcript,
    generation: u64,
    session: &str,
) -> bool {
    if state.thread.as_deref() != Some(value.thread.as_str())
        || value.item.is_empty()
        || value.item.len() > 256
    {
        return false;
    }
    let request = format!("voice-{generation}");
    let id = format!("speech-{generation}:{}", value.item);
    let role = if value.delta {
        let Some(message) = state
            .messages
            .iter()
            .find(|message| message.id == id && message.request_id == request)
        else {
            return false;
        };
        message.role.clone()
    } else {
        if value.session.as_deref() != Some(session) {
            return false;
        }
        let Some(role) = value.role.clone() else {
            return false;
        };
        role
    };
    let text = value.text.as_str();
    let delta = value.delta;
    if id.len() > 300 {
        return false;
    }
    let existing = state
        .messages
        .iter()
        .find(|message| message.id == id && message.request_id == request);
    let old_size = existing.map_or(0, |message| message.text.len());
    let next_size = if delta {
        old_size.saturating_add(text.len())
    } else {
        text.len()
    };
    if next_size > 65536
        || state
            .messages
            .iter()
            .map(|message| message.text.len())
            .sum::<usize>()
            .saturating_add(next_size.saturating_sub(old_size))
            > 256 * 1024
    {
        state.limited = true;
        state.error = Some("The displayed voice transcript reached its limit. Native audio and accepted work continue without replay.".into());
        return true;
    }
    if let Some(message) = state
        .messages
        .iter_mut()
        .find(|message| message.id == id && message.request_id == request)
    {
        if delta {
            message.text.push_str(text);
        } else {
            message.text = text.into();
        }
    } else {
        while state.messages.len() >= 64
            || state
                .messages
                .iter()
                .map(|message| message.text.len())
                .sum::<usize>()
                > 192 * 1024
        {
            state.messages.remove(0);
            state.omitted = state.omitted.saturating_add(1);
        }
        state.messages.push(Message {
            id,
            request_id: request,
            role,
            text: text.into(),
            context: None,
            tool: None,
        });
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    fn notification(state: &mut Snapshot, value: &Value, generation: u64, session: &str) -> bool {
        match crate::codex::normalize(value.clone(), None) {
            Some(crate::provider::Event::Audio(crate::provider::AudioEvent::Transcript(event))) => {
                super::notification(state, &event, generation, session)
            }
            _ => false,
        }
    }

    #[test]
    fn voice_transcripts_keep_actual_item_and_session_identity_without_reasoning() {
        let mut state = Snapshot {
            thread: Some("private".into()),
            ..Snapshot::default()
        };
        let mut event = json!({"method":"thread/realtime/item/started","params":{"threadId":"private","item":{"id":"speech-1","realtimeSessionId":"session-2","type":"transcriptSegment","role":"user","text":""}}});
        assert!(notification(&mut state, &event, 2, "session-2"));
        let delta = json!({"method":"thread/realtime/item/transcript/delta","params":{"threadId":"private","itemId":"speech-1","delta":"hello"}});
        assert!(notification(&mut state, &delta, 2, "session-2"));
        assert_eq!(state.messages[0].text, "hello");
        assert!(!notification(&mut state, &delta, 3, "session-3"));
        event["method"] = json!("thread/realtime/item/completed");
        event["params"]["item"]["text"] = json!("hello world");
        assert!(notification(&mut state, &event, 2, "session-2"));
        assert_eq!(state.messages.len(), 1);
        assert_eq!(state.messages[0].text, "hello world");
        event["params"]["item"]["realtimeSessionId"] = json!("wrong-session");
        assert!(!notification(&mut state, &event, 2, "session-2"));
        event["params"]["threadId"] = json!("other-thread");
        assert!(!notification(&mut state, &event, 2, "session-2"));
        event["params"]["threadId"] = json!("private");
        event["params"]["item"]["realtimeSessionId"] = json!("session-2");
        event["params"]["item"]["type"] = json!("reasoning");
        assert!(!notification(&mut state, &event, 2, "session-2"));
        assert_eq!(state.messages[0].text, "hello world");
    }
}
