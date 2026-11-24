use super::layout::avatar_on_dock;
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{
    Adoption, Label, Native, Seen, Terminal, address, adopt, bound_to, fleets, typed, voyages,
};
use crate::system::{TimedOut, until};
use crate::x11::Key;
use anyhow::{Context as _, Result};
use serde::Serialize;
use serde_json::json;
use voyager_contract::launch::Launch;
use voyager_contract::{
    Context, FleetId, Layout, Placement, PlacementId, RenameTarget, Split, VesselId, VoyageId,
};

type Held = (PlacementId, VesselId, String);

cases! {
    AgentInFleet => "agent-in-fleet",
    DockAgent => "dock-agent",
    AgentInPortal => "agent-in-portal",
    UnplacedStayHidden => "unplaced-stay-hidden",
    CommandCreatesFleet => "command-creates-fleet",
    CommandFleetHoldsOnlyItsAgent => "command-fleet-holds-only-its-agent",
    CommandRemovesPlacement => "command-removes-placement",
    FocusCommandPrintsDock => "focus-command-prints-dock",
    FocusHookNamesDock => "focus-hook-names-dock",
    FocusHookFailsQuietly => "focus-hook-fails-quietly",
    FocusHookTime => "focus-hook-time",
    ReopenRestartsOwnTerminal => "reopen-restarts-own-terminal",
    ReopenClosesEndedAdopted => "reopen-closes-ended-adopted",
    EndedAwayAdoptedRemovedWhenShown => "ended-away-adopted-removed-when-shown",
    AgentExitInOwnShellKeepsShell => "agent-exit-in-own-shell-keeps-shell",
    UserStartedAgentVesselKeepsShell => "user-started-agent-vessel-keeps-shell",
    TypedExitClosesVessel => "typed-exit-closes-vessel",
}

const HOOK_SETTINGS: &str = r#"{"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"/voyager/bin/voyager focus --hook claude"}]}]}}"#;
const HOOK_RUNS: usize = 15;
const DEADLINE_MILLIS: u64 = 200;

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

fn recorded(layout: &Layout, placement: &PlacementId, address: &str) -> bool {
    fleets(layout)
        .flat_map(|fleet| &fleet.placements)
        .chain(voyages(layout).flat_map(|voyage| &voyage.portals))
        .any(|member| &member.id == placement)
        || layout.vessels.iter().any(|content| {
            content
                .backend
                .as_ref()
                .is_some_and(|backend| backend.0 == address)
        })
}

fn live_adopted(layout: &Layout, live: &[String]) -> Vec<Held> {
    layout
        .vessels
        .iter()
        .filter(|content| content.adopted)
        .filter_map(|content| {
            let address = content.backend.as_ref()?.0.clone();
            live.contains(&address).then_some(())?;
            let member = fleets(layout)
                .flat_map(|fleet| &fleet.placements)
                .chain(voyages(layout).flat_map(|voyage| &voyage.portals))
                .find(|member| member.vessel == content.id)?;
            Some((member.id.clone(), content.id.clone(), address))
        })
        .collect()
}

