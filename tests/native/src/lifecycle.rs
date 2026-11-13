use anyhow::{Result, ensure};
use serde::Serialize;

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq, Serialize)]
pub enum Phase {
    #[default]
    Setup,
    Ready,
    Dispatched,
    Observed,
    Finished,
}

macro_rules! events {
    ($($name:ident),+ $(,)?) => {
        #[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
        pub enum Event { $($name),+ }
        pub const EVENTS: &[Event] = &[$(Event::$name),+];
    };
}

events!(
    Ready,
    Dispatch,
    Acknowledge,
    Match,
    Mismatch,
    Unavailable,
    Evidence,
    Clean,
    CleanupFailed,
    Finish
);

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq, Serialize)]
pub struct Run {
    pub phase: Phase,
    pub dispatched: bool,
    pub observed: bool,
    pub failed: bool,
    pub unavailable: bool,
    pub evidence: bool,
    pub clean: bool,
    pub cleanup_failed: bool,
}

impl Run {
    pub fn step(&mut self, event: Event) -> Result<()> {
        ensure!(self.phase != Phase::Finished, "Run is already finished");
        match event {
            Event::Ready => {
                ensure!(self.phase == Phase::Setup, "Readiness is out of order");
                self.phase = Phase::Ready;
            }
            Event::Dispatch => {
                ensure!(
                    self.phase == Phase::Ready
                        && !self.dispatched
                        && !self.unavailable
                        && !self.clean
                        && !self.evidence,
                    "Run cannot be replayed"
                );
                self.dispatched = true;
                self.phase = Phase::Dispatched;
            }
            Event::Acknowledge => {
                ensure!(
                    self.phase == Phase::Dispatched,
                    "Acknowledgement has no dispatch"
                );
            }
            Event::Match | Event::Mismatch => {
                ensure!(
                    self.phase == Phase::Dispatched,
                    "Observation has no dispatch"
                );
                self.observed = true;
                self.failed = event == Event::Mismatch;
                self.phase = Phase::Observed;
            }
            Event::Unavailable => self.unavailable = true,
            Event::Evidence => {
                ensure!(
                    self.phase == Phase::Observed || self.unavailable,
                    "Evidence has no observation or unavailable outcome"
                );
                self.evidence = true;
            }
            Event::Clean => self.clean = true,
            Event::CleanupFailed => self.cleanup_failed = true,
            Event::Finish => self.phase = Phase::Finished,
        }
        Ok(())
    }

    pub fn verdict(self) -> &'static str {
        if self.phase != Phase::Finished
            || !self.evidence
            || !self.clean
            || self.cleanup_failed
            || self.unavailable
        {
            "inconclusive"
        } else if self.failed {
            "failed"
        } else if self.observed {
            "passed"
        } else {
            "inconclusive"
        }
    }
}
