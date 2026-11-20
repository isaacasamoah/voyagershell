use super::adopt_by_label::{address, bound_to};
use super::layout::{avatar_on_dock, without_adopted_leaves, without_runtime};
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Decorations, Native, Seen, Stopwatch, Terminal, voyages};
use crate::system::{Identity, until};
use crate::x11::{Observed, Request};
use anyhow::{Context as _, Result};
use serde::Serialize;
use serde_json::{Value, json};
use voyager_contract::inspection::{Frame, Role};
use voyager_contract::{Context, Layout, Placement};

cases! {
    VoyagerStartsAtLaunch => "voyager-starts-at-launch",
    QuitAndKeep => "quit-and-keep",
    RelaunchReattaches => "relaunch-reattaches",
    RelaunchAdoptsAndAttaches => "relaunch-adopts-and-attaches",
    VoyagerRebindsAfterRelaunch => "voyager-rebinds-after-relaunch",
    VoyagerResumesWhenEnded => "voyager-resumes-when-ended",
    QuitBusy => "quit-busy-keeps-output",
    CloseWindow => "close-window-keeps",
    WindowButtons => "window-buttons-send-minimise-and-maximise-requests",
    CornerGrip => "bottom-right-grip-sends-resize-request",
    CloseButton => "close-button-keeps",
    ControlsAbsent => "controls-absent-under-server-decorations",
    ColdRestart => "cold-restart-restores",
    StopSession => "stop-session",
}

pub const CONTROL: Case = Case::RelaunchReattaches;

#[derive(Clone, PartialEq, Serialize)]
struct Saved {
    version: u64,
    document: Layout,
}

struct Before {
    saved: Saved,
    roster: Vec<String>,
    argv: Value,
}

#[derive(PartialEq, Serialize)]
struct Drawn {
    tabs: Vec<String>,
    expected_tabs: Vec<String>,
    placements: Vec<String>,
    terminals: Vec<String>,
    expected_vessels: Vec<String>,
    backends: Vec<Option<String>>,
    starting: bool,
    docked: bool,
}

impl Drawn {
    fn whole(&self) -> bool {
        !self.expected_tabs.is_empty()
            && self.tabs == self.expected_tabs
            && !self.expected_vessels.is_empty()
            && self.placements == self.expected_vessels
            && self.terminals == self.expected_vessels
    }

    fn bound(&self) -> bool {
        !self.starting && self.backends.iter().all(Option::is_some)
    }

