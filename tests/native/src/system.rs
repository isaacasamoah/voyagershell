use crate::sandbox;
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::fs::{FileTypeExt, MetadataExt, PermissionsExt};
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{
    Arc, Mutex, OnceLock,
    atomic::{AtomicBool, AtomicUsize, Ordering},
};
use std::thread::sleep;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub fn stamp() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

pub fn save(path: impl AsRef<Path>, value: &impl Serialize) -> Result<()> {
    let path = path.as_ref();
    let temporary = path.with_extension("pending");
    let mut file = File::create(&temporary)?;
    serde_json::to_writer_pretty(&mut file, value)?;
    file.write_all(b"\n")?;
    file.sync_all()?;
    fs::rename(temporary, path)?;
    Ok(())
}

pub fn digest(path: &Path) -> Result<String> {
    Ok(format!("{:x}", Sha256::digest(fs::read(path)?)))
}

#[derive(Debug)]
pub struct TimedOut(pub String);

impl std::fmt::Display for TimedOut {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Timed out observing {}", self.0)
    }
}

impl std::error::Error for TimedOut {}

pub const PATIENCE: Duration = Duration::from_secs(12);

pub fn until<T>(name: &str, observe: impl FnMut() -> Result<Option<T>>) -> Result<T> {
    poll(PATIENCE, Duration::from_millis(80), true, observe)?
        .ok_or_else(|| TimedOut(name.into()).into())
}

pub fn until_cleanup<T>(name: &str, observe: impl FnMut() -> Result<Option<T>>) -> Result<T> {
    poll(PATIENCE, Duration::from_millis(80), false, observe)?
        .ok_or_else(|| TimedOut(name.into()).into())
}

pub const QUIET: Duration = Duration::from_millis(150);

struct Held<T>(Option<(T, Instant)>);

impl<T: PartialEq> Held<T> {
    fn see(&mut self, value: Option<T>, now: Instant) -> bool {
        let since = match (self.0.take(), &value) {
            (Some((previous, since)), Some(value)) if previous == *value => since,
            _ => now,
        };
        self.0 = value.map(|value| (value, since));
        self.0.is_some() && now.duration_since(since) >= QUIET
    }
}

pub fn settle<T: PartialEq>(
    within: Duration,
    every: Duration,
    mut read: impl FnMut() -> Result<Option<T>>,
    wanted: impl Fn(&T) -> bool,
) -> Result<Option<T>> {
    let mut held = Held(None);
    let mut still = false;
    poll(within, every, true, || {
        still = held.see(read()?, Instant::now());
        let settled = still && held.0.as_ref().is_some_and(|(value, _)| wanted(value));
        Ok(settled.then_some(()))
    })?;
    Ok(held.0.filter(|_| still).map(|(value, _)| value))
}

static CANCELLED: OnceLock<Arc<AtomicBool>> = OnceLock::new();

pub fn listen_for_cancel() -> Result<()> {
    let flag = Arc::new(AtomicBool::new(false));
    for signal in [signal_hook::consts::SIGINT, signal_hook::consts::SIGTERM] {
        signal_hook::flag::register(signal, flag.clone())?;
    }
    CANCELLED
        .set(flag)
        .map_err(|_| anyhow::anyhow!("Cancellation already prepared"))?;
    Ok(())
}

pub fn interrupted() -> bool {
    CANCELLED
        .get()
        .is_some_and(|flag| flag.load(Ordering::Relaxed))
}

