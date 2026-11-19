use super::layout::agents_beside;
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{
    AGENTS_ROW, CANVAS_REFRESH, Elapsed, Native, Stopwatch, Terminal, VESSEL_CLOSED, hold,
};
use crate::system::until;
use crate::x11::Key;
use anyhow::{Context, Result, ensure};
use voyager_contract::RenameTarget;

cases! {
    ForegroundReachesAgentsList => "foreground-reaches-agents-list",
    ExitShownAfterCorePause => "exit-shown-after-core-pause",
}

pub const CONTROL: Case = Case::ForegroundReachesAgentsList;

const ROUNDS: usize = 3;

fn program(label: &str) -> Option<&str> {
    label.split(", ").nth(1)
}

fn named_after(
    native: &Native,
    terminal: &Terminal,
    row: &Target,
    reported: &str,
    drawn: &str,
) -> Result<Elapsed> {
    let since = terminal.runs(native, reported)?;
    native.observe(&format!("the Agents row naming {drawn}"), |seen| {
        (program(seen.label(row)?)? == drawn).then_some(())
    })?;
    Ok(since.lap())
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let terminal = Terminal::first(native)?;
    cases.check(native, Case::ForegroundReachesAgentsList, |native| {
        agents_beside(native, terminal.placement())?;
        let row = Target::agents_row(terminal.placement());
        native.observe("the terminal's row in the Agents Vessel", |seen| {
            seen.shows(&row).then_some(())
        })?;
        let mut started = Vec::new();
        let mut returned = Vec::new();
        for _ in 0..ROUNDS {
            terminal.line(native, "sleep 30")?;
            started.push(named_after(native, &terminal, &row, "sleep", "sleep")?);
            terminal.focus(native)?;
            native.press(Key::Char('c').ctrl())?;
            returned.push(named_after(native, &terminal, &row, "bash", "Bash")?);
        }
        native.keep_window("foreground")?;
        Verdict::new()
            .expect(
                "the Agents row named the foreground program within 1 s of Core reporting it, three times",
                started.iter().all(|delay| delay.within(AGENTS_ROW)),
            )
            .expect(
                "the Agents row named the shell again within 1 s of Core reporting it, three times",
                returned.iter().all(|delay| delay.within(AGENTS_ROW)),
            )
            .observed("program named after ms", &started)?
            .observed("shell named after ms", &returned)
    })?;
    cases.check(native, Case::ExitShownAfterCorePause, |native| {
        let (before, _) = native.document()?.context("Missing saved layout")?;
        terminal.line(native, "sleep 2; exit")?;
        terminal.runs(native, "sleep")?;
        let name = Target::name(&RenameTarget::Vessel {
            id: terminal.placement().clone(),
        });
        let exited = native.with_core_paused(|native| {
            hold(CANVAS_REFRESH)?;
            let drawn = native.drawn_label(
                &name,
                "the shell's Vessel still drawn while Core is stopped",
                |_| true,
            );
            Ok(terminal.exited() && drawn.is_ok())
        })?;
        ensure!(
            exited,
            "The shell did not exit while Core was stopped with its Vessel still drawn, so the app was not tested"
        );
        let resumed = Stopwatch::start();
        let finished = terminal.ended(native)?;
        until("a newer saved layout after Core resumed", || {
            Ok(native
                .document()?
                .is_some_and(|(version, _)| version > before)
                .then_some(()))
        })?;
        let saved = finished.lap();
        native.observe("the exited shell's Vessel closed", |seen| {
            (!seen.shows(&terminal.target()) && seen.version > before).then_some(())
        })?;
        let closed = resumed.lap();
        native.keep_window("missed-snapshot")?;
        Verdict::new()
            .expect(
                "the Vessel of the shell that exited during the pause was saved closed within 1 s of Core reporting it finished",
                saved.within(VESSEL_CLOSED),
            )
            .observed(
                "resume to finished ms",
                resumed.until(finished),
            )?
            .observed("finished to saved ms", saved)?
            .observed("resume to closed ms", closed)
    })
}
