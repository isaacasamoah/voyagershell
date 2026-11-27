mod avatar;
mod model;
mod plan;

use super::layout::{avatar_bounds, avatar_on_dock, born, right_of, split_right};
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Decorations, Native, Seen, Sharpness, Terminal, fleets, vessels, voyages};
use crate::sandbox;
use crate::x11::{Key, Observed, Request};
use anyhow::Result;
use avatar::Avatar;
use model::{Model, Row, Tab};
use serde::Serialize;
use std::path::Path;
use voyager_contract::inspection::{Rect, Role};
use voyager_contract::{
    Axis, Context, Fleet, FleetId, Layout, Placement, PlacementId, RenameTarget, Split, Voyage,
    VoyageId,
};

cases! {
    SplitVessel => "split-vessel",
    DockVessel => "dock-vessel",
    AvatarSharp => "avatar-sharp",
    AvatarFloat => "avatar-float",
    AvatarSmall => "avatar-small",
    CreateFleet => "create-fleet",
    SwitchFleet => "switch-fleet",
    FleetTabGivesKeyboard => "fleet-tab-gives-keyboard",
    CreateVoyage => "create-voyage",
    SwitchVoyage => "switch-voyage",
    VoyageSwitchGivesKeyboard => "voyage-switch-gives-keyboard",
    SplitFocusRemembered => "split-focus-remembered",
    ReopenVoyageFleet => "reopen-voyage-restores-fleet",
    RenameFleetEnter => "rename-fleet-enter",
    RenameVoyageBlur => "rename-voyage-blur",
    RenameVesselF2 => "rename-vessel-f2",
    RenameKeyboard => "rename-keyboard",
    RenameEscape => "rename-escape-cancels",
    RenameEmpty => "rename-empty-refused",
    RelaunchFocus => "relaunch-restores-focus",
    MaximizeFocusRemembered => "maximize-focus-remembered",
    FleetTabFocusRemembered => "fleet-tab-focus-remembered",
    Relaunch => "relaunch-restores",
    DragBarMovesWindow => "drag-bar-moves-window",
    TabDragDoesNotMoveWindow => "tab-drag-does-not-move-window",
    DoubleClickMaximises => "double-click-bar-maximises-window",
    SidebarDragMovesWindow => "sidebar-drag-moves-window",
    VoyageDragDoesNotMoveWindow => "voyage-drag-does-not-move-window",
    TerminalSelectionDoesNotMoveWindow => "terminal-selection-does-not-move-window",
    FleetWithoutInputTakesNoKeyboard => "fleet-without-input-takes-no-keyboard",
    FleetTabKeepsChatKeyboard => "fleet-tab-keeps-chat-keyboard",
    AgentPlanSurvivesClick => "agent-plan-survives-click",
    StaleAgentEditRefused => "stale-agent-edit-refused";
    "dock-vessel" needs "split-vessel",
    "avatar-float" needs "dock-vessel",
    "avatar-small" needs "avatar-float",
    "create-fleet" needs "avatar-small",
    "fleet-tab-gives-keyboard" needs "create-fleet",
    "create-voyage" needs "create-fleet",
    "voyage-switch-gives-keyboard" needs "create-voyage",
    "fleet-without-input-takes-no-keyboard" needs "create-voyage",
    "fleet-tab-keeps-chat-keyboard" needs "create-voyage",
}

pub const CONTROL: Case = Case::RenameFleetEnter;

const DOCKED_DIAMETER: f32 = 94.;
const COMPACT_DIAMETER: f32 = 38.;
const SHARP_TOLERANCE: f64 = 3.5;

const FLEET_NAME: &str = "Native Fleet";
const VOYAGE_NAME: &str = "Keyboard Voyage";
const VESSEL_NAME: &str = "+";
const FILLER_GAP: f32 = 10.0;
const MODELLED: &str = "the saved and drawn workspace match the journey's model";
const CHAT_KEPT: &str = "KEPT-42";

#[derive(PartialEq)]
struct Start {
    voyage: VoyageId,
    fleet: FleetId,
    vessel: Placement,
}

struct Created<Id> {
    id: Id,
    shell: Terminal,
}

pub(super) enum Open {
    DoubleClick,
    ClickThenF2,
}

#[derive(Clone, Copy, PartialEq)]
enum Outcome {
    Typed,
    Kept,
}

pub(super) enum Finish<'a> {
    Enter,
    Blur(&'a Target),
    Escape,
}

#[derive(Serialize)]
pub(super) struct Renamed {
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
struct Focus {
    voyage: Option<VoyageId>,
    fleet: Option<FleetId>,
    focused: Option<PlacementId>,
    saved: Option<PlacementId>,
    #[serde(flatten)]
    landing: Landing,
}

#[derive(Serialize)]
struct Typed {
    focus: Focus,
    dock_before: Context,
    printed: String,
    reached: bool,
    elsewhere: Vec<PlacementId>,
}

impl Typed {
    fn kept_dock(&self) -> bool {
        self.focus.landing.context == self.dock_before
            && self.focus.landing.dock == self.dock_before
    }

