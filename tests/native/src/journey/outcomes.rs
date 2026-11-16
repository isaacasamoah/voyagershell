use super::chat::{ask, conclude, returned_text};
use super::{Cases, Verdict, cases};
use crate::core_relay::{Arm, Fault};
use crate::inspection::Target;
use crate::native::{Native, fleets, voyages};
use crate::provider::{Provider, Script};
use crate::x11::Key;
use anyhow::{Context as _, Result};
use serde_json::{Value, json};
use std::time::Duration;
use voyager_contract::inspection::Role;
use voyager_contract::{FleetId, Layout, RenameTarget, VoyageId};

cases! {
    RefusedReason => "refused-shows-reason",
    ToolRefused => "tool-refusal-carries-reason",
    SaveStalled => "rename-stalled-applied",
    SaveDropped => "rename-dropped-retried",
    CloseRefused => "close-refused-says-why",
    StopDropped => "stop-dropped-retried",
    StopHeld => "stop-held-closed",
    StartHeld => "start-held-adopted",
    StartStalled => "start-stalled-not-repeated",
}

pub const CONTROL: Case = Case::RefusedReason;
pub const HOLD: &str = "arm";

const SAVE: &str = "doc.set";
const START: &str = "terminal.run";
const STOP: &str = "terminal.kill";
const LABEL: &str = "voyager-operation";

