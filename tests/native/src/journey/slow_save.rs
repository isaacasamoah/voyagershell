use super::chat::{ask, conclude, inspect_script, returned_text, saved_name};
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, fleets};
use crate::provider::{Provider, Script};
use anyhow::{Context as _, Result, ensure};
use serde_json::{Value, json};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use voyager_contract::FleetId;

cases! {
    InspectDuringSave => "inspect-answered-during-held-save",
    EffectAfterSave => "effect-answered-after-held-save",
}

pub const CONTROL: Case = Case::InspectDuringSave;
pub const HOLD: &str = "doc.set=1500";

const METHOD: &str = "doc.set";
const LEAST_HOLD_MS: u64 = 1000;
const LEDGER: &str = "core-relay.jsonl";
const WORKSPACE: &str = "voyager_workspace";
const RENAMED: &str = "Renamed During Save";
const INSPECT: &str = "Inspect during a slow save";
const INSPECT_ITEM: &str = "stand-in-slow-inspect";
const EFFECT: &str = "Rename during a slow save";
const EFFECT_ITEM: &str = "stand-in-slow-effect";

struct Held {
    line: Value,
    released: u64,
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let hold = native
        .system
        .held(METHOD)
        .map_or(0, |hold| hold.as_millis() as u64);
    ensure!(
        hold >= LEAST_HOLD_MS,
        "The slow-save journey needs Core's {METHOD} replies held for at least {LEAST_HOLD_MS} ms, and this run holds them for {hold} ms"
    );
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
    let inspected = cases.make(native, Case::InspectDuringSave, |native| {
        let turn = ask(native, &provider, INSPECT)?;
        let before = fleet_count(native)?;
        let born = create_fleet(native)?;
        let asked = now();
        let played = provider.play(&turn, &inspect_script())?;
        let answered = now();
        conclude(native, &provider, &turn, INSPECT_ITEM)?;
        rest(native, &born)?;
        let held = held_save(native, asked)?;
        let text = played.first().and_then(|call| returned_text(&call.result));
        let verdict = Verdict::new()
            .expect(
                "one scripted inspect reached the app's workspace tool and returned Applied",
                played.len() == 1 && text.as_ref().is_some_and(|text| text["status"] == "applied"),
            )
            .expect(
                "the inspect was answered before Core's held reply to the Fleet's save was released",
                answered < held.released,
            )
            .expect(
                "the inspect's round trip is under a quarter of the hold",
                played
                    .first()
                    .is_some_and(|call| call.round_trip_ms * 4 < hold),
            )
            .expect(
                "Core holds exactly one new Fleet",
                fleet_count(native)? == before + 1,
            )
            .observed("played", &played)?
            .observed("heldSave", &held.line)?
            .observed("askedAtMs", asked)?
            .observed("answeredAtMs", answered)?;
        Ok((verdict, Some(())))
    })?;
    if inspected.is_none() {
        return Ok(());
    }
    cases.check(native, Case::EffectAfterSave, |native| {
        let turn = ask(native, &provider, EFFECT)?;
        let first = provider.play(&turn, &inspect_script())?;
        let seen = first
            .first()
            .and_then(|call| returned_text(&call.result))
            .context("The inspect before the rename returned no layout")?;
        let fleet = FleetId(
            seen["layout"]["selectedFleet"]
                .as_str()
                .context("The inspected layout has no selected Fleet")?
                .into(),
        );
        let named = saved_name(native, &fleet)?;
        let before = fleet_count(native)?;
        let born = create_fleet(native)?;
        let asked = now();
        let played = provider.play(&turn, &rename_script(&seen["version"], &fleet)?)?;
        let answered = now();
        conclude(native, &provider, &turn, EFFECT_ITEM)?;
        rest(native, &born)?;
        let held = held_save(native, asked)?;
        let text = played.first().and_then(|call| returned_text(&call.result));
        Verdict::new()
            .expect(
                "the scripted rename was answered only after Core's held reply to the Fleet's save was released",
                played.len() == 1 && answered >= held.released,
            )
            .expect(
                "the rename was refused because the layout changed, and Core reported no conflict",
                text.as_ref().is_some_and(|text| {
                    text["status"] == "refused"
                        && text["message"]
                            .as_str()
                            .is_some_and(|message| message.contains("Layout changed"))
                }),
            )
            .expect(
                "the Fleet kept its saved name and Core holds exactly one new Fleet",
                saved_name(native, &fleet)? == named && fleet_count(native)? == before + 1,
            )
            .observed("played", &played)?
            .observed("heldSave", &held.line)?
            .observed("askedAtMs", asked)?
            .observed("answeredAtMs", answered)
    })
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn fleet_count(native: &Native) -> Result<usize> {
    let (_, layout) = native
        .document()?
        .context("The layout document is missing")?;
    Ok(fleets(&layout).count())
}

fn create_fleet(native: &Native) -> Result<FleetId> {
    let (_, before) = native
        .document()?
        .context("The layout document is missing")?;
    let voyage = before
        .voyages
        .first()
        .context("The layout has no Voyage")?
        .id
        .clone();
    let known: Vec<FleetId> = fleets(&before).map(|fleet| fleet.id.clone()).collect();
    native.click(&Target::create_fleet(&voyage))?;
    native.click(&Target::worker("terminal"))?;
    native
        .watch(|native| {
            Ok(native.document()?.and_then(|(_, layout)| {
                fleets(&layout)
                    .find(|fleet| !known.contains(&fleet.id))
                    .map(|fleet| fleet.id.clone())
            }))
        })?
        .context("Core never held the new Fleet")
}

fn rest(native: &Native, fleet: &FleetId) -> Result<()> {
    native.settle(
        "the new Fleet's terminal started and drawn",
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
            Some(
                vessel.backend.is_some()
                    && vessel.start_pending.is_none()
                    && seen.shows(&Target::terminal(&placement.id)),
            )
        },
        |rested| *rested,
    )?;
    Ok(())
}

fn held_save(native: &Native, asked: u64) -> Result<Held> {
    let ledger = fs::read_to_string(native.system.evidence.join(LEDGER))
        .context("The Core relay ledger is missing")?;
    let line = ledger
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter(|line| {
            line["method"] == METHOD
                && line["requestedAtMs"]
                    .as_u64()
                    .is_some_and(|requested| requested <= asked)
        })
        .max_by_key(|line| line["requestedAtMs"].as_u64())
        .context("The Core relay held no save before the scripted call")?;
    let released = line["releasedAtMs"]
        .as_u64()
        .context("The held save has no release time")?;
    ensure!(
        asked < released,
        "The verifier sent its scripted call after the held save was released, so the two never overlapped"
    );
    Ok(Held { line, released })
}

fn rename_script(version: &Value, fleet: &FleetId) -> Result<Script> {
    Script::parse(
        &json!({"calls":[{"tool":WORKSPACE,"arguments":{"expectedVersion":version,"action":{"operation":"rename","target":{"kind":"fleet","id":fleet.0},"name":RENAMED}}}]})
            .to_string(),
    )
}
