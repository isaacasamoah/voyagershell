use super::{check::Environment, read::load};
use std::sync::LazyLock;
use voyager_contract::content::Manifest;

const SOURCES: [&str; 2] = [
    include_str!("../../../../content/types/terminal.json"),
    include_str!("../../../../content/types/agent.json"),
];

static MANIFESTS: LazyLock<Vec<Manifest>> = LazyLock::new(|| {
    let environment = Environment {
        exists: &|_| true,
        reserved: &|_| false,
    };
    SOURCES
        .iter()
        .map(|source| {
            load(source.as_bytes(), &environment).unwrap_or_else(|problems| {
                panic!(
                    "A bundled Vessel type manifest is invalid: {}",
                    problems
                        .iter()
                        .map(ToString::to_string)
                        .collect::<Vec<_>>()
                        .join("; ")
                )
            })
        })
        .collect()
});

pub(crate) fn find(type_id: &str) -> Option<&'static Manifest> {
    MANIFESTS.iter().find(|manifest| manifest.id == type_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use voyager_contract::content::Toggle;

    #[test]
    fn the_terminal_and_agent_manifests_pass_the_checker_and_declare_their_defaults() {
        let ids: Vec<&str> = MANIFESTS
            .iter()
            .map(|manifest| manifest.id.as_str())
            .collect();
        assert_eq!(ids, ["terminal", "agent"]);
        for manifest in MANIFESTS.iter() {
            assert!(
                !manifest.orbit.is_empty(),
                "{} declares an orbit",
                manifest.id
            );
            let screen = manifest
                .dock
                .iter()
                .find(|entry| entry.id == "screen")
                .expect("the screen dock entry is declared");
            assert_eq!(
                screen.default,
                Toggle::Off,
                "{} reads nothing until the user agrees",
                manifest.id
            );
        }
    }

    #[test]
    fn a_broken_bundled_manifest_is_listed_with_every_problem() {
        let mut broken: serde_json::Value =
            serde_json::from_str(SOURCES[1]).expect("the agent manifest is JSON");
        broken["dock"][0]["read"] = serde_json::json!("scren");
        broken["orbit"][0]["run"] = serde_json::json!({"action": "missing"});
        let environment = Environment {
            exists: &|_| true,
            reserved: &|_| false,
        };
        let problems = load(broken.to_string().as_bytes(), &environment).unwrap_err();
        assert_eq!(problems.len(), 2, "{problems:?}");
    }
}
