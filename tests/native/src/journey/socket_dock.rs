use super::adopt_by_label::{address, bound_to};
use super::{Cases, Verdict, cases};
use crate::core_relay::Fault;
use crate::frames::rank;
use crate::inspection::Target;
use crate::native::{
    CANVAS_REFRESH, Decorations, Elapsed, FRAME_POLL, LOOK, MODEL_WORK_WAIT, Native,
    PROBE_AFTER_DOCK, PROBE_LATEST, Seen, Stopwatch, Terminal, bound_terminal, fleets, now_millis,
};
use crate::request_relay::{RequestRelay, Traffic};
use crate::sandbox::COMMAND;
use crate::system::poll;
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
    AvatarClickWhileDockingHomeIsHeld => "avatar-click-while-docking-home-is-held",
    AvatarClickAwayChangesNothing => "avatar-click-away-changes-nothing",
    ToolCallRoundTrip => "tool-call-round-trip",
    DockWithNoChosenBehaviourAddsNoModelWork => "dock-with-no-chosen-behaviour-adds-no-model-work",
    AvatarClickParkedReturnsToDock => "avatar-click-parked-returns-to-dock",
    VoyagerCreatesAndMaximizes => "voyager-creates-and-maximizes";
    "reread-keeps-clicked-pane" needs "socket-dock-takes-keyboard",
    "redock-takes-keyboard" needs "reread-keeps-clicked-pane",
    "typing-right-after-a-dock-reaches-the-vessel" needs "socket-dock-takes-keyboard",
    "dock-home-keeps-keyboard" needs "socket-dock-takes-keyboard",
    "avatar-click-at-home-opens-home" needs "socket-dock-takes-keyboard",
    "avatar-click-while-docking-home-is-held" needs "socket-dock-takes-keyboard",
    "avatar-click-away-changes-nothing" needs "socket-dock-takes-keyboard",
    "avatar-click-parked-returns-to-dock" needs "socket-dock-takes-keyboard",
    "voyager-creates-and-maximizes" needs "socket-dock-takes-keyboard",
    "tool-call-round-trip" needs "socket-dock-takes-keyboard",
    "dock-with-no-chosen-behaviour-adds-no-model-work" needs "socket-dock-takes-keyboard",
}

pub const CONTROL: Case = Case::RedockTakesKeyboard;
pub const HOLD: &str = "arm";

const SAVE: &str = "doc.set";
const HELD_MS: u64 = 1_500;

const RENAMED: &str = "Renamed by Voyager";
const TIMED_CALLS: usize = 50;
const COUNTED_CALLS: usize = 5;
const CALL_LIMIT_MS: f64 = 50.;
const HEARD: &str = "Stand-in claude heard:";
const PARKED_SIZE: f32 = 38.0;
const DOCKED_SIZE: f32 = 94.0;
const SIZE_TOLERANCE: f32 = 1.0;

struct Docked {
    first: Terminal,
    docked: Terminal,
    placed: PlacementId,
    fleet: FleetId,
    voyager: String,
    other: String,
}

