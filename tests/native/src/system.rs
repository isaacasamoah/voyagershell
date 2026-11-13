use crate::sandbox;
use anyhow::{Context, Result, bail, ensure};
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
    Arc, OnceLock,
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

pub fn until<T>(name: &str, mut observe: impl FnMut() -> Result<Option<T>>) -> Result<T> {
    wait(name, &mut observe, true)
}

pub fn until_cleanup<T>(name: &str, mut observe: impl FnMut() -> Result<Option<T>>) -> Result<T> {
    wait(name, &mut observe, false)
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

fn wait<T>(
    name: &str,
    observe: &mut impl FnMut() -> Result<Option<T>>,
    cancellable: bool,
) -> Result<T> {
    let deadline = Instant::now() + Duration::from_secs(12);
    loop {
        ensure!(!cancellable || !interrupted(), "Verification cancelled");
        if let Some(value) = observe()? {
            return Ok(value);
        }
        if Instant::now() >= deadline {
            return Err(TimedOut(name.into()).into());
        }
        sleep(Duration::from_millis(80));
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

impl Owned {
    pub fn stop(&mut self) -> Result<()> {
        if self.child.try_wait()?.is_none() {
            self.identity.verify()?;
            let pid = rustix::process::Pid::from_raw(i32::try_from(self.identity.pid)?)
                .context("Invalid owned PID")?;
            rustix::process::kill_process(pid, rustix::process::Signal::TERM)?;
            if let Err(error) = until_cleanup("owned child graceful exit", || {
                Ok(self.child.try_wait()?.map(|_| ()))
            }) {
                self.identity.verify()?;
                self.child.kill()?;
                self.child.wait()?;
                bail!("Owned child required forced termination: {error:#}");
            }
        }
        self.child.wait()?;
        Ok(())
    }
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

    pub fn execute(
        &self,
        program: &str,
        arguments: &[&str],
        input: Option<&str>,
    ) -> Result<String> {
        let id = stamp();
        self.record(
            json!({"id":id,"event":"intent","program":program,"arguments":arguments,"input":input}),
        )?;
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
        let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
        self.record(json!({"id":id,"event":"acknowledgement","status":output.status.code(),"stdout":stdout,"stderr":String::from_utf8_lossy(&output.stderr)}))?;
        if matches!(output.status.code(), Some(124 | 137)) {
            return Err(TimedOut(format!("{program} {}", arguments.join(" "))).into());
        }
        ensure!(
            output.status.success(),
            "{program} failed with {}",
            output.status
        );
        self.acknowledged.fetch_add(1, Ordering::SeqCst);
        Ok(stdout.trim().into())
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
        let identity = match Identity::read(child.id()) {
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
        let id = stamp() as u64;
        let request = json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
        self.record(json!({"event":"Core-intent","request":request}))?;
        let mut stream = UnixStream::connect(self.socket())?;
        stream.set_read_timeout(Some(Duration::from_secs(5)))?;
        stream.set_write_timeout(Some(Duration::from_secs(5)))?;
        writeln!(stream, "{request}")?;
        let mut bytes = Vec::new();
        BufReader::new(stream)
            .take(8 * 1024 * 1024)
            .read_until(b'\n', &mut bytes)?;
        ensure!(bytes.ends_with(b"\n"), "Incomplete or oversized Core reply");
        let value: Value = serde_json::from_slice(&bytes)?;
        self.record(json!({"event":"Core-observation","reply":value}))?;
        ensure!(
            value["id"] == id && value["jsonrpc"] == "2.0",
            "Core reply identity disagrees"
        );
        value
            .get("result")
            .cloned()
            .context(format!("Core refused {method}: {value}"))
    }
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
        "xdotool",
        "import",
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
mod tests {
    use super::*;
    use std::collections::BTreeSet;

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
