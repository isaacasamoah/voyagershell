use crate::core_shapes::Terminal;
use crate::spoken::is_spoken;
use serde::Deserialize;
use serde_json::json;
use std::{path::Path, time::Duration};
use voyager_contract::{
    Vessel,
    context::Focus,
    launch::Launch,
    socket::{SocketReply, SocketRequest},
};

pub const DEADLINE: Duration = Duration::from_millis(200);
pub const PROMPT_WAIT: Duration = Duration::from_millis(50);

const PROGRAM: &str = "claude";
const FRESH: &str = "--session-id";
const RESUME: &str = "--resume";
const NAME: &str = "voyager";
pub(crate) const DEFAULT_ARGV: [&str; 5] =
    [PROGRAM, "--model", "claude-sonnet-5-5", "--effort", "low"];

const BACKGROUND: &str = "VOYAGER_BACKGROUND";

const IDENTITY: &str = "You are Voyager, the private administrator of this person's VoyagerShell workspace. This is the app's background Voyager session, which runs with VOYAGER_BACKGROUND=1. You act with their authority through the voyager and hc commands. Run voyager --skill to learn how to work in the app. Run voyager status before you change the workspace, and report what actually happened, including refusals and uncertain results. Working Vessels make project, source and configuration changes. You inspect, arrange, delegate and verify. The person's dock arrives with each prompt and says what they are looking at. Keep replies brief and factual.";

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

fn hooks(command: &Path) -> serde_json::Value {
    let command = quoted(command);
    let focus = json!([{"hooks":[{"type":"command","command":format!("{command} focus --hook {PROGRAM}")}]}]);
    let reply = json!([{"hooks":[{"type":"command","async":true,"command":format!("{command} reply --hook {PROGRAM}")}]}]);
    json!({
        "UserPromptSubmit":focus,
        "MessageDisplay":reply,
        "Stop":reply,
        "StopFailure":reply})
}

fn settings(command: Option<&Path>) -> serde_json::Value {
    let mut settings = json!({"env":{BACKGROUND:"1"}});
    if let Some(command) = command {
        settings["hooks"] = hooks(command);
    }
    settings
}

pub(crate) fn voyager_arguments(
    session: &str,
    resume: bool,
    command: Option<&Path>,
) -> Vec<String> {
    vec![
        if resume { RESUME } else { FRESH }.to_owned(),
        session.to_owned(),
        "-n".into(),
        NAME.into(),
        "--append-system-prompt".into(),
        format!(
            "{IDENTITY} {} {}",
            crate::spoken::reply_rule(),
            crate::spoken::policy_rule()
        ),
        "--settings".into(),
        settings(command).to_string(),
    ]
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
        "VoyagerShell focus at this prompt: The user is docked on {}. This is the app's dock context now, so no tool call is needed to learn it.\n{record}\n{}",
        focus.path.join(" > "),
        crate::spoken::reply_rule()
    );
    json!({"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":text}})
        .to_string()
}

#[derive(Deserialize)]
struct Submitted {
    #[serde(default)]
    prompt: String,
    prompt_id: Option<String>,
}

fn spoken(input: &str) -> Option<String> {
    let submitted = serde_json::from_str::<Submitted>(input).ok()?;
    if !is_spoken(&submitted.prompt) {
        return None;
    }
    let id = submitted.prompt_id.filter(|id| !id.is_empty());
    if id.is_none() {
        eprintln!("A spoken prompt arrived with no prompt_id, so it is treated as typed");
    }
    id
}

pub fn claude_hook(
    read: impl FnOnce() -> String + Send + 'static,
    ask: impl FnOnce(SocketRequest) -> Option<SocketReply> + Send + 'static,
) -> String {
    let started = std::time::Instant::now();
    let (prompt_sender, prompt_receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = prompt_sender.send(spoken(&read()));
    });
    let prompt = prompt_receiver.recv_timeout(PROMPT_WAIT).ok().flatten();
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = sender.send(ask(SocketRequest::Focus {
            spoken: prompt.is_some(),
            prompt,
        }));
    });
    match receiver.recv_timeout(DEADLINE.saturating_sub(started.elapsed())) {
        Ok(Some(SocketReply::Focus { focus })) => claude_output(&focus),
        _ => String::new(),
    }
}

