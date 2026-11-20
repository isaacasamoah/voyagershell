use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, io::Read, path::Path};
use voyager_contract::content::Manifest;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Instance {
    pub revision: u64,
    pub state: Value,
}

pub(crate) fn load(
    root: &Path,
    id: &str,
    manifest: &Manifest,
    limit: usize,
) -> Result<Instance, String> {
    let path = root.join(format!("{id}.json"));
    if !path.exists() {
        return Ok(Instance {
            revision: 0,
            state: manifest.state.initial.clone(),
        });
    }
    let mut bytes = Vec::new();
    fs::File::open(&path)
        .and_then(|file| file.take(limit as u64 + 1).read_to_end(&mut bytes))
        .map_err(|error| error.to_string())?;
    if bytes.len() > limit {
        return Err("Instance data exceeds the content envelope limit".into());
    }
    let stored: Instance = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Instance data is invalid: {error}"))?;
    let validator = jsonschema::validator_for(&manifest.state.schema).map_err(|e| e.to_string())?;
    if let Some(error) = validator.iter_errors(&stored.state).next() {
        return Err(format!(
            "Instance data no longer fits the manifest: {error}"
        ));
    }
    Ok(stored)
}

pub(crate) fn save(root: &Path, id: &str, instance: &Instance, limit: usize) -> Result<(), String> {
    let bytes = serde_json::to_vec(instance).map_err(|error| error.to_string())?;
    if bytes.len() > limit {
        return Err("The result would exceed the instance data limit".into());
    }
    let path = root.join(format!("{id}.json"));
    let temporary = root.join(format!(".{id}.json.writing"));
    fs::write(&temporary, bytes)
        .and_then(|()| fs::rename(&temporary, &path))
        .map_err(|error| {
            let _ = fs::remove_file(&temporary);
            error.to_string()
        })
}
