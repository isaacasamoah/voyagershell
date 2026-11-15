use crate::Layout;
use schemars::generate::SchemaSettings;
use serde::Deserialize;
use serde_json::{Map, Value};
use std::sync::OnceLock;

pub const DOCUMENT: &str = "voyager-layout-v2";
pub const LEGACY_DOCUMENT: &str = "voyager-layout-v1";
pub const BACKUP: &str = "voyager-layout-backup";
pub const READER_LEVEL: u64 = 1;

const MIN_READER: &str = "minReader";

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Kept {
    grafts: Vec<Graft>,
    min_reader: Option<u64>,
}

impl Kept {
    pub fn is_empty(&self) -> bool {
        self.grafts.is_empty() && self.min_reader.is_none()
    }

    pub fn fields(&self) -> usize {
        self.grafts.len()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Graft {
    anchor: Option<String>,
    path: Vec<String>,
    key: String,
    value: Value,
}

#[derive(Debug)]
pub enum Reading {
    Open { layout: Box<Layout>, kept: Kept },
    Newer { min_reader: u64 },
    Unreadable { message: String },
}

pub fn read(raw: Value) -> Reading {
    read_at(raw, READER_LEVEL)
}

pub fn read_at(mut raw: Value, level: u64) -> Reading {
    let min_reader = match raw
        .as_object_mut()
        .and_then(|document| document.remove(MIN_READER))
    {
        None => None,
        Some(stamp) => match stamp.as_u64() {
            Some(stamp) => Some(stamp),
            None => {
                return Reading::Unreadable {
                    message: format!("minReader must be a whole number, found {stamp}"),
                };
            }
        },
    };
    if let Some(stamp) = min_reader.filter(|stamp| *stamp > level) {
        return Reading::Newer { min_reader: stamp };
    }
    let min_reader = min_reader.filter(|stamp| *stamp > 1);
    match Layout::deserialize(&raw) {
        Ok(layout) => Reading::Open {
            layout: Box::new(layout),
            kept: Kept {
                grafts: Vec::new(),
                min_reader,
            },
        },
        Err(strict) => {
            let grafts = strip(&mut raw);
            if grafts.is_empty() {
                return Reading::Unreadable {
                    message: strict.to_string(),
                };
            }
            match Layout::deserialize(&raw) {
                Ok(layout) => Reading::Open {
                    layout: Box::new(layout),
                    kept: Kept { grafts, min_reader },
                },
                Err(error) => Reading::Unreadable {
                    message: error.to_string(),
                },
            }
        }
    }
}

pub fn write(layout: &Layout, kept: &Kept) -> Result<Value, serde_json::Error> {
    let mut value = serde_json::to_value(layout)?;
    for item in &kept.grafts {
        let base = match &item.anchor {
            None => Some(&mut value),
            Some(id) => find_id(&mut value, id),
        };
        if let Some(Value::Object(map)) = base.and_then(|base| descend(base, &item.path)) {
            map.entry(item.key.clone())
                .or_insert_with(|| item.value.clone());
        }
    }
    if let (Some(min_reader), Some(document)) = (kept.min_reader, value.as_object_mut()) {
        document.insert(MIN_READER.into(), min_reader.into());
    }
    Ok(value)
}

pub fn import_legacy(mut raw: Value) -> Value {
    let Some(document) = raw.as_object_mut() else {
        return raw;
    };
    rename(document, "contents", "vessels");
    rename(document, "savedLayouts", "arrangements");
    if let Some(home) = document.get_mut("home") {
        import_voyage(home);
    }
    for voyage in array(document, "voyages") {
        import_voyage(voyage);
    }
    raw
}

fn import_voyage(voyage: &mut Value) {
    let Some(voyage) = voyage.as_object_mut() else {
        return;
    };
    rename(voyage, "primaryVessel", "primaryPlacement");
    for fleet in array(voyage, "fleets") {
        if let Some(fleet) = fleet.as_object_mut() {
            rename(fleet, "vessels", "placements");
            for placement in array(fleet, "placements") {
                import_placement(placement);
            }
        }
    }
    for placement in array(voyage, "portals") {
        import_placement(placement);
    }
}

fn import_placement(placement: &mut Value) {
    if let Some(placement) = placement.as_object_mut() {
        rename(placement, "content", "vessel");
    }
}

fn rename(map: &mut Map<String, Value>, from: &str, to: &str) {
    if !map.contains_key(to)
        && let Some(value) = map.remove(from)
    {
        map.insert(to.into(), value);
    }
}

fn array<'a>(map: &'a mut Map<String, Value>, key: &str) -> impl Iterator<Item = &'a mut Value> {
    map.get_mut(key)
        .and_then(Value::as_array_mut)
        .into_iter()
        .flatten()
}

