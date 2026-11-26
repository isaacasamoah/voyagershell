use anyhow::{Context as _, Result, ensure};
use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
};
use voyager_app::content::install::{Absent, Shipped};
use voyager_app::folders::{cache_folder, runtime_folder};

const FILES: &[(&str, &[u8])] = &[
    (
        "canvas/main.js",
        include_bytes!("../canvas/main.js").as_slice(),
    ),
    (
        "canvas/ui.js",
        include_bytes!("../../content/ui.js").as_slice(),
    ),
    (
        "canvas/canvas.json",
        include_bytes!("../canvas/canvas.json").as_slice(),
    ),
    (
        "canvas/regions.js",
        include_bytes!("../canvas/regions.js").as_slice(),
    ),
    (
        "canvas/creation.js",
        include_bytes!("../canvas/creation.js").as_slice(),
    ),
    (
        "canvas/navigation-view.js",
        include_bytes!("../canvas/navigation-view.js").as_slice(),
    ),
    (
        "canvas/panel-view.js",
        include_bytes!("../canvas/panel-view.js").as_slice(),
    ),
    (
        "canvas/panels.js",
        include_bytes!("../canvas/panels.js").as_slice(),
    ),
    (
        "canvas/terminal-open.js",
        include_bytes!("../canvas/terminal-open.js").as_slice(),
    ),
    (
        "canvas/menu.js",
        include_bytes!("../canvas/menu.js").as_slice(),
    ),
    (
        "canvas/activity.js",
        include_bytes!("../canvas/activity.js").as_slice(),
    ),
    (
        "canvas/status.js",
        include_bytes!("../canvas/status.js").as_slice(),
    ),
    (
        "canvas/voyage-colours.js",
        include_bytes!("../canvas/voyage-colours.js").as_slice(),
    ),
    (
        "canvas/agents.js",
        include_bytes!("../canvas/agents.js").as_slice(),
    ),
    (
        "canvas/processes.js",
        include_bytes!("../canvas/processes.js").as_slice(),
    ),
    (
        "canvas/process-icons.js",
        include_bytes!("../canvas/process-icons.js").as_slice(),
    ),
    (
        "canvas/worktrees.js",
        include_bytes!("../canvas/worktrees.js").as_slice(),
    ),
    (
        "canvas/AGENTS.md",
        include_bytes!("../canvas/AGENTS.md").as_slice(),
    ),
    (
        "canvas/voyage-close.js",
        include_bytes!("../canvas/voyage-close.js").as_slice(),
    ),
    (
        "canvas/stop-session.js",
        include_bytes!("../canvas/stop-session.js").as_slice(),
    ),
    (
        "canvas/validate.js",
        include_bytes!("../../contract/generated/validate.js").as_slice(),
    ),
    (
        "canvas/workspace.js",
        include_bytes!("../../contract/generated/workspace.js").as_slice(),
    ),
    (
        "canvas/chat.js",
        include_bytes!("../canvas/chat.js").as_slice(),
    ),
    (
        "canvas/chat.svg",
        include_bytes!("../canvas/chat.svg").as_slice(),
    ),
    (
        "canvas/conversation.js",
        include_bytes!("../../contract/generated/conversation.js").as_slice(),
    ),
    (
        "canvas/home.svg",
        include_bytes!("../canvas/home.svg").as_slice(),
    ),
    (
        "canvas/activity.svg",
        include_bytes!("../canvas/activity.svg").as_slice(),
    ),
    (
        "canvas/sidebar.svg",
        include_bytes!("../canvas/sidebar.svg").as_slice(),
    ),
    (
        "canvas/sidebar-collapse.svg",
        include_bytes!("../canvas/sidebar-collapse.svg").as_slice(),
    ),
    (
        "canvas/bash.svg",
        include_bytes!("../canvas/bash.svg").as_slice(),
    ),
    (
        "canvas/note.svg",
        include_bytes!("../canvas/note.svg").as_slice(),
    ),
    (
        "canvas/openai.svg",
        include_bytes!("../canvas/openai.svg").as_slice(),
    ),
    (
        "canvas/anthropic.svg",
        include_bytes!("../canvas/anthropic.svg").as_slice(),
    ),
    (
        "canvas/icons-LICENSE.txt",
        include_bytes!("../canvas/icons-LICENSE.txt").as_slice(),
    ),
    (
        "canvas/icons-NOTICE.txt",
        include_bytes!("../canvas/icons-NOTICE.txt").as_slice(),
    ),
    (
        "canvas/helmet.svg",
        include_bytes!("../canvas/helmet.svg").as_slice(),
    ),
    (
        "canvas/orbit.svg",
        include_bytes!("../canvas/orbit.svg").as_slice(),
    ),
    (
        "canvas/voyager.svg",
        include_bytes!("../canvas/voyager.svg").as_slice(),
    ),
    (
        "canvas/split-horizontal.svg",
        include_bytes!("../canvas/split-horizontal.svg").as_slice(),
    ),
    (
        "canvas/split-vertical.svg",
        include_bytes!("../canvas/split-vertical.svg").as_slice(),
    ),
    (
        "canvas/close.svg",
        include_bytes!("../canvas/close.svg").as_slice(),
    ),
    (
        "canvas/embed.svg",
        include_bytes!("../canvas/embed.svg").as_slice(),
    ),
    (
        "canvas/overlay.svg",
        include_bytes!("../canvas/overlay.svg").as_slice(),
    ),
    (
        "canvas/maximize.svg",
        include_bytes!("../canvas/maximize.svg").as_slice(),
    ),
    (
        "canvas/restore.svg",
        include_bytes!("../canvas/restore.svg").as_slice(),
    ),
    (
        "canvas/folder.svg",
        include_bytes!("../canvas/folder.svg").as_slice(),
    ),
    (
        "canvas/branch.svg",
        include_bytes!("../canvas/branch.svg").as_slice(),
    ),
    (
        "canvas/speech-wave.svg",
        include_bytes!("../canvas/speech-wave.svg").as_slice(),
    ),
    (
        "themes/voyager.json",
        include_bytes!("../themes/voyager.json").as_slice(),
    ),
];

