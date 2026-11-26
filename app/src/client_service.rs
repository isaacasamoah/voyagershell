pub use crate::core::Error as ProgramError;
use crate::core::{Core, Error};
use crate::core_shapes::{RunParams, Terminal};
use std::{collections::HashMap, path::Path, sync::mpsc::SyncSender, thread, time::Duration};

pub const LABEL: &str = "voyager.service";
pub const WAIT: Duration = Duration::from_secs(8);

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProgramSpec {
    pub service: String,
    pub name: String,
    pub argv: Vec<String>,
    pub cwd: String,
    pub env: HashMap<String, String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProgramRequest {
    Start(ProgramSpec),
    Live {
        terminal: String,
    },
    Stop {
        terminal: String,
        service: String,
        program: String,
    },
    Status {
        terminal: String,
    },
    Send {
        terminal: String,
        text: String,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProgramReply {
    Started(String),
    Live(bool),
    Stopped,
    Status { live: bool, state: Option<String> },
    Sent,
}

fn serves(terminal: &Terminal, service: &str) -> bool {
    terminal.is_live() && terminal.labels.get(LABEL).map(String::as_str) == Some(service)
}

fn runs(terminal: &Terminal, service: &str, program: &str) -> bool {
    serves(terminal, service) && terminal.argv.first().map(Path::new) == Some(Path::new(program))
}

fn replaced<'a>(terminals: &'a [Terminal], service: &'a str) -> impl Iterator<Item = &'a str> {
    terminals
        .iter()
        .filter(move |terminal| serves(terminal, service))
        .map(|terminal| terminal.address.as_str())
}

pub(super) fn perform(
    core: &mut Core,
    request: ProgramRequest,
    reply: SyncSender<Result<ProgramReply, Error>>,
) {
    if let ProgramRequest::Send { terminal, text } = request {
        match core.begin_terminal_send(&terminal, &text) {
            Ok(pending) => {
                thread::spawn(move || {
                    let _ = reply.try_send(pending.wait().map(|_| ProgramReply::Sent));
                });
            }
            Err(error) => {
                let _ = reply.try_send(Err(error));
            }
        }
        return;
    }
    let _ = reply.try_send(perform_now(core, request));
}

fn perform_now(core: &mut Core, request: ProgramRequest) -> Result<ProgramReply, Error> {
    match request {
        ProgramRequest::Start(spec) => {
            let terminals = core.terminal_list()?;
            for address in replaced(&terminals, &spec.service) {
                core.terminal_kill(address)?;
            }
            let started = core.terminal_run_with(RunParams {
                argv: spec.argv,
                cwd: Some(spec.cwd),
                env: spec.env,
                name: Some(spec.name),
                labels: HashMap::from([(LABEL.into(), spec.service)]),
                no_parent: true,
                no_notify: true,
                ..Default::default()
            })?;
            Ok(ProgramReply::Started(started.address))
        }
        ProgramRequest::Live { terminal } => {
            Ok(ProgramReply::Live(core.terminal_get(&terminal)?.is_live()))
        }
        ProgramRequest::Status { terminal } => {
            let found = core.terminal_get(&terminal)?;
            let state = serde_json::to_value(&found)
                .ok()
                .and_then(|value| value["status"]["state"].as_str().map(str::to_owned));
            Ok(ProgramReply::Status {
                live: found.is_live(),
                state,
            })
        }
        ProgramRequest::Send { .. } => Err(Error::Rejected {
            kind: "invalid_request".into(),
            message: "A send is dispatched, never performed in place".into(),
        }),
        ProgramRequest::Stop {
            terminal,
            service,
            program,
        } => {
            let found = core.terminal_get(&terminal)?;
            if runs(&found, &service, &program) {
                core.terminal_kill(&terminal)?;
            }
            Ok(ProgramReply::Stopped)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn terminal(state: &str, service: Option<&str>, argv: &[&str]) -> Terminal {
        let labels = service.map_or(json!({}), |service| json!({ LABEL: service }));
        serde_json::from_value(json!({
            "address":"t4", "labels":labels, "argv":argv, "cwd":"/tmp",
            "state":state, "created_ms":0, "screen":"exact", "cols":80, "rows":24
        }))
        .unwrap()
    }

    #[test]
    fn only_a_live_program_with_the_service_label_and_path_is_the_service() {
        let live = terminal("live", Some("voice-engine"), &["/s/llama-server", "-m"]);
        assert!(runs(&live, "voice-engine", "/s/llama-server"));
        assert!(!runs(&live, "other", "/s/llama-server"));
        assert!(!runs(&live, "voice-engine", "/s/other"));
        let finished = terminal("finished", Some("voice-engine"), &["/s/llama-server"]);
        assert!(!runs(&finished, "voice-engine", "/s/llama-server"));
        let unlabelled = terminal("live", None, &["/s/llama-server"]);
        assert!(!runs(&unlabelled, "voice-engine", "/s/llama-server"));
    }

    #[test]
    fn a_start_replaces_every_live_program_with_its_label_whatever_its_path() {
        let mut terminals = vec![
            terminal("live", Some("voice-engine"), &["/old/llama-server"]),
            terminal("live", Some("voice-engine"), &["/new/llama-server"]),
            terminal("finished", Some("voice-engine"), &["/old/llama-server"]),
            terminal("live", Some("other"), &["/old/llama-server"]),
            terminal("live", None, &["/old/llama-server"]),
        ];
        for (index, terminal) in terminals.iter_mut().enumerate() {
            terminal.address = format!("t{index}");
        }
        assert_eq!(
            replaced(&terminals, "voice-engine").collect::<Vec<_>>(),
            ["t0", "t1"]
        );
    }
}
