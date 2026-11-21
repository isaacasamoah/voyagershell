use super::adopt_by_label::{address, bound_to};
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Seen, Terminal, bound_terminal, fleets, now_millis};
use crate::sandbox::COMMAND;
use crate::x11::Key;
use anyhow::{Context as _, Result};
use serde_json::{Value, json};
use voyager_contract::inspection::Role;
use voyager_contract::{
    Action, ContentDestination, Context, FleetId, Layout, PlacementId, PlacementInsertion,
    PlacementOwner, RenameTarget, Side,
};

cases! {
    SocketDockTakesKeyboard => "socket-dock-takes-keyboard",
    RereadKeepsClickedPane => "reread-keeps-clicked-pane",
    RedockTakesKeyboard => "redock-takes-keyboard",
    VoyagerCreatesAndMaximizes => "voyager-creates-and-maximizes",
}

pub const CONTROL: Case = Case::RedockTakesKeyboard;

const RENAMED: &str = "Renamed by Voyager";

struct Docked {
    first: Terminal,
    docked: Terminal,
    placed: PlacementId,
    fleet: FleetId,
    voyager: String,
    other: String,
}

fn focused(seen: &Seen) -> Option<PlacementId> {
    seen.frame
        .elements
        .iter()
        .find(|element| element.role == Role::FocusedVessel)
        .map(|element| PlacementId(element.key.clone()))
}

fn request_line(native: &Native, caller: &str, id: &str, action: Action) -> Result<String> {
    let status: Value = serde_json::from_str(&native.system.execute(
        "env",
        &[caller, COMMAND, "status"],
        None,
    )?)?;
    let version = status["status"]["version"]
        .as_str()
        .context("voyager status names no version")?;
    Ok(json!({
        "requestId": id,
        "expectedVersion": version,
        "action": action,
    })
    .to_string())
}

fn from_voyager(native: &Native, voyager: &str, id: &str, action: Action) -> Result<Value> {
    let caller = format!("HC_TERMINAL_ID={voyager}");
    let request = request_line(native, &caller, id, action)?;
    Ok(serde_json::from_str(&native.system.execute(
        "env",
        &[&caller, COMMAND, "do", "workspace", &request],
        None,
    )?)?)
}

pub(super) fn from_another_vessel(
    native: &Native,
    other: &str,
    id: &str,
    action: Action,
) -> Result<String> {
    let caller = format!("HC_TERMINAL_ID={other}");
    let request = request_line(native, &caller, id, action)?;
    native.system.execute(
        "env",
        &[
            &caller,
            "sh",
            "-c",
            "\"$0\" do workspace \"$1\" 2>&1; echo exit=$?",
            COMMAND,
            &request,
        ],
        None,
    )
}

pub(super) fn members(layout: &Layout, fleet: &FleetId) -> Vec<PlacementId> {
    fleets(layout)
        .find(|item| &item.id == fleet)
        .map(|item| {
            item.placements
                .iter()
                .map(|panel| panel.id.clone())
                .collect()
        })
        .unwrap_or_default()
}

fn maximized(layout: &Layout, fleet: &FleetId) -> Option<PlacementId> {
    fleets(layout)
        .find(|item| &item.id == fleet)
        .and_then(|item| item.maximized_placement.clone())
}

fn set_maximized(placement: &PlacementId, maximized: bool) -> Action {
    Action::SetPlacementMaximized {
        id: placement.clone(),
        maximized,
    }
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
                other: terminal,
            }),
        ))
    })?;
    let Some(Docked {
        first,
        docked,
        placed,
        fleet,
        voyager,
        other,
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
    })?;

    cases.check(native, Case::RedockTakesKeyboard, |native| {
        let reply = from_voyager(
            native,
            &voyager,
            "socket-dock-2",
            Action::Dock {
                context: Context::Vessel { id: placed.clone() },
            },
        )?;
        let followed = native
            .settle(
                "the canvas focus back on the docked Vessel",
                |seen| Some(focused(seen)),
                |focus| focus.as_ref() == Some(&placed),
            )
            .ok()
            .flatten();
        let marker = typed_into(native, "socket-redock")?;
        let arrived = docked.printed(native, &format!("\n{marker}"))?;
        let docked_screen = docked.screen(native)?;
        let first_screen = first.screen(native)?;
        native.keep_window("redock-takes-keyboard")?;
        Verdict::new()
            .expect(
                "voyager do workspace applied the second dock on the same Vessel",
                reply["reply"]["status"] == "applied",
            )
            .expect(
                "the canvas focus returned to the docked Vessel",
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
    })?;

    cases.check(native, Case::VoyagerCreatesAndMaximizes, |native| {
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let before = members(&layout, &fleet);
        let created = from_voyager(
            native,
            &voyager,
            "socket-create-1",
            Action::CreateVessel {
                type_id: "terminal".into(),
                destination: ContentDestination::Placement {
                    owner: PlacementOwner::Fleet { id: fleet.clone() },
                    insertion: PlacementInsertion::Beside {
                        id: first.placement().clone(),
                        side: Side::Right,
                    },
                },
                launch: None,
            },
        )?;
        let added = native.observe("the new Vessel drawn in the current Fleet", |seen| {
            let fresh = members(seen.document, &fleet)
                .into_iter()
                .find(|id| !before.contains(id))?;
            seen.shows(&Target::terminal(&fresh)).then_some(fresh)
        })?;
        let refused = from_another_vessel(
            native,
            &other,
            "socket-max-refused",
            set_maximized(&added, true),
        )?;
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let after_refusal = maximized(&layout, &fleet);
        let maximizing = from_voyager(
            native,
            &voyager,
            "socket-max-1",
            set_maximized(&added, true),
        )?;
        let alone = native.observe("the new Vessel maximized in the Fleet", |seen| {
            (maximized(seen.document, &fleet).as_ref() == Some(&added))
                .then(|| seen.shows(&Target::terminal(first.placement())))
        })?;
        let restoring = from_voyager(
            native,
            &voyager,
            "socket-max-2",
            set_maximized(&added, false),
        )?;
        let restored = native.observe("the Fleet restored with both Vessels drawn", |seen| {
            (maximized(seen.document, &fleet).is_none()
                && seen.shows(&Target::terminal(first.placement()))
                && seen.shows(&Target::terminal(&added)))
            .then_some(())
        });
        native.keep_window("voyager-creates-and-maximizes")?;
        Verdict::new()
            .expect(
                "voyager do workspace applied the create-vessel from Voyager's terminal",
                created["reply"]["status"] == "applied",
            )
            .expect(
                "the maximize from another Vessel's terminal was refused with nothing queued",
                refused.contains(
                    "set-placement-maximized is offered only to Voyager; nothing was queued",
                ) && refused.contains("exit=1"),
            )
            .expect(
                "the refused maximize left the Fleet unmaximized",
                after_refusal.is_none(),
            )
            .expect(
                "voyager do workspace applied the maximize",
                maximizing["reply"]["status"] == "applied",
            )
            .expect("the maximized Vessel hid the first Vessel", !alone)
            .expect(
                "voyager do workspace applied the restore",
                restoring["reply"]["status"] == "applied",
            )
            .expect("the restore drew both Vessels again", restored.is_ok())
            .observed("refused", &refused)?
            .observed("added", &added)
    })
}
