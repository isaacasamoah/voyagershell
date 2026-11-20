use super::{
    check::{self, Environment},
    problem::Problem,
};
use serde::de::DeserializeOwned;
use serde_json::Value;
use voyager_contract::content::Manifest;

const SECTIONS: &[&str] = &[
    "contract",
    "id",
    "name",
    "version",
    "state",
    "local",
    "concurrency",
    "actions",
    "view",
    "lifecycle",
    "presence",
    "orbit",
    "dock",
    "backend",
];
const REQUIRED: &[&str] = &[
    "contract", "id", "name", "version", "state", "actions", "view",
];
pub(crate) fn load(bytes: &[u8], environment: &Environment) -> Result<Manifest, Vec<Problem>> {
    let value: Value = serde_json::from_slice(bytes)
        .map_err(|error| vec![Problem::new("manifest", format!("not valid JSON: {error}"))])?;
    let manifest = read(&value)?;
    let problems = check::check(&manifest, environment);
    if problems.is_empty() {
        Ok(manifest)
    } else {
        Err(problems)
    }
}

fn section<T: DeserializeOwned>(
    value: Option<&Value>,
    path: &str,
    problems: &mut Vec<Problem>,
) -> Option<T> {
    match serde_json::from_value(value?.clone()) {
        Ok(found) => Some(found),
        Err(error) => {
            problems.push(Problem::new(path, error.to_string()));
            None
        }
    }
}

fn entries<T: DeserializeOwned>(
    value: Option<&Value>,
    path: &str,
    problems: &mut Vec<Problem>,
) -> Vec<T> {
    match value {
        None => Vec::new(),
        Some(Value::Array(items)) => items
            .iter()
            .enumerate()
            .filter_map(|(index, item)| section(Some(item), &format!("{path}[{index}]"), problems))
            .collect(),
        Some(_) => {
            problems.push(Problem::new(path, "must be a list"));
            Vec::new()
        }
    }
}

fn actions(
    value: Option<&Value>,
    problems: &mut Vec<Problem>,
) -> std::collections::BTreeMap<String, voyager_contract::content::ActionDecl> {
    match value {
        None => Default::default(),
        Some(Value::Object(map)) => map
            .iter()
            .filter_map(|(name, action)| {
                section(Some(action), &format!("actions.{name}"), problems)
                    .map(|action| (name.clone(), action))
            })
            .collect(),
        _ => {
            problems.push(Problem::new("actions", "must be an object of actions"));
            Default::default()
        }
    }
}

pub(crate) fn read(value: &Value) -> Result<Manifest, Vec<Problem>> {
    let Some(map) = value.as_object() else {
        return Err(vec![Problem::new("manifest", "must be a JSON object")]);
    };
    let mut problems = Vec::new();
    for key in map.keys().filter(|key| !SECTIONS.contains(&key.as_str())) {
        problems.push(Problem::new(
            key,
            format!("unknown section (sections: {})", SECTIONS.join(", ")),
        ));
    }
    for key in REQUIRED.iter().filter(|key| !map.contains_key(**key)) {
        problems.push(Problem::new(*key, "is required"));
    }
    let get = |key: &str| map.get(key);
    let contract = section(get("contract"), "contract", &mut problems);
    let id = section(get("id"), "id", &mut problems);
    let name = section(get("name"), "name", &mut problems);
    let version = section(get("version"), "version", &mut problems);
    let state = section(get("state"), "state", &mut problems);
    let local = section(get("local"), "local", &mut problems);
    let concurrency = section(get("concurrency"), "concurrency", &mut problems);
    let actions = actions(get("actions"), &mut problems);
    let view = section(get("view"), "view", &mut problems);
    let lifecycle = section(get("lifecycle"), "lifecycle", &mut problems);
    let presence = section(get("presence"), "presence", &mut problems);
    let orbit = entries(get("orbit"), "orbit", &mut problems);
    let dock = entries(get("dock"), "dock", &mut problems);
    let backend = section(get("backend"), "backend", &mut problems);
    match (contract, id, name, version, state, view) {
        (Some(contract), Some(id), Some(name), Some(version), Some(state), Some(view))
            if problems.is_empty() =>
        {
            Ok(Manifest {
                contract,
                id,
                name,
                version,
                state,
                local,
                concurrency: concurrency.unwrap_or_default(),
                actions,
                view,
                lifecycle: lifecycle.unwrap_or_default(),
                presence: presence.unwrap_or_default(),
                orbit,
                dock,
                backend,
            })
        }
        _ => Err(problems),
    }
}
