use super::{
    Registry,
    check::Environment,
    problem::{Problem, valid_type_id},
    read::{load, read},
};
use serde_json::{Value, json};
use std::{fs, path::Path, time::Duration};

fn checklist() -> Value {
    json!({
        "contract": 1,
        "id": "checklist",
        "name": "Checklist",
        "version": 2,
        "state": {
            "schema": {
                "type": "object", "additionalProperties": false,
                "required": ["title", "items"],
                "properties": {
                    "title": {"type": "string"},
                    "items": {"type": "array", "items": {
                        "type": "object", "additionalProperties": false,
                        "required": ["id", "text", "done"],
                        "properties": {
                            "id": {"type": "string"},
                            "text": {"type": "string"},
                            "done": {"type": "boolean"},
                            "due": {"type": ["string", "null"]}
                        }
                    }}
                }
            },
            "initial": {"title": "Checklist", "items": []},
            "migrations": [{"from": 1, "set": {"items[*].due": null}}]
        },
        "local": {
            "schema": {"type": "object", "properties": {"showDone": {"type": "boolean"}}},
            "initial": {"showDone": true}
        },
        "concurrency": {"default": "turns", "merge": ["title"]},
        "actions": {
            "toggle": {"params": {"id": "string"}, "rebase": "by-key",
                "effect": [{"op": "set", "path": "items[id=$id].done", "value": "!items[id=$id].done"}]},
            "add": {"params": {"text": "string"}, "rebase": "always",
                "effect": [{"op": "push", "path": "items", "value": {"id": "$uuid", "text": "$text", "done": false}}]},
            "setDue": {"params": {"id": "string", "due": "string|null"}, "rebase": "by-key",
                "effect": [{"op": "set", "path": "items[id=$id].due", "value": "$due"}]},
            "move": {"params": {"id": "string", "index": "number"}, "rebase": "refuse",
                "effect": [{"op": "move", "path": "items[id=$id]", "to": "items", "index": "$index"}]},
            "clearDone": {"params": {}, "rebase": "always", "risk": "confirm",
                "effect": [{"op": "remove", "path": "items[done=true]"}]}
        },
        "view": {"source": "view.vx", "islands": {
            "burndown": {"script": "burndown.js", "props": {"items": "items"}, "actions": [],
                "budget": {"ms": 8, "mb": 16}}}},
        "lifecycle": {"open": "render", "close": "keep-state", "retire": "refuse-new-actions"},
        "presence": {"attribution": "per-entity", "show": ["avatars", "last-actor"]},
        "orbit": [
            {"id": "add", "label": "Add an item", "short": "Add", "icon": "plus", "group": "act",
                "run": {"action": "add", "ask": {"text": "What should I add?"}}},
            {"id": "next", "label": "Do the next open item", "icon": "play", "group": "act",
                "run": {"agent": "work-on", "read": "first(items, done: false)"}},
            {"id": "clear", "label": "Clear finished items", "icon": "trash", "group": "act",
                "pinned": false, "run": {"action": "clearDone"}}
        ],
        "dock": [
            {"id": "open", "label": "Read open items", "trigger": "on-dock", "default": "on",
                "read": "filter(items, done: false)"}
        ]
    })
}

fn environment<T>(run: impl FnOnce(&Environment) -> T) -> T {
    run(&Environment {
        exists: &|_| true,
        reserved: &|id| matches!(id, "terminal" | "notes" | "agents"),
    })
}

fn problems(value: &Value) -> Vec<String> {
    environment(
        |environment| match load(value.to_string().as_bytes(), environment) {
            Ok(_) => Vec::new(),
            Err(problems) => problems.iter().map(Problem::to_string).collect(),
        },
    )
}

#[test]
fn a_complete_manifest_is_accepted() {
    assert_eq!(problems(&checklist()), Vec::<String>::new());
}

