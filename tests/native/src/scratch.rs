use crate::system::stamp;
use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Once;
use std::sync::atomic::{AtomicU64, Ordering};

const ALIVE: &str = "alive.lock";

pub struct Scratch {
    path: PathBuf,
    _alive: File,
}

impl Scratch {
    pub fn new(label: &str) -> io::Result<Self> {
        static SWEPT: Once = Once::new();
        static COUNT: AtomicU64 = AtomicU64::new(0);
        SWEPT.call_once(|| sweep(&std::env::temp_dir()));
        let path = std::env::temp_dir().join(format!(
            "vv-{label}-{}-{}-{}",
            std::process::id(),
            stamp(),
            COUNT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path)?;
        let starting = path.join("alive.new");
        let alive = File::create_new(&starting)?;
        alive.try_lock()?;
        fs::rename(starting, path.join(ALIVE))?;
        Ok(Self {
            path,
            _alive: alive,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        if let Err(error) = remove(&self.path) {
            eprintln!("Left {}: {error}", self.path.display());
        }
    }
}

fn remove(folder: &Path) -> io::Result<()> {
    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        if entry.file_name() == ALIVE {
            continue;
        }
        if entry.file_type()?.is_dir() {
            fs::remove_dir_all(entry.path())?;
        } else {
            fs::remove_file(entry.path())?;
        }
    }
    fs::remove_file(folder.join(ALIVE))?;
    fs::remove_dir(folder)
}

fn sweep(root: &Path) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        if !entry.file_name().to_string_lossy().starts_with("vv-")
            || !entry.file_type().is_ok_and(|kind| kind.is_dir())
        {
            continue;
        }
        let folder = entry.path();
        let Ok(alive) = File::open(folder.join(ALIVE)) else {
            continue;
        };
        if alive.try_lock().is_err() {
            continue;
        }
        if let Err(error) = remove(&folder) {
            eprintln!("Skipped abandoned {}: {error}", folder.display());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::{Result, ensure};

    #[test]
    fn a_failing_test_removes_its_folder() -> Result<()> {
        let mut path = None;
        let unwound = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let scratch = Scratch::new("unwind").expect("Scratch folder");
            fs::create_dir_all(scratch.path().join("evidence/home")).expect("Nested folder");
            fs::write(scratch.path().join("evidence/home/file"), b"x").expect("Nested file");
            path = Some(scratch.path().to_owned());
            panic!("failed assertion");
        }));
        ensure!(unwound.is_err(), "The test did not fail");
        let path = path.expect("Folder was created");
        ensure!(!path.exists(), "Failed test left {}", path.display());
        Ok(())
    }

    #[test]
    fn a_sweep_removes_only_abandoned_folders() -> Result<()> {
        let outer = Scratch::new("sweep")?;
        let root = outer.path();
        let named = |state: &str| root.join(format!("vv-{state}-1-1"));
        let live = named("live");
        fs::create_dir(&live)?;
        let held = File::create_new(live.join(ALIVE))?;
        held.try_lock()?;
        let abandoned = named("abandoned");
        fs::create_dir_all(abandoned.join("session"))?;
        File::create_new(abandoned.join(ALIVE))?;
        let foreign = named("foreign");
        fs::create_dir(&foreign)?;
        sweep(root);
        ensure!(!abandoned.exists(), "Abandoned folder kept");
        ensure!(live.exists(), "Live folder removed");
        ensure!(foreign.exists(), "Lockless folder removed");
        Ok(())
    }

    #[test]
    fn a_sweep_does_not_follow_a_symlink() -> Result<()> {
        let outer = Scratch::new("link")?;
        let root = outer.path().join("root");
        let victim = outer.path().join("victim");
        fs::create_dir(&root)?;
        fs::create_dir(&victim)?;
        File::create_new(victim.join(ALIVE))?;
        fs::write(victim.join("precious"), b"x")?;
        let link = root.join("vv-link-1-1");
        std::os::unix::fs::symlink(&victim, &link)?;
        sweep(&root);
        ensure!(
            victim.join("precious").exists(),
            "Sweep followed the symlink"
        );
        ensure!(link.symlink_metadata().is_ok(), "Sweep removed the symlink");
        Ok(())
    }
}
