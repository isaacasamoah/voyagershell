use anyhow::{Context, Result, bail, ensure};
use serde::Serialize;
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
    atomic::{AtomicBool, Ordering},
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
        ensure!(Instant::now() < deadline, "Timed out observing {name}");
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
    pub scratch: PathBuf,
    pub session: String,
    pub env: BTreeMap<String, String>,
}

impl System {
    pub fn new(evidence: PathBuf) -> Result<Self> {
        ensure!(evidence.is_absolute(), "Evidence path must be absolute");
        fs::create_dir(&evidence)
            .context("Evidence must be a new directory with an existing parent")?;
        fs::set_permissions(&evidence, fs::Permissions::from_mode(0o700))?;
        let scratch = PathBuf::from(format!(
            "/tmp/vv-{}-{:08x}",
            std::process::id(),
            stamp() as u32
        ));
        fs::create_dir(&scratch)?;
        fs::set_permissions(&scratch, fs::Permissions::from_mode(0o700))?;
        let mut env: BTreeMap<_, _> = std::env::vars()
            .filter(|(key, _)| {
                !key.starts_with("HC_")
                    && !key.starts_with("VOYAGER_")
                    && !["DISPLAY", "WAYLAND_DISPLAY", "XAUTHORITY"].contains(&key.as_str())
            })
            .collect();
        for (key, folder) in [
            ("XDG_RUNTIME_DIR", "r"),
            ("XDG_STATE_HOME", "s"),
            ("XDG_CONFIG_HOME", "c"),
            ("XDG_DATA_HOME", "d"),
        ] {
            fs::create_dir(scratch.join(folder))?;
            fs::set_permissions(scratch.join(folder), fs::Permissions::from_mode(0o700))?;
            env.insert(key.into(), scratch.join(folder).display().to_string());
        }
        let session = format!(
            "voyager-verify-{}-{:08x}",
            std::process::id(),
            stamp() as u32
        );
        env.insert("HC_SESSION".into(), session.clone());
        env.insert(
            "HC_SOCKET".into(),
            scratch
                .join("r/herdr-core")
                .join(format!("{session}.sock"))
                .display()
                .to_string(),
        );
        ensure!(
            env["HC_SOCKET"].len() + 20 <= 107,
            "Private Core socket namespace is too long"
        );
        env.insert("LIBGL_ALWAYS_SOFTWARE".into(), "1".into());
        Ok(Self {
            evidence,
            scratch,
            session,
            env,
        })
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
        ensure!(
            output.status.success(),
            "{program} failed with {}",
            output.status
        );
        Ok(stdout.trim().into())
    }

    pub fn spawn(&self, program: &Path, arguments: &[&str], log: &str) -> Result<Owned> {
        let output = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.evidence.join(log))?;
        let mut child = self
            .command(program.to_str().context("Non-UTF8 program path")?)
            .args(arguments)
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
        self.scratch
            .join("r/herdr-core")
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
                "server.status" | "doc.get" | "terminal.get" | "terminal.read" | "server.stop"
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

pub fn doctor(binary: &Path, expected: &str) -> Result<Value> {
    ensure!(
        expected.len() == 64 && expected.bytes().all(|b| b.is_ascii_hexdigit()),
        "Expected SHA256 must contain 64 hexadecimal digits"
    );
    let binary = fs::canonicalize(binary)?;
    ensure!(
        fs::metadata(&binary)?.permissions().mode() & 0o111 != 0,
        "Candidate is not executable"
    );
    let hash = digest(&binary)?;
    ensure!(
        hash == expected.to_ascii_lowercase(),
        "Candidate SHA256 disagrees with expected artifact"
    );
    let mut tools = BTreeMap::new();
    for name in [
        "timeout",
        "dbus-run-session",
        "Xvfb",
        "xdotool",
        "import",
        "xrdb",
        "hc",
    ] {
        let path = std::env::split_paths(&std::env::var_os("PATH").context("Missing PATH")?)
            .map(|folder| folder.join(name))
            .find(|p| {
                fs::metadata(p).is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
            });
        match path {
            Some(path) => {
                tools.insert(name, fs::canonicalize(path)?);
            }
            None => bail!("Required tool is missing: {name}"),
        }
    }
    Ok(
        json!({"schema":1,"surface":"owned Linux X11","binary":binary,"sha256":hash,"tools":tools,"limits":["No physical touchpad, IME, real compositor latency or actual Codex proof"]}),
    )
}
