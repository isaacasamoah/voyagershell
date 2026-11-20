use crate::focus_hook::DEADLINE;
use serde::Deserialize;
use voyager_contract::{
    reply::ReplyEvent,
    socket::{SocketReply, SocketRequest},
};

#[derive(Deserialize)]
struct Common {
    hook_event_name: String,
    agent_id: Option<String>,
}

#[derive(Deserialize)]
struct Display {
    prompt_id: String,
    message_id: String,
    index: u32,
    r#final: bool,
    delta: String,
}

#[derive(Deserialize)]
struct Stopped {
    prompt_id: String,
    last_assistant_message: String,
}

#[derive(Deserialize)]
struct Failed {
    prompt_id: Option<String>,
    error: String,
    error_details: Option<String>,
}

fn unreadable(event: &str, error: impl ToString) -> Option<ReplyEvent> {
    Some(ReplyEvent::Unreadable {
        event: event.into(),
        error: error.to_string(),
    })
}

pub fn claude_event(input: &str) -> Option<ReplyEvent> {
    let common: Common = match serde_json::from_str(input) {
        Ok(common) => common,
        Err(error) => return unreadable("unknown", error),
    };
    if common.agent_id.is_some() {
        return None;
    }
    let name = common.hook_event_name.as_str();
    match name {
        "MessageDisplay" => match serde_json::from_str::<Display>(input) {
            Ok(display) => Some(ReplyEvent::Text {
                turn: display.prompt_id,
                message: display.message_id,
                index: display.index,
                last: display.r#final,
                text: display.delta,
            }),
            Err(error) => unreadable(name, error),
        },
        "Stop" => match serde_json::from_str::<Stopped>(input) {
            Ok(stopped) => Some(ReplyEvent::TurnEnd {
                turn: stopped.prompt_id,
                text: stopped.last_assistant_message,
            }),
            Err(error) => unreadable(name, error),
        },
        "StopFailure" => match serde_json::from_str::<Failed>(input) {
            Ok(failed) => Some(ReplyEvent::TurnFailed {
                turn: failed.prompt_id,
                error: match failed.error_details {
                    Some(details) if !details.is_empty() => format!("{}: {details}", failed.error),
                    _ => failed.error,
                },
            }),
            Err(error) => unreadable(name, error),
        },
        _ => None,
    }
}

pub fn claude_hook(
    read: impl FnOnce() -> String + Send + 'static,
    ask: impl FnOnce(SocketRequest) -> Option<SocketReply> + Send + 'static,
) {
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        if let Some(event) = claude_event(&read()) {
            let _ = ask(SocketRequest::Reply { event });
        }
        let _ = sender.send(());
    });
    let _ = receiver.recv_timeout(DEADLINE);
}

pub fn hook(
    arguments: &[String],
    read: impl FnOnce() -> String + Send + 'static,
    ask: impl FnOnce(SocketRequest) -> Option<SocketReply> + Send + 'static,
) -> bool {
    match arguments {
        [command, flag, agent] if command == "reply" && flag == "--hook" && agent == "claude" => {
            claude_hook(read, ask);
            true
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::{
        sync::{Arc, Mutex},
        time::{Duration, Instant},
    };

    fn display(extra: serde_json::Value) -> String {
        let mut base = json!({
            "hook_event_name": "MessageDisplay", "session_id": "s", "turn_id": "x", "prompt_id": "p1",
            "message_id": "m1", "index": 2, "final": false, "delta": "line\n"
        });
        base.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        base.to_string()
    }

    #[test]
    fn a_message_display_becomes_one_text_event() {
        assert_eq!(
            claude_event(&display(json!({}))),
            Some(ReplyEvent::Text {
                turn: "p1".into(),
                message: "m1".into(),
                index: 2,
                last: false,
                text: "line\n".into()
            })
        );
    }

    #[test]
    fn stop_and_stop_failure_become_turn_ends() {
        let stop =
            json!({"hook_event_name":"Stop","prompt_id":"p1","last_assistant_message":"All done."});
        assert_eq!(
            claude_event(&stop.to_string()),
            Some(ReplyEvent::TurnEnd {
                turn: "p1".into(),
                text: "All done.".into()
            })
        );
        let failure = json!({"hook_event_name":"StopFailure","prompt_id":"p1","error":"rate_limit","error_details":"slow down"});
        assert_eq!(
            claude_event(&failure.to_string()),
            Some(ReplyEvent::TurnFailed {
                turn: Some("p1".into()),
                error: "rate_limit: slow down".into()
            })
        );
        let bare = json!({"hook_event_name":"StopFailure","error":"server_error"});
        assert_eq!(
            claude_event(&bare.to_string()),
            Some(ReplyEvent::TurnFailed {
                turn: None,
                error: "server_error".into()
            })
        );
    }

    #[test]
    fn a_subagent_event_and_an_unrelated_event_send_nothing() {
        assert_eq!(claude_event(&display(json!({"agent_id":"a1"}))), None);
        let other = json!({"hook_event_name":"UserPromptSubmit","prompt":"hi"});
        assert_eq!(claude_event(&other.to_string()), None);
    }

    #[test]
    fn a_renamed_or_missing_field_is_reported_as_unreadable() {
        let renamed = json!({"hook_event_name":"MessageDisplay","prompt_id":"p1","message_id":"m1","index":0,"final":true,"text":"x"});
        match claude_event(&renamed.to_string()) {
            Some(ReplyEvent::Unreadable { event, error }) => {
                assert_eq!(event, "MessageDisplay");
                assert!(error.contains("delta"));
            }
            other => panic!("{other:?}"),
        }
        assert!(matches!(
            claude_event("not json"),
            Some(ReplyEvent::Unreadable { .. })
        ));
        let stop = json!({"hook_event_name":"Stop"});
        assert!(matches!(
            claude_event(&stop.to_string()),
            Some(ReplyEvent::Unreadable { .. })
        ));
    }

    #[test]
    fn the_hook_sends_one_reply_request() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        claude_hook(
            || display(json!({})),
            move |request| {
                sink.lock().unwrap().push(request);
                Some(SocketReply::Noted)
            },
        );
        assert!(matches!(
            seen.lock().unwrap().as_slice(),
            [SocketRequest::Reply {
                event: ReplyEvent::Text { .. }
            }]
        ));
    }

    #[test]
    fn a_stalled_socket_or_stdin_returns_within_the_deadline() {
        let started = Instant::now();
        claude_hook(
            || display(json!({})),
            |_| {
                std::thread::sleep(Duration::from_secs(5));
                None
            },
        );
        claude_hook(
            || {
                std::thread::sleep(Duration::from_secs(5));
                String::new()
            },
            |_| None,
        );
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn only_the_claude_reply_flag_is_taken() {
        let words = |list: &[&str]| list.iter().map(|w| w.to_string()).collect::<Vec<_>>();
        assert!(hook(
            &words(&["reply", "--hook", "claude"]),
            String::new,
            |_| None
        ));
        assert!(!hook(
            &words(&["reply", "--hook", "other"]),
            String::new,
            |_| None
        ));
        assert!(!hook(&words(&["reply"]), String::new, |_| None));
    }
}
