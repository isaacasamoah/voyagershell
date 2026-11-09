use std::ffi::OsStr;
use std::io::Write;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, mpsc};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(serde::Serialize)]
struct Event {
    sequence: u64,
    stage: &'static str,
    value: usize,
    channel: Option<u32>,
    elapsed_before_ns: Option<u64>,
    wall_ns: Option<u64>,
    elapsed_after_ns: Option<u64>,
}

struct Trace {
    started: Instant,
    sender: mpsc::SyncSender<Event>,
    counts: Arc<Counts>,
    input_only: bool,
}

#[derive(Default)]
struct Counts {
    attempted: AtomicU64,
    dropped: AtomicU64,
}

fn selected(flag: Option<&OsStr>, session: Option<&OsStr>) -> bool {
    flag == Some(OsStr::new("1"))
        && session
            .and_then(OsStr::to_str)
            .is_some_and(|session| session.starts_with("voyager-typing-"))
}

fn included(input_only: bool, stage: &str) -> bool {
    !input_only
        || matches!(
            stage,
            "workspace_window_id"
                | "key_received"
                | "input_admitted"
                | "input_write_started"
                | "input_write_finished"
                | "terminal_renderer_mode"
        )
}

static TRACE: LazyLock<Option<Trace>> = LazyLock::new(|| {
    if !selected(
        std::env::var_os("VOYAGER_TYPING_TRACE").as_deref(),
        std::env::var_os("VOYAGER_WORKSPACE_SESSION").as_deref(),
    ) {
        return None;
    }
    let (sender, receiver) = mpsc::sync_channel::<Event>(4096);
    let input_only = std::env::var("VOYAGER_TYPING_TRACE_INPUT_ONLY").as_deref() == Ok("1");
    let counts = Arc::new(Counts::default());
    let totals = counts.clone();
    let started = Instant::now();
    let writer = std::thread::Builder::new()
        .name("typing-trace".into())
        .spawn(move || {
            let mut reported = Instant::now();
            let mut output = std::io::stderr();
            loop {
                if started.elapsed() >= Duration::from_secs(120) {
                    let _ = writeln!(
                        output,
                        "{}",
                        serde_json::json!({"event": "voyager_typing_trace_expired"})
                    );
                    break;
                }
                match receiver.recv_timeout(Duration::from_secs(1)) {
                    Ok(event) => {
                        if writeln!(
                            output,
                            "{}",
                            serde_json::json!({"event": "voyager_typing_trace", "record": event})
                        )
                        .is_err()
                        {
                            break;
                        }
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
                if reported.elapsed() >= Duration::from_secs(1) {
                    if writeln!(
                        output,
                        "{}",
                        serde_json::json!({
                            "event": "voyager_typing_trace_status",
                            "attempted": totals.attempted.load(Ordering::Relaxed),
                            "dropped": totals.dropped.load(Ordering::Relaxed),
                            "scope": if input_only { "input-and-renderer" } else { "all" },
                        })
                    )
                    .is_err()
                    {
                        break;
                    }
                    reported = Instant::now();
                }
            }
        });
    if writer.is_err() {
        return None;
    }
    Some(Trace {
        started,
        sender,
        counts,
        input_only,
    })
});

pub fn record(stage: &'static str, value: usize) {
    record_event(stage, value, None);
}

pub(crate) fn transport(stage: &'static str, channel: u32, bytes: usize) {
    record_event(stage, bytes, Some(channel));
}

fn record_event(stage: &'static str, value: usize, channel: Option<u32>) {
    let Some(trace) = &*TRACE else {
        return;
    };
    if !included(trace.input_only, stage) {
        return;
    }
    let sequence = trace.counts.attempted.fetch_add(1, Ordering::Relaxed);
    if sequence > 20000 {
        return;
    }
    let nanos = |duration: Duration| u64::try_from(duration.as_nanos()).ok();
    let before = nanos(trace.started.elapsed());
    let wall = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(nanos);
    let after = nanos(trace.started.elapsed());
    let event = Event {
        sequence,
        stage: if sequence == 20000 {
            "trace_limit"
        } else {
            stage
        },
        value,
        channel,
        elapsed_before_ns: before,
        wall_ns: wall,
        elapsed_after_ns: after,
    };
    if trace.sender.try_send(event).is_err() {
        trace.counts.dropped.fetch_add(1, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn input_scope_preserves_key_and_transport_events_under_output_pressure() {
        let mut events = vec!["pump_start"; 30000];
        events.extend([
            "key_received",
            "input_admitted",
            "input_write_started",
            "input_write_finished",
        ]);
        let selected: Vec<_> = events
            .iter()
            .copied()
            .filter(|stage| super::included(true, stage))
            .collect();
        assert_eq!(selected, &events[30000..]);
        assert!(events.iter().all(|stage| super::included(false, stage)));
        assert!(super::included(true, "workspace_window_id"));
        assert!(super::included(true, "terminal_renderer_mode"));
        assert!(!super::included(true, "output_frame_received"));
    }

    #[test]
    fn recording_requires_an_explicit_scratch_session() {
        use std::ffi::OsStr;
        let enabled = Some(OsStr::new("1"));
        assert!(!super::selected(enabled, None));
        assert!(!super::selected(
            enabled,
            Some(OsStr::new("voyager-feedback-owner-20261104"))
        ));
        assert!(!super::selected(
            None,
            Some(OsStr::new("voyager-typing-trace-01"))
        ));
        assert!(super::selected(
            enabled,
            Some(OsStr::new("voyager-typing-trace-01"))
        ));
    }
}
