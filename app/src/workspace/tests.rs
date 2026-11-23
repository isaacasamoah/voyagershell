use super::*;

fn empty(owner: &PlacementOwner) -> Place {
    match owner.clone() {
        PlacementOwner::Fleet { id } => Place::Fleet { id, beside: None },
        PlacementOwner::Portals { voyage } => Place::Portal { voyage },
    }
}

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
    let last = model
        .layout
        .last_vessels
        .iter()
        .find(|entry| entry.fleet == second)
        .unwrap();
    assert_eq!(last.vessel, vessel);
}

#[test]
fn each_fleet_remembers_its_own_last_vessel() {
    let (mut model, a, first, second, _) = two_voyages();
    model.apply(Action::SelectVoyage { id: a }).unwrap();
    let in_second = model.layout.voyages[0].fleets[1].placements[0].id.clone();
    model
        .apply(Action::FocusVessel {
            id: in_second.clone(),
        })
        .unwrap();
    model
        .apply(Action::SelectFleet { id: first.clone() })
        .unwrap();
    let in_first = model.layout.voyages[0].fleets[0].placements[0].id.clone();
    model
        .apply(Action::FocusVessel {
            id: in_first.clone(),
        })
        .unwrap();
    model
        .apply(Action::SelectFleet { id: second.clone() })
        .unwrap();
    let remembered = |model: &Model, fleet: &FleetId| {
        model
            .layout
            .last_vessels
            .iter()
            .find(|entry| &entry.fleet == fleet)
            .map(|entry| entry.vessel.clone())
    };
    assert_eq!(remembered(&model, &second), Some(in_second));
    assert_eq!(remembered(&model, &first), Some(in_first));
}

fn docked(model: &mut Model, context: Context) -> Result<(), String> {
    model.apply(Action::Dock { context })
}

#[test]
fn docking_on_a_vessel_in_another_voyage_takes_the_user_there() {
    let (mut model, a, first, _, b) = two_voyages();
    assert_eq!(model.layout.selected_voyage.as_ref(), Some(&b));
    let vessel = model.layout.voyages[0].fleets[0].placements[0].id.clone();
    let before = model.layout.clone();
    docked(&mut model, Context::Vessel { id: vessel.clone() }).unwrap();
    assert_eq!(model.layout.selected_voyage.as_ref(), Some(&a));
    assert_eq!(model.layout.selected_fleet.as_ref(), Some(&first));
    assert_eq!(model.layout.view, WorkspaceView::Fleet);
    assert_eq!(model.layout.context, Context::Vessel { id: vessel.clone() });
    assert_eq!(model.layout.last_vessels.len(), 1);
    assert_eq!(model.layout.last_vessels[0].fleet, first);
    assert_eq!(model.layout.last_vessels[0].vessel, vessel);
    assert!(before.same_structure(&model.layout));
}

#[test]
fn docking_on_a_fleet_or_voyage_opens_its_last_vessel() {
    let (mut model, a, first, second, b) = two_voyages();
    model.apply(Action::SelectVoyage { id: a.clone() }).unwrap();
    model
        .apply(Action::SelectFleet { id: first.clone() })
        .unwrap();
    let in_first = model.layout.voyages[0].fleets[0].placements[0].id.clone();
    model
        .apply(Action::FocusVessel {
            id: in_first.clone(),
        })
        .unwrap();
    model.apply(Action::SelectFleet { id: second }).unwrap();
    docked(&mut model, Context::Fleet { id: first.clone() }).unwrap();
    assert_eq!(model.layout.selected_fleet.as_ref(), Some(&first));
    assert_eq!(model.layout.last_vessels[0].vessel, in_first);
    model.apply(Action::SelectVoyage { id: b }).unwrap();
    docked(&mut model, Context::Voyage { id: a.clone() }).unwrap();
    assert_eq!(model.layout.selected_voyage.as_ref(), Some(&a));
    assert_eq!(model.layout.selected_fleet.as_ref(), Some(&first));
    assert_eq!(model.layout.context, Context::Voyage { id: a });
}

