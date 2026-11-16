use super::layout::avatar_on_dock;
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Seen, Terminal, fleets, voyages};
use crate::system::until;
use anyhow::{Context as _, Result};
use serde::Serialize;
use serde_json::json;
use voyager_contract::launch::Launch;
use voyager_contract::{Context, FleetId, Layout, Placement, PlacementId, RenameTarget, VoyageId};

cases! {
    AgentInFleet => "agent-in-fleet",
    DockAgent => "dock-agent",
    AgentInPortal => "agent-in-portal",
    UnplacedStayHidden => "unplaced-stay-hidden",
    CommandCreatesFleet => "command-creates-fleet",
}

pub const CONTROL: Case = Case::AgentInFleet;

const CREW_FLEET: &str = "Crew";

#[derive(Clone, PartialEq, Serialize)]
struct Adopted {
    placement: PlacementId,
    launch: Option<Launch>,
    drawn: bool,
}

fn address(native: &Native, name: &str) -> Result<String> {
    until(&format!("Core naming the terminal {name}"), || {
        let listed = native.system.watch("terminal.list", json!({"all":true}))?;
        Ok(listed["terminals"].as_array().and_then(|terminals| {
            terminals
                .iter()
                .find(|terminal| terminal["name"] == name)
                .and_then(|terminal| terminal["address"].as_str())
                .map(str::to_owned)
        }))
    })
}

fn bound_to(layout: &Layout, address: &str) -> Option<PlacementId> {
    let content = layout.vessels.iter().find(|content| {
        content
            .backend
            .as_ref()
            .is_some_and(|backend| backend.0 == address)
    })?;
    fleets(layout)
        .flat_map(|fleet| &fleet.placements)
        .chain(voyages(layout).flat_map(|voyage| &voyage.portals))
        .find(|placement| placement.vessel == content.id)
        .map(|placement| placement.id.clone())
}

fn adopted(
    seen: &Seen,
    address: &str,
    members: impl Fn(&Layout) -> Vec<Placement>,
) -> Option<Adopted> {
    let placement = bound_to(seen.document, address)?;
    let content = seen.document.vessels.iter().find(|content| {
        content
            .backend
            .as_ref()
            .is_some_and(|backend| backend.0 == address)
    })?;
    Some(Adopted {
        drawn: seen.shows(&Target::terminal(&placement))
            && members(seen.document)
                .iter()
                .any(|member| member.id == placement),
        launch: content.launch.clone(),
        placement,
    })
}

fn claude() -> Option<Launch> {
    Some(Launch::Program {
        argv: vec!["claude".into()],
    })
}

fn fleet_of(layout: &Layout, placement: &PlacementId) -> Option<FleetId> {
    fleets(layout)
        .find(|fleet| {
            fleet
                .placements
                .iter()
                .any(|member| &member.id == placement)
        })
        .map(|fleet| fleet.id.clone())
}

