use super::*;
use std::{
    future::Future,
    task::{Context as TaskContext, Poll, Waker},
};
use voyager_contract::content::{
    Notes, Request as ContentRequest, Response as ContentResponse, Version,
};

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
fn reads_wait_for_queue_space_and_cancel_without_replaying_effects() {
    let directory = std::env::temp_dir().join(format!("voyager-n3-mailbox-{}", std::process::id()));
    std::fs::create_dir_all(directory.join("vessels/notes")).unwrap();
    std::fs::write(
        directory.join("vessels/notes/vessel.json"),
        br#"{"name":"Notes"}"#,
    )
    .unwrap();
    let mut owner = crate::content::Owner::open(&directory).unwrap();
    let id = VesselId("notes".into());
    owner.initialize(&id).unwrap();
    let (sender, receive) = async_channel::bounded(8);
    let client = detached(sender, "mailbox-test");
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
    let Message::BindContent { id, reply } = next(&receive) else {
        panic!("Expected binding");
    };
    reply
        .try_send(
            owner
                .register_existing(&id)
                .map_err(|error| error.to_string()),
        )
        .unwrap();
    let Poll::Ready(Ok(binding)) = binding.as_mut().poll(&mut cx) else {
        panic!("Binding did not complete");
    };
    fill(&client);
    let mut subscribed = Box::pin(client.content_changes(binding.clone(), Some(0)));
    assert!(subscribed.as_mut().poll(&mut cx).is_pending());
    receive.try_recv().unwrap();
    assert!(subscribed.as_mut().poll(&mut cx).is_pending());
    let Message::ContentChanges {
        binding: observed,
        after,
        reply,
    } = next(&receive)
    else {
        panic!("Expected subscription");
    };
    reply
        .try_send(Ok(owner.subscribe(&observed, after)))
        .unwrap();
    let Poll::Ready(Ok(changes)) = subscribed.as_mut().poll(&mut cx) else {
        panic!("Subscription did not complete");
    };
    fill(&client);
    let inspect = ContentRequest::Inspect {
        version: Version::V1,
        request_id: "read".into(),
        vessel_id: id.clone(),
    };
    let mut read =
        Box::pin(client.read_content(crate::content::Access::View(binding.clone()), inspect));
    assert!(read.as_mut().poll(&mut cx).is_pending());
    receive.try_recv().unwrap();
    assert!(read.as_mut().poll(&mut cx).is_pending());
    let Message::Content {
        access,
        request,
        reply,
        close_ticket,
        native_save,
    } = next(&receive)
    else {
        panic!("Expected read");
    };
    assert_eq!(access, crate::content::Access::View(binding.clone()));
    assert!(close_ticket.is_none());
    assert!(!native_save);
    reply.deliver(Arc::new(owner.call(&binding, request)));
    let Poll::Ready(Ok(snapshot)) = read.as_mut().poll(&mut cx) else {
        panic!("Read did not complete");
    };
    let ContentResponse::Snapshot { snapshot, .. } = &*snapshot else {
        panic!("Expected snapshot");
    };
    let update = ContentRequest::Update {
        version: Version::V1,
        request_id: "update".into(),
        vessel_id: id,
        expected_revision: snapshot.revision.clone(),
        data: Notes {
            title: "Updated".into(),
            text: "Body".into(),
        },
    };
    assert!(matches!(
        owner.call(&binding, update.clone()),
        ContentResponse::Applied { .. }
    ));
    assert_eq!(changes.try_recv().unwrap(), 1);
    fill(&client);
    assert!(matches!(
        client.content(
            crate::content::Access::View(binding.clone()),
            update.clone()
        ),
        Err(CallError::Rejected(_))
    ));
    let mut forbidden =
        Box::pin(client.read_content(crate::content::Access::View(binding.clone()), update));
    assert!(matches!(
        forbidden.as_mut().poll(&mut cx),
        Poll::Ready(Err(CallError::Rejected(_)))
    ));
    let invoke = ContentRequest::Invoke {
        version: Version::V1,
        request_id: "invoke-read".into(),
        vessel_id: VesselId("notes".into()),
        expected_revision: "0".into(),
        action: "flip".into(),
        args: serde_json::json!({}),
    };
    let mut forbidden =
        Box::pin(client.read_content(crate::content::Access::View(binding.clone()), invoke));
    assert!(matches!(
        forbidden.as_mut().poll(&mut cx),
        Poll::Ready(Err(CallError::Rejected(_)))
    ));
    assert_eq!(receive.len(), 8);
    let view = crate::content::ViewBinding::new(binding.clone());
    view.activate().unwrap();
    let inspect = ContentRequest::Inspect {
        version: Version::V1,
        request_id: "retired-read".into(),
        vessel_id: binding.id().clone(),
    };
    let mut retired = Box::pin(client.read_content_view(&view, inspect.clone()));
    assert!(retired.as_mut().poll(&mut cx).is_pending());
    view.retire();
    assert!(matches!(
        retired.as_mut().poll(&mut cx),
        Poll::Ready(Err(CallError::Rejected(_)))
    ));
    assert_eq!(receive.len(), 8);
    for _ in 0..8 {
        receive.try_recv().unwrap();
    }
    let pending = crate::content::ViewBinding::new(binding.clone());
    let mut staged = Box::pin(client.read_content_view(&pending, inspect.clone()));
    assert!(staged.as_mut().poll(&mut cx).is_pending());
    assert!(receive.is_empty());
    assert!(matches!(
        client.content_view(
            &pending,
            ContentRequest::Inspect {
                version: Version::V1,
                request_id: "staged-effect".into(),
                vessel_id: binding.id().clone(),
            }
        ),
        Err(CallError::Rejected(_))
    ));
    assert!(receive.is_empty());
    pending.activate().unwrap();
    assert!(staged.as_mut().poll(&mut cx).is_pending());
    let Message::Content { request, reply, .. } = receive.try_recv().unwrap() else {
        panic!("Expected published read")
    };
    reply.deliver(Arc::new(owner.call(&binding, request)));
    assert!(matches!(staged.as_mut().poll(&mut cx), Poll::Ready(Ok(_))));
    let mut observed = Box::pin(client.view_changed(&pending, Some(1)));
    assert!(observed.as_mut().poll(&mut cx).is_pending());
    let Message::ContentChanges { after, reply, .. } = receive.try_recv().unwrap() else {
        panic!("Expected published subscription")
    };
    reply
        .try_send(Ok(owner.subscribe(&binding, after)))
        .unwrap();
    assert!(observed.as_mut().poll(&mut cx).is_pending());
    pending.retire();
    assert!(matches!(
        observed.as_mut().poll(&mut cx),
        Poll::Ready(Err(CallError::Rejected(_)))
    ));
    let ContentResponse::Snapshot { snapshot, .. } = owner.call(&binding, inspect) else {
        panic!("Expected current data")
    };
    let accepted = crate::content::ViewBinding::new(binding.clone());
    accepted.activate().unwrap();
    let request = ContentRequest::Update {
        version: Version::V1,
        request_id: "accepted-save".into(),
        vessel_id: binding.id().clone(),
        expected_revision: snapshot.revision,
        data: Notes {
            title: "Accepted".into(),
            text: "After retirement".into(),
        },
    };
    let writing = {
        let client = client.clone();
        let view = accepted.clone();
        std::thread::spawn(move || client.content_view(&view, request))
    };
    let Message::Content { request, reply, .. } = receive.recv_blocking().unwrap() else {
        panic!("Expected accepted save")
    };
    accepted.retire();
    reply.deliver(Arc::new(owner.call(&binding, request)));
    assert!(matches!(
        &*writing.join().unwrap().unwrap(),
        ContentResponse::Applied { .. }
    ));
    assert!(receive.is_empty());
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn a_deferred_rename_resumes_as_the_program_that_asked() {
    let vessel = VesselId("agent".into());
    let request = Request {
        request_id: "rename-1".into(),
        expected_version: 0,
        action: Action::Inspect,
    };
    let (reply, _) = mpsc::sync_channel(1);
    let ready = Message::NoteRenameReady {
        request: request.clone(),
        scope: None,
        program: Some(vessel.clone()),
        reply,
        result: Ok(None),
    };
    let Message::NoteRenameReady {
        request: resumed,
        scope,
        program,
        ..
    } = ready
    else {
        unreachable!()
    };
    let first = Envelope::admitted(Some(&vessel), None, &request);
    let again = Envelope::admitted(program.as_ref(), scope.as_ref(), &resumed);
    assert_eq!(first, again);
    assert_ne!(again, Envelope::admitted(None, None, &resumed));
}
