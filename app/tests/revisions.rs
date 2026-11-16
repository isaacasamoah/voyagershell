use voyager_app::{client::Client, core::Core};
use voyager_contract::{Action, Outcome, RenameTarget, Request, Response};

#[test]
fn a_plan_survives_a_change_to_another_part_and_a_stale_edit_to_its_part_is_refused() {
    let session = format!("voyager-revisions-test-{}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let call = |action, expected_version| -> Response {
            client
                .call(Request {
                    request_id: client.request_id(),
                    action,
                    expected_version,
                })
                .unwrap()
        };
        let planned = call(Action::Inspect, 0);
        let voyage = planned.layout.voyages[0].id.clone();
        let first = planned.layout.voyages[0].fleets[0].id.clone();
        let vessel = planned.layout.voyages[0].fleets[0].placements[0].id.clone();
        let created = call(
            Action::CreateFleet {
                voyage,
                name: "Made by a click".into(),
            },
            planned.version,
        );
        assert_eq!(created.status, Outcome::Applied);
        assert!(created.version > planned.version);
        let clicked = call(Action::SelectFleet { id: first }, created.version);
        assert_eq!(clicked.status, Outcome::Applied);
        let target = RenameTarget::Vessel { id: vessel };
        let renamed = call(
            Action::Rename {
                target: target.clone(),
                name: "Planned".into(),
            },
            planned.version,
        );
        assert_eq!(renamed.status, Outcome::Applied, "{:?}", renamed.message);
        assert_eq!(renamed.layout.voyages[0].fleets.len(), 2);
        let stale = call(
            Action::Rename {
                target,
                name: "Stale".into(),
            },
            planned.version,
        );
        assert_eq!(stale.status, Outcome::Refused);
        assert_eq!(stale.version, renamed.version);
        assert_eq!(
            stale.layout.voyages[0].fleets[0].placements[0].name,
            "Planned"
        );
    }));
    let mut core = Core::connect(&session).unwrap();
    let stopped = core.server_stop();
    core.close().unwrap();
    checked.unwrap();
    assert!(stopped.is_ok());
}