    fn fresh(&self, old: &[String]) -> bool {
        self.bound()
            && self
                .backends
                .iter()
                .flatten()
                .all(|backend| !old.contains(backend))
    }
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let terminal = Terminal::first(native)?;
    let original = native.decorations();
    cases.check(native, Case::VoyagerStartsAtLaunch, |native| {
        let started = until("Voyager runs under Core and voyager.json names it", || {
            let running = live_voyagers(native)?;
            Ok(match running.as_slice() {
                [one] if bound_terminal(native).as_deref() == one["address"].as_str() => {
                    Some(running)
                }
                _ => None,
            })
        })?;
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let address = started[0]["address"]
            .as_str()
            .unwrap_or_default()
            .to_owned();
        let argv = started[0]["argv"].clone();
        let vessel = layout.vessels.iter().find(|item| item.is_voyager());
        let on_home = layout.home.as_ref().is_some_and(|home| {
            home.portals
                .iter()
                .any(|portal| vessel.is_some_and(|vessel| portal.vessel == vessel.id))
        });
        Verdict::new()
            .expect(
                "exactly one Voyager runs under Core at launch",
                started.len() == 1,
            )
            .expect(
                "voyager.json names that terminal",
                bound_terminal(native).as_deref() == Some(address.as_str()),
            )
            .expect(
                "the saved Voyager Vessel holds that terminal and is a Portal on Home",
                on_home
                    && vessel.is_some_and(|vessel| {
                        vessel.backend.as_ref().map(|backend| backend.0.as_str())
                            == Some(address.as_str())
                    }),
            )
            .expect(
                "it started fresh with a session id and its own name",
                has_flag(&argv, "--session-id").is_some()
                    && has_flag(&argv, "-n") == Some("voyager"),
            )
            .observed("voyager", &started)
    })?;
    let before = cases.make(native, Case::QuitAndKeep, |native| {
        terminal.line(native, "echo QUIT-$((6*7))")?;
        terminal.shows(native, "QUIT-42")?;
        let saved = at_rest(native)?;
        let roster = native.live_terminals()?;
        let core = native.core()?.clone();
        let shell = terminal.program(native)?;
        let pressed = Stopwatch::start();
        native.close()?;
        let quit_millis = pressed.lap();
        let core_after = answering_core(native).ok().flatten();
        let shell_after = terminal.program(native).ok();
        let roster_after = native.live_terminals().ok();
        let saved_after = saved_now(native).ok().flatten();
        let verdict = Verdict::new()
            .expect(
                "Core is the same process after Quit",
                core_after.as_ref() == Some(&core),
            )
            .expect(
                "the shell is the same live program after Quit",
                shell_after
                    .as_ref()
                    .is_some_and(|shell| shell.same && shell.state.as_deref() == Some("live")),
            )
            .expect(
                "Core lists the same live terminals after Quit",
                roster_after.as_ref() == Some(&roster),
            )
            .expect(
                "the layout document and its version are unchanged by Quit",
                saved_after.as_ref() == Some(&saved),
            )
            .observed("core", json!({"before":core,"after":core_after}))?
            .observed("shell", json!({"before":shell,"after":shell_after}))?
            .observed("roster", json!({"before":roster,"after":roster_after}))?
            .observed(
                "version",
                json!({"before":saved.version,"after":saved_after.as_ref().map(|saved| saved.version)}),
            )?
            .observed("quitMillis", quit_millis)?;
        Ok((
            verdict,
            Some(Before {
                saved,
                roster,
                argv: shell.argv,
            }),
        ))
    })?;
    let Some(before) = before else {
        return Ok(());
    };
    cases.check(native, Case::RelaunchReattaches, |native| {
        native.launch()?;
        let picture = native.settle(
            "the restored Fleet tabs, Vessels and terminals with the avatar docked",
            |seen| Some(drawn(seen)),
            |picture| picture.whole() && picture.bound() && picture.docked,
        )?;
        let roster = native.live_terminals()?;
        let saved = saved_now(native)?;
        let earlier = terminal.printed(native, "QUIT-42")?;
        terminal.line(native, "echo AFTER-$((6*7))")?;
        let typed = terminal.printed(native, "AFTER-42")?;
        let shell = terminal.program(native)?;
        Verdict::new()
            .expect(
                "Core lists the same live terminals after the relaunch",
                roster == before.roster,
            )
            .expect(
                "the layout document and its version are the same after the relaunch",
                saved.as_ref() == Some(&before.saved),
            )
            .expect(
                "Core still holds the output printed before Quit for that terminal",
                earlier,
            )
            .expect(
                "the Vessel's terminal is drawn and the avatar is docked where the document says",
                picture.whole() && picture.docked,
            )
            .expect(
                "text typed after the relaunch reaches the same shell",
                typed && shell.same,
            )
            .observed("roster", json!({"before":before.roster,"after":roster}))?
            .observed(
                "version",
                json!({"before":before.saved.version,"after":saved.as_ref().map(|saved| saved.version)}),
            )?
            .observed("drawn", &picture)?
            .observed("shell", &shell)
    })?;
    cases.check(native, Case::RelaunchAdoptsAndAttaches, |native| {
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let fleet = layout
            .selected_fleet
            .clone()
            .context("No Fleet is selected before Quit")?;
        native.close()?;
        let label = format!("voyager.place=fleet:{}", fleet.0);
        native.system.execute(
            "hc",
            &["run", "--bg", "--name", "late", "--label", &label, "bash"],
            None,
        )?;
        let late = address(native, "late")?;
        native.launch()?;
        let picture = native
            .settle(
                "every Vessel of the selected Fleet drawn with its terminal, including the one labelled while the app was closed",
                |seen| {
                    let adopted = bound_to(seen.document, &late)
                        .is_some_and(|placement| seen.shows(&Target::terminal(&placement.id)));
                    Some((drawn(seen), adopted))
                },
                |(picture, adopted)| *adopted && picture.whole() && picture.bound(),
            )
            .ok();
        native.keep_window("relaunch-adopts-and-attaches")?;
        let first = terminal.printed(native, "QUIT-42")?;
        Verdict::new()
            .expect(
                "the terminal labelled while the app was closed is drawn as a Vessel of its Fleet after the relaunch",
                picture.as_ref().is_some_and(|(_, adopted)| *adopted),
            )
            .expect(
                "every restored Vessel of the selected Fleet draws its terminal after the relaunch",
                picture
                    .as_ref()
                    .is_some_and(|(picture, _)| picture.whole() && picture.bound()),
            )
            .expect(
                "the first Vessel still shows the output printed before Quit",
                first,
            )
            .observed("late", &late)?
            .observed("drawn", picture.as_ref().map(|(picture, _)| picture))
    })?;
    cases.check(native, Case::VoyagerRebindsAfterRelaunch, |native| {
        let before = live_voyagers(native)?;
        let address = before
            .first()
            .and_then(|voyager| voyager["address"].as_str())
            .context("No Voyager runs before the relaunch")?
            .to_owned();
        let other = native
            .live_terminals()?
            .into_iter()
            .find(|candidate| *candidate != address)
            .context("No other live terminal to plant")?;
        native.close()?;
        native.edit_profile_file(
            "voyager.json",
            json!({"terminal": other}).to_string().as_bytes(),
        )?;
        native.launch()?;
        let named = until("voyager.json names the verified Voyager again", || {
            Ok((bound_terminal(native).as_deref() != Some(other.as_str()))
                .then(|| bound_terminal(native)))
        })?;
        let after = live_voyagers(native)?;
        let planted = native.live_terminals()?.contains(&other);
        Verdict::new()
            .expect(
                "voyager.json names the Voyager again, not the terminal planted in it",
                named.as_deref() == Some(address.as_str()),
            )
            .expect(
                "the relaunch started no second Voyager",
                after.len() == 1 && after[0]["address"] == address.as_str(),
            )
            .expect("the planted terminal was left running", planted)
            .observed("planted", &other)?
            .observed("voyagers", json!({"before":before,"after":after}))
    })?;
    cases.check(native, Case::VoyagerResumesWhenEnded, |native| {
        let before = live_voyagers(native)?;
        let ended = before
            .first()
            .and_then(|voyager| voyager["address"].as_str())
            .context("No Voyager runs before it ends")?
            .to_owned();
        let session = has_flag(&before[0]["argv"], "--session-id").map(str::to_owned);
        native.close()?;
        native
            .system
            .rpc("terminal.kill", json!({"terminal": ended}))?;
        native.launch()?;
        let resumed = until("a resumed Voyager runs under Core", || {
            let running = live_voyagers(native)?;
            Ok(
                (!running.is_empty() && bound_terminal(native).is_some_and(|name| name != ended))
                    .then_some(running),
            )
        })?;
        let address = resumed[0]["address"]
            .as_str()
            .unwrap_or_default()
            .to_owned();
        Verdict::new()
            .expect(
                "exactly one Voyager runs after the relaunch",
                resumed.len() == 1,
            )
            .expect(
                "it resumed the session that ended",
                session.is_some()
                    && has_flag(&resumed[0]["argv"], "--resume") == session.as_deref(),
            )
            .expect(
                "voyager.json names the resumed terminal",
                bound_terminal(native).as_deref() == Some(address.as_str()),
            )
            .observed("ended", &ended)?
            .observed("resumed", &resumed)
    })?;
    cases.check(native, Case::QuitBusy, |native| {
        terminal.line(
            native,
            "for i in $(seq 1 100); do echo BUSY-$i; sleep 0.1; done; echo BUSY-DONE-$((6*7))",
        )?;
        terminal.shows(native, "BUSY-3")?;
        let roster = native.live_terminals()?;
        native.close()?;
        let mid = terminal.program(native)?;
        let unfinished = !terminal.holds_now(native, "BUSY-DONE-42")?;
        native.launch()?;
        let finished = terminal.printed(native, "BUSY-DONE-42")?;
        let roster_after = native.live_terminals()?;
        let shell = terminal.program(native)?;
        Verdict::new()
            .expect(
                "the shell is the same live program while the app is closed mid-output",
                mid.same && mid.state.as_deref() == Some("live"),
            )
            .expect(
                "the output is still running when the app has closed",
                unfinished,
            )
            .expect(
                "the output finishes in the same shell after the relaunch",
                finished && shell.same,
            )
            .expect(
                "Core lists the same live terminals after the relaunch",
                roster_after == roster,
            )
            .observed("roster", json!({"before":roster,"after":roster_after}))?
            .observed("shell", json!({"closed":mid,"relaunched":shell}))
    })?;
    cases.check(native, Case::CloseWindow, |native| {
        terminal.line(native, "echo CLOSE-$((6*7))")?;
        terminal.shows(native, "CLOSE-42")?;
        let saved = at_rest(native)?;
        let roster = native.live_terminals()?;
        let core = native.core()?.clone();
        native.keep_window("close-window-before")?;
        native.close_window()?;
        let core_after = answering_core(native)?;
        let closed = terminal.program(native)?;
        let roster_closed = native.live_terminals()?;
        native.launch()?;
        let picture = native.settle(
            "the same Voyage drawn with its terminals after the window was closed",
            |seen| Some(drawn(seen)),
            |picture| picture.whole() && picture.bound(),
        )?;
        let reopened = saved_now(native)?;
        terminal.line(native, "echo REOPENED-$((6*7))")?;
        let typed = terminal.printed(native, "REOPENED-42")?;
        let shell = terminal.program(native)?;
        Verdict::new()
            .expect(
                "Core is the same process after the window is closed",
                core_after.as_ref() == Some(&core),
            )
            .expect(
                "the shell is the same live program after the window is closed",
                closed.same && closed.state.as_deref() == Some("live"),
            )
            .expect(
                "Core lists the same live terminals after the window is closed",
                roster_closed == roster,
            )
            .expect(
                "the relaunch draws the same Voyage from the same document and version",
                picture.whole()
                    && reopened.as_ref().map(|saved| saved.version) == Some(saved.version)
                    && reopened
                        .as_ref()
                        .map(|saved| &saved.document.selected_voyage)
                        == Some(&saved.document.selected_voyage),
            )
            .expect(
                "text typed after the relaunch reaches the same shell",
                typed && shell.same,
            )
            .observed("core", json!({"before":core,"after":core_after}))?
            .observed("roster", json!({"before":roster,"after":roster_closed}))?
            .observed("drawn", &picture)?
            .observed("shell", &shell)
    })?;
    cases.check(native, Case::WindowButtons, |native| {
        under(native, Decorations::Client)?;
        native.observe("the three window buttons", |seen| {
            (seen.shows(&Target::WINDOW_MINIMIZE)
                && seen.shows(&Target::WINDOW_MAXIMIZE)
                && seen.shows(&Target::WINDOW_CLOSE))
            .then_some(())
        })?;
        native.keep_window("window-buttons")?;
        let seen = native.window_requests()?.len();
        native.click(&Target::WINDOW_MINIMIZE)?;
        let minimise = native.requests_after(seen, 1)?;
        native.click(&Target::WINDOW_MAXIMIZE)?;
        let first = native.requests_after(seen + 1, 1)?;
        native.click(&Target::WINDOW_MAXIMIZE)?;
        let second = native.requests_after(seen + 2, 1)?;
        let all = native.window_requests()?;
        Verdict::new()
            .expect(
                "one click on Minimize sends one iconic change-state request for the window",
                matches!(minimise.as_slice(), [Observed { request: Request::ChangeState { state, .. }, .. }] if state.name == "iconic"),
            )
            .expect(
                "each click on Maximize sends one toggle of the window's maximized state",
                [&first, &second].iter().all(|requests| {
                    matches!(requests.as_slice(), [Observed { request: Request::NetWmState { action, first, second, .. }, .. }]
                        if action.name == "toggle"
                            && [first, second].iter().any(|atom| atom.as_deref() == Some("_NET_WM_STATE_MAXIMIZED_VERT"))
                            && [first, second].iter().any(|atom| atom.as_deref() == Some("_NET_WM_STATE_MAXIMIZED_HORZ")))
                }),
            )
            .expect(
                "the three clicks sent exactly three window requests",
                all.len() == seen + 3,
            )
            .observed("requests", &all[seen..])
    })?;
    cases.check(native, Case::CornerGrip, |native| {
        under(native, Decorations::Client)?;
        let seen = native.window_requests()?.len();
        native.drag_from_corner(4, (-40, -30))?;
        let sent = native.requests_after(seen, 1)?;
        Verdict::new()
            .expect(
                "a drag from the bottom-right corner sends one bottom-right resize request",
                matches!(sent.as_slice(), [Observed { request: Request::MoveResize { direction, .. }, .. }] if direction.name == "size-bottom-right"),
            )
            .observed("requests", &sent)
    })?;
    cases.check(native, Case::CloseButton, |native| {
        under(native, Decorations::Client)?;
        terminal.line(native, "echo BUTTON-$((6*7))")?;
        terminal.shows(native, "BUTTON-42")?;
        let saved = at_rest(native)?;
        let roster = native.live_terminals()?;
        let core = native.core()?.clone();
        native.observe("the close button", |seen| {
            seen.shows(&Target::WINDOW_CLOSE).then_some(())
        })?;
        native.keep_window("close-button-before")?;
        let pressed = Stopwatch::start();
        native.click(&Target::WINDOW_CLOSE)?;
        native.await_exit()?;
        let close_millis = pressed.lap();
        let core_after = answering_core(native)?;
        let closed = terminal.program(native)?;
        let roster_closed = native.live_terminals()?;
        native.launch()?;
        let picture = native.settle(
            "the same Voyage drawn with its terminals after the close button",
            |seen| Some(drawn(seen)),
            |picture| picture.whole() && picture.bound(),
        )?;
        let reopened = saved_now(native)?;
        terminal.line(native, "echo BUTTON-AGAIN-$((6*7))")?;
        let typed = terminal.printed(native, "BUTTON-AGAIN-42")?;
        let shell = terminal.program(native)?;
        Verdict::new()
            .expect(
                "Core is the same process after the close button",
                core_after.as_ref() == Some(&core),
            )
            .expect(
                "the shell is the same live program after the close button",
                closed.same && closed.state.as_deref() == Some("live"),
            )
            .expect(
                "Core lists the same live terminals after the close button",
                roster_closed == roster,
            )
            .expect(
                "the relaunch draws the same Voyage from the same document and version",
                picture.whole()
                    && reopened.as_ref().map(|saved| saved.version) == Some(saved.version)
                    && reopened
                        .as_ref()
                        .map(|saved| &saved.document.selected_voyage)
                        == Some(&saved.document.selected_voyage),
            )
            .expect(
                "text typed after the relaunch reaches the same shell",
                typed && shell.same,
            )
            .observed("core", json!({"before":core,"after":core_after}))?
            .observed("roster", json!({"before":roster,"after":roster_closed}))?
            .observed("closeMillis", close_millis)?
            .observed("drawn", &picture)?
            .observed("shell", &shell)
    })?;
    cases.check(native, Case::ControlsAbsent, |native| {
        native.close()?;
        under(native, Decorations::Server)?;
        let hints = native.window_motif_hints()?;
        let drawn = native.observe("the Fleet tabs without window buttons", |seen| {
            Some((
                seen.shows(&Target::HOME),
                seen.shows(&Target::WINDOW_MINIMIZE),
                seen.shows(&Target::WINDOW_MAXIMIZE),
                seen.shows(&Target::WINDOW_CLOSE),
            ))
            .filter(|(home, ..)| *home)
        })?;
        native.keep_window("controls-absent")?;
        under(native, original)?;
        Verdict::new()
            .expect(
                "the window keeps the server-drawn title bar under server decorations",
                hints.as_deref() == Some(&[2, 0, 1, 0, 0]),
            )
            .expect(
                "no window button is drawn beside the Home button under server decorations",
                !drawn.1 && !drawn.2 && !drawn.3,
            )
            .observed("hints", hints)?
            .observed("drawn", drawn)
    })?;
    cases.check(native, Case::ColdRestart, |native| {
        let saved = at_rest(native)?;
        native.close()?;
        let old_core = native.stop_core()?;
        let old = backends(&without_adopted(&saved.document));
        native.launch()?;
        let new_core = native.core()?.clone();
        let (layout, picture) = native.settle(
            "each Vessel of the selected Fleet bound to a new terminal and drawn",
            |seen| Some((seen.document.clone(), drawn_of(seen, false))),
            |(_, picture)| picture.whole() && picture.fresh(&old),
        )?;
        let shells = selected(&layout)
            .iter()
            .filter(|vessel| !is_adopted(&layout, vessel))
            .map(|vessel| shell_of(native, &layout, vessel))
            .collect::<Result<Vec<_>>>()?;
        let plain = !shells.is_empty()
            && picture.fresh(&old)
            && shells
                .iter()
                .all(|shell| shell["state"] == "live" && shell["argv"] == before.argv);
        let first = selected(&layout)
            .into_iter()
            .find(|vessel| !is_adopted(&layout, vessel))
            .map(|vessel| vessel.id.clone());
        let typed = match &first {
            Some(placement) if plain => {
                let restored = Terminal::bind(native, placement)?;
                restored.line(native, "echo COLD-$((6*7))")?;
                restored.printed(native, "COLD-42")?
            }
            _ => false,
        };
        Verdict::new()
            .expect("a new Core answers after the restart", new_core != old_core)
            .expect(
                "the Voyages, Fleets, Vessels, names and selection are the same after the restart",
                without_runtime(&layout)
                    == without_runtime(&without_adopted_leaves(&saved.document)),
            )
            .expect(
                "each Vessel of the selected Fleet runs a new plain shell",
                plain,
            )
            .expect(
                "the window draws the Fleet tabs, the Vessel and its terminal",
                picture.whole(),
            )
            .expect("the restored shell takes input", typed)
            .observed("core", json!({"stopped":old_core,"new":new_core}))?
            .observed("oldBackends", &old)?
            .observed("drawn", &picture)?
            .observed("shells", &shells)
    })?;
    cases.check(native, Case::StopSession, |native| {
        at_rest(native)?;
        let programs = native
            .live_terminals()?
            .iter()
            .map(|address| {
                let reported = native
                    .system
                    .rpc("terminal.get", json!({"terminal":address}))?;
                Identity::read(crate::native::pid(&reported)?)
            })
            .collect::<Result<Vec<_>>>()?;
        native.context_click(&Target::HOME)?;
        native.click(&Target::STOP_SESSION)?;
        native.observe("the stop session dialog", |seen| {
            seen.shows(&Target::STOP_SESSION_CONFIRM).then_some(())
        })?;
        let core = native.core()?.clone();
        native.keep_window("stop-session-dialog")?;
        native.click(&Target::STOP_SESSION_CONFIRM)?;
        let exited = native.await_exit().is_ok();
        let ended = native.core_ended().ok();
        let finished = until("the session's programs exit", || {
            Ok(programs
                .iter()
                .all(|program| program.verify().is_err())
                .then_some(()))
        })
        .is_ok();
        Verdict::new()
            .expect("the app exits cleanly after Stop session", exited)
            .expect(
                "the session's Core stops and its socket is removed",
                ended.as_ref() == Some(&core),
            )
            .expect(
                "every program Core started in the session has ended",
                !programs.is_empty() && finished,
            )
            .observed("core", json!({"before":core,"ended":ended}))?
            .observed("programs", &programs)
    })
}

