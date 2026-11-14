use crate::journey::Journey;
use anyhow::{Context, Result, bail, ensure};
use globset::{Glob, GlobSetBuilder};
use serde::Deserialize;
use std::collections::BTreeSet;
use std::path::Path;
use std::process::Command;

pub const REGISTRY: &str = "tests/native/features.toml";
pub const TABLE_FILE: &str = ".agents/skills/verify/features/README.md";
const BEGIN: &str = "<!-- features:begin -->";
const END: &str = "<!-- features:end -->";

#[derive(Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum Status {
    Covered,
    PythonOnly,
    None,
}

#[derive(Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Feature {
    pub id: String,
    pub name: String,
    pub path: String,
    pub sources: Vec<String>,
    pub journeys: Vec<String>,
    pub platforms: Vec<String>,
    pub python: Vec<String>,
    pub behavior: Status,
    pub performance: Status,
    pub visual: Status,
    pub debug: Status,
}

#[derive(Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Registry {
    pub feature: Vec<Feature>,
}

pub struct Selection<'a> {
    pub feature: &'a Feature,
}

impl Status {
    fn label(self) -> &'static str {
        match self {
            Status::Covered => "covered",
            Status::PythonOnly => "python-only",
            Status::None => "none",
        }
    }
}

impl Feature {
    fn tiers(&self) -> [Status; 4] {
        [self.behavior, self.performance, self.visual, self.debug]
    }
}

impl Registry {
    pub fn parse(text: &str) -> Result<Self> {
        toml::from_str(text).context("Feature registry")
    }

    pub fn validate(
        &self,
        files: &[String],
        native: &[&str],
        python: &BTreeSet<String>,
    ) -> Result<()> {
        let mut problems = Vec::new();
        let mut seen = BTreeSet::new();
        for feature in &self.feature {
            let id = &feature.id;
            if !seen.insert(id.as_str()) {
                problems.push(format!("Duplicate feature id {id}"));
            }
            if feature.name.is_empty() || feature.path.is_empty() || feature.platforms.is_empty() {
                problems.push(format!("{id}: name, path and platforms must be filled in"));
            }
            if feature.sources.is_empty() {
                problems.push(format!("{id}: no product source globs"));
            }
            for pattern in &feature.sources {
                match Glob::new(pattern) {
                    Ok(glob) => {
                        let matcher = glob.compile_matcher();
                        if !files.iter().any(|file| matcher.is_match(file)) {
                            problems.push(format!("{id}: glob {pattern} matches no file"));
                        }
                    }
                    Err(error) => problems.push(format!("{id}: glob {pattern}: {error}")),
                }
            }
            for journey in feature
                .journeys
                .iter()
                .filter(|j| !native.contains(&j.as_str()))
            {
                problems.push(format!("{id}: unknown journey {journey}"));
            }
            for journey in feature.python.iter().filter(|j| !python.contains(*j)) {
                problems.push(format!("{id}: unknown Python journey {journey}"));
            }
            if feature.tiers().contains(&Status::Covered) && feature.journeys.is_empty() {
                problems.push(format!("{id}: a covered tier needs a native journey"));
            }
            if feature.tiers().contains(&Status::PythonOnly) && feature.python.is_empty() {
                problems.push(format!("{id}: a python-only tier needs a Python journey"));
            }
        }
        for journey in native {
            let covers = |feature: &Feature| feature.journeys.iter().any(|j| j == journey);
            if !self.feature.iter().any(covers) {
                problems.push(format!("journey {journey} covers no feature"));
            }
        }
        ensure!(problems.is_empty(), "{}", problems.join("\n"));
        Ok(())
    }

    pub fn table(&self) -> String {
        let mut table = String::from(
            "| Feature | Behavior | Performance | Visual | Debug | Native journeys | Python journeys | Platforms |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n",
        );
        let list = |items: &[String]| {
            if items.is_empty() {
                "-".to_string()
            } else {
                items.join(", ")
            }
        };
        for feature in &self.feature {
            let [behavior, performance, visual, debug] = feature.tiers().map(Status::label);
            table.push_str(&format!(
                "| {} | {behavior} | {performance} | {visual} | {debug} | {} | {} | {} |\n",
                feature.name,
                list(&feature.journeys),
                list(&feature.python),
                list(&feature.platforms),
            ));
        }
        table
    }

