use crate::workspace::Model;
use voyager_contract::{Action, Axis, Context, FleetId};

#[test]
fn home_and_saved_layouts_respect_captured_scope() {
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "First".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let voyage = model.layout.voyages[0].id.clone();
    let fleet = model.layout.voyages[0].fleets[0].id.clone();
    let vessel = model.layout.voyages[0].fleets[0].vessels[0].id.clone();
    model
        .apply(Action::SaveLayout {
            fleet: fleet.clone(),
            name: "Focus".into(),
        })
        .unwrap();
    model
        .apply(Action::CreatePortal {
            voyage: voyage.clone(),
        })
        .unwrap();
    let portal = model.layout.voyages[0].portals[0].id.clone();
    let layout = std::sync::Arc::new(model.layout.clone());
    for scope in [
        Context::Voyage { id: voyage },
        Context::Fleet { id: fleet.clone() },
    ] {
        assert!(crate::scope::check(&layout, Some(&scope), &Action::Home).is_ok());
        assert!(
            crate::scope::check(
                &layout,
                Some(&scope),
                &Action::LoadLayout {
                    fleet: fleet.clone(),
                    name: "Focus".into()
                }
            )
            .is_ok()
        );
        assert_eq!(
            crate::scope::project(&layout, Some(&scope))
                .saved_layouts
                .len(),
            1
        );
    }
    let narrow = Context::Vessel { id: vessel };
    assert!(crate::scope::check(&layout, Some(&narrow), &Action::Home).is_ok());
    assert!(
        crate::scope::check(
            &layout,
            Some(&narrow),
            &Action::LoadLayout {
                fleet: fleet.clone(),
                name: "Focus".into()
            }
        )
        .is_err()
    );
    assert!(
        crate::scope::project(&layout, Some(&narrow))
            .saved_layouts
            .is_empty()
    );
    let portal_scope = Context::Portal { id: portal };
    assert!(crate::scope::check(&layout, Some(&portal_scope), &Action::Home).is_ok());
    assert!(
        crate::scope::check(
            &layout,
            Some(&portal_scope),
            &Action::LoadLayout {
                fleet,
                name: "Focus".into()
            }
        )
        .is_err()
    );
    assert!(
        crate::scope::project(&layout, Some(&portal_scope))
            .saved_layouts
            .is_empty()
    );
}

#[test]
fn captured_fleet_layout_target_survives_later_navigation_without_retargeting() {
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "One".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let voyage = model.layout.voyages[0].id.clone();
    let original = model.layout.voyages[0].fleets[0].id.clone();
    model
        .apply(Action::SaveLayout {
            fleet: original.clone(),
            name: "Saved".into(),
        })
        .unwrap();
    let captured = Context::Fleet {
        id: original.clone(),
    };
    model
        .apply(Action::CreateFleet {
            voyage,
            name: "Other".into(),
        })
        .unwrap();
    let other = model.layout.voyages[0].fleets[1].id.clone();
    model.apply(Action::Home).unwrap();
    let layout = std::sync::Arc::new(model.layout.clone());
    let load = |fleet| Action::LoadLayout {
        fleet,
        name: "Saved".into(),
    };
    assert!(crate::scope::check(&layout, Some(&captured), &load(original)).is_ok());
    assert!(crate::scope::check(&layout, Some(&captured), &load(other)).is_err());
    let projected = crate::scope::project(&layout, Some(&captured));
    assert_eq!(projected.view, model.layout.view);
    assert_eq!(projected.saved_layouts.len(), 1);
}

