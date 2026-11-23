use super::adopt_by_label::{address, bound_to};
use super::{Cases, Verdict, cases};
use crate::core_relay::Fault;
use crate::inspection::Target;
use crate::native::{
    CANVAS_REFRESH, Decorations, FRAME_POLL, Native, PROBE_AFTER_DOCK, PROBE_LATEST, Seen,
    Terminal, bound_terminal, fleets, now_millis,
};
use crate::sandbox::COMMAND;
use crate::x11::Key;
use crate::x11::{Observed, Request};
use anyhow::{Context as _, Result};
use serde_json::{Value, json};
use std::time::Duration;
use voyager_contract::inspection::Role;
use voyager_contract::{
    Action, ContentDestination, Context, FleetId, Layout, PlacementId, PlacementInsertion,
    PlacementOwner, RenameTarget, Side, WorkspaceView,
};

cases! {
    SocketDockTakesKeyboard => "socket-dock-takes-keyboard",
    RereadKeepsClickedPane => "reread-keeps-clicked-pane",
    RedockTakesKeyboard => "redock-takes-keyboard",
    TypingRightAfterADockReachesTheVessel => "typing-right-after-a-dock-reaches-the-vessel",
    DockHomeKeepsKeyboard => "dock-home-keeps-keyboard",
    AvatarClickAtHomeOpensHome => "avatar-click-at-home-opens-home",
    AvatarClickAwayMinimizes => "avatar-click-away-minimizes",
    VoyagerCreatesAndMaximizes => "voyager-creates-and-maximizes",
}

pub const CONTROL: Case = Case::RedockTakesKeyboard;
pub const HOLD: &str = "arm";

const SAVE: &str = "doc.set";
const HELD_MS: u64 = 1_500;

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

