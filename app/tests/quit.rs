#[cfg(target_os = "linux")]
mod linux {
    use serde_json::{Value, json};
    use std::{
        future::Future,
        path::PathBuf,
        sync::Arc,
        task::{Context, Poll, Waker},
        time::{Duration, Instant},
    };
    use voyager_app::{
        client::{Client, Lifecycle},
        core::Core,
        core_shapes::RunParams,
    };
    use voyager_contract::{Action, Axis, Request, Status, launch::Launch};

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

    fn identity(pid: u32) -> Value {
        use std::os::unix::fs::MetadataExt as _;
        let process = PathBuf::from(format!("/proc/{pid}"));
        assert_eq!(
            process.metadata().unwrap().uid(),
            std::fs::metadata("/proc/self").unwrap().uid()
        );
        let stat = std::fs::read_to_string(process.join("stat")).unwrap();
        let start = stat
            .rsplit_once(") ")
            .unwrap()
            .1
            .split_whitespace()
            .nth(19)
            .unwrap();
        json!({"pid":pid, "uid":process.metadata().unwrap().uid(), "start":start,
            "executable":std::fs::read_link(process.join("exe")).unwrap()})
    }

    fn absent(items: &[Value]) -> bool {
        items
            .iter()
            .all(|item| !PathBuf::from(format!("/proc/{}", item["pid"])).exists())
    }

    fn settled(items: &[Value]) -> bool {
        let deadline = Instant::now() + Duration::from_secs(8);
        while !absent(items) && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        absent(items)
    }

    fn connectors() -> Vec<u32> {
        let mut children = Vec::new();
        for task in std::fs::read_dir("/proc/self/task").unwrap() {
            let listed =
                std::fs::read_to_string(task.unwrap().path().join("children")).unwrap_or_default();
            children.extend(
                listed
                    .split_whitespace()
                    .map(|pid| pid.parse::<u32>().unwrap()),
            );
        }
        children.sort();
        children
    }

    fn call(client: &Client, version: u64, action: Action) -> voyager_contract::Response {
        let value = client
            .call(Request {
                request_id: client.request_id(),
                expected_version: version,
                action,
            })
            .unwrap();
        assert_eq!(value.status, Status::Applied);
        value
    }

