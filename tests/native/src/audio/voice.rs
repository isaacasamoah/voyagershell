use super::{LOOK, SPEAKER, Stack, judge, judge::Score, speech::Samples, speech::Speech};
use crate::inspection::Target;
use crate::native::{Native, Owed, SEND_WAIT};
use crate::system::{PATIENCE, poll, settle, until};
use anyhow::{Context, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
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
    pub acknowledgement: Option<String>,
    pub spoken: Score,
    pub first_sound_after_capture_ms: i64,
    pub started_before_heard: bool,
    pub sent: bool,
    pub spoken_texts: Vec<String>,
    pub speech_after_capture_ms: Option<i64>,
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
        .flat_map(|entry| fs::read_dir(entry.path()).into_iter().flatten())
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .and_then(|name| {
                    name.strip_prefix(key)?
                        .strip_prefix('-')?
                        .strip_suffix(".wav")
                })
                .is_some_and(|hash| hash.len() == 8 && hash.bytes().all(|b| b.is_ascii_hexdigit()))
        })
        .with_context(|| format!("The app kept no {key} clip"))?;
    let bytes = fs::read(&folder)?;
    ensure!(
        bytes.len() > HEADER
            && &bytes[..4] == b"RIFF"
            && u32::from_le_bytes(bytes[24..28].try_into()?) == CLIP_RATE,
        "The kept clip {key} is not 24 kHz mono audio"
    );
    Ok(upsample(&Samples::raw(&bytes[HEADER..]).0))
}

fn upsample(narrow: &[i16]) -> Samples {
    let mut wide = Vec::with_capacity(narrow.len() * 2);
    for (index, sample) in narrow.iter().enumerate() {
        let next = narrow.get(index + 1).copied().unwrap_or(*sample);
        wide.push(*sample);
        wide.push(((i32::from(*sample) + i32::from(next)) / 2) as i16);
    }
    Samples(wide)
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

#[derive(Debug, Serialize)]
pub struct Memory {
    pub engine_mb: Option<u64>,
    pub app_mb: Option<u64>,
}

fn resident_mb(program: &str) -> Option<u64> {
    fs::read_dir("/proc")
        .ok()?
        .filter_map(Result::ok)
        .find_map(|entry| {
            let command = fs::read(entry.path().join("cmdline")).ok()?;
            let name = command.split(|byte| *byte == 0).next()?;
            let matches = Path::new(std::str::from_utf8(name).ok()?)
                .file_name()
                .is_some_and(|file| file == program);
            let status = fs::read_to_string(entry.path().join("status")).ok()?;
            let kilobytes: u64 = status
                .lines()
                .find_map(|line| line.strip_prefix("VmRSS:"))?
                .split_whitespace()
                .next()?
                .parse()
                .ok()?;
            matches.then_some(kilobytes / 1024)
        })
}

pub fn memory() -> Memory {
    Memory {
        engine_mb: resident_mb("llama-server"),
        app_mb: resident_mb("voyager-shell"),
    }
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Reply {
    Await,
    Leave,
}

fn mark_of<'a>(marks: &'a [Mark], event: &str) -> Option<&'a Mark> {
    marks.iter().find(|mark| mark.event == event)
}

