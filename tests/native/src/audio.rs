pub mod exchange;
pub mod judge;
pub mod room;
pub mod selftest;
pub mod speech;
pub mod voice;

use crate::sandbox;
use crate::system::{Owned, PATIENCE, Stopped, System, poll, settle, until, until_cleanup};
use anyhow::{Context, Result, bail, ensure};
use judge::Score;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use speech::{Samples, Speech};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

pub const SPEAKER: &str = "speaker";
pub const MIC_FEED: &str = "mic_feed";
pub const MIC: &str = "mic";
pub const UNPLUGGED: &str = "unplugged";

const DAEMONS: [&str; 3] = ["pipewire", "wireplumber", "pipewire-pulse"];
const TOOLS: [&str; 9] = [
    "pipewire",
    "wireplumber",
    "pipewire-pulse",
    "pw-cli",
    "pactl",
    "parec",
    "paplay",
    "arecord",
    "aplay",
];
const LOOK: Duration = Duration::from_millis(80);

pub fn missing_tools() -> Vec<&'static str> {
    TOOLS
        .into_iter()
        .filter(|tool| !Path::new("/usr/bin").join(tool).is_file())
        .collect()
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Client {
    Pulse,
    Alsa,
}

impl Client {
    fn record(self, file: &Path) -> Result<(&'static str, Vec<String>)> {
        let file = sandbox::text(file)?;
        Ok(match self {
            Self::Pulse => (
                "parec",
                ["--raw", "--format=s16le", "--rate=48000", "--channels=1"]
                    .map(String::from)
                    .into_iter()
                    .chain([file])
                    .collect(),
            ),
            Self::Alsa => (
                "arecord",
                [
                    "-D", "default", "-t", "raw", "-f", "S16_LE", "-r", "48000", "-c", "1",
                ]
                .map(String::from)
                .into_iter()
                .chain([file])
                .collect(),
            ),
        })
    }

    fn play(self, file: &Path) -> Result<(&'static str, Vec<String>)> {
        let file = sandbox::text(file)?;
        Ok(match self {
            Self::Pulse => ("paplay", vec![file]),
            Self::Alsa => ("aplay", vec!["-D".into(), "default".into(), file]),
        })
    }

    pub fn start_recording(self, system: &System, folder: &Path, name: &str) -> Result<Recording> {
        let path = folder.join(format!("{name}.s16"));
        let (program, arguments) = self.record(&path)?;
        let arguments: Vec<&str> = arguments.iter().map(String::as_str).collect();
        let owned = system.spawn(
            &Path::new("/usr/bin").join(program),
            &arguments,
            &[],
            &format!("audio/{name}.log"),
        )?;
        Ok(Recording { owned, path })
    }

    pub fn start_playing(self, system: &System, wav: &Path, name: &str) -> Result<Owned> {
        let (program, arguments) = self.play(wav)?;
        let arguments: Vec<&str> = arguments.iter().map(String::as_str).collect();
        system.spawn(
            &Path::new("/usr/bin").join(program),
            &arguments,
            &[],
            &format!("audio/{name}.log"),
        )
    }
}

pub struct Recording {
    owned: Owned,
    path: PathBuf,
}

impl Recording {
    pub fn samples(&self) -> Result<Samples> {
        Ok(Samples::raw(&fs::read(&self.path)?))
    }

    pub fn alive(&mut self) -> Result<bool> {
        Ok(self.owned.child.try_wait()?.is_none())
    }

    pub fn began(&self) -> Result<u64> {
        poll(PATIENCE, Duration::from_millis(5), true, || {
            Ok(fs::metadata(&self.path)
                .is_ok_and(|file| file.len() > 0)
                .then(crate::native::now_millis))
        })?
        .context("The recorder delivered no samples")
    }

    pub fn heard(&self, wanted: &Speech) -> Result<Score> {
        let reference = wanted.samples()?;
        settle(
            PATIENCE,
            LOOK,
            || Ok(Some(judge::score(&reference, &self.samples()?))),
            Score::matches,
        )?
        .context("The recording never held still")
    }

    pub fn finish(&mut self, folder: &Path, name: &str) -> Result<(Samples, Stopped)> {
        let stopped = self.owned.stop()?;
        let samples = self.samples()?;
        fs::write(folder.join(format!("{name}.wav")), samples.encode())?;
        Ok((samples, stopped))
    }
}

#[derive(Deserialize)]
struct Named {
    index: u32,
    name: String,
}

#[derive(Deserialize)]
struct Stream {
    #[serde(default)]
    source: Option<u32>,
    #[serde(default)]
    sink: Option<u32>,
    #[serde(default)]
    properties: Map<String, Value>,
}