#[test]
fn four_seeded_errors_are_all_listed_at_once() {
    let mut manifest = checklist();
    manifest["actions"]["toggle"]["effect"][0]["value"] = json!("$id");
    manifest["orbit"][0]["run"]["action"] = json!("ad");
    manifest["orbit"][1]["run"]["read"] = json!("first(items, finished: true)");
    manifest["dock"][0]["read"] = json!("filter(itemz, done: false)");
    assert_eq!(
        problems(&manifest),
        [
            "actions.toggle.effect[0]: set items[id=$id].done: expected boolean, got string",
            "orbit.add: action \"ad\" is not declared (declared: add, clearDone, move, setDue, toggle)",
            "orbit.next: where: items have no field \"finished\"",
            "dock.open: state has no field \"itemz\" (fields: items, title)",
        ]
    );
}

#[test]
fn structural_errors_are_listed_across_sections() {
    let mut manifest = checklist();
    manifest["colour"] = json!("red");
    manifest["actions"]["toggle"]["rebase"] = json!("sometimes");
    manifest["orbit"][1]["group"] = json!("shout");
    manifest["dock"][0]["trigger"] = json!("never");
    manifest["view"].as_object_mut().unwrap().remove("source");
    let listed = problems(&manifest);
    assert_eq!(listed.len(), 5, "{listed:#?}");
    for (index, prefix) in [
        "colour: unknown section",
        "actions.toggle:",
        "view:",
        "orbit[1]:",
        "dock[0]:",
    ]
    .iter()
    .enumerate()
    {
        assert!(listed[index].starts_with(prefix), "{index}: {listed:#?}");
    }
    let missing = read(&json!({"contract": 1}));
    assert_eq!(missing.unwrap_err().len(), 6);
}

#[test]
fn the_checker_covers_state_effects_files_and_references() {
    let mut manifest = checklist();
    manifest["contract"] = json!(9);
    manifest["id"] = json!("terminal");
    manifest["state"]["initial"] = json!({"title": 3, "items": []});
    manifest["concurrency"]["merge"] = json!(["nothing"]);
    manifest["actions"]["toggle"]["params"]["id"] = json!("text");
    manifest["actions"]["add"]["effect"] = json!([{"op": "push", "path": "items", "value": {"id": "$uuid", "text": "$text", "done": false, "extra": 1}}]);
    manifest["actions"]["clearDone"]["effect"] =
        json!([{"op": "remove", "path": "items"}, {"op": "backend"}]);
    manifest["actions"]["move"]["effect"] =
        json!([{"op": "move", "path": "items[id=$id]", "to": "title", "index": "'x'"}]);
    manifest["view"]["islands"]["burndown"]["actions"] = json!(["missing"]);
    manifest["orbit"][2]["run"] = json!({"action": "add", "agent": "x"});
    manifest["orbit"][0]["run"] = json!({"action": "setDue", "args": {"id": "3"}});
    let listed = problems(&manifest).join("\n");
    for expected in [
        "contract: must be 1, got 9",
        "id: \"terminal\" is already a Vessel type",
        "state.initial:",
        "concurrency.merge[0]: state has no field \"nothing\"",
        "actions.toggle.params.id: parameter type \"text\"",
        "unexpected field \"extra\"",
        "remove items: must end in a selector or an index",
        "backend effect but no backend is declared",
        "move into title: expected a list, got string",
        "move index: expected number, got string",
        "view.islands.burndown.actions[0]: action \"missing\" is not declared",
        "orbit.clear: run needs exactly one of",
        "setDue: argument \"due\" is neither given nor asked",
        "setDue.id: expected string, got number",
    ] {
        assert!(listed.contains(expected), "{expected}\n{listed}");
    }
}

#[test]
fn view_files_must_exist_inside_the_package() {
    let mut manifest = checklist();
    manifest["view"]["source"] = json!("../outside.vx");
    let bytes = manifest.to_string();
    let listed = Environment {
        exists: &|path| path != "burndown.js",
        reserved: &|_| false,
    };
    let errors = load(bytes.as_bytes(), &listed).unwrap_err();
    let errors: Vec<String> = errors.iter().map(Problem::to_string).collect();
    assert_eq!(
        errors,
        [
            "view.source: must be a relative path inside the package",
            "view.islands.burndown.script: file \"burndown.js\" is not in the package",
        ]
    );
}

