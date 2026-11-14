use super::*;

#[test]
fn reported_activity_frames_credit_close_and_control_are_separate() {
    let activity = Arc::new(Mutex::new(Activity::default()));
    let (control, receive) = mpsc::sync_channel(4);
    {
        let mut facts = activity.lock().unwrap();
        facts.bind(["t1"]);
        facts.begin();
    }
    let mut payload = serde_json::to_vec(&json!({"jsonrpc":"2.0","method":"event","params":{"seq":1,"type":"status","terminal":"t1","data":{"status":{"state":"working"},"reported":true}}})).unwrap();
    payload.push(b'\n');
    let frame = Frame {
        channel: 7,
        kind: 0,
        payload,
    };
    let mut wire = Vec::new();
    frame.write_to(&mut wire).unwrap();
    let actual = Frame::read_from(&mut wire.as_slice()).unwrap();
    assert!(Core::activity_frame(&activity, &control, &actual));
    assert!(receive.try_recv().is_err());
    let credit = activity
        .lock()
        .unwrap()
        .install(json!({"seq":0,"channel":7,"terminals":[]}))
        .unwrap();
    Core::activity_flow(&activity, &control, credit);
    let returned = receive.try_recv().unwrap();
    assert_eq!((returned.channel, returned.kind), (7, 1));
    assert_eq!(
        returned.payload,
        (actual.payload.len() as u32).to_le_bytes()
    );
    assert_eq!(
        activity.lock().unwrap().get("t1").state,
        voyager_contract::activity::ActivityState::Working
    );
    assert!(!Core::activity_frame(
        &activity,
        &control,
        &Frame {
            channel: 0,
            kind: 0,
            payload: Vec::new()
        }
    ));
    assert!(Core::activity_frame(
        &activity,
        &control,
        &Frame {
            channel: 7,
            kind: 2,
            payload: Vec::new()
        }
    ));
    assert_eq!(receive.try_recv().unwrap().kind, 2);
    assert_eq!(
        activity.lock().unwrap().get("t1").state,
        voyager_contract::activity::ActivityState::Unknown
    );
}

#[test]
fn quit_fences_cloned_viewer_input_without_closing_output_or_control() {
    let (control, requests) = mpsc::sync_channel::<Frame>(2);
    let (input, queued) = mpsc::sync_channel(2);
    let replies = Replies::default();
    let responses = replies.clone();
    let attached: AttachResult = serde_json::from_value(json!({
        "channel": 7,
        "terminal": {
            "address": "t1",
            "argv": [],
            "cwd": "/tmp",
            "cols": 80,
            "rows": 24,
            "state": "live",
            "created_ms": 0,
            "labels": {},
            "screen": "exact"
        }
    }))
    .unwrap();
    let mut wrong_terminal = serde_json::to_value(&attached.terminal).unwrap();
    wrong_terminal["address"] = "wrong".into();
    let mut invalid_attachment = serde_json::to_value(&attached).unwrap();
    invalid_attachment["terminal"]["rows"] = 0.into();
    let worker = thread::spawn(move || {
        for (method, result) in [
            ("terminal.get", wrong_terminal),
            ("terminal.attach", invalid_attachment),
        ] {
            let request = requests.recv().unwrap();
            let value: Value = serde_json::from_slice(&request.payload).unwrap();
            assert_eq!(value["method"], method);
            let id = value["id"].as_u64().unwrap();
            responses
                .lock()
                .unwrap()
                .remove(&id)
                .unwrap()
                .send(json!({"jsonrpc":"2.0","id":id,"result":result}))
                .unwrap();
        }
        let request = requests.recv().unwrap();
        let value: Value = serde_json::from_slice(&request.payload).unwrap();
        assert_eq!(value["method"], "server.status");
        let id = value["id"].as_u64().unwrap();
        responses.lock().unwrap().remove(&id).unwrap().send(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32000,"message":"fixture refusal","data":{"kind":"blocked"}}})).unwrap();
        requests.recv().unwrap()
    });
    let child = Command::new(env::current_exe().unwrap())
        .arg("--list")
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    let mut streams = Streams::default();
    streams.buffers.insert(
        7,
        Stream {
            bytes: VecDeque::from([42]),
            ..Default::default()
        },
    );
    streams.total = 1;
    let mut core = Core {
        child,
        identity: "static-core".into(),
        control,
        input,
        replies,
        streams: Arc::new(Mutex::new(streams)),
        attaches: Default::default(),
        link: Arc::default(),
        input_open: Arc::new(Mutex::new(true)),
        sequence: 1,
        activity: Arc::default(),
        activity_supported: false,
    };
    assert!(matches!(
        core.terminal_get("expected"),
        Err(Error::Uncertain(_))
    ));
    assert!(matches!(
        core.terminal_attach(&attached.terminal),
        Err(Error::Uncertain(_))
    ));
    let viewer = core.viewer(&attached).unwrap();
    let cloned = viewer.clone();
    viewer.input(b"before".to_vec()).unwrap();
    let activity = core.activity.clone();
    let paused_metadata = activity.lock().unwrap();
    let closing = thread::spawn(move || {
        let result = core.end(true);
        (core, result)
    });
    let deadline = Instant::now() + Duration::from_secs(5);
    while *viewer.input_open.lock().unwrap() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(1));
    }
    let gate_closed = !*viewer.input_open.lock().unwrap();
    let refused = cloned.input(b"after".to_vec());
    drop(paused_metadata);
    let (core, quit) = closing.join().unwrap();
    let before = queued.recv().unwrap();
    let empty = queued.try_recv().is_err();
    viewer.protocol_reply(b"reply".to_vec()).unwrap();
    let protocol = queued.recv().unwrap();
    viewer.credit(1).unwrap();
    let output = cloned.take(1).unwrap();
    let close = core.close();
    let credit = worker.join().unwrap();
    assert!(close.is_ok());
    assert!(
        gate_closed,
        "Quit waited for metadata before closing input admission"
    );
    assert!(matches!(quit, Err(Error::Rejected {kind, ..}) if kind == "blocked"));
    assert!(matches!(refused, Err(Error::Rejected {kind, ..}) if kind == "quitting"));
    assert_eq!(before.payload, b"before");
    assert!(empty);
    assert_eq!(
        (protocol.channel, protocol.kind, protocol.payload),
        (7, 0, b"reply".to_vec())
    );
    assert_eq!((credit.channel, credit.kind), (7, 1));
    assert_eq!(output, [42]);
}

