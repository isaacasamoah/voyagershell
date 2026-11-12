use crate::system::{
    Identity, Owned, System, digest, interrupted, save, stamp, until, until_cleanup,
};
use anyhow::{Context, Result, ensure};
use image::GenericImageView;
use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};
use std::thread::sleep;
use std::time::Duration;

pub struct Native {
    pub system: System,
    pub binary: PathBuf,
    pub expected: String,
    display: Option<Owned>,
    viewer: Option<Owned>,
    core: Option<Identity>,
    shell: Option<Identity>,
    pub address: String,
    window: String,
    core_id: Value,
}

impl Native {
    pub fn new(system: System, binary: PathBuf, expected: String) -> Self {
        Self {
            system,
            binary,
            expected,
            display: None,
            viewer: None,
            core: None,
            shell: None,
            address: String::new(),
            window: String::new(),
            core_id: Value::Null,
        }
    }

    pub fn prepare(&mut self) -> Result<()> {
        let number = (200..1000)
            .find(|n| {
                !Path::new(&format!("/tmp/.X{n}-lock")).exists()
                    && !Path::new(&format!("/tmp/.X11-unix/X{n}")).exists()
            })
            .context("No unused isolated display")?;
        let display = format!(":{number}");
        self.system.env.insert("DISPLAY".into(), display.clone());
        self.display = Some(self.system.spawn(
            Path::new("Xvfb"),
            &[
                &display,
                "-screen",
                "0",
                "3000x2000x24",
                "-dpi",
                "192",
                "-nolisten",
                "tcp",
            ],
            "display.log",
        )?);
        until("owned Xvfb", || {
            self.display
                .as_ref()
                .context("Missing display")?
                .identity
                .verify()?;
            Ok(self
                .system
                .execute("xdotool", &["getmouselocation"], None)
                .ok())
        })?;
        self.system
            .execute("xrdb", &["-merge"], Some("Xft.dpi: 192\n"))?;
        self.launch()?;
        until("dedicated Core socket", || {
            Ok(self.system.socket().exists().then_some(()))
        })?;
        let core = self.system.rpc("server.status", json!({}))?;
        self.core = Some(Identity::read(pid(&core)?)?);
        self.core_id = core["core"]["id"].clone();
        ensure!(!self.core_id.is_null(), "Missing Core identity");
        self.address = until("bound terminal", || {
            let doc = self
                .system
                .rpc("doc.get", json!({"name":"voyager-layout-v1"}))?;
            Ok(doc["value"]["contents"][0]["backend"]
                .as_str()
                .map(str::to_owned))
        })?;
        let shell = self
            .system
            .rpc("terminal.get", json!({"terminal":self.address}))?;
        self.shell = Some(Identity::read(pid(&shell)?)?);
        save(
            self.system.evidence.join("identity.json"),
            &json!({"core":self.core,"coreId":self.core_id,"shell":self.shell,"terminal":self.address}),
        )?;
        self.focus()
    }

    pub fn launch(&mut self) -> Result<()> {
        ensure!(
            self.viewer.is_none(),
            "Existing viewer must close before reattachment"
        );
        ensure!(
            digest(&self.binary)? == self.expected,
            "Candidate changed before launch"
        );
        let profile = self.system.evidence.join("profile");
        let viewer = self.system.spawn(
            &self.binary,
            &[
                "--profile",
                profile.to_str().context("Invalid profile path")?,
                "--session",
                &self.system.session,
            ],
            "native.log",
        )?;
        self.viewer = Some(viewer);
        self.window = until("unique candidate window", || {
            let viewer = self.viewer.as_ref().context("Missing viewer")?;
            viewer.identity.verify()?;
            let output = self.system.execute(
                "xdotool",
                &[
                    "search",
                    "--onlyvisible",
                    "--pid",
                    &viewer.identity.pid.to_string(),
                ],
                None,
            );
            let mut matches = Vec::new();
            if let Ok(output) = output {
                for window in output.lines() {
                    let title = self
                        .system
                        .execute("xdotool", &["getwindowname", window], None)?;
                    if title == format!("Voyager — {}", self.system.session) {
                        matches.push(window.to_owned());
                    }
                }
            }
            ensure!(matches.len() <= 1, "Ambiguous candidate windows");
            Ok(matches.pop())
        })?;
        self.verify()?;
        save(
            self.system.evidence.join("launch.json"),
            &json!({"viewer":self.viewer.as_ref().map(|v| &v.identity),"window":self.window,"session":self.system.session,"binary":self.binary,"sha256":self.expected,"display":self.system.env["DISPLAY"]}),
        )?;
        Ok(())
    }

    pub fn verify(&self) -> Result<()> {
        ensure!(!interrupted(), "Verification cancelled");
        self.display
            .as_ref()
            .context("Missing display")?
            .identity
            .verify()?;
        let identity = &self.viewer.as_ref().context("Missing viewer")?.identity;
        identity.verify()?;
        ensure!(
            self.system
                .execute("xdotool", &["getwindowpid", &self.window], None)?
                == identity.pid.to_string(),
            "Window has a different owner"
        );
        ensure!(
            self.system
                .execute("xdotool", &["getwindowname", &self.window], None)?
                == format!("Voyager — {}", self.system.session),
            "Window has a different session"
        );
        Ok(())
    }

