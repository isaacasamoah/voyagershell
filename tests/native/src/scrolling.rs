use crate::native::{Native, pid, quote, state};
use crate::system::{Identity, save, until};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::thread::sleep;
use std::time::Duration;

pub fn drive(native: &mut Native, cases: &mut Vec<Value>) -> Result<()> {
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
    sleep(Duration::from_millis(500));
    let live = native.capture("history-live")?;
    native.wheel(true)?;
    let history = native.capture("history-up")?;
    native.wheel(false)?;
    let restored = native.capture("history-down")?;
    cases.push(json!({"case":"normal-history","passed":live != history && live == restored}));
    let executable = std::env::current_exe()?;
    for mode in ["arrows", "mouse"] {
        let path = native.system.evidence.join(format!("{mode}-state.json"));
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
        sleep(Duration::from_millis(300));
        let before = native.capture(&format!("{mode}-before"))?;
        native.wheel(true)?;
        let up = state(&path)?;
        let upper = native.capture(&format!("{mode}-up"))?;
        native.wheel(false)?;
        let down = state(&path)?;
        let lower = native.capture(&format!("{mode}-down"))?;
        identity.verify()?;
        ensure!(
            pid(&up)? == identity.pid && pid(&down)? == identity.pid,
            "Probe identity changed"
        );
        let position = |value: &Value| {
            value["position"]
                .as_i64()
                .context("Missing observed position")
        };
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
    let live = native.capture("reattached-live")?;
    native.wheel(true)?;
    let history = native.capture("reattached-history")?;
    native.wheel(false)?;
    let restored = native.capture("reattached-down")?;
    native.same_program()?;
    cases.push(json!({"case":"reattached-history","passed":live != history && live == restored}));
    save(native.system.evidence.join("observations.json"), cases)?;
    Ok(())
}
