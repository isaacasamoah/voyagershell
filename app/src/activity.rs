use serde::Deserialize;
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    time::{SystemTime, UNIX_EPOCH},
};
use voyager_contract::activity::{ActivityState, ReportedActivity};

pub(crate) const LINE_LIMIT: usize = 1024 * 1024;
pub(crate) const EARLY_LIMIT: usize = 256 * 1024;
const TERMINAL_LIMIT: usize = 256;

#[derive(Deserialize)]
struct Root {
    state: String,
    kind: Option<String>,
    progress: Option<u8>,
    #[serde(default)]
    app: String,
}

#[derive(Deserialize)]
struct Fact {
    status: Option<Root>,
    #[serde(default)]
    reported: bool,
    status_ms: Option<u64>,
    #[serde(default)]
    records: HashMap<String, serde::de::IgnoredAny>,
}

#[derive(Deserialize)]
struct Terminal {
    address: String,
    #[serde(flatten)]
    fact: Fact,
}

#[derive(Deserialize)]
struct Snapshot {
    seq: u64,
    terminals: Vec<Terminal>,
}

#[derive(Deserialize)]
struct Event {
    seq: u64,
    #[serde(rename = "type")]
    kind: String,
    terminal: Option<String>,
    data: Value,
}

struct Entry {
    fact: ReportedActivity,
    revision: u64,
}

#[derive(Default)]
pub(crate) struct Activity {
    entries: BTreeMap<String, Entry>,
    pub(crate) revision: u64,
    sequence: Option<u64>,
    unavailable: Option<String>,
    pub(crate) channel: Option<u32>,
    pending: bool,
    ignored_channel: Option<u32>,
    early_channel: Option<u32>,
    early: Vec<u8>,
    partial: Vec<u8>,
    close: Option<u32>,
    dirty: bool,
    wake: Option<Box<dyn Fn() + Send + Sync>>,
}

fn unknown(reason: &str) -> ReportedActivity {
    ReportedActivity {
        state: ActivityState::Unknown,
        reason: Some(reason.into()),
        reported: false,
        app: None,
        kind: None,
        progress: None,
        source_ms: None,
        observed_ms: None,
        sequence: None,
        limited: reason.contains("limit"),
    }
}

fn observed(fact: Fact, seq: Option<u64>) -> ReportedActivity {
    let mut result = unknown(if !fact.reported {
        "No status was reported"
    } else if !fact.records.is_empty() {
        "Only child records were reported"
    } else {
        "The root status was cleared"
    });
    result.reported = fact.reported;
    result.source_ms = fact.status_ms.map(|value| value.to_string());
    result.observed_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|value| value.as_millis().to_string());
    result.sequence = seq.map(|value| value.to_string());
    if !fact.reported && fact.status.is_some() {
        result.reason = Some("Root metadata was not marked reported".into());
        return result;
    }
    if let Some(root) = fact.status {
        result.state = match root.state.as_str() {
            "working" => ActivityState::Working,
            "blocked" => ActivityState::Blocked,
            "idle" => ActivityState::Idle,
            "done" => ActivityState::Done,
            "error" => ActivityState::Error,
            _ => ActivityState::Unknown,
        };
        result.reason =
            (result.state == ActivityState::Unknown).then(|| "Unsupported reported word".into());
        if root.app.len() <= 32 {
            result.app = (!root.app.is_empty()).then_some(root.app);
        } else {
            result.limited = true;
        }
        if root
            .kind
            .as_deref()
            .is_none_or(|kind| matches!(kind, "permission" | "question" | "auth"))
        {
            result.kind = root.kind;
        } else {
            result.limited = true;
        }
        result.progress = root.progress.filter(|value| *value <= 100);
        result.limited |= root.progress.is_some() && result.progress.is_none();
        if result.limited && result.reason.is_none() {
            result.reason = Some("Unsupported optional metadata was omitted".into());
        }
    }
    result
}

impl Activity {
    pub(crate) fn wake_with(&mut self, wake: Box<dyn Fn() + Send + Sync>) {
        self.wake = Some(wake);
    }

    fn changed(&mut self) {
        self.revision = self.revision.saturating_add(1);
        if !self.dirty {
            self.dirty = true;
            if let Some(wake) = &self.wake {
                wake();
            }
        }
    }

    pub(crate) fn take_dirty(&mut self) -> bool {
        std::mem::take(&mut self.dirty)
    }

    #[cfg(test)]
    pub(crate) fn get(&self, address: &str) -> ReportedActivity {
        self.entries
            .get(address)
            .map(|entry| entry.fact.clone())
            .unwrap_or_else(|| unknown("Terminal observation limit or unbound address"))
    }

