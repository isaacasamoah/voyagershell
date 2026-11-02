use serde_json::Value;
use std::collections::VecDeque;
use voyager_contract::conversation::{Focus, Message, Phase, Role, Snapshot};
use voyager_contract::{Context, Layout, Vessel};

pub(crate) fn focus(layout: &Layout, revision: u64) -> Result<Focus, String> {
    let mut focus = Focus {
        scope: layout.context.clone(),
        path: vec!["Workspace".into()],
        cwd: None,
        revision,
    };
    if layout.context == Context::Workspace {
        return Ok(focus);
    }
    for voyage in &layout.voyages {
        if matches!(&layout.context, Context::Voyage { id } if id == &voyage.id) {
            focus.path.push(voyage.name.clone());
            focus.cwd = directory(
                layout,
                voyage
                    .fleets
                    .iter()
                    .flat_map(|fleet| fleet.vessels.iter())
                    .chain(voyage.portals.iter()),
            );
            return Ok(focus);
        }
        for fleet in &voyage.fleets {
            if matches!(&layout.context, Context::Fleet { id } if id == &fleet.id) {
                focus.path.extend([voyage.name.clone(), fleet.name.clone()]);
                focus.cwd = directory(layout, fleet.vessels.iter());
                return Ok(focus);
            }
            if let Some(placement) = fleet
                .vessels
                .iter()
                .find(|p| matches!(&layout.context, Context::Vessel { id } if id == &p.id))
            {
                let content = layout
                    .contents
                    .iter()
                    .find(|c| c.id == placement.content)
                    .ok_or("Focused content is missing")?;
                focus.path.extend([
                    voyage.name.clone(),
                    fleet.name.clone(),
                    content.type_id.clone(),
                ]);
                focus.cwd = Some(content.cwd.clone());
                return Ok(focus);
            }
        }
        if let Some(placement) = voyage
            .portals
            .iter()
            .find(|p| matches!(&layout.context, Context::Portal { id } if id == &p.id))
        {
            let content = layout
                .contents
                .iter()
                .find(|c| c.id == placement.content)
                .ok_or("Focused content is missing")?;
            focus
                .path
                .extend([voyage.name.clone(), format!("{} Portal", content.type_id)]);
            focus.cwd = Some(content.cwd.clone());
            return Ok(focus);
        }
    }
    Err("Focused workspace target is missing".into())
}

fn directory<'a>(layout: &Layout, placements: impl Iterator<Item = &'a Vessel>) -> Option<String> {
    let mut dirs = placements
        .filter_map(|placement| layout.contents.iter().find(|c| c.id == placement.content));
    let first = &dirs.next()?.cwd;
    dirs.all(|content| &content.cwd == first)
        .then(|| first.clone())
}

