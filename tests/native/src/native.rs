use crate::inspection::{self, Unseen, centre, drawn_for, find, named, region};
use crate::sandbox;
use crate::system::{
    Identity, Owned, PATIENCE, Pinned, System, TimedOut, digest, interrupted, poll, save, settle,
    stamp, until, until_cleanup,
};
use crate::x11::{Display, Geometry, Pixels, Window};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::sleep;
use std::time::Duration;
use voyager_contract::inspection::{Frame, Role};

const EXPECTATION: Duration = Duration::from_secs(4);
const QUIET: Duration = Duration::from_millis(150);
const WHEEL_CLICKS: usize = 6;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
pub struct Layout {
    pub window: Option<(u16, u16)>,
    pub sidebar: Option<Sidebar>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Sidebar {
    Open,
    Collapsed,
}

impl Layout {
    pub fn parse(window: Option<&str>, sidebar: Option<&str>) -> Result<Self> {
        let window = window
            .map(|text| -> Result<(u16, u16)> {
                let (width, height) = text.split_once('x').context("Window is WIDTHxHEIGHT")?;
                Ok((width.parse()?, height.parse()?))
            })
            .transpose()
            .context("Window size")?;
        let sidebar = sidebar
            .map(|text| match text {
                "open" => Ok(Sidebar::Open),
                "collapsed" => Ok(Sidebar::Collapsed),
                _ => anyhow::bail!("Sidebar is open or collapsed"),
            })
            .transpose()?;
        Ok(Self { window, sidebar })
    }
}

pub struct Native {
    pub system: System,
    pub candidate: Pinned,
    pub hc: Pinned,
    layout: Layout,
    display: Option<Owned>,
    x11: Option<Display>,
    viewer: Option<Owned>,
    core: Option<Identity>,
    shell: Option<Identity>,
    pub address: String,
    placement: String,
    window: Window,
    launches: u32,
    core_id: Value,
    fault_fired: Arc<AtomicBool>,
}

impl Native {
    pub fn new(system: System, candidate: Pinned, hc: Pinned, layout: Layout) -> Self {
        Self {
            system,
            candidate,
            hc,
            layout,
            display: None,
            x11: None,
            viewer: None,
            core: None,
            shell: None,
            address: String::new(),
            placement: String::new(),
            window: 0,
            launches: 0,
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
                "-noreset",
            ],
            &[],
            "display.log",
        )?);
        self.x11 = Some(until("owned Xvfb", || {
            self.display
                .as_ref()
                .context("Missing display")?
                .identity
                .verify()?;
            Ok(Display::connect(sandbox::DISPLAY).ok())
        })?);
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
        (self.address, self.placement) = until("bound terminal", || {
            let doc = self
                .system
                .rpc("doc.get", json!({"name":"voyager-layout-v1"}))?;
            let content = &doc["value"]["contents"][0];
            Ok(content["backend"]
                .as_str()
                .zip(content["id"].as_str())
                .and_then(|(backend, id)| {
                    Some((backend.to_owned(), placement_of(&doc["value"], id)?))
                }))
        })?;
        let shell = self
            .system
            .rpc("terminal.get", json!({"terminal":self.address}))?;
        self.shell = Some(Identity::read(pid(&shell)?)?);
        save(
            self.system.evidence.join("identity.json"),
            &json!({"core":self.core,"coreId":self.core_id,"shell":self.shell,"terminal":self.address,"placement":self.placement}),
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
        self.launches += 1;
        let profile = self.system.evidence.join("profile");
        let inspection = self.inspection();
        let viewer = self.system.spawn(
            &self.candidate.path,
            &[
                "--profile",
                profile.to_str().context("Invalid profile path")?,
                "--session",
                &self.system.session,
                "--inspect",
                inspection.to_str().context("Invalid inspection path")?,
            ],
            &[("RUST_LOG", "debug"), ("RUST_BACKTRACE", "full")],
            "native.log",
        )?;
        self.viewer = Some(viewer);
        let title = self.title();
        self.window = until("unique candidate window", || {
            let viewer = self.viewer.as_ref().context("Missing viewer")?;
            viewer.identity.verify()?;
            let mut windows = self.x11()?.windows(viewer.identity.pid, &title)?;
            ensure!(windows.len() <= 1, "Ambiguous candidate windows");
            Ok(windows.pop())
        })?;
        self.verify()?;
        save(
            self.system.evidence.join("launch.json"),
            &json!({"viewer":self.viewer.as_ref().map(|v| &v.identity),"window":self.window,"session":self.system.session,"binary":self.candidate.path,"sha256":self.candidate.sha256,"hcSha256":self.hc.sha256,"display":self.system.env["DISPLAY"],"geometry":self.x11()?.geometry(self.window)?,"inspection":inspection,"layout":self.layout}),
        )?;
        Ok(())
    }

