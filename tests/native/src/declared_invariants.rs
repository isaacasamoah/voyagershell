use crate::journey::Journey;
use anyhow::{Result, ensure};
use serde::Deserialize;
use serde::de::{DeserializeOwned, IntoDeserializer};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

pub const MODEL: &str = "tests/native/declared-invariants.toml";
const GATES: &str = "tests/architecture/rules.yaml";
const VOCABULARY: &str = "tests/architecture/vocabulary.yaml";
const FORMAL: &str = "tests/formal";

#[derive(Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum Kind {
    User,
    Developer,
    Structure,
    Process,
}

#[derive(Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum Confidence {
    Stated,
    Inferred,
}

#[derive(Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum Lint {
    Comments,
    Prose,
    Clippy,
    Fmt,
}

#[derive(Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum Policy {
    TestsRemoved,
    CoverageClaimLowered,
    CheckLoosened,
    ShapeChanged,
    FloorRaised,
    DependencyAdded,
    AuthoritySurface,
    AlwaysPause,
    Size,
    FailUnanchored,
    Hold,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Item {
    pub path: String,
    pub name: String,
}

#[derive(Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(try_from = "String")]
pub enum Guard {
    Type(Item),
    Gate(String),
    Lint(Lint),
    Hook(String),
    Policy(Policy),
}

#[derive(Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(try_from = "String")]
pub enum Check {
    Journey { journey: Journey, case: String },
    Test(Item),
    Perf(String),
    Manual(String),
}

#[derive(Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(try_from = "String")]
pub struct Formal {
    pub model: String,
    pub property: String,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status {
    GuardedAndChecked,
    CheckedOnly,
    GuardedOnly,
    Gap,
}

#[derive(Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Invariant {
    pub id: String,
    pub says: String,
    pub kind: Kind,
    pub owner: Option<String>,
    pub source: String,
    pub features: Vec<String>,
    pub guard: Vec<Guard>,
    pub check: Vec<Check>,
    #[serde(default)]
    pub formal: Vec<Formal>,
    pub formal_why: Option<String>,
    pub type_gap: Option<String>,
    pub gap: Option<String>,
    pub confidence: Confidence,
}

impl Invariant {
    pub fn status(&self) -> Status {
        match (self.guard.is_empty(), self.check.is_empty()) {
            (false, false) => Status::GuardedAndChecked,
            (true, false) => Status::CheckedOnly,
            (false, true) => Status::GuardedOnly,
            (true, true) => Status::Gap,
        }
    }
}

#[derive(Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Envelope {
    pub id: String,
    pub fact: String,
    pub command: String,
    pub measured: String,
    pub expires: String,
    pub confidence: Confidence,
}

#[derive(Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct OutOfScope {
    pub id: String,
    pub state: String,
    pub why: String,
    pub revisit_when: String,
    pub confidence: Confidence,
}

#[derive(Debug)]
pub struct Model {
    pub invariant: Vec<Invariant>,
    pub envelope: Vec<Envelope>,
    pub out_of_scope: Vec<OutOfScope>,
}

#[derive(Debug)]
pub struct Targets {
    pub features: BTreeSet<String>,
    pub gates: BTreeSet<String>,
    pub contexts: BTreeSet<String>,
    pub formal: BTreeMap<String, BTreeSet<String>>,
    pub files: BTreeMap<String, String>,
}

fn nearest<'a>(word: &str, candidates: impl IntoIterator<Item = &'a str>) -> Option<&'a str> {
    let distance = |other: &str| {
        let other: Vec<char> = other.chars().collect();
        let mut row: Vec<usize> = (0..=other.len()).collect();
        for (i, a) in word.chars().enumerate() {
            let mut diagonal = row[0];
            row[0] = i + 1;
            for (j, b) in other.iter().enumerate() {
                let next = (diagonal + usize::from(a != *b))
                    .min(row[j] + 1)
                    .min(row[j + 1] + 1);
                diagonal = row[j + 1];
                row[j + 1] = next;
            }
        }
        row[other.len()]
    };
    candidates
        .into_iter()
        .min_by_key(|candidate| distance(candidate))
}

