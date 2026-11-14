use super::{Case as _, Cases, Verdict, cases};
use crate::native::{Lines, Native, Terminal, Wheel, pid, quote, state, vessels};
use crate::system::{Identity, until};
use crate::x11::{Key, Pixels};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::time::{Duration, Instant};

cases! {
    NormalHistory => "normal-history",
    Arrows => "arrows",
    Mouse => "mouse",
    ReattachedHistory => "reattached-history",
    ForeignExit => "foreign-exit",
    ExitCloses => "exit-closes",
}

pub const CONTROL: Case = Case::NormalHistory;

fn position(value: &Value) -> Result<i64> {
    value["position"]
        .as_i64()
        .context("Missing observed position")
}

fn received(value: &Value, input: &str) -> Result<u64> {
    value[input]
        .as_u64()
        .with_context(|| format!("Missing count of {input} that moved the probe"))
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let terminal = Terminal::first(native)?;
    terminal.focus(native)?;
    cases.check(native, Case::NormalHistory, |native| {
        let empty = terminal.look(native)?;
        terminal.line(native, "printf 'HISTORY-%03d\\n' {1..120}")?;
        terminal.shows(native, "HISTORY-120")?;
        let live = terminal.settled(native, "history-live", |look| look != &empty)?;
        history(native, &terminal, "history", &live, Verdict::new())
    })?;
    let executable = std::env::current_exe()?;
    let encodings = [
        (
            Case::Arrows,
            "keys",
            "wheel",
            "the program received cursor keys and no wheel reports",
        ),
        (
            Case::Mouse,
            "wheel",
            "keys",
            "the program received wheel reports and no cursor keys",
        ),
    ];
    for (case, sent, withheld, encoded) in encodings {
        cases.check(native, case, |native| {
            let mode = case.name();
            let path = native.system.evidence.join(format!("{mode}-state.json"));
            let prompt = terminal.look(native)?;
            terminal.line(
                native,
                &format!("{} probe {} {mode}", quote(&executable)?, quote(&path)?),
            )?;
            until("native Rust terminal probe", || {
                Ok(path.exists().then_some(()))
            })?;
            let initial = state(&path)?;
            let identity = Identity::read(pid(&initial)?)?;
            let before =
                terminal.settled(native, &format!("{mode}-before"), |look| look != &prompt)?;
            let start = Lines::of(&before);
            terminal.wheel(native, Wheel::Up)?;
            let (up, upper) = terminal.settled_with(
                native,
                &format!("{mode}-up"),
                || state(&path),
                |up, look| moved(&start, &Lines::of(look), &initial, up),
            )?;
            let raised = Lines::of(&upper);
            terminal.wheel(native, Wheel::Down)?;
            let (down, lower) = terminal.settled_with(
                native,
                &format!("{mode}-down"),
                || state(&path),
                |down, look| moved(&Lines::of(look), &raised, down, &up),
            )?;
            let lowered = Lines::of(&lower);
            identity.verify()?;
            ensure!(
                pid(&up)? == identity.pid && pid(&down)? == identity.pid,
                "Probe identity changed"
            );
            let verdict = Verdict::new()
                .expect(
                    "wheel up moved the program up",
                    position(&up)? < position(&initial)?,
                )
                .expect(
                    "wheel down moved the program back down",
                    position(&down)? > position(&up)?,
                )
                .expect(
                    "wheel up draws the program's lines as many rows lower as the program moved",
                    moved(&start, &raised, &initial, &up),
                )
                .expect(
                    "wheel down draws the program's lines as many rows higher as the program moved",
                    moved(&lowered, &raised, &down, &up),
                )
                .expect(
                    encoded,
                    received(&down, sent)? > 0 && received(&down, withheld)? == 0,
                )
                .observed("initial", &initial)?
                .observed("up", &up)?
                .observed("down", &down)?
                .observed("lines before", &start)?
                .observed("lines after wheel up", &raised)?
                .observed("lines after wheel down", &lowered)?
                .observed("identity", &identity)?;
            native.press(Key::Char('q'))?;
            until("probe exit", || {
                Ok(state(&path)?["ended"].as_bool().filter(|ended| *ended))
            })?;
            terminal.same_program(native)?;
            Ok(verdict)
        })?;
    }
    cases.check(native, Case::ReattachedHistory, |native| {
        terminal.line(native, "printf 'REATTACH-%03d\\n' {1..60}")?;
        terminal.shows(native, "REATTACH-060")?;
        let kept = terminal.settled(native, "reattached-before", |_| true)?;
        let drawn = Lines::of(&kept);
        native.close()?;
        terminal.same_program(native)?;
        native.launch()?;
        terminal.focus(native)?;
        let live = terminal.settled(native, "reattached-live", |look| Lines::of(look) == drawn)?;
        let reattached = Lines::of(&live);
        let verdict = Verdict::new()
            .expect(
                "after the relaunch, the live screen draws the lines it drew before",
                !drawn.is_empty() && reattached == drawn,
            )
            .observed("lines before the relaunch", &drawn)?
            .observed("lines after the relaunch", &reattached)?;
        let verdict = history(native, &terminal, "reattached", &live, verdict)?;
        terminal.same_program(native)?;
        Ok(verdict)
    })?;
    cases.check(native, Case::ForeignExit, |native| {
        let (before, earlier) = native.document()?.context("Missing saved layout")?;
        let foreign = native.system.rpc(
            "terminal.run",
            json!({"argv":["/bin/true"],"cwd":"/tmp","no_parent":true}),
        )?;
        let address = foreign["address"]
            .as_str()
            .context("Missing foreign terminal")?
            .to_owned();
        until("the foreign program's exit", || {
            let reported = native
                .system
                .watch("terminal.get", json!({"terminal":address}))?;
            Ok((reported["state"] == "finished").then_some(()))
        })?;
        std::thread::sleep(Duration::from_millis(500));
        let (after, layout) = native.document()?.context("Missing saved layout")?;
        let shown = native.observe("the placed terminal after a foreign exit", |seen| {
            Some(seen.shows(&terminal.target()))
        })?;
        native.keep_window("foreign-exit")?;
        Verdict::new()
            .expect(
                "a program outside the app exiting in the same Core session leaves the saved layout unchanged",
                after == before,
            )
            .expect(
                "the placed terminal stays shown with no new Vessel",
                shown && vessels(&layout).count() == vessels(&earlier).count(),
            )
            .observed("foreign terminal", address)?
            .observed("layout versions", [before, after])
    })?;
    cases.check(native, Case::ExitCloses, |native| {
        let (before, _) = native.document()?.context("Missing saved layout")?;
        terminal.line(native, "exit")?;
        let typed = Instant::now();
        native.observe("the exited shell's Vessel closed", |seen| {
            (!seen.shows(&terminal.target()) && seen.version > before).then_some(())
        })?;
        let delay = typed.elapsed().as_millis();
        native.keep_window("exit-closes")?;
        Verdict::new()
            .expect(
                "the exited shell's Vessel closes within 1 s of the typed exit",
                delay < 1000,
            )
            .observed("exit to closed ms", delay)
    })
}

