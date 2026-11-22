use super::*;
use std::sync::Arc;
use voyager_contract::{Fleet, Placement, PlacementInsertion, Response, Unanswered, Voyage};

const FORBIDDEN: &[&str] = &[
    "applied",
    "canvas",
    "placement",
    "column",
    "split",
    "revision",
    "version",
    "fleet-",
    "voyage-",
    "placement-",
    "vessel-",
];

const FORBIDDEN_WORDS: &[&str] = &[
    "queued",
    "stored",
    "inspect",
    "inspected",
    "expected",
    "request",
    "id",
];

fn placement(id: &str, name: &str) -> Placement {
    Placement {
        id: PlacementId(id.into()),
        vessel: voyager_contract::VesselId(format!("vessel-{id}")),
        name: name.into(),
        name_origin: Default::default(),
        hidden: false,
    }
}

fn layout() -> Layout {
    Layout {
        voyages: vec![
            voyage(
                "voyage-1",
                "Voyager",
                "fleet-1",
                "Build",
                "placement-1",
                "claude",
            ),
            voyage(
                "voyage-2",
                "Workshop",
                "fleet-2",
                "Notes",
                "placement-2",
                "shell",
            ),
        ],
        ..Layout::default()
    }
}

fn voyage(id: &str, name: &str, fleet: &str, fleet_name: &str, pid: &str, pname: &str) -> Voyage {
    Voyage {
        id: VoyageId(id.into()),
        name: name.into(),
        name_origin: Default::default(),
        primary_placement: None,
        closed: false,
        closed_order: 0,
        fleets: vec![Fleet {
            id: FleetId(fleet.into()),
            name: fleet_name.into(),
            closed: false,
            placements: vec![placement(pid, pname)],
            root: None,
            maximized_placement: None,
        }],
        portals: vec![placement(&format!("portal-{pid}"), "Admiral")],
        portal_layout: None,
        cwd: None,
    }
}

fn request(action: Action) -> Request {
    Request {
        request_id: "request-77".into(),
        expected_version: 412,
        action,
    }
}

fn answered(status: Outcome, layout: Layout) -> SocketReply {
    SocketReply::Workspace {
        reply: Reply::Answered(Box::new(Response {
            request_id: "request-77".into(),
            status,
            version: 413,
            layout: Arc::new(layout),
            fresh: false,
            created_workspace: false,
            created_vessels: vec![],
            message: Some("layout version 413 applied".into()),
            close_plan: None,
        })),
    }
}

fn unanswered(status: Unapplied) -> SocketReply {
    SocketReply::Workspace {
        reply: Reply::Unanswered(Unanswered {
            request_id: "request-77".into(),
            status,
            message: "no open Fleet fleet-9 at revision 412".into(),
        }),
    }
}

fn fleet(id: &str) -> FleetId {
    FleetId(id.into())
}

fn voyage_id(id: &str) -> VoyageId {
    VoyageId(id.into())
}

fn pid(id: &str) -> PlacementId {
    PlacementId(id.into())
}

