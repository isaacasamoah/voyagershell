#[path = "codex_protocol.rs"]
mod protocol;
use crate::provider::{Command as ProviderCommand, Event, Operation, Provider, ToolReply};
use crate::voice_live::Package;
#[cfg(test)]
pub(crate) use protocol::{decode as normalize, reported_version, tool_reply as encode_tool_reply};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex, mpsc::SyncSender},
    thread,
    time::{Duration, Instant},
};

pub(crate) const DEFAULT_MODEL: &str = "gpt-6.1-sol";
pub(crate) const DEFAULT_EFFORT: &str = "high";
const API_KEY_VARIABLES: [&str; 2] = ["OPENAI_API_KEY", "CODEX_API_KEY"];
const CONTENT_FRAME_LIMIT: usize = 2 * crate::content::ENVELOPE_LIMIT + 4096;

fn without_api_keys(command: &mut Command) -> &mut Command {
    for variable in API_KEY_VARIABLES {
        command.env_remove(variable);
    }
    command
}

fn codex_dotenv(codex_home: Option<OsString>, home: Option<OsString>) -> Option<PathBuf> {
    match codex_home.filter(|value| !value.is_empty()) {
        Some(directory) => Some(PathBuf::from(directory).join(".env")),
        None => home.map(|home| PathBuf::from(home).join(".codex/.env")),
    }
}

fn api_key_name(line: &str) -> Option<&'static str> {
    let line = line.trim_start();
    let line = line
        .strip_prefix("export")
        .filter(|rest| rest.starts_with(char::is_whitespace))
        .map_or(line, str::trim_start);
    let (name, _) = line.split_once('=')?;
    let name = name.trim_end();
    API_KEY_VARIABLES
        .into_iter()
        .find(|variable| name.eq_ignore_ascii_case(variable))
}

fn refuse_dotenv_api_key(dotenv: &Path) -> Result<(), String> {
    let Ok(bytes) = fs::read(dotenv) else {
        return Ok(());
    };
    match String::from_utf8_lossy(&bytes)
        .lines()
        .find_map(api_key_name)
    {
        Some(name) => Err(format!(
            "{} sets {name}. Codex reads that file itself and would bill per use, so the private Codex runtime did not start. Remove the line to use it.",
            dotenv.display()
        )),
        None => Ok(()),
    }
}

fn decode(bytes: &[u8]) -> Result<Value, String> {
    if bytes.is_empty() || bytes.len() > CONTENT_FRAME_LIMIT {
        return Err("Private Codex disconnected or exceeded the bounded content frame size. Nothing was resubmitted.".into());
    }
    let value: Value = serde_json::from_slice(bytes).map_err(|error| error.to_string())?;
    if bytes.len() > 1024 * 1024
        && (value["method"] != "item/tool/call" || value["params"]["tool"] != "voyager_vessel")
    {
        return Err(
            "Private Codex non-content frame exceeded 1 MiB; nothing was resubmitted".into(),
        );
    }
    Ok(value)
}

fn encode(value: &Value, limit: usize) -> Result<Vec<u8>, String> {
    let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    if bytes.len() > limit {
        return Err("Provider request exceeds its transport byte limit; nothing was sent".into());
    }
    Ok(bytes)
}

pub(crate) struct Codex {
    child: Child,
    input: ChildStdin,
    executable: PathBuf,
    version: Option<String>,
    pending: Arc<Mutex<Option<(u64, Operation)>>>,
}

impl Codex {
    fn executable() -> Result<PathBuf, String> {
        let selected = env::var_os("VOYAGER_CODEX_BIN").unwrap_or_else(|| "codex".into());
        let path = PathBuf::from(&selected);
        if path.components().count() > 1 || path.is_absolute() {
            return path
                .canonicalize()
                .map_err(|_| "Selected Codex executable is unavailable".into());
        }
        env::var_os("PATH")
            .and_then(|paths| {
                env::split_paths(&paths)
                    .map(|path| path.join(&selected))
                    .find(|path| path.is_file())
            })
            .ok_or_else(|| "Codex is not installed on the current application path".to_owned())?
            .canonicalize()
            .map_err(|_| "Selected Codex executable is unavailable".into())
    }
    pub(crate) fn open(
        cwd: &Path,
        events: SyncSender<Result<Event, String>>,
    ) -> Result<Self, String> {
        let dotenv = codex_dotenv(
            env::var_os("CODEX_HOME"),
            env::var_os("HOME").or_else(|| env::var_os("USERPROFILE")),
        );
        Self::start(Self::executable()?, dotenv, cwd, events)
    }