#[test]
fn type_ids_are_plain_lowercase_words() {
    for good in ["checklist", "voyager.checklist", "a-b_c9", "9lives"] {
        assert!(valid_type_id(good), "{good}");
    }
    for bad in ["", "Checklist", "-x", ".x", "a b", "a/b", &"x".repeat(65)] {
        assert!(!valid_type_id(bad), "{bad}");
    }
}

fn package(root: &Path, folder: &str, manifest: &Value) {
    let dir = root.join("vessels").join(folder);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("manifest.json"), manifest.to_string()).unwrap();
    fs::write(dir.join("view.vx"), "<column/>").unwrap();
    fs::write(dir.join("burndown.js"), "").unwrap();
}

fn scratch(name: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!("voyager-manifest-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    root
}

#[test]
fn a_broken_edit_is_refused_and_the_last_good_manifest_keeps_working() {
    let root = scratch("lastgood");
    package(&root, "checklist", &checklist());
    let registry = Registry::new(root.join("vessels"), 1 << 20, |_| false);
    let listed = registry.describe("checklist").unwrap();
    assert!(listed.problems.is_empty());
    let mut broken = checklist();
    broken["orbit"][0]["run"]["action"] = json!("ad");
    broken["dock"][0]["read"] = json!("filter(itemz, done: false)");
    package(&root, "checklist", &broken);
    let kept = registry.describe("checklist").unwrap();
    assert_eq!(
        kept.availability,
        voyager_contract::content::Availability::Ready
    );
    assert_eq!(kept.problems.len(), 2, "{:?}", kept.problems);
    broken["version"] = json!(3);
    broken["orbit"][0]["run"]["action"] = json!("add");
    broken["dock"][0]["read"] = json!("filter(items, done: false)");
    package(&root, "checklist", &broken);
    assert!(registry.describe("checklist").unwrap().problems.is_empty());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn a_manifest_is_read_again_only_when_its_file_changes() {
    let root = scratch("mtime");
    package(&root, "checklist", &checklist());
    let file = root.join("vessels/checklist/manifest.json");
    let registry = Registry::new(root.join("vessels"), 1 << 20, |_| false);
    assert!(registry.describe("checklist").unwrap().problems.is_empty());
    let modified = fs::metadata(&file).unwrap().modified().unwrap();
    let mut broken = checklist().to_string();
    broken.replace_range(..1, " ");
    assert_eq!(broken.len(), checklist().to_string().len());
    fs::write(&file, broken).unwrap();
    fs::File::options()
        .write(true)
        .open(&file)
        .unwrap()
        .set_modified(modified)
        .unwrap();
    assert!(
        registry.describe("checklist").unwrap().problems.is_empty(),
        "an unchanged signature must not be read again"
    );
    fs::File::options()
        .write(true)
        .open(&file)
        .unwrap()
        .set_modified(modified + Duration::from_secs(5))
        .unwrap();
    let after = registry.describe("checklist").unwrap();
    assert_eq!(after.problems.len(), 1, "{:?}", after.problems);
    assert_eq!(
        after.availability,
        voyager_contract::content::Availability::Ready
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn a_package_that_was_never_good_is_unavailable_with_every_problem() {
    let root = scratch("never");
    let mut broken = checklist();
    broken["orbit"][0]["run"]["action"] = json!("ad");
    broken["dock"][0]["read"] = json!("filter(itemz, done: false)");
    package(&root, "broken", &broken);
    package(&root, "twin", &checklist());
    package(&root, "twin-two", &checklist());
    let registry = Registry::new(root.join("vessels"), 1 << 20, |_| false);
    let all = registry.descriptions();
    let never = all.iter().find(|kind| kind.type_id == "broken").unwrap();
    assert!(matches!(&never.availability,
        voyager_contract::content::Availability::Unavailable { reason } if reason.starts_with("Manifest has 2 problems")));
    assert_eq!(never.problems.len(), 2);
    let twin = all.iter().find(|kind| kind.type_id == "twin-two").unwrap();
    assert!(
        twin.problems[0].contains("also declared by package"),
        "{:?}",
        twin.problems
    );
    assert!(registry.describe("nothing").is_none());
    fs::remove_dir_all(root).unwrap();
}