fn every_action() -> Vec<Action> {
    vec![
        Action::CreateFleet {
            voyage: voyage_id("voyage-1"),
            name: "Review".into(),
        },
        Action::CreateFleetWithVessel {
            voyage: voyage_id("voyage-1"),
            name: "Flags".into(),
            source: voyager_contract::DirectorySource::Voyage {
                voyage_id: voyage_id("voyage-1"),
                cwd: "/work".into(),
            },
            type_id: "flag".into(),
            launch: None,
        },
        Action::CreateVessel {
            type_id: "flag".into(),
            destination: ContentDestination::Placement {
                owner: PlacementOwner::Fleet {
                    id: fleet("fleet-1"),
                },
                insertion: PlacementInsertion::Empty,
            },
            launch: None,
        },
        Action::CreateVessel {
            type_id: "flag".into(),
            destination: ContentDestination::Placement {
                owner: PlacementOwner::Portals {
                    voyage: voyage_id("voyage-1"),
                },
                insertion: PlacementInsertion::Empty,
            },
            launch: None,
        },
        Action::Rename {
            target: RenameTarget::Fleet {
                id: fleet("fleet-1"),
            },
            name: "Notes".into(),
        },
        Action::Rename {
            target: RenameTarget::Voyage {
                id: voyage_id("voyage-1"),
            },
            name: "Home".into(),
        },
        Action::Rename {
            target: RenameTarget::Vessel {
                id: pid("placement-1"),
            },
            name: "Helper".into(),
        },
        Action::Rename {
            target: RenameTarget::Portal {
                id: pid("portal-placement-1"),
            },
            name: "Desk".into(),
        },
        Action::MoveVoyage {
            id: voyage_id("voyage-1"),
            target: voyage_id("voyage-2"),
            before: true,
        },
        Action::MoveFleet {
            id: fleet("fleet-1"),
            target: fleet("fleet-2"),
            before: false,
        },
        Action::MovePlacement {
            id: pid("placement-1"),
            target: pid("placement-2"),
            side: Side::Left,
        },
        Action::MovePlacement {
            id: pid("placement-1"),
            target: pid("placement-2"),
            side: Side::Right,
        },
        Action::MovePlacement {
            id: pid("placement-1"),
            target: pid("placement-2"),
            side: Side::Top,
        },
        Action::MovePlacement {
            id: pid("placement-1"),
            target: pid("placement-2"),
            side: Side::Bottom,
        },
        Action::RemovePlacement {
            id: pid("placement-1"),
        },
        Action::SelectVoyage {
            id: voyage_id("voyage-2"),
        },
        Action::SelectFleet {
            id: fleet("fleet-2"),
        },
        Action::Dock {
            context: Context::Workspace,
        },
        Action::Dock {
            context: Context::Voyage {
                id: voyage_id("voyage-1"),
            },
        },
        Action::Dock {
            context: Context::Fleet {
                id: fleet("fleet-1"),
            },
        },
        Action::Dock {
            context: Context::Vessel {
                id: pid("placement-1"),
            },
        },
        Action::Dock {
            context: Context::Portal {
                id: pid("portal-placement-1"),
            },
        },
        Action::SetPlacementMaximized {
            id: pid("placement-1"),
            maximized: true,
        },
        Action::SetPlacementMaximized {
            id: pid("placement-1"),
            maximized: false,
        },
        Action::SetSidebar { collapsed: true },
    ]
}

fn after_removal() -> Layout {
    let mut layout = layout();
    layout.voyages[0].fleets[0].placements.clear();
    layout
}

fn said(action: Action, reply: &SocketReply) -> String {
    sentence(&request(action), reply).expect("a change always gets a sentence")
}

#[test]
fn each_change_kind_says_what_changed_by_name() {
    let done = answered(Outcome::Applied, layout());
    let cases = [
        (
            Action::CreateFleet {
                voyage: voyage_id("voyage-1"),
                name: "Review".into(),
            },
            "Created the Fleet Review in the Voyager Voyage.",
        ),
        (
            Action::CreateFleetWithVessel {
                voyage: voyage_id("voyage-1"),
                name: "Flags".into(),
                source: voyager_contract::DirectorySource::Voyage {
                    voyage_id: voyage_id("voyage-1"),
                    cwd: "/work".into(),
                },
                type_id: "flag".into(),
                launch: None,
            },
            "Created the Fleet Flags with a new flag Vessel.",
        ),
        (
            Action::CreateVessel {
                type_id: "flag".into(),
                destination: ContentDestination::Placement {
                    owner: PlacementOwner::Fleet {
                        id: fleet("fleet-1"),
                    },
                    insertion: PlacementInsertion::Empty,
                },
                launch: None,
            },
            "Added a flag Vessel to the Build Fleet.",
        ),
        (
            Action::Rename {
                target: RenameTarget::Fleet {
                    id: fleet("fleet-1"),
                },
                name: "Notes".into(),
            },
            "Renamed the Fleet to Notes.",
        ),
        (
            Action::MoveVoyage {
                id: voyage_id("voyage-1"),
                target: voyage_id("voyage-2"),
                before: true,
            },
            "Moved the Voyager Voyage before the Workshop Voyage.",
        ),
        (
            Action::MoveFleet {
                id: fleet("fleet-1"),
                target: fleet("fleet-2"),
                before: false,
            },
            "Moved the Build Fleet after the Notes Fleet.",
        ),
        (
            Action::MovePlacement {
                id: pid("placement-1"),
                target: pid("placement-2"),
                side: Side::Left,
            },
            "Moved the claude Vessel to the left of the shell Vessel.",
        ),
        (
            Action::SelectVoyage {
                id: voyage_id("voyage-2"),
            },
            "Opened the Workshop Voyage.",
        ),
        (
            Action::SelectFleet {
                id: fleet("fleet-2"),
            },
            "Opened the Notes Fleet.",
        ),
        (
            Action::Dock {
                context: Context::Vessel {
                    id: pid("placement-1"),
                },
            },
            "Took you to the claude Vessel.",
        ),
        (
            Action::Dock {
                context: Context::Workspace,
            },
            "Took you to the workspace.",
        ),
        (
            Action::SetPlacementMaximized {
                id: pid("placement-1"),
                maximized: true,
            },
            "Maximized the claude Vessel.",
        ),
        (
            Action::SetPlacementMaximized {
                id: pid("placement-1"),
                maximized: false,
            },
            "Restored the claude Vessel to its normal size.",
        ),
    ];
    for (action, expected) in cases {
        assert_eq!(said(action, &done), expected);
    }
    assert_eq!(
        said(
            Action::RemovePlacement {
                id: pid("placement-1")
            },
            &answered(Outcome::Applied, after_removal())
        ),
        "Removed that Vessel."
    );
}

