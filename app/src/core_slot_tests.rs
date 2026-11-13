use super::{Lease, Stream, Streams, TOTAL_LIMIT, Viewer, reader::Reader};
use crate::wire::Frame;
use serde_json::json;
use std::sync::{
    Arc, Mutex,
    mpsc::{self, Receiver, SyncSender},
};

fn streams(entries: &[(u32, &[u8], bool)]) -> Arc<Mutex<Streams>> {
    let mut streams = Streams::default();
    for &(channel, bytes, closed) in entries {
        let mut stream = Stream::default();
        stream.bytes.extend(bytes);
        stream.closed = closed;
        streams.total += bytes.len();
        streams.buffers.insert(channel, stream);
    }
    Arc::new(Mutex::new(streams))
}

fn viewer(channel: u32, streams: &Arc<Mutex<Streams>>, control: &SyncSender<Frame>) -> Viewer {
    let (input, _) = mpsc::sync_channel(1);
    Viewer {
        lease: Arc::new(Lease {
            channel,
            streams: streams.clone(),
            control: control.clone(),
            link: Arc::default(),
        }),
        initial_size: (80, 24),
        input,
        input_open: Arc::new(Mutex::new(true)),
    }
}

fn reader(streams: &Arc<Mutex<Streams>>, control: &SyncSender<Frame>, attach: u64) -> Reader {
    Reader {
        streams: streams.clone(),
        replies: Default::default(),
        attaches: Arc::new(Mutex::new([attach].into())),
        activity: Default::default(),
        control: control.clone(),
    }
}

fn closes(control: &Receiver<Frame>) -> Vec<u32> {
    control
        .try_iter()
        .filter(|frame| frame.kind == 2)
        .map(|frame| frame.channel)
        .collect()
}

#[test]
fn a_terminal_that_ended_before_install_frees_its_slot_and_channel() {
    let streams = streams(&[(7, b"crashed on startup", true)]);
    let (control, sent) = mpsc::sync_channel(4);
    let attached = viewer(7, &streams, &control);
    assert!(attached.ensure_open().is_err());
    drop(attached);
    let left = streams.lock().unwrap();
    assert_eq!((left.occupied(), left.total), (0, 0));
    assert_eq!(closes(&sent), [7]);
}

#[test]
fn a_new_viewer_refused_because_the_old_close_failed_frees_its_slot() {
    let streams = streams(&[(5, b"", false), (6, b"prompt", false)]);
    let (control, sent) = mpsc::sync_channel(1);
    control
        .try_send(Frame {
            channel: 5,
            kind: 1,
            payload: vec![0; 4],
        })
        .unwrap();
    let old = viewer(5, &streams, &control);
    let new = viewer(6, &streams, &control);
    assert!(old.close().is_err());
    drop(new);
    let left = streams.lock().unwrap();
    assert!(left.buffers.contains_key(&5));
    assert!(!left.buffers.contains_key(&6));
    assert_eq!((left.occupied(), left.total), (1, 0));
    drop(left);
    assert!(closes(&sent).is_empty());
}

#[test]
fn output_on_an_unknown_channel_is_dropped_even_when_the_buffer_is_full() {
    let streams = streams(&[(7, b"", false)]);
    streams.lock().unwrap().total = TOTAL_LIMIT;
    let (control, _) = mpsc::sync_channel(4);
    let reader = reader(&streams, &control, 0);
    let stale = Frame {
        channel: 9,
        kind: 0,
        payload: b"late output".to_vec(),
    };
    assert_eq!(reader.receive(stale), Ok(()));
    assert_eq!(streams.lock().unwrap().total, TOTAL_LIMIT);
}

#[test]
fn an_attach_reply_after_its_request_timed_out_closes_the_channel() {
    let streams = streams(&[]);
    let (control, sent) = mpsc::sync_channel(4);
    let reader = reader(&streams, &control, 5);
    let reply = json!({"jsonrpc":"2.0","id":5,"result":{"channel":9}});
    let frame = Frame {
        channel: 0,
        kind: 0,
        payload: serde_json::to_vec(&reply).unwrap(),
    };
    assert_eq!(reader.receive(frame), Ok(()));
    assert!(streams.lock().unwrap().buffers.is_empty());
    assert_eq!(closes(&sent), [9]);
}
