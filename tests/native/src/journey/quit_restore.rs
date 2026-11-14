use super::layout::{avatar_on_dock, without_runtime};
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Seen, Terminal, voyages};
use crate::system::{Identity, until};
use anyhow::Result;
use serde::Serialize;
use serde_json::{Value, json};
use std::time::Instant;
use voyager_contract::inspection::{Frame, Role};
use voyager_contract::{Context, Layout, Vessel};

cases! {
    QuitAndKeep => "quit-and-keep",
    RelaunchReattaches => "relaunch-reattaches",
    QuitBusy => "quit-busy-keeps-output",
    CloseWindow => "close-window-keeps",
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
    vessels: Vec<String>,
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
            && self.vessels == self.expected_vessels
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
    let before = cases.make(native, Case::QuitAndKeep, |native| {
        terminal.line(native, "echo QUIT-$((6*7))")?;
        terminal.shows(native, "QUIT-42")?;
        let saved = at_rest(native)?;
        let roster = native.live_terminals()?;
        let core = native.core()?.clone();
        let shell = terminal.program(native)?;
        let pressed = Instant::now();
        native.close()?;
        let quit_millis = pressed.elapsed().as_millis();
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
    cases.check(native, Case::ColdRestart, |native| {
        let saved = at_rest(native)?;
        native.close()?;
        let old_core = native.stop_core()?;
        let old = backends(&saved.document);
        native.launch()?;
        let new_core = native.core()?.clone();
        let (layout, picture) = native.settle(
            "each Vessel of the selected Fleet bound to a new terminal and drawn",
            |seen| Some((seen.document.clone(), drawn(seen))),
            |(_, picture)| picture.whole() && picture.fresh(&old),
        )?;
        let shells = selected(&layout)
            .iter()
            .map(|vessel| shell_of(native, &layout, vessel))
            .collect::<Result<Vec<_>>>()?;
        let plain = !shells.is_empty()
            && picture.fresh(&old)
            && shells
                .iter()
                .all(|shell| shell["state"] == "live" && shell["argv"] == before.argv);
        let first = selected(&layout).first().map(|vessel| vessel.id.clone());
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
                without_runtime(&layout) == without_runtime(&saved.document),
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

fn selected(layout: &Layout) -> Vec<&Vessel> {
    voyages(layout)
        .filter(|voyage| layout.selected_voyage.as_ref() == Some(&voyage.id))
        .flat_map(|voyage| &voyage.fleets)
        .filter(|fleet| layout.selected_fleet.as_ref() == Some(&fleet.id))
        .flat_map(|fleet| &fleet.vessels)
        .collect()
}

fn backend_of(layout: &Layout, vessel: &Vessel) -> Option<String> {
    layout
        .contents
        .iter()
        .find(|content| content.id == vessel.content)
        .and_then(|content| content.backend.as_ref())
        .map(|backend| backend.0.clone())
}

fn backends(layout: &Layout) -> Vec<String> {
    layout
        .contents
        .iter()
        .filter_map(|content| content.backend.as_ref())
        .map(|backend| backend.0.clone())
        .collect()
}

fn shell_of(native: &Native, layout: &Layout, vessel: &Vessel) -> Result<Value> {
    match backend_of(layout, vessel) {
        Some(backend) => native
            .system
            .rpc("terminal.get", json!({"terminal":backend})),
        None => Ok(Value::Null),
    }
}

fn drawn(seen: &Seen) -> Drawn {
    let layout = seen.document;
    let tabs = voyages(layout)
        .filter(|voyage| layout.selected_voyage.as_ref() == Some(&voyage.id))
        .flat_map(|voyage| &voyage.fleets)
        .map(|fleet| fleet.id.0.clone());
    let shown = selected(layout);
    let starting = shown.iter().any(|vessel| {
        layout
            .contents
            .iter()
            .any(|content| content.id == vessel.content && content.start_pending.is_some())
    });
    Drawn {
        tabs: keys(seen.frame, Role::FleetName),
        expected_tabs: sorted(tabs),
        vessels: keys(seen.frame, Role::VesselName),
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
