use crate::{
    audio_io::{base64, parse_wav, samples_wav},
    core::{Core, Error},
    core_shapes::{RunParams, Terminal},
    http1,
    speech::{
        Clip, Fault, Hearing, Phrase, Speaking, SpokenText, Utterance, clean_heard, hearing_prompt,
    },
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    env, fs,
    net::{Ipv4Addr, TcpListener},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

pub const DIRECTORY_VARIABLE: &str = "VOYAGER_OMNI_DIR";
pub const SERVER_VARIABLE: &str = "VOYAGER_OMNI_SERVER";
pub const GPU_LAYERS_VARIABLE: &str = "VOYAGER_OMNI_GPU_LAYERS";
pub const SERVICE_LABEL: &str = "voyager.service";
pub const SERVICE: &str = "voice-engine";
const PORT_LABEL: &str = "voyager.port";
const NAME: &str = "voice-engine";
const MODEL: &str = "LFM3-Omni-2B-Q4_K_M.gguf";
const PROJECTOR: &str = "mmproj-LFM3-Omni-2B-Q4_K_M.gguf";
const SNAPSHOTS: &str = "models--LiquidAI--LFM3-Omni-2B-GGUF/snapshots";
const VOICE: &str = "female";
const READY_WITHIN: Duration = Duration::from_secs(120);
const REQUEST_WITHIN: Duration = Duration::from_secs(30);
const HEALTH_WITHIN: Duration = Duration::from_millis(800);

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Settings {
    pub directory: PathBuf,
    pub server: Option<PathBuf>,
    pub gpu_layers: u32,
    pub huggingface: PathBuf,
}

impl Settings {
    pub fn from_environment() -> Self {
        let home = env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
        let cache = env::var_os("XDG_CACHE_HOME")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .unwrap_or_else(|| home.join(".cache"));
        let huggingface = env::var_os("HF_HOME")
            .map(|path| PathBuf::from(path).join("hub"))
            .unwrap_or_else(|| cache.join("huggingface/hub"));
        Self {
            directory: env::var_os(DIRECTORY_VARIABLE)
                .map(PathBuf::from)
                .unwrap_or_else(|| cache.join("voyager/voice/omni")),
            server: env::var_os(SERVER_VARIABLE).map(PathBuf::from),
            gpu_layers: env::var(GPU_LAYERS_VARIABLE)
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(0),
            huggingface,
        }
    }

    pub fn clips(&self) -> PathBuf {
        self.directory
            .parent()
            .map(|voice| voice.join("clips"))
            .unwrap_or_else(|| self.directory.join("clips"))
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Files {
    pub server: PathBuf,
    pub model: PathBuf,
    pub projector: PathBuf,
}

fn snapshot_file(settings: &Settings, name: &str) -> Option<PathBuf> {
    fs::read_dir(settings.huggingface.join(SNAPSHOTS))
        .ok()?
        .filter_map(Result::ok)
        .map(|snapshot| snapshot.path().join(name))
        .find(|path| path.is_file())
}

fn find(settings: &Settings, name: &str) -> Option<PathBuf> {
    Some(settings.directory.join(name))
        .filter(|path| path.is_file())
        .or_else(|| snapshot_file(settings, name))
}

pub fn locate(settings: &Settings) -> Result<Files, String> {
    let server = settings
        .server
        .clone()
        .unwrap_or_else(|| settings.directory.join("llama-server"));
    let mut missing = Vec::new();
    if !server.is_file() {
        missing.push("the llama.cpp server");
    }
    let model = find(settings, MODEL);
    if model.is_none() {
        missing.push("the Omni model");
    }
    let projector = find(settings, PROJECTOR);
    if projector.is_none() {
        missing.push("the Omni audio projector");
    }
    match (model, projector) {
        (Some(model), Some(projector)) if missing.is_empty() => Ok(Files {
            server,
            model,
            projector,
        }),
        _ => Err(format!(
            "Local voice is not installed. Missing {}.",
            missing.join(", ")
        )),
    }
}

pub fn arguments(files: &Files, port: u16, gpu_layers: u32) -> Vec<String> {
    let path = |path: &Path| path.to_string_lossy().into_owned();
    [
        path(&files.server),
        "-m".into(),
        path(&files.model),
        "-mm".into(),
        path(&files.projector),
        "--host".into(),
        "127.0.0.1".into(),
        "--port".into(),
        port.to_string(),
        "--jinja".into(),
        "--reasoning".into(),
        "off".into(),
        "--temp".into(),
        "0".into(),
        "-c".into(),
        "8192".into(),
        "-ngl".into(),
        gpu_layers.to_string(),
    ]
    .to_vec()
}

fn free_port() -> Result<u16, Fault> {
    TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|error| {
            Fault::Failed(format!(
                "No local port is free for the voice engine: {error}"
            ))
        })
}

fn healthy(port: u16) -> bool {
    http1::request(port, "GET", "/health", b"", HEALTH_WITHIN)
        .is_ok_and(|response| response.status == 200)
}

fn engine_terminal(terminal: &Terminal, files: &Files) -> bool {
    terminal.labels.get(SERVICE_LABEL).map(String::as_str) == Some(SERVICE)
        && terminal.argv.first().map(Path::new) == Some(files.server.as_path())
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Running {
    pub terminal: String,
    pub port: u16,
}

pub fn launch(core: &mut Core, files: &Files, settings: &Settings) -> Result<Running, Fault> {
    let listed = core
        .terminal_list()
        .map_err(|error| Fault::Failed(format!("Core could not list programs: {error:?}")))?;
    for terminal in listed
        .iter()
        .filter(|terminal| terminal.is_live() && engine_terminal(terminal, files))
    {
        let port = terminal
            .labels
            .get(PORT_LABEL)
            .and_then(|port| port.parse().ok());
        match port {
            Some(port) if healthy(port) => {
                return Ok(Running {
                    terminal: terminal.address.clone(),
                    port,
                });
            }
            _ => {
                core.terminal_kill(&terminal.address).map_err(|error| {
                    Fault::Failed(format!(
                        "The earlier voice engine was not stopped: {error:?}"
                    ))
                })?;
            }
        }
    }
    let port = free_port()?;
    let directory = files.server.parent().unwrap_or(Path::new("/"));
    let started = core
        .terminal_run_with(RunParams {
            argv: arguments(files, port, settings.gpu_layers),
            cwd: Some(directory.to_string_lossy().into_owned()),
            env: HashMap::from([(
                "LD_LIBRARY_PATH".into(),
                directory.to_string_lossy().into_owned(),
            )]),
            name: Some(NAME.into()),
            labels: HashMap::from([
                (SERVICE_LABEL.into(), SERVICE.into()),
                (PORT_LABEL.into(), port.to_string()),
            ]),
            no_parent: true,
            no_notify: true,
            ..Default::default()
        })
        .map_err(|error| {
            Fault::Failed(format!("Core did not start the voice engine: {error:?}"))
        })?;
    let running = Running {
        terminal: started.address,
        port,
    };
    let until = Instant::now() + READY_WITHIN;
    while !healthy(port) {
        if Instant::now() >= until {
            return Err(Fault::Failed(
                "The voice engine did not become ready".into(),
            ));
        }
        match core.terminal_get(&running.terminal) {
            Ok(terminal) if terminal.is_live() => {}
            _ => {
                return Err(Fault::Failed(
                    "The voice engine stopped while loading".into(),
                ));
            }
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Ok(running)
}

pub fn stop(core: &mut Core, running: &Running, files: &Files) -> Result<(), Error> {
    let terminal = core.terminal_get(&running.terminal)?;
    if terminal.is_live() && engine_terminal(&terminal, files) {
        core.terminal_kill(&running.terminal)?;
    }
    Ok(())
}

pub struct Omni {
    port: u16,
}

impl Omni {
    pub fn new(port: u16) -> Self {
        Self { port }
    }

    fn speech(&self, text: &str) -> Result<Clip, Fault> {
        let body = json!({"input": text, "voice": VOICE, "stream": true}).to_string();
        let mut audio = Vec::new();
        let status = http1::stream(
            self.port,
            "POST",
            "/v1/audio/speech",
            body.as_bytes(),
            REQUEST_WITHIN,
            |bytes| audio.extend_from_slice(bytes),
        )
        .map_err(|error| Fault::Failed(format!("The voice engine did not speak: {error}")))?;
        if status != 200 {
            return Err(Fault::Failed(format!(
                "The voice engine refused speech with status {status}"
            )));
        }
        parse_wav(&audio)
            .ok_or_else(|| Fault::Failed("The voice engine sent unreadable audio".into()))
    }

    pub fn warm(&self) -> Result<(), Fault> {
        self.speech("Ready.").map(|_| ())
    }
}

impl Hearing for Omni {
    fn hear(&self, utterance: &Utterance, vocabulary: &[String]) -> Result<String, Fault> {
        let body = json!({
            "temperature": 0,
            "max_tokens": 120,
            "messages": [
                {"role": "system", "content": hearing_prompt(vocabulary)},
                {"role": "user", "content": [{
                    "type": "input_audio",
                    "input_audio": {"data": base64(&samples_wav(&utterance.samples)), "format": "wav"}
                }]}
            ]
        })
        .to_string();
        let response = http1::request(
            self.port,
            "POST",
            "/v1/chat/completions",
            body.as_bytes(),
            REQUEST_WITHIN,
        )
        .map_err(|error| Fault::Failed(format!("The voice engine did not answer: {error}")))?;
        if response.status != 200 {
            return Err(Fault::Failed(format!(
                "The voice engine refused hearing with status {}",
                response.status
            )));
        }
        let reply: Value = serde_json::from_slice(&response.body)
            .map_err(|_| Fault::Failed("The voice engine sent an unreadable answer".into()))?;
        let text = reply["choices"][0]["message"]["content"]
            .as_str()
            .ok_or_else(|| {
                Fault::Failed("The voice engine heard nothing it could write down".into())
            })?;
        Ok(clean_heard(text))
    }
}

impl Speaking for Omni {
    fn render(&self, phrase: Phrase) -> Result<Clip, Fault> {
        self.speech(phrase.words())
    }

    fn speak(&self, text: &SpokenText) -> Result<Clip, Fault> {
        self.speech(text.as_str())
    }
}

pub struct Clips {
    folder: PathBuf,
}

impl Clips {
    pub fn new(settings: &Settings, files: &Files) -> Self {
        let size = fs::metadata(&files.model)
            .map(|meta| meta.len())
            .unwrap_or(0);
        Self {
            folder: settings.clips().join(format!("omni-{size}-{VOICE}")),
        }
    }

    pub fn load(&self, phrase: Phrase) -> Option<Clip> {
        parse_wav(&fs::read(self.folder.join(format!("{}.wav", phrase.key()))).ok()?)
    }

    pub fn store(&self, phrase: Phrase, clip: &Clip) -> std::io::Result<()> {
        fs::create_dir_all(&self.folder)?;
        let file = self.folder.join(format!("{}.wav", phrase.key()));
        let partial = file.with_extension("part");
        fs::write(&partial, crate::audio_io::wav(clip.rate, &clip.pcm))?;
        fs::rename(partial, file)
    }
}

pub fn prepare_clips(speaking: &dyn Speaking, clips: &Clips) -> Result<(), Fault> {
    for phrase in Phrase::ALL {
        if clips.load(phrase).is_none() {
            let clip = speaking.render(phrase)?;
            clips
                .store(phrase, &clip)
                .map_err(|error| Fault::Failed(format!("A clip was not kept: {error}")))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn settings(root: &Path) -> Settings {
        Settings {
            directory: root.join("voice/omni"),
            server: None,
            gpu_layers: 0,
            huggingface: root.join("hf"),
        }
    }

    fn touch(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, b"x").unwrap();
    }

    fn scratch(name: &str) -> PathBuf {
        let root = env::temp_dir().join(format!("voyager-omni-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn nothing_installed_names_every_missing_part() {
        let root = scratch("none");
        let error = locate(&settings(&root)).unwrap_err();
        assert!(error.starts_with("Local voice is not installed."));
        for part in ["llama.cpp server", "Omni model", "audio projector"] {
            assert!(error.contains(part), "{error}");
        }
    }

    #[test]
    fn the_server_comes_from_the_folder_and_the_model_from_the_hugging_face_snapshot() {
        let root = scratch("found");
        let settings = settings(&root);
        touch(&settings.directory.join("llama-server"));
        touch(&settings.huggingface.join(SNAPSHOTS).join("abc").join(MODEL));
        touch(
            &settings
                .huggingface
                .join(SNAPSHOTS)
                .join("abc")
                .join(PROJECTOR),
        );
        let files = locate(&settings).unwrap();
        assert_eq!(files.server, settings.directory.join("llama-server"));
        assert!(files.model.ends_with(format!("abc/{MODEL}")));
    }

    #[test]
    fn a_server_setting_replaces_the_folder_lookup() {
        let root = scratch("server");
        let mut settings = settings(&root);
        let server = root.join("elsewhere/llama-server");
        touch(&server);
        touch(&settings.directory.join(MODEL));
        touch(&settings.directory.join(PROJECTOR));
        settings.server = Some(server.clone());
        assert_eq!(locate(&settings).unwrap().server, server);
    }

    #[test]
    fn the_command_line_binds_loopback_and_takes_the_gpu_layer_count() {
        let files = Files {
            server: "/s/llama-server".into(),
            model: "/m/model.gguf".into(),
            projector: "/m/mmproj.gguf".into(),
        };
        let argv = arguments(&files, 8123, 999);
        let at = |flag: &str| argv.iter().position(|word| word == flag).unwrap();
        assert_eq!(argv[0], "/s/llama-server");
        assert_eq!(argv[at("--host") + 1], "127.0.0.1");
        assert_eq!(argv[at("--port") + 1], "8123");
        assert_eq!(argv[at("-ngl") + 1], "999");
        assert_eq!(argv[at("--reasoning") + 1], "off");
    }

    #[test]
    fn clips_are_kept_once_and_read_back() {
        let root = scratch("clips");
        let settings = settings(&root);
        touch(&settings.directory.join(MODEL));
        let files = Files {
            server: root.join("s"),
            model: settings.directory.join(MODEL),
            projector: root.join("p"),
        };
        let clips = Clips::new(&settings, &files);
        assert!(clips.load(Phrase::Asking).is_none());
        let rendered = Mutex::new(Vec::new());
        struct Counting<'a>(&'a Mutex<Vec<Phrase>>);
        impl Speaking for Counting<'_> {
            fn render(&self, phrase: Phrase) -> Result<Clip, Fault> {
                self.0.lock().unwrap().push(phrase);
                Ok(Clip {
                    rate: 24_000,
                    pcm: vec![1, 0, 2, 0],
                })
            }
            fn speak(&self, _: &SpokenText) -> Result<Clip, Fault> {
                Err(Fault::Unavailable("unused".into()))
            }
        }
        prepare_clips(&Counting(&rendered), &clips).unwrap();
        prepare_clips(&Counting(&rendered), &clips).unwrap();
        assert_eq!(rendered.lock().unwrap().len(), Phrase::ALL.len());
        assert_eq!(clips.load(Phrase::Queued).unwrap().pcm, vec![1, 0, 2, 0]);
    }

    #[test]
    fn a_failed_render_leaves_no_half_kept_clip() {
        let root = scratch("fail");
        let settings = settings(&root);
        touch(&settings.directory.join(MODEL));
        let files = Files {
            server: root.join("s"),
            model: settings.directory.join(MODEL),
            projector: root.join("p"),
        };
        let clips = Clips::new(&settings, &files);
        struct Down;
        impl Speaking for Down {
            fn render(&self, _: Phrase) -> Result<Clip, Fault> {
                Err(Fault::Failed("engine gone".into()))
            }
            fn speak(&self, _: &SpokenText) -> Result<Clip, Fault> {
                Err(Fault::Failed("engine gone".into()))
            }
        }
        assert!(prepare_clips(&Down, &clips).is_err());
        assert!(
            Phrase::ALL
                .iter()
                .all(|phrase| clips.load(*phrase).is_none())
        );
    }
}
