use serde_json::json;
use std::{
    panic, thread,
    time::{Duration, Instant, SystemTime},
};
use voyager_app::{client::Client, core::Core};
use voyager_contract::{
    Action, Context, Layout, Outcome, PlacementId, Request, Split, Status, Unapplied, VesselId,
    administrator::{ProcessAction, ProcessInput, ProcessOutput, ProcessRequest},
};

fn leaf(split: &Split, placement: &PlacementId) -> bool {
    match split {
        Split::Leaf { placement: shown } => shown == placement,
        Split::Branch { first, second, .. } => leaf(first, placement) || leaf(second, placement),
    }
}

fn placed(layout: &Layout, content: &VesselId) -> bool {
    layout
        .voyages
        .iter()
        .flat_map(|voyage| &voyage.fleets)
        .any(|fleet| {
            fleet.placements.iter().any(|vessel| {
                &vessel.vessel == content
                    && fleet
                        .root
                        .as_ref()
                        .is_some_and(|root| leaf(root, &vessel.id))
            })
        })
}

#[test]
fn an_exited_shell_closes_from_the_core_event_and_a_foreign_exit_changes_nothing() {
    let suffix = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let session = format!("voyager-exit-events-{}-{suffix}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    let checked = panic::catch_unwind(panic::AssertUnwindSafe(|| {
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
        let content = initial.layout.vessels[0].id.clone();
        let _viewer = client
            .terminal(content.clone(), client.request_id(), initial.version)
            .unwrap();
        let bound = inspect();
        assert!(placed(&bound.layout, &content));
        let request = |action| ProcessRequest {
            request_id: client.request_id(),
            input: ProcessInput {
                expected_version: bound.version,
                action,
            },
        };
        let listing = request(ProcessAction::List);
        let listed = client.process(Context::Workspace, listing.clone()).unwrap();
        let Some(ProcessOutput::List { processes, .. }) = &listed.output else {
            panic!("The real process list is missing: {listed:?}")
        };
        let repeated = client.process(Context::Workspace, listing).unwrap();
        assert!(
            std::sync::Arc::ptr_eq(&listed, &repeated),
            "A repeated process list was not answered from the ledger"
        );
        let target = processes
            .iter()
            .find(|process| process.vessel_id == content)
            .unwrap()
            .clone();
        let mut foreign = Core::connect(&session).unwrap();
        let outside = foreign
            .terminal_run_with(
                serde_json::from_value(json!({"argv":["/bin/true"],"cwd":"/tmp","keep":true}))
                    .unwrap(),
            )
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !foreign.terminal_get(&outside.address).unwrap().has_exited() {
            assert!(
                Instant::now() < deadline,
                "The foreign program did not exit"
            );
            thread::sleep(Duration::from_millis(10));
        }
        thread::sleep(Duration::from_millis(300));
        let after_foreign = inspect();
        assert_eq!(after_foreign.version, bound.version);
        assert_eq!(after_foreign.layout, bound.layout);
        let sent = client
            .process(
                Context::Workspace,
                request(ProcessAction::Send {
                    vessel_id: content.clone(),
                    terminal_id: target.terminal_id.clone(),
                    pid: target.pid.unwrap(),
                    text: "exit".into(),
                }),
            )
            .unwrap();
        assert_eq!(sent.status, Status::Applied, "{sent:?}");
        let started = Instant::now();
        while placed(&inspect().layout, &content) {
            assert!(
                started.elapsed() < Duration::from_secs(2),
                "The exited shell's panel stayed without an observation"
            );
            thread::sleep(Duration::from_millis(10));
        }
        eprintln!(
            "exit_to_closed_ms={} without workspace observation",
            started.elapsed().as_millis()
        );
        let closed = inspect();
        let after = client
            .process(
                Context::Workspace,
                ProcessRequest {
                    request_id: client.request_id(),
                    input: ProcessInput {
                        expected_version: closed.version,
                        action: ProcessAction::Send {
                            vessel_id: content.clone(),
                            terminal_id: target.terminal_id.clone(),
                            pid: target.pid.unwrap(),
                            text: "printf 'AFTER%s\\n' EXIT".into(),
                        },
                    },
                },
            )
            .unwrap();
        assert_eq!(after.status, Status::Rejected, "{after:?}");
        assert!(after.output.is_none(), "{after:?}");
        assert!(
            foreign
                .terminal_get(&target.terminal_id.0)
                .unwrap()
                .has_exited(),
            "The placed shell is not recorded as exited"
        );
    }));
    let mut cleanup = Core::connect(&session).unwrap();
    cleanup.server_stop().unwrap();
    checked.unwrap();
}

