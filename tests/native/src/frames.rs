use anyhow::{Context as _, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::cell::Cell;
use std::collections::BTreeMap;
use std::fs::OpenOptions;
use std::io::Write as _;
use std::path::Path;
use voyager_contract::inspection::Frame;

pub const STOP: &str = "frames.stop";
pub const RECORD: &str = "frames.jsonl";
pub const GLANCES: &str = "glances.jsonl";
const END: &str = "voyager_frame_work_end";
const REDRAW: &str = "voyager_redraw_event";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Probe {
    Frame,
    Redraw,
}

impl Probe {
    pub fn parse(text: &str) -> Result<Self> {
        match text {
            "frame" => Ok(Self::Frame),
            "redraw" => Ok(Self::Redraw),
            other => bail!("Unknown probe {other}; the probes are frame and redraw"),
        }
    }
}

#[derive(Default)]
pub struct Glances(Cell<Option<(u32, u64, u64)>>);

impl Glances {
    pub fn note(
        &self,
        evidence: &Path,
        launch: u32,
        frame: &Frame,
        version: u64,
        at: u128,
    ) -> Result<()> {
        let key = (launch, frame.sequence, version);
        if self.0.replace(Some(key)) == Some(key) {
            return Ok(());
        }
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(evidence.join(GLANCES))?;
        serde_json::to_writer(
            &mut file,
            &json!({"at":at,"launch":launch,"sequence":frame.sequence,"version":version,"frame":frame}),
        )?;
        file.write_all(b"\n")?;
        Ok(())
    }
}

pub fn redraw(log: &str) -> Result<Value> {
    let mut stages: BTreeMap<String, u64> = BTreeMap::new();
    for line in log.lines() {
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if record["event"] == REDRAW
            && let Some(stage) = record["stage"].as_str()
        {
            *stages.entry(stage.to_owned()).or_default() += 1;
        }
    }
    ensure!(
        !stages.is_empty(),
        "The candidate log holds no {REDRAW} line; the candidate does not carry the redraw probe"
    );
    Ok(json!({"file":"native.log","event":REDRAW,"stages":stages}))
}

pub fn summarize(text: &str) -> Result<Value> {
    let mut draws = Vec::new();
    let mut end = None;
    for (number, line) in text.lines().enumerate() {
        let record: Value = serde_json::from_str(line)
            .with_context(|| format!("{RECORD} line {} is not JSON", number + 1))?;
        if record["event"] == END {
            end = Some(record);
        } else if record["category"] == "draw" {
            draws.push(
                record["duration_ns"].as_u64().with_context(|| {
                    format!("{RECORD} line {} has no draw duration", number + 1)
                })?,
            );
        }
    }
    ensure!(
        !draws.is_empty(),
        "The frame record holds no draw frame; the candidate must be built with the frame-profiler feature"
    );
    draws.sort_unstable();
    let ms = |ns: u64| ns as f64 / 1e6;
    let rank = |fraction: f64| draws[((draws.len() as f64 * fraction).ceil() as usize).max(1) - 1];
    Ok(json!({
        "file": RECORD,
        "frames": draws.len(),
        "medianMs": ms(rank(0.5)),
        "p95Ms": ms(rank(0.95)),
        "maxMs": ms(draws[draws.len() - 1]),
        "measure": "GPUI draw duration of each frame in the foreground journal",
        "ended": end.is_some(),
        "lost": end.as_ref().map(|end| end["lost"].clone()),
        "capped": end.as_ref().map(|end| end["capped"].clone()),
        "expired": end.as_ref().map(|end| end["expired"].clone()),
        "coverage": "The frames up to the last drain before the stop or before the candidate ended, not the process lifetime",
    }))
}

pub fn ended(text: &str) -> bool {
    text.lines().any(|line| line.contains(END))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn draw(ns: u64) -> String {
        json!({"event":"voyager_frame_work","category":"draw","duration_ns":ns}).to_string()
    }

    fn end() -> String {
        json!({"event":END,"lost":0,"capped":false,"expired":false,"coverage":"prefix"}).to_string()
    }

    #[test]
    fn percentiles_come_from_the_recorded_draws() -> Result<()> {
        let mut lines: Vec<String> = (1..=100).map(|n| draw(n * 1_000_000)).collect();
        lines.insert(
            3,
            json!({"event":"voyager_frame_work","category":"task"}).to_string(),
        );
        lines.push(end());
        let summary = summarize(&lines.join("\n"))?;
        assert_eq!(summary["frames"], 100);
        assert_eq!(summary["medianMs"], 50.0);
        assert_eq!(summary["p95Ms"], 95.0);
        assert_eq!(summary["maxMs"], 100.0);
        Ok(())
    }

    #[test]
    fn a_stall_shows_in_the_max_and_an_unended_record_says_so() -> Result<()> {
        let mut lines = vec![draw(2_000_000), draw(2_000_000), draw(52_000_000)];
        let cut = summarize(&lines.join("\n"))?;
        assert_eq!(
            (cut["maxMs"].clone(), cut["ended"].clone()),
            (json!(52.0), json!(false))
        );
        lines.push(end());
        assert_eq!(summarize(&lines.join("\n"))?["ended"], true);
        Ok(())
    }

    #[test]
    fn a_glance_is_kept_once_for_each_frame_and_document_version() -> Result<()> {
        let folder = crate::scratch::Scratch::new("glances")?;
        let frame = |sequence| Frame {
            sequence,
            window: voyager_contract::inspection::Window {
                width: 800.0,
                height: 600.0,
                scale: 1.0,
            },
            dock: voyager_contract::Context::Workspace,
            dock_focus: None,
            prepared: true,
            elements: Vec::new(),
            ambiguous: Vec::new(),
        };
        let glances = Glances::default();
        for (launch, sequence, version) in
            [(1, 4, 9), (1, 4, 9), (1, 4, 10), (1, 5, 10), (2, 5, 10)]
        {
            glances.note(folder.path(), launch, &frame(sequence), version, 0)?;
        }
        let kept: Vec<(u64, u64, u64)> = std::fs::read_to_string(folder.path().join(GLANCES))?
            .lines()
            .map(|line| {
                let value: Value = serde_json::from_str(line).expect("a JSON glance");
                (
                    value["launch"].as_u64().expect("a launch"),
                    value["sequence"].as_u64().expect("a sequence"),
                    value["version"].as_u64().expect("a version"),
                )
            })
            .collect();
        assert_eq!(kept, [(1, 4, 9), (1, 4, 10), (1, 5, 10), (2, 5, 10)]);
        Ok(())
    }

    #[test]
    fn the_redraw_summary_counts_each_stage_and_refuses_a_log_without_the_probe() -> Result<()> {
        let log = [
            "warning: not JSON",
            &json!({"event":REDRAW,"stage":"workspace_notice"}).to_string(),
            &json!({"event":REDRAW,"stage":"inspection_frame"}).to_string(),
            &json!({"event":REDRAW,"stage":"inspection_frame"}).to_string(),
            &json!({"event":"voyager_redraw_probe","counts":{}}).to_string(),
        ]
        .join("\n");
        assert_eq!(
            redraw(&log)?["stages"],
            json!({"inspection_frame":2,"workspace_notice":1})
        );
        assert!(redraw("warning: not JSON").is_err());
        Ok(())
    }

    #[test]
    fn a_probe_is_frame_or_redraw() -> Result<()> {
        assert_eq!(Probe::parse("frame")?, Probe::Frame);
        assert_eq!(Probe::parse("redraw")?, Probe::Redraw);
        assert!(Probe::parse("frames").is_err());
        Ok(())
    }

    #[test]
    fn a_record_without_draws_is_refused() {
        assert!(summarize(&end()).is_err());
        assert!(summarize("").is_err());
    }
}
