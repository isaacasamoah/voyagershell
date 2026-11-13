use super::{Case as _, Cases, Verdict, cases};
use crate::native::{Native, Terminal, Wheel, pid, quote, state};
use crate::system::{Identity, until};
use crate::x11::Key;
use anyhow::{Context, Result, ensure};
use serde_json::Value;

cases! {
    NormalHistory => "normal-history",
    Arrows => "arrows",
    Mouse => "mouse",
    ReattachedHistory => "reattached-history",
}

pub const CONTROL: Case = Case::NormalHistory;

fn position(value: &Value) -> Result<i64> {
    value["position"]
        .as_i64()
        .context("Missing observed position")
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let terminal = Terminal::first(native)?;
    terminal.focus(native)?;
    cases.check(native, Case::NormalHistory, |native| {
        let empty = terminal.look(native)?;
        terminal.line(native, "printf 'HISTORY-%03d\\n' {1..120}")?;
        terminal.shows(native, "HISTORY-120")?;
        let live = terminal.settled(native, "history-live", |look| look != &empty)?;
        terminal.wheel(native, Wheel::Up)?;
        let history = terminal.settled(native, "history-up", |look| look != &live)?;
        terminal.wheel(native, Wheel::Down)?;
        let restored = terminal.settled(native, "history-down", |look| look == &live)?;
        Ok(Verdict::new()
            .expect("wheel up shows earlier history", live != history)
            .expect("wheel down returns to the live screen", live == restored))
    })?;
    let executable = std::env::current_exe()?;
    for case in [Case::Arrows, Case::Mouse] {
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
            terminal.wheel(native, Wheel::Up)?;
            let (up, upper) = terminal.settled_with(
                native,
                &format!("{mode}-up"),
                || state(&path),
                |up, look| {
                    position(up)
                        .is_ok_and(|up| position(&initial).is_ok_and(|initial| up < initial))
                        && look != &before
                },
            )?;
            terminal.wheel(native, Wheel::Down)?;
            let (down, lower) = terminal.settled_with(
                native,
                &format!("{mode}-down"),
                || state(&path),
                |down, look| {
                    position(down).is_ok_and(|down| position(&up).is_ok_and(|up| down > up))
                        && look != &upper
                },
            )?;
            identity.verify()?;
            ensure!(
                pid(&up)? == identity.pid && pid(&down)? == identity.pid,
                "Probe identity changed"
            );
            let verdict = Verdict::new()
                .expect("wheel up moved the program up", position(&up)? < 100)
                .expect(
                    "wheel down moved the program back down",
                    position(&down)? > position(&up)?,
                )
                .expect("the screen changed on wheel up", before != upper)
                .expect("the screen changed on wheel down", upper != lower)
                .observed("initial", &initial)
                .observed("up", &up)
                .observed("down", &down)
                .observed("identity", &identity);
            native.press(Key::Char('q'))?;
            until("probe exit", || {
                Ok(state(&path)?["ended"].as_bool().filter(|ended| *ended))
            })?;
            terminal.same_program(native)?;
            Ok(verdict)
        })?;
    }
    cases.check(native, Case::ReattachedHistory, |native| {
        native.close()?;
        terminal.same_program(native)?;
        native.launch()?;
        terminal.focus(native)?;
        let live = terminal.settled(native, "reattached-live", |_| true)?;
        terminal.wheel(native, Wheel::Up)?;
        let history = terminal.settled(native, "reattached-history", |look| look != &live)?;
        terminal.wheel(native, Wheel::Down)?;
        let restored = terminal.settled(native, "reattached-down", |look| look == &live)?;
        terminal.same_program(native)?;
        Ok(Verdict::new()
            .expect("wheel up shows earlier history", live != history)
            .expect("wheel down returns to the live screen", live == restored))
    })
}
