use super::{drawn_as, vessel};
use crate::journey::layout::placed_on;
use crate::native::Seen;
use serde::Serialize;
use voyager_contract::inspection::{Element, Rect, Role};
use voyager_contract::{
    Axis, Context, Fleet, FleetId, Layout, PlacementId, RenameTarget, Split, Vessel, Voyage,
    VoyageId,
};

#[derive(Clone, Debug, PartialEq, Serialize)]
pub enum Arrangement {
    Leaf(PlacementId),
    Branch {
        axis: Axis,
        first: Box<Arrangement>,
        second: Box<Arrangement>,
    },
}

impl Arrangement {
    fn saved(split: &Split) -> Self {
        match split {
            Split::Leaf { placement } => Self::Leaf(placement.clone()),
            Split::Branch {
                axis,
                first,
                second,
                ..
            } => Self::Branch {
                axis: *axis,
                first: Box::new(Self::saved(first)),
                second: Box::new(Self::saved(second)),
            },
        }
    }

    fn placements(&self) -> Vec<&PlacementId> {
        match self {
            Self::Leaf(id) => vec![id],
            Self::Branch { first, second, .. } => {
                let mut placements = first.placements();
                placements.extend(second.placements());
                placements
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Placed {
    pub id: PlacementId,
    pub name: String,
    pub given: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Tab {
    pub id: FleetId,
    pub name: String,
    pub vessels: Vec<Placed>,
    pub arrangement: Option<Arrangement>,
}

impl Tab {
    pub fn saved(fleet: &Fleet) -> Self {
        Self {
            id: fleet.id.clone(),
            name: fleet.name.clone(),
            vessels: fleet.vessels.iter().map(placed).collect(),
            arrangement: fleet.root.as_ref().map(Arrangement::saved),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Row {
    pub id: VoyageId,
    pub name: String,
    pub fleets: Vec<Tab>,
}

impl Row {
    pub fn saved(voyage: &Voyage) -> Self {
        Self {
            id: voyage.id.clone(),
            name: voyage.name.clone(),
            fleets: voyage.fleets.iter().map(Tab::saved).collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Model {
    pub home: Option<Row>,
    pub voyages: Vec<Row>,
    pub voyage: VoyageId,
    pub fleet: FleetId,
    pub dock: Context,
}

impl Model {
    pub fn start(layout: &Layout) -> Option<Self> {
        Some(Self {
            home: layout.home.as_ref().map(Row::saved),
            voyages: layout.voyages.iter().map(Row::saved).collect(),
            voyage: layout.selected_voyage.clone()?,
            fleet: layout.selected_fleet.clone()?,
            dock: layout.context.clone(),
        })
    }

    pub fn tab(&mut self, id: &FleetId) -> Option<&mut Tab> {
        self.voyages
            .iter_mut()
            .flat_map(|voyage| &mut voyage.fleets)
            .find(|fleet| &fleet.id == id)
    }

    pub fn row(&mut self, id: &VoyageId) -> Option<&mut Row> {
        self.voyages.iter_mut().find(|voyage| &voyage.id == id)
    }

    pub fn split_right(&mut self, fleet: &FleetId, left: &PlacementId, right: &Vessel) {
        if let Some(tab) = self.tab(fleet) {
            tab.vessels.push(placed(right));
            tab.arrangement = Some(Arrangement::Branch {
                axis: Axis::Horizontal,
                first: Box::new(Arrangement::Leaf(left.clone())),
                second: Box::new(Arrangement::Leaf(right.id.clone())),
            });
        }
    }

    pub fn rename(&mut self, subject: &RenameTarget, name: &str) {
        let name = name.to_owned();
        match subject {
            RenameTarget::Voyage { id } => {
                if let Some(row) = self.row(id) {
                    row.name = name;
                }
            }
            RenameTarget::Fleet { id } => {
                if let Some(tab) = self.tab(id) {
                    tab.name = name;
                }
            }
            RenameTarget::Vessel { id } | RenameTarget::Portal { id } => {
                let vessels = self
                    .voyages
                    .iter_mut()
                    .flat_map(|voyage| &mut voyage.fleets)
                    .flat_map(|fleet| &mut fleet.vessels);
                for placed in vessels.filter(|placed| &placed.id == id) {
                    placed.name.clone_from(&name);
                    placed.given = true;
                }
            }
        }
    }

    pub fn differences(&self, seen: &Seen) -> Vec<String> {
        let mut found = Vec::new();
        self.saved(seen.document, &mut found);
        self.drawn(seen, &mut found);
        found
    }

    fn saved(&self, layout: &Layout, found: &mut Vec<String>) {
        if layout.home.as_ref().map(Row::saved) != self.home {
            found.push("the saved Home Voyage is not the one the journey started with".into());
        }
        for voyage in layout.voyages.iter().filter(|voyage| voyage.closed) {
            found.push(format!("Voyage {} is saved closed", voyage.id.0));
        }
        for fleet in layout
            .voyages
            .iter()
            .flat_map(|voyage| &voyage.fleets)
            .filter(|fleet| fleet.closed)
        {
            found.push(format!("Fleet {} is saved closed", fleet.id.0));
        }
        for placed in layout
            .voyages
            .iter()
            .flat_map(|voyage| &voyage.fleets)
            .flat_map(|fleet| &fleet.vessels)
            .filter(|placed| placed.hidden)
        {
            found.push(format!("Vessel {} is saved hidden", placed.id.0));
        }
        let saved: Vec<Row> = layout.voyages.iter().map(Row::saved).collect();
        compare_rows(&self.voyages, &saved, found);
        if layout.selected_voyage.as_ref() != Some(&self.voyage) {
            found.push(format!(
                "the saved selected Voyage is {:?}, the journey selected {}",
                layout.selected_voyage.as_ref().map(|id| &id.0),
                self.voyage.0
            ));
        }
        if layout.selected_fleet.as_ref() != Some(&self.fleet) {
            found.push(format!(
                "the saved selected Fleet is {:?}, the journey selected {}",
                layout.selected_fleet.as_ref().map(|id| &id.0),
                self.fleet.0
            ));
        }
        if layout.context != self.dock {
            found.push(format!(
                "the saved dock is {:?}, the journey docked at {:?}",
                layout.context, self.dock
            ));
        }
    }

    fn drawn(&self, seen: &Seen, found: &mut Vec<String>) {
        let frame = seen.frame;
        for element in &frame.ambiguous {
            found.push(format!(
                "the window draws {:?} {:?} more than once",
                element.role, element.key
            ));
        }
        let drawn = |role: Role| -> Vec<&Element> {
            frame
                .elements
                .iter()
                .filter(|element| element.role == role)
                .collect()
        };
        let mut rows = drawn(Role::VoyageName);
        rows.sort_by(|a, b| a.bounds.y.total_cmp(&b.bounds.y));
        let named = self.voyages.iter().map(|row| (&row.id.0, &row.name));
        compare_labels("Voyage row", named, &rows, found);
        let selected = self.voyages.iter().find(|row| row.id == self.voyage);
        let tabs = selected
            .map(|row| row.fleets.as_slice())
            .unwrap_or_default();
        let mut drawn_tabs = drawn(Role::FleetName);
        drawn_tabs.sort_by(|a, b| a.bounds.x.total_cmp(&b.bounds.x));
        let named = tabs.iter().map(|tab| (&tab.id.0, &tab.name));
        compare_labels("Fleet tab", named, &drawn_tabs, found);
        let shown = tabs.iter().find(|tab| tab.id == self.fleet);
        let vessels = shown.map(|tab| tab.vessels.as_slice()).unwrap_or_default();
        let titles = drawn(Role::VesselName);
        let terminals = drawn(Role::Terminal);
        for placed in vessels {
            let title = titles.iter().find(|element| element.key == placed.id.0);
            match title.and_then(|title| title.label.as_deref()) {
                Some(label)
                    if !placed.given || drawn_as(&vessel(&placed.id), label, &placed.name) => {}
                label => found.push(format!(
                    "Vessel {} is titled {label:?}, the journey named it {:?}",
                    placed.id.0, placed.name
                )),
            }
            match terminals.iter().find(|element| element.key == placed.id.0) {
                Some(terminal) if terminal.bounds.width > 0. && terminal.bounds.height > 0. => {}
                Some(terminal) => found.push(format!(
                    "the terminal of Vessel {} is drawn with no area: {:?}",
                    placed.id.0, terminal.bounds
                )),
                None => found.push(format!(
                    "the terminal of Vessel {} is not drawn",
                    placed.id.0
                )),
            }
        }
        let expected: Vec<&String> = vessels.iter().map(|placed| &placed.id.0).collect();
        for (kind, elements) in [("Vessel title", &titles), ("terminal", &terminals)] {
            for element in elements
                .iter()
                .filter(|element| !expected.contains(&&element.key))
            {
                found.push(format!(
                    "the window draws a {kind} for {}, which the shown Fleet does not hold",
                    element.key
                ));
            }
        }
        if let Some(arrangement) = shown.and_then(|tab| tab.arrangement.as_ref()) {
            arranged(arrangement, &terminals, found);
        }
        if frame.dock != self.dock {
            found.push(format!(
                "the window docks at {:?}, the journey docked at {:?}",
                frame.dock, self.dock
            ));
        }
        let rects: Vec<Rect> = terminals.iter().map(|terminal| terminal.bounds).collect();
        let dock = match &self.dock {
            Context::Vessel { id } => terminals
                .iter()
                .find(|terminal| terminal.key == id.0)
                .map(|terminal| terminal.bounds),
            _ => None,
        };
        match drawn(Role::Avatar).first() {
            Some(avatar) if placed_on(&avatar.bounds, dock.as_ref(), &rects) => {}
            Some(avatar) => found.push(format!(
                "the avatar is drawn at {:?}, off its dock {:?}",
                avatar.bounds, self.dock
            )),
            None => found.push("the avatar is not drawn".into()),
        }
    }
}

fn placed(vessel: &Vessel) -> Placed {
    Placed {
        id: vessel.id.clone(),
        name: vessel.name.clone(),
        given: false,
    }
}

fn compare_rows(made: &[Row], saved: &[Row], found: &mut Vec<String>) {
    let ids = |rows: &[Row]| -> Vec<String> { rows.iter().map(|row| row.id.0.clone()).collect() };
    if ids(made) != ids(saved) {
        found.push(format!(
            "the saved Voyages are {:?}, the journey made {:?}",
            ids(saved),
            ids(made)
        ));
        return;
    }
    for (made, saved) in made.iter().zip(saved) {
        if made.name != saved.name {
            found.push(format!(
                "Voyage {} is saved as {:?}, the journey named it {:?}",
                made.id.0, saved.name, made.name
            ));
        }
        compare_tabs(&made.id, &made.fleets, &saved.fleets, found);
    }
}

fn compare_tabs(voyage: &VoyageId, made: &[Tab], saved: &[Tab], found: &mut Vec<String>) {
    let ids = |tabs: &[Tab]| -> Vec<String> { tabs.iter().map(|tab| tab.id.0.clone()).collect() };
    if ids(made) != ids(saved) {
        found.push(format!(
            "Voyage {} saves the Fleets {:?}, the journey made {:?}",
            voyage.0,
            ids(saved),
            ids(made)
        ));
        return;
    }
    for (made, saved) in made.iter().zip(saved) {
        if made.name != saved.name {
            found.push(format!(
                "Fleet {} is saved as {:?}, the journey named it {:?}",
                made.id.0, saved.name, made.name
            ));
        }
        let named = |vessels: &[Placed]| -> Vec<(String, String)> {
            vessels
                .iter()
                .map(|placed| (placed.id.0.clone(), placed.name.clone()))
                .collect()
        };
        if named(&made.vessels) != named(&saved.vessels) {
            found.push(format!(
                "Fleet {} saves the Vessels {:?}, the journey made {:?}",
                made.id.0,
                named(&saved.vessels),
                named(&made.vessels)
            ));
        }
        if made.arrangement != saved.arrangement {
            found.push(format!(
                "Fleet {} saves the arrangement {:?}, the journey made {:?}",
                made.id.0, saved.arrangement, made.arrangement
            ));
        }
    }
}

fn compare_labels<'a>(
    kind: &str,
    named: impl Iterator<Item = (&'a String, &'a String)>,
    drawn: &[&Element],
    found: &mut Vec<String>,
) {
    let named: Vec<_> = named.collect();
    for index in 0..named.len().max(drawn.len()) {
        let expected = named.get(index);
        let element = drawn.get(index);
        let matches = match (expected, element) {
            (Some((id, name)), Some(element)) => {
                element.key == **id && element.label.as_deref() == Some(name.as_str())
            }
            _ => false,
        };
        if !matches {
            found.push(format!(
                "{kind} {} is drawn as {:?}, the journey expects {:?}",
                index + 1,
                element.map(|element| (&element.key, &element.label)),
                expected
            ));
            return;
        }
    }
}

fn arranged(arrangement: &Arrangement, terminals: &[&Element], found: &mut Vec<String>) {
    let Arrangement::Branch {
        axis,
        first,
        second,
    } = arrangement
    else {
        return;
    };
    arranged(first, terminals, found);
    arranged(second, terminals, found);
    let (Some(before), Some(after)) = (extent(first, terminals), extent(second, terminals)) else {
        return;
    };
    let held = match axis {
        Axis::Horizontal => {
            after.x >= before.x + before.width
                && after.y < before.y + before.height
                && before.y < after.y + after.height
        }
        Axis::Vertical => {
            after.y >= before.y + before.height
                && after.x < before.x + before.width
                && before.x < after.x + after.width
        }
    };
    if !held {
        found.push(format!(
            "the {axis:?} split of {:?} and {:?} is drawn at {before:?} and {after:?}",
            first.placements(),
            second.placements()
        ));
    }
}

fn extent(arrangement: &Arrangement, terminals: &[&Element]) -> Option<Rect> {
    let rects: Vec<Rect> = arrangement
        .placements()
        .into_iter()
        .map(|id| {
            terminals
                .iter()
                .find(|terminal| terminal.key == id.0)
                .map(|terminal| terminal.bounds)
        })
        .collect::<Option<_>>()?;
    let left = rects
        .iter()
        .map(|rect| rect.x)
        .fold(f32::INFINITY, f32::min);
    let top = rects
        .iter()
        .map(|rect| rect.y)
        .fold(f32::INFINITY, f32::min);
    let right = rects
        .iter()
        .map(|rect| rect.x + rect.width)
        .fold(f32::NEG_INFINITY, f32::max);
    let bottom = rects
        .iter()
        .map(|rect| rect.y + rect.height)
        .fold(f32::NEG_INFINITY, f32::max);
    Some(Rect {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    })
}
