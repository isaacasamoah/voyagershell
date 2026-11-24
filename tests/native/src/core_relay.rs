use crate::sandbox::{CORE, CORE_RELAY};
use crate::system::System;
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const RELAY_NAME: &str = "hc-delay";
const DELAY_ENV: &str = "VOYAGER_CORE_DELAY";
const LEDGER_ENV: &str = "VOYAGER_CORE_RELAY_LEDGER";
const ARM_ENV: &str = "VOYAGER_CORE_RELAY_ARM";
pub const LEDGER: &str = "core-relay.jsonl";
pub const ARM: &str = "core-relay-arm.json";
pub const ARMS: &str = "core-relay-arms.jsonl";
const ARMED: &str = "arm";
const WATCH: &str = "watch:";
const LONGEST_DELAY_MS: u64 = 30_000;
const LATE_MS: u64 = 1_000;
const HEARTBEAT: Duration = Duration::from_millis(250);

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct CoreDelay {
    held: BTreeMap<String, u64>,
    #[serde(default)]
    armed: bool,
    #[serde(default, skip_serializing_if = "BTreeSet::is_empty")]
    watched: BTreeSet<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Fault {
    Drop,
    Hold { ms: u64 },
    Stall { ms: u64 },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Arm {
    pub id: u64,
    pub method: String,
    pub fault: Fault,
}

impl CoreDelay {
    pub fn parse(text: &str) -> Result<Self> {
        let mut held = BTreeMap::new();
        let mut armed = false;
        let mut watched = BTreeSet::new();
        for entry in text.split(',') {
            if entry == ARMED {
                ensure!(!armed, "Core delay names {ARMED} twice");
                armed = true;
                continue;
            }
            if let Some(method) = entry.strip_prefix(WATCH) {
                ensure!(
                    core_method(method),
                    "Core delay watch {method:?} is not a Core method name"
                );
                ensure!(
                    watched.insert(method.to_owned()),
                    "Core delay watches {method} twice"
                );
                continue;
            }
            let (method, milliseconds) = entry
                .split_once('=')
                .with_context(|| format!("Core delay {entry:?} is METHOD=MS"))?;
            ensure!(
                core_method(method),
                "Core delay method {method:?} is not a Core method name"
            );
            let milliseconds: u64 = milliseconds
                .parse()
                .with_context(|| format!("Core delay for {method} is whole milliseconds"))?;
            ensure!(
                milliseconds <= LONGEST_DELAY_MS,
                "Core delay for {method} exceeds {LONGEST_DELAY_MS} ms"
            );
            ensure!(
                held.insert(method.to_owned(), milliseconds).is_none(),
                "Core delay names {method} twice"
            );
        }
        ensure!(
            held.keys().all(|method| !watched.contains(method)),
            "Core delay both holds and watches one method"
        );
        Ok(Self {
            held,
            armed,
            watched,
        })
    }

    pub fn is_empty(&self) -> bool {
        self.held.is_empty() && !self.armed && self.watched.is_empty()
    }

    fn watches(&self, method: &str) -> bool {
        self.watched.contains(method)
    }

    pub fn armed(&self) -> bool {
        self.armed
    }

    fn encode(&self) -> String {
        self.held
            .iter()
            .map(|(method, milliseconds)| format!("{method}={milliseconds}"))
            .chain(self.watched.iter().map(|method| format!("{WATCH}{method}")))
            .chain(self.armed.then(|| ARMED.to_owned()))
            .collect::<Vec<_>>()
            .join(",")
    }

    pub fn hold(&self, method: &str) -> Option<Duration> {
        self.held
            .get(method)
            .filter(|milliseconds| **milliseconds > 0)
            .map(|milliseconds| Duration::from_millis(*milliseconds))
    }

    pub fn install(&self, system: &mut System) {
        if self.is_empty() {
            return;
        }
        for (key, value) in [
            ("VOYAGER_HC", CORE_RELAY.to_owned()),
            (DELAY_ENV, self.encode()),
            (
                LEDGER_ENV,
                system.evidence.join(LEDGER).display().to_string(),
            ),
            (ARM_ENV, system.evidence.join(ARM).display().to_string()),
        ] {
            system.env.insert(key.into(), value);
        }
    }

    pub fn audit_file(&self, evidence: &Path) -> Result<()> {
        let read = |name: &str| match fs::read_to_string(evidence.join(name)) {
            Ok(text) => Ok(text),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(String::new()),
            Err(error) => {
                Err(error).with_context(|| format!("The Core relay's {name} could not be read"))
            }
        };
        self.audit(&read(LEDGER)?, &read(ARMS)?)
    }

    fn armed_by<'a>(&self, arms: &'a [Arm], id: u64, method: &str) -> Result<&'a Arm> {
        let arm = arms
            .iter()
            .find(|arm| arm.id == id)
            .with_context(|| format!("The Core relay applied arm {id}, which nobody armed"))?;
        ensure!(
            self.armed && arm.method == method,
            "The Core relay applied arm {id} to {method}, which differs from {arm:?}"
        );
        Ok(arm)
    }

    fn due(&self, hold: &Hold, arms: &[Arm]) -> Result<u64> {
        if let Some(id) = hold.arm {
            let arm = self.armed_by(arms, id, &hold.method)?;
            ensure!(
                arm.fault == (Fault::Hold { ms: hold.delay_ms }),
                "The Core relay held {} for {} ms under arm {id}, which asked for {:?}",
                hold.method,
                hold.delay_ms,
                arm.fault
            );
            return Ok(hold.replied_at_ms + hold.delay_ms);
        }
        let asked = self
            .held
            .get(&hold.method)
            .copied()
            .filter(|delay| *delay > 0 && *delay == hold.delay_ms);
        let Some(asked) = asked else {
            anyhow::bail!(
                "The Core relay held {} for {} ms, which the delay did not ask for",
                hold.method,
                hold.delay_ms
            );
        };
        Ok(hold.replied_at_ms + asked)
    }

    pub fn audit(&self, ledger: &str, arms: &str) -> Result<()> {
        let arms: Vec<Arm> = arms
            .lines()
            .map(|line| serde_json::from_str(line).context("Core relay arm line"))
            .collect::<Result<_>>()?;
        let mut applied: HashMap<u64, (Instance, u64)> = HashMap::new();
        let mut alive: HashMap<Instance, u64> = HashMap::new();
        let mut waiting: HashMap<(Instance, u64), (String, u64)> = HashMap::new();
        let mut unanswered: HashMap<(Instance, u64), (String, u64)> = HashMap::new();
        for (number, line) in ledger.lines().enumerate() {
            let entry: Entry = serde_json::from_str(line)
                .with_context(|| format!("Core relay ledger line {} is malformed", number + 1))?;
            if let Some((arm, relay, id)) = entry.arm() {
                ensure!(
                    *applied.entry(arm).or_insert((relay, id)) == (relay, id),
                    "The Core relay applied arm {arm} to more than one request"
                );
            }
            let (relay, at) = match entry {
                Entry::Alive { relay, at_ms } => (relay, at_ms),
                Entry::Asked {
                    relay,
                    method,
                    id,
                    at_ms,
                } => {
                    ensure!(
                        self.watched.contains(&method),
                        "The Core relay recorded a {method} request it was not asked to watch"
                    );
                    unanswered.insert((relay, id), (method, at_ms));
                    (relay, at_ms)
                }
                Entry::Replied {
                    relay,
                    method,
                    id,
                    at_ms,
                } => {
                    let (asked, _) = unanswered.remove(&(relay, id)).with_context(|| {
                        format!("The Core relay recorded a {method} reply {id} with no request")
                    })?;
                    ensure!(
                        asked == method,
                        "The Core relay matched a {method} reply to a {asked} request"
                    );
                    (relay, at_ms)
                }
                Entry::Dropped {
                    relay,
                    method,
                    arm,
                    at_ms,
                    ..
                } => {
                    let armed = self.armed_by(&arms, arm, &method)?;
                    ensure!(
                        armed.fault == Fault::Drop,
                        "The Core relay dropped {method} under arm {arm}, which asked for {:?}",
                        armed.fault
                    );
                    (relay, at_ms)
                }
                Entry::Stalled {
                    relay,
                    method,
                    arm,
                    delay_ms,
                    forwarded_at_ms,
                    ..
                } => {
                    let armed = self.armed_by(&arms, arm, &method)?;
                    ensure!(
                        armed.fault == (Fault::Stall { ms: delay_ms }),
                        "The Core relay stalled {method} for {delay_ms} ms under arm {arm}, which asked for {:?}",
                        armed.fault
                    );
                    (relay, forwarded_at_ms)
                }
                Entry::Held(hold) => {
                    let due = self.due(&hold, &arms)?;
                    waiting.insert((hold.relay, hold.id), (hold.method, due));
                    (hold.relay, hold.replied_at_ms)
                }
                Entry::Released {
                    hold,
                    released_at_ms,
                } => {
                    let due = self.due(&hold, &arms)?;
                    ensure!(
                        released_at_ms <= due + LATE_MS,
                        "The Core relay released {} {} ms after its hold ended, past the {LATE_MS} ms bound",
                        hold.method,
                        released_at_ms.saturating_sub(due)
                    );
                    waiting.remove(&(hold.relay, hold.id));
                    (hold.relay, released_at_ms)
                }
                Entry::Undelivered {
                    hold,
                    undelivered_at_ms,
                    error,
                } => {
                    self.due(&hold, &arms)?;
                    waiting.remove(&(hold.relay, hold.id));
                    ensure!(
                        error == "BrokenPipe",
                        "The Core relay could not write the held {} reply: {error}",
                        hold.method
                    );
                    (hold.relay, undelivered_at_ms)
                }
            };
            let latest = alive.entry(relay).or_default();
            *latest = (*latest).max(at);
        }
        for ((relay, _), (method, asked)) in unanswered {
            ensure!(
                alive
                    .get(&relay)
                    .is_none_or(|latest| *latest <= asked + LATE_MS),
                "The Core relay forwarded a {method} request and never saw its reply"
            );
        }
        for ((relay, _), (method, due)) in waiting {
            ensure!(
                alive
                    .get(&relay)
                    .is_none_or(|latest| *latest <= due + LATE_MS),
                "The Core relay held a {method} reply and never wrote it to the app"
            );
        }
        Ok(())
    }

    pub fn vet(&self, offered: &Value) -> Result<()> {
        let offered: Vec<&str> = offered
            .as_array()
            .context("Core's hello did not list its methods")?
            .iter()
            .filter_map(Value::as_str)
            .collect();
        for method in self.held.keys().chain(&self.watched) {
            ensure!(
                offered.contains(&method.as_str()),
                "Core has no method {method}, so its delay could never apply"
            );
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Watched {
    pub method: String,
    pub id: u64,
    pub asked_at_ms: u64,
    pub replied_at_ms: Option<u64>,
}

pub fn watched_since(evidence: &Path, since_ms: u64) -> Result<Vec<Watched>> {
    let ledger = match fs::read_to_string(evidence.join(LEDGER)) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error).context("The Core relay's ledger could not be read"),
    };
    let mut seen: Vec<Watched> = Vec::new();
    for line in ledger.lines() {
        let Ok(entry) = serde_json::from_str::<Entry>(line) else {
            continue;
        };
        match entry {
            Entry::Asked {
                method, id, at_ms, ..
            } if at_ms >= since_ms => seen.push(Watched {
                method,
                id,
                asked_at_ms: at_ms,
                replied_at_ms: None,
            }),
            Entry::Replied { id, at_ms, .. } => {
                if let Some(watched) = seen.iter_mut().find(|watched| watched.id == id) {
                    watched.replied_at_ms = Some(at_ms);
                }
            }
            _ => {}
        }
    }
    Ok(seen)
}

fn core_method(method: &str) -> bool {
    !method.is_empty()
        && method
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte == b'.' || byte == b'_')
}

