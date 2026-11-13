use crate::native::{Native, pid, quote, state};
use crate::system::{Identity, save, until};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};

fn position(value: &Value) -> Result<i64> {
    value["position"]
        .as_i64()
        .context("Missing observed position")
}

pub fn drive(native: &mut Native, cases: &mut Vec<Value>) -> Result<()> {
    let empty = native.look()?;
    native.line("printf 'HISTORY-%03d\\n' {1..120}")?;
    until("history output", || {
        let read = native
            .system
            .rpc("terminal.read", json!({"terminal":native.address}))?;
        Ok(read["text"]
            .as_str()
            .is_some_and(|text| text.contains("HISTORY-120"))
            .then_some(()))
    })?;
    let live = native.settled("history-live", |look| look != &empty)?;
    native.wheel(true)?;
    let history = native.settled("history-up", |look| look != &live)?;
    native.wheel(false)?;
    let restored = native.settled("history-down", |look| look == &live)?;
    cases.push(json!({"case":"normal-history","passed":live != history && live == restored}));
    let executable = std::env::current_exe()?;
    for mode in ["arrows", "mouse"] {
        let path = native.system.evidence.join(format!("{mode}-state.json"));
        let prompt = native.look()?;
        native.line(&format!(
            "{} probe {} {mode}",
            quote(&executable)?,
            quote(&path)?
        ))?;
        until("native Rust terminal probe", || {
            Ok(path.exists().then_some(()))
        })?;
        let initial = state(&path)?;
        let identity = Identity::read(pid(&initial)?)?;
        let before = native.settled(&format!("{mode}-before"), |look| look != &prompt)?;
        native.wheel(true)?;
        let (up, upper) = native.settled_with(
            &format!("{mode}-up"),
            || state(&path),
            |up, look| {
                position(up).is_ok_and(|up| position(&initial).is_ok_and(|initial| up < initial))
                    && look != &before
            },
        )?;
        native.wheel(false)?;
        let (down, lower) = native.settled_with(
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
        let passed = position(&up)? < 100
            && position(&down)? > position(&up)?
            && before != upper
            && upper != lower;
        cases.push(json!({"case":mode,"passed":passed,"initial":initial,"up":up,"down":down,"identity":identity}));
        save(native.system.evidence.join("observations.json"), cases)?;
        native.key("q")?;
        until("probe exit", || {
            Ok(state(&path)?["ended"].as_bool().filter(|v| *v))
        })?;
        native.same_program()?;
    }
    native.close()?;
    native.same_program()?;
    native.launch()?;
    native.focus()?;
    let live = native.settled("reattached-live", |_| true)?;
    native.wheel(true)?;
    let history = native.settled("reattached-history", |look| look != &live)?;
    native.wheel(false)?;
    let restored = native.settled("reattached-down", |look| look == &live)?;
    native.same_program()?;
    cases.push(json!({"case":"reattached-history","passed":live != history && live == restored}));
    save(native.system.evidence.join("observations.json"), cases)?;
    Ok(())
}
