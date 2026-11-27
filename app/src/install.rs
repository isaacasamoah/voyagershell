use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    fs, io,
    os::unix::fs::symlink,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

pub const SHELL: &str = "voyager-shell";
pub const COMMAND: &str = "voyager";
const BUILDS: &str = "builds";
const PART: &str = ".part";
const START: &str = "start.json";
const START_LIMIT: u64 = 8192;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Link {
    Current,
    Previous,
    Next,
}

impl Link {
    const ALL: [Link; 3] = [Link::Current, Link::Previous, Link::Next];

    fn name(self) -> &'static str {
        match self {
            Link::Current => "current",
            Link::Previous => "previous",
            Link::Next => "next",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Install {
    root: PathBuf,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Start {
    pub profile: PathBuf,
    pub session: String,
}

#[derive(Debug, Eq, PartialEq)]
pub struct Switch {
    pub to: String,
    from: Option<String>,
    before: Option<String>,
}

#[derive(Debug, Eq, PartialEq)]
pub enum Staged {
    Next(String),
    AlreadyCurrent(String),
    AlreadyNext(String),
    Older { latest: String, current: String },
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StartFile {
    profile: PathBuf,
    session: String,
}

pub(crate) fn digest(path: &Path) -> io::Result<String> {
    let mut hasher = Sha256::new();
    io::copy(&mut fs::File::open(path)?, &mut hasher)?;
    Ok(format!("{:x}", hasher.finalize()))
}

fn absent(result: io::Result<()>) -> io::Result<()> {
    match result {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        other => other,
    }
}

impl Install {
    pub fn at(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn locate(executable: &Path) -> Option<Self> {
        let builds = executable.parent()?.parent()?;
        if builds.file_name()? != BUILDS {
            return None;
        }
        let install = Self::at(builds.parent()?.to_path_buf());
        install
            .link_path(Link::Current)
            .symlink_metadata()
            .is_ok()
            .then_some(install)
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn command(&self) -> PathBuf {
        self.link_path(Link::Current).join(COMMAND)
    }

    pub fn shell(&self, link: Link) -> PathBuf {
        self.link_path(link).join(SHELL)
    }

    pub fn build(&self, name: &str) -> PathBuf {
        self.root.join(BUILDS).join(name)
    }

    fn link_path(&self, link: Link) -> PathBuf {
        self.root.join(link.name())
    }

    pub fn linked(&self, link: Link) -> io::Result<Option<String>> {
        let target = match fs::read_link(self.link_path(link)) {
            Ok(target) => target,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };
        let mut parts = target.components();
        match (parts.next(), parts.next(), parts.next()) {
            (Some(builds), Some(name), None) if builds.as_os_str() == BUILDS => {
                Ok(name.as_os_str().to_str().map(str::to_owned))
            }
            _ => Err(io::Error::other(format!(
                "{} points at {}, not a build folder",
                link.name(),
                target.display()
            ))),
        }
    }

    fn point(&self, link: Link, name: &str) -> io::Result<()> {
        let temporary = self
            .root
            .join(format!(".{}.{}.tmp", link.name(), std::process::id()));
        absent(fs::remove_file(&temporary))?;
        symlink(Path::new(BUILDS).join(name), &temporary)?;
        fs::rename(&temporary, self.link_path(link))
    }

    fn clear(&self, link: Link) -> io::Result<()> {
        absent(fs::remove_file(self.link_path(link)))
    }

    pub fn start(&self) -> Result<Start, String> {
        let path = self.root.join(START);
        let mut bytes = Vec::new();
        io::Read::read_to_end(
            &mut io::Read::take(
                fs::File::open(&path).map_err(|error| format!("{}: {error}", path.display()))?,
                START_LIMIT + 1,
            ),
            &mut bytes,
        )
        .map_err(|error| format!("{}: {error}", path.display()))?;
        if bytes.len() as u64 > START_LIMIT {
            return Err(format!("{} exceeds 8 KiB", path.display()));
        }
        let file: StartFile = serde_json::from_slice(&bytes)
            .map_err(|error| format!("{}: {error}", path.display()))?;
        if !file.profile.is_absolute() {
            return Err(format!(
                "{}: profile must be an absolute path",
                path.display()
            ));
        }
        if !crate::session_name::valid(&file.session) {
            return Err(format!(
                "{}: session must start with voyager- and use lowercase letters, digits or hyphens",
                path.display()
            ));
        }
        Ok(Start {
            profile: file.profile,
            session: file.session,
        })
    }

    pub fn stage(&self, name: &str) -> io::Result<Staged> {
        if self.linked(Link::Current)?.as_deref() == Some(name) {
            self.clear(Link::Next)?;
            return Ok(Staged::AlreadyCurrent(name.to_owned()));
        }
        self.point(Link::Next, name)?;
        Ok(Staged::Next(name.to_owned()))
    }

    pub fn rollback(&self) -> io::Result<Staged> {
        let previous = self
            .linked(Link::Previous)?
            .ok_or_else(|| io::Error::other("There is no previous build to go back to"))?;
        self.stage(&previous)
    }

    pub fn apply_next(&self) -> io::Result<Option<Switch>> {
        let Some(next) = self.linked(Link::Next)? else {
            return Ok(None);
        };
        let current = self.linked(Link::Current)?;
        let previous = self.linked(Link::Previous)?;
        let switch = if current.as_deref() == Some(next.as_str()) {
            Switch {
                to: next,
                from: previous.clone(),
                before: previous,
            }
        } else {
            if let Some(current) = &current {
                self.point(Link::Previous, current)?;
            }
            self.point(Link::Current, &next)?;
            Switch {
                to: next,
                from: current,
                before: previous,
            }
        };
        self.clear(Link::Next)?;
        Ok(Some(switch))
    }

    pub fn fall_back(&self, switch: &Switch) -> io::Result<String> {
        let from = switch
            .from
            .clone()
            .ok_or_else(|| io::Error::other("There is no previous build to return to"))?;
        self.point(Link::Current, &from)?;
        match &switch.before {
            Some(before) => self.point(Link::Previous, before)?,
            None => self.clear(Link::Previous)?,
        }
        self.clear(Link::Next)?;
        Ok(from)
    }

    pub fn add_from(&self, source: &Path) -> Result<String, String> {
        self.add_from_with(source, |from, to| fs::copy(from, to).map(drop))
    }

    fn add_from_with(
        &self,
        source: &Path,
        copy: impl Fn(&Path, &Path) -> io::Result<()>,
    ) -> Result<String, String> {
        let files = [SHELL, COMMAND].map(|file| source.join(file));
        let mut expected = Vec::with_capacity(files.len());
        for file in &files {
            expected.push(digest(file).map_err(|error| format!("{}: {error}", file.display()))?);
        }
        let name = format!("local-{}", &expected[0][..8]);
        self.add(
            &name,
            |part| {
                for (file, expected) in files.iter().zip(&expected) {
                    let copied = part.join(file.file_name().unwrap_or_default());
                    copy(file, &copied)
                        .map_err(|error| format!("{}: {error}", copied.display()))?;
                    let found = digest(&copied)
                        .map_err(|error| format!("{}: {error}", copied.display()))?;
                    if &found != expected {
                        return Err(format!(
                            "The copy of {} does not match its source (sha256 {found}, expected {expected})",
                            file.display()
                        ));
                    }
                }
                Ok(())
            },
            None,
        )?;
        Ok(name)
    }

    pub(crate) fn add(
        &self,
        name: &str,
        fill: impl FnOnce(&Path) -> Result<(), String>,
        version: Option<&str>,
    ) -> Result<(), String> {
        let part = self.build(&format!("{name}{PART}"));
        let built = (|| {
            absent(
                fs::remove_dir_all(&part).or_else(|error| match error.kind() {
                    io::ErrorKind::NotADirectory => fs::remove_file(&part),
                    _ => Err(error),
                }),
            )
            .map_err(|error| format!("{}: {error}", part.display()))?;
            fs::create_dir_all(&part).map_err(|error| format!("{}: {error}", part.display()))?;
            fill(&part)?;
            let mut expected = Vec::with_capacity(2);
            for file in [SHELL, COMMAND] {
                let file = part.join(file);
                expected
                    .push(digest(&file).map_err(|error| format!("{}: {error}", file.display()))?);
            }
            let shell = part.join(SHELL);
            let output = Command::new(&shell)
                .arg("--version")
                .stdin(Stdio::null())
                .output()
                .map_err(|error| format!("{} --version: {error}", shell.display()))?;
            if !output.status.success() {
                return Err(format!(
                    "{} --version failed: {}",
                    shell.display(),
                    String::from_utf8_lossy(&output.stderr).trim()
                ));
            }
            if let Some(version) = version {
                let printed = String::from_utf8_lossy(&output.stdout);
                let found = printed
                    .lines()
                    .next()
                    .and_then(|line| line.strip_prefix(&format!("{SHELL} ")))
                    .unwrap_or_default();
                if found != version {
                    return Err(format!(
                        "The build says {found:?}, but the manifest says {version}"
                    ));
                }
            }
            let build = self.build(name);
            match fs::rename(&part, &build) {
                Ok(()) => Ok(()),
                Err(_) if self.holds(&build, &expected) => {
                    fs::remove_dir_all(&part).map_err(|error| error.to_string())
                }
                Err(error) => Err(format!(
                    "Moving {} to {}: {error}",
                    part.display(),
                    build.display()
                )),
            }
        })();
        if let Err(error) = built {
            let _ = fs::remove_dir_all(&part);
            return Err(error);
        }
        Ok(())
    }

    fn holds(&self, build: &Path, expected: &[String]) -> bool {
        [SHELL, COMMAND]
            .iter()
            .zip(expected)
            .all(|(file, expected)| digest(&build.join(file)).ok().as_ref() == Some(expected))
    }

    pub fn prune(&self, running: &[PathBuf]) -> io::Result<Vec<String>> {
        let mut kept = Vec::new();
        for link in Link::ALL {
            kept.extend(self.linked(link)?);
        }
        let mut removed = Vec::new();
        let entries = match fs::read_dir(self.root.join(BUILDS)) {
            Ok(entries) => entries,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(removed),
            Err(error) => return Err(error),
        };
        for entry in entries {
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            let folder = entry.path();
            let partial = name.ends_with(PART);
            if !partial
                && (kept.contains(&name) || running.iter().any(|exe| exe.starts_with(&folder)))
            {
                continue;
            }
            fs::remove_dir_all(&folder)?;
            removed.push(name);
        }
        Ok(removed)
    }
}

pub fn running_executables() -> Vec<PathBuf> {
    fs::read_dir("/proc")
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| fs::read_link(entry.path().join("exe")).ok())
        .collect()
}

#[cfg(test)]
#[path = "install_tests.rs"]
mod tests;
