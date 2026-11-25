use super::*;
use crate::workspace::Model;
use voyager_contract::{Action, ContentDestination};

#[test]
fn reopen_transfers_only_the_retained_panel_inside_its_voyage() {
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "Work".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let voyage = model.layout.voyages[0].id.clone();
    let first = model.layout.voyages[0].fleets[0].placements[0].clone();
    model
        .apply(Action::CreateVessel {
            type_id: "dashboard".into(),
            destination: ContentDestination::Placement {
                owner: PlacementOwner::Fleet {
                    id: model.layout.voyages[0].fleets[0].id.clone(),
                },
                insertion: PlacementInsertion::Beside {
                    id: first.id.clone(),
                    side: Side::Right,
                },
            },
            launch: None,
        })
        .unwrap();
    let source = model.layout.voyages[0].fleets[0].clone();
    let panel = source.placements[0].clone();
    let retained = source.placements[1].clone();
    model
        .apply(Action::SaveArrangement {
            owner: PlacementOwner::Fleet {
                id: source.id.clone(),
            },
            name: "Original".into(),
        })
        .unwrap();
    model
        .apply(Action::RemovePlacement {
            id: panel.id.clone(),
        })
        .unwrap();
    model
        .apply(Action::CreateFleet {
            voyage,
            name: "Next".into(),
        })
        .unwrap();
    let target = &mut model.layout.voyages[0].fleets[1];
    let owner = PlacementOwner::Fleet {
        id: target.id.clone(),
    };
    let insertion = PlacementInsertion::Beside {
        id: target.placements[0].id.clone(),
        side: Side::Left,
    };
    let action = Action::ReopenPlacement {
        id: panel.id.clone(),
        destination: ContentDestination::Placement {
            owner: owner.clone(),
            insertion: insertion.clone(),
        },
    };
    let snapshot = std::sync::Arc::new(model.layout.clone());
    crate::scope::check(
        &snapshot,
        Some(&voyager_contract::Context::Voyage {
            id: model.layout.voyages[0].id.clone(),
        }),
        &action,
    )
    .unwrap();
    for scope in [
        voyager_contract::Context::Fleet {
            id: source.id.clone(),
        },
        voyager_contract::Context::Fleet {
            id: model.layout.voyages[0].fleets[1].id.clone(),
        },
        voyager_contract::Context::Vessel {
            id: panel.id.clone(),
        },
    ] {
        assert!(crate::scope::check(&snapshot, Some(&scope), &action).is_err());
    }
    for destination in [
        PlacementOwner::Portals {
            voyage: model.layout.voyages[0].id.clone(),
        },
        PlacementOwner::Fleet {
            id: model.layout.home.as_ref().unwrap().fleets[0].id.clone(),
        },
    ] {
        let before = model.layout.clone();
        assert!(
            model
                .apply(Action::ReopenPlacement {
                    id: panel.id.clone(),
                    destination: ContentDestination::Placement {
                        owner: destination,
                        insertion: PlacementInsertion::Empty
                    }
                })
                .is_err()
        );
        assert_eq!(model.layout, before);
    }
    let contents = model.layout.vessels.clone();
    let context = model.layout.context.clone();
    let selected = model.layout.selected_fleet.clone();
    model.apply(action).unwrap();
    assert_eq!(model.layout.vessels, contents);
    assert_eq!(model.layout.context, context);
    assert_eq!(model.layout.selected_fleet, selected);
    assert_eq!(
        model.layout.voyages[0].fleets[0].placements.as_slice(),
        std::slice::from_ref(&retained)
    );
    let target = group(&model.layout, &owner).unwrap();
    assert_eq!(target.members[0].name, "Terminal 1");
    assert_eq!(target.members[1].name, "Terminal 1");
    assert_ne!(target.members[0].id, target.members[1].id);
    assert_eq!(
        group(&model.layout, &owner).unwrap().members.last(),
        Some(&panel)
    );
    assert!(contains(
        group(&model.layout, &owner).unwrap().root,
        &panel.id
    ));
    assert_eq!(
        model.layout.arrangements[0].root,
        Some(Split::Leaf {
            placement: retained.id
        })
    );
    let before = model.layout.clone();
    assert!(
        model
            .apply(Action::ReopenPlacement {
                id: panel.id.clone(),
                destination: ContentDestination::Placement { owner, insertion }
            })
            .is_err()
    );
    assert_eq!(model.layout, before);
}

