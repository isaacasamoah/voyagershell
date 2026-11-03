use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use voyager_contract::{
    ContentId,
    content::{Notes, Request, Response, Snapshot, Version},
};

const LIMIT: usize = 1024 * 1024;

enum DataRead {
    Fresh(Snapshot),
    Fallback(Snapshot),
}

impl DataRead {
    fn snapshot(self) -> Snapshot {
        match self {
            Self::Fresh(snapshot) | Self::Fallback(snapshot) => snapshot,
        }
    }
}

fn validate(schema: &serde_json::Value, data: &serde_json::Value) -> Result<(), String> {
    let validator = jsonschema::validator_for(schema).map_err(|error| error.to_string())?;
    validator.validate(data).map_err(|error| error.to_string())
}

fn finish_write(
    id: ContentId,
    request_id: String,
    expected_revision: String,
    written_revision: String,
    result: Result<DataRead, String>,
) -> Response {
    match result {
        Ok(DataRead::Fresh(snapshot)) if snapshot.revision == written_revision => {
            Response::Applied {
                version: Version::V1,
                request_id,
                content_id: id,
                snapshot,
            }
        }
        result => Response::Uncertain {
            version: Version::V1,
            request_id,
            content_id: id,
            expected_revision,
            message: result
                .err()
                .unwrap_or_else(|| "Data changed after replacement".into()),
        },
    }
}

#[derive(Clone)]
pub struct Binding(ContentId);

pub struct Owner {
    root: PathBuf,
    last: HashMap<String, Snapshot>,
    instances: HashSet<String>,
}

impl Owner {
    pub fn open(profile: &Path) -> std::io::Result<Self> {
        let root = profile.join("data");
        fs::create_dir_all(&root)?;
        Ok(Self {
            root,
            last: HashMap::new(),
            instances: HashSet::new(),
        })
    }

