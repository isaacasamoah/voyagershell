use super::*;
use crate::install::{COMMAND, SHELL};
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let path =
            std::env::temp_dir().join(format!("voyager-release-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    fn install(&self) -> Install {
        Install::at(self.0.join("install"))
    }

    fn archive(&self, says: &str) -> (String, String) {
        let work = self.0.join(format!("pack-{says}"));
        let folder = work.join("voyagershell");
        fs::create_dir_all(&folder).unwrap();
        let shell = folder.join(SHELL);
        fs::write(
            &shell,
            format!("#!/bin/sh\necho 'voyager-shell {says}'\necho 'core: 0.1.18'\n"),
        )
        .unwrap();
        fs::set_permissions(&shell, fs::Permissions::from_mode(0o755)).unwrap();
        fs::write(folder.join(COMMAND), format!("command {says}")).unwrap();
        fs::write(folder.join("LICENSE"), "MIT").unwrap();
        let archive = self.0.join(format!("{says}.tar.gz"));
        let packed = Command::new("tar")
            .arg("-czf")
            .arg(&archive)
            .arg("-C")
            .arg(&work)
            .arg("voyagershell")
            .status()
            .unwrap();
        assert!(packed.success());
        (
            format!("file://{}", archive.display()),
            digest(&archive).unwrap(),
        )
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn manifest(version: &str, url: &str, sha256: &str) -> Manifest {
    Manifest {
        version: version.parse().unwrap(),
        notes: String::new(),
        archive: Archive {
            url: url.into(),
            sha256: sha256.into(),
        },
    }
}

fn links(install: &Install) -> [Option<String>; 3] {
    [Link::Current, Link::Previous, Link::Next].map(|link| install.linked(link).unwrap())
}

fn builds(install: &Install) -> Vec<String> {
    let mut names: Vec<String> = match fs::read_dir(install.root().join("builds")) {
        Ok(entries) => entries
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .collect(),
        Err(_) => Vec::new(),
    };
    names.sort();
    names
}

fn version(text: &str) -> Version {
    text.parse().unwrap()
}

#[test]
fn a_published_manifest_parses_and_keeps_only_what_an_update_needs() {
    let published = serde_json::json!({
        "version": "0.1.1",
        "commit": "4aa675bc4aa675bc4aa675bc4aa675bc4aa675bc",
        "core_min": "0.1.18",
        "notes": "Faster scrolling.",
        "targets": {
            "linux-x86_64": {
                "url": "https://example.test/v0.1.1/voyagershell-linux-x86_64.tar.gz",
                "sha256": "AB".repeat(32),
            },
            "macos-aarch64": {"url": "elsewhere", "sha256": "none"},
        },
        "later": true,
    });
    assert_eq!(
        Manifest::parse(published.to_string().as_bytes()).unwrap(),
        Manifest {
            version: version("0.1.1"),
            notes: "Faster scrolling.".into(),
            archive: Archive {
                url: "https://example.test/v0.1.1/voyagershell-linux-x86_64.tar.gz".into(),
                sha256: "ab".repeat(32),
            },
        }
    );
}

#[test]
fn a_manifest_without_this_target_or_with_an_odd_field_is_refused() {
    let target = |url: &str, sha256: &str| serde_json::json!({"linux-x86_64": {"url": url, "sha256": sha256}});
    let cases = [
        (
            serde_json::json!({"version": "0.1.1", "targets": {}}),
            "no build for linux-x86_64",
        ),
        (
            serde_json::json!({"version": "0.1", "targets": target("u", &"a".repeat(64))}),
            "not a version",
        ),
        (
            serde_json::json!({"version": "0.1.1-rc.1", "targets": target("u", &"a".repeat(64))}),
            "not a version",
        ),
        (
            serde_json::json!({"version": "0.1.1", "targets": target("u", "abc")}),
            "64 hex",
        ),
        (
            serde_json::json!({"version": "0.1.1", "targets": target("", &"a".repeat(64))}),
            "url is empty",
        ),
        (
            serde_json::json!({"targets": target("u", &"a".repeat(64))}),
            "missing field `version`",
        ),
    ];
    for (published, reason) in cases {
        let refusal = Manifest::parse(published.to_string().as_bytes()).unwrap_err();
        assert!(refusal.contains(reason), "{published}: {refusal}");
    }
    assert!(Manifest::parse(b"<html>").is_err());
}

#[test]
fn versions_compare_by_number_not_by_text() {
    assert!(version("0.1.10") > version("0.1.9"));
    assert!(version("0.2.0") > version("0.1.99"));
    assert!(version("1.0.0") > version("0.9.9"));
    assert_eq!(version("0.1.0"), version("0.1.0"));
    assert_eq!(version("0.1.10").to_string(), "0.1.10");
    for odd in [
        "",
        "1",
        "0.1",
        "0.1.0.0",
        "v0.1.0",
        "0.1.x",
        "0.1.-1",
        "local-4aa675bc",
    ] {
        assert!(odd.parse::<Version>().is_err(), "{odd}");
    }
}

#[test]
fn the_releases_address_moves_only_in_a_release_build() {
    let elsewhere = Some("file:///srv/stand-in/".to_owned());
    assert_eq!(
        releases_for(true, elsewhere.clone()),
        "file:///srv/stand-in"
    );
    assert_eq!(releases_for(false, elsewhere), RELEASES);
    assert_eq!(releases_for(true, None), RELEASES);
    assert_eq!(releases_for(true, Some(String::new())), RELEASES);
    assert!(!release_build(), "the tests run as a source build");
}

#[test]
fn a_newer_release_is_staged_once_and_an_update_run_twice_downloads_nothing_more() {
    let scratch = Scratch::new("newer");
    let install = scratch.install();
    let (url, sha256) = scratch.archive("0.1.1");
    let latest = manifest("0.1.1", &url, &sha256);
    assert_eq!(
        stage(&install, &latest, Some(version("0.1.0"))).unwrap(),
        Staged::Next("0.1.1".into())
    );
    assert_eq!(builds(&install), ["0.1.1"]);
    assert_eq!(links(&install), [None, None, Some("0.1.1".into())]);
    assert_eq!(
        fs::read(install.build("0.1.1").join(COMMAND)).unwrap(),
        b"command 0.1.1"
    );
    assert!(install.build("0.1.1").join("LICENSE").is_file());
    assert!(!install.build("0.1.1").join(ARCHIVE).exists());
    fs::remove_file(url.trim_start_matches("file://")).unwrap();
    assert_eq!(
        stage(&install, &latest, Some(version("0.1.0"))).unwrap(),
        Staged::AlreadyNext("0.1.1".into())
    );
    assert_eq!(builds(&install), ["0.1.1"]);
    assert_eq!(links(&install), [None, None, Some("0.1.1".into())]);
}

#[test]
fn an_equal_or_older_release_stages_nothing_and_downloads_nothing() {
    let scratch = Scratch::new("older");
    let install = scratch.install();
    let nowhere = format!("file://{}/missing.tar.gz", scratch.0.display());
    let sha256 = "0".repeat(64);
    assert_eq!(
        stage(
            &install,
            &manifest("0.1.1", &nowhere, &sha256),
            Some(version("0.1.1"))
        )
        .unwrap(),
        Staged::AlreadyCurrent("0.1.1".into())
    );
    assert_eq!(
        stage(
            &install,
            &manifest("0.1.0", &nowhere, &sha256),
            Some(version("0.1.1"))
        )
        .unwrap(),
        Staged::Older {
            latest: "0.1.0".into(),
            current: "0.1.1".into()
        }
    );
    assert!(builds(&install).is_empty());
    assert_eq!(links(&install), [None, None, None]);
}

#[test]
fn a_checksum_mismatch_removes_the_download_and_leaves_next_alone() {
    let scratch = Scratch::new("checksum");
    let install = scratch.install();
    let (url, sha256) = scratch.archive("0.1.1");
    stage(&install, &manifest("0.1.1", &url, &sha256), None).unwrap();
    let (url, _) = scratch.archive("0.1.2");
    let refusal = stage(&install, &manifest("0.1.2", &url, &"0".repeat(64)), None).unwrap_err();
    assert!(refusal.contains("The download is damaged"), "{refusal}");
    assert_eq!(builds(&install), ["0.1.1"]);
    assert_eq!(links(&install), [None, None, Some("0.1.1".into())]);
}

#[test]
fn a_failed_download_removes_the_partial_folder_and_leaves_next_alone() {
    let scratch = Scratch::new("download");
    let install = scratch.install();
    let (url, sha256) = scratch.archive("0.1.1");
    stage(&install, &manifest("0.1.1", &url, &sha256), None).unwrap();
    let nowhere = format!("file://{}/missing.tar.gz", scratch.0.display());
    let refusal = stage(&install, &manifest("0.1.2", &nowhere, &sha256), None).unwrap_err();
    assert!(refusal.contains("The download of"), "{refusal}");
    assert_eq!(builds(&install), ["0.1.1"]);
    assert_eq!(links(&install), [None, None, Some("0.1.1".into())]);
}

#[test]
fn a_build_that_reports_another_version_is_refused() {
    let scratch = Scratch::new("says");
    let install = scratch.install();
    let (url, sha256) = scratch.archive("0.1.3");
    let refusal = stage(&install, &manifest("0.1.2", &url, &sha256), None).unwrap_err();
    assert!(refusal.contains("the manifest says 0.1.2"), "{refusal}");
    assert!(builds(&install).is_empty());
    assert_eq!(links(&install), [None, None, None]);
}

#[test]
fn a_failed_rename_removes_the_partial_folder_and_leaves_next_alone() {
    let scratch = Scratch::new("rename");
    let install = scratch.install();
    let (url, sha256) = scratch.archive("0.1.2");
    fs::create_dir_all(install.root().join("builds")).unwrap();
    fs::write(install.build("0.1.2"), "a file where the build folder goes").unwrap();
    let refusal = stage(&install, &manifest("0.1.2", &url, &sha256), None).unwrap_err();
    assert!(refusal.starts_with("Moving "), "{refusal}");
    assert_eq!(builds(&install), ["0.1.2"]);
    assert_eq!(links(&install), [None, None, None]);
}

#[test]
fn latest_reads_the_manifest_beside_the_archive() {
    let scratch = Scratch::new("latest");
    let site = scratch.0.join("site");
    fs::create_dir_all(&site).unwrap();
    fs::write(
        site.join(MANIFEST),
        serde_json::json!({"version": "0.1.1", "targets": {"linux-x86_64": {"url": "u", "sha256": "a".repeat(64)}}})
            .to_string(),
    )
    .unwrap();
    let releases = format!("file://{}", site.display());
    assert_eq!(latest(&releases).unwrap().version, version("0.1.1"));
    let refusal = latest(&format!("file://{}", scratch.0.display())).unwrap_err();
    assert!(refusal.starts_with("Cannot read file://"), "{refusal}");
}
