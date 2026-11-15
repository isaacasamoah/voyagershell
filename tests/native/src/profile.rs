use crate::system::digest;
use anyhow::{Context, Result, bail, ensure};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

pub type Seeded = BTreeMap<String, String>;

pub const MANIFEST: &str = "seeded.json";

pub fn fingerprints(root: &Path) -> Result<Seeded> {
    fn walk(root: &Path, folder: &Path, found: &mut Seeded) -> Result<()> {
        for entry in fs::read_dir(folder)? {
            let path = entry?.path();
            if fs::symlink_metadata(&path)?.is_dir() {
                walk(root, &path, found)?;
            } else {
                let relative = path
                    .strip_prefix(root)?
                    .to_str()
                    .context("A profile path is not UTF-8")?;
                found.insert(relative.to_owned(), digest(&path)?);
            }
        }
        Ok(())
    }
    let mut found = Seeded::new();
    walk(root, root, &mut found)?;
    Ok(found)
}

pub fn load(evidence: &Path) -> Result<Seeded> {
    match fs::read(evidence.join(MANIFEST)) {
        Ok(text) => serde_json::from_slice(&text).context("The seeded manifest is unreadable"),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Seeded::new()),
        Err(error) => Err(error.into()),
    }
}

pub fn differing(profile: &Path, seeded: &Seeded) -> Result<Vec<String>> {
    let now = fingerprints(profile)?;
    Ok(seeded
        .iter()
        .filter(|(path, hash)| now.get(*path) != Some(*hash))
        .map(|(path, _)| path.clone())
        .collect())
}

pub fn copy_fixture(fixture: &Path, profile: &Path) -> Result<Seeded> {
    let found = fs::symlink_metadata(fixture)
        .with_context(|| format!("Profile fixture {} is not readable", fixture.display()))?;
    ensure!(
        found.is_dir(),
        "Profile fixture {} is not a folder",
        fixture.display()
    );
    copy_folder(fixture, profile)?;
    let wanted = fingerprints(fixture)?;
    ensure!(
        fingerprints(profile)? == wanted,
        "The copied profile differs from the fixture {}",
        fixture.display()
    );
    Ok(wanted)
}

fn copy_folder(from: &Path, to: &Path) -> Result<()> {
    fs::create_dir(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let source = entry.path();
        let target = to.join(entry.file_name());
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_folder(&source, &target)?;
        } else if kind.is_file() {
            fs::copy(&source, &target)?;
        } else {
            bail!(
                "Profile fixture holds {}, which is neither a file nor a folder",
                source.display()
            );
        }
    }
    Ok(())
}

pub fn confined(profile: &Path, relative: &str) -> Result<PathBuf> {
    let path = Path::new(relative);
    ensure!(
        path.components().next().is_some()
            && path
                .components()
                .all(|part| matches!(part, Component::Normal(_))),
        "Profile edit path {relative:?} must be a relative path inside the profile"
    );
    let mut walked = profile.to_path_buf();
    for part in path.components() {
        walked.push(part);
        match fs::symlink_metadata(&walked) {
            Ok(found) => ensure!(
                !found.file_type().is_symlink(),
                "Profile edit path {relative:?} passes through a link"
            ),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(error) => return Err(error.into()),
        }
    }
    Ok(profile.join(path))
}

pub fn edit(profile: &Path, relative: &str, bytes: &[u8]) -> Result<PathBuf> {
    ensure!(
        profile.is_dir(),
        "The run has no profile folder to edit yet"
    );
    let target = confined(profile, relative)?;
    let parent = target.parent().context("Profile edit has no parent")?;
    fs::create_dir_all(parent)?;
    let staged = parent.join(format!(".edit-{}", std::process::id()));
    fs::write(&staged, bytes)?;
    fs::rename(&staged, &target)?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::Scratch;

    #[test]
    fn a_fixture_is_copied_with_its_nested_folders() -> Result<()> {
        let scratch = Scratch::new("fixture")?;
        let fixture = scratch.path().join("fixture");
        fs::create_dir_all(fixture.join("themes/deep"))?;
        fs::write(fixture.join("themes/voyager.json"), "{}")?;
        fs::write(fixture.join("themes/deep/more.txt"), "more")?;
        let profile = scratch.path().join("profile");
        let seeded = copy_fixture(&fixture, &profile)?;
        assert_eq!(seeded.len(), 2);
        assert_eq!(
            seeded["themes/voyager.json"],
            digest(&fixture.join("themes/voyager.json"))?
        );
        assert_eq!(fs::read(profile.join("themes/voyager.json"))?, b"{}");
        assert_eq!(fs::read(profile.join("themes/deep/more.txt"))?, b"more");
        Ok(())
    }

    #[test]
    fn a_seeded_file_that_changed_or_vanished_is_named() -> Result<()> {
        let scratch = Scratch::new("differing")?;
        let fixture = scratch.path().join("fixture");
        fs::create_dir_all(fixture.join("themes"))?;
        fs::write(fixture.join("themes/voyager.json"), "{}")?;
        fs::write(fixture.join("keep.txt"), "keep")?;
        let profile = scratch.path().join("profile");
        let seeded = copy_fixture(&fixture, &profile)?;
        assert!(differing(&profile, &seeded)?.is_empty());
        fs::write(profile.join("themes/voyager.json"), "shipped")?;
        fs::write(profile.join("extra.txt"), "runtime")?;
        assert_eq!(differing(&profile, &seeded)?, ["themes/voyager.json"]);
        fs::remove_file(profile.join("keep.txt"))?;
        assert_eq!(
            differing(&profile, &seeded)?,
            ["keep.txt", "themes/voyager.json"]
        );
        Ok(())
    }

    #[test]
    fn a_missing_or_linked_fixture_is_refused_by_name() -> Result<()> {
        let scratch = Scratch::new("refused")?;
        let missing = scratch.path().join("missing");
        let refusal = copy_fixture(&missing, &scratch.path().join("p"))
            .expect_err("a missing fixture was accepted");
        assert!(refusal.to_string().contains("Profile fixture"), "{refusal}");
        let fixture = scratch.path().join("fixture");
        fs::create_dir(&fixture)?;
        std::os::unix::fs::symlink("/etc/passwd", fixture.join("leak"))?;
        let refusal = copy_fixture(&fixture, &scratch.path().join("q"))
            .expect_err("a linked fixture was accepted");
        assert!(refusal.to_string().contains("neither a file"), "{refusal}");
        Ok(())
    }

    #[test]
    fn an_edit_stays_inside_the_profile() -> Result<()> {
        let scratch = Scratch::new("confined")?;
        let profile = scratch.path().join("profile");
        fs::create_dir(&profile)?;
        let outside = scratch.path().join("outside");
        fs::create_dir(&outside)?;
        std::os::unix::fs::symlink(&outside, profile.join("link"))?;
        for bad in [
            "../outside/x",
            "/etc/passwd",
            "",
            ".",
            "a/../../x",
            "link/x",
        ] {
            assert!(edit(&profile, bad, b"x").is_err(), "{bad:?} was accepted");
        }
        assert!(fs::read_dir(&outside)?.next().is_none());
        edit(&profile, "themes/voyager.json", b"one")?;
        edit(&profile, "themes/voyager.json", b"two")?;
        assert_eq!(fs::read(profile.join("themes/voyager.json"))?, b"two");
        Ok(())
    }
}
