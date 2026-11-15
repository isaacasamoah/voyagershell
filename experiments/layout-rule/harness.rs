use crate::client::open as trunk_open;
use crate::core::Error;
use crate::workspace::Model;
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::fmt::Write as _;
use voyager_contract::{
    Action, ContentDestination, FleetId, Layout, PanelInsertion, PanelOwner, PlacementId,
    RenameTarget,
};

const DOC: &str = "voyager-layout-v1";
const DOC_NEXT: &str = "voyager-layout-v2";
const BACKUP: &str = "voyager-layout-backup";
const CWD: &str = "/work";
const RENAMED: &str = "Renamed by older build";

#[derive(Clone, Default)]
struct Store {
    docs: BTreeMap<String, (u64, Value)>,
}

impl Store {
    fn get(&self, name: &str) -> (u64, Value) {
        self.docs.get(name).cloned().unwrap_or((0, Value::Null))
    }

    fn set(&mut self, name: &str, value: Value, expected: u64) -> Result<u64, String> {
        let (current, _) = self.get(name);
        if current != expected {
            return Err(format!("version conflict on {name}"));
        }
        self.docs.insert(name.into(), (current + 1, value));
        Ok(current + 1)
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Corrupt {
    Refuse,
    BackupAndFresh,
}

enum Opened {
    Open {
        layout: Layout,
        version: u64,
        keep: Keep,
        note: Option<String>,
    },
    Refused {
        message: String,
    },
}

#[derive(Clone, Default)]
struct Keep {
    residue: Vec<Graft>,
    min_reader: Option<u64>,
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum Rule {
    Direct,
    Format,
    Graft,
    Gate,
}

impl Rule {
    fn name(self) -> &'static str {
        match self {
            Rule::Direct => "direct",
            Rule::Format => "A format",
            Rule::Graft => "B2 boundary graft",
            Rule::Gate => "C graft + minReader",
        }
    }

    fn open(self, store: &mut Store, corrupt: Corrupt) -> Opened {
        let (version, raw) = store.get(DOC);
        match self {
            Rule::Direct => match trunk_open(raw, CWD) {
                Ok((layout, _)) => Opened::Open {
                    layout,
                    version,
                    keep: Keep::default(),
                    note: None,
                },
                Err(error) => Opened::Refused {
                    message: message(error),
                },
            },
            Rule::Format => {
                let mut raw = raw;
                let format = take_u64(&mut raw, "format").unwrap_or(0);
                if format > 1 {
                    return Opened::Refused {
                        message: format!("written by a newer build (format {format})"),
                    };
                }
                parsed(store, version, raw, corrupt, Keep::default())
            }
            Rule::Graft => {
                let mut raw = raw;
                let residue = strip(&mut raw);
                parsed(
                    store,
                    version,
                    raw,
                    corrupt,
                    Keep {
                        residue,
                        min_reader: None,
                    },
                )
            }
            Rule::Gate => {
                let mut raw = raw;
                let min_reader = take_u64(&mut raw, "minReader");
                if min_reader.unwrap_or(0) > 1 {
                    return Opened::Refused {
                        message: format!(
                            "written by a newer build (minReader {})",
                            min_reader.unwrap_or(0)
                        ),
                    };
                }
                let residue = strip(&mut raw);
                parsed(
                    store,
                    version,
                    raw,
                    corrupt,
                    Keep {
                        residue,
                        min_reader,
                    },
                )
            }
        }
    }

    fn save(self, store: &mut Store, layout: &Layout, keep: &Keep, version: u64) -> Result<u64, String> {
        let mut value = serde_json::to_value(layout).map_err(|e| e.to_string())?;
        match self {
            Rule::Direct => {}
            Rule::Format => {
                value["format"] = json!(1);
            }
            Rule::Graft => graft(&mut value, &keep.residue),
            Rule::Gate => {
                graft(&mut value, &keep.residue);
                if let Some(min_reader) = keep.min_reader {
                    value["minReader"] = json!(min_reader);
                }
            }
        }
        store.set(DOC, value, version)
    }
}

fn message(error: Error) -> String {
    match error {
        Error::Rejected { message, .. } | Error::Uncertain(message) => message,
    }
}

fn take_u64(raw: &mut Value, key: &str) -> Option<u64> {
    raw.as_object_mut()?.remove(key)?.as_u64()
}

fn parsed(store: &mut Store, version: u64, raw: Value, corrupt: Corrupt, keep: Keep) -> Opened {
    match trunk_open(raw.clone(), CWD) {
        Ok((layout, _)) => Opened::Open {
            layout,
            version,
            keep,
            note: None,
        },
        Err(error) => {
            let error = message(error);
            let (backup_version, _) = store.get(BACKUP);
            let (_, original) = store.get(DOC);
            if store.set(BACKUP, original, backup_version).is_err() {
                return Opened::Refused {
                    message: format!("{error}; backup failed, nothing changed"),
                };
            }
            match corrupt {
                Corrupt::Refuse => Opened::Refused {
                    message: format!("{error}; kept a backup in {BACKUP}"),
                },
                Corrupt::BackupAndFresh => match trunk_open(Value::Null, CWD) {
                    Ok((layout, _)) => Opened::Open {
                        layout: crate::client::prepared(layout, CWD).unwrap(),
                        version,
                        keep: Keep::default(),
                        note: Some(format!("{error}; started fresh, backup in {BACKUP}")),
                    },
                    Err(error) => Opened::Refused {
                        message: message(error),
                    },
                },
            }
        }
    }
}

#[derive(Clone, Debug)]
struct Graft {
    anchor: Option<String>,
    path: Vec<String>,
    key: String,
    value: Value,
}

fn strip(raw: &mut Value) -> Vec<Graft> {
    let schema: Value = serde_json::from_str(include_str!("../../contract/generated/response.schema.json")).unwrap();
    let defs = schema["definitions"].clone();
    let mut out = Vec::new();
    walk(raw, &defs["Layout"], &defs, None, &mut Vec::new(), &mut out);
    out
}

fn resolve<'a>(schema: &'a Value, defs: &'a Value) -> &'a Value {
    match schema.get("$ref").and_then(Value::as_str) {
        Some(reference) => resolve(&defs[reference.trim_start_matches("#/definitions/")], defs),
        None => schema,
    }
}

fn branch<'a>(raw: &Value, schema: &'a Value, defs: &'a Value) -> Option<&'a Value> {
    let schema = resolve(schema, defs);
    let Some(options) = schema.get("oneOf").or_else(|| schema.get("anyOf")).and_then(Value::as_array) else {
        return Some(schema);
    };
    options.iter().map(|o| resolve(o, defs)).find_map(|option| {
        let option = branch(raw, option, defs)?;
        let kind = option.pointer("/properties/kind");
        let tag = kind.and_then(|k| k.get("const").or_else(|| k.pointer("/enum/0")));
        let typed = match option.get("type").and_then(Value::as_str) {
            Some("null") => raw.is_null(),
            Some("object") => raw.is_object(),
            Some("array") => raw.is_array(),
            Some("string") => raw.is_string(),
            Some(_) => !raw.is_object() && !raw.is_array(),
            None => true,
        };
        match tag {
            Some(tag) => (raw.get("kind") == Some(tag)).then_some(option),
            None => typed.then_some(option),
        }
    })
}

fn walk(raw: &mut Value, schema: &Value, defs: &Value, anchor: Option<String>, path: &mut Vec<String>, out: &mut Vec<Graft>) {
    let Some(schema) = branch(raw, schema, defs) else { return };
    match raw {
        Value::Object(map) => {
            let (anchor, mut local) = match map.get("id").and_then(Value::as_str).filter(|_| !map.contains_key("kind")) {
                Some(id) => (Some(id.to_owned()), Vec::new()),
                None => (anchor, path.clone()),
            };
            let properties = schema.get("properties").and_then(Value::as_object);
            let closed = schema.get("additionalProperties") == Some(&Value::Bool(false));
            let unknown: Vec<String> = map
                .keys()
                .filter(|k| closed && !properties.is_some_and(|p| p.contains_key(*k)))
                .cloned()
                .collect();
            for key in unknown {
                let value = map.remove(&key).unwrap();
                out.push(Graft { anchor: anchor.clone(), path: local.clone(), key, value });
            }
            if let Some(properties) = properties {
                for (key, value) in map.iter_mut() {
                    if let Some(child) = properties.get(key) {
                        local.push(key.clone());
                        walk(value, child, defs, anchor.clone(), &mut local, out);
                        local.pop();
                    }
                }
            }
        }
        Value::Array(list) => {
            if let Some(items) = schema.get("items") {
                for (index, item) in list.iter_mut().enumerate() {
                    path.push(index.to_string());
                    walk(item, items, defs, anchor.clone(), path, out);
                    path.pop();
                }
            }
        }
        _ => {}
    }
}

fn graft(value: &mut Value, residue: &[Graft]) {
    for item in residue {
        let base = match &item.anchor {
            None => Some(&mut *value),
            Some(id) => find_id(value, id),
        };
        if let Some(Value::Object(map)) = base.and_then(|base| descend(base, &item.path)) {
            map.entry(item.key.clone()).or_insert_with(|| item.value.clone());
        }
    }
}

fn descend<'a>(target: &'a mut Value, path: &[String]) -> Option<&'a mut Value> {
    let Some((step, rest)) = path.split_first() else {
        return Some(target);
    };
    let next = match target {
        Value::Object(map) => map.get_mut(step),
        Value::Array(list) => step.parse::<usize>().ok().and_then(|i| list.get_mut(i)),
        _ => None,
    }?;
    descend(next, rest)
}

