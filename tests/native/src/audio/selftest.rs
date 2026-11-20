use super::exchange::{Exchange, SPOKEN, Voice};
use super::judge::MATCH;
use super::speech;
use super::{Client, Stack, missing_tools};
use crate::journey::Verdict;
use crate::sandbox::{self, Resource, Sandbox};
use crate::system::{self, System};
use anyhow::{Context, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::PathBuf;
use std::thread::sleep;
use std::time::Duration;

const LOOPS: [Exchange; 2] = [
    Exchange::through("pulse", Client::Pulse),
    Exchange::through("alsa", Client::Alsa),
];

const CONTROLS: [Exchange; 2] = [
    Exchange::through("severed-capture", Client::Pulse).severed(),
    Exchange::through("other-speech", Client::Pulse).speaking(Voice::OtherSpeech),
];

const LIMITS: &str = "The proof is captured samples at the monitor of a null sink in a private audio server. It is not a physical speaker, a microphone or an ear. Linux only.";

#[derive(Serialize)]
struct Stage {
    stage: &'static str,
    control: bool,
    passed: bool,
    verdict: Verdict,
}

fn judged(exchange: Exchange, control: bool, verdict: Verdict) -> Stage {
    let passed = if control {
        verdict.first_unmet() == Some(SPOKEN)
    } else {
        verdict.passed()
    };
    Stage {
        stage: exchange.name,
        control,
        passed,
        verdict,
    }
}

fn stages(stack: &Stack, system: &System) -> Result<Vec<Stage>> {
    let mut done = Vec::new();
    for (exchanges, control) in [(&LOOPS, false), (&CONTROLS, true)] {
        for exchange in exchanges {
            let verdict = stack.exchange(system, exchange)?;
            done.push(judged(*exchange, control, verdict));
        }
    }
    Ok(done)
}

#[derive(Deserialize)]
pub struct Plan {
    evidence: PathBuf,
    session: String,
    host: Vec<Resource>,
}

pub fn internal(plan: Plan) -> Result<i32> {
    system::listen_for_cancel()?;
    let system = System::new(plan.evidence, plan.session)?;
    let containment = sandbox::observe(plan.host)?;
    system::save(system.evidence.join("containment.json"), &containment)?;
    sandbox::sealed(&containment)?;
    let mut error = None;
    let mut cleanup = Vec::new();
    let mut done = Vec::new();
    match Stack::start(&system) {
        Err(failure) => error = Some(format!("{failure:#}")),
        Ok(mut stack) => {
            match stages(&stack, &system) {
                Ok(stages) => done = stages,
                Err(failure) => error = Some(format!("{failure:#}")),
            }
            cleanup = stack.stop();
        }
    }
    let result = if error.is_some() || !cleanup.is_empty() {
        "inconclusive"
    } else if done.iter().all(|stage| stage.passed) {
        "passed"
    } else {
        "failed"
    };
    let report = json!({
        "schema": 1,
        "selftest": "audio",
        "result": result,
        "stages": done,
        "error": error,
        "cleanupErrors": cleanup,
        "speech": speech::ALL.iter().map(|speech| json!({"name":speech.name,"sha256":speech.sha256})).collect::<Vec<_>>(),
        "match": MATCH,
        "limits": LIMITS,
    });
    system::save(system.evidence.join("selftest.json"), &report)?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(match result {
        "passed" => 0,
        "failed" => 1,
        _ => 2,
    })
}

pub fn run(args: &[String]) -> Result<i32> {
    ensure!(
        args.len() == 2 && args[0] == "--evidence",
        "audio-selftest takes --evidence NEW_ABSOLUTE_PATH"
    );
    let missing = missing_tools();
    ensure!(
        missing.is_empty(),
        "The audio host tools are missing: {}",
        missing.join(", ")
    );
    let verifier = std::env::current_exe()?;
    let evidence = PathBuf::from(&args[1]);
    sandbox::prepare(&evidence)?;
    let own = sandbox::text(&verifier)?;
    let plan = json!({
        "evidence": evidence,
        "session": format!("voyager-verify-audio-{}-{:08x}", std::process::id(), system::stamp() as u32),
        "host": sandbox::host_resources()?,
    });
    let command = Sandbox {
        verifier: &verifier,
        candidate: None,
        core: None,
        second: None,
        assets: None,
        second_assets: None,
        voice: None,
        evidence: Some(&evidence),
    }
    .command(&[
        "/usr/bin/dbus-run-session",
        "--",
        &own,
        "internal-audio",
        &plan.to_string(),
    ])?;
    system::save(evidence.join("sandbox.json"), &json!({"command":command}))?;
    system::listen_for_cancel()?;
    let mut child = sandbox::process(&command).spawn()?;
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }
        if system::interrupted() {
            sandbox::end(&mut child)?;
            bail!("Verification cancelled; the sandbox and every process in it ended");
        }
        sleep(Duration::from_millis(50));
    };
    evidence
        .join("selftest.json")
        .is_file()
        .then_some(())
        .with_context(|| format!("The sandbox ended without a result: {status}"))?;
    Ok(status.code().unwrap_or(2))
}