fn unknown<'a>(what: &str, word: &str, candidates: impl IntoIterator<Item = &'a str>) -> String {
    located(what, word, "", candidates)
}

fn located<'a>(
    what: &str,
    word: &str,
    place: &str,
    candidates: impl IntoIterator<Item = &'a str>,
) -> String {
    let place = if place.is_empty() {
        String::new()
    } else {
        format!(" in {place}")
    };
    match nearest(word, candidates) {
        Some(near) => format!("unknown {what} {word}{place}; the nearest is {near}"),
        None => format!("unknown {what} {word}{place}; there are none to link"),
    }
}

fn closed<T: DeserializeOwned>(what: &str, word: &str) -> Result<T, String> {
    T::deserialize(word.into_deserializer())
        .map_err(|error: serde::de::value::Error| format!("{what} {word}: {error}"))
}

fn item(prefix: &str, rest: &str) -> Result<Item, String> {
    match rest.split_once('#') {
        Some((path, name)) if !path.is_empty() && !name.is_empty() => Ok(Item {
            path: path.into(),
            name: name.into(),
        }),
        _ => Err(format!("{prefix}:{rest} is not {prefix}:<path>#<name>")),
    }
}

fn prefixed<'a>(link: &'a str, field: &str, prefixes: &str) -> Result<(&'a str, &'a str), String> {
    match link.split_once(':') {
        Some((prefix, rest)) if !rest.is_empty() => Ok((prefix, rest)),
        _ => Err(format!(
            "{field} {link} has no <prefix>:<target>; use {prefixes}"
        )),
    }
}

impl TryFrom<String> for Guard {
    type Error = String;

    fn try_from(link: String) -> Result<Self, String> {
        const PREFIXES: &str = "type:, gate:, lint:, hook: or policy:";
        let (prefix, rest) = prefixed(&link, "guard", PREFIXES)?;
        Ok(match prefix {
            "type" => Self::Type(item(prefix, rest)?),
            "gate" => Self::Gate(rest.into()),
            "lint" => Self::Lint(closed("lint", rest)?),
            "hook" => Self::Hook(rest.into()),
            "policy" => Self::Policy(closed("policy", rest)?),
            _ => {
                return Err(format!(
                    "guard {link} has an unknown prefix; use {PREFIXES}"
                ));
            }
        })
    }
}

impl TryFrom<String> for Check {
    type Error = String;

    fn try_from(link: String) -> Result<Self, String> {
        const PREFIXES: &str = "journey:, test:, perf: or manual:";
        let (prefix, rest) = prefixed(&link, "check", PREFIXES)?;
        Ok(match prefix {
            "journey" => {
                let Some((name, case)) = rest.split_once('/') else {
                    return Err(format!("check {link} is not journey:<journey>/<case>"));
                };
                let names = Journey::ALL.iter().map(|journey| journey.name());
                let Some(journey) = Journey::ALL.iter().find(|j| j.name() == name) else {
                    return Err(unknown("journey", name, names));
                };
                if !journey.cases().contains(&case) {
                    let cases = journey.cases().iter().copied();
                    return Err(unknown(&format!("{name} case"), case, cases));
                }
                Self::Journey {
                    journey: *journey,
                    case: case.into(),
                }
            }
            "test" => Self::Test(item(prefix, rest)?),
            "perf" => Self::Perf(rest.into()),
            "manual" => Self::Manual(rest.into()),
            _ => {
                return Err(format!(
                    "check {link} has an unknown prefix; use {PREFIXES}"
                ));
            }
        })
    }
}

impl TryFrom<String> for Formal {
    type Error = String;

    fn try_from(link: String) -> Result<Self, String> {
        match link.split_once(':') {
            Some((model, property)) if !model.is_empty() && !property.is_empty() => Ok(Self {
                model: model.into(),
                property: property.into(),
            }),
            _ => Err(format!("formal {link} is not <model>:<property>")),
        }
    }
}

