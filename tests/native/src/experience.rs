use anyhow::{Result, ensure};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use std::collections::BTreeSet;
use std::path::Path;

pub const MODEL: &str = "tests/native/experience.toml";

#[derive(Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum Hurts {
    User,
    Developer,
}

#[derive(Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum Confidence {
    Stated,
    Inferred,
}

#[derive(Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Invariant {
    pub id: String,
    pub says: String,
    pub hurts: Hurts,
    pub source: String,
    pub features: Vec<String>,
    pub checked_by: Vec<String>,
    pub verified_by: Option<String>,
    pub confidence: Confidence,
}

#[derive(Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Envelope {
    pub id: String,
    pub fact: String,
    pub command: String,
    pub measured: String,
    pub expires: String,
    pub confidence: Confidence,
}

#[derive(Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct OutOfScope {
    pub id: String,
    pub state: String,
    pub why: String,
    pub revisit_when: String,
    pub confidence: Confidence,
}

#[derive(Debug)]
pub struct Model {
    pub invariant: Vec<Invariant>,
    pub envelope: Vec<Envelope>,
    pub out_of_scope: Vec<OutOfScope>,
}

const KINDS: [&str; 3] = ["invariant", "envelope", "out_of_scope"];

fn entries<T: DeserializeOwned>(
    table: &toml::Table,
    kind: &str,
    problems: &mut Vec<String>,
) -> Vec<T> {
    let Some(value) = table.get(kind) else {
        problems.push(format!("No [[{kind}]] entries"));
        return Vec::new();
    };
    let Some(items) = value.as_array() else {
        problems.push(format!("{kind} must be an array of tables"));
        return Vec::new();
    };
    let mut parsed = Vec::new();
    for (index, item) in items.iter().enumerate() {
        let label = item
            .get("id")
            .and_then(toml::Value::as_str)
            .map_or_else(|| format!("#{}", index + 1), String::from);
        match item.clone().try_into::<T>() {
            Ok(entry) => parsed.push(entry),
            Err(error) => problems.push(format!("{kind} {label}: {}", error.message())),
        }
    }
    parsed
}

fn filled(problems: &mut Vec<String>, kind: &str, id: &str, fields: &[(&str, &str)]) {
    for (name, text) in fields {
        if text.trim().is_empty() {
            problems.push(format!("{kind} {id}: {name} is empty"));
        }
    }
}

impl Model {
    pub fn parse(text: &str) -> Result<Self> {
        let table: toml::Table =
            toml::from_str(text).map_err(|error| anyhow::anyhow!("Experience model: {error}"))?;
        let mut problems = Vec::new();
        for key in table.keys().filter(|key| !KINDS.contains(&key.as_str())) {
            problems.push(format!("Unknown section {key}"));
        }
        let model = Model {
            invariant: entries(&table, "invariant", &mut problems),
            envelope: entries(&table, "envelope", &mut problems),
            out_of_scope: entries(&table, "out_of_scope", &mut problems),
        };
        ensure!(
            problems.is_empty(),
            "Experience model:\n{}",
            problems.join("\n")
        );
        Ok(model)
    }

    pub fn validate(&self, features: &BTreeSet<&str>, cases: &BTreeSet<String>) -> Result<()> {
        let mut problems = Vec::new();
        let mut seen = BTreeSet::new();
        let ids = self
            .invariant
            .iter()
            .map(|entry| entry.id.as_str())
            .chain(self.envelope.iter().map(|entry| entry.id.as_str()))
            .chain(self.out_of_scope.iter().map(|entry| entry.id.as_str()));
        for id in ids {
            if !seen.insert(id) {
                problems.push(format!("Duplicate id {id}"));
            }
        }
        for entry in &self.invariant {
            let id = &entry.id;
            filled(
                &mut problems,
                "invariant",
                id,
                &[("id", id), ("says", &entry.says), ("source", &entry.source)],
            );
            if entry.verified_by.as_deref().is_some_and(str::is_empty) {
                problems.push(format!("invariant {id}: verified_by is empty"));
            }
            for feature in entry
                .features
                .iter()
                .filter(|f| !features.contains(f.as_str()))
            {
                problems.push(format!("invariant {id}: unknown feature {feature}"));
            }
            for case in &entry.checked_by {
                match case.split_once(':') {
                    Some((journey, name)) if !journey.is_empty() && !name.is_empty() => {
                        if !cases.contains(case) {
                            problems.push(format!("invariant {id}: unknown case {case}"));
                        }
                    }
                    _ => problems.push(format!(
                        "invariant {id}: checked_by {case} is not journey:case"
                    )),
                }
            }
        }
        for entry in &self.envelope {
            filled(
                &mut problems,
                "envelope",
                &entry.id,
                &[
                    ("id", &entry.id),
                    ("fact", &entry.fact),
                    ("command", &entry.command),
                    ("expires", &entry.expires),
                ],
            );
        }
        for entry in &self.out_of_scope {
            filled(
                &mut problems,
                "out_of_scope",
                &entry.id,
                &[
                    ("id", &entry.id),
                    ("state", &entry.state),
                    ("why", &entry.why),
                    ("revisit_when", &entry.revisit_when),
                ],
            );
        }
        ensure!(problems.is_empty(), "{}", problems.join("\n"));
        Ok(())
    }

