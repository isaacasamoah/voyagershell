use std::{
    panic::{self, AssertUnwindSafe},
    thread,
    time::{Duration, Instant, SystemTime},
};
use voyager_app::{
    core::{Core, Error, Viewer},
    core_shapes::{RunParams, Terminal},
};

fn with_core(name: &str, test: impl FnOnce(Core)) {
    let suffix = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let session = format!("voyager-{name}-{}-{suffix}", std::process::id());
    let core = Core::connect(&session).unwrap();
    let outcome = panic::catch_unwind(AssertUnwindSafe(|| test(core)));
    let mut cleanup = Core::connect(&session).unwrap();
    cleanup.server_stop().unwrap();
    cleanup.close().unwrap();
    if let Err(failure) = outcome {
        panic::resume_unwind(failure);
    }
}

fn attach(core: &mut Core, terminal: &Terminal) -> Result<Viewer, Error> {
    let attached = core.terminal_attach(terminal)?;
    core.viewer(&attached)
}

fn read_until(viewer: &Viewer, done: impl Fn(&Viewer, &[u8]) -> bool) -> Vec<u8> {
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut output = Vec::new();
    while !done(viewer, &output) {
        assert!(Instant::now() < deadline, "viewer output did not arrive");
        let bytes = viewer.take(65536).unwrap();
        if bytes.is_empty() {
            thread::sleep(Duration::from_millis(5));
        }
        output.extend(bytes);
    }
    output
}

#[test]
fn ended_terminals_do_not_exhaust_viewers() {
    with_core("viewer-ended", |mut core| {
        let shell = core.terminal_run("/tmp", "viewer-ended").unwrap();
        let first = attach(&mut core, &shell).unwrap();
        let sleeper: RunParams =
            serde_json::from_value(serde_json::json!({"cwd": "/tmp", "argv": ["sleep", "60"]}))
                .unwrap();
        for ended in 0..65 {
            let terminal = core.terminal_run_with(sleeper.clone()).unwrap();
            let viewer = attach(&mut core, &terminal).unwrap_or_else(|error| {
                panic!("attach after {ended} ended terminals failed: {error:?}")
            });
            core.terminal_kill(&terminal.address).unwrap();
            read_until(&viewer, |viewer, _| viewer.finished().unwrap());
        }
        first
            .input(b"printf 'voyager_%s\\n' 'alive'\n".to_vec())
            .unwrap();
        read_until(&first, |_, output| {
            output.windows(13).any(|part| part == b"voyager_alive")
        });
        let another = core.terminal_run("/tmp", "viewer-ended").unwrap();
        attach(&mut core, &another).unwrap();
    });
}

#[test]
fn the_viewer_limit_refuses_one_attach_and_keeps_the_bridge() {
    with_core("viewer-limit", |mut core| {
        let terminal = core.terminal_run("/tmp", "viewer-limit").unwrap();
        let viewers = (0..64)
            .map(|_| attach(&mut core, &terminal).unwrap())
            .collect::<Vec<_>>();
        let refused = attach(&mut core, &terminal);
        assert!(
            matches!(&refused, Err(Error::Rejected { kind, .. }) if kind == "viewer_limit"),
            "{:?}",
            refused.err()
        );
        viewers[0].focus(true).unwrap();
        core.terminal_get(&terminal.address).unwrap();
        viewers[1].close().unwrap();
        attach(&mut core, &terminal).unwrap();
    });
}

#[test]
fn a_closed_connection_reports_disconnected() {
    with_core("viewer-disconnected", |mut core| {
        let terminal = core.terminal_run("/tmp", "viewer-disconnected").unwrap();
        let viewer = attach(&mut core, &terminal).unwrap();
        core.close().unwrap();
        let focus = viewer.focus(true);
        assert!(
            matches!(&focus, Err(Error::Rejected { kind, .. }) if kind == "disconnected"),
            "{focus:?}"
        );
    });
}
