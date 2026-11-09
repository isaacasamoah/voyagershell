use std::{collections::HashSet, io::Read as _, path::Path};
use voyager_contract::launch::{Catalog, Effort, Launch, LaunchSettings, Permissions};

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
        argv(&entry.launch)?;
    }
    if !identities.contains(&settings.default) {
        return Err("Default launch entry is missing".into());
    }
    Ok(settings)
}

pub fn argv(launch: &Launch) -> Result<Vec<String>, String> {
    match launch {
        Launch::Terminal => Ok(Vec::new()),
        Launch::Program { argv } => {
            if argv.first().is_none_or(|value| value.is_empty())
                || argv.iter().any(|value| value.contains('\0'))
            {
                return Err("A program launch needs an executable and valid arguments".into());
            }
            Ok(argv.clone())
        }
        Launch::Codex {
            model,
            effort,
            permissions,
        } => {
            if model.trim().is_empty() || model.contains('\0') {
                return Err("A Codex launch needs a model identifier".into());
            }
            let effort = match effort {
                Effort::Low => "low",
                Effort::Medium => "medium",
                Effort::High => "high",
                Effort::Xhigh => "xhigh",
                Effort::Max => "max",
                Effort::Ultra => "ultra",
            };
            let mut args = vec![
                "codex".into(),
                "--no-daemon".into(),
                "--model".into(),
                model.clone(),
                "-c".into(),
                format!("model_reasoning_effort=\"{effort}\""),
            ];
            match permissions {
                Permissions::Yolo => args.push("--dangerously-bypass-approvals-and-sandbox".into()),
                Permissions::WorkspaceWrite | Permissions::ReadOnly => {
                    args.extend([
                        "--sandbox".into(),
                        if *permissions == Permissions::ReadOnly {
                            "read-only".into()
                        } else {
                            "workspace-write".into()
                        },
                        "--ask-for-approval".into(),
                        "on-request".into(),
                    ]);
                }
            }
            Ok(args)
        }
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

pub(crate) fn terminal_command(launch: &Launch, cwd: &str) -> Result<Vec<String>, String> {
    shell_command(launch, command(launch, cwd)?)
}

pub(crate) fn shell_command(launch: &Launch, args: Vec<String>) -> Result<Vec<String>, String> {
    let agent = match launch {
        Launch::Codex { .. } => true,
        Launch::Program { argv } => argv.first().is_some_and(|program| {
            let name = Path::new(program)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("");
            matches!(
                name.trim_end_matches(".exe"),
                "codex"
                    | "claude"
                    | "claude-code"
                    | "pi"
                    | "opencode"
                    | "cursor-agent"
                    | "copilot"
                    | "amp"
                    | "gemini"
                    | "grok"
            )
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
    let settings = path.map(load).transpose()?.unwrap_or_default();
    let mut available = Vec::new();
    let mut errors = Vec::new();
    for entry in &settings.entries {
        let args = argv(&entry.launch)?;
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
}
