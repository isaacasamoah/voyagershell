use std::io::Cursor;
use voyager_app::wire::{Frame, MAX_FRAME};

#[test]
fn workspace_changes_follow_owner_effects_without_chat_or_replays() {
    use std::{
        future::Future,
        task::{Context, Poll, Waker},
        time::{Duration, Instant},
    };
    use voyager_app::{client::Client, core::Core};
    use voyager_contract::{Action, ContentDestination, RenameTarget, Request, Status};
    fn ready<T>(future: impl Future<Output = T>) -> T {
        let mut future = std::pin::pin!(future);
        let mut context = Context::from_waker(Waker::noop());
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
                return value;
            }
            assert!(Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(1));
        }
    }
    let session = format!("voyager-workspace-changes-{}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    let checked = std::panic::catch_unwind(|| {
        let initial = client
            .call(Request {
                request_id: client.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            })
            .unwrap();
        let first = ready(client.workspace_changes(Some(initial.version))).unwrap();
        let request = Request {
            request_id: client.request_id(),
            expected_version: initial.version,
            action: Action::Rename {
                target: RenameTarget::Fleet {
                    id: initial.layout.selected_fleet.clone().unwrap(),
                },
                name: "Owner changed this".into(),
            },
        };
        let applied = client.call(request.clone()).unwrap();
        assert_eq!(applied.status, Status::Applied);
        assert_eq!(first.recv_blocking().unwrap(), applied.version);
        let quiet = ready(client.workspace_changes(Some(applied.version))).unwrap();
        assert!(first.is_closed());
        assert_eq!(client.call(request).unwrap().status, Status::Applied);
        assert!(matches!(
            quiet.try_recv(),
            Err(async_channel::TryRecvError::Empty)
        ));
        let refused = client
            .call(Request {
                request_id: client.request_id(),
                expected_version: 0,
                action: Action::CreateFleet {
                    voyage: initial.layout.selected_voyage.clone().unwrap(),
                    name: "Refused".into(),
                },
            })
            .unwrap();
        assert_eq!(refused.status, Status::Rejected);
        assert!(matches!(
            quiet.try_recv(),
            Err(async_channel::TryRecvError::Empty)
        ));
        let latest = ready(client.workspace_changes(Some(initial.version))).unwrap();
        assert!(quiet.is_closed());
        assert_eq!(latest.recv_blocking().unwrap(), applied.version);
        let committed = ready(client.workspace_changes(Some(applied.version))).unwrap();
        let partial = client
            .call(Request {
                request_id: client.request_id(),
                expected_version: applied.version,
                action: Action::CreateContent {
                    launch: None,
                    type_id: "notes".into(),
                    destination: ContentDestination::Portal {
                        voyage: initial.layout.selected_voyage.clone().unwrap(),
                    },
                },
            })
            .unwrap();
        assert_eq!(partial.status, Status::Uncertain);
        assert!(partial.version > applied.version);
        assert_eq!(committed.try_recv().unwrap(), partial.version);
    });
    let mut cleanup = Core::connect(&session).unwrap();
    let stopped = cleanup.server_stop();
    cleanup.close().unwrap();
    drop(client);
    stopped.unwrap();
    checked.unwrap();
}

#[test]
fn terminal_request_has_explicit_identity_and_target() {
    let request: voyager_contract::TerminalRequest = serde_json::from_value(
        serde_json::json!({"requestId":"open-1", "contentId":"content-1", "expectedVersion":"1"}),
    )
    .unwrap();
    assert_eq!(request.request_id, "open-1");
    assert_eq!(request.content_id.0, "content-1");
    assert!(serde_json::from_value::<voyager_contract::TerminalRequest>(
        serde_json::json!({"requestId":"open-1", "contentId":"content-1", "expectedVersion":"1", "caller":"owner"})
    )
    .is_err());
}

