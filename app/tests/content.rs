use std::fs;
use voyager_app::content::{Owner, discover_all, open_registry};

const MANIFEST: &str = r#"{
  "contract": 1, "id": "tally", "name": "Tally", "version": 1,
  "state": {
    "schema": {"type": "object", "additionalProperties": false, "required": ["count"],
      "properties": {"count": {"type": "number"}}},
    "initial": {"count": 0}
  },
  "actions": {"copy": {"rebase": "always", "effect": [{"op": "set", "path": "count", "value": "count"}]}},
  "view": {"source": "view.vx"}
}"#;

#[test]
fn a_manifest_package_is_admitted_kept_through_a_bad_edit_and_removed_without_touching_data() {
    let profile =
        std::env::temp_dir().join(format!("voyager-manifest-owner-{}", std::process::id()));
    let _ = fs::remove_dir_all(&profile);
    let package = profile.join("vessels/tally");
    fs::create_dir_all(&package).unwrap();
    fs::write(package.join("manifest.json"), MANIFEST).unwrap();
    fs::write(package.join("view.vx"), "<column/>").unwrap();
    let mut owner = Owner::open(&profile).unwrap();
    let data = profile.join("data/instance.json");
    fs::write(&data, "kept").unwrap();
    owner.require_available("tally").unwrap();
    assert_eq!(
        owner.require_available("nothing").unwrap_err(),
        "Unsupported Vessel type"
    );
    fs::write(
        package.join("manifest.json"),
        MANIFEST.replace("\"value\": \"count\"", "\"value\": \"count == 0\""),
    )
    .unwrap();
    owner.require_available("tally").unwrap();
    let catalog = discover_all(&open_registry(profile.join("vessels"))).unwrap();
    let tally = catalog
        .types
        .iter()
        .find(|kind| kind.type_id == "tally")
        .unwrap();
    assert_eq!(tally.problems.len(), 1);
    owner.remove_package("tally").unwrap();
    assert_eq!(
        owner.require_available("tally").unwrap_err(),
        "Vessel package is removed"
    );
    assert!(!package.exists());
    owner.restore_package("tally").unwrap();
    owner.require_available("tally").unwrap();
    assert_eq!(fs::read(&data).unwrap(), b"kept");
    fs::remove_dir_all(profile).unwrap();
}
