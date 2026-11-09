use crate::voice_wire::{self, Signal};
use serde::Deserialize;
use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, ExitStatus, Stdio},
    sync::{Arc, Mutex, mpsc},
    thread,
    time::{Duration, Instant},
};

pub(crate) struct Package {
    root: PathBuf,
    helper: PathBuf,
    pub build: String,
    pub version: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    schema_version: u32,
    app_version: String,
    build_commit: String,
}

impl Package {
    pub fn check_provider(&self, version: Option<&str>) -> Result<(), String> {
        if version != Some(self.version.as_str()) {
            return Err("The running Codex version does not match its native voice package. Audio did not open.".into());
        }
        Ok(())
    }

    pub fn discover(executable: &Path) -> Result<Self, String> {
        let executable = executable
            .canonicalize()
            .map_err(|_| "Codex executable is unavailable")?;
        let root = executable
            .parent()
            .and_then(Path::parent)
            .ok_or("Codex package path is unavailable")?
            .to_path_buf();
        let mut bytes = Vec::new();
        File::open(root.join("codex-resources/voice/manifest.json"))
            .map_err(|_| "This Codex installation has no native voice package")?
            .take(65537)
            .read_to_end(&mut bytes)
            .map_err(|_| "Native voice package metadata is unavailable")?;
        if bytes.len() > 65536 {
            return Err("Native voice package metadata exceeds its bound".into());
        }
        let manifest: Manifest =
            serde_json::from_slice(&bytes).map_err(|_| "Invalid native voice package metadata")?;
        if manifest.schema_version != 1 {
            return Err("This Codex voice package uses an unsupported manifest schema. Voyager supports schema 1.".into());
        }
        if manifest.app_version.is_empty()
            || manifest.app_version.len() > 64
            || !manifest
                .app_version
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'+'))
            || manifest.build_commit.len() != 40
            || !manifest
                .build_commit
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err("Native voice package identity is invalid".into());
        }
        let helper = root
            .join("codex-resources/voice/bin")
            .join(format!("codex-voice-host{}", std::env::consts::EXE_SUFFIX));
        if helper
            .canonicalize()
            .map_err(|_| "Native voice helper is unavailable")?
            != helper
        {
            return Err("Native voice helper is outside its installed package".into());
        }
        Ok(Self {
            root,
            helper,
            build: manifest.build_commit,
            version: manifest.app_version,
        })
    }
}

struct ChildOwner(Mutex<Child>);

impl Drop for ChildOwner {
    fn drop(&mut self) {
        let child = self
            .0
            .get_mut()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if child.try_wait().ok().flatten().is_none() && child.kill().is_ok() {
            let _ = child.wait();
        }
    }
}

#[derive(Clone)]
pub(crate) struct Cancellation(Arc<ChildOwner>);

impl Cancellation {
    pub fn stop(&self) -> Result<(), String> {
        let mut child = self
            .0
            .0
            .lock()
            .map_err(|_| "Native audio process state is unavailable")?;
        if child
            .try_wait()
            .map_err(|_| "Native audio exit is unconfirmed")?
            .is_none()
        {
            child
                .kill()
                .map_err(|_| "Native audio stop is unconfirmed")?;
        }
        Ok(())
    }

    pub fn wait(&self, timeout: Duration) -> Result<ExitStatus, String> {
        let deadline = Instant::now() + timeout;
        loop {
            let status = self
                .0
                .0
                .lock()
                .map_err(|_| "Native audio process state is unavailable")?
                .try_wait()
                .map_err(|_| "Native audio exit is unconfirmed")?;
            if let Some(status) = status {
                return Ok(status);
            }
            if Instant::now() >= deadline {
                return Err("Native audio exit is unconfirmed".into());
            }
            thread::sleep(Duration::from_millis(10));
        }
    }
}

pub(crate) struct Host {
    input: ChildStdin,
    output: mpsc::Receiver<Result<Signal, String>>,
    pub cancellation: Cancellation,
}

