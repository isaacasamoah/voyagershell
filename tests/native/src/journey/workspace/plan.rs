use super::super::chat::{ask, conclude, inspect_script, returned_text};
use super::super::{Cases, Verdict};
use super::Case;
use crate::inspection::Target;
use crate::native::{Native, fleets, vessels, voyages};
use crate::provider::{Provider, Script};
use anyhow::{Context as _, Result};
use serde_json::{Value, json};
use voyager_contract::{FleetId, Layout, PlacementId, RenameTarget, VoyageId};

const WORKSPACE: &str = "voyager_workspace";
const PLAN: &str = "Rename a Vessel while I work";
const PLAN_ITEM: &str = "stand-in-plan";
const STALE: &str = "Rename it again from the old inspect";
const STALE_ITEM: &str = "stand-in-stale";
const PLANNED: &str = "Planned Vessel";
const STALE_NAME: &str = "Stale Vessel";
const CHANGED: &str = "Layout changed";

struct Plan {
    version: Value,
    voyage: VoyageId,
    fleet: FleetId,
    vessel: PlacementId,
}

pub(super) fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
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
    let planned = cases.make(native, Case::AgentPlanSurvivesClick, |native| {
        let turn = ask(native, &provider, PLAN)?;
        let plan = inspect(native, &provider, &turn)?;
        native.keep_window("plan-inspected")?;
        let known: Vec<FleetId> = fleets(&document(native)?.1).map(|fleet| fleet.id.clone()).collect();
        native.click(&Target::create_fleet(&plan.voyage))?;
        native.click(&Target::worker("terminal"))?;
        let created = native.watch(|native| {
            Ok(native.document()?.and_then(|(version, layout)| {
                fleets(&layout)
                    .any(|fleet| !known.contains(&fleet.id))
                    .then_some(version)
            }))
        })?;
        native.keep_window("plan-fleet-created")?;
        native.click(&Target::name(&RenameTarget::Fleet {
            id: plan.fleet.clone(),
        }))?;
        native.settle(
            "the planned Fleet selected again",
            |seen| Some(seen.document.selected_fleet.as_ref() == Some(&plan.fleet)),
            |selected| *selected,
        )?;
        native.keep_window("plan-fleet-clicked")?;
        let played = provider.play(&turn, &rename_script(&plan, PLANNED)?)?;
        conclude(native, &provider, &turn, PLAN_ITEM)?;
        let text = played.first().and_then(|call| returned_text(&call.result));
        let subject = RenameTarget::Vessel {
            id: plan.vessel.clone(),
        };
        let drawn = native.settle(
            "the planned Vessel under its new name",
            |seen| {
                let saved = vessels(seen.document)
                    .find(|vessel| vessel.id == plan.vessel)
                    .map(|vessel| vessel.name.clone());
                let label = seen.label(&Target::name(&subject)).map(str::to_owned);
                Some((saved, label))
            },
            |(saved, label)| {
                saved.as_deref() == Some(PLANNED)
                    && label
                        .as_deref()
                        .is_some_and(|label| label.rsplit(" · ").next() == Some(PLANNED))
            },
        )?;
        native.keep_window("agent-plan-survives-click")?;
        let inspected = plan.version.as_str().and_then(|version| version.parse::<u64>().ok());
        let verdict = Verdict::new()
            .expect(
                "the human's click created a Fleet after the inspect and moved the layout's version",
                created
                    .zip(inspected)
                    .is_some_and(|(created, inspected)| created > inspected),
            )
            .expect(
                "the scripted rename that carried the inspected version returned Applied",
                text.as_ref().is_some_and(|text| text["status"] == "applied"),
            )
            .expect(
                "Core holds the Vessel under the planned name and the window draws it",
                drawn.0.as_deref() == Some(PLANNED)
                    && drawn
                        .1
                        .as_deref()
                        .is_some_and(|label| label.rsplit(" · ").next() == Some(PLANNED)),
            )
            .observed("inspectedVersion", &plan.version)?
            .observed("createdAtVersion", created)?
            .observed("played", &played)?
            .observed("drawn", &drawn)?;
        Ok((verdict, Some(plan)))
    })?;
    let Some(plan) = planned else {
        return Ok(());
    };
    cases.check(native, Case::StaleAgentEditRefused, |native| {
        let turn = ask(native, &provider, STALE)?;
        let played = provider.play(&turn, &rename_script(&plan, STALE_NAME)?)?;
        conclude(native, &provider, &turn, STALE_ITEM)?;
        native.keep_window("stale-agent-edit-refused")?;
        let text = played.first().and_then(|call| returned_text(&call.result));
        let returned = text.as_ref().and_then(|text| {
            serde_json::from_value::<Layout>(text["layout"].clone())
                .ok()
                .and_then(|layout| {
                    vessels(&layout)
                        .find(|vessel| vessel.id == plan.vessel)
                        .map(|vessel| vessel.name.clone())
                })
        });
        let saved = vessels(&document(native)?.1)
            .find(|vessel| vessel.id == plan.vessel)
            .map(|vessel| vessel.name.clone());
        Verdict::new()
            .expect(
                "a second rename of the same Vessel from the old inspect was refused because the layout changed",
                text.as_ref().is_some_and(|text| {
                    text["status"] == "refused"
                        && text["message"]
                            .as_str()
                            .is_some_and(|message| message.contains(CHANGED))
                }),
            )
            .expect(
                "the refusal returned the Vessel's current name",
                returned.as_deref() == Some(PLANNED),
            )
            .expect(
                "Core still holds the Vessel under the planned name",
                saved.as_deref() == Some(PLANNED),
            )
            .observed("played", &played)?
            .observed("saved", &saved)
    })
}

fn inspect(native: &Native, provider: &Provider, turn: &crate::provider::Turn) -> Result<Plan> {
    let played = provider.play(turn, &inspect_script())?;
    let seen = played
        .first()
        .and_then(|call| returned_text(&call.result))
        .context("The scripted inspect returned no layout")?;
    let inspected: Layout = serde_json::from_value(seen["layout"].clone())
        .context("The scripted inspect returned no contract Layout")?;
    let fleet = inspected
        .voyages
        .iter()
        .flat_map(|voyage| &voyage.fleets)
        .find(|fleet| !fleet.closed && !fleet.placements.is_empty())
        .context("The inspected layout has no open Fleet with a Vessel")?;
    let (_, layout) = document(native)?;
    let voyage = voyages(&layout)
        .find(|voyage| voyage.fleets.iter().any(|item| item.id == fleet.id))
        .context("Core holds no Voyage for the inspected Fleet")?;
    Ok(Plan {
        version: seen["version"].clone(),
        voyage: voyage.id.clone(),
        fleet: fleet.id.clone(),
        vessel: fleet.placements[0].id.clone(),
    })
}

fn document(native: &Native) -> Result<(u64, Layout)> {
    native.document()?.context("The layout document is missing")
}

fn rename_script(plan: &Plan, name: &str) -> Result<Script> {
    Script::parse(
        &json!({"calls":[{"tool":WORKSPACE,"arguments":{"expectedVersion":plan.version,"action":{"operation":"rename","target":{"kind":"vessel","id":plan.vessel.0},"name":name}}}]})
            .to_string(),
    )
}