fn voyage_of(layout: &Layout, fleet: &FleetId) -> Option<VoyageId> {
    voyages(layout)
        .find(|voyage| voyage.fleets.iter().any(|item| &item.id == fleet))
        .map(|voyage| voyage.id.clone())
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let first = Terminal::first(native)?;
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    let fleet = fleet_of(&layout, first.placement()).context("The first Vessel has no Fleet")?;
    let voyage = voyage_of(&layout, &fleet).context("The first Fleet has no Voyage")?;

    let crew = cases.make(native, Case::AgentInFleet, |native| {
        first.line(
            native,
            &format!(
                "hc run --bg --name crew --label voyager.place=fleet:{} claude 'Review x.rs'",
                fleet.0
            ),
        )?;
        let terminal = address(native, "crew")?;
        let placed = native.observe("the labelled agent drawn as a Vessel in its Fleet", |seen| {
            adopted(seen, &terminal, |layout| {
                fleets(layout)
                    .filter(|item| item.id == fleet)
                    .flat_map(|item| item.placements.clone())
                    .collect()
            })
            .filter(|found| found.drawn)
        })?;
        let agent = Terminal::bind(native, &placed.placement)?;
        let heard = agent.printed(native, "Stand-in claude took the task: Review x.rs")?;
        native.keep_window("agent-in-fleet")?;
        let verdict = Verdict::new()
            .expect(
                "the terminal started with voyager.place=fleet:<id> is drawn as a Vessel in that Fleet",
                placed.drawn,
            )
            .expect(
                "the adopted Vessel records the claude agent launch",
                placed.launch == claude(),
            )
            .expect(
                "the adopted Vessel shows the agent's own terminal",
                heard,
            )
            .observed("terminal", &terminal)?
            .observed("adopted", &placed)?;
        Ok((verdict, Some(placed.placement)))
    })?;
    let Some(crew) = crew else {
        return Ok(());
    };

    cases.check(native, Case::DockAgent, |native| {
        let docked = Context::Vessel { id: crew.clone() };
        native.drag(
            &Target::AVATAR,
            &Target::name(&RenameTarget::Vessel { id: crew.clone() }),
        )?;
        let landed = native.settle(
            "the avatar docked on the adopted agent Vessel",
            |seen| (seen.document.context == docked).then(|| avatar_on_dock(seen)),
            |on| *on,
        )?;
        native.keep_window("dock-agent")?;
        Verdict::new()
            .expect("the avatar docked on the adopted agent Vessel", landed)
            .observed("dock", &docked)
    })?;

    cases.check(native, Case::AgentInPortal, |native| {
        first.line(
            native,
            &format!(
                "hc run --bg --name lookout --label voyager.place=portal:{} claude 'Watch CI'",
                voyage.0
            ),
        )?;
        let terminal = address(native, "lookout")?;
        let placed = native.observe("the labelled agent drawn as a Portal", |seen| {
            adopted(seen, &terminal, |layout| {
                voyages(layout)
                    .filter(|item| item.id == voyage)
                    .flat_map(|item| item.portals.clone())
                    .collect()
            })
            .filter(|found| found.drawn)
        })?;
        native.keep_window("agent-in-portal")?;
        Verdict::new()
            .expect(
                "the terminal started with voyager.place=portal:<voyage id> is drawn as a Portal of that Voyage",
                placed.drawn,
            )
            .expect(
                "the adopted Portal records the claude agent launch",
                placed.launch == claude(),
            )
            .observed("terminal", &terminal)?
            .observed("adopted", &placed)
    })?;

    cases.check(native, Case::UnplacedStayHidden, |native| {
        first.line(native, "hc run --bg --name plain bash")?;
        first.line(
            native,
            "hc run --bg --name typo --label voyager.place=tab:1 bash",
        )?;
        let plain = address(native, "plain")?;
        let typo = address(native, "typo")?;
        let notice = native
            .screen_status("the misplaced label named in the status line", |label| {
                label.contains(&format!("Terminal {typo} was not placed"))
            })?;
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let hidden = bound_to(&layout, &plain).is_none() && bound_to(&layout, &typo).is_none();
        native.keep_window("unplaced-stay-hidden")?;
        Verdict::new()
            .expect(
                "neither the unlabelled nor the misplaced terminal became a Vessel",
                hidden,
            )
            .expect(
                "the status line names the misplaced terminal",
                notice.contains(&typo),
            )
            .observed("unlabelled", &plain)?
            .observed("misplaced", &typo)?
            .observed("notice", &notice)
    })?;

    cases.check(native, Case::CommandCreatesFleet, |native| {
        let (version, layout) = native.document()?.context("Missing saved layout")?;
        let vessel = fleets(&layout)
            .flat_map(|item| &item.placements)
            .find(|placement| &placement.id == first.placement())
            .map(|placement| placement.vessel.0.clone())
            .context("The first Vessel is not in the saved layout")?;
        first.line(native, "voyager status")?;
        let named = first.printed(native, &format!("\"vessel\": \"{vessel}\""))?;
        first.line(
            native,
            &format!(
                "voyager do workspace '{{\"requestId\":\"crew-fleet\",\"expectedVersion\":\"{version}\",\"action\":{{\"operation\":\"create-fleet\",\"voyage\":\"{}\",\"name\":\"{CREW_FLEET}\"}}}}' >/dev/null; echo voyager-exit=$?",
                voyage.0
            ),
        )?;
        let created = native.observe("the Fleet the command created, drawn as a tab", |seen| {
            voyages(seen.document)
                .filter(|item| item.id == voyage)
                .flat_map(|item| &item.fleets)
                .find(|item| item.name == CREW_FLEET)
                .map(|item| seen.shows(&Target::name(&RenameTarget::Fleet { id: item.id.clone() })))
                .filter(|drawn| *drawn)
        })?;
        let applied = first.printed(native, "voyager-exit=0")?;
        native.keep_window("command-creates-fleet")?;
        Verdict::new()
            .expect("voyager status names the calling Vessel", named)
            .expect(
                "voyager do workspace created the Fleet, drawn as a tab",
                created,
            )
            .expect("the command exited 0, the applied code", applied)
            .observed("vessel", &vessel)?
            .observed("expectedVersion", version)
    })
}
