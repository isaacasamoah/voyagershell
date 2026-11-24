#[cfg(target_os = "linux")]
mod linux {
    use serde_json::json;
    use std::{
        future::Future,
        os::unix::fs::PermissionsExt as _,
        path::{Path, PathBuf},
        task::{Context, Poll, Waker},
        time::{Duration, Instant, SystemTime, UNIX_EPOCH},
    };
    use voyager_app::{
        client::{Client, Lifecycle},
        core::Core,
        core_shapes::{RunParams, Terminal},
    };
    use voyager_contract::{Action, Request, Response};

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

    fn voyagers(core: &mut Core) -> Vec<Terminal> {
        core.terminal_list()
            .unwrap()
            .into_iter()
            .filter(|terminal| terminal.argv.iter().any(|word| word == "voyager"))
            .collect()
    }

    fn bound(profile: &Path) -> String {
        let stored: serde_json::Value =
            serde_json::from_slice(&std::fs::read(profile.join("voyager.json")).unwrap()).unwrap();
        stored["terminal"].as_str().unwrap().to_owned()
    }

    fn flag<'a>(terminal: &'a Terminal, name: &str) -> Option<&'a str> {
        terminal
            .argv
            .windows(2)
            .find(|pair| pair[0] == name)
            .map(|pair| pair[1].as_str())
    }

    #[test]
    fn voyager_starts_at_launch_rebinds_after_a_restart_and_is_resumed_when_it_has_ended() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let session = format!("voyager-start-{}-{suffix}", std::process::id());
        let profile = profile(&session);
        let mut core = Core::connect(&session).unwrap();
        let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let first = Client::open_with_profile(session.clone(), "/tmp".into(), profile.clone());
            let launched = inspect(&first);
            let started = voyagers(&mut core);
            assert_eq!(started.len(), 1, "one Voyager starts at launch");
            let original = &started[0];
            assert!(original.is_live());
            assert_eq!(flag(original, "-n"), Some("voyager"));
            assert_eq!(flag(original, "--model"), Some("stand-in"));
            let session_id = flag(original, "--session-id").unwrap().to_owned();
            assert_eq!(bound(&profile), original.address);
            let vessel = launched
                .layout
                .vessels
                .iter()
                .find(|item| item.id.0 == "voyager")
                .unwrap();
            assert_eq!(vessel.backend.as_ref().unwrap().0, original.address);
            let home = launched.layout.home.as_ref().unwrap();
            assert!(home.portals.iter().any(|item| item.vessel == vessel.id));
            wait(first.end(Lifecycle::QuitAndKeep)).unwrap();
            drop(first);

            let second = Client::open_with_profile(session.clone(), "/tmp".into(), profile.clone());
            inspect(&second);
            let after = voyagers(&mut core);
            assert_eq!(after.len(), 1, "a restart starts no second Voyager");
            assert_eq!(after[0].address, original.address);
            assert_eq!(bound(&profile), original.address);
            wait(second.end(Lifecycle::QuitAndKeep)).unwrap();
            drop(second);

            let other = core
                .terminal_run_with(RunParams {
                    argv: vec!["/bin/sleep".into(), "120".into()],
                    no_parent: true,
                    ..Default::default()
                })
                .unwrap();
            std::fs::write(
                profile.join("voyager.json"),
                json!({"terminal": other.address}).to_string(),
            )
            .unwrap();
            let edited = Client::open_with_profile(session.clone(), "/tmp".into(), profile.clone());
            inspect(&edited);
            assert_eq!(
                bound(&profile),
                original.address,
                "a field naming another live terminal is replaced by the verified Voyager"
            );
            assert_eq!(voyagers(&mut core).len(), 1);
            assert!(core.terminal_get(&other.address).unwrap().is_live());
            wait(edited.end(Lifecycle::QuitAndKeep)).unwrap();
            drop(edited);

            core.terminal_kill(&original.address).unwrap();
            assert!(core.terminal_get(&original.address).unwrap().has_ended());
            let resumed =
                Client::open_with_profile(session.clone(), "/tmp".into(), profile.clone());
            let relaunched = inspect(&resumed);
            let all = voyagers(&mut core);
            let live: Vec<_> = all.iter().filter(|terminal| terminal.is_live()).collect();
            assert_eq!(live.len(), 1, "an ended Voyager is resumed at launch");
            assert_ne!(live[0].address, original.address);
            assert_eq!(flag(live[0], "--resume"), Some(session_id.as_str()));
            assert_eq!(flag(live[0], "--session-id"), None);
            assert_eq!(bound(&profile), live[0].address);
            let vessel = relaunched
                .layout
                .vessels
                .iter()
                .find(|item| item.id.0 == "voyager")
                .unwrap();
            assert_eq!(vessel.backend.as_ref().unwrap().0, live[0].address);
            wait(resumed.end(Lifecycle::StopSession)).unwrap();
        }));
        let _ = core.server_stop();
        let _ = std::fs::remove_dir_all(&profile);
        checked.unwrap();
    }
}
