use serde_json::json;
use std::{panic, time::SystemTime};
use voyager_app::{client::Client, core::Core};
use voyager_contract::{
    Action, Context, Request, Status,
    administrator::{ProcessAction, ProcessInput, ProcessOutput, ProcessRequest},
};

#[test]
fn selected_stop_retains_its_receipt_and_leaves_other_programs_running() {
    let suffix = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let session = format!("voyager-stop-{}-{suffix}", std::process::id());
    let other_session = format!("{session}-other");
    let client = Client::open(session.clone(), "/tmp".into());
    let mut other = Core::connect(&other_session).unwrap();
    let checked = panic::catch_unwind(panic::AssertUnwindSafe(|| {
        let inspect = || {
            client
                .call(Request {
                    request_id: client.request_id(),
                    expected_version: 0,
                    action: Action::Inspect,
                })
                .unwrap()
        };
        let initial = inspect();
        let first = initial.layout.contents[0].id.clone();
        let _viewer = client
            .terminal(first.clone(), client.request_id(), initial.version)
            .unwrap();
        let bound = inspect();
        let split = client
            .call(Request {
                request_id: client.request_id(),
                expected_version: bound.version,
                action: Action::CreateFleet {
                    voyage: bound.layout.voyages[0].id.clone(),
                    name: "Survivor".into(),
                },
            })
            .unwrap();
        let sibling = split.layout.contents.last().unwrap().id.clone();
        let _sibling = client
            .terminal(sibling.clone(), client.request_id(), split.version)
            .unwrap();
        let before = inspect();
        let request = |action| ProcessRequest {
            request_id: client.request_id(),
            input: ProcessInput {
                expected_version: before.version,
                action,
            },
        };
        let listed = client
            .process(Context::Workspace, request(ProcessAction::List))
            .unwrap();
        let Some(ProcessOutput::List { processes, .. }) = &listed.output else {
            panic!("The real process list is missing: {listed:?}")
        };
        let target = processes.iter().find(|p| p.content_id == first).unwrap();
        let survivor = processes.iter().find(|p| p.content_id == sibling).unwrap();
        let unrelated = other
            .terminal_run_with(
                serde_json::from_value(
                    json!({"argv":["/bin/sleep","60"],"cwd":"/tmp","keep":false}),
                )
                .unwrap(),
            )
            .unwrap();
        let mut core = Core::connect(&session).unwrap();
        eprintln!(
            "Selected Stop test identity: {}",
            json!({
                "session": session,
                "core": core.server_status().unwrap().pid,
                "target": target,
                "sibling": survivor,
                "otherSession": other_session,
                "otherCore": other.server_status().unwrap().pid,
                "otherTerminal": unrelated.address,
                "otherPid": unrelated.pid
            })
        );
        let stop = json!({
            "operation":"stop", "contentId":first, "terminalId":target.terminal_id,
            "pid":target.pid.unwrap()
        });
        let scope = Context::Vessel {
            id: initial.layout.voyages[0].fleets[0].vessels[0].id.clone(),
        };
        for (field, value) in [
            ("pid", json!(0)),
            ("pid", json!(target.pid.unwrap() + 1)),
            ("terminalId", json!(survivor.terminal_id)),
            ("contentId", json!(sibling)),
        ] {
            let mut wrong = stop.clone();
            wrong[field] = value;
            let refused = client
                .process(
                    scope.clone(),
                    request(serde_json::from_value(wrong).unwrap()),
                )
                .unwrap();
            assert_eq!(refused.status, Status::Rejected);
        }
        let expected = core.terminal_get(&target.terminal_id.0).unwrap();
        assert_eq!(expected.pid, target.pid);
        let stop_request = request(serde_json::from_value(stop).unwrap());
        let result = client.process(scope.clone(), stop_request.clone()).unwrap();
        assert_eq!(result.status, Status::Applied, "{result:?}");
        let value = serde_json::to_value(&*result).unwrap();
        assert_eq!(value["output"]["operation"], "stop");
        assert_eq!(value["output"]["target"]["pid"], json!(target.pid));
        assert_eq!(value["output"]["observed"]["state"], "finished");
        let repeated = client.process(scope.clone(), stop_request.clone()).unwrap();
        assert!(std::sync::Arc::ptr_eq(&result, &repeated));
        let mut changed = stop_request;
        changed.input.action = ProcessAction::List;
        assert_eq!(
            client.process(scope, changed).unwrap().status,
            Status::Rejected
        );
        assert_eq!(inspect().layout, before.layout);
        let ended = client
            .process(
                Context::Workspace,
                request(ProcessAction::Read {
                    content_id: first,
                    terminal_id: target.terminal_id.clone(),
                    lines: 0,
                }),
            )
            .unwrap();
        assert!(
            matches!(&ended.output, Some(ProcessOutput::Read { target: actual, .. }) if actual.state == "finished" && actual.terminal_id == target.terminal_id)
        );
        for (connection, terminal, pid) in [
            (&mut core, &survivor.terminal_id.0, survivor.pid),
            (&mut other, &unrelated.address, unrelated.pid),
        ] {
            let actual = connection.terminal_get(terminal).unwrap();
            assert_eq!(actual.state, "live");
            assert_eq!(actual.pid, pid);
        }
    }));
    let stopped = Core::connect(&session).and_then(|mut core| core.server_stop());
    let other_stopped = other.server_stop();
    eprintln!("Owned test cleanup: {session} {stopped:?}; {other_session} {other_stopped:?}");
    assert!(stopped.is_ok(), "{stopped:?}");
    assert!(other_stopped.is_ok(), "{other_stopped:?}");
    checked.unwrap();
}

