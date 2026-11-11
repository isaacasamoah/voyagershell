use voyager_contract::{
    Axis, Layout, PlacementId, Split, SplitShare, Vessel,
    observation::{Corner, Position},
};

const SPAN: u64 = 1 << 40;

#[derive(Clone, Copy)]
struct Area {
    left: u64,
    top: u64,
    right: u64,
    bottom: u64,
}

pub(crate) struct Located {
    pub id: PlacementId,
    pub name: String,
    pub address: String,
    pub position: Option<Position>,
}

pub(crate) fn distinct(names: &mut [String]) {
    for index in 0..names.len() {
        if names[..index].contains(&names[index]) {
            let base = names[index].clone();
            let mut suffix = 2_u64;
            names[index] = loop {
                let candidate = format!("{base} {suffix}");
                if !names.contains(&candidate) {
                    break candidate;
                }
                suffix += 1;
            };
        }
    }
}

fn place(root: &Split, area: Area, areas: &mut Vec<(PlacementId, Area)>) {
    match root {
        Split::Leaf { placement } => areas.push((placement.clone(), area)),
        Split::Branch {
            axis,
            share,
            first,
            second,
        } => {
            let share = u64::from(u16::from(*share));
            let total = u64::from(SplitShare::TOTAL);
            let (before, after) = match axis {
                Axis::Horizontal => {
                    let middle = area.left + (area.right - area.left) * share / total;
                    (
                        Area {
                            right: middle,
                            ..area
                        },
                        Area {
                            left: middle,
                            ..area
                        },
                    )
                }
                Axis::Vertical => {
                    let middle = area.top + (area.bottom - area.top) * share / total;
                    (
                        Area {
                            bottom: middle,
                            ..area
                        },
                        Area {
                            top: middle,
                            ..area
                        },
                    )
                }
            };
            place(first, before, areas);
            place(second, after, areas);
        }
    }
}

fn lines(areas: &[(PlacementId, Area)], edge: fn(&Area) -> u64) -> Vec<u64> {
    let mut lines: Vec<u64> = areas.iter().map(|(_, area)| edge(area)).collect();
    lines.sort_unstable();
    lines.dedup();
    lines
}

fn count(lines: &[u64], from: u64, to: u64) -> u16 {
    u16::try_from(
        lines
            .iter()
            .filter(|line| (from..to).contains(*line))
            .count(),
    )
    .unwrap_or(u16::MAX)
}

pub(crate) fn positions(
    root: &Option<Split>,
    members: &[Vessel],
    maximized: Option<&PlacementId>,
) -> Vec<(PlacementId, Position)> {
    let shown = crate::panels::visible(root, members);
    let Some(tree) = shown.as_ref() else {
        return Vec::new();
    };
    let whole = Area {
        left: 0,
        top: 0,
        right: SPAN,
        bottom: SPAN,
    };
    let mut areas = Vec::new();
    match maximized.filter(|id| crate::panels::contains(&shown, id)) {
        Some(id) => areas.push((id.clone(), whole)),
        None => place(tree, whole, &mut areas),
    }
    let lefts = lines(&areas, |area| area.left);
    let tops = lines(&areas, |area| area.top);
    areas
        .iter()
        .map(|(id, area)| {
            let corners = [
                (Corner::TopLeft, area.left == 0 && area.top == 0),
                (Corner::TopRight, area.right == SPAN && area.top == 0),
                (Corner::BottomLeft, area.left == 0 && area.bottom == SPAN),
                (
                    Corner::BottomRight,
                    area.right == SPAN && area.bottom == SPAN,
                ),
            ];
            let position = Position {
                column: count(&lefts, 0, area.left) + 1,
                row: count(&tops, 0, area.top) + 1,
                column_span: count(&lefts, area.left, area.right),
                row_span: count(&tops, area.top, area.bottom),
                columns: count(&lefts, 0, SPAN),
                rows: count(&tops, 0, SPAN),
                corners: corners
                    .into_iter()
                    .filter_map(|(corner, occupied)| occupied.then_some(corner))
                    .collect(),
            };
            (id.clone(), position)
        })
        .collect()
}

pub(crate) fn locate(layout: &Layout, name: impl Fn(&Vessel) -> String) -> Vec<Located> {
    let mut voyages: Vec<String> = layout
        .containers()
        .map(|voyage| {
            if layout
                .home
                .as_ref()
                .is_some_and(|home| home.id == voyage.id)
            {
                "Home".to_owned()
            } else {
                voyage.name.clone()
            }
        })
        .collect();
    distinct(&mut voyages);
    let mut located = Vec::new();
    for (voyage, voyage_name) in layout.containers().zip(voyages) {
        let mut fleets: Vec<String> = std::iter::once("Portals".to_owned())
            .chain(voyage.fleets.iter().map(|fleet| fleet.name.clone()))
            .collect();
        distinct(&mut fleets);
        let column = voyage
            .portal_layout
            .as_ref()
            .filter(|column| column.visible);
        let groups = voyage
            .fleets
            .iter()
            .map(|fleet| {
                (
                    fleet.vessels.as_slice(),
                    positions(
                        &fleet.root,
                        &fleet.vessels,
                        fleet.maximized_placement.as_ref(),
                    ),
                )
            })
            .zip(fleets.iter().skip(1))
            .chain(std::iter::once((
                (
                    voyage.portals.as_slice(),
                    column.map_or_else(Vec::new, |column| {
                        positions(
                            &column.root,
                            &voyage.portals,
                            column.maximized_placement.as_ref(),
                        )
                    }),
                ),
                &fleets[0],
            )));
        for ((members, mut placed), group_name) in groups {
            let mut names: Vec<String> = members.iter().map(&name).collect();
            distinct(&mut names);
            for (member, name) in members.iter().zip(names) {
                let position = placed
                    .iter()
                    .position(|(id, _)| id == &member.id)
                    .map(|index| placed.swap_remove(index).1);
                located.push(Located {
                    id: member.id.clone(),
                    address: format!("{voyage_name}/{group_name}/{name}"),
                    name,
                    position,
                });
            }
        }
    }
    let mut addresses: Vec<String> = located.iter().map(|item| item.address.clone()).collect();
    distinct(&mut addresses);
    for (item, address) in located.iter_mut().zip(addresses) {
        item.address = address;
    }
    located
}

