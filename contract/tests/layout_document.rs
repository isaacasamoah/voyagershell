use serde_json::{Value, json};
use voyager_contract::Layout;
use voyager_contract::layout_document::{Reading, import_legacy, read, read_at, write};

fn baseline() -> Value {
    let mut value = serde_json::to_value(Layout::default()).unwrap();
    value["voyages"] = json!([{
        "id": "voyage-1", "name": "Work", "closedOrder": "0",
        "fleets": [{
            "id": "fleet-1", "name": "One",
            "placements": [{"id": "placement-1", "vessel": "vessel-1", "name": "Shell"}],
            "root": {"kind": "leaf", "placement": "placement-1"}
        }],
        "portals": []
    }]);
    value["vessels"] =
        json!([{"id": "vessel-1", "typeId": "terminal", "cwd": "/w", "backend": null}]);
    value["selectedVoyage"] = json!("voyage-1");
    value["selectedFleet"] = json!("fleet-1");
    value
}

fn open(raw: Value) -> (Layout, voyager_contract::layout_document::Kept) {
    match read(raw) {
        Reading::Open { layout, kept } => (*layout, kept),
        other => panic!("{other:?}"),
    }
}

#[test]
fn an_unknown_field_survives_a_save_and_follows_its_entity() {
    let mut raw = baseline();
    raw["voyages"][0]["fleets"][0]["pinned"] = json!(true);
    raw["vessels"][0]["badge"] = json!({"colour": "red"});
    raw["bookmarks"] = json!({"last": "fleet-1"});
    let (mut layout, kept) = open(raw);
    assert_eq!(kept.fields(), 3);
    layout.voyages[0].fleets[0].name = "Renamed".into();
    let saved = write(&layout, &kept).unwrap();
    assert_eq!(saved["voyages"][0]["fleets"][0]["name"], "Renamed");
    assert_eq!(saved["voyages"][0]["fleets"][0]["pinned"], true);
    assert_eq!(saved["vessels"][0]["badge"], json!({"colour": "red"}));
    assert_eq!(saved["bookmarks"], json!({"last": "fleet-1"}));
    layout.voyages[0].fleets.clear();
    layout.voyages[0].fleets.push(voyager_contract::Fleet {
        id: voyager_contract::FleetId("fleet-2".into()),
        name: "Other".into(),
        closed: false,
        placements: vec![],
        root: None,
        maximized_placement: None,
    });
    let moved = write(&layout, &kept).unwrap();
    assert!(moved["voyages"][0]["fleets"][0].get("pinned").is_none());
}

#[test]
fn a_document_this_build_wrote_reads_with_nothing_kept() {
    let (layout, kept) = open(baseline());
    assert!(kept.is_empty());
    let written = write(&layout, &kept).unwrap();
    let (again, kept_again) = open(written.clone());
    assert!(kept_again.is_empty());
    assert_eq!(write(&again, &kept_again).unwrap(), written);
    assert_eq!(again, layout);
}

#[test]
fn a_new_vessel_type_is_data_not_shape() {
    let mut raw = baseline();
    raw["vessels"].as_array_mut().unwrap().push(json!({
        "id": "vessel-2", "typeId": "git-graph", "cwd": "/w", "backend": null,
        "configuration": {"repo": "."}
    }));
    let (layout, kept) = open(raw.clone());
    assert!(kept.is_empty());
    assert_eq!(
        write(&layout, &kept).unwrap()["vessels"][1],
        raw["vessels"][1]
    );
}

#[test]
fn a_newer_stamp_is_refused_and_an_older_reader_level_keeps_the_stamp() {
    let mut raw = baseline();
    raw["minReader"] = json!(2);
    assert!(matches!(
        read(raw.clone()),
        Reading::Newer { min_reader: 2 }
    ));
    let Reading::Open { layout, kept } = read_at(raw, 2) else {
        panic!("level 2 opens a level 2 document")
    };
    assert_eq!(write(&layout, &kept).unwrap()["minReader"], 2);
}