#[test]
fn docking_on_the_workspace_leaves_the_view_and_docking_on_a_home_target_goes_home() {
    let (mut model, _, _, _, _) = two_voyages();
    model
        .apply(Action::SelectVoyage {
            id: model.layout.voyages[0].id.clone(),
        })
        .unwrap();
    assert_eq!(model.layout.view, WorkspaceView::Fleet);
    docked(&mut model, Context::Workspace).unwrap();
    assert_eq!(model.layout.view, WorkspaceView::Fleet);
    let home = model.layout.home.as_ref().unwrap();
    let on_home = home.fleets[0].placements[0].id.clone();
    let home_voyage = home.id.clone();
    docked(&mut model, Context::Vessel { id: on_home }).unwrap();
    assert_eq!(model.layout.view, WorkspaceView::Home);
    model
        .apply(Action::SelectVoyage {
            id: model.layout.voyages[0].id.clone(),
        })
        .unwrap();
    docked(&mut model, Context::Voyage { id: home_voyage }).unwrap();
    assert_eq!(model.layout.view, WorkspaceView::Home);
}

#[test]
fn docking_on_a_closed_fleet_or_voyage_is_refused_and_changes_nothing() {
    let (mut model, a, first, _, b) = two_voyages();
    let vessel = model.layout.voyages[0].fleets[0].placements[0].id.clone();
    model
        .apply(Action::CloseFleet { id: first.clone() })
        .unwrap();
    let before = model.layout.clone();
    for context in [
        Context::Fleet { id: first.clone() },
        Context::Vessel { id: vessel },
    ] {
        let error = docked(&mut model, context).unwrap_err();
        assert!(error.contains("closed"), "{error}");
        assert_eq!(before, model.layout);
    }
    model.apply(Action::SelectVoyage { id: a.clone() }).unwrap();
    model.apply(Action::SelectVoyage { id: b.clone() }).unwrap();
    model.apply(Action::CloseVoyage { id: a.clone() }).unwrap();
    let before = model.layout.clone();
    let error = docked(&mut model, Context::Voyage { id: a }).unwrap_err();
    assert!(error.contains("closed"), "{error}");
    assert_eq!(before, model.layout);
}

#[test]
fn docking_on_a_hidden_vessel_lands_on_its_fleet_without_revealing_it() {
    let (mut model, a, first, _, b) = two_voyages();
    let vessel = model.layout.voyages[0].fleets[0].placements[0].id.clone();
    model
        .apply(Action::SetPlacementHidden {
            id: vessel.clone(),
            hidden: true,
        })
        .unwrap();
    model.apply(Action::SelectVoyage { id: b }).unwrap();
    docked(&mut model, Context::Vessel { id: vessel.clone() }).unwrap();
    assert_eq!(model.layout.selected_voyage.as_ref(), Some(&a));
    assert_eq!(model.layout.selected_fleet.as_ref(), Some(&first));
    assert!(model.layout.last_vessels.is_empty());
    assert!(model.layout.voyages[0].fleets[0].placements[0].hidden);
}

