#[cfg(target_os = "linux")]
mod linux {
    use std::{
        future::Future,
        task::{Context as Task, Poll, Waker},
        time::{Duration, Instant},
    };
    use voyager_app::{
        client::{Client, Lifecycle},
        content::Access,
        core::{Core, Error},
    };
    use voyager_contract::{
        Action, Context, CoreTerminalId, Outcome, Request, Response, Status,
        administrator::{ProcessAction, ProcessInput, ProcessRequest},
        content::{Notes, Request as Content, Response as ContentResponse, Version},
        layout_document::DOCUMENT,
        worktree,
    };

    fn wait<T>(future: impl Future<Output = T>) -> T {
        let mut future = Box::pin(future);
        let mut context = Task::from_waker(Waker::noop());
        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
                return value;
            }
            assert!(Instant::now() < deadline, "Owner result was not confirmed");
            std::thread::sleep(Duration::from_millis(1));
        }
    }

    fn send(client: &Client, request: &Request) -> Response {
        client.call(request.clone()).unwrap()
    }

    fn inspect(client: &Client) -> Response {
        let inspected = send(
            client,
            &Request {
                request_id: client.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            },
        );
        assert_eq!(inspected.status, Outcome::Applied);
        inspected
    }

    fn create_fleet(client: &Client, snapshot: &Response, name: &str) -> Request {
        Request {
            request_id: client.request_id(),
            expected_version: snapshot.version,
            action: Action::CreateFleet {
                voyage: snapshot.layout.voyages[0].id.clone(),
                name: name.into(),
            },
        }
    }

    fn fleets(response: &Response, name: &str) -> usize {
        response.layout.voyages[0]
            .fleets
            .iter()
            .filter(|fleet| fleet.name == name)
            .count()
    }

    fn with_core(name: &str, check: impl FnOnce(&Client, &mut Core)) {
        let session = format!("voyager-front-door-{name}-{}", std::process::id());
        let mut core = Core::connect(&session).unwrap();
        let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let client = Client::open(session.clone(), "/tmp".into());
            check(&client, &mut core);
        }));
        let stop = core.server_stop();
        let close = core.close();
        if let Err(failure) = checked {
            std::panic::resume_unwind(failure);
        }
        assert!(stop.is_ok() && close.is_ok());
    }

    #[test]
    fn a_repeated_request_returns_the_first_outcome_and_core_holds_one_effect() {
        with_core("repeat", |client, core| {
            let snapshot = inspect(client);
            let request = create_fleet(client, &snapshot, "Once");
            let first = send(client, &request);
            assert_eq!(first.status, Outcome::Applied);
            assert_eq!(fleets(&first, "Once"), 1);
            let saved = core.document_get(DOCUMENT).unwrap().version;
            assert_eq!(saved, first.version);

            let repeat = send(client, &request);
            assert_eq!(repeat.status, Outcome::Applied);
            assert_eq!(repeat.request_id, request.request_id);
            assert_eq!(fleets(&repeat, "Once"), 1);
            assert_eq!(core.document_get(DOCUMENT).unwrap().version, saved);

            let mut changed = request.clone();
            changed.action = Action::CreateFleet {
                voyage: snapshot.layout.voyages[0].id.clone(),
                name: "Twice".into(),
            };
            let refused = send(client, &changed);
            assert_eq!(refused.status, Outcome::Refused);
            assert_eq!(
                refused.message.as_deref(),
                Some("Changed request identity; nothing was repeated")
            );
            let scoped = client
                .scoped_call(Context::Workspace, request.clone())
                .unwrap();
            assert_eq!(scoped.status, Outcome::Refused);
            assert_eq!(
                scoped.message.as_deref(),
                Some("Changed request identity; nothing was repeated")
            );

            let vessel = first.layout.vessels[0].id.clone();
            let collided = client.terminal(vessel, request.request_id.clone(), first.version);
            assert!(matches!(
                &collided,
                Err(Error::Rejected { message, .. })
                    if message == "This request identity belongs to a workspace operation"
            ));

            let after = inspect(client);
            assert_eq!(fleets(&after, "Once"), 1);
            assert_eq!(fleets(&after, "Twice"), 0);
            assert_eq!(after.version, saved);
        });
    }

    #[test]
    fn an_invalid_request_id_is_refused_for_each_kind_before_anything_else() {
        with_core("invalid", |client, _| {
            let snapshot = inspect(client);
            let long = "x".repeat(129);
            for id in ["", long.as_str()] {
                let mut request = create_fleet(client, &snapshot, "Never");
                request.request_id = id.into();
                let refused = send(client, &request);
                assert_eq!(refused.status, Outcome::Refused);
                assert_eq!(refused.message.as_deref(), Some("Invalid request identity"));
                let vessel = snapshot.layout.vessels[0].id.clone();
                assert!(matches!(
                    client.terminal(vessel, id.into(), snapshot.version),
                    Err(Error::Rejected { message, .. })
                        if message == "Invalid terminal request identity"
                ));
            }
            assert_eq!(fleets(&inspect(client), "Never"), 0);
        });
    }

    #[test]
    fn quitting_refuses_an_effect_of_every_kind_and_still_answers_a_repeat() {
        with_core("quit", |client, _| {
            let snapshot = inspect(client);
            let settled = create_fleet(client, &snapshot, "Before");
            let before = send(client, &settled);
            assert_eq!(before.status, Outcome::Applied);
            assert!(wait(client.end(Lifecycle::QuitAndKeep)).is_ok());

            let late = send(client, &create_fleet(client, &before, "Late"));
            assert_eq!(late.status, Outcome::Refused);
            assert_eq!(
                late.message.as_deref(),
                Some("Voyager is quitting; no workspace effect was dispatched")
            );

            let vessel = before.layout.vessels[0].id.clone();
            assert!(matches!(
                client.terminal(vessel.clone(), client.request_id(), before.version),
                Err(Error::Rejected { message, .. })
                    if message == "Voyager is quitting; no terminal was opened"
            ));

            let listed = client
                .worktree(
                    None,
                    worktree::Request {
                        request_id: client.request_id(),
                        expected_version: before.version,
                        voyage: before.layout.voyages[0].id.clone(),
                        action: worktree::Action::List,
                    },
                )
                .unwrap();
            assert_eq!(listed.status, worktree::Status::Rejected);
            assert_eq!(
                listed.message.as_deref(),
                Some("Voyager is quitting; no worktree operation was dispatched")
            );

            let stopped = client
                .process(
                    Context::Workspace,
                    ProcessRequest {
                        request_id: client.request_id(),
                        input: ProcessInput {
                            expected_version: before.version,
                            action: ProcessAction::Stop {
                                vessel_id: vessel.clone(),
                                terminal_id: CoreTerminalId("t1".into()),
                                pid: 1,
                            },
                        },
                    },
                )
                .unwrap();
            assert_eq!(stopped.status, Status::Rejected);
            assert_eq!(
                stopped.message.as_deref(),
                Some("Voyager is quitting; no process effect was dispatched")
            );

            let updated = client
                .content(
                    Access::Agent {
                        scope: Context::Workspace,
                        expected_version: before.version,
                    },
                    Content::Update {
                        version: Version::V1,
                        request_id: client.request_id(),
                        vessel_id: vessel,
                        expected_revision: "revision".into(),
                        data: Notes {
                            title: "title".into(),
                            text: "text".into(),
                        },
                    },
                )
                .unwrap();
            assert!(matches!(
                &*updated,
                ContentResponse::Rejected { message, .. }
                    if message == "Voyager is quitting; no content was changed"
            ));

            let repeat = send(client, &settled);
            assert_eq!(repeat.status, Outcome::Applied);
            let after = inspect(client);
            assert!(!after.fresh);
            assert_eq!(fleets(&after, "Before"), 1);
            assert_eq!(fleets(&after, "Late"), 0);
        });
    }
}
