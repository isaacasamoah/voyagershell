use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use voyager_contract::worktree::Checkout;

#[derive(Debug)]
pub enum Error {
    Rejected(String),
    Uncertain(String),
}

fn read_git(cwd: &Path, args: &[&str]) -> Result<String, Error> {
    let output = Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .output()
        .map_err(|error| Error::Rejected(error.to_string()))?;
    if !output.status.success() {
        return Err(Error::Rejected(
            String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        ));
    }
    String::from_utf8(output.stdout)
        .map_err(|_| Error::Rejected("Git returned non-UTF-8 output".into()))
}

fn effect(cwd: &Path, args: &[&str]) -> Result<(), Error> {
    let child = Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| Error::Rejected(error.to_string()))?;
    let output = child
        .wait_with_output()
        .map_err(|error| Error::Uncertain(format!("Git outcome unconfirmed: {error}")))?;
    if !output.status.success() {
        return Err(Error::Uncertain(format!(
            "Git did not complete successfully; inspect before retrying: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }
    Ok(())
}

fn canonical(path: &Path) -> Result<String, Error> {
    let path = path
        .canonicalize()
        .map_err(|error| Error::Rejected(error.to_string()))?;
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| Error::Rejected("Path is not UTF-8".into()))
}

pub fn list(cwd: &Path) -> Result<Vec<Checkout>, Error> {
    let common = read_git(
        cwd,
        &["rev-parse", "--path-format=absolute", "--git-common-dir"],
    )?;
    let common_dir = canonical(Path::new(common.strip_suffix('\n').unwrap_or(&common)))?;
    let raw = read_git(cwd, &["worktree", "list", "--porcelain", "-z"])?;
    let top = read_git(cwd, &["rev-parse", "--show-toplevel"])?;
    let top = canonical(Path::new(top.trim_end_matches('\n')))?;
    let dirty = !read_git(cwd, &["--no-optional-locks", "status", "--porcelain"])?.is_empty();
    let mut checkouts = Vec::new();
    let mut path = None;
    let mut branch = None;
    let mut locked = false;
    let mut prunable = false;
    for field in raw.split('\0') {
        if let Some(value) = field.strip_prefix("worktree ") {
            path = Some(PathBuf::from(value));
        } else if let Some(value) = field.strip_prefix("branch refs/heads/") {
            branch = Some(value.to_owned());
        } else if field == "locked" || field.starts_with("locked ") {
            locked = true;
        } else if field == "prunable" || field.starts_with("prunable ") {
            prunable = true;
        } else if field.is_empty()
            && let Some(value) = path.take()
        {
            let path = if value.exists() {
                canonical(&value)?
            } else {
                value
                    .to_str()
                    .ok_or_else(|| Error::Rejected("Path is not UTF-8".into()))?
                    .to_owned()
            };
            let dirty = (path == top).then_some(dirty);
            checkouts.push(Checkout {
                path,
                common_dir: common_dir.clone(),
                main: checkouts.is_empty(),
                branch: branch.take(),
                locked,
                prunable,
                dirty,
            });
            locked = false;
            prunable = false;
        }
    }
    if checkouts.is_empty() {
        return Err(Error::Rejected(
            "Git returned no registered checkouts".into(),
        ));
    }
    Ok(checkouts)
}

pub fn uncommitted_changes(cwd: &Path) -> Result<u32, Error> {
    let raw = read_git(
        cwd,
        &["--no-optional-locks", "status", "--porcelain=v1", "-z"],
    )?;
    let mut entries = raw.split('\0').filter(|entry| !entry.is_empty());
    let mut count = 0;
    while let Some(entry) = entries.next() {
        count += 1;
        if entry
            .as_bytes()
            .iter()
            .take(2)
            .any(|value| matches!(value, b'R' | b'C'))
        {
            entries.next();
        }
    }
    Ok(count)
}

pub fn open(cwd: &Path, path: &str) -> Result<Checkout, Error> {
    list(cwd)?
        .into_iter()
        .find(|checkout| checkout.path == path && !checkout.prunable)
        .ok_or_else(|| Error::Rejected("Checkout is not registered or is unavailable".into()))
}

pub fn create(cwd: &Path, name: &str, branch: &str, base: &str) -> Result<Checkout, Error> {
    let mut parts = Path::new(name).components();
    if !matches!(parts.next(), Some(std::path::Component::Normal(part)) if part == std::ffi::OsStr::new(name))
        || parts.next().is_some()
    {
        return Err(Error::Rejected(
            "Worktree name must be one folder name".into(),
        ));
    }
    read_git(cwd, &["check-ref-format", "--branch", branch])?;
    if base.is_empty() || base.starts_with('-') {
        return Err(Error::Rejected("A valid base is required".into()));
    }
    let commit = read_git(
        cwd,
        &[
            "rev-parse",
            "--verify",
            "--end-of-options",
            &format!("{base}^{{commit}}"),
        ],
    )?;
    let main = list(cwd)?
        .into_iter()
        .next()
        .ok_or_else(|| Error::Rejected("Main checkout unavailable".into()))?;
    let root = Path::new(&main.path).join(".worktrees");
    let destination = root.join(name);
    if destination.symlink_metadata().is_ok() {
        return Err(Error::Rejected(
            "Worktree destination already exists".into(),
        ));
    }
    let path = destination
        .to_str()
        .ok_or_else(|| Error::Rejected("Path is not UTF-8".into()))?;
    let exclude = Path::new(&main.common_dir).join("info/exclude");
    let existing = match std::fs::read_to_string(&exclude) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(Error::Rejected(error.to_string())),
    };
    if !existing.lines().any(|line| line == "/.worktrees/") {
        use std::io::Write;
        if let Some(parent) = exclude.parent() {
            std::fs::create_dir_all(parent).map_err(|error| Error::Rejected(error.to_string()))?;
        }
        let mut file = std::fs::OpenOptions::new()
            .append(true)
            .create(true)
            .open(exclude)
            .map_err(|error| Error::Rejected(error.to_string()))?;
        file.write_all(b"\n/.worktrees/\n")
            .map_err(|error| Error::Rejected(error.to_string()))?;
    }
    effect(
        cwd,
        &["worktree", "add", "-b", branch, "--", path, commit.trim()],
    )?;
    let resolved = canonical(&destination).map_err(|error| {
        Error::Uncertain(format!(
            "Git completed but checkout path is unavailable: {error:?}"
        ))
    })?;
    open(cwd, &resolved).map_err(|error| {
        Error::Uncertain(format!(
            "Git completed but checkout inspection failed: {error:?}"
        ))
    })
}

pub fn remove(cwd: &Path, path: &str) -> Result<Vec<Checkout>, Error> {
    let checkout = open(cwd, path)?;
    if checkout.main {
        return Err(Error::Rejected("Cannot remove the main checkout".into()));
    }
    let main = list(cwd)?
        .into_iter()
        .find(|item| item.main)
        .ok_or_else(|| Error::Rejected("Main checkout unavailable".into()))?;
    effect(cwd, &["worktree", "remove", "--", &checkout.path])?;
    list(Path::new(&main.path)).map_err(|error| {
        Error::Uncertain(format!(
            "Removal completed but checkout inspection failed: {error:?}"
        ))
    })
}

pub(crate) fn check_live_directories(
    target: &str,
    live_directories: &[String],
) -> Result<(), Error> {
    let target_path = Path::new(target);
    for directory in live_directories {
        let current = std::fs::canonicalize(directory).map_err(|error| {
            Error::Rejected(format!("Live process directory is unavailable: {error}"))
        })?;
        if current.starts_with(target_path) {
            return Err(Error::Rejected(format!(
                "A live process uses {}",
                current.display()
            )));
        }
    }
    Ok(())
}

pub(crate) fn execute(
    cwd: &Path,
    action: &voyager_contract::worktree::Action,
    live_directories: &[String],
) -> Result<Vec<Checkout>, Error> {
    use voyager_contract::worktree::Action;
    match action {
        Action::List => list(cwd),
        Action::Open { path } => open(cwd, path).map(|checkout| vec![checkout]),
        Action::Create { name, branch, base } => {
            create(cwd, name, branch, base).map(|checkout| vec![checkout])
        }
        Action::Remove { path } => {
            let target = open(cwd, path)?;
            check_live_directories(&target.path, live_directories)?;
            remove(cwd, &target.path)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn git(dir: &Path, args: &[&str]) {
        let output = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn create_inspect_open_and_remove_without_force_or_branch_deletion() {
        let dir = std::env::temp_dir().join(format!(
            "voyager-worktree-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&dir).unwrap();
        git(&dir, &["init", "-q"]);
        git(&dir, &["config", "user.name", "Voyager test"]);
        git(&dir, &["config", "user.email", "test@example.invalid"]);
        fs::write(dir.join("tracked"), "initial").unwrap();
        git(&dir, &["add", "tracked"]);
        git(&dir, &["commit", "-qm", "initial"]);
        let repo = fs::canonicalize(&dir).unwrap();
        let main = list(&repo).unwrap();
        assert_eq!(main.len(), 1);
        assert!(main[0].main);
        let checkout = create(&repo, "feature-one", "feature/one", "HEAD").unwrap();
        assert_eq!(
            Path::new(&checkout.path),
            repo.join(".worktrees/feature-one")
        );
        assert!(!checkout.main);
        assert!(
            read_git(&repo, &["status", "--porcelain"])
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            list(Path::new(&checkout.path)).unwrap()[1].dirty,
            Some(false)
        );
        assert_eq!(checkout.branch.as_deref(), Some("feature/one"));
        assert_eq!(open(&repo, &checkout.path).unwrap(), checkout);
        assert!(create(&repo, "feature-one", "feature/two", "HEAD").is_err());
        assert!(remove(&repo, &main[0].path).is_err());
        let nested = Path::new(&checkout.path).join("subdir");
        fs::create_dir(&nested).unwrap();
        let guarded = execute(
            &repo,
            &voyager_contract::worktree::Action::Remove {
                path: checkout.path.clone(),
            },
            &[nested.to_string_lossy().into_owned()],
        );
        assert!(matches!(guarded, Err(Error::Rejected(_))));
        assert!(Path::new(&checkout.path).exists());
        fs::remove_dir(nested).unwrap();
        fs::write(Path::new(&checkout.path).join("tracked"), "dirty").unwrap();
        assert_eq!(
            list(Path::new(&checkout.path)).unwrap()[1].dirty,
            Some(true)
        );
        let work = Path::new(&checkout.path);
        fs::write(work.join("untracked\nnote"), "draft").unwrap();
        git(work, &["mv", "tracked", "renamed"]);
        assert_eq!(uncommitted_changes(work).unwrap(), 2);
        git(work, &["mv", "renamed", "tracked"]);
        fs::remove_file(work.join("untracked\nnote")).unwrap();
        assert_eq!(uncommitted_changes(work).unwrap(), 1);
        assert!(remove(&repo, &checkout.path).is_err());
        assert!(Path::new(&checkout.path).exists());
        fs::write(Path::new(&checkout.path).join("tracked"), "initial").unwrap();
        remove(Path::new(&checkout.path), &checkout.path).unwrap();
        assert!(!Path::new(&checkout.path).exists());
        assert_eq!(list(&repo).unwrap().len(), 1);
        git(
            &repo,
            &["show-ref", "--verify", "--quiet", "refs/heads/feature/one"],
        );
        fs::remove_dir_all(&dir).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn linked_worktree_directory_and_unicode_folder_names_are_supported() {
        use std::os::unix::fs::symlink;
        let dir = std::env::temp_dir().join(format!(
            "voyager-linked-worktree-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let repo = dir.join("repo");
        let storage = dir.join("storage");
        fs::create_dir_all(&repo).unwrap();
        fs::create_dir(&storage).unwrap();
        git(&repo, &["init", "-q"]);
        git(&repo, &["config", "user.name", "Voyager test"]);
        git(&repo, &["config", "user.email", "test@example.invalid"]);
        git(&repo, &["commit", "--allow-empty", "-qm", "initial"]);
        symlink(&storage, repo.join(".worktrees")).unwrap();
        let checkout = create(&repo, "espace café", "test-branch", "HEAD").unwrap();
        assert_eq!(Path::new(&checkout.path), storage.join("espace café"));
        assert!(create(&repo, "espace café", "other-branch", "HEAD").is_err());
        assert!(create(&repo, "../outside", "other-branch", "HEAD").is_err());
        remove(&repo, &checkout.path).unwrap();
        fs::remove_dir_all(dir).unwrap();
    }
}
