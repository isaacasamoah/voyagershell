use crate::journey::Journey;
use crate::system::{self, Pinned};
use anyhow::{Context, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

const HISTORY_HEADS: usize = 10;
const MINIMUM_TIMED_RUNS: usize = 2;

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
    let mut worst: Option<&Attempt> = None;
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
            worst = Some(last);
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
    let failing = worst.or_else(|| {
        mine.iter()
            .copied()
            .find(|attempt| attempt.ended != Ended::Passed)
    });
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
            against_history,
            verdict,
        });
    }
    Ok(Judged { reports })
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
    let hc_path = system::installed("hc")?;
    let hc = Pinned::check(&hc_path, &system::digest(&hc_path)?).context("Core")?;
    Ok(Options {
        base: build(Side::Base, need("--base")?, need("--base-assets")?)?,
        head: build(Side::Head, need("--head")?, need("--head-assets")?)?,
        hc,
        evidence: PathBuf::from(need("--evidence")?),
        runs,
        threshold,
        history: given.get("--history").map(PathBuf::from),
        journeys,
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
    let build = match side {
        Side::Base => &options.base,
        Side::Head => &options.head,
    };
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
    text += "\nA flake is a run that failed once and passed on its rerun. Wall time is the whole `run` command, including the sandbox and display start. Read `battery.json` for every run.\n";
    text
}

pub fn run(args: &[String]) -> Result<i32> {
    let options = parse(args)?;
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
    let mut all: Vec<Attempt> = Vec::new();
    for (round, journey, side) in schedule(&options.journeys, options.runs) {
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
            all.push(done);
            if passed || number == 2 {
                break;
            }
            number += 1;
        }
    }
    let judged = judge(&all, &options.journeys, options.threshold, &history)?;
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
