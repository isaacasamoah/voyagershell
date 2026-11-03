use voyager_app::workspace::Model;
use voyager_contract::Action;

#[test]
fn configured_codex_defaults_use_direct_literal_arguments() {
    use voyager_contract::launch::{Launch, LaunchSettings};
    let settings = LaunchSettings::default();
    let launch = &settings
        .entries
        .iter()
        .find(|entry| entry.id == "codex")
        .unwrap()
        .launch;
    assert_eq!(
        voyager_app::launch::argv(launch).unwrap(),
        [
            "codex",
            "--no-daemon",
            "--model",
            "gpt-6.1-sol",
            "-c",
            "model_reasoning_effort=\"high\"",
            "--dangerously-bypass-approvals-and-sandbox"
        ]
    );
    let changed: Launch = serde_json::from_value(serde_json::json!({
        "kind": "codex", "model": "chosen-model", "effort": "medium", "permissions": "read-only"
    }))
    .unwrap();
    let argv = voyager_app::launch::argv(&changed).unwrap();
    assert_eq!(argv[3], "chosen-model");
    assert!(argv.contains(&"model_reasoning_effort=\"medium\"".into()));
    assert!(
        argv.windows(2)
            .any(|pair| pair == ["--sandbox", "read-only"])
    );
    assert!(!argv.iter().any(|value| value.contains("bypass")));
    assert!(voyager_app::launch::argv(&Launch::Program { argv: vec![] }).is_err());
    let program = Launch::Program {
        argv: vec!["sh".into(), "literal; no expansion".into()],
    };
    let argv = voyager_app::launch::command(&program, "/tmp").unwrap();
    assert!(std::path::Path::new(&argv[0]).is_absolute());
    assert_eq!(argv[1], "literal; no expansion");
}

#[test]
fn profile_choices_reload_without_replacing_missing_programs() {
    use voyager_contract::launch::{Launch, LaunchEntry, LaunchSettings};
    let path = std::env::temp_dir().join(format!("voyager-launches-{}.json", std::process::id()));
    let checked = std::panic::catch_unwind(|| {
        let mut settings = LaunchSettings::default();
        settings.entries.push(LaunchEntry {
            id: "missing".into(),
            name: "Missing worker".into(),
            launch: Launch::Program {
                argv: vec!["/no-voyager-worker-here".into()],
            },
        });
        std::fs::write(&path, serde_json::to_vec(&settings).unwrap()).unwrap();
        let catalog = voyager_app::launch::catalog(Some(&path), "/tmp").unwrap();
        assert!(catalog.available.contains(&"terminal".into()));
        assert!(!catalog.available.contains(&"missing".into()));
        assert!(
            catalog
                .errors
                .iter()
                .any(|error| error.starts_with("Missing worker is unavailable:"))
        );
        settings.default = "codex".into();
        std::fs::write(&path, serde_json::to_vec(&settings).unwrap()).unwrap();
        assert_eq!(
            voyager_app::launch::catalog(Some(&path), "/tmp")
                .unwrap()
                .settings
                .default,
            "codex"
        );
        std::fs::write(&path, "broken settings").unwrap();
        assert!(voyager_app::launch::catalog(Some(&path), "/tmp").is_err());
    });
    std::fs::remove_file(path).unwrap();
    checked.unwrap();
}

#[test]
fn explicit_worker_creation_binds_only_its_new_content() {
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "Workers".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let original = model.layout.contents[0].clone();
    let fleet = model.layout.selected_fleet.clone().unwrap();
    let after = model.layout.voyages[0].fleets[0].vessels[0].id.clone();
    let mut request = serde_json::json!({
        "operation": "create-content", "typeId": "terminal",
        "destination": {"kind": "vessel", "fleet": fleet, "after": after, "axis": "horizontal"},
        "launch": {"kind": "codex", "model": "gpt-6.1-sol", "effort": "high", "permissions": "yolo"}
    });
    let create: Action = serde_json::from_value(request.clone()).unwrap();
    model.apply(create).unwrap();
    assert_eq!(model.layout.contents[0], original);
    let worker = serde_json::to_value(model.layout.contents.last().unwrap()).unwrap();
    assert_eq!(worker["launch"], request["launch"]);
    assert!(worker["backend"].is_null());
    let before = model.layout.clone();
    request["typeId"] = "notes".into();
    assert!(
        model
            .apply(serde_json::from_value(request).unwrap())
            .is_err()
    );
    assert_eq!(model.layout, before);
}