fn find_id<'a>(value: &'a mut Value, id: &str) -> Option<&'a mut Value> {
    let here = value.get("id").and_then(Value::as_str) == Some(id) && value.get("kind").is_none();
    if here {
        return Some(value);
    }
    match value {
        Value::Object(map) => map.values_mut().find_map(|child| find_id(child, id)),
        Value::Array(list) => list.iter_mut().find_map(|child| find_id(child, id)),
        _ => None,
    }
}

fn baseline() -> Value {
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "Work".into(),
            cwd: CWD.into(),
        })
        .unwrap();
    let voyage = model.layout.voyages[0].id.clone();
    model
        .apply(Action::CreateFleet {
            voyage,
            name: "Second".into(),
        })
        .unwrap();
    let layout = crate::client::prepared(model.layout, CWD).unwrap();
    serde_json::to_value(layout).unwrap()
}

struct Scenario {
    name: &'static str,
    class: Class,
    edit: fn(&mut Value),
    probes: &'static [&'static str],
}

#[derive(Clone, Copy, PartialEq)]
enum Class {
    Additive,
    SameShape,
    Variant,
    Corrupt,
}

fn scenarios() -> Vec<Scenario> {
    vec![
        Scenario {
            name: "field on Fleet",
            class: Class::Additive,
            edit: |v| v["voyages"][0]["fleets"][0]["pinned"] = json!(true),
            probes: &["/voyages/0/fleets/0/pinned"],
        },
        Scenario {
            name: "field on Layout",
            class: Class::Additive,
            edit: |v| v["navigation"] = json!({"lastFleet": "fleet-x"}),
            probes: &["/navigation"],
        },
        Scenario {
            name: "field on Vessel",
            class: Class::Additive,
            edit: |v| v["voyages"][0]["fleets"][0]["vessels"][0]["badge"] = json!("agent"),
            probes: &["/voyages/0/fleets/0/vessels/0/badge"],
        },
        Scenario {
            name: "field on Content",
            class: Class::Additive,
            edit: |v| v["contents"][0]["revision"] = json!(7),
            probes: &["/contents/0/revision"],
        },
        Scenario {
            name: "new Vessel type",
            class: Class::SameShape,
            edit: |v| {
                v["contents"].as_array_mut().unwrap().push(json!({
                    "id": "content-900", "typeId": "git-graph", "cwd": CWD, "backend": null,
                    "configuration": {"repo": ".", "branches": ["main"]}
                }));
                v["voyages"][0]["fleets"][0]["vessels"].as_array_mut().unwrap().push(json!({
                    "id": "placement-900", "content": "content-900", "name": "Graph"
                }));
                let root = v["voyages"][0]["fleets"][0]["root"].take();
                v["voyages"][0]["fleets"][0]["root"] = json!({
                    "kind": "branch", "axis": "horizontal", "share": 5000,
                    "first": root, "second": {"kind": "leaf", "placement": "placement-900"}
                });
            },
            probes: &["/contents/2", "/voyages/0/fleets/0/vessels/1"],
        },
        Scenario {
            name: "new Vessel type with a new Content field",
            class: Class::Additive,
            edit: |v| {
                v["contents"].as_array_mut().unwrap().push(json!({
                    "id": "content-900", "typeId": "git-graph", "cwd": CWD, "backend": null,
                    "configuration": {"repo": "."}, "packageVersion": "1.2.0"
                }));
                v["voyages"][0]["fleets"][0]["vessels"].as_array_mut().unwrap().push(json!({
                    "id": "placement-900", "content": "content-900", "name": "Graph"
                }));
                let root = v["voyages"][0]["fleets"][0]["root"].take();
                v["voyages"][0]["fleets"][0]["root"] = json!({
                    "kind": "branch", "axis": "horizontal", "share": 5000,
                    "first": root, "second": {"kind": "leaf", "placement": "placement-900"}
                });
            },
            probes: &["/contents/2/packageVersion", "/voyages/0/fleets/0/vessels/1"],
        },
        Scenario {
            name: "new Context kind",
            class: Class::Variant,
            edit: |v| v["context"] = json!({"kind": "agent", "id": "agent-1"}),
            probes: &["/context"],
        },
        Scenario {
            name: "new Split kind",
            class: Class::Variant,
            edit: |v| {
                let root = v["voyages"][0]["fleets"][1]["root"].take();
                v["voyages"][0]["fleets"][1]["root"] = json!({"kind": "tabs", "children": [root]});
            },
            probes: &["/voyages/0/fleets/1/root"],
        },
        Scenario {
            name: "corrupt wrong type",
            class: Class::Corrupt,
            edit: |v| v["voyages"] = json!(3),
            probes: &[],
        },
        Scenario {
            name: "truncated object",
            class: Class::Corrupt,
            edit: |v| {
                let voyage = v["voyages"][0].as_object_mut().unwrap();
                voyage.remove("fleets");
                voyage.remove("portals");
                v.as_object_mut().unwrap().remove("nextId");
            },
            probes: &[],
        },
        Scenario {
            name: "truncated text",
            class: Class::Corrupt,
            edit: |v| {
                let text = serde_json::to_string(v).unwrap();
                *v = Value::String(text[..text.len() / 2].to_owned());
            },
            probes: &[],
        },
        Scenario {
            name: "corrupt known variant",
            class: Class::Corrupt,
            edit: |v| v["voyages"][0]["fleets"][1]["root"] = json!({"kind": "leaf"}),
            probes: &[],
        },
        Scenario {
            name: "misspelled optional field",
            class: Class::Corrupt,
            edit: |v| v["voyages"][0]["fleets"][0]["vessels"][0]["hiden"] = json!(true),
            probes: &[],
        },
    ]
}

