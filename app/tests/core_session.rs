use std::panic::{AssertUnwindSafe, catch_unwind};
use std::{
    thread,
    time::{Duration, Instant},
};
use voyager_app::core_session::{SessionGuard, running};
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

fn inspect(session: &mut SessionGuard) {
    let client = session.open("/tmp");
    client
        .call(Request {
            request_id: client.request_id(),
            expected_version: 0,
            action: Action::Inspect,
        })
        .unwrap();
    assert!(running(session.session()));
}

#[test]
fn a_run_leaves_no_core_behind_whether_it_passes_or_fails() {
    let passed = format!("voyager-guard-check-pass-{}", std::process::id());
    let failed = format!("voyager-guard-check-fail-{}", std::process::id());
    {
        let mut session = SessionGuard::named(passed.clone());
        inspect(&mut session);
    }
    let outcome = catch_unwind(AssertUnwindSafe(|| {
        let mut session = SessionGuard::named(failed.clone());
        inspect(&mut session);
        panic!("deliberate failure");
    }));
    assert!(outcome.is_err());
    assert!(gone(&failed), "a failing run left its Core running");
    assert!(gone(&passed), "a passing run left its Core running");
}
