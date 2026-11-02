use std::io::Cursor;
use voyager_app::wire::{Frame, MAX_FRAME};

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
    observer.rpc("doc.set", serde_json::json!({"name":"voyager-layout-v1", "value":initial.layout, "version":initial.version})).unwrap();
    let result = client.terminal(
        initial.layout.contents[0].id.clone(),
        "stale-marker".into(),
        initial.version,
    );
    let terminals = observer
        .rpc("terminal.list", serde_json::json!({"all":true}))
        .unwrap();
    let stopped = observer.rpc("server.stop", serde_json::json!({}));
    observer.close().unwrap();
    assert!(stopped.is_ok());
    assert!(
        matches!(result, Err(Error::Rejected { kind, message }) if kind == "conflict" && message.contains("no start was issued"))
    );
    assert!(terminals["terminals"].as_array().unwrap().is_empty());
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
        .rpc(
            "terminal.run",
            serde_json::json!({"cwd":"/tmp", "line":"exit 0"}),
        )
        .unwrap();
    let address = started["address"].as_str().unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    let finished = loop {
        let terminal = core
            .rpc("terminal.get", serde_json::json!({"terminal":address}))
            .unwrap();
        if terminal["state"] == "finished" {
            break true;
        }
        if Instant::now() >= deadline {
            break false;
        }
        thread::sleep(Duration::from_millis(10));
    };
    let attached = core.rpc(
        "terminal.attach",
        serde_json::json!({"terminal":address, "cols":80, "rows":24}),
    );
    let stopped = core.rpc("server.stop", serde_json::json!({}));
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
    let result = {
        let terminal = core
            .rpc("terminal.run", serde_json::json!({"cwd":"/tmp"}))
            .unwrap();
        let address = terminal["address"].as_str().unwrap();
        let attach = core
            .rpc(
                "terminal.attach",
                serde_json::json!({"terminal":address,"cols":80,"rows":24}),
            )
            .unwrap();
        let viewer = core
            .viewer(attach["channel"].as_u64().unwrap() as u32)
            .unwrap();
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
        let terminal = core
            .rpc("terminal.get", serde_json::json!({"terminal":address}))
            .unwrap();
        (output, terminal)
    };
    let stopped = core.rpc("server.stop", serde_json::json!({}));
    core.close().unwrap();
    assert!(stopped.is_ok());
    assert!(
        result
            .0
            .windows(b"voyager_wire_result".len())
            .any(|part| part == b"voyager_wire_result")
    );
    assert!(result.1["pid"].as_u64().is_some());
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
        .map(|address| {
            cleanup
                .rpc("terminal.get", serde_json::json!({"terminal":address.0}))
                .unwrap()
        });
    let stopped = cleanup.rpc("server.stop", serde_json::json!({}));
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
        actual.unwrap()["labels"]["voyager-operation"],
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
    observer.rpc("doc.set", serde_json::json!({"name":"voyager-layout-v1", "value":layout, "version":initial.version})).unwrap();
    let started = observer.rpc("terminal.run", serde_json::json!({"cwd":"/tmp", "no_parent":true, "labels":{"voyager-operation":"voyager-start-proof"}})).unwrap();
    let address = started["address"].as_str().unwrap().to_string();
    drop(client);
    let reopened = Client::open(session.clone(), "/tmp".into());
    let refreshed = inspect(&reopened);
    let refused = reopened.terminal(content, "reopen-test".into(), refreshed.version);
    let terminals = observer
        .rpc("terminal.list", serde_json::json!({"all":true}))
        .unwrap();
    let stopped = observer.rpc("server.stop", serde_json::json!({}));
    observer.close().unwrap();
    assert_eq!(
        refreshed.layout.contents[0].start_pending.as_deref(),
        Some("voyager-start-proof")
    );
    assert!(refused.is_err());
    let terminals = terminals["terminals"].as_array().unwrap();
    assert_eq!(terminals.len(), 1);
    assert_eq!(terminals[0]["address"], address);
    assert_eq!(
        terminals[0]["labels"]["voyager-operation"],
        "voyager-start-proof"
    );
    assert!(stopped.is_ok());
}
