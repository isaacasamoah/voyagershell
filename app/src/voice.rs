use crate::voice_host::Cancellation;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use voyager_contract::voice::{Capability, Phase, State};

#[derive(Clone)]
pub(crate) struct Binding {
    pub id: u64,
    valid: Arc<AtomicBool>,
}

impl Binding {
    pub fn valid(&self) -> bool {
        self.valid.load(Ordering::Acquire)
    }
    pub fn revoke(&self) {
        self.valid.store(false, Ordering::Release);
    }
}

struct Run {
    binding: Binding,
    cancellation: Option<Cancellation>,
    stopping: bool,
    failure: Option<String>,
}

struct Inner {
    state: State,
    run: Option<Run>,
    next_binding: u64,
}

pub(crate) struct Shared(Mutex<Inner>);

impl Shared {
    pub fn new(capability: Capability) -> Self {
        Self(Mutex::new(Inner {
            state: State {
                version: 0,
                generation: 0,
                phase: Phase::Off,
                capability,
                thread: None,
                turn: None,
                realtime_session: None,
                microphone_peak: 0,
                speaker_peak: 0,
                error: None,
            },
            run: None,
            next_binding: 0,
        }))
    }

    pub fn binding(&self) -> Result<Binding, String> {
        let mut inner = self
            .0
            .lock()
            .map_err(|_| "Audio lease state is unavailable")?;
        inner.next_binding = inner
            .next_binding
            .checked_add(1)
            .ok_or("Audio lease identity exhausted")?;
        Ok(Binding {
            id: inner.next_binding,
            valid: Arc::new(AtomicBool::new(true)),
        })
    }

    pub fn snapshot(&self) -> Result<State, String> {
        Ok(self
            .0
            .lock()
            .map_err(|_| "Audio lease state is unavailable")?
            .state
            .clone())
    }

    pub fn begin(&self, binding: &Binding) -> Result<u64, String> {
        let mut inner = self
            .0
            .lock()
            .map_err(|_| "Audio lease state is unavailable")?;
        if !binding.valid() {
            return Err("This avatar audio lease has expired".into());
        }
        if let Capability::Unavailable { reason } = &inner.state.capability {
            return Err(reason.clone());
        }
        if inner.state.capability == Capability::Checking {
            return Err("Native voice compatibility is being inspected".into());
        }
        if inner.run.is_some() {
            return Err("The previous audio session is still active or stopping".into());
        }
        let state = &mut inner.state;
        state.generation = state
            .generation
            .checked_add(1)
            .ok_or("Audio session identity exhausted")?;
        state.version = state.version.saturating_add(1);
        state.phase = Phase::Preparing;
        state.thread = None;
        state.turn = None;
        state.realtime_session = None;
        state.microphone_peak = 0;
        state.speaker_peak = 0;
        state.error = None;
        let generation = state.generation;
        inner.run = Some(Run {
            binding: binding.clone(),
            cancellation: None,
            stopping: false,
            failure: None,
        });
        Ok(generation)
    }

    pub fn current(&self, generation: u64) -> bool {
        self.0.lock().is_ok_and(|inner| {
            inner.state.generation == generation
                && inner
                    .run
                    .as_ref()
                    .is_some_and(|run| run.binding.valid() && !run.stopping)
        })
    }

    pub fn exited(&self, generation: u64) -> Result<bool, String> {
        let inner = self
            .0
            .lock()
            .map_err(|_| "Audio lease state is unavailable")?;
        Ok(inner.state.generation == generation && inner.run.is_none())
    }

    pub fn attach(&self, generation: u64, cancellation: Cancellation) -> Result<bool, String> {
        let mut inner = self
            .0
            .lock()
            .map_err(|_| "Audio lease state is unavailable")?;
        if inner.state.generation != generation
            || inner
                .run
                .as_ref()
                .is_none_or(|run| !run.binding.valid() || run.stopping)
        {
            drop(inner);
            cancellation.stop()?;
            return Ok(false);
        }
        if let Some(run) = &mut inner.run {
            run.cancellation = Some(cancellation);
        }
        Ok(true)
    }

    pub fn stop(&self, binding: &Binding) -> Result<(), String> {
        let mut inner = self
            .0
            .lock()
            .map_err(|_| "Audio lease state is unavailable")?;
        let cancellation = match &mut inner.run {
            Some(run) if run.binding.id == binding.id => {
                run.stopping = true;
                run.cancellation.clone()
            }
            Some(_) => return Err("That avatar does not own this audio lease".into()),
            None => return Ok(()),
        };
        inner.state.phase = Phase::Stopping;
        inner.state.version = inner.state.version.saturating_add(1);
        drop(inner);
        if let Some(cancellation) = cancellation {
            cancellation.stop()?;
        }
        Ok(())
    }

