use super::chat::{ask, conclude, inspect_script, returned_text};
use super::manifest_vessel::TYPE;
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Terminal, fleets, voyages};
use crate::provider::{Played, Provider, Script, Turn};
use crate::sandbox::SECOND_PROJECT;
use crate::system::{Identity, until};
use anyhow::{Context as _, Result};
use serde_json::{Value, json};
use std::fs;
use voyager_contract::canvas::{Canvas, Node, Size};
use voyager_contract::{
    Action, ContentDestination, Context, CoreTerminalId, FleetId, Layout, PlacementId,
    PlacementInsertion, PlacementOwner, Side, VesselId,
};

cases! {
    Created => "voyager-creates-a-voyage-and-vessel",
    Folder => "new-shell-starts-in-its-folder",
    Applied => "applied-equals-proposal",
    Refused => "invalid-stack-refused-unchanged",
    Inspected => "update-carries-inspected-version",
    Kept => "terminal-and-content-kept",
    Quit => "conversation-stops-on-quit",
    Reopened => "selection-after-relaunch",
}

pub const CONTROL: Case = Case::Refused;

const WORKSPACE: &str = "voyager_workspace";
const VOYAGE: &str = "Stack trial";
const MARKER: &str = "STACK-$((6*7))";
const PRINTED: &str = "STACK-42";
const CHANGED: &str = "Layout changed";
const OUT_OF_RANGE: &str = "Canvas stack selection must name an existing child";
const ALTERNATE: u16 = 280;
const RESIZED: u16 = 300;

struct Trial {
    fleet: FleetId,
    placement: PlacementId,
    terminal: Terminal,
    address: CoreTerminalId,
}

struct Setup {
    terminal: Terminal,
    address: CoreTerminalId,
    content: VesselId,
    bytes: Vec<u8>,
    core: Identity,
}

