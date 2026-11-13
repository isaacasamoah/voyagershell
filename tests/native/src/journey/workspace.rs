use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Seen, Terminal, fleets, vessels, voyages};
use crate::sandbox;
use crate::x11::Key;
use anyhow::Result;
use serde::Serialize;
use std::path::Path;
use voyager_contract::inspection::Role;
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

const FLEET_NAME: &str = "Native Fleet";
const VOYAGE_NAME: &str = "Keyboard Voyage";
const VESSEL_NAME: &str = "+";

#[derive(PartialEq)]
struct Start {
    voyage: VoyageId,
    fleet: FleetId,
    vessel: Vessel,
}

struct Created<Id> {
    id: Id,
    shell: Terminal,
}

enum Open {
    DoubleClick,
    ClickThenF2,
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
    draft: String,
    after: Option<String>,
    label: Option<String>,
}

#[derive(PartialEq, Serialize)]
struct Step {
    selected: String,
    context: Context,
    dock: Context,
    fleet: Option<FleetId>,
}

#[derive(PartialEq, Serialize)]
struct Saved {
    version: u64,
    document: Layout,
}

#[derive(PartialEq, Serialize)]
struct Picture {
    dock: Context,
    docked: bool,
    drawn: Vec<String>,
    missing: Vec<String>,
    names: Vec<Name>,
}

impl Picture {
    fn whole(&self) -> bool {
        self.missing.is_empty() && !self.drawn.is_empty()
    }

    fn named(&self) -> bool {
        self.names.iter().all(Name::drawn_as_saved)
    }
}

#[derive(PartialEq, Serialize)]
struct Name {
    control: String,
    given: Option<&'static str>,
    saved: Option<String>,
    label: Option<String>,
}

impl Name {
    fn saved_as_given(&self) -> bool {
        self.given
            .is_none_or(|given| self.saved.as_deref() == Some(given))
    }

    fn drawn_as_saved(&self) -> bool {
        matches!(
            (&self.label, &self.saved),
            (Some(label), Some(saved)) if titled(label, saved)
        )
    }
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let first = Terminal::first(native)?;
    let start = native.observe("one Voyage with one Fleet and one Vessel", |seen| {
        start(seen.document)
    })?;

    let split = cases.make(native, Case::SplitVessel, |native| {
        let before = at_rest(native)?.document;
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
        let Some(shell) = bind(native, &verdict, born.first().copied())? else {
            return Ok((verdict, None));
        };
        shell.line(native, "echo SPLIT-$((6*7))")?;
        let printed = shell.printed(native, "SPLIT-42")?;
        let verdict = verdict.expect("the new Vessel's shell printed SPLIT-42", printed);
        Ok((verdict, Some(shell)))
    })?;
    let Some(shell) = split else {
        return Ok(());
    };
    let docked = Context::Vessel {
        id: shell.placement().clone(),
    };

    cases.check(native, Case::DockVessel, |native| {
        let before = at_rest(native)?.document.context;
        native.drag(&Target::AVATAR, &Target::name(&vessel(shell.placement())))?;
        let context = native.observe("the document and the frame on one new dock", |seen| {
            (seen.document.context != before && seen.frame.dock == seen.document.context)
                .then(|| seen.document.context.clone())
        })?;
        Verdict::new()
            .expect("the avatar docked to the new Vessel", context == docked)
            .observed("before", &before)?
            .observed("context", &context)
    })?;

