use super::{Error, MAX_INPUT_BYTES, Streams, enqueue};
use crate::wire::Frame;
use serde_json::json;
use std::sync::{Arc, Mutex, OnceLock, Weak, mpsc::SyncSender};

pub(super) struct Lease {
    pub(super) channel: u32,
    pub(super) streams: Arc<Mutex<Streams>>,
    pub(super) control: SyncSender<Frame>,
    pub(super) link: Arc<OnceLock<String>>,
}

impl Lease {
    fn close_frame(&self) -> Frame {
        Frame {
            channel: self.channel,
            kind: 2,
            payload: Vec::new(),
        }
    }

    fn close(&self) -> Result<(), Error> {
        enqueue(
            &self.link,
            &self.control,
            self.close_frame(),
            "frame was not queued",
        )?;
        self.release();
        Ok(())
    }

    fn release(&self) -> bool {
        let Ok(mut streams) = self.streams.lock() else {
            return false;
        };
        let Some(buffer) = streams.buffers.remove(&self.channel) else {
            return false;
        };
        streams.total -= buffer.bytes.len();
        true
    }
}

impl Drop for Lease {
    fn drop(&mut self) {
        if self.release() {
            let _ = enqueue(
                &self.link,
                &self.control,
                self.close_frame(),
                "frame was not queued",
            );
        }
    }
}

#[derive(Clone)]
pub struct Viewer {
    pub(super) lease: Arc<Lease>,
    pub(super) initial_size: (u16, u16),
    pub(super) input: SyncSender<Frame>,
    pub(super) input_open: Arc<Mutex<bool>>,
}

#[derive(Clone)]
pub struct WeakViewer {
    pub(super) lease: Weak<Lease>,
    pub(super) initial_size: (u16, u16),
    pub(super) input: SyncSender<Frame>,
    pub(super) input_open: Arc<Mutex<bool>>,
}

impl From<Viewer> for WeakViewer {
    fn from(viewer: Viewer) -> Self {
        Self {
            lease: Arc::downgrade(&viewer.lease),
            initial_size: viewer.initial_size,
            input: viewer.input,
            input_open: viewer.input_open,
        }
    }
}

impl WeakViewer {
    pub fn upgrade(&self) -> Result<Viewer, Error> {
        let lease = self.lease.upgrade().ok_or_else(|| Error::Rejected {
            kind: "viewer_expired".into(),
            message: "The original request attached a viewer that has since closed; no attachment was repeated".into(),
        })?;
        Ok(Viewer {
            lease,
            initial_size: self.initial_size,
            input: self.input.clone(),
            input_open: self.input_open.clone(),
        })
    }
}

impl Viewer {
    pub fn initial_size(&self) -> (u16, u16) {
        self.initial_size
    }

    pub fn ensure_open(&self) -> Result<(), Error> {
        if !self.connected() {
            return Err(Error::Uncertain(
                "Core connection is unavailable; no attachment was repeated".into(),
            ));
        }
        let streams = self
            .lease
            .streams
            .lock()
            .map_err(|error| Error::Uncertain(error.to_string()))?;
        if streams
            .buffers
            .get(&self.lease.channel)
            .is_none_or(|stream| stream.closed)
        {
            return Err(Error::Rejected {
                kind: "viewer_expired".into(),
                message: "The original request attached a viewer that has since closed; no attachment was repeated".into(),
            });
        }
        Ok(())
    }

    pub fn same_channel(&self, other: &Self) -> bool {
        self.lease.channel == other.lease.channel
            && Arc::ptr_eq(&self.lease.streams, &other.lease.streams)
    }

    pub fn take(&self, limit: usize) -> Result<Vec<u8>, Error> {
        let mut streams = self
            .lease
            .streams
            .lock()
            .map_err(|e| Error::Uncertain(e.to_string()))?;
        let buffer = streams
            .buffers
            .get_mut(&self.lease.channel)
            .ok_or_else(|| Error::Uncertain("Viewer is closed".into()))?;
        let count = limit.min(65536).min(buffer.bytes.len());
        let bytes = buffer.bytes.drain(..count).collect();
        if !buffer.bytes.is_empty() {
            let _ = buffer.wake.try_send(());
        }
        streams.total -= count;
        Ok(bytes)
    }

    pub fn credit(&self, bytes: u32) -> Result<(), Error> {
        self.send(&self.lease.control, 1, bytes.to_le_bytes().to_vec())
    }

    pub async fn ready(&self) -> Result<(), Error> {
        let ready = self
            .lease
            .streams
            .lock()
            .map_err(|e| Error::Uncertain(e.to_string()))?
            .buffers
            .get(&self.lease.channel)
            .ok_or_else(|| Error::Uncertain("Viewer is closed".into()))?
            .ready
            .clone();
        ready
            .recv()
            .await
            .map_err(|_| Error::Uncertain("Viewer is closed".into()))
    }

    pub fn input(&self, bytes: Vec<u8>) -> Result<(), Error> {
        let open = self
            .input_open
            .lock()
            .map_err(|error| Error::Uncertain(error.to_string()))?;
        if !*open {
            return Err(Error::Rejected {
                kind: "quitting".into(),
                message: "Voyager is quitting; no terminal input was queued".into(),
            });
        }
        self.input_frame(bytes)
    }

    pub fn protocol_reply(&self, bytes: Vec<u8>) -> Result<(), Error> {
        self.input_frame(bytes)
    }

    fn input_frame(&self, bytes: Vec<u8>) -> Result<(), Error> {
        if bytes.len() > MAX_INPUT_BYTES {
            return Err(Error::Rejected {
                kind: "too_large".into(),
                message: "Terminal input exceeds 64 KiB".into(),
            });
        }
        self.send(&self.input, 0, bytes)
    }

    pub fn focus(&self, focused: bool) -> Result<(), Error> {
        self.send(&self.lease.control, 4, vec![u8::from(focused)])
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), Error> {
        let mut payload = Vec::with_capacity(4);
        payload.extend_from_slice(&cols.to_le_bytes());
        payload.extend_from_slice(&rows.to_le_bytes());
        self.send(&self.lease.control, 3, payload)
    }

    pub fn display(
        &self,
        width: u32,
        height: u32,
        fg: String,
        bg: String,
        cursor: Option<String>,
    ) -> Result<(), Error> {
        self.send(
            &self.lease.control,
            5,
            serde_json::to_vec(
                &json!({ "cell": [width, height], "fg": fg, "bg": bg, "cursor": cursor }),
            )
            .map_err(|error| Error::Uncertain(error.to_string()))?,
        )
    }

    pub fn close(&self) -> Result<(), Error> {
        self.lease.close()
    }

    pub fn connected(&self) -> bool {
        self.lease.link.get().is_none()
    }

    pub fn finished(&self) -> Result<bool, Error> {
        let streams = self
            .lease
            .streams
            .lock()
            .map_err(|e| Error::Uncertain(e.to_string()))?;
        let stream = streams
            .buffers
            .get(&self.lease.channel)
            .ok_or_else(|| Error::Uncertain("Viewer is closed".into()))?;
        Ok(stream.closed && stream.bytes.is_empty())
    }

    fn send(&self, queue: &SyncSender<Frame>, kind: u8, payload: Vec<u8>) -> Result<(), Error> {
        enqueue(
            &self.lease.link,
            queue,
            Frame {
                channel: self.lease.channel,
                kind,
                payload,
            },
            "frame was not queued",
        )
    }
}
