use serde_json::Value;
use std::collections::HashSet;
use voyager_contract::layout_document::{READER_LEVEL, layout_schema};

fn resolve<'a>(schema: &'a Value, definitions: &'a Value) -> (&'a Value, Option<&'a str>) {
    if let Some(reference) = schema.get("$ref").and_then(Value::as_str) {
        let name = reference.trim_start_matches("#/definitions/");
        return (resolve(&definitions[name], definitions).0, Some(name));
    }
    match schema
        .get("allOf")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
    {
        Some([only]) => resolve(only, definitions),
        _ => (schema, None),
    }
}

fn options(schema: &Value) -> Option<&Vec<Value>> {
    schema
        .get("oneOf")
        .or_else(|| schema.get("anyOf"))
        .and_then(Value::as_array)
}

struct Pair<'a> {
    new: &'a Value,
    old: &'a Value,
    seen: HashSet<(String, String)>,
}

impl Pair<'_> {
    fn accepts(&mut self, new: &Value, old: &Value, at: &str) -> Result<(), String> {
        let (new_node, new_name) = resolve(new, self.new);
        let (old_node, old_name) = resolve(old, self.old);
        if let (Some(a), Some(b)) = (new_name, old_name)
            && !self.seen.insert((a.to_owned(), b.to_owned()))
        {
            return Ok(());
        }
        if let Some(choices) = options(new_node) {
            return choices.iter().enumerate().try_for_each(|(index, choice)| {
                self.accepts(choice, old_node, &format!("{at}/{index}"))
            });
        }
        if let Some(choices) = options(old_node) {
            let attempts: Vec<_> = choices
                .iter()
                .map(|choice| {
                    let mut trial = Pair {
                        new: self.new,
                        old: self.old,
                        seen: self.seen.clone(),
                    };
                    trial.accepts(new_node, choice, at)
                })
                .collect();
            return if attempts.iter().any(Result::is_ok) {
                Ok(())
            } else {
                let reasons: Vec<String> = attempts.into_iter().filter_map(Result::err).collect();
                Err(format!(
                    "{at}: no option the previous release reads accepts this shape ({})",
                    reasons.join("; ")
                ))
            };
        }
        if let (Some(a), Some(b)) = (new_node.get("const"), old_node.get("const"))
            && a != b
        {
            return Err(format!("{at}: constant {a} was {b}"));
        }
        if let (Some(a), Some(b)) = (
            new_node.get("enum").and_then(Value::as_array),
            old_node.get("enum").and_then(Value::as_array),
        ) && let Some(extra) = a.iter().find(|value| !b.contains(value))
        {
            return Err(format!(
                "{at}: new value {extra} is unknown to the previous release"
            ));
        }
        if let (Some(a), Some(b)) = (new_node.get("type"), old_node.get("type"))
            && a != b
        {
            return Err(format!("{at}: type {a} was {b}"));
        }
        if let Some(old_properties) = old_node.get("properties").and_then(Value::as_object) {
            let empty = serde_json::Map::new();
            let new_properties = new_node
                .get("properties")
                .and_then(Value::as_object)
                .unwrap_or(&empty);
            for (key, old_property) in old_properties {
                if let Some(new_property) = new_properties.get(key) {
                    self.accepts(new_property, old_property, &format!("{at}/{key}"))?;
                }
            }
            let required = |node: &Value| -> Vec<String> {
                node.get("required")
                    .and_then(Value::as_array)
                    .map(|list| {
                        list.iter()
                            .filter_map(Value::as_str)
                            .map(str::to_owned)
                            .collect()
                    })
                    .unwrap_or_default()
            };
            let now = required(new_node);
            if let Some(gone) = required(old_node)
                .into_iter()
                .find(|key| !now.contains(key))
            {
                return Err(format!("{at}: {gone} is no longer always written"));
            }
        }
        if let (Some(a), Some(b)) = (new_node.get("items"), old_node.get("items")) {
            self.accepts(a, b, &format!("{at}/items"))?;
        }
        Ok(())
    }
}

fn compatible(release: &Value) -> Result<(), String> {
    let current = layout_schema();
    let mut definitions = current["definitions"].clone();
    definitions["Layout"] = {
        let mut root = current.clone();
        root.as_object_mut().map(|map| map.remove("definitions"));
        root
    };
    let mut pair = Pair {
        new: &definitions,
        old: &release["definitions"],
        seen: HashSet::new(),
    };
    pair.accepts(
        &serde_json::json!({"$ref": "#/definitions/Layout"}),
        &serde_json::json!({"$ref": "#/definitions/Layout"}),
        "Layout",
    )
}

