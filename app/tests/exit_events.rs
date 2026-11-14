use serde_json::json;
use std::{
    panic, thread,
    time::{Duration, Instant, SystemTime},
};
use voyager_app::{client::Client, core::Core};
use voyager_contract::{
    Action, ContentId, Context, Layout, Request, Status,
    administrator::{ProcessAction, ProcessInput, ProcessOutput, ProcessRequest},
};

fn placed(layout: &Layout, content: &ContentId) -> bool {
    layout.voyages.iter().any(|voyage| {
        voyage
            .fleets
            .iter()
            .any(|fleet| fleet.vessels.iter().any(|panel| &panel.content == content))
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
        let content = initial.layout.contents[0].id.clone();
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
        let listed = client
            .process(Context::Workspace, request(ProcessAction::List))
            .unwrap();
        let Some(ProcessOutput::List { processes, .. }) = &listed.output else {
            panic!("The real process list is missing: {listed:?}")
        };
        let target = processes
            .iter()
            .find(|process| process.content_id == content)
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
                    content_id: content.clone(),
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
                            content_id: content.clone(),
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
