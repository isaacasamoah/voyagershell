use crate::system;
use anyhow::{Context, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

pub const FILE: &str = "verdict.json";
const SCHEMA: u32 = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Head,
    Trunk,
    Control,
    Mutant,
}

impl Role {
    pub fn parse(text: &str) -> Result<Self> {
        serde_json::from_value(Value::String(text.to_owned()))
            .with_context(|| format!("--role is head, trunk, control or mutant, not {text}"))
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Input {
    pub pr: u64,
    pub head: String,
    pub runs: Vec<RunInput>,
    #[serde(default)]
    pub gates: Vec<Gate>,
    #[serde(default)]
    pub mutants: Vec<Mutant>,
    #[serde(default)]
    pub perf: Vec<PerfPair>,
    #[serde(default)]
    pub media: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunInput {
    pub path: String,
    pub role: Option<Role>,
    #[serde(default)]
    pub partial: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Gate {
    pub name: String,
    pub result: GateResult,
    pub log: String,
}

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GateResult {
    Passed,
    Failed,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Mutant {
    pub name: String,
    pub run: Option<String>,
    pub log: Option<String>,
    pub caught: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PerfPair {
    pub metric: String,
    pub trunk: String,
    pub head: String,
}

#[derive(Serialize)]
struct Run {
    path: String,
    role: Role,
    #[serde(rename = "roleFrom")]
    role_from: &'static str,
    journey: String,
    #[serde(rename = "runtimeResult")]
    runtime_result: String,
    sha256: String,
    checks: String,
    partial: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    selection: Option<Value>,
}

#[derive(Serialize)]
struct Manifest {
    schema: u32,
    pr: u64,
    head: String,
    runs: Vec<Run>,
    gates: Vec<Gate>,
    mutants: Vec<Mutant>,
    perf: Vec<PerfPair>,
    media: Vec<String>,
}

fn inside(folder: &Path, cited: &str) -> Result<PathBuf> {
    let relative = Path::new(cited);
    ensure!(
        !cited.is_empty()
            && relative
                .components()
                .all(|part| matches!(part, Component::Normal(_))),
        "{cited} is not a path inside the verdict folder"
    );
    Ok(folder.join(relative))
}

fn cite(folder: &Path, cited: &str) -> Result<()> {
    let path = inside(folder, cited)?;
    ensure!(
        path.exists(),
        "The manifest cites {cited}, which does not exist"
    );
    Ok(())
}

fn normal(cited: &str) -> Result<String> {
    inside(Path::new(""), cited).map(|path| {
        path.components()
            .map(|part| part.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/")
    })
}

fn listed_checks(folder: &Path, found: &mut Vec<PathBuf>) -> Result<()> {
    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        if kind.is_dir() {
            listed_checks(&entry.path(), found)?;
        } else if kind.is_file() && entry.file_name() == "checks.json" {
            found.push(folder.to_path_buf());
        }
    }
    Ok(())
}

fn field(checks: &Value, name: &str, at: &str) -> Result<String> {
    checks
        .get(name)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .with_context(|| format!("{at}/checks.json has no {name}"))
}

fn run(folder: &Path, input: &RunInput) -> Result<Run> {
    let checks_path = format!("{}/checks.json", input.path);
    cite(folder, &checks_path)?;
    let checks: Value = serde_json::from_slice(&fs::read(inside(folder, &checks_path)?)?)
        .with_context(|| format!("{checks_path} is not JSON"))?;
    let recorded = match checks.get("role") {
        None | Some(Value::Null) => None,
        Some(value) => Some(
            serde_json::from_value::<Role>(value.clone())
                .with_context(|| format!("{checks_path} has an unknown role"))?,
        ),
    };
    let (role, role_from) = match (recorded, input.role) {
        (Some(recorded), Some(declared)) => {
            ensure!(
                recorded == declared,
                "{checks_path} records role {recorded:?} but the input declares {declared:?}"
            );
            (recorded, "checks")
        }
        (Some(recorded), None) => (recorded, "checks"),
        (None, Some(declared)) => (declared, "declared"),
        (None, None) => bail!("Run {} has no role", input.path),
    };
    let selection = checks.get("selection").filter(|value| !value.is_null());
    let partial = selection
        .and_then(|value| value.get("partial"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    ensure!(
        partial == input.partial,
        "{checks_path} records a {} run, but the input declares it {}; a partial run must be listed with \"partial\": true and is never a full pass",
        if partial { "partial" } else { "full" },
        if input.partial { "partial" } else { "full" }
    );
    Ok(Run {
        partial,
        selection: partial.then(|| selection.cloned()).flatten(),
        journey: field(&checks, "journey", &input.path)?,
        runtime_result: field(&checks, "runtimeResult", &input.path)?,
        sha256: field(&checks, "sha256", &input.path)?,
        path: normal(&input.path)?,
        role,
        role_from,
        checks: checks_path,
    })
}

fn role_of<'a>(runs: &'a [Run], path: &str, wanted: Role, by: &str) -> Result<&'a Run> {
    let found = runs
        .iter()
        .find(|run| run.path == path)
        .with_context(|| format!("{by} cites run {path}, which the manifest does not list"))?;
    ensure!(
        found.role == wanted,
        "{by} cites run {path} as {wanted:?}, but its role is {:?}",
        found.role
    );
    Ok(found)
}

pub fn build(folder: &Path, input: Input) -> Result<Value> {
    let runs = input
        .runs
        .iter()
        .map(|item| run(folder, item))
        .collect::<Result<Vec<_>>>()?;
    let mut seen = BTreeMap::new();
    for item in &runs {
        let resolved = fs::canonicalize(folder.join(&item.path))?;
        ensure!(
            seen.insert(resolved, ()).is_none(),
            "Run {} is listed twice",
            item.path
        );
    }
    let mut found = Vec::new();
    listed_checks(folder, &mut found)?;
    for run_folder in found {
        let resolved = fs::canonicalize(&run_folder)?;
        ensure!(
            seen.contains_key(&resolved),
            "{} holds a checks.json that the input does not list",
            run_folder
                .strip_prefix(folder)
                .unwrap_or(&run_folder)
                .display()
        );
    }
    for gate in &input.gates {
        cite(folder, &gate.log)?;
    }
    for mutant in &input.mutants {
        ensure!(
            mutant.run.is_some() || mutant.log.is_some(),
            "Mutant {} cites neither a run nor a log",
            mutant.name
        );
        if let Some(path) = &mutant.run {
            let cited = role_of(
                &runs,
                &normal(path)?,
                Role::Mutant,
                &format!("Mutant {}", mutant.name),
            )?;
            let result = cited.runtime_result.as_str();
            ensure!(
                result == "passed" || result == "failed",
                "Mutant {} cites run {path}, which ended {result}, so it is neither caught nor missed",
                mutant.name
            );
            ensure!(
                mutant.caught == (result == "failed"),
                "Mutant {} says caught {}, but its run {path} ended {result}",
                mutant.name,
                mutant.caught
            );
        }
        if let Some(log) = &mutant.log {
            cite(folder, log)?;
        }
    }
    for pair in &input.perf {
        role_of(
            &runs,
            &normal(&pair.trunk)?,
            Role::Trunk,
            &format!("Perf {}", pair.metric),
        )?;
        role_of(
            &runs,
            &normal(&pair.head)?,
            Role::Head,
            &format!("Perf {}", pair.metric),
        )?;
    }
    for media in &input.media {
        cite(folder, media)?;
    }
    Ok(serde_json::to_value(Manifest {
        schema: SCHEMA,
        pr: input.pr,
        head: input.head,
        runs,
        gates: input.gates,
        mutants: input.mutants,
        perf: input.perf,
        media: input.media,
    })?)
}

pub fn write(folder: &Path, input_file: &Path) -> Result<PathBuf> {
    let input: Input = serde_json::from_slice(
        &fs::read(input_file)
            .with_context(|| format!("Manifest input {} is not readable", input_file.display()))?,
    )
    .context("Manifest input is not valid")?;
    let manifest = build(folder, input)?;
    let target = folder.join(FILE);
    system::save(&target, &manifest)?;
    Ok(target)
}

pub fn run_command(args: &[String]) -> Result<i32> {
    ensure!(
        args.len() == 4 && args[0] == "--folder" && args[2] == "--input",
        "manifest --folder VERDICT_FOLDER --input INPUT_JSON"
    );
    let folder = fs::canonicalize(&args[1]).context("Verdict folder")?;
    println!("{}", write(&folder, Path::new(&args[3]))?.display());
    Ok(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::Scratch;
    use serde_json::json;

    fn checks(folder: &Path, path: &str, role: Option<&str>) {
        let run = folder.join(path);
        fs::create_dir_all(&run).unwrap();
        let mut value = json!({"journey":"quit-restore","runtimeResult":"passed","sha256":"ab"});
        if let Some(role) = role {
            value["role"] = json!(role);
        }
        fs::write(run.join("checks.json"), value.to_string()).unwrap();
    }

    fn input(value: Value) -> Input {
        serde_json::from_value(value).unwrap()
    }

    #[test]
    fn a_run_with_no_role_anywhere_is_refused() {
        let scratch = Scratch::new("manifest").unwrap();
        checks(scratch.path(), "head-1", None);
        let error = build(
            scratch.path(),
            input(json!({"pr":1,"head":"h","runs":[{"path":"head-1"}]})),
        )
        .unwrap_err();
        assert!(format!("{error:#}").contains("has no role"));
    }

    fn partial_checks(folder: &Path, path: &str) {
        let run = folder.join(path);
        fs::create_dir_all(&run).unwrap();
        let value = json!({"journey":"socket-dock","runtimeResult":"passed","sha256":"ab","role":"head","selection":{"partial":true,"picked":["redock-takes-keyboard"],"included":["socket-dock-takes-keyboard"],"leftOut":["reread-keeps-clicked-pane"]}});
        fs::write(run.join("checks.json"), value.to_string()).unwrap();
    }

    #[test]
    fn a_partial_run_is_refused_unless_the_input_declares_it_partial() {
        let scratch = Scratch::new("manifest").unwrap();
        partial_checks(scratch.path(), "head-1");
        let error = build(
            scratch.path(),
            input(json!({"pr":1,"head":"h","runs":[{"path":"head-1"}]})),
        )
        .unwrap_err();
        assert!(format!("{error:#}").contains("partial run must be listed"));
        let manifest = build(
            scratch.path(),
            input(json!({"pr":1,"head":"h","runs":[{"path":"head-1","partial":true}]})),
        )
        .unwrap();
        assert_eq!(manifest["runs"][0]["partial"], true);
        assert_eq!(
            manifest["runs"][0]["selection"]["leftOut"],
            json!(["reread-keeps-clicked-pane"])
        );
    }

    #[test]
    fn a_full_run_declared_partial_is_refused() {
        let scratch = Scratch::new("manifest").unwrap();
        checks(scratch.path(), "head-1", Some("head"));
        let error = build(
            scratch.path(),
            input(json!({"pr":1,"head":"h","runs":[{"path":"head-1","partial":true}]})),
        )
        .unwrap_err();
        assert!(format!("{error:#}").contains("records a full run"));
    }

    #[test]
    fn a_run_with_a_role_is_listed_with_where_the_role_came_from() {
        let scratch = Scratch::new("manifest").unwrap();
        checks(scratch.path(), "head-1", Some("head"));
        checks(scratch.path(), "old", None);
        let manifest = build(
            scratch.path(),
            input(
                json!({"pr":1,"head":"h","runs":[{"path":"head-1"},{"path":"old","role":"trunk"}]}),
            ),
        )
        .unwrap();
        assert_eq!(manifest["runs"][0]["role"], "head");
        assert_eq!(manifest["runs"][0]["roleFrom"], "checks");
        assert_eq!(manifest["runs"][1]["role"], "trunk");
        assert_eq!(manifest["runs"][1]["roleFrom"], "declared");
    }

    #[test]
    fn a_declared_role_that_contradicts_checks_is_refused() {
        let scratch = Scratch::new("manifest").unwrap();
        checks(scratch.path(), "head-1", Some("head"));
        let error = build(
            scratch.path(),
            input(json!({"pr":1,"head":"h","runs":[{"path":"head-1","role":"control"}]})),
        )
        .unwrap_err();
        assert!(format!("{error:#}").contains("records role"));
    }

    #[test]
    fn a_cited_file_that_does_not_exist_is_refused() {
        let scratch = Scratch::new("manifest").unwrap();
        checks(scratch.path(), "head-1", Some("head"));
        for extra in [
            json!({"media":["missing.png"]}),
            json!({"gates":[{"name":"fmt","result":"passed","log":"missing.log"}]}),
            json!({"mutants":[{"name":"m","log":"missing.log","caught":true}]}),
        ] {
            let mut value = json!({"pr":1,"head":"h","runs":[{"path":"head-1"}]});
            value
                .as_object_mut()
                .unwrap()
                .extend(extra.as_object().unwrap().clone());
            let error = build(scratch.path(), input(value)).unwrap_err();
            assert!(format!("{error:#}").contains("does not exist"), "{error:#}");
        }
        let error = build(
            scratch.path(),
            input(json!({"pr":1,"head":"h","runs":[{"path":"gone","role":"head"}]})),
        )
        .unwrap_err();
        assert!(format!("{error:#}").contains("does not exist"));
    }

    #[test]
    fn a_path_outside_the_folder_is_refused() {
        let scratch = Scratch::new("manifest").unwrap();
        checks(scratch.path(), "head-1", Some("head"));
        for media in ["../x.png", "/etc/passwd", ""] {
            let error = build(
                scratch.path(),
                input(json!({"pr":1,"head":"h","runs":[{"path":"head-1"}],"media":[media]})),
            )
            .unwrap_err();
            assert!(
                format!("{error:#}").contains("not a path inside"),
                "{media}"
            );
        }
    }

    #[test]
    fn mutants_and_perf_pairs_must_cite_runs_of_the_right_role() {
        let scratch = Scratch::new("manifest").unwrap();
        checks(scratch.path(), "head-1", Some("head"));
        checks(scratch.path(), "trunk-1", Some("trunk"));
        result(scratch.path(), "mut-1", "mutant", "failed");
        let runs = json!([{"path":"head-1"},{"path":"trunk-1"},{"path":"mut-1"}]);
        let good = build(
            scratch.path(),
            input(json!({"pr":1,"head":"h","runs":runs,
                "mutants":[{"name":"m","run":"mut-1","caught":true}],
                "perf":[{"metric":"seconds","trunk":"trunk-1","head":"head-1"}]})),
        )
        .unwrap();
        assert_eq!(good["mutants"][0]["run"], "mut-1");
        for bad in [
            json!({"mutants":[{"name":"m","run":"head-1","caught":true}]}),
            json!({"perf":[{"metric":"s","trunk":"head-1","head":"head-1"}]}),
            json!({"mutants":[{"name":"m","run":"nowhere","caught":true}]}),
        ] {
            let mut value = json!({"pr":1,"head":"h","runs":runs});
            value
                .as_object_mut()
                .unwrap()
                .extend(bad.as_object().unwrap().clone());
            assert!(build(scratch.path(), input(value)).is_err());
        }
    }

    #[test]
    fn the_writer_saves_verdict_json_beside_the_runs() {
        let scratch = Scratch::new("manifest").unwrap();
        checks(scratch.path(), "head-1", Some("head"));
        let file = scratch.path().join("input.json");
        fs::write(
            &file,
            json!({"pr":1,"head":"h","runs":[{"path":"head-1"}]}).to_string(),
        )
        .unwrap();
        let written = write(scratch.path(), &file).unwrap();
        let saved: Value = serde_json::from_slice(&fs::read(written).unwrap()).unwrap();
        assert_eq!(saved["schema"], 1);
        assert_eq!(saved["runs"][0]["role"], "head");
    }

    fn result(folder: &Path, path: &str, role: &str, result: &str) {
        checks(folder, path, Some(role));
        let file = folder.join(path).join("checks.json");
        let mut value: Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
        value["runtimeResult"] = json!(result);
        fs::write(file, value.to_string()).unwrap();
    }

    #[test]
    fn a_mutant_is_caught_only_when_its_run_failed() {
        let scratch = Scratch::new("manifest").unwrap();
        result(scratch.path(), "mut-pass", "mutant", "passed");
        result(scratch.path(), "mut-fail", "mutant", "failed");
        result(scratch.path(), "mut-open", "mutant", "inconclusive");
        let with = |run: &str, caught: bool| {
            build(
                scratch.path(),
                input(json!({"pr":1,"head":"h",
                    "runs":[{"path":"mut-pass"},{"path":"mut-fail"},{"path":"mut-open"}],
                    "mutants":[{"name":"m","run":run,"caught":caught}]})),
            )
        };
        assert!(with("mut-fail", true).is_ok());
        assert!(with("mut-pass", false).is_ok());
        assert!(with("mut-pass", true).is_err());
        assert!(with("mut-fail", false).is_err());
        assert!(with("mut-open", true).is_err());
        assert!(with("mut-open", false).is_err());
    }

    #[test]
    fn one_folder_listed_two_ways_is_one_run() {
        let scratch = Scratch::new("manifest").unwrap();
        result(scratch.path(), "head-pass", "head", "passed");
        let error = build(
            scratch.path(),
            input(json!({"pr":1,"head":"h","runs":[{"path":"head-pass"},{"path":"head-pass/"}]})),
        )
        .unwrap_err();
        assert!(format!("{error:#}").contains("twice"), "{error:#}");
    }

    #[test]
    fn a_run_in_the_folder_that_the_input_omits_is_refused() {
        let scratch = Scratch::new("manifest").unwrap();
        result(scratch.path(), "head-pass", "head", "passed");
        result(scratch.path(), "deep/head-fail", "head", "failed");
        let error = build(
            scratch.path(),
            input(json!({"pr":1,"head":"h","runs":[{"path":"head-pass"}]})),
        )
        .unwrap_err();
        assert!(format!("{error:#}").contains("deep/head-fail"), "{error:#}");
        assert!(
            build(
                scratch.path(),
                input(json!({"pr":1,"head":"h","runs":[{"path":"head-pass"},{"path":"deep/head-fail"}]})),
            )
            .is_ok()
        );
    }

    #[test]
    fn roles_parse_and_unknown_ones_are_refused() {
        assert_eq!(Role::parse("mutant").unwrap(), Role::Mutant);
        assert!(Role::parse("candidate").is_err());
    }
}
