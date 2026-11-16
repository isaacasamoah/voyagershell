use voyager_contract::Action;
#[test]
fn navigation_saves_without_a_structure_version_and_reopens_the_last_fleet() {
    use voyager_app::{client::Client, core::Core};
    use voyager_contract::{Layout, Outcome, Request};
    let session = format!("voyager-navigation-test-{}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let call = |action, expected_version| {
            client
                .call(Request {
                    request_id: client.request_id(),
                    action,
                    expected_version,
                })
                .unwrap()
        };
        let stored = || -> (serde_json::Value, u64) {
            let mut core = Core::connect(&session).unwrap();
            let document = core.document_get("voyager-layout-v2").unwrap();
            core.close().unwrap();
            (document.value, document.version)
        };
        let structure = |value: &serde_json::Value| {
            let mut value = value.clone();
            let document = value.as_object_mut().unwrap();
            for key in [
                "selectedVoyage",
                "selectedFleet",
                "context",
                "view",
                "navigation",
            ] {
                document.remove(key);
            }
            value
        };
        let initial = call(Action::Inspect, 0);
        let a = initial.layout.voyages[0].id.clone();
        let first = initial.layout.voyages[0].fleets[0].id.clone();
        let second = call(
            Action::CreateFleet {
                voyage: a.clone(),
                name: "Second".into(),
            },
            initial.version,
        );
        let second_fleet = second.layout.selected_fleet.clone().unwrap();
        let vessel = second.layout.voyages[0].fleets[1].placements[0].id.clone();
        let b = call(
            Action::CreateVoyage {
                name: "B".into(),
                cwd: "/tmp".into(),
            },
            second.version,
        );
        let built = b.version;
        let (before_value, before_document) = stored();
        let returned = call(Action::SelectVoyage { id: a.clone() }, built);
        assert_eq!(returned.status, Outcome::Applied);
        assert_eq!(returned.version, built);
        assert_eq!(returned.layout.selected_fleet.as_ref(), Some(&second_fleet));
        let focused = call(Action::FocusVessel { id: vessel.clone() }, built);
        assert_eq!(focused.status, Outcome::Applied);
        assert_eq!(focused.version, built);
        let away = call(
            Action::SelectVoyage {
                id: b.layout.voyages[1].id.clone(),
            },
            built,
        );
        let back = call(Action::SelectVoyage { id: a.clone() }, built);
        assert_eq!(away.version, built);
        assert_eq!(back.layout.selected_fleet.as_ref(), Some(&second_fleet));
        let (after_value, after_document) = stored();
        assert!(after_document > before_document);
        assert_eq!(structure(&before_value), structure(&after_value));
        let entry = &after_value["navigation"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["voyage"] == serde_json::json!(a.0))
            .unwrap()
            .clone();
        assert_eq!(entry["fleet"], serde_json::json!(second_fleet.0));
        assert_eq!(entry["vessel"], serde_json::json!(vessel.0));
        let renamed = call(
            Action::Rename {
                target: voyager_contract::RenameTarget::Fleet {
                    id: second_fleet.clone(),
                },
                name: "Renamed".into(),
            },
            built,
        );
        assert_eq!(renamed.status, Outcome::Applied);
        assert!(renamed.version > built);
        let relaunched = Client::open(session.clone(), "/tmp".into());
        let reopened = relaunched
            .call(Request {
                request_id: relaunched.request_id(),
                action: Action::Inspect,
                expected_version: 0,
            })
            .unwrap();
        drop(relaunched);
        assert_eq!(reopened.layout.selected_fleet.as_ref(), Some(&second_fleet));
        let parsed: Layout = serde_json::from_value(after_value).unwrap();
        assert_eq!(parsed.navigation, reopened.layout.navigation);
        let current = call(Action::Inspect, 0);
        let closed = call(
            Action::CloseFleet {
                id: second_fleet.clone(),
            },
            current.version,
        );
        assert_eq!(closed.status, Outcome::Applied);
        call(
            Action::SelectVoyage {
                id: b.layout.voyages[1].id.clone(),
            },
            closed.version,
        );
        let fallback = call(Action::SelectVoyage { id: a }, closed.version);
        assert_eq!(fallback.layout.selected_fleet.as_ref(), Some(&first));
        let stale_click = call(Action::SelectFleet { id: first }, built);
        assert_eq!(stale_click.status, Outcome::Applied);
        assert_eq!(stale_click.version, closed.version);
        let stale_edit = call(Action::SetSidebar { collapsed: true }, built);
        assert_eq!(stale_edit.status, Outcome::Refused);
    }));
    let mut core = Core::connect(&session).unwrap();
    let stopped = core.server_stop();
    core.close().unwrap();
    checked.unwrap();
    assert!(stopped.is_ok());
}
