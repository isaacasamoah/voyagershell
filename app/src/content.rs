mod description;
mod markdown;
mod package;
mod view;
pub(crate) use description::supports_type;
pub use description::{describe, discover, require_action};
pub use package::seed_package;
pub(crate) use view::Phase as ViewPhase;
pub use view::ViewBinding;

use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use voyager_contract::{
    ContentId,
    content::{
        ConfigurationSnapshot, Notes, NotesConfiguration, Request, Response, Snapshot, Version,
    },
};

pub const LIMIT: usize = 1024 * 1024;
pub const ENVELOPE_LIMIT: usize = LIMIT + 16 * 1024;
const INITIAL_NOTES: &[u8] = br#"{"title":"Title","text":""}"#;

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
        }
        | Request::Configure {
            content_id,
            request_id,
            ..
        }
        | Request::MigrateNote {
            content_id,
            request_id,
            ..
        }
        | Request::ListNotes {
            content_id,
            request_id,
            ..
        }
        | Request::NewNote {
            content_id,
            request_id,
            ..
        }
        | Request::OpenNote {
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

pub fn request(
    action: voyager_contract::content::Action,
    request_id: String,
    expected_version: u64,
) -> Request {
    use voyager_contract::content::Action;
    match action {
        Action::Configure {
            content_id,
            configuration,
        } => Request::Configure {
            version: Version::V1,
            request_id,
            content_id,
            expected_version,
            configuration,
        },
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
        Action::MigrateNote { content_id } => Request::MigrateNote {
            version: Version::V1,
            request_id,
            content_id,
            expected_version,
        },
        Action::ListNotes { content_id } => Request::ListNotes {
            version: Version::V1,
            request_id,
            content_id,
        },
        Action::NewNote { content_id, title } => Request::NewNote {
            version: Version::V1,
            request_id,
            content_id,
            expected_version,
            title,
        },
        Action::OpenNote {
            content_id,
            filename,
        } => Request::OpenNote {
            version: Version::V1,
            request_id,
            content_id,
            expected_version,
            filename,
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
        Response::Applied { .. }
            | Response::Configured { .. }
            | Response::NoteOpened { .. }
            | Response::Uncertain { .. }
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
        || !projected.containers().any(|voyage| {
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

pub(crate) fn notes_directory(
    layout: &voyager_contract::Layout,
    id: &ContentId,
) -> Result<PathBuf, String> {
    let content = layout
        .contents
        .iter()
        .find(|content| content.id == *id)
        .ok_or("Content is unavailable")?;
    let owners: Vec<_> = layout
        .containers()
        .filter(|voyage| {
            voyage
                .portals
                .iter()
                .chain(voyage.fleets.iter().flat_map(|fleet| &fleet.vessels))
                .any(|placement| placement.content == *id)
        })
        .collect();
    let [owner] = owners.as_slice() else {
        return Err("Notes requires one identified owning Voyage".into());
    };
    let home = layout.home.as_ref().is_some_and(|home| home.id == owner.id);
    let cwd = if home {
        Some(content.cwd.as_str())
    } else {
        owner.cwd.as_deref()
    }
    .filter(|cwd| !cwd.is_empty())
    .ok_or("The owning Voyage has no directory")?;
    let directory = Path::new(cwd);
    if !directory.is_absolute() {
        return Err("The owning directory must be absolute".into());
    }
    Ok(directory.join("notes"))
}

pub(crate) fn register_content(
    owner: &mut Owner,
    layout: &voyager_contract::Layout,
    id: &ContentId,
) -> Result<Binding, String> {
    let content = layout
        .contents
        .iter()
        .find(|content| content.id == *id)
        .ok_or("Content is unavailable")?;
    let configuration = content
        .configuration
        .as_ref()
        .map(|configuration| {
            serde_json::from_value::<NotesConfiguration>(serde_json::Value::Object(
                configuration.clone(),
            ))
        })
        .transpose()
        .map_err(|error| error.to_string())?
        .unwrap_or_default();
    if let Some(file) = configuration.notes_file {
        owner.register_file(id, file)
    } else {
        owner
            .register_existing(id)
            .map_err(|error| error.to_string())
    }
}

pub(crate) fn run(
    owner: &mut Owner,
    layout: &std::sync::Arc<voyager_contract::Layout>,
    version: u64,
    access: &Access,
    request: Request,
) -> Response {
    let binding = match admit(owner, layout, version, access, &request) {
        Ok(binding) => binding,
        Err(message) => return reject(&request, message),
    };
    let metadata = match configuration(owner, layout, identity(&request).0, version) {
        Ok(metadata) => metadata,
        Err(error) => return reject(&request, error),
    };
    if matches!(&request, Request::ListNotes { .. }) {
        let (id, request_id, _) = identity(&request);
        return match notes_directory(layout, id).and_then(|directory| markdown::list(&directory)) {
            Ok(filenames) => Response::NotesList {
                version: Version::V1,
                request_id: request_id.into(),
                content_id: id.clone(),
                filenames,
            },
            Err(error) => reject(&request, error),
        };
    }
    let mut response = owner.call(&binding, request);
    if let Response::Snapshot { configuration, .. } = &mut response {
        *configuration = metadata;
    }
    response
}

pub(crate) fn admit(
    owner: &mut Owner,
    layout: &std::sync::Arc<voyager_contract::Layout>,
    version: u64,
    access: &Access,
    request: &Request,
) -> Result<Binding, String> {
    let (id, _, _) = identity(request);
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
                return Err("Workspace revision changed; inspect before content dispatch".into());
            }
            Some(scope)
        }
    };
    member(layout, scope, id)?;
    register_content(owner, layout, id)
}

pub(crate) fn configuration(
    owner: &Owner,
    layout: &voyager_contract::Layout,
    id: &ContentId,
    version: u64,
) -> Result<Option<ConfigurationSnapshot>, String> {
    let packages = owner.root.parent().expect("profile root").join("mods");
    if description::configuration(&packages)?.is_none() {
        return Ok(None);
    }
    let content = layout
        .contents
        .iter()
        .find(|content| content.id == *id)
        .ok_or("Content is unavailable")?;
    let configuration = content
        .configuration
        .as_ref()
        .map(|configuration| {
            serde_json::from_value::<NotesConfiguration>(serde_json::Value::Object(
                configuration.clone(),
            ))
        })
        .transpose()
        .map_err(|error| format!("Stored Notes configuration is invalid: {error}"))?
        .unwrap_or_default();
    Ok(Some(ConfigurationSnapshot {
        configuration,
        workspace_version: version,
    }))
}

pub(crate) fn initialize_created(
    owner: &mut Owner,
    previous: &voyager_contract::Layout,
    current: &mut voyager_contract::Layout,
) -> Result<bool, String> {
    let ids: Vec<_> = current
        .contents
        .iter()
        .filter(|content| {
            content.type_id == "notes" && !previous.contents.iter().any(|old| old.id == content.id)
        })
        .map(|content| content.id.clone())
        .collect();
    for id in &ids {
        let directory = notes_directory(current, id)?;
        let filename = owner.create_file(&directory, "Title")?;
        let file = voyager_contract::content::NotesFile {
            directory: directory.to_string_lossy().into_owned(),
            filename,
        };
        let content = current
            .contents
            .iter_mut()
            .find(|content| content.id == *id)
            .ok_or("Content is unavailable")?;
        let mut configuration = content
            .configuration
            .as_ref()
            .map(|value| {
                serde_json::from_value::<NotesConfiguration>(serde_json::Value::Object(
                    value.clone(),
                ))
            })
            .transpose()
            .map_err(|error| error.to_string())?
            .unwrap_or_default();
        configuration.notes_file = Some(file.clone());
        content.configuration = Some(
            serde_json::to_value(configuration)
                .map_err(|error| error.to_string())?
                .as_object()
                .ok_or("Invalid Notes configuration")?
                .clone(),
        );
        let snapshot = owner.select_file(id, file.clone()).map_err(|error| {
            format!(
                "Note creation is unconfirmed at {}: {error}",
                Path::new(&file.directory).join(&file.filename).display()
            )
        })?;
        if snapshot.data
            != (Notes {
                title: "Title".into(),
                text: String::new(),
            })
        {
            return Err(format!(
                "Note creation is unconfirmed at {}: readback differs",
                Path::new(&file.directory).join(&file.filename).display()
            ));
        }
    }
    Ok(!ids.is_empty())
}

pub struct Owner {
    root: PathBuf,
    last: HashMap<String, Snapshot>,
    instances: HashSet<String>,
    changes: HashMap<String, (u64, Option<async_channel::Sender<u64>>)>,
    views: Vec<std::sync::Weak<view::Gate>>,
    files: HashMap<String, voyager_contract::content::NotesFile>,
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
            views: Vec::new(),
            files: HashMap::new(),
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
        for view in self.views.drain(..).filter_map(|view| view.upgrade()) {
            view.retire();
        }
        self.refresh_views();
    }

    pub fn refresh_views(&mut self) {
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
        self.files.remove(&id.0);
        self.instances.insert(id.0.clone());
        Ok(Binding(id.clone()))
    }

    pub(crate) fn select_file(
        &mut self,
        id: &ContentId,
        file: voyager_contract::content::NotesFile,
    ) -> Result<Snapshot, String> {
        self.register_file(id, file)?;
        self.read(id).map(DataRead::snapshot)
    }

    pub(crate) fn migrate_file(
        &mut self,
        id: &ContentId,
        directory: &Path,
    ) -> Result<voyager_contract::content::NotesFile, String> {
        let snapshot = self.read(id)?.snapshot();
        let filename = markdown::create(directory, &snapshot.data)?;
        let file = voyager_contract::content::NotesFile {
            directory: directory.to_string_lossy().into_owned(),
            filename,
        };
        let migrated = self.select_file(id, file.clone()).map_err(|error| {
            format!(
                "Note creation is unconfirmed at {}: {error}",
                directory.join(&file.filename).display()
            )
        })?;
        if migrated.data != snapshot.data {
            return Err(format!(
                "Note creation is unconfirmed at {}; converted note differs from legacy source",
                directory.join(&file.filename).display()
            ));
        }
        Ok(file)
    }

    pub(crate) fn create_file(&self, directory: &Path, title: &str) -> Result<String, String> {
        markdown::create(
            directory,
            &Notes {
                title: title.into(),
                text: String::new(),
            },
        )
    }

    pub(crate) fn register_file(
        &mut self,
        id: &ContentId,
        file: voyager_contract::content::NotesFile,
    ) -> Result<Binding, String> {
        markdown::file(Path::new(&file.directory), &file.filename)?;
        self.path(id).map_err(|error| error.to_string())?;
        self.files.insert(id.0.clone(), file);
        self.instances.insert(id.0.clone());
        Ok(Binding(id.clone()))
    }

    pub fn bind(&self, id: &ContentId) -> Option<Binding> {
        self.instances.contains(&id.0).then(|| Binding(id.clone()))
    }

    pub fn register_view(&mut self, binding: Binding) -> Result<ViewBinding, String> {
        if !self.package_path("notes")?.is_dir() {
            return Err("Notes package is unavailable".into());
        }
        if !self.instances.contains(&binding.id().0) {
            return Err("Notes binding is unavailable".into());
        }
        self.views.retain(|view| view.strong_count() > 0);
        let view = ViewBinding::new(binding);
        self.views.push(std::sync::Arc::downgrade(&view.gate));
        Ok(view)
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

    fn warning(&self, data: &Notes) -> Option<String> {
        match self.schema() {
            Ok(Some(schema)) => validate(
                &schema,
                &serde_json::to_value(data).expect("Notes serializes"),
            )
            .err(),
            Ok(None) => Some("No state schema declared".into()),
            Err(error) => Some(format!("State schema unavailable: {error}")),
        }
    }

    fn read(&mut self, id: &ContentId) -> Result<DataRead, String> {
        if let Some(binding) = self.files.get(&id.0) {
            let path = markdown::file(Path::new(&binding.directory), &binding.filename)?;
            let bytes = markdown::read(&path)?;
            let data = markdown::parse(&binding.filename, &bytes)?;
            let warning = self.warning(&data);
            let snapshot = Snapshot {
                content_id: id.clone(),
                revision: format!("{:x}", Sha256::digest(&bytes)),
                data,
                warning,
            };
            self.last.insert(id.0.clone(), snapshot.clone());
            return Ok(DataRead::Fresh(snapshot));
        }
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
        let warning = self.warning(&data);
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

    pub(crate) fn notify(&mut self, response: &Response) {
        if let Response::Applied { content_id, .. }
        | Response::Configured { content_id, .. }
        | Response::NoteOpened { content_id, .. }
        | Response::Uncertain { content_id, .. } = response
            && let Some((version, listener)) = self.changes.get_mut(&content_id.0)
        {
            *version = version.saturating_add(1);
            if let Some(listener) = listener.take() {
                let _ = listener.try_send(*version);
            }
        }
    }

    fn dispatch(&mut self, binding: &Binding, request: Request) -> Response {
        let (id, request_id, expected) = identity(&request);
        let (id, request_id, expected) = (
            id.clone(),
            request_id.to_owned(),
            expected.map(str::to_owned),
        );
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
            Request::Configure { .. }
            | Request::ListNotes { .. }
            | Request::MigrateNote { .. }
            | Request::NewNote { .. }
            | Request::OpenNote { .. } => {
                rejected("This operation requires the workspace owner".into())
            }
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
                        configuration: description.configuration,
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
                    configuration: None,
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
                if let Some(binding) = self.files.get(&id.0).cloned() {
                    let path =
                        match markdown::file(Path::new(&binding.directory), &binding.filename) {
                            Ok(path) => path,
                            Err(error) => return rejected(error),
                        };
                    let path = match fs::canonicalize(&path) {
                        Ok(path) => path,
                        Err(error) => return rejected(error.to_string()),
                    };
                    let permissions = match OpenOptions::new()
                        .write(true)
                        .open(&path)
                        .and_then(|file| file.metadata())
                    {
                        Ok(metadata) => metadata.permissions(),
                        Err(error) => return rejected(error.to_string()),
                    };
                    let bytes = match markdown::encode(&data) {
                        Ok(bytes) => bytes,
                        Err(error) => return rejected(error),
                    };
                    let Some(name) = path.file_name() else {
                        return rejected("The selected file has no filename".into());
                    };
                    let mut temp_name = std::ffi::OsString::from(".");
                    temp_name.push(name);
                    temp_name.push(".tmp");
                    let temp = path.with_file_name(temp_name);
                    let mut file = match OpenOptions::new().write(true).create_new(true).open(&temp)
                    {
                        Ok(file) => file,
                        Err(error) => return rejected(error.to_string()),
                    };
                    if let Err(error) = file
                        .set_permissions(permissions)
                        .and_then(|_| file.write_all(&bytes))
                        .and_then(|_| file.sync_all())
                    {
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
                    return finish_write(
                        id,
                        request_id,
                        expected_revision,
                        written_revision,
                        result,
                    );
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
        assert_eq!(catalog.types.len(), 3);
        let terminal = describe(&packages, "terminal").unwrap();
        let notes = describe(&packages, "notes").unwrap();
        let agents = describe(&packages, "agents").unwrap();
        assert_eq!(terminal.view.module, "voyager_native");
        assert_eq!(terminal.view.component, "Terminal");
        assert!(terminal.backend.is_some());
        assert_eq!(notes.view.module, "voyager_content_view");
        assert_eq!(notes.view.component, "Notes");
        assert!(notes.backend.is_none());
        assert!(notes.configuration.is_none());
        assert!(terminal.configuration.is_none());
        assert_eq!(agents.view.module, "./agents.js");
        assert_eq!(agents.view.component, "agentsView");
        assert!(agents.backend.is_none());
        assert!(agents.state.is_none());
        assert_eq!(agents.actions.as_ref().unwrap().names, ["list"]);
        assert!(require_action(&agents, "list").is_ok());
        assert!(require_action(&agents, "send").is_err());
        let agents_validator =
            jsonschema::validator_for(&agents.actions.as_ref().unwrap().input_schema).unwrap();
        assert!(agents_validator.is_valid(&serde_json::json!({
            "expectedVersion": "7", "action": {"operation": "list"}
        })));
        let stop = serde_json::json!({
            "expectedVersion": "7",
            "action": {"operation": "stop", "contentId": "opaque-id", "terminalId": "terminal", "pid": 7}
        });
        assert!(
            jsonschema::validator_for(&terminal.actions.as_ref().unwrap().input_schema)
                .unwrap()
                .is_valid(&stop)
        );
        assert!(!agents_validator.is_valid(&stop));
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
                    destination: voyager_contract::ContentDestination::Panel {
                        owner: voyager_contract::PanelOwner::Portals {
                            voyage: before_layout.voyages[0].id.clone()
                        },
                        insertion: voyager_contract::PanelInsertion::Empty
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
        use voyager_contract::{Action, Context};
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
                cwd: directory.to_string_lossy().into_owned(),
            })
            .unwrap();
        let old = model.layout.clone();
        let voyage = old.voyages[0].id.clone();
        let fleet = old.voyages[0].fleets[0].id.clone();
        model
            .apply(Action::CreateContent {
                launch: None,
                type_id: "notes".into(),
                destination: voyager_contract::ContentDestination::Panel {
                    owner: voyager_contract::PanelOwner::Fleet { id: fleet.clone() },
                    insertion: voyager_contract::PanelInsertion::Beside {
                        id: old.voyages[0].fleets[0].vessels[0].id.clone(),
                        side: voyager_contract::Side::Right,
                    },
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
                destination: voyager_contract::ContentDestination::Panel {
                    owner: voyager_contract::PanelOwner::Portals { voyage },
                    insertion: voyager_contract::PanelInsertion::Empty,
                },
            })
            .unwrap();
        let b = model.layout.contents.last().unwrap().id.clone();
        let blocked = directory.join("notes");
        fs::write(&blocked, b"not a directory").unwrap();
        let before = model.layout.clone();
        assert!(initialize_created(&mut owner, &old, &mut model.layout).is_err());
        assert_eq!(model.layout, before);
        assert_eq!(fs::read(&blocked).unwrap(), b"not a directory");
        fs::remove_file(blocked).unwrap();
        initialize_created(&mut owner, &old, &mut model.layout).unwrap();
        let layout = Arc::new(model.layout.clone());
        let access = Access::Agent {
            scope: Context::Vessel {
                id: placement.clone(),
            },
            expected_version: 7,
        };
        let binding = register_content(&mut owner, &layout, &a).unwrap();
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
        let selected = owner.files.get(&a.0).unwrap();
        let selected = Path::new(&selected.directory).join(&selected.filename);
        fs::remove_file(&selected).unwrap();
        assert!(matches!(
            run(&mut owner, &layout, 7, &access, inspect(&a)),
            Response::Rejected { .. }
        ));
        assert!(!selected.exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn markdown_save_preserves_existing_private_mode() {
        use std::os::unix::fs::PermissionsExt;
        let directory =
            std::env::temp_dir().join(format!("voyager-notes-mode-{}", std::process::id()));
        fs::create_dir(&directory).unwrap();
        fs::create_dir_all(directory.join("mods/notes")).unwrap();
        fs::write(
            directory.join("mods/notes/mod.json"),
            include_str!("../../content/notes/mod.json"),
        )
        .unwrap();
        let file = directory.join("Private.md");
        fs::write(&file, b"# Private\n\nBefore").unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o600)).unwrap();
        let mut owner = Owner::open(&directory).unwrap();
        let id = ContentId("private".into());
        let binding = owner
            .register_file(
                &id,
                voyager_contract::content::NotesFile {
                    directory: directory.to_string_lossy().into_owned(),
                    filename: "Private.md".into(),
                },
            )
            .unwrap();
        let snapshot = match owner.call(
            &binding,
            Request::Inspect {
                version: Version::V1,
                request_id: "read".into(),
                content_id: id.clone(),
            },
        ) {
            Response::Snapshot { snapshot, .. } => snapshot,
            other => panic!("{other:?}"),
        };
        let result = owner.call(
            &binding,
            Request::Update {
                version: Version::V1,
                request_id: "save".into(),
                content_id: id,
                expected_revision: snapshot.revision,
                data: Notes {
                    title: "Private".into(),
                    text: "After".into(),
                },
            },
        );
        assert!(matches!(result, Response::Applied { .. }));
        assert_eq!(
            fs::metadata(&file).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(fs::read(&file).unwrap(), b"# Private\n\nAfter");
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
