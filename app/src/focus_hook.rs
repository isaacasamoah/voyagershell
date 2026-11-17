use serde_json::json;
use std::time::Duration;
use voyager_contract::{
    context::Focus,
    socket::{SocketReply, SocketRequest},
};

pub const DEADLINE: Duration = Duration::from_millis(200);

pub fn claude_output(focus: &Focus) -> String {
    let record = serde_json::to_string(focus).unwrap_or_default();
    let text = format!(
        "VoyagerShell focus at this prompt: The user is docked on {}. This is the app's dock context now, so no tool call is needed to learn it.\n{record}",
        focus.path.join(" > ")
    );
    json!({"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":text}})
        .to_string()
}

pub fn claude_hook(
    ask: impl FnOnce(SocketRequest) -> Option<SocketReply> + Send + 'static,
) -> String {
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = sender.send(ask(SocketRequest::Focus));
    });
    match receiver.recv_timeout(DEADLINE) {
        Ok(Some(SocketReply::Focus { focus })) => claude_output(&focus),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use voyager_contract::Context;

    fn focus() -> Focus {
        Focus {
            scope: Context::Workspace,
            path: vec!["Home".into(), "Crew".into(), "crew".into()],
            cwd: Some("/work".into()),
            revision: 7,
            preview: None,
        }
    }

    #[test]
    fn the_output_is_a_user_prompt_submit_context_that_names_the_dock() {
        let output: serde_json::Value = serde_json::from_str(&claude_output(&focus())).unwrap();
        let hook = &output["hookSpecificOutput"];
        assert_eq!(hook["hookEventName"], "UserPromptSubmit");
        let text = hook["additionalContext"].as_str().unwrap();
        assert!(text.contains("Home > Crew > crew"));
        assert!(text.contains("\"revision\":\"7\""));
    }

    #[test]
    fn a_reply_that_is_not_a_focus_prints_nothing() {
        let refused = SocketReply::Refused {
            message: "no".into(),
        };
        assert_eq!(claude_hook(move |_| Some(refused)), "");
        assert_eq!(claude_hook(|_| None), "");
    }

    #[test]
    fn a_stalled_socket_prints_nothing_within_the_deadline() {
        let started = std::time::Instant::now();
        let output = claude_hook(|_| {
            std::thread::sleep(Duration::from_secs(5));
            None
        });
        assert_eq!(output, "");
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn a_focus_reply_prints_the_hook_output() {
        let reply = SocketReply::Focus { focus: focus() };
        let output = claude_hook(move |request| {
            assert_eq!(request, SocketRequest::Focus);
            Some(reply)
        });
        assert!(output.contains("UserPromptSubmit"));
    }
}
