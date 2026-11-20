use std::process::ExitCode;
use voyager_contract::{
    Outcome, Reply, Request, Unapplied,
    socket::{SocketReply, SocketRequest},
};

const GUIDE: &str = include_str!("../../../docs/voyager-command.md");

const USAGE: &str = "Usage: voyager status
       voyager focus [--hook <agent>]
       voyager do workspace '<request json>'
       voyager --skill
Run it inside a VoyagerShell Vessel. `voyager --skill` prints the agent guide.";

fn parse(arguments: &[String]) -> Result<SocketRequest, String> {
    match arguments {
        [command] if command == "status" => Ok(SocketRequest::Status),
        [command] if command == "focus" => Ok(SocketRequest::Focus { spoken: false }),
        [verb, family, request] if verb == "do" && family == "workspace" => {
            serde_json::from_str::<Request>(request)
                .map(|request| SocketRequest::Workspace {
                    request: Box::new(request),
                })
                .map_err(|error| format!("Invalid workspace request: {error}"))
        }
        _ => Err(USAGE.into()),
    }
}

#[cfg(unix)]
fn send(request: &SocketRequest) -> Result<SocketReply, (ExitCode, String)> {
    use std::io::{BufRead, BufReader, Write};
    let refused = |message: String| (ExitCode::from(1), message);
    let uncertain = |error: std::io::Error| {
        (
            ExitCode::from(2),
            format!(
                "The request was sent but its result is unconfirmed: {error}. Run voyager status before repeating it"
            ),
        )
    };
    let variable = |name: &str| {
        std::env::var(name)
            .map_err(|_| refused(format!("{name} is unset; run voyager inside a Vessel")))
    };
    let (session, terminal) = (variable("HC_SESSION")?, variable("HC_TERMINAL_ID")?);
    let path = voyager_app::vessel_socket::path(&session, &terminal).ok_or_else(|| {
        refused(format!(
            "Terminal {terminal} in session {session} has no Vessel socket"
        ))
    })?;
    let mut stream = std::os::unix::net::UnixStream::connect(&path).map_err(|error| {
        refused(format!(
            "No Vessel socket for terminal {terminal}: {error}. Is it placed in a running VoyagerShell?"
        ))
    })?;
    let mut encoded = serde_json::to_vec(request).map_err(|error| refused(error.to_string()))?;
    encoded.push(b'\n');
    stream
        .write_all(&encoded)
        .map_err(|error| refused(format!("Nothing was sent: {error}")))?;
    let mut line = String::new();
    BufReader::new(&stream)
        .read_line(&mut line)
        .map_err(uncertain)?;
    serde_json::from_str(&line).map_err(|error| uncertain(std::io::Error::other(error)))
}

#[cfg(not(unix))]
fn send(_: &SocketRequest) -> Result<SocketReply, (ExitCode, String)> {
    Err((
        ExitCode::from(1),
        "The voyager command needs a Unix socket; this platform is not supported yet".into(),
    ))
}

fn read_stdin() -> String {
    std::io::read_to_string(std::io::stdin()).unwrap_or_default()
}

fn code(reply: &SocketReply) -> ExitCode {
    let outcome = match reply {
        SocketReply::Status { .. } | SocketReply::Focus { .. } => Outcome::Applied,
        SocketReply::Refused { .. } => Outcome::Refused,
        SocketReply::Workspace {
            reply: Reply::Answered(response),
        } => response.status.clone(),
        SocketReply::Workspace {
            reply: Reply::Unanswered(unanswered),
        } => match unanswered.status {
            Unapplied::Refused => Outcome::Refused,
            Unapplied::Uncertain => Outcome::Uncertain,
        },
    };
    match outcome {
        Outcome::Applied => ExitCode::SUCCESS,
        Outcome::Refused => ExitCode::from(1),
        Outcome::Uncertain => ExitCode::from(2),
    }
}

fn main() -> ExitCode {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    if matches!(arguments.as_slice(), [flag] if flag == "--skill") {
        match voyager_app::launch::command_path() {
            Some(path) => print!(
                "This command is at {}. Run it by that full path when `voyager` is not on PATH, for example in a program started with `hc run`.\n\n",
                path.display()
            ),
            None => print!(""),
        }
        print!("{GUIDE}");
        return ExitCode::SUCCESS;
    }
    if matches!(arguments.as_slice(), [flag] if flag == "--help" || flag == "-h") {
        println!("{USAGE}");
        return ExitCode::SUCCESS;
    }
    if let Some(output) =
        voyager_app::focus_hook::hook(&arguments, read_stdin, |request| send(&request).ok())
    {
        print!("{output}");
        return ExitCode::SUCCESS;
    }
    let request = match parse(&arguments) {
        Ok(request) => request,
        Err(message) => {
            eprintln!("{message}");
            return ExitCode::from(1);
        }
    };
    match send(&request) {
        Ok(reply) => {
            match serde_json::to_string_pretty(&reply) {
                Ok(text) => println!("{text}"),
                Err(error) => eprintln!("{error}"),
            }
            code(&reply)
        }
        Err((code, message)) => {
            eprintln!("{message}");
            code
        }
    }
}
