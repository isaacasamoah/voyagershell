use serde::Serialize;
use std::collections::BTreeMap;
use voyager_contract::{
    Layout, Placement, VesselId, Voyage, WorkspaceView,
    activity::{ActivityState, ReportedActivity},
    socket::{
        FleetOverview, Overview, PieceOverview, PortalsOverview, VesselStatus, VoyageOverview,
    },
};

struct Reading<'a> {
    layout: &'a Layout,
    vessel: &'a VesselId,
    activity: &'a BTreeMap<String, ReportedActivity>,
}

pub(crate) fn voyages(
    layout: &Layout,
    vessel: &VesselId,
    activity: &BTreeMap<String, ReportedActivity>,
) -> Vec<VoyageOverview> {
    let reading = Reading {
        layout,
        vessel,
        activity,
    };
    layout
        .containers()
        .map(|voyage| reading.voyage(voyage))
        .collect()
}

#[derive(Serialize)]
pub struct Printed<'a> {
    kind: &'static str,
    picture: Vec<String>,
    status: &'a VesselStatus,
}

pub fn printed(overview: &Overview) -> Printed<'_> {
    Printed {
        kind: "status",
        picture: picture(&overview.voyages),
        status: &overview.status,
    }
}

fn word(state: ActivityState) -> String {
    serde_json::to_value(state)
        .ok()
        .and_then(|value| value.as_str().map(str::to_owned))
        .unwrap_or_default()
}

fn piece_line(piece: &PieceOverview, indent: &str) -> String {
    let mut line = format!(
        "{indent}{} ({}) {}",
        piece.name, piece.placement.0, piece.type_id
    );
    if let Some(terminal) = &piece.terminal {
        line.push(' ');
        line.push_str(&terminal.0);
    }
    if let Some(activity) = piece.activity {
        line.push(' ');
        line.push_str(&word(activity));
    }
    if piece.on_screen {
        line.push_str(", on screen");
    }
    if piece.you {
        line.push_str(", you");
    }
    line
}

fn picture(voyages: &[VoyageOverview]) -> Vec<String> {
    let mut lines = Vec::new();
    for voyage in voyages {
        let open = if voyage.selected { ", open" } else { "" };
        lines.push(format!("{} ({}){open}", voyage.name, voyage.id.0));
        for fleet in &voyage.fleets {
            let open = if fleet.on_screen { ", open" } else { "" };
            lines.push(format!("  Fleet {} ({}){open}", fleet.name, fleet.id.0));
            lines.extend(fleet.pieces.iter().map(|piece| piece_line(piece, "    ")));
        }
        let state = if voyage.portals.visible {
            "visible"
        } else {
            "not visible"
        };
        lines.push(format!("  Portals {state}"));
        lines.extend(
            voyage
                .portals
                .pieces
                .iter()
                .map(|piece| piece_line(piece, "    ")),
        );
    }
    lines
}

