use std::{
    cell::RefCell,
    collections::BTreeMap,
    sync::LazyLock,
    time::{Duration, Instant},
};

static ENABLED: LazyLock<bool> =
    LazyLock::new(|| std::env::var_os("VOYAGER_REDRAW_PROBE").is_some());

struct Counts {
    started: Instant,
    last: Instant,
    reports: usize,
    values: BTreeMap<&'static str, u64>,
}

thread_local! {
    static COUNTS: RefCell<Counts> = RefCell::new(Counts {
        started: Instant::now(),
        last: Instant::now(),
        reports: 0,
        values: BTreeMap::new(),
    });
}

pub fn record(name: &'static str, amount: u64) {
    if !*ENABLED {
        return;
    }
    COUNTS.with_borrow_mut(|counts| {
        if counts.reports >= 40 {
            return;
        }
        *counts.values.entry(name).or_default() += amount;
        let now = Instant::now();
        if name != "a11y_poll_active" || now.duration_since(counts.last) < Duration::from_secs(1) {
            return;
        }
        eprintln!(
            "{}",
            serde_json::json!({
                "event": "voyager_redraw_probe",
                "elapsed_ms": now.duration_since(counts.started).as_millis(),
                "span_ms": now.duration_since(counts.last).as_millis(),
                "a11y_active_at_poll": amount != 0,
                "counts": std::mem::take(&mut counts.values),
            })
        );
        counts.last = now;
        counts.reports += 1;
    });
}
