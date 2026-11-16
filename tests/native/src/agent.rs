use std::io::BufRead;
use std::path::Path;

const AGENT_NAME: &str = "claude";

pub fn invoked_as_agent() -> bool {
    std::env::args_os()
        .next()
        .and_then(|name| Path::new(&name).file_name().map(|name| name == AGENT_NAME))
        .unwrap_or(false)
}

pub fn run() -> i32 {
    let task: Vec<String> = std::env::args().skip(1).collect();
    println!("Stand-in {AGENT_NAME} took the task: {}", task.join(" "));
    for line in std::io::stdin().lock().lines() {
        match line {
            Ok(line) => println!("Stand-in {AGENT_NAME} heard: {line}"),
            Err(_) => return 1,
        }
    }
    0
}
