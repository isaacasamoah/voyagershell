use super::*;
use std::{
    future::Future,
    task::{Context as TaskContext, Poll, Waker},
};
use voyager_contract::content::{Request as ContentRequest, Version};

pub(super) fn detached(sender: async_channel::Sender<Message>, identity: &str) -> Client {
    Client {
        sender,
        sequence: Arc::new(AtomicU64::new(0)),
        identity: identity.into(),
        activity: Arc::default(),
        prepared_context: Arc::default(),
        placement_notice: Arc::default(),
        workspace_words: Arc::default(),
        replies: crate::replies::Replies::default(),
        package_revision: Arc::new(AtomicU64::new(0)),
        readiness: Arc::new(super::ready::Readiness::open()),
    }
}

fn fill(client: &Client) {
    for _ in 0..8 {
        let (reply, _) = mpsc::sync_channel(1);
        assert!(
            client
                .sender
                .try_send(Message::Workspace {
                    request: Request {
                        request_id: "filler".into(),
                        expected_version: 0,
                        action: Action::Inspect
                    },
                    scope: None,
                    program: None,
                    reply,
                    queued_at: std::time::Instant::now(),
                    claim: Claim::default(),
                })
                .is_ok()
        );
    }
}

fn next(receive: &async_channel::Receiver<Message>) -> Message {
    loop {
        let message = receive.try_recv().unwrap();
        if !matches!(message, Message::Workspace { .. }) {
            return message;
        }
    }
}

#[test]
fn a_binding_waits_for_queue_space_and_a_content_call_refuses_a_full_queue() {
    let (sender, receive) = async_channel::bounded(8);
    let client = detached(sender, "mailbox-test");
    let id = VesselId("vessel-1".into());
    let mut cx = TaskContext::from_waker(Waker::noop());
    fill(&client);
    let mut cancelled = Box::pin(client.bind_content(id.clone()));
    assert!(cancelled.as_mut().poll(&mut cx).is_pending());
    drop(cancelled);
    for _ in 0..8 {
        receive.try_recv().unwrap();
    }
    assert!(receive.is_empty());
    fill(&client);
    let mut binding = Box::pin(client.bind_content(id.clone()));
    assert!(binding.as_mut().poll(&mut cx).is_pending());
    receive.try_recv().unwrap();
    assert!(binding.as_mut().poll(&mut cx).is_pending());
    let Message::BindContent { id: asked, reply } = next(&receive) else {
        panic!("Expected binding");
    };
    assert_eq!(asked, id);
    reply
        .try_send(Err("Content owner unavailable".into()))
        .unwrap();
    assert!(matches!(
        binding.as_mut().poll(&mut cx),
        Poll::Ready(Err(message)) if message == "Content owner unavailable"
    ));
    assert!(receive.is_empty());
    fill(&client);
    let invoke = ContentRequest::Invoke {
        version: Version::V1,
        request_id: "invoke".into(),
        vessel_id: id,
        expected_revision: "0".into(),
        action: "flip".into(),
        args: serde_json::json!({}),
    };
    assert!(matches!(
        client.content(
            crate::content::Access::Agent {
                scope: Context::Workspace,
                expected_version: 0,
            },
            invoke
        ),
        Err(CallError::Rejected(_))
    ));
    assert_eq!(receive.len(), 8);
}
