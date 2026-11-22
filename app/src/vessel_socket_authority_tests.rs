use super::tests::{recorded, services, terminal};
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

fn resize() -> Action {
    Action::ResizePlacementSplit {
        owner: PlacementOwner::Fleet {
            id: voyager_contract::FleetId("fleet-2".into()),
        },
        path: Vec::new(),
        share: voyager_contract::SplitShare::try_from(4000).unwrap(),
    }
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
        ("resize", resize(), RESIZE_NOT_OFFERED),
    ];
    for (name, action, refusal) in cases {
        let (call, seen) = recorded();
        let binding = Binding::unbound();
        binding.bind(terminal("t8")).unwrap();
        let line = workspace_line(name, action.clone());
        let vessel = VesselId("vessel-1".into());
        let refused = answer(
            &services(&call),
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
            &services(&call),
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
    for action in [
        in_current_fleet(),
        maximize(true),
        maximize(false),
        resize(),
    ] {
        let line = workspace_line("unbound", action);
        for id in ["t8", "t9"] {
            let reply = answer(
                &services(&call),
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
        &services(&call),
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
            &services(&call),
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
            &services(&call),
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
        &services(&call),
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

#[test]
fn overview_shows_the_whole_layout_to_voyager_and_to_any_other_caller_alike_and_status_is_unchanged()
 {
    use super::tests::{answering, workspace};
    use voyager_contract::socket::Overview;
    let layout = workspace();
    let own = layout.voyages[0].fleets[0].placements[0].vessel.clone();
    let call = answering(layout);
    let binding = Binding::unbound();
    binding.bind(terminal("t8")).unwrap();
    let ask = |vessel: &VesselId, address: &str, command: &str| {
        answer(
            &services(&call),
            &binding,
            &Mutex::default(),
            &Replies::default(),
            vessel,
            &terminal(address),
            command,
        )
    };
    let overview = |vessel: &VesselId, address: &str| -> Overview {
        match ask(vessel, address, r#"{"command":"overview"}"#) {
            SocketReply::Overview { overview } => overview,
            other => panic!("overview was not answered: {other:?}"),
        }
    };
    let voyager = overview(&own, "t8");
    let other = overview(&VesselId("another".into()), "t9");
    let pieces = |overview: &Overview| {
        overview
            .voyages
            .iter()
            .flat_map(|voyage| &voyage.fleets)
            .flat_map(|fleet| &fleet.pieces)
            .map(|piece| (piece.placement.clone(), piece.you))
            .collect::<Vec<_>>()
    };
    assert_eq!(
        pieces(&voyager)
            .iter()
            .map(|(id, _)| id)
            .collect::<Vec<_>>(),
        pieces(&other).iter().map(|(id, _)| id).collect::<Vec<_>>()
    );
    assert!(pieces(&voyager).iter().any(|(_, you)| *you));
    assert!(pieces(&other).iter().all(|(_, you)| !*you));
    let SocketReply::Status { status } = ask(&own, "t8", r#"{"command":"status"}"#) else {
        panic!("status was not answered");
    };
    assert_eq!(voyager.status, status);
    assert!(
        status
            .placements
            .iter()
            .all(|placement| placement.name == "Terminal 1")
    );
}