    pub fn counts(&self) -> String {
        let tiers = [
            ("behavior", 0),
            ("performance", 1),
            ("visual", 2),
            ("debug", 3),
        ];
        let mut lines = Vec::new();
        for (name, index) in tiers {
            let count = |status| {
                self.feature
                    .iter()
                    .filter(|f| f.tiers()[index] == status)
                    .count()
            };
            lines.push(format!(
                "{name}: covered {}, python-only {}, none {}",
                count(Status::Covered),
                count(Status::PythonOnly),
                count(Status::None)
            ));
        }
        format!("{} features\n{}", self.feature.len(), lines.join("\n"))
    }

    pub fn select(&self, changed: &[String]) -> Result<Vec<Selection<'_>>> {
        let mut picked = Vec::new();
        for feature in &self.feature {
            let mut set = GlobSetBuilder::new();
            for pattern in &feature.sources {
                set.add(Glob::new(pattern)?);
            }
            let set = set.build()?;
            if changed.iter().any(|file| set.is_match(file)) {
                picked.push(Selection { feature });
            }
        }
        Ok(picked)
    }
}

pub fn splice(readme: &str, table: &str) -> Result<String> {
    let begin = readme
        .find(BEGIN)
        .context("README lacks the features:begin marker")?;
    let end = readme
        .find(END)
        .context("README lacks the features:end marker")?;
    ensure!(begin < end, "README markers are out of order");
    Ok(format!(
        "{}{BEGIN}\n{table}{}",
        &readme[..begin],
        &readme[end..]
    ))
}

fn git(root: &Path, args: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .context("git")?;
    ensure!(
        output.status.success(),
        "git {} failed: {}",
        args.join(" "),
        String::from_utf8_lossy(&output.stderr).trim()
    );
    Ok(String::from_utf8(output.stdout)?)
}

fn python_journeys(root: &Path) -> Result<BTreeSet<String>> {
    let text = std::fs::read_to_string(root.join("tests/native/proof_native_mod_host.py"))?;
    let choices = text
        .split_once("choices=[")
        .and_then(|(_, rest)| rest.split_once(']'))
        .context("Python journey choices not found")?
        .0;
    Ok(choices
        .split('"')
        .skip(1)
        .step_by(2)
        .map(String::from)
        .collect())
}

