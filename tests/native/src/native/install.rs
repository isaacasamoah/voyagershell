use super::{Defect, Native, REQUEST_PATIENCE};
use crate::inspection::Target;
use crate::sandbox;
use crate::system::{Identity, Owned, Pinned, TimedOut, digest, parent, stamp};
use crate::x11::Observed;
use anyhow::{Context, Result, ensure};
use serde::Serialize;
use serde_json::json;
use std::fs::{self, File};
use std::os::unix::fs::{PermissionsExt, symlink};
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

const SHELL: &str = "voyager-shell";
const COMMAND: &str = "voyager";
const BUILDS: &str = "builds";
const START_PATIENCE: Duration = Duration::from_secs(150);
const UPDATE_PATIENCE: Duration = Duration::from_secs(60);
const POLL: Duration = Duration::from_millis(50);
const COUNTER: &str = "if [ -z \"$BASH_EXECUTION_STRING\" ] && mkdir ~/.counting 2>/dev/null; then\n  i=0\n  while :; do echo \"count $i\"; i=$((i+1)); sleep 0.5; done\nfi\n";
pub const STAND_IN_LINE: &str = "stand-in: exiting before it is ready";
const SITE: &str = "site";
const MANIFEST: &str = "latest.json";
const ARCHIVE: &str = "voyagershell-linux-x86_64.tar.gz";
const AHEAD: &str = "voyagershell-ahead.tar.gz";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Layout {
    Local,
    Release,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub enum Site {
    Second,
    Damaged,
    Missing,
    Ahead,
}

#[derive(Clone, Debug, Serialize)]
pub struct Versions {
    pub first: String,
    pub second: String,
    pub ahead: String,
}

struct Release {
    site: PathBuf,
    versions: Versions,
}

fn reported(path: &Path) -> Result<String> {
    let output = Command::new(path)
        .arg("--version")
        .stdin(Stdio::null())
        .output()?;
    ensure!(
        output.status.success(),
        "{} --version failed",
        path.display()
    );
    let printed = String::from_utf8_lossy(&output.stdout);
    printed
        .lines()
        .next()
        .and_then(|line| line.strip_prefix(&format!("{SHELL} ")))
        .map(str::to_owned)
        .with_context(|| format!("{} --version printed {printed:?}", path.display()))
}

fn numbers(version: &str) -> Result<[u64; 3]> {
    let parts: Vec<u64> = version
        .split('.')
        .map(str::parse)
        .collect::<std::result::Result<_, _>>()
        .with_context(|| format!("{version} is not a version like 0.1.0"))?;
    parts
        .try_into()
        .map_err(|_| anyhow::anyhow!("{version} is not a version like 0.1.0"))
}

fn pack(folder: &Path, shell: &Path, command: &Path, archive: &Path) -> Result<()> {
    let packed = folder.join("voyagershell");
    fs::create_dir_all(&packed)?;
    fs::copy(shell, packed.join(SHELL))?;
    fs::copy(command, packed.join(COMMAND))?;
    fs::write(packed.join("LICENSE"), "MIT\n")?;
    let status = Command::new("tar")
        .arg("-czf")
        .arg(archive)
        .arg("-C")
        .arg(folder)
        .arg("voyagershell")
        .stdin(Stdio::null())
        .status()?;
    ensure!(status.success(), "Packing {} failed", archive.display());
    Ok(())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Build {
    First,
    Second,
    StandIn,
}

impl Build {
    fn folder(self) -> &'static str {
        match self {
            Build::First => "first",
            Build::Second => "second",
            Build::StandIn => "stand-in",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Linked {
    pub name: String,
    pub sha256: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Links {
    pub current: Option<Linked>,
    pub previous: Option<Linked>,
    pub next: Option<Linked>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Launched {
    pub build: Linked,
    pub log: PathBuf,
}

#[derive(Debug, Serialize)]
pub struct Ran {
    pub arguments: Vec<String>,
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub launched: Vec<Launched>,
    pub strays: Vec<Identity>,
}

impl Ran {
    pub fn launched_only(&self, sha256: &str) -> bool {
        matches!(self.launched.as_slice(), [one] if one.build.sha256.as_deref() == Some(sha256))
    }

    pub fn log_of(&self, sha256: &str) -> Option<&Path> {
        self.launched
            .iter()
            .find(|launched| launched.build.sha256.as_deref() == Some(sha256))
            .map(|launched| launched.log.as_path())
    }
}

pub(super) struct Install {
    root: PathBuf,
    sources: PathBuf,
    first: Pinned,
    second: Pinned,
    release: Option<Release>,
}

impl Install {
    pub(super) fn releases(&self) -> Option<String> {
        self.release
            .as_ref()
            .map(|release| format!("file://{}", release.site.display()))
    }

    fn prepare_site(&mut self) -> Result<()> {
        let first = reported(&self.first.path)?;
        let second = reported(&self.second.path)?;
        let [major, minor, patch] = numbers(&second)?;
        ensure!(
            numbers(&first)? < [major, minor, patch],
            "The second build reports {second}, which is not newer than the first build's {first}"
        );
        let ahead = format!("{major}.{minor}.{}", patch + 1);
        let site = self.root.with_file_name(SITE);
        let work = self.root.with_file_name("site-work");
        fs::create_dir_all(&site)?;
        pack(
            &work.join("second"),
            &self.second.path,
            &self.second.path.with_file_name(COMMAND),
            &site.join(ARCHIVE),
        )?;
        let stand_in = work.join(SHELL);
        fs::write(
            &stand_in,
            format!(
                "#!/bin/sh\nif [ \"$1\" = --version ]; then\n  echo '{SHELL} {ahead}'\n  exit 0\nfi\nexit 1\n"
            ),
        )?;
        fs::set_permissions(&stand_in, fs::Permissions::from_mode(0o755))?;
        pack(
            &work.join("ahead"),
            &stand_in,
            &self.second.path.with_file_name(COMMAND),
            &site.join(AHEAD),
        )?;
        self.release = Some(Release {
            site,
            versions: Versions {
                first,
                second,
                ahead,
            },
        });
        Ok(())
    }

    fn publish(&self, served: Site) -> Result<serde_json::Value> {
        let release = self
            .release
            .as_ref()
            .context("This run lays out no release install")?;
        let at = |file: &str| format!("file://{}", release.site.join(file).display());
        let ahead = digest(&release.site.join(AHEAD))?;
        let (version, url, sha256) = match served {
            Site::Second => (
                &release.versions.second,
                at(ARCHIVE),
                digest(&release.site.join(ARCHIVE))?,
            ),
            Site::Damaged => (&release.versions.ahead, at(AHEAD), "0".repeat(64)),
            Site::Missing => (&release.versions.ahead, at("missing.tar.gz"), ahead),
            Site::Ahead => (&release.versions.ahead, at(AHEAD), ahead),
        };
        let manifest = json!({
            "version": version,
            "commit": "0".repeat(40),
            "core_min": "0.1.18",
            "notes": format!("Stand-in release {version}."),
            "targets": {"linux-x86_64": {"url": url, "sha256": sha256}},
        });
        let written = release.site.join(format!(".{MANIFEST}.tmp"));
        fs::write(&written, serde_json::to_vec(&manifest)?)?;
        fs::rename(&written, release.site.join(MANIFEST))?;
        Ok(manifest)
    }

    fn folders(&self) -> Result<Vec<String>> {
        let mut names = fs::read_dir(self.root.join(BUILDS))?
            .map(|entry| Ok(entry?.file_name().to_string_lossy().into_owned()))
            .collect::<Result<Vec<_>>>()?;
        names.sort();
        Ok(names)
    }

    fn running(&self, file: &str) -> Vec<u32> {
        self.apps()
            .into_iter()
            .filter(|pid| {
                fs::read_link(format!("/proc/{pid}/exe"))
                    .is_ok_and(|executable| executable.file_name().is_some_and(|name| name == file))
            })
            .collect()
    }

    fn build(&self, name: &str) -> PathBuf {
        self.root.join(BUILDS).join(name)
    }

    fn linked(&self, name: &str) -> Linked {
        Linked {
            name: name.to_owned(),
            sha256: digest(&self.build(name).join(SHELL)).ok(),
        }
    }

    fn named(&self, name: &str) -> Linked {
        if let Some(release) = &self.release {
            let pinned = if name == release.versions.first {
                Some(&self.first)
            } else if name == release.versions.second {
                Some(&self.second)
            } else {
                None
            };
            if let Some(pinned) = pinned {
                return Linked {
                    name: name.to_owned(),
                    sha256: Some(pinned.sha256.clone()),
                };
            }
        }
        let sha256 = [Build::First, Build::Second, Build::StandIn]
            .into_iter()
            .filter_map(|build| self.sha256(build).ok())
            .find(|sha256| {
                sha256
                    .get(..8)
                    .is_some_and(|short| name == format!("local-{short}"))
            });
        Linked {
            name: name.to_owned(),
            sha256,
        }
    }

    fn link(&self, link: &str) -> Result<Option<Linked>> {
        let target = match fs::read_link(self.root.join(link)) {
            Ok(target) => target,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        let name = target
            .file_name()
            .and_then(|name| name.to_str())
            .with_context(|| format!("{link} points at {}", target.display()))?;
        Ok(Some(self.linked(name)))
    }

    fn logs(&self) -> Result<Vec<PathBuf>> {
        let mut logs = match fs::read_dir(self.root.join("logs")) {
            Ok(entries) => entries
                .map(|entry| Ok(entry?.path()))
                .collect::<Result<Vec<_>>>()?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(error) => return Err(error.into()),
        };
        logs.sort();
        Ok(logs)
    }

    fn launched(&self, log: &Path) -> Result<Launched> {
        let name = log
            .file_stem()
            .and_then(|stem| stem.to_str())
            .and_then(|stem| stem.rsplit_once('-'))
            .map(|(name, _)| name)
            .with_context(|| format!("The launch log {} names no build", log.display()))?;
        Ok(Launched {
            build: self.named(name),
            log: log.to_owned(),
        })
    }

    fn apps(&self) -> Vec<u32> {
        let builds = self.root.join(BUILDS);
        fs::read_dir("/proc")
            .into_iter()
            .flatten()
            .flatten()
            .filter_map(|entry| {
                let pid = entry.file_name().to_str()?.parse().ok()?;
                let executable = fs::read_link(entry.path().join("exe")).ok()?;
                executable.starts_with(&builds).then_some(pid)
            })
            .collect()
    }

    fn pinned(&self, build: Build) -> Option<&Pinned> {
        match build {
            Build::First => Some(&self.first),
            Build::Second => Some(&self.second),
            Build::StandIn => None,
        }
    }

    fn source(&self, build: Build) -> Result<PathBuf> {
        let folder = self.sources.join(build.folder());
        if folder.is_dir() {
            return Ok(folder);
        }
        fs::create_dir_all(&folder)?;
        let command = self.first.path.with_file_name(COMMAND);
        match self.pinned(build) {
            Some(pinned) => {
                fs::copy(&pinned.path, folder.join(SHELL))?;
                ensure!(
                    digest(&folder.join(SHELL))? == pinned.sha256,
                    "The copy of {} does not match its pinned hash",
                    pinned.path.display()
                );
                fs::copy(pinned.path.with_file_name(COMMAND), folder.join(COMMAND)).with_context(
                    || format!("No {COMMAND} command beside {}", pinned.path.display()),
                )?;
            }
            None => {
                fs::write(
                    folder.join(SHELL),
                    format!(
                        "#!/bin/sh\nif [ \"$1\" = --version ]; then\n  echo voyager-shell stand-in\n  exit 0\nfi\necho '{STAND_IN_LINE}' >&2\nexit 1\n"
                    ),
                )?;
                fs::set_permissions(folder.join(SHELL), fs::Permissions::from_mode(0o755))?;
                fs::copy(&command, folder.join(COMMAND))
                    .with_context(|| format!("No {COMMAND} command at {}", command.display()))?;
            }
        }
        Ok(folder)
    }

    fn sha256(&self, build: Build) -> Result<String> {
        match self.pinned(build) {
            Some(pinned) => Ok(pinned.sha256.clone()),
            None => digest(&self.source(build)?.join(SHELL)),
        }
    }

    fn lay_out(&self, profile: &Path, session: &str) -> Result<String> {
        let source = self.source(Build::First)?;
        let name = match &self.release {
            Some(release) => release.versions.first.clone(),
            None => format!("local-{}", &self.first.sha256[..8]),
        };
        let folder = self.build(&name);
        fs::create_dir_all(&folder)?;
        for file in [SHELL, COMMAND] {
            fs::copy(source.join(file), folder.join(file))?;
        }
        ensure!(
            digest(&folder.join(SHELL))? == self.first.sha256,
            "The installed copy of the first build does not match its pinned hash"
        );
        symlink(Path::new(BUILDS).join(&name), self.root.join("current"))?;
        fs::write(
            self.root.join("start.json"),
            serde_json::to_vec(&json!({"profile":profile,"session":session}))?,
        )?;
        Ok(name)
    }
}

impl Native {
    pub(super) fn lay_out_install(&mut self, layout: Layout) -> Result<()> {
        ensure!(
            self.surface.sidebar.is_none(),
            "An app started by voyager start writes no inspection, so the run cannot set its sidebar"
        );
        let second = self
            .second
            .take()
            .context("Starting through an install needs a second build; give --second-binary")?;
        if self.requests.is_none() {
            self.watch_requests()?;
        }
        if self.core.is_none() {
            self.system
                .execute(sandbox::CORE, &["server", "start"], None)?;
            self.bind_core()?;
        }
        fs::create_dir_all(self.profile())?;
        let evidence = &self.system.evidence;
        let home = evidence.join("home");
        fs::create_dir_all(&home)?;
        fs::write(home.join(".bashrc"), COUNTER)?;
        fs::write(home.join(".bash_profile"), ". ~/.bashrc\n")?;
        fs::create_dir_all(evidence.join("install"))?;
        let mut install = Install {
            root: fs::canonicalize(evidence.join("install"))?,
            sources: evidence.join("install-sources"),
            first: self.candidate.clone(),
            second,
            release: None,
        };
        if layout == Layout::Release {
            install.prepare_site()?;
            install.publish(Site::Second)?;
        }
        let name = install.lay_out(&self.profile(), &self.system.session)?;
        self.system.record(json!({"event":"install","root":install.root,"current":install.link("current")?,"releases":install.releases(),"versions":install.release.as_ref().map(|release| &release.versions)}))?;
        let shell = install.build(&name).join(SHELL);
        self.install = Some(install);
        if layout == Layout::Release {
            self.start_from(&shell)?;
            self.present()?;
        }
        Ok(())
    }

    pub fn install_versions(&self) -> Result<Versions> {
        Ok(self
            .install()?
            .release
            .as_ref()
            .context("This run lays out no release install")?
            .versions
            .clone())
    }

    pub fn install_publish(&mut self, served: Site) -> Result<serde_json::Value> {
        let manifest = self.install()?.publish(served)?;
        self.system
            .record(json!({"event":"publish","served":served,"manifest":manifest}))?;
        Ok(manifest)
    }

    pub fn install_folders(&self) -> Result<Vec<String>> {
        self.install()?.folders()
    }

    pub fn install_staged(&self, name: &str) -> Result<Option<Links>> {
        let began = Instant::now();
        while began.elapsed() < UPDATE_PATIENCE {
            let links = self.install_links()?;
            if links.next.as_ref().is_some_and(|next| next.name == name) {
                return Ok(Some(links));
            }
            sleep(POLL);
        }
        Ok(None)
    }

    pub fn install_network_update(&mut self) -> Result<Ran> {
        Ok(self.run_installed(&["update"], |_| Ok(()))?.0)
    }

    pub fn install_restart(&mut self) -> Result<Ran> {
        let install = self.install()?;
        let logs = install.logs()?;
        let shells = install.running(SHELL);
        let me = std::process::id();
        rustix::process::set_child_subreaper(Some(rustix::process::getpid()))?;
        let restarted = (|| {
            self.click(&Target::RESTART_NOW)?;
            self.await_exit()?;
            let began = Instant::now();
            let mut starter = loop {
                let found = self
                    .install()?
                    .running(COMMAND)
                    .into_iter()
                    .find(|pid| parent(*pid).is_ok_and(|parent| parent == me));
                if let Some(pid) = found {
                    break Owned::adopt(pid)?;
                }
                if began.elapsed() >= UPDATE_PATIENCE {
                    return Ok(None);
                }
                sleep(POLL);
            };
            let began = Instant::now();
            loop {
                if let Some(status) = starter.child.try_wait()? {
                    return Ok(Some(status));
                }
                ensure!(
                    began.elapsed() < START_PATIENCE,
                    TimedOut(format!(
                        "voyager start did not finish within {} s of Restart",
                        START_PATIENCE.as_secs()
                    ))
                );
                sleep(POLL);
            }
        })();
        rustix::process::set_child_subreaper(None)?;
        let install = self.install()?;
        let fresh: Vec<u32> = install
            .running(SHELL)
            .into_iter()
            .filter(|pid| !shells.contains(pid))
            .collect();
        let launched = install
            .logs()?
            .into_iter()
            .filter(|log| !logs.contains(log))
            .map(|log| install.launched(&log))
            .collect::<Result<Vec<_>>>()?;
        let status = match restarted {
            Ok(status) => status,
            Err(error) => {
                for pid in fresh {
                    drop(Owned::adopt(pid));
                }
                return Err(error);
            }
        };
        let mut strays = Vec::new();
        let mut taken = None;
        for pid in fresh {
            let owned = Owned::adopt(pid)?;
            if taken.is_none() {
                taken = Some(owned);
            } else {
                strays.push(owned.identity.clone());
            }
        }
        let ran = Ran {
            arguments: vec!["restart".into()],
            code: status.and_then(|status| status.code()),
            stdout: String::new(),
            stderr: String::new(),
            launched,
            strays,
        };
        self.system
            .record(json!({"event":"install-restart","ran":ran}))?;
        if let Some(viewer) = taken {
            self.take_viewer(viewer)?;
        }
        Ok(ran)
    }

    fn install(&self) -> Result<&Install> {
        self.install
            .as_ref()
            .context("This run did not start the app through an install")
    }

    pub fn install_links(&self) -> Result<Links> {
        let install = self.install()?;
        Ok(Links {
            current: install.link("current")?,
            previous: install.link("previous")?,
            next: install.link("next")?,
        })
    }

    pub fn install_sha256(&self, build: Build) -> Result<String> {
        self.install()?.sha256(build)
    }

    pub fn install_update(&mut self, build: Build) -> Result<Ran> {
        let source = self.install()?.source(build)?;
        let source = source.to_str().context("Non-UTF8 build source")?.to_owned();
        let (ran, _) = self.run_installed(&["update", "--from", &source], |_| Ok(()))?;
        Ok(ran)
    }

    pub fn install_rollback(&mut self) -> Result<Ran> {
        Ok(self.run_installed(&["rollback"], |_| Ok(()))?.0)
    }

    pub fn install_start(&mut self) -> Result<Ran> {
        Ok(self.install_start_watching(|_| Ok(()))?.0)
    }

    pub fn install_start_watching<T>(
        &mut self,
        watch: impl FnMut(&Native) -> Result<T>,
    ) -> Result<(Ran, Vec<T>)> {
        let launching = self.viewer.is_none();
        if launching {
            self.ready_to_launch()?;
        }
        self.run_installed(&["start"], watch)
    }

    pub fn activated_by<T>(
        &mut self,
        act: impl FnOnce(&mut Self) -> Result<T>,
    ) -> Result<(T, Vec<Observed>)> {
        let seen = self.activations()?.len();
        let done = act(self)?;
        let due = Instant::now() + REQUEST_PATIENCE;
        loop {
            let all = self.activations()?;
            if all.len() > seen || Instant::now() >= due {
                return Ok((done, all.into_iter().skip(seen).collect()));
            }
            sleep(POLL);
        }
    }

    fn app_answers(&self) -> bool {
        let session = &self.system.session;
        UnixStream::connect(
            self.system
                .socket()
                .with_file_name(format!("{session}.app.sock")),
        )
        .is_ok()
    }

    fn run_installed<T>(
        &mut self,
        arguments: &[&str],
        mut watch: impl FnMut(&Native) -> Result<T>,
    ) -> Result<(Ran, Vec<T>)> {
        let install = self.install()?;
        let logs = install.logs()?;
        let apps = install.apps();
        let command = install.root.join("current").join(COMMAND);
        let env = self.launch_env()?;
        let at = stamp();
        let stdout = self.system.evidence.join(format!("install-{at}.out"));
        let stderr = self.system.evidence.join(format!("install-{at}.err"));
        let patience = if arguments.first() == Some(&"start") {
            START_PATIENCE
        } else {
            UPDATE_PATIENCE
        };
        let finished = self.system.act(
            json!({"program":command,"arguments":arguments,"stdout":stdout,"stderr":stderr}),
            || {
                rustix::process::set_child_subreaper(Some(rustix::process::getpid()))?;
                let waited = (|| {
                    let mut child = Command::new(&command)
                        .args(arguments)
                        .env_clear()
                        .envs(&self.system.env)
                        .envs(env.iter().map(|(key, value)| (key, value)))
                        .stdin(Stdio::null())
                        .stdout(File::create(&stdout)?)
                        .stderr(File::create(&stderr)?)
                        .spawn()?;
                    let began = Instant::now();
                    let mut seen = Vec::new();
                    let mut answered = false;
                    let outcome = (|| loop {
                        if let Some(status) = child.try_wait()? {
                            return Ok(status);
                        }
                        ensure!(
                            began.elapsed() < patience,
                            TimedOut(format!(
                                "{} {} did not finish within {} s",
                                command.display(),
                                arguments.join(" "),
                                patience.as_secs()
                            ))
                        );
                        let observed = watch(self)?;
                        answered = answered || self.app_answers();
                        if !answered {
                            seen.push(observed);
                        }
                        sleep(POLL);
                    })();
                    if outcome.is_err() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                    Ok::<_, anyhow::Error>((outcome?, seen))
                })();
                rustix::process::set_child_subreaper(None)?;
                waited
            },
        );
        let install = self.install()?;
        let fresh: Vec<u32> = install
            .apps()
            .into_iter()
            .filter(|pid| !apps.contains(pid))
            .collect();
        let launched = install
            .logs()?
            .into_iter()
            .filter(|log| !logs.contains(log))
            .map(|log| install.launched(&log))
            .collect::<Result<Vec<_>>>()?;
        let (status, seen) = match finished {
            Ok(finished) => finished,
            Err(error) => {
                for pid in fresh {
                    drop(Owned::adopt(pid));
                }
                return Err(error);
            }
        };
        let mut strays = Vec::new();
        let mut taken = None;
        for pid in fresh {
            let owned = Owned::adopt(pid)?;
            if self.viewer.is_none() && taken.is_none() {
                taken = Some(owned);
            } else {
                strays.push(owned.identity.clone());
            }
        }
        let ran = Ran {
            arguments: arguments.iter().map(|part| (*part).to_owned()).collect(),
            code: status.code(),
            stdout: fs::read_to_string(&stdout).unwrap_or_default(),
            stderr: fs::read_to_string(&stderr).unwrap_or_default(),
            launched,
            strays,
        };
        self.system
            .record(json!({"event":"install-run","ran":ran}))?;
        if let Some(viewer) = taken {
            self.take_viewer(viewer)?;
        }
        Ok((ran, seen))
    }

    fn take_viewer(&mut self, viewer: Owned) -> Result<()> {
        let executable = viewer.identity.executable.clone();
        let sha256 = digest(&executable)?;
        let install = self.install()?;
        let pinned = [&install.first, &install.second]
            .into_iter()
            .find(|pinned| pinned.sha256 == sha256)
            .cloned()
            .ok_or_else(|| {
                Defect(format!(
                    "voyager start launched {}, whose sha256 {sha256} is neither pinned build",
                    executable.display()
                ))
            })?;
        let build = executable
            .parent()
            .and_then(Path::file_name)
            .map(|name| name.to_string_lossy().into_owned());
        self.system.record(json!({"event":"adopt","identity":viewer.identity,"executable":executable,"build":build,"sha256":sha256}))?;
        self.candidate = pinned;
        self.record_build()?;
        self.attach(viewer);
        self.show(
            None,
            json!({"executable":executable,"build":build,"root":self.install()?.root}),
        )?;
        if self.core.is_none() {
            self.bind_core()?;
        }
        self.present()
    }
}
