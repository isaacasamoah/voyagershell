use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Seen, Terminal};
use crate::x11::Key;
use anyhow::{Context as _, Result};
use serde::Serialize;
use std::path::Path;
use voyager_contract::{
    Context, Fleet, FleetId, Layout, PlacementId, RenameTarget, Vessel, Voyage, VoyageId,
};

cases! {
    SplitVessel => "split-vessel",
    DockVessel => "dock-vessel",
    CreateFleet => "create-fleet",
    SwitchFleet => "switch-fleet",
    CreateVoyage => "create-voyage",
    SwitchVoyage => "switch-voyage",
    RenameFleetEnter => "rename-fleet-enter",
    RenameVoyageBlur => "rename-voyage-blur",
    RenameVesselF2 => "rename-vessel-f2",
    RenameKeyboard => "rename-keyboard",
    RenameEscape => "rename-escape-cancels",
    RenameEmpty => "rename-empty-refused",
    Relaunch => "relaunch-restores",
}

pub const CONTROL: Case = Case::RenameFleetEnter;

#[derive(PartialEq)]
struct Start {
    voyage: VoyageId,
    fleet: FleetId,
    vessel: Vessel,
}

#[derive(Default)]
struct Made {
    shell: Option<Terminal>,
    fleet: Option<FleetId>,
    voyage: Option<VoyageId>,
}

impl Made {
    fn vessel(&self) -> Result<&PlacementId> {
        let shell = self.shell.as_ref();
        Ok(shell.context("No earlier case made a Vessel")?.placement())
    }

    fn docked(&self) -> Result<Context> {
        Ok(Context::Vessel {
            id: self.vessel()?.clone(),
        })
    }
}

enum Open {
    DoubleClick,
    ClickThenF2,
    TabRoundTrip,
}

enum Finish<'a> {
    Enter,
    Blur(&'a Target),
    Escape,
}

#[derive(Serialize)]
struct Renamed {
    before: String,
    typed: String,
    after: String,
}

#[derive(PartialEq, Serialize)]
struct Step {
    selected: String,
    context: Context,
    dock: Context,
    fleet: Option<FleetId>,
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let first = Terminal::first(native)?;
    let start = native.observe("one Voyage with one Fleet and one Vessel", |seen| {
        start(seen.document)
    })?;
    let mut made = Made::default();

    cases.check(native, Case::SplitVessel, |native| {
        let before = at_rest(native)?;
        native.hover(&Target::name(&vessel(&start.vessel.id)))?;
        native.click(&Target::split_right(&start.vessel.id))?;
        native.click(&Target::worker("terminal"))?;
        let after = native.observe("a new Vessel with its terminal drawn", |seen| {
            let born = born(vessels(&before), vessels(seen.document), |vessel| {
                &vessel.id
            });
            let drawn = |vessel: &&Vessel| seen.shows(&Target::terminal(&vessel.id));
            (!born.is_empty() && born.iter().all(drawn)).then(|| seen.document.clone())
        })?;
        let born = born(vessels(&before), vessels(&after), |vessel| &vessel.id);
        let beside = fleet(&after, &start.fleet)
            .map(|fleet| fleet.vessels.as_slice())
            .unwrap_or_default();
        let verdict = Verdict::new()
            .expect("exactly one Vessel was created", born.len() == 1)
            .expect(
                "the Fleet holds the first Vessel, unchanged, and the new Vessel",
                beside.len() == 2
                    && beside.contains(&start.vessel)
                    && born.iter().all(|vessel| beside.contains(vessel)),
            )
            .observed("vessels", beside)?;
        if let [new] = born[..] {
            let shell = Terminal::bind(native, &new.id)?;
            shell.focus(native)?;
            shell.line(native, "echo SPLIT-$((6*7))")?;
            shell.shows(native, "SPLIT-42")?;
            made.shell = Some(shell);
        }
        Ok(verdict)
    })?;

    cases.check(native, Case::DockVessel, |native| {
        let want = made.docked()?;
        let before = at_rest(native)?.context;
        native.drag(&Target::AVATAR, &Target::name(&vessel(made.vessel()?)))?;
        let context = native.observe("the document and the frame on one new dock", |seen| {
            (seen.document.context != before && seen.dock() == &seen.document.context)
                .then(|| seen.document.context.clone())
        })?;
        Verdict::new()
            .expect("the avatar docked to the new Vessel", context == want)
            .observed("before", &before)?
            .observed("context", &context)
    })?;

