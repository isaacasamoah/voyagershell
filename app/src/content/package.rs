use std::{
    io,
    path::{Path, PathBuf},
};

fn removed_path(package: &Path) -> PathBuf {
    package.with_file_name(format!(
        ".{}.removed",
        package.file_name().unwrap_or_default().to_string_lossy()
    ))
}

pub(crate) fn remove(package: &Path) -> Result<(), String> {
    let removed = removed_path(package);
    if !package.exists() || removed.exists() {
        return Err("Vessel package is missing or already removed".into());
    }
    move_package(package, &removed)
}

pub(crate) fn restore(package: &Path) -> Result<(), String> {
    let removed = removed_path(package);
    if package.exists() || !removed.exists() {
        return Err("Restore requires a removed package and an empty destination".into());
    }
    move_package(&removed, package)
}

#[cfg(target_os = "linux")]
fn move_package(source: &Path, destination: &Path) -> Result<(), String> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let source = CString::new(source.as_os_str().as_bytes()).map_err(|error| error.to_string())?;
    let destination =
        CString::new(destination.as_os_str().as_bytes()).map_err(|error| error.to_string())?;
    let result = unsafe {
        libc::renameat2(
            libc::AT_FDCWD,
            source.as_ptr(),
            libc::AT_FDCWD,
            destination.as_ptr(),
            libc::RENAME_NOREPLACE,
        )
    };
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error().to_string())
    }
}

#[cfg(not(target_os = "linux"))]
fn move_package(_source: &Path, _destination: &Path) -> Result<(), String> {
    Err("Atomic package preserve/restore is not supported on this platform".into())
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use crate::content::{Owner, describe, discover_all, open_registry};
    use std::fs;
    use voyager_contract::content::Availability;

    const MANIFEST: &str = r#"{
  "contract": 1, "id": "tally", "name": "Tally", "version": 1,
  "state": {
    "schema": {"type": "object", "additionalProperties": false, "required": ["count"],
      "properties": {"count": {"type": "number"}}},
    "initial": {"count": 0}
  },
  "actions": {"copy": {"rebase": "always", "effect": [{"op": "set", "path": "count", "value": "count"}]}},
  "view": {"source": "view.vx"}
}"#;

    #[test]
    fn removed_package_restores_personal_source_without_disabling_terminal() {
        let profile = std::env::temp_dir().join(format!("voyager-package-{}", std::process::id()));
        let _ = fs::remove_dir_all(&profile);
        let packages = profile.join("vessels");
        let active = packages.join("tally");
        let removed = packages.join(".tally.removed");
        fs::create_dir_all(&active).unwrap();
        fs::write(active.join("manifest.json"), MANIFEST).unwrap();
        fs::write(active.join("view.vx"), "personal view source").unwrap();
        fs::write(active.join("AGENTS.md"), "personal guide").unwrap();
        let mut owner = Owner::open(&profile).unwrap();
        let data = profile.join("data/stable.json");
        fs::write(&data, "kept").unwrap();
        owner.require_available("tally").unwrap();
        owner.remove_package("tally").unwrap();
        assert_eq!(
            owner.require_available("tally").unwrap_err(),
            "Vessel package is removed"
        );
        assert!(owner.require_available("terminal").is_ok());
        assert!(!active.exists());
        assert_eq!(
            fs::read(removed.join("view.vx")).unwrap(),
            b"personal view source"
        );
        let catalog = discover_all(&open_registry(packages)).unwrap();
        let tally = catalog
            .types
            .iter()
            .find(|kind| kind.type_id == "tally")
            .unwrap();
        assert_eq!(tally.availability, Availability::Removed);
        assert!(tally.state.is_none() && tally.actions.is_none());
        assert_eq!(
            describe("terminal").unwrap().availability,
            Availability::Ready
        );
        owner.restore_package("tally").unwrap();
        owner.require_available("tally").unwrap();
        assert_eq!(
            fs::read(active.join("view.vx")).unwrap(),
            b"personal view source"
        );
        assert_eq!(
            fs::read(active.join("AGENTS.md")).unwrap(),
            b"personal guide"
        );
        assert_eq!(fs::read(&data).unwrap(), b"kept");
        owner.remove_package("tally").unwrap();
        fs::create_dir(&active).unwrap();
        assert!(super::move_package(&removed, &active).is_err());
        assert!(removed.join("view.vx").exists());
        fs::write(active.join("view.vx"), "new personal package").unwrap();
        assert!(owner.restore_package("tally").is_err());
        assert_eq!(
            fs::read(active.join("view.vx")).unwrap(),
            b"new personal package"
        );
        assert_eq!(
            fs::read(removed.join("view.vx")).unwrap(),
            b"personal view source"
        );
        assert!(owner.remove_package("terminal").is_err());
        assert!(owner.remove_package("../tally").is_err());
        fs::remove_dir_all(profile).unwrap();
    }
}