fn under(native: &mut Native, decorations: Decorations) -> Result<()> {
    if native.running() && native.decorations() == decorations {
        return Ok(());
    }
    native.launch_as(decorations)?;
    native
        .settle(
            "the restored Fleet tabs, Vessels and terminals",
            |seen| Some(drawn(seen)),
            |picture| picture.whole() && picture.bound(),
        )
        .map(drop)
}

fn live_voyagers(native: &Native) -> Result<Vec<Value>> {
    let listed = native.system.rpc("terminal.list", json!({"all":true}))?;
    Ok(listed["terminals"]
        .as_array()
        .context("Core listed no terminals")?
        .iter()
        .filter(|terminal| {
            terminal["state"] == "live" && has_flag(&terminal["argv"], "-n") == Some("voyager")
        })
        .cloned()
        .collect())
}

fn has_flag<'a>(argv: &'a Value, flag: &str) -> Option<&'a str> {
    let words = argv.as_array()?;
    words
        .windows(2)
        .find(|pair| pair[0] == flag)
        .and_then(|pair| pair[1].as_str())
}

fn bound_terminal(native: &Native) -> Option<String> {
    let stored: Value =
        serde_json::from_slice(&std::fs::read(native.profile_path("voyager.json")).ok()?).ok()?;
    stored["terminal"].as_str().map(str::to_owned)
}