pub fn poll<T>(
    within: Duration,
    every: Duration,
    cancellable: bool,
    mut observe: impl FnMut() -> Result<Option<T>>,
) -> Result<Option<T>> {
    let deadline = Instant::now() + within;
    loop {
        ensure!(!cancellable || !interrupted(), "Verification cancelled");
        if let Some(value) = observe()? {
            return Ok(Some(value));
        }
        if Instant::now() >= deadline {
            return Ok(None);
        }
        sleep(every);
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Identity {
    pub pid: u32,
    pub start: String,
    pub executable: PathBuf,
}

impl Identity {
    pub fn read(pid: u32) -> Result<Self> {
        let proc = PathBuf::from(format!("/proc/{pid}"));
        ensure!(
            fs::metadata(&proc)?.uid() == rustix::process::getuid().as_raw(),
            "Foreign process {pid}"
        );
        let stat = fs::read_to_string(proc.join("stat"))?;
        let (_, fields) = stat.rsplit_once(')').context("Malformed process stat")?;
        Ok(Self {
            pid,
            start: fields
                .split_whitespace()
                .nth(19)
                .context("Missing process start")?
                .into(),
            executable: fs::read_link(proc.join("exe"))?,
        })
    }

    pub fn verify(&self) -> Result<()> {
        ensure!(
            Self::read(self.pid)? == *self,
            "Process identity changed: {}",
            self.pid
        );
        Ok(())
    }
}

pub struct Owned {
    pub child: Child,
    pub identity: Identity,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Stopped {
    Exited { signals: u32 },
    Killed { signals: u32, stuck: String },
}

const RESIGNAL: Duration = Duration::from_secs(1);

impl Owned {
    pub fn stop(&mut self) -> Result<Stopped> {
        self.stop_within(PATIENCE)
    }

    pub fn stop_within(&mut self, patience: Duration) -> Result<Stopped> {
        let mut signals = 0;
        if self.child.try_wait()?.is_none() {
            self.identity.verify()?;
            let pid = rustix::process::Pid::from_raw(i32::try_from(self.identity.pid)?)
                .context("Invalid owned PID")?;
            let mut signalled: Option<Instant> = None;
            let exited = poll(patience, Duration::from_millis(80), false, || {
                if self.child.try_wait()?.is_some() {
                    return Ok(Some(()));
                }
                if signalled.is_none_or(|at| at.elapsed() >= RESIGNAL) {
                    rustix::process::kill_process(pid, rustix::process::Signal::TERM)?;
                    signalled = Some(Instant::now());
                    signals += 1;
                }
                Ok(None)
            })?;
            if exited.is_none() {
                self.identity.verify()?;
                let stuck = stuck(self.identity.pid);
                self.child.kill()?;
                self.child.wait()?;
                return Ok(Stopped::Killed { signals, stuck });
            }
        }
        self.child.wait()?;
        Ok(Stopped::Exited { signals })
    }
}

fn stuck(pid: u32) -> String {
    let read = |file: &str| {
        fs::read_to_string(format!("/proc/{pid}/{file}"))
            .unwrap_or_else(|error| format!("unreadable: {error}"))
    };
    let stat = read("stat");
    let state = stat
        .rsplit_once(')')
        .and_then(|(_, fields)| fields.split_whitespace().next())
        .unwrap_or("unknown");
    let syscall = read("syscall");
    format!(
        "state {state}, waiting in {}, system call {}",
        read("wchan").trim(),
        syscall.split_whitespace().next().unwrap_or("unknown")
    )
}

impl Owned {
    pub fn abandon(&mut self) -> Result<()> {
        if self.child.try_wait()?.is_none() {
            self.identity.verify()?;
            self.child.kill()?;
        }
        self.child.wait()?;
        Ok(())
    }
}

impl Drop for Owned {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

pub struct System {
    pub evidence: PathBuf,
    pub session: String,
    pub env: BTreeMap<String, String>,
    acknowledged: AtomicUsize,
    dispatch_mark: AtomicUsize,
    watched: Mutex<BTreeMap<String, Value>>,
}

impl System {
    pub fn new(evidence: PathBuf, session: String) -> Result<Self> {
        ensure!(
            Path::new(sandbox::RUNTIME).is_dir(),
            "The driver runs only inside the verification sandbox"
        );
        let mut system = Self::with_env(
            evidence,
            session,
            sandbox::ENVIRONMENT
                .iter()
                .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
                .collect(),
        );
        let socket = sandbox::text(&system.socket())?;
        ensure!(
            socket.len() + 20 <= 107,
            "Private Core socket namespace is too long"
        );
        for (key, value) in [
            (
                "DBUS_SESSION_BUS_ADDRESS",
                std::env::var("DBUS_SESSION_BUS_ADDRESS")
                    .context("Missing private D-Bus session")?,
            ),
            ("HC_SESSION", system.session.clone()),
            ("HC_SOCKET", socket),
        ] {
            system.env.insert(key.into(), value);
        }
        Ok(system)
    }

    pub(crate) fn with_env(
        evidence: PathBuf,
        session: String,
        env: BTreeMap<String, String>,
    ) -> Self {
        Self {
            evidence,
            session,
            env,
            acknowledged: AtomicUsize::new(0),
            dispatch_mark: AtomicUsize::new(0),
            watched: Mutex::new(BTreeMap::new()),
        }
    }

    pub fn mark_dispatch(&self) {
        self.dispatch_mark
            .store(self.acknowledged.load(Ordering::SeqCst), Ordering::SeqCst);
    }

    pub fn acknowledged_since_dispatch(&self) -> bool {
        self.acknowledged.load(Ordering::SeqCst) > self.dispatch_mark.load(Ordering::SeqCst)
    }

    pub fn record(&self, value: Value) -> Result<()> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.evidence.join("actions.jsonl"))?;
        serde_json::to_writer(&mut file, &value)?;
        file.write_all(b"\n")?;
        file.sync_data()?;
        Ok(())
    }

    fn command(&self, program: &str) -> Command {
        let mut command = Command::new(program);
        command.env_clear().envs(&self.env);
        command
    }

    pub fn act<T>(&self, intent: Value, perform: impl FnOnce() -> Result<T>) -> Result<T> {
        let id = stamp();
        self.record(json!({"id":id,"event":"intent","action":intent}))?;
        let outcome = perform();
        self.record(json!({"id":id,"event":"acknowledgement","error":outcome.as_ref().err().map(|error| format!("{error:#}"))}))?;
        if outcome.is_ok() {
            self.acknowledged.fetch_add(1, Ordering::SeqCst);
        }
        outcome
    }

    pub fn execute(
        &self,
        program: &str,
        arguments: &[&str],
        input: Option<&str>,
    ) -> Result<String> {
        self.act(
            json!({"program":program,"arguments":arguments,"input":input}),
            || {
                let mut child = self
                    .command("timeout")
                    .args(["--kill-after=2s", "8s", program])
                    .args(arguments)
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()?;
                if let Some(input) = input {
                    child
                        .stdin
                        .take()
                        .context("Missing command input")?
                        .write_all(input.as_bytes())?;
                } else {
                    drop(child.stdin.take());
                }
                let output = child.wait_with_output()?;
                ensure!(
                    !matches!(output.status.code(), Some(124 | 137)),
                    "The host tool {program} {} did not finish within 8 s",
                    arguments.join(" ")
                );
                ensure!(
                    output.status.success(),
                    "{program} failed with {}: {}",
                    output.status,
                    String::from_utf8_lossy(&output.stderr).trim()
                );
                Ok(String::from_utf8_lossy(&output.stdout).trim().into())
            },
        )
    }

    pub fn spawn(
        &self,
        program: &Path,
        arguments: &[&str],
        extra_env: &[(&str, &str)],
        log: &str,
    ) -> Result<Owned> {
        let output = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.evidence.join(log))?;
        let mut child = self
            .command(program.to_str().context("Non-UTF8 program path")?)
            .args(arguments)
            .envs(extra_env.iter().copied())
            .stdout(output.try_clone()?)
            .stderr(output)
            .spawn()?;
        let own = std::env::current_exe()?;
        let executed = until_cleanup("spawned program image", || {
            let identity = Identity::read(child.id())?;
            Ok((identity.executable != own).then_some(identity))
        });
        let identity = match executed {
            Ok(identity) => identity,
            Err(error) => {
                child.kill()?;
                child.wait()?;
                return Err(error);
            }
        };
        let owned = Owned { child, identity };
        self.record(json!({"event":"spawn","identity":owned.identity,"arguments":arguments}))?;
        Ok(owned)
    }

    pub fn socket(&self) -> PathBuf {
        Path::new(sandbox::RUNTIME)
            .join("herdr-core")
            .join(format!("{}.sock", self.session))
    }

    pub fn rpc(&self, method: &str, params: Value) -> Result<Value> {
        let request = self.request(method, params)?;
        self.record(json!({"event":"Core-intent","request":request}))?;
        let reply = self.exchange(&request)?;
        self.record(json!({"event":"Core-observation","reply":reply}))?;
        answer(&request, reply)
    }

    pub fn watch(&self, method: &str, params: Value) -> Result<Value> {
        let subject = format!("{method} {params}");
        let request = self.request(method, params)?;
        let reply = self.exchange(&request)?;
        let seen = json!([reply["result"], reply["error"]]);
        let changed = self
            .watched
            .lock()
            .expect("the watch record is never held across a panic")
            .insert(subject, seen.clone())
            != Some(seen);
        if changed {
            self.record(json!({"event":"Core-observation","request":request,"reply":reply}))?;
        }
        answer(&request, reply)
    }

    fn request(&self, method: &str, params: Value) -> Result<Value> {
        ensure!(
            fs::metadata(self.socket())?.file_type().is_socket(),
            "Dedicated Core is absent"
        );
        ensure!(
            matches!(
                method,
                "server.status"
                    | "doc.get"
                    | "terminal.get"
                    | "terminal.list"
                    | "terminal.read"
                    | "server.stop"
            ),
            "Unsupported verification Core operation"
        );
        Ok(json!({"jsonrpc":"2.0","id":stamp() as u64,"method":method,"params":params}))
    }

    fn exchange(&self, request: &Value) -> Result<Value> {
        let mut stream = UnixStream::connect(self.socket())?;
        stream.set_read_timeout(Some(Duration::from_secs(5)))?;
        stream.set_write_timeout(Some(Duration::from_secs(5)))?;
        writeln!(stream, "{request}")?;
        let mut bytes = Vec::new();
        BufReader::new(stream)
            .take(8 * 1024 * 1024)
            .read_until(b'\n', &mut bytes)?;
        ensure!(bytes.ends_with(b"\n"), "Incomplete or oversized Core reply");
        Ok(serde_json::from_slice(&bytes)?)
    }
}

fn answer(request: &Value, reply: Value) -> Result<Value> {
    ensure!(
        reply["id"] == request["id"] && reply["jsonrpc"] == "2.0",
        "Core reply identity disagrees"
    );
    reply.get("result").cloned().with_context(|| {
        format!(
            "Core refused {}: {reply}",
            request["method"].as_str().unwrap_or_default()
        )
    })
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Pinned {
    pub path: PathBuf,
    pub sha256: String,
}

impl Pinned {
    pub fn check(path: &Path, expected: &str) -> Result<Self> {
        ensure!(
            expected.len() == 64 && expected.bytes().all(|b| b.is_ascii_hexdigit()),
            "Expected SHA256 must contain 64 hexadecimal digits"
        );
        let pinned = Self {
            path: fs::canonicalize(path)?,
            sha256: expected.to_ascii_lowercase(),
        };
        ensure!(executable(&pinned.path), "Artifact is not executable");
        pinned.verify()?;
        Ok(pinned)
    }

    pub fn verify(&self) -> Result<()> {
        ensure!(
            digest(&self.path)? == self.sha256,
            "SHA256 disagrees with the expected artifact: {}",
            self.path.display()
        );
        Ok(())
    }
}

fn executable(path: &Path) -> bool {
    fs::metadata(path).is_ok_and(|found| found.is_file() && found.permissions().mode() & 0o111 != 0)
}

pub fn installed(name: &str) -> Result<PathBuf> {
    std::env::split_paths(&std::env::var_os("PATH").context("Missing PATH")?)
        .map(|folder| folder.join(name))
        .find(|path| executable(path))
        .with_context(|| format!("Required tool is missing: {name}"))
}

pub const LIMITS: [&str; 1] =
    ["No physical touchpad, IME, real compositor latency or actual Codex proof"];

const ASSET_FILES: [&str; 4] = [
    "idle.png",
    "stretch-frames/frame-1-uncrossing.png",
    "stretch-frames/frame-2-stretched.png",
    "stretch-frames/frame-3-peak-stretch.png",
];

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    !needle.is_empty()
        && haystack
            .windows(needle.len())
            .any(|window| window == needle)
}

pub fn check_assets(candidate: &Path, assets: &Path) -> Result<()> {
    let binary = fs::read(candidate)?;
    let built_for = assets
        .parent()
        .and_then(Path::to_str)
        .context("Assets folder has no parent")?;
    ensure!(
        assets.file_name().is_some_and(|name| name == "assets")
            && contains(&binary, built_for.as_bytes()),
        "Candidate was not built to read assets from {}",
        assets.display()
    );
    for file in ASSET_FILES {
        let name = file.rsplit('/').next().unwrap_or(file);
        ensure!(
            !contains(&binary, name.as_bytes()) || assets.join(file).is_file(),
            "Candidate assets folder lacks {file}"
        );
    }
    Ok(())
}

pub fn doctor(candidate: &Pinned, core: &Pinned) -> Result<Value> {
    let mut tools = BTreeMap::new();
    for name in [
        "bwrap",
        "timeout",
        "dbus-run-session",
        "Xvfb",
        "xrdb",
        "bash",
    ] {
        let path = Path::new("/usr/bin").join(name);
        ensure!(executable(&path), "Required tool is missing: {name}");
        tools.insert(name, fs::canonicalize(path)?);
    }
    Ok(
        json!({"schema":2,"surface":"owned Linux X11 in a private namespace","binary":candidate.path,"sha256":candidate.sha256,"hc":core.path,"hcSha256":core.sha256,"tools":tools,"limits":LIMITS}),
    )
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::cell::Cell;
    use std::collections::BTreeSet;

    #[test]
    fn a_value_holds_only_through_unbroken_glances_of_the_quiet_window() {
        let start = Instant::now();
        let at = |milliseconds: u64| start + Duration::from_millis(milliseconds);
        let mut held = Held(None);
        assert!(!held.see(Some(1), at(0)));
        assert!(!held.see(Some(1), at(80)));
        assert!(held.see(Some(1), at(160)));
        assert!(!held.see(Some(2), at(240)), "a changed value");
        assert!(!held.see(None, at(320)), "a glance without the value");
        assert!(
            !held.see(Some(2), at(400)),
            "a value kept its age across a glance without it"
        );
        assert!(held.see(Some(2), at(550)));
        assert!(
            !held.see(None, at(630)) && held.0.is_none(),
            "a value outlived the glance that lost it"
        );
    }

    fn settled(read: impl Fn(u32) -> Option<u32>, wanted: u32) -> Result<(Option<u32>, Duration)> {
        let (start, glances) = (Instant::now(), Cell::new(0));
        let value = settle(
            Duration::from_millis(400),
            Duration::from_millis(10),
            || {
                glances.set(glances.get() + 1);
                Ok(read(glances.get()))
            },
            |value| *value == wanted,
        )?;
        Ok((value, start.elapsed()))
    }

    #[test]
    fn settle_returns_a_value_only_after_it_held() -> Result<()> {
        let deadline = Duration::from_millis(400);
        let (value, took) = settled(|_| Some(7), 7)?;
        ensure!(
            value == Some(7) && took >= QUIET,
            "A wanted value was not returned once it held: {value:?} after {took:?}"
        );
        let (value, took) = settled(|_| Some(3), 7)?;
        ensure!(
            value == Some(3) && took >= deadline,
            "A value that held was not returned at the deadline: {value:?} after {took:?}"
        );
        let (value, took) = settled(Some, 7)?;
        ensure!(
            value.is_none() && took >= deadline,
            "A value that never stopped changing was returned: {value:?}"
        );
        let (value, took) = settled(|glance| (glance == 1).then_some(7), 7)?;
        ensure!(
            value.is_none() && took >= deadline,
            "A value that was gone at the deadline was returned: {value:?}"
        );
        Ok(())
    }

    pub(crate) fn deaf(name: &str, trap: &str) -> Result<Owned> {
        let evidence =
            std::env::temp_dir().join(format!("vv-{name}-{}-{}", std::process::id(), stamp()));
        fs::create_dir(&evidence)?;
        let ready = evidence.join("ready");
        let script = format!("trap '{trap}' TERM; : > \"$0\"; while :; do sleep 0.02; done");
        let system = System::with_env(evidence, "voyager-verify-test".into(), BTreeMap::new());
        let child = system.spawn(
            Path::new("/usr/bin/bash"),
            &["-c", &script, ready.to_str().context("Non-UTF8 path")?],
            &[],
            "child.log",
        )?;
        until("the child's signal trap", || {
            Ok(ready.exists().then_some(()))
        })?;
        Ok(child)
    }

    #[test]
    fn a_child_that_lost_the_first_signal_exits_on_the_next_one() -> Result<()> {
        let mut child = deaf("resignal", "trap - TERM")?;
        let start = Instant::now();
        let stopped = child.stop_within(Duration::from_secs(4))?;
        ensure!(
            stopped == Stopped::Exited { signals: 2 } && start.elapsed() >= RESIGNAL,
            "A child that needed a second SIGTERM ended as {stopped:?} after {:?}",
            start.elapsed()
        );
        Ok(())
    }

    #[test]
    fn a_child_that_ignores_every_signal_is_killed_at_the_deadline() -> Result<()> {
        let mut child = deaf("ignore", "")?;
        let stopped = child.stop_within(Duration::from_millis(400))?;
        ensure!(
            matches!(&stopped, Stopped::Killed { signals: 1, stuck } if stuck.starts_with("state ")),
            "A child that ignores SIGTERM ended as {stopped:?}"
        );
        ensure!(
            child.child.try_wait()?.is_some(),
            "A killed child was left running"
        );
        Ok(())
    }

    #[test]
    fn assets_must_match_what_the_candidate_was_built_for() -> Result<()> {
        let root =
            std::env::temp_dir().join(format!("vv-assets-{}-{}", std::process::id(), stamp()));
        let (right, wrong) = (root.join("desktop/assets"), root.join("other/assets"));
        for folder in [&right, &wrong] {
            fs::create_dir_all(folder.join("stretch-frames"))?;
        }
        let candidate = root.join("candidate");
        fs::write(
            &candidate,
            format!(
                "{}\0idle.png\0frame-1-uncrossing.png",
                root.join("desktop").display()
            ),
        )?;
        ensure!(
            check_assets(&candidate, &wrong).is_err(),
            "Wrong folder accepted"
        );
        ensure!(
            check_assets(&candidate, &right).is_err(),
            "Missing files accepted"
        );
        for file in ["idle.png", "stretch-frames/frame-1-uncrossing.png"] {
            fs::write(right.join(file), b"")?;
        }
        check_assets(&candidate, &right)
    }

    #[test]
    fn pinned_artifact_refuses_another_hash() -> Result<()> {
        let tool = fs::canonicalize("/bin/sleep")?;
        let hash = digest(&tool)?;
        Pinned::check(&tool, &hash)?;
        let other = hash.replace(|digit: char| digit != '0', "0");
        ensure!(
            Pinned::check(&tool, &other).is_err(),
            "A different artifact was accepted"
        );
        Ok(())
    }

    fn children() -> Result<BTreeSet<u32>> {
        let mut result = BTreeSet::new();
        for task in fs::read_dir("/proc/self/task")? {
            let path = task?.path().join("children");
            if let Ok(text) = fs::read_to_string(path) {
                for pid in text.split_whitespace() {
                    result.insert(pid.parse()?);
                }
            }
        }
        Ok(result)
    }

    #[test]
    fn failed_spawn_record_does_not_leave_a_child() -> Result<()> {
        let evidence =
            std::env::temp_dir().join(format!("vv-log-failure-{}-{}", std::process::id(), stamp()));
        fs::create_dir(&evidence)?;
        let system = System::with_env(evidence, "voyager-verify-test".into(), BTreeMap::new());
        fs::create_dir(system.evidence.join("actions.jsonl"))?;
        let before = children()?;
        let result = system.spawn(Path::new("/bin/sleep"), &["30"], &[], "spawn.log");
        let after = children()?;
        let sleep = fs::canonicalize("/bin/sleep")?;
        let leaked: Vec<_> = after
            .difference(&before)
            .copied()
            .filter(|pid| Identity::read(*pid).is_ok_and(|child| child.executable == sleep))
            .collect();
        for &pid in &leaked {
            let pid =
                rustix::process::Pid::from_raw(i32::try_from(pid)?).context("Invalid test PID")?;
            rustix::process::kill_process(pid, rustix::process::Signal::TERM)?;
            rustix::process::waitpid(Some(pid), rustix::process::WaitOptions::empty())?;
        }
        ensure!(result.is_err(), "Recording failure was not reported");
        ensure!(leaked.is_empty(), "Failed logging leaked child: {leaked:?}");
        ensure!(
            system.evidence.join("spawn.log").exists(),
            "Failure evidence disappeared"
        );
        Ok(())
    }
}