fn newer(rule: Rule, scenario: &Scenario) -> Value {
    let mut value = baseline();
    (scenario.edit)(&mut value);
    let breaking = scenario.class != Class::SameShape;
    if !value.is_object() {
        return value;
    }
    match rule {
        Rule::Format if breaking && scenario.class != Class::Corrupt => {
            value["format"] = json!(2);
        }
        Rule::Format => value["format"] = json!(1),
        Rule::Gate if scenario.class == Class::Variant => value["minReader"] = json!(2),
        _ => {}
    }
    value
}

fn rename_fleet(layout: Layout) -> Result<Layout, String> {
    let mut model = Model { layout };
    if model.layout.voyages.is_empty() {
        model.apply(Action::CreateVoyage {
            name: "Voyager".into(),
            cwd: CWD.into(),
        })?;
    }
    let fleet = model.layout.voyages[0].fleets[0].id.clone();
    model.apply(Action::Rename {
        target: RenameTarget::Fleet { id: fleet },
        name: RENAMED.into(),
    })?;
    Ok(model.layout)
}

fn diffs(before: &Value, after: &Value, at: String, out: &mut Vec<String>) {
    match (before, after) {
        (Value::Object(a), Value::Object(b)) => {
            for key in a.keys().chain(b.keys().filter(|k| !a.contains_key(*k))) {
                diffs(
                    a.get(key).unwrap_or(&Value::Null),
                    b.get(key).unwrap_or(&Value::Null),
                    format!("{at}/{key}"),
                    out,
                );
            }
        }
        (Value::Array(a), Value::Array(b)) if a.len() == b.len() => {
            for (i, (x, y)) in a.iter().zip(b).enumerate() {
                diffs(x, y, format!("{at}/{i}"), out);
            }
        }
        (a, b) if a != b => out.push(at),
        _ => {}
    }
}