pub fn converse(
    native: &Native,
    speech: &Speech,
    name: &str,
    reply: Reply,
) -> Result<Conversation> {
    let stack = stack(native)?;
    let system = &native.system;
    native.drawn_label(&Target::VOICE_CONTROL, "the voice control ready", |label| {
        label == READY
    })?;
    let speaker = format!("{SPEAKER}.monitor");
    let mut capture = stack.capture(system, &speaker, name)?;
    let began = capture.began()?;
    let trace = native.voice_trace();
    let before = marks(&trace)?.len();
    native.click(&Target::VOICE_CONTROL)?;
    until("the app to open the microphone", || {
        Ok(recorders(native)?
            .iter()
            .any(|who| who == APP_CLIENT)
            .then_some(()))
    })?;
    stack.feed(system, speech)?;
    native.click(&Target::VOICE_CONTROL)?;
    let started = until("the acknowledgement to start", || {
        let now = marks(&trace)?;
        Ok(now
            .get(before..)
            .and_then(|fresh| mark_of(fresh, "acknowledgement-started"))
            .and_then(|mark| mark.words.clone()))
    })?;
    let reference = clip(&system.evidence.join("home"), &started)?;
    let score = settle(
        PATIENCE,
        LOOK,
        || Ok(Some(judge::score(&reference, &capture.samples()?))),
        Score::matches,
    )?
    .context("The speaker capture never held still")?;
    let samples = capture.samples()?;
    let onset = onset_ms(&samples).context("No sound reached the speaker")?;
    until("the words to be heard", || {
        Ok(marks(&trace)?
            .get(before..)
            .and_then(|fresh| mark_of(fresh, "heard"))
            .map(|_| ()))
    })?;
    let sent = poll(SEND_WAIT.within(), LOOK, true, || {
        Ok(marks(&trace)?
            .get(before..)
            .and_then(|fresh| mark_of(fresh, "sent"))
            .map(|_| ()))
    })?
    .is_some();
    if reply == Reply::Await {
        until("the reply to be spoken", || {
            Ok(marks(&trace)?
                .get(before..)
                .and_then(|fresh| mark_of(fresh, "speech-ended"))
                .map(|_| ()))
        })
        .with_context(|| {
            let screen = bound_terminal(native)
                .and_then(|terminal| terminal_text(native, &terminal))
                .unwrap_or_else(|error| format!("unreadable: {error:#}"));
            format!("Voyager's terminal showed: {}", screen.trim())
        })?;
    }
    let microphone_closed = until("the microphone to close", || {
        Ok(recorders(native)?.is_empty().then_some(()))
    })
    .is_ok();
    capture.finish(stack.folder(), name)?;
    let marks: Vec<Mark> = marks(&trace)?.into_iter().skip(before).collect();
    let ended = mark_of(&marks, "utterance-ended")
        .map(|mark| mark.at_ms)
        .context("The app marked no end of capture")?;
    let first_sound = i64::try_from(began)? + onset - i64::try_from(ended)?;
    let acknowledged = mark_of(&marks, "acknowledgement-started").map(|mark| mark.at_ms);
    let heard_at = mark_of(&marks, "heard").map(|mark| mark.at_ms);
    Ok(Conversation {
        heard: mark_of(&marks, "heard").and_then(|mark| mark.words.clone()),
        acknowledgement: Some(started),
        spoken: score,
        first_sound_after_capture_ms: first_sound,
        started_before_heard: acknowledged
            .zip(heard_at)
            .is_some_and(|(started, heard)| started <= heard),
        sent,
        spoken_texts: marks
            .iter()
            .filter(|mark| mark.event == "speech-started")
            .filter_map(|mark| mark.words.clone())
            .collect(),
        speech_after_capture_ms: mark_of(&marks, "speech-started")
            .map(|mark| i64::try_from(mark.at_ms).unwrap_or(0) - i64::try_from(ended).unwrap_or(0)),
        microphone_closed,
        marks,
    })
}

fn engine_port(native: &Native) -> Result<u16> {
    let listed = native.system.watch("terminal.list", json!({}))?;
    listed["terminals"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|terminal| terminal["labels"]["voyager.service"].as_str() == Some("voice-engine"))
        .find_map(|terminal| {
            let argv = terminal["argv"].as_array()?;
            let at = argv.iter().position(|word| word == "--port")?;
            argv.get(at + 1)?.as_str()?.parse().ok()
        })
        .context("Core lists no voice engine with a port")
}

fn data_of(response: &[u8]) -> Result<(u32, Vec<u8>)> {
    let split = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .context("The engine sent no header")?;
    let head = String::from_utf8_lossy(&response[..split]).to_ascii_lowercase();
    let mut body = response[split + 4..].to_vec();
    if head.contains("transfer-encoding: chunked") {
        let mut whole = Vec::new();
        let mut rest = body.as_slice();
        loop {
            let line = rest
                .windows(2)
                .position(|window| window == b"\r\n")
                .context("A chunk has no size")?;
            let size = usize::from_str_radix(String::from_utf8_lossy(&rest[..line]).trim(), 16)?;
            if size == 0 {
                break;
            }
            whole.extend_from_slice(&rest[line + 2..line + 2 + size]);
            rest = &rest[line + 2 + size + 2..];
        }
        body = whole;
    }
    let at = body
        .windows(4)
        .position(|window| window == b"data")
        .context("The engine's speech holds no data chunk")?;
    let rate = u32::from_le_bytes(body.get(24..28).context("Short header")?.try_into()?);
    Ok((rate, body[at + 8..].to_vec()))
}

fn post(native: &Native, path: &str, body: &str) -> Result<Vec<u8>> {
    let port = engine_port(native)?;
    let mut socket = TcpStream::connect(("127.0.0.1", port))?;
    let head = [
        format!("POST {path} HTTP/1.1"),
        "Host: 127.0.0.1".to_owned(),
        "Connection: close".to_owned(),
        "Content-Type: application/json".to_owned(),
        format!("Content-Length: {}", body.len()),
        String::new(),
        String::new(),
    ]
    .join("\r\n");
    write!(socket, "{head}{body}")?;
    let mut response = Vec::new();
    socket.read_to_end(&mut response)?;
    Ok(response)
}

fn render(native: &Native, text: &str) -> Result<Samples> {
    let body = json!({"input":text,"voice":"female"}).to_string();
    let (rate, data) = data_of(&post(native, "/v1/audio/speech", &body)?)?;
    ensure!(rate == CLIP_RATE, "The engine spoke at {rate} Hz");
    Ok(upsample(&Samples::raw(&data).0))
}

fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut text = String::new();
    for group in bytes.chunks(3) {
        let value = group.iter().enumerate().fold(0u32, |value, (index, byte)| {
            value | u32::from(*byte) << (16 - 8 * index)
        });
        for index in 0..4 {
            if index <= group.len() {
                text.push(char::from(TABLE[(value >> (18 - 6 * index) & 63) as usize]));
            } else {
                text.push('=');
            }
        }
    }
    text
}