fn definitions<'a>(text: &'a str, keywords: &[&str]) -> BTreeSet<&'a str> {
    let words: Vec<&str> = text
        .split(|c: char| !(c.is_alphanumeric() || c == '_'))
        .filter(|word| !word.is_empty())
        .collect();
    words
        .windows(2)
        .filter(|pair| keywords.contains(&pair[0]))
        .map(|pair| pair[1])
        .collect()
}

const TYPE_KEYWORDS: [&str; 10] = [
    "struct",
    "enum",
    "trait",
    "type",
    "union",
    "fn",
    "const",
    "static",
    "class",
    "interface",
];

impl Targets {
    fn resolve(&self, item: &Item, keywords: &[&str], what: &str) -> Option<String> {
        let Some(text) = self.files.get(&item.path) else {
            return Some(format!("{} does not exist", item.path));
        };
        let names = definitions(text, keywords);
        (!names.contains(item.name.as_str())).then(|| located(what, &item.name, &item.path, names))
    }

    fn guard(&self, guard: &Guard) -> Option<String> {
        match guard {
            Guard::Type(item) => self.resolve(item, &TYPE_KEYWORDS, "type"),
            Guard::Gate(id) => (!self.gates.contains(id))
                .then(|| located("gate", id, GATES, self.gates.iter().map(String::as_str))),
            Guard::Hook(path) => {
                (!self.files.contains_key(path)).then(|| format!("hook {path} does not exist"))
            }
            Guard::Lint(_) | Guard::Policy(_) => None,
        }
    }

    fn check(&self, check: &Check, envelopes: &BTreeSet<&str>) -> Option<String> {
        match check {
            Check::Test(item) => self.resolve(item, &["fn"], "test fn"),
            Check::Perf(id) => (!envelopes.contains(id.as_str()))
                .then(|| unknown("perf envelope", id, envelopes.iter().copied())),
            Check::Manual(how) => how.trim().is_empty().then(|| "manual: names nobody".into()),
            Check::Journey { .. } => None,
        }
    }

    fn formal(&self, formal: &Formal) -> Option<String> {
        let Some(properties) = self.formal.get(&formal.model) else {
            let models = self.formal.keys().map(String::as_str);
            return Some(located("formal model", &formal.model, FORMAL, models));
        };
        (!properties.contains(&formal.property)).then(|| {
            let what = format!("{} property", formal.model);
            unknown(
                &what,
                &formal.property,
                properties.iter().map(String::as_str),
            )
        })
    }
}

const KINDS: [&str; 3] = ["invariant", "envelope", "out_of_scope"];

fn entries<T: DeserializeOwned>(
    table: &toml::Table,
    kind: &str,
    problems: &mut Vec<String>,
) -> Vec<T> {
    let Some(value) = table.get(kind) else {
        problems.push(format!("No [[{kind}]] entries"));
        return Vec::new();
    };
    let Some(items) = value.as_array() else {
        problems.push(format!("{kind} must be an array of tables"));
        return Vec::new();
    };
    let mut parsed = Vec::new();
    for (index, item) in items.iter().enumerate() {
        let label = item
            .get("id")
            .and_then(toml::Value::as_str)
            .map_or_else(|| format!("#{}", index + 1), String::from);
        match item.clone().try_into::<T>() {
            Ok(entry) => parsed.push(entry),
            Err(error) => problems.push(format!("{kind} {label}: {}", error.message())),
        }
    }
    parsed
}

fn filled(problems: &mut Vec<String>, kind: &str, id: &str, fields: &[(&str, &str)]) {
    for (name, text) in fields {
        if text.trim().is_empty() {
            problems.push(format!("{kind} {id}: {name} is empty"));
        }
    }
}

