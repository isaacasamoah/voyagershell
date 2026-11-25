use std::{
    fs::{self, File, OpenOptions, TryLockError},
    path::Path,
};

const FILE: &str = "app.lock";

#[derive(Debug)]
pub struct ProfileLock {
    _file: File,
}

impl ProfileLock {
    pub fn hold(profile: &Path) -> Result<Self, String> {
        fs::create_dir_all(profile).map_err(|error| format!("{}: {error}", profile.display()))?;
        let path = profile.join(FILE);
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(&path)
            .map_err(|error| format!("{}: {error}", path.display()))?;
        match file.try_lock() {
            Ok(()) => Ok(Self { _file: file }),
            Err(TryLockError::WouldBlock) => Err(format!(
                "Another VoyagerShell is already running on the profile {}",
                profile.display()
            )),
            Err(TryLockError::Error(error)) => Err(format!("{}: {error}", path.display())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_app_holds_a_profile_until_it_ends() {
        let profile =
            std::env::temp_dir().join(format!("voyager-profile-lock-{}", std::process::id()));
        let _ = fs::remove_dir_all(&profile);
        let held = ProfileLock::hold(&profile).unwrap();
        let refusal = ProfileLock::hold(&profile).unwrap_err();
        assert!(refusal.contains("already running"), "{refusal}");
        drop(held);
        let again = ProfileLock::hold(&profile).unwrap();
        drop(again);
        fs::remove_dir_all(profile).unwrap();
    }
}