pub fn invoked_as_relay() -> bool {
    std::env::args_os()
        .next()
        .and_then(|name| Path::new(&name).file_name().map(|name| name == RELAY_NAME))
        .unwrap_or(false)
}

pub fn relay() -> i32 {
    match run() {
        Ok(code) => code,
        Err(error) => {
            eprintln!("Core relay: {error:#}");
            3
        }
    }
}

fn run() -> Result<i32> {
    let delay = CoreDelay::parse(&std::env::var(DELAY_ENV).context("Missing Core delay")?)?;
    let ledger = OpenOptions::new()
        .create(true)
        .append(true)
        .open(std::env::var(LEDGER_ENV).context("Missing relay ledger")?)?;
    let mut core = Command::new(CORE)
        .args(std::env::args().skip(1))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .context("Core bridge")?;
    let mut to_core = core.stdin.take().context("Core bridge input")?;
    let from_core = core.stdout.take().context("Core bridge output")?;
    let arm = std::env::var_os(ARM_ENV).map(PathBuf::from);
    let relay = Arc::new(Relay::new(delay, arm, ledger));
    let beating = Arc::clone(&relay);
    thread::spawn(move || {
        loop {
            thread::sleep(HEARTBEAT);
            beating.record(&Entry::Alive {
                relay: beating.instance,
                at_ms: now(),
            });
        }
    });
    let asked = Arc::clone(&relay);
    thread::spawn(move || {
        let _ = forward_requests(BufReader::new(io::stdin()), &mut to_core, &asked);
    });
    let out = Arc::new(Mutex::new(io::stdout()));
    forward_replies(BufReader::new(from_core), &out, &relay)?;
    Ok(core.wait()?.code().unwrap_or(3))
}

