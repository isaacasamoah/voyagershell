use voyager_contract::socket::SocketReply;
use voyager_contract::{
    Action, ContentDestination, Context, FleetId, Layout, Outcome, PlacementId, PlacementOwner,
    RenameTarget, Reply, Request, Side, Unapplied, VoyageId,
};

struct Intent {
    done: String,
    attempt: String,
}

struct Names<'a>(Option<&'a Layout>);

impl Names<'_> {
    fn voyage(&self, id: &VoyageId) -> Option<&str> {
        self.0?
            .containers()
            .find(|voyage| &voyage.id == id)
            .map(|voyage| voyage.name.as_str())
    }

    fn fleet(&self, id: &FleetId) -> Option<&str> {
        self.0?
            .containers()
            .flat_map(|voyage| &voyage.fleets)
            .find(|fleet| &fleet.id == id)
            .map(|fleet| fleet.name.as_str())
    }

    fn placement(&self, id: &PlacementId) -> Option<&str> {
        self.0?
            .containers()
            .flat_map(|voyage| {
                voyage
                    .fleets
                    .iter()
                    .flat_map(|fleet| &fleet.placements)
                    .chain(&voyage.portals)
            })
            .find(|placement| &placement.id == id)
            .map(|placement| placement.name.as_str())
    }
}

fn noun(kind: &str, name: Option<&str>) -> String {
    match name {
        Some(name) => format!("the {name} {kind}"),
        None => format!("that {kind}"),
    }
}

fn direction(before: bool) -> &'static str {
    if before { "before" } else { "after" }
}

fn side(side: &Side) -> &'static str {
    match side {
        Side::Left => "to the left of",
        Side::Right => "to the right of",
        Side::Top => "above",
        Side::Bottom => "below",
    }
}

fn intent(action: &Action, names: &Names) -> Option<Intent> {
    let both = |done: String, attempt: String| Some(Intent { done, attempt });
    match action {
        Action::Inspect => None,
        Action::CreateFleet { voyage, name } => {
            let place = names
                .voyage(voyage)
                .map(|voyage| format!(" in the {voyage} Voyage"))
                .unwrap_or_default();
            both(
                format!("Created the Fleet {name}{place}."),
                format!("create the Fleet {name}{place}"),
            )
        }
        Action::CreateFleetWithVessel { name, type_id, .. } => both(
            format!("Created the Fleet {name} with a new {type_id} Vessel."),
            format!("create the Fleet {name} with a new {type_id} Vessel"),
        ),
        Action::CreateVessel {
            type_id,
            destination: ContentDestination::Placement { owner, .. },
            ..
        } => {
            let target = match owner {
                PlacementOwner::Fleet { id } => format!("to {}", noun("Fleet", names.fleet(id))),
                PlacementOwner::Portals { voyage } => {
                    format!("to the Portals of {}", noun("Voyage", names.voyage(voyage)))
                }
            };
            both(
                format!("Added a {type_id} Vessel {target}."),
                format!("add a {type_id} Vessel {target}"),
            )
        }
        Action::Rename { target, name } => {
            let (kind, current) = match target {
                RenameTarget::Voyage { id } => ("Voyage", names.voyage(id)),
                RenameTarget::Fleet { id } => ("Fleet", names.fleet(id)),
                RenameTarget::Vessel { id } => ("Vessel", names.placement(id)),
                RenameTarget::Portal { id } => ("Portal", names.placement(id)),
            };
            let old = current.filter(|current| current != name).map_or_else(
                || format!("the {kind}"),
                |current| noun(kind, Some(current)),
            );
            both(
                format!("Renamed the {kind} to {name}."),
                format!("rename {old} to {name}"),
            )
        }
        Action::MoveVoyage { id, target, before } => {
            let (moved, other) = (
                noun("Voyage", names.voyage(id)),
                noun("Voyage", names.voyage(target)),
            );
            let way = direction(*before);
            both(
                format!("Moved {moved} {way} {other}."),
                format!("move {moved} {way} {other}"),
            )
        }
        Action::MoveFleet { id, target, before } => {
            let (moved, other) = (
                noun("Fleet", names.fleet(id)),
                noun("Fleet", names.fleet(target)),
            );
            let way = direction(*before);
            both(
                format!("Moved {moved} {way} {other}."),
                format!("move {moved} {way} {other}"),
            )
        }
        Action::MovePlacement {
            id,
            target,
            side: edge,
        } => {
            let (moved, other) = (
                noun("Vessel", names.placement(id)),
                noun("Vessel", names.placement(target)),
            );
            let way = side(edge);
            both(
                format!("Moved {moved} {way} {other}."),
                format!("move {moved} {way} {other}"),
            )
        }
        Action::RemovePlacement { id } => {
            let target = noun("Vessel", names.placement(id));
            both(format!("Removed {target}."), format!("remove {target}"))
        }
        Action::SelectVoyage { id } => {
            let target = noun("Voyage", names.voyage(id));
            both(format!("Opened {target}."), format!("open {target}"))
        }
        Action::SelectFleet { id } => {
            let target = noun("Fleet", names.fleet(id));
            both(format!("Opened {target}."), format!("open {target}"))
        }
        Action::Dock { context } => {
            let target = match context {
                Context::Workspace => "the workspace".to_owned(),
                Context::Voyage { id } => noun("Voyage", names.voyage(id)),
                Context::Fleet { id } => noun("Fleet", names.fleet(id)),
                Context::Vessel { id } => noun("Vessel", names.placement(id)),
                Context::Portal { id } => noun("Portal", names.placement(id)),
            };
            both(
                format!("Took you to {target}."),
                format!("take you to {target}"),
            )
        }
        Action::SetPlacementMaximized { id, maximized } => {
            let target = noun("Vessel", names.placement(id));
            if *maximized {
                both(format!("Maximized {target}."), format!("maximize {target}"))
            } else {
                both(
                    format!("Restored {target} to its normal size."),
                    format!("restore {target} to its normal size"),
                )
            }
        }
        _ => both("Made that change.".into(), "make that change".into()),
    }
}

