use crate::workspace::Model;
use voyager_contract::{Action, Axis, Context, FleetId};

#[test]
fn scoped_creation_and_split_keep_existing_identity() {
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "Voyager".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let voyage = &model.layout.voyages[0];
    let fleet = voyage.fleets[0].id.clone();
    let original = voyage.fleets[0].vessels[0].clone();
    model
        .apply(Action::Split {
            fleet: fleet.clone(),
            after: original.id.clone(),
            axis: Axis::Horizontal,
        })
        .unwrap();
    assert_eq!(model.layout.voyages[0].fleets[0].vessels.len(), 2);
    assert_eq!(model.layout.voyages[0].fleets[0].vessels[0], original);
    model
        .apply(Action::Dock {
            context: Context::Fleet { id: fleet },
        })
        .unwrap();
    assert!(matches!(model.layout.context, Context::Fleet { .. }));
}

#[test]
fn absent_target_cannot_change_layout() {
    let mut model = Model::default();
    let before = model.layout.clone();
    assert!(
        model
            .apply(Action::SelectFleet {
                id: FleetId("missing".into())
            })
            .is_err()
    );
    assert_eq!(model.layout, before);
}

#[test]
fn real_core_saves_and_refuses_stale_or_changed_request_identity() {
    use crate::{client::Client, core::Core};
    use voyager_contract::{Request, Status};
    let session = format!("voyager-p1-test-{}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    let call = |action, expected_version| {
        client
            .call(Request {
                request_id: client.request_id(),
                action,
                expected_version,
            })
            .unwrap()
    };
    let initial = call(Action::Inspect, 0);
    assert_eq!(initial.status, Status::Applied);
    let voyage = initial.layout.voyages[0].id.clone();
    let request = Request {
        request_id: client.request_id(),
        expected_version: initial.version,
        action: Action::CreateFleet {
            voyage,
            name: "Second fleet".into(),
        },
    };
    let saved = client.call(request.clone()).unwrap();
    let duplicate = client.call(request.clone()).unwrap();
    let mut changed = request.clone();
    changed.action = Action::Inspect;
    let refused_identity = client.call(changed).unwrap();
    let stale = call(
        Action::Dock {
            context: Context::Workspace,
        },
        initial.version,
    );
    let final_state = call(Action::Inspect, 0);
    let mut cleanup = Core::connect(&session).unwrap();
    cleanup.rpc("doc.set", serde_json::json!({
        "name": "voyager-layout-v1", "value": final_state.layout, "version": final_state.version,
    })).unwrap();
    let external_conflict = call(
        Action::Dock {
            context: Context::Workspace,
        },
        final_state.version,
    );
    let refreshed = call(Action::Inspect, 0);
    let retained_outcome = client.call(request).unwrap();
    let stopped = cleanup.rpc("server.stop", serde_json::json!({}));
    cleanup.close().unwrap();
    assert_eq!(saved.status, Status::Applied);
    assert_eq!(saved, duplicate);
    assert_eq!(refused_identity.status, Status::Rejected);
    assert_eq!(stale.status, Status::Rejected);
    assert_eq!(final_state.layout.voyages[0].fleets.len(), 2);
    assert_eq!(external_conflict.status, Status::Rejected);
    assert!(!external_conflict.fresh);
    assert!(refreshed.fresh);
    assert!(refreshed.version > final_state.version);
    assert_eq!(retained_outcome.status, Status::Applied);
    assert!(std::sync::Arc::ptr_eq(
        &refreshed.layout,
        &retained_outcome.layout
    ));
    assert!(stopped.is_ok());
}

#[test]
fn a_voyage_portal_retains_its_identity_while_fleets_change() {
    use voyager_contract::RenameTarget;
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "Workspace".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let voyage = model.layout.voyages[0].id.clone();
    model
        .apply(Action::CreatePortal {
            voyage: voyage.clone(),
        })
        .unwrap();
    let portal = model.layout.voyages[0].portals[0].clone();
    model
        .apply(Action::Rename {
            target: RenameTarget::Portal {
                id: portal.id.clone(),
            },
            name: "Voyage terminal".into(),
        })
        .unwrap();
    model
        .apply(Action::CreateFleet {
            voyage,
            name: "Second".into(),
        })
        .unwrap();
    let retained = &model.layout.voyages[0].portals[0];
    assert_eq!(retained.id, portal.id);
    assert_eq!(retained.content, portal.content);
    assert_eq!(retained.name.as_deref(), Some("Voyage terminal"));
    model
        .apply(Action::Dock {
            context: Context::Portal { id: portal.id },
        })
        .unwrap();
    assert!(matches!(model.layout.context, Context::Portal { .. }));
    assert_eq!(model.layout.contents.len(), 3);
}

