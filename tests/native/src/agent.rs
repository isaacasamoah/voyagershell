use std::io::{BufRead, Write};
use std::path::Path;
use std::process::{Command, Stdio};

const AGENT_NAME: &str = "claude";

pub fn invoked_as_agent() -> bool {
    std::env::args_os()
        .next()
        .and_then(|name| Path::new(&name).file_name().map(|name| name == AGENT_NAME))
        .unwrap_or(false)
}

fn hook_commands(settings: &str) -> Vec<String> {
    let parsed: serde_json::Value = serde_json::from_str(settings).unwrap_or_default();
    parsed["hooks"]["UserPromptSubmit"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|entry| entry["hooks"].as_array().into_iter().flatten())
        .filter_map(|hook| hook["command"].as_str().map(str::to_owned))
        .collect()
}

fn context_of(command: &str, prompt: &str) -> Option<String> {
    let mut child = Command::new("sh")
        .args(["-c", command])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .ok()?;
    let input = serde_json::json!({"hook_event_name":"UserPromptSubmit","prompt":prompt});
    child.stdin.take()?.write_all(input.to_string().as_bytes()).ok()?;
    let output = child.wait_with_output().ok()?;
    let parsed: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
    parsed["hookSpecificOutput"]["additionalContext"]
        .as_str()
        .map(str::to_owned)
}

pub fn run() -> i32 {
    let mut task: Vec<String> = std::env::args().skip(1).collect();
    let mut hooks = Vec::new();
    if let Some(at) = task.iter().position(|argument| argument == "--settings")
        && at + 1 < task.len()
    {
        hooks = hook_commands(&task[at + 1]);
        task.drain(at..=at + 1);
    }
    println!("Stand-in {AGENT_NAME} took the task: {}", task.join(" "));
    for line in std::io::stdin().lock().lines() {
        match line {
            Ok(line) => {
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
            }
            Err(_) => return 1,
        }
    }
    0
}
