use anyhow::{Context as _, Result};
use std::{
    fs,
    path::{Path, PathBuf},
};
use voyager_app::content::install::{Absent, Shipped};

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
    Drawn(Fallback),
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
        let base = std::env::var_os("XDG_RUNTIME_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir);
        let directory = base.join(format!("voyager-shipped-canvas-{}", std::process::id()));
        match fs::remove_dir_all(&directory) {
            Ok(()) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(error) => return Err(error).context("Clearing the shipped canvas copy"),
        }
        let fallback = Self { directory };
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

    #[test]
    fn the_fallback_holds_every_shipped_canvas_file_and_is_removed_on_drop() {
        let fallback = Fallback::write().unwrap();
        let directory = fallback.path().to_path_buf();
        for (path, bytes) in FILES {
            if let Some(name) = path.strip_prefix("canvas/") {
                assert_eq!(&fs::read(directory.join(name)).unwrap(), bytes, "{name}");
            }
        }
        fs::write(directory.join("stale.js"), b"stale").unwrap();
        drop(fallback);
        assert!(!directory.exists());
        let again = Fallback::write().unwrap();
        assert!(!again.path().join("stale.js").exists());
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