impl Model {
    pub fn parse(text: &str) -> Result<Self> {
        let table: toml::Table = toml::from_str(text)
            .map_err(|error| anyhow::anyhow!("Declared invariants: {error}"))?;
        let mut problems = Vec::new();
        for key in table.keys().filter(|key| !KINDS.contains(&key.as_str())) {
            problems.push(format!("Unknown section {key}"));
        }
        let model = Model {
            invariant: entries(&table, "invariant", &mut problems),
            envelope: entries(&table, "envelope", &mut problems),
            out_of_scope: entries(&table, "out_of_scope", &mut problems),
        };
        ensure!(
            problems.is_empty(),
            "Declared invariants:\n{}",
            problems.join("\n")
        );
        Ok(model)
    }

    pub fn linked_files(&self) -> BTreeSet<&str> {
        let guards = self.invariant.iter().flat_map(|entry| &entry.guard);
        let checks = self.invariant.iter().flat_map(|entry| &entry.check);
        guards
            .filter_map(|guard| match guard {
                Guard::Type(item) => Some(item.path.as_str()),
                Guard::Hook(path) => Some(path.as_str()),
                _ => None,
            })
            .chain(checks.filter_map(|check| match check {
                Check::Test(item) => Some(item.path.as_str()),
                _ => None,
            }))
            .collect()
    }

    pub fn validate(&self, targets: &Targets) -> Result<()> {
        let mut problems = Vec::new();
        let mut seen = BTreeSet::new();
        let ids = self
            .invariant
            .iter()
            .map(|entry| entry.id.as_str())
            .chain(self.envelope.iter().map(|entry| entry.id.as_str()))
            .chain(self.out_of_scope.iter().map(|entry| entry.id.as_str()));
        for id in ids {
            if !seen.insert(id) {
                problems.push(format!("Duplicate id {id}"));
            }
        }
        let envelopes: BTreeSet<&str> = self.envelope.iter().map(|e| e.id.as_str()).collect();
        for entry in &self.invariant {
            self.invariant_problems(entry, targets, &envelopes, &mut problems);
        }
        for entry in &self.envelope {
            filled(
                &mut problems,
                "envelope",
                &entry.id,
                &[
                    ("id", &entry.id),
                    ("fact", &entry.fact),
                    ("command", &entry.command),
                    ("expires", &entry.expires),
                ],
            );
        }
        for entry in &self.out_of_scope {
            filled(
                &mut problems,
                "out_of_scope",
                &entry.id,
                &[
                    ("id", &entry.id),
                    ("state", &entry.state),
                    ("why", &entry.why),
                    ("revisit_when", &entry.revisit_when),
                ],
            );
        }
        ensure!(problems.is_empty(), "{}", problems.join("\n"));
        Ok(())
    }

    fn invariant_problems(
        &self,
        entry: &Invariant,
        targets: &Targets,
        envelopes: &BTreeSet<&str>,
        problems: &mut Vec<String>,
    ) {
        let id = &entry.id;
        let optional = [
            ("formal_why", &entry.formal_why),
            ("type_gap", &entry.type_gap),
            ("gap", &entry.gap),
            ("owner", &entry.owner),
        ];
        let mut texts = vec![
            ("id", id.as_str()),
            ("says", &entry.says),
            ("source", &entry.source),
        ];
        texts.extend(
            optional
                .iter()
                .filter_map(|(name, text)| Some((*name, text.as_deref()?))),
        );
        filled(problems, "invariant", id, &texts);
        let mut push = |problem: String| problems.push(format!("invariant {id}: {problem}"));
        for feature in entry
            .features
            .iter()
            .filter(|f| !targets.features.contains(*f))
        {
            push(unknown(
                "feature",
                feature,
                targets.features.iter().map(String::as_str),
            ));
        }
        if let Some(owner) = &entry.owner
            && !targets.contexts.contains(owner)
        {
            let contexts = targets.contexts.iter().map(String::as_str);
            push(located("owner context", owner, VOCABULARY, contexts));
        }
        entry
            .guard
            .iter()
            .filter_map(|g| targets.guard(g))
            .for_each(&mut push);
        entry
            .check
            .iter()
            .filter_map(|c| targets.check(c, envelopes))
            .for_each(&mut push);
        entry
            .formal
            .iter()
            .filter_map(|f| targets.formal(f))
            .for_each(&mut push);
        match (entry.formal.is_empty(), entry.formal_why.is_some()) {
            (false, false) => push(
                "formal is set; add formal_why naming the defect that justified the model".into(),
            ),
            (true, true) => push(
                "formal_why is set with no formal link; add the link or remove formal_why".into(),
            ),
            _ => {}
        }
        if entry.gap.is_none() {
            if entry.check.is_empty() {
                push(
                    "check is empty; add a check link or a gap saying why and which unit closes it"
                        .into(),
                );
            }
            if entry.owner.is_none() {
                push("owner is unset; add an owner context or a gap saying why".into());
            }
        }
    }