fn lifecycle_core(control: mpsc::SyncSender<Frame>, replies: Replies) -> Core {
    let (input, _) = mpsc::sync_channel(1);
    let child = Command::new(env::current_exe().unwrap())
        .arg("--list")
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    let activity = Arc::new(Mutex::new(Activity::default()));
    activity.lock().unwrap().bind(["t1"]);
    Core {
        child,
        identity: "bound-core".into(),
        control,
        input,
        replies,
        streams: Arc::default(),
        attaches: Default::default(),
        link: Arc::default(),
        input_open: Arc::new(Mutex::new(true)),
        sequence: 1,
        activity,
        activity_supported: false,
    }
}

#[test]
fn quit_and_keep_fences_input_and_activity_and_sends_nothing_to_core() {
    let (control, requests) = mpsc::sync_channel::<Frame>(2);
    let mut core = lifecycle_core(control, Replies::default());
    let result = core.end(false);
    assert!(result.is_ok(), "{result:?}");
    assert!(requests.try_recv().is_err());
    assert!(!*core.input_open.lock().unwrap());
    assert_eq!(
        core.activity.lock().unwrap().get("t1").reason.as_deref(),
        Some("Voyager is quitting")
    );
    assert!(core.child.try_wait().unwrap().is_some());
}

#[test]
fn stop_session_refuses_a_changed_core_without_sending_server_stop() {
    let (control, requests) = mpsc::sync_channel::<Frame>(2);
    let replies = Replies::default();
    let responses = replies.clone();
    let worker = thread::spawn(move || {
        let request = requests.recv().unwrap();
        let value: Value = serde_json::from_slice(&request.payload).unwrap();
        assert_eq!(value["method"], "server.status");
        let id = value["id"].as_u64().unwrap();
        let status = json!({"core":{"id":"another-core","name":"Core"},"version":"0","pid":1,
            "uptime_ms":0,"holders":[],"live":0,"finished":0});
        responses
            .lock()
            .unwrap()
            .remove(&id)
            .unwrap()
            .send(json!({"jsonrpc":"2.0","id":id,"result":status}))
            .unwrap();
        let later = requests.recv_timeout(Duration::from_millis(300)).ok()?;
        let value: Value = serde_json::from_slice(&later.payload).unwrap();
        responses
            .lock()
            .unwrap()
            .remove(&value["id"].as_u64().unwrap());
        Some(value["method"].clone())
    });
    let mut core = lifecycle_core(control, replies);
    let result = core.end(true);
    let later = worker.join().unwrap();
    assert!(
        matches!(&result, Err(Error::Rejected { kind, .. }) if kind == "changed_core"),
        "{result:?}"
    );
    assert_eq!(later, None, "a request followed the identity refusal");
    core.close().unwrap();
}

