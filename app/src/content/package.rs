use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

pub(crate) fn removed_path(package: &Path) -> PathBuf {
    package.with_file_name(format!(
        ".{}.removed",
        package.file_name().unwrap_or_default().to_string_lossy()
    ))
}

pub fn seed_package(package: &Path, files: &[(&str, &str)]) -> io::Result<()> {
    if package.exists() || removed_path(package).exists() {
        return Ok(());
    }
    fs::create_dir_all(package)?;
    for (name, source) in files {
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(package.join(name))?
            .write_all(source.as_bytes())?;
    }
    Ok(())
}

pub(crate) fn remove(package: &Path) -> Result<(), String> {
    let removed = removed_path(package);
    if !package.exists() || removed.exists() {
        return Err("Content package is missing or already removed".into());
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
    use crate::content::{Owner, describe, discover, seed_package};
    use std::fs;
    use voyager_contract::{ContentId, content::Availability};

    #[test]
    fn removed_package_restores_personal_source_without_disabling_terminal() {
        let profile = std::env::temp_dir().join(format!("voyager-package-{}", std::process::id()));
        let packages = profile.join("mods");
        let active = packages.join("notes");
        let removed = packages.join(".notes.removed");
        fs::create_dir_all(&packages).unwrap();
        let files = [
            ("main.js", "personal notes source"),
            ("mod.json", include_str!("../../../content/notes/mod.json")),
        ];
        seed_package(&active, &files).unwrap();
        fs::write(active.join("AGENTS.md"), "personal guide").unwrap();
        let mut owner = Owner::open(&profile).unwrap();
        let binding = owner.initialize(&ContentId("stable-note".into())).unwrap();
        let view = owner.register_view(binding.clone()).unwrap();
        view.activate().unwrap();
        let changes = owner.subscribe(&binding, Some(0));
        let original_data = fs::read(profile.join("data/stable-note.json")).unwrap();
        owner
            .remove_package(crate::content_type::NOTES_TYPE)
            .unwrap();
        assert!(!view.is_active());
        assert_eq!(changes.try_recv().unwrap(), 1);
        assert!(
            owner
                .require_available(crate::content_type::NOTES_TYPE)
                .is_err()
        );
        assert!(owner.require_available("terminal").is_ok());
        assert!(!active.exists());
        assert_eq!(
            fs::read(removed.join("main.js")).unwrap(),
            files[0].1.as_bytes()
        );
        seed_package(&active, &[("main.js", "shipped replacement")]).unwrap();
        assert!(
            !active.exists(),
            "Restart must not reinstall removed source"
        );
        let catalog = discover(&packages).unwrap();
        let notes = catalog
            .types
            .iter()
            .find(|kind| kind.type_id == crate::content_type::NOTES_TYPE)
            .unwrap();
        assert_eq!(notes.availability, Availability::Removed);
        assert!(notes.state.is_none() && notes.actions.is_none());
        assert_eq!(
            describe(&packages, "terminal").unwrap().availability,
            Availability::Ready
        );
        let restored = owner.subscribe(&binding, Some(1));
        owner
            .restore_package(crate::content_type::NOTES_TYPE)
            .unwrap();
        assert!(
            !view.is_active(),
            "Restore must not revive old view authority"
        );
        assert_eq!(restored.try_recv().unwrap(), 2);
        assert_eq!(
            fs::read(active.join("main.js")).unwrap(),
            files[0].1.as_bytes()
        );
        assert_eq!(
            fs::read(active.join("AGENTS.md")).unwrap(),
            b"personal guide"
        );
        assert_eq!(
            fs::read(profile.join("data/stable-note.json")).unwrap(),
            original_data
        );
        fs::remove_file(active.join("main.js")).unwrap();
        assert!(
            owner
                .require_available(crate::content_type::NOTES_TYPE)
                .is_err()
        );
        seed_package(&active, &files).unwrap();
        assert!(
            !active.join("main.js").exists(),
            "Partial personal packages must not be repaired implicitly"
        );
        fs::write(active.join("main.js"), files[0].1).unwrap();
        let huge = serde_json::json!({"name":"Notes", "entry":"main.js", "version":1, "stateSchema":{"description":"x".repeat(crate::content::ENVELOPE_LIMIT - 256), "type":"object"}});
        assert!(serde_json::to_vec(&huge).unwrap().len() <= crate::content::ENVELOPE_LIMIT);
        fs::write(active.join("mod.json"), serde_json::to_vec(&huge).unwrap()).unwrap();
        let catalog = discover(&packages).unwrap();
        assert!(serde_json::to_vec(&catalog).unwrap().len() <= crate::content::ENVELOPE_LIMIT);
        assert!(
            owner
                .require_available(crate::content_type::NOTES_TYPE)
                .is_err()
        );
        assert!(owner.require_available("terminal").is_ok());
        fs::write(active.join("mod.json"), "invalid personal metadata").unwrap();
        let catalog = discover(&packages).unwrap();
        assert!(matches!(
            catalog
                .types
                .iter()
                .find(|kind| kind.type_id == crate::content_type::NOTES_TYPE)
                .unwrap()
                .availability,
            Availability::Unavailable { .. }
        ));
        assert_eq!(
            describe(&packages, "terminal").unwrap().availability,
            Availability::Ready
        );
        seed_package(&active, &files).unwrap();
        assert_eq!(
            fs::read(active.join("mod.json")).unwrap(),
            b"invalid personal metadata"
        );
        owner
            .remove_package(crate::content_type::NOTES_TYPE)
            .unwrap();
        fs::create_dir(&active).unwrap();
        assert!(super::move_package(&removed, &active).is_err());
        assert!(removed.join("main.js").exists());
        fs::write(active.join("main.js"), "new personal package").unwrap();
        assert!(
            owner
                .restore_package(crate::content_type::NOTES_TYPE)
                .is_err()
        );
        assert_eq!(
            fs::read(active.join("main.js")).unwrap(),
            b"new personal package"
        );
        assert_eq!(
            fs::read(removed.join("main.js")).unwrap(),
            files[0].1.as_bytes()
        );
        assert!(owner.remove_package("terminal").is_err());
        assert!(owner.remove_package("../notes").is_err());
        fs::remove_dir_all(profile).unwrap();
    }
}
