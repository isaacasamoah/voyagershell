mod lifecycle;
mod native;
mod probe;
mod proof;
mod scrolling;
mod system;

use anyhow::{Context, Result, bail, ensure};
use lifecycle::{Event, Run};
use serde_json::json;
use std::path::PathBuf;

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
            "VoyagerShell Rust verification\nCommands: doctor, check-lifecycle, run, probe\nrun --journey terminal-scrolling --binary PATH --sha256 HASH --evidence NEW_ABSOLUTE_PATH\ndoctor --binary PATH --sha256 HASH\ncheck-lifecycle exhaustively explores the actual finite run gate.\nOnly owned Linux X11 is supported. No real display or model calls."
        );
        return Ok(0);
    }
    let command = args.remove(0);
    ensure!(
        std::env::var("VOYAGER_SCROLL_AGENT").as_deref() != Ok("1"),
        "Actual Codex has not migrated to the Rust journey; use the retained explicit legacy route"
    );
    let source = source_stamp()?;
    if command == "check-lifecycle" {
        ensure!(args.is_empty(), "Unexpected lifecycle options");
        println!(
            "{}",
            json!({"check":"finite-lifecycle","verificationSource":source,"states":proof::check()?,"bounds":"All reachable values of the finite Run type and all ten Event values; no external OS model"})
        );
        return Ok(0);
    }
    if command == "probe" {
        ensure!(args.len() == 2, "Probe needs state path and mode");
        probe::run(&PathBuf::from(&args[0]), &args[1])?;
        return Ok(0);
    }
    ensure!(
        ["doctor", "run", "internal-run"].contains(&command.as_str()),
        "Unknown command"
    );
    if command == "run" {
        let status = std::process::Command::new("dbus-run-session")
            .arg("--")
            .arg(std::env::current_exe()?)
            .arg("internal-run")
            .args(&args)
            .status()?;
        return Ok(status.code().unwrap_or(2));
    }
    let accepted = ["--journey", "--binary", "--sha256", "--evidence"];
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
    let binary = std::fs::canonicalize(get("--binary")?)?;
    let expected = get("--sha256")?.to_ascii_lowercase();
    let mut readiness = system::doctor(&binary, &expected)?;
    readiness["verificationSource"] = json!(source);
    readiness["verifierSha256"] = json!(system::digest(&std::env::current_exe()?)?);
    if command == "doctor" {
        println!("{}", serde_json::to_string_pretty(&readiness)?);
        return Ok(0);
    }
    ensure!(
        get("--journey")? == "terminal-scrolling",
        "Journey has not migrated to Rust"
    );
    system::listen_for_cancel()?;
    let system = system::System::new(PathBuf::from(get("--evidence")?))?;
    system::save(system.evidence.join("doctor.json"), &readiness)?;
    let mut native = native::Native::new(system, binary, expected);
    let mut gate = Run::default();
    let mut cases = Vec::new();
    let result = (|| -> Result<()> {
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
    if system::digest(&native.binary)? != native.expected {
        gate.step(Event::Unavailable)?;
    }
    gate.step(Event::Finish)?;
    let evidence_retained = observations.is_file();
    let report = json!({"schema":1,"journey":"terminal-scrolling","runtimeResult":gate.verdict(),"lifecycle":gate,"error":error,"recordingError":recording.err().map(|e|e.to_string()),"cleanupErrors":cleanup_errors,"evidenceRetained":evidence_retained,"binary":native.binary,"sha256":native.expected,"verificationSource":readiness["verificationSource"],"verifierSha256":readiness["verifierSha256"],"session":native.system.session,"scratch":native.system.scratch,"qualityResult":"independent ETC/ORTH/DRY review required","limits":readiness["limits"]});
    system::save(native.system.evidence.join("checks.json"), &report)?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    match gate.verdict() {
        "passed" => Ok(0),
        "failed" => Ok(1),
        "inconclusive" => Ok(2),
        _ => bail!("Unknown verification outcome"),
    }
}

fn source_stamp() -> Result<String> {
    use sha2::{Digest, Sha256};
    let inputs: [(&str, &[u8]); 9] = [
        ("src/main.rs", include_bytes!("main.rs")),
        ("src/lifecycle.rs", include_bytes!("lifecycle.rs")),
        ("src/proof.rs", include_bytes!("proof.rs")),
        ("src/system.rs", include_bytes!("system.rs")),
        ("src/native.rs", include_bytes!("native.rs")),
        ("src/probe.rs", include_bytes!("probe.rs")),
        ("src/scrolling.rs", include_bytes!("scrolling.rs")),
        ("Cargo.toml", include_bytes!("../Cargo.toml")),
        ("Cargo.lock", include_bytes!("../Cargo.lock")),
    ];
    let mut built = Sha256::new();
    let mut current = Sha256::new();
    for (name, bytes) in inputs {
        built.update(bytes);
        current.update(std::fs::read(
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(name),
        )?);
    }
    let built = format!("{:x}", built.finalize());
    ensure!(
        built == format!("{:x}", current.finalize()),
        "Verifier source changed; rebuild before driving"
    );
    Ok(built)
}