#[test]
fn framed_transport_roundtrips_and_refuses_oversize() {
    let frame = Frame {
        channel: 7,
        kind: 0,
        payload: b"hello".to_vec(),
    };
    let mut bytes = Vec::new();
    frame.write_to(&mut bytes).unwrap();
    assert_eq!(&bytes[..9], &[7, 0, 0, 0, 0, 5, 0, 0, 0]);
    assert_eq!(Frame::read_from(&mut Cursor::new(bytes)).unwrap(), frame);
    let mut header = vec![0; 9];
    header[5..9].copy_from_slice(&((MAX_FRAME as u32) + 1).to_le_bytes());
    let mut reader = Cursor::new(header);
    let error = Frame::read_from(&mut reader).unwrap_err();
    assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
    assert_eq!(reader.position(), 9);
}

#[test]
fn stale_marker_save_refuses_before_start() {
    use voyager_app::{
        client::Client,
        core::{Core, Error},
    };
    use voyager_contract::{Action, Request};
    let session = format!("voyager-terminal-marker-test-{}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    let initial = client
        .call(Request {
            request_id: client.request_id(),
            expected_version: 0,
            action: Action::Inspect,
        })
        .unwrap();
    let mut observer = Core::connect(&session).unwrap();
    observer
        .document_set("voyager-layout-v1", &initial.layout, initial.version)
        .unwrap();
    let result = client.terminal(
        initial.layout.contents[0].id.clone(),
        "stale-marker".into(),
        initial.version,
    );
    let terminals = observer.terminal_list().unwrap();
    let stopped = observer.server_stop();
    observer.close().unwrap();
    assert!(stopped.is_ok());
    assert!(
        matches!(result, Err(Error::Rejected { kind, message }) if kind == "conflict" && message.contains("no start was issued"))
    );
    assert!(terminals.is_empty());
}

#[test]
fn finished_terminal_attachment_is_a_known_core_refusal() {
    use std::{
        thread,
        time::{Duration, Instant},
    };
    use voyager_app::core::{Core, Error};
    let session = format!("voyager-terminal-finished-test-{}", std::process::id());
    let mut core = Core::connect(&session).unwrap();
    let started = core
        .terminal_run_with(
            serde_json::from_value(serde_json::json!({"cwd":"/tmp", "line":"exit 0"})).unwrap(),
        )
        .unwrap();
    let address = started.address.as_str();
    let deadline = Instant::now() + Duration::from_secs(10);
    let finished = loop {
        let terminal = core.terminal_get(address).unwrap();
        if terminal.state == "finished" {
            break true;
        }
        if Instant::now() >= deadline {
            break false;
        }
        thread::sleep(Duration::from_millis(10));
    };
    let attached = core.terminal_attach(address);
    let stopped = core.server_stop();
    core.close().unwrap();
    assert!(stopped.is_ok());
    assert!(finished);
    assert!(matches!(attached, Err(Error::Rejected { kind, .. }) if kind == "finished"));
}

#[test]
fn framed_core_attaches_and_detaches_without_stopping_terminal() {
    use std::{
        thread,
        time::{Duration, Instant},
    };
    use voyager_app::core::Core;
    let session = format!("voyager-terminal-wire-test-{}", std::process::id());
    let mut core = Core::connect(&session).unwrap();
    #[cfg(unix)]
    let intended_endpoint = std::env::var_os("XDG_RUNTIME_DIR")
        .filter(|value| !value.is_empty())
        .map(|runtime| {
            std::path::PathBuf::from(runtime)
                .join("herdr-core")
                .join(format!("{session}.sock"))
                .exists()
        });
    let result = {
        let terminal = core
            .terminal_run_with(serde_json::from_value(serde_json::json!({"cwd":"/tmp"})).unwrap())
            .unwrap();
        let address = terminal.address.as_str();
        let attach = core.terminal_attach(address).unwrap();
        let viewer = core.viewer(attach.channel).unwrap();
        viewer
            .input(b"printf 'voyager_wire_%s\\n' 'result'\n".to_vec())
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        let mut output = Vec::new();
        while Instant::now() < deadline
            && !output
                .windows(b"voyager_wire_result".len())
                .any(|part| part == b"voyager_wire_result")
        {
            let bytes = viewer.take(65536).unwrap();
            if !bytes.is_empty() {
                viewer.credit(bytes.len() as u32).unwrap();
                output.extend(bytes);
            }
            thread::sleep(Duration::from_millis(10));
        }
        viewer.close().unwrap();
        let terminal = core.terminal_get(address).unwrap();
        (output, terminal)
    };
    let stopped = core.server_stop();
    core.close().unwrap();
    assert!(stopped.is_ok());
    #[cfg(unix)]
    assert_ne!(intended_endpoint, Some(false));
    assert!(
        result
            .0
            .windows(b"voyager_wire_result".len())
            .any(|part| part == b"voyager_wire_result")
    );
    assert!(result.1.pid.is_some());
}

#[test]
fn workspace_terminal_binding_is_persisted_before_attach() {
    use voyager_app::{
        client::Client,
        core::{Core, Error},
    };
    use voyager_contract::{Action, Request, Status};
    let session = format!("voyager-terminal-binding-test-{}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    let inspect = || {
        client
            .call(Request {
                request_id: client.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            })
            .unwrap()
    };
    let initial = inspect();
    let content = initial.layout.contents[0].id.clone();
    let opened = client.terminal(content.clone(), "binding-test".into(), initial.version);
    let refreshed = inspect();
    let repeated = client.terminal(content.clone(), "binding-test".into(), initial.version);
    let altered = client.terminal(content.clone(), "binding-test".into(), refreshed.version);
    let stale = client.terminal(content.clone(), "stale-test".into(), initial.version);
    let mut cleanup = Core::connect(&session).unwrap();
    let actual = refreshed.layout.contents[0]
        .backend
        .as_ref()
        .map(|address| cleanup.terminal_get(&address.0).unwrap());
    let stopped = cleanup.server_stop();
    cleanup.close().unwrap();
    assert!(opened.is_ok());
    assert!(
        opened
            .as_ref()
            .unwrap()
            .same_channel(repeated.as_ref().unwrap())
    );
    assert!(matches!(altered, Err(Error::Rejected { .. })));
    assert!(matches!(stale, Err(Error::Rejected { .. })));
    assert!(stopped.is_ok());
    assert_eq!(refreshed.status, Status::Applied);
    assert!(refreshed.version > initial.version);
    assert_eq!(refreshed.layout.contents[0].id, content);
    assert!(refreshed.layout.contents[0].backend.is_some());
    assert_eq!(refreshed.layout.contents[0].start_pending, None);
    assert_eq!(
        actual.unwrap().labels["voyager-operation"],
        "voyager-start-binding-test"
    );
}

#[test]
fn controlled_lost_start_reply_remains_pending_after_reopen() {
    use voyager_app::{client::Client, core::Core};
    use voyager_contract::{Action, Request};
    let session = format!("voyager-terminal-pending-test-{}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    fn inspect(client: &Client) -> voyager_contract::Response {
        client
            .call(Request {
                request_id: client.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            })
            .unwrap()
    }
    let initial = inspect(&client);
    let mut layout = (*initial.layout).clone();
    let content = layout.contents[0].id.clone();
    layout.contents[0].start_pending = Some("voyager-start-proof".into());
    let mut observer = Core::connect(&session).unwrap();
    observer
        .document_set("voyager-layout-v1", &layout, initial.version)
        .unwrap();
    let started = observer
        .terminal_run("/tmp", "voyager-start-proof")
        .unwrap();
    let address = started.address.clone();
    drop(client);
    let reopened = Client::open(session.clone(), "/tmp".into());
    let refreshed = inspect(&reopened);
    let refused = reopened.terminal(content, "reopen-test".into(), refreshed.version);
    let terminals = observer.terminal_list().unwrap();
    let stopped = observer.server_stop();
    observer.close().unwrap();
    assert_eq!(
        refreshed.layout.contents[0].start_pending.as_deref(),
        Some("voyager-start-proof")
    );
    assert!(refused.is_err());
    assert_eq!(terminals.len(), 1);
    assert_eq!(terminals[0].address, address);
    assert_eq!(
        terminals[0].labels["voyager-operation"],
        "voyager-start-proof"
    );
    assert!(stopped.is_ok());
}
