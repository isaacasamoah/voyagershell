use super::layout::avatar_on_dock;
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Seen, Terminal, fleets, voyages};
use crate::system::until;
use crate::x11::Key;
use anyhow::{Context as _, Result};
use serde::Serialize;
use serde_json::json;
use voyager_contract::launch::Launch;
use voyager_contract::{
    Context, FleetId, Layout, Placement, PlacementId, RenameTarget, Split, VoyageId,
};

cases! {
    AgentInFleet => "agent-in-fleet",
    DockAgent => "dock-agent",
    AgentInPortal => "agent-in-portal",
    UnplacedStayHidden => "unplaced-stay-hidden",
    CommandCreatesFleet => "command-creates-fleet",
    CommandFleetHoldsOnlyItsAgent => "command-fleet-holds-only-its-agent",
    CommandRemovesPlacement => "command-removes-placement",
}

pub const CONTROL: Case = Case::AgentInFleet;

const CREW_FLEET: &str = "Crew";

#[derive(Clone, PartialEq, Serialize)]
struct Made {
    placements: Vec<PlacementId>,
    selected: bool,
    drawn: bool,
}

fn made_fleet(seen: &Seen, id: &FleetId, agent: Option<&PlacementId>) -> Option<Made> {
    let fleet = fleets(seen.document).find(|item| &item.id == id)?;
    Some(Made {
        placements: fleet
            .placements
            .iter()
            .map(|item| item.id.clone())
            .collect(),
        selected: seen.document.selected_fleet.as_ref() == Some(id),
        drawn: agent.is_some_and(|agent| seen.shows(&Target::terminal(agent))),
    })
}