#[test]
#[cfg(target_os = "linux")]
fn refused_worker_keeps_its_choice_and_reopening_grants_no_start() {
    use voyager_app::{
        client::Client,
        core::{Core, Error},
    };
    use voyager_contract::{Request, Status};
    let session = format!("voyager-launch-bound-{}", std::process::id());
    let socket = std::path::PathBuf::from(
        std::env::var_os("XDG_RUNTIME_DIR").expect("private XDG runtime is required"),
    )
    .join("herdr-core")
    .join(format!("{session}.sock"));
    assert!(!socket.exists());
    let mut core = Core::connect(&session).unwrap();
    let client = Client::open(session.clone(), "/tmp".into());
    let checked = std::panic::catch_unwind(|| {
        let initial = client
            .call(Request {
                request_id: client.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            })
            .unwrap();
        let fleet = &initial.layout.voyages[0].fleets[0];
        let action: Action = serde_json::from_value(serde_json::json!({
            "operation":"create-content", "typeId":"terminal",
            "destination":{"kind":"vessel", "fleet":fleet.id, "after":fleet.vessels[0].id, "axis":"horizontal"},
            "launch":{"kind":"program", "argv":["/no-voyager-worker-here"]}
        })).unwrap();
        let request = Request {
            request_id: client.request_id(),
            expected_version: initial.version,
            action,
        };
        let created = client.call(request.clone()).unwrap();
        assert_eq!(created.status, Status::Applied);
        let mut changed = request.clone();
        if let Action::CreateContent { launch, .. } = &mut changed.action {
            *launch = Some(voyager_contract::launch::Launch::Terminal);
        }
        let changed = client.call(changed).unwrap();
        assert_eq!(changed.status, Status::Rejected);
        assert!(
            changed
                .message
                .as_deref()
                .is_some_and(|message| message.contains("Changed request identity"))
        );
        let id = created.layout.contents.last().unwrap().id.clone();
        let refused = client.terminal(id.clone(), client.request_id(), created.version);
        assert!(matches!(refused, Err(Error::Rejected { .. })));
        let inspected = client
            .call(Request {
                request_id: client.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            })
            .unwrap();
        let worker = inspected
            .layout
            .contents
            .iter()
            .find(|item| item.id == id)
            .unwrap();
        assert!(worker.backend.is_none() && worker.start_pending.is_none());
        assert_eq!(
            worker.launch,
            created.layout.contents.last().unwrap().launch
        );
        assert_eq!(client.call(request).unwrap().status, Status::Applied);
        assert_eq!(inspected.layout.contents.len(), 2);
        let reopened = Client::open(session.clone(), "/tmp".into());
        let snapshot = reopened
            .call(Request {
                request_id: reopened.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            })
            .unwrap();
        let denied = reopened.terminal(id, reopened.request_id(), snapshot.version);
        assert!(
            matches!(denied, Err(Error::Rejected { message, .. }) if message.contains("no new-creation permission"))
        );
        let after = reopened
            .call(Request {
                request_id: reopened.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            })
            .unwrap();
        assert_eq!(after.version, snapshot.version);
        assert_eq!(after.layout, snapshot.layout);
    });
    let status = core.server_status();
    let mut identities = Vec::new();
    if let Ok(status) = &status {
        for pid in std::iter::once(status.pid).chain(status.holders.iter().map(|holder| holder.pid))
        {
            let process = std::path::PathBuf::from(format!("/proc/{pid}"));
            let stat = std::fs::read_to_string(process.join("stat"));
            let executable = std::fs::read_link(process.join("exe"));
            identities.push(serde_json::json!({"pid":pid,
                "start":stat.as_ref().ok().and_then(|text| text.rsplit_once(") ")).and_then(|(_, tail)| tail.split_whitespace().nth(19)),
                "executable":executable.as_ref().ok(),
                "error":stat.err().or_else(|| executable.err()).map(|error| error.to_string())}));
        }
    }
    let stopped = core.server_stop();
    let closed = core.close();
    drop(client);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    let survivors = loop {
        let survivors: Vec<_> = identities
            .iter()
            .filter(|item| std::path::Path::new(&format!("/proc/{}", item["pid"])).exists())
            .cloned()
            .collect();
        if survivors.is_empty() || std::time::Instant::now() >= deadline {
            break survivors;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    };
    if let Some(path) = std::env::var_os("VOYAGER_LAUNCH_EVIDENCE") {
        std::fs::write(
            path,
            serde_json::to_vec_pretty(&serde_json::json!({
                "session":session,"status":status.as_ref().ok(),"identities":identities,
                "survivors":survivors,"socket":socket,"socketAbsent":!socket.exists(),
                "stopAcknowledged":stopped.is_ok(),"connectionClosed":closed.is_ok()
            }))
            .unwrap(),
        )
        .unwrap();
    }
    assert!(status.is_ok() && stopped.is_ok() && closed.is_ok());
    assert!(!identities.is_empty() && identities.iter().all(|item| item["error"].is_null()));
    assert!(
        survivors.is_empty() && !socket.exists(),
        "Owned Core cleanup did not settle"
    );
    checked.unwrap();
}
