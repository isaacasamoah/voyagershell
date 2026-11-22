use std::{collections::HashSet, io::Read as _, path::Path};
use voyager_contract::launch::{Catalog, Defaults, Launch, LaunchSettings, LaunchSpec};

pub(crate) const VOYAGER_ENTRY: &str = "voyager";

pub fn load(path: &Path) -> Result<LaunchSettings, String> {
    let mut source = Vec::new();
    std::fs::File::open(path)
        .and_then(|file| file.take(8193).read_to_end(&mut source))
        .map_err(|error| error.to_string())?;
    if source.len() > 8192 {
        return Err("Worker settings exceed the 8 KiB limit".into());
    }
    let settings: LaunchSettings =
        serde_json::from_slice(&source).map_err(|error| error.to_string())?;
    let mut identities = HashSet::new();
    for entry in &settings.entries {
        if entry.id.trim().is_empty()
            || entry.name.trim().is_empty()
            || !identities.insert(&entry.id)
        {
            return Err("Launch entries need unique identities and nonempty names".into());
        }
        spec_argv(&entry.launch)?;
    }
    if !identities.contains(&settings.default) {
        return Err("Default launch entry is missing".into());
    }
    Ok(settings)
}

fn program_argv(argv: &[String]) -> Result<Vec<String>, String> {
    if argv.first().is_none_or(|value| value.is_empty())
        || argv.iter().any(|value| value.contains('\0'))
    {
        return Err("A program launch needs an executable and valid arguments".into());
    }
    Ok(argv.to_vec())
}

pub fn argv(launch: &Launch) -> Result<Vec<String>, String> {
    match launch {
        Launch::Terminal => Ok(Vec::new()),
        Launch::Program { argv } => program_argv(argv),
    }
}

pub fn spec_argv(spec: &LaunchSpec) -> Result<Vec<String>, String> {
    match spec {
        LaunchSpec::Terminal => Ok(Vec::new()),
        LaunchSpec::Program { argv } => program_argv(argv),
        LaunchSpec::Agent {
            kind,
            model,
            effort,
            permissions,
        } => crate::agent_programs::argv(kind, model.as_deref(), *effort, *permissions),
    }
}

pub(crate) fn requested(
    type_id: &str,
    spec: Option<LaunchSpec>,
    defaults: Defaults,
) -> Result<Option<Launch>, String> {
    use voyager_contract::launch::{AGENT_TYPE, TERMINAL_TYPE};
    match (type_id, spec) {
        (AGENT_TYPE, Some(spec @ LaunchSpec::Agent { .. })) => {
            crate::agent_programs::resolve(&spec, defaults).map(Some)
        }
        (AGENT_TYPE, _) => Err("An agent Vessel needs an agent launch".into()),
        (_, None) => Ok(None),
        (TERMINAL_TYPE, Some(LaunchSpec::Agent { .. })) => {
            Err("Only agent content accepts an agent launch".into())
        }
        (TERMINAL_TYPE, Some(spec)) => {
            spec_argv(&spec)?;
            crate::agent_programs::resolve(&spec, defaults).map(Some)
        }
        (_, Some(_)) => Err("Only terminal content accepts a program launch".into()),
    }
}

pub fn command(launch: &Launch, cwd: &str) -> Result<Vec<String>, String> {
    let mut args = argv(launch)?;
    if let Some(executable) = args.first_mut().filter(|value| !value.contains('/')) {
        let path = which::which_in(&*executable, std::env::var_os("PATH"), cwd)
            .map_err(|error| format!("Executable {executable} is unavailable: {error}"))?;
        *executable = path
            .canonicalize()
            .map_err(|error| error.to_string())?
            .into_os_string()
            .into_string()
            .map_err(|_| "Executable path is not UTF-8")?;
    }
    Ok(args)
}

const COMMAND_NAME: &str = if cfg!(windows) {
    "voyager.exe"
} else {
    "voyager"
};

pub fn command_path() -> Option<std::path::PathBuf> {
    let path = std::env::current_exe().ok()?.with_file_name(COMMAND_NAME);
    path.is_file().then_some(path)
}

pub fn path_with_command() -> Option<String> {
    let directory = command_path()?.parent()?.to_path_buf();
    let rest = std::env::var_os("PATH").unwrap_or_default();
    let joined = std::env::join_paths(
        std::iter::once(directory)
            .chain(std::env::split_paths(&rest).filter(|part| !part.as_os_str().is_empty())),
    )
    .ok()?;
    joined.into_string().ok()
}

pub(crate) fn terminal_command(launch: &Launch, cwd: &str) -> Result<Vec<String>, String> {
    shell_command(launch, command(launch, cwd)?)
}