fn unsettled(intent: &Intent) -> String {
    format!(
        "I asked to {}, but I can't tell yet whether it happened.",
        intent.attempt
    )
}

fn refused(intent: &Intent) -> String {
    format!(
        "I asked to {}, but it was refused, so nothing changed.",
        intent.attempt
    )
}

pub fn sentence(request: &Request, reply: &SocketReply) -> Option<String> {
    let (outcome, layout) = match reply {
        SocketReply::Status { .. } | SocketReply::Focus { .. } | SocketReply::Noted => return None,
        SocketReply::Refused { .. } => (Outcome::Refused, None),
        SocketReply::Workspace {
            reply: Reply::Answered(response),
        } => (response.status.clone(), Some(&*response.layout)),
        SocketReply::Workspace {
            reply: Reply::Unanswered(unanswered),
        } => (
            match unanswered.status {
                Unapplied::Refused => Outcome::Refused,
                Unapplied::Uncertain => Outcome::Uncertain,
            },
            None,
        ),
    };
    let intent = intent(&request.action, &Names(layout))?;
    Some(match outcome {
        Outcome::Applied => intent.done,
        Outcome::Refused => refused(&intent),
        Outcome::Uncertain => unsettled(&intent),
    })
}

#[cfg(test)]
mod tests {
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

    fn voyage(
        id: &str,
        name: &str,
        fleet: &str,
        fleet_name: &str,
        pid: &str,
        pname: &str,
    ) -> Voyage {
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

    #[test]
    fn a_refusal_names_what_was_asked_and_claims_no_change() {
        let rename = Action::Rename {
            target: RenameTarget::Fleet {
                id: fleet("fleet-1"),
            },
            name: "Notes".into(),
        };
        let answered_refusal = answered(Outcome::Refused, layout());
        assert_eq!(
            said(rename.clone(), &answered_refusal),
            "I asked to rename the Build Fleet to Notes, but it was refused, so nothing changed."
        );
        assert_eq!(
            said(rename.clone(), &unanswered(Unapplied::Refused)),
            "I asked to rename the Fleet to Notes, but it was refused, so nothing changed."
        );
        assert_eq!(
            said(
                rename,
                &SocketReply::Refused {
                    message: "dock is offered only to Voyager; nothing was queued".into()
                }
            ),
            "I asked to rename the Fleet to Notes, but it was refused, so nothing changed."
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
        let replies = [
            answered(Outcome::Applied, layout()),
            answered(Outcome::Applied, after_removal()),
            answered(Outcome::Refused, layout()),
            answered(Outcome::Uncertain, layout()),
            unanswered(Unapplied::Refused),
            unanswered(Unapplied::Uncertain),
            SocketReply::Refused {
                message: "create-vessel is offered only to Voyager; nothing was queued".into(),
            },
        ];
        let mut checked = 0;
        for action in every_action() {
            for reply in &replies {
                let text = said(action.clone(), reply);
                let lowered = text.to_lowercase();
                for word in FORBIDDEN {
                    assert!(!lowered.contains(word), "{text:?} contains {word:?}");
                }
                for number in ["412", "413", "77"] {
                    assert!(!text.contains(number), "{text:?} contains {number}");
                }
                assert!(text.ends_with('.'), "{text:?}");
                checked += 1;
            }
        }
        assert_eq!(checked, every_action().len() * replies.len());
    }
}