fn at_rest(native: &Native) -> Result<Saved> {
    native.observe("the workspace at rest", |seen| {
        Some(Saved {
            version: seen.version,
            document: seen.document.clone(),
        })
    })
}

fn saved_now(native: &Native) -> Result<Option<Saved>> {
    Ok(native
        .document()?
        .map(|(version, document)| Saved { version, document }))
}

fn answering_core(native: &Native) -> Result<Option<Identity>> {
    if !native.system.socket().exists() {
        return Ok(None);
    }
    let status = native.system.rpc("server.status", json!({}))?;
    Ok(Some(Identity::read(crate::native::pid(&status)?)?))
}

fn selected(layout: &Layout) -> Vec<&Placement> {
    voyages(layout)
        .filter(|voyage| layout.selected_voyage.as_ref() == Some(&voyage.id))
        .flat_map(|voyage| &voyage.fleets)
        .filter(|fleet| layout.selected_fleet.as_ref() == Some(&fleet.id))
        .flat_map(|fleet| &fleet.placements)
        .collect()
}

fn is_adopted(layout: &Layout, vessel: &Placement) -> bool {
    layout
        .vessels
        .iter()
        .any(|content| content.id == vessel.vessel && content.adopted)
}

fn without_adopted(layout: &Layout) -> Layout {
    let mut layout = layout.clone();
    layout.vessels.retain(|content| !content.adopted);
    layout
}

