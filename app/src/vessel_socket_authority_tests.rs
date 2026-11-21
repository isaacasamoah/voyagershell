use super::tests::{recorded, terminal};
use super::*;

fn workspace_line(id: &str, action: Action) -> String {
    serde_json::to_string(&SocketRequest::Workspace {
        request: Box::new(Request {
            request_id: id.into(),
            expected_version: 1,
            action,
        }),
    })
    .unwrap()
}

fn create_vessel(owner: PlacementOwner) -> Action {
    Action::CreateVessel {
        type_id: "terminal".into(),
        destination: ContentDestination::Placement {
            owner,
            insertion: voyager_contract::PlacementInsertion::Empty,
        },
        launch: None,
    }
}

fn in_current_fleet() -> Action {
    create_vessel(PlacementOwner::Fleet {
        id: voyager_contract::FleetId("fleet-2".into()),
    })
}

fn beside(owner: PlacementOwner) -> Action {
    Action::CreateVessel {
        type_id: "terminal".into(),
        destination: ContentDestination::Placement {
            owner,
            insertion: voyager_contract::PlacementInsertion::Beside {
                id: voyager_contract::PlacementId("placement-3".into()),
                side: voyager_contract::Side::Right,
            },
        },
        launch: None,
    }
}

fn beside_in_fleet() -> Action {
    beside(PlacementOwner::Fleet {
        id: voyager_contract::FleetId("fleet-2".into()),
    })
}

fn beside_in_portals() -> Action {
    beside(PlacementOwner::Portals {
        voyage: voyager_contract::VoyageId("voyage-1".into()),
    })
}

fn maximize(maximized: bool) -> Action {
    Action::SetPlacementMaximized {
        id: voyager_contract::PlacementId("placement-3".into()),
        maximized,
    }
}

#[test]
fn creating_a_vessel_with_no_placement_to_sit_beside_and_maximizing_one_are_offered_only_to_the_bound_terminal()
 {
    let cases = [
        ("create-vessel", in_current_fleet(), VESSEL_NOT_OFFERED),
        ("maximize", maximize(true), MAXIMIZE_NOT_OFFERED),
        ("restore", maximize(false), MAXIMIZE_NOT_OFFERED),
    ];
    for (name, action, refusal) in cases {
        let (call, seen) = recorded();
        let binding = Binding::unbound();
        binding.bind(terminal("t8")).unwrap();
        let line = workspace_line(name, action.clone());
        let vessel = VesselId("vessel-1".into());
        let refused = answer(
            &call,
            &binding,
            &Mutex::default(),
            &Replies::default(),
            &vessel,
            &terminal("t9"),
            &line,
        );
        assert_eq!(
            refused,
            SocketReply::Refused {
                message: refusal.into()
            },
            "{name}"
        );
        assert!(seen.lock().unwrap().is_empty(), "{name}");
        let accepted = answer(
            &call,
            &binding,
            &Mutex::default(),
            &Replies::default(),
            &vessel,
            &terminal("t8"),
            &line,
        );
        assert!(
            matches!(
                accepted,
                SocketReply::Workspace {
                    reply: Reply::Answered(_)
                }
            ),
            "{name}"
        );
        assert_eq!(seen.lock().unwrap().as_slice(), [action], "{name}");
    }
}

#[test]
fn creating_a_vessel_and_maximizing_are_refused_from_every_terminal_while_nothing_is_bound() {
    let (call, seen) = recorded();
    let binding = Binding::unbound();
    for action in [in_current_fleet(), maximize(true), maximize(false)] {
        let line = workspace_line("unbound", action);
        for id in ["t8", "t9"] {
            let reply = answer(
                &call,
                &binding,
                &Mutex::default(),
                &Replies::default(),
                &VesselId("vessel-1".into()),
                &terminal(id),
                &line,
            );
            assert!(matches!(reply, SocketReply::Refused { .. }), "{id}");
        }
    }
    assert!(seen.lock().unwrap().is_empty());
}

#[test]
fn voyager_creates_a_vessel_in_a_fleet_and_not_as_a_portal() {
    let (call, seen) = recorded();
    let binding = Binding::unbound();
    binding.bind(terminal("t8")).unwrap();
    let portal = create_vessel(PlacementOwner::Portals {
        voyage: voyager_contract::VoyageId("voyage-1".into()),
    });
    let reply = answer(
        &call,
        &binding,
        &Mutex::default(),
        &Replies::default(),
        &VesselId("vessel-1".into()),
        &terminal("t8"),
        &workspace_line("portal-1", portal),
    );
    assert_eq!(
        reply,
        SocketReply::Refused {
            message: VESSEL_NOT_IN_FLEET.into()
        }
    );
    assert!(seen.lock().unwrap().is_empty());
}

#[test]
fn any_vessel_may_create_a_vessel_beside_a_placement_of_a_fleet() {
    for (name, bound, caller) in [
        ("nothing bound", false, "t9"),
        ("another terminal", true, "t9"),
        ("the bound terminal", true, "t8"),
    ] {
        let (call, seen) = recorded();
        let binding = Binding::unbound();
        if bound {
            binding.bind(terminal("t8")).unwrap();
        }
        let reply = answer(
            &call,
            &binding,
            &Mutex::default(),
            &Replies::default(),
            &VesselId("vessel-1".into()),
            &terminal(caller),
            &workspace_line(name, beside_in_fleet()),
        );
        assert!(
            matches!(
                reply,
                SocketReply::Workspace {
                    reply: Reply::Answered(_)
                }
            ),
            "{name}"
        );
        assert_eq!(
            seen.lock().unwrap().as_slice(),
            [beside_in_fleet()],
            "{name}"
        );
    }
}

#[test]
fn a_vessel_other_than_voyager_creating_with_no_placement_to_sit_beside_is_told_to_place_beside() {
    let (call, seen) = recorded();
    let binding = Binding::unbound();
    binding.bind(terminal("t8")).unwrap();
    let portal_beside = beside_in_portals();
    for (name, action) in [
        ("empty insertion", in_current_fleet()),
        ("portal beside", portal_beside.clone()),
    ] {
        let reply = answer(
            &call,
            &binding,
            &Mutex::default(),
            &Replies::default(),
            &VesselId("vessel-1".into()),
            &terminal("t9"),
            &workspace_line(name, action),
        );
        assert_eq!(
            reply,
            SocketReply::Refused {
                message: VESSEL_NOT_OFFERED.into()
            },
            "{name}"
        );
    }
    assert!(VESSEL_NOT_OFFERED.contains("beside a placement of a Fleet"));
    let reply = answer(
        &call,
        &binding,
        &Mutex::default(),
        &Replies::default(),
        &VesselId("vessel-1".into()),
        &terminal("t8"),
        &workspace_line("voyager-portal-beside", portal_beside),
    );
    assert_eq!(
        reply,
        SocketReply::Refused {
            message: VESSEL_NOT_IN_FLEET.into()
        }
    );
    assert!(seen.lock().unwrap().is_empty());
}