#[test]
fn a_stamp_of_one_is_dropped_and_a_stamp_that_is_not_a_whole_number_is_unreadable() {
    let mut raw = baseline();
    raw["minReader"] = json!(1);
    let (layout, kept) = open(raw);
    assert!(write(&layout, &kept).unwrap().get("minReader").is_none());
    for stamp in [json!("two"), json!("2"), json!(2.0), json!(-1), json!(null)] {
        let mut raw = baseline();
        raw["minReader"] = stamp.clone();
        assert!(
            matches!(read(raw), Reading::Unreadable { ref message } if message.contains("whole number")),
            "{stamp}"
        );
    }
}

#[test]
fn corrupt_documents_are_unreadable() {
    let mut wrong = baseline();
    wrong["voyages"] = json!(3);
    let mut variant = baseline();
    variant["context"] = json!({"kind": "agent", "id": "a"});
    let mut missing = baseline();
    missing["voyages"][0]
        .as_object_mut()
        .unwrap()
        .remove("fleets");
    let mut stripped = baseline();
    stripped["voyages"][0]["fleets"][0]["pinned"] = json!(true);
    stripped["voyages"][0]["fleets"][0]["root"] = json!({"kind": "leaf"});
    for raw in [
        wrong,
        variant,
        missing,
        stripped,
        json!("{\"voy"),
        json!([]),
    ] {
        assert!(
            matches!(read(raw.clone()), Reading::Unreadable { .. }),
            "{raw}"
        );
    }
}

#[test]
fn a_version_one_document_imports_into_the_current_shape() {
    let mut old = baseline();
    let object = old.as_object_mut().unwrap();
    let vessels = object.remove("vessels").unwrap();
    object.insert("contents".into(), vessels);
    let fleet = &mut old["voyages"][0]["fleets"][0];
    let placements = fleet.as_object_mut().unwrap().remove("placements").unwrap();
    fleet["vessels"] = placements;
    let placement = fleet["vessels"][0].as_object_mut().unwrap();
    let id = placement.remove("vessel").unwrap();
    placement.insert("content".into(), id);
    old["voyages"][0]["primaryVessel"] = json!("placement-1");
    let (layout, kept) = open(import_legacy(old));
    assert!(kept.is_empty());
    assert_eq!(
        layout.voyages[0].fleets[0].placements[0].vessel.0,
        "vessel-1"
    );
    assert_eq!(layout.vessels.len(), 1);
}

#[test]
fn a_field_added_under_the_canvas_survives_a_save() {
    let mut raw = baseline();
    raw["canvas"]["gridSnap"] = json!(true);
    raw["canvas"]["root"]["size"] = json!({"kind": "fill", "weight": 2});
    let (layout, kept) = open(raw);
    assert_eq!(kept.fields(), 2);
    let saved = write(&layout, &kept).unwrap();
    assert_eq!(saved["canvas"]["gridSnap"], true);
    assert_eq!(saved["canvas"]["root"]["size"]["weight"], 2);
}

#[test]
fn an_older_layout_reads_without_adopted_and_a_newer_one_keeps_it() {
    let (layout, kept) = open(baseline());
    assert!(kept.is_empty());
    assert!(!layout.vessels[0].adopted);
    let saved = write(&layout, &kept).unwrap();
    assert!(saved["vessels"][0].get("adopted").is_none());

    let mut raw = baseline();
    raw["vessels"][0]["adopted"] = json!(true);
    let (layout, kept) = open(raw);
    assert!(kept.is_empty());
    assert!(layout.vessels[0].adopted);
    let saved = write(&layout, &kept).unwrap();
    assert_eq!(saved["vessels"][0]["adopted"], json!(true));
}

#[test]
fn an_older_reader_opens_a_layout_with_adopted_and_keeps_the_field() {
    let mut raw = baseline();
    raw["vessels"][0]["adopted"] = json!(true);
    let release =
        serde_json::from_str::<Value>(include_str!("layout-release-1.schema.json")).unwrap();
    let vessel = &release["definitions"]["Vessel"];
    assert!(vessel["properties"].get("adopted").is_none());
    assert_eq!(vessel["additionalProperties"], json!(false));
    let mut older = raw.clone();
    older["vessels"][0]["backend"] = json!(null);
    let strict_for_older: serde_json::Map<String, Value> =
        older["vessels"][0].as_object().unwrap().clone();
    let unknown: Vec<&String> = strict_for_older
        .keys()
        .filter(|key| !vessel["properties"].as_object().unwrap().contains_key(*key))
        .collect();
    assert_eq!(unknown, vec!["adopted"]);
}
