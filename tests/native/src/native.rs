mod input;
mod terminal;

pub use input::Wheel;
pub use terminal::Terminal;

use crate::inspection::{self, Target, Unseen, drawn_for};
use crate::sandbox;
use crate::system::{
    Identity, Owned, PATIENCE, Pinned, System, TimedOut, digest, interrupted, poll, save, stamp,
    until, until_cleanup,
};
use crate::x11::{Display, Geometry, Key, Pixels, Window};
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::sleep;
use std::time::{Duration, Instant};
use voyager_contract::inspection::{Frame, Role};
use voyager_contract::{Layout, Vessel};

const QUIET: Duration = Duration::from_millis(150);
const GLANCE: Duration = Duration::from_millis(80);

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
pub struct Surface {
    pub window: Option<(u16, u16)>,
    pub sidebar: Option<Sidebar>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Sidebar {
    Open,
    Collapsed,
}

impl fmt::Display for Sidebar {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Sidebar::Open => "open",
            Sidebar::Collapsed => "collapsed",
        })
    }
}

impl Surface {
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

    pub fn with_sidebar(mut self, required: Option<Sidebar>) -> Result<Self> {
        if let Some(required) = required {
            ensure!(
                self.sidebar.is_none_or(|chosen| chosen == required),
                "The journey needs the sidebar {required}"
            );
            self.sidebar = Some(required);
        }
        Ok(self)
    }
}

pub struct Seen<'a> {
    pub frame: &'a Frame,
}

impl Seen<'_> {
    pub fn shows(&self, target: &Target) -> bool {
        target.find(self.frame).is_some()
    }
}

enum Glance<T> {
    Absent,
    Preparing,
    Ready(T),
}

fn glance<T>(frame: Option<&Frame>, check: impl FnOnce(&Seen) -> Option<T>) -> Glance<T> {
    let Some(frame) = frame else {
        return Glance::Absent;
    };
    match check(&Seen { frame }) {
        None => Glance::Absent,
        Some(_) if !frame.prepared => Glance::Preparing,
        Some(value) => Glance::Ready(value),
    }
}

struct Held<T> {
    value: Option<(T, Instant)>,
    preparing: bool,
}

impl<T: PartialEq> Held<T> {
    fn see(&mut self, glance: Glance<T>, now: Instant) -> bool {
        self.preparing = matches!(glance, Glance::Preparing);
        let Glance::Ready(value) = glance else {
            self.value = None;
            return false;
        };
        let since = match self.value.take() {
            Some((previous, since)) if previous == value => since,
            _ => now,
        };
        self.value = Some((value, since));
        now.duration_since(since) >= QUIET
    }
}

fn placed(layout: &Layout) -> impl Iterator<Item = &Vessel> {
    layout
        .voyages
        .iter()
        .chain(&layout.home)
        .flat_map(|voyage| {
            voyage
                .fleets
                .iter()
                .flat_map(|fleet| &fleet.vessels)
                .chain(&voyage.portals)
        })
}

pub struct Native {
    pub system: System,
    pub candidate: Pinned,
    pub hc: Pinned,
    surface: Surface,
    display: Option<Owned>,
    x11: Option<Display>,
    viewer: Option<Owned>,
    core: Option<Identity>,
    core_id: Value,
    adopted: Vec<(String, Identity)>,
    window: Window,
    launches: u32,
    fault_fired: Arc<AtomicBool>,
}

