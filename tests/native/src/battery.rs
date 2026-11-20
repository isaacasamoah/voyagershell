use crate::journey::Journey;
use crate::system::{self, Pinned};
use anyhow::{Context, Result, anyhow, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};
use voyager_contract::layout_document::DOCUMENT;

const HISTORY_HEADS: usize = 10;
const MINIMUM_TIMED_RUNS: usize = 2;
const RERUN_ROUNDS: usize = 5;

#[derive(Clone, Copy, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Side {
    Base,
    Head,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Ended {
    Passed,
    Failed,
    Inconclusive,
    NoVerdict,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Blame {
    Product,
    Fixture,
    Unknown,
}

impl Blame {
    fn precedence(attempt: &Attempt) -> u8 {
        match attempt.blame {
            Some(Self::Product) => 0,
            Some(Self::Fixture) => 1,
            _ => 2,
        }
    }

    fn parse(text: Option<&str>) -> Self {
        match text {
            Some("product") => Self::Product,
            Some("fixture") => Self::Fixture,
            _ => Self::Unknown,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Attempt {
    pub side: Side,
    pub journey: Journey,
    pub round: usize,
    pub attempt: u8,
    pub seconds: f64,
    pub ended: Ended,
    pub blame: Option<Blame>,
    pub check: Option<String>,
    pub detail: Option<String>,
    pub cases: BTreeMap<String, String>,
    pub evidence: PathBuf,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Slot {
    Green,
    Flake,
    Red,
}

pub fn slot_outcome(attempts: &[&Attempt]) -> Option<Slot> {
    let first = attempts.first()?;
    if first.ended == Ended::Passed {
        return Some(Slot::Green);
    }
    match attempts.get(1) {
        Some(second) if second.ended == Ended::Passed => Some(Slot::Flake),
        Some(_) => Some(Slot::Red),
        None => None,
    }
}

pub fn median(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(f64::total_cmp);
    let middle = sorted.len() / 2;
    Some(if sorted.len() % 2 == 1 {
        sorted[middle]
    } else {
        (sorted[middle - 1] + sorted[middle]) / 2.0
    })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Timing {
    Within,
    Regression,
    Unmeasured,
}

pub fn judge_timing(reference: Option<f64>, head: Option<f64>, threshold: f64) -> Timing {
    match (reference, head) {
        (Some(reference), Some(head)) if reference > 0.0 => {
            if head - reference > reference * threshold + 1e-9 {
                Timing::Regression
            } else {
                Timing::Within
            }
        }
        _ => Timing::Unmeasured,
    }
}

pub fn history_reference(lines: &[Value], journey: Journey) -> Option<f64> {
    let recent: Vec<f64> = lines
        .iter()
        .filter_map(|line| line["medians"][journey.name()].as_f64())
        .collect();
    let start = recent.len().saturating_sub(HISTORY_HEADS);
    median(&recent[start..])
}

pub fn schedule(journeys: &[Journey], runs: usize) -> Vec<(usize, Journey, Side)> {
    let mut order = Vec::new();
    for round in 0..runs {
        for (index, journey) in journeys.iter().enumerate() {
            let sides = if (round + index) % 2 == 0 {
                [Side::Base, Side::Head]
            } else {
                [Side::Head, Side::Base]
            };
            for side in sides {
                order.push((round, *journey, side));
            }
        }
    }
    order
}

#[derive(Serialize)]
struct SideReport {
    slots: Vec<Slot>,
    result: Slot,
    blame: Option<Blame>,
    check: Option<String>,
    detail: Option<String>,
    cases: BTreeMap<String, String>,
    seconds: Vec<f64>,
    median_seconds: Option<f64>,
    spread: Option<f64>,
}

#[derive(Serialize)]
struct JourneyReport {
    journey: Journey,
    base: SideReport,
    head: SideReport,
    against_base: Timing,
    timing_note: Option<String>,
    base_change: Option<f64>,
    history_reference_seconds: Option<f64>,
    against_history: Timing,
    history_change: Option<f64>,
    verdict: &'static str,
}

#[derive(Serialize)]
struct Summary {
    schema: u32,
    result: &'static str,
    base: Value,
    head: Value,
    runs: usize,
    threshold: f64,
    journeys: Vec<JourneyReport>,
    flakes: Vec<String>,
    regressions: Vec<String>,
    red: Vec<String>,
    inconclusive: Vec<String>,
    unmeasured: Vec<String>,
    not_run: Vec<String>,
    rerun: Vec<String>,
    wall_seconds: f64,
    limits: Vec<&'static str>,
}

fn cases_of(attempts: &[&Attempt]) -> BTreeMap<String, String> {
    fn rank(status: &str) -> u8 {
        match status {
            "failed" => 4,
            "interrupted" => 3,
            "skipped" => 2,
            _ => 1,
        }
    }
    let mut merged: BTreeMap<String, String> = BTreeMap::new();
    for attempt in attempts {
        for (case, status) in &attempt.cases {
            let keep = merged.get(case).is_none_or(|old| rank(status) > rank(old));
            if keep {
                merged.insert(case.clone(), status.clone());
            }
        }
    }
    merged
}

fn blamed_attempt<'a>(attempts: &[&'a Attempt]) -> Option<&'a Attempt> {
    attempts
        .iter()
        .copied()
        .filter(|attempt| attempt.ended != Ended::Passed)
        .min_by_key(|attempt| Blame::precedence(attempt))
}

fn side_report(all: &[Attempt], journey: Journey, side: Side) -> Option<SideReport> {
    let mine: Vec<&Attempt> = all
        .iter()
        .filter(|attempt| attempt.journey == journey && attempt.side == side)
        .collect();
    if mine.is_empty() {
        return None;
    }
    let rounds: std::collections::BTreeSet<usize> =
        mine.iter().map(|attempt| attempt.round).collect();
    let mut slots = Vec::new();
    let mut finals: Vec<&Attempt> = Vec::new();
    let mut seconds = Vec::new();
    let mut reds: Vec<&Attempt> = Vec::new();
    for round in rounds {
        let attempts: Vec<&Attempt> = mine
            .iter()
            .copied()
            .filter(|attempt| attempt.round == round)
            .collect();
        let slot = slot_outcome(&attempts)?;
        let last = *attempts.last()?;
        finals.push(last);
        if slot == Slot::Green {
            seconds.push(attempts[0].seconds);
        } else if slot == Slot::Flake {
            seconds.push(last.seconds);
        } else {
            reds.extend(attempts.iter().copied());
        }
        slots.push(slot);
    }
    let result = if slots.contains(&Slot::Red) {
        Slot::Red
    } else if slots.contains(&Slot::Flake) {
        Slot::Flake
    } else {
        Slot::Green
    };
    let failing = blamed_attempt(if reds.is_empty() { &mine } else { &reds });
    let median_seconds = median(&seconds);
    let spread = median_seconds.filter(|m| *m > 0.0).and_then(|m| {
        let low = seconds.iter().copied().fold(f64::INFINITY, f64::min);
        let high = seconds.iter().copied().fold(0.0, f64::max);
        seconds.len().checked_sub(1).map(|_| (high - low) / m)
    });
    Some(SideReport {
        slots,
        result,
        blame: failing.and_then(|attempt| attempt.blame),
        check: failing.and_then(|attempt| attempt.check.clone()),
        detail: failing.and_then(|attempt| attempt.detail.clone()),
        cases: cases_of(&finals),
        seconds,
        median_seconds,
        spread,
    })
}

fn timing_gap(base: &SideReport, head: &SideReport) -> String {
    let red = |side: &SideReport| side.slots.iter().filter(|slot| **slot == Slot::Red).count();
    if head.result == Slot::Red {
        format!(
            "Head failed in {} of {} rounds, so its timing was not compared with base.",
            red(head),
            head.slots.len()
        )
    } else if base.result == Slot::Red {
        format!(
            "The timing comparison with base did not run. Base failed in {} of {} rounds ({:?} blame, check {}), so it has too few timed runs.",
            red(base),
            base.slots.len(),
            base.blame.unwrap_or(Blame::Unknown),
            base.check.as_deref().unwrap_or("unknown")
        )
    } else {
        format!(
            "The timing comparison with base did not run. It needs {MINIMUM_TIMED_RUNS} timed runs on each side and has {} on base and {} on head.",
            base.seconds.len(),
            head.seconds.len()
        )
    }
}

struct Judged {
    reports: Vec<JourneyReport>,
}

fn judge(
    all: &[Attempt],
    journeys: &[Journey],
    threshold: f64,
    history: &[Value],
) -> Result<Judged> {
    let mut reports = Vec::new();
    for journey in journeys {
        let base = side_report(all, *journey, Side::Base)
            .with_context(|| format!("The {} journey has no complete base run", journey.name()))?;
        let head = side_report(all, *journey, Side::Head)
            .with_context(|| format!("The {} journey has no complete head run", journey.name()))?;
        let timed = base.seconds.len() >= MINIMUM_TIMED_RUNS
            && head.seconds.len() >= MINIMUM_TIMED_RUNS
            && head.result != Slot::Red;
        let against_base = if timed {
            judge_timing(base.median_seconds, head.median_seconds, threshold)
        } else {
            Timing::Unmeasured
        };
        let timing_note = (!timed).then(|| timing_gap(&base, &head));
        let reference = history_reference(history, *journey);
        let against_history =
            if head.seconds.len() >= MINIMUM_TIMED_RUNS && head.result != Slot::Red {
                judge_timing(reference, head.median_seconds, threshold)
            } else {
                Timing::Unmeasured
            };
        let change = |reference: Option<f64>, head: Option<f64>| match (reference, head) {
            (Some(reference), Some(head)) if reference > 0.0 => Some(head / reference - 1.0),
            _ => None,
        };
        let verdict = if head.result == Slot::Red && head.blame == Some(Blame::Product) {
            "red"
        } else if head.result == Slot::Red {
            "inconclusive"
        } else if against_base == Timing::Regression || against_history == Timing::Regression {
            "regression"
        } else if head.result == Slot::Flake || base.result == Slot::Flake {
            "flake"
        } else {
            "green"
        };
        reports.push(JourneyReport {
            journey: *journey,
            base_change: change(base.median_seconds, head.median_seconds),
            history_reference_seconds: reference,
            history_change: change(reference, head.median_seconds),
            base,
            head,
            against_base,
            timing_note,
            against_history,
            verdict,
        });
    }
    Ok(Judged { reports })
}

type Runner<'a> = dyn FnMut(usize, Journey, Side) -> Result<Vec<Attempt>> + 'a;

fn regressed(judged: &Judged) -> Vec<Journey> {
    judged
        .reports
        .iter()
        .filter(|report| report.verdict == "regression")
        .map(|report| report.journey)
        .collect()
}

fn collect(
    runner: &mut Runner,
    journeys: &[Journey],
    runs: usize,
    threshold: f64,
    history: &[Value],
) -> Result<(Vec<Attempt>, Judged, Vec<Journey>)> {
    let mut all: Vec<Attempt> = Vec::new();
    for (round, journey, side) in schedule(journeys, runs) {
        all.extend(runner(round, journey, side)?);
    }
    let mut judged = judge(&all, journeys, threshold, history)?;
    let flagged = regressed(&judged);
    if !flagged.is_empty() {
        for (round, journey, side) in schedule(&flagged, RERUN_ROUNDS) {
            all.extend(runner(runs + round, journey, side)?);
        }
        judged = judge(&all, journeys, threshold, history)?;
    }
    Ok((all, judged, flagged))
}

fn unmeasured(reports: &[JourneyReport]) -> Vec<String> {
    reports
        .iter()
        .filter_map(|report| {
            report
                .timing_note
                .as_ref()
                .map(|note| format!("{}: {note}", report.journey.name()))
        })
        .collect()
}

fn names(reports: &[JourneyReport], verdict: &str) -> Vec<String> {
    reports
        .iter()
        .filter(|report| report.verdict == verdict)
        .map(|report| report.journey.name().to_owned())
        .collect()
}

fn overall(reports: &[JourneyReport]) -> &'static str {
    let any = |verdict: &str| reports.iter().any(|report| report.verdict == verdict);
    if any("red") || any("regression") {
        "red"
    } else if any("inconclusive") {
        "inconclusive"
    } else if any("flake") {
        "flaky"
    } else {
        "green"
    }
}

struct Build {
    side: Side,
    binary: PathBuf,
    sha256: String,
    assets: PathBuf,
}

struct Options {
    base: Build,
    head: Build,
    hc: Pinned,
    evidence: PathBuf,
    runs: usize,
    threshold: f64,
    history: Option<PathBuf>,
    journeys: Vec<Journey>,
    not_run: Vec<String>,
    fixtures: PathBuf,
}

fn journey_inputs(
    journey: Journey,
    other: &Build,
    fixtures: &Path,
) -> Result<Vec<OsString>, String> {
    match journey {
        Journey::Profile => {
            let theme = fixtures.join("profile-theme");
            let document = fixtures.join("core-document").join("verifier-probe.json");
            if !theme.is_dir() || !document.is_file() {
                return Err(format!(
                    "the committed profile fixtures are missing under {}",
                    fixtures.display()
                ));
            }
            let mut args: Vec<OsString> = vec!["--profile-fixture".into(), theme.into()];
            args.extend(core_document("voyager-verifier-probe", &document));
            args.push("--second-binary".into());
            args.push(other.binary.clone().into());
            args.push("--second-sha256".into());
            args.push(other.sha256.clone().into());
            args.push("--second-assets".into());
            args.push(other.assets.clone().into());
            Ok(args)
        }
        Journey::ProfileUpdates => {
            let updates = fixtures.join("profile-updates");
            if !updates.is_dir() {
                return Err(format!(
                    "the committed profile fixture is missing under {}",
                    fixtures.display()
                ));
            }
            Ok(vec!["--profile-fixture".into(), updates.into()])
        }
        Journey::ManifestVessel => {
            let seeded = fixtures.join("manifest-vessel");
            if !seeded.is_dir() {
                return Err(format!(
                    "the committed profile fixture is missing under {}",
                    fixtures.display()
                ));
            }
            Ok(vec!["--profile-fixture".into(), seeded.into()])
        }
        Journey::LayoutCompat => layout_seed(fixtures, "newer-additions.json"),
        Journey::LayoutRefused => layout_seed(fixtures, "newer-min-reader.json"),
        Journey::LayoutCorrupt => layout_seed(fixtures, "corrupt.json"),
        Journey::Voice => Err(
            "it needs --audio on and a --voice-engine folder, which the battery does not supply"
                .into(),
        ),
        _ => Ok(Vec::new()),
    }
}

fn core_document(name: &str, file: &Path) -> [OsString; 2] {
    let mut named = OsString::from(format!("{name}="));
    named.push(file);
    ["--core-document".into(), named]
}

fn layout_seed(fixtures: &Path, file: &str) -> Result<Vec<OsString>, String> {
    let seed = fixtures.join("layout-compat").join(file);
    if !seed.is_file() {
        return Err(format!(
            "the committed layout fixture {file} is missing under {}",
            fixtures.display()
        ));
    }
    Ok(core_document(DOCUMENT, &seed).into())
}

fn split_runnable(options: &Options) -> (Vec<Journey>, Vec<String>) {
    let mut runnable = Vec::new();
    let mut not_run = Vec::new();
    for journey in &options.journeys {
        match journey_inputs(*journey, &options.base, &options.fixtures) {
            Ok(_) => runnable.push(*journey),
            Err(reason) => not_run.push(format!("{}: {reason}", journey.name())),
        }
    }
    (runnable, not_run)
}

fn parse(args: &[String]) -> Result<Options> {
    ensure!(args.len().is_multiple_of(2), "Every option needs a value");
    let accepted = [
        "--base",
        "--base-assets",
        "--head",
        "--head-assets",
        "--evidence",
        "--runs",
        "--threshold",
        "--history",
        "--journeys",
        "--fixtures",
    ];
    let mut given: BTreeMap<&str, &str> = BTreeMap::new();
    for pair in args.as_chunks::<2>().0 {
        ensure!(
            accepted.contains(&pair[0].as_str()),
            "Unsupported option {}",
            pair[0]
        );
        ensure!(
            given.insert(&pair[0], &pair[1]).is_none(),
            "Duplicate option {}",
            pair[0]
        );
    }
    let need = |name: &str| -> Result<&str> {
        given
            .get(name)
            .copied()
            .with_context(|| format!("Missing {name}"))
    };
    let build = |side: Side, binary: &str, assets: &str| -> Result<Build> {
        let binary = fs::canonicalize(binary).with_context(|| format!("The {side:?} binary"))?;
        let assets = fs::canonicalize(assets).with_context(|| format!("The {side:?} assets"))?;
        system::check_assets(&binary, &assets)
            .with_context(|| format!("The {side:?} candidate assets"))?;
        Ok(Build {
            side,
            sha256: system::digest(&binary)?,
            binary,
            assets,
        })
    };
    let runs: usize = given.get("--runs").map_or(Ok(3), |text| text.parse())?;
    ensure!(runs >= 1, "--runs must be at least 1");
    let threshold: f64 = given
        .get("--threshold")
        .map_or(Ok(0.15), |text| text.parse())?;
    ensure!(
        threshold.is_finite() && threshold > 0.0,
        "--threshold must be a positive fraction"
    );
    let journeys = match given.get("--journeys") {
        None => Journey::ALL.to_vec(),
        Some(list) => list
            .split(',')
            .map(Journey::parse)
            .collect::<Result<Vec<_>>>()?,
    };
    ensure!(!journeys.is_empty(), "--journeys named no journey");
    let hc_path = system::core_binary()?;
    let hc = Pinned::check(&hc_path, &system::digest(&hc_path)?).context("Core")?;
    let head_assets = need("--head-assets")?;
    let fixtures = match given.get("--fixtures") {
        Some(path) => PathBuf::from(path),
        None => fs::canonicalize(head_assets)?
            .ancestors()
            .nth(2)
            .map_or_else(PathBuf::new, |root| root.join("tests/native/fixtures")),
    };
    Ok(Options {
        base: build(Side::Base, need("--base")?, need("--base-assets")?)?,
        head: build(Side::Head, need("--head")?, need("--head-assets")?)?,
        hc,
        evidence: PathBuf::from(need("--evidence")?),
        runs,
        threshold,
        history: given.get("--history").map(PathBuf::from),
        journeys,
        not_run: Vec::new(),
        fixtures,
    })
}

fn read_history(path: &Path) -> Result<Vec<Value>> {
    match fs::read_to_string(path) {
        Ok(text) => text
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| serde_json::from_str(line).context("A history line is not JSON"))
            .collect(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error.into()),
    }
}

fn read_attempt(
    build: &Build,
    journey: Journey,
    round: usize,
    attempt: u8,
    seconds: f64,
    evidence: PathBuf,
) -> Attempt {
    let checks: Option<Value> = fs::read(evidence.join("checks.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok());
    let observations: Option<Value> = fs::read(evidence.join("observations.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok());
    let cases = observations
        .as_ref()
        .and_then(|value| value["cases"].as_array())
        .map(|list| {
            list.iter()
                .filter_map(|case| {
                    Some((
                        case["case"].as_str()?.to_owned(),
                        case["status"].as_str()?.to_owned(),
                    ))
                })
                .collect()
        })
        .unwrap_or_default();
    let ended = match checks
        .as_ref()
        .and_then(|value| value["runtimeResult"].as_str())
    {
        Some("passed") => Ended::Passed,
        Some("failed") => Ended::Failed,
        Some(_) => Ended::Inconclusive,
        None => Ended::NoVerdict,
    };
    let first = checks.as_ref().map(|value| &value["firstFailingCheck"]);
    let text = |key: &str| {
        first
            .and_then(|value| value[key].as_str())
            .map(str::to_owned)
    };
    Attempt {
        side: build.side,
        journey,
        round,
        attempt,
        seconds,
        ended,
        blame: (ended != Ended::Passed).then(|| {
            if ended == Ended::NoVerdict {
                Blame::Unknown
            } else {
                Blame::parse(text("blame").as_deref())
            }
        }),
        check: text("check")
            .or_else(|| (ended == Ended::NoVerdict).then(|| "no-verdict".to_owned())),
        detail: text("detail").or_else(|| {
            (ended == Ended::NoVerdict)
                .then(|| "The run ended without writing checks.json".to_owned())
        }),
        cases,
        evidence,
    }
}

fn attempt(
    options: &Options,
    verifier: &Path,
    journey: Journey,
    side: Side,
    round: usize,
    number: u8,
) -> Result<Attempt> {
    let (build, other) = match side {
        Side::Base => (&options.base, &options.head),
        Side::Head => (&options.head, &options.base),
    };
    let inputs = journey_inputs(journey, other, &options.fixtures)
        .map_err(|reason| anyhow!("{}: {reason}", journey.name()))?;
    let name = format!("{side:?}-{}-r{round}-a{number}", journey.name()).to_lowercase();
    let evidence = options.evidence.join("runs").join(&name);
    let logs = options.evidence.join("logs");
    fs::create_dir_all(evidence.parent().context("A run folder has a parent")?)?;
    fs::create_dir_all(&logs)?;
    let stderr = fs::File::create(logs.join(format!("{name}.stderr")))?;
    let mut child = Command::new(verifier)
        .args(["run", "--journey", journey.name(), "--binary"])
        .arg(&build.binary)
        .args(["--sha256", &build.sha256, "--hc-sha256", &options.hc.sha256])
        .arg("--assets")
        .arg(&build.assets)
        .arg("--evidence")
        .arg(&evidence)
        .args(&inputs)
        .stdout(Stdio::null())
        .stderr(stderr)
        .spawn()
        .context("The run could not start")?;
    let started = Instant::now();
    loop {
        if child.try_wait()?.is_some() {
            break;
        }
        if system::interrupted() {
            if let Some(pid) = rustix::process::Pid::from_raw(child.id() as i32) {
                let _ = rustix::process::kill_process(pid, rustix::process::Signal::TERM);
            }
            child.wait()?;
            bail!("Battery cancelled; the running journey was told to end");
        }
        sleep(Duration::from_millis(100));
    }
    let seconds = started.elapsed().as_secs_f64();
    Ok(read_attempt(
        build, journey, round, number, seconds, evidence,
    ))
}

fn describe(build: &Build) -> Value {
    json!({"binary":build.binary,"sha256":build.sha256,"assets":build.assets})
}

fn markdown(summary: &Summary) -> String {
    let mut text = format!(
        "# Battery {}\n\nHead {}, base {}. {} runs for each journey and side, threshold {:.0} percent, {:.0} s.\n\n| Journey | Verdict | Head | Base | Head s | Base s | vs base | vs history |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n",
        summary.result,
        &summary.head["sha256"].as_str().unwrap_or("")[..12],
        &summary.base["sha256"].as_str().unwrap_or("")[..12],
        summary.runs,
        summary.threshold * 100.0,
        summary.wall_seconds
    );
    let seconds = |value: Option<f64>| value.map_or("-".to_owned(), |v| format!("{v:.1}"));
    let change =
        |value: Option<f64>| value.map_or("-".to_owned(), |v| format!("{:+.1}%", v * 100.0));
    for report in &summary.journeys {
        text += &format!(
            "| {} | {} | {:?} | {:?} | {} | {} | {} | {} |\n",
            report.journey.name(),
            report.verdict,
            report.head.result,
            report.base.result,
            seconds(report.head.median_seconds),
            seconds(report.base.median_seconds),
            change(report.base_change),
            change(report.history_change),
        );
        if let Some(note) = &report.timing_note {
            text += &format!("|  | timing not compared | {note} |  |  |  |  |  |\n");
        }
        if let Some(check) = &report.head.check {
            text += &format!(
                "|  | head failure | {:?} blame | check {} | {} |  |  |  |\n",
                report.head.blame.unwrap_or(Blame::Unknown),
                check,
                report
                    .head
                    .detail
                    .as_deref()
                    .unwrap_or("")
                    .replace('|', "/")
            );
        }
    }
    for entry in &summary.not_run {
        text += &format!("\nNot run, neither green nor red: {entry}\n");
    }
    text += "\nA flake is a run that failed once and passed on its rerun. Wall time is the whole `run` command, including the sandbox and display start. A journey flagged as a regression is rerun for 5 more interleaved rounds and judged on all of its rounds. Read `battery.json` for every run.\n";
    text
}

pub fn run(args: &[String]) -> Result<i32> {
    let mut options = parse(args)?;
    let (runnable, not_run) = split_runnable(&options);
    ensure!(
        !runnable.is_empty(),
        "No selected journey could run: {}",
        not_run.join("; ")
    );
    options.journeys = runnable;
    options.not_run = not_run;
    let verifier = std::env::current_exe()?;
    ensure!(
        options.evidence.is_absolute(),
        "Evidence path must be absolute"
    );
    fs::create_dir(&options.evidence)
        .context("Evidence must be a new directory with an existing parent")?;
    system::listen_for_cancel()?;
    let history = match &options.history {
        Some(path) => read_history(path)?,
        None => Vec::new(),
    };
    let started = Instant::now();
    let mut runner = |round: usize, journey: Journey, side: Side| -> Result<Vec<Attempt>> {
        let mut made = Vec::new();
        let mut number = 1;
        loop {
            let done = attempt(&options, &verifier, journey, side, round, number)?;
            let passed = done.ended == Ended::Passed;
            eprintln!(
                "{} {:?} round {round} attempt {number}: {:?} in {:.1} s",
                journey.name(),
                side,
                done.ended,
                done.seconds
            );
            made.push(done);
            if passed || number == 2 {
                return Ok(made);
            }
            number += 1;
        }
    };
    let (_, judged, rerun) = collect(
        &mut runner,
        &options.journeys,
        options.runs,
        options.threshold,
        &history,
    )?;
    let summary = Summary {
        schema: 1,
        result: overall(&judged.reports),
        base: describe(&options.base),
        head: describe(&options.head),
        runs: options.runs,
        threshold: options.threshold,
        flakes: names(&judged.reports, "flake"),
        regressions: names(&judged.reports, "regression"),
        red: names(&judged.reports, "red"),
        inconclusive: names(&judged.reports, "inconclusive"),
        unmeasured: unmeasured(&judged.reports),
        not_run: options.not_run.clone(),
        rerun: rerun
            .iter()
            .map(|journey| journey.name().to_owned())
            .collect(),
        journeys: judged.reports,
        wall_seconds: started.elapsed().as_secs_f64(),
        limits: vec![
            "Wall time is the whole run command, so fixed sandbox and display start-up dilutes a slowdown",
            "The history comparison spans machine load at different times; only the interleaved base comparison shares load",
            "Linux X11 only; no real display, GPU or model calls",
        ],
    };
    system::save(options.evidence.join("battery.json"), &summary)?;
    fs::write(options.evidence.join("battery.md"), markdown(&summary))?;
    let mut ledger = json!({"head":summary.head["sha256"],"medians":{}});
    for report in &summary.journeys {
        if let Some(seconds) = report.head.median_seconds {
            ledger["medians"][report.journey.name()] = json!(seconds);
        }
    }
    if let (Some(path), "green" | "flaky") = (&options.history, summary.result) {
        use std::io::Write;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)?;
        writeln!(file, "{ledger}")?;
    }
    println!("{}", serde_json::to_string_pretty(&summary)?);
    Ok(match summary.result {
        "green" | "flaky" => 0,
        "red" => 1,
        _ => 2,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run_of(
        journey: Journey,
        side: Side,
        round: usize,
        number: u8,
        ended: Ended,
        seconds: f64,
    ) -> Attempt {
        Attempt {
            side,
            journey,
            round,
            attempt: number,
            seconds,
            ended,
            blame: (ended != Ended::Passed).then_some(Blame::Product),
            check: (ended != Ended::Passed).then(|| "case".to_owned()),
            detail: None,
            cases: BTreeMap::new(),
            evidence: PathBuf::new(),
        }
    }

    fn both(journey: Journey, base: &[f64], head: &[f64]) -> Vec<Attempt> {
        let mut all = Vec::new();
        for (round, seconds) in base.iter().enumerate() {
            all.push(run_of(
                journey,
                Side::Base,
                round,
                1,
                Ended::Passed,
                *seconds,
            ));
        }
        for (round, seconds) in head.iter().enumerate() {
            all.push(run_of(
                journey,
                Side::Head,
                round,
                1,
                Ended::Passed,
                *seconds,
            ));
        }
        all
    }

    fn build(side: Side, name: &str) -> Build {
        Build {
            side,
            binary: PathBuf::from(format!("/builds/{name}/app")),
            sha256: format!("hash-{name}"),
            assets: PathBuf::from(format!("/builds/{name}/assets")),
        }
    }

    fn fixtures_in(root: &Path) -> PathBuf {
        fs::create_dir_all(root.join("profile-theme")).unwrap();
        fs::create_dir_all(root.join("core-document")).unwrap();
        fs::write(root.join("core-document/verifier-probe.json"), "{}").unwrap();
        root.to_path_buf()
    }

    #[test]
    fn profile_runs_on_the_other_sides_build_with_the_committed_fixtures() {
        let root = std::env::temp_dir().join(format!("battery-fixtures-{}", std::process::id()));
        let fixtures = fixtures_in(&root);
        let (base, head) = (build(Side::Base, "base"), build(Side::Head, "head"));
        let on_head = journey_inputs(Journey::Profile, &base, &fixtures).unwrap();
        let text: Vec<String> = on_head
            .iter()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        let after = |flag: &str| {
            let at = text.iter().position(|arg| arg == flag).unwrap();
            text[at + 1].clone()
        };
        assert_eq!(after("--second-binary"), "/builds/base/app");
        assert_eq!(after("--second-sha256"), "hash-base");
        assert_eq!(after("--second-assets"), "/builds/base/assets");
        assert!(after("--profile-fixture").ends_with("profile-theme"));
        assert!(after("--core-document").starts_with("voyager-verifier-probe="));
        let on_base = journey_inputs(Journey::Profile, &head, &fixtures).unwrap();
        assert!(on_base.iter().any(|arg| arg == "/builds/head/app"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn profile_with_missing_fixtures_is_not_run_with_a_reason() {
        let base = build(Side::Base, "base");
        let reason = journey_inputs(Journey::Profile, &base, Path::new("/nowhere")).unwrap_err();
        assert!(reason.contains("fixtures are missing"));
    }

    #[test]
    fn journeys_without_inputs_get_none() {
        let base = build(Side::Base, "base");
        let seeded = [
            Journey::Profile,
            Journey::ProfileUpdates,
            Journey::ManifestVessel,
            Journey::LayoutCompat,
            Journey::LayoutRefused,
            Journey::LayoutCorrupt,
            Journey::Voice,
        ];
        for journey in Journey::ALL.iter().filter(|j| !seeded.contains(j)) {
            let args = journey_inputs(*journey, &base, Path::new("/nowhere")).unwrap();
            assert!(args.is_empty());
        }
    }

    #[test]
    fn the_voice_journey_is_not_run_because_the_battery_has_no_engine_to_give_it() {
        let base = build(Side::Base, "base");
        let reason = journey_inputs(Journey::Voice, &base, Path::new("/nowhere")).unwrap_err();
        assert!(reason.contains("--voice-engine"), "{reason}");
    }

    #[test]
    fn profile_updates_takes_its_fixture_and_is_not_run_without_it() {
        let base = build(Side::Base, "base");
        let root =
            std::env::temp_dir().join(format!("voyager-battery-updates-{}", std::process::id()));
        fs::create_dir_all(root.join("profile-updates")).unwrap();
        let args = journey_inputs(Journey::ProfileUpdates, &base, &root).unwrap();
        assert_eq!(args[0], "--profile-fixture");
        assert!(Path::new(&args[1]).ends_with("profile-updates"));
        fs::remove_dir_all(root).unwrap();
        let reason =
            journey_inputs(Journey::ProfileUpdates, &base, Path::new("/nowhere")).unwrap_err();
        assert!(reason.contains("fixture is missing"));
    }

    #[test]
    fn manifest_vessel_takes_its_fixture_and_is_not_run_without_it() {
        let base = build(Side::Base, "base");
        let root =
            std::env::temp_dir().join(format!("voyager-battery-manifest-{}", std::process::id()));
        fs::create_dir_all(root.join("manifest-vessel")).unwrap();
        let args = journey_inputs(Journey::ManifestVessel, &base, &root).unwrap();
        assert_eq!(args[0], "--profile-fixture");
        assert!(Path::new(&args[1]).ends_with("manifest-vessel"));
        fs::remove_dir_all(root).unwrap();
        let reason =
            journey_inputs(Journey::ManifestVessel, &base, Path::new("/nowhere")).unwrap_err();
        assert!(reason.contains("fixture is missing"));
    }

    #[test]
    fn each_layout_journey_is_seeded_with_the_committed_fixture_it_needs() {
        use voyager_contract::layout_document::{Reading, read};
        let base = build(Side::Base, "base");
        let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures");
        for journey in [
            Journey::LayoutCompat,
            Journey::LayoutRefused,
            Journey::LayoutCorrupt,
        ] {
            let args = journey_inputs(journey, &base, &fixtures).unwrap();
            assert_eq!(args.len(), 2, "{}", journey.name());
            assert_eq!(args[0], "--core-document");
            let named = args[1].to_string_lossy().into_owned();
            let (name, file) = named.split_once('=').unwrap();
            assert_eq!(name, DOCUMENT);
            let document: Value = serde_json::from_str(&fs::read_to_string(file).unwrap()).unwrap();
            let reading = read(document);
            let fits = match journey {
                Journey::LayoutCompat => matches!(reading, Reading::Open { .. }),
                Journey::LayoutRefused => matches!(reading, Reading::Newer { .. }),
                _ => matches!(reading, Reading::Unreadable { .. }),
            };
            assert!(fits, "{} is seeded with {file}", journey.name());
        }
    }

    #[test]
    fn a_layout_journey_without_its_fixture_is_not_run_with_a_reason() {
        let base = build(Side::Base, "base");
        for journey in [
            Journey::LayoutCompat,
            Journey::LayoutRefused,
            Journey::LayoutCorrupt,
        ] {
            let reason = journey_inputs(journey, &base, Path::new("/nowhere")).unwrap_err();
            assert!(reason.contains("fixture"), "{reason}");
        }
    }

    const J: Journey = Journey::TerminalScrolling;

    #[test]
    fn median_is_the_middle_value() {
        assert_eq!(median(&[3.0, 1.0, 2.0]), Some(2.0));
        assert_eq!(median(&[1.0, 2.0, 3.0, 10.0]), Some(2.5));
        assert_eq!(median(&[]), None);
    }

    #[test]
    fn a_fifteen_percent_threshold_is_exclusive() {
        assert_eq!(judge_timing(Some(100.0), Some(115.0), 0.15), Timing::Within);
        assert_eq!(
            judge_timing(Some(100.0), Some(115.5), 0.15),
            Timing::Regression
        );
        assert_eq!(judge_timing(None, Some(1.0), 0.15), Timing::Unmeasured);
    }

    #[test]
    fn equal_builds_are_green_and_a_slow_head_is_a_regression() {
        let equal = judge(
            &both(J, &[20.0, 21.0, 20.5], &[20.2, 20.8, 21.0]),
            &[J],
            0.15,
            &[],
        )
        .expect("a judgement");
        assert_eq!(equal.reports[0].verdict, "green");
        let slow = judge(
            &both(J, &[20.0, 21.0, 20.5], &[26.0, 25.0, 27.0]),
            &[J],
            0.15,
            &[],
        )
        .expect("a judgement");
        assert_eq!(slow.reports[0].verdict, "regression");
        assert_eq!(overall(&slow.reports), "red");
    }

    #[test]
    fn one_load_spike_does_not_move_the_median() {
        let spiked = judge(
            &both(J, &[20.0, 21.0, 20.5], &[20.0, 60.0, 20.5]),
            &[J],
            0.15,
            &[],
        )
        .expect("a judgement");
        assert_eq!(spiked.reports[0].verdict, "green");
    }

    #[test]
    fn a_failure_that_passes_on_rerun_is_a_flake() {
        let mut all = both(J, &[20.0, 21.0], &[20.0, 21.0]);
        all[2] = run_of(J, Side::Head, 0, 1, Ended::Failed, 5.0);
        all.push(run_of(J, Side::Head, 0, 2, Ended::Passed, 20.0));
        let judged = judge(&all, &[J], 0.15, &[]).expect("a judgement");
        assert_eq!(judged.reports[0].verdict, "flake");
        assert_eq!(judged.reports[0].head.result, Slot::Flake);
        assert_eq!(overall(&judged.reports), "flaky");
    }

    #[test]
    fn a_failure_that_fails_again_is_red_with_its_blame() {
        let mut all = both(J, &[20.0, 21.0], &[20.0, 21.0]);
        all[2] = run_of(J, Side::Head, 0, 1, Ended::Failed, 5.0);
        all.push(run_of(J, Side::Head, 0, 2, Ended::Failed, 5.0));
        let judged = judge(&all, &[J], 0.15, &[]).expect("a judgement");
        assert_eq!(judged.reports[0].verdict, "red");
        assert_eq!(judged.reports[0].head.blame, Some(Blame::Product));
        assert_eq!(judged.reports[0].against_base, Timing::Unmeasured);
    }

    #[test]
    fn a_run_without_a_verdict_is_inconclusive_not_red() {
        let mut all = both(J, &[20.0, 21.0], &[20.0, 21.0]);
        for number in [1, 2] {
            let mut missing = run_of(J, Side::Head, 0, number, Ended::NoVerdict, 1.0);
            missing.blame = Some(Blame::Unknown);
            all.push(missing);
        }
        all.remove(2);
        let judged = judge(&all, &[J], 0.15, &[]).expect("a judgement");
        assert_eq!(judged.reports[0].verdict, "inconclusive");
        assert_eq!(overall(&judged.reports), "inconclusive");
    }

    #[test]
    fn a_journey_with_no_runs_is_an_error() {
        let error = judge(&[], &[J], 0.15, &[]).err().expect("an error");
        assert!(error.to_string().contains("terminal-scrolling"));
    }

    #[test]
    fn a_journey_that_is_not_registered_is_refused() {
        assert!(Journey::parse("no-such-journey").is_err());
    }

    #[test]
    fn history_uses_the_last_ten_heads() {
        let lines: Vec<Value> = (0..15)
            .map(|index| json!({"medians":{"terminal-scrolling": 100.0 + f64::from(index)}}))
            .collect();
        assert_eq!(history_reference(&lines, J), Some(109.5));
        assert_eq!(history_reference(&[], J), None);
        let drifted = judge(
            &both(J, &[20.0, 20.0], &[20.0, 20.0]),
            &[J],
            0.15,
            &[json!({"medians":{"terminal-scrolling": 10.0}})],
        )
        .expect("a judgement");
        assert_eq!(drifted.reports[0].against_history, Timing::Regression);
        assert_eq!(drifted.reports[0].verdict, "regression");
    }

    fn passes(journey: Journey, side: Side, round: usize, seconds: f64) -> Vec<Attempt> {
        vec![run_of(journey, side, round, 1, Ended::Passed, seconds)]
    }

    fn red_round(side: Side, round: usize, blame: Blame) -> Vec<Attempt> {
        (1..=2)
            .map(|number| {
                let mut failed = run_of(J, side, round, number, Ended::Failed, 5.0);
                failed.blame = Some(blame);
                failed.check = Some(format!("{blame:?}").to_lowercase());
                failed
            })
            .collect()
    }

    #[test]
    fn product_blame_wins_in_either_round_order() {
        for order in [
            [Blame::Product, Blame::Fixture],
            [Blame::Fixture, Blame::Product],
        ] {
            let mut all = both(J, &[20.0, 21.0], &[]);
            all.extend(red_round(Side::Head, 0, order[0]));
            all.extend(red_round(Side::Head, 1, order[1]));
            let judged = judge(&all, &[J], 0.15, &[]).expect("a judgement");
            assert_eq!(judged.reports[0].head.blame, Some(Blame::Product));
            assert_eq!(judged.reports[0].head.check.as_deref(), Some("product"));
            assert_eq!(judged.reports[0].verdict, "red");
        }
    }

    #[test]
    fn fixture_blame_outranks_unknown_in_either_round_order() {
        for order in [
            [Blame::Unknown, Blame::Fixture],
            [Blame::Fixture, Blame::Unknown],
        ] {
            let mut all = both(J, &[20.0, 21.0], &[]);
            all.extend(red_round(Side::Head, 0, order[0]));
            all.extend(red_round(Side::Head, 1, order[1]));
            let judged = judge(&all, &[J], 0.15, &[]).expect("a judgement");
            assert_eq!(judged.reports[0].head.blame, Some(Blame::Fixture));
            assert_eq!(judged.reports[0].verdict, "inconclusive");
        }
    }

    fn failed(side: Side, round: usize, number: u8, blame: Blame) -> Attempt {
        let mut attempt = run_of(J, side, round, number, Ended::Failed, 5.0);
        attempt.blame = Some(blame);
        attempt.check = Some(format!("{blame:?}").to_lowercase());
        attempt
    }

    fn head_blame(attempts: Vec<Attempt>) -> (Option<Blame>, Option<String>, &'static str) {
        let mut all = both(J, &[20.0, 21.0], &[]);
        all.extend(attempts);
        let judged = judge(&all, &[J], 0.15, &[]).expect("a judgement");
        let report = &judged.reports[0];
        (report.head.blame, report.head.check.clone(), report.verdict)
    }

    #[test]
    fn blame_ignores_attempt_order_inside_one_round() {
        for pair in [
            [Blame::Product, Blame::Unknown],
            [Blame::Unknown, Blame::Product],
        ] {
            let (blame, check, verdict) = head_blame(vec![
                failed(Side::Head, 0, 1, pair[0]),
                failed(Side::Head, 0, 2, pair[1]),
            ]);
            assert_eq!(blame, Some(Blame::Product));
            assert_eq!(check.as_deref(), Some("product"));
            assert_eq!(verdict, "red");
        }
    }

    #[test]
    fn a_fixture_retry_is_blamed_on_the_fixture() {
        for pair in [
            [Blame::Fixture, Blame::Unknown],
            [Blame::Unknown, Blame::Fixture],
        ] {
            let (blame, _, verdict) = head_blame(vec![
                failed(Side::Head, 0, 1, pair[0]),
                failed(Side::Head, 0, 2, pair[1]),
            ]);
            assert_eq!(blame, Some(Blame::Fixture));
            assert_eq!(verdict, "inconclusive");
        }
    }

    #[test]
    fn mixed_rounds_pool_every_failed_attempt() {
        let (blame, _, verdict) = head_blame(vec![
            failed(Side::Head, 0, 1, Blame::Unknown),
            failed(Side::Head, 0, 2, Blame::Fixture),
            failed(Side::Head, 1, 1, Blame::Unknown),
            failed(Side::Head, 1, 2, Blame::Product),
        ]);
        assert_eq!(blame, Some(Blame::Product));
        assert_eq!(verdict, "red");
    }

    #[test]
    fn a_flake_keeps_product_blame_but_a_red_round_outranks_it() {
        let flake = vec![
            failed(Side::Head, 0, 1, Blame::Product),
            run_of(J, Side::Head, 0, 2, Ended::Passed, 5.0),
        ];
        let (blame, _, _) = head_blame(flake.clone());
        assert_eq!(blame, Some(Blame::Product));
        let mut mixed = flake;
        mixed.extend([
            failed(Side::Head, 1, 1, Blame::Unknown),
            failed(Side::Head, 1, 2, Blame::Fixture),
        ]);
        let (blame, _, _) = head_blame(mixed);
        assert_eq!(blame, Some(Blame::Fixture));
    }

    #[test]
    fn a_red_base_with_a_green_head_says_timing_did_not_run() {
        let mut all = both(J, &[], &[20.0, 21.0]);
        all.extend(red_round(Side::Base, 0, Blame::Product));
        all.extend(red_round(Side::Base, 1, Blame::Product));
        let judged = judge(&all, &[J], 0.15, &[]).expect("a judgement");
        let report = &judged.reports[0];
        assert_eq!(report.verdict, "green");
        assert_eq!(report.against_base, Timing::Unmeasured);
        let note = report.timing_note.as_deref().expect("a note");
        assert!(note.contains("did not run") && note.contains("Base failed in 2 of 2"));
        let listed = unmeasured(&judged.reports);
        assert_eq!(listed.len(), 1);
        assert!(listed[0].starts_with("terminal-scrolling: The timing comparison"));
    }

    fn noisy_then_quiet(round: usize, journey: Journey, side: Side) -> Vec<Attempt> {
        let seconds = match (side, round) {
            (Side::Head, 0..=2) => 26.0,
            _ => 20.0,
        };
        passes(journey, side, round, seconds)
    }

    #[test]
    fn a_noisy_regression_is_rerun_and_cleared_on_all_rounds() {
        let mut calls = Vec::new();
        let mut runner = |round: usize, journey: Journey, side: Side| {
            calls.push((round, side));
            Ok(noisy_then_quiet(round, journey, side))
        };
        let (_, judged, flagged) = collect(&mut runner, &[J], 3, 0.15, &[]).expect("collected");
        assert_eq!(flagged, vec![J]);
        assert_eq!(calls.len(), 6 + 2 * RERUN_ROUNDS);
        assert_eq!(calls.last().map(|call| call.0), Some(7));
        assert_eq!(judged.reports[0].head.seconds.len(), 8);
        assert_eq!(judged.reports[0].verdict, "green");
    }

    #[test]
    fn a_real_regression_survives_the_rerun_and_other_journeys_are_not_rerun() {
        let mut other_runs = 0;
        let mut runner = |round: usize, journey: Journey, side: Side| {
            if journey == Journey::Workspace {
                other_runs += 1;
                return Ok(passes(journey, side, round, 20.0));
            }
            let seconds = if side == Side::Head { 28.0 } else { 20.0 };
            Ok(passes(journey, side, round, seconds))
        };
        let (_, judged, flagged) =
            collect(&mut runner, &[J, Journey::Workspace], 3, 0.15, &[]).expect("collected");
        assert_eq!(flagged, vec![J]);
        assert_eq!(other_runs, 6);
        assert_eq!(judged.reports[0].verdict, "regression");
        assert_eq!(judged.reports[1].verdict, "green");
    }

    #[test]
    fn a_green_battery_is_never_rerun() {
        let mut calls = 0;
        let mut runner = |round: usize, journey: Journey, side: Side| {
            calls += 1;
            Ok(passes(journey, side, round, 20.0))
        };
        let (_, judged, flagged) = collect(&mut runner, &[J], 3, 0.15, &[]).expect("collected");
        assert!(flagged.is_empty());
        assert_eq!(calls, 6);
        assert_eq!(judged.reports[0].verdict, "green");
    }

    #[test]
    fn the_schedule_alternates_the_order_of_each_pair() {
        let order = schedule(&[J, Journey::Workspace], 2);
        assert_eq!(order.len(), 8);
        assert_eq!(order[0], (0, J, Side::Base));
        assert_eq!(order[1], (0, J, Side::Head));
        assert_eq!(order[2], (0, Journey::Workspace, Side::Head));
        assert_eq!(order[4], (1, J, Side::Head));
        for side in [Side::Base, Side::Head] {
            assert_eq!(order.iter().filter(|item| item.2 == side).count(), 4);
        }
    }
}
