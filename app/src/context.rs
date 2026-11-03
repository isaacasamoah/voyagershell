use std::{collections::BTreeSet, fs, io::Read, path::Path, sync::Arc};
use voyager_contract::{
    Layout,
    context::{Branch, Directory, Facts},
};

pub(crate) fn capture(layout: &Arc<Layout>, version: u64) -> Result<Facts, String> {
    let focus = crate::conversation::focus(layout, version)?;
    let scoped = crate::scope::project(layout, Some(&layout.context));
    let directories: BTreeSet<_> = scoped
        .contents
        .iter()
        .map(|content| content.cwd.as_str())
        .collect();
    let directory = match directories.len() {
        1 => directories
            .first()
            .filter(|path| path.len() <= 4096)
            .map_or(Directory::Unavailable, |path| Directory::Known {
                path: (*path).to_owned(),
            }),
        0 => Directory::Unavailable,
        _ => Directory::Multiple,
    };
    Ok(Facts {
        version,
        scope: layout.context.clone(),
        path: focus.path,
        directory,
        branch: Branch::Unavailable,
    })
}

pub fn resolve(mut facts: Facts) -> Facts {
    if let Directory::Known { path } = &facts.directory {
        facts.branch = branch(Path::new(path));
    }
    facts
}

fn small_file(path: &Path) -> Option<String> {
    let mut bytes = Vec::new();
    fs::File::open(path)
        .ok()?
        .take(4097)
        .read_to_end(&mut bytes)
        .ok()?;
    (bytes.len() <= 4096)
        .then(|| String::from_utf8(bytes).ok())
        .flatten()
}

fn branch(cwd: &Path) -> Branch {
    if !cwd.is_dir() {
        return Branch::Unavailable;
    }
    for parent in cwd.ancestors().take(128) {
        let marker = parent.join(".git");
        match fs::symlink_metadata(&marker) {
            Ok(_) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(_) => return Branch::Unavailable,
        }
        let git = if marker.is_dir() {
            marker
        } else if marker.is_file() {
            let Some(value) = small_file(&marker) else {
                return Branch::Unavailable;
            };
            let Some(path) = value.trim().strip_prefix("gitdir: ") else {
                return Branch::Unavailable;
            };
            parent.join(path)
        } else {
            return Branch::Unavailable;
        };
        let Some(value) = small_file(&git.join("HEAD")) else {
            return Branch::Unavailable;
        };
        let head = value.trim();
        if let Some(name) = head.strip_prefix("ref: refs/heads/") {
            return if !name.is_empty() && !name.contains(['\n', '\r']) {
                Branch::Named { name: name.into() }
            } else {
                Branch::Unavailable
            };
        }
        return if matches!(head.len(), 40 | 64) && head.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            Branch::Detached
        } else {
            Branch::Unavailable
        };
    }
    Branch::Unavailable
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use voyager_contract::{Action, Context};

    #[test]
    fn dock_facts_read_worktree_metadata_and_keep_multiple_directories_honest() {
        let root = std::env::temp_dir().join(format!("voyager-context-{}", std::process::id()));
        let project = root.join("project");
        let git = root.join("metadata");
        fs::create_dir_all(project.join("nested")).unwrap();
        fs::create_dir_all(&git).unwrap();
        fs::write(project.join(".git"), "gitdir: ../metadata\n").unwrap();
        fs::write(git.join("HEAD"), "ref: refs/heads/feature/work\n").unwrap();
        let mut model = crate::workspace::Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "One".into(),
                cwd: project.join("nested").to_string_lossy().into_owned(),
            })
            .unwrap();
        let facts = resolve(capture(&Arc::new(model.layout.clone()), 42).unwrap());
        assert_eq!(facts.scope, Context::Workspace);
        assert_eq!(facts.version, 42);
        assert_eq!(
            facts.branch,
            Branch::Named {
                name: "feature/work".into()
            }
        );
        fs::write(
            git.join("HEAD"),
            "0123456789abcdef0123456789abcdef01234567\n",
        )
        .unwrap();
        assert_eq!(
            resolve(capture(&Arc::new(model.layout.clone()), 43).unwrap()).branch,
            Branch::Detached
        );
        model
            .apply(Action::CreateVoyage {
                name: "Two".into(),
                cwd: "/different".into(),
            })
            .unwrap();
        let facts = resolve(capture(&Arc::new(model.layout.clone()), 44).unwrap());
        assert_eq!(facts.directory, Directory::Multiple);
        assert_eq!(facts.branch, Branch::Unavailable);
        fs::remove_dir_all(root).unwrap();
    }
}