fn backend_of(layout: &Layout, vessel: &Placement) -> Option<String> {
    layout
        .vessels
        .iter()
        .find(|content| content.id == vessel.vessel)
        .and_then(|content| content.backend.as_ref())
        .map(|backend| backend.0.clone())
}

fn backends(layout: &Layout) -> Vec<String> {
    layout
        .vessels
        .iter()
        .filter_map(|content| content.backend.as_ref())
        .map(|backend| backend.0.clone())
        .collect()
}

fn shell_of(native: &Native, layout: &Layout, vessel: &Placement) -> Result<Value> {
    match backend_of(layout, vessel) {
        Some(backend) => native
            .system
            .rpc("terminal.get", json!({"terminal":backend})),
        None => Ok(Value::Null),
    }
}

fn drawn(seen: &Seen) -> Drawn {
    drawn_of(seen, true)
}

fn drawn_of(seen: &Seen, adopted: bool) -> Drawn {
    let layout = seen.document;
    let tabs = voyages(layout)
        .filter(|voyage| layout.selected_voyage.as_ref() == Some(&voyage.id))
        .flat_map(|voyage| &voyage.fleets)
        .map(|fleet| fleet.id.0.clone());
    let shown: Vec<_> = selected(layout)
        .into_iter()
        .filter(|vessel| adopted || !is_adopted(layout, vessel))
        .collect();
    let starting = shown.iter().any(|vessel| {
        layout
            .vessels
            .iter()
            .any(|content| content.id == vessel.vessel && content.start_pending.is_some())
    });
    Drawn {
        tabs: keys(seen.frame, Role::FleetName),
        expected_tabs: sorted(tabs),
        placements: keys(seen.frame, Role::VesselName),
        terminals: keys(seen.frame, Role::Terminal),
        expected_vessels: sorted(shown.iter().map(|vessel| vessel.id.0.clone())),
        backends: shown
            .iter()
            .map(|vessel| backend_of(layout, vessel))
            .collect(),
        starting,
        docked: docked(seen),
    }
}

fn docked(seen: &Seen) -> bool {
    if seen.frame.dock != seen.document.context {
        return false;
    }
    match &seen.document.context {
        Context::Vessel { .. } => avatar_on_dock(seen),
        _ => seen
            .frame
            .elements
            .iter()
            .any(|element| element.role == Role::Avatar),
    }
}

fn keys(frame: &Frame, role: Role) -> Vec<String> {
    sorted(
        frame
            .elements
            .iter()
            .filter(|element| element.role == role)
            .map(|element| element.key.clone()),
    )
}

fn sorted(keys: impl Iterator<Item = String>) -> Vec<String> {
    let mut keys: Vec<String> = keys.collect();
    keys.sort();
    keys
}
