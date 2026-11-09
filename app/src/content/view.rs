use super::Binding;
use std::sync::{Arc, Mutex, MutexGuard};

pub(crate) struct Gate {
    phase: Mutex<Phase>,
    ready: async_channel::Sender<()>,
    pub(crate) published: async_channel::Receiver<()>,
    wake: async_channel::Sender<()>,
    pub(crate) retired: async_channel::Receiver<()>,
}

#[derive(Clone, Copy, Eq, PartialEq)]
pub(crate) enum Phase {
    Pending,
    Active,
    Retired,
}

impl Gate {
    pub(crate) fn retire(&self) {
        *self.lock() = Phase::Retired;
        self.ready.close();
        self.wake.close();
    }

    fn lock(&self) -> MutexGuard<'_, Phase> {
        self.phase.lock().unwrap_or_else(|error| error.into_inner())
    }
}

#[derive(Clone)]
pub struct ViewBinding {
    pub(crate) binding: Binding,
    pub(crate) gate: Arc<Gate>,
}

impl ViewBinding {
    pub(crate) fn new(binding: Binding) -> Self {
        let (wake, retired) = async_channel::bounded(1);
        let (ready, published) = async_channel::bounded(1);
        Self {
            binding,
            gate: Arc::new(Gate {
                phase: Mutex::new(Phase::Pending),
                ready,
                published,
                wake,
                retired,
            }),
        }
    }

    pub fn retire(&self) {
        self.gate.retire();
    }

    pub fn is_active(&self) -> bool {
        *self.lock() == Phase::Active
    }

    pub fn is_retired(&self) -> bool {
        *self.lock() == Phase::Retired
    }

    pub fn activate(&self) -> Result<(), String> {
        let mut phase = self.lock();
        if *phase != Phase::Pending {
            return Err("Notes view is no longer pending".into());
        }
        *phase = Phase::Active;
        self.gate.ready.close();
        Ok(())
    }

    pub(crate) fn lock(&self) -> MutexGuard<'_, Phase> {
        self.gate.lock()
    }
}