impl Stream {
    fn who(&self) -> String {
        self.properties
            .get("application.name")
            .and_then(Value::as_str)
            .unwrap_or("unnamed")
            .to_owned()
    }
}

pub struct Stack {
    daemons: Vec<(&'static str, Owned)>,
    folder: PathBuf,
}

impl Stack {
    pub fn start(system: &System) -> Result<Self> {
        let missing = missing_tools();
        ensure!(
            missing.is_empty(),
            "The audio host tools are missing: {}",
            missing.join(", ")
        );
        let folder = system.evidence.join("audio");
        fs::create_dir_all(&folder)?;
        let mut stack = Self {
            daemons: Vec::new(),
            folder,
        };
        let runtime = Path::new(sandbox::RUNTIME);
        for daemon in DAEMONS {
            let owned = system.spawn(
                &Path::new("/usr/bin").join(daemon),
                &[],
                &[],
                &format!("audio/{daemon}.log"),
            )?;
            stack.daemons.push((daemon, owned));
            let ready = match daemon {
                "pipewire" => ("pw-cli", vec!["info", "0"]),
                "pipewire-pulse" => ("pactl", vec!["info"]),
                _ => continue,
            };
            until(&format!("{daemon} to answer"), || {
                stack.alive()?;
                Ok(tool(system, ready.0, &ready.1).ok().map(|_| ()))
            })?;
        }
        ensure!(
            runtime.join("pulse/native").exists(),
            "The Pulse socket is missing"
        );
        for sink in [SPEAKER, MIC_FEED, UNPLUGGED] {
            let name = format!("sink_name={sink}");
            let description = format!("sink_properties=device.description={sink}");
            system.act(json!({"audio":"load-module","sink":sink}), || {
                tool(
                    system,
                    "pactl",
                    &["load-module", "module-null-sink", &name, &description],
                )
            })?;
        }
        let master = format!("master={MIC_FEED}.monitor");
        let source = format!("source_name={MIC}");
        let description = format!("source_properties=device.description={MIC}");
        system.act(json!({"audio":"load-module","source":MIC}), || {
            tool(
                system,
                "pactl",
                &[
                    "load-module",
                    "module-remap-source",
                    &master,
                    &source,
                    &description,
                ],
            )
        })?;
        for (verb, name) in [("set-default-sink", SPEAKER), ("set-default-source", MIC)] {
            system.act(json!({"audio":verb,"name":name}), || {
                tool(system, "pactl", &[verb, name])
            })?;
        }
        let defaults = settle(
            PATIENCE,
            LOOK,
            || {
                stack.alive()?;
                Ok(Some((
                    tool(system, "pactl", &["get-default-sink"])?,
                    tool(system, "pactl", &["get-default-source"])?,
                )))
            },
            |(sink, source)| sink == SPEAKER && source == MIC,
        )?
        .context("The default devices never held still")?;
        ensure!(
            defaults == (SPEAKER.to_owned(), MIC.to_owned()),
            "The session manager changed the default devices to {defaults:?}"
        );
        system.record(json!({"event":"audio-stack","defaults":defaults,"sinks":[SPEAKER,MIC_FEED,UNPLUGGED],"source":MIC}))?;
        Ok(stack)
    }

    pub fn folder(&self) -> &Path {
        &self.folder
    }

    pub fn alive(&mut self) -> Result<()> {
        for (name, owned) in &mut self.daemons {
            ensure!(
                owned.child.try_wait()?.is_none(),
                "The audio daemon {name} exited; see audio/{name}.log"
            );
        }
        Ok(())
    }

    fn named(system: &System, kind: &str) -> Result<Vec<Named>> {
        Ok(serde_json::from_str(&tool(
            system,
            "pactl",
            &["--format=json", "list", kind],
        )?)?)
    }

    fn index(system: &System, kind: &str, name: &str) -> Result<u32> {
        Self::named(system, kind)?
            .into_iter()
            .find(|node| node.name == name)
            .map(|node| node.index)
            .with_context(|| format!("The audio server lists no {name} in {kind}"))
    }

    pub fn recorders(&self, system: &System) -> Result<Vec<String>> {
        let mic = Self::index(system, "sources", MIC)?;
        let streams: Vec<Stream> = serde_json::from_str(&tool(
            system,
            "pactl",
            &["--format=json", "list", "source-outputs"],
        )?)?;
        Ok(streams
            .iter()
            .filter(|stream| stream.source == Some(mic))
            .map(Stream::who)
            .collect())
    }