fn changed(before: &Value, after: &Value) -> Vec<String> {
    let mut out = Vec::new();
    diffs(before, after, String::new(), &mut out);
    out.retain(|p| !matches!(p.as_str(), "/format" | "/minReader"));
    out
}

struct Row {
    rule: &'static str,
    corrupt: &'static str,
    scenario: &'static str,
    opened: String,
    survived: String,
    extra: String,
    newer_doc: String,
    backup: String,
}

fn run(rule: Rule, corrupt: Corrupt, scenario: &Scenario, norm: &[String]) -> Row {
    let doc = newer(rule, scenario);
    let mut store = Store::default();
    store.set(DOC, doc.clone(), 0).unwrap();
    let opened = rule.open(&mut store, corrupt);
    let (opened_text, survived, extra) = match opened {
        Opened::Refused { message } => (format!("refused: {}", short(&message)), "n/a".into(), "n/a".into()),
        Opened::Open {
            layout,
            version,
            keep,
            note,
        } => {
            let opened_text = match note {
                Some(note) => format!("fresh: {}", short(&note)),
                None => "opened".into(),
            };
            match rename_fleet(layout).and_then(|l| rule.save(&mut store, &l, &keep, version)) {
                Err(error) => (opened_text, format!("save failed: {error}"), "n/a".into()),
                Ok(_) => {
                    let stored = store.get(DOC).1;
                    let kept = scenario
                        .probes
                        .iter()
                        .filter(|p| stored.pointer(p) == doc.pointer(p))
                        .count();
                    let mut extra: Vec<String> = changed(&doc, &stored)
                        .into_iter()
                        .filter(|p| !norm.contains(p))
                        .collect();
                    extra.truncate(4);
                    (
                        opened_text,
                        format!("{kept}/{}", scenario.probes.len()),
                        if extra.is_empty() { "none".into() } else { extra.join(" ") },
                    )
                }
            }
        }
    };
    let final_doc = store.get(DOC).1;
    let backup = store.get(BACKUP).1;
    Row {
        rule: rule.name(),
        corrupt: match corrupt {
            Corrupt::Refuse => "refuse",
            Corrupt::BackupAndFresh => "fresh",
        },
        scenario: scenario.name,
        opened: opened_text,
        survived,
        extra,
        newer_doc: if final_doc == doc { "untouched".into() } else { "rewritten".into() },
        backup: if backup == doc {
            "exact copy".into()
        } else if backup.is_null() {
            "none".into()
        } else {
            "differs".into()
        },
    }
}

