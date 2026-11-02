use crate::workspace::Model;
use voyager_contract::{Action, Axis, Context, FleetId};

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