pub enum StandardCanvas {
    NotNeeded,
    Drawn { _copy: Fallback },
    Failed(String),
}

impl StandardCanvas {
    pub fn needed(&self) -> bool {
        !matches!(self, Self::NotNeeded)
    }
}

pub struct Fallback {
    directory: PathBuf,
}

impl Fallback {
    pub fn write() -> Result<Self> {
        let set = |name| std::env::var_os(name).filter(|value| !value.is_empty());
        Self::write_in(set("XDG_RUNTIME_DIR"), set("XDG_CACHE_HOME"), set("HOME"))
    }

    fn write_in(
        runtime: Option<OsString>,
        cache: Option<OsString>,
        home: Option<OsString>,
    ) -> Result<Self> {
        let base = match runtime_folder(runtime) {
            Some(runtime) => runtime,
            None => {
                let cache = cache_folder(cache, home)
                    .context("No runtime or cache folder for the shipped canvas copy")?;
                private_folder(&cache.join("voyager"))?
            }
        };
        let directory = base.join(format!("voyager-shipped-canvas-{}", std::process::id()));
        match fs::remove_dir_all(&directory) {
            Ok(()) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(error) => return Err(error).context("Clearing the shipped canvas copy"),
        }
        create_private(&directory).context("Creating the shipped canvas copy")?;
        let fallback = Self { directory };
        ensure_same_owner(&fallback.directory, &base)?;
        for (path, bytes) in FILES {
            let Some(name) = path.strip_prefix("canvas/") else {
                continue;
            };
            let target = fallback.directory.join(name);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).context("Creating the shipped canvas copy")?;
            }
            fs::write(&target, bytes).context("Writing the shipped canvas copy")?;
        }
        Ok(fallback)
    }

    pub fn path(&self) -> &Path {
        &self.directory
    }
}

fn private_folder(folder: &Path) -> Result<PathBuf> {
    if let Some(parent) = folder.parent() {
        fs::create_dir_all(parent).context("Creating the cache folder")?;
    }
    match fs::symlink_metadata(folder) {
        Ok(found) => {
            ensure!(
                found.file_type().is_dir(),
                "{} is a link or not a folder, so the shipped canvas copy is not written there",
                folder.display()
            );
            set_private(folder).context("Making the cache folder private")?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            create_private(folder).context("Creating the cache folder")?;
        }
        Err(error) => return Err(error).context("Reading the cache folder"),
    }
    Ok(folder.to_path_buf())
}