    pub(crate) fn inspect(value: Value) -> ReportedActivity {
        serde_json::from_value::<Terminal>(value)
            .map(|terminal| observed(terminal.fact, None))
            .unwrap_or_else(|_| unknown("Invalid terminal activity metadata"))
    }

    pub(crate) fn projection(&self) -> BTreeMap<String, ReportedActivity> {
        self.entries
            .iter()
            .map(|(address, entry)| (address.clone(), entry.fact.clone()))
            .collect()
    }

    pub(crate) fn bind<'a>(&mut self, addresses: impl IntoIterator<Item = &'a str>) {
        let selected: BTreeSet<_> = addresses
            .into_iter()
            .filter(|address| address.len() <= 128)
            .take(TERMINAL_LIMIT)
            .collect();
        let before = self.entries.len();
        self.entries
            .retain(|address, _| selected.contains(address.as_str()));
        let mut changed = before != self.entries.len();
        for address in selected {
            if !self.entries.contains_key(address) {
                self.track(address);
                changed = true;
            }
        }
        if changed {
            self.changed();
        }
    }

    pub(crate) fn track(&mut self, address: &str) {
        if address.len() <= 128
            && self.entries.len() < TERMINAL_LIMIT
            && !self.entries.contains_key(address)
        {
            self.entries.insert(
                address.into(),
                Entry {
                    fact: unknown(self.unavailable.as_deref().unwrap_or("Not yet observed")),
                    revision: self.revision,
                },
            );
        }
    }

    fn invalidate(&mut self, reason: &str) {
        self.unavailable = Some(reason.into());
        self.changed();
        for entry in self.entries.values_mut() {
            entry.fact = unknown(reason);
            entry.revision = self.revision;
        }
    }

    pub(crate) fn accepts(&self, channel: u32) -> bool {
        channel != 0
            && self.ignored_channel != Some(channel)
            && (self.pending || self.channel == Some(channel))
    }

    pub(crate) fn fail(&mut self, reason: &str) {
        self.close = self.channel.take().or(self.early_channel.take());
        self.pending = false;
        self.partial = Vec::new();
        self.early = Vec::new();
        self.invalidate(reason);
    }

    pub(crate) fn take_close(&mut self) -> Option<u32> {
        self.close.take()
    }

    pub(crate) fn begin(&mut self) {
        self.close = self.channel.take();
        self.ignored_channel = self.close;
        self.pending = true;
        self.early.clear();
        self.partial.clear();
        self.early_channel = None;
    }

    fn snapshot(&mut self, snapshot: Snapshot) {
        if self.sequence.is_some_and(|prior| snapshot.seq < prior) {
            return;
        }
        self.sequence = Some(snapshot.seq);
        self.unavailable = None;
        self.changed();
        for entry in self.entries.values_mut() {
            entry.fact = observed(
                Fact {
                    status: None,
                    reported: false,
                    status_ms: None,
                    records: HashMap::new(),
                },
                Some(snapshot.seq),
            );
            entry.revision = self.revision;
        }
        for terminal in snapshot.terminals {
            if let Some(entry) = self.entries.get_mut(&terminal.address) {
                entry.fact = observed(terminal.fact, Some(snapshot.seq));
            }
        }
    }

    pub(crate) fn install(&mut self, value: Value) -> Result<u32, String> {
        if !self.pending {
            return Err("Activity observation was retired".into());
        }
        let channel = value
            .get("channel")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok())
            .filter(|channel| *channel != 0)
            .ok_or("Invalid activity channel")?;
        let snapshot: Snapshot =
            serde_json::from_value(value).map_err(|error| error.to_string())?;
        if self.early_channel.is_some_and(|early| early != channel) {
            return Err("Unexpected early activity channel".into());
        }
        self.channel = Some(channel);
        self.pending = false;
        self.snapshot(snapshot);
        let early = std::mem::take(&mut self.early);
        self.early_channel = None;
        Ok(self.data(channel, &early))
    }

    pub(crate) fn seed(&mut self, value: Value, before: u64) -> Result<(), String> {
        let terminal: Terminal =
            serde_json::from_value(value).map_err(|error| error.to_string())?;
        if self.unavailable.is_none()
            && let Some(entry) = self.entries.get(&terminal.address)
            && entry.revision <= before
        {
            let fact = observed(terminal.fact, None);
            self.changed();
            if let Some(entry) = self.entries.get_mut(&terminal.address) {
                entry.fact = fact;
                entry.revision = self.revision;
            }
        }
        Ok(())
    }

    pub(crate) fn notification(&mut self, value: Value) -> Result<(), String> {
        if value.get("jsonrpc").and_then(Value::as_str) != Some("2.0") || value.get("id").is_some()
        {
            return Err("Invalid activity notification".into());
        }
        match value.get("method").and_then(Value::as_str) {
            Some("missed") => self.snapshot(
                serde_json::from_value(value["params"].clone())
                    .map_err(|error| error.to_string())?,
            ),
            Some("heartbeat") => {
                let seq = value["params"]["seq"]
                    .as_u64()
                    .ok_or("Invalid heartbeat sequence")?;
                if self.sequence.is_some_and(|prior| seq > prior) {
                    self.invalidate("Activity sequence gap");
                }
            }
            Some("event") => {
                let event: Event = serde_json::from_value(value["params"].clone())
                    .map_err(|error| error.to_string())?;
                if self.sequence.is_some_and(|prior| event.seq <= prior) {
                    return Ok(());
                }
                if self.sequence.and_then(|prior| prior.checked_add(1)) != Some(event.seq) {
                    self.sequence = Some(event.seq);
                    self.invalidate("Activity sequence gap");
                    return Ok(());
                }
                self.sequence = Some(event.seq);
                if self.unavailable.is_some() {
                    return Ok(());
                }
                if event.kind == "status" {
                    let address = event.terminal.ok_or("Status event has no terminal")?;
                    let fact: Fact =
                        serde_json::from_value(event.data).map_err(|error| error.to_string())?;
                    if self.entries.contains_key(&address) {
                        let mut fact = observed(fact, Some(event.seq));
                        let entry = &self.entries[&address];
                        if entry.fact.state == fact.state {
                            fact.source_ms = entry.fact.source_ms.clone();
                        }
                        self.changed();
                        self.entries.insert(
                            address,
                            Entry {
                                fact,
                                revision: self.revision,
                            },
                        );
                    }
                } else if matches!(event.kind.as_str(), "created" | "restarted") {
                    let mut data = event.data;
                    if let Some(address) = event.terminal {
                        data["address"] = address.into();
                    }
                    self.seed(data, self.revision)?;
                } else if matches!(event.kind.as_str(), "lost" | "finished" | "removed")
                    && let Some(address) = event.terminal
                    && self.entries.contains_key(&address)
                {
                    self.changed();
                    self.entries.insert(
                        address,
                        Entry {
                            fact: unknown("Program observation ended or was lost"),
                            revision: self.revision,
                        },
                    );
                }
            }
            _ => return Err("Unknown activity notification".into()),
        }
        Ok(())
    }

    pub(crate) fn data(&mut self, channel: u32, bytes: &[u8]) -> u32 {
        if self.channel != Some(channel) {
            if self.pending {
                if self.early_channel.is_some_and(|prior| prior != channel)
                    || self.early.len().saturating_add(bytes.len()) > EARLY_LIMIT
                {
                    self.early_channel = Some(channel);
                    self.fail("Early activity byte limit exceeded");
                } else {
                    self.early_channel = Some(channel);
                    self.early.extend_from_slice(bytes);
                }
            }
            return 0;
        }
        for part in bytes.split_inclusive(|byte| *byte == b'\n') {
            if self.partial.len().saturating_add(part.len()) > LINE_LIMIT {
                self.fail("Activity line limit exceeded");
                return 0;
            }
            self.partial.extend_from_slice(part);
            if part.last() == Some(&b'\n') {
                let result = serde_json::from_slice(&self.partial)
                    .map_err(|error| error.to_string())
                    .and_then(|value| self.notification(value));
                self.partial.clear();
                if result.is_err() {
                    self.fail("Invalid activity notification");
                    return 0;
                }
            }
        }
        u32::try_from(bytes.len()).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use voyager_contract::activity::ActivityState;

    #[test]
    fn reported_words_optional_limits_and_nonreporters_are_literal() {
        for (word, state) in [
            ("working", ActivityState::Working),
            ("blocked", ActivityState::Blocked),
            ("idle", ActivityState::Idle),
            ("done", ActivityState::Done),
            ("error", ActivityState::Error),
            ("future", ActivityState::Unknown),
        ] {
            let fact = Activity::inspect(
                json!({"address":"t1","status":{"state":word,"app":"test","progress":40},"status_ms":17,"reported":true}),
            );
            assert_eq!(fact.state, state);
            assert_eq!(fact.source_ms.as_deref(), Some("17"));
            assert_eq!(fact.app.as_deref(), Some("test"));
            assert_eq!(fact.progress, Some(40));
        }
        let limited = Activity::inspect(
            json!({"address":"t1","status":{"state":"working","app":"x".repeat(33),"progress":101},"reported":true}),
        );
        assert_eq!(limited.state, ActivityState::Working);
        assert!(limited.limited && limited.app.is_none() && limited.progress.is_none());
        for (reported, records, reason) in [
            (false, json!({}), "No status was reported"),
            (true, json!({}), "The root status was cleared"),
            (
                true,
                json!({"child":{}}),
                "Only child records were reported",
            ),
        ] {
            let fact = Activity::inspect(
                json!({"address":"t1","status":null,"reported":reported,"records":records}),
            );
            assert_eq!(fact.state, ActivityState::Unknown);
            assert_eq!(fact.reason.as_deref(), Some(reason));
        }
    }

    #[test]
    fn split_early_events_missed_and_timestamps_preserve_reported_facts() {
        let mut facts = Activity::default();
        facts.bind(["t1", "t2"]);
        facts.begin();
        let event = br#"{"jsonrpc":"2.0","method":"event","params":{"seq":2,"type":"status","terminal":"t1","data":{"status":{"state":"done"},"records":{},"reported":true}}}
"#;
        assert_eq!(facts.data(9, &event[..31]), 0);
        assert_eq!(facts.data(9, &event[31..]), 0);
        facts.install(json!({"seq":1,"channel":9,"terminals":[{"address":"t1","status":{"state":"working","app":"test"},"status_ms":42,"reported":true}]})).unwrap();
        assert_eq!(facts.get("t1").state, ActivityState::Done);
        assert_eq!(facts.get("t1").source_ms, None);
        assert_eq!(facts.get("t2").state, ActivityState::Unknown);
        facts.notification(json!({"jsonrpc":"2.0","method":"event","params":{"seq":2,"type":"status","terminal":"t1","data":{"status":{"state":"error"},"reported":true}}})).unwrap();
        assert_eq!(facts.get("t1").state, ActivityState::Done);
        facts.notification(json!({"jsonrpc":"2.0","method":"missed","params":{"seq":8,"terminals":[{"address":"t1","status":{"state":"blocked","kind":"permission"},"status_ms":55,"reported":true}]}})).unwrap();
        assert_eq!(facts.get("t1").state, ActivityState::Blocked);
        assert_eq!(facts.get("t1").source_ms.as_deref(), Some("55"));
        facts.notification(json!({"jsonrpc":"2.0","method":"event","params":{"seq":9,"type":"future-kind","data":{}}})).unwrap();
        facts.notification(json!({"jsonrpc":"2.0","method":"event","params":{"seq":10,"type":"status","terminal":"t1","data":{"status":null,"records":{"child":{}},"reported":true}}})).unwrap();
        assert_eq!(facts.get("t1").state, ActivityState::Unknown);
        assert_eq!(
            facts.get("t1").reason.as_deref(),
            Some("Only child records were reported")
        );
        facts.notification(json!({"jsonrpc":"2.0","method":"event","params":{"seq":12,"type":"status","terminal":"t1","data":{"status":{"state":"idle"},"reported":true}}})).unwrap();
        assert_eq!(facts.get("t1").state, ActivityState::Unknown);
        assert!(facts.get("t1").reason.unwrap().contains("sequence"));
    }

    #[test]
    fn bounds_and_new_binding_seed_cannot_replace_a_later_report() {
        let mut facts = Activity::default();
        facts.bind(["t1"]);
        facts.begin();
        facts
            .install(json!({"seq":0,"channel":7,"terminals":[]}))
            .unwrap();
        let before = facts.revision;
        facts.notification(json!({"jsonrpc":"2.0","method":"event","params":{"seq":1,"type":"status","terminal":"t1","data":{"status":{"state":"working"},"reported":true}}})).unwrap();
        facts
            .seed(
                json!({"address":"t1","status":{"state":"idle"},"reported":true}),
                before,
            )
            .unwrap();
        assert_eq!(facts.get("t1").state, ActivityState::Working);
        facts.data(7, &vec![b'x'; LINE_LIMIT + 1]);
        assert_eq!(facts.get("t1").state, ActivityState::Unknown);
        assert!(facts.partial.is_empty());
        assert!(facts.channel.is_none());
        facts.begin();
        facts.data(11, &vec![b'x'; EARLY_LIMIT + 1]);
        assert!(facts.early.is_empty());
        assert!(facts.get("t1").limited);
        let names: Vec<_> = (0..300).map(|index| format!("t{index}")).collect();
        facts.bind(names.iter().map(String::as_str));
        assert_eq!(facts.entries.len(), TERMINAL_LIMIT);
        assert_eq!(facts.get("not-bound").state, ActivityState::Unknown);
    }
}
