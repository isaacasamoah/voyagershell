use serde_json::{Value, json};
use std::sync::LazyLock;
use voyager_contract::launch::{
    AgentProgram, AgentTable, Effort, Launch, LaunchEntry, LaunchSettings, LaunchSpec,
    PROGRAM_KIND, Permissions, TERMINAL_KIND,
};

const SOURCE: &str = include_str!("../../content/agent-programs.json");

static TABLE: LazyLock<AgentTable> = LazyLock::new(|| {
    serde_json::from_str(SOURCE)
        .unwrap_or_else(|error| panic!("The bundled agent table is invalid: {error}"))
});

pub fn source() -> &'static str {
    SOURCE
}

pub fn table() -> &'static AgentTable {
    &TABLE
}

pub fn find(id: &str) -> Option<&'static AgentProgram> {
    TABLE.agents.iter().find(|agent| agent.id == id)
}

pub fn recognise(program: &str) -> Option<&'static AgentProgram> {
    TABLE
        .agents
        .iter()
        .find(|agent| agent.programs.iter().any(|name| name == program))
}

pub fn is_agent_program(program: &str) -> bool {
    recognise(program).is_some()
}

pub fn default_settings() -> LaunchSettings {
    let mut entries = vec![LaunchEntry {
        id: TERMINAL_KIND.into(),
        name: "Terminal".into(),
        launch: LaunchSpec::Terminal,
    }];
    entries.extend(
        TABLE
            .agents
            .iter()
            .filter(|agent| agent.seeded)
            .map(|agent| LaunchEntry {
                id: agent.id.clone(),
                name: agent.name.clone(),
                launch: LaunchSpec::Agent {
                    kind: agent.id.clone(),
                    model: agent
                        .launch
                        .model
                        .as_ref()
                        .map(|model| model.default.clone()),
                    effort: agent.launch.effort.as_ref().map(|effort| effort.default),
                    permissions: agent
                        .launch
                        .permissions
                        .as_ref()
                        .map(|permissions| permissions.default),
                },
            }),
    );
    LaunchSettings {
        default: TERMINAL_KIND.into(),
        entries,
    }
}

fn substitute(flags: &[String], name: &str, value: &str) -> Vec<String> {
    let marker = format!("{{{name}}}");
    flags
        .iter()
        .map(|flag| flag.replace(&marker, value))
        .collect()
}

pub fn argv(
    kind: &str,
    model: Option<&str>,
    effort: Option<Effort>,
    permissions: Option<Permissions>,
) -> Result<Vec<String>, String> {
    let agent = find(kind).ok_or_else(|| format!("Unknown agent program {kind}"))?;
    let launch = &agent.launch;
    let mut args = if launch.argv.is_empty() {
        agent.programs.first().cloned().into_iter().collect()
    } else {
        launch.argv.clone()
    };
    if args.first().is_none_or(|value| value.is_empty()) {
        return Err(format!("{} needs an executable", agent.name));
    }
    match (&launch.model, model) {
        (Some(setting), model) => {
            let model = model.unwrap_or(&setting.default);
            if model.trim().is_empty() || model.contains('\0') {
                return Err(format!("{} needs a model identifier", agent.name));
            }
            args.extend(substitute(&setting.flags, "model", model));
        }
        (None, Some(_)) => return Err(format!("{} takes no model setting", agent.name)),
        (None, None) => {}
    }
    match (&launch.effort, effort) {
        (Some(setting), effort) => {
            let effort = serde_json::to_value(effort.unwrap_or(setting.default))
                .map_err(|error| error.to_string())?;
            args.extend(substitute(
                &setting.flags,
                "effort",
                effort.as_str().unwrap_or_default(),
            ));
        }
        (None, Some(_)) => return Err(format!("{} takes no effort setting", agent.name)),
        (None, None) => {}
    }
    match (&launch.permissions, permissions) {
        (Some(setting), permissions) => {
            let flags = match permissions.unwrap_or(setting.default) {
                Permissions::Yolo => &setting.yolo,
                Permissions::WorkspaceWrite => &setting.workspace_write,
                Permissions::ReadOnly => &setting.read_only,
            };
            args.extend(flags.iter().cloned());
        }
        (None, Some(_)) => return Err(format!("{} takes no permissions setting", agent.name)),
        (None, None) => {}
    }
    Ok(args)
}

