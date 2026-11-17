use anyhow::{Context as _, Result, ensure};
use serde_json::{Value, json};

pub const STOP: &str = "frames.stop";
pub const RECORD: &str = "frames.jsonl";
const END: &str = "voyager_frame_work_end";

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
    fn a_record_without_draws_is_refused() {
        assert!(summarize(&end()).is_err());
        assert!(summarize("").is_err());
    }
}