    pub fn counts(&self) -> String {
        let unmeasured: Vec<&str> = self
            .envelope
            .iter()
            .filter(|entry| entry.measured.trim().is_empty())
            .map(|entry| entry.id.as_str())
            .collect();
        let confidences = self
            .invariant
            .iter()
            .map(|entry| entry.confidence)
            .chain(self.envelope.iter().map(|entry| entry.confidence))
            .chain(self.out_of_scope.iter().map(|entry| entry.confidence));
        let stated = confidences.filter(|c| *c == Confidence::Stated).count();
        let kind = |kind| self.invariant.iter().filter(|e| e.kind == kind).count();
        let status = |status| {
            self.invariant
                .iter()
                .filter(|e| e.status() == status)
                .count()
        };
        let ownerless = self.invariant.iter().filter(|e| e.owner.is_none()).count();
        format!(
            "{} invariants ({} user, {} developer, {} structure, {} process), {} envelope entries, {} out of scope, {stated} stated\n\
             status: {} guarded and checked, {} checked only, {} guarded only, {} gap; {ownerless} with no owner\n\
             envelope entries with no measurement ({}): {}",
            self.invariant.len(),
            kind(Kind::User),
            kind(Kind::Developer),
            kind(Kind::Structure),
            kind(Kind::Process),
            self.envelope.len(),
            self.out_of_scope.len(),
            status(Status::GuardedAndChecked),
            status(Status::CheckedOnly),
            status(Status::GuardedOnly),
            status(Status::Gap),
            unmeasured.len(),
            unmeasured.join(", ")
        )
    }
}

fn listed_ids(yaml: &str, section: &str) -> BTreeSet<String> {
    let header = format!("{section}:");
    yaml.lines()
        .skip_while(|line| *line != header)
        .skip(1)
        .take_while(|line| line.is_empty() || line.starts_with([' ', '#']))
        .filter_map(|line| line.strip_prefix("  - id:"))
        .map(|id| id.trim().trim_matches(['\'', '"']).to_string())
        .collect()
}

fn cfg_invariants(cfg: &str) -> BTreeSet<String> {
    let mut properties = BTreeSet::new();
    let mut inside = false;
    for line in cfg.lines() {
        let mut words = line.split_whitespace();
        if !line.starts_with(char::is_whitespace) {
            inside = matches!(words.next(), Some("INVARIANT" | "INVARIANTS"));
        }
        if inside {
            properties.extend(words.map(String::from));
        }
    }
    properties
}

fn formal_models(root: &Path) -> Result<BTreeMap<String, BTreeSet<String>>> {
    let mut models = BTreeMap::new();
    for model in std::fs::read_dir(root.join(FORMAL))? {
        let model = model?.path();
        let Some(name) = model.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let mut properties = BTreeSet::new();
        for file in std::fs::read_dir(&model)? {
            let file = file?.path();
            if file.extension().is_some_and(|extension| extension == "cfg") {
                properties.extend(cfg_invariants(&std::fs::read_to_string(&file)?));
            }
        }
        models.insert(name.to_string(), properties);
    }
    Ok(models)
}