    pub fn register(&mut self, id: &ContentId) -> std::io::Result<Binding> {
        if id.0.is_empty()
            || id.0.len() > 128
            || !id
                .0
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Invalid content identity",
            ));
        }
        let path = self.root.join(format!("{}.json", id.0));
        match OpenOptions::new().write(true).create_new(true).open(path) {
            Ok(mut file) => {
                file.write_all(br#"{"title":"Working notes","text":"A little space to think."}"#)?
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
            Err(error) => return Err(error),
        }
        self.instances.insert(id.0.clone());
        Ok(Binding(id.clone()))
    }

    pub fn bind(&self, id: &ContentId) -> Option<Binding> {
        self.instances.contains(&id.0).then(|| Binding(id.clone()))
    }

    fn schema(&self) -> Result<Option<serde_json::Value>, String> {
        let path = self
            .root
            .parent()
            .expect("profile root")
            .join("mods/notes/mod.json");
        let bytes = fs::read(path).map_err(|error| error.to_string())?;
        let manifest: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
        let Some(schema) = manifest.get("stateSchema") else {
            return Ok(None);
        };
        jsonschema::validator_for(schema).map_err(|error| error.to_string())?;
        Ok(Some(schema.clone()))
    }

    fn read(&mut self, id: &ContentId) -> Result<DataRead, String> {
        let mut bytes = Vec::new();
        fs::File::open(self.root.join(format!("{}.json", id.0)))
            .and_then(|file| file.take(LIMIT as u64 + 1).read_to_end(&mut bytes))
            .map_err(|error| error.to_string())?;
        if bytes.len() > LIMIT {
            return Err("Notes data exceeds 1 MiB".into());
        }
        let data: Notes = match serde_json::from_slice(&bytes) {
            Ok(data) => data,
            Err(error) => {
                return self
                    .last
                    .get(&id.0)
                    .cloned()
                    .map(|mut snapshot| {
                        snapshot.warning = Some(format!("Data edit is invalid: {error}"));
                        DataRead::Fallback(snapshot)
                    })
                    .ok_or_else(|| error.to_string());
            }
        };
        let warning = match self.schema() {
            Ok(Some(schema)) => validate(
                &schema,
                &serde_json::to_value(&data).expect("Notes serializes"),
            )
            .err(),
            Ok(None) => Some("No state schema declared".into()),
            Err(error) => Some(format!("State schema unavailable: {error}")),
        };
        let snapshot = Snapshot {
            content_id: id.clone(),
            revision: format!("{:x}", Sha256::digest(&bytes)),
            data,
            warning,
        };
        self.last.insert(id.0.clone(), snapshot.clone());
        Ok(DataRead::Fresh(snapshot))
    }

    pub fn call(&mut self, binding: &Binding, request: Request) -> Response {
        let (id, request_id, expected) = match &request {
            Request::Describe {
                content_id,
                request_id,
                ..
            }
            | Request::Inspect {
                content_id,
                request_id,
                ..
            } => (content_id.clone(), request_id.clone(), None),
            Request::Update {
                content_id,
                request_id,
                expected_revision,
                ..
            } => (
                content_id.clone(),
                request_id.clone(),
                Some(expected_revision.clone()),
            ),
        };
        let rejected = |message: String| Response::Rejected {
            version: Version::V1,
            request_id: request_id.clone(),
            content_id: id.clone(),
            expected_revision: expected.clone(),
            message,
        };
        if binding.0 != id {
            return rejected("That content is outside this view".into());
        }
        match request {
            Request::Describe { .. } => match self.schema() {
                Ok(schema) => Response::Described {
                    version: Version::V1,
                    request_id,
                    content_id: id,
                    schema_declared: schema.is_some(),
                    state_schema: schema,
                },
                Err(error) => rejected(format!("State schema unavailable: {error}")),
            },
            Request::Inspect { .. } => match self.read(&id).map(DataRead::snapshot) {
                Ok(snapshot) => Response::Snapshot {
                    version: Version::V1,
                    request_id,
                    content_id: id,
                    snapshot,
                },
                Err(error) => rejected(error),
            },
            Request::Update {
                expected_revision,
                data,
                ..
            } => {
                let current = match self.read(&id).map(DataRead::snapshot) {
                    Ok(snapshot) => snapshot,
                    Err(error) => return rejected(error),
                };
                if let Some(warning) = &current.warning
                    && warning != "No state schema declared"
                {
                    return rejected(warning.clone());
                }
                if current.revision != expected_revision {
                    return rejected("Portal data changed. Read it again before saving.".into());
                }
                let schema = match self.schema() {
                    Ok(schema) => schema,
                    Err(error) => return rejected(error),
                };
                let value = serde_json::to_value(&data).expect("Notes serializes");
                if let Some(schema) = schema
                    && let Err(error) = validate(&schema, &value)
                {
                    return rejected(error);
                }
                let bytes = serde_json::to_vec(&data).expect("Notes serializes");
                if bytes.len() > LIMIT {
                    return rejected("Notes data exceeds 1 MiB".into());
                }
                let path = self.root.join(format!("{}.json", id.0));
                let temp = self.root.join(format!(".{}.tmp", id.0));
                let mut file = match OpenOptions::new().write(true).create_new(true).open(&temp) {
                    Ok(file) => file,
                    Err(error) => return rejected(error.to_string()),
                };
                if let Err(error) = file.write_all(&bytes).and_then(|_| file.sync_all()) {
                    drop(file);
                    return rejected(match fs::remove_file(&temp) {
                        Ok(()) => error.to_string(),
                        Err(cleanup) => {
                            format!("{error}; removing temporary file failed: {cleanup}")
                        }
                    });
                }
                drop(file);
                if let Err(error) = fs::rename(&temp, path) {
                    return Response::Uncertain {
                        version: Version::V1,
                        request_id,
                        content_id: id,
                        expected_revision,
                        message: error.to_string(),
                    };
                }
                let written_revision = format!("{:x}", Sha256::digest(&bytes));
                let result = self.read(&id);
                finish_write(id, request_id, expected_revision, written_revision, result)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equal_revision_fallback_cannot_confirm_a_write() {
        let directory =
            std::env::temp_dir().join(format!("voyager-fallback-test-{}", std::process::id()));
        fs::create_dir_all(directory.join("mods/notes")).unwrap();
        fs::write(
            directory.join("mods/notes/mod.json"),
            br#"{"name":"Notes"}"#,
        )
        .unwrap();
        let mut owner = Owner::open(&directory).unwrap();
        let id = ContentId("notes-a".into());
        let binding = owner.register(&id).unwrap();
        let fresh = owner.read(&id).unwrap();
        let revision = match &fresh {
            DataRead::Fresh(snapshot) => snapshot.revision.clone(),
            DataRead::Fallback(_) => panic!("Expected fresh data"),
        };
        let fresh_reply = finish_write(
            id.clone(),
            "fresh".into(),
            "before".into(),
            revision.clone(),
            Ok(fresh),
        );
        fs::write(owner.root.join("notes-a.json"), b"{").unwrap();
        let fallback = owner.read(&id).unwrap();
        let fallback_reply = finish_write(
            id.clone(),
            "fallback".into(),
            "before".into(),
            revision,
            Ok(fallback),
        );
        let inspected = owner.call(
            &binding,
            Request::Inspect {
                version: Version::V1,
                request_id: "inspect".into(),
                content_id: id,
            },
        );
        fs::remove_dir_all(directory).unwrap();
        assert!(
            matches!(fresh_reply, Response::Applied { snapshot, .. } if snapshot.warning.as_deref() == Some("No state schema declared"))
        );
        assert!(
            matches!(fallback_reply, Response::Uncertain { content_id, request_id, expected_revision, .. } if content_id.0 == "notes-a" && request_id == "fallback" && expected_revision == "before")
        );
        assert!(
            matches!(inspected, Response::Snapshot { snapshot, .. } if snapshot.warning.as_deref().is_some_and(|warning| warning.starts_with("Data edit is invalid:")))
        );
    }

    #[test]
    fn replacement_followed_by_failed_read_is_uncertain() {
        let directory =
            std::env::temp_dir().join(format!("voyager-write-test-{}", std::process::id()));
        fs::create_dir(&directory).unwrap();
        let mut owner = Owner::open(&directory).unwrap();
        let path = owner.root.join("notes-a.json");
        let temp = owner.root.join("test-write");
        let bytes = br#"{"title":"changed","text":"saved"}"#;
        fs::write(&temp, bytes).unwrap();
        fs::rename(temp, &path).unwrap();
        assert_eq!(fs::read(&path).unwrap(), bytes);
        fs::remove_file(path).unwrap();
        let result = owner.read(&ContentId("notes-a".into()));
        let reply = finish_write(
            ContentId("notes-a".into()),
            "request".into(),
            "before".into(),
            format!("{:x}", Sha256::digest(bytes)),
            result,
        );
        fs::remove_dir_all(directory).unwrap();
        assert!(
            matches!(reply, Response::Uncertain { content_id, request_id, expected_revision, .. } if content_id.0 == "notes-a" && request_id == "request" && expected_revision == "before")
        );
    }
}
