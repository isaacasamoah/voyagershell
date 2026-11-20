use super::{
    Access, Binding, ENVELOPE_LIMIT, NOTES_TYPE, Owner, description, identity, markdown, member,
    reject, rename,
};
use std::path::{Path, PathBuf};
use voyager_contract::{
    Layout, VesselId,
    content::{
        ConfigurationSnapshot, Notes, NotesConfiguration, NotesFile, Request, Response, Snapshot,
        Version,
    },
};

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
            version: Version::V1, request_id: request_id.into(), vessel_id: id.clone(), expected_revision: expected.unwrap_or_default().into(),
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
        Response::Limited { version: Version::V1, request_id: request_id.into(), vessel_id: id.clone(), revision, warning_present, message: "The complete read or refusal, including any warning details, exceeds the content envelope limit. No complete snapshot is supplied.".into() }
    }
}

pub(crate) fn notes_directory(
    layout: &voyager_contract::Layout,
    id: &VesselId,
) -> Result<PathBuf, String> {
    let content = layout
        .vessels
        .iter()
        .find(|content| content.id == *id)
        .ok_or("Content is unavailable")?;
    let owners: Vec<_> = layout
        .containers()
        .filter(|voyage| {
            voyage
                .portals
                .iter()
                .chain(voyage.fleets.iter().flat_map(|fleet| &fleet.placements))
                .any(|placement| placement.vessel == *id)
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
    id: &VesselId,
) -> Result<Binding, String> {
    let content = layout
        .vessels
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
                vessel_id: id.clone(),
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
    id: &VesselId,
    version: u64,
) -> Result<Option<ConfigurationSnapshot>, String> {
    let packages = owner.root.with_file_name("vessels");
    if description::configuration(&packages)?.is_none() {
        return Ok(None);
    }
    let content = layout
        .vessels
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
        .vessels
        .iter()
        .filter(|item| {
            item.type_id == NOTES_TYPE && !previous.vessels.iter().any(|old| old.id == item.id)
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
            .vessels
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
        rename::label(current, id, &file.filename);
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

pub(crate) struct Selected {
    pub candidate: Layout,
    request_id: String,
    vessel_id: VesselId,
    expected_version: u64,
    configuration: NotesConfiguration,
    snapshot: Snapshot,
}

impl Selected {
    pub(crate) fn opened(&self, workspace_version: u64) -> Response {
        Response::NoteOpened {
            version: Version::V1,
            request_id: self.request_id.clone(),
            vessel_id: self.vessel_id.clone(),
            snapshot: self.snapshot.clone(),
            configuration: self.configuration.clone(),
            workspace_version,
        }
    }

    pub(crate) fn unconfirmed(&self, error: &impl std::fmt::Debug) -> Response {
        Response::Uncertain {
            version: Version::V1,
            request_id: self.request_id.clone(),
            vessel_id: self.vessel_id.clone(),
            expected_revision: self.expected_version.to_string(),
            message: format!(
                "Note selection or creation was not confirmed; inspect the selected file and workspace before another attempt: {error:?}"
            ),
        }
    }
}

pub(crate) struct Configured {
    pub candidate: Layout,
    request_id: String,
    vessel_id: VesselId,
    expected_version: u64,
    configuration: NotesConfiguration,
}

impl Configured {
    pub(crate) fn applied(&self, workspace_version: u64) -> Response {
        Response::Configured {
            version: Version::V1,
            request_id: self.request_id.clone(),
            vessel_id: self.vessel_id.clone(),
            configuration: self.configuration.clone(),
            workspace_version,
        }
    }

    pub(crate) fn refused(&self, request: &Request, message: String) -> Response {
        reject(request, message)
    }

    pub(crate) fn uncertain(&self, message: String) -> Response {
        Response::Uncertain {
            version: Version::V1,
            request_id: self.request_id.clone(),
            vessel_id: self.vessel_id.clone(),
            expected_revision: self.expected_version.to_string(),
            message,
        }
    }
}

pub(crate) struct Refusal {
    pub response: Response,
    pub stale: bool,
}

impl Refusal {
    fn rejected(request: &Request, message: String) -> Self {
        Self {
            response: reject(request, message),
            stale: false,
        }
    }
}

pub(crate) fn is_write(request: &Request) -> bool {
    matches!(
        request,
        Request::Update { .. }
            | Request::Configure { .. }
            | Request::MigrateNote { .. }
            | Request::NewNote { .. }
            | Request::OpenNote { .. }
    )
}

pub(crate) fn is_selection(request: &Request) -> bool {
    matches!(
        request,
        Request::MigrateNote { .. } | Request::NewNote { .. } | Request::OpenNote { .. }
    )
}

pub(crate) fn notifies(request: &Request, response: &Response) -> bool {
    matches!(
        response,
        Response::Configured { .. } | Response::NoteOpened { .. }
    ) || (matches!(
        request,
        Request::Configure { .. }
            | Request::NewNote { .. }
            | Request::OpenNote { .. }
            | Request::MigrateNote { .. }
    ) && matches!(response, Response::Uncertain { .. }))
}

pub(crate) fn check_envelope(request: &Request) -> Result<(), String> {
    if serde_json::to_vec(request)
        .map_err(|error| error.to_string())?
        .len()
        > ENVELOPE_LIMIT
    {
        return Err("Content request exceeds the envelope limit".into());
    }
    Ok(())
}

pub(crate) fn current_access(
    access: &Access,
    structure: u64,
    target: &VesselId,
    current: impl FnOnce(u64, &VesselId) -> bool,
) -> Access {
    match access {
        Access::Agent {
            scope,
            expected_version,
        } if current(*expected_version, target) => Access::Agent {
            scope: scope.clone(),
            expected_version: structure,
        },
        other => other.clone(),
    }
}

pub(crate) fn select(
    owner: &mut Owner,
    layout: &std::sync::Arc<Layout>,
    structure: u64,
    access: &Access,
    request: &Request,
    current: impl FnOnce(u64, &VesselId) -> bool,
) -> Result<Selected, Box<Refusal>> {
    let (request_id, vessel_id, expected_version) = match request {
        Request::MigrateNote {
            request_id,
            vessel_id,
            expected_version,
            ..
        }
        | Request::NewNote {
            request_id,
            vessel_id,
            expected_version,
            ..
        }
        | Request::OpenNote {
            request_id,
            vessel_id,
            expected_version,
            ..
        } => (request_id, vessel_id, expected_version),
        _ => {
            return Err(Box::new(Refusal::rejected(
                request,
                "Expected a note selection".into(),
            )));
        }
    };
    let mut created = None;
    let selected = (|| {
        admit(owner, layout, structure, access, request)?;
        if !current(*expected_version, vessel_id) {
            return Err("Workspace changed; inspect before selecting a note".to_owned());
        }
        let directory = notes_directory(layout, vessel_id)?;
        if matches!(request, Request::MigrateNote { .. }) {
            let current = configuration(owner, layout, vessel_id, structure)?
                .ok_or("Notes configuration is unavailable")?;
            if current.configuration.notes_file.is_some() {
                return Err("This note already has a Markdown file".into());
            }
            let file = owner.migrate_file(vessel_id, &directory)?;
            created = Some(directory.join(&file.filename));
            let snapshot = owner.select_file(vessel_id, file.clone())?;
            let mut candidate = (**layout).clone();
            let content = candidate
                .vessels
                .iter_mut()
                .find(|item| item.id == *vessel_id)
                .ok_or("Content is unavailable")?;
            let mut configuration = current.configuration;
            configuration.notes_file = Some(file.clone());
            content.configuration = Some(
                serde_json::to_value(&configuration)
                    .map_err(|error| error.to_string())?
                    .as_object()
                    .ok_or("Invalid Notes configuration")?
                    .clone(),
            );
            rename::label(&mut candidate, vessel_id, &file.filename);
            return Ok((candidate, configuration, snapshot));
        }
        let filename = match request {
            Request::NewNote { title, .. } => {
                let filename = owner.create_file(&directory, title)?;
                created = Some(directory.join(&filename));
                filename
            }
            Request::OpenNote { filename, .. } => filename.clone(),
            _ => unreachable!(),
        };
        let file = NotesFile {
            directory: directory.to_string_lossy().into_owned(),
            filename,
        };
        let snapshot = owner.select_file(vessel_id, file.clone())?;
        let mut candidate = (**layout).clone();
        let content = candidate
            .vessels
            .iter_mut()
            .find(|item| item.id == *vessel_id)
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
            serde_json::to_value(&configuration)
                .map_err(|error| error.to_string())?
                .as_object()
                .ok_or("Invalid Notes configuration")?
                .clone(),
        );
        rename::label(&mut candidate, vessel_id, &file.filename);
        Ok((candidate, configuration, snapshot))
    })();
    match selected {
        Ok((candidate, configuration, snapshot)) => Ok(Selected {
            candidate,
            request_id: request_id.clone(),
            vessel_id: vessel_id.clone(),
            expected_version: *expected_version,
            configuration,
            snapshot,
        }),
        Err(error) => {
            if created.is_some() || error.contains("creation is unconfirmed") {
                Err(Box::new(Refusal {
                    response: Response::Uncertain {
                        version: Version::V1,
                        request_id: request_id.clone(),
                        vessel_id: vessel_id.clone(),
                        expected_revision: expected_version.to_string(),
                        message: format!(
                            "Note creation or selection is unconfirmed at {created:?}: {error}; inspect before retry"
                        ),
                    },
                    stale: true,
                }))
            } else {
                Err(Box::new(Refusal::rejected(request, error)))
            }
        }
    }
}

pub(crate) fn configure(
    owner: &mut Owner,
    layout: &std::sync::Arc<Layout>,
    structure: u64,
    access: &Access,
    request: &Request,
    current: impl FnOnce(u64, &VesselId) -> bool,
) -> Result<Configured, Box<Response>> {
    let Request::Configure {
        request_id,
        vessel_id,
        expected_version,
        configuration,
        ..
    } = request
    else {
        return Err(Box::new(reject(
            request,
            "Expected a configuration request".into(),
        )));
    };
    let candidate = (|| {
        admit(owner, layout, structure, access, request)?;
        if !current(*expected_version, vessel_id) {
            return Err("Workspace changed; inspect before configuring content".into());
        }
        owner.require_configure()?;
        let current = self::configuration(owner, layout, vessel_id, structure)?
            .ok_or("Notes configuration is unavailable")?;
        if configuration.notes_file != current.configuration.notes_file {
            return Err("Use a note selection action to change the selected file".into());
        }
        let mut candidate = (**layout).clone();
        candidate
            .vessels
            .iter_mut()
            .find(|content| content.id == *vessel_id)
            .ok_or("Content is unavailable")?
            .configuration = Some(
            serde_json::to_value(configuration)
                .expect("Configuration serializes")
                .as_object()
                .expect("Configuration is an object")
                .clone(),
        );
        Ok(candidate)
    })();
    match candidate {
        Ok(candidate) => Ok(Configured {
            candidate,
            request_id: request_id.clone(),
            vessel_id: vessel_id.clone(),
            expected_version: *expected_version,
            configuration: configuration.clone(),
        }),
        Err(message) => Err(Box::new(reject(request, message))),
    }
}
