use crate::{
    core::{Core, Error, MAX_INPUT_BYTES, Pending},
    core_shapes::{InterruptResult, SendResult, Terminal},
    core_state::TerminalState,
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

fn info(content: &ContentId, terminal: Terminal, layout: &Layout) -> ProcessInfo {
    let reported_activity = Some(Arc::new(Core::reported_activity(&terminal)));
    let agent_name = crate::observation::conversation_name(&terminal).or_else(|| {
        layout
            .contents
            .iter()
            .find(|item| &item.id == content)
            .and_then(|binding| {
                crate::observation::agent_name(&crate::observation::directory(
                    binding,
                    Some(&terminal),
                ))
            })
    });
    let placement_names = layout
        .contents
        .iter()
        .find(|item| &item.id == content)
        .map(|binding| {
            let directory = crate::observation::directory(binding, Some(&terminal));
            layout
                .containers()
                .flat_map(|voyage| {
                    voyage
                        .fleets
                        .iter()
                        .flat_map(|fleet| &fleet.vessels)
                        .chain(&voyage.portals)
                })
                .filter(|placement| &placement.content == content)
                .map(|placement| voyager_contract::administrator::PlacementName {
                    placement_id: placement.id.clone(),
                    effective_name: crate::observation::effective_name(
                        placement, binding, &directory,
                    ),
                })
                .collect()
        })
        .unwrap_or_default();
    let live = terminal.is_live();
    ProcessInfo {
        content_id: content.clone(),
        terminal_id: CoreTerminalId(terminal.address),
        pid: terminal.pid,
        cwd: terminal.cwd,
        state: terminal.state.clone(),
        foreground: terminal
            .foreground
            .map(|process| process.name)
            .or_else(|| live.then(|| terminal.argv.first().cloned()).flatten()),
        agent_name,
        placement_names,
        reported_activity,
    }
}

fn is_live(state: &str) -> bool {
    TerminalState::parse(state) == TerminalState::Live
}

pub(crate) fn ended(state: &str) -> bool {
    TerminalState::parse(state) == TerminalState::Finished
}

fn stop_result(target: ProcessInfo, observed: ProcessInfo) -> Result<ProcessOutput, Error> {
    let observed_state = TerminalState::parse(&observed.state);
    if observed.terminal_id != target.terminal_id
        || observed_state.is_unknown()
        || observed.pid.is_some_and(|pid| Some(pid) != target.pid)
        || observed_state == TerminalState::Live && observed.pid.is_none()
    {
        return Err(Error::Uncertain(
            "Core stop returned an unexpected terminal, process identity or state; do not repeat"
                .into(),
        ));
    }
    Ok(ProcessOutput::Stop { target, observed })
}

pub(crate) enum Started {
    Ready(ProcessOutput),
    Waiting(Effect),
}

pub(crate) enum Effect {
    Send(ProcessInfo, Pending<SendResult>),
    Interrupt(ProcessInfo, Pending<InterruptResult>),
    Stop(ProcessInfo, Pending<Terminal>, Arc<Layout>),
}

impl Effect {
    pub(crate) fn wait(self) -> Result<ProcessOutput, Error> {
        match self {
            Self::Send(target, pending) => {
                let sent = pending.wait()?;
                Ok(ProcessOutput::Send {
                    target,
                    turn: sent.turn,
                    started: sent.started,
                    status: sent.status,
                })
            }
            Self::Interrupt(target, pending) => {
                let interrupted = pending.wait()?;
                Ok(ProcessOutput::Interrupt {
                    target,
                    key: interrupted.key,
                    outcome: interrupted.outcome,
                })
            }
            Self::Stop(target, pending, visible) => {
                let observed = pending.wait()?;
                let observed = info(&target.content_id, observed, &visible);
                stop_result(target, observed)
            }
        }
    }
}

pub(crate) fn start(
    core: &mut Core,
    layout: &Arc<Layout>,
    context: &Context,
    action: &ProcessAction,
) -> Result<Started, Error> {
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
        let target = info(content, terminal, &visible);
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
                Ok(Started::Ready(ProcessOutput::Read {
                    target,
                    text,
                    complete: read.complete && !limited,
                    how: read.how,
                    why: read.why,
                    limited,
                }))
            }
            ProcessAction::Send { pid, text, .. } => {
                if !is_live(&target.state) || *pid == 0 || target.pid != Some(*pid) {
                    return Err(refused(
                        "The inspected running process identity has changed or ended; nothing was submitted",
                    ));
                }
                Ok(Started::Waiting(Effect::Send(
                    target,
                    core.begin_terminal_send(&address.0, text)?,
                )))
            }
            ProcessAction::Interrupt { pid, .. } => {
                if !is_live(&target.state) || *pid == 0 || target.pid != Some(*pid) {
                    return Err(refused(
                        "The inspected running process identity has changed or ended; no interrupt was sent",
                    ));
                }
                Ok(Started::Waiting(Effect::Interrupt(
                    target,
                    core.begin_terminal_interrupt(&address.0)?,
                )))
            }
            ProcessAction::Stop { pid, .. } => {
                if !is_live(&target.state) || *pid == 0 || target.pid != Some(*pid) {
                    return Err(refused(
                        "The inspected running process identity has changed or ended; no stop was sent",
                    ));
                }
                Ok(Started::Waiting(Effect::Stop(
                    target,
                    core.begin_terminal_kill(&address.0)?,
                    visible,
                )))
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
                    processes.push(info(&binding.id, terminal.clone(), &visible));
                } else {
                    unavailable.push(binding.id.clone());
                }
            }
        }
        Ok(Started::Ready(ProcessOutput::List {
            processes,
            unavailable,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn named_agent_sessions_in_one_directory_remain_distinct() {
        let terminal: Terminal = serde_json::from_value(serde_json::json!({
            "address":"t1", "labels":{}, "argv":["codex"], "cwd":"/tmp/project",
            "state":"live", "created_ms":0, "screen":"exact", "cols":80, "rows":24,
            "title":"Review the canvas", "foreground":{"name":"codex", "cwd":"/tmp/project", "pid":17, "argv":["codex"]}
        })).unwrap();
        let mut model = crate::workspace::Model::default();
        model
            .apply(voyager_contract::Action::CreateVoyage {
                name: "Project".into(),
                cwd: "/tmp/project".into(),
            })
            .unwrap();
        let binding = model
            .layout
            .contents
            .iter_mut()
            .find(|item| item.type_id == "terminal")
            .unwrap();
        binding.backend = Some(CoreTerminalId("t1".into()));
        let content = &binding.id.clone();
        let mut second = terminal.clone();
        second.title = "Refine Activity".into();
        assert_eq!(
            info(content, terminal.clone(), &model.layout)
                .agent_name
                .as_deref(),
            Some("Review the canvas")
        );
        assert_eq!(
            info(content, second.clone(), &model.layout)
                .agent_name
                .as_deref(),
            Some("Refine Activity")
        );
        second.title = "Codex".into();
        assert_eq!(
            info(content, second.clone(), &model.layout)
                .agent_name
                .as_deref(),
            Some("project")
        );
        second.title = "/tmp/project".into();
        assert_eq!(
            info(content, second, &model.layout).agent_name.as_deref(),
            Some("project")
        );
    }

    #[test]
    fn stop_result_distinguishes_observed_states_from_unconfirmed_results() {
        let target = ProcessInfo {
            content_id: ContentId("content-1".into()),
            terminal_id: CoreTerminalId("t1".into()),
            pid: Some(23),
            cwd: "/tmp".into(),
            state: "live".into(),
            foreground: None,
            agent_name: None,
            placement_names: Vec::new(),
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
