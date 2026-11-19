#![cfg(target_os = "linux")]

use std::{
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use voyager_app::{
    client::{CallError, Client, SaveRequest},
    content::Owner,
    core::Core,
};
use voyager_contract::{
    Action, ContentDestination, Context, Outcome, PlacementInsertion, PlacementOwner, Request,
};

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
fn confirmed_voyage_shutdown_saves_first_and_preserves_other_voyages() {
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
    std::fs::create_dir_all(directory.join("vessels/notes")).unwrap();
    std::fs::write(
        directory.join("vessels/notes/vessel.json"),
        include_str!("../../content/notes/vessel.json"),
    )
    .unwrap();
    std::fs::write(
        directory.join("vessels/notes/main.js"),
        "export default class Notes {}",
    )
    .unwrap();
    let session = format!("voyager-close-{unique}");
    let client = Client::with_content(
        session.clone(),
        directory.to_string_lossy().into_owned(),
        Owner::open(&directory).unwrap(),
    );
    let saves = client.close_save_requests().unwrap();
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
        snapshot = call(
            &client,
            snapshot.version,
            Action::CreateVessel {
                type_id: "notes".into(),
                destination: ContentDestination::Placement {
                    owner: PlacementOwner::Fleet {
                        id: original.fleets[0].id.clone(),
                    },
                    insertion: PlacementInsertion::Beside {
                        id: first.id.clone(),
                        side: voyager_contract::Side::Right,
                    },
                },
                launch: None,
            },
        );
        assert_eq!(snapshot.status, Outcome::Applied, "{:?}", snapshot.message);
        let note = snapshot.layout.voyages[0].fleets[0]
            .placements
            .last()
            .unwrap()
            .clone();
        assert_eq!(note.name, "Title.md");
        let rename = |version, name: &str, refuse| {
            let request = Request {
                request_id: client.request_id(),
                expected_version: version,
                action: Action::Rename {
                    target: voyager_contract::RenameTarget::Vessel {
                        id: note.id.clone(),
                    },
                    name: name.into(),
                },
            };
            let copied = request.clone();
            let renamed = client.clone();
            let worker = std::thread::spawn(move || renamed.call(copied).unwrap());
            let SaveRequest::PrepareRename { reply, vessels, .. } = saves.recv_blocking().unwrap()
            else {
                panic!("Expected Notes flush");
            };
            assert_eq!(vessels, vec![note.vessel.clone()]);
            reply
                .send_blocking(if refuse {
                    Err(CallError::Rejected("Dirty draft conflict".into()))
                } else {
                    Ok(None)
                })
                .unwrap();
            let result = worker.join().unwrap();
            let SaveRequest::ReleaseRename { rebind, .. } = saves.recv_blocking().unwrap() else {
                panic!("Expected Notes release");
            };
            assert_eq!(rebind.is_some(), !refuse);
            assert_eq!(client.call(request).unwrap().status, result.status);
            assert!(saves.try_recv().is_err());
            result
        };
        let refused = rename(snapshot.version, "Review", true);
        assert_eq!(refused.status, Outcome::Refused);
        assert!(directory.join("notes/Title.md").exists());
        snapshot = rename(snapshot.version, "Review.md", false);
        assert_eq!(snapshot.status, Outcome::Applied, "{:?}", snapshot.message);
        assert_eq!(
            snapshot.layout.voyages[0].fleets[0]
                .placements
                .last()
                .unwrap()
                .name,
            "Review.md"
        );
        assert!(!directory.join("notes/Title.md").exists());
        assert_eq!(
            std::fs::read(directory.join("notes/Review.md")).unwrap(),
            b"# Title\n\n"
        );
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
        assert_eq!(plan.entries.len(), 2);
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
        assert!(saves.try_recv().is_err());
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
        let prepared = prepare();
        let plan = prepared.close_plan.unwrap();
        let confirming = client.clone();
        let id = original.id.clone();
        let worker = std::thread::spawn(move || {
            call(
                &confirming,
                plan.version,
                Action::ConfirmVoyageClose { id, plan: plan.id },
            )
        });
        let SaveRequest::Prepare { reply, .. } = saves.recv_blocking().unwrap() else {
            panic!("Expected save request");
        };
        reply
            .send_blocking(Err(CallError::Rejected("Save conflict".into())))
            .unwrap();
        let refused = worker.join().unwrap();
        assert_eq!(refused.status, Outcome::Refused);
        assert!(!refused.layout.voyages[0].closed);
        assert_eq!(core.terminal_get(&owned.0).unwrap().state, "live");
        assert!(matches!(
            saves.recv_blocking().unwrap(),
            SaveRequest::Release { .. }
        ));
        let prepared = prepare();
        let plan = prepared.close_plan.unwrap();
        let confirm = Request {
            request_id: client.request_id(),
            expected_version: plan.version,
            action: Action::ConfirmVoyageClose {
                id: original.id.clone(),
                plan: plan.id,
            },
        };
        let duplicate = confirm.clone();
        let confirming = client.clone();
        let worker = std::thread::spawn(move || confirming.call(confirm).unwrap());
        let SaveRequest::Prepare { reply, .. } = saves.recv_blocking().unwrap() else {
            panic!("Expected save request");
        };
        let note = prepared
            .layout
            .vessels
            .iter()
            .find(|item| item.type_id == "notes")
            .unwrap();
        let update = client
            .content(
                voyager_app::content::Access::Agent {
                    scope: Context::Workspace,
                    expected_version: prepared.version,
                },
                voyager_contract::content::Request::Update {
                    version: voyager_contract::content::Version::V1,
                    request_id: client.request_id(),
                    vessel_id: note.id.clone(),
                    expected_revision: "not-a-native-save".into(),
                    data: voyager_contract::content::Notes {
                        title: "Unexpected".into(),
                        text: "Must not be saved".into(),
                    },
                },
            )
            .unwrap();
        assert!(
            matches!(&*update, voyager_contract::content::Response::Rejected { message, .. } if message.contains("closing"))
        );
        let frozen = call(
            &client,
            prepared.version,
            Action::RemovePlacement {
                id: first.id.clone(),
            },
        );
        assert_eq!(frozen.status, Outcome::Refused);
        assert_eq!(
            call(&client, prepared.version, Action::Home).status,
            Outcome::Applied
        );
        reply.send_blocking(Ok(())).unwrap();
        let closed = worker.join().unwrap();
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