#[test]
fn an_inspect_and_a_plain_read_say_nothing() {
    assert_eq!(
        sentence(
            &request(Action::Inspect),
            &answered(Outcome::Applied, layout())
        ),
        None
    );
    assert_eq!(
        sentence(&request(Action::Inspect), &SocketReply::Noted),
        None
    );
    assert_eq!(
        sentence(
            &request(Action::SelectFleet {
                id: fleet("fleet-1")
            }),
            &SocketReply::Noted
        ),
        None
    );
}

fn rename() -> Action {
    Action::Rename {
        target: RenameTarget::Fleet {
            id: fleet("fleet-1"),
        },
        name: "Notes".into(),
    }
}

fn answered_with(status: Outcome, message: Option<&str>) -> SocketReply {
    match answered(status, layout()) {
        SocketReply::Workspace {
            reply: Reply::Answered(mut response),
        } => {
            response.message = message.map(str::to_owned);
            SocketReply::Workspace {
                reply: Reply::Answered(response),
            }
        }
        other => other,
    }
}

fn unanswered_with(status: Unapplied, message: &str) -> SocketReply {
    SocketReply::Workspace {
        reply: Reply::Unanswered(Unanswered {
            request_id: "request-77".into(),
            status,
            message: message.into(),
        }),
    }
}

fn socket_refused(message: &str) -> SocketReply {
    SocketReply::Refused {
        message: message.into(),
    }
}

const NAMED: &str =
    "I asked to rename the Build Fleet to Notes, but it was refused, so nothing changed.";
const UNNAMED: &str =
    "I asked to rename the Fleet to Notes, but it was refused, so nothing changed.";

#[test]
fn a_refusal_names_what_was_asked_and_claims_no_change() {
    assert_eq!(said(rename(), &answered(Outcome::Refused, layout())), NAMED);
    assert_eq!(said(rename(), &unanswered(Unapplied::Refused)), UNNAMED);
    assert_eq!(
        said(rename(), &answered_with(Outcome::Refused, None)),
        NAMED
    );
}

#[test]
fn a_plain_reason_from_an_answered_refusal_follows_the_sentence() {
    assert_eq!(
        said(
            rename(),
            &answered_with(Outcome::Refused, Some("Fleet is closed"))
        ),
        format!("{NAMED} Fleet is closed.")
    );
    assert_eq!(
        said(
            rename(),
            &answered_with(
                Outcome::Refused,
                Some("Selected Voyage changed; reopen the choice")
            )
        ),
        format!("{NAMED} Selected Voyage changed.")
    );
}

#[test]
fn a_plain_reason_from_an_unanswered_refusal_follows_the_sentence() {
    assert_eq!(
        said(
            rename(),
            &unanswered_with(Unapplied::Refused, "Voyage not found")
        ),
        format!("{UNNAMED} Voyage not found.")
    );
}

#[test]
fn a_plain_reason_from_a_socket_refusal_follows_the_sentence() {
    assert_eq!(
        said(
            rename(),
            &socket_refused("dock is offered only to Voyager; nothing was queued")
        ),
        format!("{UNNAMED} Dock is offered only to Voyager.")
    );
}

#[test]
fn an_internal_word_in_the_layout_reason_is_said_as_the_workspace() {
    assert_eq!(
        said(
            rename(),
            &answered_with(
                Outcome::Refused,
                Some("Layout changed; inspect it before making a new request")
            )
        ),
        format!("{NAMED} Workspace changed.")
    );
}