#[test]
fn docking_on_a_portal_opens_its_voyage_and_focuses_the_portal() {
    let (mut model, a, _, second, b) = two_voyages();
    let portal = PlacementOwner::Portals { voyage: a.clone() };
    model
        .adopt(
            empty(&portal),
            &CoreTerminalId("t9".into()),
            "/work".into(),
            Launch::Terminal,
            None,
        )
        .unwrap();
    let id = model.layout.voyages[0].portals[0].id.clone();
    model.apply(Action::SelectVoyage { id: b }).unwrap();
    docked(&mut model, Context::Portal { id: id.clone() }).unwrap();
    assert_eq!(model.layout.selected_voyage.as_ref(), Some(&a));
    assert_eq!(model.layout.selected_fleet.as_ref(), Some(&second));
    assert_eq!(model.layout.last_vessels[0].vessel, id);
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
        model.adopt(empty(&into_fleet), &t5, "/work".into(), agent.clone(), None),
        Ok(true)
    );
    assert_eq!(
        model.adopt(empty(&into_fleet), &t5, "/work".into(), agent.clone(), None),
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
        model.adopt(empty(&portal), &t6, "/work".into(), Launch::Terminal, None),
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
            .adopt(empty(&unknown), &t7, "/".into(), Launch::Terminal, None)
            .is_err()
    );
    model.layout.voyages[0].fleets[0].closed = true;
    assert!(
        model
            .adopt(empty(&into_fleet), &t7, "/".into(), Launch::Terminal, None)
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
                empty(&owner),
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
            .apply_from(
                caller,
                Defaults::Table,
                Action::CreateFleet { voyage, name },
            )
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
            .adopt(empty(&owner), &agent, "/tmp".into(), launch, None)
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
fn a_fleet_voyager_makes_for_the_person_opens_a_terminal_and_names_its_program() {
    let (mut model, a, ..) = two_voyages();
    model.apply(Action::SelectVoyage { id: a.clone() }).unwrap();
    let voyager = VesselId("voyager".into());
    let source = || voyager_contract::DirectorySource::Voyage {
        voyage_id: a.clone(),
        cwd: "/tmp".into(),
    };
    for (name, launch) in [
        ("Plain", None),
        (
            "Review",
            Some(voyager_contract::launch::LaunchSpec::Program {
                argv: vec!["claude".into()],
            }),
        ),
    ] {
        model
            .apply_from(
                Some(&voyager),
                Defaults::Table,
                Action::CreateFleetWithVessel {
                    voyage: a.clone(),
                    name: name.into(),
                    source: source(),
                    type_id: "terminal".into(),
                    launch,
                },
            )
            .unwrap();
    }
    let fleets = &model.layout.voyages[0].fleets;
    let launches: Vec<_> = [&fleets[2], &fleets[3]]
        .into_iter()
        .map(|fleet| {
            let [only] = &fleet.placements[..] else {
                panic!("the Fleet holds one Vessel");
            };
            model
                .layout
                .vessels
                .iter()
                .find(|item| item.id == only.vessel)
                .and_then(|item| item.launch.clone())
        })
        .collect();
    assert_eq!(
        launches,
        [
            None,
            Some(Launch::Program {
                argv: vec!["claude".into()]
            })
        ]
    );
}

#[test]
fn voyagers_vessel_is_placed_once_as_a_portal_on_home_and_survives_a_reopen() {
    let mut model = Model {
        layout: Model::prepare(Layout::default(), "/tmp").unwrap(),
    };
    assert!(
        model
            .ensure_voyager("/tmp", crate::focus_hook::saved_launch("session-1"))
            .unwrap()
    );
    assert!(
        !model
            .ensure_voyager("/tmp", crate::focus_hook::saved_launch("session-2"))
            .unwrap()
    );
    let home = model.layout.home.as_ref().unwrap();
    let [portal] = &home.portals[..] else {
        panic!("Home holds Voyager's Portal");
    };
    assert_eq!(portal.name, "Voyager");
    let vessel = model
        .layout
        .vessels
        .iter()
        .find(|item| item.id == portal.vessel)
        .unwrap();
    assert!(is_voyager(vessel));
    assert_eq!(crate::focus_hook::session(vessel), Some("session-1"));
    let saved = model.layout.clone();
    assert_eq!(Model::prepare(saved.clone(), "/elsewhere").unwrap(), saved);

    let mut ended = saved;
    let vessel = ended
        .vessels
        .iter_mut()
        .find(|item| is_voyager(item))
        .unwrap();
    vessel.backend = Some(CoreTerminalId("t1".into()));
    let gone: Vec<crate::core_shapes::Terminal> = Vec::new();
    let (ready, closed) = crate::families::terminal::prepare_reopen(&mut ended, &gone);
    assert!(ready.is_empty() && !closed);
    let vessel = ended.vessels.iter().find(|item| is_voyager(item)).unwrap();
    assert_eq!(vessel.backend, Some(CoreTerminalId("t1".into())));
    assert_eq!(crate::focus_hook::session(vessel), Some("session-1"));
}

fn create_beside(
    model: &mut Model,
    caller: Option<&VesselId>,
    defaults: Defaults,
    type_id: &str,
    launch: Option<LaunchSpec>,
) -> Result<Option<Launch>, String> {
    let fleet = &model.layout.voyages[0].fleets[0];
    let owner = PlacementOwner::Fleet {
        id: fleet.id.clone(),
    };
    let beside = fleet.placements[0].id.clone();
    model.apply_from(
        caller,
        defaults,
        Action::CreateVessel {
            type_id: type_id.into(),
            destination: ContentDestination::Placement {
                owner,
                insertion: PlacementInsertion::Beside {
                    id: beside,
                    side: voyager_contract::Side::Right,
                },
            },
            launch,
        },
    )?;
    Ok(model.layout.vessels.last().unwrap().launch.clone())
}

fn codex(permissions: Option<voyager_contract::launch::Permissions>) -> Option<LaunchSpec> {
    Some(LaunchSpec::Agent {
        kind: "codex".into(),
        model: None,
        effort: None,
        permissions,
    })
}

fn program(argv: &[&str]) -> Option<Launch> {
    Some(Launch::Program {
        argv: argv.iter().map(|part| (*part).to_owned()).collect(),
    })
}

#[test]
fn plain_defaults_start_an_agent_plain_unless_it_names_permissions_and_table_defaults_do_not() {
    use voyager_contract::launch::Permissions;
    let other = VesselId("content-9".into());
    let voyager = VesselId(VOYAGER_VESSEL.into());
    let (mut model, ..) = two_voyages();
    assert_eq!(
        create_beside(
            &mut model,
            Some(&other),
            Defaults::Plain,
            "agent",
            codex(None)
        ),
        Ok(program(&["codex"]))
    );
    let table = crate::agent_programs::argv("codex", None, None, None).unwrap();
    assert!(table.len() > 1);
    for (caller, name) in [(Some(&voyager), "Voyager"), (None, "the person")] {
        let created = create_beside(&mut model, caller, Defaults::Table, "agent", codex(None))
            .unwrap()
            .unwrap();
        assert_eq!(crate::launch::argv(&created).unwrap(), table, "{name}");
    }
    let listed =
        crate::agent_programs::argv("codex", None, None, Some(Permissions::ReadOnly)).unwrap();
    assert_eq!(
        create_beside(
            &mut model,
            Some(&other),
            Defaults::Plain,
            "agent",
            codex(Some(Permissions::ReadOnly))
        ),
        Ok(Some(Launch::Program { argv: listed }))
    );
}

#[test]
fn a_launch_on_a_type_that_takes_none_is_refused_and_places_nothing() {
    let (mut model, ..) = two_voyages();
    let before = model.layout.clone();
    let other = VesselId("content-9".into());
    for (type_id, launch) in [
        ("terminal", codex(None)),
        ("notes", codex(None)),
        ("notes", Some(LaunchSpec::Terminal)),
    ] {
        assert!(
            create_beside(&mut model, Some(&other), Defaults::Plain, type_id, launch).is_err(),
            "{type_id}"
        );
        assert_eq!(model.layout, before, "{type_id}");
    }
}

#[test]
fn only_the_vessel_on_the_bound_terminal_keeps_the_table_default() {
    let (mut model, ..) = two_voyages();
    let beside = model.layout.voyages[0].fleets[0].placements[0].id.clone();
    let owner = PlacementOwner::Fleet {
        id: model.layout.voyages[0].fleets[0].id.clone(),
    };
    let mut ids = Vec::new();
    for terminal in ["t1", "t2"] {
        model
            .apply(Action::CreateVessel {
                type_id: "terminal".into(),
                destination: ContentDestination::Placement {
                    owner: owner.clone(),
                    insertion: PlacementInsertion::Beside {
                        id: beside.clone(),
                        side: voyager_contract::Side::Right,
                    },
                },
                launch: None,
            })
            .unwrap();
        let vessel = model.layout.vessels.last_mut().unwrap();
        vessel.backend = Some(CoreTerminalId(terminal.into()));
        ids.push(vessel.id.clone());
    }
    let binding = crate::voyager_binding::Binding::unbound();
    assert_eq!(
        binding.launch_defaults(&model.layout, Some(&ids[0])),
        Defaults::Plain
    );
    binding.bind(CoreTerminalId("t1".into())).unwrap();
    assert_eq!(
        binding.launch_defaults(&model.layout, Some(&ids[0])),
        Defaults::Table
    );
    assert_eq!(
        binding.launch_defaults(&model.layout, Some(&ids[1])),
        Defaults::Plain
    );
    assert_eq!(
        binding.launch_defaults(&model.layout, None),
        Defaults::Table
    );
    let named_voyager = VesselId(VOYAGER_VESSEL.into());
    assert_eq!(
        binding.launch_defaults(&model.layout, Some(&named_voyager)),
        Defaults::Plain
    );
}

#[test]
fn a_vessel_is_not_created_in_a_closed_fleet() {
    let (mut model, ..) = two_voyages();
    let fleet = model.layout.voyages[0].fleets[0].clone();
    let beside = fleet.placements[0].id.clone();
    model
        .apply(Action::CloseFleet {
            id: fleet.id.clone(),
        })
        .unwrap();
    let before = model.layout.clone();
    let refused = model.apply_from(
        Some(&VesselId("content-9".into())),
        Defaults::Plain,
        Action::CreateVessel {
            type_id: "terminal".into(),
            destination: ContentDestination::Placement {
                owner: PlacementOwner::Fleet { id: fleet.id },
                insertion: PlacementInsertion::Beside {
                    id: beside,
                    side: voyager_contract::Side::Right,
                },
            },
            launch: None,
        },
    );
    assert!(refused.unwrap_err().contains("no open Fleet"));
    assert_eq!(model.layout, before);
}

#[test]
fn a_missing_placement_gets_the_same_message_through_the_label_and_through_create_vessel() {
    let (mut model, ..) = two_voyages();
    let fleet = model.layout.voyages[0].fleets[0].id.clone();
    let missing = PlacementId("placement-404".into());
    let by_label = model
        .adopt(
            Place::Fleet {
                id: fleet.clone(),
                beside: Some((voyager_contract::Side::Left, missing.clone())),
            },
            &CoreTerminalId("t9".into()),
            "/work".into(),
            Launch::Terminal,
            None,
        )
        .unwrap_err();
    assert_eq!(
        by_label,
        format!("Fleet {} has no visible placement placement-404", fleet.0)
    );
    for caller in [None, Some(VesselId("content-9".into()))] {
        let defaults = if caller.is_some() {
            Defaults::Plain
        } else {
            Defaults::Table
        };
        let by_operation = model
            .apply_from(
                caller.as_ref(),
                defaults,
                Action::CreateVessel {
                    type_id: "terminal".into(),
                    destination: ContentDestination::Placement {
                        owner: PlacementOwner::Fleet { id: fleet.clone() },
                        insertion: PlacementInsertion::Beside {
                            id: missing.clone(),
                            side: voyager_contract::Side::Left,
                        },
                    },
                    launch: None,
                },
            )
            .unwrap_err();
        assert_eq!(by_operation, by_label);
    }
}