struct Asked {
    method: String,
    at: u64,
    hold: Duration,
    arm: Option<u64>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Instance {
    pid: u32,
    started_at_ms: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Hold {
    relay: Instance,
    method: String,
    id: u64,
    delay_ms: u64,
    requested_at_ms: u64,
    replied_at_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    arm: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(
    tag = "event",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
enum Entry {
    Alive {
        relay: Instance,
        at_ms: u64,
    },
    Held(Hold),
    Dropped {
        relay: Instance,
        method: String,
        id: u64,
        arm: u64,
        at_ms: u64,
    },
    Stalled {
        relay: Instance,
        method: String,
        id: u64,
        arm: u64,
        delay_ms: u64,
        forwarded_at_ms: u64,
    },
    Released {
        #[serde(flatten)]
        hold: Hold,
        released_at_ms: u64,
    },
    Undelivered {
        #[serde(flatten)]
        hold: Hold,
        undelivered_at_ms: u64,
        error: String,
    },
    Asked {
        relay: Instance,
        method: String,
        id: u64,
        at_ms: u64,
    },
    Replied {
        relay: Instance,
        method: String,
        id: u64,
        at_ms: u64,
    },
}

impl Entry {
    fn arm(&self) -> Option<(u64, Instance, u64)> {
        match self {
            Self::Alive { .. } | Self::Asked { .. } | Self::Replied { .. } => None,
            Self::Dropped { relay, id, arm, .. } | Self::Stalled { relay, id, arm, .. } => {
                Some((*arm, *relay, *id))
            }
            Self::Held(hold) | Self::Released { hold, .. } | Self::Undelivered { hold, .. } => {
                hold.arm.map(|arm| (arm, hold.relay, hold.id))
            }
        }
    }
}

struct Relay {
    delay: CoreDelay,
    arm: Option<PathBuf>,
    instance: Instance,
    asked: Mutex<HashMap<u64, Asked>>,
    watching: Mutex<HashMap<u64, String>>,
    ledger: Mutex<File>,
}

impl Relay {
    fn new(delay: CoreDelay, arm: Option<PathBuf>, ledger: File) -> Self {
        Self {
            delay,
            arm,
            instance: Instance {
                pid: std::process::id(),
                started_at_ms: now(),
            },
            asked: Mutex::default(),
            watching: Mutex::default(),
            ledger: Mutex::new(ledger),
        }
    }

    fn asked(&self) -> MutexGuard<'_, HashMap<u64, Asked>> {
        self.asked
            .lock()
            .expect("the relay's request table is never held across a panic")
    }

    fn watching(&self) -> MutexGuard<'_, HashMap<u64, String>> {
        self.watching
            .lock()
            .expect("the relay's watch table is never held across a panic")
    }

    fn hold(&self, id: u64, asked: &Asked, replied: u64) -> Hold {
        Hold {
            relay: self.instance,
            method: asked.method.clone(),
            id,
            delay_ms: asked.hold.as_millis() as u64,
            requested_at_ms: asked.at,
            replied_at_ms: replied,
            arm: asked.arm,
        }
    }

    fn take_arm(&self, method: &str) -> Option<Arm> {
        let path = self.arm.as_ref()?;
        let arm: Arm = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
        (arm.method == method && fs::remove_file(path).is_ok()).then_some(arm)
    }

    fn record(&self, entry: &Entry) {
        let Ok(mut line) = serde_json::to_string(entry) else {
            return;
        };
        line.push('\n');
        let mut ledger = self
            .ledger
            .lock()
            .expect("the relay's ledger is never held across a panic");
        let _ = ledger.write_all(line.as_bytes());
    }
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

struct Frame {
    channel: u32,
    kind: u8,
    payload: Vec<u8>,
}

impl Frame {
    fn read(reader: &mut impl Read) -> io::Result<Option<Self>> {
        let mut prefix = [0; 9];
        match reader.read_exact(&mut prefix) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
            Err(error) => return Err(error),
        }
        let length = u32::from_le_bytes([prefix[5], prefix[6], prefix[7], prefix[8]]);
        let mut payload = vec![0; length as usize];
        reader.read_exact(&mut payload)?;
        Ok(Some(Self {
            channel: u32::from_le_bytes([prefix[0], prefix[1], prefix[2], prefix[3]]),
            kind: prefix[4],
            payload,
        }))
    }

    fn write(&self, writer: &mut impl Write) -> io::Result<()> {
        let mut bytes = Vec::with_capacity(9 + self.payload.len());
        bytes.extend_from_slice(&self.channel.to_le_bytes());
        bytes.push(self.kind);
        bytes.extend_from_slice(&(self.payload.len() as u32).to_le_bytes());
        bytes.extend_from_slice(&self.payload);
        writer.write_all(&bytes)?;
        writer.flush()
    }

    fn message(&self) -> Option<Value> {
        (self.channel == 0 && self.kind == 0)
            .then(|| serde_json::from_slice(&self.payload).ok())
            .flatten()
    }
}

fn copy_line(from: &mut impl BufRead, to: &mut impl Write) -> io::Result<()> {
    let mut line = Vec::new();
    from.read_until(b'\n', &mut line)?;
    to.write_all(&line)?;
    to.flush()
}

fn forward_requests(mut from: impl BufRead, to: &mut impl Write, relay: &Relay) -> io::Result<()> {
    copy_line(&mut from, to)?;
    while let Some(frame) = Frame::read(&mut from)? {
        if let Some(message) = frame.message()
            && let (Some(id), Some(method)) = (message["id"].as_u64(), message["method"].as_str())
        {
            let armed = relay.take_arm(method);
            let hold = match &armed {
                Some(Arm {
                    id: arm,
                    fault: Fault::Drop,
                    ..
                }) => {
                    relay.record(&Entry::Dropped {
                        relay: relay.instance,
                        method: method.to_owned(),
                        id,
                        arm: *arm,
                        at_ms: now(),
                    });
                    continue;
                }
                Some(Arm {
                    id: arm,
                    fault: Fault::Stall { ms },
                    ..
                }) => {
                    thread::sleep(Duration::from_millis(*ms));
                    relay.record(&Entry::Stalled {
                        relay: relay.instance,
                        method: method.to_owned(),
                        id,
                        arm: *arm,
                        delay_ms: *ms,
                        forwarded_at_ms: now(),
                    });
                    None
                }
                Some(Arm {
                    fault: Fault::Hold { ms },
                    ..
                }) => Some(Duration::from_millis(*ms)),
                None => relay.delay.hold(method),
            };
            if hold.is_none() && relay.delay.watches(method) {
                relay.watching().insert(id, method.to_owned());
                relay.record(&Entry::Asked {
                    relay: relay.instance,
                    method: method.to_owned(),
                    id,
                    at_ms: now(),
                });
            }
            if let Some(hold) = hold {
                relay.asked().insert(
                    id,
                    Asked {
                        method: method.to_owned(),
                        at: now(),
                        hold,
                        arm: armed.map(|arm| arm.id),
                    },
                );
            }
        }
        frame.write(to)?;
    }
    Ok(())
}

fn forward_replies<W: Write + Send + 'static>(
    mut from: impl BufRead,
    to: &Arc<Mutex<W>>,
    relay: &Arc<Relay>,
) -> io::Result<()> {
    fn locked<W>(to: &Mutex<W>) -> MutexGuard<'_, W> {
        to.lock()
            .expect("the relay's output is never held across a panic")
    }
    copy_line(&mut from, &mut *locked(to))?;
    let mut held: Vec<JoinHandle<()>> = Vec::new();
    while let Some(frame) = Frame::read(&mut from)? {
        let reply = frame
            .message()
            .filter(|message| message.get("result").is_some() || message.get("error").is_some())
            .and_then(|message| message["id"].as_u64());
        if let Some((id, method)) = reply.and_then(|id| Some((id, relay.watching().remove(&id)?))) {
            frame.write(&mut *locked(to))?;
            relay.record(&Entry::Replied {
                relay: relay.instance,
                method,
                id,
                at_ms: now(),
            });
            continue;
        }
        let delayed = reply.and_then(|id| Some((id, relay.asked().remove(&id)?)));
        let Some((id, asked)) = delayed else {
            frame.write(&mut *locked(to))?;
            continue;
        };
        let replied = now();
        let entry = relay.hold(id, &asked, replied);
        let hold = asked.hold;
        relay.record(&Entry::Held(entry.clone()));
        let (to, relay) = (Arc::clone(to), Arc::clone(relay));
        held.push(thread::spawn(move || {
            thread::sleep(hold);
            match frame.write(&mut *locked(&to)) {
                Ok(()) => relay.record(&Entry::Released {
                    hold: entry,
                    released_at_ms: now(),
                }),
                Err(error) => relay.record(&Entry::Undelivered {
                    hold: entry,
                    undelivered_at_ms: now(),
                    error: format!("{:?}", error.kind()),
                }),
            }
        }));
    }
    for handle in held {
        let _ = handle.join();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::Scratch;
    use serde_json::json;
    use std::time::Instant;

    #[derive(Default)]
    struct Arrivals(Vec<(Instant, Vec<u8>)>);

    impl Write for Arrivals {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.0.push((Instant::now(), bytes.to_vec()));
            Ok(bytes.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    fn frame(message: &Value) -> Frame {
        Frame {
            channel: 0,
            kind: 0,
            payload: serde_json::to_vec(message).expect("a serializable message"),
        }
    }

    fn requests(methods: &[(&str, u64)]) -> Vec<u8> {
        let mut bytes = b"{\"method\":\"hello\"}\n".to_vec();
        for (method, id) in methods {
            frame(&json!({"jsonrpc":"2.0","id":id,"method":method,"params":{}}))
                .write(&mut bytes)
                .expect("a write to memory");
        }
        bytes
    }

    fn replies(ids: &[u64]) -> Vec<u8> {
        let mut bytes = b"{\"result\":{}}\n".to_vec();
        for id in ids {
            frame(&json!({"jsonrpc":"2.0","id":id,"result":{"answered":id}}))
                .write(&mut bytes)
                .expect("a write to memory");
        }
        bytes
    }

    fn relay_of(text: &str, folder: &Path) -> Arc<Relay> {
        let ledger = File::create(folder.join(LEDGER)).expect("a ledger file");
        Arc::new(Relay::new(
            CoreDelay::parse(text).expect("a valid delay"),
            Some(folder.join(ARM)),
            ledger,
        ))
    }

    fn ledger_lines(ledger: &str) -> Vec<Value> {
        ledger
            .lines()
            .map(|line| serde_json::from_str(line).expect("a ledger line"))
            .collect()
    }

    struct Refusing(io::ErrorKind, usize);

    impl Write for Refusing {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            if self.1 == 0 {
                return Err(self.0.into());
            }
            self.1 -= 1;
            Ok(bytes.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    fn lost_after_hello(kind: io::ErrorKind) -> String {
        let folder = Scratch::new("core-relay").expect("a scratch folder");
        let relay = relay_of("doc.set=20", folder.path());
        forward_requests(&requests(&[("doc.set", 1)])[..], &mut Vec::new(), &relay)
            .expect("requests forward");
        let out = Arc::new(Mutex::new(Refusing(kind, 1)));
        forward_replies(&replies(&[1])[..], &out, &relay).expect("replies forward");
        std::fs::read_to_string(folder.path().join(LEDGER)).expect("a ledger")
    }

    fn answered(arrivals: &Arrivals) -> Vec<(Instant, u64)> {
        arrivals
            .0
            .iter()
            .skip(1)
            .map(|(at, bytes)| {
                let frame = Frame::read(&mut &bytes[..])
                    .expect("a readable frame")
                    .expect("a whole frame");
                (
                    *at,
                    frame.message().expect("a reply")["id"].as_u64().unwrap(),
                )
            })
            .collect()
    }

    fn pass(delay: &str, asked: &[(&str, u64)], answers: &[u64]) -> (Vec<(Instant, u64)>, String) {
        let folder = Scratch::new("core-relay").expect("a scratch folder");
        let relay = relay_of(delay, folder.path());
        let mut to_core = Vec::new();
        forward_requests(&requests(asked)[..], &mut to_core, &relay).expect("requests forward");
        assert_eq!(to_core, requests(asked), "requests reach Core unchanged");
        let out = Arc::new(Mutex::new(Arrivals::default()));
        forward_replies(&replies(answers)[..], &out, &relay).expect("replies forward");
        let arrivals = out.lock().expect("an unpoisoned output");
        let ledger = std::fs::read_to_string(folder.path().join(LEDGER)).expect("a ledger");
        (answered(&arrivals), ledger)
    }

    #[test]
    fn a_named_method_waits_and_an_unnamed_method_passes() {
        let started = Instant::now();
        let (arrived, ledger) = pass("doc.set=300", &[("doc.set", 1), ("doc.get", 2)], &[1, 2]);
        let order: Vec<u64> = arrived.iter().map(|(_, id)| *id).collect();
        assert_eq!(order, [2, 1], "the unnamed reply overtakes the held one");
        let unnamed = arrived[0].0.duration_since(started);
        let named = arrived[1].0.duration_since(started);
        assert!(
            unnamed < Duration::from_millis(150),
            "unnamed took {unnamed:?}"
        );
        assert!(named >= Duration::from_millis(300), "named took {named:?}");
        let lines = ledger_lines(&ledger);
        let events: Vec<&str> = lines
            .iter()
            .map(|line| line["event"].as_str().unwrap())
            .collect();
        assert_eq!(events, ["held", "released"]);
        for line in &lines {
            assert_eq!(line["method"], "doc.set");
            assert_eq!(line["delayMs"], 300);
        }
        assert!(
            lines[0]["releasedAtMs"].is_null(),
            "a hold is not a release"
        );
        assert!(
            lines[1]["releasedAtMs"].as_u64()
                >= lines[1]["repliedAtMs"].as_u64().map(|at| at + 300),
            "released after the hold"
        );
        assert!(
            !ledger.contains("doc.get"),
            "only held methods are recorded"
        );
    }

    #[test]
    fn a_watched_method_passes_unchanged_and_pairs_each_request_with_its_reply() {
        let started = Instant::now();
        let (arrived, ledger) = pass(
            "watch:doc.set",
            &[("doc.set", 1), ("doc.get", 2), ("doc.set", 3)],
            &[3, 2, 1],
        );
        let order: Vec<u64> = arrived.iter().map(|(_, id)| *id).collect();
        assert_eq!(order, [3, 2, 1], "replies keep Core's order");
        assert!(
            arrived
                .iter()
                .all(|(at, _)| at.duration_since(started) < Duration::from_millis(150)),
            "a watch adds no delay"
        );
        let lines = ledger_lines(&ledger);
        let events: Vec<(&str, u64)> = lines
            .iter()
            .map(|line| {
                (
                    line["event"].as_str().unwrap(),
                    line["id"].as_u64().unwrap(),
                )
            })
            .collect();
        assert_eq!(
            events,
            [("asked", 1), ("asked", 3), ("replied", 3), ("replied", 1)]
        );
        assert!(
            !ledger.contains("doc.get"),
            "only watched methods are recorded"
        );
        let delay = CoreDelay::parse("watch:doc.set").expect("a watch");
        delay
            .audit(&ledger, "")
            .expect("paired requests pass the audit");
    }

    #[test]
    fn a_watched_request_with_no_reply_fails_the_audit() {
        let delay = CoreDelay::parse("watch:doc.set").expect("a watch");
        let relay = r#"{"pid":7,"startedAtMs":1}"#;
        let asked =
            format!(r#"{{"event":"asked","relay":{relay},"method":"doc.set","id":4,"atMs":100}}"#);
        let alive = format!(r#"{{"event":"alive","relay":{relay},"atMs":2000}}"#);
        let error = delay
            .audit(&format!("{asked}\n{alive}"), "")
            .expect_err("a request with no reply fails");
        assert!(
            error.to_string().contains("never saw its reply"),
            "{error:#}"
        );
        let replied = format!(
            r#"{{"event":"replied","relay":{relay},"method":"doc.set","id":5,"atMs":100}}"#
        );
        assert!(
            delay.audit(&replied, "").is_err(),
            "a reply with no request fails"
        );
        let parsed = CoreDelay::parse("doc.get=50,watch:doc.set,arm").expect("a mixed delay");
        assert_eq!(parsed.encode(), "doc.get=50,watch:doc.set,arm");
        assert!(CoreDelay::parse("watch:doc.set,watch:doc.set").is_err());
        assert!(CoreDelay::parse("doc.set=50,watch:doc.set").is_err());
        assert!(CoreDelay::parse("watch:").is_err());
    }

    #[test]
    fn a_zero_delay_forwards_in_order_without_a_record() {
        let (arrived, ledger) = pass("doc.set=0", &[("doc.set", 1), ("doc.get", 2)], &[1, 2]);
        let order: Vec<u64> = arrived.iter().map(|(_, id)| *id).collect();
        assert_eq!(order, [1, 2]);
        assert!(ledger.is_empty(), "nothing was held: {ledger}");
    }

    #[test]
    fn a_reply_to_nothing_held_passes_even_when_its_id_is_named_elsewhere() {
        let (arrived, ledger) = pass("doc.set=300", &[("doc.get", 7)], &[7, 8]);
        let order: Vec<u64> = arrived.iter().map(|(_, id)| *id).collect();
        assert_eq!(order, [7, 8]);
        assert!(ledger.is_empty());
    }

    #[test]
    fn parsing_refuses_what_it_cannot_apply() {
        for bad in [
            "",
            "doc.set",
            "doc.set=",
            "doc.set=-1",
            "doc.set=slow",
            "=5",
            "Doc.Set=5",
            "doc.set=5,doc.set=6",
            "doc.set=30001",
        ] {
            assert!(CoreDelay::parse(bad).is_err(), "{bad:?} must be refused");
        }
        let parsed = CoreDelay::parse("terminal.list=500,doc.set=2000").expect("a valid list");
        assert_eq!(parsed.encode(), "doc.set=2000,terminal.list=500");
        assert_eq!(parsed.hold("doc.set"), Some(Duration::from_millis(2000)));
        assert_eq!(parsed.hold("doc.get"), None);
        assert!(
            CoreDelay::parse("arm,arm").is_err(),
            "arm twice must be refused"
        );
        let armed = CoreDelay::parse("arm").expect("an armed relay");
        assert!(armed.armed() && !armed.is_empty() && armed.hold("doc.set").is_none());
    }

    fn arm(folder: &Path, id: u64, method: &str, fault: Fault) -> String {
        let arm = Arm {
            id,
            method: method.into(),
            fault,
        };
        let text = serde_json::to_string(&arm).expect("a serializable arm");
        std::fs::write(folder.join(ARM), &text).expect("an arm file");
        text
    }

    #[test]
    fn a_drop_arm_withholds_one_request_and_is_spent() {
        let folder = Scratch::new("core-relay").expect("a scratch folder");
        let relay = relay_of("arm", folder.path());
        let armed = arm(folder.path(), 1, "doc.set", Fault::Drop);
        let mut to_core = Vec::new();
        forward_requests(
            &requests(&[("doc.get", 1), ("doc.set", 2), ("doc.set", 3)])[..],
            &mut to_core,
            &relay,
        )
        .expect("requests forward");
        assert_eq!(
            to_core,
            requests(&[("doc.get", 1), ("doc.set", 3)]),
            "only the first doc.set after arming is withheld"
        );
        assert!(!folder.path().join(ARM).exists(), "the arm is spent");
        let ledger = std::fs::read_to_string(folder.path().join(LEDGER)).expect("a ledger");
        let lines = ledger_lines(&ledger);
        assert_eq!(
            (
                lines[0]["event"].as_str(),
                lines[0]["arm"].as_u64(),
                lines[0]["id"].as_u64()
            ),
            (Some("dropped"), Some(1), Some(2))
        );
        let delay = CoreDelay::parse("arm").expect("a valid delay");
        assert!(delay.audit(&ledger, &armed).is_ok());
        assert!(
            delay.audit(&ledger, "").is_err(),
            "an unarmed drop is caught"
        );
        let held = r#"{"id":1,"method":"doc.set","fault":{"kind":"hold","ms":5}}"#;
        assert!(
            delay.audit(&ledger, held).is_err(),
            "a different fault is caught"
        );
    }

    #[test]
    fn a_stall_arm_delays_that_request_and_every_later_one_in_order() {
        let folder = Scratch::new("core-relay").expect("a scratch folder");
        let relay = relay_of("arm", folder.path());
        let armed = arm(folder.path(), 2, "terminal.run", Fault::Stall { ms: 200 });
        let asked = [("terminal.run", 1), ("terminal.list", 2)];
        let started = Instant::now();
        let mut to_core = Vec::new();
        forward_requests(&requests(&asked)[..], &mut to_core, &relay).expect("requests forward");
        assert!(
            started.elapsed() >= Duration::from_millis(200),
            "the stall held the stream"
        );
        assert_eq!(
            to_core,
            requests(&asked),
            "the stalled stream keeps its order"
        );
        let ledger = std::fs::read_to_string(folder.path().join(LEDGER)).expect("a ledger");
        assert!(
            CoreDelay::parse("arm")
                .expect("a valid delay")
                .audit(&ledger, &armed)
                .is_ok()
        );
    }

    #[test]
    fn a_hold_arm_holds_one_reply_and_others_pass() {
        let folder = Scratch::new("core-relay").expect("a scratch folder");
        let relay = relay_of("arm", folder.path());
        let armed = arm(folder.path(), 4, "terminal.run", Fault::Hold { ms: 300 });
        let asked = [("terminal.run", 1), ("terminal.run", 2)];
        let mut to_core = Vec::new();
        forward_requests(&requests(&asked)[..], &mut to_core, &relay).expect("requests forward");
        assert_eq!(
            to_core,
            requests(&asked),
            "a held request still reaches Core"
        );
        let out = Arc::new(Mutex::new(Arrivals::default()));
        forward_replies(&replies(&[1, 2])[..], &out, &relay).expect("replies forward");
        let order: Vec<u64> = answered(&out.lock().expect("an unpoisoned output"))
            .iter()
            .map(|(_, id)| *id)
            .collect();
        assert_eq!(order, [2, 1], "only the armed reply waits");
        let ledger = std::fs::read_to_string(folder.path().join(LEDGER)).expect("a ledger");
        assert!(
            CoreDelay::parse("arm")
                .expect("a valid delay")
                .audit(&ledger, &armed)
                .is_ok()
        );
        assert!(
            CoreDelay::parse("terminal.run=300")
                .expect("a valid delay")
                .audit(&ledger, &armed)
                .is_err(),
            "an arm applied by a relay that was not armed is caught"
        );
        let twice = format!("{ledger}{}", ledger.replace("\"id\":1,", "\"id\":9,"));
        assert!(
            CoreDelay::parse("arm")
                .expect("a valid delay")
                .audit(&twice, &armed)
                .is_err(),
            "one arm applied to two requests is caught"
        );
    }

    fn instance(pid: u32) -> Instance {
        Instance {
            pid,
            started_at_ms: 1,
        }
    }

    fn hold_of(pid: u32, method: &str, delay: u64, id: u64, replied: u64) -> Hold {
        Hold {
            relay: instance(pid),
            method: method.to_owned(),
            id,
            delay_ms: delay,
            requested_at_ms: replied,
            replied_at_ms: replied,
            arm: None,
        }
    }

    fn held(hold: &Hold) -> String {
        serde_json::to_string(&Entry::Held(hold.clone())).expect("a line")
    }

    fn released(hold: &Hold, at: u64) -> String {
        serde_json::to_string(&Entry::Released {
            hold: hold.clone(),
            released_at_ms: at,
        })
        .expect("a line")
    }

    fn alive(pid: u32, at: u64) -> String {
        serde_json::to_string(&Entry::Alive {
            relay: instance(pid),
            at_ms: at,
        })
        .expect("a line")
    }

    fn audit_of(delay: &str, lines: &[String]) -> Result<()> {
        CoreDelay::parse(delay)
            .expect("a valid list")
            .audit(&lines.join("\n"), "")
    }

    fn refusal(delay: &str, lines: &[String]) -> String {
        format!(
            "{:#}",
            audit_of(delay, lines).expect_err("a refused ledger")
        )
    }

    #[test]
    fn the_ledger_audit_catches_a_hold_nobody_asked_for() {
        let right = hold_of(7, "doc.set", 2000, 1, 1000);
        assert!(
            audit_of(
                "doc.set=2000",
                &[held(&right), released(&right, 3000), alive(7, 60_000)]
            )
            .is_ok(),
            "a relay that went on running after it released its reply lost nothing"
        );
        assert!(audit_of("doc.set=2000", &[]).is_ok());
        for (wrong, name, delay) in [
            (hold_of(7, "doc.get", 2000, 1, 1000), "doc.get", 2000),
            (hold_of(7, "doc.set", 500, 1, 1000), "doc.set", 500),
            (hold_of(7, "doc.set", 0, 1, 1000), "doc.set", 0),
        ] {
            let due = wrong.replied_at_ms + wrong.delay_ms;
            let message = refusal("doc.set=2000", &[held(&wrong), released(&wrong, due)]);
            assert!(
                message.contains(&format!(
                    "held {name} for {delay} ms, which the delay did not ask for"
                )),
                "{message}"
            );
        }
    }

    #[test]
    fn a_relay_that_holds_every_method_fails_whatever_its_own_lookup_says() {
        let set = hold_of(7, "doc.set", 500, 1, 1000);
        let get = hold_of(7, "doc.get", 500, 2, 1000);
        let message = refusal(
            "doc.set=500",
            &[
                held(&set),
                released(&set, 1500),
                held(&get),
                released(&get, 1500),
            ],
        );
        assert!(message.contains("doc.get"), "{message}");
    }

    #[test]
    fn a_held_reply_that_was_never_written_fails_once_the_relay_outlived_its_hold() {
        let lost = hold_of(7, "doc.set", 2000, 1, 1000);
        let message = refusal(
            "doc.set=2000",
            &[held(&lost), alive(7, 2000), alive(7, 3000 + LATE_MS + 1)],
        );
        assert!(message.contains("never wrote it to the app"), "{message}");
        assert!(
            audit_of(
                "doc.set=2000",
                &[held(&lost), alive(7, 2000), alive(7, 3000 + LATE_MS)]
            )
            .is_ok(),
            "a relay that was alive only within the bound did not lose the reply"
        );
    }

    #[test]
    fn a_relay_that_stopped_mid_hold_did_not_lose_the_reply() {
        let cut = hold_of(7, "terminal.list", 2000, 1, 1000);
        assert!(
            audit_of(
                "terminal.list=2000",
                &[held(&cut), alive(7, 1250), alive(7, 1500)]
            )
            .is_ok()
        );
        let next = hold_of(8, "terminal.list", 2000, 1, 9000);
        assert!(
            audit_of(
                "terminal.list=2000",
                &[
                    held(&cut),
                    alive(7, 1500),
                    held(&next),
                    released(&next, 11_000),
                    alive(8, 12_000)
                ]
            )
            .is_ok(),
            "a later launch that ran longer does not count against the earlier relay"
        );
    }

    #[test]
    fn two_relays_that_reuse_one_request_id_are_audited_apart() {
        let first = hold_of(7, "doc.set", 2000, 1, 1000);
        let second = hold_of(8, "doc.set", 2000, 1, 20_000);
        let message = refusal(
            "doc.set=2000",
            &[
                held(&first),
                alive(7, 9000),
                held(&second),
                released(&second, 22_000),
            ],
        );
        assert!(message.contains("never wrote it to the app"), "{message}");
        let message = refusal(
            "doc.set=2000",
            &[
                held(&first),
                released(&first, 3000),
                held(&second),
                alive(8, 30_000),
            ],
        );
        assert!(message.contains("never wrote it to the app"), "{message}");
    }

    #[test]
    fn a_release_later_than_the_bound_fails() {
        let slow = hold_of(7, "doc.set", 500, 1, 1000);
        assert!(
            audit_of(
                "doc.set=500",
                &[held(&slow), released(&slow, 1500 + LATE_MS)]
            )
            .is_ok()
        );
        let message = refusal(
            "doc.set=500",
            &[held(&slow), released(&slow, 1500 + LATE_MS + 1)],
        );
        assert!(message.contains("past the"), "{message}");
        let message = refusal(
            "doc.set=500",
            &[held(&slow), released(&slow, 1000 + 4 * 500)],
        );
        assert!(message.contains("past the"), "{message}");
    }

    #[test]
    fn a_malformed_ledger_line_is_refused() {
        let right = hold_of(7, "doc.set", 500, 1, 1000);
        for bad in [
            "{not json".to_owned(),
            r#"{"event":"vanished","relay":{"pid":7,"startedAtMs":1}}"#.to_owned(),
            held(&right).replace("\"delayMs\":500,", ""),
            held(&right).replace("\"id\":1", "\"id\":\"one\""),
        ] {
            let message = refusal("doc.set=500", &[held(&right), bad.clone()]);
            assert!(
                message.contains("ledger line 2 is malformed"),
                "{bad}: {message}"
            );
        }
    }

    #[test]
    fn a_failed_write_is_recorded_as_undelivered_and_not_as_a_release() {
        let delay = CoreDelay::parse("doc.set=20").expect("a valid list");
        for (kind, name, verifier_fault) in [
            (io::ErrorKind::BrokenPipe, "BrokenPipe", false),
            (io::ErrorKind::PermissionDenied, "PermissionDenied", true),
        ] {
            let ledger = lost_after_hello(kind);
            assert!(ledger.contains(name), "{ledger}");
            assert!(!ledger.contains("releasedAtMs"), "{ledger}");
            assert_eq!(delay.audit(&ledger, "").is_err(), verifier_fault);
        }
    }

    #[test]
    fn a_method_core_does_not_offer_is_refused() {
        let delay = CoreDelay::parse("doc.set=5,no.such=5").expect("a valid list");
        let error = delay
            .vet(&json!(["doc.set", "doc.get"]))
            .expect_err("an unknown method");
        assert!(format!("{error:#}").contains("no.such"));
        assert!(
            CoreDelay::parse("doc.set=5")
                .expect("a valid list")
                .vet(&json!(["doc.set"]))
                .is_ok()
        );
    }
}
