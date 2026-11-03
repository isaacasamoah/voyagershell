mod description;
mod package;
pub(crate) use description::supports_type;
pub use description::{describe, discover, require_action};
pub use package::seed_package;

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

pub const LIMIT: usize = 1024 * 1024;
pub const ENVELOPE_LIMIT: usize = LIMIT + 16 * 1024;
const INITIAL_NOTES: &[u8] = br#"{"title":"Working notes","text":"A little space to think."}"#;

fn manifest(package: &Path) -> Result<serde_json::Value, String> {
    let mut bytes = Vec::new();
    fs::File::open(package.join("mod.json"))
        .and_then(|file| file.take(ENVELOPE_LIMIT as u64 + 1).read_to_end(&mut bytes))
        .map_err(|error| error.to_string())?;
    if bytes.len() > ENVELOPE_LIMIT {
        return Err("Notes schema exceeds the content envelope limit".into());
    }
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

fn state_schema(manifest: &serde_json::Value) -> Result<Option<serde_json::Value>, String> {
    let Some(schema) = manifest.get("stateSchema") else {
        return Ok(None);
    };
    jsonschema::validator_for(schema).map_err(|error| error.to_string())?;
    Ok(Some(schema.clone()))
}

fn schema(package: &Path) -> Result<Option<serde_json::Value>, String> {
    state_schema(&manifest(package)?)
}

pub(crate) fn fingerprint(value: &impl serde::Serialize) -> [u8; 32] {
    let mut value = serde_json::to_value(value).expect("Content identity serializes");
    value.sort_all_objects();
    Sha256::digest(serde_json::to_vec(&value).expect("Content identity serializes")).into()
}

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

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Binding(ContentId);

impl Binding {
    pub(crate) fn id(&self) -> &ContentId {
        &self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Access {
    View(Binding),
    Agent {
        scope: voyager_contract::Context,
        expected_version: u64,
    },
}

pub fn identity(request: &Request) -> (&ContentId, &str, Option<&str>) {
    match request {
        Request::Describe {
            content_id,
            request_id,
            ..
        }
        | Request::Inspect {
            content_id,
            request_id,
            ..
        } => (content_id, request_id, None),
        Request::Update {
            content_id,
            request_id,
            expected_revision,
            ..
        } => (content_id, request_id, Some(expected_revision)),
    }
}

pub fn request(action: voyager_contract::content::Action, request_id: String) -> Request {
    use voyager_contract::content::Action;
    match action {
        Action::Describe { content_id } => Request::Describe {
            version: Version::V1,
            request_id,
            content_id,
        },
        Action::Inspect { content_id } => Request::Inspect {
            version: Version::V1,
            request_id,
            content_id,
        },
        Action::Update {
            content_id,
            expected_revision,
            data,
        } => Request::Update {
            version: Version::V1,
            request_id,
            content_id,
            expected_revision,
            data,
        },
    }
}

pub fn reject(request: &Request, message: String) -> Response {
    let (id, request_id, expected) = identity(request);
    Response::Rejected {
        version: Version::V1,
        request_id: request_id.into(),
        content_id: id.clone(),
        expected_revision: expected.map(str::to_owned),
        message,
    }
}

pub(crate) fn bounded_response(request: &Request, response: Response) -> Response {
    if serde_json::to_vec(&response)
        .expect("Content response serializes")
        .len()
        <= ENVELOPE_LIMIT
    {
        return response;
    }
    if matches!(
        response,
        Response::Applied { .. } | Response::Uncertain { .. }
    ) {
        let (id, request_id, expected) = identity(request);
        Response::Uncertain {
            version: Version::V1, request_id: request_id.into(), content_id: id.clone(), expected_revision: expected.unwrap_or_default().into(),
            message: "The dispatched write's complete confirmation exceeds the content envelope limit. Inspect it; do not repeat the update.".into(),
        }
    } else {
        let (id, request_id, _) = identity(request);
        let (revision, warning_present) = match &response {
            Response::Snapshot { snapshot, .. } => {
                (Some(snapshot.revision.clone()), snapshot.warning.is_some())
            }
            Response::Rejected { .. } => (None, true),
            _ => (None, false),
        };
        Response::Limited { version: Version::V1, request_id: request_id.into(), content_id: id.clone(), revision, warning_present, message: "The complete read or refusal, including any warning details, exceeds the content envelope limit. No complete snapshot is supplied.".into() }
    }
}

pub(crate) fn member(
    layout: &std::sync::Arc<voyager_contract::Layout>,
    scope: Option<&voyager_contract::Context>,
    id: &ContentId,
) -> Result<(), String> {
    let projected = crate::scope::project(layout, scope);
    if !projected
        .contents
        .iter()
        .any(|content| content.id == *id && content.type_id == "notes")
        || !projected.voyages.iter().any(|voyage| {
            voyage
                .portals
                .iter()
                .chain(voyage.fleets.iter().flat_map(|fleet| &fleet.vessels))
                .any(|placement| placement.content == *id)
        })
    {
        return Err("That Notes instance is outside the captured workspace scope".into());
    }
    Ok(())
}

pub(crate) fn run(
    owner: &mut Owner,
    layout: &std::sync::Arc<voyager_contract::Layout>,
    version: u64,
    access: &Access,
    request: Request,
) -> Response {
    let (id, _, _) = identity(&request);
    let admitted = (|| {
        let scope = match access {
            Access::View(binding) => {
                if binding.id() != id {
                    return Err("That content is outside this view".into());
                }
                None
            }
            Access::Agent {
                scope,
                expected_version,
            } => {
                if *expected_version != version {
                    return Err(
                        "Workspace revision changed; inspect before content dispatch".into(),
                    );
                }
                Some(scope)
            }
        };
        member(layout, scope, id)?;
        owner
            .register_existing(id)
            .map_err(|error| error.to_string())
    })();
    match admitted {
        Ok(binding) => owner.call(&binding, request),
        Err(message) => reject(&request, message),
    }
}

pub(crate) fn initialize_created(
    owner: &mut Owner,
    previous: &voyager_contract::Layout,
    current: &voyager_contract::Layout,
) -> Result<(), String> {
    for content in &current.contents {
        if content.type_id == "notes" && !previous.contents.iter().any(|old| old.id == content.id) {
            owner.initialize(&content.id).map_err(|error| format!("Workspace creation applied, but Notes initialization is unconfirmed: {error}. Inspect; do not repeat creation."))?;
        }
    }
    Ok(())
}

pub struct Owner {
    root: PathBuf,
    last: HashMap<String, Snapshot>,
    instances: HashSet<String>,
    changes: HashMap<String, (u64, Option<async_channel::Sender<u64>>)>,
}

impl Owner {
    pub fn open(profile: &Path) -> std::io::Result<Self> {
        let root = profile.join("data");
        fs::create_dir_all(&root)?;
        Ok(Self {
            root,
            last: HashMap::new(),
            instances: HashSet::new(),
            changes: HashMap::new(),
        })
    }

    fn package_path(&self, type_id: &str) -> Result<PathBuf, String> {
        let name = description::package_name(type_id)?
            .ok_or("This content type has no removable package")?;
        Ok(self
            .root
            .parent()
            .expect("profile root")
            .join("mods")
            .join(name))
    }

    pub fn require_available(&self, type_id: &str) -> Result<(), String> {
        let packages = self.root.parent().expect("profile root").join("mods");
        if description::package_name(type_id)?.is_none() {
            return description::require_ready(&describe(&packages, type_id)?);
        }
        let catalog = discover(&packages)?;
        let kind = catalog
            .types
            .iter()
            .find(|kind| kind.type_id == type_id)
            .ok_or("Unsupported content type")?;
        description::require_ready(kind)
    }

    pub fn remove_package(&mut self, type_id: &str) -> Result<(), String> {
        package::remove(&self.package_path(type_id)?)?;
        self.package_changed();
        Ok(())
    }

    pub fn restore_package(&mut self, type_id: &str) -> Result<(), String> {
        package::restore(&self.package_path(type_id)?)?;
        self.package_changed();
        Ok(())
    }

    fn package_changed(&mut self) {
        for (version, listener) in self.changes.values_mut() {
            *version = version.saturating_add(1);
            if let Some(listener) = listener.take() {
                let _ = listener.try_send(*version);
            }
        }
    }

    fn path(&self, id: &ContentId) -> std::io::Result<PathBuf> {
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
        Ok(self.root.join(format!("{}.json", id.0)))
    }

    pub fn initialize(&mut self, id: &ContentId) -> std::io::Result<Binding> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(self.path(id)?)?;
        file.write_all(INITIAL_NOTES)?;
        file.sync_all()?;
        self.instances.insert(id.0.clone());
        Ok(Binding(id.clone()))
    }

    pub fn register_existing(&mut self, id: &ContentId) -> std::io::Result<Binding> {
        fs::File::open(self.path(id)?)?;
        self.instances.insert(id.0.clone());
        Ok(Binding(id.clone()))
    }

    pub fn bind(&self, id: &ContentId) -> Option<Binding> {
        self.instances.contains(&id.0).then(|| Binding(id.clone()))
    }

    pub fn subscribe(
        &mut self,
        binding: &Binding,
        after: Option<u64>,
    ) -> async_channel::Receiver<u64> {
        let (send, receive) = async_channel::bounded(1);
        let (version, listener) = self.changes.entry(binding.0.0.clone()).or_default();
        if after != Some(*version) {
            let _ = send.try_send(*version);
        } else {
            *listener = Some(send);
        }
        receive
    }

    fn schema(&self) -> Result<Option<serde_json::Value>, String> {
        let package = self.root.parent().expect("profile root").join("mods/notes");
        schema(&package)
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
        let response = self.dispatch(binding, request);
        self.notify(&response);
        response
    }

    fn notify(&mut self, response: &Response) {
        if let Response::Applied { content_id, .. } | Response::Uncertain { content_id, .. } =
            response
            && let Some((version, listener)) = self.changes.get_mut(&content_id.0)
        {
            *version = version.saturating_add(1);
            if let Some(listener) = listener.take() {
                let _ = listener.try_send(*version);
            }
        }
    }

    fn dispatch(&mut self, binding: &Binding, request: Request) -> Response {
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
            Request::Describe { .. } => match describe(
                &self.root.parent().expect("profile root").join("mods"),
                "notes",
            )
            .and_then(|description| {
                description::require_ready(&description)?;
                Ok(description)
            }) {
                Ok(description) => {
                    let schema = description.state.and_then(|state| state.schema);
                    Response::Described {
                        version: Version::V1,
                        request_id,
                        content_id: id,
                        schema_declared: schema.is_some(),
                        state_schema: schema,
                    }
                }
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
    fn descriptions_reuse_the_bound_schema_and_refuse_unsupported_capabilities() {
        let directory =
            std::env::temp_dir().join(format!("voyager-description-test-{}", std::process::id()));
        let packages = directory.join("mods");
        let package = packages.join("notes");
        fs::create_dir_all(&package).unwrap();
        fs::write(
            package.join("mod.json"),
            include_str!("../../content/notes/mod.json"),
        )
        .unwrap();
        fs::write(package.join("main.js"), "personal source").unwrap();
        let catalog = discover(&packages).unwrap();
        assert_eq!(catalog.types.len(), 2);
        let terminal = describe(&packages, "terminal").unwrap();
        let notes = describe(&packages, "notes").unwrap();
        assert_eq!(terminal.view.module, "voyager_native");
        assert_eq!(terminal.view.component, "Terminal");
        assert!(terminal.backend.is_some());
        assert_eq!(notes.view.module, "voyager_content_view");
        assert_eq!(notes.view.component, "Notes");
        assert!(notes.backend.is_none());
        assert!(notes.configuration.is_none());
        assert!(terminal.configuration.is_none());
        assert!(require_action(&notes, "update").is_ok());
        assert!(require_action(&notes, "configure").is_err());
        assert!(require_action(&terminal, "launch-another-program").is_err());
        assert!(describe(&packages, "unknown").is_err());
        let mut model = crate::workspace::Model::default();
        model
            .apply(voyager_contract::Action::CreateVoyage {
                name: "Test".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        let before_layout = model.layout.clone();
        assert!(
            model
                .apply(voyager_contract::Action::CreateContent {
                    launch: None,
                    type_id: "unknown".into(),
                    destination: voyager_contract::ContentDestination::Portal {
                        voyage: before_layout.voyages[0].id.clone()
                    }
                })
                .is_err()
        );
        assert_eq!(model.layout, before_layout);
        let validator =
            jsonschema::validator_for(&notes.actions.as_ref().unwrap().input_schema).unwrap();
        let mut input = serde_json::json!({"expectedVersion":"7","action":{"operation":"update","contentId":"opaque-id","expectedRevision":"revision","data":{"title":"Title","text":"Body"}}});
        assert!(validator.is_valid(&input));
        input["action"]["data"]["unsupported"] = true.into();
        assert!(!validator.is_valid(&input));
        let mut owner = Owner::open(&directory).unwrap();
        let id = ContentId("opaque-id".into());
        let binding = owner.initialize(&id).unwrap();
        let before = fs::read(directory.join("data/opaque-id.json")).unwrap();
        assert_eq!(
            notes.state.as_ref().unwrap().defaults,
            serde_json::from_slice::<serde_json::Value>(&before).unwrap()
        );
        let response = owner.call(
            &binding,
            Request::Describe {
                version: Version::V1,
                request_id: "description".into(),
                content_id: id,
            },
        );
        assert!(
            matches!(response, Response::Described { state_schema, .. } if state_schema == notes.state.as_ref().and_then(|state| state.schema.clone()))
        );
        assert_eq!(
            fs::read(directory.join("data/opaque-id.json")).unwrap(),
            before
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn fingerprints_ignore_nested_object_order_but_keep_payload_identity() {
        let first: serde_json::Value = serde_json::from_str(r#"{"expectedVersion":"7","action":{"operation":"update","data":{"title":"Title","text":"Body"}}}"#).unwrap();
        let mut reordered: serde_json::Value = serde_json::from_str(r#"{"action":{"data":{"text":"Body","title":"Title"},"operation":"update"},"expectedVersion":"7"}"#).unwrap();
        assert_eq!(fingerprint(&first), fingerprint(&reordered));
        reordered["action"]["data"]["text"] = "Changed".into();
        assert_ne!(fingerprint(&first), fingerprint(&reordered));
    }

    #[test]
    fn agent_uses_fresh_membership_and_the_same_owner_as_views() {
        use std::sync::Arc;
        use voyager_contract::{Action, Axis, ContentDestination, Context};
        let directory =
            std::env::temp_dir().join(format!("voyager-content-agent-test-{}", std::process::id()));
        fs::create_dir(&directory).unwrap();
        fs::create_dir_all(directory.join("mods/notes")).unwrap();
        fs::write(
            directory.join("mods/notes/mod.json"),
            include_str!("../../content/notes/mod.json"),
        )
        .unwrap();
        let mut owner = Owner::open(&directory).unwrap();
        let mut model = crate::workspace::Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Test".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        let old = model.layout.clone();
        let voyage = old.voyages[0].id.clone();
        let fleet = old.voyages[0].fleets[0].id.clone();
        model
            .apply(Action::CreateContent {
                launch: None,
                type_id: "notes".into(),
                destination: ContentDestination::Vessel {
                    fleet: fleet.clone(),
                    after: old.voyages[0].fleets[0].vessels[0].id.clone(),
                    axis: Axis::Horizontal,
                },
            })
            .unwrap();
        let a = model.layout.contents.last().unwrap().id.clone();
        let placement = model.layout.voyages[0].fleets[0]
            .vessels
            .last()
            .unwrap()
            .id
            .clone();
        model
            .apply(Action::CreateContent {
                launch: None,
                type_id: "notes".into(),
                destination: ContentDestination::Portal { voyage },
            })
            .unwrap();
        let b = model.layout.contents.last().unwrap().id.clone();
        initialize_created(&mut owner, &old, &model.layout).unwrap();
        let layout = Arc::new(model.layout.clone());
        let access = Access::Agent {
            scope: Context::Vessel {
                id: placement.clone(),
            },
            expected_version: 7,
        };
        let binding = owner.register_existing(&a).unwrap();
        let retired = owner.subscribe(&binding, Some(0));
        let changes = owner.subscribe(&binding, Some(0));
        assert!(retired.is_closed());
        let sibling = owner.subscribe(&owner.bind(&b).unwrap(), Some(0));
        let inspect = |id: &ContentId| Request::Inspect {
            version: Version::V1,
            request_id: "inspect".into(),
            content_id: id.clone(),
        };
        let base = match run(&mut owner, &layout, 7, &access, inspect(&a)) {
            Response::Snapshot { snapshot, .. } => snapshot,
            other => panic!("{other:?}"),
        };
        let update = Request::Update {
            version: Version::V1,
            request_id: "update".into(),
            content_id: a.clone(),
            expected_revision: base.revision,
            data: Notes {
                title: "Agent updated".into(),
                text: "Shared durable data".into(),
            },
        };
        assert!(matches!(
            run(&mut owner, &layout, 8, &access, update.clone()),
            Response::Rejected { .. }
        ));
        assert!(matches!(
            run(&mut owner, &layout, 7, &access, inspect(&b)),
            Response::Rejected { .. }
        ));
        assert!(matches!(
            run(&mut owner, &layout, 7, &access, update.clone()),
            Response::Applied { .. }
        ));
        assert_eq!(changes.try_recv().unwrap(), 1);
        assert_eq!(owner.subscribe(&binding, Some(0)).try_recv().unwrap(), 1);
        assert!(sibling.try_recv().is_err());
        assert!(
            matches!(owner.call(&binding, inspect(&a)), Response::Snapshot { snapshot, .. } if snapshot.data.title == "Agent updated")
        );
        assert!(matches!(
            run(&mut owner, &layout, 7, &access, update.clone()),
            Response::Rejected { .. }
        ));
        model.layout.voyages[0].fleets[0].root = old.voyages[0].fleets[0].root.clone();
        let hidden = Arc::new(model.layout.clone());
        assert!(matches!(
            run(
                &mut owner,
                &hidden,
                7,
                &Access::Agent {
                    scope: Context::Fleet { id: fleet },
                    expected_version: 7
                },
                inspect(&a)
            ),
            Response::Snapshot { .. }
        ));
        model.layout.voyages[0].fleets[0]
            .vessels
            .retain(|vessel| vessel.id != placement);
        assert!(matches!(
            run(&mut owner, &Arc::new(model.layout), 7, &access, update),
            Response::Rejected { .. }
        ));
        fs::remove_file(directory.join(format!("data/{}.json", a.0))).unwrap();
        assert!(matches!(
            run(&mut owner, &layout, 7, &access, inspect(&a)),
            Response::Rejected { .. }
        ));
        assert!(!directory.join(format!("data/{}.json", a.0)).exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn existing_binding_never_recreates_missing_notes() {
        let directory =
            std::env::temp_dir().join(format!("voyager-binding-test-{}", std::process::id()));
        fs::create_dir(&directory).unwrap();
        let mut owner = Owner::open(&directory).unwrap();
        let id = ContentId("hidden-notes".into());
        assert!(owner.register_existing(&id).is_err());
        assert!(!directory.join("data/hidden-notes.json").exists());
        owner.initialize(&id).unwrap();
        let before = fs::read(directory.join("data/hidden-notes.json")).unwrap();
        assert!(owner.initialize(&id).is_err());
        assert_eq!(
            fs::read(directory.join("data/hidden-notes.json")).unwrap(),
            before
        );
        owner.register_existing(&id).unwrap();
        fs::remove_file(directory.join("data/hidden-notes.json")).unwrap();
        assert!(owner.register_existing(&id).is_err());
        assert!(!directory.join("data/hidden-notes.json").exists());
        assert!(
            owner
                .register_existing(&ContentId("../outside".into()))
                .is_err()
        );
        fs::remove_dir_all(directory).unwrap();
    }

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
        let binding = owner.initialize(&id).unwrap();
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
        let binding = Binding(ContentId("notes-a".into()));
        let changes = owner.subscribe(&binding, Some(0));
        let result = owner.read(&ContentId("notes-a".into()));
        let reply = finish_write(
            ContentId("notes-a".into()),
            "request".into(),
            "before".into(),
            format!("{:x}", Sha256::digest(bytes)),
            result,
        );
        owner.notify(&reply);
        assert_eq!(changes.try_recv().unwrap(), 1);
        fs::remove_dir_all(directory).unwrap();
        assert!(
            matches!(reply, Response::Uncertain { content_id, request_id, expected_revision, .. } if content_id.0 == "notes-a" && request_id == "request" && expected_revision == "before")
        );
    }
}