fn notice_within(
    changes: &async_channel::Receiver<voyager_app::client::WorkspaceNotice>,
    wait: Duration,
) -> Option<voyager_app::client::WorkspaceNotice> {
    let deadline = Instant::now() + wait;
    loop {
        if let Ok(notice) = changes.try_recv() {
            return Some(notice);
        }
        if Instant::now() >= deadline {
            return None;
        }
        thread::sleep(Duration::from_millis(5));
    }
}

#[test]
fn a_placed_foreground_change_moves_the_activity_notice_and_a_foreign_one_does_not() {
    use std::{
        future::Future,
        pin::pin,
        task::{Context as TaskContext, Poll, Waker},
    };
    let suffix = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let session = format!("voyager-foreground-{}-{suffix}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    let checked = panic::catch_unwind(panic::AssertUnwindSafe(|| {
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
        let content = initial.layout.vessels[0].id.clone();
        let viewer = client
            .terminal(content.clone(), client.request_id(), initial.version)
            .unwrap();
        let bound = inspect();
        let list = || {
            let listed = client
                .process(
                    Context::Workspace,
                    ProcessRequest {
                        request_id: client.request_id(),
                        input: ProcessInput {
                            expected_version: bound.version,
                            action: ProcessAction::List,
                        },
                    },
                )
                .unwrap();
            let Some(ProcessOutput::List { processes, .. }) = &listed.output else {
                panic!("The real process list is missing: {listed:?}")
            };
            processes
                .iter()
                .find(|process| process.vessel_id == content)
                .unwrap()
                .clone()
        };
        assert_ne!(list().foreground.as_deref(), Some("sleep"));
        let changes = |after| {
            let mut subscribing = pin!(client.workspace_changes(after));
            let deadline = Instant::now() + Duration::from_secs(5);
            loop {
                let polled = subscribing
                    .as_mut()
                    .poll(&mut TaskContext::from_waker(Waker::noop()));
                if let Poll::Ready(changes) = polled {
                    return changes.unwrap();
                }
                assert!(Instant::now() < deadline, "The owner never subscribed");
                thread::sleep(Duration::from_millis(1));
            }
        };
        let mut seen = notice_within(&changes(None), Duration::from_secs(5)).unwrap();
        while let Some(later) = notice_within(&changes(Some(seen)), Duration::from_millis(1500)) {
            seen = later;
        }
        let mut foreign = Core::connect(&session).unwrap();
        foreign
            .terminal_run_with(
                serde_json::from_value(
                    json!({"argv":["/bin/sleep","30"],"cwd":"/tmp","keep":true}),
                )
                .unwrap(),
            )
            .unwrap();
        let quiet = changes(Some(seen));
        assert_eq!(
            notice_within(&quiet, Duration::from_millis(1500)),
            None,
            "A foreign program's events reached the canvas"
        );
        viewer.input(b"sleep 30\r".to_vec()).unwrap();
        let started = Instant::now();
        let moved = notice_within(&quiet, Duration::from_secs(2))
            .expect("The placed program's foreground change never reached the canvas");
        eprintln!(
            "foreground_to_notice_ms={} without an observation or a list",
            started.elapsed().as_millis()
        );
        assert!(
            moved.activity_revision > seen.activity_revision,
            "{moved:?}"
        );
        assert_eq!(moved.revision, seen.revision);
        assert_eq!(list().foreground.as_deref(), Some("sleep"));
    }));
    let mut cleanup = Core::connect(&session).unwrap();
    cleanup.server_stop().unwrap();
    checked.unwrap();
}

