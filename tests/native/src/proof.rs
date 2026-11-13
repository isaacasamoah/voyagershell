use crate::lifecycle::{EVENTS, Event, Phase, Run};
use anyhow::{Result, ensure};
use std::collections::{HashSet, VecDeque};

pub fn check() -> Result<usize> {
    let mut seen = HashSet::from([Run::default()]);
    let mut pending = VecDeque::from([(Run::default(), Vec::new())]);
    while let Some((state, path)) = pending.pop_front() {
        if state.verdict() == "passed" {
            ensure!(
                state.phase == Phase::Finished
                    && state.observed
                    && state.dispatched
                    && state.acknowledged
                    && state.evidence
                    && state.clean
                    && !state.cleanup_failed
                    && !state.unavailable
                    && !state.failed,
                "False pass after {path:?}: {state:?}"
            );
        }
        for &event in EVENTS {
            let mut next = state;
            if next.step(event).is_err() {
                ensure!(
                    next == state,
                    "Rejected transition changed state: {event:?}"
                );
                continue;
            }
            ensure!(
                !(event == Event::Dispatch && state.dispatched),
                "Duplicate dispatch after {path:?}"
            );
            ensure!(
                !(state.phase == Phase::Finished),
                "Finished run accepted another event"
            );
            ensure!(!state.evidence || next.evidence, "Evidence was erased");
            if matches!(event, Event::Crash | Event::Mismatch) {
                ensure!(next.failed, "{event:?} did not record a failure");
            }
            if event == Event::Acknowledge {
                ensure!(
                    next.observed == state.observed,
                    "Acknowledgement became observation"
                );
            }
            if seen.insert(next) {
                let mut trace = path.clone();
                trace.push(event);
                pending.push_back((next, trace));
            }
        }
    }
    Ok(seen.len())
}
