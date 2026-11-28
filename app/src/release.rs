use crate::install::{Install, Link, Staged, digest, running_executables};
use serde::Deserialize;
use std::{
    collections::BTreeMap,
    fmt, fs, io,
    os::unix::process::CommandExt,
    path::Path,
    process::{Command, Stdio},
    str::FromStr,
    thread,
    time::Duration,
};

pub const TARGET: &str = "linux-x86_64";
const RELEASES: &str = "https://github.com/isaacasamoah/voyagershell/releases/latest/download";
const MANIFEST: &str = "latest.json";
const MANIFEST_LIMIT: usize = 64 * 1024;
const ARCHIVE: &str = "voyagershell-linux-x86_64.tar.gz";
const FIRST_CHECK: Duration = Duration::from_secs(10);
const EVERY: Duration = Duration::from_secs(60 * 60);
const RETRY: Duration = Duration::from_secs(30 * 60);
const RELAUNCH: &str = "while kill -0 \"$0\" 2>/dev/null; do sleep 0.1; done; exec \"$1\" start";

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct Version([u64; 3]);

impl FromStr for Version {
    type Err = String;

    fn from_str(text: &str) -> Result<Self, String> {
        let odd = || format!("{text:?} is not a version like 0.1.0");
        let mut parts = text.split('.');
        let mut version = [0; 3];
        for number in &mut version {
            *number = parts
                .next()
                .filter(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
                .and_then(|part| part.parse().ok())
                .ok_or_else(odd)?;
        }
        match parts.next() {
            None => Ok(Self(version)),
            Some(_) => Err(odd()),
        }
    }
}

impl fmt::Display for Version {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let [major, minor, patch] = self.0;
        write!(formatter, "{major}.{minor}.{patch}")
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Archive {
    pub url: String,
    pub sha256: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Manifest {
    pub version: Version,
    pub notes: String,
    pub archive: Archive,
}

#[derive(Deserialize)]
struct ManifestFile {
    version: String,
    #[serde(default)]
    notes: String,
    targets: BTreeMap<String, TargetFile>,
}

#[derive(Deserialize)]
struct TargetFile {
    url: String,
    sha256: String,
}

impl Manifest {
    pub fn parse(bytes: &[u8]) -> Result<Self, String> {
        let file: ManifestFile =
            serde_json::from_slice(bytes).map_err(|error| format!("{MANIFEST}: {error}"))?;
        let version = file
            .version
            .parse()
            .map_err(|error| format!("{MANIFEST}: {error}"))?;
        let target = file
            .targets
            .get(TARGET)
            .ok_or_else(|| format!("{MANIFEST} has no build for {TARGET}"))?;
        let sha256 = target.sha256.to_ascii_lowercase();
        if sha256.len() != 64 || !sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(format!(
                "{MANIFEST}: the {TARGET} sha256 is not 64 hex digits"
            ));
        }
        if target.url.is_empty() {
            return Err(format!("{MANIFEST}: the {TARGET} url is empty"));
        }
        Ok(Self {
            version,
            notes: file.notes,
            archive: Archive {
                url: target.url.clone(),
                sha256,
            },
        })
    }
}

pub fn release_build() -> bool {
    option_env!("VOYAGER_RELEASE") == Some("1")
}

pub fn releases() -> String {
    releases_for(release_build(), std::env::var("VOYAGER_RELEASES_URL").ok())
}

fn releases_for(release: bool, set: Option<String>) -> String {
    set.filter(|url| release && !url.is_empty())
        .unwrap_or_else(|| RELEASES.into())
        .trim_end_matches('/')
        .to_owned()
}

fn curl() -> Command {
    let mut command = Command::new("curl");
    command.args(["-fsSL"]).stdin(Stdio::null());
    command
}

fn ran(command: &mut Command, what: &str) -> Result<Vec<u8>, String> {
    let output = command
        .output()
        .map_err(|error| format!("{what}: {error}"))?;
    if output.status.success() {
        Ok(output.stdout)
    } else {
        Err(format!(
            "{what}: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

pub fn latest(releases: &str) -> Result<Manifest, String> {
    let url = format!("{releases}/{MANIFEST}");
    let bytes = ran(
        curl()
            .args(["--max-time", "30", "--max-filesize"])
            .arg(MANIFEST_LIMIT.to_string())
            .arg(&url),
        &format!("Cannot read {url}"),
    )?;
    Manifest::parse(&bytes)
}

fn download(archive: &Archive, part: &Path) -> Result<(), String> {
    let file = part.join(ARCHIVE);
    ran(
        curl()
            .args(["--max-time", "600", "-o"])
            .arg(&file)
            .arg(&archive.url),
        &format!("The download of {} failed", archive.url),
    )?;
    let found = digest(&file).map_err(|error| format!("{}: {error}", file.display()))?;
    if found != archive.sha256 {
        return Err(format!(
            "The download is damaged (sha256 {found}, expected {})",
            archive.sha256
        ));
    }
    ran(
        Command::new("tar")
            .arg("-xzf")
            .arg(&file)
            .arg("-C")
            .arg(part)
            .arg("--strip-components=1")
            .stdin(Stdio::null()),
        "Unpacking the download failed",
    )?;
    fs::remove_file(&file).map_err(|error| format!("{}: {error}", file.display()))
}

pub fn stage(
    install: &Install,
    manifest: &Manifest,
    running: Option<Version>,
) -> Result<Staged, String> {
    let name = manifest.version.to_string();
    if let Some(running) = running
        && manifest.version <= running
    {
        return Ok(if manifest.version == running {
            Staged::AlreadyCurrent(name)
        } else {
            Staged::Older {
                latest: name,
                current: running.to_string(),
            }
        });
    }
    if install
        .linked(Link::Next)
        .map_err(|error| error.to_string())?
        .as_deref()
        == Some(name.as_str())
    {
        return Ok(Staged::AlreadyNext(name));
    }
    install.add(&name, |part| download(&manifest.archive, part), Some(&name))?;
    let staged = install.stage(&name).map_err(|error| error.to_string())?;
    let _ = install.prune(&running_executables());
    Ok(staged)
}

pub fn update(install: &Install) -> Result<Staged, String> {
    let manifest = latest(&releases())?;
    let current = install
        .linked(Link::Current)
        .map_err(|error| error.to_string())?
        .and_then(|name| name.parse().ok());
    stage(install, &manifest, current)
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Offer {
    pub version: String,
    pub notes: String,
}

pub fn running() -> Option<Version> {
    env!("CARGO_PKG_VERSION").parse().ok()
}

pub fn checker() -> Option<Install> {
    checker_for(release_build(), &std::env::current_exe().ok()?, running()?)
}

fn checker_for(release: bool, executable: &Path, running: Version) -> Option<Install> {
    if !release {
        return None;
    }
    let install = Install::locate(executable)?;
    let folder = executable.parent()?.file_name()?.to_str()?;
    (folder == running.to_string()).then_some(install)
}

pub fn offer(install: &Install, releases: &str, running: Version) -> Result<Option<Offer>, String> {
    let manifest = latest(releases)?;
    Ok(match stage(install, &manifest, Some(running))? {
        Staged::Next(version) | Staged::AlreadyNext(version) => Some(Offer {
            version,
            notes: manifest.notes,
        }),
        Staged::AlreadyCurrent(_) | Staged::Older { .. } => None,
    })
}

pub fn watch(install: Install, offers: async_channel::Sender<Offer>) {
    let Some(running) = running() else {
        return;
    };
    thread::spawn(move || {
        thread::sleep(FIRST_CHECK);
        let mut offered = None;
        while !offers.is_closed() {
            let wait = match offer(&install, &releases(), running) {
                Ok(found) => {
                    if let Some(found) = found
                        && offered.as_ref() != Some(&found)
                    {
                        if offers.send_blocking(found.clone()).is_err() {
                            return;
                        }
                        offered = Some(found);
                    }
                    EVERY
                }
                Err(error) => {
                    eprintln!("The update check failed: {error}");
                    RETRY
                }
            };
            thread::sleep(wait);
        }
    });
}

pub fn relaunch() -> io::Result<()> {
    let executable = std::env::current_exe()?;
    let install = Install::locate(&executable)
        .ok_or_else(|| io::Error::other("This build does not run from an install"))?;
    relaunch_after(std::process::id(), &install.command())
        .spawn()
        .map(drop)
}

fn relaunch_after(pid: u32, command: &Path) -> Command {
    let mut relaunch = Command::new("sh");
    relaunch
        .arg("-c")
        .arg(RELAUNCH)
        .arg(pid.to_string())
        .arg(command)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0);
    relaunch
}

#[cfg(test)]
#[path = "release_tests.rs"]
mod tests;
