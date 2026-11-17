use super::*;

fn two_voyages() -> (Model, VoyageId, FleetId, FleetId, VoyageId) {
    let mut model = Model {
        layout: Model::prepare(Layout::default(), "/tmp").unwrap(),
    };
    model
        .apply(Action::CreateVoyage {
            name: "A".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let a = model.layout.voyages[0].id.clone();
    let first = model.layout.voyages[0].fleets[0].id.clone();
    model
        .apply(Action::CreateFleet {
            voyage: a.clone(),
            name: "Second".into(),
        })
        .unwrap();
    let second = model.layout.voyages[0].fleets[1].id.clone();
    model
        .apply(Action::CreateVoyage {
            name: "B".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let b = model.layout.voyages[1].id.clone();
    (model, a, first, second, b)
}

#[test]
fn navigation_changes_only_the_navigation_record() {
    let (mut model, a, _, second, b) = two_voyages();
    let vessel = model.layout.voyages[0].fleets[1].placements[0].id.clone();
    let before = model.layout.clone();
    for action in [
        Action::SelectVoyage { id: a.clone() },
        Action::SelectFleet { id: second },
        Action::FocusVessel { id: vessel },
        Action::Dock {
            context: Context::Voyage { id: a },
        },
        Action::Home,
        Action::SelectVoyage { id: b },
    ] {
        assert!(action.is_navigation());
        model.apply(action).unwrap();
        assert!(before.same_structure(&model.layout));
    }
    assert_ne!(before, model.layout);
}

#[test]
fn a_voyage_reopens_on_its_last_used_fleet_and_vessel() {
    let (mut model, a, _, second, b) = two_voyages();
    model.apply(Action::SelectVoyage { id: a.clone() }).unwrap();
    assert_eq!(model.layout.selected_fleet.as_ref(), Some(&second));
    let vessel = model.layout.voyages[0].fleets[1].placements[0].id.clone();
    model
        .apply(Action::FocusVessel { id: vessel.clone() })
        .unwrap();
    model.apply(Action::SelectVoyage { id: b }).unwrap();
    model.apply(Action::SelectVoyage { id: a.clone() }).unwrap();
    assert_eq!(model.layout.selected_fleet.as_ref(), Some(&second));
    let entry = model
        .layout
        .navigation
        .iter()
        .find(|entry| entry.voyage == a)
        .unwrap();
    assert_eq!(entry.fleet, second);
    assert_eq!(entry.vessel.as_ref(), Some(&vessel));
}

#[test]
fn a_closed_last_used_fleet_falls_back_to_the_first_open_fleet() {
    let (mut model, a, first, second, b) = two_voyages();
    model.apply(Action::SelectVoyage { id: a.clone() }).unwrap();
    model.apply(Action::CloseFleet { id: second }).unwrap();
    model.apply(Action::SelectVoyage { id: b }).unwrap();
    model.apply(Action::SelectVoyage { id: a }).unwrap();
    assert_eq!(model.layout.selected_fleet, Some(first));
}

#[test]
fn a_vessel_outside_the_open_fleet_is_not_remembered() {
    let (mut model, a, first, _, _) = two_voyages();
    let elsewhere = model.layout.voyages[0].fleets[0].placements[0].id.clone();
    model.apply(Action::SelectVoyage { id: a }).unwrap();
    assert_ne!(model.layout.selected_fleet, Some(first));
    let before = model.layout.clone();
    assert!(model.apply(Action::FocusVessel { id: elsewhere }).is_err());
    assert_eq!(before, model.layout);
}

#[test]
fn a_labelled_terminal_is_placed_once_in_its_open_fleet_or_portal() {
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "Crew".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let voyage = model.layout.voyages[0].id.clone();
    let fleet = model.layout.voyages[0].fleets[0].id.clone();
    let agent = Launch::Program {
        argv: vec!["claude".into()],
    };
    let into_fleet = PlacementOwner::Fleet { id: fleet.clone() };
    let t5 = CoreTerminalId("t5".into());
    assert_eq!(
        model.adopt(&into_fleet, &t5, "/work".into(), agent.clone(), None),
        Ok(true)
    );
    assert_eq!(
        model.adopt(&into_fleet, &t5, "/work".into(), agent.clone(), None),
        Ok(false)
    );
    let adopted = model.layout.vessels.last().unwrap().clone();
    assert_eq!(adopted.backend, Some(t5));
    assert_eq!(adopted.launch, Some(agent));
    assert_eq!(adopted.cwd, "/work");
    let placements = &model.layout.voyages[0].fleets[0];
    assert_eq!(placements.placements.len(), 2);
    assert!(panels::contains(
        &placements.root,
        &placements.placements[1].id
    ));
    let t6 = CoreTerminalId("t6".into());
    let portal = PlacementOwner::Portals {
        voyage: voyage.clone(),
    };
    assert_eq!(
        model.adopt(&portal, &t6, "/work".into(), Launch::Terminal, None),
        Ok(true)
    );
    let column = model.layout.voyages[0].portal_layout.as_ref().unwrap();
    assert!(column.visible);
    assert_eq!(model.layout.voyages[0].portals.len(), 1);
    let unknown = PlacementOwner::Fleet {
        id: FleetId("fleet-404".into()),
    };
    let t7 = CoreTerminalId("t7".into());
    assert!(
        model
            .adopt(&unknown, &t7, "/".into(), Launch::Terminal, None)
            .is_err()
    );
    model.layout.voyages[0].fleets[0].closed = true;
    assert!(
        model
            .adopt(&into_fleet, &t7, "/".into(), Launch::Terminal, None)
            .is_err()
    );
    assert!(
        !model
            .layout
            .vessels
            .iter()
            .any(|content| content.backend.as_ref() == Some(&t7))
    );
}

#[test]
fn an_adopted_terminal_takes_its_core_name_unless_a_neighbour_holds_it() {
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "Crew".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let fleet = model.layout.voyages[0].fleets[0].id.clone();
    let owner = PlacementOwner::Fleet { id: fleet };
    let adopt = |model: &mut Model, address: &str, name: Option<&str>| {
        model
            .adopt(
                &owner,
                &CoreTerminalId(address.into()),
                "/work".into(),
                Launch::Terminal,
                name.map(str::to_owned),
            )
            .unwrap();
        model.layout.voyages[0].fleets[0]
            .placements
            .last()
            .unwrap()
            .clone()
    };
    let arch = adopt(&mut model, "t5", Some("arch"));
    assert_eq!(arch.name, "arch");
    assert_eq!(arch.name_origin, voyager_contract::NameOrigin::Deliberate);
    let twin = adopt(&mut model, "t6", Some("arch"));
    assert_eq!(twin.name, "Terminal 2");
    assert_eq!(twin.name_origin, voyager_contract::NameOrigin::Automatic);
    assert_eq!(adopt(&mut model, "t7", None).name, "Terminal 3");
    assert_eq!(adopt(&mut model, "t8", Some("")).name, "Terminal 4");
}

#[test]
fn default_agents_seed_only_a_previously_absent_home() {
    let initial = Model::prepare(Layout::default(), "/tmp").unwrap();
    let home = initial.home.as_ref().unwrap();
    let panel = &home.fleets[0].placements[0];
    let content = initial
        .vessels
        .iter()
        .find(|item| item.id == panel.vessel)
        .unwrap();
    assert_eq!(content.type_id, "agents");
    assert_eq!(panel.name, "Agents 1");
    assert!(content.backend.is_none());
    assert!(content.launch.is_none());
    let mut model = Model { layout: initial };
    let id = model.layout.home.as_ref().unwrap().fleets[0].placements[0]
        .id
        .clone();
    model.apply(Action::RemovePlacement { id }).unwrap();
    let empty = model.layout.clone();
    assert_eq!(Model::prepare(empty.clone(), "/elsewhere").unwrap(), empty);
    model.layout.home.as_mut().unwrap().fleets[0].name = "My landing".into();
    let customized = model.layout;
    assert_eq!(
        Model::prepare(customized.clone(), "/elsewhere").unwrap(),
        customized
    );
}

#[test]
fn a_fleet_made_by_hand_opens_a_terminal_and_one_made_for_a_labelled_agent_waits_for_it() {
    let (mut model, a, ..) = two_voyages();
    let agent_vessel = VesselId("content-9".into());
    for (caller, name) in [(None, "By hand"), (Some(&agent_vessel), "Crew")] {
        let (voyage, name) = (a.clone(), name.into());
        model
            .apply_from(caller, Action::CreateFleet { voyage, name })
            .unwrap();
    }
    let fleets = &model.layout.voyages[0].fleets;
    let [by_hand] = &fleets[2].placements[..] else {
        panic!("a Fleet made by hand holds one Vessel");
    };
    assert_eq!(by_hand.name, "Terminal 1");
    let crew = fleets[3].id.clone();
    assert!(fleets[3].root.is_none() && fleets[3].placements.is_empty());
    assert_eq!(model.layout.selected_fleet.as_ref(), Some(&crew));
    let (agent, owner) = (
        CoreTerminalId("t9".into()),
        PlacementOwner::Fleet { id: crew },
    );
    let launch = Launch::Program {
        argv: vec!["claude".into()],
    };
    assert!(
        model
            .adopt(&owner, &agent, "/tmp".into(), launch, None)
            .unwrap()
    );
    let crew = &model.layout.voyages[0].fleets[3];
    let [only] = &crew.placements[..] else {
        panic!("the agent's terminal is the only Vessel");
    };
    let leaf = Split::Leaf {
        placement: only.id.clone(),
    };
    assert_eq!(crew.root, Some(leaf));
    let content = model
        .layout
        .vessels
        .iter()
        .find(|item| item.id == only.vessel);
    assert_eq!(content.and_then(|item| item.backend.as_ref()), Some(&agent));
}

#[test]
fn a_dock_moves_the_canvas_to_its_target() {
    let (mut model, a, first, second, b) = two_voyages();
    assert_eq!(model.layout.selected_voyage, Some(b.clone()));
    model
        .apply(Action::Dock {
            context: Context::Fleet { id: first.clone() },
        })
        .unwrap();
    assert_eq!(model.layout.selected_voyage, Some(a.clone()));
    assert_eq!(model.layout.selected_fleet, Some(first));
    model
        .apply(Action::Dock {
            context: Context::Voyage { id: b.clone() },
        })
        .unwrap();
    assert_eq!(model.layout.selected_voyage, Some(b));
    let vessel = model.layout.voyages[0].fleets[1].placements[0].id.clone();
    model
        .apply(Action::Dock {
            context: Context::Vessel { id: vessel },
        })
        .unwrap();
    assert_eq!(model.layout.selected_voyage, Some(a));
    assert_eq!(model.layout.selected_fleet, Some(second));
    model
        .apply(Action::Dock {
            context: Context::Workspace,
        })
        .unwrap();
    assert_eq!(model.layout.view, WorkspaceView::Home);
}