fn focus_was_on(focus: Option<&PlacementId>, placement: &PlacementId) -> bool {
    focus == Some(placement)
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

pub(super) fn maximized(layout: &Layout, fleet: &FleetId) -> Option<PlacementId> {
    fleets(layout)
        .find(|item| &item.id == fleet)
        .and_then(|item| item.maximized_placement.clone())
}

pub(super) fn set_maximized(placement: &PlacementId, maximized: bool) -> Action {
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
        let before = native.observe("the canvas focus before the second dock", |seen| {
            Some(focused(seen))
        })?;
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
                "the canvas focus was on the clicked first Vessel before the second dock",
                focus_was_on(before.as_ref(), first.placement()),
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
            .observed("before", &before)?
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
        let shown_before = native.document()?.context("Missing saved layout")?.1;
        native.drag(&Target::AVATAR, &Target::WORKSPACE_DOCK)?;
        native.settle(
            "the avatar docked home from the Fleet",
            |seen| (seen.document.context == Context::Workspace).then_some(()),
            |_| true,
        )?;
        let shown_after = native.document()?.context("Missing saved layout")?.1;
        let held = native
            .settle(
                "the canvas focus after the first dock home",
                |seen| Some(focused(seen)),
                |_| true,
            )
            .ok();
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
                "a dock home from the Fleet view left the view where it was",
                shown_after.view == shown_before.view,
            )
            .expect(
                "a dock home left the selected Voyage and Fleet where they were",
                shown_after.selected_voyage == shown_before.selected_voyage
                    && shown_after.selected_fleet == shown_before.selected_fleet,
            )
            .expect(
                "a dock home from the Fleet view left the keyboard on the Vessel that held it",
                held.as_ref() == Some(&Some(first.placement().clone())),
            )
            .expect(
                "a dock home left no script error in the status line",
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

    cases.check(native, Case::AvatarClickWhileDockingHomeIsHeld, |native| {
        native.launch_as(Decorations::Client)?;
        native.observe("the avatar drawn", |seen| {
            seen.shows(&Target::AVATAR).then_some(())
        })?;
        show_fleet(native)?;
        let fleet = native
            .document()?
            .context("Missing saved layout")?
            .1
            .selected_fleet
            .context("The layout has no selected Fleet")?;
        let onto = Target::name(&RenameTarget::Fleet { id: fleet.clone() });
        native.drag(&Target::AVATAR, &onto)?;
        let dropped = native.picture()?;
        native.settle(
            "the avatar docked on the Fleet",
            |seen| (seen.document.context == Context::Fleet { id: fleet.clone() }).then_some(()),
            |_| true,
        )?;
        native.observe("a picture drawn after the drop", |seen| {
            (seen.frame.sequence > dropped).then_some(())
        })?;
        let requests = native.window_requests()?.len();
        let arm = native.system.arm_core(SAVE, Fault::Hold { ms: HELD_MS })?;
        native.drag(&Target::AVATAR, &Target::WORKSPACE_DOCK)?;
        native.click(&Target::AVATAR)?;
        let clicked = now_millis();
        let opened = native
            .settle(
                "the Home view shown",
                |seen| Some((seen.document.view.clone(), seen.document.context.clone())),
                |(view, _)| *view == WorkspaceView::Home,
            )
            .ok();
        let released = held_release(native, &arm)?;
        let sent = native.requests_through_quiet(requests)?;
        native.keep_window("avatar-click-while-docking-home-is-held")?;
        Verdict::new()
            .expect(
                "the Core relay held the dock home's save, so the click came while the dock was unanswered",
                released.is_some_and(|released| clicked < released),
            )
            .expect(
                "the avatar was docked home when the dock's reply landed",
                opened
                    .as_ref()
                    .is_some_and(|(_, context)| *context == Context::Workspace),
            )
            .expect(
                "the click made while the dock waited was kept and opened the Home view once the reply landed",
                opened
                    .as_ref()
                    .is_some_and(|(view, _)| *view == WorkspaceView::Home),
            )
            .expect(
                "neither the dock nor the click sent a minimise request for the window",
                !minimises(&sent),
            )
            .observed("clickedAtMs", clicked)?
            .observed("releasedAtMs", released)?
            .observed("requests", &sent)
    })?;

    cases.check(native, Case::AvatarClickAwayChangesNothing, |native| {
        show_fleet(native)?;
        let fleet = native
            .document()?
            .context("Missing saved layout")?
            .1
            .selected_fleet
            .context("The layout has no selected Fleet")?;
        let onto = Target::name(&RenameTarget::Fleet { id: fleet.clone() });
        native.drag(&Target::AVATAR, &onto)?;
        let docked = native
            .settle(
                "the avatar docked on the Fleet",
                |seen| {
                    (seen.document.context == Context::Fleet { id: fleet.clone() }).then_some(())
                },
                |_| true,
            )
            .is_ok();
        let holder = native.settle(
            "the keyboard back on a Vessel after the dock",
            focused,
            |_| true,
        )?;
        let layout_before =
            serde_json::to_value(native.document()?.context("Missing saved layout")?.1)?;
        let requests = native.window_requests()?.len();
        native.click(&Target::AVATAR)?;
        let sent = native.requests_through_quiet(requests)?;
        let layout_after =
            serde_json::to_value(native.document()?.context("Missing saved layout")?.1)?;
        let holder_after = native.observe("the canvas focus after the click", |seen| {
            Some(focused(seen))
        })?;
        let still_up = native.observe("the window still drawing the avatar", |seen| {
            seen.shows(&Target::AVATAR).then_some(())
        });
        native.keep_window("avatar-click-away-changes-nothing")?;
        Verdict::new()
            .expect("the avatar docked on the Fleet", docked)
            .expect(
                "a click on the avatar docked away from home sent no request for the window",
                sent.is_empty(),
            )
            .expect(
                "the layout was the same after the click",
                layout_before == layout_after,
            )
            .expect(
                "the keyboard stayed on the Vessel that held it",
                holder_after == Some(holder),
            )
            .expect("the window stayed up", still_up.is_ok())
            .observed("requests", &sent)
    })?;

    cases.check(native, Case::ToolCallRoundTrip, |native| {
        tool_call_round_trip(native, &voyager, &placed)
    })?;

    cases.check(
        native,
        Case::DockWithNoChosenBehaviourAddsNoModelWork,
        |native| {
            dock_with_no_chosen_behaviour_adds_no_model_work(
                native, &voyager, &first, &placed, &fleet,
            )
        },
    )?;

    cases.check(native, Case::AvatarClickParkedReturnsToDock, |native| {
        show_fleet(native)?;
        let target = Context::Vessel { id: placed.clone() };
        native.drag(
            &Target::AVATAR,
            &Target::name(&RenameTarget::Vessel { id: placed.clone() }),
        )?;
        let docked = native
            .settle(
                "the avatar docked on the second shell",
                |seen| (seen.document.context == target).then(|| avatar_width(seen)),
                |width| width.is_some_and(|width| sized(width, DOCKED_SIZE)),
            )
            .is_ok();
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let voyage = layout
            .selected_voyage
            .clone()
            .context("The layout has no selected Voyage")?;
        let known: Vec<FleetId> = fleets(&layout).map(|item| item.id.clone()).collect();
        native.click(&Target::create_fleet(&voyage))?;
        native.click(&Target::worker("terminal"))?;
        let (away, away_context, away_width) = native.settle(
            "another Fleet selected with the avatar parked",
            |seen| {
                let selected = seen.document.selected_fleet.clone()?;
                (!known.contains(&selected) && !seen.shows(&Target::terminal(&placed)))
                    .then(|| (selected, seen.document.context.clone(), avatar_width(seen)))
            },
            |(_, _, width)| width.is_some_and(|width| sized(width, PARKED_SIZE)),
        )?;
        let requests = native.window_requests()?.len();
        native.click(&Target::AVATAR)?;
        let back = native
            .settle(
                "the docked shell's Fleet shown again with the avatar on the shell",
                |seen| {
                    Some((
                        seen.document.selected_fleet.clone(),
                        seen.document.context.clone(),
                        seen.shows(&Target::terminal(&placed)),
                        avatar_width(seen),
                    ))
                },
                |(selected, _, shown, width)| {
                    selected.as_ref() == Some(&fleet)
                        && *shown
                        && width.is_some_and(|width| sized(width, DOCKED_SIZE))
                },
            )
            .ok();
        let sent = native.requests_through_quiet(requests)?;
        native.keep_window("avatar-click-parked-returns-to-dock")?;
        Verdict::new()
            .expect("the avatar docked on the second shell", docked)
            .expect(
                "in a new Fleet the docked shell was off screen and the avatar was parked small",
                away != fleet
                    && away_context == target
                    && away_width.is_some_and(|width| sized(width, PARKED_SIZE)),
            )
            .expect(
                "a click on the parked avatar showed the docked shell's Fleet with the shell drawn",
                back.as_ref().is_some_and(|(selected, _, shown, _)| {
                    selected.as_ref() == Some(&fleet) && *shown
                }),
            )
            .expect(
                "the avatar stayed docked on the shell and was drawn on it at full size",
                back.as_ref().is_some_and(|(_, context, _, width)| {
                    *context == target && width.is_some_and(|width| sized(width, DOCKED_SIZE))
                }),
            )
            .expect(
                "the click sent no minimise request for the window",
                !minimises(&sent),
            )
            .observed("awayWidth", away_width)?
            .observed(
                "back",
                &back.as_ref().map(|(_, _, shown, width)| (*shown, *width)),
            )?
            .observed("requests", &sent)
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

fn tool_call_round_trip(
    native: &mut Native,
    voyager: &str,
    placed: &PlacementId,
) -> Result<Verdict> {
    show_fleet(native)?;
    let caller = voyager_caller(voyager);
    let (mut inspect, mut change, mut applied) = (Vec::new(), Vec::new(), 0);
    for index in 0..TIMED_CALLS {
        let began = Stopwatch::start();
        let line = request_line(
            native,
            &caller,
            &format!("round-trip-{index}"),
            set_maximized(placed, index % 2 == 0),
        )?;
        inspect.push(began.lap());
        let began = Stopwatch::start();
        let reply = send_line(native, &caller, &line)?;
        change.push(began.lap());
        applied += usize::from(reply["reply"]["status"] == "applied");
    }
    let relay = RequestRelay::vessel(&native.system.session, voyager)?;
    let mut requests = Vec::new();
    for index in 0..COUNTED_CALLS {
        let status = requests_of(native, &relay, &[&caller, COMMAND, "status"])?;
        let line = request_line(
            native,
            &caller,
            &format!("round-trip-counted-{index}"),
            set_maximized(placed, index % 2 == 0),
        )?;
        let change = requests_of(
            native,
            &relay,
            &[&caller, COMMAND, "do", "workspace", &line],
        )?;
        requests.push((status, change));
    }
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    let fleet = layout
        .selected_fleet
        .clone()
        .context("The layout has no selected Fleet")?;
    if maximized(&layout, &fleet).is_some() {
        let line = request_line(
            native,
            &caller,
            "round-trip-restore",
            set_maximized(placed, false),
        )?;
        send_line(native, &caller, &line)?;
    }
    let (status, done) = (Calls::of(&inspect), Calls::of(&change));
    let one = Traffic {
        connections: 1,
        requests: 1,
        replies: 1,
    };
    let single = requests
        .iter()
        .all(|(status, change)| *status == one && *change == one);
    Verdict::new()
        .expect(
            "every timed voyager do workspace change from Voyager's terminal applied",
            applied == TIMED_CALLS,
        )
        .expect(
            "each counted voyager status and voyager do call made one connection, wrote one request line and read one reply line on the Vessel socket",
            single,
        )
        .expect(
            "19 in 20 voyager status calls and 19 in 20 voyager do calls finished in under 50 ms",
            [&status, &done].iter().all(|calls| calls.within(CALL_LIMIT_MS) * 20 >= calls.calls * 19),
        )
        .observed(
            "status and do traffic per counted call",
            &requests,
        )?
        .observed("status calls", &status)?
        .observed("do calls", &done)
}

fn requests_of(native: &Native, relay: &RequestRelay, arguments: &[&str]) -> Result<Traffic> {
    let runtime = format!("XDG_RUNTIME_DIR={}", relay.runtime());
    let mut relayed = vec![runtime.as_str()];
    relayed.extend_from_slice(arguments);
    relay.counted(|| native.system.execute("env", &relayed, None).map(drop))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Calls {
    measure: &'static str,
    calls: usize,
    p50_ms: f64,
    p95_ms: f64,
    p99_ms: f64,
    max_ms: f64,
    samples_ms: Vec<f64>,
}

impl Calls {
    fn within(&self, limit_ms: f64) -> usize {
        self.samples_ms
            .iter()
            .filter(|sample| **sample < limit_ms)
            .count()
    }

    fn of(durations: &[Elapsed]) -> Self {
        let mut micros: Vec<u64> = durations.iter().map(|duration| duration.micros()).collect();
        let samples_ms = micros.iter().map(|micros| *micros as f64 / 1e3).collect();
        micros.sort_unstable();
        let at = |fraction: f64| rank(&micros, fraction) as f64 / 1e3;
        Self {
            measure: "Wall time of one voyager command run in the sandbox with Voyager's terminal as caller, from spawn to exit",
            calls: durations.len(),
            p50_ms: at(0.5),
            p95_ms: at(0.95),
            p99_ms: at(0.99),
            max_ms: at(1.0),
            samples_ms,
        }
    }
}

fn heard_lines(native: &Native, voyager: &str) -> Result<usize> {
    let read = native
        .system
        .watch("terminal.read", json!({"terminal":voyager,"lines":10_000}))?;
    Ok(read["text"]
        .as_str()
        .unwrap_or_default()
        .matches(HEARD)
        .count())
}

fn dock_with_no_chosen_behaviour_adds_no_model_work(
    native: &mut Native,
    voyager: &str,
    first: &Terminal,
    placed: &PlacementId,
    fleet: &FleetId,
) -> Result<Verdict> {
    show_fleet(native)?;
    let before = heard_lines(native, voyager)?;
    let targets = [
        Context::Fleet { id: fleet.clone() },
        Context::Vessel {
            id: first.placement().clone(),
        },
        Context::Vessel { id: placed.clone() },
    ];
    let mut applied = 0;
    for (index, target) in targets.iter().enumerate() {
        let reply = from_voyager(
            native,
            voyager,
            &format!("model-work-dock-{index}"),
            Action::Dock {
                context: target.clone(),
            },
        )?;
        applied += usize::from(reply["reply"]["status"] == "applied");
        native.settle(
            "the dock from Voyager's terminal",
            |seen| Some(seen.document.context.clone()),
            |context| context == target,
        )?;
    }
    let onto = Context::Fleet { id: fleet.clone() };
    native.drag(
        &Target::AVATAR,
        &Target::name(&RenameTarget::Fleet { id: fleet.clone() }),
    )?;
    let dragged = native.settle(
        "the avatar's dock on the Fleet",
        |seen| Some(seen.document.context.clone()),
        |context| context == &onto,
    );
    let after = poll(MODEL_WORK_WAIT.within(), LOOK, true, || {
        let now = heard_lines(native, voyager)?;
        Ok((now != before).then_some(now))
    })?
    .unwrap_or(before);
    Verdict::new()
        .expect(
            "Voyager's three docks from its terminal applied and the avatar's drag docked on the Fleet",
            applied == targets.len() && dragged.is_ok(),
        )
        .expect(
            "Voyager's terminal heard no new line in the 2 s after the docks",
            after == before,
        )
        .observed("heard lines before", before)?
        .observed("heard lines after", after)
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

fn avatar_width(seen: &Seen) -> Option<f32> {
    Target::AVATAR
        .find(seen.frame)
        .map(|element| element.bounds.width)
}

fn sized(width: f32, size: f32) -> bool {
    (width - size).abs() <= SIZE_TOLERANCE
}

fn minimises(sent: &[Observed]) -> bool {
    sent.iter().any(|observed| {
        matches!(&observed.request, Request::ChangeState { state, .. } if state.name == "iconic")
    })
}

#[cfg(test)]
mod tests {
    use super::{Probe, focus_was_on, judge_probe, nice_of, render_error};
    use crate::native::{PROBE_AFTER_DOCK, PROBE_LATEST};
    use voyager_contract::PlacementId;

    #[test]
    fn the_redock_precondition_fails_when_the_focus_never_left_the_docked_vessel() {
        let docked = PlacementId("placement-1".to_owned());
        let first = PlacementId("placement-2".to_owned());
        assert!(focus_was_on(Some(&first), &first));
        assert!(!focus_was_on(Some(&docked), &first));
        assert!(!focus_was_on(None, &first));
    }

    #[test]
    fn a_probe_sent_late_is_inconclusive_whether_or_not_it_landed() {
        let just_late = PROBE_LATEST.within().mul_f64(1.02);
        let far_past = PROBE_LATEST.within() * 7;
        assert_eq!(judge_probe(just_late, false), Probe::Late);
        assert_eq!(judge_probe(just_late, true), Probe::Late);
        assert_eq!(judge_probe(far_past, true), Probe::Late);
    }

    #[test]
    fn a_probe_sent_in_time_is_judged_by_where_it_landed() {
        assert_eq!(judge_probe(PROBE_AFTER_DOCK.within(), false), Probe::Lost);
        assert_eq!(judge_probe(PROBE_LATEST.within(), true), Probe::Reached);
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