const CORE_DEADLINE: Duration = Duration::from_secs(20);
const HELD_MS: u64 = 21_000;
const STALLED_MS: u64 = 22_000;
const STALL: Duration = Duration::from_secs(24);
const REFUSED: &str = "Refused.";
const UNCERTAIN: &str = "Uncertain.";
const REASON: &str = "A name must contain 1 to 128 bytes";
const CHANGED: &str = "Layout changed";
const ASK_BEHIND: &str = "Rename the Fleet while I look at the close dialog";
const BEHIND: &str = "Renamed Behind";
const BEHIND_ITEM: &str = "stand-in-behind";
const STALLED: &str = "Held Fleet";
const NOT_REPEATED: &str = "so it was not repeated";
const DROPPED: &str = "Retried Fleet";
const TOO_LONG: usize = 129;
const WORKSPACE: &str = "voyager_workspace";
const ASK: &str = "Rename the Fleet to nothing";
const ITEM: &str = "stand-in-refused";

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let start = saved(native)?;
    let voyage = voyages(&start)
        .next()
        .context("The fresh workspace has no Voyage")?
        .id
        .clone();
    let fleet = fleets(&start)
        .next()
        .context("The fresh workspace has no Fleet")?
        .id
        .clone();

    cases.check(native, Case::RefusedReason, |native| {
        let subject = RenameTarget::Fleet { id: fleet.clone() };
        let (name, editor) = (Target::name(&subject), Target::editor(&subject));
        let before = fleet_name(&saved(native)?, &fleet);
        let long = "n".repeat(TOO_LONG);
        native.double_click(&name)?;
        native.observe("the Fleet's name editor", |seen| {
            (seen.shows(&editor) && !seen.shows(&name)).then_some(())
        })?;
        native.type_text(&long)?;
        native.settle(
            "the editor holding the over-long draft",
            |seen| seen.label(&editor).map(str::to_owned),
            |draft| *draft == long,
        )?;
        native.press(Key::Return)?;
        let status = native.screen_status("a refusal in the status line", |label| {
            label.starts_with(REFUSED)
        })?;
        native.keep_window("refused")?;
        native.press(Key::Escape)?;
        let after = native.observe("the Fleet's name in place of its editor", |seen| {
            (seen.shows(&name) && !seen.shows(&editor)).then(|| fleet_name(seen.document, &fleet))
        })?;
        Verdict::new()
            .expect(
                "the status line says Refused and gives the owner's reason",
                status.contains(REASON),
            )
            .expect(
                "the Fleet keeps its saved name",
                before.is_some() && after == before,
            )
            .observed("status", &status)?
            .observed("savedName", &after)
    })?;

    let provider = Provider::listen(&native.system.evidence)?;
    native
        .system
        .record(json!({"event":"stand-in","ledger":provider.ledger()}))?;
    native.click(&Target::CHAT_TOGGLE)?;
    native.settle(
        "the chat composer drawn",
        |seen| Some(seen.shows(&Target::CHAT_COMPOSER)),
        |shown| *shown,
    )?;

    cases.check(native, Case::ToolRefused, |native| {
        let before = fleet_name(&saved(native)?, &fleet);
        let turn = ask(native, &provider, ASK)?;
        let played = provider.play(&turn, &rename("")?)?;
        conclude(native, &provider, &turn, ITEM)?;
        native.keep_window("tool-refused")?;
        let returned = played.get(1).and_then(|call| returned_text(&call.result));
        let after = fleet_name(&saved(native)?, &fleet);
        Verdict::new()
            .expect(
                "the scripted rename to an empty name came back refused with the owner's reason",
                returned.as_ref().is_some_and(|text| {
                    text["status"] == "refused"
                        && text["message"]
                            .as_str()
                            .is_some_and(|message| message.contains(REASON))
                }),
            )
            .expect(
                "the Fleet keeps its saved name",
                before.is_some() && after == before,
            )
            .observed("played", &played)
    })?;

    cases.check(native, Case::SaveStalled, |native| {
        let typed = type_name(native, &fleet, STALLED)?;
        let labels = native.with_core_paused(|native| {
            native.press(Key::Return)?;
            native.keep_window("stalled-paused")?;
            native.drawn_labels(&Target::STATUS, STALL)
        })?;
        let (drawn, after) = renamed(native, &fleet, STALLED)?;
        native.keep_window("stalled-applied")?;
        Verdict::new()
            .expect(
                "the status line never said Uncertain while Core was paused past the canvas's wait",
                !said_uncertain(&labels),
            )
            .expect(
                "the rename ended as applied without Refresh: the editor closed and the Fleet is drawn under the new name",
                drawn,
            )
            .expect(
                "Core saved the name once and its document has not changed again",
                after == typed + 1,
            )
            .observed("statusLabels", &labels)?
            .observed("versions", json!({"before":typed,"after":after}))
    })?;

    cases.check(native, Case::SaveDropped, |native| {
        let typed = type_name(native, &fleet, DROPPED)?;
        let arm = native.system.arm_core(SAVE, Fault::Drop)?;
        native.press(Key::Return)?;
        let labels = native.drawn_labels(&Target::STATUS, CORE_DEADLINE)?;
        let (drawn, after) = renamed(native, &fleet, DROPPED)?;
        let spent = spent(native, &arm)?;
        Verdict::new()
            .expect(
                "the status line never said Uncertain",
                !said_uncertain(&labels),
            )
            .expect(
                "the rename ended as applied: the editor closed and the Fleet is drawn under the new name",
                drawn,
            )
            .expect(
                "the one retry saved the name once",
                after == typed + 1,
            )
            .observed("statusLabels", &labels)?
            .observed("withheld", &spent)?
            .observed("versions", json!({"before":typed,"after":after}))
    })?;

    let message = Target::voyage_close_status(&voyage);
    cases.check(native, Case::CloseRefused, |native| {
        let turn = ask(native, &provider, ASK_BEHIND)?;
        native.observe("the started turn drawn in the chat", |seen| {
            seen.shows(&Target::CHAT_STATUS).then_some(())
        })?;
        open_dialog(native, &voyage)?;
        let live = native.live_terminals()?;
        let played = provider.play(&turn, &rename(BEHIND)?)?;
        let changed = native.watch(|native| {
            Ok((fleet_name(&saved(native)?, &fleet).as_deref() == Some(BEHIND)).then_some(()))
        })?;
        native.click(&Target::voyage_close_confirm(&voyage))?;
        let status = native.drawn_label(
            &message,
            Duration::ZERO,
            "a refusal in the close dialog",
            |label| label.starts_with(REFUSED),
        )?;
        native.keep_window("close-refused")?;
        let (open, _, kept) = at_rest(native, &voyage, &message)?;
        let still_live = native.live_terminals()?;
        native.click(&Target::voyage_close_cancel(&voyage))?;
        native.observe("the close dialog dismissed", |seen| {
            (!seen.shows(&Target::voyage_close_cancel(&voyage))).then_some(())
        })?;
        conclude(native, &provider, &turn, BEHIND_ITEM)?;
        Verdict::new()
            .expect(
                "the layout changed behind the open dialog",
                changed.is_some(),
            )
            .expect(
                "the close dialog says Refused and gives the owner's reason",
                status.contains(CHANGED),
            )
            .expect(
                "the Voyage is open and every program still runs",
                open && still_live == live,
            )
            .expect(
                "the dialog keeps the refusal while the canvas refreshes",
                kept.as_deref()
                    .is_some_and(|kept| kept.starts_with(REFUSED)),
            )
            .observed("status", &status)?
            .observed("played", &played)?
            .observed("liveTerminals", json!({"before":live,"after":still_live}))?
            .observed("atRest", json!({"open":open,"message":kept}))
    })?;

    for (case, fault) in [
        (Case::StopDropped, Fault::Drop),
        (Case::StopHeld, Fault::Hold { ms: HELD_MS }),
    ] {
        cases.check(native, case, |native| {
            if !is_open(&saved(native)?, &voyage) {
                reopen(native, &voyage)?;
            }
            let programs = programs(native, &voyage)?;
            open_dialog(native, &voyage)?;
            let arm = native.system.arm_core(STOP, fault)?;
            native.click(&Target::voyage_close_confirm(&voyage))?;
            native.keep_window(&format!("{}-confirmed", super::Case::name(case)))?;
            let labels = native.drawn_labels(&message, CORE_DEADLINE)?;
            let closed = native.settle(
                "the Voyage closed",
                |seen| Some(!is_open(seen.document, &voyage)),
                |closed| *closed,
            );
            native.keep_window(&format!("{}-closed", super::Case::name(case)))?;
            let live = native.live_terminals()?;
            let spent = spent(native, &arm)?;
            Verdict::new()
                .expect(
                    "the close dialog never said Uncertain",
                    !said_uncertain(&labels),
                )
                .expect(
                    "the Voyage closed",
                    closed.as_ref().is_ok_and(|closed| *closed),
                )
                .expect(
                    "none of the Voyage's programs still runs",
                    !programs.is_empty() && programs.iter().all(|program| !live.contains(program)),
                )
                .observed("dialogLabels", &labels)?
                .observed("fault", &spent)?
                .observed("programs", json!({"stopped":programs,"live":live}))
        })?;
    }
    cases.check(native, Case::StartHeld, |native| {
        let (born, arm) = create_fleet(native, &voyage, Fault::Hold { ms: HELD_MS })?;
        let labels = native.drawn_labels(&Target::STATUS, CORE_DEADLINE)?;
        let (bound, drawn) = started(native, &born)?;
        let same = match operation(native, bound.as_deref())? {
            Some(operation) => labelled(native, &operation)?,
            None => Vec::new(),
        };
        let spent = spent(native, &arm)?;
        Verdict::new()
            .expect(
                "the status line never said Uncertain",
                !said_uncertain(&labels),
            )
            .expect(
                "the new Fleet's terminal is bound and drawn",
                bound.is_some() && drawn,
            )
            .expect(
                "Core holds exactly one terminal for the start",
                same.len() == 1,
            )
            .observed("statusLabels", &labels)?
            .observed("fault", &spent)?
            .observed("startTerminals", &same)
    })?;

    cases.check(native, Case::StartStalled, |native| {
        let (born, arm) = create_fleet(native, &voyage, Fault::Stall { ms: STALLED_MS })?;
        native.drawn_labels(&Target::STATUS, CORE_DEADLINE)?;
        let spent = spent(native, &arm)?;
        let status = native
            .screen_status("the start's unconfirmed answer in the status line", |label| {
                label.contains(NOT_REPEATED)
            })
            .ok();
        let marker = pending_start(&saved(native)?, &born);
        let same = match &marker {
            Some(operation) => labelled(native, operation)?,
            None => Vec::new(),
        };
        Verdict::new()
            .expect(
                "the start whose list could not prove it absent keeps its marker and was not repeated",
                marker.is_some(),
            )
            .expect(
                "Core holds exactly one terminal for the start",
                same.len() == 1,
            )
            .expect(
                "the status line says the start was not repeated",
                status.is_some(),
            )
            .observed("fault", &spent)?
            .observed("status", &status)?
            .observed("marker", &marker)?
            .observed("startTerminals", &same)
    })?;

    Ok(())
}