fn schema() -> &'static Value {
    static SCHEMA: OnceLock<Value> = OnceLock::new();
    SCHEMA.get_or_init(|| {
        let root = SchemaSettings::draft07()
            .into_generator()
            .into_root_schema_for::<Layout>();
        serde_json::to_value(root).unwrap_or(Value::Null)
    })
}

pub fn layout_schema() -> Value {
    schema().clone()
}

fn strip(raw: &mut Value) -> Vec<Graft> {
    let root = schema();
    let definitions = &root["definitions"];
    let mut grafts = Vec::new();
    walk(raw, root, definitions, None, &mut Vec::new(), &mut grafts);
    grafts
}

fn resolve<'a>(schema: &'a Value, definitions: &'a Value) -> &'a Value {
    if let Some(reference) = schema.get("$ref").and_then(Value::as_str) {
        return resolve(
            &definitions[reference.trim_start_matches("#/definitions/")],
            definitions,
        );
    }
    match schema
        .get("allOf")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
    {
        Some([only]) => resolve(only, definitions),
        _ => schema,
    }
}

fn branch<'a>(raw: &Value, schema: &'a Value, definitions: &'a Value) -> Option<&'a Value> {
    let schema = resolve(schema, definitions);
    let Some(options) = schema
        .get("oneOf")
        .or_else(|| schema.get("anyOf"))
        .and_then(Value::as_array)
    else {
        return Some(schema);
    };
    options.iter().find_map(|option| {
        let option = branch(raw, option, definitions)?;
        let tag = option
            .pointer("/properties/kind")
            .and_then(|kind| kind.get("const").or_else(|| kind.pointer("/enum/0")));
        match tag {
            Some(tag) => (raw.get("kind") == Some(tag)).then_some(option),
            None => {
                let fits = match option.get("type").and_then(Value::as_str) {
                    Some("null") => raw.is_null(),
                    Some("object") => raw.is_object(),
                    Some("array") => raw.is_array(),
                    Some(_) => !raw.is_object() && !raw.is_array(),
                    None => true,
                };
                fits.then_some(option)
            }
        }
    })
}

fn walk(
    raw: &mut Value,
    schema: &Value,
    definitions: &Value,
    anchor: Option<String>,
    path: &mut Vec<String>,
    out: &mut Vec<Graft>,
) {
    let Some(schema) = branch(raw, schema, definitions) else {
        return;
    };
    match raw {
        Value::Object(map) => {
            let own = map
                .get("id")
                .and_then(Value::as_str)
                .filter(|_| !map.contains_key("kind"))
                .map(str::to_owned);
            let (anchor, mut local) = match own {
                Some(id) => (Some(id), Vec::new()),
                None => (anchor, path.clone()),
            };
            let properties = schema.get("properties").and_then(Value::as_object);
            let closed = schema.get("additionalProperties") == Some(&Value::Bool(false));
            let unknown: Vec<String> = map
                .keys()
                .filter(|key| closed && !properties.is_some_and(|known| known.contains_key(*key)))
                .cloned()
                .collect();
            for key in unknown {
                if let Some(value) = map.remove(&key) {
                    out.push(Graft {
                        anchor: anchor.clone(),
                        path: local.clone(),
                        key,
                        value,
                    });
                }
            }
            if let Some(properties) = properties {
                for (key, value) in map.iter_mut() {
                    if let Some(child) = properties.get(key) {
                        local.push(key.clone());
                        walk(value, child, definitions, anchor.clone(), &mut local, out);
                        local.pop();
                    }
                }
            }
        }
        Value::Array(items) => {
            if let Some(element) = schema.get("items") {
                for (index, item) in items.iter_mut().enumerate() {
                    path.push(index.to_string());
                    walk(item, element, definitions, anchor.clone(), path, out);
                    path.pop();
                }
            }
        }
        _ => {}
    }
}

fn descend<'a>(target: &'a mut Value, path: &[String]) -> Option<&'a mut Value> {
    let Some((step, rest)) = path.split_first() else {
        return Some(target);
    };
    let next = match target {
        Value::Object(map) => map.get_mut(step),
        Value::Array(items) => step
            .parse::<usize>()
            .ok()
            .and_then(|index| items.get_mut(index)),
        _ => None,
    }?;
    descend(next, rest)
}

fn find_id<'a>(value: &'a mut Value, id: &str) -> Option<&'a mut Value> {
    if value.get("id").and_then(Value::as_str) == Some(id) && value.get("kind").is_none() {
        return Some(value);
    }
    match value {
        Value::Object(map) => map.values_mut().find_map(|child| find_id(child, id)),
        Value::Array(items) => items.iter_mut().find_map(|child| find_id(child, id)),
        _ => None,
    }
}