pub fn run(args: &[String]) -> Result<i32> {
    let root = git(Path::new("."), &["rev-parse", "--show-toplevel"])?;
    let root = Path::new(root.trim());
    let registry = Registry::parse(&std::fs::read_to_string(root.join(REGISTRY))?)?;
    let files: Vec<String> = git(root, &["ls-files"])?
        .lines()
        .map(String::from)
        .collect();
    registry.validate(&files, &Journey::names(), &python_journeys(root)?)?;
    let readme_path = root.join(TABLE_FILE);
    match args {
        [] => {
            print!("{}", registry.table());
            eprintln!("{}", registry.counts());
        }
        [flag] if flag == "--check" => {
            let readme = std::fs::read_to_string(&readme_path)?;
            if splice(&readme, &registry.table())? != readme {
                bail!("{TABLE_FILE} is stale; run `voyager-verification features --write`");
            }
            println!("{TABLE_FILE} matches {REGISTRY}");
        }
        [flag] if flag == "--write" => {
            let readme = std::fs::read_to_string(&readme_path)?;
            std::fs::write(&readme_path, splice(&readme, &registry.table())?)?;
        }
        [flag, range] if flag == "--changed" => {
            ensure!(!range.starts_with('-'), "Unsupported git range {range}");
            let changed: Vec<String> = git(root, &["diff", "--name-only", range])?
                .lines()
                .map(String::from)
                .collect();
            let picked = registry.select(&changed)?;
            if picked.is_empty() {
                println!("No feature selected by {} changed files", changed.len());
            }
            for Selection { feature } in picked {
                println!(
                    "{}\tnative: {}\tpython: {}",
                    feature.id,
                    feature.journeys.join(","),
                    feature.python.join(",")
                );
            }
        }
        _ => bail!("Usage: features [--check | --write | --changed GIT_RANGE]"),
    }
    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SEED: &str = r#"
[[feature]]
id = "terminal-scrolling"
name = "Terminal scroll"
path = "Wheel through history."
sources = ["desktop/src/terminal_scroll.rs"]
journeys = ["terminal-scrolling"]
platforms = ["linux"]
python = ["terminal-scrolling"]
behavior = "covered"
performance = "none"
visual = "none"
debug = "covered"

[[feature]]
id = "notes"
name = "Notes"
path = "Type in a note."
sources = ["desktop/src/notes.rs"]
journeys = []
platforms = ["linux"]
python = ["notes"]
behavior = "python-only"
performance = "none"
visual = "none"
debug = "none"
"#;

    fn files() -> Vec<String> {
        [
            "desktop/src/terminal_scroll.rs",
            "desktop/src/notes.rs",
            "docs/a.md",
        ]
        .map(String::from)
        .to_vec()
    }

    fn python() -> BTreeSet<String> {
        ["terminal-scrolling", "notes"].map(String::from).into()
    }

    fn check(text: &str) -> Result<()> {
        Registry::parse(text)?.validate(&files(), &["terminal-scrolling"], &python())
    }

    fn failure(text: &str) -> String {
        format!("{:#}", check(text).unwrap_err())
    }

    #[test]
    fn seed_registry_is_valid() {
        check(SEED).unwrap();
    }

    #[test]
    fn unknown_journey_fails() {
        let bad = SEED.replacen(
            "journeys = [\"terminal-scrolling\"]",
            "journeys = [\"terminal-scrolling\", \"imaginary\"]",
            1,
        );
        assert!(failure(&bad).contains("imaginary"));
    }

    #[test]
    fn a_journey_that_covers_no_feature_fails() {
        let bad = SEED.replacen("journeys = [\"terminal-scrolling\"]", "journeys = []", 1);
        let bad = bad.replacen("behavior = \"covered\"", "behavior = \"python-only\"", 1);
        let bad = bad.replacen("debug = \"covered\"", "debug = \"none\"", 1);
        assert_eq!(
            failure(&bad),
            "journey terminal-scrolling covers no feature"
        );
    }

    #[test]
    fn unknown_python_journey_fails() {
        let bad = SEED.replacen("python = [\"notes\"]", "python = [\"ghost\"]", 1);
        assert!(failure(&bad).contains("ghost"));
    }

    #[test]
    fn dead_glob_fails() {
        let bad = SEED.replacen("desktop/src/notes.rs", "desktop/src/nothing_*.rs", 1);
        assert!(failure(&bad).contains("nothing_*.rs"));
    }

    #[test]
    fn duplicate_id_fails() {
        let bad = SEED.replacen("id = \"notes\"", "id = \"terminal-scrolling\"", 1);
        assert!(failure(&bad).contains("Duplicate feature id terminal-scrolling"));
    }

    #[test]
    fn covered_tier_without_journey_fails() {
        let bad = SEED.replacen("behavior = \"python-only\"", "behavior = \"covered\"", 1);
        assert!(failure(&bad).contains("notes"));
    }

    #[test]
    fn unknown_field_fails() {
        let bad = SEED.replacen("name = \"Notes\"", "name = \"Notes\"\nbogus = 1", 1);
        assert!(failure(&bad).contains("bogus"));
    }

    #[test]
    fn table_lists_every_feature_with_status() {
        let table = Registry::parse(SEED).unwrap().table();
        assert!(table.contains("| Terminal scroll | covered | none | none | covered |"));
        assert!(table.contains("| Notes | python-only | none | none | none |"));
    }

    fn readme(table: &str) -> String {
        format!("Intro\n\n{BEGIN}\n{table}{END}\n\nOutro\n")
    }

    #[test]
    fn stale_table_fails_and_fresh_passes() {
        let registry = Registry::parse(SEED).unwrap();
        let fresh = splice(&readme("old\n"), &registry.table()).unwrap();
        assert_eq!(splice(&fresh, &registry.table()).unwrap(), fresh);
        let stale = fresh.replace("| Notes | python-only", "| Notes | covered");
        assert_ne!(splice(&stale, &registry.table()).unwrap(), stale);
        assert!(splice("no markers", &registry.table()).is_err());
    }

    #[test]
    fn scroll_source_selects_terminal_scrolling() {
        let registry = Registry::parse(SEED).unwrap();
        let picked = registry
            .select(&["desktop/src/terminal_scroll.rs".to_string()])
            .unwrap();
        assert_eq!(picked.len(), 1);
        assert_eq!(picked[0].feature.id, "terminal-scrolling");
        assert_eq!(picked[0].feature.journeys, ["terminal-scrolling"]);
    }

    #[test]
    fn docs_only_diff_selects_nothing() {
        let registry = Registry::parse(SEED).unwrap();
        assert!(
            registry
                .select(&["docs/a.md".to_string()])
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn committed_registry_validates_and_table_is_current() {
        assert_eq!(run(&["--check".to_string()]).unwrap(), 0);
    }
}
