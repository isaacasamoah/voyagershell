use sha2::{Digest as _, Sha256};
use voyager_contract::content::{NotesConfiguration, NotesFile, Snapshot};
use voyager_contract::{Action, ContentId, Context, Layout, NameOrigin, RenameTarget};

pub(crate) struct Plan {
    pub file: NotesFile,
    pub contents: Vec<ContentId>,
    pub files: Vec<(ContentId, NotesFile)>,
    pub filename: String,
    pub revision: String,
}

impl Plan {
    pub fn capture(
        layout: &std::sync::Arc<Layout>,
        scope: Option<&Context>,
        action: &Action,
    ) -> Result<Option<Self>, String> {
        let Action::Rename {
            target: RenameTarget::Vessel { id } | RenameTarget::Portal { id },
            name,
        } = action
        else {
            return Ok(None);
        };
        let placement = layout
            .containers()
            .flat_map(|voyage| {
                voyage
                    .portals
                    .iter()
                    .chain(voyage.fleets.iter().flat_map(|fleet| &fleet.vessels))
            })
            .find(|panel| panel.id == *id)
            .ok_or("Panel not found")?;
        let selected = layout
            .contents
            .iter()
            .find(|content| content.id == placement.content)
            .ok_or("Content not found")?;
        if selected.type_id != crate::content::NOTES_TYPE {
            return Ok(None);
        }
        let configuration =
            |content: &voyager_contract::Content| -> Result<NotesConfiguration, String> {
                serde_json::from_value(serde_json::Value::Object(
                    content.configuration.clone().unwrap_or_default(),
                ))
                .map_err(|error| error.to_string())
            };
        let file = configuration(selected)?
            .notes_file
            .ok_or("Save this legacy Note to Markdown before renaming it")?;
        let filename = name.trim();
        let filename = if filename.ends_with(".md") {
            filename.to_owned()
        } else {
            format!("{filename}.md")
        };
        super::markdown::file(std::path::Path::new(&file.directory), &filename)?;
        if filename.len() <= 3
            || filename.len() > 128
            || filename.contains('\\')
            || filename.chars().any(char::is_control)
        {
            return Err("Choose a Markdown filename with 1 to 125 bytes before .md".into());
        }
        let mut contents = Vec::new();
        let mut files = Vec::new();
        let directory =
            std::fs::canonicalize(&file.directory).map_err(|error| error.to_string())?;
        for content in &layout.contents {
            if content.type_id != crate::content::NOTES_TYPE {
                continue;
            }
            let Some(bound) = configuration(content)?.notes_file else {
                continue;
            };
            if bound.filename == file.filename
                && std::fs::canonicalize(&bound.directory).ok().as_ref() == Some(&directory)
            {
                super::member(layout, scope, &content.id)?;
                contents.push(content.id.clone());
                files.push((content.id.clone(), bound));
            }
        }
        let revision = revision(&file)?;
        Ok(Some(Self {
            file,
            contents,
            files,
            filename,
            revision,
        }))
    }

    pub fn layout(&self, layout: &Layout) -> Result<Layout, String> {
        let mut candidate = layout.clone();
        for content in &mut candidate.contents {
            if let Some((_, file)) = self.files.iter().find(|(id, _)| *id == content.id) {
                let mut file = file.clone();
                file.filename = self.filename.clone();
                content.configuration.get_or_insert_default().insert(
                    "notesFile".into(),
                    serde_json::to_value(&file).map_err(|error| error.to_string())?,
                );
            }
        }
        for id in &self.contents {
            label(&mut candidate, id, &self.filename);
        }
        Ok(candidate)
    }

    pub fn moved_file(&self) -> NotesFile {
        NotesFile {
            directory: self.file.directory.clone(),
            filename: self.filename.clone(),
        }
    }

    pub fn moved_files(&self) -> Vec<(ContentId, NotesFile)> {
        self.files
            .iter()
            .map(|(id, file)| {
                let mut file = file.clone();
                file.filename.clone_from(&self.filename);
                (id.clone(), file)
            })
            .collect()
    }

    pub fn snapshot(&self, id: ContentId) -> Result<Snapshot, String> {
        let file = self.moved_file();
        let bytes = read(&file)?;
        Ok(Snapshot {
            content_id: id,
            revision: format!("{:x}", Sha256::digest(&bytes)),
            data: super::markdown::parse(&file.filename, &bytes)?,
            warning: None,
        })
    }
}

pub(crate) fn label(layout: &mut Layout, id: &ContentId, filename: &str) {
    for voyage in layout.containers_mut() {
        for panel in voyage.portals.iter_mut().chain(
            voyage
                .fleets
                .iter_mut()
                .flat_map(|fleet| &mut fleet.vessels),
        ) {
            if panel.content == *id {
                panel.name = filename.into();
                panel.name_origin = NameOrigin::Deliberate;
            }
        }
    }
}

pub(crate) fn synchronize_labels(layout: &mut Layout) {
    let files: Vec<_> = layout
        .contents
        .iter()
        .filter(|content| content.type_id == crate::content::NOTES_TYPE)
        .filter_map(|content| {
            let configuration: NotesConfiguration =
                serde_json::from_value(serde_json::Value::Object(content.configuration.clone()?))
                    .ok()?;
            configuration
                .notes_file
                .map(|file| (content.id.clone(), file.filename))
        })
        .collect();
    for (id, filename) in files {
        label(layout, &id, &filename);
    }
}

