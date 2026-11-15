use serde_json::json;
use voyager_app::workspace::Model;
use voyager_contract::{
    Action, ContentDestination, Context, PlacementInsertion, PlacementOwner, Side, Split,
};

fn create(model: &mut Model, owner: PlacementOwner, insertion: PlacementInsertion, type_id: &str) {
    model
        .apply(Action::CreateVessel {
            type_id: type_id.into(),
            destination: ContentDestination::Placement { owner, insertion },
            launch: None,
        })
        .unwrap();
}

#[test]
fn all_four_insertions_keep_the_captured_owner_and_chosen_type() {
    for side in [Side::Left, Side::Right, Side::Top, Side::Bottom] {
        let mut model = Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Work".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        let fleet = &model.layout.voyages[0].fleets[0];
        let owner = PlacementOwner::Fleet {
            id: fleet.id.clone(),
        };
        let anchor = fleet.placements[0].id.clone();
        let terminal = model.layout.vessels[0].clone();
        create(
            &mut model,
            owner,
            PlacementInsertion::Beside {
                id: anchor.clone(),
                side,
            },
            "notes",
        );
        let fleet = &model.layout.voyages[0].fleets[0];
        let Some(Split::Branch { first, second, .. }) = &fleet.root else {
            panic!("No split")
        };
        let before = matches!(side, Side::Left | Side::Top);
        assert_eq!(
            if before { second } else { first }.as_ref(),
            &Split::Leaf { placement: anchor }
        );
        assert_eq!(model.layout.vessels[0], terminal);
        assert_eq!(model.layout.vessels.last().unwrap().type_id, "notes");
        assert_eq!(fleet.placements[0].name, "Terminal 1");
        assert_eq!(fleet.placements[1].name, "Notes 1");
    }
}

#[test]
fn home_portals_hide_remove_reveal_and_presentation_retain_the_instance() {
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "Work".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let selected = (
        model.layout.selected_voyage.clone(),
        model.layout.selected_fleet.clone(),
    );
    model.apply(Action::Home).unwrap();
    let home = model.layout.home.as_ref().unwrap();
    assert_eq!(
        home.fleets[0].root,
        Some(Split::Leaf {
            placement: home.fleets[0].placements[0].id.clone()
        })
    );
    assert_eq!(
        model
            .layout
            .vessels
            .iter()
            .find(|item| item.id == home.fleets[0].placements[0].vessel)
            .unwrap()
            .type_id,
        "agents"
    );
    let owner = PlacementOwner::Portals {
        voyage: home.id.clone(),
    };
    let home_id = home.id.clone();
    create(
        &mut model,
        owner.clone(),
        PlacementInsertion::Empty,
        "notes",
    );
    let id = model.layout.home.as_ref().unwrap().portals[0].id.clone();
    let content = model.layout.vessels.last().unwrap().clone();
    model
        .apply(Action::Dock {
            context: Context::Portal { id: id.clone() },
        })
        .unwrap();
    model
        .apply(Action::SetPlacementHidden {
            id: id.clone(),
            hidden: true,
        })
        .unwrap();
    model
        .apply(Action::RemovePlacement { id: id.clone() })
        .unwrap();
    assert!(
        !model
            .layout
            .home
            .as_ref()
            .unwrap()
            .portal_layout
            .as_ref()
            .unwrap()
            .visible,
        "Closing the last Portal panel collapses its column"
    );
    assert!(
        model
            .layout
            .home
            .as_ref()
            .unwrap()
            .portal_layout
            .as_ref()
            .unwrap()
            .root
            .is_none()
    );
    model
        .apply(Action::RevealPlacement { id: id.clone() })
        .unwrap();
    model
        .apply(Action::SetPortalPresentation {
            voyage: home_id,
            visible: Some(false),
            mode: Some(voyager_contract::canvas::PortalMode::MakeRoom),
            width: Some(368),
        })
        .unwrap();
    assert_eq!(model.layout.vessels.last().unwrap(), &content);
    assert_eq!(model.layout.context, Context::Portal { id });
    assert_eq!(
        (
            model.layout.selected_voyage.clone(),
            model.layout.selected_fleet.clone()
        ),
        selected
    );
    let value = serde_json::to_value(&model.layout).unwrap();
    assert_eq!(value["home"]["portalLayout"]["width"], json!(368));
    assert_eq!(value["home"]["portalLayout"]["visible"], json!(false));
}

#[test]
fn hidden_paths_empty_insertion_and_cross_column_moves_preserve_owner_state() {
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "Work".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let fleet = &model.layout.voyages[0].fleets[0];
    let owner = PlacementOwner::Fleet {
        id: fleet.id.clone(),
    };
    let first = fleet.placements[0].id.clone();
    create(
        &mut model,
        owner.clone(),
        PlacementInsertion::Beside {
            id: first.clone(),
            side: Side::Right,
        },
        "notes",
    );
    let second = model.layout.voyages[0].fleets[0].placements[1].id.clone();
    create(
        &mut model,
        owner.clone(),
        PlacementInsertion::Beside {
            id: second,
            side: Side::Bottom,
        },
        "notes",
    );
    model
        .apply(Action::SetPlacementHidden {
            id: first,
            hidden: true,
        })
        .unwrap();
    model
        .apply(Action::ResizePlacementSplit {
            owner: owner.clone(),
            path: vec![voyager_contract::SplitChild::Second],
            share: voyager_contract::SplitShare::try_from(3700).unwrap(),
        })
        .unwrap();
    let original = model.layout.voyages[0].fleets[0].root.clone();
    let Some(Split::Branch { second, .. }) = &original else {
        panic!("No original parent")
    };
    assert!(matches!(second.as_ref(), Split::Branch { share, .. } if u16::from(*share) == 3700));
    let ids: Vec<_> = model.layout.voyages[0].fleets[0]
        .placements
        .iter()
        .map(|panel| panel.id.clone())
        .collect();
    for id in ids {
        model
            .apply(Action::SetPlacementHidden { id, hidden: true })
            .unwrap();
    }
    create(&mut model, owner, PlacementInsertion::Empty, "notes");
    let fleet = &model.layout.voyages[0].fleets[0];
    assert_eq!(fleet.placements[3].name, "Notes 3");
    let Some(Split::Branch {
        first: retained, ..
    }) = &fleet.root
    else {
        panic!("Lost hidden tree")
    };
    assert_eq!(Some(retained.as_ref()), original.as_ref());
    let id = fleet.placements[3].id.clone();
    let portals = PlacementOwner::Portals {
        voyage: model.layout.voyages[0].id.clone(),
    };
    create(&mut model, portals, PlacementInsertion::Empty, "notes");
    let portal = model.layout.voyages[0].portals[0].id.clone();
    let before = model.layout.clone();
    assert!(
        model
            .apply(Action::MovePlacement {
                id,
                target: portal,
                side: Side::Right
            })
            .is_err()
    );
    assert_eq!(model.layout, before);
}
