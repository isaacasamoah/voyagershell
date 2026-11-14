use crate::journey::Outcomes;
use crate::native::{Cause, Native};
use crate::system::save;
use crate::x11::Display;
use anyhow::{Context, Result};
use serde_json::{Value, json};
use std::fs;
use std::path::Path;

const LEDGER_TAIL: usize = 60;
const CAPTURES: usize = 4;

pub fn snapshot(native: &mut Native) -> Vec<String> {
    let bundle = native.system.evidence.join("bundle");
    let mut gaps = Vec::new();
    if let Err(error) = fs::create_dir_all(&bundle) {
        return vec![format!("bundle: {error}")];
    }
    let mut keep = |name: &str, outcome: Result<()>| {
        if let Err(error) = outcome {
            gaps.push(format!("{name}: {error:#}"));
        }
    };
    keep(
        "processes",
        save(bundle.join("processes.json"), &native.processes()),
    );
    for (file, method, params) in [
        (
            "core-doc.json",
            "doc.get",
            json!({"name":"voyager-layout-v1"}),
        ),
        ("core-terminals.json", "terminal.list", json!({})),
    ] {
        let reply = native
            .system
            .rpc(method, params)
            .unwrap_or_else(|error| json!({"unavailable":format!("{error:#}")}));
        keep(file, save(bundle.join(file), &reply));
    }
    keep(
        "final-screen",
        native
            .system
            .env
            .get("DISPLAY")
            .context("No owned display")
            .and_then(|display| Display::connect(display)?.screen())
            .and_then(|screen| Ok(screen.image()?.save(bundle.join("final-screen.png"))?)),
    );
    keep(
        "inspection",
        fs::copy(native.inspection(), bundle.join("inspection.json"))
            .map(drop)
            .map_err(Into::into),
    );
    keep("captures", copy_captures(&native.system.evidence, &bundle));
    keep("ledger", ledger_tail(&native.system.evidence, &bundle));
    keep(
        "core-log",
        copy_core_logs(&native.system.evidence, &native.system.session, &bundle),
    );
    gaps
}

fn copy_captures(evidence: &Path, bundle: &Path) -> Result<()> {
    let mut shots: Vec<_> = fs::read_dir(evidence)?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "png"))
        .filter_map(|entry| Some((entry.metadata().ok()?.modified().ok()?, entry.path())))
        .collect();
    shots.sort();
    let folder = bundle.join("captures");
    fs::create_dir_all(&folder)?;
    for (_, path) in shots.iter().rev().take(CAPTURES) {
        if let Some(name) = path.file_name() {
            fs::copy(path, folder.join(name))?;
        }
    }
    Ok(())
}

fn ledger_tail(evidence: &Path, bundle: &Path) -> Result<()> {
    let text = fs::read_to_string(evidence.join("actions.jsonl"))?;
    let lines: Vec<_> = text.lines().collect();
    let tail = lines[lines.len().saturating_sub(LEDGER_TAIL)..].join("\n");
    fs::write(bundle.join("actions-tail.jsonl"), format!("{tail}\n"))?;
    Ok(())
}

fn copy_core_logs(evidence: &Path, session: &str, bundle: &Path) -> Result<()> {
    let source = evidence.join("home/.local/state/herdr-core").join(session);
    let folder = bundle.join("core");
    fs::create_dir_all(&folder)?;
    for name in ["core.log", "holder.log"] {
        if source.join(name).is_file() {
            fs::copy(source.join(name), folder.join(name))?;
        }
    }
    Ok(())
}

pub struct Findings<'a> {
    pub cause: Option<&'a Cause>,
    pub outcomes: &'a Outcomes,
    pub recording_error: Option<&'a str>,
    pub cleanup_errors: &'a [String],
    pub identity_changed: bool,
}

impl Findings<'_> {
    pub fn first_failing_check(&self) -> Value {
        if let Some(failure) = self.outcomes.first_failure() {
            return failure;
        }
        if let Some(cause) = self.cause {
            let (kind, detail) = match cause {
                Cause::Product(detail) => ("product", detail),
                Cause::Fixture(detail) => ("fixture", detail),
            };
            let check = self.outcomes.interrupted().unwrap_or("journey");
            return json!({"check":check,"blame":kind,"detail":detail});
        }
        if let Some(error) = self.recording_error {
            return json!({"check":"evidence","blame":"fixture","detail":error});
        }
        if let Some(error) = self.cleanup_errors.first() {
            return json!({"check":"cleanup","blame":"fixture","detail":error});
        }
        if self.identity_changed {
            return json!({"check":"artifact-identity","blame":"fixture","detail":"candidate or Core changed on disk during the run"});
        }
        Value::Null
    }
}
