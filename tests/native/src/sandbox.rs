use anyhow::{Context, Result, ensure};
use rustix::process::{Pid, Signal, kill_process};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs;
use std::os::unix::fs::{FileTypeExt, MetadataExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

pub const HOME: &str = "/voyager/home";
pub const PROJECT: &str = "/voyager/home/project";
pub const RUNTIME: &str = "/voyager/runtime";
pub const CORE: &str = "/voyager/bin/hc";
pub const DISPLAY: &str = ":99";

pub const ENVIRONMENT: &[(&str, &str)] = &[
    ("PATH", "/voyager/bin:/usr/bin"),
    ("HOME", HOME),
    ("SHELL", "/bin/bash"),
    ("LANG", "C.UTF-8"),
    ("XDG_RUNTIME_DIR", RUNTIME),
    ("LIBGL_ALWAYS_SOFTWARE", "1"),
    (
        "__EGL_VENDOR_LIBRARY_FILENAMES",
        "/usr/share/glvnd/egl_vendor.d/50_mesa.json",
    ),
    ("__GLX_VENDOR_LIBRARY_NAME", "mesa"),
];

const NAMESPACE: &str = "/usr/bin/bwrap --unshare-user --unshare-pid --unshare-net --unshare-ipc \
    --unshare-uts --unshare-cgroup-try --die-with-parent --new-session --clearenv \
    --hostname voyager-verification --ro-bind /usr /usr --ro-bind /etc /etc \
    --proc /proc --dev /dev --tmpfs /tmp";

pub struct Sandbox<'a> {
    pub verifier: &'a Path,
    pub candidate: &'a Path,
    pub core: &'a Path,
    pub assets: Option<&'a Path>,
    pub evidence: Option<&'a Path>,
}

impl Sandbox<'_> {
    pub fn command(&self, inner: &[impl AsRef<str>]) -> Result<Vec<String>> {
        let mut command: Vec<String> = NAMESPACE.split(' ').map(String::from).collect();
        command.extend(["--perms", "0700", "--tmpfs", RUNTIME].map(String::from));
        for link in ["/bin", "/sbin", "/lib", "/lib64"] {
            if let Ok(target) = fs::read_link(link) {
                command.extend(["--symlink".into(), text(&target)?, link.into()]);
            } else if Path::new(link).exists() {
                command.extend(["--ro-bind".into(), link.into(), link.into()]);
            }
        }
        command.extend(["--ro-bind".into(), text(self.core)?, CORE.into()]);
        for path in [Some(self.verifier), Some(self.candidate), self.assets]
            .into_iter()
            .flatten()
        {
            command.extend(["--ro-bind".into(), text(path)?, text(path)?]);
        }
        match self.evidence {
            Some(evidence) => command.extend([
                "--bind".into(),
                text(evidence)?,
                text(evidence)?,
                "--bind".into(),
                text(&evidence.join("home"))?,
                HOME.into(),
            ]),
            None => command.extend(["--tmpfs", HOME, "--dir", PROJECT].map(String::from)),
        }
        command.extend(["--chdir".into(), PROJECT.into()]);
        for (key, value) in ENVIRONMENT {
            command.extend(["--setenv".into(), (*key).into(), (*value).into()]);
        }
        command.push("--".into());
        command.extend(inner.iter().map(|part| part.as_ref().to_owned()));
        Ok(command)
    }
}

pub fn text(path: &Path) -> Result<String> {
    Ok(path.to_str().context("Non-UTF8 sandbox path")?.to_owned())
}

pub fn process(command: &[String]) -> Command {
    let mut process = Command::new(&command[0]);
    process.args(&command[1..]).env_clear().stdin(Stdio::null());
    process
}

pub fn end(sandbox: &mut Child) -> Result<()> {
    let children = fs::read_to_string(format!("/proc/{0}/task/{0}/children", sandbox.id()));
    let init = children
        .ok()
        .and_then(|pids| pids.split_whitespace().next()?.parse().ok())
        .and_then(Pid::from_raw);
    if init.is_none_or(|init| kill_process(init, Signal::KILL).is_err()) {
        sandbox.kill()?;
    }
    sandbox.wait()?;
    Ok(())
}

