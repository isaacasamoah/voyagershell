use std::io::{BufRead, Write};
use std::path::Path;
use std::process::{Command, Stdio};

const AGENT_NAME: &str = "claude";
pub const SPOKEN_REPLY: &str = "Docked on this fleet.\n\nThe Fleet was already open.";
pub const TYPED_REPLY: &str = "Typed reply must stay silent.";

pub fn invoked_as_agent() -> bool {
    std::env::args_os()
        .next()
        .and_then(|name| Path::new(&name).file_name().map(|name| name == AGENT_NAME))
        .unwrap_or(false)
}

fn report(state: &str) {
    print!("\x1b]7501;state={state}:app=stand-in\x1b\\");
    let _ = std::io::stdout().flush();
}

fn hook_commands(settings: &str) -> Vec<String> {
    commands_for(settings, "UserPromptSubmit")
}

fn commands_for(settings: &str, event: &str) -> Vec<String> {
    let parsed: serde_json::Value = serde_json::from_str(settings).unwrap_or_default();
    parsed["hooks"][event]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|entry| entry["hooks"].as_array().into_iter().flatten())
        .filter_map(|hook| hook["command"].as_str().map(str::to_owned))
        .collect()
}

fn feed(command: &str, input: &serde_json::Value) -> Option<std::process::Output> {
    let mut child = Command::new("sh")
        .args(["-c", command])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;
    child
        .stdin
        .take()?
        .write_all(input.to_string().as_bytes())
        .ok()?;
    child.wait_with_output().ok()
}

pub fn reply_inputs(prompt_id: &str, text: &str) -> [(&'static str, serde_json::Value); 3] {
    [
        (
            "UserPromptSubmit",
            serde_json::json!({"hook_event_name":"UserPromptSubmit","prompt_id":prompt_id}),
        ),
        (
            "MessageDisplay",
            serde_json::json!({"hook_event_name":"MessageDisplay","prompt_id":prompt_id,"message_id":format!("message-{prompt_id}"),"index":0,"final":true,"delta":text}),
        ),
        (
            "Stop",
            serde_json::json!({"hook_event_name":"Stop","prompt_id":prompt_id,"last_assistant_message":text}),
        ),
    ]
}

fn turn(settings: &str, prompt_id: &str, prompt: &str, text: &str) {
    for (event, mut input) in reply_inputs(prompt_id, text) {
        if event == "UserPromptSubmit" {
            input["prompt"] = serde_json::json!(prompt);
        }
        for command in commands_for(settings, event) {
            let status = feed(&command, &input).map_or_else(
                || "did not run".to_owned(),
                |output| {
                    format!(
                        "exit {:?} {}",
                        output.status.code(),
                        String::from_utf8_lossy(&output.stderr).trim()
                    )
                },
            );
            println!("Stand-in {AGENT_NAME} ran the {event} hook for {prompt_id}: {status}");
        }
    }
}

fn context_of(command: &str, prompt: &str) -> Option<String> {
    let input = serde_json::json!({"hook_event_name":"UserPromptSubmit","prompt":prompt});
    let output = feed(command, &input)?;
    let parsed: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
    parsed["hookSpecificOutput"]["additionalContext"]
        .as_str()
        .map(str::to_owned)
}

pub fn run() -> i32 {
    let mut task: Vec<String> = std::env::args().skip(1).collect();
    let mut hooks = Vec::new();
    let mut settings = String::new();
    if let Some(at) = task.iter().position(|argument| argument == "--settings")
        && at + 1 < task.len()
    {
        settings = task[at + 1].clone();
        hooks = hook_commands(&settings);
        task.drain(at..=at + 1);
    }
    println!("Stand-in {AGENT_NAME} took the task: {}", task.join(" "));
    report("idle");
    let mut turns = 0u32;
    for line in std::io::stdin().lock().lines() {
        match line {
            Ok(line) => {
                let number = turns + 1;
                turns = number;
                report("working");
                if line.trim_start().starts_with("[spoken]") {
                    turn(
                        &settings,
                        &format!("typed-{number}"),
                        "A typed question",
                        TYPED_REPLY,
                    );
                    turn(&settings, &format!("spoken-{number}"), &line, SPOKEN_REPLY);
                    println!("Stand-in {AGENT_NAME} heard: {line}");
                    report("idle");
                    continue;
                }
                for hook in &hooks {
                    match context_of(hook, &line) {
                        Some(context) => println!(
                            "Stand-in {AGENT_NAME} was given: {}",
                            context
                                .replace(" is docked on ", " is docked on\nStand-in line: ")
                                .replace(". ", ".\nStand-in line: ")
                        ),
                        None => println!("Stand-in {AGENT_NAME} was given no context"),
                    }
                }
                println!("Stand-in {AGENT_NAME} heard: {line}");
                report("idle");
            }
            Err(_) => return 1,
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_reply_inputs_carry_the_fields_the_reply_hook_reads() {
        let [(first, submit), (second, display), (third, stop)] = reply_inputs("spoken-1", "Done.");
        assert_eq!(
            (first, second, third),
            ("UserPromptSubmit", "MessageDisplay", "Stop")
        );
        assert_eq!(submit["prompt_id"], "spoken-1");
        assert_eq!(display["prompt_id"], "spoken-1");
        assert_eq!(display["index"], 0);
        assert_eq!(display["final"], true);
        assert_eq!(display["delta"], "Done.");
        assert_eq!(stop["last_assistant_message"], "Done.");
    }

    #[test]
    fn commands_are_read_for_each_hook_event() {
        let settings = r#"{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"reply"}]}],"UserPromptSubmit":[{"hooks":[{"type":"command","command":"focus"}]}]}}"#;
        assert_eq!(commands_for(settings, "Stop"), vec!["reply"]);
        assert_eq!(hook_commands(settings), vec!["focus"]);
        assert!(commands_for(settings, "MessageDisplay").is_empty());
    }
}
