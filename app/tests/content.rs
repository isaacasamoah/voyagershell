use std::{
    fs,
    time::{SystemTime, UNIX_EPOCH},
};
use voyager_app::content::Owner;
use voyager_contract::{
    ContentId,
    content::{Notes, Request, Response, Version},
};

#[test]
fn bound_updates_preserve_other_data_and_refuse_stale_or_forged() {
    let path = std::env::temp_dir().join(format!(
        "voyager-notes-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(path.join("mods/notes")).unwrap();
    fs::write(
        path.join("mods/notes/mod.json"),
        include_str!("../../content/notes/mod.json"),
    )
    .unwrap();
    let mut owner = Owner::open(&path).unwrap();
    assert!(owner.initialize(&ContentId("../outside".into())).is_err());
    assert!(owner.bind(&ContentId("unregistered".into())).is_none());
    let a = owner.initialize(&ContentId("notes-a".into())).unwrap();
    let b = owner.initialize(&ContentId("notes-b".into())).unwrap();
    let read = |id: &str| Request::Inspect {
        version: Version::V1,
        request_id: "r".into(),
        content_id: ContentId(id.into()),
    };
    let revision = match owner.call(&a, read("notes-a")) {
        Response::Snapshot { snapshot, .. } => snapshot.revision,
        other => panic!("{other:?}"),
    };
    let update = |id: &str, revision: &str| Request::Update {
        version: Version::V1,
        request_id: "u".into(),
        content_id: ContentId(id.into()),
        expected_revision: revision.into(),
        data: Notes {
            title: "new".into(),
            text: "body".into(),
        },
    };
    assert!(matches!(
        owner.call(&a, update("notes-b", &revision)),
        Response::Rejected { .. }
    ));
    assert!(matches!(
        owner.call(&a, update("notes-a", &revision)),
        Response::Applied { .. }
    ));
    assert!(matches!(
        owner.call(&a, update("notes-a", &revision)),
        Response::Rejected { .. }
    ));
    assert!(
        matches!(owner.call(&b, read("notes-b")), Response::Snapshot { snapshot, .. } if snapshot.data.title == "Working notes")
    );
    fs::remove_dir_all(path).unwrap();
}

#[test]
fn named_schema_reload_and_legacy_data_remain_truthful() {
    let path = std::env::temp_dir().join(format!(
        "voyager-schema-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(path.join("mods/notes")).unwrap();
    let manifest = path.join("mods/notes/mod.json");
    fs::write(&manifest, include_str!("../../content/notes/mod.json")).unwrap();
    fs::write(
        path.join("mods/notes/main.js"),
        include_str!("../../content/notes/main.js"),
    )
    .unwrap();
    let mut owner = Owner::open(&path).unwrap();
    let binding = owner.initialize(&ContentId("notes-a".into())).unwrap();
    let describe = || Request::Describe {
        version: Version::V1,
        request_id: "d".into(),
        content_id: ContentId("notes-a".into()),
    };
    for _ in 0..3 {
        assert!(matches!(
            owner.call(&binding, describe()),
            Response::Described {
                schema_declared: true,
                ..
            }
        ));
    }
    fs::write(
        &manifest,
        r#"{"name":"Notes","version":1,"entry":"main.js"}"#,
    )
    .unwrap();
    assert!(matches!(
        owner.call(&binding, describe()),
        Response::Described {
            schema_declared: false,
            ..
        }
    ));
    let result = owner.call(
        &binding,
        Request::Inspect {
            version: Version::V1,
            request_id: "i".into(),
            content_id: ContentId("notes-a".into()),
        },
    );
    assert!(
        matches!(result, Response::Snapshot { snapshot, .. } if snapshot.warning.as_deref() == Some("No state schema declared"))
    );
    fs::remove_dir_all(path).unwrap();
}