struct Update {
    inspected: Value,
    played: Vec<Played>,
    returned: Option<Value>,
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let provider = open_chat(native)?;
    let setup = cases.make(native, Case::Created, |native| create(native, &provider))?;
    let Some(setup) = setup else {
        return Ok(());
    };
    cases.check(native, Case::Folder, |native| {
        let foreground = native
            .system
            .rpc("terminal.get", json!({"terminal":setup.address}))?["foreground"]["cwd"]
            .clone();
        Verdict::new()
            .expect(
                "Core reports the new Voyage's shell running in the folder the Voyage was made for",
                foreground.as_str() == Some(SECOND_PROJECT),
            )
            .observed("foreground", &foreground)
    })?;
    let stack = stacked(&document(native)?.1.canvas, ALTERNATE);
    let applied = cases.make(native, Case::Applied, |native| {
        let proposed = selecting(&stack, 1);
        let update = update(native, &provider, "stack-selected", &proposed)?;
        let saved = document(native)?.1.canvas;
        native.keep_window("stack-selected")?;
        Ok((
            Verdict::new()
                .expect(
                    "the update to a stack showing its second view returned Applied",
                    status(&update) == Some("applied"),
                )
                .expect(
                    "Core holds the canvas exactly as proposed, with the second view selected",
                    saved == proposed,
                )
                .observed("proposed", &proposed)?
                .observed("saved", &saved)?
                .observed("played", &update.played)?,
            Some(proposed),
        ))
    })?;
    let Some(applied) = applied else {
        return Ok(());
    };
    cases.check(native, Case::Refused, |native| {
        let (version, prior) = document(native)?;
        let update = update(native, &provider, "stack-refused", &selecting(&stack, 2))?;
        let (after, current) = document(native)?;
        native.keep_window("stack-refused")?;
        let message = update
            .returned
            .as_ref()
            .and_then(|text| text["message"].as_str())
            .unwrap_or_default()
            .to_owned();
        Verdict::new()
            .expect(
                "the update selecting a third view of a two-view stack was refused because that view does not exist",
                status(&update) == Some("refused") && message.contains(OUT_OF_RANGE),
            )
            .expect(
                "the canvas, Vessels, Voyages, context and selected Voyage and Fleet are unchanged",
                unchanged(&prior, &current),
            )
            .expect("the layout's version did not move", after == version)
            .observed("message", &message)?
            .observed("version", json!({"before":version,"after":after}))?
            .observed("played", &update.played)
    })?;
    let reopened = cases.make(native, Case::Inspected, |native| {
        let proposed = selecting(&stacked(&document(native)?.1.canvas, RESIZED), 1);
        let fresh = update(native, &provider, "stack-resized", &proposed)?;
        let (version, prior) = document(native)?;
        let stale = replay(native, &provider, "stack-stale", &fresh.inspected, &prior.canvas)?;
        let (after, current) = document(native)?;
        native.keep_window("stack-stale")?;
        let message = stale
            .returned
            .as_ref()
            .and_then(|text| text["message"].as_str())
            .unwrap_or_default()
            .to_owned();
        let carried = fresh
            .played
            .last()
            .map(|call| call.arguments["expectedVersion"].clone());
        let verdict = Verdict::new()
            .expect(
                "the update carried the version its inspect saw and returned Applied",
                carried.as_ref() == Some(&fresh.inspected) && status(&fresh) == Some("applied"),
            )
            .expect(
                "Core holds that update's canvas",
                prior.canvas == proposed,
            )
            .expect(
                "the same update sent again with the version from before it was refused because the layout changed",
                status(&stale) == Some("refused") && message.contains(CHANGED),
            )
            .expect(
                "the refused update changed nothing and the layout's version did not move",
                after == version && unchanged(&prior, &current),
            )
            .observed("inspected", &fresh.inspected)?
            .observed("carried", &carried)?
            .observed("message", &message)?
            .observed("version", json!({"before":version,"after":after}))?
            .observed("played", json!({"fresh":fresh.played,"stale":stale.played}))?;
        Ok((verdict, Some(proposed)))
    })?;
    let selected = reopened.unwrap_or(applied);
    cases.check(native, Case::Kept, |native| {
        let (_, layout) = document(native)?;
        let named = layout
            .vessels
            .iter()
            .any(|vessel| vessel.backend.as_ref() == Some(&setup.address));
        let shell = setup.terminal.program(native)?;
        let printed = setup.terminal.printed(native, PRINTED)?;
        let bytes = fs::read(content_file(native, &setup.content)).ok();
        let core = native.core()?.clone();
        Verdict::new()
            .expect(
                "the terminal Vessel still names the same Core terminal",
                named,
            )
            .expect(
                "that terminal runs the same shell, with the same pid and start time",
                shell.same,
            )
            .expect(
                "Core still holds the output printed before the updates",
                printed,
            )
            .expect(
                "the content Vessel's saved data has the same bytes",
                bytes.as_deref() == Some(setup.bytes.as_slice()),
            )
            .expect("the same Core serves the app", core == setup.core)
            .observed("shell", &shell)?
            .observed("terminal", &setup.address)
    })?;
    let quit = cases.make(native, Case::Quit, |native| {
        let before = document(native)?;
        let conversation = provider.relay_pid().map(Identity::read).transpose()?;
        native.close()?;
        let ended = conversation.as_ref().map(|identity| {
            until("the private conversation process ended", || {
                Ok(identity.verify().is_err().then_some(()))
            })
            .is_ok()
        });
        let verdict = Verdict::new()
            .expect(
                "Voyager's private conversation process ran before Quit",
                conversation.is_some(),
            )
            .expect(
                "that process ended after Quit, while Core and its programs carry on",
                ended == Some(true),
            )
            .observed("conversation", &conversation)?;
        Ok((verdict, Some(before)))
    })?;
    let Some((version, before)) = quit else {
        return Ok(());
    };
    cases.check(native, Case::Reopened, |native| {
        native.launch()?;
        let reopened = native.settle(
            "the reopened layout",
            |seen| Some(seen.document.canvas.clone()),
            |canvas| *canvas == before.canvas,
        );
        let (after, layout) = document(native)?;
        native.keep_window("stack-reopened")?;
        Verdict::new()
            .expect(
                "after Quit and relaunch, Core holds the same canvas with the stack's second view selected",
                layout.canvas == before.canvas && layout.canvas == selected,
            )
            .expect("the relaunch drew that canvas", reopened.is_ok())
            .expect("the layout's version is the same", after == version)
            .observed("before", &before.canvas)?
            .observed("after", &layout.canvas)
    })
}

fn open_chat(native: &mut Native) -> Result<Provider> {
    if document(native)?.1.context != Context::Workspace {
        native.drag(&Target::AVATAR, &Target::WORKSPACE_DOCK)?;
        native.settle(
            "the avatar docked home",
            |seen| Some(seen.document.context == Context::Workspace),
            |home| *home,
        )?;
    }
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
    Ok(provider)
}

