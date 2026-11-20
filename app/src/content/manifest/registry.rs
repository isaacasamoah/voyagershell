use super::{check::Environment, problem::Problem, read::load};
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::Mutex,
    time::SystemTime,
};
use voyager_contract::content::{
    Actions, Availability, Backend, BackendKind, DataDescription, Description, Manifest,
    NativeHost, NativeView, Placement,
};

const FILE: &str = "manifest.json";
const REMOVED_SUFFIX: &str = ".removed";

type Signature = (SystemTime, u64);

#[derive(Default)]
struct Package {
    signature: Option<Signature>,
    removed: bool,
    good: Option<Manifest>,
    problems: Vec<Problem>,
}

#[derive(Clone, Debug)]
pub(crate) struct Entry {
    pub folder: String,
    pub removed: bool,
    pub manifest: Option<Manifest>,
    pub problems: Vec<Problem>,
}

pub struct Registry {
    dir: PathBuf,
    limit: usize,
    reserved: fn(&str) -> bool,
    packages: Mutex<BTreeMap<String, Package>>,
}

fn signature(path: &Path) -> Option<Signature> {
    let metadata = fs::metadata(path).ok()?;
    Some((metadata.modified().ok()?, metadata.len()))
}

fn read(path: &Path, limit: usize) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    fs::File::open(path)
        .and_then(|file| file.take(limit as u64 + 1).read_to_end(&mut bytes))
        .map_err(|error| error.to_string())?;
    if bytes.len() > limit {
        return Err("exceeds the content envelope limit".into());
    }
    Ok(bytes)
}

impl Registry {
    pub fn new(dir: PathBuf, limit: usize, reserved: fn(&str) -> bool) -> Self {
        Self {
            dir,
            limit,
            reserved,
            packages: Mutex::new(BTreeMap::new()),
        }
    }

    fn folders(&self) -> BTreeMap<String, (PathBuf, bool)> {
        let mut found = BTreeMap::new();
        let Ok(listing) = fs::read_dir(&self.dir) else {
            return found;
        };
        for entry in listing.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            match name
                .strip_prefix('.')
                .and_then(|hidden| hidden.strip_suffix(REMOVED_SUFFIX))
            {
                Some(original) if path.join(FILE).is_file() => {
                    found.entry(original.to_owned()).or_insert((path, true));
                }
                Some(_) => {}
                None if path.join(FILE).is_file() => {
                    found.insert(name, (path, false));
                }
                None => {}
            }
        }
        found
    }

    pub(crate) fn refresh(&self) -> Vec<Entry> {
        let folders = self.folders();
        let mut packages = self
            .packages
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        packages.retain(|folder, _| folders.contains_key(folder));
        for (folder, (path, removed)) in &folders {
            let package = packages.entry(folder.clone()).or_default();
            let current = signature(&path.join(FILE));
            if package.signature == current && package.removed == *removed && current.is_some() {
                continue;
            }
            package.signature = current;
            package.removed = *removed;
            let exists = |relative: &str| path.join(relative).is_file();
            let reserved = |id: &str| (self.reserved)(id);
            let environment = Environment {
                exists: &exists,
                reserved: &reserved,
            };
            match read(&path.join(FILE), self.limit)
                .map_err(|error| vec![Problem::new(FILE, error)])
                .and_then(|bytes| load(&bytes, &environment))
            {
                Ok(manifest) => {
                    package.good = Some(manifest);
                    package.problems.clear();
                }
                Err(problems) => package.problems = problems,
            }
        }
        let mut owners: BTreeMap<String, String> = BTreeMap::new();
        packages
            .iter()
            .map(|(folder, package)| {
                let mut problems = package.problems.clone();
                let mut manifest = package.good.clone();
                if let Some(good) = &manifest {
                    match owners.get(&good.id) {
                        Some(other) => {
                            problems.push(Problem::new(
                                "id",
                                format!("\"{}\" is also declared by package \"{other}\"", good.id),
                            ));
                            manifest = None;
                        }
                        None => {
                            owners.insert(good.id.clone(), folder.clone());
                        }
                    }
                }
                Entry {
                    folder: folder.clone(),
                    removed: package.removed,
                    manifest,
                    problems,
                }
            })
            .collect()
    }

    pub(crate) fn find(&self, type_id: &str) -> Option<Entry> {
        self.refresh().into_iter().find(|entry| {
            entry
                .manifest
                .as_ref()
                .is_some_and(|manifest| manifest.id == type_id)
                || (entry.manifest.is_none() && entry.folder == type_id)
        })
    }

    pub(crate) fn folder(&self, type_id: &str) -> Option<String> {
        self.find(type_id).map(|entry| entry.folder)
    }

    pub fn manifest(&self, type_id: &str) -> Option<Manifest> {
        self.find(type_id).and_then(|entry| entry.manifest)
    }

    pub fn describe(&self, type_id: &str) -> Option<Description> {
        self.find(type_id).as_ref().map(describe)
    }

    pub fn descriptions(&self) -> Vec<Description> {
        self.refresh().iter().map(describe).collect()
    }
}

fn reason(problems: &[Problem]) -> String {
    format!(
        "Manifest has {} problem{}: {}",
        problems.len(),
        if problems.len() == 1 { "" } else { "s" },
        problems
            .iter()
            .map(Problem::to_string)
            .collect::<Vec<_>>()
            .join("; ")
    )
}

fn describe(entry: &Entry) -> Description {
    let host = NativeHost {
        runtime: "gpui-shell".into(),
        version: "0.8.1".into(),
    };
    let view = NativeView {
        module: "voyager_content_view".into(),
        component: "Vessel".into(),
    };
    let problems: Vec<String> = entry.problems.iter().map(Problem::to_string).collect();
    let Some(manifest) = &entry.manifest else {
        return Description {
            type_id: entry.folder.clone(),
            name: entry.folder.clone(),
            availability: Availability::Unavailable {
                reason: reason(&entry.problems),
            },
            host,
            view,
            placements: vec![Placement::Fleet, Placement::Voyage],
            configuration: None,
            state: None,
            actions: None::<Actions>,
            backend: None,
            problems,
        };
    };
    let ready = !entry.removed;
    Description {
        type_id: manifest.id.clone(),
        name: manifest.name.clone(),
        availability: if ready {
            Availability::Ready
        } else {
            Availability::Removed
        },
        host,
        view,
        placements: vec![Placement::Fleet, Placement::Voyage],
        configuration: None,
        state: ready.then(|| DataDescription {
            schema: Some(manifest.state.schema.clone()),
            defaults: manifest.state.initial.clone(),
        }),
        actions: ready
            .then(|| super::operations::actions(manifest).ok())
            .flatten(),
        backend: manifest
            .backend
            .as_ref()
            .filter(|backend| backend.kind == BackendKind::CoreTerminal)
            .map(|_| Backend::CoreTerminal),
        problems,
    }
}