#[test]
fn delayed_process_send_does_not_hold_workspace_inspection() {
    use std::time::{Duration, Instant};
    let session = format!("voyager-responsive-{}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    let checked = std::panic::catch_unwind(|| {
        let inspect = || {
            client
                .call(Request {
                    request_id: client.request_id(),
                    expected_version: 0,
                    action: Action::Inspect,
                })
                .unwrap()
        };
        let initial = inspect();
        let content = initial.layout.contents[0].id.clone();
        let viewer = client
            .terminal(content.clone(), client.request_id(), initial.version)
            .unwrap();
        let bound = inspect();
        let address = bound.layout.contents[0].backend.clone().unwrap();
        let mut observer = Core::connect(&session).unwrap();
        let ready_deadline = Instant::now() + Duration::from_secs(30);
        let mut screen = String::new();
        let mut unchanged = Instant::now();
        loop {
            let text = observer.terminal_read(&address.0, 0).unwrap().text;
            if text != screen {
                screen = text;
                unchanged = Instant::now();
            } else if !screen.trim().is_empty() && unchanged.elapsed() >= Duration::from_millis(300)
            {
                break;
            }
            assert!(
                Instant::now() < ready_deadline,
                "Shell prompt did not settle"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
        viewer.input(b"printf '\\033]7501;state=idle:app=voyager-proof\\033\\\\'; read -r proposal; sleep 10\r".to_vec()).unwrap();
        let deadline = Instant::now() + Duration::from_secs(8);
        let target = loop {
            let terminal = observer.terminal_get(&address.0).unwrap();
            let value = serde_json::to_value(&terminal).unwrap();
            if value.pointer("/status/state") == Some(&json!("idle")) {
                break terminal;
            }
            assert!(Instant::now() < deadline, "Controlled idle report missing");
            std::thread::sleep(Duration::from_millis(10));
        };
        let current = inspect();
        let request = ProcessRequest {
            request_id: client.request_id(),
            input: ProcessInput {
                expected_version: current.version,
                action: ProcessAction::Send {
                    content_id: content,
                    terminal_id: address.clone(),
                    pid: target.pid.unwrap(),
                    text: "RESPONSIVENESS_PROBE".into(),
                },
            },
        };
        let worker = client.clone();
        let dispatched = request.clone();
        let sending =
            std::thread::spawn(move || worker.process(Context::Workspace, dispatched).unwrap());
        while !observer
            .terminal_read(&address.0, 0)
            .unwrap()
            .text
            .contains("RESPONSIVENESS_PROBE")
        {
            assert!(Instant::now() < deadline, "Send was not observed");
            std::thread::sleep(Duration::from_millis(10));
        }
        let started = Instant::now();
        let inspected = inspect();
        let elapsed = started.elapsed();
        let duplicate = client.process(Context::Workspace, request.clone()).unwrap();
        assert_eq!(duplicate.status, Status::Rejected);
        assert!(
            duplicate
                .message
                .as_deref()
                .unwrap()
                .contains("still pending")
        );
        let dock = client
            .call(Request {
                request_id: client.request_id(),
                expected_version: inspected.version,
                action: Action::Dock {
                    context: Context::Voyage {
                        id: inspected.layout.voyages[0].id.clone(),
                    },
                },
            })
            .unwrap();
        assert_eq!(dock.status, Status::Applied);
        let sent = sending.join().unwrap();
        assert_eq!(*client.process(Context::Workspace, request).unwrap(), *sent);
        assert!(
            matches!(&sent.output, Some(ProcessOutput::Send { target, .. }) if target.terminal_id == address)
        );
        assert_eq!(sent.status, Status::Applied, "{sent:?}");
        assert!(inspected.fresh);
        eprintln!("Workspace inspection during delayed send: {elapsed:?}");
        assert!(
            elapsed < Duration::from_secs(1),
            "Workspace inspection was blocked for {elapsed:?}"
        );
    });
    Core::connect(&session).unwrap().server_stop().unwrap();
    checked.unwrap();
}