fn short(text: &str) -> String {
    text.chars().take(70).collect()
}

fn normalization(rule: Rule) -> Vec<String> {
    let doc = newer(rule, &Scenario {
        name: "baseline",
        class: Class::SameShape,
        edit: |_| {},
        probes: &[],
    });
    let mut store = Store::default();
    store.set(DOC, doc.clone(), 0).unwrap();
    match rule.open(&mut store, Corrupt::Refuse) {
        Opened::Open { layout, version, keep, .. } => {
            let layout = rename_fleet(layout).unwrap();
            rule.save(&mut store, &layout, &keep, version).unwrap();
            changed(&doc, &store.get(DOC).1)
        }
        Opened::Refused { message } => panic!("baseline refused under {}: {message}", rule.name()),
    }
}

#[test]
fn layout_rule_matrix() {
    let contract = std::env::var("LAYOUT_RULE_CONTRACT").unwrap_or_else(|_| "unlabelled".into());
    let mut out = String::new();
    writeln!(out, "contract\trule\tcorrupt-policy\tscenario\topen\tnew-data-kept-after-older-save\tunexpected-changes\tmain-doc-after\tbackup").unwrap();
    for rule in [Rule::Direct, Rule::Format, Rule::Graft, Rule::Gate] {
        let norm = normalization(rule);
        for corrupt in [Corrupt::Refuse, Corrupt::BackupAndFresh] {
            if rule == Rule::Direct && corrupt == Corrupt::BackupAndFresh {
                continue;
            }
            for scenario in scenarios() {
                let row = run(rule, corrupt, &scenario, &norm);
                writeln!(
                    out,
                    "{contract}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                    row.rule, row.corrupt, row.scenario, row.opened, row.survived, row.extra, row.newer_doc, row.backup
                )
                .unwrap();
            }
        }
    }
    println!("{out}");
    if let Ok(path) = std::env::var("LAYOUT_RULE_OUT") {
        std::fs::write(path, &out).unwrap();
    }
}

