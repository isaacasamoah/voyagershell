use crate::core::{Core, Error};
use crate::layout_store::{LayoutRevision, Seen, save};
use crate::workspace::Part;
use std::sync::Arc;
use voyager_contract::Layout;

pub(super) fn select_note(
    core: &mut Core,
    (layout, version, fresh): (&mut Arc<Layout>, &mut LayoutRevision, &mut bool),
    seen: &Seen,
    owner: &mut crate::content::Owner,
    access: &crate::content::Access,
    request: &voyager_contract::content::Request,
) -> voyager_contract::content::Response {
    use voyager_contract::content::{NotesConfiguration, NotesFile, Request, Response, Version};
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
        _ => return crate::content::reject(request, "Expected a note selection".into()),
    };
    let mut created = None;
    let selected = (|| {
        crate::content::admit(owner, layout, version.structure, access, request)?;
        if !seen.current(*expected_version, *version, layout, || {
            Some(vec![Part::Vessel(vessel_id.clone())])
        }) {
            return Err("Workspace changed; inspect before selecting a note".to_owned());
        }
        let directory = crate::content::notes_directory(layout, vessel_id)?;
        if matches!(request, Request::MigrateNote { .. }) {
            let current =
                crate::content::configuration(owner, layout, vessel_id, version.structure)?
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
            crate::content::rename::label(&mut candidate, vessel_id, &file.filename);
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
        crate::content::rename::label(&mut candidate, vessel_id, &file.filename);
        Ok((candidate, configuration, snapshot))
    })();
    let (candidate, configuration, snapshot) = match selected {
        Ok(value) => value,
        Err(error) => {
            if created.is_some() || error.contains("creation is unconfirmed") {
                *fresh = false;
                return Response::Uncertain {
                    version: Version::V1,
                    request_id: request_id.clone(),
                    vessel_id: vessel_id.clone(),
                    expected_revision: expected_version.to_string(),
                    message: format!(
                        "Note creation or selection is unconfirmed at {created:?}: {error}; inspect before retry"
                    ),
                };
            }
            return crate::content::reject(request, error);
        }
    };
    match save(core, &candidate, *version) {
        Ok(revision) => {
            *layout = Arc::new(candidate);
            *version = revision;
            Response::NoteOpened {
                version: Version::V1,
                request_id: request_id.clone(),
                vessel_id: vessel_id.clone(),
                snapshot,
                configuration,
                workspace_version: revision.structure,
            }
        }
        Err(error) => {
            *fresh = false;
            Response::Uncertain {
                version: Version::V1,
                request_id: request_id.clone(),
                vessel_id: vessel_id.clone(),
                expected_revision: expected_version.to_string(),
                message: format!(
                    "Note selection or creation was not confirmed; inspect the selected file and workspace before another attempt: {error:?}"
                ),
            }
        }
    }
}

pub(super) fn configure(
    core: &mut Core,
    (layout, version, fresh): (&mut Arc<Layout>, &mut LayoutRevision, &mut bool),
    seen: &Seen,
    owner: &mut crate::content::Owner,
    access: &crate::content::Access,
    request: &voyager_contract::content::Request,
) -> voyager_contract::content::Response {
    use voyager_contract::content::{Request, Response, Version};
    let Request::Configure {
        request_id,
        vessel_id,
        expected_version,
        configuration,
        ..
    } = request
    else {
        return crate::content::reject(request, "Expected a configuration request".into());
    };
    let candidate = (|| {
        crate::content::admit(owner, layout, version.structure, access, request)?;
        if !seen.current(*expected_version, *version, layout, || {
            Some(vec![Part::Vessel(vessel_id.clone())])
        }) {
            return Err("Workspace changed; inspect before configuring content".into());
        }
        owner.require_configure()?;
        let current = crate::content::configuration(owner, layout, vessel_id, version.structure)?
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
    let candidate = match candidate {
        Ok(candidate) => candidate,
        Err(message) => return crate::content::reject(request, message),
    };
    match save(core, &candidate, *version) {
        Ok(revision) => {
            *layout = Arc::new(candidate);
            *version = revision;
            Response::Configured {
                version: Version::V1,
                request_id: request_id.clone(),
                vessel_id: vessel_id.clone(),
                configuration: configuration.clone(),
                workspace_version: revision.structure,
            }
        }
        Err(Error::Rejected { kind, message }) => {
            *fresh = false;
            crate::content::reject(request, format!("{kind}: {message}"))
        }
        Err(Error::Uncertain(message)) => {
            *fresh = false;
            Response::Uncertain {
                version: Version::V1,
                request_id: request_id.clone(),
                vessel_id: vessel_id.clone(),
                expected_revision: expected_version.to_string(),
                message,
            }
        }
    }
}