    fn reached_only(&self) -> bool {
        self.reached && self.elsewhere.is_empty()
    }
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
            .map(|fleet| fleet.placements.as_slice())
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

    cases.check(native, Case::AvatarSharp, |native| {
        native.hover(&Target::name(&RenameTarget::Voyage {
            id: start.voyage.clone(),
        }))?;
        let avatar = Avatar::find(native, DOCKED_DIAMETER)?;
        let (sharpness, look) = avatar.at_rest(native)?;
        native.keep("avatar-sharp", &look)?;
        Verdict::new()
            .expect(
                "the docked avatar's opaque pixels match a Lanczos reference at its device size",
                sharpness.lanczos.distance <= SHARP_TOLERANCE,
            )
            .expect(
                "the docked avatar is nearer the Lanczos reference than a bilinear reduction",
                sharpness.sharper(),
            )
            .observed("place", avatar.place())?
            .observed("sharpness", &sharpness)
    })?;

    let compact = Context::Fleet {
        id: start.fleet.clone(),
    };
    let float = cases.make(native, Case::AvatarFloat, |native| {
        let before = at_rest(native)?.document.context;
        native.drag(
            &Target::AVATAR,
            &Target::name(&RenameTarget::Fleet {
                id: start.fleet.clone(),
            }),
        )?;
        let docked = native.settle(
            "the avatar docked to the Fleet and drawn",
            |seen| {
                (seen.document.context != before && avatar_bounds(seen).is_some())
                    .then(|| seen.document.context.clone())
            },
            |_| true,
        )?;
        let avatar = Avatar::find(native, COMPACT_DIAMETER)?;
        let frames = avatar.floating(native)?;
        for (index, (_, look)) in frames.iter().enumerate() {
            native.keep(&format!("avatar-float-{index}"), look)?;
        }
        let sharpness: Vec<&Sharpness> = frames.iter().map(|(sharpness, _)| sharpness).collect();
        let rises: Vec<i32> = sharpness
            .iter()
            .map(|sharpness| sharpness.lanczos.offset[1])
            .collect();
        let verdict = Verdict::new()
            .expect("the avatar docked to the Fleet", docked == compact)
            .expect(
                "every float frame matches a Lanczos reference at its device size",
                sharpness
                    .iter()
                    .all(|sharpness| sharpness.lanczos.distance <= SHARP_TOLERANCE),
            )
            .expect(
                "every float frame is nearer the Lanczos reference than a bilinear reduction",
                sharpness.iter().all(|sharpness| sharpness.sharper()),
            )
            .expect(
                "the float moved the avatar between the frames",
                rises.iter().any(|rise| *rise != rises[0]),
            )
            .observed("place", avatar.place())?
            .observed("frames", &sharpness)?;
        Ok((verdict, Some(avatar)))
    })?;
    let Some(avatar) = float else {
        return Ok(());
    };