impl Reading<'_> {
    fn voyage(&self, voyage: &Voyage) -> VoyageOverview {
        let home = self
            .layout
            .home
            .as_ref()
            .is_some_and(|home| home.id == voyage.id);
        let selected = match self.layout.view {
            WorkspaceView::Home => home,
            WorkspaceView::Fleet => self.layout.selected_voyage.as_ref() == Some(&voyage.id),
        };
        let column = voyage.portal_layout.as_ref();
        let visible = column.is_some_and(|column| column.visible);
        VoyageOverview {
            id: voyage.id.clone(),
            name: voyage.name.clone(),
            selected,
            fleets: voyage
                .fleets
                .iter()
                .map(|fleet| {
                    let on_screen = selected
                        && (home || self.layout.selected_fleet.as_ref() == Some(&fleet.id));
                    FleetOverview {
                        id: fleet.id.clone(),
                        name: fleet.name.clone(),
                        on_screen,
                        pieces: self.pieces(
                            &fleet.placements,
                            Some(crate::panels::Group::of_fleet(fleet)),
                            on_screen,
                        ),
                    }
                })
                .collect(),
            portals: PortalsOverview {
                visible,
                pieces: self.pieces(
                    &voyage.portals,
                    crate::panels::Group::of_portals(voyage),
                    selected && visible,
                ),
            },
        }
    }

    fn pieces(
        &self,
        members: &[Placement],
        group: Option<crate::panels::Group<'_>>,
        group_shown: bool,
    ) -> Vec<PieceOverview> {
        members
            .iter()
            .map(|placement| {
                let content = self
                    .layout
                    .vessels
                    .iter()
                    .find(|content| content.id == placement.vessel);
                let backend = content.and_then(|content| content.backend.as_ref());
                PieceOverview {
                    placement: placement.id.clone(),
                    name: placement.name.clone(),
                    type_id: content
                        .map(|content| content.type_id.clone())
                        .unwrap_or_default(),
                    you: &placement.vessel == self.vessel,
                    on_screen: group_shown
                        && group.is_some_and(|group| group.on_screen(&placement.id)),
                    terminal: backend.cloned(),
                    activity: backend.map(|backend| {
                        self.activity
                            .get(&backend.0)
                            .map_or(ActivityState::Unknown, |fact| fact.state)
                    }),
                }
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use voyager_contract::{
        Action, CoreTerminalId, PlacementId, PortalLayout, Split, Vessel, activity::ActivityState,
        canvas::PortalMode,
    };

    fn terminal(address: &str) -> CoreTerminalId {
        CoreTerminalId(address.into())
    }

    fn report(state: ActivityState) -> ReportedActivity {
        ReportedActivity {
            state,
            reason: None,
            reported: Some(true),
            app: None,
            title: None,
            message: None,
            kind: None,
            progress: None,
            source_ms: None,
            observed_ms: None,
            sequence: None,
            limited: false,
        }
    }

    fn two_voyages() -> Layout {
        let mut model = crate::workspace::Model::default();
        for (name, cwd) in [("Alpha", "/alpha"), ("Beta", "/beta")] {
            model
                .apply(Action::CreateVoyage {
                    name: name.into(),
                    cwd: cwd.into(),
                })
                .unwrap();
        }
        let [alpha, beta] = [0, 1].map(|index| model.layout.voyages[index].id.clone());
        model
            .apply(Action::CreateFleet {
                voyage: alpha,
                name: "Side".into(),
            })
            .unwrap();
        model.apply(Action::SelectVoyage { id: beta }).unwrap();
        model.layout
    }

    fn with_portals(layout: &mut Layout, visible: bool) -> [PlacementId; 2] {
        let ids = [
            PlacementId("portal-a".into()),
            PlacementId("portal-b".into()),
        ];
        let voyage = &mut layout.voyages[1];
        for (index, id) in ids.iter().enumerate() {
            let vessel = VesselId(format!("portal-vessel-{index}"));
            layout.vessels.push(Vessel {
                id: vessel.clone(),
                type_id: "terminal".into(),
                cwd: "/beta".into(),
                backend: Some(terminal(&format!("p{index}"))),
                configuration: None,
                start_pending: None,
                launch: None,
                shell_intent: None,
                adopted: false,
            });
            voyage.portals.push(Placement {
                id: id.clone(),
                vessel,
                name: format!("Portal {index}"),
                name_origin: Default::default(),
                hidden: index == 1,
            });
        }
        layout.vessels.push(Vessel {
            id: VesselId("portal-vessel-c".into()),
            type_id: "terminal".into(),
            cwd: "/beta".into(),
            backend: Some(terminal("pc")),
            configuration: None,
            start_pending: None,
            launch: None,
            shell_intent: None,
            adopted: false,
        });
        voyage.portals.push(Placement {
            id: PlacementId("portal-c".into()),
            vessel: VesselId("portal-vessel-c".into()),
            name: "Portal c".into(),
            name_origin: Default::default(),
            hidden: false,
        });
        voyage.portal_layout = Some(PortalLayout {
            root: Some(Split::Branch {
                axis: voyager_contract::Axis::Vertical,
                share: Default::default(),
                first: Box::new(Split::Leaf {
                    placement: ids[0].clone(),
                }),
                second: Box::new(Split::Leaf {
                    placement: ids[1].clone(),
                }),
            }),
            maximized_placement: None,
            visible,
            mode: PortalMode::Overlay,
            width: 340,
        });
        ids
    }

    fn read(
        layout: &Layout,
        caller: &VesselId,
        activity: &[(&str, ActivityState)],
    ) -> Vec<VoyageOverview> {
        let activity = activity
            .iter()
            .map(|(address, state)| ((*address).to_owned(), report(*state)))
            .collect();
        voyages(layout, caller, &activity)
    }

    #[test]
    fn every_voyage_and_fleet_is_listed_and_only_the_selected_ones_are_on_screen() {
        let layout = two_voyages();
        let seen = read(&layout, &VesselId("stranger".into()), &[]);
        assert_eq!(
            seen.iter().map(|v| v.name.as_str()).collect::<Vec<_>>(),
            ["Alpha", "Beta", "Home"]
        );
        assert_eq!(
            seen.iter().map(|v| v.selected).collect::<Vec<_>>(),
            [false, true, false]
        );
        assert_eq!(seen[0].fleets.len(), 2);
        assert!(seen[0].fleets.iter().all(|fleet| !fleet.on_screen));
        assert_eq!(
            seen[1]
                .fleets
                .iter()
                .filter(|fleet| fleet.on_screen)
                .count(),
            1
        );
        assert_eq!(
            seen.iter()
                .flat_map(|v| &v.fleets)
                .flat_map(|f| &f.pieces)
                .filter(|piece| piece.you)
                .count(),
            0
        );
    }

    #[test]
    fn only_the_callers_own_piece_is_marked_and_a_foreign_vessel_marks_none() {
        let layout = two_voyages();
        let own = layout.voyages[0].fleets[0].placements[0].vessel.clone();
        let marked = |seen: &[VoyageOverview]| {
            seen.iter()
                .flat_map(|v| &v.fleets)
                .flat_map(|f| &f.pieces)
                .filter(|piece| piece.you)
                .map(|piece| piece.placement.clone())
                .collect::<Vec<_>>()
        };
        assert_eq!(
            marked(&read(&layout, &own, &[])),
            [layout.voyages[0].fleets[0].placements[0].id.clone()]
        );
        assert!(marked(&read(&layout, &VesselId("stranger".into()), &[])).is_empty());
    }

    #[test]
    fn portals_are_on_screen_only_when_the_column_is_visible_and_the_piece_is_placed_and_not_hidden()
     {
        let mut layout = two_voyages();
        let [shown, hidden] = with_portals(&mut layout, true);
        let caller = VesselId("caller".into());
        let seen = read(&layout, &caller, &[]);
        let portals = &seen[1].portals;
        assert!(portals.visible);
        let flag = |id: &PlacementId| {
            portals
                .pieces
                .iter()
                .find(|piece| &piece.placement == id)
                .map(|piece| piece.on_screen)
        };
        assert_eq!(flag(&shown), Some(true));
        assert_eq!(flag(&hidden), Some(false));
        assert_eq!(portals.pieces.len(), 3);
        assert_eq!(flag(&PlacementId("portal-c".into())), Some(false));

        with_portals_visible(&mut layout, false);
        let seen = read(&layout, &caller, &[]);
        assert!(!seen[1].portals.visible);
        assert!(seen[1].portals.pieces.iter().all(|piece| !piece.on_screen));
    }

    #[test]
    fn a_visible_column_of_a_voyage_that_is_not_open_is_visible_but_nothing_in_it_is_on_screen() {
        let mut layout = two_voyages();
        with_portals(&mut layout, true);
        layout.selected_voyage = Some(layout.voyages[0].id.clone());
        let seen = read(&layout, &VesselId("caller".into()), &[]);
        let portals = &seen[1].portals;
        assert!(!seen[1].selected);
        assert!(portals.visible);
        assert_eq!(portals.pieces.len(), 3);
        assert!(portals.pieces.iter().all(|piece| !piece.on_screen));
    }

    fn with_portals_visible(layout: &mut Layout, visible: bool) {
        layout.voyages[1].portal_layout.as_mut().unwrap().visible = visible;
    }

    #[test]
    fn a_piece_reports_its_programs_state_or_unknown_and_a_piece_without_a_program_reports_none() {
        let mut layout = two_voyages();
        with_portals(&mut layout, true);
        let caller = VesselId("caller".into());
        let seen = read(&layout, &caller, &[("p0", ActivityState::Working)]);
        let portals = &seen[1].portals.pieces;
        assert_eq!(portals[0].activity, Some(ActivityState::Working));
        assert_eq!(portals[0].terminal, Some(terminal("p0")));
        assert_eq!(portals[1].activity, Some(ActivityState::Unknown));
        assert_eq!(portals[2].terminal, Some(terminal("pc")));
        layout
            .vessels
            .iter_mut()
            .for_each(|vessel| vessel.backend = None);
        let seen = read(&layout, &caller, &[("p0", ActivityState::Working)]);
        assert!(
            seen[1]
                .portals
                .pieces
                .iter()
                .all(|piece| piece.activity.is_none() && piece.terminal.is_none())
        );
    }

    #[test]
    fn the_picture_puts_each_name_before_its_id_and_marks_state_screen_and_self() {
        let mut layout = two_voyages();
        let own = layout.voyages[1].fleets[0].placements[0].vessel.clone();
        layout.vessels.iter_mut().for_each(|vessel| {
            vessel.backend = Some(terminal("t4"));
        });
        let seen = read(&layout, &own, &[("t4", ActivityState::Working)]);
        let lines = picture(&seen);
        assert_eq!(lines[0], format!("Alpha ({})", layout.voyages[0].id.0));
        assert!(lines.contains(&format!("Beta ({}), open", layout.voyages[1].id.0)));
        let own_line = lines
            .iter()
            .find(|line| line.ends_with(", you"))
            .expect("the caller's own piece is marked");
        assert!(own_line.contains(" terminal t4 working, on screen"));
        assert!(
            lines
                .iter()
                .any(|line| line.starts_with("  Fleet Side (") && !line.ends_with(", open"))
        );
        assert!(lines.contains(&"  Portals not visible".to_owned()));
    }

    #[test]
    fn the_printed_reply_puts_the_picture_before_the_status_and_keeps_the_status_paths() {
        let layout = two_voyages();
        let overview = Overview {
            status: VesselStatus {
                vessel: VesselId("vessel-1".into()),
                terminal: CoreTerminalId("t1".into()),
                version: 7,
                placements: Vec::new(),
            },
            voyages: voyages(&layout, &VesselId("vessel-1".into()), &BTreeMap::new()),
        };
        let text = serde_json::to_string(&printed(&overview)).unwrap();
        let (kind, picture, status) = (
            text.find("\"kind\"").unwrap(),
            text.find("\"picture\"").unwrap(),
            text.find("\"status\":").unwrap(),
        );
        assert!(kind < picture && picture < status);
        let value: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["kind"], "status");
        assert_eq!(value["status"]["version"], "7");
        assert_eq!(value["status"]["vessel"], "vessel-1");
        assert!(value["status"]["placements"].is_array());
        assert!(!value["picture"].to_string().contains("version"));
    }
}
