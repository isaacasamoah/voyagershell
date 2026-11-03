use crate::{
    core::{Core, Error, MAX_INPUT_BYTES},
    core_shapes::Terminal,
    scope,
};
use std::sync::Arc;
use voyager_contract::{
    ContentId, Context, CoreTerminalId, Layout,
    administrator::{ProcessAction, ProcessInfo, ProcessOutput},
};

fn refused(message: &str) -> Error {
    Error::Rejected {
        kind: "invalid_process".into(),
        message: message.into(),
    }
}

fn info(content: &ContentId, terminal: Terminal) -> ProcessInfo {
    let reported_activity = Some(Arc::new(Core::reported_activity(&terminal)));
    ProcessInfo {
        content_id: content.clone(),
        terminal_id: CoreTerminalId(terminal.address),
        pid: terminal.pid,
        cwd: terminal.cwd,
        state: terminal.state,
        foreground: terminal.foreground.map(|process| process.name),
        reported_activity,
    }
}

fn stop_result(target: ProcessInfo, observed: ProcessInfo) -> Result<ProcessOutput, Error> {
    if observed.terminal_id != target.terminal_id
        || !matches!(observed.state.as_str(), "live" | "finished")
        || observed.pid.is_some_and(|pid| Some(pid) != target.pid)
        || observed.state == "live" && observed.pid.is_none()
    {
        return Err(Error::Uncertain(
            "Core stop returned an unexpected terminal, process identity or state; do not repeat"
                .into(),
        ));
    }
    Ok(ProcessOutput::Stop { target, observed })
}

pub(crate) fn run(
    core: &mut Core,
    layout: &Arc<Layout>,
    context: &Context,
    action: &ProcessAction,
) -> Result<ProcessOutput, Error> {
    let visible = scope::project(layout, Some(context));
    if visible.containers().next().is_none() {
        return Err(refused("The request's captured focus no longer exists"));
    }
    let target = match action {
        ProcessAction::List => None,
        ProcessAction::Read {
            content_id,
            terminal_id,
            ..
        }
        | ProcessAction::Send {
            content_id,
            terminal_id,
            ..
        }
        | ProcessAction::Interrupt {
            content_id,
            terminal_id,
            ..
        }
        | ProcessAction::Stop {
            content_id,
            terminal_id,
            ..
        } => Some((content_id, terminal_id)),
    };
    if let Some((content, address)) = target {
        let binding = visible
            .contents
            .iter()
            .find(|item| &item.id == content)
            .ok_or_else(|| {
                refused("That content is outside the request's captured avatar focus")
            })?;
        if binding.type_id != "terminal" || binding.backend.as_ref() != Some(address) {
            return Err(refused(
                "The content does not match the inspected terminal identity",
            ));
        }
        if binding.start_pending.is_some() && !matches!(action, ProcessAction::Read { .. }) {
            return Err(refused(
                "This content has an unconfirmed start. No process input was sent.",
            ));
        }
        if matches!(action, ProcessAction::Read { lines, .. } if *lines > 160) {
            return Err(refused("Read at most 160 history lines above the screen"));
        }
        if matches!(action, ProcessAction::Send { text, .. } if text.len() > MAX_INPUT_BYTES) {
            return Err(refused(
                "Process input exceeds the owner's byte limit; nothing was submitted",
            ));
        }
        let terminal = core.terminal_get(&address.0)?;
        if terminal.address != address.0 {
            return Err(refused(
                "Core returned a different terminal identity; nothing was submitted",
            ));
        }
        let target = info(content, terminal);
        match action {
            ProcessAction::Read { lines, .. } => {
                let read = core.terminal_read(&address.0, *lines)?;
                let limited = read.text.len() > 16 * 1024;
                let text = if limited {
                    read.text[read.text.ceil_char_boundary(read.text.len() - 16 * 1024)..]
                        .to_owned()
                } else {
                    read.text
                };
                Ok(ProcessOutput::Read {
                    target,
                    text,
                    complete: read.complete && !limited,
                    how: read.how,
                    why: read.why,
                    limited,
                })
            }
            ProcessAction::Send { pid, text, .. } => {
                if target.state != "live" || *pid == 0 || target.pid != Some(*pid) {
                    return Err(refused(
                        "The inspected running process identity has changed or ended; nothing was submitted",
                    ));
                }
                let sent = core.terminal_send(&address.0, text)?;
                Ok(ProcessOutput::Send {
                    target,
                    turn: sent.turn,
                    started: sent.started,
                    status: sent.status,
                })
            }
            ProcessAction::Interrupt { pid, .. } => {
                if target.state != "live" || *pid == 0 || target.pid != Some(*pid) {
                    return Err(refused(
                        "The inspected running process identity has changed or ended; no interrupt was sent",
                    ));
                }
                let interrupted = core.terminal_interrupt(&address.0)?;
                Ok(ProcessOutput::Interrupt {
                    target,
                    key: interrupted.key,
                    outcome: interrupted.outcome,
                })
            }
            ProcessAction::Stop { pid, .. } => {
                if target.state != "live" || *pid == 0 || target.pid != Some(*pid) {
                    return Err(refused(
                        "The inspected running process identity has changed or ended; no stop was sent",
                    ));
                }
                let observed = core.terminal_kill(&address.0)?;
                stop_result(target, info(content, observed))
            }
            ProcessAction::List => Err(refused("This operation does not target one terminal")),
        }
    } else {
        let listed = core.terminal_list()?;
        let mut processes = Vec::new();
        let mut unavailable = Vec::new();
        for binding in visible
            .contents
            .iter()
            .filter(|item| item.type_id == "terminal")
        {
            if let Some(address) = &binding.backend {
                if let Some(terminal) = listed.iter().find(|terminal| terminal.address == address.0)
                {
                    processes.push(info(&binding.id, terminal.clone()));
                } else {
                    unavailable.push(binding.id.clone());
                }
            }
        }
        Ok(ProcessOutput::List {
            processes,
            unavailable,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stop_result_distinguishes_observed_states_from_unconfirmed_results() {
        let target = ProcessInfo {
            content_id: ContentId("content-1".into()),
            terminal_id: CoreTerminalId("t1".into()),
            pid: Some(23),
            cwd: "/tmp".into(),
            state: "live".into(),
            foreground: None,
            reported_activity: None,
        };
        assert!(matches!(
            stop_result(target.clone(), target.clone()),
            Ok(ProcessOutput::Stop { observed, .. }) if observed.state == "live"
        ));
        let mut observed = target.clone();
        observed.pid = Some(24);
        assert!(matches!(
            stop_result(target.clone(), observed),
            Err(Error::Uncertain(_))
        ));
        let mut observed = target.clone();
        observed.pid = None;
        assert!(matches!(
            stop_result(target.clone(), observed),
            Err(Error::Uncertain(_))
        ));
        let mut observed = target.clone();
        observed.state = "finished".into();
        assert!(matches!(
            stop_result(target.clone(), observed.clone()),
            Ok(ProcessOutput::Stop { observed, .. }) if observed.state == "finished"
        ));
        observed.terminal_id = CoreTerminalId("t2".into());
        assert!(matches!(
            stop_result(target.clone(), observed),
            Err(Error::Uncertain(_))
        ));
        let mut observed = target.clone();
        observed.state = "unrecognized".into();
        assert!(matches!(
            stop_result(target, observed),
            Err(Error::Uncertain(_))
        ));
    }
}
