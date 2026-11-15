use crate::sandbox::{CORE, CORE_RELAY};
use crate::system::System;
use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashMap};
use std::fs::{File, OpenOptions};
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

    fn hold(&self, method: &str) -> Option<Duration> {
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

    pub fn audit(&self, ledger: &str) -> Result<()> {
        for line in ledger.lines() {
            let held: Value = serde_json::from_str(line).context("Core relay ledger line")?;
            let method = held["method"].as_str().unwrap_or_default();
            ensure!(
                self.hold(method).map(|hold| hold.as_millis() as u64) == held["delayMs"].as_u64(),
                "The Core relay held {method} for {} ms, which the delay did not ask for",
                held["delayMs"]
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
    at: u128,
}

struct Relay {
    delay: CoreDelay,
    asked: Mutex<HashMap<u64, Asked>>,
    ledger: Mutex<File>,
}

impl Relay {
    fn new(delay: CoreDelay, ledger: File) -> Self {
        Self {
            delay,
            asked: Mutex::default(),
            ledger: Mutex::new(ledger),
        }
    }

    fn asked(&self) -> MutexGuard<'_, HashMap<u64, Asked>> {
        self.asked
            .lock()
            .expect("the relay's request table is never held across a panic")
    }

    fn release(&self, id: u64, asked: &Asked, replied: u128, hold: Duration) {
        let released = now();
        let mut ledger = self
            .ledger
            .lock()
            .expect("the relay's ledger is never held across a panic");
        let _ = writeln!(
            ledger,
            "{}",
            json!({"method":asked.method,"id":id,"delayMs":hold.as_millis() as u64,"requestedAtMs":asked.at,"repliedAtMs":replied,"releasedAtMs":released})
        );
    }
}

fn now() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
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
        let (to, relay) = (Arc::clone(to), Arc::clone(relay));
        held.push(thread::spawn(move || {
            thread::sleep(hold);
            let _ = frame.write(&mut *locked(&to));
            relay.release(id, &asked, replied, hold);
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
        let line: Value = serde_json::from_str(ledger.trim()).expect("one ledger line");
        assert_eq!(line["method"], "doc.set");
        assert_eq!(line["delayMs"], 300);
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

    #[test]
    fn the_ledger_audit_catches_a_hold_nobody_asked_for() {
        let delay = CoreDelay::parse("doc.set=2000").expect("a valid list");
        let asked = r#"{"method":"doc.set","delayMs":2000}"#;
        assert!(delay.audit(asked).is_ok());
        assert!(delay.audit("").is_ok());
        for wrong in [
            r#"{"method":"doc.get","delayMs":2000}"#,
            r#"{"method":"doc.set","delayMs":500}"#,
        ] {
            assert!(delay.audit(wrong).is_err(), "{wrong} must be caught");
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