fn placement(id: &str, hidden: bool) -> Placement {
    Placement {
        id: PlacementId(id.into()),
        vessel: voyager_contract::VesselId(id.into()),
        name: id.into(),
        name_origin: Default::default(),
        hidden,
    }
}

fn leaf(id: &str) -> Split {
    Split::Leaf {
        placement: PlacementId(id.into()),
    }
}

fn pair(first: &str, second: &str) -> Option<Split> {
    Some(Split::Branch {
        axis: Axis::Horizontal,
        share: Default::default(),
        first: Box::new(leaf(first)),
        second: Box::new(leaf(second)),
    })
}

fn fleet() -> Fleet {
    Fleet {
        id: voyager_contract::FleetId("fleet".into()),
        name: "Fleet".into(),
        closed: false,
        placements: vec![
            placement("shown", false),
            placement("hidden", true),
            placement("closed", false),
        ],
        root: pair("shown", "hidden"),
        maximized_placement: None,
    }
}

fn portals(layout: Option<PortalLayout>) -> Voyage {
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "Work".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let mut voyage = model.layout.voyages.remove(0);
    voyage.portals = vec![
        placement("portal", false),
        placement("tucked", true),
        placement("other", false),
    ];
    voyage.portal_layout = layout;
    voyage
}

fn id(id: &str) -> PlacementId {
    PlacementId(id.into())
}

#[test]
fn a_fleet_placement_is_placed_while_in_the_tree_and_shown_unless_hidden() {
    let fleet = fleet();
    let group = Group::of_fleet(&fleet);
    for (name, placed, shown) in [
        ("shown", true, true),
        ("hidden", true, false),
        ("closed", false, false),
        ("missing", false, false),
    ] {
        assert_eq!(group.placed(&id(name)), placed, "{name} placed");
        assert_eq!(group.shown(&id(name)), shown, "{name} shown");
        assert_eq!(group.on_screen(&id(name)), shown, "{name} on screen");
    }
}

#[test]
fn a_maximized_placement_leaves_only_itself_on_screen() {
    let mut fleet = fleet();
    fleet.placements.push(placement("beside", false));
    fleet.root = Some(Split::Branch {
        axis: Axis::Vertical,
        share: Default::default(),
        first: Box::new(pair("shown", "hidden").unwrap()),
        second: Box::new(leaf("beside")),
    });
    fleet.maximized_placement = Some(id("beside"));
    let group = Group::of_fleet(&fleet);
    assert!(group.on_screen(&id("beside")));
    assert!(!group.on_screen(&id("shown")));
    assert!(group.shown(&id("shown")));
    assert!(group.placed(&id("hidden")));
}

#[test]
fn portals_answer_the_same_questions_and_have_none_without_an_arrangement() {
    assert!(Group::of_portals(&portals(None)).is_none());
    let mut voyage = portals(Some(PortalLayout {
        root: Some(Split::Branch {
            axis: Axis::Vertical,
            share: Default::default(),
            first: Box::new(pair("portal", "tucked").unwrap()),
            second: Box::new(leaf("other")),
        }),
        ..PortalLayout::default()
    }));
    let group = Group::of_portals(&voyage).unwrap();
    assert!(group.placed(&id("portal")) && group.on_screen(&id("portal")));
    assert!(group.placed(&id("tucked")) && !group.shown(&id("tucked")));
    assert!(!group.placed(&id("closed")));
    voyage.portal_layout.as_mut().unwrap().maximized_placement = Some(id("other"));
    let group = Group::of_portals(&voyage).unwrap();
    assert!(group.on_screen(&id("other")));
    assert!(group.shown(&id("portal")) && !group.on_screen(&id("portal")));
}