    cases.check(native, Case::CreateFleet, |native| {
        let docked = made.docked()?;
        let before = at_rest(native)?;
        native.click(&Target::create_fleet(&start.voyage))?;
        native.click(&Target::worker("terminal"))?;
        let (after, dock) = native.observe("a new Fleet with its Vessel drawn", |seen| {
            let born = born(fleets(&before), fleets(seen.document), |fleet| &fleet.id);
            (!born.is_empty() && born.iter().all(|fleet| shown(seen, fleet)))
                .then(|| (seen.document.clone(), seen.dock().clone()))
        })?;
        let born = born(fleets(&before), fleets(&after), |fleet| &fleet.id);
        let new = born.first().copied();
        made.fleet = new.map(|fleet| fleet.id.clone());
        Verdict::new()
            .expect("exactly one Fleet was created", born.len() == 1)
            .expect(
                "the new Fleet is named Fleet 2 and holds one Vessel",
                new.is_some_and(|fleet| fleet.name == "Fleet 2" && fleet.vessels.len() == 1),
            )
            .expect(
                "the new Fleet is selected",
                after.selected_fleet == made.fleet,
            )
            .expect(
                "the dock stayed on the Vessel",
                after.context == docked && dock == docked,
            )
            .observed("fleets", &born)?
            .observed("selected", &after.selected_fleet)?
            .observed("context", &after.context)?
            .observed("dock", &dock)
    })?;

    cases.check(native, Case::SwitchFleet, |native| {
        let docked = made.docked()?;
        let new = made
            .fleet
            .as_ref()
            .context("No earlier case made a Fleet")?;
        let mut steps = Vec::new();
        for id in [&start.fleet, new, &start.fleet] {
            native.click(&Target::name(&RenameTarget::Fleet { id: id.clone() }))?;
            steps.push(
                native.observe(&format!("Fleet {} selected and drawn", id.0), |seen| {
                    let fleet = fleet(seen.document, id)?;
                    (seen.document.selected_fleet.as_ref() == Some(id) && shown(seen, fleet))
                        .then(|| step(seen, &id.0))
                })?,
            );
        }
        Verdict::new()
            .expect(
                "the dock stayed on the Vessel through every switch",
                steps
                    .iter()
                    .all(|step| step.context == docked && step.dock == docked),
            )
            .observed("steps", &steps)
    })?;

    cases.check(native, Case::CreateVoyage, |native| {
        let docked = made.docked()?;
        let before = at_rest(native)?;
        native.click(&Target::CREATE_VOYAGE)?;
        let (after, dock) = native.observe("a new Voyage with its Vessel drawn", |seen| {
            let born = born(
                before.voyages.iter(),
                seen.document.voyages.iter(),
                |voyage| &voyage.id,
            );
            let drawn = |voyage: &&Voyage| voyage.fleets.iter().all(|fleet| shown(seen, fleet));
            (!born.is_empty() && born.iter().all(drawn))
                .then(|| (seen.document.clone(), seen.dock().clone()))
        })?;
        let born = born(before.voyages.iter(), after.voyages.iter(), |voyage| {
            &voyage.id
        });
        let new = born.first().copied();
        made.voyage = new.map(|voyage| voyage.id.clone());
        let folder = new
            .and_then(|voyage| voyage.cwd.as_deref())
            .and_then(|cwd| Path::new(cwd).file_name())
            .and_then(|name| name.to_str());
        Verdict::new()
            .expect("exactly one Voyage was created", born.len() == 1)
            .expect(
                "the new Voyage is open and named after its working folder",
                new.is_some_and(|voyage| !voyage.closed && Some(voyage.name.as_str()) == folder),
            )
            .expect(
                "the new Voyage is selected",
                after.selected_voyage == made.voyage,
            )
            .expect(
                "the dock stayed on the Vessel",
                after.context == docked && dock == docked,
            )
            .observed("voyages", &born)?
            .observed("selected", &after.selected_voyage)?
            .observed("context", &after.context)?
            .observed("dock", &dock)
    })?;

