use std::panic::{AssertUnwindSafe, catch_unwind};
use std::{
    thread,
    time::{Duration, Instant},
};
use voyager_app::{client::Client, core::Core, core_session::running};
use voyager_contract::{Action, Request};

fn gone(session: &str) -> bool {
    let deadline = Instant::now() + Duration::from_secs(5);
    while running(session) {
        if Instant::now() >= deadline {
            return false;
        }
        thread::sleep(Duration::from_millis(10));
    }
    true
}

fn inspect(session: &str) -> Client {
    let client = Client::open(session.to_owned(), "/tmp".into());
    client
        .call(Request {
            request_id: client.request_id(),
            expected_version: 0,
            action: Action::Inspect,
        })
        .unwrap();
    assert!(running(session));
    client
}

fn stop(session: &str) {
    let mut core = Core::connect(session).unwrap();
    core.server_stop().unwrap();
    core.close().unwrap();
}

#[test]
fn a_run_leaves_no_core_behind_whether_it_passes_or_fails() {
    let passed = format!("voyager-guard-check-pass-{}", std::process::id());
    let failed = format!("voyager-guard-check-fail-{}", std::process::id());
    let client = inspect(&passed);
    stop(&passed);
    drop(client);
    let outcome = catch_unwind(AssertUnwindSafe(|| {
        let _client = inspect(&failed);
        Result::<(), &str>::Err("deliberate failure").unwrap();
        stop(&failed);
    }));
    assert!(outcome.is_err());
    assert!(gone(&failed), "a failing run left its Core running");
    assert!(gone(&passed), "a passing run left its Core running");
}
