use super::chat::{ask, conclude, returned_text};
use super::layout::agents_beside;
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Stopwatch, Terminal, now_millis};
use crate::provider::{Played, Provider, Script};
use crate::system::until;
use anyhow::{Context as _, Result, ensure};
use serde_json::{Value, json};
use std::fs;

cases! {
    InspectDuringList => "inspect-answered-during-held-list",
    ExitClosesDuringList => "exit-closes-during-held-list",
}

pub const CONTROL: Case = Case::ExitClosesDuringList;
pub const HOLD: &str = "terminal.list=2000";

const METHOD: &str = "terminal.list";
const LEAST_HOLD_MS: u64 = 1000;
const LEDGER: &str = "core-relay.jsonl";
const WORKSPACE: &str = "voyager_workspace";
const INSPECTS: u64 = 16;
const SPACING_MS: u64 = 500;
const QUESTION: &str = "Inspect during slow lists";
const ITEM: &str = "stand-in-slow-list";

fn inspects() -> Result<Script> {
    let calls: Vec<Value> = (0..INSPECTS)
        .map(|index| {
            json!({"atMs":index * SPACING_MS,"tool":WORKSPACE,"arguments":{"expectedVersion":"0","action":{"operation":"inspect"}}})
        })
        .collect();
    Script::parse(&json!({"calls":calls}).to_string())
}

fn sent(began: u64, played: &[Played]) -> Vec<u64> {
    let mut free = began;
    (0..)
        .zip(played)
        .map(|(index, call)| {
            let at = free.max(began + index * SPACING_MS);
            free = at + call.round_trip_ms;
            at
        })
        .collect()
}

fn held_lists(native: &Native) -> Result<Vec<(u64, u64)>> {
    let ledger = fs::read_to_string(native.system.evidence.join(LEDGER))
        .context("The Core relay ledger is missing")?;
    Ok(ledger
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter(|line| line["method"] == METHOD)
        .filter_map(|line| {
            Some((
                line["requestedAtMs"].as_u64()?,
                line["releasedAtMs"].as_u64()?,
            ))
        })
        .collect())
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let hold = native
        .system
        .held(METHOD)
        .map_or(0, |hold| hold.as_millis() as u64);
    ensure!(
        hold >= LEAST_HOLD_MS,
        "The slow-list journey needs Core's {METHOD} replies held for at least {LEAST_HOLD_MS} ms, and this run holds them for {hold} ms"
    );
    let terminal = Terminal::first(native)?;
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
    cases.check(native, Case::InspectDuringList, |native| {
        agents_beside(native, terminal.placement())?;
        let turn = ask(native, &provider, QUESTION)?;
        let began = now_millis();
        let played = provider.play(&turn, &inspects()?)?;
        conclude(native, &provider, &turn, ITEM)?;
        native.keep_window("list-off-owner")?;
        let lists = held_lists(native)?;
        let during = sent(began, &played)
            .into_iter()
            .filter(|at| {
                lists
                    .iter()
                    .any(|(requested, released)| requested <= at && at < released)
            })
            .count();
        ensure!(
            during > 0,
            "The verifier sent no scripted inspect while Core's reply to a {METHOD} was held, so the app was not tested"
        );
        let trips: Vec<u64> = played.iter().map(|call| call.round_trip_ms).collect();
        let slowest = trips.iter().copied().max().unwrap_or(0);
        Verdict::new()
            .expect(
                "every scripted inspect reached the app's workspace tool and returned Applied",
                played.len() as u64 == INSPECTS
                    && played.iter().all(|call| {
                        returned_text(&call.result).is_some_and(|text| text["status"] == "applied")
                    }),
            )
            .expect(
                "every inspect's round trip is under a quarter of the hold on Core's terminal list replies",
                slowest * 4 < hold,
            )
            .observed("round trips ms", &trips)?
            .observed("slowest round trip ms", slowest)?
            .observed("inspects sent while a list reply was held", during)
    })?;
    cases.check(native, Case::ExitClosesDuringList, |native| {
        let (before, _) = native.document()?.context("Missing saved layout")?;
        terminal.line(native, "exit")?;
        let exited = Stopwatch::start();
        until("a newer saved layout after the exit", || {
            Ok(native
                .document()?
                .is_some_and(|(version, _)| version > before)
                .then_some(()))
        })?;
        let saved = exited.lap();
        native.observe("the exited shell's Vessel closed", |seen| {
            (!seen.shows(&terminal.target()) && seen.version > before).then_some(())
        })?;
        let closed = exited.lap();
        native.keep_window("exit-event")?;
        Verdict::new()
            .expect(
                "the exited shell's Vessel was saved closed in under half of the hold on Core's terminal list replies",
                saved.under_share_of(hold, 2),
            )
            .observed("exit to saved ms", saved)?
            .observed("exit to closed ms", closed)
    })
}