    fn start(
        executable: PathBuf,
        dotenv: Option<PathBuf>,
        cwd: &Path,
        events: SyncSender<Result<Event, String>>,
    ) -> Result<Self, String> {
        if let Some(dotenv) = dotenv {
            refuse_dotenv_api_key(&dotenv)?;
        }
        let mut command = Command::new(&executable);
        command
            .args([
                "app-server",
                "--listen",
                "stdio://",
                "-c",
                "features.shell_tool=true",
                "-c",
                "features.multi_agent=false",
                "-c",
                "features.multi_agent_v2=false",
            ])
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        let mut child = without_api_keys(&mut command)
            .spawn()
            .map_err(|e| format!("Starting the private Codex runtime: {e}"))?;
        let input = child.stdin.take().ok_or("Codex input unavailable")?;
        let output = child.stdout.take().ok_or("Codex output unavailable")?;
        let pending = Arc::new(Mutex::new(None));
        let reading = pending.clone();
        thread::spawn(move || {
            let mut output = BufReader::new(output);
            loop {
                let mut bytes = Vec::new();
                let parsed = output
                    .by_ref()
                    .take(CONTENT_FRAME_LIMIT as u64 + 1)
                    .read_until(b'\n', &mut bytes)
                    .map_err(|e| e.to_string())
                    .and_then(|_| decode(&bytes));
                match parsed {
                    Ok(value) => {
                        let expected = reading.lock().ok().and_then(|pending| *pending);
                        if let Some(event) = protocol::decode(value, expected)
                            && events.send(Ok(event)).is_err()
                        {
                            break;
                        }
                    }
                    Err(error) => {
                        let _ = events.send(Err(error));
                        break;
                    }
                }
            }
        });
        Ok(Self {
            child,
            input,
            executable,
            version: None,
            pending,
        })
    }

    fn write(&mut self, value: Value) -> Result<(), String> {
        self.write_bounded(value, 65536)
    }

    fn write_bounded(&mut self, value: Value, limit: usize) -> Result<(), String> {
        let bytes = encode(&value, limit)?;
        self.input.write_all(&bytes).map_err(|e| e.to_string())?;
        self.input.write_all(b"\n").map_err(|e| e.to_string())?;
        self.input.flush().map_err(|e| e.to_string())
    }

    pub(crate) fn voice_capability() -> voyager_contract::voice::Capability {
        match Self::executable().and_then(|path| Package::discover(&path)) {
            Ok(package) => voyager_contract::voice::Capability::Candidate {
                version: package.version,
            },
            Err(reason) => voyager_contract::voice::Capability::Unavailable { reason },
        }
    }
}

impl Provider for Codex {
    fn request(&mut self, id: u64, command: ProviderCommand) -> Result<(), String> {
        let operation = command.operation();
        let (method, params) = protocol::encode(command)?;
        *self
            .pending
            .lock()
            .map_err(|_| "Provider correlation unavailable")? = Some((id, operation));
        self.write_bounded(
            json!({"id": id, "method": method, "params": params}),
            if operation.audio() { 128 * 1024 } else { 65536 },
        )
    }

    fn initialized(&mut self, version: Option<String>) -> Result<(), String> {
        self.version = version;
        self.write(json!({"method":"initialized"}))
    }

    fn reply(&mut self, reply: &ToolReply, content: bool) -> Result<(), String> {
        self.write_bounded(
            protocol::tool_reply(reply),
            if content { CONTENT_FRAME_LIMIT } else { 65536 },
        )
    }

    fn voice_package(&self) -> Result<Package, String> {
        let package = Package::discover(&self.executable)?;
        package.check_provider(self.version.as_deref())?;
        Ok(package)
    }