impl Host {
    pub fn spawn(
        package: &Package,
        environment: &[(std::ffi::OsString, std::ffi::OsString)],
    ) -> Result<Self, String> {
        let child = Command::new(&package.helper)
            .current_dir(&package.root)
            .env_clear()
            .envs(environment.iter().cloned())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "Native voice helper could not start")?;
        Self::wrap(child)
    }

    fn wrap(mut child: Child) -> Result<Self, String> {
        let (Some(input), Some(mut output)) = (child.stdin.take(), child.stdout.take()) else {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Native voice control pipes are unavailable".into());
        };
        let cancellation = Cancellation(Arc::new(ChildOwner(Mutex::new(child))));
        let (send, receive) = mpsc::sync_channel(2);
        thread::Builder::new()
            .name("voice-helper-reader".into())
            .spawn(move || {
                loop {
                    let response = voice_wire::read(&mut output)
                        .map_err(|_| "Native voice control frame failed".to_owned())
                        .and_then(|signal| {
                            signal.ok_or_else(|| "Native voice helper closed".into())
                        });
                    let failed = response.is_err();
                    if send.send(response).is_err() || failed {
                        break;
                    }
                }
            })
            .map_err(|_| "Native voice control reader could not start")?;
        Ok(Self {
            input,
            output: receive,
            cancellation,
        })
    }

    pub fn exchange(&mut self, signal: &Signal, timeout: Duration) -> Result<Signal, String> {
        voice_wire::write(&mut self.input, signal)
            .map_err(|_| "Native voice control write failed")?;
        self.output
            .recv_timeout(timeout)
            .map_err(|_| "Native voice control acknowledgement is unconfirmed")?
    }

    pub fn handshake(&mut self, build: String) -> Result<(), String> {
        let response = self.exchange(
            &Signal::Hello {
                protocol: 1,
                build_commit: build,
            },
            Duration::from_secs(10),
        )?;
        if matches!(response, Signal::Ready {}) {
            Ok(())
        } else {
            Err("Native voice helper is incompatible".into())
        }
    }

    pub fn close(mut self) -> Result<(), String> {
        let response = self.exchange(&Signal::Close {}, Duration::from_secs(5));
        if !matches!(response, Ok(Signal::Closed {})) {
            self.cancellation.stop()?;
        }
        let exit = self.cancellation.wait(Duration::from_secs(5))?;
        if !exit.success() {
            return Err("Native voice helper did not exit cleanly".into());
        }
        response.and_then(|signal| {
            if matches!(signal, Signal::Closed {}) {
                Ok(())
            } else {
                Err("Native voice close was not acknowledged".into())
            }
        })
    }
}

impl Drop for Host {
    fn drop(&mut self) {
        let _ = self.cancellation.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn voice_requires_the_running_providers_initialized_version() {
        let package = Package {
            root: PathBuf::new(),
            helper: PathBuf::new(),
            build: "a".repeat(40),
            version: "0.166.0".into(),
        };
        for (reply, compatible) in [
            (
                serde_json::json!({"userAgent":"voyager_native/0.166.0 (Linux)"}),
                true,
            ),
            (
                serde_json::json!({"userAgent":"voyager_native/0.165.0 (Linux) (0.166.0)"}),
                false,
            ),
            (
                serde_json::json!({"userAgent":"voyager_native/0.166.0-extra (Linux)"}),
                false,
            ),
            (serde_json::json!({"userAgent":"0.166.0"}), false),
            (serde_json::json!({}), false),
        ] {
            assert_eq!(
                package
                    .check_provider(crate::codex::reported_version(&reply))
                    .is_ok(),
                compatible,
                "Provider reply {reply}"
            );
        }
    }

    #[test]
    fn discovery_uses_package_schema_instead_of_an_application_release_pin() {
        let root =
            std::env::temp_dir().join(format!("voyager-voice-discovery-{}", std::process::id()));
        let executable = root.join("bin/codex");
        let voice = root.join("codex-resources/voice");
        let helper = voice
            .join("bin")
            .join(format!("codex-voice-host{}", std::env::consts::EXE_SUFFIX));
        std::fs::create_dir_all(executable.parent().unwrap()).unwrap();
        std::fs::create_dir_all(helper.parent().unwrap()).unwrap();
        std::fs::write(&executable, b"").unwrap();
        std::fs::write(&helper, b"").unwrap();
        let cases = [
            ("0.166.0", 1, true),
            ("0.167.0", 1, true),
            ("0.168.0-preview.1", 1, true),
            ("0.167.0", 2, false),
            ("", 1, false),
            ("0.167.0 invalid", 1, false),
        ];
        let outcomes: Vec<_> = cases.iter().map(|(version, schema, expected)| {
            std::fs::write(voice.join("manifest.json"), serde_json::to_vec(&serde_json::json!({"schemaVersion":schema,"appVersion":version,"buildCommit":"a".repeat(40)})).unwrap()).unwrap();
            let package = Package::discover(&executable);
            if let Ok(package) = &package {
                assert!(package.check_provider(Some(version)).is_ok());
                assert!(package.check_provider(Some("0.165.0")).is_err());
            }
            (version.to_string(), package.is_ok(), *expected)
        }).collect();
        std::fs::remove_dir_all(root).unwrap();
        assert!(
            outcomes
                .iter()
                .all(|(_, actual, expected)| actual == expected),
            "{outcomes:?}"
        );
    }

    #[test]
    #[cfg(unix)]
    fn lease_cancellation_unblocks_a_stalled_control_without_stopping_another_child() {
        let child = Command::new("/bin/sleep")
            .arg("10")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let mut unrelated = Command::new("/bin/sleep").arg("10").spawn().unwrap();
        let mut host = Host::wrap(child).unwrap();
        let cancellation = host.cancellation.clone();
        let waiting =
            thread::spawn(move || host.exchange(&Signal::InspectAudio {}, Duration::from_secs(3)));
        let start = Instant::now();
        let stop = cancellation.stop();
        let exit = cancellation.wait(Duration::from_secs(1));
        let independent = unrelated.try_wait().unwrap().is_none();
        unrelated.kill().unwrap();
        unrelated.wait().unwrap();
        let received = waiting.join().unwrap();
        assert!(stop.is_ok() && exit.is_ok() && received.is_err());
        assert!(independent && start.elapsed() < Duration::from_secs(1));
    }
}
