mod model;

use super::layout::{avatar_bounds, avatar_on_dock, born, right_of, split_right};
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Seen, Terminal, fleets, vessels, voyages};
use crate::sandbox;
use crate::x11::Key;
use anyhow::Result;
use model::{Model, Row, Tab};
use serde::Serialize;
use std::path::Path;
use voyager_contract::inspection::{Rect, Role};
use voyager_contract::{
    Axis, Context, Fleet, FleetId, Layout, PlacementId, RenameTarget, Split, Vessel, Voyage,
    VoyageId,
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
const MODELLED: &str = "the saved and drawn workspace match the journey's model";

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

#[derive(Clone, Copy, PartialEq)]
enum Outcome {
    Typed,
    Kept,
}

enum Finish<'a> {
    Enter,
    Blur(&'a Target),
    Escape,
}

#[derive(Serialize)]
struct Renamed {
    #[serde(skip)]
    subject: RenameTarget,
    before: String,
    typed: String,
    draft: String,
    after: Option<String>,
    label: Option<String>,
}

#[derive(PartialEq, Serialize)]
struct Landing {
    context: Context,
    dock: Context,
    avatar: Option<Rect>,
    on_dock: bool,
}

impl Landing {
    fn landed(&self) -> bool {
        self.dock == self.context && self.on_dock
    }

    fn stayed(&self, docked: &Context) -> bool {
        self.context == *docked && self.landed()
    }
}

#[derive(PartialEq, Serialize)]
struct Step {
    selected: String,
    fleet: Option<FleetId>,
    #[serde(flatten)]
    landing: Landing,
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
    avatar: Option<Rect>,
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
    #[serde(skip)]
    subject: RenameTarget,
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
            (Some(label), Some(saved)) if drawn_as(&self.subject, label, saved)
        )
    }
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let first = Terminal::first(native)?;
    let (start, mut model) = native
        .observe("one Voyage with one Fleet and one Vessel", |seen| {
            start(seen.document).zip(Model::start(seen.document))
        })?;

    let split = cases.make(native, Case::SplitVessel, |native| {
        let before = at_rest(native)?.document;
        let (after, old, new) = split_right(native, &before, &start.vessel.id)?;
        let born = born(vessels(&before), vessels(&after), |vessel| &vessel.id);
        let split = fleet(&after, &start.fleet);
        let beside = split
            .map(|fleet| fleet.vessels.as_slice())
            .unwrap_or_default();
        let root = split.and_then(|fleet| fleet.root.as_ref());
        let verdict = Verdict::new()
            .expect("exactly one Vessel was created", born.len() == 1)
            .expect(
                "the Fleet holds the first Vessel, unchanged, and the new Vessel",
                beside.len() == 2
                    && beside.contains(&start.vessel)
                    && born.iter().all(|vessel| beside.contains(vessel)),
            )
            .expect(
                "the saved arrangement puts the new Vessel to the right of the first",
                born.iter().all(|vessel| {
                    root.is_some_and(|root| beside_right(root, &start.vessel.id, &vessel.id))
                }),
            )
            .expect(
                "the new Vessel's terminal is drawn to the right of the first, in the same row",
                new.iter().all(|new| right_of(new, &old)),
            )
            .observed("vessels", beside)?
            .observed("arrangement", root)?
            .observed("first terminal", old)?
            .observed("new terminals", &new)?;
        let verdict = match born[..] {
            [made] => {
                model.split_right(&start.fleet, &start.vessel.id, made);
                modelled(native, &model, verdict)?
            }
            _ => verdict,
        };
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
        let landing = native.settle(
            "the document and the frame on one new dock, with the avatar drawn on it",
            |seen| (seen.document.context != before).then(|| landing(seen)),
            Landing::landed,
        )?;
        let verdict = Verdict::new()
            .expect(
                "the avatar docked to the new Vessel",
                landing.context == docked && landing.landed(),
            )
            .observed("before", &before)?
            .observed("landing", &landing)?;
        model.dock = docked.clone();
        modelled(native, &model, verdict)
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
            |(_, picture)| picture.whole() && picture.named() && picture.docked,
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
                after.context == docked && picture.dock == docked && picture.docked,
            )
            .observed("fleets", &born)?
            .observed("selected", &after.selected_fleet)?
            .observed("context", &after.context)?
            .observed("picture", &picture)?;
        let verdict = match born[..] {
            [made] => {
                if let Some(row) = model.row(&start.voyage) {
                    row.fleets.push(Tab::saved(made));
                }
                model.fleet = made.id.clone();
                modelled(native, &model, verdict)?
            }
            _ => verdict,
        };
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
            steps.push(native.settle(
                &format!("Fleet {} selected and drawn", id.0),
                |seen| {
                    let fleet = fleet(seen.document, id)?;
                    (seen.document.selected_fleet.as_ref() == Some(id) && shown(seen, fleet))
                        .then(|| step(seen, &id.0))
                },
                |step| step.landing.stayed(&docked),
            )?);
        }
        let verdict = Verdict::new()
            .expect(
                "the dock stayed on the Vessel through every switch",
                steps.iter().all(|step| step.landing.stayed(&docked)),
            )
            .observed("steps", &steps)?;
        model.fleet = start.fleet.clone();
        modelled(native, &model, verdict)
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
            |(_, picture)| picture.whole() && picture.named() && picture.docked,
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
                after.context == docked && picture.dock == docked && picture.docked,
            )
            .observed("voyages", &born)?
            .observed("folder", sandbox::SECOND_PROJECT)?
            .observed("selected", &after.selected_voyage)?
            .observed("context", &after.context)?
            .observed("picture", &picture)?;
        let verdict = match born[..] {
            [made] => {
                model.voyages.push(Row::saved(made));
                model.voyage = made.id.clone();
                if let Some(fleet) = made.fleets.first() {
                    model.fleet = fleet.id.clone();
                }
                modelled(native, &model, verdict)?
            }
            _ => verdict,
        };
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
            steps.push(native.settle(
                &format!("Voyage {} selected and drawn", id.0),
                |seen| {
                    let selected = seen.document.selected_fleet.as_ref()?;
                    (seen.document.selected_voyage.as_ref() == Some(id)
                        && shown(seen, fleet(seen.document, selected)?))
                    .then(|| step(seen, &id.0))
                },
                |step| step.landing.stayed(&docked),
            )?);
        }
        let verdict = Verdict::new()
            .expect(
                "the dock stayed on the Vessel through every switch",
                steps.iter().all(|step| step.landing.stayed(&docked)),
            )
            .expect(
                "the first Voyage shows its first Fleet again",
                steps
                    .last()
                    .is_some_and(|step| step.fleet.as_ref() == Some(&start.fleet)),
            )
            .observed("steps", &steps)?;
        model.voyage = start.voyage.clone();
        model.fleet = start.fleet.clone();
        modelled(native, &model, verdict)
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
        concluded(native, &mut model, Verdict::new(), renamed, Outcome::Typed)
    })?;

    cases.check(native, Case::RenameVoyageBlur, |native| {
        let finish = Finish::Blur(&first.target());
        let open = Open::DoubleClick;
        let renamed = rename(native, &first_voyage, open, "Blur Voyage", finish)?;
        concluded(native, &mut model, Verdict::new(), renamed, Outcome::Typed)
    })?;

    cases.check(native, Case::RenameVesselF2, |native| {
        let open = Open::ClickThenF2;
        let renamed = rename(native, &new_vessel, open, VESSEL_NAME, Finish::Enter)?;
        concluded(native, &mut model, Verdict::new(), renamed, Outcome::Typed)
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
        concluded(native, &mut model, verdict, renamed, Outcome::Typed)
    })?;

    cases.check(native, Case::RenameEscape, |native| {
        let open = Open::DoubleClick;
        let renamed = rename(native, &first_fleet, open, "Discarded", Finish::Escape)?;
        concluded(native, &mut model, Verdict::new(), renamed, Outcome::Kept)
    })?;

    cases.check(native, Case::RenameEmpty, |native| {
        let renamed = rename(native, &new_vessel, Open::DoubleClick, "", Finish::Enter)?;
        concluded(native, &mut model, Verdict::new(), renamed, Outcome::Kept)
    })?;

    cases.check(native, Case::Relaunch, |native| {
        let shells = [&first, &shell, &second.shell, &other.shell];
        let ending = native.settle(
            "the saved workspace and the window as the journey's model has them",
            |seen| Some(model.differences(seen)),
            Vec::is_empty,
        )?;
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
        let (restored, reopened) = native.settle(
            "the relaunched window holding still",
            |seen| Some((restored(seen, &given), model.differences(seen))),
            |(restored, reopened)| {
                restored.docked
                    && restored.whole()
                    && restored.named()
                    && restored.names.iter().all(Name::saved_as_given)
                    && reopened.is_empty()
            },
        )?;
        for shell in shells {
            shell.same_program(native)?;
        }
        let after = at_rest(native)?;
        Verdict::new()
            .expect(
                "before the relaunch, the saved and drawn workspace match the journey's model",
                ending.is_empty(),
            )
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
            .expect(
                "after the relaunch, the saved and drawn workspace match the journey's model",
                reopened.is_empty(),
            )
            .observed("model", &model)?
            .observed("differences before the relaunch", &ending)?
            .observed("before", &before)?
            .observed("after", &after)?
            .observed("restored", &restored)?
            .observed("differences after the relaunch", &reopened)
    })
}