fn type_name(native: &Native, fleet: &FleetId, typed: &str) -> Result<u64> {
    let subject = RenameTarget::Fleet { id: fleet.clone() };
    let (name, editor) = (Target::name(&subject), Target::editor(&subject));
    native.double_click(&name)?;
    native.observe("the Fleet's name editor", |seen| {
        (seen.shows(&editor) && !seen.shows(&name)).then_some(())
    })?;
    native.type_text(typed)?;
    let (version, _) = native.settle(
        "the editor holding the new name over a saved layout at rest",
        |seen| {
            seen.label(&editor)
                .map(|draft| (seen.version, draft == typed))
        },
        |(_, held)| *held,
    )?;
    Ok(version)
}

fn renamed(native: &Native, fleet: &FleetId, typed: &str) -> Result<(bool, u64)> {
    let subject = RenameTarget::Fleet { id: fleet.clone() };
    let (name, editor) = (Target::name(&subject), Target::editor(&subject));
    let drawn = native
        .settle(
            "the Fleet drawn under its new name with the editor closed",
            |seen| {
                let labels: Vec<&str> = seen
                    .frame
                    .elements
                    .iter()
                    .filter(|element| element.role == Role::FleetName && element.key == fleet.0)
                    .filter_map(|element| element.label.as_deref())
                    .collect();
                Some(!seen.shows(&editor) && seen.shows(&name) && labels == [typed])
            },
            |drawn| *drawn,
        )
        .unwrap_or(false);
    let (version, layout) = native
        .document()?
        .context("The layout document is missing")?;
    let saved = fleet_name(&layout, fleet).as_deref() == Some(typed);
    Ok((drawn && saved, version))
}