#[test]
fn direct_arrangement_preserves_content_and_rejects_invalid_targets() {
    use voyager_contract::{PlacementId, Side, VoyageId};
    let mut model = Model::default();
    for name in ["First", "Second"] {
        model
            .apply(Action::CreateVoyage {
                name: name.into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
    }
    let first = model.layout.voyages[0].id.clone();
    let second = model.layout.voyages[1].id.clone();
    model
        .apply(Action::CreateFleet {
            voyage: first.clone(),
            name: "Next".into(),
        })
        .unwrap();
    let fleet_a = model.layout.voyages[0].fleets[0].id.clone();
    let fleet_b = model.layout.voyages[0].fleets[1].id.clone();
    let original = model.layout.voyages[0].fleets[0].vessels[0].id.clone();
    model
        .apply(Action::Split {
            fleet: fleet_a.clone(),
            after: original.clone(),
            axis: Axis::Horizontal,
        })
        .unwrap();
    let other = model.layout.voyages[0].fleets[0].vessels[1].id.clone();
    let contents = model.layout.contents.clone();
    let context = model.layout.context.clone();
    model
        .apply(Action::MoveVessel {
            id: other,
            target: original,
            side: Side::Left,
        })
        .unwrap();
    model
        .apply(Action::MoveFleet {
            id: fleet_b.clone(),
            target: fleet_a,
            before: true,
        })
        .unwrap();
    model
        .apply(Action::MoveVoyage {
            id: second.clone(),
            target: first,
            before: true,
        })
        .unwrap();
    assert_eq!(model.layout.voyages[0].id, second);
    assert_eq!(model.layout.voyages[1].fleets[0].id, fleet_b);
    assert_eq!(model.layout.contents, contents);
    assert_eq!(model.layout.context, context);
    let before = model.layout.clone();
    let missing = VoyageId("missing".into());
    assert!(
        model
            .apply(Action::MoveVoyage {
                id: missing.clone(),
                target: missing,
                before: true
            })
            .is_err()
    );
    assert_eq!(model.layout, before);
    let missing_placement = PlacementId("missing".into());
    assert!(
        model
            .apply(Action::MoveVessel {
                id: missing_placement.clone(),
                target: missing_placement,
                side: Side::Left
            })
            .is_err()
    );
    let foreign_fleet = model.layout.voyages[0].fleets[0].id.clone();
    assert!(
        model
            .apply(Action::MoveFleet {
                id: fleet_b.clone(),
                target: foreign_fleet,
                before: true
            })
            .is_err()
    );
    assert_eq!(model.layout, before);
    let scoped = std::sync::Arc::new(model.layout.clone());
    assert!(
        crate::scope::check(
            &scoped,
            Some(&Context::Voyage { id: second.clone() }),
            &Action::MoveVoyage {
                id: second.clone(),
                target: model.layout.voyages[1].id.clone(),
                before: false
            }
        )
        .is_err()
    );
    let voyage = model.layout.voyages[1].id.clone();
    let selected_fleet = model.layout.voyages[1].fleets[0].id.clone();
    let sibling_fleet = model.layout.voyages[1].fleets[1].id.clone();
    let move_fleet = Action::MoveFleet {
        id: selected_fleet.clone(),
        target: sibling_fleet,
        before: false,
    };
    assert!(
        crate::scope::check(&scoped, Some(&Context::Voyage { id: voyage }), &move_fleet).is_ok()
    );
    assert!(
        crate::scope::check(
            &scoped,
            Some(&Context::Fleet { id: selected_fleet }),
            &move_fleet
        )
        .is_err()
    );
}

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
    let initial_request = Request {
        request_id: client.request_id(),
        action: Action::Inspect,
        expected_version: 0,
    };
    let initial = client.call(initial_request.clone()).unwrap();
    let initial_replay = client.call(initial_request).unwrap();
    assert_eq!(initial.status, Status::Applied);
    assert!(initial.created_workspace);
    assert!(initial_replay.created_workspace);
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
    let reconnect = Client::open(session.clone(), "/tmp".into());
    let reopened = reconnect
        .call(Request {
            request_id: reconnect.request_id(),
            action: Action::Inspect,
            expected_version: 0,
        })
        .unwrap();
    drop(reconnect);
    assert!(!refreshed.created_workspace);
    assert!(!reopened.created_workspace);
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
fn saved_fleet_layout_restores_existing_placements_without_creating_backends() {
    use voyager_contract::{CoreTerminalId, Split};
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "Voyager".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let fleet = model.layout.voyages[0].fleets[0].id.clone();
    let first = model.layout.voyages[0].fleets[0].vessels[0].id.clone();
    model.layout.contents[0].backend = Some(CoreTerminalId("first".into()));
    model
        .apply(Action::Split {
            fleet: fleet.clone(),
            after: first,
            axis: Axis::Horizontal,
        })
        .unwrap();
    model.layout.contents[1].backend = Some(CoreTerminalId("second".into()));
    let saved = model.layout.voyages[0].fleets[0].root.clone();
    model
        .apply(Action::SaveLayout {
            fleet: fleet.clone(),
            name: "Focus".into(),
        })
        .unwrap();
    let second = model.layout.voyages[0].fleets[0].vessels[1].id.clone();
    model
        .apply(Action::Split {
            fleet: fleet.clone(),
            after: second,
            axis: Axis::Vertical,
        })
        .unwrap();
    model.layout.contents[2].backend = Some(CoreTerminalId("third".into()));
    let contents = model.layout.contents.clone();
    let placements = model.layout.voyages[0].fleets[0].vessels.clone();
    let context = model.layout.context.clone();
    model
        .apply(Action::LoadLayout {
            fleet: fleet.clone(),
            name: "Focus".into(),
        })
        .unwrap();
    assert_eq!(model.layout.voyages[0].fleets[0].root, saved);
    assert_eq!(model.layout.voyages[0].fleets[0].vessels, placements);
    assert_eq!(model.layout.contents, contents);
    assert_eq!(model.layout.context, context);
    assert!(matches!(saved, Split::Branch { .. }));
    let before = model.layout.clone();
    assert!(
        model
            .apply(Action::LoadLayout {
                fleet: FleetId("wrong".into()),
                name: "Focus".into()
            })
            .is_err()
    );
    assert_eq!(model.layout, before);
    let missing = voyager_contract::PlacementId("missing".into());
    model.layout.saved_layouts[0].root = Split::Leaf { placement: missing };
    let before = model.layout.clone();
    assert!(
        model
            .apply(Action::LoadLayout {
                fleet: fleet.clone(),
                name: "Focus".into()
            })
            .is_err()
    );
    assert_eq!(model.layout, before);
    let first_leaf = model.layout.voyages[0].fleets[0].vessels[0].id.clone();
    model.layout.saved_layouts[0].root = Split::Branch {
        axis: Axis::Horizontal,
        first: Box::new(Split::Leaf {
            placement: first_leaf.clone(),
        }),
        second: Box::new(Split::Leaf {
            placement: first_leaf,
        }),
    };
    let before = model.layout.clone();
    assert!(
        model
            .apply(Action::LoadLayout {
                fleet: fleet.clone(),
                name: "Focus".into()
            })
            .is_err()
    );
    assert_eq!(model.layout, before);
    model.layout.saved_layouts[0].root = saved;
    model.layout.contents[0].backend = None;
    model.layout.contents[0].start_pending = Some("unconfirmed".into());
    model
        .apply(Action::LoadLayout {
            fleet: fleet.clone(),
            name: "Focus".into(),
        })
        .unwrap();
    assert!(model.layout.contents[0].backend.is_none());
    assert_eq!(
        model.layout.contents[0].start_pending.as_deref(),
        Some("unconfirmed")
    );
    model.layout.contents.remove(0);
    let before = model.layout.clone();
    assert!(
        model
            .apply(Action::LoadLayout {
                fleet,
                name: "Focus".into()
            })
            .is_err()
    );
    assert_eq!(model.layout, before);
}

#[test]
fn home_navigation_does_not_change_explicit_context_or_create_content() {
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "Voyager".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let fleet = model.layout.voyages[0].fleets[0].id.clone();
    model
        .apply(Action::Dock {
            context: Context::Fleet { id: fleet },
        })
        .unwrap();
    let context = model.layout.context.clone();
    let contents = model.layout.contents.clone();
    model.apply(Action::Home).unwrap();
    assert_eq!(model.layout.context, context);
    assert_eq!(model.layout.contents, contents);
    assert_eq!(model.layout.view, voyager_contract::WorkspaceView::Home);
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

#[test]
fn scoped_creation_eligibility_is_consumed_and_never_replayed() {
    use crate::{client::Client, core::Core};
    use voyager_contract::{Request, Status};
    let session = format!("voyager-created-eligibility-{}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let inspect = || Request {
            request_id: client.request_id(),
            expected_version: 0,
            action: Action::Inspect,
        };
        let initial = client.call(inspect()).unwrap();
        let old = initial.layout.contents[0].id.clone();
        assert!(initial.created_contents.is_empty());
        let voyage = initial.layout.voyages[0].id.clone();
        let request = Request {
            request_id: client.request_id(),
            expected_version: initial.version,
            action: Action::CreateFleet {
                voyage: voyage.clone(),
                name: "Agent Fleet".into(),
            },
        };
        let created = client
            .scoped_call(Context::Voyage { id: voyage.clone() }, request.clone())
            .unwrap();
        assert_eq!(created.status, Status::Applied);
        let new = created
            .layout
            .contents
            .iter()
            .find(|item| item.id != old)
            .unwrap()
            .id
            .clone();
        let home = client
            .call(Request {
                request_id: client.request_id(),
                expected_version: created.version,
                action: Action::Home,
            })
            .unwrap();
        assert_eq!(home.created_contents, vec![new.clone()]);
        let hidden = client.terminal(new.clone(), client.request_id(), home.version);
        assert!(matches!(hidden, Err(crate::core::Error::Rejected { .. })));
        let fleet = created.layout.selected_fleet.clone().unwrap();
        let visible = client
            .call(Request {
                request_id: client.request_id(),
                expected_version: home.version,
                action: Action::SelectFleet { id: fleet },
            })
            .unwrap();
        assert_eq!(visible.created_contents, vec![new.clone()]);
        let viewer = client
            .terminal(new.clone(), client.request_id(), visible.version)
            .unwrap();
        drop(viewer);
        let after = client.call(inspect()).unwrap();
        assert!(after.created_contents.is_empty());
        let replay = client
            .scoped_call(Context::Voyage { id: voyage }, request)
            .unwrap();
        assert!(replay.created_contents.is_empty());
        let reopened = Client::open(session.clone(), "/tmp".into());
        let observed = reopened
            .call(Request {
                request_id: reopened.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            })
            .unwrap();
        assert!(observed.created_contents.is_empty());
    }));
    let mut core = Core::connect(&session).unwrap();
    let stopped = core.rpc("server.stop", serde_json::json!({}));
    core.close().unwrap();
    checked.unwrap();
    assert!(stopped.is_ok());
}