#[test]
fn administrator_scope_refuses_another_voyage_without_changing_it() {
    use crate::{client::Client, core::Core};
    use voyager_contract::{Request, Status};
    let session = format!("voyager-c2-scope-test-{}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    let call = |action, expected_version| {
        client
            .call(Request {
                request_id: client.request_id(),
                expected_version,
                action,
            })
            .unwrap()
    };
    let initial = call(Action::Inspect, 0);
    let scope = Context::Voyage {
        id: initial.layout.voyages[0].id.clone(),
    };
    let other = call(
        Action::CreateVoyage {
            name: "Other".into(),
            cwd: "/tmp".into(),
        },
        initial.version,
    );
    let other_id = other.layout.voyages[1].id.clone();
    let inspect = client
        .scoped_call(
            scope.clone(),
            Request {
                request_id: client.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            },
        )
        .unwrap();
    let refused = client
        .scoped_call(
            scope,
            Request {
                request_id: client.request_id(),
                expected_version: inspect.version,
                action: Action::CreateFleet {
                    voyage: other_id,
                    name: "Outside".into(),
                },
            },
        )
        .unwrap();
    let observed = call(Action::Inspect, 0);
    let mut cleanup = Core::connect(&session).unwrap();
    cleanup.rpc("server.stop", serde_json::json!({})).unwrap();
    cleanup.close().unwrap();
    assert_eq!(inspect.layout.voyages.len(), 1);
    assert_eq!(refused.status, Status::Rejected);
    assert_eq!(observed.layout.voyages[1].fleets.len(), 1);
}