fn wav_16k(narrow: &[i16]) -> Vec<u8> {
    let data = u32::try_from(narrow.len() * 2).unwrap_or(u32::MAX);
    let mut wav = Vec::with_capacity(44 + narrow.len() * 2);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&16_000u32.to_le_bytes());
    wav.extend_from_slice(&32_000u32.to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data.to_le_bytes());
    for sample in narrow {
        wav.extend_from_slice(&sample.to_le_bytes());
    }
    wav
}

pub fn transcribe(native: &Native, name: &str) -> Result<String> {
    let stack = stack(native)?;
    let heard = Samples::decode(&fs::read(stack.folder().join(format!("{name}.wav")))?)?;
    let narrow: Vec<i16> = heard
        .0
        .as_chunks::<3>()
        .0
        .iter()
        .map(|trio| ((i32::from(trio[0]) + i32::from(trio[1]) + i32::from(trio[2])) / 3) as i16)
        .collect();
    let body = json!({
        "temperature": 0,
        "max_tokens": 200,
        "messages": [
            {"role": "system", "content": "Transcribe the audio exactly as spoken. Output only the words, nothing else."},
            {"role": "user", "content": [{"type": "input_audio", "input_audio": {"data": base64(&wav_16k(&narrow)), "format": "wav"}}]}
        ]
    })
    .to_string();
    let response = post(native, "/v1/chat/completions", &body)?;
    let at = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .context("The engine sent no header")?;
    let reply: Value = serde_json::from_slice(&response[at + 4..])?;
    Ok(reply["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or_default()
        .to_owned())
}

#[derive(Debug, Serialize)]
pub struct Judgement {
    pub wanted: Score,
    pub other: Score,
    pub transcript: String,
}

pub fn judge_reply(native: &Native, name: &str, wanted: &str, other: &str) -> Result<Judgement> {
    let stack = stack(native)?;
    let heard = Samples::decode(&fs::read(stack.folder().join(format!("{name}.wav")))?)?;
    Ok(Judgement {
        wanted: judge::score(&render(native, wanted)?, &heard),
        other: judge::score(&render(native, other)?, &heard),
        transcript: transcribe(native, name)?,
    })
}

pub fn words_contain(heard: &str, wanted: &str) -> bool {
    let plain = |text: &str| {
        text.chars()
            .filter(|c| c.is_alphanumeric() || c.is_whitespace())
            .collect::<String>()
            .to_lowercase()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    };
    plain(heard).contains(&plain(wanted))
}

pub fn bound_terminal(native: &Native) -> Result<String> {
    let stored = fs::read_to_string(native.profile_path("voyager.json"))?;
    serde_json::from_str::<Value>(&stored)?["terminal"]
        .as_str()
        .map(str::to_owned)
        .context("voyager.json names no terminal")
}

pub fn terminal_text(native: &Native, address: &str) -> Result<String> {
    let read = native
        .system
        .watch("terminal.read", json!({"terminal":address,"lines":400}))?;
    Ok(read["text"].as_str().unwrap_or_default().to_owned())
}

pub fn median(values: &[i64]) -> Option<i64> {
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    let middle = sorted.len() / 2;
    match sorted.len() {
        0 => None,
        count if count % 2 == 1 => sorted.get(middle).copied(),
        _ => Some((sorted[middle - 1] + sorted[middle]) / 2),
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn words_are_found_inside_a_longer_transcript_ignoring_case_and_punctuation() {
        assert!(words_contain(
            "Asking Voyager. Docked on this fleet. The rest is in the chat.",
            "Docked on this fleet. The rest is in the chat."
        ));
        assert!(!words_contain("Asking Voyager.", "Docked on this fleet."));
    }

    #[test]
    fn base64_matches_the_standard_vectors() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn the_median_of_an_even_count_is_the_mean_of_the_middle_pair() {
        assert_eq!(median(&[5, 1, 4, 2]), Some(3));
        assert_eq!(median(&[9, 1, 5]), Some(5));
        assert_eq!(median(&[]), None);
    }

    #[test]
    fn heard_words_match_ignoring_case_and_punctuation_but_not_words() {
        assert!(words_match("Dock on this fleet.", "dock on this fleet"));
        assert!(!words_match("Doc on this fleet.", "Dock on this fleet."));
        assert!(!words_match(
            "Dock on this fleet",
            "[spoken] Dock on this fleet"
        ));
    }

    #[test]
    fn a_trace_line_reads_back_with_and_without_words() {
        let with: Mark =
            serde_json::from_str(r#"{"event":"heard","atMs":5,"words":"Dock."}"#).unwrap();
        let without: Mark = serde_json::from_str(r#"{"event":"click","atMs":4}"#).unwrap();
        assert_eq!(with.words.as_deref(), Some("Dock."));
        assert_eq!(without.words, None);
    }
}