fn modelled(native: &Native, model: &Model, verdict: Verdict) -> Result<Verdict> {
    let differences = native.settle(
        "the saved workspace and the window as the journey's model has them",
        |seen| Some(model.differences(seen)),
        Vec::is_empty,
    )?;
    verdict
        .expect(MODELLED, differences.is_empty())
        .observed("model", model)?
        .observed("differences from the model", &differences)
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
        subject: subject.clone(),
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
        |label| drawn_as(subject, label, &after),
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

fn concluded(
    native: &Native,
    model: &mut Model,
    verdict: Verdict,
    renamed: Renamed,
    outcome: Outcome,
) -> Result<Verdict> {
    let verdict = verdict.expect(
        "the editor held the typed draft before the finishing input",
        renamed.draft == renamed.typed,
    );
    let Some(after) = renamed.after.clone() else {
        return verdict.observed("rename", &renamed);
    };
    let (saving, saved) = match outcome {
        Outcome::Typed => ("the saved name is the typed text", renamed.typed.clone()),
        Outcome::Kept => ("the saved name is unchanged", renamed.before.clone()),
    };
    if outcome == Outcome::Typed {
        model.rename(&renamed.subject, &saved);
    }
    let drawn = renamed
        .label
        .as_deref()
        .is_some_and(|label| drawn_as(&renamed.subject, label, &after));
    let verdict = verdict
        .expect(saving, after == saved)
        .expect("the drawn name is the saved name", drawn)
        .observed("rename", &renamed)?;
    modelled(native, model, verdict)
}

fn drawn_as(subject: &RenameTarget, label: &str, name: &str) -> bool {
    match subject {
        RenameTarget::Vessel { .. } | RenameTarget::Portal { .. } => {
            label.rsplit(" · ").next() == Some(name)
        }
        RenameTarget::Voyage { .. } | RenameTarget::Fleet { .. } => label == name,
    }
}

fn landing(seen: &Seen) -> Landing {
    Landing {
        context: seen.document.context.clone(),
        dock: seen.frame.dock.clone(),
        avatar: avatar_bounds(seen),
        on_dock: avatar_on_dock(seen),
    }
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
            subject: subject.clone(),
            given,
            saved: name_of(seen.document, &subject),
            label: seen.label(&control).map(str::to_owned),
            control: control.to_string(),
        }
    });
    Picture {
        dock: seen.frame.dock.clone(),
        docked: seen.frame.dock == seen.document.context && avatar_on_dock(seen),
        avatar: avatar_bounds(seen),
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
    let panes = fleet.vessels.iter().flat_map(|placed| {
        [
            Target::name(&vessel(&placed.id)),
            Target::terminal(&placed.id),
        ]
    });
    std::iter::once(Target::name(&tab(fleet))).chain(panes)
}

