use super::chat::{ask, conclude, returned_text};
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, fleets, voyages};
use crate::provider::{Provider, Script};
use crate::x11::Key;
use anyhow::{Context as _, Result, ensure};
use serde_json::{Value, json};
use std::fs;
use std::time::Duration;
use voyager_contract::inspection::Role;
use voyager_contract::{FleetId, Layout, RenameTarget, VoyageId};

cases! {
    RefusedReason => "refused-shows-reason",
    ToolRefused => "tool-refusal-carries-reason",
    UncertainNotReplayed => "uncertain-not-replayed",
    CloseRefused => "close-refused-says-why",
    CloseUncertain => "close-uncertain-not-retried",
}

pub const CONTROL: Case = Case::RefusedReason;
pub const HOLD: &str = "terminal.kill=21000";

const STOP: &str = "terminal.kill";
const LEDGER: &str = "core-relay.jsonl";

const CORE_DEADLINE: Duration = Duration::from_secs(20);
const REFUSED: &str = "Refused.";
const UNCERTAIN: &str = "Uncertain.";
const REASON: &str = "A name must contain 1 to 128 bytes";
const UNCONFIRMED: &str = "Core result unconfirmed";
const CHANGED: &str = "Layout changed";
const ASK_BEHIND: &str = "Rename the Fleet while I look at the close dialog";
const BEHIND: &str = "Renamed Behind";
const BEHIND_ITEM: &str = "stand-in-behind";
const UNCONFIRMED_CLOSE: &str = "Shutdown is unconfirmed";
const DECLINED: &str = "Name change not confirmed";
const RENAMED: &str = "Held Fleet";
const TOO_LONG: usize = 129;
const WORKSPACE: &str = "voyager_workspace";
const ASK: &str = "Rename the Fleet to nothing";
const ITEM: &str = "stand-in-refused";

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let hold = native.system.held(STOP).unwrap_or_default();
    ensure!(
        hold > CORE_DEADLINE,
        "The outcomes journey needs Core's {STOP} replies held past Core's {} s deadline, and this run holds them for {} ms",
        CORE_DEADLINE.as_secs(),
        hold.as_millis()
    );
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

    cases.check(native, Case::UncertainNotReplayed, |native| {
        let subject = RenameTarget::Fleet { id: fleet.clone() };
        let (name, editor) = (Target::name(&subject), Target::editor(&subject));
        native.double_click(&name)?;
        native.observe("the Fleet's name editor", |seen| {
            (seen.shows(&editor) && !seen.shows(&name)).then_some(())
        })?;
        native.type_text(RENAMED)?;
        let (version, _) = native.settle(
            "the editor holding the new name over a saved layout at rest",
            |seen| {
                seen.label(&editor)
                    .map(|draft| (seen.version, draft == RENAMED))
            },
            |(_, typed)| *typed,
        )?;
        let (status, again) = native.with_core_paused(|native| {
            native.press(Key::Return)?;
            let status = native.drawn_label(
                &Target::STATUS,
                CORE_DEADLINE,
                "an uncertain result in the status line while Core is paused",
                |label| label.starts_with(UNCERTAIN),
            )?;
            native.keep_window("uncertain")?;
            native.press(Key::Return)?;
            let again = native.screen_status(
                "the canvas declining to send the same name again",
                |label| !label.starts_with(UNCERTAIN),
            )?;
            Ok((status, again))
        })?;
        let landed = native.watch(|native| {
            Ok(native.document()?.and_then(|(version, layout)| {
                (fleet_name(&layout, &fleet).as_deref() == Some(RENAMED)).then_some(version)
            }))
        })?;
        native.press(Key::Escape)?;
        native.click(&Target::REFRESH)?;
        let drawn = native.settle(
            "the Fleet drawn under its saved name after Refresh",
            |seen| {
                let labels: Vec<&str> = seen
                    .frame
                    .elements
                    .iter()
                    .filter(|element| element.role == Role::FleetName && element.key == fleet.0)
                    .filter_map(|element| element.label.as_deref())
                    .collect();
                Some((seen.version, labels == [RENAMED]))
            },
            |(_, drawn)| *drawn,
        );
        native.keep_window("uncertain-after-refresh")?;
        Verdict::new()
            .expect(
                "the status line showed the owner's uncertain answer while Core was paused",
                status.contains(UNCONFIRMED),
            )
            .expect(
                "a second Enter on the same name was declined and not sent",
                again.contains(DECLINED),
            )
            .expect(
                "Core saved the name once after it resumed",
                landed == Some(version + 1),
            )
            .expect(
                "after Refresh the canvas draws the Fleet once under the saved name and Core's document has not changed again",
                drawn.as_ref().is_ok_and(|drawn| *drawn == (version + 1, true)),
            )
            .observed("status", &status)?
            .observed("secondEnter", &again)?
            .observed("versions", json!({"before":version,"landed":landed,"afterRefresh":drawn.ok().map(|drawn| drawn.0)}))
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

    cases.check(native, Case::CloseUncertain, |native| {
        open_dialog(native, &voyage)?;
        native.click(&Target::voyage_close_confirm(&voyage))?;
        let status = native.drawn_label(
            &message,
            CORE_DEADLINE,
            "an uncertain result in the close dialog while the stop's reply is held",
            |label| label.starts_with(UNCERTAIN),
        )?;
        native.keep_window("close-uncertain")?;
        let stops = native.watch(|native| {
            let held = held_stops(native)?;
            Ok((!held.is_empty()).then_some(held))
        })?;
        let (open, offered, kept) = at_rest(native, &voyage, &message)?;
        Verdict::new()
            .expect(
                "the close dialog says Uncertain and that the shutdown is unconfirmed",
                status.contains(UNCONFIRMED_CLOSE),
            )
            .expect(
                "after the held reply is released the Voyage is still open, so nothing closed it again",
                open,
            )
            .expect(
                "the dialog keeps the uncertain result and offers no second confirmation",
                !offered && kept.as_deref().is_some_and(|kept| kept.starts_with(UNCERTAIN)),
            )
            .observed("status", &status)?
            .observed("heldStops", &stops)?
            .observed("afterRelease", json!({"open":open,"confirmOffered":offered,"message":kept}))
    })
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

fn held_stops(native: &Native) -> Result<Vec<Value>> {
    let ledger = fs::read_to_string(native.system.evidence.join(LEDGER)).unwrap_or_default();
    Ok(ledger
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter(|line| line["method"] == STOP && line["event"] == "released")
        .collect())
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
