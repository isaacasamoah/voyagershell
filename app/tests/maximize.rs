use voyager_app::{client::Client, core::Core};
use voyager_contract::{Action, Context, PlacementId, Request, Status};

#[test]
fn maximize_cas_scope_and_invalid_stored_selection_use_the_core_owner() {
    for key in ["HC_SOCKET", "HC_SESSION", "HC_TERMINAL_ID"] {
        assert!(std::env::var_os(key).is_none(), "Clear ambient {key}");
    }
    let session = format!("voyager-maximize-{}", std::process::id());
    let runtime = std::path::PathBuf::from(std::env::var_os("XDG_RUNTIME_DIR").unwrap());
    assert!(
        !runtime
            .join("herdr-core")
            .join(format!("{session}.sock"))
            .exists()
    );
    let client = Client::open(session.clone(), "/tmp".into());
    let checked = std::panic::catch_unwind(|| {
        let request = |version, action| Request {
            request_id: client.request_id(),
            expected_version: version,
            action,
        };
        let initial = client.call(request(0, Action::Inspect)).unwrap();
        let fleet = initial.layout.selected_fleet.clone().unwrap();
        let first = initial.layout.voyages[0].fleets[0].vessels[0].id.clone();
        let split = client
            .call(request(
                initial.version,
                Action::CreateContent {
                    type_id: "terminal".into(),
                    destination: voyager_contract::ContentDestination::Panel {
                        owner: voyager_contract::PanelOwner::Fleet { id: fleet },
                        insertion: voyager_contract::PanelInsertion::Beside {
                            id: first.clone(),
                            side: voyager_contract::Side::Right,
                        },
                    },
                    launch: None,
                },
            ))
            .unwrap();
        assert_eq!(split.status, Status::Applied);
        let second = split.layout.voyages[0].fleets[0].vessels[1].id.clone();
        let zoom = client
            .call(request(
                split.version,
                Action::SetPanelMaximized {
                    id: first.clone(),
                    maximized: true,
                },
            ))
            .unwrap();
        assert_eq!(zoom.status, Status::Applied);
        let wrong = client
            .scoped_call(
                Context::Vessel { id: second.clone() },
                request(
                    zoom.version,
                    Action::SetPanelMaximized {
                        id: second,
                        maximized: false,
                    },
                ),
            )
            .unwrap();
        assert_eq!(wrong.status, Status::Rejected);
        assert_eq!(
            wrong.message.as_deref(),
            Some("invalid_workspace: Panel cannot change maximization")
        );
        assert_eq!(wrong.version, zoom.version);
        assert!(
            wrong.layout.voyages[0].fleets[0]
                .maximized_placement
                .is_none()
        );
        let stale = client
            .call(request(
                split.version,
                Action::SetPanelMaximized {
                    id: first.clone(),
                    maximized: false,
                },
            ))
            .unwrap();
        assert_eq!(stale.status, Status::Rejected);
        let mut external = Core::connect(&session).unwrap();
        let stored = external.document_get("voyager-layout-v1").unwrap();
        assert_eq!(stored.version, zoom.version);
        assert_eq!(
            stored.value["voyages"][0]["fleets"][0]["maximizedPlacement"],
            serde_json::json!(first)
        );
        let mut invalid = (*zoom.layout).clone();
        invalid.voyages[0].fleets[0].maximized_placement = Some(PlacementId("missing".into()));
        external
            .document_set("voyager-layout-v1", &invalid, zoom.version)
            .unwrap();
        external.close().unwrap();
        let refused = client.call(request(zoom.version, Action::Inspect)).unwrap();
        assert_eq!(refused.status, Status::Rejected);
        assert!(!refused.fresh);
        assert_eq!(refused.layout, zoom.layout);
    });
    let mut cleanup = Core::connect(&session).unwrap();
    let stopped = cleanup.server_stop();
    cleanup.close().unwrap();
    drop(client);
    stopped.unwrap();
    checked.unwrap();
}
