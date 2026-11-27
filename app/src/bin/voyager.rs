use std::process::ExitCode;
use voyager_contract::{
    Outcome, Reply, Request, Unapplied,
    socket::{SocketReply, SocketRequest},
};

const GUIDE: &str = include_str!("../../../docs/voyager-command.md");

const USAGE: &str = "Usage: voyager status
       voyager focus [--hook <agent>]
       voyager reply --hook <agent>
       voyager do workspace '<request json>'
       voyager --skill
       voyager start
       voyager update [--from <build folder>]
       voyager rollback
Run status, focus, reply and do inside a VoyagerShell Vessel. `voyager --skill` prints the agent guide.
start, update and rollback run from an installed build and need no Vessel.";

fn parse(arguments: &[String]) -> Result<SocketRequest, String> {
    match arguments {
        [command] if command == "status" => Ok(SocketRequest::Overview),
        [command] if command == "focus" => Ok(SocketRequest::Focus {
            spoken: false,
            prompt: None,
        }),
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
        SocketReply::Status { .. }
        | SocketReply::Overview { .. }
        | SocketReply::Focus { .. }
        | SocketReply::Noted => Outcome::Applied,
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

#[cfg(unix)]
fn install() -> Result<voyager_app::install::Install, String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    voyager_app::install::Install::locate(&executable).ok_or_else(|| {
        format!(
            "{} is not an installed build; run the voyager in an install's builds folder",
            executable.display()
        )
    })
}

#[cfg(unix)]
fn staged(staged: voyager_app::install::Staged) -> String {
    match staged {
        voyager_app::install::Staged::Next(name) => {
            format!("Build {name} is staged. Restart VoyagerShell or run voyager start to use it.")
        }
        voyager_app::install::Staged::AlreadyCurrent(name) => {
            format!("Build {name} is already current; nothing is staged.")
        }
        voyager_app::install::Staged::AlreadyNext(name) => format!(
            "Build {name} is already staged; nothing new is staged. Restart VoyagerShell or run voyager start to use it."
        ),
        voyager_app::install::Staged::Older { latest, current } => format!(
            "The latest release, {latest}, is older than the current build {current}; nothing is staged."
        ),
    }
}

#[cfg(unix)]
fn manage(arguments: &[String]) -> Option<Result<String, (ExitCode, String)>> {
    use voyager_app::app_start::{NotStarted, Started};
    let refused = |message: String| (ExitCode::from(1), message);
    let verb = match arguments {
        [verb] if verb == "start" || verb == "rollback" || verb == "update" => verb.as_str(),
        [verb, flag, _] if verb == "update" && flag == "--from" => "update --from",
        _ => return None,
    };
    Some(install().map_err(refused).and_then(|install| match verb {
        "start" => match voyager_app::app_start::start(&install) {
            Ok(Started::Raised) => Ok("VoyagerShell is already running; its window was raised.".into()),
            Ok(Started::Ready { build, log }) => {
                Ok(format!("VoyagerShell build {build} is running. Its log is {}.", log.display()))
            }
            Ok(Started::ReturnedToPrevious { failed, failed_log, build, log }) => Ok(format!(
                "Build {failed} exited before it was ready; its log is {}. Returned to build {build}, which is running. Its log is {}.",
                failed_log.display(),
                log.display()
            )),
            Err(NotStarted::Refused(message)) => Err(refused(message)),
            Err(NotStarted::Held { profile }) => Err((
                ExitCode::from(2),
                format!(
                    "Another VoyagerShell holds the profile {} but did not answer within the wait; no build was switched.",
                    profile.display()
                ),
            )),
            Err(NotStarted::Failed { build, log, status }) => Err(refused(format!(
                "Build {build} exited before it was ready ({status}). Its log is {}.",
                log.display()
            ))),
            Err(NotStarted::Uncertain { build, pid, log }) => Err((
                ExitCode::from(2),
                format!(
                    "Build {build} (pid {pid}) is neither ready nor ended. Its log is {}. Quit it, or run voyager rollback, before starting again.",
                    log.display()
                ),
            )),
        },
        "rollback" => install
            .rollback()
            .map(staged)
            .map_err(|error| refused(error.to_string())),
        "update" => voyager_app::release::update(&install)
            .map(staged)
            .map_err(refused),
        _ => {
            let source = std::path::Path::new(&arguments[2]);
            let name = install.add_from(source).map_err(refused)?;
            let message = install
                .stage(&name)
                .map(staged)
                .map_err(|error| refused(error.to_string()))?;
            let _ = install.prune(&voyager_app::install::running_executables());
            Ok(message)
        }
    }))
}

#[cfg(not(unix))]
fn manage(_: &[String]) -> Option<Result<String, (ExitCode, String)>> {
    None
}

fn main() -> ExitCode {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    match manage(&arguments) {
        Some(Ok(message)) => {
            println!("{message}");
            return ExitCode::SUCCESS;
        }
        Some(Err((code, message))) => {
            eprintln!("{message}");
            return code;
        }
        None => (),
    }
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
    if voyager_app::reply_hook::hook(&arguments, read_stdin, |request| send(&request).ok()) {
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
            if let SocketRequest::Workspace { request } = &request
                && let Some(sentence) = voyager_app::change_sentence::sentence(request, &reply)
            {
                eprintln!("{sentence}");
            }
            let text = match &reply {
                SocketReply::Overview { overview } => {
                    serde_json::to_string_pretty(&voyager_app::vessel_overview::printed(overview))
                }
                other => serde_json::to_string_pretty(other),
            };
            match text {
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