#[test]
fn observations_in_flight_never_crowd_out_a_workspace_save() {
    use std::{
        future::Future,
        pin::pin,
        task::{Context as TaskContext, Poll, Waker},
    };
    let suffix = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let session = format!("voyager-observe-busy-{}-{suffix}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    let checked = panic::catch_unwind(panic::AssertUnwindSafe(|| {
        for round in 0..10 {
            let inspected = client
                .call(Request {
                    request_id: client.request_id(),
                    expected_version: 0,
                    action: Action::Inspect,
                })
                .unwrap();
            assert_eq!(inspected.status, Outcome::Applied, "{inspected:?}");
            let mut sent = 0;
            for _ in 0..100_000 {
                let mut observation =
                    pin!(client.workspace_observation(Context::Workspace, inspected.version, None));
                let polled = observation
                    .as_mut()
                    .poll(&mut TaskContext::from_waker(Waker::noop()));
                sent += usize::from(matches!(polled, Poll::Pending));
                if sent == 24 {
                    break;
                }
            }
            assert_eq!(sent, 24, "The owner never accepted 24 observations");
            let created = loop {
                let attempt = client.call(Request {
                    request_id: client.request_id(),
                    expected_version: inspected.version,
                    action: Action::CreateVoyage {
                        name: format!("round {round}"),
                        cwd: "/tmp".into(),
                    },
                });
                match attempt {
                    Err(unanswered) if unanswered.status == Unapplied::Refused => continue,
                    other => break other.unwrap(),
                }
            };
            assert_eq!(created.status, Outcome::Applied, "{created:?}");
        }
    }));
    let mut cleanup = Core::connect(&session).unwrap();
    cleanup.server_stop().unwrap();
    checked.unwrap();
}

#[test]
fn a_process_read_answered_after_an_effect_names_the_version_it_was_built_from() {
    let suffix = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let session = format!("voyager-read-stamp-{}-{suffix}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    let checked = panic::catch_unwind(panic::AssertUnwindSafe(|| {
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
        let content = initial.layout.vessels[0].id.clone();
        let _viewer = client
            .terminal(content.clone(), client.request_id(), initial.version)
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let bound = inspect();
            let listed = client
                .process(
                    Context::Workspace,
                    ProcessRequest {
                        request_id: client.request_id(),
                        input: ProcessInput {
                            expected_version: bound.version,
                            action: ProcessAction::List,
                        },
                    },
                )
                .unwrap();
            if let Some(ProcessOutput::List { processes, .. }) = &listed.output
                && processes.iter().any(|item| item.vessel_id == content)
            {
                break;
            }
            assert!(Instant::now() < deadline, "The shell was never listed");
            thread::sleep(Duration::from_millis(20));
        }
        let (mut answered, mut raced, mut stale) = (0, 0, Vec::new());
        for round in 0..120u64 {
            let issued = inspect().version;
            let action = ProcessAction::List;
            let reader = client.clone();
            let read = thread::spawn(move || {
                let response = reader
                    .process(
                        Context::Workspace,
                        ProcessRequest {
                            request_id: reader.request_id(),
                            input: ProcessInput {
                                expected_version: issued,
                                action,
                            },
                        },
                    )
                    .unwrap();
                (response, Instant::now())
            });
            thread::sleep(Duration::from_micros(200 + (round % 6) * 300));
            let created = client.call(Request {
                request_id: client.request_id(),
                expected_version: issued,
                action: Action::CreateVoyage {
                    name: format!("round {round}"),
                    cwd: "/tmp".into(),
                },
            });
            let created_at = Instant::now();
            let (response, read_at) = read.join().unwrap();
            if response.status != Status::Applied {
                continue;
            }
            answered += 1;
            if created.is_ok_and(|created| created.status == Outcome::Applied)
                && created_at < read_at
            {
                raced += 1;
            }
            if response.version != issued {
                stale.push((round, issued, response.version));
            }
            if raced >= 20 {
                break;
            }
        }
        eprintln!("answered_reads={answered} raced_by_an_effect={raced} stamped_newer={stale:?}");
        assert!(
            stale.is_empty(),
            "{} of {answered} applied process reads named a newer version than the layout they were built from: {stale:?}",
            stale.len()
        );
        assert!(
            raced > 0,
            "No workspace effect landed while a process read waited on Core, so the stamp was not tested"
        );
    }));
    let mut cleanup = Core::connect(&session).unwrap();
    cleanup.server_stop().unwrap();
    checked.unwrap();
}
