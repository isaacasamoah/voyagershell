use crate::sandbox;
use crate::system::{
    Identity, Owned, Pinned, System, TimedOut, digest, interrupted, save, stamp, until,
    until_cleanup,
};
use anyhow::{Context, Result, ensure};
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::sleep;
use std::time::Duration;

pub struct Native {
    pub system: System,
    pub candidate: Pinned,
    pub hc: Pinned,
    display: Option<Owned>,
    viewer: Option<Owned>,
    core: Option<Identity>,
    shell: Option<Identity>,
    pub address: String,
    window: String,
    core_id: Value,
    fault_fired: Arc<AtomicBool>,
}

impl Native {
    pub fn new(system: System, candidate: Pinned, hc: Pinned) -> Self {
        Self {
            system,
            candidate,
            hc,
            display: None,
            viewer: None,
            core: None,
            shell: None,
            address: String::new(),
            window: String::new(),
            core_id: Value::Null,
            fault_fired: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn prepare(&mut self) -> Result<()> {
        self.system
            .env
            .insert("DISPLAY".into(), sandbox::DISPLAY.into());
        self.display = Some(self.system.spawn(
            Path::new("Xvfb"),
            &[
                sandbox::DISPLAY,
                "-screen",
                "0",
                "3000x2000x24",
                "-dpi",
                "192",
                "-nolisten",
                "tcp",
            ],
            &[],
            "display.log",
        )?);
        until("owned Xvfb", || {
            self.display
                .as_ref()
                .context("Missing display")?
                .identity
                .verify()?;
            Ok(self
                .system
                .execute("xdotool", &["getmouselocation"], None)
                .ok())
        })?;
        self.system
            .execute("xrdb", &["-merge"], Some("Xft.dpi: 192\n"))?;
        self.launch()?;
        until("dedicated Core socket", || {
            Ok(self.system.socket().exists().then_some(()))
        })?;
        let core = self.system.rpc("server.status", json!({}))?;
        self.core = Some(Identity::read(pid(&core)?)?);
        self.core_id = core["core"]["id"].clone();
        ensure!(!self.core_id.is_null(), "Missing Core identity");
        self.address = until("bound terminal", || {
            let doc = self
                .system
                .rpc("doc.get", json!({"name":"voyager-layout-v1"}))?;
            Ok(doc["value"]["contents"][0]["backend"]
                .as_str()
                .map(str::to_owned))
        })?;
        let shell = self
            .system
            .rpc("terminal.get", json!({"terminal":self.address}))?;
        self.shell = Some(Identity::read(pid(&shell)?)?);
        save(
            self.system.evidence.join("identity.json"),
            &json!({"core":self.core,"coreId":self.core_id,"shell":self.shell,"terminal":self.address}),
        )?;
        self.focus()
    }

    pub fn launch(&mut self) -> Result<()> {
        ensure!(
            self.viewer.is_none(),
            "Existing viewer must close before reattachment"
        );
        self.candidate.verify()?;
        self.hc.verify()?;
        let profile = self.system.evidence.join("profile");
        let viewer = self.system.spawn(
            &self.candidate.path,
            &[
                "--profile",
                profile.to_str().context("Invalid profile path")?,
                "--session",
                &self.system.session,
            ],
            &[("RUST_LOG", "debug"), ("RUST_BACKTRACE", "full")],
            "native.log",
        )?;
        self.viewer = Some(viewer);
        self.window = until("unique candidate window", || {
            let viewer = self.viewer.as_ref().context("Missing viewer")?;
            viewer.identity.verify()?;
            let output = self.system.execute(
                "xdotool",
                &[
                    "search",
                    "--onlyvisible",
                    "--pid",
                    &viewer.identity.pid.to_string(),
                ],
                None,
            );
            let mut matches = Vec::new();
            if let Ok(output) = output {
                for window in output.lines() {
                    let title = self
                        .system
                        .execute("xdotool", &["getwindowname", window], None)?;
                    if title == format!("Voyager — {}", self.system.session) {
                        matches.push(window.to_owned());
                    }
                }
            }
            ensure!(matches.len() <= 1, "Ambiguous candidate windows");
            Ok(matches.pop())
        })?;
        self.verify()?;
        save(
            self.system.evidence.join("launch.json"),
            &json!({"viewer":self.viewer.as_ref().map(|v| &v.identity),"window":self.window,"session":self.system.session,"binary":self.candidate.path,"sha256":self.candidate.sha256,"hcSha256":self.hc.sha256,"display":self.system.env["DISPLAY"]}),
        )?;
        Ok(())
    }

    pub fn verify(&self) -> Result<()> {
        ensure!(!interrupted(), "Verification cancelled");
        self.display
            .as_ref()
            .context("Missing display")?
            .identity
            .verify()?;
        let identity = &self.viewer.as_ref().context("Missing viewer")?.identity;
        identity.verify()?;
        ensure!(
            self.system
                .execute("xdotool", &["getwindowpid", &self.window], None)?
                == identity.pid.to_string(),
            "Window has a different owner"
        );
        ensure!(
            self.system
                .execute("xdotool", &["getwindowname", &self.window], None)?
                == format!("Voyager — {}", self.system.session),
            "Window has a different session"
        );
        Ok(())
    }

    pub fn focus(&self) -> Result<()> {
        self.verify()?;
        self.system
            .execute("xdotool", &["windowfocus", "--sync", &self.window], None)?;
        self.capture("geometry")?;
        let geometry = self.system.execute(
            "xdotool",
            &["getwindowgeometry", "--shell", &self.window],
            None,
        )?;
        let coordinate = |name: &str| -> Result<i32> {
            geometry
                .lines()
                .find_map(|line| line.strip_prefix(&format!("{name}=")))
                .context("Missing window coordinate")?
                .parse()
                .context("Invalid window coordinate")
        };
        let x = (coordinate("X")? + 840).to_string();
        let y = (coordinate("Y")? + 350).to_string();
        self.system
            .execute("xdotool", &["mousemove", &x, &y], None)?;
        self.pointer()?;
        self.system.execute("xdotool", &["click", "1"], None)?;
        Ok(())
    }

    fn keyboard(&self) -> Result<()> {
        self.verify()?;
        let focused = self.system.execute("xdotool", &["getwindowfocus"], None)?;
        ensure!(
            focused == self.window,
            "Keyboard focus left the owned candidate"
        );
        Ok(())
    }

    fn pointer(&self) -> Result<()> {
        self.verify()?;
        let location = self
            .system
            .execute("xdotool", &["getmouselocation", "--shell"], None)?;
        ensure!(
            location
                .lines()
                .any(|line| line == format!("WINDOW={}", self.window)),
            "Pointer left the owned candidate: {location}"
        );
        Ok(())
    }

    pub fn type_text(&self, text: &str) -> Result<()> {
        self.keyboard()?;
        self.system.execute(
            "xdotool",
            &["type", "--clearmodifiers", "--delay", "1", "--", text],
            None,
        )?;
        Ok(())
    }

    pub fn key(&self, key: &str) -> Result<()> {
        self.keyboard()?;
        self.system.execute("xdotool", &["key", key], None)?;
        Ok(())
    }

    pub fn line(&self, text: &str) -> Result<()> {
        self.type_text(text)?;
        self.key("Return")
    }

    pub fn wheel(&self, up: bool) -> Result<()> {
        for _ in 0..6 {
            self.pointer()?;
            self.system
                .execute("xdotool", &["click", if up { "4" } else { "5" }], None)?;
            sleep(Duration::from_millis(40));
        }
        sleep(Duration::from_millis(300));
        Ok(())
    }

    pub fn capture(&self, name: &str) -> Result<Vec<u8>> {
        self.verify()?;
        let path = self.system.evidence.join(format!("{name}-{}.png", stamp()));
        self.system.execute(
            "import",
            &[
                "-window",
                &self.window,
                path.to_str().context("Invalid image path")?,
            ],
            None,
        )?;
        let image = image::open(&path)?;
        ensure!(
            image.dimensions() == (1450, 940),
            "Unsupported measured viewport: {:?}",
            image.dimensions()
        );
        let region = image.crop_imm(243, 89, 1188, 140).to_rgba8().into_raw();
        self.system.record(json!({"event":"capture","path":path,"sha256":digest(&path)?,"region":[243,89,1188,140]}))?;
        Ok(region)
    }

    pub fn same_program(&self) -> Result<()> {
        self.core
            .as_ref()
            .context("Missing Core identity")?
            .verify()?;
        let shell = self.shell.as_ref().context("Missing shell identity")?;
        shell.verify()?;
        ensure!(
            pid(&self
                .system
                .rpc("terminal.get", json!({"terminal":self.address}))?)?
                == shell.pid,
            "Terminal shell changed"
        );
        ensure!(
            self.system.rpc("server.status", json!({}))?["core"]["id"] == self.core_id,
            "Core identity changed"
        );
        Ok(())
    }

    pub fn close(&mut self) -> Result<()> {
        self.key("ctrl+q")?;
        let viewer = self.viewer.as_mut().context("Missing viewer")?;
        until("owned viewer exit", || {
            Ok(viewer.child.try_wait()?.map(|_| ()))
        })?;
        self.viewer = None;
        Ok(())
    }

    pub fn diagnose(&mut self, error: &anyhow::Error) -> Cause {
        let timed_out = error.downcast_ref::<TimedOut>().is_some();
        let attempts = if timed_out { 1 } else { EXIT_GRACE_POLLS };
        for attempt in 0..attempts {
            if let Some(viewer) = self.viewer.as_mut()
                && let Some(status) = exited(viewer)
            {
                return Cause::Product(format!("candidate exited unexpectedly: {status}"));
            }
            if attempt + 1 < attempts {
                sleep(Duration::from_millis(100));
            }
        }
        if let Some(display) = self.display.as_mut()
            && let Some(status) = exited(display)
        {
            return Cause::Fixture(format!("owned display exited: {status}"));
        }
        if let Some(viewer) = &self.viewer
            && process_state(viewer.identity.pid) == Some('T')
        {
            return Cause::Product("candidate is stopped and cannot respond".into());
        }
        if let Some(core) = &self.core
            && core.verify().is_err()
        {
            return Cause::Product("Core exited while the candidate was running".into());
        }
        if timed_out {
            return match self.system.execute("xdotool", &["getmouselocation"], None) {
                Ok(_) => Cause::Product(format!("candidate stopped responding: {error:#}")),
                Err(_) => Cause::Fixture(format!("owned display is unresponsive: {error:#}")),
            };
        }
        Cause::Fixture(format!("{error:#}"))
    }

    pub fn processes(&mut self) -> Value {
        let mut report = serde_json::Map::new();
        let mut owned = |name: &str, process: Option<&mut Owned>| {
            if let Some(process) = process {
                let state = match exited(process) {
                    Some(status) => json!({"exited":status}),
                    None => {
                        json!({"running":process_state(process.identity.pid).map(String::from)})
                    }
                };
                report.insert(
                    name.into(),
                    json!({"identity":process.identity,"state":state}),
                );
            }
        };
        owned("candidate", self.viewer.as_mut());
        owned("display", self.display.as_mut());
        for (name, identity) in [("core", &self.core), ("shell", &self.shell)] {
            if let Some(identity) = identity {
                report.insert(
                    name.into(),
                    json!({"identity":identity,"alive":identity.verify().is_ok(),"state":process_state(identity.pid).map(String::from)}),
                );
            }
        }
        Value::Object(report)
    }

    pub fn inject(&self, fault: &Fault) -> Result<()> {
        let identity = self
            .viewer
            .as_ref()
            .context("Missing viewer")?
            .identity
            .clone();
        let (delay, signal) = (fault.after, fault.signal());
        let fired = self.fault_fired.clone();
        std::thread::spawn(move || {
            sleep(Duration::from_secs(delay));
            if identity.verify().is_ok()
                && let Some(pid) = rustix::process::Pid::from_raw(identity.pid as i32)
            {
                let _ = rustix::process::kill_process(pid, signal);
                fired.store(true, Ordering::SeqCst);
            }
        });
        Ok(())
    }

    pub fn fault_fired(&self) -> bool {
        self.fault_fired.load(Ordering::SeqCst)
    }

    pub fn cleanup(&mut self, candidate_faulted: bool) -> Vec<String> {
        let mut errors = Vec::new();
        if let Some(mut viewer) = self.viewer.take() {
            let stopped = if candidate_faulted {
                viewer.abandon()
            } else {
                viewer.stop()
            };
            if let Err(error) = stopped {
                errors.push(format!("viewer: {error:#}"));
            }
        }
        if self.system.socket().exists() {
            let stopped = (|| -> Result<()> {
                if self.core.is_none() {
                    self.core = Some(Identity::read(pid(&self
                        .system
                        .rpc("server.status", json!({}))?)?)?);
                }
                self.core
                    .as_ref()
                    .context("Missing Core identity")?
                    .verify()?;
                self.system.rpc("server.stop", json!({}))?;
                until_cleanup("dedicated Core exit", || {
                    Ok((!self.system.socket().exists()).then_some(()))
                })?;
                Ok(())
            })();
            if let Err(error) = stopped {
                errors.push(format!("Core: {error:#}"));
            }
        }
        for identity in [&self.core, &self.shell].into_iter().flatten() {
            if let Err(error) = until_cleanup("owned program exit", || {
                Ok((!Path::new(&format!("/proc/{}", identity.pid)).exists()).then_some(()))
            }) {
                errors.push(format!("process {}: {error:#}", identity.pid));
            }
        }
        if let Some(mut display) = self.display.take()
            && let Err(error) = display.stop()
        {
            errors.push(format!("display: {error:#}"));
        }
        if let Some(number) = self
            .system
            .env
            .get("DISPLAY")
            .and_then(|display| display.strip_prefix(':'))
        {
            for path in [
                format!("/tmp/.X{number}-lock"),
                format!("/tmp/.X11-unix/X{number}"),
            ] {
                if Path::new(&path).exists() {
                    errors.push(format!("Display residue remains: {path}"));
                }
            }
        }
        errors
    }
}

pub enum Cause {
    Product(String),
    Fixture(String),
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub enum Action {
    Kill,
    Stop,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub struct Fault {
    pub action: Action,
    pub after: u64,
}

impl Fault {
    pub fn parse(text: &str) -> Result<Self> {
        let (action, seconds) = text.split_once(':').context("Fault is ACTION:SECONDS")?;
        Ok(Self {
            action: match action {
                "kill" => Action::Kill,
                "stop" => Action::Stop,
                _ => anyhow::bail!("Fault action is kill or stop"),
            },
            after: seconds.parse().context("Fault seconds")?,
        })
    }

    fn signal(&self) -> rustix::process::Signal {
        match self.action {
            Action::Kill => rustix::process::Signal::KILL,
            Action::Stop => rustix::process::Signal::STOP,
        }
    }
}

const EXIT_GRACE_POLLS: usize = 10;

fn exited(process: &mut Owned) -> Option<String> {
    if let Ok(Some(status)) = process.child.try_wait() {
        return Some(describe(status));
    }
    match process_state(process.identity.pid) {
        Some('Z') | None => process.child.wait().ok().map(describe),
        _ => None,
    }
}

fn describe(status: std::process::ExitStatus) -> String {
    use std::os::unix::process::ExitStatusExt;
    match (status.code(), status.signal()) {
        (Some(code), _) => format!("exit code {code}"),
        (None, Some(signal)) => format!("signal {signal}"),
        _ => status.to_string(),
    }
}

fn process_state(pid: u32) -> Option<char> {
    let stat = fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    stat.rsplit_once(')')?.1.trim().chars().next()
}

pub fn pid(value: &Value) -> Result<u32> {
    u32::try_from(value["pid"].as_u64().context("Missing process PID")?).context("Invalid PID")
}

pub fn state(path: &Path) -> Result<Value> {
    serde_json::from_slice(&fs::read(path)?).context("Invalid probe state")
}

pub fn quote(value: &Path) -> Result<String> {
    Ok(format!(
        "'{}'",
        value
            .to_str()
            .context("Non-UTF8 shell path")?
            .replace('\'', "'\\''")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn native() -> Result<Native> {
        let evidence =
            std::env::temp_dir().join(format!("vv-diagnose-{}-{}", std::process::id(), stamp()));
        fs::create_dir(&evidence)?;
        let system = System::with_env(evidence, "voyager-verify-test".into(), BTreeMap::new());
        let sleep = fs::canonicalize("/bin/sleep")?;
        let pinned = Pinned::check(&sleep, &digest(&sleep)?)?;
        Ok(Native::new(system, pinned.clone(), pinned))
    }

    #[test]
    fn a_killed_candidate_is_a_product_failure() -> Result<()> {
        let mut native = native()?;
        let mut viewer = native.system.spawn(
            Path::new("/usr/bin/tail"),
            &["-f", "/dev/null"],
            &[],
            "viewer.log",
        )?;
        viewer.child.kill()?;
        viewer.child.wait()?;
        native.viewer = Some(viewer);
        let cause = native.diagnose(&anyhow::anyhow!("window vanished"));
        ensure!(
            matches!(&cause, Cause::Product(detail) if detail.contains("signal 9")),
            "A killed candidate was not blamed on the product"
        );
        Ok(())
    }

    #[test]
    fn a_missing_host_tool_is_a_fixture_fault() -> Result<()> {
        let mut native = native()?;
        let error = native
            .system
            .execute("voyager-missing-tool", &[], None)
            .expect_err("A missing tool ran");
        ensure!(
            matches!(native.diagnose(&error), Cause::Fixture(_)),
            "A missing tool was blamed on the product"
        );
        Ok(())
    }

    #[test]
    fn a_timeout_on_an_unresponsive_display_is_a_fixture_fault() -> Result<()> {
        let mut native = native()?;
        let error = anyhow::Error::from(TimedOut("anything".into()));
        ensure!(
            matches!(native.diagnose(&error), Cause::Fixture(_)),
            "A dead display was blamed on the product"
        );
        Ok(())
    }
}