pub(super) fn request_line(
    native: &Native,
    caller: &str,
    id: &str,
    action: Action,
) -> Result<String> {
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

pub(super) fn voyager_caller(voyager: &str) -> String {
    format!("HC_TERMINAL_ID={voyager}")
}

pub(super) fn send_line(native: &Native, caller: &str, request: &str) -> Result<Value> {
    Ok(serde_json::from_str(&native.system.execute(
        "env",
        &[caller, COMMAND, "do", "workspace", request],
        None,
    )?)?)
}

fn from_voyager(native: &Native, voyager: &str, id: &str, action: Action) -> Result<Value> {
    let caller = voyager_caller(voyager);
    let request = request_line(native, &caller, id, action)?;
    send_line(native, &caller, &request)
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

    cases.check(
        native,
        Case::TypingRightAfterADockReachesTheVessel,
        |native| {
            anyhow::ensure!(
                !nice_of(&std::fs::read_to_string("/proc/self/stat")?).is_some_and(|nice| nice > 0),
                "This case runs plain. A niced run is slower and types after the keyboard is back, so it hides the bug"
            );
            show_fleet(native)?;
            first.focus(native)?;
            native.observe("the first Vessel focused by the click", |seen| {
                (focused(seen).as_ref() == Some(first.placement())).then_some(())
            })?;
            let onto = Context::Fleet { id: fleet.clone() };
            native.drag(
                &Target::AVATAR,
                &Target::name(&RenameTarget::Fleet { id: fleet.clone() }),
            )?;
            let sent = native
                .probe_at_frame(
                    CANVAS_REFRESH,
                    |frame| frame.dock == onto,
                    PROBE_AFTER_DOCK,
                    PROBE_KEY,
                )?
                .context("The avatar's dock on the Fleet never showed in the frame")?;
            let at = native
                .observe("the canvas focus after the dock", focused)
                .ok();
            let target = if at.as_ref() == Some(first.placement()) {
                &first
            } else {
                &docked
            };
            let landed = target.printed(native, &format!("$ {PROBE_KEY}"))?;
            let probe = judge_probe(sent, landed);
            anyhow::ensure!(
                probe != Probe::Late,
                "The probe key went out {sent:?} after the dock showed in the frame, later than {:?}, so this run says nothing",
                PROBE_LATEST.within()
            );
            native.press(Key::Return)?;
            let marker = typed_into(native, "socket-typed-after-dock")?;
            let arrived = target.printed(native, &format!("\n{marker}"))?;
            let screen = target.screen(native)?;
            native.keep_window("typing-right-after-a-dock-reaches-the-vessel")?;
            Verdict::new()
                .expect(
                    "a key sent 50 ms after the dock showed in the frame reached the Vessel that took the keyboard",
                    probe == Probe::Reached,
                )
                .expect(
                    "a line typed after the dock reached the Vessel that took the keyboard",
                    arrived && screen.matches(&marker).count() >= 2,
                )
                .observed("probeSentAfterMs", sent.as_millis())?
                .observed("framePollMs", FRAME_POLL.as_millis())?
                .observed("marker", &marker)?
                .observed("focus", &at)?
                .observed("screen", &screen)
        },
    )?;

    cases.check(native, Case::DockHomeKeepsKeyboard, |native| {
        show_fleet(native)?;
        first.focus(native)?;
        native.observe("the first Vessel focused by the click", |seen| {
            (focused(seen).as_ref() == Some(first.placement())).then_some(())
        })?;
        native.drag(&Target::AVATAR, &Target::WORKSPACE_DOCK)?;
        native.settle(
            "the avatar docked home from the Fleet",
            |seen| (seen.document.context == Context::Workspace).then_some(()),
            |_| true,
        )?;
        let labels = native.drawn_labels(&Target::STATUS, CANVAS_REFRESH)?;
        let script_error = render_error(&labels);
        native.click(&Target::HOME)?;
        let (home_fleet, agents) = native.settle(
            "the Home view with its first Vessel",
            |seen| {
                let fleet = seen.document.home.as_ref()?.fleets.first()?;
                let first = fleet.placements.first()?;
                (seen.document.view == WorkspaceView::Home)
                    .then(|| (fleet.id.clone(), first.id.clone()))
            },
            |_| true,
        )?;
        let mut shells = Vec::new();
        for (index, side) in [Side::Right, Side::Bottom].into_iter().enumerate() {
            let before = native
                .document()?
                .context("Missing saved layout")?
                .1
                .home
                .iter()
                .flat_map(|home| &home.fleets)
                .flat_map(|fleet| fleet.placements.iter().map(|panel| panel.id.clone()))
                .collect::<Vec<_>>();
            from_voyager(
                native,
                &voyager,
                &format!("socket-home-create-{index}"),
                Action::CreateVessel {
                    type_id: "terminal".into(),
                    destination: ContentDestination::Placement {
                        owner: PlacementOwner::Fleet {
                            id: home_fleet.clone(),
                        },
                        insertion: PlacementInsertion::Beside {
                            id: agents.clone(),
                            side,
                        },
                    },
                    launch: None,
                },
            )?;
            let added = native.observe("the new Home Vessel drawn", |seen| {
                let fresh = seen
                    .document
                    .home
                    .iter()
                    .flat_map(|home| &home.fleets)
                    .flat_map(|fleet| fleet.placements.iter().map(|panel| panel.id.clone()))
                    .find(|id| !before.contains(id))?;
                seen.shows(&Target::terminal(&fresh)).then_some(fresh)
            })?;
            shells.push(Terminal::bind(native, &added)?);
        }
        let [left, other] = &shells[..] else {
            anyhow::bail!("Two Home shells were not created");
        };
        other.focus(native)?;
        native.observe("the second Home shell focused by the click", |seen| {
            (focused(seen).as_ref() == Some(other.placement())).then_some(())
        })?;
        native.drag(&Target::AVATAR, &Target::WORKSPACE_DOCK)?;
        native.settle(
            "the avatar docked home",
            |seen| (seen.document.context == Context::Workspace).then_some(()),
            |_| true,
        )?;
        let after = native
            .settle(
                "the canvas focus after the dock home",
                |seen| Some(focused(seen)),
                |_| true,
            )
            .ok();
        let marker = typed_into(native, "socket-home")?;
        let arrived = other.printed(native, &format!("\n{marker}"))?;
        let other_screen = other.screen(native)?;
        let left_screen = left.screen(native)?;
        native.keep_window("dock-home-keeps-keyboard")?;
        for shell in &shells {
            shell.line(native, "exit")?;
        }
        native.settle(
            "the two Home shells closed with their programs",
            |seen| {
                let home = seen.document.home.iter().flat_map(|home| &home.fleets);
                let open = home
                    .flat_map(|fleet| &fleet.placements)
                    .filter(|panel| shells.iter().any(|shell| shell.placement() == &panel.id))
                    .count();
                Some(open)
            },
            |open| *open == 0,
        )?;
        Verdict::new()
            .expect(
                "a dock home that hid the focused Vessel left no script error in the status line",
                !script_error,
            )
            .expect(
                "the canvas focus stayed on the Home Vessel the user had clicked",
                after.as_ref() == Some(&Some(other.placement().clone())),
            )
            .expect(
                "the typed line ran in the shell that had the keyboard before the dock home",
                arrived && other_screen.matches(&marker).count() >= 2,
            )
            .expect(
                "the other Home shell received none of the typed keys",
                !left_screen.contains(&marker),
            )
            .observed("statusLabels", &labels)?
            .observed("marker", &marker)?
            .observed("after", &after)?
            .observed("clicked", &other_screen)?
            .observed("other", &left_screen)
    })?;

    cases.check(native, Case::AvatarClickAtHomeOpensHome, |native| {
        native.launch_as(Decorations::Client)?;
        native.observe("the avatar drawn", |seen| {
            seen.shows(&Target::AVATAR).then_some(())
        })?;
        if native
            .document()?
            .context("Missing saved layout")?
            .1
            .context
            != Context::Workspace
        {
            native.drag(&Target::AVATAR, &Target::WORKSPACE_DOCK)?;
        }
        show_fleet(native)?;
        native.settle(
            "the avatar at home with the Fleet shown",
            |seen| {
                (seen.document.context == Context::Workspace
                    && seen.document.view == WorkspaceView::Fleet)
                    .then_some(())
            },
            |_| true,
        )?;
        let requests = native.window_requests()?.len();
        native.click(&Target::AVATAR)?;
        let opened = native
            .settle(
                "the Home view shown",
                |seen| Some((seen.document.view.clone(), seen.document.context.clone())),
                |(view, _)| *view == WorkspaceView::Home,
            )
            .ok();
        let sent = native.requests_through_quiet(requests)?;
        let still_up = native.observe("the window still drawing the workspace", |seen| {
            seen.shows(&Target::HOME).then_some(())
        });
        native.keep_window("avatar-click-at-home-opens-home")?;
        Verdict::new()
            .expect(
                "a click on the avatar at home showed the Home view",
                opened
                    .as_ref()
                    .is_some_and(|(view, _)| *view == WorkspaceView::Home),
            )
            .expect(
                "the avatar stayed docked home",
                opened
                    .as_ref()
                    .is_some_and(|(_, context)| *context == Context::Workspace),
            )
            .expect(
                "the click sent no minimise request for the window",
                !minimises(&sent),
            )
            .expect("the window stayed up", still_up.is_ok())
            .observed("requests", &sent)
    })?;

    cases.check(native, Case::AvatarClickAwayMinimizes, |native| {
        show_fleet(native)?;
        let fleet = native
            .document()?
            .context("Missing saved layout")?
            .1
            .selected_fleet
            .context("The layout has no selected Fleet")?;
        let onto = Target::name(&RenameTarget::Fleet { id: fleet.clone() });
        let docked_on_fleet = |native: &mut Native| {
            native
                .settle(
                    "the avatar docked on the Fleet",
                    |seen| {
                        (seen.document.context == Context::Fleet { id: fleet.clone() })
                            .then_some(())
                    },
                    |_| true,
                )
                .is_ok()
        };
        native.drag(&Target::AVATAR, &onto)?;
        let docked = docked_on_fleet(native);
        let requests = native.window_requests()?.len();
        native.click(&Target::AVATAR)?;
        let answered = native.requests_after(requests, 1)?;
        native.keep_window("avatar-click-away-minimizes-after-the-reply")?;
        native.close()?;
        native.launch()?;
        native.observe("the avatar drawn after the relaunch", |seen| {
            seen.shows(&Target::AVATAR).then_some(())
        })?;
        show_fleet(native)?;
        let arm = native.system.arm_core(SAVE, Fault::Hold { ms: HELD_MS })?;
        native.drag(&Target::AVATAR, &onto)?;
        let requests = native.window_requests()?.len();
        native.click(&Target::AVATAR)?;
        let clicked = now_millis();
        let held = native.requests_after(requests, 1)?;
        let redocked = docked_on_fleet(native);
        let released = held_release(native, &arm)?;
        native.keep_window("avatar-click-away-minimizes")?;
        Verdict::new()
            .expect("the avatar docked on the Fleet", docked && redocked)
            .expect(
                "a click after the dock's reply had arrived sent one iconic change-state request for the window",
                minimises(&answered),
            )
            .expect(
                "the Core relay held the dock's save, so the second click came while the dock was unanswered",
                released.is_some_and(|released| clicked < released),
            )
            .expect(
                "a click right after the drag onto a Fleet sent one iconic change-state request for the window",
                minimises(&held),
            )
            .observed("answeredRequests", &answered)?
            .observed("heldRequests", &held)?
            .observed("clickedAtMs", clicked)?
            .observed("releasedAtMs", released)
    })?;

    cases.check(native, Case::VoyagerCreatesAndMaximizes, |native| {
        show_fleet(native)?;
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

const PROBE_KEY: &str = "Q";

#[derive(Debug, PartialEq)]
enum Probe {
    Reached,
    Lost,
    Late,
}

fn judge_probe(sent_after: Duration, landed: bool) -> Probe {
    if sent_after > PROBE_LATEST.within() {
        Probe::Late
    } else if landed {
        Probe::Reached
    } else {
        Probe::Lost
    }
}

fn nice_of(stat: &str) -> Option<i32> {
    stat.rsplit_once(')')?
        .1
        .split_whitespace()
        .nth(16)?
        .parse()
        .ok()
}

pub(super) fn render_error(labels: &[String]) -> bool {
    labels.iter().any(|label| {
        label.contains("cannot run during render") || label.contains("during the `render` phase")
    })
}

fn held_release(native: &Native, arm: &crate::core_relay::Arm) -> Result<Option<u64>> {
    let ledger = std::fs::read_to_string(native.system.evidence.join(crate::core_relay::LEDGER))
        .unwrap_or_default();
    Ok(ledger
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter(|line| line["arm"].as_u64() == Some(arm.id))
        .find_map(|line| line["releasedAtMs"].as_u64()))
}

pub(super) fn show_fleet(native: &mut Native) -> Result<()> {
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    if layout.view == WorkspaceView::Fleet {
        return Ok(());
    }
    let voyage = layout
        .selected_voyage
        .context("The layout has no selected Voyage")?;
    native.click(&Target::name(&RenameTarget::Voyage { id: voyage }))?;
    native.settle(
        "the Fleet view shown",
        |seen| (seen.document.view == WorkspaceView::Fleet).then_some(()),
        |_| true,
    )
}

fn minimises(sent: &[Observed]) -> bool {
    sent.iter().any(|observed| {
        matches!(&observed.request, Request::ChangeState { state, .. } if state.name == "iconic")
    })
}

#[cfg(test)]
mod tests {
    use super::{Probe, judge_probe, nice_of, render_error};
    use std::time::Duration;

    #[test]
    fn a_probe_sent_late_is_inconclusive_whether_or_not_it_landed() {
        assert_eq!(judge_probe(Duration::from_millis(61), false), Probe::Late);
        assert_eq!(judge_probe(Duration::from_millis(61), true), Probe::Late);
        assert_eq!(judge_probe(Duration::from_millis(400), true), Probe::Late);
    }

    #[test]
    fn a_probe_sent_in_time_is_judged_by_where_it_landed() {
        assert_eq!(judge_probe(Duration::from_millis(50), false), Probe::Lost);
        assert_eq!(judge_probe(Duration::from_millis(60), true), Probe::Reached);
    }

    #[test]
    fn the_nice_value_is_read_from_the_stat_line() {
        let plain = "1234 (voyager-verific) S 1 1234 1234 0 -1 4194560 100 0 0 0 5 3 0 0 20 0 8 0 5000 1000 100 18446744073709551615 0";
        let niced = "1234 (voyager verific) S 1 1234 1234 0 -1 4194560 100 0 0 0 5 3 0 0 30 10 8 0 5000 1000 100 18446744073709551615 0";
        assert_eq!(nice_of(plain), Some(0));
        assert_eq!(nice_of(niced), Some(10));
        assert_eq!(nice_of("not a stat line"), None);
    }

    #[test]
    fn both_render_phase_refusals_count_as_a_render_error() {
        assert!(render_error(&[
            "FocusHandle.focus() cannot run during render or layout; mutate state from an event handler or task"
                .to_owned()
        ]));
        assert!(render_error(&[
            "cx.notify() is not allowed during the `render` phase; request a re-render from an event handler instead"
                .to_owned()
        ]));
    }

    #[test]
    fn an_empty_or_ordinary_status_line_is_not_a_render_error() {
        assert!(!render_error(&[]));
        assert!(!render_error(&["Home opened".to_owned()]));
    }
}
