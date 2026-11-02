use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

const MAX_INSTANCE: usize = 8;
const MAX_BYTES: usize = 4 * 1024 * 1024;

#[derive(Default)]
struct State {
    instances: HashMap<String, usize>,
    bytes: usize,
}

#[derive(Clone, Default)]
pub struct Budget(Arc<Mutex<State>>);

pub struct Permit {
    state: Arc<Mutex<State>>,
    id: String,
    bytes: usize,
}

impl Budget {
    pub fn reserve(&self, id: &str, bytes: usize) -> Option<Permit> {
        let mut state = self.0.try_lock().ok()?;
        if state.instances.get(id).copied().unwrap_or(0) >= MAX_INSTANCE
            || bytes > MAX_BYTES.saturating_sub(state.bytes)
        {
            return None;
        }
        *state.instances.entry(id.to_owned()).or_default() += 1;
        state.bytes += bytes;
        Some(Permit {
            state: self.0.clone(),
            id: id.to_owned(),
            bytes,
        })
    }
}

impl Drop for Permit {
    fn drop(&mut self) {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        state.bytes -= self.bytes;
        if let Some(count) = state.instances.get_mut(&self.id) {
            *count -= 1;
            if *count == 0 {
                state.instances.remove(&self.id);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn admission_is_shared_bounded_and_released_on_drop() {
        let budget = Budget::default();
        let held: Vec<_> = (0..8).map(|_| budget.reserve("a", 1).unwrap()).collect();
        assert!(budget.reserve("a", 1).is_none());
        assert!(budget.reserve("b", MAX_BYTES - 7).is_none());
        let other = budget.reserve("b", MAX_BYTES - 8).unwrap();
        assert!(budget.reserve("b", 1).is_none());
        drop(other);
        drop(held);
        assert!(budget.reserve("a", MAX_BYTES).is_some());
    }
}