    cases.check(native, Case::SwitchVoyage, |native| {
        let docked = made.docked()?;
        let new = made
            .voyage
            .as_ref()
            .context("No earlier case made a Voyage")?;
        let mut steps = Vec::new();
        for id in [&start.voyage, new, &start.voyage] {
            native.click(&Target::name(&RenameTarget::Voyage { id: id.clone() }))?;
            steps.push(
                native.observe(&format!("Voyage {} selected and drawn", id.0), |seen| {
                    let selected = seen.document.selected_fleet.as_ref()?;
                    (seen.document.selected_voyage.as_ref() == Some(id)
                        && shown(seen, fleet(seen.document, selected)?))
                    .then(|| step(seen, &id.0))
                })?,
            );
        }
        Verdict::new()
            .expect(
                "the dock stayed on the Vessel through every switch",
                steps
                    .iter()
                    .all(|step| step.context == docked && step.dock == docked),
            )
            .expect(
                "the first Voyage shows its first Fleet again",
                steps
                    .last()
                    .is_some_and(|step| step.fleet.as_ref() == Some(&start.fleet)),
            )
            .observed("steps", &steps)
    })?;

    cases.check(native, Case::RenameFleetEnter, |native| {
        let fleet = RenameTarget::Fleet {
            id: start.fleet.clone(),
        };
        let renamed = rename(
            native,
            &fleet,
            Open::DoubleClick,
            "Native Fleet",
            Finish::Enter,
        )?;
        typed(renamed)
    })?;

    cases.check(native, Case::RenameVoyageBlur, |native| {
        let voyage = RenameTarget::Voyage {
            id: start.voyage.clone(),
        };
        let renamed = rename(
            native,
            &voyage,
            Open::DoubleClick,
            "Blur Voyage",
            Finish::Blur(&first.target()),
        )?;
        typed(renamed)
    })?;

    cases.check(native, Case::RenameVesselF2, |native| {
        let renamed = rename(
            native,
            &vessel(made.vessel()?),
            Open::ClickThenF2,
            "+",
            Finish::Enter,
        )?;
        typed(renamed)
    })?;

    cases.check(native, Case::RenameKeyboard, |native| {
        let voyage = RenameTarget::Voyage {
            id: start.voyage.clone(),
        };
        let renamed = rename(
            native,
            &voyage,
            Open::TabRoundTrip,
            "Keyboard Voyage",
            Finish::Enter,
        )?;
        typed(renamed)
    })?;

    cases.check(native, Case::RenameEscape, |native| {
        let fleet = RenameTarget::Fleet {
            id: start.fleet.clone(),
        };
        let renamed = rename(
            native,
            &fleet,
            Open::DoubleClick,
            "Discarded",
            Finish::Escape,
        )?;
        kept(renamed)
    })?;

    cases.check(native, Case::RenameEmpty, |native| {
        let renamed = rename(
            native,
            &vessel(made.vessel()?),
            Open::DoubleClick,
            "",
            Finish::Enter,
        )?;
        kept(renamed)
    })?;

    cases.check(native, Case::Relaunch, |native| {
        let shell = made
            .shell
            .as_ref()
            .context("No earlier case made a Vessel")?;
        let before = at_rest(native)?;
        native.close()?;
        first.same_program(native)?;
        shell.same_program(native)?;
        native.launch()?;
        let after = native.observe("the avatar docked where the document says", |seen| {
            (seen.dock() == &seen.document.context).then(|| seen.document.clone())
        })?;
        first.same_program(native)?;
        shell.same_program(native)?;
        Verdict::new()
            .expect(
                "the layout document is the same after the relaunch",
                after == before,
            )
            .observed("before", &before)?
            .observed("after", &after)
    })
}