    pub fn focus(&self) -> Result<()> {
        self.verify()?;
        self.system
            .execute("xdotool", &["windowfocus", "--sync", &self.window], None)?;
        self.capture("geometry")?;
        let geometry = self.system.execute(
            "xdotool",
            &["getwindowgeometry", "--shell", &self.window],
            None,
        )?;
        let coordinate = |name: &str| -> Result<i32> {
            geometry
                .lines()
                .find_map(|line| line.strip_prefix(&format!("{name}=")))
                .context("Missing window coordinate")?
                .parse()
                .context("Invalid window coordinate")
        };
        let x = (coordinate("X")? + 840).to_string();
        let y = (coordinate("Y")? + 350).to_string();
        self.system
            .execute("xdotool", &["mousemove", &x, &y], None)?;
        self.pointer()?;
        self.system.execute("xdotool", &["click", "1"], None)?;
        Ok(())
    }

    fn keyboard(&self) -> Result<()> {
        self.verify()?;
        let focused = self.system.execute("xdotool", &["getwindowfocus"], None)?;
        ensure!(
            focused == self.window,
            "Keyboard focus left the owned candidate"
        );
        Ok(())
    }

    fn pointer(&self) -> Result<()> {
        self.verify()?;
        let location = self
            .system
            .execute("xdotool", &["getmouselocation", "--shell"], None)?;
        ensure!(
            location
                .lines()
                .any(|line| line == format!("WINDOW={}", self.window)),
            "Pointer left the owned candidate: {location}"
        );
        Ok(())
    }

    pub fn type_text(&self, text: &str) -> Result<()> {
        self.keyboard()?;
        self.system.execute(
            "xdotool",
            &["type", "--clearmodifiers", "--delay", "1", "--", text],
            None,
        )?;
        Ok(())
    }

    pub fn key(&self, key: &str) -> Result<()> {
        self.keyboard()?;
        self.system.execute("xdotool", &["key", key], None)?;
        Ok(())
    }

    pub fn line(&self, text: &str) -> Result<()> {
        self.type_text(text)?;
        self.key("Return")
    }

    pub fn wheel(&self, up: bool) -> Result<()> {
        for _ in 0..6 {
            self.pointer()?;
            self.system
                .execute("xdotool", &["click", if up { "4" } else { "5" }], None)?;
            sleep(Duration::from_millis(40));
        }
        sleep(Duration::from_millis(300));
        Ok(())
    }

    pub fn capture(&self, name: &str) -> Result<Vec<u8>> {
        self.verify()?;
        let path = self.system.evidence.join(format!("{name}-{}.png", stamp()));
        self.system.execute(
            "import",
            &[
                "-window",
                &self.window,
                path.to_str().context("Invalid image path")?,
            ],
            None,
        )?;
        let image = image::open(&path)?;
        ensure!(
            image.dimensions() == (1450, 940),
            "Unsupported measured viewport: {:?}",
            image.dimensions()
        );
        let region = image.crop_imm(243, 89, 1188, 140).to_rgba8().into_raw();
        self.system.record(json!({"event":"capture","path":path,"sha256":digest(&path)?,"region":[243,89,1188,140]}))?;
        Ok(region)
    }

    pub fn same_program(&self) -> Result<()> {
        self.core
            .as_ref()
            .context("Missing Core identity")?
            .verify()?;
        let shell = self.shell.as_ref().context("Missing shell identity")?;
        shell.verify()?;
        ensure!(
            pid(&self
                .system
                .rpc("terminal.get", json!({"terminal":self.address}))?)?
                == shell.pid,
            "Terminal shell changed"
        );
        ensure!(
            self.system.rpc("server.status", json!({}))?["core"]["id"] == self.core_id,
            "Core identity changed"
        );
        Ok(())
    }

    pub fn close(&mut self) -> Result<()> {
        self.key("ctrl+q")?;
        let viewer = self.viewer.as_mut().context("Missing viewer")?;
        until("owned viewer exit", || {
            Ok(viewer.child.try_wait()?.map(|_| ()))
        })?;
        self.viewer = None;
        Ok(())
    }

    pub fn cleanup(&mut self) -> Vec<String> {
        let mut errors = Vec::new();
        if let Some(mut viewer) = self.viewer.take()
            && let Err(error) = viewer.stop()
        {
            errors.push(format!("viewer: {error:#}"));
        }
        if self.system.socket().exists() {
            let stopped = (|| -> Result<()> {
                if self.core.is_none() {
                    self.core = Some(Identity::read(pid(&self
                        .system
                        .rpc("server.status", json!({}))?)?)?);
                }
                self.core
                    .as_ref()
                    .context("Missing Core identity")?
                    .verify()?;
                self.system.rpc("server.stop", json!({}))?;
                until_cleanup("dedicated Core exit", || {
                    Ok((!self.system.socket().exists()).then_some(()))
                })?;
                Ok(())
            })();
            if let Err(error) = stopped {
                errors.push(format!("Core: {error:#}"));
            }
        }
        for identity in [&self.core, &self.shell].into_iter().flatten() {
            if let Err(error) = until_cleanup("owned program exit", || {
                Ok((!Path::new(&format!("/proc/{}", identity.pid)).exists()).then_some(()))
            }) {
                errors.push(format!("process {}: {error:#}", identity.pid));
            }
        }
        if let Some(mut display) = self.display.take()
            && let Err(error) = display.stop()
        {
            errors.push(format!("display: {error:#}"));
        }
        errors
    }
}

pub fn pid(value: &Value) -> Result<u32> {
    u32::try_from(value["pid"].as_u64().context("Missing process PID")?).context("Invalid PID")
}

pub fn state(path: &Path) -> Result<Value> {
    serde_json::from_slice(&fs::read(path)?).context("Invalid probe state")
}

pub fn quote(value: &Path) -> Result<String> {
    Ok(format!(
        "'{}'",
        value
            .to_str()
            .context("Non-UTF8 shell path")?
            .replace('\'', "'\\''")
    ))
}