fn said_uncertain(labels: &[String]) -> bool {
    labels.iter().any(|label| label.starts_with(UNCERTAIN))
}

fn spent(native: &Native, arm: &Arm) -> Result<Value> {
    let applied = native.watch(|native| native.system.arm_spent(arm))?;
    applied.with_context(|| {
        format!(
            "The Core relay never applied arm {} to {}, so this case did not reach the state it judges",
            arm.id, arm.method
        )
    })
}

fn create_fleet(native: &Native, voyage: &VoyageId, fault: Fault) -> Result<(FleetId, Arm)> {
    if !is_open(&saved(native)?, voyage) {
        reopen(native, voyage)?;
    }
    let known: Vec<FleetId> = fleets(&saved(native)?)
        .map(|fleet| fleet.id.clone())
        .collect();
    native.click(&Target::create_fleet(voyage))?;
    let arm = native.system.arm_core(START, fault)?;
    native.click(&Target::worker("terminal"))?;
    let born = native
        .watch(|native| {
            Ok(fleets(&saved(native)?)
                .find(|fleet| !known.contains(&fleet.id))
                .map(|fleet| fleet.id.clone()))
        })?
        .context("Core never held the new Fleet")?;
    Ok((born, arm))
}

fn started(native: &Native, fleet: &FleetId) -> Result<(Option<String>, bool)> {
    native
        .settle(
            "the new Fleet's terminal bound and drawn",
            |seen| {
                let placement = fleets(seen.document)
                    .find(|item| &item.id == fleet)?
                    .placements
                    .first()?;
                let vessel = seen
                    .document
                    .vessels
                    .iter()
                    .find(|vessel| vessel.id == placement.vessel)?;
                let bound = vessel
                    .backend
                    .as_ref()
                    .filter(|_| vessel.start_pending.is_none())
                    .map(|backend| backend.0.clone());
                Some((bound, seen.shows(&Target::terminal(&placement.id))))
            },
            |(bound, drawn)| bound.is_some() && *drawn,
        )
        .or_else(|_| Ok((None, false)))
}

fn operation(native: &Native, bound: Option<&str>) -> Result<Option<String>> {
    let listed = native.system.watch("terminal.list", json!({"all":true}))?;
    Ok(listed["terminals"]
        .as_array()
        .context("Core listed no terminals")?
        .iter()
        .find(|terminal| bound.is_some() && terminal["address"].as_str() == bound)
        .and_then(|terminal| terminal["labels"][LABEL].as_str().map(str::to_owned)))
}

