#[cfg(target_os = "linux")]
mod linux {
    use serde_json::json;
    use std::{
        future::Future,
        os::unix::fs::PermissionsExt as _,
        path::PathBuf,
        task::{Context, Poll, Waker},
        time::{Duration, Instant, SystemTime, UNIX_EPOCH},
    };
    use voyager_app::{
        client::{Client, Lifecycle},
        core::Core,
        core_shapes::Terminal,
    };
    use voyager_contract::{Action, Request};

    fn wait<T>(future: impl Future<Output = T>) -> T {
        let mut future = Box::pin(future);
        let mut context = Context::from_waker(Waker::noop());
        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
                return value;
            }
            assert!(Instant::now() < deadline, "Owner result was not confirmed");
            std::thread::sleep(Duration::from_millis(1));
        }
    }

    fn profile(session: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("{session}-profile"));
        std::fs::create_dir_all(&path).unwrap();
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

    fn inspect(client: &Client) {
        client
            .call(Request {
                request_id: client.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            })
            .unwrap();
    }

    fn voyagers(core: &mut Core) -> Vec<Terminal> {
        core.terminal_list()
            .unwrap()
            .into_iter()
            .filter(|terminal| terminal.argv.iter().any(|word| word == "voyager"))
            .collect()
    }

    #[test]
    fn the_line_shows_while_voyager_cannot_reply_and_clears_once_the_command_is_beside_the_app() {
        let beside_test = std::env::current_exe().unwrap().with_file_name("voyager");
        let _ = std::fs::remove_file(&beside_test);
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let session = format!("voyager-unbound-{}-{suffix}", std::process::id());
        let profile = profile(&session);
        let mut core = Core::connect(&session).unwrap();
        let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let missing =
                Client::open_with_profile(session.clone(), "/tmp".into(), profile.clone());
            inspect(&missing);
            assert!(
                missing
                    .voyager_unbound()
                    .is_some_and(|line| !line.is_empty()),
                "the line shows while the command is missing"
            );
            assert!(voyagers(&mut core).is_empty(), "no Voyager starts");
            assert!(
                !profile.join("voyager.json").exists(),
                "no Voyager is bound"
            );
            wait(missing.end(Lifecycle::QuitAndKeep)).unwrap();
            drop(missing);

            std::fs::hard_link(env!("CARGO_BIN_EXE_voyager"), &beside_test).unwrap();
            let found = Client::open_with_profile(session.clone(), "/tmp".into(), profile.clone());
            inspect(&found);
            assert_eq!(found.voyager_unbound(), None, "the line clears once it can");
            assert_eq!(voyagers(&mut core).len(), 1, "Voyager starts");
            wait(found.end(Lifecycle::StopSession)).unwrap();
        }));
        let _ = core.server_stop();
        let _ = std::fs::remove_dir_all(&profile);
        checked.unwrap();
    }
}
