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
    SilentProgramIsUnknown => "silent-program-is-unknown",
    ReportStaysUntilReplaced => "report-stays-until-replaced",
    ExitShownAfterCorePause => "exit-shown-after-core-pause",
}

pub const CONTROL: Case = Case::ForegroundReachesAgentsList;

const ROUNDS: usize = 3;

fn program(label: &str) -> Option<&str> {
    label.split(", ").nth(1)
}

const STATUS_WORDS: [&str; 4] = ["Needs attention", "Working", "Done", "Idle"];

fn status_in(label: &str) -> Option<&str> {
    label.split(", ").skip(2).find_map(|part| {
        STATUS_WORDS
            .iter()
            .find(|word| part == **word || part.starts_with(&format!("{word} · ")))
            .copied()
    })
}

fn stand_in_row(
    native: &Native,
    terminal: &Terminal,
    row: &Target,
    reports: &str,
) -> Result<String> {
    terminal.line(
        native,
        &format!("{}={reports} claude", crate::agent::REPORTS),
    )?;
    terminal.runs(native, "claude")?;
    native.observe("the terminal's Agents row naming Claude", |seen| {
        let label = seen.label(row)?;
        (program(label)? == "Claude").then(|| label.to_owned())
    })
}

fn stop_stand_in(native: &Native, terminal: &Terminal, row: &Target) -> Result<()> {
    terminal.focus(native)?;
    native.press(Key::Char('c').ctrl())?;
    named_after(native, terminal, row, "bash", "Bash").map(drop)
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
    cases.check(native, Case::SilentProgramIsUnknown, |native| {
        let row = Target::agents_row(terminal.placement());
        stand_in_row(native, &terminal, &row, "none")?;
        let drawn = native.drawn_labels(&row, CANVAS_REFRESH)?;
        stop_stand_in(native, &terminal, &row)?;
        Verdict::new()
            .expect(
                "the Agents row of an agent that never reported shows no status word",
                !drawn.is_empty() && drawn.iter().all(|label| status_in(label).is_none()),
            )
            .observed("rows", &drawn)
    })?;
    cases.check(native, Case::ReportStaysUntilReplaced, |native| {
        let row = Target::agents_row(terminal.placement());
        stand_in_row(native, &terminal, &row, "working")?;
        let shown = native.observe("the Agents row showing the reported Working", |seen| {
            (status_in(seen.label(&row)?) == Some("Working")).then_some(())
        });
        let drawn = native.drawn_labels(&row, CANVAS_REFRESH)?;
        stop_stand_in(native, &terminal, &row)?;
        Verdict::new()
            .expect("the Agents row shows the reported Working", shown.is_ok())
            .expect(
                "the row keeps showing Working for 3 s while the agent stays silent",
                !drawn.is_empty()
                    && drawn
                        .iter()
                        .all(|label| status_in(label) == Some("Working")),
            )
            .observed("rows", &drawn)
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
