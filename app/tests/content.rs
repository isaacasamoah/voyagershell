use std::{
    fs,
    path::Path,
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
        matches!(owner.call(&b, read("notes-b")), Response::Snapshot { snapshot, .. } if snapshot.data.title == "Title")
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

fn wait<T>(future: impl std::future::Future<Output = T>) -> T {
    let mut future = Box::pin(future);
    let mut context = std::task::Context::from_waker(std::task::Waker::noop());
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
        if let std::task::Poll::Ready(value) = future.as_mut().poll(&mut context) {
            return value;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "Owner reply timed out"
        );
        std::thread::sleep(std::time::Duration::from_millis(1));
    }
}

#[test]
fn configuration_uses_the_live_core_workspace_and_notifies_both_views() {
    use std::sync::Arc;
    use voyager_app::{client::Client, content::Access, core::Core};
    use voyager_contract::{Action, Context, Status, content::NotesConfiguration};
    let runtime = std::path::PathBuf::from(std::env::var_os("XDG_RUNTIME_DIR").unwrap());
    for key in ["HC_SOCKET", "HC_SESSION", "HC_TERMINAL_ID"] {
        assert!(std::env::var_os(key).is_none(), "Clear ambient {key}");
    }
    let session = format!("voyager-config-{}", std::process::id());
    let socket = runtime.join("herdr-core").join(format!("{session}.sock"));
    assert!(
        !runtime
            .join("herdr-core")
            .join(format!("{session}.sock"))
            .exists()
    );
    let profile = runtime.join(format!("configuration-{}", std::process::id()));
    for (name, source) in [
        ("notes", include_str!("../../content/notes/mod.json")),
        ("header", include_str!("../../desktop/mods/header/mod.json")),
    ] {
        fs::create_dir_all(profile.join("mods").join(name)).unwrap();
        let mut manifest: serde_json::Value = serde_json::from_str(source).unwrap();
        manifest["contentConfiguration"] = serde_json::json!(1);
        fs::write(
            profile.join("mods").join(name).join("mod.json"),
            serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();
        fs::write(profile.join("mods").join(name).join("main.js"), "").unwrap();
    }
    let mut cleanup = Core::connect(&session).unwrap();
    let client = Client::with_content(
        session.clone(),
        profile.to_string_lossy().into_owned(),
        Owner::open(&profile).unwrap(),
    );
    let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let call = |action, expected_version| {
            client
                .call(voyager_contract::Request {
                    request_id: client.request_id(),
                    expected_version,
                    action,
                })
                .unwrap()
        };
        let mut workspace = call(Action::Inspect, 0);
        let mut ids = Vec::new();
        for _ in 0..2 {
            workspace = call(
                Action::CreateContent {
                    type_id: "notes".into(),
                    launch: None,
                    destination: voyager_contract::ContentDestination::Panel {
                        owner: voyager_contract::PanelOwner::Portals {
                            voyage: workspace.layout.voyages[0].id.clone(),
                        },
                        insertion: workspace.layout.voyages[0].portals.last().map_or(
                            voyager_contract::PanelInsertion::Empty,
                            |panel| voyager_contract::PanelInsertion::Beside {
                                id: panel.id.clone(),
                                side: voyager_contract::Side::Bottom,
                            },
                        ),
                    },
                },
                workspace.version,
            );
            assert_eq!(workspace.status, Status::Applied);
            ids.push(workspace.layout.contents.last().unwrap().id.clone());
        }
        let binding = wait(client.bind_content(ids[0].clone())).unwrap();
        let inspect = || Request::Inspect {
            version: Version::V1,
            request_id: client.request_id(),
            content_id: ids[0].clone(),
        };
        let access = Access::View(binding.clone());
        let before = client.content(access.clone(), inspect()).unwrap();
        let Response::Snapshot {
            snapshot: original,
            configuration: Some(metadata),
            ..
        } = &*before
        else {
            panic!("{before:?}")
        };
        assert!(metadata.configuration.show_heading);
        assert!(metadata.configuration.notes_file.is_some());
        assert_eq!(metadata.workspace_version, workspace.version);
        let paths: Vec<_> = ids
            .iter()
            .map(|id| {
                let content = workspace
                    .layout
                    .contents
                    .iter()
                    .find(|content| content.id == *id)
                    .unwrap();
                let configuration: NotesConfiguration = serde_json::from_value(
                    serde_json::Value::Object(content.configuration.clone().unwrap()),
                )
                .unwrap();
                let file = configuration.notes_file.unwrap();
                Path::new(&file.directory).join(file.filename)
            })
            .collect();
        let data: Vec<_> = paths.iter().map(|path| fs::read(path).unwrap()).collect();
        let changed = wait(client.content_changes(binding.clone(), None)).unwrap();
        let counter = wait(changed.recv()).unwrap();
        let changed = wait(client.content_changes(binding.clone(), Some(counter))).unwrap();
        let notices = wait(client.workspace_changes(None)).unwrap();
        let notice = wait(notices.recv()).unwrap();
        let notices = wait(client.workspace_changes(Some(notice))).unwrap();
        let request = Request::Configure {
            version: Version::V1,
            request_id: client.request_id(),
            content_id: ids[0].clone(),
            expected_version: workspace.version,
            configuration: NotesConfiguration {
                show_heading: false,
                notes_file: metadata.configuration.notes_file.clone(),
            },
        };
        let configured = client.content(access.clone(), request.clone()).unwrap();
        let Response::Configured {
            configuration,
            workspace_version,
            ..
        } = &*configured
        else {
            panic!("{configured:?}")
        };
        assert!(!configuration.show_heading);
        assert!(*workspace_version > workspace.version);
        assert_eq!(wait(changed.recv()).unwrap(), counter + 1);
        let configured_notice = wait(notices.recv()).unwrap();
        assert_eq!(configured_notice.revision, *workspace_version);
        let discovered = wait(client.workspace_changes(Some(configured_notice))).unwrap();
        assert!(Arc::ptr_eq(
            &configured,
            &client.content(access.clone(), request.clone()).unwrap()
        ));
        let mut changed_request = request.clone();
        if let Request::Configure { configuration, .. } = &mut changed_request {
            configuration.show_heading = true;
        }
        assert!(matches!(
            &*client.content(access.clone(), changed_request).unwrap(),
            Response::Rejected { .. }
        ));
        let mut stale = request.clone();
        if let Request::Configure { request_id, .. } = &mut stale {
            *request_id = client.request_id();
        }
        assert!(matches!(
            &*client.content(access.clone(), stale).unwrap(),
            Response::Rejected { .. }
        ));
        let mut forged = request.clone();
        if let Request::Configure {
            request_id,
            expected_version,
            ..
        } = &mut forged
        {
            *request_id = client.request_id();
            *expected_version = *workspace_version;
        }
        assert!(matches!(
            &*client
                .content(
                    Access::Agent {
                        scope: Context::Vessel {
                            id: workspace.layout.voyages[0].fleets[0].vessels[0].id.clone()
                        },
                        expected_version: *workspace_version
                    },
                    forged
                )
                .unwrap(),
            Response::Rejected { .. }
        ));
        for (index, _) in ids.iter().enumerate() {
            assert_eq!(fs::read(&paths[index]).unwrap(), data[index]);
        }
        fs::write(&paths[0], [0xff]).unwrap();
        let unreadable = client.content(access.clone(), inspect()).unwrap();
        assert!(matches!(&*unreadable, Response::Rejected { .. }));
        fs::write(&paths[0], &data[0]).unwrap();
        let restored = client.content(access.clone(), inspect()).unwrap();
        assert!(
            matches!(&*restored, Response::Snapshot {snapshot,configuration:Some(current),..} if snapshot.revision == original.revision && !current.configuration.show_heading && current.workspace_version == *workspace_version)
        );
        let header_path = profile.join("mods/header/mod.json");
        let header = fs::read(&header_path).unwrap();
        let mut legacy: serde_json::Value = serde_json::from_slice(&header).unwrap();
        legacy
            .as_object_mut()
            .unwrap()
            .remove("contentConfiguration");
        fs::write(&header_path, serde_json::to_vec(&legacy).unwrap()).unwrap();
        let catalog = voyager_app::content::discover(&profile.join("mods")).unwrap();
        let notes = catalog
            .types
            .iter()
            .find(|kind| kind.type_id == "notes")
            .unwrap();
        assert!(notes.configuration.is_none());
        assert!(voyager_app::content::require_action(notes, "configure").is_err());
        let mut unsupported = request.clone();
        if let Request::Configure {
            request_id,
            expected_version,
            ..
        } = &mut unsupported
        {
            *request_id = client.request_id();
            *expected_version = *workspace_version;
        }
        assert!(matches!(
            &*client.content(access.clone(), unsupported).unwrap(),
            Response::Rejected { .. }
        ));
        assert!(matches!(
            &*client.content(access.clone(), inspect()).unwrap(),
            Response::Snapshot {
                configuration: None,
                ..
            }
        ));
        fs::write(&header_path, header).unwrap();
        let mut external = Core::connect(&session).unwrap();
        let saved = external.document_get("voyager-layout-v1").unwrap();
        assert_eq!(saved.version, *workspace_version);
        assert_eq!(
            saved.value["contents"]
                .as_array()
                .unwrap()
                .iter()
                .find(|item| item["id"] == ids[0].0)
                .unwrap()["configuration"]["showHeading"],
            false
        );
        external
            .document_set("voyager-layout-v1", &saved.value, saved.version)
            .unwrap();
        let observed = client.content(access.clone(), inspect()).unwrap();
        assert!(
            matches!(&*observed, Response::Snapshot {configuration:Some(current),..} if current.workspace_version == saved.version + 1)
        );
        assert_eq!(wait(discovered.recv()).unwrap().revision, saved.version + 1);
        let mut stale = request.clone();
        if let Request::Configure {
            request_id,
            expected_version,
            ..
        } = &mut stale
        {
            *request_id = client.request_id();
            *expected_version = *workspace_version;
        }
        assert!(matches!(
            &*client.content(access, stale).unwrap(),
            Response::Rejected { .. }
        ));
        let mut invalid = saved.value.clone();
        invalid["contents"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|item| item["id"] == ids[0].0)
            .unwrap()["configuration"]["showHeading"] = serde_json::json!("invalid");
        let damaged = external
            .document_set("voyager-layout-v1", &invalid, saved.version + 1)
            .unwrap();
        for content_id in [ids[0].clone(), ContentId("missing-note".into())] {
            let refused = client
                .content(
                    Access::Agent {
                        scope: Context::Vessel {
                            id: workspace.layout.voyages[0].fleets[0].vessels[0].id.clone(),
                        },
                        expected_version: damaged.version,
                    },
                    Request::Inspect {
                        version: Version::V1,
                        request_id: client.request_id(),
                        content_id,
                    },
                )
                .unwrap();
            assert!(
                matches!(&*refused, Response::Rejected {message,..} if message == "That Notes instance is outside the captured workspace scope"),
                "{refused:?}"
            );
        }
        let repaired = external
            .document_set("voyager-layout-v1", &saved.value, damaged.version)
            .unwrap();
        let reopened = Client::with_content(
            session.clone(),
            "/tmp".into(),
            Owner::open(&profile).unwrap(),
        );
        let read = reopened
            .content(
                Access::Agent {
                    scope: Context::Workspace,
                    expected_version: repaired.version,
                },
                inspect(),
            )
            .unwrap();
        assert!(
            matches!(&*read, Response::Snapshot {snapshot,configuration:Some(current),..} if snapshot.revision == original.revision && !current.configuration.show_heading)
        );
        drop(reopened);
        let current_workspace = call(Action::Inspect, 0);
        assert_eq!(current_workspace.version, repaired.version);
        let first = wait(client.content_changes(binding.clone(), None)).unwrap();
        let counter = wait(first.recv()).unwrap();
        let changes = wait(client.content_changes(binding.clone(), Some(counter))).unwrap();
        let docked = call(
            Action::Dock {
                context: Context::Voyage {
                    id: workspace.layout.voyages[0].id.clone(),
                },
            },
            repaired.version,
        );
        assert_eq!(docked.status, Status::Applied);
        assert!(wait(changes.recv()).unwrap() > counter);
        let refreshed = client
            .content(Access::View(binding.clone()), inspect())
            .unwrap();
        let Response::Snapshot {
            configuration: Some(current),
            ..
        } = &*refreshed
        else {
            panic!("{refreshed:?}")
        };
        assert_eq!(current.workspace_version, docked.version);
        let opened = client
            .content(
                Access::View(binding.clone()),
                Request::OpenNote {
                    version: Version::V1,
                    request_id: client.request_id(),
                    content_id: ids[0].clone(),
                    expected_version: current.workspace_version,
                    filename: current
                        .configuration
                        .notes_file
                        .as_ref()
                        .unwrap()
                        .filename
                        .clone(),
                },
            )
            .unwrap();
        assert!(matches!(&*opened, Response::NoteOpened { .. }));
        wait(client.quit()).unwrap();
        let mut after_quit = request;
        if let Request::Configure {
            request_id,
            expected_version,
            ..
        } = &mut after_quit
        {
            *request_id = client.request_id();
            *expected_version = repaired.version;
        }
        assert!(matches!(
            &*client.content(Access::View(binding), after_quit).unwrap(),
            Response::Rejected { .. }
        ));
        external.close().unwrap();
    }));
    if socket.exists() {
        cleanup.server_stop().unwrap();
    }
    cleanup.close().unwrap();
    drop(client);
    fs::remove_dir_all(profile).unwrap();
    checked.unwrap();
}
