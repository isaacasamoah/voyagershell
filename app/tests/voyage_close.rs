#![cfg(target_os = "linux")]

use std::{
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use voyager_app::{client::Client, core::Core};
use voyager_contract::{Action, Context, Outcome, Request};

fn call(client: &Client, version: u64, action: Action) -> voyager_contract::Response {
    client
        .call(Request {
            request_id: client.request_id(),
            expected_version: version,
            action,
        })
        .unwrap()
}

#[test]
fn confirmed_voyage_shutdown_stops_its_programs_and_preserves_other_voyages() {
    for key in ["HC_SOCKET", "HC_SESSION", "HC_TERMINAL_ID"] {
        assert!(std::env::var_os(key).is_none());
    }
    let unique = format!(
        "{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let directory = std::env::temp_dir().join(format!("voyager-close-{unique}"));
    std::fs::create_dir_all(&directory).unwrap();
    let session = format!("voyager-close-{unique}");
    let client = Client::open(session.clone(), directory.to_string_lossy().into_owned());
    let result = std::panic::catch_unwind(|| {
        let mut snapshot = call(&client, 0, Action::Inspect);
        assert_eq!(snapshot.status, Outcome::Applied);
        let original = snapshot.layout.voyages[0].clone();
        let first = original.fleets[0].placements[0].clone();
        let viewer = client
            .terminal(first.vessel.clone(), client.request_id(), snapshot.version)
            .unwrap();
        snapshot = call(&client, 0, Action::Inspect);
        let owned = snapshot
            .layout
            .vessels
            .iter()
            .find(|item| item.id == first.vessel)
            .unwrap()
            .backend
            .clone()
            .unwrap();
        snapshot = call(
            &client,
            snapshot.version,
            Action::CreateVoyage {
                name: "Independent Voyage".into(),
                cwd: directory.to_string_lossy().into_owned(),
            },
        );
        let sibling = snapshot.layout.voyages.last().unwrap().fleets[0].placements[0].clone();
        let other_viewer = client
            .terminal(
                sibling.vessel.clone(),
                client.request_id(),
                snapshot.version,
            )
            .unwrap();
        snapshot = call(&client, 0, Action::Inspect);
        let independent = snapshot
            .layout
            .vessels
            .iter()
            .find(|item| item.id == sibling.vessel)
            .unwrap()
            .backend
            .clone()
            .unwrap();
        let prepare = || {
            call(
                &client,
                call(&client, 0, Action::Inspect).version,
                Action::CloseVoyage {
                    id: original.id.clone(),
                },
            )
        };
        let prepared = prepare();
        assert!(!prepared.layout.voyages[0].closed);
        let plan = prepared.close_plan.unwrap();
        assert_eq!(plan.entries.len(), 1);
        assert_eq!(plan.entries[0].terminal.as_ref(), Some(&owned));
        let request = Request {
            request_id: client.request_id(),
            expected_version: plan.version,
            action: Action::ConfirmVoyageClose {
                id: original.id.clone(),
                plan: plan.id.clone(),
            },
        };
        let denied = client.scoped_call(Context::Workspace, request).unwrap();
        assert_eq!(denied.status, Outcome::Refused);
        assert_eq!(
            call(&client, plan.version, Action::Home).status,
            Outcome::Applied
        );
        let cancelled = call(
            &client,
            plan.version,
            Action::CancelVoyageClose {
                id: original.id.clone(),
                plan: plan.id,
            },
        );
        assert_eq!(cancelled.status, Outcome::Applied);
        let mut core = Core::connect(&session).unwrap();
        assert_eq!(core.terminal_get(&owned.0).unwrap().state, "live");
        let plan = prepare().close_plan.unwrap();
        let confirm = Request {
            request_id: client.request_id(),
            expected_version: plan.version,
            action: Action::ConfirmVoyageClose {
                id: original.id.clone(),
                plan: plan.id,
            },
        };
        let duplicate = confirm.clone();
        let closed = client.call(confirm).unwrap();
        assert_eq!(closed.status, Outcome::Applied, "{:?}", closed.message);
        assert!(closed.layout.voyages[0].closed);
        assert!(!closed.layout.voyages[1].closed);
        assert_eq!(core.terminal_get(&owned.0).unwrap().state, "finished");
        let survivor = core.terminal_get(&independent.0).unwrap();
        assert_eq!(survivor.state, "live");
        assert_eq!(client.call(duplicate).unwrap().status, Outcome::Applied);
        let reopened = call(
            &client,
            closed.version,
            Action::ReopenVoyage {
                id: original.id.clone(),
            },
        );
        assert_eq!(reopened.status, Outcome::Applied);
        assert!(reopened.created_vessels.contains(&first.vessel));
        let new_viewer = client
            .terminal(first.vessel.clone(), client.request_id(), reopened.version)
            .unwrap();
        let reopened = call(&client, 0, Action::Inspect);
        let new_address = reopened
            .layout
            .vessels
            .iter()
            .find(|item| item.id == first.vessel)
            .unwrap()
            .backend
            .as_ref()
            .unwrap();
        assert_ne!(new_address, &owned);
        let shell = core.terminal_get(&new_address.0).unwrap();
        assert_eq!(shell.state, "live");
        assert_eq!(shell.argv, ["/bin/bash"]);
        assert_eq!(core.terminal_get(&independent.0).unwrap().pid, survivor.pid);
        drop((viewer, other_viewer, new_viewer));
    });
    let mut core = Core::connect(&session).unwrap();
    core.server_stop().unwrap();
    core.close().unwrap();
    let socket = PathBuf::from(std::env::var_os("XDG_RUNTIME_DIR").unwrap())
        .join("herdr-core")
        .join(format!("{session}.sock"));
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while socket.exists() && std::time::Instant::now() < deadline {
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    assert!(!socket.exists());
    if let Err(failure) = result {
        std::panic::resume_unwind(failure);
    }
}