impl Native {
    pub fn new(system: System, candidate: Pinned, hc: Pinned, surface: Surface) -> Self {
        Self {
            system,
            candidate,
            hc,
            surface,
            display: None,
            x11: None,
            viewer: None,
            core: None,
            core_id: Value::Null,
            adopted: Vec::new(),
            window: 0,
            launches: 0,
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
        self.start()?;
        until("dedicated Core socket", || {
            Ok(self.system.socket().exists().then_some(()))
        })?;
        let core = self.system.rpc("server.status", json!({}))?;
        self.core = Some(Identity::read(pid(&core)?)?);
        self.core_id = core["core"]["id"].clone();
        ensure!(!self.core_id.is_null(), "Missing Core identity");
        self.identify(None)?;
        self.present()
    }

    fn identify(&self, first: Option<&Terminal>) -> Result<()> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct Identities<'a> {
            core: &'a Option<Identity>,
            core_id: &'a Value,
            #[serde(flatten)]
            first: Option<&'a Terminal>,
        }
        save(
            self.system.evidence.join("identity.json"),
            &Identities {
                core: &self.core,
                core_id: &self.core_id,
                first,
            },
        )
    }

    pub fn launch(&mut self) -> Result<()> {
        self.start()?;
        self.present()
    }

    fn start(&mut self) -> Result<()> {
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
            &json!({"viewer":self.viewer.as_ref().map(|v| &v.identity),"window":self.window,"session":self.system.session,"binary":self.candidate.path,"sha256":self.candidate.sha256,"hcSha256":self.hc.sha256,"display":self.system.env["DISPLAY"],"geometry":self.x11()?.geometry(self.window)?,"inspection":inspection,"layout":self.surface}),
        )
    }

    fn present(&self) -> Result<()> {
        self.arrange()?;
        let x11 = self.x11()?;
        self.system
            .act(json!({"input":"focus","window":self.window}), || {
                x11.focus(self.window)
            })
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

    fn wait_for<T>(
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

    fn arrange(&self) -> Result<()> {
        let x11 = self.x11()?;
        let current = x11.geometry(self.window)?;
        if (current.x, current.y) != (0, 0) {
            self.system.act(
                json!({"input":"place","window":self.window,"at":[0,0]}),
                || x11.place(self.window, 0, 0),
            )?;
        }
        if let Some((width, height)) = self.surface.window
            && (current.width, current.height) != (width, height)
        {
            self.system.act(
                json!({"input":"resize","window":self.window,"size":[width,height]}),
                || x11.resize(self.window, width, height),
            )?;
        }
        let open = |frame: &Frame| {
            frame
                .elements
                .iter()
                .any(|element| element.role == Role::VoyageName)
        };
        let toggle = Target::SIDEBAR_TOGGLE;
        let drawn = self.observe("the prepared workspace", |seen| {
            seen.shows(&toggle).then(|| open(seen.frame))
        })?;
        if let Some(sidebar) = self.surface.sidebar
            && drawn != (sidebar == Sidebar::Open)
        {
            self.click(&toggle)?;
            self.observe(&format!("the sidebar {sidebar}"), |seen| {
                (open(seen.frame) == (sidebar == Sidebar::Open)).then_some(())
            })?;
        }
        Ok(())
    }

    pub fn observe<T: PartialEq>(
        &self,
        expected: &str,
        mut check: impl FnMut(&Seen) -> Option<T>,
    ) -> Result<T> {
        let x11 = self.x11()?;
        let path = self.inspection();
        let mut held = Held {
            value: None,
            preparing: false,
        };
        let steady = poll(PATIENCE, GLANCE, true, || {
            let window = x11.geometry(self.window)?;
            let frame = inspection::read(&path)?.filter(|frame| drawn_for(frame, window));
            let seen = glance(frame.as_ref(), &mut check);
            Ok(held.see(seen, Instant::now()).then_some(()))
        })?;
        match (steady, held.value) {
            (Some(()), Some((value, _))) => Ok(value),
            _ if held.preparing => {
                Err(Unseen(format!("{expected} with the workspace prepared")).into())
            }
            _ => Err(Unseen(expected.into()).into()),
        }
    }

    pub fn document(&self) -> Result<Option<Layout>> {
        let reply = self
            .system
            .watch("doc.get", json!({"name":"voyager-layout-v1"}))?;
        match &reply["value"] {
            Value::Null => Ok(None),
            value => serde_json::from_value(value.clone()).map(Some).context(
                "The layout document is not the contract Layout this verifier was built with",
            ),
        }
    }

    pub fn keep(&self, name: &str, look: &Pixels) -> Result<()> {
        let path = self.system.evidence.join(format!("{name}-{}.png", stamp()));
        look.image()?.save(&path)?;
        self.system.record(
            json!({"event":"capture","path":path,"sha256":digest(&path)?,"region":look.region}),
        )
    }

    pub fn keep_window(&self, name: &str) -> Result<()> {
        let x11 = self.x11()?;
        let window = x11.geometry(self.window)?;
        let whole = Geometry {
            x: 0,
            y: 0,
            ..window
        };
        self.keep(name, &x11.capture(self.window, whole)?)
    }

    pub fn adopt(&mut self, name: String, identity: Identity) {
        self.adopted.push((name, identity));
    }

    pub fn same_core(&self) -> Result<()> {
        self.core
            .as_ref()
            .context("Missing Core identity")?
            .verify()?;
        ensure!(
            self.system.rpc("server.status", json!({}))?["core"]["id"] == self.core_id,
            "Core identity changed"
        );
        Ok(())
    }

    pub fn close(&mut self) -> Result<()> {
        self.press(Key::Char('q').ctrl())?;
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
        let core = self.core.iter().map(|identity| ("core", identity));
        let adopted = self
            .adopted
            .iter()
            .map(|(name, identity)| (name.as_str(), identity));
        for (name, identity) in core.chain(adopted) {
            report.insert(
                name.into(),
                json!({"identity":identity,"alive":identity.verify().is_ok(),"state":process_state(identity.pid).map(String::from)}),
            );
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
        let adopted = self.adopted.iter().map(|(_, identity)| identity);
        for identity in self.core.iter().chain(adopted) {
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
            Surface::default(),
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

    fn frame(prepared: bool) -> Result<Frame> {
        Ok(serde_json::from_value(json!({
            "sequence": 1,
            "window": {"width": 725.0, "height": 470.0, "scale": 2.0},
            "dock": {"kind": "workspace"},
            "prepared": prepared,
            "elements": [],
            "ambiguous": []
        }))?)
    }

    #[test]
    fn an_outcome_seen_while_the_workspace_prepares_does_not_count() -> Result<()> {
        let (preparing, prepared) = (frame(false)?, frame(true)?);
        let seen = |frame: Option<&Frame>, outcome: Option<u8>| glance(frame, |_| outcome);
        ensure!(
            matches!(seen(Some(&preparing), Some(7)), Glance::Preparing),
            "An outcome counted while the header reported a pending workspace request"
        );
        ensure!(
            matches!(seen(Some(&prepared), Some(7)), Glance::Ready(7)),
            "An outcome in a prepared workspace did not count"
        );
        ensure!(
            matches!(seen(Some(&prepared), None), Glance::Absent),
            "A missing outcome counted"
        );
        ensure!(
            matches!(seen(None, Some(7)), Glance::Absent),
            "An outcome counted without a frame"
        );
        Ok(())
    }

    #[test]
    fn an_outcome_counts_once_it_held_through_every_glance_of_the_quiet_window() {
        let start = Instant::now();
        let at = |milliseconds: u64| start + Duration::from_millis(milliseconds);
        let mut held = Held {
            value: None,
            preparing: false,
        };
        assert!(!held.see(Glance::Ready(1), at(0)));
        assert!(!held.see(Glance::Ready(1), at(80)));
        assert!(held.see(Glance::Ready(1), at(160)));
        assert!(!held.see(Glance::Ready(2), at(240)), "a changed outcome");
        assert!(!held.see(Glance::Absent, at(320)));
        assert!(
            !held.see(Glance::Ready(2), at(400)),
            "an outcome kept its age across a glance without it"
        );
        assert!(!held.see(Glance::Preparing, at(480)) && held.preparing);
        assert!(
            !held.see(Glance::Ready(2), at(560)) && !held.preparing,
            "an outcome kept its age across a preparing workspace"
        );
        assert!(held.see(Glance::Ready(2), at(710)));
        assert_eq!(held.value.map(|(value, _)| value), Some(2));
    }

    #[test]
    fn a_journey_fixes_its_sidebar_and_refuses_the_other_one() -> Result<()> {
        let unset = Surface::parse(None, None)?;
        ensure!(
            unset.with_sidebar(None)?.sidebar.is_none(),
            "A sidebar was chosen without a requirement"
        );
        ensure!(
            unset.with_sidebar(Some(Sidebar::Open))?.sidebar == Some(Sidebar::Open),
            "The required sidebar was not applied"
        );
        let collapsed = Surface::parse(Some("1180x820"), Some("collapsed"))?;
        ensure!(
            collapsed.with_sidebar(Some(Sidebar::Collapsed)).is_ok(),
            "A matching sidebar was refused"
        );
        let refusal = collapsed
            .with_sidebar(Some(Sidebar::Open))
            .expect_err("A contradicting sidebar was accepted");
        ensure!(
            refusal.to_string() == "The journey needs the sidebar open",
            "The refusal does not name the required sidebar: {refusal}"
        );
        Ok(())
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