pub(crate) fn defer(state: &mut Snapshot, events: &mut VecDeque<Value>, value: Value) -> bool {
    if events.len() < 16 {
        events.push_back(value);
        return false;
    }
    state.limited = true;
    state.error = Some("The displayed response is incomplete because early provider events exceeded the display bound. Native work continues; nothing was replayed.".into());
    if value.get("method").and_then(Value::as_str) == Some("turn/completed") {
        events.pop_front();
        events.push_back(value);
    }
    true
}

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
                state.error=Some("The displayed response is incomplete because it exceeded its display bound. Native work continues; nothing was replayed.".into());
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
                    tool: None,
                });
            }
        }
        Some("error")
            if state.turn.is_some()
                && params.get("turnId").and_then(Value::as_str) == state.turn.as_deref() =>
        {
            let error = params
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("Private provider reported an error")
                .to_owned();
            let phase = if params.get("willRetry").and_then(Value::as_bool) == Some(true) {
                state.phase.clone()
            } else {
                Phase::Failed
            };
            return fail(state, error, phase);
        }
        Some("turn/completed")
            if state.turn.is_some()
                && params.pointer("/turn/id").and_then(Value::as_str) == state.turn.as_deref() =>
        {
            if matches!(
                state.phase,
                Phase::Completed | Phase::Interrupted | Phase::Failed
            ) {
                return false;
            }
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
    fn focus_names_and_directory_follow_the_dock_not_navigation() {
        let mut model = crate::workspace::Model::default();
        model
            .apply(voyager_contract::Action::CreateVoyage {
                name: "Alpha".into(),
                cwd: "/alpha".into(),
            })
            .unwrap();
        let voyage = model.layout.voyages[0].id.clone();
        let fleet = model.layout.voyages[0].fleets[0].id.clone();
        let placement = model.layout.voyages[0].fleets[0].vessels[0].clone();
        model
            .apply(voyager_contract::Action::CreateVoyage {
                name: "Beta".into(),
                cwd: "/beta".into(),
            })
            .unwrap();
        model
            .apply(voyager_contract::Action::Dock {
                context: Context::Vessel {
                    id: placement.id.clone(),
                },
            })
            .unwrap();
        let captured = focus(&model.layout, 42).unwrap();
        assert_eq!(captured.scope, model.layout.context);
        assert_eq!(
            captured.path,
            ["Workspace", "Alpha", "Workbench", "terminal"]
        );
        assert_eq!(captured.cwd.as_deref(), Some("/alpha"));
        assert_eq!(captured.revision, 42);
        model.layout.voyages[0].name = "Renamed".into();
        assert_eq!(captured.path[1], "Alpha");
        model.layout.context = Context::Fleet { id: fleet };
        assert_eq!(
            focus(&model.layout, 43).unwrap().path,
            ["Workspace", "Renamed", "Workbench"]
        );
        model.layout.context = Context::Voyage { id: voyage };
        assert_eq!(
            focus(&model.layout, 44).unwrap().cwd.as_deref(),
            Some("/alpha")
        );
        model.layout.voyages[0].portals.push(Vessel {
            id: voyager_contract::PlacementId("portal".into()),
            content: placement.content,
            name: None,
        });
        model.layout.context = Context::Portal {
            id: voyager_contract::PlacementId("portal".into()),
        };
        assert_eq!(
            focus(&model.layout, 45).unwrap().path,
            ["Workspace", "Renamed", "terminal Portal"]
        );
        model.layout.context = Context::Workspace;
        assert!(focus(&model.layout, 46).unwrap().cwd.is_none());
    }

    #[test]
    fn pre_ack_overflow_retains_loss_and_the_actual_terminal_outcome() {
        let mut state = Snapshot {
            thread: Some("thread".into()),
            phase: Phase::Working,
            ..Snapshot::default()
        };
        let mut events = VecDeque::new();
        for _ in 0..17 {
            defer(
                &mut state,
                &mut events,
                json!({"method":"item/agentMessage/delta","params":{"threadId":"thread","turnId":"turn","itemId":"answer","delta":"text"}}),
            );
        }
        assert_eq!(events.len(), 16);
        assert!(state.limited);
        defer(
            &mut state,
            &mut events,
            json!({"method":"turn/completed","params":{"threadId":"thread","turn":{"id":"turn","status":"completed","error":null}}}),
        );
        state.turn = Some("turn".into());
        for event in events {
            notification(&mut state, &event, "request");
        }
        assert_eq!(state.phase, Phase::Completed);
        assert!(state.limited && state.error.is_some());
        assert!(state.messages.is_empty());
    }

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
            thread: Some("private".into()),
            turn: Some("turn".into()),
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
        notification(
            &mut state,
            &json!({"method":"error","params":{"threadId":"private","turnId":"turn","willRetry":false,"error":{"message":"Late native error"}}}),
            "request",
        );
        assert_eq!(state.phase, Phase::Completed);
        notification(
            &mut state,
            &json!({"method":"turn/completed","params":{"threadId":"private","turn":{"id":"turn","status":"failed","error":null}}}),
            "request",
        );
        assert_eq!(state.phase, Phase::Completed);
    }
}