fn moved(from: &Lines, to: &Lines, before: &Value, after: &Value) -> bool {
    let rows = position(before)
        .and_then(|before| Ok(before - position(after)?))
        .ok()
        .and_then(|rows| usize::try_from(rows).ok())
        .filter(|rows| *rows > 0);
    rows.is_some() && from.lowered(to) == rows
}

fn history(
    native: &Native,
    terminal: &Terminal,
    name: &str,
    live: &Pixels,
    verdict: Verdict,
) -> Result<Verdict> {
    let drawn = Lines::of(live);
    terminal.wheel(native, Wheel::Up)?;
    let earlier = terminal.settled(native, &format!("{name}-up"), |look| {
        drawn.lowered_below_history(&Lines::of(look))
    })?;
    let scrolled = Lines::of(&earlier);
    terminal.wheel(native, Wheel::Down)?;
    let restored = terminal.settled(native, &format!("{name}-down"), |look| look == live)?;
    verdict
        .expect(
            "wheel up draws the live screen's lines lower, below earlier history",
            drawn.lowered_below_history(&scrolled),
        )
        .expect(
            "wheel down returns to the live screen and its lines",
            !drawn.is_empty() && &restored == live,
        )
        .observed("live lines", &drawn)?
        .observed("lines after wheel up", &scrolled)?
        .observed("lines after wheel down", Lines::of(&restored))
}