fn create(native: &mut Native, provider: &Provider) -> Result<(Verdict, Option<Setup>)> {
    let (_, before) = document(native)?;
    let action = Action::CreateVoyage {
        name: VOYAGE.into(),
        cwd: SECOND_PROJECT.into(),
    };
    let (voyage_played, voyage_returned) = act(native, provider, "stack-voyage", &action)?;
    let made = native
        .settle(
            "the new Voyage with its terminal started",
            |seen| {
                let voyage = voyages(seen.document).find(|voyage| {
                    voyage.name == VOYAGE && !before.voyages.iter().any(|old| old.id == voyage.id)
                })?;
                let fleet = voyage.fleets.first()?;
                let placement = fleet.placements.first()?;
                let started = seen
                    .document
                    .vessels
                    .iter()
                    .find(|vessel| vessel.id == placement.vessel)
                    .filter(|vessel| vessel.start_pending.is_none())
                    .and_then(|vessel| vessel.backend.clone());
                Some((
                    fleet.id.clone(),
                    placement.id.clone(),
                    voyage.cwd.clone(),
                    started,
                ))
            },
            |(_, _, _, started)| started.is_some(),
        )
        .ok();
    let saved = made.as_ref().and_then(|(_, _, cwd, _)| cwd.clone());
    let trial = match made {
        Some((fleet, placement, _, Some(address))) => Some(Trial {
            terminal: Terminal::bind(native, &placement)?,
            fleet,
            placement,
            address,
        }),
        _ => None,
    };
    native.keep_window("stack-voyage")?;
    let content = match &trial {
        Some(trial) => Some(create_content(native, provider, trial)?),
        None => None,
    };
    let drawn = content.as_ref().and_then(|(_, _, drawn)| drawn.clone());
    let verdict = Verdict::new()
        .expect(
            "Voyager's create-voyage call through its chat tool returned Applied",
            applied(voyage_returned.as_ref()),
        )
        .expect(
            "Core holds one new Voyage saved in the folder Voyager named, with its terminal started",
            saved.as_deref() == Some(SECOND_PROJECT) && trial.is_some(),
        )
        .expect(
            "Voyager's create-vessel call through its chat tool returned Applied",
            content
                .as_ref()
                .is_some_and(|(_, returned, _)| applied(returned.as_ref())),
        )
        .expect(
            "the new Fleet holds its terminal and the new flag Vessel, and the window draws the flag",
            drawn.as_ref().is_some_and(|(_, placed)| *placed == 2),
        )
        .observed("saved", &saved)?
        .observed("drawn", &drawn)?
        .observed(
            "played",
            json!({"voyage":voyage_played,"vessel":content.as_ref().map(|(played, _, _)| played)}),
        )?;
    let (Some(trial), Some((content, _))) = (trial, drawn) else {
        return Ok((verdict, None));
    };
    let setup = finish(native, trial, content)?;
    Ok((verdict, Some(setup)))
}

type Made = (Vec<Played>, Option<Value>, Option<(VesselId, usize)>);

fn create_content(native: &mut Native, provider: &Provider, trial: &Trial) -> Result<Made> {
    let (_, before) = document(native)?;
    let action = Action::CreateVessel {
        type_id: TYPE.into(),
        destination: ContentDestination::Placement {
            owner: PlacementOwner::Fleet {
                id: trial.fleet.clone(),
            },
            insertion: PlacementInsertion::Beside {
                id: trial.placement.clone(),
                side: Side::Right,
            },
        },
        launch: None,
    };
    let (played, returned) = act(native, provider, "stack-content", &action)?;
    let drawn = native
        .observe("the new flag Vessel drawn in the trial Fleet", |seen| {
            let fleet = fleets(seen.document).find(|fleet| fleet.id == trial.fleet)?;
            let vessel = fleet.placements.iter().find_map(|placement| {
                seen.document.vessels.iter().find(|vessel| {
                    vessel.id == placement.vessel
                        && vessel.type_id == TYPE
                        && !before.vessels.iter().any(|old| old.id == vessel.id)
                })
            })?;
            seen.shows(&Target::manifest_state(&vessel.id))
                .then(|| (vessel.id.clone(), fleet.placements.len()))
        })
        .ok();
    native.keep_window("stack-content")?;
    Ok((played, returned, drawn))
}

