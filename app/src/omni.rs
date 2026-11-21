use crate::{
    audio_io::{base64, parse_wav, samples_wav},
    client::{Client, ProgramReply, ProgramRequest, ProgramSpec},
    http1,
    speech::{
        Clip, Fault, Hearing, Phrase, REPLY_EXAMPLES, REPLY_PROMPT, Reply, Replying, Speaking,
        SpokenText, Utterance, clean_heard, hearing_prompt,
    },
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
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
const SERVICE: &str = "voice-engine";
const NAME: &str = "voice-engine";
const MODEL: &str = "LFM3-Omni-2B-Q4_K_M.gguf";
const PROJECTOR: &str = "mmproj-LFM3-Omni-2B-Q4_K_M.gguf";
const SNAPSHOTS: &str = "models--LiquidAI--LFM3-Omni-2B-GGUF/snapshots";
const VOICE: &str = "female";
const READY_WITHIN: Duration = Duration::from_secs(120);
const REQUEST_WITHIN: Duration = Duration::from_secs(30);
const REPLY_WITHIN: Duration = Duration::from_secs(3);
const HEALTH_WITHIN: Duration = Duration::from_millis(800);
const WARM_SAMPLES: usize = 8_000;
const LIVENESS_EVERY: Duration = Duration::from_secs(1);

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
        self.speech("Ready.")?;
        let _ = self.reply("Hello.");
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

fn reply_messages(heard: &str) -> Value {
    let mut messages = vec![json!({"role": "system", "content": REPLY_PROMPT})];
    for (said, kind, say) in REPLY_EXAMPLES {
        let answer = format!("{{\"kind\": \"{kind}\", \"say\": {}}}", Value::from(say));
        messages.push(json!({"role": "user", "content": said}));
        messages.push(json!({"role": "assistant", "content": answer}));
    }
    messages.push(json!({"role": "user", "content": heard}));
    Value::Array(messages)
}

fn chat_probability(reply: &Value) -> Option<f64> {
    let tokens = reply["choices"][0]["logprobs"]["content"].as_array()?;
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

impl Replying for Omni {
    fn reply(&self, heard: &str) -> Result<Reply, Fault> {
        let body = json!({
            "temperature": 0,
            "max_tokens": 80,
            "logprobs": true,
            "top_logprobs": 8,
            "response_format": {"type": "json_schema", "json_schema": {
                "name": "reply",
                "strict": true,
                "schema": {
                    "type": "object",
                    "properties": {
                        "kind": {"type": "string", "enum": ["chat", "work"]},
                        "say": {"type": "string"}
                    },
                    "required": ["kind", "say"],
                    "additionalProperties": false
                }
            }},
            "messages": reply_messages(heard)
        })
        .to_string();
        let response = http1::request(
            self.port,
            "POST",
            "/v1/chat/completions",
            body.as_bytes(),
            REPLY_WITHIN,
        )
        .map_err(|error| Fault::Failed(format!("The voice engine did not reply: {error}")))?;
        if response.status != 200 {
            return Err(Fault::Failed(format!(
                "The voice engine refused a reply with status {}",
                response.status
            )));
        }
        let answer: Value = serde_json::from_slice(&response.body)
            .map_err(|_| Fault::Failed("The voice engine sent an unreadable reply".into()))?;
        let content = answer["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or_default();
        Reply::parse(content, chat_probability(&answer))
            .ok_or_else(|| Fault::Failed("The voice engine sent a reply it could not use".into()))
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
    }

    pub fn store(&self, phrase: Phrase, clip: &Clip) -> std::io::Result<()> {
        fs::create_dir_all(&self.folder)?;
        let file = self.file(phrase);
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
            cache: root.join("voice"),
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

    fn token(word: &str, others: &[(&str, f64)]) -> Value {
        json!({"token": word, "logprob": 0.0, "top_logprobs": others
            .iter()
            .map(|(other, chance)| json!({"token": other, "logprob": chance.ln()}))
            .collect::<Vec<_>>()})
    }

    #[test]
    fn the_chat_probability_is_read_at_the_kind_token_and_not_at_the_words_after_it() {
        let reply = json!({"choices": [{"logprobs": {"content": [
            token("{\"", &[]),
            token("kind", &[]),
            token("chat", &[("chat", 0.9), ("work", 0.1)]),
            token("work", &[("work", 1.0)]),
        ]}}]});
        let chance = chat_probability(&reply).unwrap();
        assert!((chance - 0.9).abs() < 1e-9, "{chance}");
    }

    #[test]
    fn an_answer_without_logprobs_has_no_probability() {
        assert_eq!(chat_probability(&json!({"choices": [{}]})), None);
    }

    #[test]
    fn the_request_is_the_prompt_then_the_examples_then_the_words() {
        let messages = reply_messages("Hello.");
        let list = messages.as_array().unwrap();
        assert_eq!(list.len(), 2 + 2 * REPLY_EXAMPLES.len());
        assert_eq!(list[0]["role"], "system");
        assert_eq!(list[1]["content"], REPLY_EXAMPLES[0].0);
        assert_eq!(
            list[2]["content"],
            r#"{"kind": "chat", "say": "I'm doing well, thanks. What can I do for you?"}"#
        );
        assert_eq!(list[list.len() - 1]["content"], "Hello.");
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
    fn changed_words_render_a_new_clip_and_the_old_file_is_not_played() {
        let root = scratch("words");
        let settings = settings(&root);
        touch(&settings.directory.join(MODEL));
        let files = Files {
            server: root.join("s"),
            model: settings.directory.join(MODEL),
            projector: root.join("p"),
        };
        let clips = Clips::new(&settings, &files);
        let old = crate::audio_io::wav(24_000, &[9, 0, 9, 0]);
        fs::create_dir_all(&clips.folder).unwrap();
        fs::write(clips.folder.join("not-running.wav"), &old).unwrap();
        fs::write(
            clips.named(
                "not-running",
                "Voyager isn't running. Resume it in the chat.",
            ),
            &old,
        )
        .unwrap();
        assert!(clips.load(Phrase::NotRunning).is_none());
        struct Fresh;
        impl Speaking for Fresh {
            fn render(&self, _: Phrase) -> Result<Clip, Fault> {
                Ok(Clip {
                    rate: 24_000,
                    pcm: vec![1, 0, 2, 0],
                })
            }
            fn speak(&self, _: &SpokenText) -> Result<Clip, Fault> {
                Err(Fault::Unavailable("unused".into()))
            }
        }
        prepare_clips(&Fresh, &clips).unwrap();
        assert_eq!(
            clips.load(Phrase::NotRunning).unwrap().pcm,
            vec![1, 0, 2, 0]
        );
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