    pub fn players(&self, system: &System) -> Result<Vec<String>> {
        let speaker = Self::index(system, "sinks", SPEAKER)?;
        let streams: Vec<Stream> = serde_json::from_str(&tool(
            system,
            "pactl",
            &["--format=json", "list", "sink-inputs"],
        )?)?;
        Ok(streams
            .iter()
            .filter(|stream| stream.sink == Some(speaker))
            .map(Stream::who)
            .collect())
    }

    pub fn capture(&self, system: &System, node: &str, name: &str) -> Result<Recording> {
        let path = self.folder.join(format!("{name}.s16"));
        let owned = system.spawn(
            Path::new("/usr/bin/parec"),
            &[
                "-d",
                node,
                "--raw",
                "--format=s16le",
                "--rate=48000",
                "--channels=1",
                "--latency-msec=10",
                &sandbox::text(&path)?,
            ],
            &[],
            &format!("audio/{name}.log"),
        )?;
        Ok(Recording { owned, path })
    }

    pub fn feed(&self, system: &System, speech: &Speech) -> Result<()> {
        let wav = speech.place(&self.folder)?;
        let device = format!("--device={MIC_FEED}");
        system.act(
            json!({"audio":"feed","speech":speech.name,"sha256":speech.sha256,"into":MIC_FEED}),
            || tool(system, "paplay", &[&device, &sandbox::text(&wav)?]),
        )?;
        Ok(())
    }

    pub fn start_feed(&self, system: &System, name: &str, samples: &Samples) -> Result<Owned> {
        let wav = self.folder.join(format!("{name}.wav"));
        fs::write(&wav, samples.encode())?;
        let device = format!("--device={MIC_FEED}");
        system.record(
            json!({"event":"audio-feed","name":name,"into":MIC_FEED,"samples":samples.0.len()}),
        )?;
        system.spawn(
            Path::new("/usr/bin/paplay"),
            &[&device, &sandbox::text(&wav)?],
            &[],
            &format!("audio/{name}-feed.log"),
        )
    }

    pub fn echo(&self, system: &System) -> Result<Echo> {
        let source = format!("source={SPEAKER}.monitor");
        let sink = format!("sink={MIC_FEED}");
        let module = system.act(
            json!({"audio":"load-module","echo":{"from":SPEAKER,"into":MIC_FEED}}),
            || {
                tool(
                    system,
                    "pactl",
                    &[
                        "load-module",
                        "module-loopback",
                        &source,
                        &sink,
                        "latency_msec=20",
                    ],
                )
            },
        )?;
        Ok(Echo { module })
    }

    pub fn stop(&mut self) -> Vec<String> {
        let mut errors = Vec::new();
        while let Some((name, mut owned)) = self.daemons.pop() {
            match owned.stop() {
                Ok(Stopped::Exited { .. }) => {}
                Ok(Stopped::Killed { stuck, .. }) => {
                    errors.push(format!("{name} had to be killed: {stuck}"));
                }
                Err(error) => errors.push(format!("{name}: {error:#}")),
            }
        }
        let runtime = Path::new(sandbox::RUNTIME);
        for residue in ["pipewire-0", "pipewire-0-manager", "pulse/native"] {
            if runtime.join(residue).exists() {
                errors.push(format!(
                    "Audio residue remains: {}",
                    runtime.join(residue).display()
                ));
            }
        }
        errors
    }
}

pub struct Echo {
    module: String,
}

impl Echo {
    pub fn stop(self, system: &System) -> Result<()> {
        system.act(json!({"audio":"unload-module","echo":&self.module}), || {
            tool(system, "pactl", &["unload-module", &self.module])
        })?;
        Ok(())
    }
}

pub fn tool(system: &System, program: &str, arguments: &[&str]) -> Result<String> {
    let output = Command::new("timeout")
        .env_clear()
        .envs(&system.env)
        .args(["--kill-after=2s", "8s", program])
        .args(arguments)
        .stdin(Stdio::null())
        .output()
        .with_context(|| format!("The host tool {program} did not start"))?;
    if matches!(output.status.code(), Some(124 | 137)) {
        bail!("The host tool {program} did not finish within 8 s");
    }
    ensure!(
        output.status.success(),
        "{program} {} failed with {}: {}",
        arguments.join(" "),
        output.status,
        String::from_utf8_lossy(&output.stderr).trim()
    );
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

pub fn wait_for_exit(player: &mut Owned) -> Result<()> {
    until_cleanup("the player to finish", || {
        Ok(player.child.try_wait()?.map(|_| ()))
    })
}