fn finish(native: &mut Native, trial: Trial, content: VesselId) -> Result<Setup> {
    native.click(&Target::manifest_action(&content, "flip"))?;
    native.observe("the flag Vessel's state after its action", |seen| {
        seen.label(&Target::manifest_state(&content))
            .filter(|label| label.contains("revision 1"))
            .map(|_| ())
    })?;
    let bytes = fs::read(content_file(native, &content))
        .context("The flag Vessel saved no data after its action")?;
    trial.terminal.line(native, &format!("echo {MARKER}"))?;
    trial.terminal.shows(native, PRINTED)?;
    let core = native.core()?.clone();
    Ok(Setup {
        terminal: trial.terminal,
        address: trial.address,
        content,
        bytes,
        core,
    })
}

fn applied(returned: Option<&Value>) -> bool {
    returned.is_some_and(|text| text["status"] == "applied")
}

fn act(
    native: &Native,
    provider: &Provider,
    item: &str,
    action: &Action,
) -> Result<(Vec<Played>, Option<Value>)> {
    let turn = ask(native, provider, &format!("Set up the trial: {item}"))?;
    let inspected = inspect(provider, &turn)?;
    let played = provider.play(&turn, &script(&inspected, action)?)?;
    conclude(native, provider, &turn, item)?;
    let returned = played.first().and_then(|call| returned_text(&call.result));
    Ok((played, returned))
}

fn inspect(provider: &Provider, turn: &Turn) -> Result<Value> {
    let seen = provider
        .play(turn, &inspect_script())?
        .first()
        .and_then(|call| returned_text(&call.result))
        .context("The scripted inspect returned nothing")?;
    Ok(seen["version"].clone())
}

fn stacked(canvas: &Canvas, pixels: u16) -> Canvas {
    let root = match &canvas.root {
        Node::Stack { children, .. } => children[0].clone(),
        root => root.clone(),
    };
    let mut alternate = root.clone();
    if let Node::Row { children, .. } = &mut alternate
        && let Some(Node::Block { size, .. }) = children.first_mut()
    {
        *size = Size::Fixed { pixels };
    }
    Canvas {
        root: Node::Stack {
            size: Size::Fill,
            selected: 0,
            children: vec![root, alternate],
        },
        ..canvas.clone()
    }
}

fn selecting(canvas: &Canvas, view: u16) -> Canvas {
    let mut chosen = canvas.clone();
    if let Node::Stack { selected, .. } = &mut chosen.root {
        *selected = view;
    }
    chosen
}

fn update(native: &Native, provider: &Provider, item: &str, canvas: &Canvas) -> Result<Update> {
    let turn = ask(native, provider, &format!("Update the canvas: {item}"))?;
    let inspected = inspect(provider, &turn)?;
    let played = provider.play(&turn, &canvas_script(&inspected, canvas)?)?;
    conclude(native, provider, &turn, item)?;
    let returned = played.first().and_then(|call| returned_text(&call.result));
    Ok(Update {
        inspected,
        played,
        returned,
    })
}

fn replay(
    native: &Native,
    provider: &Provider,
    item: &str,
    version: &Value,
    canvas: &Canvas,
) -> Result<Update> {
    let turn = ask(
        native,
        provider,
        &format!("Update the canvas again: {item}"),
    )?;
    let played = provider.play(&turn, &canvas_script(version, canvas)?)?;
    conclude(native, provider, &turn, item)?;
    let returned = played.first().and_then(|call| returned_text(&call.result));
    Ok(Update {
        inspected: version.clone(),
        played,
        returned,
    })
}

fn canvas_script(version: &Value, canvas: &Canvas) -> Result<Script> {
    script(
        version,
        &Action::UpdateCanvas {
            canvas: canvas.clone(),
        },
    )
}

fn script(version: &Value, action: &Action) -> Result<Script> {
    Script::parse(
        &json!({"calls":[{"tool":WORKSPACE,"arguments":{"expectedVersion":version,"action":action}}]})
            .to_string(),
    )
}

fn status(update: &Update) -> Option<&str> {
    update.returned.as_ref()?["status"].as_str()
}

fn unchanged(prior: &Layout, current: &Layout) -> bool {
    current.canvas == prior.canvas
        && current.vessels == prior.vessels
        && current.voyages == prior.voyages
        && current.context == prior.context
        && current.selected_voyage == prior.selected_voyage
        && current.selected_fleet == prior.selected_fleet
}

fn content_file(native: &Native, content: &VesselId) -> std::path::PathBuf {
    native.profile_path(&format!("data/{}.json", content.0))
}

fn document(native: &Native) -> Result<(u64, Layout)> {
    native.document()?.context("The layout document is missing")
}