#[test]
fn protocol_envelopes_preserve_refusals_and_uncertainty() {
    let valid = json!({"jsonrpc":"2.0","id":2,"result":{"value":null},"extra":true});
    assert_eq!(Core::response(valid, 2).unwrap(), json!({"value":null}));
    let refused = json!({"jsonrpc":"2.0","id":2,"error":{"code":-32000,"message":"stale","data":{"kind":"conflict","hint":"inspect"}}});
    assert!(
        matches!(Core::response(refused, 2), Err(Error::Rejected { kind, .. }) if kind == "conflict")
    );
    let unknown = json!({"jsonrpc":"2.0","id":2,"error":{"code":-32000,"message":"unknown outcome","data":{"kind":"future_error"}}});
    assert!(
        matches!(Core::response(unknown, 2), Err(Error::Uncertain(message)) if message.contains("future_error"))
    );
    for value in [
        json!({"jsonrpc":"2.0","id":2,"error":null}),
        json!({"jsonrpc":"2.0","id":2,"error":{"code":-32000}}),
        json!({"jsonrpc":"2.0","id":2,"result":{},"error":{"code":-32000,"message":"bad","data":{"kind":"conflict"}}}),
        json!({"jsonrpc":"2.0","id":3,"result":{}}),
        json!({"jsonrpc":"1.0","id":2,"result":{}}),
        json!({"jsonrpc":"2.0","id":2}),
    ] {
        assert!(matches!(Core::response(value, 2), Err(Error::Uncertain(_))));
    }
}

#[test]
fn dispatched_request_never_treats_malformed_or_lost_reply_as_refusal() {
    for reply in [
        Some(json!({"jsonrpc":"2.0","id":2,"error":null})),
        Some(
            json!({"jsonrpc":"2.0","id":2,"error":{"code":-32000,"message":"stale","data":{"kind":"conflict"}}}),
        ),
        None,
    ] {
        let expected_refusal = reply
            .as_ref()
            .is_some_and(|value| value.pointer("/error/data/kind") == Some(&json!("conflict")));
        let (control, requests) = mpsc::sync_channel::<Frame>(1);
        let (input, _) = mpsc::sync_channel(1);
        let replies = Replies::default();
        let responses = replies.clone();
        let worker = thread::spawn(move || {
            let frame = requests.recv().unwrap();
            assert_eq!((frame.channel, frame.kind), (0, 0));
            let message: Value = serde_json::from_slice(&frame.payload).unwrap();
            assert_eq!(message["method"], "doc.set");
            let send = responses.lock().unwrap().remove(&2).unwrap();
            if let Some(reply) = reply {
                send.send(reply).unwrap();
            }
        });
        let child = Command::new(env::current_exe().unwrap())
            .arg("--list")
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        let mut core = Core {
            child,
            identity: "test-core".into(),
            control,
            input,
            replies,
            streams: Arc::default(),
            attaches: Default::default(),
            link: Arc::default(),
            input_open: Arc::new(Mutex::new(true)),
            sequence: 1,
            activity: Arc::default(),
            activity_supported: false,
        };
        let result = core.rpc("doc.set", json!({}));
        worker.join().unwrap();
        assert!(if expected_refusal {
            matches!(result, Err(Error::Rejected { .. }))
        } else {
            matches!(result, Err(Error::Uncertain(_)))
        });
    }
}

#[test]
fn hello_requires_consumed_capabilities_not_exact_version_or_extra_fields() {
    let mut hello = json!({"jsonrpc":"2.0","id":1,"result":{"framed":true,"generation":1,"version":"future-compatible","core":{"id":"stable","name":"test"},"methods":Core::REQUIRED_METHODS,"features":["framed","attach","shell","future"],"extra":true}});
    hello["result"]["methods"]
        .as_array_mut()
        .unwrap()
        .push("future.method".into());
    assert_eq!(Core::validate_hello(hello.clone()).unwrap(), "stable");
    hello["result"]["generation"] = 2.into();
    assert!(Core::validate_hello(hello.clone()).is_err());
    hello["result"]["generation"] = 1.into();
    hello["result"]["features"] = json!(["framed"]);
    assert!(Core::validate_hello(hello.clone()).is_err());
    hello["result"]["features"] = json!(["framed", "attach", "shell"]);
    hello["result"]["methods"] = json!(["hello"]);
    assert!(Core::validate_hello(hello).is_err());
}

#[test]
fn typed_hello_keeps_the_existing_handshake() {
    let params = Core::hello_params();
    assert_eq!(
        serde_json::to_value(params).unwrap(),
        json!({"framed":true,"generation":1})
    );
}

#[test]
fn terminal_list_accepts_observed_minimal_result() {
    let result: TerminalList = serde_json::from_value(json!({"terminals":[]})).unwrap();
    assert!(result.terminals.is_empty());
    assert!(serde_json::from_value::<TerminalList>(json!({})).is_err());
    assert!(matches!(
        Core::decode::<Terminal>("terminal.get", json!({})),
        Err(Error::Uncertain(_))
    ));
}

#[test]
fn typed_document_preserves_null_and_nested_values() {
    for value in [Value::Null, json!({"nested": [1, {"name": "Voyage"}]})] {
        let params = DocSetParams {
            name: "voyager-layout-v1".into(),
            on: None,
            value: value.clone(),
            version: 9,
        };
        let encoded = serde_json::to_value(params).unwrap();
        assert_eq!(encoded["value"], value);
        assert_eq!(encoded["version"], 9);
        let result: DocGetResult =
            serde_json::from_value(json!({"value":value,"version":9})).unwrap();
        assert_eq!(result.value, value);
        assert_eq!(result.version, 9);
    }
}