    pub fn update(&self, generation: u64, edit: impl FnOnce(&mut State)) -> Result<(), String> {
        let mut inner = self
            .0
            .lock()
            .map_err(|_| "Audio lease state is unavailable")?;
        if inner.state.generation == generation
            && inner
                .run
                .as_ref()
                .is_some_and(|run| !run.stopping && run.binding.valid())
        {
            edit(&mut inner.state);
            inner.state.version = inner.state.version.saturating_add(1);
        }
        Ok(())
    }

    pub fn capability(&self, capability: Capability) -> Result<(), String> {
        let mut inner = self
            .0
            .lock()
            .map_err(|_| "Audio lease state is unavailable")?;
        inner.state.capability = capability;
        inner.state.version = inner.state.version.saturating_add(1);
        Ok(())
    }

    pub fn end(&self, failure: Option<String>) -> Result<(), String> {
        let mut inner = self
            .0
            .lock()
            .map_err(|_| "Audio lease state is unavailable")?;
        let failure = failure.or_else(|| inner.state.error.clone());
        let cancellation = if let Some(run) = &mut inner.run {
            run.stopping = true;
            run.failure = failure.clone();
            run.cancellation.clone()
        } else {
            None
        };
        inner.state.phase = if inner.run.is_some() {
            Phase::Stopping
        } else if inner.state.phase == Phase::Unconfirmed {
            Phase::Unconfirmed
        } else if failure.is_some() {
            Phase::Failed
        } else {
            Phase::Off
        };
        inner.state.error = failure;
        inner.state.version = inner.state.version.saturating_add(1);
        drop(inner);
        if let Some(cancellation) = cancellation {
            cancellation.stop()?;
        }
        Ok(())
    }

    pub fn finish(
        &self,
        generation: u64,
        failure: Option<String>,
        confirmed_exit: bool,
    ) -> Result<(), String> {
        let mut inner = self
            .0
            .lock()
            .map_err(|_| "Audio lease state is unavailable")?;
        if inner.state.generation != generation {
            return Ok(());
        }
        let requested = inner
            .run
            .as_ref()
            .is_some_and(|run| run.stopping || !run.binding.valid());
        let failure = inner
            .run
            .as_ref()
            .and_then(|run| run.failure.clone())
            .or(failure);
        inner.state.phase = if !confirmed_exit {
            Phase::Unconfirmed
        } else if inner.run.as_ref().is_some_and(|run| run.failure.is_some())
            || failure.is_some() && !requested
        {
            Phase::Failed
        } else {
            Phase::Off
        };
        inner.state.error = if requested
            && confirmed_exit
            && !inner.run.as_ref().is_some_and(|run| run.failure.is_some())
        {
            None
        } else {
            failure
        };
        inner.state.microphone_peak = 0;
        inner.state.speaker_peak = 0;
        inner.state.version = inner.state.version.saturating_add(1);
        if confirmed_exit {
            inner.run = None;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_voice_lease_keeps_failure_identity_and_cannot_control_another_generation() {
        let shared = Shared::new(Capability::Candidate {
            version: "0.166.0".into(),
        });
        let first = shared.binding().unwrap();
        let second = shared.binding().unwrap();
        let generation = shared.begin(&first).unwrap();
        shared
            .update(generation, |state| {
                state.thread = Some("private-thread".into())
            })
            .unwrap();
        assert!(shared.stop(&second).is_err());
        assert!(shared.current(generation));
        shared.end(Some("device unavailable".into())).unwrap();
        shared.end(None).unwrap();
        assert!(shared.begin(&second).is_err());
        shared.finish(generation, None, true).unwrap();
        let failed = shared.snapshot().unwrap();
        assert_eq!(failed.phase, Phase::Failed);
        assert_eq!(failed.error.as_deref(), Some("device unavailable"));
        assert_eq!(failed.thread.as_deref(), Some("private-thread"));
        first.revoke();
        assert!(shared.begin(&first).is_err());
        let next = shared.begin(&second).unwrap();
        assert!(next > generation);
        shared
            .update(generation, |state| state.thread = Some("wrong".into()))
            .unwrap();
        shared
            .finish(generation, Some("stale failure".into()), true)
            .unwrap();
        assert!(shared.snapshot().unwrap().thread.is_none());
        assert!(shared.current(next));
        assert!(shared.stop(&first).is_err());
        shared.stop(&second).unwrap();
        assert!(!shared.current(next));
        shared.finish(next, None, false).unwrap();
        assert!(!shared.exited(next).unwrap());
        assert_eq!(shared.snapshot().unwrap().phase, Phase::Unconfirmed);
        assert!(shared.begin(&second).is_err());
        shared
            .finish(next, Some("closed pipe".into()), true)
            .unwrap();
        assert!(shared.exited(next).unwrap());
        assert_eq!(shared.snapshot().unwrap().phase, Phase::Off);
        assert!(shared.snapshot().unwrap().error.is_none());
    }
}