    #[test]
    fn explicit_owner_shutdown_and_cold_reopen_prepare_plain_shells() {
        for key in ["HC_SOCKET", "HC_SESSION", "HC_TERMINAL_ID"] {
            assert!(
                std::env::var_os(key).is_none(),
                "Ambient selector {key} must be cleared"
            );
        }
        let runtime = PathBuf::from(std::env::var_os("XDG_RUNTIME_DIR").unwrap());
        assert!(
            runtime.is_absolute(),
            "The private XDG runtime path must be absolute"
        );
        let session = format!("voyager-quit-owned-{}", std::process::id());
        let control = format!("voyager-quit-control-{}", std::process::id());
        let socket = runtime.join("herdr-core").join(format!("{session}.sock"));
        let control_socket = runtime.join("herdr-core").join(format!("{control}.sock"));
        assert!(!socket.exists() && !control_socket.exists());
        let evidence = std::env::var_os("VOYAGER_QUIT_EVIDENCE")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                std::env::temp_dir().join(format!("voyager-quit-{}.json", std::process::id()))
            });
        let pending = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&evidence)
            .unwrap();
        serde_json::to_writer_pretty(
            pending,
            &json!({"pending":true,"session":session,"control":control}),
        )
        .unwrap();
        let mut owned = None;
        let mut unrelated = None;
        let mut reopened = None;
        let mut owned_ids = Vec::new();
        let mut control_ids = Vec::new();
        let mut reopened_ids = Vec::new();
        let mut observations = json!({});
        let mut quit_attempted = false;
        let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            owned = Some(Core::connect(&session).unwrap());
            unrelated = Some(Core::connect(&control).unwrap());
            let core = owned.as_mut().unwrap();
            let other = unrelated.as_mut().unwrap();
            let client = Client::open(session.clone(), "/tmp".into());
            let mut snapshot = call(&client, 0, Action::Inspect);
            let fleet = snapshot.layout.voyages[0].fleets[0].id.clone();
            let after = snapshot.layout.voyages[0].fleets[0].vessels[0].id.clone();
            let mut viewers = Vec::new();
            let mut addresses = Vec::new();
            for _ in 0..2 {
                snapshot = call(
                    &client,
                    snapshot.version,
                    Action::CreateContent {
                        type_id: "terminal".into(),
                        destination: voyager_contract::ContentDestination::Panel {
                            owner: voyager_contract::PanelOwner::Fleet { id: fleet.clone() },
                            insertion: voyager_contract::PanelInsertion::Beside {
                                id: after.clone(),
                                side: match Axis::Horizontal {
                                    voyager_contract::Axis::Horizontal => {
                                        voyager_contract::Side::Right
                                    }
                                    voyager_contract::Axis::Vertical => {
                                        voyager_contract::Side::Bottom
                                    }
                                },
                            },
                        },
                        launch: Some(Launch::Program {
                            argv: vec!["/bin/sleep".into(), "60".into()],
                        }),
                    },
                );
                let id = snapshot.layout.contents.last().unwrap().id.clone();
                viewers.push(
                    client
                        .terminal(id, client.request_id(), snapshot.version)
                        .unwrap(),
                );
                snapshot = call(&client, 0, Action::Inspect);
                let address = snapshot
                    .layout
                    .contents
                    .last()
                    .unwrap()
                    .backend
                    .as_ref()
                    .unwrap()
                    .0
                    .clone();
                let terminal = core.terminal_get(&address).unwrap();
                assert_eq!(terminal.state, "live");
                owned_ids.push(identity(terminal.pid.unwrap()));
                addresses.push(address);
            }
            let survivor = other
                .terminal_run_with(RunParams {
                    argv: vec!["/bin/sleep".into(), "60".into()],
                    no_parent: true,
                    ..Default::default()
                })
                .unwrap();
            let survivor = other.terminal_get(&survivor.address).unwrap();
            assert_eq!(survivor.state, "live");
            control_ids.push(identity(survivor.pid.unwrap()));
            let status = core.server_status().unwrap();
            let core_identity = status.core.id.clone();
            let control_status = other.server_status().unwrap();
            observations["bound"] = json!({"coreId":status.core.id,"corePid":status.pid,
                "holders":status.holders,"unrelatedCoreId":control_status.core.id,
                "unrelatedCorePid":control_status.pid,"unrelatedHolders":control_status.holders});
            owned_ids.extend(
                std::iter::once(status.pid)
                    .chain(status.holders.iter().map(|holder| holder.pid))
                    .map(identity),
            );
            control_ids.extend(
                std::iter::once(control_status.pid)
                    .chain(control_status.holders.iter().map(|holder| holder.pid))
                    .map(identity),
            );
            let layout = Arc::clone(&snapshot.layout);
            quit_attempted = true;
            let result = wait(client.end(Lifecycle::StopSession));
            let duplicate = wait(client.end(Lifecycle::StopSession));
            let kept_after_stop = wait(client.end(Lifecycle::QuitAndKeep));
            let ended = settled(&owned_ids);
            observations["firstQuit"] = json!({"ok":result.is_ok(),"duplicateOk":duplicate.is_ok(),"keepAfterStopOk":kept_after_stop.is_ok(),"ownedAbsent":ended,"socketAbsent":!socket.exists()});
            assert!(
                result.is_ok()
                    && duplicate.is_ok()
                    && kept_after_stop.is_ok()
                    && ended
                    && !socket.exists()
            );
            let after_quit = call(&client, 0, Action::Inspect);
            assert_eq!(after_quit.layout, layout);
            let rejected = client
                .call(Request {
                    request_id: client.request_id(),
                    expected_version: after_quit.version,
                    action: Action::CreateFleet {
                        voyage: after_quit.layout.voyages[0].id.clone(),
                        name: "Late".into(),
                    },
                })
                .unwrap();
            assert_eq!(rejected.status, Status::Rejected);
            assert!(rejected.message.unwrap().contains("quitting"));
            let retained = snapshot.layout.contents.last().unwrap();
            let refused =
                client.terminal(retained.id.clone(), client.request_id(), snapshot.version);
            assert!(
                matches!(refused, Err(voyager_app::core::Error::Rejected { message, .. }) if message.contains("quitting"))
            );
            for original in &control_ids {
                assert_eq!(
                    identity(original["pid"].as_u64().unwrap() as u32),
                    *original
                );
            }
            assert_eq!(
                other.terminal_get(&survivor.address).unwrap().pid,
                survivor.pid
            );
            assert_eq!(other.terminal_get(&survivor.address).unwrap().state, "live");
            drop(viewers);
            owned.take().unwrap().close().unwrap();
            drop(client);
            let cold = Client::open(session.clone(), "/tmp".into());
            let restored = call(&cold, 0, Action::Inspect);
            let mut expected = (*layout).clone();
            for item in expected
                .contents
                .iter_mut()
                .filter(|item| item.backend.is_some())
            {
                item.backend = None;
                item.launch = Some(voyager_contract::launch::Launch::Terminal);
            }
            assert_eq!(*restored.layout, expected);
            assert_eq!(restored.created_contents.len(), addresses.len());
            reopened = Some(Core::connect(&session).unwrap());
            let core = reopened.as_mut().unwrap();
            let status = core.server_status().unwrap();
            assert_eq!(status.core.id, core_identity);
            reopened_ids.extend(
                std::iter::once(status.pid)
                    .chain(status.holders.iter().map(|holder| holder.pid))
                    .map(identity),
            );
            assert_eq!(status.live, 0);
            for address in &addresses {
                let terminal = core.terminal_get(address).unwrap();
                assert_eq!(terminal.state, "finished");
            }
            let retained = restored.created_contents.first().unwrap();
            let _viewer = cold
                .terminal(retained.clone(), cold.request_id(), restored.version)
                .unwrap();
            let after = call(&cold, 0, Action::Inspect);
            let address = &after
                .layout
                .contents
                .iter()
                .find(|content| &content.id == retained)
                .unwrap()
                .backend
                .as_ref()
                .unwrap()
                .0;
            assert!(!addresses.contains(address));
            let shell = core.terminal_get(address).unwrap();
            assert_eq!(shell.state, "live");
            assert!(
                shell
                    .argv
                    .first()
                    .is_some_and(|value| value.ends_with("bash"))
            );
            reopened_ids.push(identity(shell.pid.unwrap()));
            assert_eq!(core.server_status().unwrap().live, 1);
            observations["coldReopen"] = json!({"placementPreserved":true,"oldAddresses":addresses,"newShell":address,"live":1});
            drop(cold);
        }));
        let mut cleanup = Vec::new();
        if let Some(mut core) = owned.take() {
            let stop = (!quit_attempted).then(|| core.server_stop());
            let close = core.close();
            cleanup.push(json!({"role":"original","stop":stop.as_ref().map(Result::is_ok),
                "stopError":stop.as_ref().and_then(|result| result.as_ref().err()).map(|error|format!("{error:?}")),
                "close":close.is_ok(),"closeError":close.err().map(|error|format!("{error:?}"))}));
        }
        for core in [reopened.take(), unrelated.take()].into_iter().flatten() {
            let mut core = core;
            let stop = core.server_stop();
            let close = core.close();
            cleanup.push(
                json!({"stop":stop.is_ok(),"stopError":stop.err().map(|error|format!("{error:?}")),
                "close":close.is_ok(),"closeError":close.err().map(|error|format!("{error:?}"))}),
            );
        }
        let mut all_ids = owned_ids.clone();
        all_ids.extend(control_ids.clone());
        all_ids.extend(reopened_ids.clone());
        let all_absent = settled(&all_ids);
        let sockets_absent = !socket.exists() && !control_socket.exists();
        std::fs::write(evidence, serde_json::to_vec_pretty(&json!({"pending":false,"session":session,"control":control,
            "owned":owned_ids,"unrelated":control_ids,"cold":reopened_ids,"observations":observations,
            "cleanup":cleanup,"primaryFailure":checked.is_err(),"allAbsent":all_absent,"socketsAbsent":sockets_absent})).unwrap()).unwrap();
        if let Err(failure) = checked {
            std::panic::resume_unwind(failure);
        }
        assert!(all_absent && sockets_absent);
        assert!(cleanup.iter().all(|entry| entry["close"] == true));
        assert!(
            cleanup
                .iter()
                .all(|entry| entry["stop"].is_null() || entry["stop"] == true)
        );
    }

    #[test]
    fn quit_and_keep_releases_the_owner_and_leaves_every_program_running() {
        let session = format!("voyager-quit-keep-{}", std::process::id());
        let mut core = Core::connect(&session).unwrap();
        let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let client = Client::open(session.clone(), "/tmp".into());
            let snapshot = call(&client, 0, Action::Inspect);
            let fleet = snapshot.layout.voyages[0].fleets[0].id.clone();
            let after = snapshot.layout.voyages[0].fleets[0].vessels[0].id.clone();
            let snapshot = call(
                &client,
                snapshot.version,
                Action::CreateContent {
                    type_id: "terminal".into(),
                    destination: voyager_contract::ContentDestination::Panel {
                        owner: voyager_contract::PanelOwner::Fleet { id: fleet },
                        insertion: voyager_contract::PanelInsertion::Beside {
                            id: after,
                            side: voyager_contract::Side::Right,
                        },
                    },
                    launch: Some(Launch::Program {
                        argv: vec!["/bin/sleep".into(), "60".into()],
                    }),
                },
            );
            let id = snapshot.layout.contents.last().unwrap().id.clone();
            let viewer = client
                .terminal(id, client.request_id(), snapshot.version)
                .unwrap();
            let snapshot = call(&client, 0, Action::Inspect);
            let address = snapshot
                .layout
                .contents
                .last()
                .unwrap()
                .backend
                .as_ref()
                .unwrap()
                .0
                .clone();
            let program = identity(core.terminal_get(&address).unwrap().pid.unwrap());
            let before = core.server_status().unwrap();
            let connected = connectors();
            let server = identity(before.pid);
            let first = wait(client.end(Lifecycle::QuitAndKeep));
            let repeated = wait(client.end(Lifecycle::QuitAndKeep));
            let stop = wait(client.end(Lifecycle::StopSession));
            assert!(first.is_ok() && repeated.is_ok(), "{first:?} {repeated:?}");
            assert!(
                matches!(&stop, Err(voyager_app::core::Error::Rejected { kind, .. }) if kind == "quitting"),
                "{stop:?}"
            );
            let released = connectors();
            let status = core.server_status().unwrap();
            assert_eq!(status.core.id, before.core.id);
            assert_eq!(identity(status.pid), server);
            assert_eq!(
                released.len() + 1,
                connected.len(),
                "the owner's Core connection was not released: {connected:?} then {released:?}"
            );
            let terminal = core.terminal_get(&address).unwrap();
            assert_eq!(terminal.state, "live");
            assert_eq!(identity(terminal.pid.unwrap()), program);
            let rejected = client
                .call(Request {
                    request_id: client.request_id(),
                    expected_version: snapshot.version,
                    action: Action::CreateFleet {
                        voyage: snapshot.layout.voyages[0].id.clone(),
                        name: "Late".into(),
                    },
                })
                .unwrap();
            assert_eq!(rejected.status, Status::Rejected);
            drop(viewer);
        }));
        let stop = core.server_stop();
        let close = core.close();
        if let Err(failure) = checked {
            std::panic::resume_unwind(failure);
        }
        assert!(stop.is_ok() && close.is_ok());
    }
}