    pub fn counts(&self) -> String {
        let unmeasured: Vec<&str> = self
            .envelope
            .iter()
            .filter(|entry| entry.measured.trim().is_empty())
            .map(|entry| entry.id.as_str())
            .collect();
        let confidences = self
            .invariant
            .iter()
            .map(|entry| entry.confidence)
            .chain(self.envelope.iter().map(|entry| entry.confidence))
            .chain(self.out_of_scope.iter().map(|entry| entry.confidence));
        let stated = confidences.filter(|c| *c == Confidence::Stated).count();
        let hurt = |who| {
            self.invariant
                .iter()
                .filter(|entry| entry.hurts == who)
                .count()
        };
        format!(
            "{} invariants ({} hurt a user, {} a developer), {} envelope entries, {} out of scope, {stated} stated\nenvelope entries with no measurement ({}): {}",
            self.invariant.len(),
            hurt(Hurts::User),
            hurt(Hurts::Developer),
            self.envelope.len(),
            self.out_of_scope.len(),
            unmeasured.len(),
            unmeasured.join(", ")
        )
    }
}

pub fn load(root: &Path, features: &BTreeSet<&str>, cases: &BTreeSet<String>) -> Result<Model> {
    let text = std::fs::read_to_string(root.join(MODEL))?;
    let model = Model::parse(&text)?;
    model.validate(features, cases)?;
    Ok(model)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SEED: &str = r#"
[[invariant]]
id = "keep"
says = "Quit keeps programs."
hurts = "user"
source = "AGENTS.md"
features = ["vessels"]
checked_by = ["workspace:rename-fleet-enter"]
confidence = "stated"

[[invariant]]
id = "tidy"
says = "Tests leave nothing."
hurts = "developer"
source = "a verdict"
features = []
checked_by = []
verified_by = "a person"
confidence = "inferred"

[[envelope]]
id = "latency"
fact = "Reply time."
command = "Time it."
measured = ""
expires = "When Core changes"
confidence = "inferred"

[[out_of_scope]]
id = "other-os"
state = "Another platform."
why = "Linux only."
revisit_when = "A port starts."
confidence = "stated"
"#;

    fn features() -> BTreeSet<&'static str> {
        ["vessels", "notes"].into()
    }

    fn cases() -> BTreeSet<String> {
        ["workspace:rename-fleet-enter"].map(String::from).into()
    }

    fn failure(text: &str) -> String {
        let model = match Model::parse(text) {
            Ok(model) => model,
            Err(error) => return format!("{error:#}"),
        };
        format!("{:#}", model.validate(&features(), &cases()).unwrap_err())
    }

    #[test]
    fn seed_model_is_valid() {
        let model = Model::parse(SEED).unwrap();
        model.validate(&features(), &cases()).unwrap();
        assert!(
            model
                .counts()
                .contains("envelope entries with no measurement (1): latency")
        );
    }

    #[test]
    fn duplicate_id_names_the_entry() {
        let bad = SEED.replacen("id = \"tidy\"", "id = \"keep\"", 1);
        assert!(failure(&bad).contains("Duplicate id keep"));
        let across = SEED.replacen("id = \"other-os\"", "id = \"latency\"", 1);
        assert!(failure(&across).contains("Duplicate id latency"));
    }

    #[test]
    fn unknown_feature_names_the_entry() {
        let bad = SEED.replacen("[\"vessels\"]", "[\"vessels\", \"ghost\"]", 1);
        assert_eq!(failure(&bad), "invariant keep: unknown feature ghost");
    }

    #[test]
    fn unknown_case_names_the_entry() {
        let bad = SEED.replacen("workspace:rename-fleet-enter", "workspace:ghost", 1);
        assert_eq!(
            failure(&bad),
            "invariant keep: unknown case workspace:ghost"
        );
        let shapeless = SEED.replacen("workspace:rename-fleet-enter", "ghost", 1);
        assert_eq!(
            failure(&shapeless),
            "invariant keep: checked_by ghost is not journey:case"
        );
    }

    #[test]
    fn unknown_field_names_the_entry() {
        let bad = SEED.replacen(
            "source = \"AGENTS.md\"",
            "source = \"AGENTS.md\"\nbogus = 1",
            1,
        );
        let message = failure(&bad);
        assert!(message.contains("invariant keep"), "{message}");
        assert!(message.contains("bogus"), "{message}");
    }

    #[test]
    fn hurts_and_confidence_are_closed_sets() {
        let bad = SEED.replacen("hurts = \"user\"", "hurts = \"everyone\"", 1);
        assert!(failure(&bad).contains("invariant keep"));
        let bad = SEED.replacen("confidence = \"stated\"", "confidence = \"guessed\"", 1);
        assert!(failure(&bad).contains("invariant keep"));
    }

    #[test]
    fn empty_text_fails_except_measured() {
        let bad = SEED.replacen("says = \"Quit keeps programs.\"", "says = \"\"", 1);
        assert_eq!(failure(&bad), "invariant keep: says is empty");
        let bad = SEED.replacen("verified_by = \"a person\"", "verified_by = \"\"", 1);
        assert_eq!(failure(&bad), "invariant tidy: verified_by is empty");
        let bad = SEED.replacen("fact = \"Reply time.\"", "fact = \"\"", 1);
        assert_eq!(failure(&bad), "envelope latency: fact is empty");
    }

    #[test]
    fn every_problem_is_reported_together() {
        let bad = SEED.replacen("[\"vessels\"]", "[\"ghost\"]", 1).replacen(
            "workspace:rename-fleet-enter",
            "workspace:ghost",
            1,
        );
        assert_eq!(failure(&bad).lines().count(), 2);
    }

    #[test]
    fn committed_model_passes() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let text = std::fs::read_to_string(root.join(crate::features::REGISTRY)).unwrap();
        let registry = crate::features::Registry::parse(&text).unwrap();
        let ids: BTreeSet<&str> = registry.feature.iter().map(|f| f.id.as_str()).collect();
        let cases = crate::journey::Journey::case_ids();
        load(&root, &ids, &cases).unwrap();
    }
}
