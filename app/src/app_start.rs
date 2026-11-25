use crate::app_socket::{self, Raised};
use crate::install::{Install, Link, Start, running_executables};
use crate::profile_lock::ProfileLock;
use std::{
    ffi::OsString,
    fs,
    os::unix::process::CommandExt,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const VESSEL_VARIABLES: [&str; 4] = [
    "HC_SOCKET",
    "HC_TERMINAL_ID",
    "HC_SCOPE",
    "HC_TERMINAL_SOCKET",
];
const READY_LIMIT: Duration = Duration::from_secs(60);
const POLL: Duration = Duration::from_millis(50);

#[derive(Debug)]
pub enum Started {
    Raised,
    Ready {
        build: String,
        log: PathBuf,
    },
    ReturnedToPrevious {
        failed: String,
        failed_log: PathBuf,
        build: String,
        log: PathBuf,
    },
}

#[derive(Debug)]
pub enum NotStarted {
    Refused(String),
    Held {
        profile: PathBuf,
    },
    Failed {
        build: String,
        log: PathBuf,
        status: String,
    },
    Uncertain {
        build: String,
        pid: u32,
        log: PathBuf,
    },
}

enum Outcome {
    Ready,
    Exited(String),
    Uncertain(u32),
}

pub fn app_command(
    shell: &Path,
    start: &Start,
    environment: impl IntoIterator<Item = (OsString, OsString)>,
) -> Command {
    let mut command = Command::new(shell);
    command
        .arg("--profile")
        .arg(&start.profile)
        .arg("--session")
        .arg(&start.session)
        .env_clear()
        .envs(
            environment
                .into_iter()
                .filter(|(name, _)| !VESSEL_VARIABLES.iter().any(|vessel| name == vessel)),
        )
        .stdin(Stdio::null())
        .process_group(0);
    command
}

fn launch(install: &Install, start: &Start) -> Result<(String, Child, PathBuf), NotStarted> {
    let build = install
        .linked(Link::Current)
        .map_err(|error| NotStarted::Refused(error.to_string()))?
        .ok_or_else(|| NotStarted::Refused("No build is installed as current".into()))?;
    let logs = install.root().join("logs");
    fs::create_dir_all(&logs).map_err(|error| NotStarted::Refused(error.to_string()))?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let log = logs.join(format!("{build}-{stamp}.log"));
    let file = fs::File::create(&log).map_err(|error| NotStarted::Refused(error.to_string()))?;
    let error_file = file
        .try_clone()
        .map_err(|error| NotStarted::Refused(error.to_string()))?;
    let child = app_command(&install.shell(Link::Current), start, std::env::vars_os())
        .stdout(file)
        .stderr(error_file)
        .spawn()
        .map_err(|error| NotStarted::Failed {
            build: build.clone(),
            log: log.clone(),
            status: error.to_string(),
        })?;
    Ok((build, child, log))
}

fn wait_ready(session: &str, child: &mut Child) -> Outcome {
    let began = Instant::now();
    loop {
        if app_socket::listening(session) {
            return Outcome::Ready;
        }
        match child.try_wait() {
            Ok(Some(status)) => return Outcome::Exited(status.to_string()),
            Ok(None) => (),
            Err(error) => return Outcome::Exited(error.to_string()),
        }
        if began.elapsed() > READY_LIMIT {
            return Outcome::Uncertain(child.id());
        }
        thread::sleep(POLL);
    }
}

fn running_elsewhere(session: &str, limit: Duration) -> bool {
    let began = Instant::now();
    while began.elapsed() <= limit {
        if app_socket::listening(session) {
            return true;
        }
        thread::sleep(POLL);
    }
    false
}

pub fn start(install: &Install) -> Result<Started, NotStarted> {
    start_within(install, READY_LIMIT)
}

fn start_within(install: &Install, limit: Duration) -> Result<Started, NotStarted> {
    let start = install.start().map_err(NotStarted::Refused)?;
    match app_socket::raise(&start.session) {
        Ok(Raised::Raised) => return Ok(Started::Raised),
        Ok(Raised::NotRunning) => (),
        Err(error) => {
            return Err(NotStarted::Refused(format!(
                "An app answers on session {} but did not raise its window: {error}",
                start.session
            )));
        }
    }
    if ProfileLock::hold(&start.profile).is_err() {
        let raised = running_elsewhere(&start.session, limit)
            && matches!(app_socket::raise(&start.session), Ok(Raised::Raised));
        if raised {
            return Ok(Started::Raised);
        }
        return Err(NotStarted::Held {
            profile: start.profile,
        });
    }
    let switched = install
        .apply_next()
        .map_err(|error| NotStarted::Refused(error.to_string()))?
        .is_some();
    let _ = install.prune(&running_executables());
    let (build, mut child, log) = launch(install, &start)?;
    match wait_ready(&start.session, &mut child) {
        Outcome::Ready => Ok(Started::Ready { build, log }),
        Outcome::Uncertain(pid) => Err(NotStarted::Uncertain { build, pid, log }),
        Outcome::Exited(status) if !switched => Err(NotStarted::Failed { build, log, status }),
        Outcome::Exited(status) => {
            let previous = install.fall_back().map_err(|_| NotStarted::Failed {
                build: build.clone(),
                log: log.clone(),
                status: status.clone(),
            })?;
            let (back, mut child, back_log) = launch(install, &start)?;
            debug_assert_eq!(back, previous);
            match wait_ready(&start.session, &mut child) {
                Outcome::Ready => Ok(Started::ReturnedToPrevious {
                    failed: build,
                    failed_log: log,
                    build: back,
                    log: back_log,
                }),
                Outcome::Exited(status) => Err(NotStarted::Failed {
                    build: back,
                    log: back_log,
                    status,
                }),
                Outcome::Uncertain(pid) => Err(NotStarted::Uncertain {
                    build: back,
                    pid,
                    log: back_log,
                }),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn the_app_gets_the_callers_environment_without_the_vessel_variables() {
        let root = std::env::temp_dir().join(format!("voyager-app-command-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let shell = root.join("voyager-shell");
        fs::write(&shell, "#!/bin/sh\nexec /usr/bin/env\n").unwrap();
        fs::set_permissions(&shell, fs::Permissions::from_mode(0o755)).unwrap();
        let start = Start {
            profile: root.join("profile"),
            session: "voyager-daily".into(),
        };
        let caller = [
            ("HC_SOCKET", "/run/vessel.sock"),
            ("HC_TERMINAL_ID", "t9"),
            ("HC_SCOPE", "fleet"),
            ("HC_TERMINAL_SOCKET", "/run/t9.sock"),
            ("HC_SESSION", "voyager-caller"),
            ("VOYAGER_OMNI_SERVER", "/opt/omni/llama-server"),
            ("VOYAGER_OMNI_GPU_LAYERS", "999"),
            ("PATH", "/usr/bin:/bin"),
        ]
        .map(|(name, value)| (OsString::from(name), OsString::from(value)));
        let output = app_command(&shell, &start, caller).output().unwrap();
        assert!(output.status.success());
        let printed = String::from_utf8(output.stdout).unwrap();
        let mut lines: Vec<&str> = printed
            .lines()
            .filter(|line| !line.starts_with("PWD=") && !line.starts_with("SHLVL="))
            .collect();
        lines.sort();
        assert_eq!(
            lines,
            [
                "HC_SESSION=voyager-caller",
                "PATH=/usr/bin:/bin",
                "VOYAGER_OMNI_GPU_LAYERS=999",
                "VOYAGER_OMNI_SERVER=/opt/omni/llama-server",
            ]
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_start_beside_an_app_that_holds_the_profile_switches_no_build() {
        let root = std::env::temp_dir().join(format!("voyager-held-start-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let install = Install::at(root.join("install"));
        for build in ["a", "b"] {
            fs::create_dir_all(install.build(build)).unwrap();
        }
        install.stage("a").unwrap();
        install.apply_next().unwrap();
        install.stage("b").unwrap();
        let profile = root.join("profile");
        fs::write(
            install.root().join("start.json"),
            serde_json::json!({
                "profile": profile,
                "session": format!("voyager-held-start-{}", std::process::id()),
            })
            .to_string(),
        )
        .unwrap();
        let links = || {
            [Link::Current, Link::Previous, Link::Next].map(|link| install.linked(link).unwrap())
        };
        let before = links();
        let held = ProfileLock::hold(&profile).unwrap();
        let outcome = start_within(&install, Duration::from_millis(200));
        assert!(
            matches!(&outcome, Err(NotStarted::Held { profile: named }) if *named == profile),
            "{outcome:?}"
        );
        assert_eq!(links(), before);
        assert!(
            !install.root().join("logs").exists(),
            "No build was launched"
        );
        drop(held);
        fs::remove_dir_all(root).unwrap();
    }
}