#[derive(Clone, PartialEq, Serialize)]
struct Adopted {
    placement: PlacementId,
    name: String,
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

fn bound_to(layout: &Layout, address: &str) -> Option<Placement> {
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
        .cloned()
}

fn adopted(
    seen: &Seen,
    address: &str,
    members: impl Fn(&Layout) -> Vec<Placement>,
) -> Option<Adopted> {
    let bound = bound_to(seen.document, address)?;
    let placement = bound.id;
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
        name: bound.name,
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

fn on_canvas(root: Option<&Split>, placement: &PlacementId) -> bool {
    match root {
        None => false,
        Some(Split::Leaf { placement: leaf }) => leaf == placement,
        Some(Split::Branch { first, second, .. }) => {
            on_canvas(Some(first), placement) || on_canvas(Some(second), placement)
        }
    }
}

fn typed(terminal: &Terminal, native: &Native, text: &str) -> Result<()> {
    terminal.focus(native)?;
    terminal.echoed(native, text)?;
    native.press(Key::Return)
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let first = Terminal::first(native)?;
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    let fleet = fleet_of(&layout, first.placement()).context("The first Vessel has no Fleet")?;
    let voyage = voyage_of(&layout, &fleet).context("The first Fleet has no Voyage")?;

    let crew = cases.make(native, Case::AgentInFleet, |native| {
        typed(
            &first,
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
                "the adopted Vessel is named after its Core terminal name",
                placed.name == "crew",
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
        typed(
            &first,
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
        typed(&first, native, "hc run --bg --name plain bash")?;
        typed(
            &first,
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
        typed(&first, native, "voyager status")?;
        let named = first.printed(native, &format!("\"vessel\": \"{vessel}\""))?;
        typed(
            &first,
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
    })?;

    cases.check(native, Case::CommandFleetHoldsOnlyItsAgent, |native| {
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let made = voyages(&layout)
            .filter(|item| item.id == voyage)
            .flat_map(|item| &item.fleets)
            .find(|item| item.name == CREW_FLEET)
            .map(|item| item.id.clone())
            .context("The Fleet the command created is not in the saved layout")?;
        let waiting = native
            .observe("the command's Fleet open before its agent starts", |seen| {
                made_fleet(seen, &made, None).filter(|found| found.selected)
            })?;
        native.keep_window("command-fleet-before-agent")?;
        native.click(&Target::name(&RenameTarget::Fleet { id: fleet.clone() }))?;
        native.observe("the calling Vessel's Fleet selected again", |seen| {
            (seen.document.selected_fleet.as_ref() == Some(&fleet)
                && seen.shows(&Target::terminal(first.placement())))
            .then_some(())
        })?;
        typed(
            &first,
            native,
            &format!(
                "hc run --bg --name lead --label voyager.place=fleet:{} claude 'Lead the crew'",
                made.0
            ),
        )?;
        let terminal = address(native, "lead")?;
        let placement = native.observe(
            "the labelled agent adopted into the command's Fleet",
            |seen| {
                bound_to(seen.document, &terminal)
                    .map(|placement| placement.id)
                    .filter(|placement| fleet_of(seen.document, placement).as_ref() == Some(&made))
            },
        )?;
        native.click(&Target::name(&RenameTarget::Fleet { id: made.clone() }))?;
        let shown = native.observe(
            "the command's Fleet selected and drawn with its agent",
            |seen| {
                made_fleet(seen, &made, Some(&placement))
                    .filter(|found| found.selected && found.drawn)
            },
        )?;
        native.keep_window("command-fleet-holds-only-its-agent")?;
        Verdict::new()
            .expect(
                "before its agent starts, the Fleet the command created holds no Vessel",
                waiting.placements.is_empty(),
            )
            .expect(
                "the agent's labelled terminal is the only Vessel in the Fleet the command created",
                shown.placements == [placement],
            )
            .observed("fleet", &made)?
            .observed("terminal", &terminal)?
            .observed("before", &waiting)?
            .observed("after", &shown)
    })?;

    cases.check(native, Case::CommandRemovesPlacement, |native| {
        native.click(&Target::name(&RenameTarget::Fleet { id: fleet.clone() }))?;
        native.observe("the agent drawn before the command", |seen| {
            (seen.document.selected_fleet.as_ref() == Some(&fleet)
                && seen.shows(&Target::terminal(&crew)))
            .then_some(true)
        })?;
        let terminal = address(native, "crew")?;
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let content = layout
            .vessels
            .iter()
            .find(|content| {
                content
                    .backend
                    .as_ref()
                    .is_some_and(|backend| backend.0 == terminal)
            })
            .map(|content| content.id.clone())
            .context("The agent has no Vessel before the command")?;
        typed(
            &first,
            native,
            &format!(
                "v=$(voyager status | sed -n 's/.*\"version\": \"\\([0-9]*\\)\".*/\\1/p'); voyager do workspace '{{\"requestId\":\"crew-remove\",\"expectedVersion\":\"'$v'\",\"action\":{{\"operation\":\"remove-placement\",\"id\":\"{}\"}}}}' >/dev/null; echo remove-exit=$?",
                crew.0
            ),
        )?;
        let applied = first.printed(native, "remove-exit=0")?;
        native.keep_window("command-removes-placement")?;
        let removed = native.observe("the removed placement gone from the canvas", |seen| {
            let placed = fleets(seen.document)
                .filter(|item| item.id == fleet)
                .any(|item| on_canvas(item.root.as_ref(), &crew));
            (!placed && !seen.shows(&Target::terminal(&crew))).then_some(true)
        })?;
        let (_, after) = native.document()?.context("Missing saved layout")?;
        let kept = after.vessels.iter().any(|vessel| {
            vessel.id == content
                && vessel
                    .backend
                    .as_ref()
                    .is_some_and(|backend| backend.0 == terminal)
        });
        let listed = native.system.watch("terminal.list", json!({"all":true}))?;
        let state = listed["terminals"]
            .as_array()
            .and_then(|terminals| {
                terminals
                    .iter()
                    .find(|item| item["address"].as_str() == Some(terminal.as_str()))
            })
            .and_then(|item| item["state"].as_str())
            .map(str::to_owned);
        Verdict::new()
            .expect(
                "voyager do workspace removed the placement from the canvas",
                removed,
            )
            .expect("the command exited 0, the applied code", applied)
            .expect(
                "the Vessel's content stays bound to its terminal",
                kept,
            )
            .expect(
                "Core still lists the agent's terminal as live",
                state.as_deref() == Some("live"),
            )
            .observed("terminal", &terminal)?
            .observed("state", &state)
    })
}
