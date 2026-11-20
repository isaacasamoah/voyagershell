use crate::core_shapes::Terminal;
use serde_json::json;
use std::{path::Path, time::Duration};
use voyager_contract::{
    Vessel,
    context::Focus,
    launch::Launch,
    socket::{SocketReply, SocketRequest},
};

pub const DEADLINE: Duration = Duration::from_millis(200);

const PROGRAM: &str = "claude";
const FRESH: &str = "--session-id";
const RESUME: &str = "--resume";
const NAME: &str = "voyager";
pub(crate) const DEFAULT_ARGV: [&str; 5] =
    [PROGRAM, "--model", "claude-sonnet-5-5", "--effort", "low"];

const IDENTITY: &str = "You are Voyager, the private administrator of this person's VoyagerShell workspace. You act with their authority through the voyager and hc commands. Run voyager status before you change the workspace, and report what actually happened, including refusals and uncertain results. Working Vessels make project, source and configuration changes. You inspect, arrange, delegate and verify. The person's dock arrives with each prompt and says what they are looking at. Keep replies brief and factual.";

fn value<'a>(argv: &'a [String], flags: &[&str]) -> Option<&'a str> {
    argv.windows(2)
        .find(|pair| flags.contains(&pair[0].as_str()))
        .map(|pair| pair[1].as_str())
}

pub(crate) fn saved_launch(session: &str) -> Launch {
    Launch::Program {
        argv: vec![PROGRAM.into(), FRESH.into(), session.into()],
    }
}

pub(crate) fn session(vessel: &Vessel) -> Option<&str> {
    match vessel.launch.as_ref()? {
        Launch::Program { argv } => value(argv, &[FRESH]),
        _ => None,
    }
}

fn quoted(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', "'\\''"))
}

pub(crate) fn voyager_arguments(
    session: &str,
    resume: bool,
    command: Option<&Path>,
) -> Vec<String> {
    let mut words = vec![
        if resume { RESUME } else { FRESH }.to_owned(),
        session.to_owned(),
        "-n".into(),
        NAME.into(),
        "--append-system-prompt".into(),
        IDENTITY.into(),
    ];
    if let Some(command) = command {
        let hook = format!("{} focus --hook {PROGRAM}", quoted(command));
        let settings =
            json!({"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":hook}]}]}});
        words.extend(["--settings".into(), settings.to_string()]);
    }
    words
}

pub(crate) fn runs(terminal: &Terminal, session: &str) -> bool {
    terminal.is_live()
        && terminal
            .argv
            .first()
            .is_some_and(|program| program.to_ascii_lowercase().contains(PROGRAM))
        && value(&terminal.argv, &[FRESH, RESUME]) == Some(session)
        && value(&terminal.argv, &["-n"]) == Some(NAME)
}

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

pub fn hook(
    arguments: &[String],
    ask: impl FnOnce(SocketRequest) -> Option<SocketReply> + Send + 'static,
) -> Option<String> {
    match arguments {
        [command, flag, agent] if command == "focus" && flag == "--hook" && agent == "claude" => {
            Some(claude_hook(ask))
        }
        _ => None,
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

    #[test]
    fn only_the_claude_hook_flag_is_taken() {
        let words = |list: &[&str]| list.iter().map(|w| w.to_string()).collect::<Vec<_>>();
        assert_eq!(
            hook(&words(&["focus", "--hook", "claude"]), |_| None),
            Some(String::new())
        );
        assert_eq!(hook(&words(&["focus", "--hook", "other"]), |_| None), None);
        assert_eq!(hook(&words(&["focus"]), |_| None), None);
    }
}