fn kept_through(before: &[Held], after: &[Held]) -> bool {
    !before.is_empty() && before.iter().all(|held| after.contains(held))
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

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let first = Terminal::first(native)?;
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    let fleet = fleet_of(&layout, first.placement()).context("The first Vessel has no Fleet")?;
    let voyage = voyage_of(&layout, &fleet).context("The first Fleet has no Voyage")?;

    let crew = cases.make(native, Case::AgentInFleet, |native| {
        let place = format!("fleet:{}", fleet.0);
        let label = Label::new("crew", &place, "claude 'Review x.rs'");
        let [started] = adopt(native, &first, [label], Adoption::Drawn)?;
        let terminal = started.terminal;
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
        let place = format!("portal:{}", voyage.0);
        let label = Label::new("lookout", &place, "claude 'Watch CI'");
        let [started] = adopt(native, &first, [label], Adoption::Drawn)?;
        let terminal = started.terminal;
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
        let place = format!("fleet:{}", made.0);
        let label = Label::new("lead", &place, "claude 'Lead the crew'");
        let [lead] = adopt(native, &first, [label], Adoption::Saved)?;
        let (terminal, placement) = (lead.terminal, lead.placement.id);
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
    })?;

    cases.check(native, Case::FocusCommandPrintsDock, |native| {
        typed(&first, native, "voyager focus; echo focus-exit=$?")?;
        let kind = first.printed(native, "\"kind\": \"focus\"")?;
        let applied = first.printed(native, "focus-exit=0")?;
        native.keep_window("focus-command-prints-dock")?;
        Ok(Verdict::new()
            .expect("voyager focus returns the generated Focus reply", kind)
            .expect("the command exited 0, the applied code", applied))
    })?;

    cases.check(native, Case::FocusHookNamesDock, |native| {
        let place = format!("fleet:{}", fleet.0);
        let program = format!("claude --settings '{HOOK_SETTINGS}' 'Review y.rs'");
        let label = Label::new("hooked", &place, &program);
        let [started] = adopt(native, &first, [label], Adoption::Drawn)?;
        let terminal = started.terminal;
        let placed = native.observe("the hooked agent drawn as a Vessel in its Fleet", |seen| {
            adopted(seen, &terminal, |layout| {
                fleets(layout)
                    .filter(|item| item.id == fleet)
                    .flat_map(|item| item.placements.clone())
                    .collect()
            })
            .filter(|found| found.drawn)
        })?;
        let agent = Terminal::bind(native, &placed.placement)?;
        agent.printed(native, "Stand-in claude took the task: Review y.rs")?;
        native.drag(
            &Target::AVATAR,
            &Target::name(&RenameTarget::Vessel {
                id: placed.placement.clone(),
            }),
        )?;
        let docked_hooked = Context::Vessel {
            id: placed.placement.clone(),
        };
        native.settle(
            "the avatar docked on the hooked agent",
            |seen| (seen.document.context == docked_hooked).then(|| avatar_on_dock(seen)),
            |on| *on,
        )?;
        typed(&agent, native, "where am I")?;
        let named_hooked = dock_line_first(&agent, native, "where am I", &placed.name)?;
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let shell = fleets(&layout)
            .flat_map(|item| &item.placements)
            .find(|placement| &placement.id == first.placement())
            .map(|placement| placement.name.clone())
            .context("The first Vessel has no name")?;
        native.drag(
            &Target::AVATAR,
            &Target::name(&RenameTarget::Vessel {
                id: first.placement().clone(),
            }),
        )?;
        let docked_first = Context::Vessel {
            id: first.placement().clone(),
        };
        native.settle(
            "the avatar docked on the first Vessel",
            |seen| (seen.document.context == docked_first).then(|| avatar_on_dock(seen)),
            |on| *on,
        )?;
        typed(&agent, native, "and now")?;
        let named_first = dock_line_first(&agent, native, "and now", &shell)?;
        native.keep_window("focus-hook-names-dock")?;
        Verdict::new()
            .expect(
                "the hook gave the agent's prompt the name of the docked Vessel as its first line",
                named_hooked,
            )
            .expect(
                "the hook gave the next prompt the Vessel the avatar was moved to as its first line",
                named_first,
            )
            .observed("hooked", &placed.name)?
            .observed("first", &shell)
    })?;

    cases.check(native, Case::FocusHookFailsQuietly, |native| {
        typed(
            &first,
            native,
            "out=$(HC_TERMINAL_ID=t0000 voyager focus --hook claude 2>&1); echo nosocket-exit=$? bytes=${#out}",
        )?;
        typed(
            &first,
            native,
            "out=$(env -u HC_SESSION voyager focus --hook claude 2>&1); echo unset-exit=$? bytes=${#out}",
        )?;
        typed(
            &first,
            native,
            "out=$(voyager focus --hook nobody 2>&1); echo badhook-exit=$? bytes=${#out}",
        )?;
        let nosocket = first.printed(native, "nosocket-exit=0 bytes=0")?;
        let unset = first.printed(native, "unset-exit=0 bytes=0")?;
        let refused = first.printed(native, "badhook-exit=1")?;
        native.keep_window("focus-hook-fails-quietly")?;
        Ok(Verdict::new()
            .expect(
                "the hook exits 0 and prints nothing when its Vessel has no socket",
                nosocket,
            )
            .expect(
                "the hook exits 0 and prints nothing outside a Core session",
                unset,
            )
            .expect(
                "an unknown agent name is a usage error, not a silent hook",
                refused,
            ))
    })?;

    cases.check(native, Case::FocusHookTime, |native| {
        typed(
            &first,
            native,
            &format!(
                "ts=; bad=0; for i in $(seq {HOOK_RUNS}); do s=$EPOCHREALTIME; voyager focus --hook claude >/dev/null || bad=$((bad+1)); e=$EPOCHREALTIME; ts=\"$ts $(( (${{e/./}} - ${{s/./}}) / 1000 ))\"; done; echo hook-ms=$ts bad=$bad"
            ),
        )?;
        first.printed(native, "hook-ms= ")?;
        let screen = first.screen(native)?;
        let flat = screen.replace('\n', " ");
        let reported = flat
            .rsplit("hook-ms= ")
            .next()
            .and_then(|tail| tail.split_once(" bad="))
            .with_context(|| format!("The hook timing line is missing from the screen:\n{screen}"))?;
        let mut millis: Vec<u64> = reported
            .0
            .split_whitespace()
            .filter_map(|value| value.parse().ok())
            .collect();
        millis.sort_unstable();
        let bad = reported
            .1
            .split_whitespace()
            .next()
            .and_then(|value| value.parse::<u64>().ok());
        let (min, median, max) = (
            millis.first().copied(),
            millis.get(millis.len() / 2).copied(),
            millis.last().copied(),
        );
        native.keep_window("focus-hook-time")?;
        Verdict::new()
            .expect(
                "every hook run exited 0",
                millis.len() == HOOK_RUNS && bad == Some(0),
            )
            .expect(
                "the slowest hook run stayed inside the 200 ms deadline",
                max.is_some_and(|max| max < DEADLINE_MILLIS),
            )
            .observed("milliseconds", &millis)?
            .observed("min", min)?
            .observed("median", median)?
            .observed("max", max)
    })?;

    let reopened = cases.make(native, Case::ReopenRestartsOwnTerminal, |native| {
        native.click(&Target::name(&RenameTarget::Fleet { id: fleet.clone() }))?;
        let place = format!("fleet:{}", fleet.0);
        let label = Label::new("finisher", &place, "claude 'Finish early'");
        let [started] = adopt(native, &first, [label], Adoption::Saved)?;
        let (finisher, placed) = (started.terminal, started.placement.id);
        let own = native.observe("the Vessel Isaac opened bound to its terminal", |seen| {
            let content = seen
                .document
                .vessels
                .iter()
                .find(|content| {
                    fleets(seen.document)
                        .flat_map(|item| &item.placements)
                        .any(|member| &member.id == first.placement() && member.vessel == content.id)
                })?;
            content.backend.as_ref().map(|backend| backend.0.clone())
        })?;
        let label = Label {
            parent: false,
            ..Label::new("keeper", &place, "bash")
        };
        let [started] = adopt(native, &first, [label], Adoption::Saved)?;
        let (keeper, held) = (started.terminal, started.placement.id);
        let (_, before) = native.document()?.context("Missing saved layout")?;
        let kept: Vec<Held> = live_adopted(&before, &live_addresses(native)?)
            .into_iter()
            .filter(|(_, _, address)| address == &keeper)
            .collect();
        native.close()?;
        for ended in [&finisher, &own] {
            native
                .system
                .rpc("terminal.kill", json!({"terminal":ended}))?;
        }
        let known: Vec<String> = native
            .system
            .watch("terminal.list", json!({"all":true}))?["terminals"]
            .as_array()
            .map(|terminals| {
                terminals
                    .iter()
                    .filter_map(|terminal| terminal["address"].as_str().map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default();
        native.launch()?;
        let restarted = native.observe("the Vessel Isaac opened bound to a new terminal", |seen| {
            let content = seen.document.vessels.iter().find(|content| {
                fleets(seen.document)
                    .flat_map(|item| &item.placements)
                    .any(|member| &member.id == first.placement() && member.vessel == content.id)
            })?;
            let backend = content.backend.as_ref()?.0.clone();
            (backend != own && seen.shows(&Target::terminal(first.placement()))).then_some(backend)
        })?;
        let listed = native.system.watch("terminal.list", json!({"all":true}))?;
        let created: Vec<String> = listed["terminals"]
            .as_array()
            .map(|terminals| {
                terminals
                    .iter()
                    .filter_map(|terminal| terminal["address"].as_str())
                    .filter(|address| !known.iter().any(|old| old == address))
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default();
        let (_, after) = native.document()?.context("Missing saved layout")?;
        let still = live_adopted(&after, &live_addresses(native)?);
        native.keep_window("reopen-restarts-own-terminal")?;
        let verdict = Verdict::new()
            .expect(
                "the terminal Isaac opened and then ended comes back as a fresh shell in its Vessel",
                created.contains(&restarted),
            )
            .expect(
                "every live adopted Vessel keeps its placement, its Vessel and its terminal after the reopen",
                kept_through(&kept, &still),
            )
            .observed("ended", &own)?
            .observed("restarted", &restarted)?
            .observed("kept", &kept)?
            .observed("still", &still)?;
        let shell = Terminal::bind(native, &held)?;
        typed(&shell, native, "exit")?;
        native.observe("the keeper Vessel gone once its program ended", |seen| {
            bound_to(seen.document, &keeper).is_none().then_some(())
        })?;
        Ok((verdict, Some((placed, finisher, created))))
    })?;
    let Some((placed, finisher, created)) = reopened else {
        return Ok(());
    };

    cases.check(native, Case::ReopenClosesEndedAdopted, |native| {
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let gone = fleets(&layout)
            .filter(|item| item.id == fleet)
            .all(|item| !on_canvas(item.root.as_ref(), &placed));
        let drawn = native.observe("the Fleet drawn after the reopen", |seen| {
            Some(seen.shows(&Target::terminal(&placed)))
        })?;
        native.keep_window("reopen-closes-ended-adopted")?;
        Verdict::new()
            .expect(
                "the adopted agent whose program ended is gone from its Fleet after the reopen",
                gone && !drawn,
            )
            .expect(
                "the layout keeps no placement or Vessel for the program that ended",
                !recorded(&layout, &placed, &finisher),
            )
            .expect(
                "the reopen started exactly one new terminal, the shell of the terminal Isaac opened",
                created.len() == 1,
            )
            .observed("finisher", &finisher)?
            .observed("placement", &placed)?
            .observed("created", &created)
    })?;

    let shell_placement = first.placement().clone();
    cases.check(native, Case::EndedAwayAdoptedRemovedWhenShown, |native| {
        let first = Terminal::bind(native, &shell_placement)?;
        native.click(&Target::name(&RenameTarget::Fleet { id: fleet.clone() }))?;
        native.observe("the first Fleet selected", |seen| {
            (seen.document.selected_fleet.as_ref() == Some(&fleet)).then_some(())
        })?;
        let place = format!("fleet:{}", fleet.0);
        let label = Label::new("wanderer", &place, "bash -c 'sleep 6'");
        let [started] = adopt(native, &first, [label], Adoption::Saved)?;
        let (wanderer, placement) = (started.terminal, started.placement.id);
        until("Core reporting the program finished", || {
            let reported = native
                .system
                .watch("terminal.get", json!({"terminal":wanderer}))?;
            Ok((reported["state"] == "finished").then_some(()))
        })?;
        let known = terminal_addresses(native)?;
        let removed = native.observe("the ended program gone from the first Fleet", |seen| {
            let placed = fleets(seen.document)
                .filter(|item| item.id == fleet)
                .any(|item| on_canvas(item.root.as_ref(), &placement));
            (!placed && !seen.shows(&Target::terminal(&placement))).then_some(true)
        })?;
        let started: Vec<String> = terminal_addresses(native)?
            .into_iter()
            .filter(|address| !known.contains(address))
            .collect();
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        native.keep_window("ended-away-adopted-removed-when-shown")?;
        Verdict::new()
            .expect("the program that ended is gone from its Fleet", removed)
            .expect(
                "the layout keeps no placement or Vessel for the program that ended",
                !recorded(&layout, &placement, &wanderer),
            )
            .expect("its ending started no terminal in Core", started.is_empty())
            .observed("wanderer", &wanderer)?
            .observed("started", &started)
    })?;

    cases.check(native, Case::AgentExitInOwnShellKeepsShell, |native| {
        let own = Terminal::bind(native, &shell_placement)?;
        typed(&own, native, "claude 'Run inside the shell'")?;
        own.printed(
            native,
            "Stand-in claude took the task: Run inside the shell",
        )?;
        native.press(Key::Char('d').ctrl())?;
        typed(&own, native, "echo shell-after-agent")?;
        let prompt = own.printed(native, "shell-after-agent")?;
        let (_, after) = native.document()?.context("Missing saved layout")?;
        let kept = fleets(&after)
            .filter(|item| item.id == fleet)
            .any(|item| on_canvas(item.root.as_ref(), &shell_placement));
        let program = own.program(native)?;
        native.keep_window("agent-exit-in-own-shell-keeps-shell")?;
        Verdict::new()
            .expect("the Vessel stays after the agent ends", kept)
            .expect(
                "the same terminal keeps running its shell",
                program.state.as_deref() == Some("live") && program.same,
            )
            .expect("the shell takes input after the agent ended", prompt)
            .observed("program", &program)
    })?;

    cases.check(native, Case::UserStartedAgentVesselKeepsShell, |native| {
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let before = terminal_addresses(native)?;
        let known: Vec<_> = layout.vessels.iter().map(|content| content.id.clone()).collect();
        let own = Terminal::bind(native, &shell_placement)?;
        native.edit_profile_file(
            "launches.json",
            br#"{"default":"claude","entries":[{"id":"claude","name":"Claude","launch":{"kind":"program","argv":["claude","Own task"]}},{"id":"terminal","name":"Terminal","launch":{"kind":"terminal"}}]}"#,
        )?;
        own.focus(native)?;
        native.press(Key::Char('o').ctrl().shift())?;
        native.click(&Target::worker("claude"))?;
        let agent_placement = native.observe("the user-started agent Vessel drawn", |seen| {
            let content = seen.document.vessels.iter().find(|content| {
                !known.contains(&content.id)
                    && content.backend.is_some()
                    && content.launch.is_some()
            })?;
            let placement = fleets(seen.document)
                .flat_map(|item| &item.placements)
                .find(|placement| placement.vessel == content.id)?
                .id
                .clone();
            seen.shows(&Target::terminal(&placement)).then_some(placement)
        })?;
        let agent = Terminal::bind(native, &agent_placement)?;
        let started_agent = agent.printed(native, "Stand-in claude took the task: Own task")?;
        let started_before = terminal_addresses(native)?;
        agent.focus(native)?;
        native.press(Key::Char('d').ctrl())?;
        typed(&agent, native, "echo shell-replaced-agent")?;
        let takes_input = agent.printed(native, "shell-replaced-agent")?;
        let (_, after) = native.document()?.context("Missing saved layout")?;
        let kept = fleets(&after)
            .filter(|item| item.id == fleet)
            .any(|item| on_canvas(item.root.as_ref(), &agent_placement));
        let program = agent.program(native)?;
        let started: Vec<String> = terminal_addresses(native)?
            .into_iter()
            .filter(|address| !started_before.contains(address))
            .collect();
        native.keep_window("user-started-agent-vessel-keeps-shell")?;
        Verdict::new()
            .expect("the Vessel the user started runs the agent", started_agent)
            .expect("the Vessel stays where the user started it", kept)
            .expect("its terminal keeps running, as a shell", program.state.as_deref() == Some("live"))
            .expect("the shell in its place takes input", takes_input)
            .expect("no new terminal started in Core", started.is_empty())
            .observed("program", &program)?
            .observed("before", &before)
    })?;

    cases.check(native, Case::TypedExitClosesVessel, |native| {
        let own = Terminal::bind(native, &shell_placement)?;
        let (_, before_layout) = native.document()?.context("Missing saved layout")?;
        let typed_address = before_layout
            .vessels
            .iter()
            .find(|content| {
                fleets(&before_layout)
                    .flat_map(|item| &item.placements)
                    .any(|member| member.id == shell_placement && member.vessel == content.id)
            })
            .and_then(|content| content.backend.as_ref())
            .map(|backend| backend.0.clone())
            .context("The shell Vessel has no terminal")?;
        let before = terminal_addresses(native)?;
        own.focus(native)?;
        native.press(Key::Char('d').ctrl())?;
        own.ended(native)?;
        let removed = native.observe("the exited shell's Vessel gone from the Fleet", |seen| {
            let placed = fleets(seen.document)
                .filter(|item| item.id == fleet)
                .any(|item| on_canvas(item.root.as_ref(), &shell_placement));
            (!placed && !seen.shows(&Target::terminal(&shell_placement))).then_some(true)
        })?;
        let started: Vec<String> = terminal_addresses(native)?
            .into_iter()
            .filter(|address| !before.contains(address))
            .collect();
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        native.keep_window("typed-exit-closes-vessel")?;
        Verdict::new()
            .expect("a typed exit closes the Vessel", removed)
            .expect(
                "the layout keeps no placement or Vessel for the shell that exited",
                !recorded(&layout, &shell_placement, &typed_address),
            )
            .expect("no new terminal started in Core", started.is_empty())
            .observed("started", &started)
    })
}

const HISTORY_LINES: u64 = 4000;

fn dock_line_first(agent: &Terminal, native: &Native, prompt: &str, name: &str) -> Result<bool> {
    let named = until("the dock line first in the stand-in's context", || {
        Ok(
            first_context_line(&agent.history(native, HISTORY_LINES)?, prompt)
                .filter(|line| names_vessel(line, name)),
        )
    });
    match named {
        Ok(_) => Ok(true),
        Err(error) if error.downcast_ref::<TimedOut>().is_some() => Ok(false),
        Err(error) => Err(error),
    }
}

fn squeezed(text: &str) -> String {
    text.chars()
        .filter(|letter| !letter.is_whitespace())
        .collect()
}

fn first_context_line(history: &str, prompt: &str) -> Option<String> {
    let history = squeezed(history);
    let heard = history.rfind(&squeezed(&format!("Stand-in claude heard: {prompt}")))?;
    let given = history[..heard].rfind(&squeezed("Stand-in claude was given:"))?;
    let marker = squeezed("Stand-in line:");
    let block = &history[given..heard];
    let rest = &block[block.find(&marker)? + marker.len()..];
    Some(rest[..rest.find(&marker).unwrap_or(rest.len())].to_owned())
}

fn names_vessel(line: &str, name: &str) -> bool {
    line.ends_with(&squeezed(&format!("> {name}.")))
}

fn live_addresses(native: &Native) -> Result<Vec<String>> {
    let listed = native.system.watch("terminal.list", json!({"all":true}))?;
    Ok(listed["terminals"]
        .as_array()
        .map(|terminals| {
            terminals
                .iter()
                .filter(|terminal| terminal["state"] != "finished")
                .filter_map(|terminal| terminal["address"].as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default())
}

fn terminal_addresses(native: &Native) -> Result<Vec<String>> {
    let listed = native.system.watch("terminal.list", json!({"all":true}))?;
    Ok(listed["terminals"]
        .as_array()
        .map(|terminals| {
            terminals
                .iter()
                .filter_map(|terminal| terminal["address"].as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn held(placement: &str, vessel: &str, address: &str) -> Held {
        (
            PlacementId(placement.into()),
            VesselId(vessel.into()),
            address.into(),
        )
    }

    #[test]
    fn live_adopted_vessels_count_as_kept_only_when_every_id_is_unchanged() {
        let before = [held("p1", "v1", "t1"), held("p2", "v2", "t2")];
        assert!(kept_through(&before, &before));
        assert!(kept_through(
            &before,
            &[before[1].clone(), before[0].clone()]
        ));
        assert!(!kept_through(&before, &[before[0].clone()]));
        assert!(!kept_through(
            &before,
            &[held("p1", "v1", "t1"), held("p2", "v9", "t2")]
        ));
        assert!(!kept_through(
            &before,
            &[held("p1", "v1", "t1"), held("p9", "v2", "t2")]
        ));
        assert!(!kept_through(
            &before,
            &[held("p1", "v1", "t1"), held("p2", "v2", "t9")]
        ));
        assert!(!kept_through(&[], &before));
    }

    const GIVEN: &str = "Stand-in claude was given: VoyagerShell focus at this prompt: The user is docked on\nStand-in line: Voyager > Fleet 1 > hoo\nked.\nStand-in line: This is the app's dock context now.\nStand-in line: Never say an id > other.\nStand-in claude heard: where am I\n";

    #[test]
    fn the_first_context_line_is_read_across_wrapped_rows_and_names_the_dock() {
        let line = first_context_line(GIVEN, "where am I").unwrap();
        assert!(names_vessel(&line, "hooked"));
        assert!(!names_vessel(&line, "hook"));
        assert!(!names_vessel(&line, "other"));
    }

    #[test]
    fn a_dock_name_that_is_not_the_first_line_does_not_count() {
        let late = GIVEN.replace("Voyager > Fleet 1 > hoo\nked.", "Nothing here.");
        let late = late.replace("Never say an id > other.", "Voyager > Fleet 1 > hooked.");
        let line = first_context_line(&late, "where am I").unwrap();
        assert!(!names_vessel(&line, "hooked"));
    }

    #[test]
    fn the_latest_prompt_is_the_one_read() {
        let both = format!(
            "{GIVEN}{}",
            GIVEN
                .replace("hoo\nked", "Terminal 1")
                .replace("where am I", "and now")
        );
        assert!(names_vessel(
            &first_context_line(&both, "and now").unwrap(),
            "Terminal 1"
        ));
        assert!(names_vessel(
            &first_context_line(&both, "where am I").unwrap(),
            "hooked"
        ));
        assert_eq!(first_context_line(&both, "never typed"), None);
    }
}
