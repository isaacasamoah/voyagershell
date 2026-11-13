use crate::system::{stamp, until};
use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Once;

const ALIVE: &str = "alive.lock";

pub struct Scratch {
    path: PathBuf,
    _alive: File,
}

impl Scratch {
    pub fn new(label: &str) -> io::Result<Self> {
        static SWEPT: Once = Once::new();
        SWEPT.call_once(sweep);
        let path =
            std::env::temp_dir().join(format!("vv-{label}-{}-{}", std::process::id(), stamp()));
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

fn sweep() {
    let Ok(entries) = fs::read_dir(std::env::temp_dir()) else {
        return;
    };
    for entry in entries.flatten() {
        if !entry.file_name().to_string_lossy().starts_with("vv-") {
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
        let live = Scratch::new("live")?;
        let named = |state: &str| {
            std::env::temp_dir().join(format!("vv-{state}-{}-{}", std::process::id(), stamp()))
        };
        let abandoned = named("abandoned");
        fs::create_dir_all(abandoned.join("session"))?;
        File::create_new(abandoned.join(ALIVE))?;
        let foreign = named("foreign");
        fs::create_dir(&foreign)?;
        sweep();
        let removed = until("abandoned folder removal", || {
            Ok((!abandoned.exists()).then_some(()))
        });
        let kept = (live.path().exists(), foreign.exists());
        fs::remove_dir(&foreign)?;
        removed?;
        ensure!(
            kept == (true, true),
            "Live and lockless folders kept: {kept:?}"
        );
        Ok(())
    }
}
