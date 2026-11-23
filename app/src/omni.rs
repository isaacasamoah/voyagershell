use crate::{
    audio_io::{base64, parse_wav, plain_level, samples_wav},
    client::{Client, ProgramReply, ProgramRequest, ProgramSpec},
    http1,
    speech::{
        Clip, Fault, Hearing, Kept, Phrase, Piece, Speaking, Utterance, clean_heard, hearing_prompt,
    },
    voice_route::{ROUTE_EXAMPLES, Route, Routing, route_prompt},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    env, fs,
    net::{Ipv4Addr, TcpListener},
    ops::ControlFlow,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

pub const DIRECTORY_VARIABLE: &str = "VOYAGER_OMNI_DIR";
pub const SERVER_VARIABLE: &str = "VOYAGER_OMNI_SERVER";
pub const GPU_LAYERS_VARIABLE: &str = "VOYAGER_OMNI_GPU_LAYERS";
const SERVICE: &str = "voice-engine";
const NAME: &str = "voice-engine";
const MODEL: &str = "LFM3-Omni-2B-Q4_K_M.gguf";
const PROJECTOR: &str = "mmproj-LFM3-Omni-2B-Q4_K_M.gguf";
const SNAPSHOTS: &str = "models--LiquidAI--LFM3-Omni-2B-GGUF/snapshots";
const VOICE: &str = "female";
const READY_WITHIN: Duration = Duration::from_secs(120);
const REQUEST_WITHIN: Duration = Duration::from_secs(30);
const ROUTE_WITHIN: Duration = Duration::from_secs(3);
const HEALTH_WITHIN: Duration = Duration::from_millis(800);
const WARM_SAMPLES: usize = 8_000;
const LIVENESS_EVERY: Duration = Duration::from_secs(1);
const FIT_LEAD: Duration = Duration::from_millis(1288);
const FIT_PER_CHARACTER: Duration = Duration::from_millis(56);
const FIT_MARGIN_TENTHS: u32 = 15;
const RENDERS_PER_CLIP: usize = 5;
const ONSET_FRAME: Duration = Duration::from_millis(5);
const ONSET_LEVEL: f32 = 100.0;
const LEAD_PAD: Duration = Duration::from_millis(145);

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Settings {
    pub cache: PathBuf,
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
        let voice = cache.join("voyager/voice");
        Self {
            directory: env::var_os(DIRECTORY_VARIABLE)
                .map(PathBuf::from)
                .unwrap_or_else(|| voice.join("omni")),
            cache: voice,
            server: env::var_os(SERVER_VARIABLE).map(PathBuf::from),
            gpu_layers: env::var(GPU_LAYERS_VARIABLE)
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(0),
            huggingface,
        }
    }

    pub fn clips(&self) -> PathBuf {
        self.cache.join("clips")
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

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Running {
    pub terminal: String,
    pub port: u16,
}

pub fn launch(client: &Client, files: &Files, settings: &Settings) -> Result<Running, Fault> {
    let port = free_port()?;
    let directory = files.server.parent().unwrap_or(Path::new("/"));
    let folder = directory.to_string_lossy().into_owned();
    let started = client
        .service(ProgramRequest::Start(ProgramSpec {
            service: SERVICE.into(),
            name: NAME.into(),
            argv: arguments(files, port, settings.gpu_layers),
            cwd: folder.clone(),
            env: HashMap::from([("LD_LIBRARY_PATH".into(), folder)]),
        }))
        .map_err(|error| Fault::Failed(format!("The voice engine was not started: {error:?}")))?;
    let ProgramReply::Started(terminal) = started else {
        return Err(Fault::Failed(
            "The voice engine start was not confirmed".into(),
        ));
    };
    let running = Running { terminal, port };
    let until = Instant::now() + READY_WITHIN;
    let mut checked = Instant::now();
    while !healthy(port) {
        let failure = if Instant::now() >= until {
            Some("The voice engine did not become ready")
        } else if checked.elapsed() >= LIVENESS_EVERY {
            checked = Instant::now();
            let live = client.service(ProgramRequest::Live {
                terminal: running.terminal.clone(),
            });
            (!matches!(live, Ok(ProgramReply::Live(true))))
                .then_some("The voice engine stopped while loading")
        } else {
            None
        };
        if let Some(reason) = failure {
            let _ = stop(client, &running, files);
            return Err(Fault::Failed(reason.into()));
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Ok(running)
}

pub fn stop(client: &Client, running: &Running, files: &Files) -> Result<(), String> {
    client
        .service(ProgramRequest::Stop {
            terminal: running.terminal.clone(),
            service: SERVICE.into(),
            program: files.server.to_string_lossy().into_owned(),
        })
        .map(|_| ())
        .map_err(|error| format!("{error:?}"))
}

pub struct Omni {
    port: u16,
}

impl Omni {
    pub fn new(port: u16) -> Self {
        Self { port }
    }

    fn speech(&self, text: &str, longest: Option<Duration>) -> Result<Clip, Fault> {
        let body = json!({"input": text, "voice": VOICE, "stream": true}).to_string();
        let mut audio = Vec::new();
        let mut layout = None;
        let status = http1::stream(
            self.port,
            "POST",
            "/v1/audio/speech",
            body.as_bytes(),
            REQUEST_WITHIN,
            |bytes| {
                audio.extend_from_slice(bytes);
                let Some(longest) = longest else {
                    return ControlFlow::Continue(());
                };
                if layout.is_none() {
                    layout =
                        parse_wav(&audio).map(|clip| (audio.len() - clip.pcm.len(), clip.rate));
                }
                match layout {
                    Some((header, rate)) if audio.len() - header > bytes_within(longest, rate) => {
                        ControlFlow::Break(())
                    }
                    _ => ControlFlow::Continue(()),
                }
            },
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
        self.speech("Ready.", None)?;
        let _ = self.route("Hello.");
        self.hear(
            &Utterance {
                samples: vec![0; WARM_SAMPLES],
            },
            &[],
        )
        .map(|_| ())
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

fn answer_text(say: Option<&str>) -> String {
    match say {
        Some(say) => json!({"kind": "chat", "say": say}).to_string(),
        None => json!({"kind": "work"}).to_string(),
    }
}

fn route_messages(heard: &str) -> Value {
    let mut messages = vec![json!({"role": "system", "content": route_prompt()})];
    for (said, say) in ROUTE_EXAMPLES {
        messages.push(json!({"role": "user", "content": said}));
        messages.push(json!({"role": "assistant", "content": answer_text(say)}));
    }
    messages.push(json!({"role": "user", "content": heard}));
    Value::Array(messages)
}

fn route_body(heard: &str) -> Value {
    json!({
        "temperature": 0,
        "max_tokens": 60,
        "logprobs": true,
        "top_logprobs": 8,
        "response_format": {"type": "json_schema", "json_schema": {
            "name": "route",
            "strict": true,
            "schema": {"anyOf": [
                {
                    "type": "object",
                    "properties": {"kind": {"enum": ["work"]}},
                    "required": ["kind"],
                    "additionalProperties": false
                },
                {
                    "type": "object",
                    "properties": {"kind": {"enum": ["chat"]}, "say": {"type": "string"}},
                    "required": ["kind", "say"],
                    "additionalProperties": false
                }
            ]}
        }},
        "messages": route_messages(heard)
    })
}

fn chat_probability(answer: &Value) -> Option<f64> {
    let tokens = answer["choices"][0]["logprobs"]["content"].as_array()?;
    let kind = tokens.iter().find(|token| {
        matches!(
            token["token"]
                .as_str()
                .map(|word| word.trim().trim_matches('"')),
            Some("chat" | "work")
        )
    })?;
    let mut chat = 0.0;
    let mut work = 0.0;
    for option in kind["top_logprobs"].as_array()? {
        let chance = option["logprob"].as_f64()?.exp();
        match option["token"].as_str()?.trim().trim_matches('"') {
            "chat" => chat += chance,
            "work" => work += chance,
            _ => {}
        }
    }
    (chat + work > 0.0).then(|| chat / (chat + work))
}

impl Routing for Omni {
    fn route(&self, heard: &str) -> Result<Route, Fault> {
        let body = route_body(heard).to_string();
        let response = http1::request(
            self.port,
            "POST",
            "/v1/chat/completions",
            body.as_bytes(),
            ROUTE_WITHIN,
        )
        .map_err(|error| Fault::Failed(format!("The voice engine did not route: {error}")))?;
        if response.status != 200 {
            return Err(Fault::Failed(format!(
                "The voice engine refused routing with status {}",
                response.status
            )));
        }
        let answer: Value = serde_json::from_slice(&response.body)
            .map_err(|_| Fault::Failed("The voice engine sent an unreadable route".into()))?;
        let content = answer["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or_default();
        Ok(Route::parse(heard, content, chat_probability(&answer)))
    }
}

impl Speaking for Omni {
    fn render(&self, phrase: Phrase) -> Result<Clip, Fault> {
        self.speech(phrase.words(), Some(longest(phrase.words())))
    }

    fn speak(&self, piece: Piece<'_>) -> Result<Clip, Fault> {
        self.speech(piece.as_str(), None)
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

    fn named(&self, key: &str, words: &str) -> PathBuf {
        let digest = Sha256::digest(words);
        let hash: String = digest[..4]
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        self.folder.join(format!("{key}-{hash}.wav"))
    }

    fn file(&self, phrase: Phrase) -> PathBuf {
        self.named(phrase.key(), phrase.words())
    }

    pub fn load(&self, phrase: Phrase) -> Option<Clip> {
        parse_wav(&fs::read(self.file(phrase)).ok()?)
            .map(trimmed)
            .filter(|clip| fits(phrase, clip))
    }

    pub fn store(&self, phrase: Phrase, clip: &Clip) -> std::io::Result<()> {
        fs::create_dir_all(&self.folder)?;
        let file = self.file(phrase);
        let partial = file.with_extension("part");
        fs::write(&partial, crate::audio_io::wav(clip.rate, &clip.pcm))?;
        fs::rename(partial, file)
    }
}

pub fn longest(words: &str) -> Duration {
    let characters = u32::try_from(words.chars().count()).unwrap_or(u32::MAX);
    (FIT_LEAD + FIT_PER_CHARACTER * characters) * FIT_MARGIN_TENTHS / 10
}

fn bytes_within(longest: Duration, rate: u32) -> usize {
    let bytes = longest.as_millis() * u128::from(rate) * 2 / 1000;
    usize::try_from(bytes).unwrap_or(usize::MAX)
}

fn trimmed(clip: Clip) -> Clip {
    let frame = bytes_within(ONSET_FRAME, clip.rate).max(2) & !1;
    let onset = clip.pcm.chunks_exact(frame).position(|bytes| {
        let samples: Vec<i16> = bytes
            .as_chunks::<2>()
            .0
            .iter()
            .map(|pair| i16::from_le_bytes(*pair))
            .collect();
        plain_level(&samples) > ONSET_LEVEL
    });
    let start = onset.map_or(0, |frames| {
        (frames * frame).saturating_sub(bytes_within(LEAD_PAD, clip.rate)) & !1
    });
    if start == 0 {
        return clip;
    }
    Clip {
        rate: clip.rate,
        pcm: clip.pcm[start..].to_vec(),
    }
}

fn fits(phrase: Phrase, clip: &Clip) -> bool {
    clip.pcm.len() <= bytes_within(longest(phrase.words()), clip.rate)
}

fn render_fitting(speaking: &dyn Speaking, phrase: Phrase) -> Result<Option<Clip>, Fault> {
    for _ in 0..RENDERS_PER_CLIP {
        let clip = trimmed(speaking.render(phrase)?);
        if fits(phrase, &clip) {
            return Ok(Some(clip));
        }
    }
    Ok(None)
}

pub fn prepare_clips(speaking: &dyn Speaking, clips: &Clips, kept: &Kept) -> Result<(), Fault> {
    for phrase in Phrase::ALL {
        if let Some(clip) = clips.load(phrase) {
            kept.keep(phrase, clip);
            continue;
        }
        let Some(clip) = render_fitting(speaking, phrase)? else {
            eprintln!(
                "The voice clip {} ran past the length its words allow in {RENDERS_PER_CLIP} renders, so it is not kept.",
                phrase.key()
            );
            continue;
        };
        kept.keep(phrase, clip.clone());
        clips
            .store(phrase, &clip)
            .map_err(|error| Fault::Failed(format!("A clip was not kept: {error}")))?;
    }
    Ok(())
}

#[cfg(test)]
#[path = "omni_tests.rs"]
mod tests;