#[test]
fn process_owner_binds_scope_identity_receipts_and_ended_reads() {
    use crate::{client::Client, core::Core};
    use std::{
        panic, thread,
        time::{Duration, Instant},
    };
    use voyager_contract::{
        ContentId, Request, Status,
        administrator::{ProcessAction, ProcessInput, ProcessOutput, ProcessRequest},
    };
    let session = format!("voyager-c2-process-test-{}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    let checked = panic::catch_unwind(|| {
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
        let _viewer = client
            .terminal(content.clone(), client.request_id(), initial.version)
            .unwrap();
        let bound = inspect();
        let revision = std::cell::Cell::new(bound.version);
        let process = |action| ProcessRequest {
            request_id: client.request_id(),
            input: ProcessInput {
                expected_version: revision.get(),
                action,
            },
        };
        let list = client
            .process(Context::Workspace, process(ProcessAction::List))
            .unwrap();
        let Some(ProcessOutput::List { processes, .. }) = &list.output else {
            panic!("Missing actual process list: {list:?}")
        };
        let target = processes
            .iter()
            .find(|item| item.content_id == content)
            .unwrap()
            .clone();
        let pid = target.pid.unwrap();
        let send = |content_id, text| ProcessAction::Send {
            content_id,
            terminal_id: target.terminal_id.clone(),
            pid,
            text,
        };
        let mut external = Core::connect(&session).unwrap();
        let bumped = external.rpc("doc.set", serde_json::json!({"name":"voyager-layout-v1","version":bound.version,"value":bound.layout})).unwrap();
        let stale = client
            .process(
                Context::Workspace,
                process(send(content.clone(), "printf 'FORG%s\\n' ED".into())),
            )
            .unwrap();
        assert_eq!(stale.status, Status::Rejected);
        assert!(
            stale
                .message
                .as_deref()
                .unwrap()
                .contains("revision changed")
        );
        assert_eq!(stale.version, bumped["version"].as_u64().unwrap());
        revision.set(inspect().version);
        let mut moved = (*bound.layout).clone();
        moved.contents[0].backend = Some(voyager_contract::CoreTerminalId("t999999".into()));
        let changed = external.rpc("doc.set", serde_json::json!({"name":"voyager-layout-v1","version":bumped["version"],"value":moved})).unwrap();
        let external_refusal = client
            .process(
                Context::Workspace,
                process(send(content.clone(), "printf 'FORG%s\\n' ED".into())),
            )
            .unwrap();
        assert_eq!(external_refusal.status, Status::Rejected);
        assert_eq!(
            external_refusal.version,
            changed["version"].as_u64().unwrap()
        );
        external.rpc("doc.set", serde_json::json!({"name":"voyager-layout-v1","version":changed["version"],"value":bound.layout})).unwrap();
        revision.set(inspect().version);
        let refused = client
            .process(
                Context::Workspace,
                process(send(
                    ContentId("outside".into()),
                    "printf 'FORG%s\\n' ED".into(),
                )),
            )
            .unwrap();
        assert_eq!(refused.status, Status::Rejected);
        let wrong_pid = ProcessAction::Send {
            content_id: content.clone(),
            terminal_id: target.terminal_id.clone(),
            pid: 0,
            text: "printf 'FORG%s\\n' ED".into(),
        };
        assert_eq!(
            client
                .process(Context::Workspace, process(wrong_pid))
                .unwrap()
                .status,
            Status::Rejected
        );
        let scope = Context::Vessel {
            id: initial.layout.voyages[0].fleets[0].vessels[0].id.clone(),
        };
        let request = process(send(content.clone(), "printf 'C2_%s\\n' PROCESS".into()));
        let sent = client.process(scope.clone(), request.clone()).unwrap();
        assert_eq!(sent.status, Status::Applied);
        let replay = client.process(scope.clone(), request.clone()).unwrap();
        assert!(std::sync::Arc::ptr_eq(&sent, &replay));
        let changed = ProcessRequest {
            input: ProcessInput {
                action: send(content.clone(), "printf 'FORG%s\\n' ED".into()),
                ..request.input.clone()
            },
            ..request
        };
        assert_eq!(
            client.process(scope.clone(), changed).unwrap().status,
            Status::Rejected
        );
        let read = || {
            client
                .process(
                    scope.clone(),
                    process(ProcessAction::Read {
                        content_id: content.clone(),
                        terminal_id: target.terminal_id.clone(),
                        lines: 160,
                    }),
                )
                .unwrap()
        };
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let response = read();
            let Some(ProcessOutput::Read { text, .. }) = &response.output else {
                panic!("Missing terminal read")
            };
            assert!(!text.lines().any(|line| line == "FORGED"));
            if text.lines().any(|line| line == "C2_PROCESS") {
                break;
            }
            assert!(
                Instant::now() < deadline,
                "Submitted input produced no real output"
            );
            thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(
            client
                .process(
                    scope.clone(),
                    process(send(content.clone(), "sleep 30".into()))
                )
                .unwrap()
                .status,
            Status::Applied
        );
        let started = Instant::now() + Duration::from_secs(10);
        loop {
            let running = read();
            if matches!(&running.output, Some(ProcessOutput::Read { target, .. }) if target.foreground.as_deref() == Some("sleep"))
            {
                break;
            }
            assert!(
                Instant::now() < started,
                "Submitted sleep was not observed running"
            );
            thread::sleep(Duration::from_millis(10));
        }
        let interrupted = client
            .process(
                scope.clone(),
                process(ProcessAction::Interrupt {
                    content_id: content.clone(),
                    terminal_id: target.terminal_id.clone(),
                    pid,
                }),
            )
            .unwrap();
        assert!(
            matches!(&interrupted.output, Some(ProcessOutput::Interrupt { key, outcome, .. }) if key == "ctrl+c" && outcome == "stopped"),
            "{interrupted:?}"
        );
        assert_eq!(
            client
                .process(scope.clone(), process(send(content.clone(), "exit".into())))
                .unwrap()
                .status,
            Status::Applied
        );
        loop {
            let response = read();
            if matches!(&response.output, Some(ProcessOutput::Read { target, .. }) if target.state == "finished")
            {
                break;
            }
            assert!(Instant::now() < deadline, "Shell did not finish");
            thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(read().status, Status::Applied);
        assert_eq!(
            client
                .process(
                    scope,
                    process(send(content, "printf 'FORG%s\\n' ED".into()))
                )
                .unwrap()
                .status,
            Status::Rejected
        );
    });
    let mut cleanup = Core::connect(&session).unwrap();
    cleanup.rpc("server.stop", serde_json::json!({})).unwrap();
    checked.unwrap();
}