#[cfg(test)]
mod tests {
    use super::*;
    use voyager_contract::{ContentId, Fleet, FleetId, NameOrigin, Voyage, VoyageId};

    fn vessel(id: &str, name: &str) -> Vessel {
        Vessel {
            id: PlacementId(id.into()),
            content: ContentId(format!("content-{id}")),
            name: name.into(),
            name_origin: NameOrigin::Deliberate,
            hidden: false,
        }
    }

    fn leaf(id: &str) -> Split {
        Split::Leaf {
            placement: PlacementId(id.into()),
        }
    }

    fn split(axis: Axis, first: Split, second: Split) -> Split {
        Split::Branch {
            axis,
            share: SplitShare::default(),
            first: Box::new(first),
            second: Box::new(second),
        }
    }

    fn fleet(name: &str, vessels: Vec<Vessel>) -> Fleet {
        Fleet {
            id: FleetId(format!("fleet-{}", vessels[0].id.0)),
            name: name.into(),
            closed: false,
            root: Some(leaf(&vessels[0].id.0)),
            vessels,
            maximized_placement: None,
        }
    }

    fn voyage(id: &str, fleets: Vec<Fleet>, portals: Vec<Vessel>) -> Voyage {
        Voyage {
            id: VoyageId(id.into()),
            name: "Work".into(),
            name_origin: NameOrigin::Deliberate,
            primary_vessel: None,
            closed: false,
            closed_order: 0,
            fleets,
            portals,
            portal_layout: None,
            cwd: None,
        }
    }

    #[test]
    fn each_corner_of_a_split_fleet_belongs_to_one_shown_panel() {
        let mut members = vec![vessel("a", "a"), vessel("b", "b"), vessel("c", "c")];
        let root = Some(split(
            Axis::Horizontal,
            leaf("a"),
            split(Axis::Vertical, leaf("b"), leaf("c")),
        ));
        let at = |placed: &[(PlacementId, Position)], id: &str| {
            placed
                .iter()
                .find(|(placement, _)| placement.0 == id)
                .map(|(_, position)| position.clone())
        };
        let placed = positions(&root, &members, None);
        assert_eq!(
            at(&placed, "a"),
            Some(Position {
                column: 1,
                row: 1,
                column_span: 1,
                row_span: 2,
                columns: 2,
                rows: 2,
                corners: vec![Corner::TopLeft, Corner::BottomLeft],
            })
        );
        assert_eq!(at(&placed, "b").unwrap().corners, vec![Corner::TopRight]);
        let below = at(&placed, "c").unwrap();
        assert_eq!((below.column, below.row), (2, 2));
        assert_eq!(below.corners, vec![Corner::BottomRight]);
        members[1].hidden = true;
        let placed = positions(&root, &members, None);
        assert_eq!(at(&placed, "b"), None);
        assert_eq!(
            at(&placed, "c").unwrap().corners,
            vec![Corner::TopRight, Corner::BottomRight]
        );
        let placed = positions(&root, &members, Some(&PlacementId("a".into())));
        assert_eq!(placed.len(), 1);
        assert_eq!(at(&placed, "a").unwrap().corners.len(), 4);
    }

    #[test]
    fn repeated_names_are_numbered_and_every_address_is_unique() {
        let layout = Layout {
            voyages: vec![
                voyage(
                    "one",
                    vec![
                        fleet("Main", vec![vessel("a", "shell"), vessel("b", "shell")]),
                        fleet("Main", vec![vessel("c", "shell")]),
                    ],
                    vec![vessel("d", "shell")],
                ),
                voyage(
                    "two",
                    vec![fleet("Portals", vec![vessel("e", "x/y")])],
                    vec![],
                ),
            ],
            ..Layout::default()
        };
        let located = locate(&layout, |placement| placement.name.clone());
        let addresses: Vec<&str> = located.iter().map(|item| item.address.as_str()).collect();
        assert_eq!(
            addresses,
            [
                "Work/Main/shell",
                "Work/Main/shell 2",
                "Work/Main 2/shell",
                "Work/Portals/shell",
                "Work 2/Portals 2/x/y",
            ]
        );
        assert_eq!(located[1].name, "shell 2");
        assert!(located[0].position.is_some() && located[1].position.is_none());
    }
}
