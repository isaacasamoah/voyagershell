mod lifecycle;
mod native;
mod probe;
mod proof;
mod sandbox;
mod scrolling;
mod system;

use anyhow::{Context, Result, bail, ensure};
use lifecycle::{Event, Run};
use sandbox::{Observation, Resource, Sandbox};
use serde::Deserialize;
use serde_json::json;
use std::path::{Path, PathBuf};
use std::thread::sleep;
use std::time::Duration;
use system::Pinned;

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
            "VoyagerShell Rust verification\nCommands: doctor, check-lifecycle, run, probe\nrun --journey terminal-scrolling --binary PATH --sha256 HASH --hc-sha256 HASH --evidence NEW_ABSOLUTE_PATH [--assets PATH]\ndoctor --binary PATH --sha256 HASH --hc-sha256 HASH [--assets PATH]\ncheck-lifecycle exhaustively explores the actual finite run gate.\nEach run is confined to a private user, mount, PID and network namespace.\nOnly owned Linux X11 is supported. No real display or model calls."
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
            json!({"check":"finite-lifecycle","verificationSource":source,"states":proof::check()?,"bounds":"All reachable values of the finite Run type and all ten Event values; no external OS model"})
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
    ensure!(
        get("--journey")? == "terminal-scrolling",
        "Journey has not migrated to Rust"
    );
    let evidence = PathBuf::from(get("--evidence")?);
    sandbox::prepare(&evidence)?;
    system::save(evidence.join("doctor.json"), &readiness)?;
    let session = format!(
        "voyager-verify-{}-{:08x}",
        std::process::id(),
        system::stamp() as u32
    );
    let plan = json!({"candidate":candidate,"hc":{"path":sandbox::CORE,"sha256":hc.sha256},"evidence":evidence,"session":session,"host":host});
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
    candidate: Pinned,
    hc: Pinned,
    evidence: PathBuf,
    session: String,
    host: Vec<Resource>,
}

fn drive(plan: Plan) -> Result<i32> {
    system::listen_for_cancel()?;
    let system = system::System::new(plan.evidence, plan.session)?;
    let mut native = native::Native::new(system, plan.candidate, plan.hc);
    let mut gate = Run::default();
    let mut cases = Vec::new();
    let result = (|| -> Result<()> {
        let containment = sandbox::observe(plan.host)?;
        system::save(
            native.system.evidence.join("containment.json"),
            &containment,
        )?;
        sandbox::sealed(&containment)?;
        native.prepare()?;
        gate.step(Event::Ready)?;
        gate.step(Event::Dispatch)?;
        scrolling::drive(&mut native, &mut cases)?;
        gate.step(Event::Acknowledge)?;
        gate.step(
            if cases.len() == 4 && cases.iter().all(|case| case["passed"] == true) {
                Event::Match
            } else {
                Event::Mismatch
            },
        )?;
        Ok(())
    })();
    let error = result.err().map(|error| format!("{error:#}"));
    if error.is_some() {
        gate.step(Event::Unavailable)?;
    }
    let observations = native.system.evidence.join("observations.json");
    let recording = system::save(&observations, &json!({"cases":cases,"error":error}));
    if recording.is_ok() {
        gate.step(Event::Evidence)?;
    } else {
        gate.step(Event::Unavailable)?;
    }
    let cleanup_errors = native.cleanup();
    gate.step(if cleanup_errors.is_empty() {
        Event::Clean
    } else {
        Event::CleanupFailed
    })?;
    if native.candidate.verify().is_err() || native.hc.verify().is_err() {
        gate.step(Event::Unavailable)?;
    }
    gate.step(Event::Finish)?;
    let evidence_retained = observations.is_file();
    let report = json!({"schema":2,"journey":"terminal-scrolling","runtimeResult":gate.verdict(),"lifecycle":gate,"error":error,"recordingError":recording.err().map(|e|e.to_string()),"cleanupErrors":cleanup_errors,"evidenceRetained":evidence_retained,"binary":native.candidate.path,"sha256":native.candidate.sha256,"hcSha256":native.hc.sha256,"verificationSource":built_source(),"verifierSha256":system::digest(&std::env::current_exe()?)?,"session":native.system.session,"qualityResult":"independent ETC/ORTH/DRY review required","limits":system::LIMITS});
    system::save(native.system.evidence.join("checks.json"), &report)?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    match gate.verdict() {
        "passed" => Ok(0),
        "failed" => Ok(1),
        "inconclusive" => Ok(2),
        _ => bail!("Unknown verification outcome"),
    }
}

const SOURCES: [(&str, &[u8]); 10] = [
    ("src/main.rs", include_bytes!("main.rs")),
    ("src/lifecycle.rs", include_bytes!("lifecycle.rs")),
    ("src/proof.rs", include_bytes!("proof.rs")),
    ("src/system.rs", include_bytes!("system.rs")),
    ("src/sandbox.rs", include_bytes!("sandbox.rs")),
    ("src/native.rs", include_bytes!("native.rs")),
    ("src/probe.rs", include_bytes!("probe.rs")),
    ("src/scrolling.rs", include_bytes!("scrolling.rs")),
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