fn labelled(native: &Native, operation: &str) -> Result<Vec<Value>> {
    let listed = native.system.watch(
        "terminal.list",
        json!({"all":true,"labels":{LABEL:operation}}),
    )?;
    Ok(listed["terminals"]
        .as_array()
        .context("Core listed no terminals")?
        .clone())
}

fn pending_start(layout: &Layout, fleet: &FleetId) -> Option<String> {
    let placement = fleets(layout)
        .find(|item| &item.id == fleet)?
        .placements
        .first()?;
    layout
        .vessels
        .iter()
        .find(|vessel| vessel.id == placement.vessel)?
        .start_pending
        .clone()
}

fn programs(native: &Native, voyage: &VoyageId) -> Result<Vec<String>> {
    let layout = saved(native)?;
    let live = native.live_terminals()?;
    let placed: Vec<_> = voyages(&layout)
        .filter(|item| &item.id == voyage)
        .flat_map(|item| item.fleets.iter().flat_map(|fleet| fleet.placements.iter()))
        .map(|placement| placement.vessel.clone())
        .collect();
    Ok(layout
        .vessels
        .iter()
        .filter(|vessel| placed.contains(&vessel.id))
        .filter_map(|vessel| vessel.backend.as_ref().map(|backend| backend.0.clone()))
        .filter(|backend| live.contains(backend))
        .collect())
}

fn reopen(native: &Native, voyage: &VoyageId) -> Result<()> {
    let entry = Target::reopen_voyage(voyage);
    let offered = native.observe("the workspace with the sidebar drawn", |seen| {
        Some(seen.shows(&entry))
    })?;
    if !offered {
        native.click(&Target::RECENT_VOYAGES)?;
    }
    native.click(&entry)?;
    native.settle(
        "the reopened Voyage with a live program in each terminal",
        |seen| Some(is_open(seen.document, voyage)),
        |open| *open,
    )?;
    native
        .watch(|native| Ok((!programs(native, voyage)?.is_empty()).then_some(())))?
        .context("The reopened Voyage has no live program")
}

fn open_dialog(native: &Native, voyage: &VoyageId) -> Result<()> {
    let row = Target::name(&RenameTarget::Voyage { id: voyage.clone() });
    native.settle(
        "the Voyage row at rest",
        |seen| row.find(seen.frame).map(|drawn| drawn.bounds),
        |_| true,
    )?;
    native.context_click(&row)?;
    native.click(&Target::close_voyage(voyage))?;
    native.observe("the close dialog ready to confirm", |seen| {
        seen.shows(&Target::voyage_close_confirm(voyage))
            .then_some(())
    })
}

fn at_rest(
    native: &Native,
    voyage: &VoyageId,
    message: &Target,
) -> Result<(bool, bool, Option<String>)> {
    native.settle(
        "the Voyage and its close dialog at rest",
        |seen| {
            Some((
                is_open(seen.document, voyage),
                seen.shows(&Target::voyage_close_confirm(voyage)),
                seen.label(message).map(str::to_owned),
            ))
        },
        |_| true,
    )
}

fn saved(native: &Native) -> Result<Layout> {
    let (_, layout) = native
        .document()?
        .context("The layout document is missing")?;
    Ok(layout)
}

fn fleet_name(layout: &Layout, id: &FleetId) -> Option<String> {
    fleets(layout)
        .find(|fleet| &fleet.id == id)
        .map(|fleet| fleet.name.clone())
}

fn is_open(layout: &Layout, id: &VoyageId) -> bool {
    voyages(layout).any(|voyage| &voyage.id == id && !voyage.closed)
}

fn rename(name: &str) -> Result<Script> {
    Script::parse(
        &json!({"calls":[
            {"tool":WORKSPACE,"arguments":{"expectedVersion":"0","action":{"operation":"inspect"}}},
            {"atMs":100,"tool":WORKSPACE,"arguments":{"expectedVersion":{"$result":[0,"/version"]},"action":{"operation":"rename","target":{"kind":"fleet","id":{"$result":[0,"/layout/selectedFleet"]}},"name":name}}}
        ]})
        .to_string(),
    )
}
