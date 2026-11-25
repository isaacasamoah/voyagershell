#[cfg(target_os = "linux")]
mod linux {
    use std::{
        future::Future,
        task::{Context, Poll, Waker},
        time::{Duration, Instant},
    };
    use voyager_app::{
        client::{Client, FirstConnect, Lifecycle},
        core::Core,
        core_shapes::RunParams,
    };
    use voyager_contract::{
        Action, ContentDestination, Outcome, PlacementInsertion, PlacementOwner, Request, Response,
        Side, launch::Launch, launch::LaunchSpec, layout_document::DOCUMENT,
    };

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

    fn inspect(client: &Client) -> Response {
        client
            .call(Request {
                request_id: client.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            })
            .unwrap()
    }

    fn applied(client: &Client) -> Response {
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            let response = inspect(client);
            if response.status == Outcome::Applied {
                return response;
            }
            assert!(
                Instant::now() < deadline,
                "Inspect never applied: {response:?}"
            );
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    fn snapshot(core: &mut Core) -> (u64, Vec<(String, String)>) {
        let mut terminals: Vec<(String, String)> = core
            .terminal_list()
            .unwrap()
            .into_iter()
            .map(|terminal| (terminal.address, terminal.state))
            .collect();
        terminals.sort();
        (core.document_get(DOCUMENT).unwrap().version, terminals)
    }

    #[test]
    fn a_held_client_changes_nothing_until_ready_then_reconciles_as_today() {
        for key in ["HC_SOCKET", "HC_SESSION", "HC_TERMINAL_ID"] {
            assert!(
                std::env::var_os(key).is_none(),
                "Ambient selector {key} must be cleared"
            );
        }
        let session = format!("voyager-ready-gate-{}", std::process::id());
        let profile =
            std::env::temp_dir().join(format!("voyager-ready-gate-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&profile);
        std::fs::create_dir_all(&profile).unwrap();
        let mut core = Some(Core::connect(&session).unwrap());
        let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let core = core.as_mut().unwrap();
            let first = Client::open(session.clone(), "/tmp".into());
            let opened = applied(&first);
            let fleet = opened.layout.voyages[0].fleets[0].id.clone();
            let beside = opened.layout.voyages[0].fleets[0].placements[0].id.clone();
            let created = first
                .call(Request {
                    request_id: first.request_id(),
                    expected_version: opened.version,
                    action: Action::CreateVessel {
                        type_id: "terminal".into(),
                        destination: ContentDestination::Placement {
                            owner: PlacementOwner::Fleet { id: fleet.clone() },
                            insertion: PlacementInsertion::Beside {
                                id: beside,
                                side: Side::Right,
                            },
                        },
                        launch: Some(LaunchSpec::Program {
                            argv: vec!["/bin/sleep".into(), "60".into()],
                        }),
                    },
                })
                .unwrap();
            assert_eq!(created.status, Outcome::Applied);
            let own = created.layout.vessels.last().unwrap().id.clone();
            let viewer = first
                .terminal(own.clone(), first.request_id(), created.version)
                .unwrap();
            let adopted = core
                .terminal_run_with(RunParams {
                    argv: vec!["/bin/sleep".into(), "60".into()],
                    no_parent: true,
                    labels: [(
                        voyager_contract::place::LABEL.to_owned(),
                        format!("fleet:{}", fleet.0),
                    )]
                    .into_iter()
                    .collect(),
                    ..Default::default()
                })
                .unwrap();
            let deadline = Instant::now() + Duration::from_secs(20);
            let placed = loop {
                let response = applied(&first);
                let found = response.layout.vessels.iter().find(|vessel| {
                    vessel
                        .backend
                        .as_ref()
                        .is_some_and(|backend| backend.0 == adopted.address)
                });
                if let Some(vessel) = found {
                    break vessel.id.clone();
                }
                assert!(
                    Instant::now() < deadline,
                    "The labelled program was not adopted"
                );
                std::thread::sleep(Duration::from_millis(20));
            };
            let before = applied(&first);
            let own_backend = before
                .layout
                .vessels
                .iter()
                .find(|vessel| vessel.id == own)
                .and_then(|vessel| vessel.backend.clone())
                .unwrap();
            assert!(wait(first.end(Lifecycle::QuitAndKeep)).is_ok());
            drop(viewer);
            drop(first);
            for address in [&own_backend.0, &adopted.address] {
                core.terminal_kill(address).unwrap();
            }
            let deadline = Instant::now() + Duration::from_secs(10);
            while [&own_backend.0, &adopted.address]
                .iter()
                .any(|address| core.terminal_get(address).unwrap().is_live())
            {
                assert!(Instant::now() < deadline, "Killed programs did not end");
                std::thread::sleep(Duration::from_millis(20));
            }
            let ended = snapshot(core);
            let held = Client::with_content_and_profile(
                session.clone(),
                "/tmp".into(),
                voyager_app::content::Owner::open(&profile).unwrap(),
                profile.clone(),
            );
            assert_eq!(held.first_connect(), FirstConnect::Usable);
            std::thread::sleep(Duration::from_millis(500));
            let refused = inspect(&held);
            assert_ne!(refused.status, Outcome::Applied, "{refused:?}");
            assert_eq!(
                snapshot(core),
                ended,
                "A client that is not ready changed the layout or started a program"
            );
            held.ready();
            let reconciled = applied(&held);
            assert!(
                !reconciled
                    .layout
                    .vessels
                    .iter()
                    .any(|vessel| vessel.id == placed),
                "The ended adopted Vessel closes once ready"
            );
            let reopened = reconciled
                .layout
                .vessels
                .iter()
                .find(|vessel| vessel.id == own)
                .unwrap();
            assert_eq!(reopened.backend, None);
            assert_eq!(reopened.launch, Some(Launch::Terminal));
            assert!(reconciled.created_vessels.contains(&own));
            assert!(wait(held.end(Lifecycle::QuitAndKeep)).is_ok());
        }));
        if let Some(mut core) = core.take() {
            let _ = core.server_stop();
            let _ = core.close();
        }
        let _ = std::fs::remove_dir_all(&profile);
        if let Err(failure) = checked {
            std::panic::resume_unwind(failure);
        }
    }
}