pub fn hook(
    arguments: &[String],
    read: impl FnOnce() -> String + Send + 'static,
    ask: impl FnOnce(SocketRequest) -> Option<SocketReply> + Send + 'static,
) -> Option<String> {
    match arguments {
        [command, flag, agent] if command == "focus" && flag == "--hook" && agent == "claude" => {
            Some(claude_hook(read, ask))
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
    fn the_launch_settings_carry_one_sync_focus_hook_and_three_async_reply_hooks() {
        let settings = settings(Some(Path::new("/opt/it's/voyager")));
        let hooks = &settings["hooks"];
        assert_eq!(hooks.as_object().unwrap().len(), 4);
        let command = |event: &str| hooks[event][0]["hooks"][0].clone();
        assert!(command("UserPromptSubmit").get("async").is_none());
        assert!(
            command("UserPromptSubmit")["command"]
                .as_str()
                .unwrap()
                .ends_with(" focus --hook claude")
        );
        for event in ["MessageDisplay", "Stop", "StopFailure"] {
            assert_eq!(command(event)["async"], true, "{event}");
            assert!(
                command(event)["command"]
                    .as_str()
                    .unwrap()
                    .ends_with(" reply --hook claude"),
                "{event}"
            );
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
        assert!(text.ends_with(&crate::spoken::reply_rule()));
    }

    #[test]
    fn a_reply_that_is_not_a_focus_prints_nothing() {
        let refused = SocketReply::Refused {
            message: "no".into(),
        };
        assert_eq!(claude_hook(String::new, move |_| Some(refused)), "");
        assert_eq!(claude_hook(String::new, |_| None), "");
    }

    #[test]
    fn a_stalled_socket_prints_nothing_within_the_deadline() {
        let started = std::time::Instant::now();
        let output = claude_hook(String::new, |_| {
            std::thread::sleep(Duration::from_secs(5));
            None
        });
        assert_eq!(output, "");
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn a_focus_reply_prints_the_hook_output() {
        let reply = SocketReply::Focus { focus: focus() };
        let output = claude_hook(String::new, move |request| {
            assert_eq!(
                request,
                SocketRequest::Focus {
                    spoken: false,
                    prompt: None
                }
            );
            Some(reply)
        });
        assert!(output.contains("UserPromptSubmit"));
    }

    #[test]
    fn only_the_claude_hook_flag_is_taken() {
        let words = |list: &[&str]| list.iter().map(|w| w.to_string()).collect::<Vec<_>>();
        assert_eq!(
            hook(&words(&["focus", "--hook", "claude"]), String::new, |_| {
                None
            }),
            Some(String::new())
        );
        assert_eq!(
            hook(&words(&["focus", "--hook", "other"]), String::new, |_| None),
            None
        );
        assert_eq!(hook(&words(&["focus"]), String::new, |_| None), None);
    }

    fn submitted(prompt: &str) -> String {
        json!({"session_id":"s","hook_event_name":"UserPromptSubmit","source":"user","prompt_id":"p1","prompt":prompt})
            .to_string()
    }

    fn asked(input: String) -> SocketRequest {
        let (sender, receiver) = std::sync::mpsc::channel();
        let reply = SocketReply::Focus { focus: focus() };
        claude_hook(
            move || input,
            move |request| {
                sender.send(request).unwrap();
                Some(reply)
            },
        );
        receiver.recv().unwrap()
    }

    #[test]
    fn a_spoken_prompt_sends_the_spoken_flag_and_a_typed_one_does_not() {
        assert_eq!(
            asked(submitted(&crate::spoken::prompt("rename the build tab"))),
            SocketRequest::Focus {
                spoken: true,
                prompt: Some("p1".into())
            }
        );
        assert_eq!(
            asked(submitted("rename the build tab")),
            SocketRequest::Focus {
                spoken: false,
                prompt: None
            }
        );
    }

    #[test]
    fn a_spoken_prompt_with_no_prompt_id_is_sent_as_typed() {
        let input =
            json!({"hook_event_name":"UserPromptSubmit","prompt":crate::spoken::prompt("open it")})
                .to_string();
        assert_eq!(
            asked(input),
            SocketRequest::Focus {
                spoken: false,
                prompt: None
            }
        );
    }

    #[test]
    fn an_unreadable_prompt_still_prints_the_dock_as_typed() {
        assert_eq!(
            asked("not json".into()),
            SocketRequest::Focus {
                spoken: false,
                prompt: None
            }
        );
        assert_eq!(
            asked(String::new()),
            SocketRequest::Focus {
                spoken: false,
                prompt: None
            }
        );
        assert_eq!(
            asked("{}".into()),
            SocketRequest::Focus {
                spoken: false,
                prompt: None
            }
        );
    }

    #[test]
    fn a_prompt_that_never_arrives_still_prints_the_dock_as_typed() {
        let (sender, receiver) = std::sync::mpsc::channel();
        let reply = SocketReply::Focus { focus: focus() };
        let started = std::time::Instant::now();
        let output = claude_hook(
            || {
                std::thread::sleep(Duration::from_secs(5));
                String::new()
            },
            move |request| {
                sender.send(request).unwrap();
                Some(reply)
            },
        );
        assert!(output.contains("UserPromptSubmit"));
        assert_eq!(
            receiver.recv().unwrap(),
            SocketRequest::Focus {
                spoken: false,
                prompt: None
            }
        );
        assert!(started.elapsed() < DEADLINE);
    }

    #[test]
    fn a_slow_socket_after_a_late_prompt_still_ends_within_the_deadline() {
        let started = std::time::Instant::now();
        let output = claude_hook(
            || {
                std::thread::sleep(Duration::from_secs(5));
                String::new()
            },
            |_| {
                std::thread::sleep(Duration::from_secs(5));
                None
            },
        );
        assert_eq!(output, "");
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn a_typed_focus_request_keeps_its_older_wire_form() {
        assert_eq!(
            serde_json::to_string(&SocketRequest::Focus {
                spoken: false,
                prompt: None
            })
            .unwrap(),
            r#"{"command":"focus"}"#
        );
        assert_eq!(
            serde_json::to_string(&SocketRequest::Focus {
                spoken: true,
                prompt: Some("p1".into())
            })
            .unwrap(),
            r#"{"command":"focus","spoken":true,"prompt":"p1"}"#
        );
        assert_eq!(
            serde_json::from_str::<SocketRequest>(r#"{"command":"focus"}"#).unwrap(),
            SocketRequest::Focus {
                spoken: false,
                prompt: None
            }
        );
    }

    #[test]
    fn the_voyager_launch_carries_the_spoken_rule_beside_its_identity() {
        let words = voyager_arguments("session-1", false, None);
        let at = words
            .iter()
            .position(|word| word == "--append-system-prompt")
            .unwrap();
        assert!(words[at + 1].starts_with(IDENTITY));
        assert!(words[at + 1].ends_with(&crate::spoken::policy_rule()));
        assert_eq!(
            words
                .iter()
                .filter(|word| *word == "--append-system-prompt")
                .count(),
            1
        );
    }

    fn settings_argument(words: &[String]) -> serde_json::Value {
        let at = words.iter().position(|word| word == "--settings").unwrap();
        assert_eq!(words.iter().filter(|word| *word == "--settings").count(), 1);
        serde_json::from_str(&words[at + 1]).unwrap()
    }

    #[test]
    fn the_launch_always_carries_the_background_env_and_adds_hooks_only_with_a_command() {
        let known = settings_argument(&voyager_arguments(
            "s1",
            false,
            Some(Path::new("/opt/voyager")),
        ));
        assert_eq!(known["env"]["VOYAGER_BACKGROUND"], "1");
        assert_eq!(known["hooks"].as_object().unwrap().len(), 4);
        let unknown = settings_argument(&voyager_arguments("s1", true, None));
        assert_eq!(unknown["env"]["VOYAGER_BACKGROUND"], "1");
        assert!(unknown.get("hooks").is_none());
    }

    #[test]
    fn the_background_env_stays_out_of_argv_so_the_session_is_still_recognised() {
        for command in [None, Some(Path::new("/opt/voyager"))] {
            let words = voyager_arguments("s1", false, command);
            let value_of = |flag: &str| words.iter().position(|word| word == flag).unwrap() + 1;
            let (settings_at, prompt_at) =
                (value_of("--settings"), value_of("--append-system-prompt"));
            assert!(
                words
                    .iter()
                    .enumerate()
                    .filter(|(index, _)| *index != settings_at && *index != prompt_at)
                    .all(|(_, word)| !word.contains(BACKGROUND))
            );
            let mut argv = vec![PROGRAM.to_owned()];
            argv.extend(words);
            let terminal: Terminal = serde_json::from_value(json!({
                "address":"t1", "labels":{}, "argv":argv, "cwd":"/work",
                "state":"live", "created_ms":0, "screen":"exact", "cols":80, "rows":24
            }))
            .unwrap();
            assert!(runs(&terminal, "s1"));
        }
    }

    #[test]
    fn the_identity_sends_voyager_to_its_skill_and_asks_for_the_reply_marker_once() {
        let words = voyager_arguments("s1", false, None);
        let at = words
            .iter()
            .position(|word| word == "--append-system-prompt")
            .unwrap();
        let prompt = &words[at + 1];
        assert!(prompt.contains("Run voyager --skill to learn how to work in the app."));
        assert_eq!(prompt.matches(crate::spoken::REPLY_MARKER).count(), 2);
        assert!(prompt.contains(&crate::spoken::reply_rule()));
    }

    #[test]
    fn the_identity_names_the_background_session_its_marker_and_that_the_marker_replaces_others() {
        let words = voyager_arguments("s1", true, None);
        let at = words
            .iter()
            .position(|word| word == "--append-system-prompt")
            .unwrap();
        let prompt = &words[at + 1];
        assert!(prompt.contains(
            "This is the app's background Voyager session, which runs with VOYAGER_BACKGROUND=1."
        ));
        assert!(prompt.contains("Your reply marker is [vy]"));
        assert!(prompt.contains("replaces any other reply marker your instructions name"));
        assert!(!prompt.to_lowercase().contains("oru"));
    }
}
