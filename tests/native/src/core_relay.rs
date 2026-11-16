use crate::sandbox::{CORE, CORE_RELAY};
use crate::system::System;
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const RELAY_NAME: &str = "hc-delay";
const DELAY_ENV: &str = "VOYAGER_CORE_DELAY";
const LEDGER_ENV: &str = "VOYAGER_CORE_RELAY_LEDGER";
const LEDGER: &str = "core-relay.jsonl";
const LONGEST_DELAY_MS: u64 = 30_000;
const LATE_MS: u64 = 1_000;
const HEARTBEAT: Duration = Duration::from_millis(250);

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct CoreDelay(BTreeMap<String, u64>);

impl CoreDelay {
    pub fn parse(text: &str) -> Result<Self> {
        let mut held = BTreeMap::new();
        for entry in text.split(',') {
            let (method, milliseconds) = entry
                .split_once('=')
                .with_context(|| format!("Core delay {entry:?} is METHOD=MS"))?;
            ensure!(
                !method.is_empty()
                    && method
                        .bytes()
                        .all(|byte| byte.is_ascii_lowercase() || byte == b'.' || byte == b'_'),
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
        Ok(Self(held))
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    fn encode(&self) -> String {
        self.0
            .iter()
            .map(|(method, milliseconds)| format!("{method}={milliseconds}"))
            .collect::<Vec<_>>()
            .join(",")
    }

    pub fn hold(&self, method: &str) -> Option<Duration> {
        self.0
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
        ] {
            system.env.insert(key.into(), value);
        }
    }

    pub fn audit_file(&self, evidence: &Path) -> Result<()> {
        let ledger = match fs::read_to_string(evidence.join(LEDGER)) {
            Ok(ledger) => ledger,
            Err(error) if error.kind() == io::ErrorKind::NotFound => String::new(),
            Err(error) => return Err(error).context("The Core relay ledger could not be read"),
        };
        self.audit(&ledger)
    }

    fn due(&self, hold: &Hold) -> Result<u64> {
        let asked = self
            .0
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

    pub fn audit(&self, ledger: &str) -> Result<()> {
        let mut alive: HashMap<Instance, u64> = HashMap::new();
        let mut waiting: HashMap<(Instance, u64), (String, u64)> = HashMap::new();
        for (number, line) in ledger.lines().enumerate() {
            let entry: Entry = serde_json::from_str(line)
                .with_context(|| format!("Core relay ledger line {} is malformed", number + 1))?;
            let (relay, at) = match entry {
                Entry::Alive { relay, at_ms } => (relay, at_ms),
                Entry::Held(hold) => {
                    let due = self.due(&hold)?;
                    waiting.insert((hold.relay, hold.id), (hold.method, due));
                    (hold.relay, hold.replied_at_ms)
                }
                Entry::Released {
                    hold,
                    released_at_ms,
                } => {
                    let due = self.due(&hold)?;
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
                    self.due(&hold)?;
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
        for method in self.0.keys() {
            ensure!(
                offered.contains(&method.as_str()),
                "Core has no method {method}, so its delay could never apply"
            );
        }
        Ok(())
    }
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
    let relay = Arc::new(Relay::new(delay, ledger));
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
}

struct Relay {
    delay: CoreDelay,
    instance: Instance,
    asked: Mutex<HashMap<u64, Asked>>,
    ledger: Mutex<File>,
}

impl Relay {
    fn new(delay: CoreDelay, ledger: File) -> Self {
        Self {
            delay,
            instance: Instance {
                pid: std::process::id(),
                started_at_ms: now(),
            },
            asked: Mutex::default(),
            ledger: Mutex::new(ledger),
        }
    }

    fn asked(&self) -> MutexGuard<'_, HashMap<u64, Asked>> {
        self.asked
            .lock()
            .expect("the relay's request table is never held across a panic")
    }

    fn hold(&self, id: u64, asked: &Asked, replied: u64, hold: Duration) -> Hold {
        Hold {
            relay: self.instance,
            method: asked.method.clone(),
            id,
            delay_ms: hold.as_millis() as u64,
            requested_at_ms: asked.at,
            replied_at_ms: replied,
        }
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
            && relay.delay.hold(method).is_some()
        {
            relay.asked().insert(
                id,
                Asked {
                    method: method.to_owned(),
                    at: now(),
                },
            );
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
        let delayed = reply.and_then(|id| {
            let asked = relay.asked().remove(&id)?;
            let hold = relay.delay.hold(&asked.method)?;
            Some((id, asked, hold))
        });
        let Some((id, asked, hold)) = delayed else {
            frame.write(&mut *locked(to))?;
            continue;
        };
        let replied = now();
        let entry = relay.hold(id, &asked, replied, hold);
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
            .audit(&lines.join("\n"))
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
            assert_eq!(delay.audit(&ledger).is_err(), verifier_fault);
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
