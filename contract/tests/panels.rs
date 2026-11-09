use serde_json::json;
use voyager_contract::{Action, Fleet, SavedLayout};

#[test]
fn projected_panel_names_are_required_while_legacy_data_still_decodes() {
    let schema = serde_json::to_value(schemars::schema_for!(voyager_contract::Vessel)).unwrap();
    assert!(
        schema["required"]
            .as_array()
            .unwrap()
            .contains(&json!("name"))
    );
    let old: voyager_contract::Vessel =
        serde_json::from_value(json!({"id":"p1","content":"c1","name":null})).unwrap();
    assert!(old.name.is_empty());
}

#[test]
fn shared_panel_requests_and_empty_roots_have_one_wire_shape() {
    for action in [
        json!({"operation":"create-content","typeId":"notes","destination":{"kind":"panel","owner":{"kind":"portals","voyage":"voyage-1"},"insertion":{"kind":"beside","id":"p1","side":"left"}}}),
        json!({"operation":"resize-panel-split","owner":{"kind":"fleet","id":"fleet-1"},"path":[],"share":3700}),
        json!({"operation":"set-panel-hidden","id":"p1","hidden":true}),
    ] {
        assert!(
            serde_json::from_value::<Action>(action.clone()).is_ok(),
            "{action}"
        );
    }
    let fleet: Fleet =
        serde_json::from_value(json!({"id":"fleet-1","name":"Empty","vessels":[],"root":null}))
            .unwrap();
    assert_eq!(serde_json::to_value(fleet).unwrap()["root"], json!(null));
}

#[test]
fn saved_fleet_data_normalizes_without_accepting_old_action_aliases() {
    let saved: SavedLayout = serde_json::from_value(
        json!({"fleet":"fleet-1","name":"Old","root":{"kind":"leaf","placement":"p1"}}),
    )
    .unwrap();
    assert_eq!(
        serde_json::to_value(saved).unwrap()["owner"],
        json!({"kind":"fleet","id":"fleet-1"})
    );
    assert!(
        serde_json::from_value::<Action>(
            json!({"operation":"split","fleet":"fleet-1","after":"p1","axis":"horizontal"})
        )
        .is_err()
    );
}