#[cfg(unix)]
fn create_private(folder: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::DirBuilderExt;
    fs::DirBuilder::new().mode(0o700).create(folder)
}

#[cfg(not(unix))]
fn create_private(folder: &Path) -> std::io::Result<()> {
    fs::create_dir(folder)
}

#[cfg(unix)]
fn set_private(folder: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(folder, fs::Permissions::from_mode(0o700))
}

#[cfg(not(unix))]
fn set_private(_folder: &Path) -> std::io::Result<()> {
    Ok(())
}

#[cfg(unix)]
fn ensure_same_owner(created: &Path, parent: &Path) -> Result<()> {
    use std::os::unix::fs::MetadataExt;
    ensure!(
        fs::metadata(created)?.uid() == fs::metadata(parent)?.uid(),
        "{} belongs to someone else, so the shipped canvas copy is not written there",
        parent.display()
    );
    Ok(())
}

#[cfg(not(unix))]
fn ensure_same_owner(_created: &Path, _parent: &Path) -> Result<()> {
    Ok(())
}

impl Drop for Fallback {
    fn drop(&mut self) {
        match fs::remove_dir_all(&self.directory) {
            Ok(()) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(error) => eprintln!("The shipped canvas copy was not removed: {error}"),
        }
    }
}

pub fn files() -> Vec<Shipped<'static>> {
    FILES
        .iter()
        .map(|(path, bytes)| Shipped {
            path,
            bytes,
            absent: Absent::Write,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use voyager_app::content::install::{fingerprint, install};

    const OLD: [&str; 4] = ["main.js", "ui.js", "vessel.json", "validate.js"];

    fn scratch(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("voyager-fallback-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn the_fallback_holds_every_shipped_canvas_file_and_is_removed_on_drop() {
        let root = scratch("holds");
        let runtime = Some(root.clone().into_os_string());
        let fallback = Fallback::write_in(runtime.clone(), None, None).unwrap();
        let directory = fallback.path().to_path_buf();
        for (path, bytes) in FILES {
            if let Some(name) = path.strip_prefix("canvas/") {
                assert_eq!(&fs::read(directory.join(name)).unwrap(), bytes, "{name}");
            }
        }
        fs::write(directory.join("stale.js"), b"stale").unwrap();
        drop(fallback);
        assert!(!directory.exists());
        let again = Fallback::write_in(runtime, None, None).unwrap();
        assert!(!again.path().join("stale.js").exists());
        drop(again);
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn without_a_runtime_folder_the_copy_lands_in_the_private_cache_folder_and_nowhere_else() {
        use std::os::unix::fs::PermissionsExt;
        let root = scratch("cache");
        let cache = root.join("cache");
        let fallback =
            Fallback::write_in(None, Some(cache.clone().into_os_string()), None).unwrap();
        let folder = cache.join("voyager");
        assert_eq!(
            fallback.path(),
            folder.join(format!("voyager-shipped-canvas-{}", std::process::id()))
        );
        let mode = |path: &Path| fs::metadata(path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&folder), 0o700);
        assert_eq!(mode(fallback.path()), 0o700);
        assert!(fallback.path().join("main.js").is_file());
        let mut entries = fs::read_dir(&root)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect::<Vec<_>>();
        entries.sort();
        assert_eq!(entries, ["cache"]);
        drop(fallback);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn the_cache_folder_defaults_to_the_home_cache_and_never_to_a_shared_temp_folder() {
        let root = scratch("home");
        let home = Some(root.clone().into_os_string());
        let fallback = Fallback::write_in(None, None, home).unwrap();
        assert!(fallback.path().starts_with(root.join(".cache/voyager")));
        drop(fallback);
        assert!(Fallback::write_in(None, None, None).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    fn relative_name(tag: &str) -> String {
        format!("voyager-relative-{tag}-{}", std::process::id())
    }

    #[test]
    fn a_relative_cache_folder_is_ignored_and_the_copy_never_lands_under_the_working_folder() {
        let root = scratch("relative-cache");
        let relative = relative_name("cache");
        let result = Fallback::write_in(
            None,
            Some(OsString::from(&relative)),
            Some(root.clone().into_os_string()),
        );
        let landed = Path::new(&relative).exists();
        let _ = fs::remove_dir_all(&relative);
        assert!(!landed, "the copy landed under the working folder");
        let fallback = result.unwrap();
        assert!(fallback.path().starts_with(root.join(".cache/voyager")));
        drop(fallback);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_relative_runtime_folder_is_ignored_and_the_copy_goes_to_the_cache_folder() {
        let root = scratch("relative-runtime");
        let relative = relative_name("runtime");
        let cache = root.join("cache");
        let result = Fallback::write_in(
            Some(OsString::from(&relative)),
            Some(cache.clone().into_os_string()),
            None,
        );
        let landed = Path::new(&relative).exists();
        let _ = fs::remove_dir_all(&relative);
        assert!(!landed, "the copy landed under the working folder");
        let fallback = result.unwrap();
        assert!(fallback.path().starts_with(cache.join("voyager")));
        drop(fallback);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn with_only_relative_folders_the_copy_is_refused_and_nothing_is_written() {
        let relative = relative_name("none");
        let result = Fallback::write_in(
            Some(OsString::from(".")),
            Some(OsString::from(&relative)),
            Some(OsString::from(&relative)),
        );
        let copy = Path::new(".").join(format!("voyager-shipped-canvas-{}", std::process::id()));
        let landed = copy.exists() || Path::new(&relative).exists();
        let _ = fs::remove_dir_all(&copy);
        let _ = fs::remove_dir_all(&relative);
        assert!(!landed, "the copy landed under the working folder");
        assert!(result.is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_cache_folder_that_is_a_link_is_refused() {
        let root = scratch("link");
        let elsewhere = root.join("elsewhere");
        let cache = root.join("cache");
        fs::create_dir_all(&elsewhere).unwrap();
        fs::create_dir_all(&cache).unwrap();
        std::os::unix::fs::symlink(&elsewhere, cache.join("voyager")).unwrap();
        let refusal = Fallback::write_in(None, Some(cache.into_os_string()), None);
        assert!(refusal.is_err());
        assert_eq!(fs::read_dir(&elsewhere).unwrap().count(), 0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_start_removes_untouched_old_notes_copies_and_keeps_edits_data_and_project_notes() {
        let root = std::env::temp_dir().join(format!("voyager-retired-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let profile = root.join("profile");
        let package = profile.join("vessels/notes");
        fs::create_dir_all(&package).unwrap();
        fs::create_dir_all(profile.join("data")).unwrap();
        let project = root.join("project/notes");
        fs::create_dir_all(&project).unwrap();
        let mut record = serde_json::Map::new();
        for name in OLD {
            let bytes = format!("shipped {name}\n");
            fs::write(package.join(name), &bytes).unwrap();
            record.insert(
                format!("vessels/notes/{name}"),
                format!("{:016x}", fingerprint(bytes.as_bytes())).into(),
            );
        }
        fs::write(
            profile.join("installed.json"),
            serde_json::json!({"version": 1, "files": record}).to_string(),
        )
        .unwrap();
        fs::write(package.join("main.js"), "personal edit\n").unwrap();
        fs::write(package.join("AGENTS.md"), "personal guide\n").unwrap();
        fs::write(
            profile.join("data/note-1.json"),
            "{\"title\":\"T\",\"text\":\"x\"}",
        )
        .unwrap();
        fs::write(project.join("Title.md"), "# Title\n").unwrap();
        for _ in 0..2 {
            install(&profile, &files()).unwrap();
            for name in ["ui.js", "vessel.json", "validate.js"] {
                assert!(!package.join(name).exists(), "{name}");
            }
            assert_eq!(
                fs::read(package.join("main.js")).unwrap(),
                b"personal edit\n"
            );
            assert_eq!(
                fs::read(package.join("AGENTS.md")).unwrap(),
                b"personal guide\n"
            );
            assert!(profile.join("data/note-1.json").is_file());
            assert_eq!(fs::read(project.join("Title.md")).unwrap(), b"# Title\n");
            let kept = fs::read_to_string(profile.join("installed.json")).unwrap();
            assert!(!kept.contains("vessels/notes/"), "{kept}");
        }
        fs::remove_dir_all(root).unwrap();
    }
}
