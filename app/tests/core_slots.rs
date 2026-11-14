use std::{
    future::Future,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    task::{Context as TaskContext, Poll, Waker},
    thread,
    time::{Duration, Instant, SystemTime},
};
use voyager_app::{
    client::{CallError, Client},
    core::{Core, Viewer},
};
use voyager_contract::{
    Action, ContentId, Context, Request, Response, Status,
    administrator::{
        ProcessAction, ProcessInfo, ProcessInput, ProcessOutput, ProcessRequest, ProcessResponse,
    },
};

fn wait<T>(future: impl Future<Output = T>) -> T {
    let mut future = Box::pin(future);
    let mut context = TaskContext::from_waker(Waker::noop());
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
            return value;
        }
        assert!(Instant::now() < deadline, "Owner result was not confirmed");
        thread::sleep(Duration::from_millis(1));
    }
}

fn session(name: &str) -> String {
    let suffix = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    format!("voyager-slots-{name}-{}-{suffix}", std::process::id())
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

struct Loaded {
    client: Client,
    viewer: Viewer,
    version: u64,
    senders: Vec<thread::JoinHandle<Result<Arc<ProcessResponse>, CallError>>>,
    completed: Arc<AtomicUsize>,
}

fn send(client: &Client, loaded: (&ContentId, &ProcessInfo, u64), text: String) -> ProcessRequest {
    let (content, target, version) = loaded;
    ProcessRequest {
        request_id: client.request_id(),
        input: ProcessInput {
            expected_version: version,
            action: ProcessAction::Send {
                content_id: content.clone(),
                terminal_id: target.terminal_id.clone(),
                pid: target.pid.unwrap(),
                text,
            },
        },
    }
}

fn eight_admitted_effects(session: &str) -> Loaded {
    let client = Client::open(session.to_owned(), "/tmp".into());
    let initial = inspect(&client);
    assert_eq!(initial.status, Status::Applied, "{initial:?}");
    let content = initial.layout.contents[0].id.clone();
    let viewer = client
        .terminal(content.clone(), client.request_id(), initial.version)
        .unwrap();
    let bound = inspect(&client);
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
    let target = processes
        .iter()
        .find(|process| process.content_id == content)
        .unwrap()
        .clone();
    thread::sleep(Duration::from_millis(500));
    viewer.input(b"unsent draft".to_vec()).unwrap();
    thread::sleep(Duration::from_millis(300));
    let completed = Arc::new(AtomicUsize::new(0));
    let senders = (0..8)
        .map(|index| {
            let request = send(
                &client,
                (&content, &target, bound.version),
                format!("true {index}"),
            );
            let client = client.clone();
            let completed = completed.clone();
            thread::sleep(Duration::from_millis(40));
            thread::spawn(move || {
                let result = loop {
                    match client.process(Context::Workspace, request.clone()) {
                        Err(CallError::Rejected(message)) if message.contains("busy") => {
                            thread::sleep(Duration::from_millis(10));
                        }
                        other => break other,
                    }
                };
                completed.fetch_add(1, Ordering::SeqCst);
                result
            })
        })
        .collect();
    thread::sleep(Duration::from_millis(600));
    let ninth = client
        .process(
            Context::Workspace,
            send(&client, (&content, &target, bound.version), "true 9".into()),
        )
        .unwrap();
    eprintln!(
        "ninth process effect: status={:?} message={:?}",
        ninth.status, ninth.message
    );
    assert!(
        ninth
            .message
            .as_deref()
            .is_some_and(|message| message.contains("Process request limit reached")),
        "The fixture does not hold eight admitted process effects: {ninth:?}"
    );
    assert_eq!(completed.load(Ordering::SeqCst), 0);
    Loaded {
        client,
        viewer,
        version: bound.version,
        senders,
        completed,
    }
}

fn stop(session: &str) {
    let mut cleanup = Core::connect(session).unwrap();
    cleanup.server_stop().unwrap();
}

#[test]
fn owner_calls_keep_their_slot_beside_eight_process_effects_and_one_observation() {
    let session = session("slots");
    let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let loaded = eight_admitted_effects(&session);
        let client = &loaded.client;
        let voyage = inspect(client).layout.voyages[0].id.clone();
        let mut refusals = Vec::new();
        assert!(loaded.version > 0);
        for round in 0..6 {
            let before = inspect(client);
            assert_eq!(before.status, Status::Applied, "{before:?}");
            assert!(before.fresh, "{before:?}");
            let version = before.version;
            let mut observation =
                Box::pin(client.workspace_observation(Context::Workspace, version, None));
            let mut context = TaskContext::from_waker(Waker::noop());
            assert!(observation.as_mut().poll(&mut context).is_pending());
            let action = if round % 2 == 0 {
                Action::CreateFleet {
                    voyage: voyage.clone(),
                    name: format!("probe-{round}"),
                }
            } else {
                Action::Inspect
            };
            let label = if round % 2 == 0 {
                "new Fleet"
            } else {
                "Inspect"
            };
            let response = client
                .call(Request {
                    request_id: client.request_id(),
                    expected_version: version,
                    action,
                })
                .unwrap();
            let observed = wait(observation);
            eprintln!(
                "round={round} pending_effects={} call={label} status={:?} fresh={} message={:?} observation_ok={}",
                8 - loaded.completed.load(Ordering::SeqCst),
                response.status,
                response.fresh,
                response.message,
                observed.is_ok()
            );
            if response.status != Status::Applied {
                refusals.push((round, label, response.message.clone()));
            }
            thread::sleep(Duration::from_millis(30));
        }
        assert_eq!(loaded.completed.load(Ordering::SeqCst), 0);
        loaded.viewer.input(vec![0x15]).unwrap();
        for sender in loaded.senders {
            let result = sender.join().unwrap();
            eprintln!(
                "admitted effect finished: {:?}",
                result.as_ref().map(|response| response.status.clone())
            );
        }
        assert!(
            refusals.is_empty(),
            "Owner calls were refused beside eight admitted process effects and one observation read: {refusals:?}"
        );
    }));
    stop(&session);
    checked.unwrap();
}