pub fn prepare(evidence: &Path) -> Result<()> {
    ensure!(evidence.is_absolute(), "Evidence path must be absolute");
    fs::create_dir(evidence).context("Evidence must be a new directory with an existing parent")?;
    fs::set_permissions(evidence, fs::Permissions::from_mode(0o700))?;
    let project = evidence.join("home/project");
    fs::create_dir_all(&project)?;
    fs::write(
        project.join("README.md"),
        "# Verification fixture project\n",
    )?;
    Ok(())
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Resource {
    Path {
        name: String,
        path: PathBuf,
        device: u64,
        inode: u64,
    },
    Abstract {
        name: String,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Reach {
    Absent,
    Replaced,
    Reached,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Observation {
    #[serde(flatten)]
    pub resource: Resource,
    pub reach: Reach,
}

fn identify(name: &str, path: PathBuf) -> Option<Resource> {
    let found = fs::metadata(&path).ok()?;
    Some(Resource::Path {
        name: name.into(),
        path,
        device: found.dev(),
        inode: found.ino(),
    })
}

fn abstract_sockets() -> Result<BTreeSet<String>> {
    Ok(fs::read_to_string("/proc/net/unix")?
        .lines()
        .filter_map(|line| line.split_once(" @").map(|(_, name)| name.to_owned()))
        .collect())
}

pub fn host_resources() -> Result<Vec<Resource>> {
    let uid = rustix::process::getuid().as_raw();
    let mut paths = vec![(
        "runtime".to_owned(),
        PathBuf::from(format!("/run/user/{uid}")),
    )];
    for (name, key) in [("home", "HOME"), ("runtime", "XDG_RUNTIME_DIR")] {
        if let Some(folder) = std::env::var_os(key).map(PathBuf::from) {
            paths.extend(fs::canonicalize(&folder).map(|real| (name.to_owned(), real)));
            paths.push((name.to_owned(), folder));
        }
    }
    let session: Vec<_> = paths
        .iter()
        .filter(|(name, _)| name == "runtime")
        .map(|(_, folder)| folder.clone())
        .chain([PathBuf::from("/tmp/.X11-unix")])
        .collect();
    for folder in session {
        paths.extend(sockets(&folder));
    }
    paths.sort();
    paths.dedup();
    let mut resources: Vec<_> = paths
        .into_iter()
        .filter_map(|(name, path)| identify(&name, path))
        .collect();
    resources.extend(
        abstract_sockets()?
            .into_iter()
            .filter(|name| name.starts_with("/tmp/"))
            .map(|name| Resource::Abstract { name }),
    );
    Ok(resources)
}

fn sockets(folder: &Path) -> Vec<(String, PathBuf)> {
    fs::read_dir(folder)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| fs::metadata(entry.path()).is_ok_and(|found| found.file_type().is_socket()))
        .map(|entry| {
            (
                entry.file_name().to_string_lossy().into_owned(),
                entry.path(),
            )
        })
        .collect()
}

pub fn observe(resources: Vec<Resource>) -> Result<Vec<Observation>> {
    let bound = abstract_sockets()?;
    Ok(resources
        .into_iter()
        .map(|resource| {
            let reach = match &resource {
                Resource::Path {
                    path,
                    device,
                    inode,
                    ..
                } => match fs::metadata(path) {
                    Ok(found) if found.dev() == *device && found.ino() == *inode => Reach::Reached,
                    Ok(_) => Reach::Replaced,
                    Err(_) => Reach::Absent,
                },
                Resource::Abstract { name } if bound.contains(name) => Reach::Reached,
                Resource::Abstract { .. } => Reach::Absent,
            };
            Observation { resource, reach }
        })
        .collect())
}

pub fn sealed(observations: &[Observation]) -> Result<()> {
    let reached: Vec<_> = observations
        .iter()
        .filter(|observation| observation.reach == Reach::Reached)
        .map(|observation| match &observation.resource {
            Resource::Path { path, .. } => path.display().to_string(),
            Resource::Abstract { name } => format!("@{name}"),
        })
        .collect();
    ensure!(
        reached.is_empty(),
        "Sandbox reaches host resources: {}",
        reached.join(", ")
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::system::{Identity, stamp, until};
    use std::os::linux::net::SocketAddrExt;
    use std::os::unix::net::{SocketAddr, UnixListener};

    struct Host {
        executable: PathBuf,
        session: PathBuf,
        evidence: PathBuf,
        resources: Vec<Resource>,
        _listeners: [UnixListener; 2],
    }

    impl Host {
        fn new(label: &str) -> Result<Self> {
            let unique = format!("vv-{label}-{}-{}", std::process::id(), stamp());
            let root = std::env::temp_dir().join(&unique);
            let session = root.join("session");
            fs::create_dir_all(&session)?;
            let evidence = root.join("evidence");
            prepare(&evidence)?;
            let bus = session.join("bus");
            let name = format!("/tmp/{unique}");
            let listeners = [
                UnixListener::bind(&bus)?,
                UnixListener::bind_addr(&SocketAddr::from_abstract_name(&name)?)?,
            ];
            let resources = vec![
                identify("session", session.clone()).context("Missing session folder")?,
                identify("bus", bus).context("Missing session socket")?,
                Resource::Abstract { name },
            ];
            Ok(Self {
                executable: std::env::current_exe()?,
                session,
                evidence,
                resources,
                _listeners: listeners,
            })
        }

        fn sandbox(
            &self,
            exposed: Option<&Path>,
            evidence: Option<&Path>,
            inner: &[&str],
        ) -> Result<Vec<String>> {
            Sandbox {
                verifier: &self.executable,
                candidate: &self.executable,
                core: &self.executable,
                assets: exposed,
                evidence,
            }
            .command(inner)
        }

        fn reaches(&self, exposed: Option<&Path>) -> Result<Vec<Reach>> {
            let home = self.evidence.join("home");
            fs::write(
                home.join("resources.json"),
                serde_json::to_vec(&self.resources)?,
            )?;
            let canary = self.sandbox(
                exposed,
                Some(&self.evidence),
                &[
                    &text(&self.executable)?,
                    "--exact",
                    "sandbox::tests::canary_reports_from_inside_a_sandbox",
                ],
            )?;
            let output = process(&canary).output()?;
            ensure!(
                output.status.success(),
                "Sandboxed canary failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            let observed: Vec<Observation> =
                serde_json::from_slice(&fs::read(home.join("observed.json"))?)?;
            Ok(observed.iter().map(|found| found.reach).collect())
        }
    }

    #[test]
    fn canary_reports_from_inside_a_sandbox() -> Result<()> {
        let home = Path::new(HOME);
        if let Ok(resources) = fs::read(home.join("resources.json")) {
            let observed = observe(serde_json::from_slice(&resources)?)?;
            fs::write(home.join("observed.json"), serde_json::to_vec(&observed)?)?;
        }
        Ok(())
    }

    #[test]
    fn canary_reaches_host_resources_without_a_sandbox() -> Result<()> {
        let host = Host::new("open")?;
        let observed = observe(host.resources.clone())?;
        ensure!(
            observed.iter().all(|found| found.reach == Reach::Reached),
            "Canary missed a host resource: {observed:?}"
        );
        ensure!(
            sealed(&observed).is_err(),
            "Reached resources were accepted"
        );
        Ok(())
    }

    #[test]
    fn sandbox_refuses_host_resources() -> Result<()> {
        let reaches = Host::new("sealed")?.reaches(None)?;
        ensure!(
            reaches == [Reach::Absent; 3],
            "Sandbox reached the host: {reaches:?}"
        );
        Ok(())
    }

    #[test]
    fn canary_detects_a_host_folder_exposed_to_the_sandbox() -> Result<()> {
        let host = Host::new("leaky")?;
        let reaches = host.reaches(Some(&host.session))?;
        ensure!(
            reaches == [Reach::Reached, Reach::Reached, Reach::Absent],
            "Canary missed the exposed folder: {reaches:?}"
        );
        Ok(())
    }

    #[test]
    fn sandbox_environment_is_the_fixed_table() -> Result<()> {
        let command = Host::new("environment")?.sandbox(None, None, &["/usr/bin/env"])?;
        let output = process(&command)
            .env("HOST_SESSION_MARKER", "leaked")
            .output()?;
        let mut expected: Vec<_> = ENVIRONMENT
            .iter()
            .map(|(key, value)| format!("{key}={value}"))
            .chain([format!("PWD={PROJECT}")])
            .collect();
        expected.sort();
        let mut found: Vec<_> = String::from_utf8(output.stdout)?
            .lines()
            .map(str::to_owned)
            .collect();
        found.sort();
        ensure!(found == expected, "Sandbox environment differs: {found:?}");
        Ok(())
    }

    fn descendants(pid: u32, found: &mut Vec<Identity>) -> Result<()> {
        for task in fs::read_dir(format!("/proc/{pid}/task"))? {
            let children = fs::read_to_string(task?.path().join("children"))?;
            for child in children.split_whitespace() {
                let child = child.parse()?;
                found.push(Identity::read(child)?);
                descendants(child, found)?;
            }
        }
        Ok(())
    }

    fn sleepers(label: &str) -> Result<Vec<String>> {
        Host::new(label)?.sandbox(
            None,
            None,
            &["/bin/sh", "-c", "setsid sleep 600 & sleep 600 & sleep 600"],
        )
    }

    fn sleeping(parent: u32) -> Result<Vec<Identity>> {
        let sleep = fs::canonicalize("/bin/sleep")?;
        until("sandboxed processes", || {
            let mut found = Vec::new();
            let listed = descendants(parent, &mut found).is_ok();
            let sleeping = found.iter().filter(|identity| identity.executable == sleep);
            Ok((listed && sleeping.count() == 3).then_some(found))
        })
    }

    #[test]
    fn killing_the_parent_ends_every_sandboxed_process() -> Result<()> {
        let mut parent = Command::new("/bin/sh")
            .args(["-c", "\"$@\" & wait", "sh"])
            .args(sleepers("kill")?)
            .env_clear()
            .stdin(Stdio::null())
            .spawn()?;
        let owned = sleeping(parent.id())?;
        parent.kill()?;
        parent.wait()?;
        until("sandbox teardown", || {
            Ok(owned
                .iter()
                .all(|identity| identity.verify().is_err())
                .then_some(()))
        })
    }

    #[test]
    fn ending_a_sandbox_returns_after_its_last_process() -> Result<()> {
        let mut sandbox = process(&sleepers("end")?).spawn()?;
        let owned = sleeping(sandbox.id())?;
        end(&mut sandbox)?;
        ensure!(
            owned.iter().all(|identity| identity.verify().is_err()),
            "A sandboxed process outlived the sandbox"
        );
        Ok(())
    }
}
