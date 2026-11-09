use super::{Core, Error};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::{
    collections::HashMap,
    marker::PhantomData,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, Receiver, SyncSender},
    },
    time::{Duration, Instant},
};

pub(super) type Replies = Arc<Mutex<HashMap<u64, SyncSender<Value>>>>;

pub(crate) struct Pending<R> {
    id: u64,
    method: &'static str,
    receiver: Receiver<Value>,
    replies: Replies,
    attaching: Arc<AtomicU64>,
    dispatched: Instant,
    trace: bool,
    result: PhantomData<R>,
}

impl<R: DeserializeOwned> Pending<R> {
    pub(super) fn register(
        id: u64,
        method: &'static str,
        replies: &Replies,
        attaching: &Arc<AtomicU64>,
        connected: &AtomicBool,
    ) -> Result<Self, Error> {
        let (sender, receiver) = mpsc::sync_channel(1);
        let mut waiting = replies
            .lock()
            .map_err(|error| Error::Uncertain(error.to_string()))?;
        if !connected.load(Ordering::Acquire) || waiting.len() >= 9 {
            return Err(Error::Rejected {
                kind: "busy".into(),
                message: "Core connection unavailable or request limit reached; nothing was queued"
                    .into(),
            });
        }
        waiting.insert(id, sender);
        Ok(Self {
            id,
            method,
            receiver,
            replies: replies.clone(),
            attaching: attaching.clone(),
            dispatched: Instant::now(),
            trace: std::env::var_os("VOYAGER_TRACE_TOOLS").is_some(),
            result: PhantomData,
        })
    }

    pub(crate) fn wait(self) -> Result<R, Error> {
        let remaining = Duration::from_secs(20).saturating_sub(self.dispatched.elapsed());
        let response = self.receiver.recv_timeout(remaining).map_err(|_| {
            Error::Uncertain("Core result unconfirmed; no request was repeated".into())
        });
        if self.trace {
            eprintln!(
                "voyager_timing core_request={} method={} elapsed_us={} reply_received={}",
                self.id,
                self.method,
                self.dispatched.elapsed().as_micros(),
                response.is_ok()
            );
        }
        Core::decode(self.method, Core::response(response?, self.id)?)
    }
}

impl<R> Drop for Pending<R> {
    fn drop(&mut self) {
        if let Ok(mut replies) = self.replies.lock() {
            replies.remove(&self.id);
        }
        let _ = self
            .attaching
            .compare_exchange(self.id, 0, Ordering::AcqRel, Ordering::Acquire);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pending_results_are_bounded_and_cleanup_only_their_own_identity() {
        let replies = Replies::default();
        let attaching = Arc::default();
        let connected = AtomicBool::new(true);
        let register =
            |id| Pending::<Value>::register(id, "terminal.send", &replies, &attaching, &connected);
        let mut pending = (1..=9).map(|id| register(id).unwrap()).collect::<Vec<_>>();
        assert!(matches!(register(10), Err(Error::Rejected { .. })));
        drop(pending.remove(0));
        assert!(!replies.lock().unwrap().contains_key(&1));
        assert_eq!(replies.lock().unwrap().len(), 8);
        let ready = pending.remove(0);
        replies
            .lock()
            .unwrap()
            .remove(&2)
            .unwrap()
            .send(serde_json::json!({"jsonrpc":"2.0","id":2,"result":{"started":true}}))
            .unwrap();
        assert_eq!(ready.wait().unwrap()["started"], true);
        let abandoned = pending.remove(0);
        replies.lock().unwrap().clear();
        assert!(matches!(abandoned.wait(), Err(Error::Uncertain(_))));
        connected.store(false, Ordering::Release);
        assert!(matches!(register(11), Err(Error::Rejected { .. })));
    }
}
