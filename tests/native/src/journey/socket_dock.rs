use super::adopt_by_label::{address, bound_to};
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Seen, Terminal, bound_terminal, fleets, now_millis};
use crate::sandbox::COMMAND;
use crate::x11::Key;
use anyhow::{Context as _, Result};
use serde_json::{Value, json};
use voyager_contract::inspection::Role;
use voyager_contract::{Action, Context, FleetId, PlacementId, RenameTarget};

cases! {
    SocketDockTakesKeyboard => "socket-dock-takes-keyboard",
    RereadKeepsClickedPane => "reread-keeps-clicked-pane",
}

pub const CONTROL: Case = Case::SocketDockTakesKeyboard;

const RENAMED: &str = "Renamed by Voyager";

struct Docked {
    first: Terminal,
    docked: Terminal,
    placed: PlacementId,
    fleet: FleetId,
    voyager: String,
}

fn focused(seen: &Seen) -> Option<PlacementId> {
    seen.frame
        .elements
        .iter()
        .find(|element| element.role == Role::FocusedVessel)
        .map(|element| PlacementId(element.key.clone()))
}

fn from_voyager(native: &Native, voyager: &str, id: &str, action: Action) -> Result<Value> {
    let caller = format!("HC_TERMINAL_ID={voyager}");
    let status: Value = serde_json::from_str(&native.system.execute(
        "env",
        &[&caller, COMMAND, "status"],
        None,
    )?)?;
    let version = status["status"]["version"]
        .as_str()
        .context("voyager status names no version")?;
    let request = json!({
        "requestId": id,
        "expectedVersion": version,
        "action": action,
    })
    .to_string();
    Ok(serde_json::from_str(&native.system.execute(
        "env",
        &[&caller, COMMAND, "do", "workspace", &request],
        None,
    )?)?)
}

fn typed_into(native: &Native, prefix: &str) -> Result<String> {
    let marker = format!("{prefix}-{:x}", now_millis() % 0xf_ffff);
    native.type_text(&format!("echo {marker}"))?;
    native.press(Key::Return)?;
    Ok(marker)
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let setup = cases.make(native, Case::SocketDockTakesKeyboard, |native| {
        let first = Terminal::first(native)?;
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let fleet = layout
            .selected_fleet
            .clone()
            .context("The layout has no selected Fleet")?;
        first.focus(native)?;
        first.echoed(
            native,
            &format!(
                "hc run --bg --name docked --label voyager.place=fleet:{} bash",
                fleet.0
            ),
        )?;
        native.press(Key::Return)?;
        let terminal = address(native, "docked")?;
        let placed = native.observe("the second shell drawn as a Vessel in the Fleet", |seen| {
            let found = bound_to(seen.document, &terminal)?;
            seen.shows(&Target::terminal(&found.id)).then_some(found.id)
        })?;
        let docked = Terminal::bind(native, &placed)?;
        docked.shows(native, "$")?;
        let before = native.observe("the first Vessel focused with the chat closed", |seen| {
            (focused(seen).as_ref() == Some(first.placement()))
                .then(|| seen.shows(&Target::CHAT_COMPOSER))
        })?;
        let voyager = bound_terminal(native).context("voyager.json names no terminal")?;
        let target = Context::Vessel { id: placed.clone() };
        let reply = from_voyager(
            native,
            &voyager,
            "socket-dock-1",
            Action::Dock {
                context: target.clone(),
            },
        )?;
        native.settle(
            "the dock on the second shell",
            |seen| Some(seen.document.context.clone()),
            |context| context == &target,
        )?;
        let followed = native
            .settle(
                "the canvas focus on the docked Vessel",
                |seen| Some(focused(seen)),
                |focus| focus.as_ref() == Some(&placed),
            )
            .ok()
            .flatten();
        let marker = typed_into(native, "socket-dock")?;
        let arrived = docked.printed(native, &format!("\n{marker}"))?;
        let docked_screen = docked.screen(native)?;
        let first_screen = first.screen(native)?;
        native.keep_window("socket-dock-takes-keyboard")?;
        let verdict = Verdict::new()
            .expect("the chat was closed when Voyager docked", !before)
            .expect(
                "voyager do workspace applied the dock from Voyager's terminal",
                reply["reply"]["status"] == "applied",
            )
            .expect(
                "the canvas focus moved to the docked Vessel",
                followed.as_ref() == Some(&placed),
            )
            .expect(
                "the typed line ran in the docked Vessel's shell",
                arrived && docked_screen.matches(&marker).count() >= 2,
            )
            .expect(
                "the first Vessel's shell received none of the typed keys",
                !first_screen.contains(&marker),
            )
            .observed("marker", &marker)?
            .observed("followed", &followed)?
            .observed("docked", &docked_screen)?
            .observed("first", &first_screen)?;
        Ok((
            verdict,
            Some(Docked {
                first,
                docked,
                placed,
                fleet,
                voyager,
            }),
        ))
    })?;
    let Some(Docked {
        first,
        docked,
        placed,
        fleet,
        voyager,
    }) = setup
    else {
        return Ok(());
    };

    cases.check(native, Case::RereadKeepsClickedPane, |native| {
        first.focus(native)?;
        native.observe("the first Vessel focused by the click", |seen| {
            (focused(seen).as_ref() == Some(first.placement())).then_some(())
        })?;
        let reply = from_voyager(
            native,
            &voyager,
            "socket-rename-1",
            Action::Rename {
                target: RenameTarget::Fleet { id: fleet.clone() },
                name: RENAMED.into(),
            },
        )?;
        native.observe("the renamed Fleet drawn after the re-read", |seen| {
            (fleets(seen.document).any(|item| item.id == fleet && item.name == RENAMED)
                && seen.shows(&Target::name(&RenameTarget::Fleet { id: fleet.clone() })))
            .then_some(())
        })?;
        let held = native.observe("the canvas focus after the re-read", |seen| {
            Some(focused(seen))
        })?;
        let marker = typed_into(native, "socket-reread")?;
        let arrived = first.printed(native, &format!("\n{marker}"))?;
        let first_screen = first.screen(native)?;
        let docked_screen = docked.screen(native)?;
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        native.keep_window("reread-keeps-clicked-pane")?;
        Verdict::new()
            .expect(
                "voyager do workspace applied the rename",
                reply["reply"]["status"] == "applied",
            )
            .expect(
                "the dock stayed on the docked Vessel",
                layout.context == Context::Vessel { id: placed.clone() },
            )
            .expect(
                "the canvas focus stayed on the clicked Vessel after the re-read",
                held.as_ref() == Some(first.placement()),
            )
            .expect(
                "the typed line ran in the clicked Vessel's shell",
                arrived && first_screen.matches(&marker).count() >= 2,
            )
            .expect(
                "the docked Vessel's shell received none of the typed keys",
                !docked_screen.contains(&marker),
            )
            .observed("marker", &marker)?
            .observed("held", &held)?
            .observed("first", &first_screen)
    })
}