#[test]
fn layout_rule_fork_under_document_rename() {
    let mut store = Store::default();
    let older = baseline();
    store.set(DOC, older.clone(), 0).unwrap();
    let (_, v1) = store.get(DOC);
    let mut next = v1.clone();
    next["voyages"][0]["fleets"][0]["pinned"] = json!(true);
    store.set(DOC_NEXT, next, 0).unwrap();
    let newer_rename = |store: &mut Store, name: &str| {
        let (version, mut value) = store.get(DOC_NEXT);
        value["voyages"][0]["fleets"][0]["name"] = json!(name);
        store.set(DOC_NEXT, value, version).unwrap();
    };
    newer_rename(&mut store, "Renamed by newer build");
    let (version, raw) = store.get(DOC);
    let (layout, _) = trunk_open(raw, CWD).map_err(message).unwrap();
    let older_sees = layout.voyages[0].fleets[0].name.clone();
    let layout = rename_fleet(layout).unwrap();
    store
        .set(DOC, serde_json::to_value(&layout).unwrap(), version)
        .unwrap();
    let newer_sees = store.get(DOC_NEXT).1["voyages"][0]["fleets"][0]["name"].clone();
    let older_after = store.get(DOC).1["voyages"][0]["fleets"][0]["name"].clone();
    println!(
        "fork\tolder build sees {older_sees:?} after the newer rename\tnewer build sees {newer_sees} after the older rename\tv1 now holds {older_after}"
    );
}

#[test]
fn layout_rule_move_between_fleets() {
    for rule in [Rule::Direct, Rule::Graft] {
        let mut doc = baseline();
        doc["voyages"][0]["fleets"][0]["vessels"][0]["badge"] = json!("agent");
        let id = doc["voyages"][0]["fleets"][0]["vessels"][0]["id"].as_str().unwrap().to_owned();
        let mut store = Store::default();
        store.set(DOC, doc, 0).unwrap();
        let Opened::Open { layout, version, keep, .. } = rule.open(&mut store, Corrupt::Refuse) else {
            println!("move\t{}\trefused", rule.name());
            continue;
        };
        let target = layout.voyages[0].fleets[1].id.clone();
        let beside = layout.voyages[0].fleets[1].vessels[0].id.clone();
        let mut model = Model { layout };
        let moved = model
            .apply(Action::SetPanelHidden { id: PlacementId(id.clone()), hidden: true })
            .and_then(|_| {
                model.apply(Action::ReopenPanel {
                    id: PlacementId(id.clone()),
                    destination: ContentDestination::Panel {
                        owner: PanelOwner::Fleet { id: target.clone() },
                        insertion: PanelInsertion::Beside { id: beside.clone(), side: voyager_contract::Side::Right },
                    },
                })
            });
        if let Err(error) = moved {
            println!("move\t{}\tmove refused: {error}", rule.name());
            continue;
        }
        rule.save(&mut store, &model.layout, &keep, version).unwrap();
        let stored = store.get(DOC).1;
        let fleet = stored["voyages"][0]["fleets"]
            .as_array()
            .unwrap()
            .iter()
            .find(|f| f["vessels"].as_array().unwrap().iter().any(|v| v["id"] == json!(id)))
            .map(|f| f["id"].clone());
        let badge = find_id(&mut stored.clone(), &id).map(|v| v["badge"].clone());
        println!("move\t{}\tvessel now in {fleet:?} (target {:?})\tbadge {badge:?}", rule.name(), target.0);
        let _ = FleetId(String::new());
    }
}