pub fn load(root: &Path, features: &BTreeSet<&str>) -> Result<Model> {
    let model = Model::parse(&std::fs::read_to_string(root.join(MODEL))?)?;
    let files = model
        .linked_files()
        .into_iter()
        .filter_map(|path| {
            let text = std::fs::read_to_string(root.join(path)).ok()?;
            Some((path.to_string(), text))
        })
        .collect();
    let targets = Targets {
        features: features.iter().map(|f| f.to_string()).collect(),
        gates: listed_ids(&std::fs::read_to_string(root.join(GATES))?, "rules"),
        contexts: listed_ids(&std::fs::read_to_string(root.join(VOCABULARY))?, "contexts"),
        formal: formal_models(root)?,
        files,
    };
    model.validate(&targets)?;
    Ok(model)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SEED: &str = r#"
[[invariant]]
id = "keep"
says = "Quit keeps programs."
kind = "user"
owner = "core-adapter"
source = "AGENTS.md"
features = ["vessels"]
guard = ["type:app/src/core_viewer.rs#Lease", "gate:file-size", "lint:clippy", "hook:.claude/hooks/guard.py", "policy:check-loosened"]
check = ["journey:workspace/rename-fleet-enter", "test:app/tests/viewer_streams.rs#ended_terminals_do_not_exhaust_viewers", "perf:latency", "manual:Isaac by ear"]
formal = ["core-viewers:SlotsWithinLimit"]
formal_why = "A slot leak the tests missed."
confidence = "stated"

[[invariant]]
id = "tidy"
says = "Tests leave nothing."
kind = "process"
source = "a verdict"
features = []
guard = []
check = []
gap = "No check yet; DI5 links one."
confidence = "inferred"

[[envelope]]
id = "latency"
fact = "Reply time."
command = "Time it."
measured = ""
expires = "When Core changes"
confidence = "inferred"

[[out_of_scope]]
id = "other-os"
state = "Another platform."
why = "Linux only."
revisit_when = "A port starts."
confidence = "stated"
"#;

    fn targets() -> Targets {
        let set = |items: &[&str]| items.iter().map(|item| item.to_string()).collect();
        Targets {
            features: set(&["vessels", "notes"]),
            gates: set(&["file-size", "agent-names-stay-in-adapters"]),
            contexts: set(&["core-adapter", "verification"]),
            formal: [("core-viewers".into(), set(&["TypeOK", "SlotsWithinLimit"]))].into(),
            files: [
                (
                    "app/src/core_viewer.rs",
                    "pub struct Lease;\npub fn grant() {}",
                ),
                (
                    "app/tests/viewer_streams.rs",
                    "#[test]\nfn ended_terminals_do_not_exhaust_viewers() {}",
                ),
                (".claude/hooks/guard.py", "print()"),
            ]
            .map(|(path, text)| (path.to_string(), text.to_string()))
            .into(),
        }
    }

    fn failure(text: &str) -> String {
        let model = match Model::parse(text) {
            Ok(model) => model,
            Err(error) => return format!("{error:#}"),
        };
        format!("{:#}", model.validate(&targets()).unwrap_err())
    }

    fn broken(from: &str, to: &str) -> String {
        assert!(SEED.contains(from), "{from} is not in the seed");
        let message = failure(&SEED.replacen(from, to, 1));
        match message.strip_prefix("Declared invariants:\n") {
            Some(problems) => problems.to_string(),
            None => message,
        }
    }

    #[test]
    fn seed_model_is_valid() {
        let model = Model::parse(SEED).unwrap();
        model.validate(&targets()).unwrap();
        let counts = model.counts();
        assert!(
            counts.contains("1 user, 0 developer, 0 structure, 1 process"),
            "{counts}"
        );
        assert!(
            counts.contains(
                "1 guarded and checked, 0 checked only, 0 guarded only, 1 gap; 1 with no owner"
            ),
            "{counts}"
        );
        assert!(
            counts.contains("envelope entries with no measurement (1): latency"),
            "{counts}"
        );
    }

    #[test]
    fn each_unresolved_link_names_its_fix_in_one_line() {
        let seeds = [
            (
                "workspace/rename-fleet-enter",
                "workspace/rename-flet-enter",
                "invariant keep: unknown workspace case rename-flet-enter; the nearest is rename-fleet-enter",
            ),
            (
                "journey:workspace/",
                "journey:workspce/",
                "invariant keep: unknown journey workspce; the nearest is workspace",
            ),
            (
                "#ended_terminals_do_not_exhaust_viewers",
                "#ended_terminals_exhaust_viewers",
                "invariant keep: unknown test fn ended_terminals_exhaust_viewers in app/tests/viewer_streams.rs; the nearest is ended_terminals_do_not_exhaust_viewers",
            ),
            (
                "test:app/tests/viewer_streams.rs",
                "test:app/tests/viewer_stream.rs",
                "invariant keep: app/tests/viewer_stream.rs does not exist",
            ),
            (
                "gate:file-size",
                "gate:file-sizes",
                "invariant keep: unknown gate file-sizes in tests/architecture/rules.yaml; the nearest is file-size",
            ),
            (
                "core-viewers:SlotsWithinLimit",
                "core-viewers:SlotWithinLimits",
                "invariant keep: unknown core-viewers property SlotWithinLimits; the nearest is SlotsWithinLimit",
            ),
            (
                "core-viewers:SlotsWithinLimit",
                "core-viewer:SlotsWithinLimit",
                "invariant keep: unknown formal model core-viewer in tests/formal; the nearest is core-viewers",
            ),
            (
                "perf:latency",
                "perf:latancy",
                "invariant keep: unknown perf envelope latancy; the nearest is latency",
            ),
            (
                "owner = \"core-adapter\"",
                "owner = \"core-adaptor\"",
                "invariant keep: unknown owner context core-adaptor in tests/architecture/vocabulary.yaml; the nearest is core-adapter",
            ),
            (
                "#Lease",
                "#Leases",
                "invariant keep: unknown type Leases in app/src/core_viewer.rs; the nearest is Lease",
            ),
            (
                "hook:.claude/hooks/guard.py",
                "hook:.claude/hooks/gaurd.py",
                "invariant keep: hook .claude/hooks/gaurd.py does not exist",
            ),
            (
                "\"gate:file-size\"",
                "\"rule:file-size\"",
                "invariant keep: guard rule:file-size has an unknown prefix; use type:, gate:, lint:, hook: or policy:",
            ),
            (
                "\"perf:latency\"",
                "\"bench:latency\"",
                "invariant keep: check bench:latency has an unknown prefix; use journey:, test:, perf: or manual:",
            ),
            (
                "\"lint:clippy\"",
                "\"clippy\"",
                "invariant keep: guard clippy has no <prefix>:<target>; use type:, gate:, lint:, hook: or policy:",
            ),
            (
                "\"lint:clippy\"",
                "\"lint:rustfmt\"",
                "invariant keep: lint rustfmt: unknown variant `rustfmt`, expected one of `comments`, `prose`, `clippy`, `fmt`",
            ),
            (
                "\"type:app/src/core_viewer.rs#Lease\"",
                "\"type:app/src/core_viewer.rs\"",
                "invariant keep: type:app/src/core_viewer.rs is not type:<path>#<name>",
            ),
            (
                "\"manual:Isaac by ear\"",
                "\"manual:   \"",
                "invariant keep: manual: names nobody",
            ),
        ];
        for (from, to, expected) in seeds {
            let message = broken(from, to);
            assert_eq!(message, expected, "{from} -> {to}");
            assert_eq!(message.lines().count(), 1, "{message}");
        }
    }

    #[test]
    fn a_missing_check_or_owner_needs_a_gap() {
        assert_eq!(
            broken("gap = \"No check yet; DI5 links one.\"\n", ""),
            "invariant tidy: check is empty; add a check link or a gap saying why and which unit closes it\n\
             invariant tidy: owner is unset; add an owner context or a gap saying why"
        );
        assert_eq!(
            broken("gap = \"No check yet; DI5 links one.\"", "gap = \" \""),
            "invariant tidy: gap is empty"
        );
    }

    #[test]
    fn formal_needs_its_why_and_why_needs_formal() {
        assert_eq!(
            broken("formal_why = \"A slot leak the tests missed.\"\n", ""),
            "invariant keep: formal is set; add formal_why naming the defect that justified the model"
        );
        assert_eq!(
            broken("formal = [\"core-viewers:SlotsWithinLimit\"]\n", ""),
            "invariant keep: formal_why is set with no formal link; add the link or remove formal_why"
        );
    }

    #[test]
    fn duplicate_id_names_the_entry() {
        assert!(broken("id = \"tidy\"", "id = \"keep\"").contains("Duplicate id keep"));
        assert!(broken("id = \"other-os\"", "id = \"latency\"").contains("Duplicate id latency"));
    }

    #[test]
    fn unknown_feature_names_the_nearest() {
        assert_eq!(
            broken("[\"vessels\"]", "[\"vessels\", \"vesels\"]"),
            "invariant keep: unknown feature vesels; the nearest is vessels"
        );
    }

    #[test]
    fn retired_and_unknown_fields_name_the_entry() {
        for field in [
            "hurts = \"user\"",
            "checked_by = []",
            "verified_by = \"a person\"",
            "bogus = 1",
        ] {
            let message = broken(
                "source = \"AGENTS.md\"",
                &format!("source = \"AGENTS.md\"\n{field}"),
            );
            let name = field.split(' ').next().unwrap();
            assert!(
                message.starts_with("invariant keep: unknown field"),
                "{message}"
            );
            assert!(message.contains(name), "{message}");
        }
    }

    #[test]
    fn kind_policy_and_confidence_are_closed_sets() {
        assert!(broken("kind = \"user\"", "kind = \"everyone\"").contains("invariant keep"));
        assert!(
            broken("policy:check-loosened", "policy:loosened")
                .contains("unknown variant `loosened`")
        );
        assert!(
            broken("confidence = \"stated\"", "confidence = \"guessed\"")
                .contains("invariant keep")
        );
    }

    #[test]
    fn empty_text_fails_except_measured() {
        assert_eq!(
            broken("says = \"Quit keeps programs.\"", "says = \"\""),
            "invariant keep: says is empty"
        );
        assert_eq!(
            broken("fact = \"Reply time.\"", "fact = \"\""),
            "envelope latency: fact is empty"
        );
        assert_eq!(
            broken(
                "gap = \"No check yet; DI5 links one.\"",
                "gap = \"No check yet; DI5 links one.\"\ntype_gap = \" \""
            ),
            "invariant tidy: type_gap is empty"
        );
    }

    #[test]
    fn every_problem_is_reported_together() {
        let bad = SEED.replacen("[\"vessels\"]", "[\"ghost\"]", 1).replacen(
            "gate:file-size",
            "gate:ghost",
            1,
        );
        assert_eq!(failure(&bad).lines().count(), 2);
    }

    #[test]
    fn target_lists_are_read_from_their_owners() {
        let yaml = "settings:\n  x: 1\nrules:\n  - id: one\n    check: a\n  # note\n  - id: 'two'\nother:\n  - id: three\n";
        assert_eq!(
            listed_ids(yaml, "rules"),
            ["one", "two"].map(String::from).into()
        );
        let cfg = "SPECIFICATION Spec\nINVARIANTS\n    TypeOK\n    Safe\nINVARIANT Alone\nCHECK_DEADLOCK FALSE\n";
        assert_eq!(
            cfg_invariants(cfg),
            ["TypeOK", "Safe", "Alone"].map(String::from).into()
        );
    }

    #[test]
    fn committed_model_passes() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let text = std::fs::read_to_string(root.join(crate::features::REGISTRY)).unwrap();
        let registry = crate::features::Registry::parse(&text).unwrap();
        let ids: BTreeSet<&str> = registry.feature.iter().map(|f| f.id.as_str()).collect();
        load(&root, &ids).unwrap();
    }
}