pub fn resolve(spec: &LaunchSpec) -> Result<Launch, String> {
    match spec {
        LaunchSpec::Terminal => Ok(Launch::Terminal),
        LaunchSpec::Program { argv } => Ok(Launch::Program { argv: argv.clone() }),
        LaunchSpec::Agent {
            kind,
            model,
            effort,
            permissions,
        } => {
            argv(kind, model.as_deref(), *effort, *permissions).map(|argv| Launch::Program { argv })
        }
    }
}

pub(crate) fn upgrade_stored_launches(raw: &mut Value) {
    let Some(vessels) = raw.get_mut("vessels").and_then(Value::as_array_mut) else {
        return;
    };
    for vessel in vessels {
        let Some(launch) = vessel.get_mut("launch") else {
            continue;
        };
        let stored = launch.get("kind").and_then(Value::as_str);
        if stored.is_none_or(|kind| kind == TERMINAL_KIND || kind == PROGRAM_KIND) {
            continue;
        }
        let upgraded = serde_json::from_value::<LaunchSpec>(launch.clone())
            .ok()
            .and_then(|spec| resolve(&spec).ok())
            .and_then(|launch| serde_json::to_value(launch).ok())
            .unwrap_or_else(|| json!({"kind": TERMINAL_KIND}));
        *launch = upgraded;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_bundled_table_has_unique_ids_and_programs() {
        let mut ids = std::collections::HashSet::new();
        let mut programs = std::collections::HashSet::new();
        for agent in &table().agents {
            assert!(ids.insert(&agent.id), "{} repeats an id", agent.id);
            assert!(!agent.programs.is_empty(), "{} names no program", agent.id);
            for program in &agent.programs {
                assert!(programs.insert(program), "{program} repeats a program");
            }
            assert!(
                argv(&agent.id, None, None, None).is_ok(),
                "{} has no argv",
                agent.id
            );
        }
    }

    #[test]
    fn a_settings_entry_resolves_to_the_arguments_a_stored_launch_used() {
        let args = argv(
            "codex",
            Some("gpt-6.1-sol"),
            Some(Effort::High),
            Some(Permissions::ReadOnly),
        )
        .unwrap();
        assert_eq!(
            args,
            [
                "codex",
                "--no-daemon",
                "--model",
                "gpt-6.1-sol",
                "-c",
                "model_reasoning_effort=\"high\"",
                "--sandbox",
                "read-only",
                "--ask-for-approval",
                "on-request"
            ]
        );
        assert_eq!(argv("codex", None, None, None).unwrap()[3], "gpt-6.1-sol");
        assert!(argv("codex", Some(" "), None, None).is_err());
        assert!(argv("claude", Some("model"), None, None).is_err());
        assert!(argv("unlisted", None, None, None).is_err());
    }

    #[test]
    fn a_stored_agent_launch_becomes_a_program_launch_and_an_unknown_one_a_terminal() {
        let mut raw = json!({"vessels": [
            {"id": "a", "launch": {"kind": "codex", "model": "m", "effort": "low", "permissions": "yolo"}},
            {"id": "b", "launch": {"kind": "program", "argv": ["claude"]}},
            {"id": "c", "launch": {"kind": "retired-agent"}},
            {"id": "d", "launch": {"kind": "terminal"}},
            {"id": "e"}
        ]});
        upgrade_stored_launches(&mut raw);
        assert_eq!(
            raw["vessels"][0]["launch"],
            json!({"kind": "program", "argv": ["codex", "--no-daemon", "--model", "m", "-c", "model_reasoning_effort=\"low\"", "--dangerously-bypass-approvals-and-sandbox"]})
        );
        assert_eq!(
            raw["vessels"][1]["launch"],
            json!({"kind": "program", "argv": ["claude"]})
        );
        assert_eq!(raw["vessels"][2]["launch"], json!({"kind": "terminal"}));
        assert_eq!(raw["vessels"][3]["launch"], json!({"kind": "terminal"}));
        assert!(raw["vessels"][4].get("launch").is_none());
    }

    #[test]
    fn seeded_settings_list_the_terminal_and_each_seeded_program() {
        let settings = default_settings();
        let ids: Vec<&str> = settings
            .entries
            .iter()
            .map(|entry| entry.id.as_str())
            .collect();
        assert_eq!(ids, ["terminal", "codex", "claude"]);
        assert_eq!(settings.default, "terminal");
        for entry in &settings.entries {
            assert!(crate::launch::spec_argv(&entry.launch).is_ok());
        }
    }
}