    fn shutdown(&mut self) -> Result<(), String> {
        if self.child.try_wait().map_err(|e| e.to_string())?.is_none() {
            self.child.kill().map_err(|e| e.to_string())?;
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if self.child.try_wait().map_err(|e| e.to_string())?.is_some() {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err("Private provider exit is unconfirmed".into());
            }
            thread::sleep(Duration::from_millis(10));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(unix)]
    fn shutdown_reaps_its_owned_child_and_preserves_another_child() {
        let mut child = Command::new("/bin/sleep")
            .arg("10")
            .stdin(Stdio::piped())
            .spawn()
            .unwrap();
        let mut other = Command::new("/bin/sleep").arg("10").spawn().unwrap();
        let mut owner = Codex {
            input: child.stdin.take().unwrap(),
            child,
            executable: "/bin/sleep".into(),
            version: None,
            pending: Arc::new(Mutex::new(None)),
        };
        let result = owner.shutdown();
        let exited = owner.child.try_wait().unwrap().is_some();
        let survived = other.try_wait().unwrap().is_none();
        let _ = owner.child.kill();
        owner.child.wait().unwrap();
        other.kill().unwrap();
        other.wait().unwrap();
        assert!(result.is_ok() && exited && survived);
    }

    #[test]
    #[cfg(unix)]
    fn api_keys_never_reach_the_codex_child() {
        let mut command = Command::new("/bin/sh");
        command
            .args([
                "-c",
                "printf '%s|%s|%s' \"$OPENAI_API_KEY\" \"$CODEX_API_KEY\" \"$KEPT\"",
            ])
            .env("OPENAI_API_KEY", "sk-openai")
            .env("CODEX_API_KEY", "sk-codex")
            .env("KEPT", "kept");
        let output = without_api_keys(&mut command).output().unwrap();
        assert_eq!(String::from_utf8(output.stdout).unwrap(), "||kept");
    }

    #[cfg(unix)]
    fn stand_in_codex(name: &str, dotenv: &str) -> (PathBuf, PathBuf, PathBuf) {
        use std::os::unix::fs::PermissionsExt;
        let root =
            std::env::temp_dir().join(format!("voyager-codex-{name}-{}", std::process::id()));
        let home = root.join("codex-home");
        let cwd = root.join("cwd");
        fs::create_dir_all(&home).unwrap();
        fs::create_dir_all(&cwd).unwrap();
        let executable = root.join("codex");
        fs::write(&executable, "#!/bin/sh\ntouch started\n").unwrap();
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o755)).unwrap();
        fs::write(home.join(".env"), dotenv).unwrap();
        (root, executable, home)
    }

    #[test]
    #[cfg(unix)]
    fn a_dotenv_naming_an_api_key_stops_the_codex_runtime_from_starting() {
        let planted = "# note\nOTHER=1\nexport OPENAI_API_KEY=\"sk-planted-value\"\n";
        let (root, executable, home) = stand_in_codex("refuse", planted);
        let (events, _received) = std::sync::mpsc::sync_channel(1);
        let outcome = Codex::start(
            executable,
            codex_dotenv(Some(home.clone().into()), None),
            &root.join("cwd"),
            events,
        );
        thread::sleep(Duration::from_millis(500));
        let launched = root.join("cwd/started").exists();
        let message = outcome.err().expect("a key in the dotenv refuses to start");
        fs::remove_dir_all(&root).unwrap();
        assert!(!launched, "the stand-in Codex process was started");
        assert!(
            message.contains(&home.join(".env").display().to_string()),
            "{message}"
        );
        assert!(message.contains("OPENAI_API_KEY"), "{message}");
        assert!(message.contains("per use"), "{message}");
        assert!(!message.contains("sk-planted-value"), "{message}");
    }

    #[test]
    #[cfg(unix)]
    fn a_dotenv_without_an_api_key_lets_the_codex_runtime_start() {
        let unrelated = "OPENAI_BASE_URL=https://example.invalid\n# OPENAI_API_KEY=sk-commented\nMY_OPENAI_API_KEY=x\n";
        let (root, executable, home) = stand_in_codex("start", unrelated);
        let started = |executable: &PathBuf, home: &Path| {
            let (events, _received) = std::sync::mpsc::sync_channel(1);
            Codex::start(
                executable.clone(),
                codex_dotenv(Some(home.into()), None),
                &root.join("cwd"),
                events,
            )
        };
        let with_file = started(&executable, &home);
        fs::remove_file(home.join(".env")).unwrap();
        let without_file = started(&executable, &home);
        let deadline = Instant::now() + Duration::from_secs(5);
        while !root.join("cwd/started").exists() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(10));
        }
        let launched = root.join("cwd/started").exists();
        for mut codex in [with_file, without_file].into_iter().flatten() {
            codex.shutdown().unwrap();
        }
        fs::remove_dir_all(&root).unwrap();
        assert!(launched, "the stand-in Codex process never ran");
    }

    #[test]
    fn codex_dotenv_follows_codex_home_then_the_home_directory() {
        let some = |value: &str| Some(OsString::from(value));
        assert_eq!(codex_dotenv(some("/c"), some("/h")), Some("/c/.env".into()));
        assert_eq!(
            codex_dotenv(some(""), some("/h")),
            Some("/h/.codex/.env".into())
        );
        assert_eq!(
            codex_dotenv(None, some("/h")),
            Some("/h/.codex/.env".into())
        );
        assert_eq!(codex_dotenv(None, None), None);
    }

    #[test]
    fn content_frames_do_not_raise_other_request_limits() {
        let value = json!({"id":"callback","method":"item/tool/call","params":{"tool":"voyager_vessel","arguments":{"text":"x".repeat(crate::content::ENVELOPE_LIMIT - 256)}}});
        let bytes = encode(&value, CONTENT_FRAME_LIMIT).unwrap();
        assert!(bytes.len() > 1024 * 1024);
        assert_eq!(decode(&bytes).unwrap(), value);
        assert!(encode(&value, 65536).is_err());
        let mut other = value.clone();
        other["params"]["tool"] = "voyager_process".into();
        assert!(decode(&serde_json::to_vec(&other).unwrap()).is_err());
        assert!(decode(&vec![b' '; CONTENT_FRAME_LIMIT + 1]).is_err());
        let reply = json!({"id":"callback","result":{"contentItems":[{"type":"inputText","text":"\\".repeat(crate::content::ENVELOPE_LIMIT - 256)}]}});
        assert!(encode(&reply, CONTENT_FRAME_LIMIT).is_ok());
        assert!(encode(&reply, 65536).is_err());
    }
}