    let made = cases.make(native, Case::CreateFleet, |native| {
        let before = at_rest(native)?.document;
        native.click(&Target::create_fleet(&start.voyage))?;
        native.click(&Target::worker("terminal"))?;
        let (after, picture) = native.settle(
            "a new Fleet in the layout document",
            |seen| {
                let born = born(fleets(&before), fleets(seen.document), |fleet| &fleet.id);
                (!born.is_empty()).then(|| {
                    let controls = born.iter().flat_map(|fleet| controls(fleet));
                    let names = born.iter().map(|fleet| (tab(fleet), None));
                    (seen.document.clone(), picture(seen, controls, names))
                })
            },
            |(_, picture)| picture.whole() && picture.named(),
        )?;
        let born = born(fleets(&before), fleets(&after), |fleet| &fleet.id);
        let verdict = Verdict::new()
            .expect("exactly one Fleet was created", born.len() == 1)
            .expect(
                "the new Fleet is named Fleet 2 and holds one Vessel",
                born.iter()
                    .all(|fleet| fleet.name == "Fleet 2" && fleet.vessels.len() == 1),
            )
            .expect(
                "the new Fleet is selected",
                born.iter()
                    .all(|fleet| after.selected_fleet.as_ref() == Some(&fleet.id)),
            )
            .expect("the new Fleet's tab and Vessel are drawn", picture.whole())
            .expect("the new Fleet's tab shows its saved name", picture.named())
            .expect(
                "the dock stayed on the Vessel",
                after.context == docked && picture.dock == docked,
            )
            .observed("fleets", &born)?
            .observed("selected", &after.selected_fleet)?
            .observed("context", &after.context)?
            .observed("picture", &picture)?;
        let placed = born.first().and_then(|fleet| fleet.vessels.first());
        let shell = bind(native, &verdict, placed)?;
        let made = shell.zip(born.first()).map(|(shell, fleet)| Created {
            id: fleet.id.clone(),
            shell,
        });
        Ok((verdict, made))
    })?;
    let Some(second) = made else {
        return Ok(());
    };

