use crate::core::Error;
use crate::core_shapes::Terminal;
use crate::focus_hook;
use std::{
    collections::hash_map::RandomState,
    hash::{BuildHasher, Hasher},
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use voyager_contract::launch::{Launch, LaunchSettings};

pub(crate) fn new_session() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let mut bytes = [0u8; 16];
    for (salt, half) in (0u8..).zip(bytes.chunks_mut(8)) {
        let mut hasher = RandomState::new().build_hasher();
        hasher.write_u128(nanos);
        hasher.write_u32(std::process::id());
        hasher.write_u8(salt);
        half.copy_from_slice(&hasher.finish().to_be_bytes());
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        &hex[..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..]
    )
}

fn entry_argv(launches: Option<&Path>) -> Result<Vec<String>, String> {
    let settings: Option<LaunchSettings> = match launches {
        Some(path) if path.exists() => Some(crate::launch::load(path)?),
        _ => None,
    };
    let entry = settings.and_then(|settings| {
        settings
            .entries
            .into_iter()
            .find(|entry| entry.id == crate::launch::VOYAGER_ENTRY)
    });
    match entry {
        None => Ok(focus_hook::DEFAULT_ARGV
            .iter()
            .map(|word| (*word).to_owned())
            .collect()),
        Some(entry) => match crate::launch::spec_argv(&entry.launch)? {
            argv if argv.is_empty() => {
                Err("The voyager entry in launches.json must be a program launch".into())
            }
            argv => Ok(argv),
        },
    }
}

pub(crate) fn command(
    launches: Option<&Path>,
    session: &str,
    resume: bool,
    cwd: &str,
) -> Result<Vec<String>, String> {
    let mut argv = entry_argv(launches)?;
    argv.extend(focus_hook::voyager_arguments(
        session,
        resume,
        crate::launch::command_path().as_deref(),
    ));
    crate::launch::command(&Launch::Program { argv }, cwd)
}

#[derive(Debug)]
pub(crate) enum Standing {
    Running,
    Absent,
    Unread(Error),
}