    pub fn inspection(&self) -> PathBuf {
        self.system
            .evidence
            .join(format!("inspection-{}.json", self.launches))
    }

    fn title(&self) -> String {
        format!("Voyager — {}", self.system.session)
    }

    fn x11(&self) -> Result<&Display> {
        self.x11.as_ref().context("Missing display connection")
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
        let (owner, title) = self.x11()?.owner(self.window)?;
        ensure!(owner == identity.pid, "Window has a different owner");
        ensure!(title == self.title(), "Window has a different session");
        Ok(())
    }

    pub fn wait_for<T>(
        &self,
        expected: &str,
        within: Duration,
        mut observe: impl FnMut(&Frame) -> Option<T>,
    ) -> Result<T> {
        let x11 = self.x11()?;
        let path = self.inspection();
        poll(within, Duration::from_millis(10), true, || {
            let window = x11.geometry(self.window)?;
            Ok(inspection::read(&path)?
                .filter(|frame| drawn_for(frame, window))
                .and_then(|frame| observe(&frame)))
        })?
        .ok_or_else(|| Unseen(expected.into()).into())
    }

    pub fn locate(&self, role: Role, key: &str) -> Result<Geometry> {
        let located = self.wait_for(&named(role, key), PATIENCE, |frame| {
            find(frame, role, key).map(|element| (region(frame, &element.bounds), frame.sequence))
        })?;
        self.system.record(
            json!({"event":"locate","role":role,"key":key,"region":located.0,"sequence":located.1}),
        )?;
        Ok(located.0)
    }

    fn arrange(&self) -> Result<()> {
        let x11 = self.x11()?;
        if let Some((width, height)) = self.layout.window {
            let current = x11.geometry(self.window)?;
            if (current.width, current.height) != (width, height) {
                self.system.act(
                    json!({"input":"resize","window":self.window,"size":[width,height]}),
                    || x11.resize(self.window, width, height),
                )?;
            }
        }
        let open = |frame: &Frame| {
            frame
                .elements
                .iter()
                .any(|element| element.role == Role::VoyageName)
        };
        let drawn = self.wait_for(&named(Role::Terminal, &self.placement), PATIENCE, |frame| {
            find(frame, Role::Terminal, &self.placement).map(|_| open(frame))
        })?;
        if let Some(sidebar) = self.layout.sidebar
            && drawn != (sidebar == Sidebar::Open)
        {
            let toggle = self.locate(Role::SidebarToggle, "")?;
            self.click(toggle)?;
            self.wait_for(&format!("the sidebar {sidebar:?}"), PATIENCE, |frame| {
                (open(frame) == (sidebar == Sidebar::Open)).then_some(())
            })?;
        }
        Ok(())
    }

    fn point(&self, target: Geometry) -> Result<()> {
        let x11 = self.x11()?;
        let window = x11.geometry(self.window)?;
        let (x, y) = centre(target);
        let (x, y) = (window.x + x, window.y + y);
        self.system
            .act(json!({"input":"move","at":[x,y]}), || x11.move_to(x, y))?;
        self.pointer()
    }

    fn click(&self, target: Geometry) -> Result<()> {
        self.point(target)?;
        let x11 = self.x11()?;
        self.system
            .act(json!({"input":"click","button":1}), || x11.click(1))
    }

    pub fn focus(&self) -> Result<()> {
        self.verify()?;
        self.arrange()?;
        let x11 = self.x11()?;
        self.system
            .act(json!({"input":"focus","window":self.window}), || {
                x11.focus(self.window)
            })?;
        self.click(self.locate(Role::Terminal, &self.placement)?)
    }

    fn keyboard(&self) -> Result<()> {
        self.verify()?;
        ensure!(
            self.x11()?.focused()? == self.window,
            "Keyboard focus left the owned candidate"
        );
        Ok(())
    }

    fn pointer(&self) -> Result<()> {
        self.verify()?;
        let under = self.x11()?.under_pointer()?;
        ensure!(
            under == self.window,
            "Pointer left the owned candidate: {under}"
        );
        Ok(())
    }

    pub fn type_text(&self, text: &str) -> Result<()> {
        self.keyboard()?;
        let x11 = self.x11()?;
        self.system
            .act(json!({"input":"type","text":text}), || x11.type_text(text))
    }

