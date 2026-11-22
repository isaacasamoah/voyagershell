use super::tests::checklist;
use crate::content::{
    Access, Owner,
    requests::{bind, run},
};
use serde_json::{Value, json};
use std::{fs, sync::Arc};
use voyager_contract::{
    ContentDestination, Context, PlacementInsertion, PlacementOwner, VesselId,
    content::{Request, Response, Version},
};

struct Scene {
    root: std::path::PathBuf,
    owner: Owner,
    layout: Arc<voyager_contract::Layout>,
    first: VesselId,
    second: VesselId,
    first_placement: voyager_contract::PlacementId,
}

fn scene(name: &str) -> Scene {
    let root = std::env::temp_dir().join(format!("voyager-invoke-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    let package = root.join("vessels/checklist");
    fs::create_dir_all(&package).unwrap();
    fs::write(package.join("manifest.json"), checklist().to_string()).unwrap();
    fs::write(package.join("view.vx"), "<column/>").unwrap();
    fs::write(package.join("burndown.js"), "").unwrap();
    let owner = Owner::open(&root).unwrap();
    let mut model = crate::workspace::Model::default();
    model
        .apply(voyager_contract::Action::CreateVoyage {
            name: "Test".into(),
            cwd: root.to_string_lossy().into_owned(),
        })
        .unwrap();
    let voyage = model.layout.voyages[0].id.clone();
    let fleet = model.layout.voyages[0].fleets[0].id.clone();
    let beside = model.layout.voyages[0].fleets[0].placements[0].id.clone();
    model
        .apply(voyager_contract::Action::CreateVessel {
            launch: None,
            type_id: "checklist".into(),
            destination: ContentDestination::Placement {
                owner: PlacementOwner::Fleet { id: fleet },
                insertion: PlacementInsertion::Beside {
                    id: beside,
                    side: voyager_contract::Side::Right,
                },
            },
        })
        .unwrap();
    let first = model.layout.vessels.last().unwrap().id.clone();
    let first_placement = model.layout.voyages[0].fleets[0]
        .placements
        .last()
        .unwrap()
        .id
        .clone();
    model
        .apply(voyager_contract::Action::CreateVessel {
            launch: None,
            type_id: "checklist".into(),
            destination: ContentDestination::Placement {
                owner: PlacementOwner::Portals { voyage },
                insertion: PlacementInsertion::Empty,
            },
        })
        .unwrap();
    let second = model.layout.vessels.last().unwrap().id.clone();
    Scene {
        root,
        owner,
        layout: Arc::new(model.layout),
        first,
        second,
        first_placement,
    }
}

fn invoke(id: &VesselId, action: &str, args: Value, revision: &str) -> Request {
    Request::Invoke {
        version: Version::V1,
        request_id: format!("{action}-{revision}"),
        vessel_id: id.clone(),
        expected_revision: revision.into(),
        action: action.into(),
        args,
    }
}

fn inspect(id: &VesselId) -> Request {
    Request::Inspect {
        version: Version::V1,
        request_id: "inspect".into(),
        vessel_id: id.clone(),
    }
}

fn state(response: Response) -> (String, Value) {
    match response {
        Response::State { snapshot, .. } | Response::Invoked { snapshot, .. } => {
            (snapshot.revision, snapshot.state)
        }
        other => panic!("{other:?}"),
    }
}

fn refused(response: Response) -> String {
    match response {
        Response::Rejected { message, .. } => message,
        other => panic!("{other:?}"),
    }
}

fn without_ids(mut value: Value) -> Value {
    for item in value["items"].as_array_mut().unwrap() {
        item["id"] = Value::Null;
    }
    value
}

#[test]
fn a_view_and_an_agent_run_the_same_declared_action_with_the_same_effect() {
    let mut scene = scene("same");
    let layout = scene.layout.clone();
    let view = Access::View(bind(&mut scene.owner, &layout, &scene.second).unwrap());
    let agent = Access::Agent {
        scope: Context::Vessel {
            id: scene.first_placement.clone(),
        },
        expected_version: 7,
    };
    let (first, second) = (scene.first.clone(), scene.second.clone());
    let results: Vec<(String, Value)> = [(&view, &second), (&agent, &first)]
        .into_iter()
        .map(|(access, id)| {
            let added = state(run(
                &mut scene.owner,
                &layout,
                7,
                access,
                invoke(id, "add", json!({"text": "write it"}), "0"),
            ));
            let key = added.1["items"][0]["id"].as_str().unwrap().to_owned();
            let toggled = state(run(
                &mut scene.owner,
                &layout,
                7,
                access,
                invoke(id, "toggle", json!({"id": key}), &added.0),
            ));
            let read = state(run(&mut scene.owner, &layout, 7, access, inspect(id)));
            assert_eq!(toggled, read);
            (read.0, without_ids(read.1))
        })
        .collect();
    assert_eq!(results[0], results[1]);
    assert_eq!(results[0].0, "2");
    assert_eq!(results[0].1["items"][0]["done"], json!(true));
    assert!(
        scene
            .root
            .join("data")
            .join(format!("{}.json", scene.first.0))
            .is_file()
    );
    fs::remove_dir_all(&scene.root).unwrap();
}

#[test]
fn refusals_name_the_cause_and_leave_the_state_alone() {
    let mut scene = scene("refuse");
    let layout = scene.layout.clone();
    let id = scene.first.clone();
    let view = Access::View(bind(&mut scene.owner, &layout, &id).unwrap());
    let mut call = |request: Request| run(&mut scene.owner, &layout, 7, &view, request);
    state(call(invoke(&id, "add", json!({"text": "a"}), "0")));
    let (revision, listed) = state(call(invoke(&id, "add", json!({"text": "b"}), "0")));
    assert_eq!(revision, "2");
    let key = listed["items"][1]["id"].as_str().unwrap().to_owned();
    let stale = refused(call(invoke(
        &id,
        "move",
        json!({"id": key, "index": 0}),
        "1",
    )));
    assert!(stale.starts_with("Stale: you saw revision 1"), "{stale}");
    for (action, args, expected) in [
        ("erase", json!({}), "undeclared action \"erase\""),
        ("add", json!({}), "missing argument \"text\""),
        (
            "add",
            json!({"text": 3}),
            "argument \"text\": expected string, got number",
        ),
        (
            "add",
            json!({"text": "x", "more": 1}),
            "unknown argument \"more\"",
        ),
        ("toggle", json!({"id": "nothing"}), "target is gone"),
    ] {
        let message = refused(call(invoke(&id, action, args, &revision)));
        assert!(message.contains(expected), "{action}: {message}");
    }
    let moved = state(call(invoke(
        &id,
        "move",
        json!({"id": key, "index": 0}),
        &revision,
    )));
    assert_eq!(moved.1["items"][0]["id"], json!(key));
    assert_eq!(moved.0, "3");
    let message = refused(call(invoke(
        &scene.second,
        "add",
        json!({"text": "x"}),
        "0",
    )));
    assert!(message.contains("outside this view"), "{message}");
    fs::remove_dir_all(&scene.root).unwrap();
}

#[test]
fn instance_data_outlives_the_owner_and_describe_lists_every_action() {
    let mut scene = scene("persist");
    let layout = scene.layout.clone();
    let id = scene.first.clone();
    let view = Access::View(bind(&mut scene.owner, &layout, &id).unwrap());
    state(run(
        &mut scene.owner,
        &layout,
        7,
        &view,
        invoke(&id, "add", json!({"text": "kept"}), "0"),
    ));
    let mut reopened = Owner::open(&scene.root).unwrap();
    let again = Access::View(bind(&mut reopened, &layout, &id).unwrap());
    let (revision, listed) = state(run(&mut reopened, &layout, 7, &again, inspect(&id)));
    assert_eq!(
        (revision.as_str(), listed["items"][0]["text"].as_str()),
        ("1", Some("kept"))
    );
    let answer = run(
        &mut reopened,
        &layout,
        7,
        &again,
        Request::Describe {
            version: Version::V1,
            request_id: "describe".into(),
            vessel_id: id.clone(),
        },
    );
    assert!(
        matches!(&answer, Response::Described { schema_declared: true, state_schema: Some(schema), .. } if *schema == checklist()["state"]["schema"]),
        "{answer:?}"
    );
    let registry = crate::content::open_registry(scene.root.join("vessels"));
    let described = registry.describe("checklist").unwrap().actions.unwrap();
    assert_eq!(described.names, ["describe", "inspect", "invoke"]);
    let schema = described.input_schema.to_string();
    for action in ["toggle", "add", "setDue", "move", "clearDone"] {
        assert!(
            schema.contains(&format!("\"const\":\"{action}\"")),
            "{action}"
        );
    }
    fs::remove_dir_all(&scene.root).unwrap();
}

#[test]
fn a_match_on_a_number_picks_the_case_whose_key_is_that_number() {
    let mut value = checklist();
    value["actions"]["label"] = json!({"rebase": "always", "effect": [
        {"op": "set", "path": "title", "value": "match(count(items, done: false), 0: 'none', 1: 'one')"}
    ]});
    let manifest = super::read::read(&value).unwrap();
    let state = json!({"title": "t", "items": [{"id": "a", "text": "x", "done": false}]});
    let next = super::effect::run(&manifest, "label", &json!({}), &state, "seed").unwrap();
    assert_eq!(next["title"], "one");
    let empty = json!({"title": "t", "items": []});
    let next = super::effect::run(&manifest, "label", &json!({}), &empty, "seed").unwrap();
    assert_eq!(next["title"], "none");
}

#[test]
fn a_saved_action_whose_confirmation_exceeds_the_limit_is_uncertain_not_rejected() {
    use crate::content::{ENVELOPE_LIMIT, requests::bounded_response};
    let mut scene = scene("limit");
    let layout = scene.layout.clone();
    let id = scene.first.clone();
    let view = Access::View(bind(&mut scene.owner, &layout, &id).unwrap());
    let stored = |text: usize| {
        json!({"revision": 1, "state": {"title": "t", "items": [
            {"id": "a", "text": "x".repeat(text), "done": true}
        ]}})
    };
    let base = stored(0).to_string().len();
    let text = ENVELOPE_LIMIT - base - 20;
    let file = scene.root.join("data").join(format!("{}.json", id.0));
    fs::write(&file, stored(text).to_string()).unwrap();
    assert!(fs::metadata(&file).unwrap().len() as usize <= ENVELOPE_LIMIT);
    let request = invoke(&id, "toggle", json!({"id": "a"}), "1");
    let response = run(&mut scene.owner, &layout, 7, &view, request.clone());
    assert!(matches!(response, Response::Invoked { .. }), "{response:?}");
    let told = bounded_response(&request, response);
    assert!(
        matches!(&told, Response::Uncertain { vessel_id, .. } if vessel_id.0 == id.0),
        "{told:?}"
    );
    let saved: Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
    assert_eq!(saved["revision"], 2);
    assert_eq!(saved["state"]["items"][0]["done"], false);
    let read = run(&mut scene.owner, &layout, 7, &view, inspect(&id));
    let told = bounded_response(&inspect(&id), read);
    assert!(
        matches!(&told, Response::Limited { revision: Some(revision), .. } if revision == "2"),
        "{told:?}"
    );
    fs::remove_dir_all(&scene.root).unwrap();
}

#[test]
fn an_agent_needs_the_current_workspace_revision_and_a_vessel_inside_its_scope() {
    let mut scene = scene("scope");
    let layout = scene.layout.clone();
    let (first, second) = (scene.first.clone(), scene.second.clone());
    let agent = Access::Agent {
        scope: Context::Vessel {
            id: scene.first_placement.clone(),
        },
        expected_version: 7,
    };
    let add = invoke(&first, "add", json!({"text": "kept"}), "0");
    let stale = refused(run(&mut scene.owner, &layout, 8, &agent, add.clone()));
    assert!(stale.starts_with("Workspace revision changed"), "{stale}");
    let outside = refused(run(&mut scene.owner, &layout, 7, &agent, inspect(&second)));
    assert!(
        outside.contains("outside the captured workspace scope"),
        "{outside}"
    );
    let added = state(run(&mut scene.owner, &layout, 7, &agent, add.clone()));
    assert_eq!(added.0, "1");
    let mut changed = (*layout).clone();
    let fleet = &mut changed.voyages[0].fleets[0];
    fleet.root = Some(voyager_contract::Split::Leaf {
        placement: fleet.placements[0].id.clone(),
    });
    let whole_fleet = Access::Agent {
        scope: Context::Fleet {
            id: fleet.id.clone(),
        },
        expected_version: 7,
    };
    let hidden = Arc::new(changed.clone());
    let read = state(run(
        &mut scene.owner,
        &hidden,
        7,
        &whole_fleet,
        inspect(&first),
    ));
    assert_eq!(read, added);
    changed.voyages[0].fleets[0]
        .placements
        .retain(|placement| placement.id != scene.first_placement);
    let gone = refused(run(&mut scene.owner, &Arc::new(changed), 7, &agent, add));
    assert!(
        gone.contains("outside the captured workspace scope"),
        "{gone}"
    );
    let kept = state(run(&mut scene.owner, &layout, 7, &agent, inspect(&first)));
    assert_eq!(kept, added);
    fs::remove_dir_all(&scene.root).unwrap();
}