pub(crate) fn standing(read: Result<Terminal, Error>, session: &str) -> Standing {
    match read {
        Ok(terminal) if terminal.lifecycle().is_unknown() || terminal.start_unconfirmed() => {
            Standing::Unread(Error::Uncertain(format!(
                "Core reports terminal {} in a state Voyager cannot read",
                terminal.address
            )))
        }
        Ok(terminal) if focus_hook::runs(&terminal, session) => Standing::Running,
        Ok(_) => Standing::Absent,
        Err(Error::Rejected { kind, .. }) if kind == "not_found" => Standing::Absent,
        Err(error) => Standing::Unread(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn terminal(state: &str, argv: &[&str]) -> Terminal {
        serde_json::from_value(json!({
            "address":"t4", "labels":{}, "argv":argv, "cwd":"/tmp",
            "state":state, "created_ms":0, "screen":"exact", "cols":80, "rows":24
        }))
        .unwrap()
    }

    const SESSION: &str = "5c1f0a52-7a4e-4d0b-9a55-0c1d2e3f4a5b";

    fn voyager_argv(flag: &str) -> Vec<&str> {
        vec!["/bin/claude", flag, SESSION, "-n", "voyager"]
    }

    #[test]
    fn a_new_session_is_a_version_four_uuid_and_differs_each_time() {
        let first = new_session();
        assert_eq!(first.len(), 36);
        assert_eq!(first.as_bytes()[14], b'4');
        assert!(matches!(first.as_bytes()[19], b'8' | b'9' | b'a' | b'b'));
        assert_ne!(first, new_session());
    }

    #[test]
    fn only_a_live_claude_with_the_saved_session_and_voyagers_name_counts_as_running() {
        for flag in ["--session-id", "--resume"] {
            let running = terminal("live", &voyager_argv(flag));
            assert!(focus_hook::runs(&running, SESSION), "{flag}");
        }
        let live = |argv: &[&str]| focus_hook::runs(&terminal("live", argv), SESSION);
        assert!(!live(&[
            "/bin/claude",
            "--session-id",
            "other",
            "-n",
            "voyager"
        ]));
        assert!(!live(&["/bin/claude", "--session-id", SESSION]));
        assert!(!live(&[
            "/bin/bash",
            "--session-id",
            SESSION,
            "-n",
            "voyager"
        ]));
        let ended = terminal("finished", &voyager_argv("--session-id"));
        assert!(!focus_hook::runs(&ended, SESSION));
    }

    #[test]
    fn a_read_settles_as_running_absent_or_unread() {
        let running = terminal("live", &voyager_argv("--session-id"));
        assert!(matches!(standing(Ok(running), SESSION), Standing::Running));
        let ended = terminal("finished", &voyager_argv("--session-id"));
        assert!(matches!(standing(Ok(ended), SESSION), Standing::Absent));
        let foreign = terminal("live", &["/bin/bash"]);
        assert!(matches!(standing(Ok(foreign), SESSION), Standing::Absent));
        let gone = Error::Rejected {
            kind: "not_found".into(),
            message: "no such terminal".into(),
        };
        assert!(matches!(standing(Err(gone), SESSION), Standing::Absent));
        let unclear = Error::Uncertain("socket closed".into());
        assert!(matches!(
            standing(Err(unclear), SESSION),
            Standing::Unread(_)
        ));
        let strange = terminal("mystery", &voyager_argv("--session-id"));
        assert!(matches!(
            standing(Ok(strange), SESSION),
            Standing::Unread(_)
        ));
    }

    #[test]
    fn the_saved_launch_keeps_the_session_for_a_later_resume() {
        let vessel = voyager_contract::Vessel {
            id: voyager_contract::VesselId(crate::workspace::VOYAGER_VESSEL.into()),
            type_id: "terminal".into(),
            cwd: "/tmp".into(),
            backend: None,
            configuration: None,
            start_pending: None,
            launch: Some(focus_hook::saved_launch(SESSION)),
            shell_intent: None,
            adopted: false,
        };
        assert!(crate::workspace::is_voyager(&vessel));
        assert_eq!(focus_hook::session(&vessel), Some(SESSION));
    }

    #[test]
    fn the_command_follows_the_voyager_entry_and_resumes_by_session() {
        let directory = std::env::temp_dir().join(format!("voyager-start-{}", new_session()));
        std::fs::create_dir_all(&directory).unwrap();
        let launches = directory.join("launches.json");
        let executable = directory.join("claude");
        std::fs::write(&executable, "").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let program = executable.to_string_lossy();
        std::fs::write(
            &launches,
            format!(
                r#"{{"default":"voyager","entries":[{{"id":"voyager","name":"Voyager","launch":{{"kind":"program","argv":["{program}","--model","sonnet"]}}}}]}}"#
            ),
        )
        .unwrap();
        let fresh = command(Some(&launches), SESSION, false, "/").unwrap();
        assert_eq!(&fresh[1..5], ["--model", "sonnet", "--session-id", SESSION]);
        let resumed = command(Some(&launches), SESSION, true, "/").unwrap();
        assert_eq!(&resumed[3..5], ["--resume", SESSION]);
        assert!(
            resumed
                .iter()
                .any(|word| word.starts_with("You are Voyager"))
        );
        std::fs::write(
            &launches,
            r#"{"default":"voyager","entries":[{"id":"voyager","name":"Voyager","launch":{"kind":"terminal"}}]}"#,
        )
        .unwrap();
        assert!(command(Some(&launches), SESSION, false, "/").is_err());
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn without_a_voyager_entry_sonnet_5_5_at_low_effort_is_the_default() {
        assert_eq!(
            entry_argv(None).unwrap(),
            ["claude", "--model", "claude-sonnet-5-5", "--effort", "low"]
        );
    }

    #[test]
    fn a_voyager_entry_of_an_agent_kind_resolves_through_the_table() {
        let directory =
            std::env::temp_dir().join(format!("voyager-entry-agent-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let launches = directory.join("launches.json");
        std::fs::write(
            &launches,
            r#"{"default":"voyager","entries":[{"id":"voyager","name":"Voyager","launch":{"kind":"claude"}}]}"#,
        )
        .unwrap();
        assert_eq!(entry_argv(Some(&launches)).unwrap(), ["claude"]);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