fn beside_right(root: &Split, left: &PlacementId, right: &PlacementId) -> bool {
    let Split::Branch {
        axis: Axis::Horizontal,
        first,
        second,
        ..
    } = root
    else {
        return false;
    };
    let holds = |half: &Split, id: &PlacementId| {
        *half
            == Split::Leaf {
                placement: id.clone(),
            }
    };
    holds(first, left) && holds(second, right)
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
        fleet: seen.document.selected_fleet.clone(),
        landing: landing(seen),
    }
}

fn shown(seen: &Seen, fleet: &Fleet) -> bool {
    fleet
        .vessels
        .iter()
        .all(|placed| seen.shows(&Target::name(&vessel(&placed.id))))
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

    type Drawn<'a> = (&'a str, &'a str, Option<&'a str>);

    const WHOLE: [Drawn; 9] = [
        ("voyage-name", "voyage-1", Some("Keyboard Voyage")),
        ("voyage-name", "voyage-14", Some("second-project")),
        ("fleet-name", "fleet-4", Some("Native Fleet")),
        ("fleet-name", "fleet-13", Some("Fleet 2")),
        ("vessel-name", "placement-3", Some("bash · project")),
        ("terminal", "placement-3", None),
        ("vessel-name", "placement-10", Some("bash · project · +")),
        ("terminal", "placement-10", None),
        ("avatar", "", None),
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
                let (x, y, width, height) = match (*role, *key) {
                    ("terminal", "placement-3") => (700.0, 100.0, 500.0, 500.0),
                    ("terminal", _) => (100.0, 100.0, 500.0, 500.0),
                    ("avatar", _) => (200.0, 200.0, 50.0, 50.0),
                    _ => (0.0, 0.0, 1.0, 1.0),
                };
                json!({"role":role,"key":key,"label":label,"bounds":{"x":x,"y":y,"width":width,"height":height}})
            })
            .collect();
        let frame: voyager_contract::inspection::Frame = serde_json::from_value(json!({
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
        let unseated = relaunched(&document, &WHOLE[..8])?;
        assert!(
            !unseated.docked && unseated.dock == document.context,
            "the app says docked and no avatar is drawn"
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
                ("avatar", "", None),
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
        let pane = ("terminal", "placement-12", None);
        let whole = made(&[("fleet-name", "fleet-13", Some("Fleet 2")), title, pane])?;
        assert!(whole.whole() && whole.named());
        let mistitled = made(&[("fleet-name", "fleet-13", Some("Fleet 1")), title, pane])?;
        assert!(mistitled.whole() && !mistitled.named());
        let untabbed = made(&[title, pane])?;
        assert_eq!(untabbed.missing, ["fleet-name \"fleet-13\""]);
        assert!(!untabbed.whole() && !untabbed.named());
        let unattached = made(&[("fleet-name", "fleet-13", Some("Fleet 2")), title])?;
        assert_eq!(unattached.missing, ["terminal \"placement-12\""]);
        assert!(
            !unattached.whole(),
            "a Vessel title over a pane with no terminal"
        );
        let empty = made(&[("fleet-name", "fleet-13", Some("Fleet 2"))])?;
        assert_eq!(
            empty.missing,
            ["vessel-name \"placement-12\"", "terminal \"placement-12\""]
        );
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
    fn a_split_to_the_right_is_saved_as_the_second_half_of_a_horizontal_branch() -> Result<()> {
        let (old, new) = (
            PlacementId("placement-3".into()),
            PlacementId("placement-10".into()),
        );
        let branch = |axis: &str, first: &str, second: &str| -> Result<Split> {
            Ok(serde_json::from_value(json!({
                "kind": "branch",
                "axis": axis,
                "first": {"kind": "leaf", "placement": first},
                "second": {"kind": "leaf", "placement": second}
            }))?)
        };
        assert!(beside_right(
            &branch("horizontal", "placement-3", "placement-10")?,
            &old,
            &new
        ));
        assert!(
            !beside_right(
                &branch("vertical", "placement-3", "placement-10")?,
                &old,
                &new
            ),
            "a split that stacks the new Vessel below"
        );
        assert!(
            !beside_right(
                &branch("horizontal", "placement-10", "placement-3")?,
                &old,
                &new
            ),
            "a split that puts the new Vessel on the left"
        );
        assert!(!beside_right(
            &Split::Leaf {
                placement: new.clone()
            },
            &old,
            &new
        ));
        Ok(())
    }

    #[test]
    fn a_pane_is_right_of_another_only_in_the_same_row() {
        let pane = |x: f32, y: f32| Rect {
            x,
            y,
            width: 600.0,
            height: 800.0,
        };
        let old = pane(250.0, 79.0);
        assert!(right_of(&pane(850.0, 79.0), &old));
        assert!(!right_of(&pane(250.0, 879.0), &old), "stacked below");
        assert!(
            !right_of(&pane(850.0, 879.0), &old),
            "below and to the right"
        );
        assert!(!right_of(&old, &pane(850.0, 79.0)), "to the left");
        assert!(!right_of(&pane(550.0, 79.0), &old), "overlapping");
    }

    #[test]
    fn a_title_names_its_control_by_the_kind_of_control_it_is() {
        let vessel = vessel(&PlacementId("placement-10".into()));
        let tab = RenameTarget::Fleet {
            id: FleetId("fleet-13".into()),
        };
        let row = RenameTarget::Voyage {
            id: VoyageId("voyage-1".into()),
        };
        assert!(drawn_as(&vessel, "bash · project · +", "+"));
        assert!(drawn_as(&vessel, "bash · project", "project"));
        assert!(!drawn_as(&vessel, "bash · project · Terminal 2", "+"));
        assert!(drawn_as(&tab, "Fleet 2", "Fleet 2"));
        assert!(
            !drawn_as(&tab, "Fleet 1 · Fleet 2", "Fleet 2"),
            "a tab under another name that ends in the saved name"
        );
        assert!(!drawn_as(&tab, "Fleet 1", "Native Fleet"));
        assert!(!drawn_as(&tab, "Native Fleet 2", "Native Fleet"));
        assert!(drawn_as(&row, "Keyboard Voyage", "Keyboard Voyage"));
        assert!(!drawn_as(
            &row,
            "project · Keyboard Voyage",
            "Keyboard Voyage"
        ));
    }

    fn modelled_layout() -> Result<Layout> {
        let mut document = layout(VESSEL_NAME)?;
        document.voyages[0].fleets[0].root = Some(serde_json::from_value(json!({
            "kind": "branch",
            "axis": "horizontal",
            "first": {"kind": "leaf", "placement": "placement-10"},
            "second": {"kind": "leaf", "placement": "placement-3"}
        }))?);
        Ok(document)
    }

    fn model(document: &Layout) -> Result<Model> {
        let mut model = Model::start(document)
            .ok_or_else(|| anyhow::anyhow!("no selected Voyage and Fleet"))?;
        model.rename(&vessel(&PlacementId("placement-10".into())), VESSEL_NAME);
        Ok(model)
    }

    fn differences(model: &Model, document: &Layout, drawn: &[Drawn]) -> Result<Vec<String>> {
        seen(document, drawn, |seen| model.differences(seen))
    }

    fn first(found: &[String], expected: &str) -> bool {
        found.first().is_some_and(|first| first.contains(expected))
    }

    #[test]
    fn the_saved_and_drawn_workspace_match_a_model_of_what_the_journey_made() -> Result<()> {
        let document = modelled_layout()?;
        let model = model(&document)?;
        assert_eq!(
            differences(&model, &document, &WHOLE)?,
            Vec::<String>::new()
        );
        Ok(())
    }

    #[test]
    fn a_saved_difference_from_the_model_names_the_element_that_differs() -> Result<()> {
        let document = modelled_layout()?;
        let model = model(&document)?;
        let mut every_fleet_renamed = document.clone();
        every_fleet_renamed.voyages[0].fleets[1].name = FLEET_NAME.into();
        let found = differences(&model, &every_fleet_renamed, &WHOLE)?;
        assert!(
            first(&found, "Fleet fleet-13 is saved as \"Native Fleet\""),
            "{found:?}"
        );
        let mut moved_dock = document.clone();
        moved_dock.context = Context::Vessel {
            id: PlacementId("placement-3".into()),
        };
        let found = differences(&model, &moved_dock, &WHOLE)?;
        assert!(first(&found, "the saved dock"), "{found:?}");
        let mut extra = document.clone();
        let mut voyage = extra.voyages[1].clone();
        voyage.id = VoyageId("voyage-97".into());
        extra.voyages.push(voyage);
        let found = differences(&model, &extra, &WHOLE)?;
        assert!(first(&found, "the saved Voyages are"), "{found:?}");
        let mut late = document.clone();
        let mut placed = late.voyages[0].fleets[0].vessels[0].clone();
        placed.id = PlacementId("placement-99".into());
        late.voyages[0].fleets[0].vessels.push(placed);
        let found = differences(&model, &late, &WHOLE)?;
        assert!(
            first(&found, "Fleet fleet-4 saves the Vessels"),
            "{found:?}"
        );
        let mut stacked = document.clone();
        if let Some(Split::Branch { axis, .. }) = stacked.voyages[0].fleets[0].root.as_mut() {
            *axis = Axis::Vertical;
        }
        let found = differences(&model, &stacked, &WHOLE)?;
        assert!(
            first(&found, "Fleet fleet-4 saves the arrangement"),
            "{found:?}"
        );
        Ok(())
    }

    #[test]
    fn a_drawn_difference_from_the_model_names_the_element_that_differs() -> Result<()> {
        let document = modelled_layout()?;
        let model = model(&document)?;
        let unattached: Vec<Drawn> = WHOLE
            .iter()
            .copied()
            .filter(|drawn| *drawn != ("terminal", "placement-10", None))
            .collect();
        let found = differences(&model, &document, &unattached)?;
        assert!(
            first(&found, "the terminal of Vessel placement-10 is not drawn"),
            "{found:?}"
        );
        let mut mislabelled = WHOLE;
        mislabelled[3].2 = Some("Fleet 1");
        let found = differences(&model, &document, &mislabelled)?;
        assert!(first(&found, "Fleet tab 2 is drawn as"), "{found:?}");
        let mut retitled = WHOLE;
        retitled[6].2 = Some("bash · project");
        let found = differences(&model, &document, &retitled)?;
        assert!(first(&found, "Vessel placement-10 is titled"), "{found:?}");
        let found = differences(
            &model,
            &document,
            &more(&[("terminal", "placement-99", None)]),
        )?;
        assert!(
            first(&found, "which the shown Fleet does not hold"),
            "{found:?}"
        );
        let found = differences(&model, &document, &WHOLE[..8])?;
        assert!(first(&found, "the avatar is not drawn"), "{found:?}");
        let mut beside = model.clone();
        if let Some(tab) = beside.tab(&FleetId("fleet-4".into()))
            && let Some(model::Arrangement::Branch { axis, .. }) = tab.arrangement.as_mut()
        {
            *axis = Axis::Vertical;
        }
        let mut stacked = document.clone();
        if let Some(Split::Branch { axis, .. }) = stacked.voyages[0].fleets[0].root.as_mut() {
            *axis = Axis::Vertical;
        }
        let found = differences(&beside, &stacked, &WHOLE)?;
        assert!(first(&found, "the Vertical split"), "{found:?}");
        let twice = seen(&document, &WHOLE, |seen| {
            let mut frame = seen.frame.clone();
            frame.ambiguous = frame
                .elements
                .iter()
                .filter(|element| element.role == Role::VesselName)
                .cloned()
                .collect();
            model.differences(&Seen {
                document: seen.document,
                version: seen.version,
                frame: &frame,
            })
        })?;
        assert!(first(&twice, "more than once"), "{twice:?}");
        Ok(())
    }

    fn more<'a>(extra: &[Drawn<'a>]) -> Vec<Drawn<'a>> {
        let mut drawn = WHOLE.to_vec();
        drawn.extend_from_slice(extra);
        drawn
    }

    #[test]
    fn the_home_voyage_is_held_apart_from_the_voyage_rows() -> Result<()> {
        let mut document = modelled_layout()?;
        let mut home = document.voyages[1].clone();
        home.id = VoyageId("home-voyage-5".into());
        home.fleets[0].id = FleetId("home-fleet-8".into());
        home.fleets[0].vessels[0].id = PlacementId("placement-7".into());
        document.home = Some(home);
        let started = model(&document)?;
        assert_eq!(
            differences(&started, &document, &WHOLE)?,
            Vec::<String>::new()
        );
        let found = differences(&model(&modelled_layout()?)?, &document, &WHOLE)?;
        assert!(first(&found, "Home Voyage"), "{found:?}");
        if let Some(home) = document.home.as_mut() {
            home.fleets[0].vessels.clear();
        }
        let found = differences(&started, &document, &WHOLE)?;
        assert!(
            first(&found, "Home Voyage"),
            "a Home Voyage that lost its Vessel"
        );
        Ok(())
    }
}
