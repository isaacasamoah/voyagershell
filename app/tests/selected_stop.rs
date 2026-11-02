use serde_json::{Value, json};
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
            .rpc(
                "terminal.run",
                json!({"argv":["/bin/sleep","60"],"cwd":"/tmp","keep":false}),
            )
            .unwrap();
        let mut core = Core::connect(&session).unwrap();
        eprintln!(
            "Selected Stop test identity: {}",
            json!({
                "session": session,
                "core": core.rpc("server.status", json!({})).unwrap()["pid"],
                "target": target,
                "sibling": survivor,
                "otherSession": other_session,
                "otherCore": other.rpc("server.status", json!({})).unwrap()["pid"],
                "otherTerminal": unrelated["address"],
                "otherPid": unrelated["pid"]
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
        let expected: Value = core
            .rpc("terminal.get", json!({"terminal":target.terminal_id}))
            .unwrap();
        assert_eq!(expected["pid"], json!(target.pid));
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
            (&mut core, &json!(survivor.terminal_id), json!(survivor.pid)),
            (&mut other, &unrelated["address"], unrelated["pid"].clone()),
        ] {
            let actual = connection
                .rpc("terminal.get", json!({"terminal":terminal}))
                .unwrap();
            assert_eq!(actual["state"], "live");
            assert_eq!(actual["pid"], pid);
        }
    }));
    let stopped = Core::connect(&session).and_then(|mut core| core.rpc("server.stop", json!({})));
    let other_stopped = other.rpc("server.stop", json!({}));
    eprintln!("Owned test cleanup: {session} {stopped:?}; {other_session} {other_stopped:?}");
    assert!(stopped.is_ok(), "{stopped:?}");
    assert!(other_stopped.is_ok(), "{other_stopped:?}");
    checked.unwrap();
}
