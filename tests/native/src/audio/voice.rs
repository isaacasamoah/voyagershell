use super::{LOOK, SPEAKER, Stack, judge, judge::Score, speech::Samples, speech::Speech};
use crate::inspection::Target;
use crate::native::{Native, Owed, Stopwatch};
use crate::system::{PATIENCE, poll, settle, until};
use anyhow::{Context, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::fs;
use std::path::Path;

pub const APP_CLIENT: &str = "voyager-voice";
pub const READY: &str = "Start voice";
pub const LISTENING: &str = "Stop listening";
const CLIP_RATE: u32 = 24_000;
const HEADER: usize = 44;
const ONSET_LEVEL: f64 = 300.0;
const ONSET_WINDOW: usize = 960;
const SIGNATURES: [&str; 3] = ["UklGR", "input_audio", "RIFF"];

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mark {
    pub event: String,
    pub at_ms: u64,
    #[serde(default)]
    pub words: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Conversation {
    pub heard: Option<String>,
    pub spoken: Score,
    pub onset_after_end_ms: i64,
    pub microphone_closed: bool,
    pub marks: Vec<Mark>,
}

pub fn marks(path: &Path) -> Result<Vec<Mark>> {
    match fs::read_to_string(path) {
        Ok(text) => text
            .lines()
            .map(|line| serde_json::from_str(line).context("A voice trace line is not JSON"))
            .collect(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error.into()),
    }
}

pub fn words_match(heard: &str, wanted: &str) -> bool {
    let plain = |text: &str| {
        text.chars()
            .filter(|c| c.is_alphanumeric() || c.is_whitespace())
            .collect::<String>()
            .to_lowercase()
            .split_whitespace()
            .map(str::to_owned)
            .collect::<Vec<_>>()
    };
    plain(heard) == plain(wanted)
}

fn clip(home: &Path, key: &str) -> Result<Samples> {
    let clips = home.join(".cache/voyager/voice/clips");
    let folder = fs::read_dir(&clips)
        .with_context(|| format!("The app kept no clips under {}", clips.display()))?
        .filter_map(Result::ok)
        .map(|entry| entry.path().join(format!("{key}.wav")))
        .find(|path| path.is_file())
        .with_context(|| format!("The app kept no {key} clip"))?;
    let bytes = fs::read(&folder)?;
    ensure!(
        bytes.len() > HEADER
            && &bytes[..4] == b"RIFF"
            && u32::from_le_bytes(bytes[24..28].try_into()?) == CLIP_RATE,
        "The kept clip {key} is not 24 kHz mono audio"
    );
    let narrow = Samples::raw(&bytes[HEADER..]).0;
    let mut wide = Vec::with_capacity(narrow.len() * 2);
    for (index, sample) in narrow.iter().enumerate() {
        let next = narrow.get(index + 1).copied().unwrap_or(*sample);
        wide.push(*sample);
        wide.push(((i32::from(*sample) + i32::from(next)) / 2) as i16);
    }
    Ok(Samples(wide))
}

fn onset_ms(samples: &Samples) -> Option<i64> {
    samples
        .0
        .chunks(ONSET_WINDOW)
        .position(|window| {
            let sum: f64 = window.iter().map(|s| f64::from(*s).powi(2)).sum();
            (sum / window.len() as f64).sqrt() > ONSET_LEVEL
        })
        .map(|index| (index * ONSET_WINDOW * 1000 / super::speech::RATE as usize) as i64)
}

pub fn recorders(native: &Native) -> Result<Vec<String>> {
    let stack = stack(native)?;
    stack.recorders(&native.system)
}

fn stack(native: &Native) -> Result<&Stack> {
    native
        .audio
        .as_ref()
        .context("The voice journey needs --audio on")
}

pub fn without_capture(native: &Native, during: Owed) -> Result<Vec<Vec<String>>> {
    let mut seen = Vec::new();
    poll(during.within(), LOOK, true, || {
        seen.push(recorders(native)?);
        Ok(None::<()>)
    })?;
    Ok(seen)
}

pub fn converse(native: &Native, speech: &Speech, key: &str, name: &str) -> Result<Conversation> {
    let stack = stack(native)?;
    let system = &native.system;
    let reference = clip(&system.evidence.join("home"), key)?;
    let speaker = format!("{SPEAKER}.monitor");
    let mut capture = stack.capture(system, &speaker, name)?;
    let trace = native.voice_trace();
    let before = marks(&trace)?.len();
    let begun = Stopwatch::start();
    native.click(&Target::VOICE_CONTROL)?;
    until("the app to open the microphone", || {
        Ok(recorders(native)?
            .iter()
            .any(|who| who == APP_CLIENT)
            .then_some(()))
    })?;
    stack.feed(system, speech)?;
    native.click(&Target::VOICE_CONTROL)?;
    let ended = Stopwatch::start();
    let score = settle(
        PATIENCE,
        LOOK,
        || Ok(Some(judge::score(&reference, &capture.samples()?))),
        Score::matches,
    )?
    .context("The speaker capture never held still")?;
    let samples = capture.samples()?;
    let onset = onset_ms(&samples).context("No sound reached the speaker")?;
    let end_ms = i64::try_from(begun.until(ended).millis())?;
    let microphone_closed = until("the microphone to close", || {
        Ok(recorders(native)?.is_empty().then_some(()))
    })
    .is_ok();
    capture.finish(stack.folder(), name)?;
    let marks: Vec<Mark> = marks(&trace)?.into_iter().skip(before).collect();
    let heard = marks
        .iter()
        .rev()
        .find(|mark| mark.event == "heard")
        .and_then(|mark| mark.words.clone());
    Ok(Conversation {
        heard,
        spoken: score,
        onset_after_end_ms: onset - end_ms,
        microphone_closed,
        marks,
    })
}

pub fn audio_in_text(native: &Native) -> Result<Value> {
    let mut found = Vec::new();
    let mut scanned = Vec::new();
    for entry in fs::read_dir(&native.system.evidence)? {
        let path = entry?.path();
        let text = path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| matches!(extension, "log" | "jsonl"));
        if !text {
            continue;
        }
        let body = fs::read(&path)?;
        scanned.push(
            path.file_name()
                .map(|name| name.to_string_lossy().into_owned()),
        );
        let body = String::from_utf8_lossy(&body);
        if let Some(signature) = SIGNATURES
            .iter()
            .find(|signature| body.contains(**signature))
        {
            found.push(json!({"file":path.file_name().map(|n| n.to_string_lossy().into_owned()),"signature":signature}));
        }
    }
    let engine = engine_screen(native)?;
    if let Some(signature) = SIGNATURES
        .iter()
        .find(|signature| engine.contains(**signature))
    {
        found.push(json!({"file":"the engine's Core terminal","signature":signature}));
    }
    Ok(json!({"scanned":scanned,"engineLines":engine.lines().count(),"found":found}))
}

fn engine_screen(native: &Native) -> Result<String> {
    let listed = native.system.watch("terminal.list", json!({}))?;
    let terminals = listed["terminals"]
        .as_array()
        .context("Core listed no terminals array")?;
    let Some(engine) = terminals
        .iter()
        .find(|terminal| terminal["labels"]["voyager.service"].as_str() == Some("voice-engine"))
    else {
        bail!("Core lists no voice engine program");
    };
    let address = engine["address"]
        .as_str()
        .context("The engine terminal has no address")?;
    let read = native
        .system
        .watch("terminal.read", json!({"terminal":address,"lines":4000}))?;
    Ok(read["text"].as_str().unwrap_or_default().to_owned())
}