    pub fn key(&self, chord: &str) -> Result<()> {
        self.keyboard()?;
        let x11 = self.x11()?;
        self.system
            .act(json!({"input":"key","chord":chord}), || x11.chord(chord))
    }

    pub fn line(&self, text: &str) -> Result<()> {
        self.type_text(text)?;
        self.key("Return")
    }

    pub fn wheel(&self, up: bool) -> Result<()> {
        self.point(self.locate(Role::Terminal, &self.placement)?)?;
        let x11 = self.x11()?;
        let button = if up { 4 } else { 5 };
        self.system.act(
            json!({"input":"wheel","button":button,"clicks":WHEEL_CLICKS}),
            || (0..WHEEL_CLICKS).try_for_each(|_| x11.click(button)),
        )
    }

    pub fn look(&self) -> Result<Pixels> {
        let (terminal, avatar) =
            self.wait_for(&named(Role::Terminal, &self.placement), PATIENCE, |frame| {
                let terminal = find(frame, Role::Terminal, &self.placement)?;
                let avatar = find(frame, Role::Avatar, "");
                Some((
                    region(frame, &terminal.bounds),
                    avatar.map(|avatar| region(frame, &avatar.bounds)),
                ))
            })?;
        let mut pixels = self.x11()?.capture(self.window, terminal)?;
        if let Some(avatar) = avatar {
            pixels.mask(avatar);
        }
        Ok(pixels)
    }

    pub fn keep(&self, name: &str, look: &Pixels) -> Result<()> {
        let path = self.system.evidence.join(format!("{name}-{}.png", stamp()));
        look.image()?.save(&path)?;
        self.system.record(
            json!({"event":"capture","path":path,"sha256":digest(&path)?,"region":look.region}),
        )
    }

    pub fn settled(&self, name: &str, expected: impl Fn(&Pixels) -> bool) -> Result<Pixels> {
        let look = settle(EXPECTATION, QUIET, || self.look(), expected)?;
        self.keep(name, &look)?;
        Ok(look)
    }

    pub fn settled_with<T: PartialEq>(
        &self,
        name: &str,
        mut observe: impl FnMut() -> Result<T>,
        expected: impl Fn(&T, &Pixels) -> bool,
    ) -> Result<(T, Pixels)> {
        let (value, look) = settle(
            EXPECTATION,
            QUIET,
            || Ok((observe()?, self.look()?)),
            |(value, look)| expected(value, look),
        )?;
        self.keep(name, &look)?;
        Ok((value, look))
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
        let unseen = error.downcast_ref::<Unseen>().is_some();
        let timed_out = unseen || error.downcast_ref::<TimedOut>().is_some();
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
            let answers = self
                .system
                .env
                .get("DISPLAY")
                .is_some_and(|display| Display::answers(display));
            return match (answers, unseen) {
                (true, true) => Cause::Product(format!("{error:#}")),
                (true, false) => Cause::Product(format!("candidate stopped responding: {error:#}")),
                (false, _) => Cause::Fixture(format!("owned display is unresponsive: {error:#}")),
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
        self.x11 = None;
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

fn placement_of(value: &Value, content: &str) -> Option<String> {
    match value {
        Value::Object(map) if map.get("content").and_then(Value::as_str) == Some(content) => {
            map.get("id").and_then(Value::as_str).map(str::to_owned)
        }
        Value::Object(map) => map.values().find_map(|item| placement_of(item, content)),
        Value::Array(items) => items.iter().find_map(|item| placement_of(item, content)),
        _ => None,
    }
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
        Ok(Native::new(
            system,
            pinned.clone(),
            pinned,
            Layout::default(),
        ))
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
    fn the_terminal_placement_is_found_by_its_content() {
        let layout = json!({"voyages":[{"fleets":[{"vessels":[{"content":"content-6","id":"placement-7"},{"content":"content-2","id":"placement-3"}]}]}]});
        assert_eq!(
            placement_of(&layout, "content-2").as_deref(),
            Some("placement-3")
        );
        assert_eq!(placement_of(&layout, "content-9"), None);
    }

    #[test]
    fn an_element_that_never_appears_on_a_dead_display_is_a_fixture_fault() -> Result<()> {
        let mut native = native()?;
        let error = anyhow::Error::from(Unseen("\"avatar\" \"\"".into()));
        ensure!(
            matches!(native.diagnose(&error), Cause::Fixture(_)),
            "A dead display was blamed on the product"
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