#[test]
fn a_reason_with_an_id_a_number_or_an_internal_term_is_left_out() {
    for message in [
        "no open Fleet fleet-9",
        "no open Voyage voyage-2",
        "A name must contain 1 to 128 bytes",
        "Inspect the workspace before making a change",
        "Another change to this Fleet arrived first, so this one was not applied",
        "create-vessel is offered only to Voyager; nothing was queued",
        "The placement is not in the open Fleet",
        "Stale version 412",
        "",
    ] {
        assert_eq!(
            said(rename(), &answered_with(Outcome::Refused, Some(message))),
            NAMED,
            "{message:?}"
        );
        assert_eq!(
            said(rename(), &unanswered_with(Unapplied::Refused, message)),
            UNNAMED,
            "{message:?}"
        );
        assert_eq!(
            said(rename(), &socket_refused(message)),
            UNNAMED,
            "{message:?}"
        );
    }
}

#[test]
fn a_reason_is_never_added_to_an_uncertain_or_applied_result() {
    let message = "Fleet is closed";
    assert_eq!(
        said(rename(), &answered_with(Outcome::Uncertain, Some(message))),
        "I asked to rename the Build Fleet to Notes, but I can't tell yet whether it happened."
    );
    assert_eq!(
        said(rename(), &unanswered_with(Unapplied::Uncertain, message)),
        "I asked to rename the Fleet to Notes, but I can't tell yet whether it happened."
    );
    assert_eq!(
        said(rename(), &answered_with(Outcome::Applied, Some(message))),
        "Renamed the Fleet to Notes."
    );
}

#[test]
fn an_uncertain_result_never_claims_a_change() {
    let rename = Action::Rename {
        target: RenameTarget::Fleet {
            id: fleet("fleet-1"),
        },
        name: "Notes".into(),
    };
    assert_eq!(
        said(rename.clone(), &answered(Outcome::Uncertain, layout())),
        "I asked to rename the Build Fleet to Notes, but I can't tell yet whether it happened."
    );
    assert_eq!(
        said(rename, &unanswered(Unapplied::Uncertain)),
        "I asked to rename the Fleet to Notes, but I can't tell yet whether it happened."
    );
}

#[test]
fn a_rename_already_in_the_layout_does_not_name_the_target_twice() {
    let mut layout = layout();
    layout.voyages[0].fleets[0].name = "Notes".into();
    assert_eq!(
        said(
            Action::Rename {
                target: RenameTarget::Fleet {
                    id: fleet("fleet-1")
                },
                name: "Notes".into(),
            },
            &answered(Outcome::Uncertain, layout)
        ),
        "I asked to rename the Fleet to Notes, but I can't tell yet whether it happened."
    );
}

#[test]
fn every_sentence_uses_a_persons_words() {
    const REASONS: &[&str] = &[
        "Fleet is closed",
        "Voyage not found",
        "Selected Voyage changed; reopen the choice",
        "Layout changed; inspect it before making a new request",
        "Inspect the workspace before making a change",
        "no open Fleet fleet-9",
        "A name must contain 1 to 128 bytes",
        "Another change to this Fleet arrived first, so this one was not applied",
        "dock is offered only to Voyager; nothing was queued",
        "create-vessel is offered only to Voyager; nothing was queued",
        "The placement is not in the open Fleet",
        "A Fleet needs a name",
        "layout version 413 applied",
    ];
    let mut replies = vec![
        answered(Outcome::Applied, layout()),
        answered(Outcome::Applied, after_removal()),
        answered(Outcome::Refused, layout()),
        answered(Outcome::Uncertain, layout()),
        unanswered(Unapplied::Refused),
        unanswered(Unapplied::Uncertain),
    ];
    for reason in REASONS {
        replies.push(answered_with(Outcome::Refused, Some(reason)));
        replies.push(unanswered_with(Unapplied::Refused, reason));
        replies.push(socket_refused(reason));
    }
    let mut checked = 0;
    for action in every_action() {
        for reply in &replies {
            let text = said(action.clone(), reply);
            let lowered = text.to_lowercase();
            for word in FORBIDDEN {
                assert!(!lowered.contains(word), "{text:?} contains {word:?}");
            }
            for word in lowered.split(|letter: char| !letter.is_alphanumeric()) {
                assert!(
                    !FORBIDDEN_WORDS.contains(&word),
                    "{text:?} contains {word:?}"
                );
            }
            for number in ["412", "413", "77", "128", "fleet-9"] {
                assert!(!text.contains(number), "{text:?} contains {number}");
            }
            assert!(text.ends_with('.'), "{text:?}");
            checked += 1;
        }
    }
    assert_eq!(checked, every_action().len() * replies.len());
}