    cases.check(native, Case::SwitchFleet, |native| {
        let mut steps = Vec::new();
        for id in [&start.fleet, &second.id, &start.fleet] {
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

    let made = cases.make(native, Case::CreateVoyage, |native| {
        shell.enter(native, sandbox::SECOND_PROJECT)?;
        let before = at_rest(native)?.document;
        native.click(&Target::CREATE_VOYAGE)?;
        let (after, picture) = native.settle(
            "a new Voyage in the layout document",
            |seen| {
                let born = born(voyages(&before), voyages(seen.document), |voyage| {
                    &voyage.id
                });
                (!born.is_empty()).then(|| {
                    let controls = born.iter().flat_map(|voyage| {
                        let tabs = voyage.fleets.iter().flat_map(controls);
                        std::iter::once(Target::name(&row(voyage))).chain(tabs)
                    });
                    let names = born.iter().flat_map(|voyage| {
                        let tabs = voyage.fleets.iter().map(tab);
                        std::iter::once(row(voyage)).chain(tabs)
                    });
                    let names = names.map(|subject| (subject, None));
                    (seen.document.clone(), picture(seen, controls, names))
                })
            },
            |(_, picture)| picture.whole() && picture.named(),
        )?;
        let born = born(voyages(&before), voyages(&after), |voyage| &voyage.id);
        let folder = Path::new(sandbox::SECOND_PROJECT)
            .file_name()
            .and_then(|name| name.to_str());
        let verdict = Verdict::new()
            .expect("exactly one Voyage was created", born.len() == 1)
            .expect(
                "the new Voyage is open in the folder of the focused terminal and named after it",
                born.iter().all(|voyage| {
                    !voyage.closed
                        && voyage.cwd.as_deref() == Some(sandbox::SECOND_PROJECT)
                        && Some(voyage.name.as_str()) == folder
                }),
            )
            .expect(
                "the new Voyage holds one Fleet with one Vessel",
                born.iter().all(
                    |voyage| matches!(&voyage.fleets[..], [fleet] if fleet.vessels.len() == 1),
                ),
            )
            .expect(
                "the new Voyage is selected",
                born.iter()
                    .all(|voyage| after.selected_voyage.as_ref() == Some(&voyage.id)),
            )
            .expect(
                "the new Voyage, its Fleet tab and its Vessel are drawn",
                picture.whole(),
            )
            .expect(
                "the new Voyage's row and its Fleet's tab show their saved names",
                picture.named(),
            )
            .expect(
                "the dock stayed on the Vessel",
                after.context == docked && picture.dock == docked,
            )
            .observed("voyages", &born)?
            .observed("folder", sandbox::SECOND_PROJECT)?
            .observed("selected", &after.selected_voyage)?
            .observed("context", &after.context)?
            .observed("picture", &picture)?;
        let placed = born
            .first()
            .and_then(|voyage| voyage.fleets.first())
            .and_then(|fleet| fleet.vessels.first());
        let shell = bind(native, &verdict, placed)?;
        let made = shell.zip(born.first()).map(|(shell, voyage)| Created {
            id: voyage.id.clone(),
            shell,
        });
        Ok((verdict, made))
    })?;
    let Some(other) = made else {
        return Ok(());
    };

    cases.check(native, Case::SwitchVoyage, |native| {
        let mut steps = Vec::new();
        for id in [&start.voyage, &other.id, &start.voyage] {
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

    let first_fleet = RenameTarget::Fleet {
        id: start.fleet.clone(),
    };
    let first_voyage = RenameTarget::Voyage {
        id: start.voyage.clone(),
    };
    let new_vessel = vessel(shell.placement());

    cases.check(native, Case::RenameFleetEnter, |native| {
        let open = Open::DoubleClick;
        let renamed = rename(native, &first_fleet, open, FLEET_NAME, Finish::Enter)?;
        typed(Verdict::new(), renamed)
    })?;

    cases.check(native, Case::RenameVoyageBlur, |native| {
        let finish = Finish::Blur(&first.target());
        let open = Open::DoubleClick;
        let renamed = rename(native, &first_voyage, open, "Blur Voyage", finish)?;
        typed(Verdict::new(), renamed)
    })?;

    cases.check(native, Case::RenameVesselF2, |native| {
        let open = Open::ClickThenF2;
        let renamed = rename(native, &new_vessel, open, VESSEL_NAME, Finish::Enter)?;
        typed(Verdict::new(), renamed)
    })?;

    cases.check(native, Case::RenameKeyboard, |native| {
        let next_voyage = RenameTarget::Voyage {
            id: other.id.clone(),
        };
        let before = saved_name(native, &first_voyage)?;
        native.click(&Target::name(&first_voyage))?;
        native.press(Key::Tab)?;
        native.press(Key::F2)?;
        let forward = editors(native, &other.id.0)?;
        let verdict = Verdict::new()
            .expect(
                "Tab moved the keyboard from the first Voyage's name to the next Voyage's name",
                forward == [other.id.0.as_str()],
            )
            .observed("editors after Tab and F2", &forward)?;
        if !verdict.passed() {
            return Ok(verdict);
        }
        native.press(Key::Escape)?;
        let next = Target::name(&next_voyage);
        native.observe(&format!("{next} in place of its editor"), |seen| {
            (seen.shows(&next) && editing(seen).is_empty()).then_some(())
        })?;
        native.press(Key::Tab.shift())?;
        native.press(Key::F2)?;
        let back = editors(native, &start.voyage.0)?;
        let verdict = verdict
            .expect(
                "Shift+Tab moved the keyboard back to the first Voyage's name",
                back == [start.voyage.0.as_str()],
            )
            .observed("editors after Shift+Tab and F2", &back)?;
        if !verdict.passed() {
            return Ok(verdict);
        }
        let renamed = edit(native, &first_voyage, before, VOYAGE_NAME, Finish::Enter)?;
        typed(verdict, renamed)
    })?;

    cases.check(native, Case::RenameEscape, |native| {
        let open = Open::DoubleClick;
        kept(rename(
            native,
            &first_fleet,
            open,
            "Discarded",
            Finish::Escape,
        )?)
    })?;

    cases.check(native, Case::RenameEmpty, |native| {
        kept(rename(
            native,
            &new_vessel,
            Open::DoubleClick,
            "",
            Finish::Enter,
        )?)
    })?;

    cases.check(native, Case::Relaunch, |native| {
        let shells = [&first, &shell, &second.shell, &other.shell];
        let before = at_rest(native)?;
        native.close()?;
        for shell in shells {
            shell.same_program(native)?;
        }
        native.launch()?;
        let given = [
            (&first_fleet, FLEET_NAME),
            (&first_voyage, VOYAGE_NAME),
            (&new_vessel, VESSEL_NAME),
        ];
        let restored = native.settle(
            "the relaunched window holding still",
            |seen| Some(restored(seen, &given)),
            |restored| {
                restored.docked
                    && restored.whole()
                    && restored.named()
                    && restored.names.iter().all(Name::saved_as_given)
            },
        )?;
        for shell in shells {
            shell.same_program(native)?;
        }
        let after = at_rest(native)?;
        Verdict::new()
            .expect(
                "the layout document and its version are the same after the relaunch",
                after == before,
            )
            .expect(
                "every renamed Voyage, Fleet and Vessel still has the name that the journey gave it",
                restored.names.iter().all(Name::saved_as_given),
            )
            .expect(
                "the avatar is docked where the document says",
                restored.docked,
            )
            .expect(
                "the relaunched window draws every Voyage row, every Fleet tab and every Vessel of the selected Fleet",
                restored.whole(),
            )
            .expect(
                "the relaunched window draws every Voyage row, every Fleet tab and every renamed Vessel under its saved name",
                restored.named(),
            )
            .observed("before", &before)?
            .observed("after", &after)?
            .observed("restored", &restored)
    })
}

fn rename(
    native: &Native,
    subject: &RenameTarget,
    open: Open,
    text: &str,
    finish: Finish,
) -> Result<Renamed> {
    let name = Target::name(subject);
    let before = saved_name(native, subject)?;
    match open {
        Open::DoubleClick => native.double_click(&name)?,
        Open::ClickThenF2 => {
            native.click(&name)?;
            native.press(Key::F2)?;
        }
    }
    edit(native, subject, before, text, finish)
}

fn saved_name(native: &Native, subject: &RenameTarget) -> Result<String> {
    let name = Target::name(subject);
    native.observe(&format!("{name} with its saved name"), |seen| {
        seen.shows(&name)
            .then(|| name_of(seen.document, subject))
            .flatten()
    })
}

fn edit(
    native: &Native,
    subject: &RenameTarget,
    before: String,
    text: &str,
    finish: Finish,
) -> Result<Renamed> {
    let (name, editor) = (Target::name(subject), Target::editor(subject));
    native.observe(&format!("{editor} in place of {name}"), |seen| {
        (seen.shows(&editor) && !seen.shows(&name)).then_some(())
    })?;
    if text.is_empty() {
        native.press(Key::BackSpace)?;
    } else {
        native.type_text(text)?;
    }
    let draft = native.settle(
        &format!("{editor} holding one draft"),
        |seen| seen.label(&editor).map(str::to_owned),
        |draft| draft == text,
    )?;
    let mut renamed = Renamed {
        before,
        typed: text.into(),
        draft,
        after: None,
        label: None,
    };
    if renamed.draft != text {
        return Ok(renamed);
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
    let label = native.settle(
        &format!("{name} holding one label"),
        |seen| seen.label(&name).map(str::to_owned),
        |label| titled(label, &after),
    )?;
    renamed.label = Some(label);
    renamed.after = Some(after);
    Ok(renamed)
}

fn editors(native: &Native, wanted: &str) -> Result<Vec<String>> {
    native.settle(
        "the open name editors holding still",
        |seen| Some(editing(seen)),
        |open| *open == [wanted],
    )
}

fn editing(seen: &Seen) -> Vec<String> {
    let editors = seen.frame.elements.iter();
    editors
        .filter(|element| element.role == Role::NameEditor)
        .map(|element| element.key.clone())
        .collect()
}

fn bind(
    native: &mut Native,
    verdict: &Verdict,
    placed: Option<&Vessel>,
) -> Result<Option<Terminal>> {
    match placed {
        Some(placed) if verdict.passed() => Terminal::bind(native, &placed.id).map(Some),
        _ => Ok(None),
    }
}

fn typed(verdict: Verdict, renamed: Renamed) -> Result<Verdict> {
    let saved = renamed.typed.clone();
    judged(verdict, renamed, "the saved name is the typed text", &saved)
}

fn kept(renamed: Renamed) -> Result<Verdict> {
    let saved = renamed.before.clone();
    judged(
        Verdict::new(),
        renamed,
        "the saved name is unchanged",
        &saved,
    )
}

fn judged(
    verdict: Verdict,
    renamed: Renamed,
    saving: &'static str,
    saved: &str,
) -> Result<Verdict> {
    let drawn = matches!(
        (&renamed.label, &renamed.after),
        (Some(label), Some(after)) if titled(label, after)
    );
    verdict
        .expect(
            "the editor held the typed draft before the finishing input",
            renamed.draft == renamed.typed,
        )
        .expect(saving, renamed.after.as_deref() == Some(saved))
        .expect("the drawn name is the saved name", drawn)
        .observed("rename", &renamed)
}

fn titled(label: &str, name: &str) -> bool {
    label.rsplit(" · ").next() == Some(name)
}

fn at_rest(native: &Native) -> Result<Saved> {
    native.observe("the workspace at rest", |seen| {
        Some(Saved {
            version: seen.version,
            document: seen.document.clone(),
        })
    })
}

fn restored(seen: &Seen, given: &[(&RenameTarget, &'static str)]) -> Picture {
    let layout = seen.document;
    let rows = layout
        .voyages
        .iter()
        .filter(|voyage| !voyage.closed)
        .map(row);
    let tabs = voyages(layout)
        .filter(|voyage| layout.selected_voyage.as_ref() == Some(&voyage.id))
        .flat_map(|voyage| &voyage.fleets)
        .map(tab);
    let mut subjects: Vec<RenameTarget> = rows.chain(tabs).collect();
    let selected = layout
        .selected_fleet
        .as_ref()
        .and_then(|id| fleet(layout, id));
    let panes = selected
        .into_iter()
        .flat_map(|fleet| &fleet.vessels)
        .flat_map(|placed| {
            [
                Target::name(&vessel(&placed.id)),
                Target::terminal(&placed.id),
            ]
        });
    let controls: Vec<Target> = subjects.iter().map(Target::name).chain(panes).collect();
    for (renamed, _) in given {
        if !subjects.contains(renamed) {
            subjects.push((*renamed).clone());
        }
    }
    let names = subjects.into_iter().map(|subject| {
        let given = given.iter().find(|(renamed, _)| **renamed == subject);
        (subject, given.map(|(_, name)| *name))
    });
    picture(seen, controls.into_iter(), names)
}

fn picture(
    seen: &Seen,
    controls: impl Iterator<Item = Target>,
    names: impl Iterator<Item = (RenameTarget, Option<&'static str>)>,
) -> Picture {
    let (drawn, missing) = controls.partition(|target| seen.shows(target));
    let listed = |targets: Vec<Target>| targets.iter().map(Target::to_string).collect();
    let names = names.map(|(subject, given)| {
        let control = Target::name(&subject);
        Name {
            given,
            saved: name_of(seen.document, &subject),
            label: seen.label(&control).map(str::to_owned),
            control: control.to_string(),
        }
    });
    Picture {
        dock: seen.frame.dock.clone(),
        docked: seen.frame.dock == seen.document.context,
        drawn: listed(drawn),
        missing: listed(missing),
        names: names.collect(),
    }
}

fn row(voyage: &Voyage) -> RenameTarget {
    RenameTarget::Voyage {
        id: voyage.id.clone(),
    }
}

fn tab(fleet: &Fleet) -> RenameTarget {
    RenameTarget::Fleet {
        id: fleet.id.clone(),
    }
}

fn controls(fleet: &Fleet) -> impl Iterator<Item = Target> {
    let titles = fleet.vessels.iter();
    std::iter::once(Target::name(&tab(fleet)))
        .chain(titles.map(|placed| Target::name(&vessel(&placed.id))))
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
        dock: seen.frame.dock.clone(),
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

fn fleet<'a>(layout: &'a Layout, id: &FleetId) -> Option<&'a Fleet> {
    fleets(layout).find(|fleet| &fleet.id == id)
}

fn vessel(id: &PlacementId) -> RenameTarget {
    RenameTarget::Vessel { id: id.clone() }
}

fn name_of(layout: &Layout, subject: &RenameTarget) -> Option<String> {
    match subject {
        RenameTarget::Voyage { id } => voyages(layout)
            .find(|voyage| &voyage.id == id)
            .map(|voyage| voyage.name.clone()),
        RenameTarget::Fleet { id } => fleet(layout, id).map(|fleet| fleet.name.clone()),
        RenameTarget::Vessel { id } => vessels(layout)
            .find(|vessel| &vessel.id == id)
            .map(|vessel| vessel.name.clone()),
        RenameTarget::Portal { id } => voyages(layout)
            .flat_map(|voyage| &voyage.portals)
            .find(|portal| &portal.id == id)
            .map(|portal| portal.name.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use voyager_contract::inspection::Frame;

    type Drawn<'a> = (&'a str, &'a str, Option<&'a str>);

    const WHOLE: [Drawn; 8] = [
        ("voyage-name", "voyage-1", Some("Keyboard Voyage")),
        ("voyage-name", "voyage-14", Some("second-project")),
        ("fleet-name", "fleet-4", Some("Native Fleet")),
        ("fleet-name", "fleet-13", Some("Fleet 2")),
        ("vessel-name", "placement-3", Some("bash · project")),
        ("terminal", "placement-3", None),
        ("vessel-name", "placement-10", Some("bash · project · +")),
        ("terminal", "placement-10", None),
    ];

    fn layout(title: &str) -> Result<Layout> {
        let vessel = |id: &str, name: &str| json!({"id": id, "content": "content-1", "name": name});
        let fleet = |id: &str, name: &str, vessels: &[serde_json::Value]| json!({"id": id, "name": name, "root": null, "vessels": vessels});
        let voyage = |id: &str, name: &str, fleets: Vec<serde_json::Value>| json!({"id": id, "name": name, "fleets": fleets, "portals": []});
        Ok(serde_json::from_value(json!({
            "voyages": [
                voyage("voyage-1", VOYAGE_NAME, vec![
                    fleet("fleet-4", FLEET_NAME, &[
                        vessel("placement-3", "Terminal 1"),
                        vessel("placement-10", title),
                    ]),
                    fleet("fleet-13", "Fleet 2", &[vessel("placement-12", "Terminal 1")]),
                ]),
                voyage("voyage-14", "second-project", vec![
                    fleet("fleet-17", "Fleet 1", &[vessel("placement-16", "Terminal 1")]),
                ]),
            ],
            "contents": [],
            "selectedVoyage": "voyage-1",
            "selectedFleet": "fleet-4",
            "context": {"kind": "vessel", "id": "placement-10"},
            "nextId": "18"
        }))?)
    }

    fn seen<T>(document: &Layout, drawn: &[Drawn], read: impl FnOnce(&Seen) -> T) -> Result<T> {
        let elements: Vec<_> = drawn
            .iter()
            .map(|(role, key, label)| {
                json!({"role":role,"key":key,"label":label,"bounds":{"x":0.0,"y":0.0,"width":1.0,"height":1.0}})
            })
            .collect();
        let frame: Frame = serde_json::from_value(json!({
            "sequence": 1,
            "window": {"width": 725.0, "height": 470.0, "scale": 2.0},
            "dock": {"kind": "vessel", "id": "placement-10"},
            "prepared": true,
            "elements": elements,
            "ambiguous": []
        }))?;
        Ok(read(&Seen {
            document,
            version: 27,
            frame: &frame,
        }))
    }

    fn relaunched(document: &Layout, drawn: &[Drawn]) -> Result<Picture> {
        let renamed = [
            RenameTarget::Fleet {
                id: FleetId("fleet-4".into()),
            },
            RenameTarget::Voyage {
                id: VoyageId("voyage-1".into()),
            },
            vessel(&PlacementId("placement-10".into())),
        ];
        let given = [
            (&renamed[0], FLEET_NAME),
            (&renamed[1], VOYAGE_NAME),
            (&renamed[2], VESSEL_NAME),
        ];
        seen(document, drawn, |seen| restored(seen, &given))
    }

    #[test]
    fn a_relaunch_names_each_control_that_the_window_does_not_draw() -> Result<()> {
        let document = layout(VESSEL_NAME)?;
        let all = relaunched(&document, &WHOLE)?;
        assert!(all.whole() && all.drawn.len() == 8);
        assert!(all.docked && all.dock == document.context);
        assert!(all.named() && all.names.iter().all(Name::saved_as_given));
        let controls: Vec<_> = all.names.iter().map(|name| name.control.as_str()).collect();
        assert_eq!(
            controls,
            [
                "voyage-name \"voyage-1\"",
                "voyage-name \"voyage-14\"",
                "fleet-name \"fleet-4\"",
                "fleet-name \"fleet-13\"",
                "vessel-name \"placement-10\"",
            ],
            "every Voyage row, every Fleet tab of the selected Voyage and the renamed Vessel"
        );
        let partial = relaunched(&document, &WHOLE[..6])?;
        assert_eq!(
            partial.missing,
            ["vessel-name \"placement-10\"", "terminal \"placement-10\""]
        );
        assert!(!partial.whole() && !partial.named());
        assert!(partial.names[4].label.is_none() && !partial.names[4].drawn_as_saved());
        let other = relaunched(
            &document,
            &[
                ("fleet-name", "fleet-17", Some("Fleet 1")),
                ("vessel-name", "placement-16", Some("bash · second-project")),
            ],
        )?;
        assert!(other.drawn.is_empty() && other.missing.len() == 8 && other.docked);
        assert!(!other.whole());
        Ok(())
    }

    #[test]
    fn a_name_counts_as_drawn_only_under_its_saved_name() -> Result<()> {
        let mut drawn = WHOLE;
        drawn[3].2 = Some("Fleet 1");
        let mistitled = relaunched(&layout(VESSEL_NAME)?, &drawn)?;
        assert!(mistitled.whole() && !mistitled.named());
        let wrong: Vec<_> = mistitled
            .names
            .iter()
            .filter(|name| !name.drawn_as_saved())
            .map(|name| {
                (
                    name.control.as_str(),
                    name.saved.as_deref(),
                    name.label.as_deref(),
                )
            })
            .collect();
        assert_eq!(
            wrong,
            [("fleet-name \"fleet-13\"", Some("Fleet 2"), Some("Fleet 1"))],
            "a created Fleet whose tab shows another Fleet's name"
        );
        assert!(mistitled.names.iter().all(Name::saved_as_given));
        let replaced = relaunched(&layout("Discarded")?, &WHOLE)?;
        let title = &replaced.names[4];
        assert!(
            !title.saved_as_given() && !title.drawn_as_saved(),
            "a name that a late save replaced"
        );
        assert!(replaced.names[..4].iter().all(Name::saved_as_given));
        Ok(())
    }

    #[test]
    fn a_creation_is_drawn_when_its_tab_and_its_vessels_are() -> Result<()> {
        let document = layout(VESSEL_NAME)?;
        let created = fleet(&document, &FleetId("fleet-13".into())).expect("the created Fleet");
        let made = |drawn: &[Drawn]| {
            seen(&document, drawn, |seen| {
                picture(
                    seen,
                    controls(created),
                    std::iter::once((tab(created), None)),
                )
            })
        };
        let title = ("vessel-name", "placement-12", Some("bash · project"));
        let whole = made(&[("fleet-name", "fleet-13", Some("Fleet 2")), title])?;
        assert!(whole.whole() && whole.named());
        let mistitled = made(&[("fleet-name", "fleet-13", Some("Fleet 1")), title])?;
        assert!(mistitled.whole() && !mistitled.named());
        let untabbed = made(&[title])?;
        assert_eq!(untabbed.missing, ["fleet-name \"fleet-13\""]);
        assert!(!untabbed.whole() && !untabbed.named());
        let empty = made(&[("fleet-name", "fleet-13", Some("Fleet 2"))])?;
        assert_eq!(empty.missing, ["vessel-name \"placement-12\""]);
        assert!(!empty.whole() && empty.named());
        let nothing = seen(&document, &WHOLE, |seen| {
            picture(seen, std::iter::empty(), std::iter::empty())
        })?;
        assert!(!nothing.whole(), "a picture of no control proves nothing");
        let before = made(&WHOLE[..3])?;
        assert!(
            before.drawn.is_empty() && !before.whole(),
            "a frame from before the creation draws none of it"
        );
        Ok(())
    }

    #[test]
    fn a_title_names_its_control_when_the_name_is_its_last_part() {
        assert!(titled("Native Fleet", "Native Fleet"));
        assert!(titled("bash · project · +", "+"));
        assert!(titled("bash · project", "project"));
        assert!(!titled("Fleet 1", "Native Fleet"));
        assert!(!titled("bash · project · Terminal 2", "+"));
        assert!(!titled("Native Fleet 2", "Native Fleet"));
    }
}