fn shell_command(launch: &Launch, args: Vec<String>) -> Result<Vec<String>, String> {
    let agent = match launch {
        Launch::Program { argv } => argv.first().is_some_and(|program| {
            let name = Path::new(program)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("");
            crate::agent_programs::is_agent_program(name.trim_end_matches(".exe"))
        }),
        Launch::Terminal => false,
    };
    if !agent {
        return Ok(args);
    }
    let shell = which::which("bash").map_err(|error| format!("Bash is unavailable: {error}"))?;
    let mut command = vec![
        shell
            .into_os_string()
            .into_string()
            .map_err(|_| "Shell path is not UTF-8")?,
        "-i".into(),
        "-c".into(),
        "\"$@\"; exec \"$BASH\" -i".into(),
        "voyager-agent".into(),
    ];
    command.extend(args);
    Ok(command)
}

pub fn catalog(path: Option<&Path>, cwd: &str) -> Result<Catalog, String> {
    let mut settings = path
        .map(load)
        .transpose()?
        .unwrap_or_else(crate::agent_programs::default_settings);
    settings.entries.retain(|entry| entry.id != VOYAGER_ENTRY);
    let mut available = Vec::new();
    let mut errors = Vec::new();
    for entry in &settings.entries {
        let args = spec_argv(&entry.launch)?;
        match args.first() {
            None => available.push(entry.id.clone()),
            Some(executable) => match which::which_in(executable, std::env::var_os("PATH"), cwd) {
                Ok(_) => available.push(entry.id.clone()),
                Err(error) => errors.push(format!("{} is unavailable: {error}", entry.name)),
            },
        }
    }
    Ok(Catalog {
        settings,
        available,
        errors,
        path: path.map(|path| path.to_string_lossy().into_owned()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_command_keeps_arguments_literal_and_returns_to_bash() {
        let args = shell_command(
            &Launch::Program {
                argv: vec!["claude".into(), "literal; $(never-run)".into()],
            },
            vec!["/vendor/cli.js".into(), "literal; $(never-run)".into()],
        )
        .unwrap();
        assert_eq!(
            &args[1..5],
            ["-i", "-c", "\"$@\"; exec \"$BASH\" -i", "voyager-agent"]
        );
        assert_eq!(&args[5..], ["/vendor/cli.js", "literal; $(never-run)"]);
    }

    #[test]
    fn every_listed_agent_program_launches_through_bash_and_names_its_conversation() {
        for program in crate::agent_programs::table()
            .agents
            .iter()
            .flat_map(|agent| agent.programs.iter())
        {
            let wrapped = shell_command(
                &Launch::Program {
                    argv: vec![program.clone()],
                },
                vec![program.clone()],
            )
            .unwrap();
            assert_ne!(
                wrapped,
                [program.as_str()],
                "{program} is launched through Bash"
            );
            let terminal: crate::core_shapes::Terminal =
                serde_json::from_value(serde_json::json!({
                    "address":"t1", "labels":{}, "argv":[program], "cwd":"/tmp",
                    "state":"live", "created_ms":0, "screen":"exact", "cols":80, "rows":24,
                    "title":"Review the canvas",
                    "foreground":{"name":program, "cwd":"/tmp", "pid":17, "argv":[program]}
                }))
                .unwrap();
            assert!(
                crate::observation::conversation_name(&terminal).is_some(),
                "{program} names its conversation"
            );
        }
    }

    #[test]
    fn the_launch_list_the_agents_view_and_adoption_read_one_table() {
        let agents_view = include_str!("../../desktop/canvas/agents.ts");
        let lookup = include_str!("../../desktop/canvas/process-icons.ts");
        assert!(
            agents_view.contains("recognisedAgent("),
            "the view asks the shared lookup"
        );
        assert!(
            lookup.contains("agent_programs()"),
            "the lookup reads the host table"
        );
        for source in [agents_view, lookup] {
            assert!(
                !source.contains("AGENT_NAMES"),
                "the view keeps no list of its own"
            );
        }
        let host = include_str!("../../desktop/src/host.rs");
        assert!(
            host.contains("agent_programs::source()"),
            "the call serves the app's table"
        );
        let table: voyager_contract::launch::AgentTable =
            serde_json::from_str(crate::agent_programs::source()).unwrap();
        assert_eq!(&table, crate::agent_programs::table());
        for agent in &table.agents {
            for program in &agent.programs {
                assert!(crate::agent_programs::is_agent_program(program));
            }
        }
        let seeded = crate::agent_programs::default_settings();
        for entry in &seeded.entries {
            assert!(spec_argv(&entry.launch).is_ok(), "{} resolves", entry.id);
        }
    }
}