fn rename(
    native: &Native,
    subject: &RenameTarget,
    open: Open,
    text: &str,
    finish: Finish,
) -> Result<Renamed> {
    let (name, editor) = (Target::name(subject), Target::editor(subject));
    let before = native.observe(&format!("{name} with its saved name"), |seen| {
        seen.shows(&name)
            .then(|| name_of(seen.document, subject))
            .flatten()
    })?;
    match open {
        Open::DoubleClick => native.double_click(&name)?,
        Open::ClickThenF2 => {
            native.click(&name)?;
            native.press(Key::F2)?;
        }
        Open::TabRoundTrip => {
            native.click(&name)?;
            native.press(Key::Tab)?;
            native.press(Key::Tab.shift())?;
            native.press(Key::F2)?;
        }
    }
    native.observe(&format!("{editor} in place of {name}"), |seen| {
        (seen.shows(&editor) && !seen.shows(&name)).then_some(())
    })?;
    if text.is_empty() {
        native.press(Key::BackSpace)?;
    } else {
        native.type_text(text)?;
    }
    match finish {
        Finish::Enter => native.press(Key::Return)?,
        Finish::Escape => native.press(Key::Escape)?,
        Finish::Blur(elsewhere) => native.click(elsewhere)?,
    }
    let after = native.observe(&format!("{name} in place of {editor}"), |seen| {
        (seen.shows(&name) && !seen.shows(&editor))
            .then(|| name_of(seen.document, subject))
            .flatten()
    })?;
    Ok(Renamed {
        before,
        typed: text.into(),
        after,
    })
}

fn typed(renamed: Renamed) -> Result<Verdict> {
    Verdict::new()
        .expect(
            "the saved name is the typed text",
            renamed.after == renamed.typed,
        )
        .observed("rename", &renamed)
}

fn kept(renamed: Renamed) -> Result<Verdict> {
    Verdict::new()
        .expect(
            "the saved name is unchanged",
            renamed.after == renamed.before,
        )
        .observed("rename", &renamed)
}

fn at_rest(native: &Native) -> Result<Layout> {
    native.observe("the workspace at rest", |seen| Some(seen.document.clone()))
}

fn start(layout: &Layout) -> Option<Start> {
    let [voyage] = &layout.voyages[..] else {
        return None;
    };
    let [fleet] = &voyage.fleets[..] else {
        return None;
    };
    let [vessel] = &fleet.vessels[..] else {
        return None;
    };
    (!voyage.closed
        && layout.selected_voyage.as_ref() == Some(&voyage.id)
        && layout.selected_fleet.as_ref() == Some(&fleet.id))
    .then(|| Start {
        voyage: voyage.id.clone(),
        fleet: fleet.id.clone(),
        vessel: vessel.clone(),
    })
}

fn step(seen: &Seen, selected: &str) -> Step {
    Step {
        selected: selected.to_owned(),
        context: seen.document.context.clone(),
        dock: seen.dock().clone(),
        fleet: seen.document.selected_fleet.clone(),
    }
}

fn shown(seen: &Seen, fleet: &Fleet) -> bool {
    fleet
        .vessels
        .iter()
        .all(|placed| seen.shows(&Target::name(&vessel(&placed.id))))
}

fn born<'a, T, I: PartialEq + 'a>(
    before: impl Iterator<Item = &'a T>,
    after: impl Iterator<Item = &'a T>,
    id: impl Fn(&T) -> &I,
) -> Vec<&'a T> {
    let known: Vec<&I> = before.map(&id).collect();
    after.filter(|item| !known.contains(&id(item))).collect()
}

fn fleets(layout: &Layout) -> impl Iterator<Item = &Fleet> {
    layout
        .voyages
        .iter()
        .chain(&layout.home)
        .flat_map(|voyage| &voyage.fleets)
}

fn vessels(layout: &Layout) -> impl Iterator<Item = &Vessel> {
    fleets(layout).flat_map(|fleet| &fleet.vessels)
}

fn fleet<'a>(layout: &'a Layout, id: &FleetId) -> Option<&'a Fleet> {
    fleets(layout).find(|fleet| &fleet.id == id)
}

fn vessel(id: &PlacementId) -> RenameTarget {
    RenameTarget::Vessel { id: id.clone() }
}

fn name_of(layout: &Layout, subject: &RenameTarget) -> Option<String> {
    match subject {
        RenameTarget::Voyage { id } => layout
            .voyages
            .iter()
            .find(|voyage| &voyage.id == id)
            .map(|voyage| voyage.name.clone()),
        RenameTarget::Fleet { id } => fleet(layout, id).map(|fleet| fleet.name.clone()),
        RenameTarget::Vessel { id } => vessels(layout)
            .find(|vessel| &vessel.id == id)
            .map(|vessel| vessel.name.clone()),
        RenameTarget::Portal { id } => layout
            .voyages
            .iter()
            .flat_map(|voyage| &voyage.portals)
            .find(|portal| &portal.id == id)
            .map(|portal| portal.name.clone()),
    }
}
