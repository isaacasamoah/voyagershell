mod diagnosis;
mod features;
mod inspection;
mod journey;
mod lifecycle;
mod native;
mod probe;
mod proof;
mod sandbox;
#[cfg(test)]
mod scratch;
mod system;
mod x11;

use anyhow::{Context, Result, bail, ensure};
use journey::{Journey, Outcomes};
use lifecycle::{Event, Phase, Run};
use native::{Cause, Fault, Native, Surface};
use sandbox::{Observation, Resource, Sandbox};
use serde::Deserialize;
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread::sleep;
use std::time::Duration;
use system::{Pinned, System};

fn main() {
    match entry() {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!("Verification unavailable: {error:#}");
            std::process::exit(2);
        }
    }
}

fn entry() -> Result<i32> {
    let mut args: Vec<_> = std::env::args().skip(1).collect();
    if args.iter().any(|arg| arg == "--help") || args.is_empty() {
        println!(
            "VoyagerShell Rust verification\nCommands: doctor, check-lifecycle, run, probe, features, journeys\nfeatures [--check | --write | --changed GIT_RANGE] validates the registry and prints, checks or writes the coverage table, or selects features by diff.\njourneys prints each native journey with its cases, its required sidebar, its smallest window and its negative control.\nrun --journey {} --binary PATH --sha256 HASH --hc-sha256 HASH --evidence NEW_ABSOLUTE_PATH [--assets PATH] [--fault kill:SECONDS|stop:SECONDS] [--window WIDTHxHEIGHT] [--sidebar open|collapsed]\ndoctor --binary PATH --sha256 HASH --hc-sha256 HASH [--assets PATH]\ncheck-lifecycle exhaustively explores the actual finite run gate.\nEach run is confined to a private user, mount, PID and network namespace.\nOnly owned Linux X11 is supported. No real display or model calls.",
            Journey::names().join("|")
        );
        return Ok(0);
    }
    let command = args.remove(0);
    ensure!(
        std::env::var("VOYAGER_SCROLL_AGENT").as_deref() != Ok("1"),
        "Actual Codex has not migrated to the Rust journey; use the retained explicit legacy route"
    );
    if command == "probe" {
        ensure!(args.len() == 2, "Probe needs state path and mode");
        probe::run(&PathBuf::from(&args[0]), &args[1])?;
        return Ok(0);
    }
    if command == "features" {
        return features::run(&args);
    }
    if command == "journeys" {
        ensure!(args.is_empty(), "Unexpected journeys options");
        println!("{}", serde_json::to_string_pretty(&Journey::listing())?);
        return Ok(0);
    }
    if command == "internal-canary" {
        ensure!(args.len() == 1, "Canary needs the host resources");
        let observed = sandbox::observe(serde_json::from_str(&args[0])?)?;
        println!("{}", serde_json::to_string(&observed)?);
        return Ok(0);
    }
    if command == "internal-run" {
        ensure!(args.len() == 1, "Sandboxed run needs its plan");
        return drive(serde_json::from_str(&args[0])?);
    }
    let source = current_source()?;
    if command == "check-lifecycle" {
        ensure!(args.is_empty(), "Unexpected lifecycle options");
        println!(
            "{}",
            json!({"check":"finite-lifecycle","verificationSource":source,"states":proof::check()?,"bounds":"All reachable values of the finite Run type and all eleven Event values; no external OS model"})
        );
        return Ok(0);
    }
    ensure!(
        ["doctor", "run"].contains(&command.as_str()),
        "Unknown command"
    );
    let accepted = [
        "--journey",
        "--binary",
        "--sha256",
        "--hc-sha256",
        "--assets",
        "--evidence",
        "--fault",
        "--window",
        "--sidebar",
    ];
    ensure!(args.len().is_multiple_of(2), "Every option needs a value");
    for pair in args.as_chunks::<2>().0 {
        ensure!(
            accepted.contains(&pair[0].as_str()),
            "Unsupported option {}",
            pair[0]
        );
        ensure!(
            args.iter().filter(|arg| *arg == &pair[0]).count() == 1,
            "Duplicate option {}",
            pair[0]
        );
    }
    let get = |name: &str| -> Result<String> {
        args.windows(2)
            .find(|pair| pair[0] == name)
            .map(|pair| pair[1].clone())
            .context(format!("Missing {name}"))
    };
    let verifier = std::env::current_exe()?;
    let candidate =
        Pinned::check(Path::new(&get("--binary")?), &get("--sha256")?).context("Candidate")?;
    let hc = Pinned::check(&system::installed("hc")?, &get("--hc-sha256")?).context("Core")?;
    let assets = get("--assets")
        .ok()
        .map(std::fs::canonicalize)
        .transpose()
        .context("Candidate assets")?;
    system::check_assets(
        &candidate.path,
        assets.as_deref().context("Missing --assets")?,
    )
    .context("Candidate assets")?;
    let mut readiness = system::doctor(&candidate, &hc)?;
    readiness["verificationSource"] = json!(source);
    readiness["verifierSha256"] = json!(system::digest(&verifier)?);
    let host = sandbox::host_resources()?;
    let own = sandbox::text(&verifier)?;
    let confine = |evidence: Option<&Path>, inner: &[&str]| {
        Sandbox {
            verifier: &verifier,
            candidate: &candidate.path,
            core: &hc.path,
            assets: assets.as_deref(),
            evidence,
        }
        .command(inner)
    };
    if command == "doctor" {
        let resources = serde_json::to_string(&host)?;
        let canary = confine(None, &[&own, "internal-canary", &resources])?;
        let output = sandbox::process(&canary).output()?;
        ensure!(
            output.status.success(),
            "Sandbox canary did not run: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
        let containment: Vec<Observation> = serde_json::from_slice(&output.stdout)?;
        readiness["containment"] = json!(containment);
        println!("{}", serde_json::to_string_pretty(&readiness)?);
        sandbox::sealed(&containment)?;
        return Ok(0);
    }
    let journey = Journey::parse(&get("--journey")?)?;
    let surface = Surface::parse(
        get("--window").ok().as_deref(),
        get("--sidebar").ok().as_deref(),
    )?
    .fitting(journey.sidebar(), journey.window())
    .with_context(|| format!("The {} journey cannot run as asked", journey.name()))?;
    let evidence = PathBuf::from(get("--evidence")?);
    sandbox::prepare(&evidence)?;
    system::save(evidence.join("doctor.json"), &readiness)?;
    let session = format!(
        "voyager-verify-{}-{:08x}",
        std::process::id(),
        system::stamp() as u32
    );
    let plan = json!({"journey":journey,"surface":surface,"candidate":candidate,"hc":{"path":sandbox::CORE,"sha256":hc.sha256},"evidence":evidence,"session":session,"host":host,"fault":get("--fault").ok().map(|text| Fault::parse(&text)).transpose()?});
    let command = confine(
        Some(&evidence),
        &[
            "/usr/bin/dbus-run-session",
            "--",
            &own,
            "internal-run",
            &plan.to_string(),
        ],
    )?;
    system::save(
        evidence.join("sandbox.json"),
        &json!({"session":session,"command":command}),
    )?;
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
    ensure!(
        evidence.join("checks.json").is_file(),
        "The sandbox ended without a verdict: {status}"
    );
    Ok(status.code().unwrap_or(2))
}

#[derive(Deserialize)]
struct Plan {
    journey: Journey,
    candidate: Pinned,
    hc: Pinned,
    evidence: PathBuf,
    session: String,
    host: Vec<Resource>,
    fault: Option<Fault>,
    surface: Surface,
}

fn journey(
    native: &mut Native,
    gate: &mut Run,
    driven: Journey,
    outcomes: &mut Outcomes,
    host: Vec<Resource>,
    fault: Option<&Fault>,
) -> Result<()> {
    let containment = sandbox::observe(host)?;
    system::save(
        native.system.evidence.join("containment.json"),
        &containment,
    )?;
    sandbox::sealed(&containment)?;
    native.prepare()?;
    gate.step(Event::Ready)?;
    gate.step(Event::Dispatch)?;
    native.system.mark_dispatch();
    if let Some(fault) = fault {
        native.inject(fault);
    }
    driven.drive(native, outcomes)?;
    let fired = fault.is_none() || native.withdraw_fault();
    ensure!(
        !native.halted(),
        "The candidate was not running when the journey ended"
    );
    ensure!(
        fired,
        "The injected fault never fired before the journey ended"
    );
    if let Some(case) = outcomes.unrun() {
        bail!("The driver ended without running the declared case {case}");
    }
    acknowledge(gate, &native.system)?;
    gate.step(if outcomes.passed() {
        Event::Match
    } else {
        Event::Mismatch
    })
}

fn acknowledge(gate: &mut Run, system: &System) -> Result<()> {
    if gate.phase == Phase::Dispatched && system.acknowledged_since_dispatch() {
        gate.step(Event::Acknowledge)?;
    }
    Ok(())
}

fn drive(plan: Plan) -> Result<i32> {
    system::listen_for_cancel()?;
    let system = System::new(plan.evidence, plan.session)?;
    let mut outcomes = Outcomes::new(plan.journey, system.evidence.join("observations.json"));
    let mut native = Native::new(system, plan.candidate, plan.hc, plan.surface);
    let mut gate = Run::default();
    let result = journey(
        &mut native,
        &mut gate,
        plan.journey,
        &mut outcomes,
        plan.host,
        plan.fault.as_ref(),
    );
    let cause = result.err().map(|error| native.diagnose(&error));
    acknowledge(&mut gate, &native.system)?;
    let product_fault = matches!(cause, Some(Cause::Product(_)));
    match &cause {
        Some(Cause::Product(_)) if gate.step(Event::Crash).is_ok() => {}
        Some(_) => gate.step(Event::Unavailable)?,
        None => {}
    }
    let behaved = cause.is_none() && outcomes.passed();
    let snapshot_gaps = if behaved {
        Vec::new()
    } else {
        diagnosis::snapshot(&mut native)
    };
    let error = cause.as_ref().map(|cause| match cause {
        Cause::Product(detail) | Cause::Fixture(detail) => detail.clone(),
    });
    let observations = native.system.evidence.join("observations.json");
    let recording = outcomes.save(error.as_deref());
    if recording.is_ok() {
        gate.step(Event::Evidence)?;
    } else {
        gate.step(Event::Unavailable)?;
    }
    let cleanup_errors = native.cleanup(product_fault);
    gate.step(if cleanup_errors.is_empty() {
        Event::Clean
    } else {
        Event::CleanupFailed
    })?;
    let identity_changed = native.candidate.verify().is_err() || native.hc.verify().is_err();
    if identity_changed {
        gate.step(Event::Unavailable)?;
    }
    gate.step(Event::Finish)?;
    let evidence_retained = observations.is_file();
    let recording_error = recording.err().map(|e| e.to_string());
    let verdict = gate.verdict();
    let first_failure = diagnosis::Findings {
        cause: cause.as_ref(),
        outcomes: &outcomes,
        recording_error: recording_error.as_deref(),
        cleanup_errors: &cleanup_errors,
        identity_changed,
    }
    .first_failing_check();
    let bundle = native.system.evidence.join("bundle");
    let bundled = verdict != "passed";
    if bundled {
        fs::create_dir_all(&bundle)?;
        system::save(
            bundle.join("summary.json"),
            &json!({"runtimeResult":verdict,"firstFailingCheck":first_failure,"snapshotGaps":snapshot_gaps,"files":{"candidateLog":"../native.log","displayLog":"../display.log","actions":"../actions.jsonl","observations":"../observations.json","processes":"processes.json","coreDocument":"core-doc.json","coreTerminals":"core-terminals.json","coreLogs":"core/","inspection":"inspection.json","captures":"captures/","finalScreen":"final-screen.png","ledgerTail":"actions-tail.jsonl"}}),
        )?;
    }
    let report = json!({"schema":3,"journey":plan.journey,"runtimeResult":verdict,"lifecycle":gate,"error":error,"firstFailingCheck":first_failure,"bundle":bundled.then_some("bundle"),"fault":plan.fault,"layout":plan.surface,"recordingError":recording_error,"cleanupErrors":cleanup_errors,"evidenceRetained":evidence_retained,"binary":native.candidate.path,"sha256":native.candidate.sha256,"hcSha256":native.hc.sha256,"verificationSource":built_source(),"verifierSha256":system::digest(&std::env::current_exe()?)?,"session":native.system.session,"qualityResult":"independent ETC/ORTH/DRY review required","limits":system::LIMITS});
    system::save(native.system.evidence.join("checks.json"), &report)?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    match verdict {
        "passed" => Ok(0),
        "failed" => Ok(1),
        "inconclusive" => Ok(2),
        _ => bail!("Unknown verification outcome"),
    }
}

const SOURCES: &[(&str, &[u8])] = &[
    ("src/main.rs", include_bytes!("main.rs")),
    ("src/diagnosis.rs", include_bytes!("diagnosis.rs")),
    ("src/features.rs", include_bytes!("features.rs")),
    ("src/inspection.rs", include_bytes!("inspection.rs")),
    ("src/journey.rs", include_bytes!("journey.rs")),
    ("src/journey/layout.rs", include_bytes!("journey/layout.rs")),
    (
        "src/journey/quit_restore.rs",
        include_bytes!("journey/quit_restore.rs"),
    ),
    (
        "src/journey/scrolling.rs",
        include_bytes!("journey/scrolling.rs"),
    ),
    (
        "src/journey/voyage_close.rs",
        include_bytes!("journey/voyage_close.rs"),
    ),
    (
        "src/journey/workspace.rs",
        include_bytes!("journey/workspace.rs"),
    ),
    (
        "src/journey/workspace/model.rs",
        include_bytes!("journey/workspace/model.rs"),
    ),
    ("src/lifecycle.rs", include_bytes!("lifecycle.rs")),
    ("src/native.rs", include_bytes!("native.rs")),
    ("src/native/input.rs", include_bytes!("native/input.rs")),
    (
        "src/native/terminal.rs",
        include_bytes!("native/terminal.rs"),
    ),
    ("src/probe.rs", include_bytes!("probe.rs")),
    ("src/proof.rs", include_bytes!("proof.rs")),
    ("src/sandbox.rs", include_bytes!("sandbox.rs")),
    ("src/system.rs", include_bytes!("system.rs")),
    ("src/x11.rs", include_bytes!("x11.rs")),
    ("Cargo.toml", include_bytes!("../Cargo.toml")),
    ("Cargo.lock", include_bytes!("../Cargo.lock")),
];

fn built_source() -> String {
    use sha2::{Digest, Sha256};
    let mut built = Sha256::new();
    for (_, bytes) in SOURCES {
        built.update(bytes);
    }
    format!("{:x}", built.finalize())
}

fn current_source() -> Result<String> {
    use sha2::{Digest, Sha256};
    let mut current = Sha256::new();
    for (name, _) in SOURCES {
        current.update(std::fs::read(
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(name),
        )?);
    }
    let built = built_source();
    ensure!(
        built == format!("{:x}", current.finalize()),
        "Verifier source changed; rebuild before driving"
    );
    Ok(built)
}

#[cfg(test)]
mod tests {
    use super::SOURCES;
    use std::collections::BTreeSet;
    use std::fs;
    use std::path::Path;

    fn sources(folder: &Path, found: &mut BTreeSet<String>) {
        for entry in fs::read_dir(folder).expect("a readable source folder") {
            let path = entry.expect("a readable source entry").path();
            if path.is_dir() {
                sources(&path, found);
            } else if path.extension().is_some_and(|extension| extension == "rs") {
                let name = path
                    .strip_prefix(env!("CARGO_MANIFEST_DIR"))
                    .expect("a path inside the crate");
                found.insert(name.to_str().expect("a UTF-8 source path").to_owned());
            }
        }
    }

    #[test]
    fn every_source_file_is_fingerprinted() {
        let mut found = BTreeSet::new();
        sources(
            &Path::new(env!("CARGO_MANIFEST_DIR")).join("src"),
            &mut found,
        );
        let listed: BTreeSet<_> = SOURCES
            .iter()
            .map(|(name, _)| (*name).to_owned())
            .filter(|name| name.starts_with("src/"))
            .collect();
        assert_eq!(listed, found);
    }
}
