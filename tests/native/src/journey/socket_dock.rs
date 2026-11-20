use super::adopt_by_label::{address, bound_to};
use super::{Cases, Verdict, cases};
use crate::audio::voice::bound_terminal;
use crate::inspection::Target;
use crate::native::{Native, Terminal, now_millis};
use crate::sandbox::COMMAND;
use crate::x11::Key;
use anyhow::{Context as _, Result};
use serde_json::{Value, json};
use voyager_contract::inspection::Role;
use voyager_contract::{Context, PlacementId};

cases! {
    SocketDockTakesKeyboard => "socket-dock-takes-keyboard",
}

pub const CONTROL: Case = Case::SocketDockTakesKeyboard;

fn focused(seen: &crate::native::Seen) -> Option<PlacementId> {
    seen.frame
        .elements
        .iter()
        .find(|element| element.role == Role::FocusedVessel)
        .map(|element| PlacementId(element.key.clone()))
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    cases.check(native, Case::SocketDockTakesKeyboard, |native| {
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
        let voyager = bound_terminal(native)?;
        let (version, _) = native.document()?.context("Missing saved layout")?;
        let request = json!({
            "requestId": "socket-dock-1",
            "expectedVersion": version.to_string(),
            "action": {"operation": "dock", "context": {"kind": "vessel", "id": placed.0}}
        })
        .to_string();
        let caller = format!("HC_TERMINAL_ID={voyager}");
        let reply: Value = serde_json::from_str(&native.system.execute(
            "env",
            &[&caller, COMMAND, "do", "workspace", &request],
            None,
        )?)?;
        let target = Context::Vessel { id: placed.clone() };
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
        let marker = format!("socket-dock-{:x}", now_millis() % 0xf_ffff);
        native.type_text(&format!("echo {marker}"))?;
        native.press(Key::Return)?;
        let arrived = docked.printed(native, &format!("\n{marker}"))?;
        let docked_screen = docked.screen(native)?;
        let first_screen = first.screen(native)?;
        native.keep_window("socket-dock-takes-keyboard")?;
        Verdict::new()
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
            .observed("first", &first_screen)
    })
}