fn release(level: u64) -> Value {
    let path = format!(
        "{}/tests/layout-release-{level}.schema.json",
        env!("CARGO_MANIFEST_DIR")
    );
    serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap()
}

#[test]
fn the_current_writer_stays_readable_by_every_released_reader_or_raises_the_stamp() {
    for level in 1..=READER_LEVEL {
        let release = release(level);
        assert_eq!(release["readerLevel"], level);
        let result = compatible(&release);
        if level == READER_LEVEL {
            assert_eq!(
                result,
                Ok(()),
                "the stored layout changed in a way reader level {level} cannot read; raise READER_LEVEL, commit its release schema and stamp the document"
            );
        }
    }
}

#[test]
fn a_removed_property_is_caught_against_the_release() {
    let mut changed = release(1);
    changed["definitions"]["Fleet"]["properties"]["legacyTitle"] =
        serde_json::json!({"type":"string"});
    changed["definitions"]["Fleet"]["required"]
        .as_array_mut()
        .unwrap()
        .push("legacyTitle".into());
    let error = compatible(&changed).unwrap_err();
    assert!(
        error.contains("legacyTitle is no longer always written"),
        "{error}"
    );
}

#[test]
fn a_new_variant_is_caught_against_the_release() {
    let mut changed = release(1);
    let split = changed["definitions"]["Split"]["oneOf"]
        .as_array_mut()
        .unwrap();
    split.pop();
    let error = compatible(&changed).unwrap_err();
    assert!(error.contains("no option"), "{error}");
}

#[test]
fn a_breaking_change_under_the_canvas_is_caught_against_the_release() {
    let renamed = {
        let mut changed = release(1);
        let canvas = &mut changed["definitions"]["Canvas"];
        canvas["properties"]["tree"] = canvas["properties"]["root"].take();
        canvas["properties"].as_object_mut().unwrap().remove("root");
        canvas["required"] = serde_json::json!(["tree"]);
        changed
    };
    let region = {
        let mut changed = release(1);
        changed["definitions"]["Region"]["enum"]
            .as_array_mut()
            .unwrap()
            .pop();
        changed
    };
    let size = {
        let mut changed = release(1);
        changed["definitions"]["Size"]["oneOf"]
            .as_array_mut()
            .unwrap()
            .pop();
        changed
    };
    let node = {
        let mut changed = release(1);
        changed["definitions"]["Node"]["oneOf"]
            .as_array_mut()
            .unwrap()
            .pop();
        changed
    };
    for (name, changed) in [
        ("renamed Canvas.root", renamed),
        ("new Region value", region),
        ("new Size variant", size),
        ("new Node variant", node),
    ] {
        assert!(compatible(&changed).is_err(), "{name} passed");
    }
}

#[test]
fn every_keyword_the_layout_schema_uses_is_one_the_walkers_follow() {
    const FOLLOWED: [&str; 18] = [
        "$schema",
        "$ref",
        "additionalProperties",
        "allOf",
        "anyOf",
        "const",
        "default",
        "definitions",
        "enum",
        "items",
        "maximum",
        "minimum",
        "oneOf",
        "properties",
        "required",
        "title",
        "type",
        "description",
    ];
    fn check(node: &Value, at: &str, unknown: &mut Vec<String>) {
        match node {
            Value::Object(map) => {
                for (key, child) in map {
                    let here = format!("{at}/{key}");
                    if !FOLLOWED.contains(&key.as_str()) {
                        unknown.push(here);
                        continue;
                    }
                    match key.as_str() {
                        "properties" | "definitions" => {
                            for (name, schema) in child.as_object().into_iter().flatten() {
                                check(schema, &format!("{here}/{name}"), unknown);
                            }
                        }
                        "default" | "const" | "enum" | "required" => {}
                        "allOf" => {
                            let members = child.as_array().map_or(0, Vec::len);
                            if members != 1 {
                                unknown.push(format!("{here} has {members} members"));
                            }
                            check(child, &here, unknown);
                        }
                        _ => check(child, &here, unknown),
                    }
                }
            }
            Value::Array(items) => {
                for (index, item) in items.iter().enumerate() {
                    check(item, &format!("{at}/{index}"), unknown);
                }
            }
            _ => {}
        }
    }
    let mut unknown = Vec::new();
    check(&layout_schema(), "", &mut unknown);
    assert!(
        unknown.is_empty(),
        "the Layout schema uses shapes the reader and the writer-rule test do not follow: {unknown:?}"
    );
}