pub(crate) fn revision(file: &NotesFile) -> Result<String, String> {
    Ok(format!("{:x}", Sha256::digest(read(file)?)))
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn directory(file: &NotesFile) -> Result<rustix::fd::OwnedFd, String> {
    use rustix::fs::{Mode, OFlags, open};
    super::markdown::file(std::path::Path::new(&file.directory), &file.filename)?;
    open(
        file.directory.as_str(),
        OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
        Mode::empty(),
    )
    .map_err(|error| error.to_string())
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn read(file: &NotesFile) -> Result<Vec<u8>, String> {
    read_in(&directory(file)?, file)
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn read_in(directory: &rustix::fd::OwnedFd, file: &NotesFile) -> Result<Vec<u8>, String> {
    use rustix::fs::{Mode, OFlags, openat};
    use std::io::Read as _;
    let descriptor = openat(
        directory,
        file.filename.as_str(),
        OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
        Mode::empty(),
    )
    .map_err(|error| error.to_string())?;
    let input = std::fs::File::from(descriptor);
    if !input
        .metadata()
        .map_err(|error| error.to_string())?
        .is_file()
    {
        return Err("Only ordinary Markdown files can be renamed".into());
    }
    let mut bytes = Vec::new();
    input
        .take(super::LIMIT as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > super::LIMIT {
        return Err("Notes data exceeds 1 MiB".into());
    }
    Ok(bytes)
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
pub(crate) fn move_file(file: &NotesFile, name: &str, expected: &str) -> Result<(), String> {
    use rustix::fs::{RenameFlags, renameat_with};
    super::markdown::file(std::path::Path::new(&file.directory), name)?;
    let directory = directory(file)?;
    if format!("{:x}", Sha256::digest(read_in(&directory, file)?)) != expected {
        return Err("The Markdown file changed; inspect it before renaming".into());
    }
    if name == file.filename {
        return Ok(());
    }
    renameat_with(
        &directory,
        file.filename.as_str(),
        &directory,
        name,
        RenameFlags::NOREPLACE,
    )
    .map_err(|error| format!("Markdown rename refused; no file was overwritten: {error}"))
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn read(_: &NotesFile) -> Result<Vec<u8>, String> {
    Err("Markdown rename is not supported on this platform".into())
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
pub(crate) fn move_file(_: &NotesFile, _: &str, _: &str) -> Result<(), String> {
    Err("Markdown rename is not supported on this platform".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use voyager_contract::{ContentDestination, PanelInsertion, PanelOwner};

    #[test]
    fn aliases_keep_their_original_directory_spelling_and_share_the_new_filename() {
        let directory =
            std::env::temp_dir().join(format!("voyager-note-alias-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        std::fs::write(directory.join("Before.md"), b"# Heading\n\nBody").unwrap();
        let mut model = crate::workspace::Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Test".into(),
                cwd: directory.to_string_lossy().into(),
            })
            .unwrap();
        let fleet = model.layout.voyages[0].fleets[0].id.clone();
        let beside = model.layout.voyages[0].fleets[0].vessels[0].id.clone();
        model
            .apply(Action::CreateContent {
                type_id: crate::content::NOTES_TYPE.into(),
                destination: ContentDestination::Panel {
                    owner: PanelOwner::Fleet { id: fleet },
                    insertion: PanelInsertion::Beside {
                        id: beside,
                        side: voyager_contract::Side::Right,
                    },
                },
                launch: None,
            })
            .unwrap();
        let panel = model.layout.voyages[0].fleets[0]
            .vessels
            .last()
            .unwrap()
            .clone();
        let index = model
            .layout
            .contents
            .iter()
            .position(|content| content.id == panel.content)
            .unwrap();
        let file = NotesFile {
            directory: directory.to_string_lossy().into(),
            filename: "Before.md".into(),
        };
        model.layout.contents[index].configuration = Some(
            serde_json::json!({"showHeading":true,"notesFile":file})
                .as_object()
                .unwrap()
                .clone(),
        );
        let mut alias = model.layout.contents[index].clone();
        alias.id = ContentId("alias".into());
        let spelled = NotesFile {
            directory: format!("{}/.", file.directory),
            filename: file.filename.clone(),
        };
        alias.configuration = Some(
            serde_json::json!({"showHeading":true,"notesFile":spelled})
                .as_object()
                .unwrap()
                .clone(),
        );
        model.layout.contents.push(alias.clone());
        let mut placement = panel.clone();
        placement.id.0 = "alias-panel".into();
        placement.content = alias.id;
        model.layout.voyages[0].fleets[0].vessels.push(placement);
        let plan = Plan::capture(
            &std::sync::Arc::new(model.layout.clone()),
            None,
            &Action::Rename {
                target: RenameTarget::Vessel { id: panel.id },
                name: "After".into(),
            },
        )
        .unwrap()
        .unwrap();
        assert_eq!(plan.contents.len(), 2);
        let result = plan.layout(&model.layout).unwrap();
        assert!(
            result.voyages[0].fleets[0]
                .vessels
                .iter()
                .filter(|panel| plan.contents.contains(&panel.content))
                .all(|panel| panel.name == "After.md")
        );
        assert_eq!(plan.moved_files()[1].1.directory, spelled.directory);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
