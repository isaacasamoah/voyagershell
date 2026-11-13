use super::{Core, Stream, Streams, TOTAL_LIMIT, VIEW_LIMIT, pending::Replies};
use crate::{activity::Activity, wire::Frame};
use serde_json::Value;
use std::{
    collections::HashSet,
    sync::{Arc, Mutex, mpsc::SyncSender},
};

pub(super) type Attaches = Arc<Mutex<HashSet<u64>>>;

pub(super) struct Reader {
    pub(super) streams: Arc<Mutex<Streams>>,
    pub(super) replies: Replies,
    pub(super) attaches: Attaches,
    pub(super) activity: Arc<Mutex<Activity>>,
    pub(super) control: SyncSender<Frame>,
}

impl Reader {
    pub(super) fn receive(&self, frame: Frame) -> Result<(), String> {
        let terminal_channel = self
            .streams
            .lock()
            .is_ok_and(|streams| streams.buffers.contains_key(&frame.channel));
        if !terminal_channel && Core::activity_frame(&self.activity, &self.control, &frame) {
            return Ok(());
        }
        match (frame.channel, frame.kind) {
            (0, 0) => self.reply(&frame.payload),
            (0, _) => Ok(()),
            (channel, 0) => {
                if terminal_channel {
                    crate::typing_trace::transport(
                        "output_frame_received",
                        channel,
                        frame.payload.len(),
                    );
                }
                self.output(frame)
            }
            (channel, 2) => {
                self.ended(channel);
                Ok(())
            }
            _ => Ok(()),
        }
    }

    fn reply(&self, payload: &[u8]) -> Result<(), String> {
        let Ok(message) = serde_json::from_slice::<Value>(payload) else {
            return Err("Core sent an invalid reply".into());
        };
        let Some(id) = message.get("id").and_then(Value::as_u64) else {
            return Ok(());
        };
        let attach = self
            .attaches
            .lock()
            .map_err(|_| "internal lock failed".to_string())?
            .remove(&id);
        let channel = attach
            .then(|| Core::response(message.clone(), id).ok())
            .flatten()
            .and_then(|result| result.get("channel").and_then(Value::as_u64))
            .and_then(|channel| u32::try_from(channel).ok());
        let mut replies = self
            .replies
            .lock()
            .map_err(|_| "internal lock failed".to_string())?;
        let reply = replies.remove(&id);
        match (channel, &reply) {
            (Some(channel), Some(_)) => {
                let mut streams = self
                    .streams
                    .lock()
                    .map_err(|_| "internal lock failed".to_string())?;
                if channel == 0 || streams.buffers.insert(channel, Stream::default()).is_some() {
                    return Err("Core attached an invalid channel".into());
                }
            }
            (Some(channel), None) if channel != 0 => {
                let _ = self.control.try_send(Frame {
                    channel,
                    kind: 2,
                    payload: Vec::new(),
                });
            }
            _ => {}
        }
        if let Some(reply) = reply {
            let _ = reply.try_send(message);
        }
        Ok(())
    }

    fn output(&self, frame: Frame) -> Result<(), String> {
        let mut streams = self
            .streams
            .lock()
            .map_err(|_| "internal lock failed".to_string())?;
        let total = streams.total;
        let Some(buffer) = streams.buffers.get_mut(&frame.channel) else {
            return Ok(());
        };
        if total + frame.payload.len() > TOTAL_LIMIT {
            return Err("buffered output exceeded 16 MiB".into());
        }
        if buffer.closed {
            return Err("Core sent output after close".into());
        }
        if buffer.bytes.len() + frame.payload.len() > VIEW_LIMIT {
            return Err("viewer output exceeded 1 MiB".into());
        }
        let count = frame.payload.len();
        buffer.bytes.extend(frame.payload);
        let _ = buffer.wake.try_send(());
        streams.total += count;
        Ok(())
    }

    fn ended(&self, channel: u32) {
        if let Ok(mut streams) = self.streams.lock()
            && let Some(buffer) = streams.buffers.get_mut(&channel)
        {
            buffer.closed = true;
            let _ = buffer.wake.try_send(());
        }
    }

    pub(super) fn fail(&self) {
        if let Ok(mut replies) = self.replies.lock() {
            replies.clear();
        }
        if let Ok(mut activity) = self.activity.lock() {
            activity.fail("Core is disconnected");
        }
        if let Ok(streams) = self.streams.lock() {
            for stream in streams.buffers.values() {
                let _ = stream.wake.try_send(());
            }
        }
    }
}
