#[cfg(target_os = "linux")]
mod linux {
    use serde_json::json;
    use std::{
        io::{BufRead as _, BufReader, Write as _},
        os::unix::{fs::PermissionsExt as _, net::UnixStream},
        path::PathBuf,
        time::{Duration, Instant, SystemTime, UNIX_EPOCH},
    };
    use voyager_app::{
        client::{Client, Lifecycle},
        core::Core,
        replies::{Ending, Snapshot},
        vessel_socket,
    };
    use voyager_contract::{Action, Request, Response};

    fn wait<T>(future: impl std::future::Future<Output = T>) -> T {
        let mut future = Box::pin(future);
        let mut context = std::task::Context::from_waker(std::task::Waker::noop());
        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            if let std::task::Poll::Ready(value) = future.as_mut().poll(&mut context) {
                return value;
            }
            assert!(Instant::now() < deadline, "Owner result was not confirmed");
            std::thread::sleep(Duration::from_millis(1));
        }
    }

    fn profile(session: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("{session}-profile"));
        std::fs::create_dir_all(&path).unwrap();
        let beside_test = std::env::current_exe().unwrap().with_file_name("voyager");
        let _ = std::fs::hard_link(env!("CARGO_BIN_EXE_voyager"), beside_test);
        let stand_in = path.join("claude");
        std::fs::write(&stand_in, "#!/bin/sh\nexec sleep 120\n").unwrap();
        std::fs::set_permissions(&stand_in, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::write(
            path.join("launches.json"),
            json!({"default":"terminal","entries":[
                {"id":"terminal","name":"Terminal","launch":{"kind":"terminal"}},
                {"id":"voyager","name":"Voyager","launch":{"kind":"program",
                    "argv":[stand_in.to_string_lossy(),"--model","stand-in"]}}
            ]})
            .to_string(),
        )
        .unwrap();
        path
    }

    fn inspect(client: &Client) -> Response {
        client
            .call(Request {
                request_id: client.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            })
            .unwrap()
    }

    fn send(session: &str, terminal: &str, line: &str) -> serde_json::Value {
        let path = vessel_socket::path(session, terminal).unwrap();
        let mut stream = UnixStream::connect(path).unwrap();
        stream.write_all(format!("{line}\n").as_bytes()).unwrap();
        let mut reply = String::new();
        BufReader::new(&stream).read_line(&mut reply).unwrap();
        serde_json::from_str(&reply).unwrap()
    }

    fn text(turn: &str, index: u32, last: bool, words: &str) -> String {
        json!({"command":"reply","event":{"kind":"text","turn":turn,"message":"m1","index":index,"last":last,"text":words}}).to_string()
    }

    fn until(client: &Client, ready: impl Fn(&Snapshot) -> bool) -> Snapshot {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let snapshot = client.replies().snapshot();
            if ready(&snapshot) {
                return snapshot;
            }
            assert!(Instant::now() < deadline, "{snapshot:?}");
            std::thread::sleep(Duration::from_millis(5));
        }
    }

    #[test]
    fn replies_sent_out_of_order_arrive_in_order_and_a_stalled_one_never_holds_the_canvas() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let session = format!("voyager-reply-{}-{suffix}", std::process::id());
        let profile = profile(&session);
        let mut core = Core::connect(&session).unwrap();
        let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let client = Client::open_with_profile(session.clone(), "/tmp".into(), profile.clone());
            let layout = inspect(&client).layout;
            let voyager = layout
                .vessels
                .iter()
                .find(|item| item.id.0 == "voyager")
                .unwrap();
            let terminal = voyager.backend.as_ref().unwrap().0.clone();

            let mut stalled =
                UnixStream::connect(vessel_socket::path(&session, &terminal).unwrap()).unwrap();
            stalled
                .write_all(br#"{"command":"reply","event":{"kind":"te"#)
                .unwrap();
            let started = Instant::now();
            assert_eq!(inspect(&client).layout.vessels.len(), layout.vessels.len());
            assert!(
                started.elapsed() < Duration::from_secs(2),
                "an unfinished reply held the canvas"
            );

            for (index, last, words) in [(2, true, "c"), (0, false, "a"), (1, false, "b")] {
                let reply = send(&session, &terminal, &text("t1", index, last, words));
                assert_eq!(reply, json!({"kind":"noted"}));
            }
            let snapshot = until(&client, |snapshot| {
                snapshot
                    .turns
                    .first()
                    .is_some_and(|turn| turn.messages[0].complete)
            });
            assert_eq!(snapshot.turns[0].messages[0].text, "abc");

            send(
                &session,
                &terminal,
                &json!({"command":"reply","event":{"kind":"turn-end","turn":"t1","text":"abc"}})
                    .to_string(),
            );
            let snapshot = until(&client, |snapshot| snapshot.turns[0].ending.is_some());
            assert_eq!(
                snapshot.turns[0].ending,
                Some(Ending::Stopped {
                    text: "abc".into(),
                    matched: true
                })
            );
            drop(stalled);
            wait(client.end(Lifecycle::StopSession)).unwrap();
        }));
        let _ = core.server_stop();
        let _ = std::fs::remove_dir_all(&profile);
        checked.unwrap();
    }
}