    cases.check(native, Case::AvatarSmall, |native| {
        native.hover(&Target::name(&RenameTarget::Voyage {
            id: start.voyage.clone(),
        }))?;
        let (sharpness, look) = avatar.at_rest(native)?;
        native.keep("avatar-small", &look)?;
        native.drag(&Target::AVATAR, &Target::name(&vessel(shell.placement())))?;
        let landing = native.settle(
            "the document and the frame on the Vessel dock, with the avatar drawn on it",
            |seen| (seen.document.context != compact).then(|| landing(seen)),
            Landing::landed,
        )?;
        Verdict::new()
            .expect(
                "the compact avatar's opaque pixels match a Lanczos reference at its device size",
                sharpness.lanczos.distance <= SHARP_TOLERANCE,
            )
            .expect(
                "the compact avatar is nearer the Lanczos reference than a bilinear reduction",
                sharpness.sharper(),
            )
            .expect(
                "the avatar returned to the Vessel dock",
                landing.context == docked && landing.landed(),
            )
            .observed("place", avatar.place())?
            .observed("sharpness", &sharpness)?
            .observed("landing", &landing)
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
                    .all(|fleet| fleet.name == "Fleet 2" && fleet.placements.len() == 1),
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
        let placed = born.first().and_then(|fleet| fleet.placements.first());
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

    cases.check(native, Case::FleetTabGivesKeyboard, |native| {
        let shells = [&first, &shell, &second.shell];
        let away = type_after_switch(
            native,
            &RenameTarget::Fleet { id: second.id.clone() },
            |seen| seen.document.selected_fleet.as_ref() == Some(&second.id),
            "FLEET",
            &second.shell,
            &shells,
        )?;
        let back = type_after_switch(
            native,
            &RenameTarget::Fleet { id: start.fleet.clone() },
            |seen| seen.document.selected_fleet.as_ref() == Some(&start.fleet),
            "BACK",
            &shell,
            &shells,
        )?;
        let verdict = Verdict::new()
            .expect(
                "the second Fleet has no remembered Vessel and the first remembers its second Vessel, not its first",
                away.focus.saved.is_none() && back.focus.saved.as_ref() == Some(shell.placement()),
            )
            .expect(
                "keys typed after the Fleet tab click, with no click in a Vessel, reach the only Vessel of the Fleet with none remembered",
                away.reached_only(),
            )
            .expect(
                "keys typed after the Fleet tab click, with no click in a Vessel, reach the remembered Vessel and not the Fleet's first",
                back.reached_only(),
            )
            .expect(
                "the dock is the same before and after each switch",
                away.kept_dock() && back.kept_dock(),
            )
            .observed("away", &away)?
            .observed("back", &back)?;
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
                    |voyage| matches!(&voyage.fleets[..], [fleet] if fleet.placements.len() == 1),
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
            .and_then(|fleet| fleet.placements.first());
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
                "the first Voyage shows the Fleet last used in it again",
                steps
                    .last()
                    .is_some_and(|step| step.fleet.as_ref() == Some(&start.fleet)),
            )
            .observed("steps", &steps)?;
        model.voyage = start.voyage.clone();
        model.fleet = start.fleet.clone();
        modelled(native, &model, verdict)
    })?;

    cases.check(native, Case::VoyageSwitchGivesKeyboard, |native| {
        let shells = [&first, &shell, &second.shell, &other.shell];
        let away = type_after_switch(
            native,
            &RenameTarget::Voyage { id: other.id.clone() },
            |seen| seen.document.selected_voyage.as_ref() == Some(&other.id),
            "VOYAGE",
            &other.shell,
            &shells,
        )?;
        let back = type_after_switch(
            native,
            &RenameTarget::Voyage { id: start.voyage.clone() },
            |seen| seen.document.selected_voyage.as_ref() == Some(&start.voyage),
            "RETURN",
            &shell,
            &shells,
        )?;
        let verdict = Verdict::new()
            .expect(
                "the new Voyage opens on a Fleet with no remembered Vessel and the first Voyage on its first Fleet, which remembers its second Vessel",
                away.focus.saved.is_none()
                    && back.focus.fleet.as_ref() == Some(&start.fleet)
                    && back.focus.saved.as_ref() == Some(shell.placement()),
            )
            .expect(
                "keys typed after the Voyage click, with no click in a Vessel, reach the only Vessel of the Fleet it opens on",
                away.reached_only(),
            )
            .expect(
                "keys typed after the Voyage click, with no click in a Vessel, reach the remembered Vessel of the Fleet it opens on",
                back.reached_only(),
            )
            .expect(
                "the dock is the same before and after each switch",
                away.kept_dock() && back.kept_dock(),
            )
            .observed("away", &away)?
            .observed("back", &back)?;
        model.voyage = start.voyage.clone();
        model.fleet = start.fleet.clone();
        modelled(native, &model, verdict)
    })?;

    cases.check(native, Case::SplitFocusRemembered, |native| {
        select(
            native,
            &RenameTarget::Voyage {
                id: other.id.clone(),
            },
            |seen| seen.document.selected_voyage.as_ref() == Some(&other.id),
        )?;
        let before = at_rest(native)?.document;
        let kept = before.selected_fleet.clone();
        let (after, _, _) = split_right(native, &before, other.shell.placement())?;
        let created = born(vessels(&before), vessels(&after), |vessel| &vessel.id);
        let [created] = created[..] else {
            return Ok(Verdict::new().expect("exactly one Vessel was created", false));
        };
        let drawn = native.settle(
            "the Vessel the split created drawn as focused",
            |seen| Some(remembered(seen)),
            |seen| seen.focused.as_ref() == Some(&created.id),
        )?;
        select(
            native,
            &RenameTarget::Voyage {
                id: start.voyage.clone(),
            },
            |seen| seen.document.selected_voyage.as_ref() == Some(&start.voyage),
        )?;
        let returned = select(
            native,
            &RenameTarget::Voyage {
                id: other.id.clone(),
            },
            |seen| seen.document.selected_voyage.as_ref() == Some(&other.id),
        )?;
        native.close()?;
        native.launch()?;
        let relaunched = native.settle(
            "the relaunched window drawing a focused Vessel",
            |seen| Some(remembered(seen)),
            |seen| seen.focused.is_some(),
        )?;
        select(
            native,
            &RenameTarget::Voyage {
                id: start.voyage.clone(),
            },
            |seen| seen.document.selected_voyage.as_ref() == Some(&start.voyage),
        )?;
        let verdict = Verdict::new()
            .expect(
                "the Vessel the split created is drawn as focused without a click",
                drawn.focused.as_ref() == Some(&created.id),
            )
            .expect(
                "returning to the Voyage draws the Vessel the split focused, not its first Vessel",
                returned.fleet == kept && returned.focused.as_ref() == Some(&created.id),
            )
            .expect(
                "the relaunched window draws the same Vessel as focused",
                relaunched.voyage.as_ref() == Some(&other.id)
                    && relaunched.focused.as_ref() == Some(&created.id),
            )
            .observed("drawn", &drawn)?
            .observed("returned", &returned)?
            .observed("relaunched", &relaunched)?;
        if let Some(fleet) = &kept {
            model.split_right(fleet, other.shell.placement(), created);
        }
        model.voyage = start.voyage.clone();
        model.fleet = start.fleet.clone();
        modelled(native, &model, verdict)
    })?;

    cases.check(native, Case::ReopenVoyageFleet, |native| {
        let left = select(native, &RenameTarget::Fleet { id: second.id.clone() }, |seen| {
            seen.document.selected_fleet.as_ref() == Some(&second.id)
        })?;
        select(native, &RenameTarget::Voyage { id: other.id.clone() }, |seen| {
            seen.document.selected_voyage.as_ref() == Some(&other.id)
        })?;
        let returned = select(native, &RenameTarget::Voyage { id: start.voyage.clone() }, |seen| {
            seen.document.selected_voyage.as_ref() == Some(&start.voyage)
        })?;
        let restored = Verdict::new()
            .expect(
                "returning to the first Voyage opens the Fleet last used in it, not its first Fleet",
                returned.fleet.as_ref() == Some(&second.id),
            )
            .expect(
                "the Vessel last focused in that Fleet is drawn as focused",
                returned.focused.as_ref() == Some(second.shell.placement()),
            )
            .expect(
                "the dock stayed on the Vessel",
                returned.landing.stayed(&docked),
            )
            .observed("left", &left)?
            .observed("returned", &returned)?;
        model.fleet = second.id.clone();
        modelled(native, &model, restored)
    })?;
    select(
        native,
        &RenameTarget::Fleet {
            id: start.fleet.clone(),
        },
        |seen| seen.document.selected_fleet.as_ref() == Some(&start.fleet),
    )?;
    model.fleet = start.fleet.clone();

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

    cases.check(native, Case::RelaunchFocus, |native| {
        shell.focus(native)?;
        let before = native.settle(
            "the second Vessel of the first Fleet focused and remembered",
            |seen| Some(remembered(seen)),
            |seen| seen.focused.as_ref() == Some(shell.placement()) && seen.saved == seen.focused,
        )?;
        native.close()?;
        native.launch()?;
        let after = native.settle(
            "the relaunched window drawing a focused Vessel",
            |seen| Some(remembered(seen)),
            |seen| seen.focused.is_some(),
        )?;
        let verdict = Verdict::new()
            .expect(
                "before the relaunch, the clicked Vessel is drawn as focused and saved as last used",
                before.focused.as_ref() == Some(shell.placement()) && before.saved == before.focused,
            )
            .expect(
                "the relaunched window opens the same Voyage and Fleet",
                after.voyage == before.voyage && after.fleet == before.fleet,
            )
            .expect(
                "the relaunched window draws the same Vessel as focused",
                after.focused == before.focused,
            )
            .observed("before", &before)?
            .observed("after", &after)?;
        modelled(native, &model, verdict)
    })?;

    let first_vessel = &start.vessel.id;

    cases.check(native, Case::MaximizeFocusRemembered, |native| {
        let before = native.observe("the first Fleet before the maximize", |seen| {
            Some(remembered(seen))
        })?;
        native.hover(&Target::name(&vessel(first_vessel)))?;
        native.click(&Target::maximize_panel(first_vessel))?;
        let maximized = native.settle(
            "the first Vessel maximized and drawn as focused",
            |seen| {
                let fleet = fleet(seen.document, &start.fleet)?;
                (fleet.maximized_placement.as_ref() == Some(first_vessel)).then(|| remembered(seen))
            },
            |seen| seen.focused.as_ref() == Some(first_vessel),
        )?;
        let saved = native
            .watch(|native| {
                Ok(native
                    .document()?
                    .filter(|(_, document)| last_used(document).as_ref() == Some(first_vessel))
                    .map(drop))
            })?
            .is_some();
        native.close()?;
        native.launch()?;
        let after = native.observe(
            "the relaunched window drawing the maximized Vessel",
            |seen| {
                seen.shows(&Target::name(&vessel(first_vessel)))
                    .then(|| remembered(seen))
            },
        )?;
        Verdict::new()
            .expect(
                "before the maximize, another Vessel of the Fleet is focused",
                before.focused.is_some() && before.focused.as_ref() != Some(first_vessel),
            )
            .expect(
                "the maximize button draws the Vessel it maximized as focused",
                maximized.focused.as_ref() == Some(first_vessel),
            )
            .expect(
                "before the relaunch, the maximized Vessel is saved as last used in its Voyage",
                saved,
            )
            .expect(
                "the relaunched window draws the maximized Vessel as focused",
                after.fleet.as_ref() == Some(&start.fleet)
                    && after.focused.as_ref() == Some(first_vessel),
            )
            .observed("before", &before)?
            .observed("maximized", &maximized)?
            .observed("saved", saved)?
            .observed("after", &after)
    })?;

    cases.check(native, Case::FleetTabFocusRemembered, |native| {
        let typed_in = second.shell.placement();
        let opened = select(
            native,
            &RenameTarget::Fleet {
                id: second.id.clone(),
            },
            |seen| seen.document.selected_fleet.as_ref() == Some(&second.id),
        )?;
        second.shell.line(native, "echo TAB-$((6*7))")?;
        let typed = second.shell.printed(native, "TAB-42")?;
        native.close()?;
        native.launch()?;
        let after = native.observe("the relaunched window drawing its selected Fleet", |seen| {
            let fleet = fleet(seen.document, seen.document.selected_fleet.as_ref()?)?;
            shown(seen, fleet).then(|| remembered(seen))
        })?;
        native.click(&Target::name(&first_fleet))?;
        native.observe("the first Fleet drawn with its maximized Vessel", |seen| {
            (seen.document.selected_fleet.as_ref() == Some(&start.fleet)
                && seen.shows(&Target::name(&vessel(first_vessel))))
            .then_some(())
        })?;
        native.hover(&Target::name(&vessel(first_vessel)))?;
        native.click(&Target::maximize_panel(first_vessel))?;
        native.observe("the first Fleet restored with every Vessel drawn", |seen| {
            let fleet = fleet(seen.document, &start.fleet)?;
            (fleet.maximized_placement.is_none() && shown(seen, fleet)).then_some(())
        })?;
        let verdict = Verdict::new()
            .expect(
                "the Fleet tab opens with its Vessel drawn as focused",
                opened.fleet.as_ref() == Some(&second.id)
                    && opened.focused.as_ref() == Some(typed_in),
            )
            .expect("the Vessel's shell printed TAB-42", typed)
            .expect(
                "the relaunched window opens the same Fleet and draws the same Vessel as focused",
                after.fleet.as_ref() == Some(&second.id)
                    && after.focused.as_ref() == Some(typed_in),
            )
            .observed("opened", &opened)?
            .observed("after", &after)?;
        modelled(native, &model, verdict)
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
    })?;
    cases.check(native, Case::DragBarMovesWindow, |native| {
        on_bar(native, &start)?;
        let unfilled = native.observe("the empty top bar and the create Fleet button", |seen| {
            let filler = Target::window_drag("fleets").find(seen.frame)?.bounds;
            let create = Target::create_fleet(&start.voyage).find(seen.frame)?.bounds;
            Some(filler.x - (create.x + create.width))
        })?;
        let seen = native.window_requests()?.len();
        native.drag_across(&Target::window_drag("fleets"), (60, 0))?;
        let sent = native.requests_after(seen, 1)?;
        native.keep_window("drag-move")?;
        Verdict::new()
            .expect(
                "the empty top bar starts right after the create Fleet button",
                (0.0..FILLER_GAP).contains(&unfilled),
            )
            .expect(
                "a drag across the empty top bar sends a move request for the window",
                !sent.is_empty() && sent.iter().all(moves),
            )
            .observed(
                "logical pixels between the create Fleet button and the empty top bar",
                unfilled,
            )?
            .observed("requests", &sent)
    })?;

    cases.check(native, Case::TabDragDoesNotMoveWindow, |native| {
        on_bar(native, &start)?;
        let before = tabs(&at_rest(native)?.document, &start.voyage);
        let seen = native.window_requests()?.len();
        let [first, last] = before.as_slice() else {
            return Verdict::new()
                .expect("the Voyage holds two Fleet tabs to drag", false)
                .observed("tabs", &before);
        };
        let first_tab = Target::name(&RenameTarget::Fleet { id: first.clone() });
        let filler = Target::window_drag("fleets");
        let mut held = native.hold(&Target::name(&RenameTarget::Fleet { id: last.clone() }))?;
        held.toward(native.point_in(&first_tab, 0.25, 0.5)?)?;
        held.until("the insertion bar on the first Fleet tab", |seen| {
            seen.shows(&Target::fleet_drop(first)).then_some(())
        })?;
        held.toward(native.point_in(&filler, 0.5, 0.5)?)?;
        held.toward(native.point_in(&first_tab, 0.25, 0.5)?)?;
        held.until("the insertion bar on the first Fleet tab again", |seen| {
            seen.shows(&Target::fleet_drop(first)).then_some(())
        })?;
        held.release()?;
        let after = native.settle(
            "the Fleet tabs in the saved order",
            |seen| Some(tabs(seen.document, &start.voyage)),
            |order| *order != before,
        )?;
        native.keep_window("tab-drag")?;
        let sent = native.requests_through_quiet(seen)?;
        Verdict::new()
            .expect(
                "dragging the second Fleet tab across the empty top bar onto the first puts it first",
                after.first() == Some(last) && after.last() == Some(first),
            )
            .expect(
                "the tab drag, carried across the empty top bar, sends no window request",
                sent.is_empty(),
            )
            .observed("before", &before)?
            .observed("after", &after)?
            .observed("requests", &sent)
    })?;

    cases.check(native, Case::DoubleClickMaximises, |native| {
        on_bar(native, &start)?;
        let seen = native.window_requests()?.len();
        native.double_click(&Target::window_drag("fleets"))?;
        let sent = native.requests_after(seen, 1)?;
        native.keep_window("zoom")?;
        let all = native.window_requests()?;
        Verdict::new()
            .expect(
                "a double-click on the empty top bar sends one toggle of the window's maximized state",
                maximises(&sent),
            )
            .expect(
                "the double-click sent no other window request",
                all.len() == seen + 1,
            )
            .observed("requests", &all[seen..])
    })?;

    cases.check(native, Case::SidebarDragMovesWindow, |native| {
        on_bar(native, &start)?;
        let seen = native.window_requests()?.len();
        native.drag_across(&Target::window_drag("sidebar"), (40, 0))?;
        let sent = native.requests_after(seen, 1)?;
        native.keep_window("sidebar-drag")?;
        Verdict::new()
            .expect(
                "a drag across the sidebar's empty top row sends a move request for the window",
                !sent.is_empty() && sent.iter().all(moves),
            )
            .observed("requests", &sent)
    })?;

    cases.check(native, Case::VoyageDragDoesNotMoveWindow, |native| {
        on_bar(native, &start)?;
        let seen = native.window_requests()?.len();
        let mut held = native.hold(&Target::name(&RenameTarget::Voyage {
            id: start.voyage.clone(),
        }))?;
        held.toward(native.point_in(&Target::window_drag("sidebar"), 0.5, 0.5)?)?;
        held.release()?;
        let sent = native.requests_through_quiet(seen)?;
        native.keep_window("voyage-drag")?;
        Verdict::new()
            .expect(
                "a Voyage drag carried across the sidebar's empty top row sends no window request",
                sent.is_empty(),
            )
            .observed("requests", &sent)
    })?;

    cases.check(native, Case::TerminalSelectionDoesNotMoveWindow, |native| {
        on_bar(native, &start)?;
        let seen = native.window_requests()?.len();
        let mut held = native.hold(&Target::terminal(&start.vessel.id))?;
        held.toward(native.point_in(&Target::window_drag("fleets"), 0.5, 0.5)?)?;
        held.release()?;
        let sent = native.requests_through_quiet(seen)?;
        native.keep_window("terminal-selection")?;
        Verdict::new()
            .expect(
                "a terminal selection dragged up across the empty top bar sends no window request",
                sent.is_empty(),
            )
            .observed("requests", &sent)
    })?;
    cases.check(native, Case::FleetWithoutInputTakesNoKeyboard, |native| {
        let shells = [&shell, &first, &second.shell, &other.shell];
        select(
            native,
            &RenameTarget::Voyage { id: start.voyage.clone() },
            |seen| seen.document.selected_voyage.as_ref() == Some(&start.voyage),
        )?;
        select(
            native,
            &RenameTarget::Fleet { id: start.fleet.clone() },
            |seen| seen.document.selected_fleet.as_ref() == Some(&start.fleet),
        )?;
        let before = at_rest(native)?.document;
        native.click(&Target::create_fleet(&start.voyage))?;
        native.click(&Target::CREATE_AGENTS)?;
        let (agents, only_agents) = native.observe(
            "a new Fleet holding one Agents Vessel, selected and drawn",
            |seen| {
                let fleet = born(fleets(&before), fleets(seen.document), |fleet| &fleet.id)
                    .into_iter()
                    .next()?;
                let agents = |placed: &Placement| {
                    seen.document
                        .vessels
                        .iter()
                        .any(|content| content.id == placed.vessel && content.type_id == "agents")
                };
                let only_agents = matches!(&fleet.placements[..], [placed] if agents(placed));
                (seen.document.selected_fleet.as_ref() == Some(&fleet.id) && shown(seen, fleet))
                    .then(|| (fleet.id.clone(), only_agents))
            },
        )?;
        select(
            native,
            &RenameTarget::Fleet { id: start.fleet.clone() },
            |seen| seen.document.selected_fleet.as_ref() == Some(&start.fleet),
        )?;
        let status = native.observe("the workspace status before the switch", |seen| {
            Some(seen.label(&Target::STATUS).map(str::to_owned))
        })?;
        let typed = type_after_switch(
            native,
            &RenameTarget::Fleet { id: agents.clone() },
            |seen| seen.document.selected_fleet.as_ref() == Some(&agents),
            "NONE",
            &shell,
            &shells,
        )?;
        let after = native.observe("the workspace status after typing", |seen| {
            Some(seen.label(&Target::STATUS).map(str::to_owned))
        })?;
        select(
            native,
            &RenameTarget::Fleet { id: start.fleet.clone() },
            |seen| seen.document.selected_fleet.as_ref() == Some(&start.fleet),
        )?;
        Verdict::new()
            .expect("the new Fleet holds only an Agents Vessel", only_agents)
            .expect(
                "keys typed after the tab click of a Fleet with no Vessel that takes input reach no shell",
                !typed.reached && typed.elsewhere.is_empty(),
            )
            .expect("the switch and the typing show no new status", after == status)
            .expect("the dock is the same before and after the switch", typed.kept_dock())
            .observed("agents", &agents)?
            .observed("typed", &typed)?
            .observed("status before", &status)?
            .observed("status after", &after)
    })?;
    cases.check(native, Case::FleetTabKeepsChatKeyboard, |native| {
        let shells = [&first, &shell, &second.shell, &other.shell];
        select(
            native,
            &RenameTarget::Voyage {
                id: start.voyage.clone(),
            },
            |seen| seen.document.selected_voyage.as_ref() == Some(&start.voyage),
        )?;
        select(
            native,
            &RenameTarget::Fleet {
                id: start.fleet.clone(),
            },
            |seen| seen.document.selected_fleet.as_ref() == Some(&start.fleet),
        )?;
        native.click(&Target::CHAT_TOGGLE)?;
        let opened = native.observe("the chat composer drawn", |seen| {
            seen.shows(&Target::CHAT_COMPOSER)
                .then(|| seen.label(&Target::CHAT_COMPOSER).map(str::to_owned))
        })?;
        let dock_before = at_rest(native)?.document.context;
        let focus = select(
            native,
            &RenameTarget::Fleet {
                id: second.id.clone(),
            },
            |seen| seen.document.selected_fleet.as_ref() == Some(&second.id),
        )?;
        native.type_text(CHAT_KEPT)?;
        let draft = native
            .settle(
                "the composer holding the keys typed after the tab click",
                |seen| Some(seen.label(&Target::CHAT_COMPOSER).map(str::to_owned)),
                |draft| draft.as_deref() == Some(CHAT_KEPT),
            )
            .ok()
            .flatten();
        let mut elsewhere = Vec::new();
        for shell in shells {
            if shell.holds_now(native, CHAT_KEPT)? {
                elsewhere.push(shell.placement().clone());
            }
        }
        native.click(&Target::CHAT_COMPOSER)?;
        for _ in CHAT_KEPT.chars() {
            native.press(Key::BackSpace)?;
        }
        native.click(&Target::CHAT_TOGGLE)?;
        native.observe("the chat closed", |seen| {
            (!seen.shows(&Target::CHAT_COMPOSER)).then_some(())
        })?;
        select(
            native,
            &RenameTarget::Fleet {
                id: start.fleet.clone(),
            },
            |seen| seen.document.selected_fleet.as_ref() == Some(&start.fleet),
        )?;
        Verdict::new()
            .expect(
                "keys typed after the Fleet tab click, with the chat open, reach the chat composer",
                draft.as_deref() == Some(CHAT_KEPT),
            )
            .expect(
                "no shell shows the keys typed with the chat open",
                elsewhere.is_empty(),
            )
            .expect(
                "the dock is the same before and after the switch",
                focus.landing.context == dock_before && focus.landing.dock == dock_before,
            )
            .observed("opened", &opened)?
            .observed("composer", &draft)?
            .observed("elsewhere", &elsewhere)?
            .observed("focus", &focus)
    })?;
    plan::drive(native, cases)
}

fn type_after_switch(
    native: &Native,
    subject: &RenameTarget,
    done: impl Fn(&Seen) -> bool,
    word: &str,
    expected: &Terminal,
    shells: &[&Terminal],
) -> Result<Typed> {
    let dock_before = at_rest(native)?.document.context;
    let focus = select(native, subject, done)?;
    native.type_text(&format!("echo {word}-$((6*7))"))?;
    native.press(Key::Return)?;
    let printed = format!("{word}-42");
    let reached = expected.printed(native, &printed)?;
    let mut elsewhere = Vec::new();
    for shell in shells {
        if shell.placement() != expected.placement() && shell.holds_now(native, &printed)? {
            elsewhere.push(shell.placement().clone());
        }
    }
    Ok(Typed {
        focus,
        dock_before,
        printed,
        reached,
        elsewhere,
    })
}

fn on_bar(native: &mut Native, start: &Start) -> Result<()> {
    native.launch_as(Decorations::Client)?;
    if at_rest(native)?.document.selected_voyage.as_ref() != Some(&start.voyage) {
        native.click(&Target::name(&RenameTarget::Voyage {
            id: start.voyage.clone(),
        }))?;
    }
    native.observe("the Voyage's Fleet tabs and the empty top bar", |seen| {
        (seen.document.selected_voyage.as_ref() == Some(&start.voyage)
            && tabs(seen.document, &start.voyage).len() == 2
            && seen.shows(&Target::window_drag("fleets"))
            && seen.shows(&Target::window_drag("sidebar")))
        .then_some(())
    })
}

fn tabs(layout: &Layout, voyage: &VoyageId) -> Vec<FleetId> {
    voyages(layout)
        .filter(|saved| saved.id == *voyage)
        .flat_map(|saved| saved.fleets.iter().filter(|fleet| !fleet.closed))
        .map(|fleet| fleet.id.clone())
        .collect()
}

fn moves(observed: &Observed) -> bool {
    matches!(&observed.request, Request::MoveResize { direction, .. } if direction.name == "move")
}

fn maximises(sent: &[Observed]) -> bool {
    matches!(sent, [Observed { request: Request::NetWmState { action, first, second, .. }, .. }]
        if action.name == "toggle"
            && [first, second].iter().any(|atom| atom.as_deref() == Some("_NET_WM_STATE_MAXIMIZED_VERT"))
            && [first, second].iter().any(|atom| atom.as_deref() == Some("_NET_WM_STATE_MAXIMIZED_HORZ")))
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

pub(super) fn rename(
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
    placed: Option<&Placement>,
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
        .flat_map(|fleet| &fleet.placements)
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
    let panes = fleet.placements.iter().flat_map(|placed| {
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
    let [vessel] = &fleet.placements[..] else {
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

fn remembered(seen: &Seen) -> Focus {
    let document = seen.document;
    let focused = seen
        .frame
        .elements
        .iter()
        .find(|element| element.role == Role::FocusedVessel)
        .map(|element| PlacementId(element.key.clone()));
    Focus {
        voyage: document.selected_voyage.clone(),
        fleet: document.selected_fleet.clone(),
        focused,
        saved: last_used(document),
        landing: landing(seen),
    }
}

fn last_used(document: &Layout) -> Option<PlacementId> {
    document
        .last_vessels
        .iter()
        .find(|entry| Some(&entry.fleet) == document.selected_fleet.as_ref())
        .map(|entry| entry.vessel.clone())
}

fn select(native: &Native, subject: &RenameTarget, done: impl Fn(&Seen) -> bool) -> Result<Focus> {
    native.click(&Target::name(subject))?;
    native.settle(
        &format!(
            "{} selected and drawn with a focused Vessel",
            Target::name(subject)
        ),
        |seen| {
            let fleet = fleet(seen.document, seen.document.selected_fleet.as_ref()?)?;
            (done(seen) && shown(seen, fleet)).then(|| remembered(seen))
        },
        |focus| focus.focused.is_some(),
    )
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
        .placements
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
        let vessel = |id: &str, name: &str| json!({"id": id, "vessel": "content-1", "name": name});
        let fleet = |id: &str, name: &str, vessels: &[serde_json::Value]| json!({"id": id, "name": name, "root": null, "placements": vessels});
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
            "vessels": [],
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
        let mut placed = late.voyages[0].fleets[0].placements[0].clone();
        placed.id = PlacementId("placement-99".into());
        late.voyages[0].fleets[0].placements.push(placed);
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
        home.fleets[0].placements[0].id = PlacementId("placement-7".into());
        document.home = Some(home);
        let started = model(&document)?;
        assert_eq!(
            differences(&started, &document, &WHOLE)?,
            Vec::<String>::new()
        );
        let found = differences(&model(&modelled_layout()?)?, &document, &WHOLE)?;
        assert!(first(&found, "Home Voyage"), "{found:?}");
        if let Some(home) = document.home.as_mut() {
            home.fleets[0].placements.clear();
        }
        let found = differences(&started, &document, &WHOLE)?;
        assert!(
            first(&found, "Home Voyage"),
            "a Home Voyage that lost its Vessel"
        );
        Ok(())
    }
}
