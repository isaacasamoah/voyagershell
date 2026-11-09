use gpui::profiler::journal::{
    ForegroundEvent, ForegroundJournalEntry, IntervalBoundary, PresentedFrame,
};
use serde_json::{Value, json};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

fn selected(flag: Option<&str>, session: Option<&str>) -> bool {
    flag == Some("1") && session.is_some_and(|s| s.starts_with("voyager-typing-"))
}

fn nanos(duration: Duration) -> Option<u64> {
    u64::try_from(duration.as_nanos()).ok()
}

fn wall() -> Option<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(nanos)
}

fn event_data(event: ForegroundEvent) -> Value {
    let before = wall();
    let start_age = nanos(event.start_time().elapsed());
    let end_age = nanos(event.end_time().elapsed());
    let (dirty_age, signal_age) = match event {
        ForegroundEvent::Draw(t) => (
            t.dirty_at.and_then(|t| nanos(t.elapsed())),
            t.signal_at.and_then(|t| nanos(t.elapsed())),
        ),
        _ => (None, None),
    };
    let after = wall();
    let mut value = json!({
        "wall_before_ns": before, "wall_after_ns": after,
        "start_age_ns": start_age, "end_age_ns": end_age,
        "duration_ns": nanos(event.duration()),
    });
    let extra = match event {
        ForegroundEvent::Draw(t) => json!({
            "category": "draw", "window": t.window_id.as_u64(),
            "layout_ns": nanos(t.phases.request_layout),
            "prepaint_ns": nanos(t.phases.prepaint), "paint_ns": nanos(t.phases.paint),
            "dirty_age_ns": dirty_age, "signal_age_ns": signal_age,
            "invalidations": t.invalidations,
        }),
        ForegroundEvent::Present(t) => {
            json!({"category": "submit_unpaired", "window": t.window_id.as_u64()})
        }
        ForegroundEvent::View(t) => {
            json!({"category": "view", "name": t.name, "phase": t.phase.as_str(), "self_ns": nanos(t.self_duration)})
        }
        ForegroundEvent::TaskPoll(t) => {
            json!({"category": "task", "file": t.location.file(), "line": t.location.line()})
        }
        ForegroundEvent::Input(t) => {
            json!({"category": "input", "kind": t.kind, "invalidated": t.caused_invalidation})
        }
        ForegroundEvent::SmallPolls(t) => {
            json!({"category": "small_polls", "total_ns": nanos(t.summary.total), "count": t.summary.count})
        }
        ForegroundEvent::Action(_) => json!({"category": "action"}),
    };
    if let (Some(value), Some(extra)) = (value.as_object_mut(), extra.as_object()) {
        value.extend(extra.clone());
    }
    value
}

fn presented_data(t: PresentedFrame) -> Value {
    let before = wall();
    let start_age = nanos(t.presentation.present_start.elapsed());
    let end_age = nanos(t.presentation.present_end.elapsed());
    let draw_start_age = nanos(t.frame.draw_start.elapsed());
    let draw_end_age = nanos(t.frame.draw_end.elapsed());
    let after = wall();
    json!({
        "category": "submit_paired", "window": t.presentation.window_id.as_u64(),
        "wall_before_ns": before, "wall_after_ns": after,
        "start_age_ns": start_age, "end_age_ns": end_age,
        "draw_start_age_ns": draw_start_age, "draw_end_age_ns": draw_end_age,
        "duration_ns": nanos(t.presentation.present_duration()),
    })
}

pub(crate) fn start(cx: &mut gpui::App) {
    if !selected(
        std::env::var("VOYAGER_FRAME_PROFILE").ok().as_deref(),
        std::env::var("VOYAGER_WORKSPACE_SESSION").ok().as_deref(),
    ) {
        return;
    }
    let stop = std::env::var_os("VOYAGER_FRAME_PROFILE_STOP").map(PathBuf::from);
    if stop.as_ref().is_none_or(|path| !path.is_absolute()) {
        return;
    }
    let Some(stop) = stop else { return };
    let destination = stop.with_extension("jsonl");
    let mut collector = cx.foreground_journal().collector();
    let _writer = std::thread::Builder::new()
        .name("frame-work".into())
        .spawn(move || {
            if stop.exists() || destination == stop {
                return;
            }
            let started = Instant::now();
            let Ok(mut output) = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(destination)
            else {
                return;
            };
            let mut sequence = 0;
            let mut lost = 0;
            let mut last_drain_wall_ns = None;
            while started.elapsed() < Duration::from_secs(120) && sequence < 20000 && !stop.exists()
            {
                let drained = collector.collect_unseen();
                last_drain_wall_ns = wall();
                lost += drained.lost;
                for entry in drained.entries {
                    let mut record = match entry {
                        ForegroundJournalEntry::Event(event) => event_data(event),
                        ForegroundJournalEntry::Boundary(IntervalBoundary::Presented(t)) => {
                            presented_data(t)
                        }
                        ForegroundJournalEntry::Discontinuity { lost } => {
                            json!({"category": "lost", "count": lost})
                        }
                        _ => continue,
                    };
                    record["event"] = json!("voyager_frame_work");
                    record["sequence"] = json!(sequence);
                    if writeln!(output, "{record}").is_err() {
                        return;
                    }
                    sequence += 1;
                    if sequence == 20000 {
                        break;
                    }
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            let _ = writeln!(
                output,
                "{}",
                json!({
                    "event": "voyager_frame_work_end", "records": sequence, "lost": lost,
                    "requested_stop": stop.exists(),
                    "capped": sequence == 20000,
                    "expired": started.elapsed() >= Duration::from_secs(120),
                    "last_drain_wall_ns": last_drain_wall_ns,
                    "coverage": "Observed prefix through last drain, not the process lifetime",
                })
            );
        });
}

#[cfg(test)]
mod tests {
    #[test]
    fn profiling_requires_a_flag_and_scratch_session() {
        assert!(!super::selected(None, Some("voyager-typing-profile")));
        assert!(!super::selected(
            Some("1"),
            Some("voyager-feedback-owner-20261104")
        ));
        assert!(!super::selected(Some("1"), None));
        assert!(super::selected(Some("1"), Some("voyager-typing-profile")));
    }
}
