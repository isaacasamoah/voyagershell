use super::{
    LOOK, SPEAKER, Stack, judge, judge::Score, speech::RATE, speech::Samples, speech::Speech,
};
use crate::inspection::Target;
use crate::native::{
    CLIPS_KEPT, Defect, FLOOR_WAIT, LONG_REPLY_WAIT, Native, Owed, QUIET_MIC, REPLY_WAIT,
    ROOM_FEED, SEND_WAIT, now_millis,
};
use crate::system::{PATIENCE, poll, settle, until};
use anyhow::{Context, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const APP_CLIENT: &str = "voyager-voice";
pub const READY: &str = "Start voice";
pub const LISTENING: &str = "Listening";
pub const CONNECTING: &str = "Connecting…";
pub const SPEAKING_OPEN: &str = "Listening while speaking";
pub const BUSY: &str = "Busy";
const CLIP_RATE: u32 = 24_000;
const HEADER: usize = 44;
const ONSET_LEVEL: f64 = 300.0;
const ONSET_WINDOW: usize = 960;
const SIGNATURES: [&str; 3] = ["UklGR", "input_audio", "RIFF"];
const AFTER_FEED_MS: u64 = 2500;
const CUT_QUIET_MS: u64 = 1000;
const WINDOW_MS: u64 = 20;

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
    pub choice: Option<String>,
    pub acknowledgement: Option<String>,
    pub chat: Option<String>,
    pub spoken: Option<Score>,
    pub first_sound_after_capture_ms: i64,
    pub capture_began_ms: u64,
    pub sent: bool,
    pub spoken_texts: Vec<String>,
    pub speech_after_capture_ms: Option<i64>,
    pub microphone_closed: bool,
    pub opened_after_click: bool,
    pub listening_resumed: bool,
    pub marks: Vec<Mark>,
}

pub fn marks(path: &Path) -> Result<Vec<Mark>> {
    match fs::read_to_string(path) {
        Ok(text) => text
            .split_inclusive('\n')
            .filter_map(|line| line.strip_suffix('\n'))
            .map(|line| serde_json::from_str(line).context("A voice trace line is not JSON"))
            .collect(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error.into()),
    }
}

pub fn live_marks(path: &Path) -> Result<Vec<Mark>> {
    ensure!(
        path.exists(),
        Defect("voice trace missing, so the wait could not tell whether a reply was owed".into())
    );
    marks(path)
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

const NUMBERS: [&str; 11] = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
];

fn scored_words(text: &str) -> Vec<String> {
    let joined = text
        .to_lowercase()
        .replace("voyager shell", "voyagershell")
        .replace("voyager-shell", "voyagershell")
        .replace('-', " ");
    joined
        .chars()
        .map(|c| {
            if c.is_ascii_lowercase() || c.is_ascii_digit() || c == '\'' {
                c
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .map(|word| {
            word.parse::<usize>()
                .ok()
                .and_then(|number| NUMBERS.get(number))
                .map_or_else(|| word.to_owned(), |name| (*name).to_owned())
        })
        .collect()
}

pub fn digits_as_words(heard: &str) -> String {
    heard
        .split_whitespace()
        .map(|word| {
            let core = word.trim_end_matches(['.', ',', ';', ':', '!', '?']);
            let (number, percent) = core
                .strip_suffix('%')
                .map_or((core, false), |number| (number, true));
            let (whole, fraction) = number.split_once('.').unwrap_or((number, ""));
            let digits = whole.replace(',', "");
            let plain = |text: &str| text.chars().all(|c| c.is_ascii_digit());
            match digits.parse::<u64>() {
                Ok(value) if plain(&digits) && plain(fraction) && value < 1_000_000 => {
                    let mut words = integer_words(value);
                    if !fraction.is_empty() {
                        words.push("point");
                        words.extend(fraction.chars().filter_map(|c| {
                            c.to_digit(10)
                                .and_then(|d| NUMBERS.get(d as usize).copied())
                        }));
                    }
                    if percent {
                        words.push("percent");
                    }
                    words.join(" ")
                }
                _ => word.to_owned(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn integer_words(value: u64) -> Vec<&'static str> {
    const TEENS: [&str; 10] = [
        "ten",
        "eleven",
        "twelve",
        "thirteen",
        "fourteen",
        "fifteen",
        "sixteen",
        "seventeen",
        "eighteen",
        "nineteen",
    ];
    const TENS: [&str; 10] = [
        "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
    ];
    let below_thousand = |value: u64| {
        let mut words = Vec::new();
        let (hundreds, rest) = (value / 100, value % 100);
        if hundreds > 0 {
            words.extend([NUMBERS[hundreds as usize], "hundred"]);
        }
        match rest {
            0 => {}
            1..10 => words.push(NUMBERS[rest as usize]),
            10..20 => words.push(TEENS[(rest - 10) as usize]),
            _ => {
                words.push(TENS[(rest / 10) as usize]);
                if rest % 10 > 0 {
                    words.push(NUMBERS[(rest % 10) as usize]);
                }
            }
        }
        words
    };
    if value == 0 {
        return vec![NUMBERS[0]];
    }
    let mut words = Vec::new();
    if value >= 1000 {
        words.extend(below_thousand(value / 1000));
        words.push("thousand");
    }
    words.extend(below_thousand(value % 1000));
    words
}

pub fn word_errors(heard: &str, wanted: &str) -> (usize, usize) {
    let wanted = scored_words(wanted);
    let heard = scored_words(heard);
    let mut row: Vec<usize> = (0..=heard.len()).collect();
    for (index, word) in wanted.iter().enumerate() {
        let mut diagonal = row[0];
        row[0] = index + 1;
        for (column, other) in heard.iter().enumerate() {
            let above = row[column + 1];
            row[column + 1] = (above + 1)
                .min(row[column] + 1)
                .min(diagonal + usize::from(word != other));
            diagonal = above;
        }
    }
    (row[heard.len()], wanted.len())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeptClip {
    pub file: String,
    pub ms: u64,
}

pub fn kept_clips(native: &Native) -> Result<Vec<KeptClip>> {
    let clips = native
        .system
        .evidence
        .join("home/.cache/voyager/voice/clips");
    let mut kept = Vec::new();
    for folder in fs::read_dir(&clips)
        .with_context(|| format!("The app kept no clips under {}", clips.display()))?
    {
        for entry in fs::read_dir(folder?.path())? {
            let path = entry?.path();
            if path.extension().is_some_and(|extension| extension == "wav") {
                let bytes = fs::metadata(&path)?.len().saturating_sub(HEADER as u64);
                kept.push(KeptClip {
                    file: path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or_default()
                        .to_owned(),
                    ms: bytes * 1000 / 2 / u64::from(CLIP_RATE),
                });
            }
        }
    }
    kept.sort_by(|left, right| left.file.cmp(&right.file));
    Ok(kept)
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

const OPENING_SAMPLES: usize = 120;
const FIRST_SOUND_LEVEL: f64 = 100.0;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipOpening {
    pub file: String,
    pub opening_level: f64,
    pub first_sound_ms: Option<usize>,
    pub opens_quiet: bool,
}

fn level(samples: &[i16]) -> f64 {
    let sum: f64 = samples
        .iter()
        .map(|sample| f64::from(*sample).powi(2))
        .sum();
    (sum / samples.len().max(1) as f64).sqrt()
}

pub fn kept_clip_openings(native: &Native) -> Result<Vec<ClipOpening>> {
    openings_in(
        &native
            .system
            .evidence
            .join("home/.cache/voyager/voice/clips"),
    )
}

fn openings_in(clips: &Path) -> Result<Vec<ClipOpening>> {
    let mut openings = Vec::new();
    for folder in fs::read_dir(clips)?.filter_map(Result::ok) {
        for entry in fs::read_dir(folder.path())?.filter_map(Result::ok) {
            let bytes = fs::read(entry.path())?;
            let Some(pcm) = bytes.get(HEADER..) else {
                continue;
            };
            let samples = Samples::raw(pcm).0;
            let frames: Vec<f64> = samples
                .as_chunks::<OPENING_SAMPLES>()
                .0
                .iter()
                .map(|frame| level(frame))
                .collect();
            let opening_level = frames.first().copied().unwrap_or(0.0);
            openings.push(ClipOpening {
                file: entry.file_name().to_string_lossy().into_owned(),
                opening_level,
                first_sound_ms: frames
                    .iter()
                    .position(|frame| *frame > FIRST_SOUND_LEVEL)
                    .map(|frame| frame * OPENING_SAMPLES * 1000 / CLIP_RATE as usize),
                opens_quiet: opening_level <= FIRST_SOUND_LEVEL,
            });
        }
    }
    openings.sort_by(|left, right| left.file.cmp(&right.file));
    Ok(openings)
}

const ACKNOWLEDGEMENT_WORDS: [(&str, &str); 9] = [
    ("one-sec", "One sec."),
    ("let-me-look", "Let me look."),
    ("checking", "Checking."),
    ("okay-checking", "Okay, checking."),
    ("sure", "Sure."),
    ("okay", "Okay."),
    ("got-it", "Got it."),
    ("sure-thing", "Sure thing."),
    ("queued", "Queued for Voyager."),
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeardClip {
    pub key: String,
    pub words: Option<&'static str>,
    pub heard: String,
    pub holds_its_words: bool,
}

pub fn kept_clip_heard(native: &Native, key: &str) -> Result<HeardClip> {
    let wide = clip(&native.system.evidence.join("home"), key)?;
    let narrow: Vec<i16> = wide
        .0
        .as_chunks::<3>()
        .0
        .iter()
        .map(|trio| ((i32::from(trio[0]) + i32::from(trio[1]) + i32::from(trio[2])) / 3) as i16)
        .collect();
    let heard = hear_16k(native, &narrow)?;
    let words = ACKNOWLEDGEMENT_WORDS
        .iter()
        .find(|(known, _)| *known == key)
        .map(|(_, words)| *words);
    Ok(HeardClip {
        key: key.to_owned(),
        words,
        holds_its_words: words.is_some_and(|words| words_match(&heard, words)),
        heard,
    })
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

const PLANTED_KEY: &str = "one-sec";
const PLANTED_WORDS: &str = "One sec.";
const ENGINE_MODEL: &str = "LFM3-Omni-2B-Q4_K_M.gguf";
const PLANTED_MS: usize = 28_880;
const PLANTED_TONE_HZ: f64 = 220.0;
const PLANTED_LEVEL: f64 = 3000.0;

fn planted_clip(home: &Path, engine: &Path) -> Result<PathBuf> {
    let size = fs::metadata(engine.join(ENGINE_MODEL))
        .with_context(|| format!("The engine folder holds no {ENGINE_MODEL}"))?
        .len();
    let hash: String = Sha256::digest(PLANTED_WORDS.as_bytes())[..4]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    Ok(home
        .join(".cache/voyager/voice/clips")
        .join(format!("omni-{size}-female"))
        .join(format!("{PLANTED_KEY}-{hash}.wav")))
}

fn planted_samples() -> Vec<i16> {
    let count = CLIP_RATE as usize * PLANTED_MS / 1000;
    (0..count)
        .map(|index| {
            let phase =
                std::f64::consts::TAU * PLANTED_TONE_HZ * index as f64 / f64::from(CLIP_RATE);
            (phase.sin() * PLANTED_LEVEL) as i16
        })
        .collect()
}

pub fn plant_run_on_clip(home: &Path, engine: &Path) -> Result<()> {
    let path = planted_clip(home, engine)?;
    fs::create_dir_all(path.parent().context("The planted clip has no folder")?)?;
    fs::write(&path, wav(CLIP_RATE, &planted_samples())).with_context(|| {
        format!(
            "The run-on One sec. clip was not planted at {}",
            path.display()
        )
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Replanted {
    pub replaced: bool,
    pub all_kept: bool,
    pub kept_ms: Option<usize>,
    pub planted_ms: usize,
}

pub fn planted_clip_rendered_again(native: &Native) -> Result<Replanted> {
    let engine = native
        .voice_engine
        .as_deref()
        .context("The voice journey runs without an engine folder")?;
    let path = planted_clip(&native.system.evidence.join("home"), engine)?;
    let planted = wav(CLIP_RATE, &planted_samples());
    let kept = poll(CLIPS_KEPT.within(), LOOK, true, || {
        Ok(fs::read(&path).ok().filter(|bytes| *bytes != planted))
    })?;
    let trace = native.voice_trace();
    let all_kept = kept.is_some()
        && poll(CLIPS_KEPT.within(), LOOK, true, || {
            Ok(mark_of(&marks(&trace)?, "clips-kept").map(|_| ()))
        })?
        .is_some();
    Ok(Replanted {
        replaced: kept.is_some(),
        all_kept,
        kept_ms: kept
            .map(|bytes| bytes.len().saturating_sub(HEADER) * 1000 / (CLIP_RATE as usize * 2)),
        planted_ms: PLANTED_MS,
    })
}

fn decides(mark: &Mark) -> bool {
    matches!(
        mark.event.as_str(),
        "chat-started" | "acknowledgement-chosen" | "acknowledgement-started"
    )
}

fn settles(mark: &Mark) -> bool {
    matches!(
        mark.event.as_str(),
        "chat-started" | "acknowledgement-started" | "refusal-started" | "sent"
    )
}

fn mark_of<'a>(marks: &'a [Mark], event: &str) -> Option<&'a Mark> {
    marks.iter().find(|mark| mark.event == event)
}

pub fn converse(native: &Native, speech: &Speech, name: &str) -> Result<Conversation> {
    converse_within(native, &speech.samples()?, name, REPLY_WAIT)
}

pub fn converse_samples(native: &Native, samples: &Samples, name: &str) -> Result<Conversation> {
    converse_within(native, samples, name, REPLY_WAIT)
}

pub fn converse_long(native: &Native, speech: &Speech, name: &str) -> Result<Conversation> {
    converse_within(native, &speech.samples()?, name, LONG_REPLY_WAIT)
}

fn converse_within(
    native: &Native,
    samples: &Samples,
    name: &str,
    reply_wait: Owed,
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
    let clicked = now_millis();
    turn_on(native)?;
    let mut player = stack.start_feed(system, name, samples)?;
    super::wait_for_exit(&mut player)?;
    until("the turn to be decided", || {
        let now = live_marks(&trace)?;
        Ok(now
            .get(before..)
            .and_then(|fresh| fresh.iter().find(|mark| decides(mark)).map(|_| ())))
    })?;
    poll(SEND_WAIT.within(), LOOK, true, || {
        Ok(live_marks(&trace)?
            .get(before..)
            .and_then(|fresh| fresh.iter().find(|mark| settles(mark)).map(|_| ())))
    })?;
    let decided: Vec<Mark> = live_marks(&trace)?.into_iter().skip(before).collect();
    let chat = mark_of(&decided, "chat-started").map(|mark| mark.words.clone().unwrap_or_default());
    let choice = mark_of(&decided, "acknowledgement-chosen").and_then(|mark| mark.words.clone());
    let acknowledgement =
        mark_of(&decided, "acknowledgement-started").and_then(|mark| mark.words.clone());
    let score = match acknowledgement.as_deref() {
        Some(key) => {
            let reference = clip(&system.evidence.join("home"), key)?;
            Some(
                settle(
                    PATIENCE,
                    LOOK,
                    || Ok(Some(judge::score(&reference, &capture.samples()?))),
                    Score::matches,
                )?
                .context("The speaker capture never held still")?,
            )
        }
        None => None,
    };
    until("the words to be heard", || {
        Ok(live_marks(&trace)?
            .get(before..)
            .and_then(|fresh| mark_of(fresh, "heard"))
            .map(|_| ()))
    })?;
    let sent = poll(SEND_WAIT.within(), LOOK, true, || {
        Ok(live_marks(&trace)?
            .get(before..)
            .and_then(|fresh| mark_of(fresh, "sent"))
            .map(|_| ()))
    })?
    .is_some();
    if sent {
        poll(reply_wait.within(), LOOK, true, || {
            Ok(live_marks(&trace)?
                .get(before..)
                .and_then(|fresh| mark_of(fresh, "speech-ended"))
                .map(|_| ()))
        })?;
        await_reply_settled(native, "after-reply", true)?;
    }
    let listening_resumed = native
        .drawn_label(&Target::VOICE_CONTROL, "listening again", |label| {
            label == LISTENING
        })
        .is_ok();
    let microphone_closed = turn_off(native).is_ok();
    let onset = onset_ms(&capture.samples()?).context("No sound reached the speaker")?;
    capture.finish(stack.folder(), name)?;
    let marks: Vec<Mark> = marks(&trace)?.into_iter().skip(before).collect();
    let ended = mark_of(&marks, "utterance-ended")
        .map(|mark| mark.at_ms)
        .context("The app marked no end of capture")?;
    let first_sound = i64::try_from(began)? + onset - i64::try_from(ended)?;
    Ok(Conversation {
        heard: mark_of(&marks, "heard").and_then(|mark| mark.words.clone()),
        choice,
        acknowledgement,
        chat,
        spoken: score,
        first_sound_after_capture_ms: first_sound,
        capture_began_ms: began,
        sent,
        spoken_texts: marks
            .iter()
            .filter(|mark| mark.event == "speech-started")
            .filter_map(|mark| mark.words.clone())
            .collect(),
        speech_after_capture_ms: mark_of(&marks, "speech-started")
            .map(|mark| i64::try_from(mark.at_ms).unwrap_or(0) - i64::try_from(ended).unwrap_or(0)),
        microphone_closed,
        opened_after_click: mark_of(&marks, "capture-open")
            .is_some_and(|mark| mark.at_ms >= clicked),
        listening_resumed,
        marks,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickOff {
    pub label_after_click: String,
    pub microphone_closed: bool,
    pub clicked_ms: u64,
    pub reply_started_ms: u64,
    pub reply_ended_ms: Option<u64>,
    pub label_at_end: String,
    pub recorders_after: Vec<Vec<String>>,
    pub opened_after_click: bool,
    pub opened_after_next_click: bool,
    pub heard: String,
    pub marks: Vec<Mark>,
}

pub fn click_off_during_reply(
    native: &Native,
    speech: &Speech,
    name: &str,
    quiet: Owed,
) -> Result<ClickOff> {
    let stack = stack(native)?;
    let system = &native.system;
    let mut capture = stack.capture(system, &format!("{SPEAKER}.monitor"), name)?;
    capture.began()?;
    let trace = native.voice_trace();
    let before = marks(&trace)?.len();
    turn_on(native)?;
    stack.feed(system, speech)?;
    let reply_started_ms = until("the reply to start", || {
        Ok(live_marks(&trace)?
            .get(before..)
            .and_then(|fresh| mark_of(fresh, "speech-started"))
            .map(|mark| mark.at_ms))
    })?;
    native.click(&Target::VOICE_CONTROL)?;
    let clicked_ms = now_millis();
    let label_after_click =
        native.drawn_label(&Target::VOICE_CONTROL, "the voice control off", |label| {
            label == READY
        })?;
    let microphone_closed = until("the microphone to close", || {
        Ok(recorders(native)?.is_empty().then_some(()))
    })
    .is_ok();
    poll(REPLY_WAIT.within(), LOOK, true, || {
        Ok(live_marks(&trace)?
            .get(before..)
            .and_then(|fresh| mark_of(fresh, "speech-ended"))
            .map(|_| ()))
    })?;
    capture.finish(stack.folder(), name)?;
    let recorders_after = without_capture(native, quiet)?;
    let label_at_end =
        native.drawn_label(&Target::VOICE_CONTROL, "the voice control drawn", |_| true)?;
    let quiet_marks: Vec<Mark> = marks(&trace)?.into_iter().skip(before).collect();
    let opened_after_click = quiet_marks
        .iter()
        .any(|mark| mark.event == "capture-open" && mark.at_ms >= clicked_ms);
    let next_click_ms = now_millis();
    turn_on(native)?;
    let opened_after_next_click = marks(&trace)?
        .iter()
        .any(|mark| mark.event == "capture-open" && mark.at_ms >= next_click_ms);
    turn_off(native)?;
    Ok(ClickOff {
        label_after_click,
        microphone_closed,
        clicked_ms,
        reply_started_ms,
        reply_ended_ms: mark_of(&quiet_marks, "speech-ended").map(|mark| mark.at_ms),
        label_at_end,
        recorders_after,
        opened_after_click,
        opened_after_next_click,
        heard: transcribe(native, name)?,
        marks: quiet_marks,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Look {
    pub at_ms: u64,
    pub label: String,
    pub recording: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fed {
    pub from_ms: u64,
    pub until_ms: u64,
    pub onset_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TalkedOver {
    pub reply_started_ms: u64,
    pub fed: Option<Fed>,
    pub silent_at_speaker_ms: Option<u64>,
    pub sound_after_silence_ms: Option<u64>,
    pub captured_until_ms: u64,
    pub onset_to_silence_ms: Option<u64>,
    pub onset_to_cut_ms: Option<u64>,
    pub reached: Vec<String>,
    pub looks: Vec<Look>,
    pub marks: Vec<Mark>,
}

fn look(native: &Native) -> Result<Look> {
    let label = native.drawn_label(&Target::VOICE_CONTROL, "the voice control drawn", |_| true)?;
    let recording = recorders(native)?.iter().any(|who| who == APP_CLIENT);
    Ok(Look {
        at_ms: now_millis(),
        label,
        recording,
    })
}

fn silent_from(samples: &Samples, began: u64, from_ms: u64) -> Option<u64> {
    let window = ONSET_WINDOW;
    let first = usize::try_from(from_ms.checked_sub(began)? / WINDOW_MS).ok()?;
    let needed = usize::try_from(CUT_QUIET_MS / WINDOW_MS).ok()?;
    let mut run = 0;
    for (index, chunk) in samples.0.chunks(window).enumerate().skip(first) {
        let sum: f64 = chunk.iter().map(|s| f64::from(*s).powi(2)).sum();
        let quiet = (sum / chunk.len() as f64).sqrt() <= ONSET_LEVEL;
        run = if quiet { run + 1 } else { 0 };
        if run >= needed {
            return Some(began + u64::try_from(index + 1 - run).ok()? * WINDOW_MS);
        }
    }
    None
}

fn captured_ms(samples: &Samples) -> u64 {
    u64::try_from(samples.0.len()).unwrap_or(u64::MAX) * 1000 / u64::from(RATE)
}

fn sound_from(samples: &Samples, began: u64, from_ms: u64) -> Option<u64> {
    let first = usize::try_from(from_ms.checked_sub(began)? / WINDOW_MS).ok()?;
    samples
        .0
        .chunks(ONSET_WINDOW)
        .enumerate()
        .skip(first)
        .find(|(_, chunk)| {
            let sum: f64 = chunk.iter().map(|s| f64::from(*s).powi(2)).sum();
            (sum / chunk.len() as f64).sqrt() > ONSET_LEVEL
        })
        .and_then(|(index, _)| Some(began + u64::try_from(index).ok()? * WINDOW_MS))
}

pub fn talk_during_reply(
    native: &Native,
    request: &Speech,
    said: Option<&Speech>,
    name: &str,
    ends: &[&str],
) -> Result<TalkedOver> {
    let stack = stack(native)?;
    let system = &native.system;
    let mut capture = stack.capture(system, &format!("{SPEAKER}.monitor"), name)?;
    let began = capture.began()?;
    let trace = native.voice_trace();
    let before = marks(&trace)?.len();
    let fresh = || -> Result<Vec<Mark>> { Ok(marks(&trace)?.into_iter().skip(before).collect()) };
    turn_on(native)?;
    stack.feed(system, request)?;
    let reply_started_ms = poll(LONG_REPLY_WAIT.within(), LOOK, true, || {
        Ok(mark_of(&fresh()?, "speech-started").map(|mark| mark.at_ms))
    })?
    .context("The reply to the request never started")?;
    let mut looks = Vec::new();
    let mut index = fresh()?.len();
    let fed = match said {
        Some(said) => {
            let samples = said.samples()?;
            let from_ms = now_millis();
            let mut player = stack.start_feed(system, &format!("{name}-fed"), &samples)?;
            poll(REPLY_WAIT.within(), LOOK, true, || {
                looks.push(look(native)?);
                Ok(player.child.try_wait()?.map(|_| ()))
            })?
            .context("The speech fed over the reply did not finish")?;
            Some(Fed {
                from_ms,
                until_ms: now_millis(),
                onset_ms: onset_ms(&samples)
                    .and_then(|onset| u64::try_from(onset).ok())
                    .map(|onset| from_ms + onset),
            })
        }
        None => None,
    };
    let mut reached = Vec::new();
    for end in ends {
        let found = poll(REPLY_WAIT.within(), LOOK, true, || {
            looks.push(look(native)?);
            Ok(fresh()?
                .iter()
                .skip(index)
                .position(|mark| mark.event == *end)
                .map(|at| index + at))
        })?;
        let Some(at) = found else {
            break;
        };
        index = at + 1;
        reached.push((*end).to_owned());
    }
    poll(QUIET_MIC.within(), LOOK, true, || {
        looks.push(look(native)?);
        Ok(None::<()>)
    })?;
    let (samples, _) = capture.finish(stack.folder(), name)?;
    let marks = fresh()?;
    turn_off(native)?;
    let onset = fed.as_ref().and_then(|fed| fed.onset_ms);
    let silent_at_speaker_ms = onset.and_then(|onset| silent_from(&samples, began, onset));
    let sound_after_silence_ms =
        silent_at_speaker_ms.and_then(|silent| sound_from(&samples, began, silent));
    let captured_until_ms = began + captured_ms(&samples);
    let cut_ms = mark_of(&marks, "speech-cut").map(|mark| mark.at_ms);
    Ok(TalkedOver {
        reply_started_ms,
        silent_at_speaker_ms,
        sound_after_silence_ms,
        captured_until_ms,
        onset_to_silence_ms: onset
            .zip(silent_at_speaker_ms)
            .and_then(|(onset, silent)| silent.checked_sub(onset)),
        onset_to_cut_ms: onset
            .zip(cut_ms)
            .and_then(|(onset, cut)| cut.checked_sub(onset)),
        fed,
        reached,
        looks,
        marks,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    pub fed_until_ms: u64,
    pub ended_ms: Vec<u64>,
    pub heard: Vec<String>,
    pub marks: Vec<Mark>,
}

impl Turn {
    pub fn ended_after_the_feed(&self) -> bool {
        self.ended_ms.len() == 1 && self.ended_ms[0] >= self.fed_until_ms
    }
}

pub fn turn_on(native: &Native) -> Result<u64> {
    native.drawn_label(&Target::VOICE_CONTROL, "the voice control off", |label| {
        label == READY
    })?;
    let before_ms = await_reply_stop(native)?;
    native.click(&Target::VOICE_CONTROL)?;
    let after_ms = await_reply_settled(native, "after-click", false)?;
    until("the app to open the microphone", || {
        Ok(recorders(native)?
            .iter()
            .any(|who| who == APP_CLIENT)
            .then_some(()))
    })?;
    native.drawn_label(
        &Target::VOICE_CONTROL,
        "the voice control listening",
        |label| label == LISTENING,
    )?;
    live_marks(&native.voice_trace())?;
    Ok(before_ms + after_ms)
}

pub fn feed_turn(native: &Native, name: &str, samples: &Samples) -> Result<Turn> {
    await_floor(native)?;
    let stack = stack(native)?;
    let before = marks(&native.voice_trace())?.len();
    let mut player = stack.start_feed(&native.system, name, samples)?;
    super::wait_for_exit(&mut player)?;
    let fed_until_ms = now_millis();
    turn_since(native, before, fed_until_ms, "heard")
}

pub fn feed_until_listening(native: &Native, name: &str, samples: &Samples) -> Result<Turn> {
    await_floor(native)?;
    let stack = stack(native)?;
    let before = marks(&native.voice_trace())?.len();
    let mut player = stack.start_feed(&native.system, name, samples)?;
    super::wait_for_exit(&mut player)?;
    let fed_until_ms = now_millis();
    turn_since(native, before, fed_until_ms, "listening")
}

pub fn speak_and_hear_reply(native: &Native, speech: &Speech) -> Result<Turn> {
    await_floor(native)?;
    let before = marks(&native.voice_trace())?.len();
    feed(native, speech)?;
    let fed_until_ms = now_millis();
    turn_since(native, before, fed_until_ms, "speech-ended")
}

fn turn_since(native: &Native, before: usize, fed_until_ms: u64, last: &str) -> Result<Turn> {
    let trace = native.voice_trace();
    until(&format!("the turn's {last} mark"), || {
        Ok(live_marks(&trace)?
            .get(before..)
            .and_then(|fresh| mark_of(fresh, last))
            .map(|_| ()))
    })?;
    let marks: Vec<Mark> = marks(&trace)?.into_iter().skip(before).collect();
    Ok(Turn {
        fed_until_ms,
        ended_ms: marks
            .iter()
            .filter(|mark| mark.event == "utterance-ended")
            .map(|mark| mark.at_ms)
            .collect(),
        heard: marks
            .iter()
            .filter(|mark| mark.event == "heard")
            .filter_map(|mark| mark.words.clone())
            .collect(),
        marks,
    })
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeardTurn {
    pub ended_after_feed_began_ms: i64,
    pub acknowledgements: Vec<String>,
    pub heard: Option<String>,
    pub sent: bool,
    pub dropped: bool,
    pub spoken: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listened {
    pub waited_ms: u64,
    pub fed_ms: u64,
    pub turns: Vec<HeardTurn>,
}

impl Listened {
    pub fn sent(&self) -> usize {
        self.turns.iter().filter(|turn| turn.sent).count()
    }

    pub fn dropped(&self) -> usize {
        self.turns.iter().filter(|turn| turn.dropped).count()
    }

    pub fn acknowledged(&self) -> usize {
        self.turns
            .iter()
            .filter(|turn| !turn.acknowledgements.is_empty())
            .count()
    }
}

fn turns_in(marks: &[Mark], began: u64) -> Vec<HeardTurn> {
    let mut turns: Vec<HeardTurn> = Vec::new();
    for mark in marks {
        if mark.event == "utterance-ended" {
            turns.push(HeardTurn {
                ended_after_feed_began_ms: i64::try_from(mark.at_ms).unwrap_or(i64::MAX)
                    - i64::try_from(began).unwrap_or(0),
                ..HeardTurn::default()
            });
            continue;
        }
        let Some(turn) = turns.last_mut() else {
            continue;
        };
        match mark.event.as_str() {
            "acknowledgement-started" | "refusal-started" => {
                turn.acknowledgements.extend(mark.words.clone());
            }
            "heard" => turn.heard = mark.words.clone(),
            "sent" => turn.sent = true,
            "dropped" => turn.dropped = true,
            "speech-started" => turn.spoken.extend(mark.words.clone()),
            _ => {}
        }
    }
    turns
}

fn settled_since(marks: &[Mark]) -> bool {
    let open = marks
        .iter()
        .rposition(|mark| mark.event == "utterance-ended" || mark.event == "speech-started");
    let listening = marks.iter().rposition(|mark| mark.event == "listening");
    match (open, listening) {
        (None, _) => true,
        (Some(open), Some(listening)) => listening > open,
        (Some(_), None) => false,
    }
}

pub fn feed_and_settle(native: &Native, name: &str, samples: &Samples) -> Result<Listened> {
    let waited_ms = await_floor(native)?;
    let stack = stack(native)?;
    let trace = native.voice_trace();
    let before = marks(&trace)?.len();
    let began = now_millis();
    let mut player = stack.start_feed(&native.system, name, samples)?;
    poll(ROOM_FEED.within(), LOOK, false, || {
        Ok(player.child.try_wait()?.map(|_| ()))
    })?
    .context("The room sound feed did not finish")?;
    let fed = now_millis();
    poll(ROOM_FEED.within(), LOOK, false, || {
        let fresh: Vec<Mark> = live_marks(&trace)?.into_iter().skip(before).collect();
        Ok((now_millis() >= fed + AFTER_FEED_MS && settled_since(&fresh)).then_some(()))
    })?
    .context("The app did not settle back to listening after the room sound")?;
    let fresh: Vec<Mark> = marks(&trace)?.into_iter().skip(before).collect();
    Ok(Listened {
        waited_ms,
        fed_ms: fed - began,
        turns: turns_in(&fresh, began),
    })
}

const REPLY_STARTS: [&str; 4] = [
    "speech-started",
    "refusal-started",
    "chat-started",
    "missed",
];

fn spoken_over_a_reply(marks: &[Mark], heard: usize) -> bool {
    marks[..heard]
        .iter()
        .rposition(|mark| {
            matches!(
                mark.event.as_str(),
                "speech-cut" | "speech-started" | "heard" | "sent" | "capture-open"
            )
        })
        .is_some_and(|at| marks[at].event == "speech-cut")
}

fn reply_is_owed(marks: &[Mark]) -> bool {
    marks
        .iter()
        .rposition(|mark| mark.event == "heard" || mark.event == "sent")
        .filter(|&turn| marks[turn].event == "sent" || !spoken_over_a_reply(marks, turn))
        .is_some_and(|turn| {
            !marks[turn..]
                .iter()
                .any(|mark| REPLY_STARTS.contains(&mark.event.as_str()))
        })
}

fn reply_is_playing(marks: &[Mark]) -> bool {
    marks
        .iter()
        .rposition(|mark| mark.event == "speech-started")
        .is_some_and(|started| {
            let since = &marks[started..];
            !since.iter().any(|mark| mark.event == "speech-ended")
                && since
                    .iter()
                    .rposition(|mark| mark.event == "speech-cut" || mark.event == "speaker-opened")
                    .is_none_or(|at| since[at].event == "speaker-opened")
        })
}

fn floor_is_clear(marks: &[Mark]) -> bool {
    let listening_follows = marks
        .iter()
        .rposition(|mark| mark.event == "speech-started")
        .is_none_or(|started| {
            marks[started..]
                .iter()
                .position(|mark| mark.event == "speech-ended")
                .is_some_and(|ended| {
                    marks[started + ended..]
                        .iter()
                        .any(|mark| mark.event == "listening")
                })
        });
    !reply_is_owed(marks) && listening_follows
}

fn reply_has_stopped(marks: &[Mark]) -> bool {
    !reply_is_playing(marks)
}

fn reply_is_settled(marks: &[Mark]) -> bool {
    !reply_is_owed(marks) && !reply_is_playing(marks)
}

fn awaited(
    native: &Native,
    kind: &str,
    clear: fn(&[Mark]) -> bool,
    voice_is_on: bool,
) -> Result<u64> {
    let trace = native.voice_trace();
    let waited_ms = wait_for(
        || {
            if voice_is_on {
                live_marks(&trace)
            } else {
                marks(&trace)
            }
        },
        FLOOR_WAIT.within(),
        clear,
    )?;
    let mut log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(native.system.evidence.join("voice-waits.jsonl"))?;
    writeln!(
        log,
        "{}",
        json!({ "atMs": now_millis(), "kind": kind, "waitedMs": waited_ms })
    )?;
    Ok(waited_ms)
}

pub fn await_floor(native: &Native) -> Result<u64> {
    awaited(native, "before-feed", floor_is_clear, true)
}

pub fn await_reply_stop(native: &Native) -> Result<u64> {
    awaited(native, "before-click", reply_has_stopped, false)
}

pub fn await_reply_settled(native: &Native, kind: &str, voice_is_on: bool) -> Result<u64> {
    awaited(native, kind, reply_is_settled, voice_is_on)
}

fn wait_for(
    mut read: impl FnMut() -> Result<Vec<Mark>>,
    within: Duration,
    clear: fn(&[Mark]) -> bool,
) -> Result<u64> {
    let began = now_millis();
    if poll(within, LOOK, true, || Ok(clear(&read()?).then_some(())))?.is_some() {
        return Ok(now_millis() - began);
    }
    let reason = format!(
        "previous reply still playing after {} s, so nothing was started after it",
        within.as_secs()
    );
    let seen = read()?;
    if reply_is_owed(&seen) || reply_is_playing(&seen) {
        Err(Defect(reason).into())
    } else {
        Err(anyhow::anyhow!(reason))
    }
}

pub fn feed(native: &Native, speech: &Speech) -> Result<()> {
    stack(native)?.feed(&native.system, speech)
}

pub fn echo(native: &Native) -> Result<super::Echo> {
    stack(native)?.echo(&native.system)
}

pub fn watch_control(native: &Native, during: Owed) -> Result<Vec<(String, Vec<String>)>> {
    let mut looks = Vec::new();
    poll(during.within(), LOOK, true, || {
        let label =
            native.drawn_label(&Target::VOICE_CONTROL, "the voice control drawn", |_| true)?;
        looks.push((label, recorders(native)?));
        Ok(None::<()>)
    })?;
    Ok(looks)
}

pub fn spoken_ever(native: &Native) -> Result<Vec<String>> {
    Ok(marks(&native.voice_trace())?
        .into_iter()
        .filter(|mark| mark.event == "speech-started")
        .filter_map(|mark| mark.words)
        .collect())
}

pub fn settle_ms(marks: &[Mark]) -> Option<u64> {
    let opened = marks
        .iter()
        .rposition(|mark| mark.event == "capture-open")?;
    let listening = marks[opened..]
        .iter()
        .find(|mark| mark.event == "listening")?;
    listening.at_ms.checked_sub(marks[opened].at_ms)
}

pub fn turn_off(native: &Native) -> Result<()> {
    let label = native.drawn_label(&Target::VOICE_CONTROL, "the voice control drawn", |_| true)?;
    if label != READY {
        await_reply_settled(native, "before-off", true)?;
        native.click(&Target::VOICE_CONTROL)?;
    }
    native.drawn_label(&Target::VOICE_CONTROL, "the voice control off", |label| {
        label == READY
    })?;
    until("the microphone to close", || {
        Ok(recorders(native)?.is_empty().then_some(()))
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

fn wav(rate: u32, narrow: &[i16]) -> Vec<u8> {
    let data = u32::try_from(narrow.len() * 2).unwrap_or(u32::MAX);
    let mut wav = Vec::with_capacity(44 + narrow.len() * 2);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&rate.to_le_bytes());
    wav.extend_from_slice(&(rate * 2).to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data.to_le_bytes());
    for sample in narrow {
        wav.extend_from_slice(&sample.to_le_bytes());
    }
    wav
}

fn hear_16k(native: &Native, narrow: &[i16]) -> Result<String> {
    let body = json!({
        "temperature": 0,
        "max_tokens": 200,
        "messages": [
            {"role": "system", "content": "Perform ASR in English."},
            {"role": "user", "content": [{"type": "input_audio", "input_audio": {"data": base64(&wav(16_000, narrow)), "format": "wav"}}]}
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
        .replace("<|im_end|>", " ")
        .trim()
        .to_owned())
}

const WINDOW_FRAMES: usize = 400;
const LONGEST_FRAMES: usize = 750;
const PAUSE_FRAMES: usize = 15;
const QUIET_RMS: f64 = 100.0;

pub fn window_ranges(narrow: &[i16]) -> Vec<std::ops::Range<usize>> {
    let frame = 320;
    let loud: Vec<bool> = narrow
        .chunks(frame)
        .map(|chunk| {
            let energy: f64 = chunk.iter().map(|s| f64::from(*s).powi(2)).sum();
            (energy / chunk.len() as f64).sqrt() >= QUIET_RMS
        })
        .collect();
    let mut cuts = vec![0];
    let (mut start, mut quiet) = (0, 0);
    for (index, is_loud) in loud.iter().enumerate() {
        quiet = if *is_loud { 0 } else { quiet + 1 };
        let length = index + 1 - start;
        if quiet >= PAUSE_FRAMES && length >= WINDOW_FRAMES {
            start = index + 1;
        } else if length >= LONGEST_FRAMES {
            start = quietest_cut(&loud[start + WINDOW_FRAMES..=index])
                .map_or(index + 1, |at| start + WINDOW_FRAMES + at);
            quiet = 0;
        } else {
            continue;
        }
        cuts.push((start * frame).min(narrow.len()));
    }
    cuts.push(narrow.len());
    cuts.windows(2)
        .map(|pair| pair[0].min(narrow.len())..pair[1])
        .filter(|range| {
            narrow[range.clone()]
                .iter()
                .any(|s| s.unsigned_abs() >= 1000)
        })
        .collect()
}

fn quietest_cut(loud: &[bool]) -> Option<usize> {
    let mut best: Option<(usize, usize)> = None;
    let mut run = 0;
    for (index, is_loud) in loud.iter().enumerate() {
        run = if *is_loud { 0 } else { run + 1 };
        if run > 0 && best.is_none_or(|(longest, _)| run > longest) {
            best = Some((run, index + 1 - run / 2));
        }
    }
    best.map(|(_, at)| at)
}

pub fn marks_between(marks: &[Mark], event: &str, from: &str, to: &str) -> usize {
    let start = marks.iter().position(|mark| mark.event == from);
    let end = marks.iter().position(|mark| mark.event == to);
    match (start, end) {
        (Some(start), Some(end)) if start <= end => marks[start..=end]
            .iter()
            .filter(|mark| mark.event == event)
            .count(),
        _ => 0,
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct Pause {
    pub from_ms: u64,
    pub to_ms: u64,
}

pub fn pauses(
    native: &Native,
    name: &str,
    said: &Conversation,
    floor_ms: u64,
) -> Result<Vec<Pause>> {
    let stack = stack(native)?;
    let heard = Samples::decode(&fs::read(stack.folder().join(format!("{name}.wav")))?)?;
    let offset = |event: &str| {
        mark_of(&said.marks, event)
            .map(|mark| mark.at_ms.saturating_sub(said.capture_began_ms))
            .with_context(|| format!("The app marked no {event}"))
    };
    let per_ms = (super::speech::RATE / 1000) as usize;
    let start_ms = offset("speech-started")?;
    let from = usize::try_from(start_ms)?.saturating_mul(per_ms);
    let to = usize::try_from(offset("speech-ended")?)?
        .saturating_mul(per_ms)
        .min(heard.0.len());
    let base = said.capture_began_ms + start_ms;
    Ok(
        quiet_runs(heard.0.get(from..to).unwrap_or_default(), per_ms * 20)
            .into_iter()
            .map(|(first, frames)| Pause {
                from_ms: base + first as u64 * 20,
                to_ms: base + (first + frames) as u64 * 20,
            })
            .filter(|pause| pause.to_ms - pause.from_ms > floor_ms)
            .collect(),
    )
}

fn quiet_runs(samples: &[i16], frame: usize) -> Vec<(usize, usize)> {
    let loud: Vec<bool> = samples
        .chunks(frame)
        .map(|chunk| {
            let energy: f64 = chunk.iter().map(|s| f64::from(*s).powi(2)).sum();
            (energy / chunk.len() as f64).sqrt() >= QUIET_RMS
        })
        .collect();
    let (Some(first), Some(last)) = (
        loud.iter().position(|is_loud| *is_loud),
        loud.iter().rposition(|is_loud| *is_loud),
    ) else {
        return Vec::new();
    };
    let mut runs = Vec::new();
    let mut start = None;
    for (index, is_loud) in loud.iter().enumerate().take(last + 1).skip(first) {
        match (is_loud, start) {
            (false, None) => start = Some(index),
            (true, Some(began)) => {
                runs.push((began, index - began));
                start = None;
            }
            _ => {}
        }
    }
    runs
}

pub fn transcribe_long(native: &Native, name: &str, said: &Conversation) -> Result<Vec<String>> {
    let stack = stack(native)?;
    let heard = Samples::decode(&fs::read(stack.folder().join(format!("{name}.wav")))?)?;
    let narrow: Vec<i16> = heard
        .0
        .as_chunks::<3>()
        .0
        .iter()
        .map(|trio| ((i32::from(trio[0]) + i32::from(trio[1]) + i32::from(trio[2])) / 3) as i16)
        .collect();
    let reply_from_ms = mark_of(&said.marks, "speech-started")
        .map(|mark| mark.at_ms.saturating_sub(said.capture_began_ms))
        .context("The app marked no start of the spoken reply")?;
    let reply_from = usize::try_from(reply_from_ms)?
        .saturating_mul(16)
        .min(narrow.len());
    let reply = &narrow[reply_from..];
    window_ranges(reply)
        .into_iter()
        .map(|range| hear_16k(native, &reply[range]))
        .collect()
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
            {"role": "user", "content": [{"type": "input_audio", "input_audio": {"data": base64(&wav(16_000, &narrow)), "format": "wav"}}]}
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

pub fn keep_engine_log(native: &Native) -> Result<()> {
    let path = native.system.evidence.join("voice-engine.log");
    fs::write(&path, engine_screen(native)?)
        .with_context(|| format!("The engine log was not kept at {}", path.display()))
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
    fn a_kept_clip_that_opens_on_its_first_sound_is_told_apart_from_one_that_opens_quiet() {
        let root = std::env::temp_dir().join(format!("voyager-openings-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let folder = root.join("omni-1-female");
        fs::create_dir_all(&folder).unwrap();
        let quiet: Vec<i16> = [vec![20; 3_480], vec![2_000; 4_800]].concat();
        let cut: Vec<i16> = vec![2_000; 4_800];
        fs::write(folder.join("asking-00000000.wav"), wav(CLIP_RATE, &quiet)).unwrap();
        fs::write(folder.join("queued-00000000.wav"), wav(CLIP_RATE, &cut)).unwrap();
        let openings = openings_in(&root).unwrap();
        let _ = fs::remove_dir_all(&root);
        let seen: Vec<_> = openings
            .iter()
            .map(|clip| (clip.file.as_str(), clip.opens_quiet, clip.first_sound_ms))
            .collect();
        assert_eq!(
            seen,
            [
                ("asking-00000000.wav", true, Some(145)),
                ("queued-00000000.wav", false, Some(0)),
            ]
        );
    }

    #[test]
    fn heard_digits_count_as_the_same_number_said_in_words() {
        let heard =
            "The run changed 1,200 lines in 4 minutes, about 50% faster, and peaked at 6.5 GB.";
        let wanted = "The run changed one thousand two hundred lines in four minutes, about fifty percent faster, and peaked at six point five gigabytes.";
        assert_eq!(word_errors(&digits_as_words(heard), wanted), (1, 22));
        assert_eq!(
            digits_as_words("38 checks, 0.25 and 4:20."),
            "thirty eight checks, zero point two five and 4:20."
        );
    }

    #[test]
    fn pauses_are_only_the_quiet_between_sounds() {
        let frame = 960;
        let sound = vec![3000i16; frame * 10];
        let samples: Vec<i16> = [
            vec![0; frame * 30],
            sound.clone(),
            vec![0; frame * 12],
            sound.clone(),
            vec![0; frame * 5],
            sound,
            vec![0; frame * 40],
        ]
        .concat();
        assert_eq!(quiet_runs(&samples, frame), vec![(40, 12), (62, 5)]);
        assert!(quiet_runs(&[0; 9600], frame).is_empty());
    }

    #[test]
    fn marks_are_counted_only_between_their_bounds() {
        let mark = |event: &str| Mark {
            event: event.to_owned(),
            at_ms: 0,
            words: None,
        };
        let marks = [
            mark("speaker-opened"),
            mark("speech-started"),
            mark("speaker-opened"),
            mark("speech-ended"),
            mark("speaker-opened"),
        ];
        assert_eq!(
            marks_between(&marks, "speaker-opened", "speech-started", "speech-ended"),
            1
        );
        assert_eq!(
            marks_between(
                &marks[..2],
                "speaker-opened",
                "speech-started",
                "speech-ended"
            ),
            0
        );
    }

    type Spoken = (Vec<i16>, Vec<(std::ops::Range<usize>, String)>);

    fn spoken(sentences: &[&str], between: usize) -> Spoken {
        let (word, gap) = (16_000 * 3 / 10, 16_000 / 20);
        let mut narrow = Vec::new();
        let mut spans = Vec::new();
        for sentence in sentences {
            let start = narrow.len();
            for _ in sentence.split_whitespace() {
                narrow.extend(std::iter::repeat_n(3000i16, word));
                narrow.extend(std::iter::repeat_n(0i16, gap));
            }
            spans.push((start..narrow.len(), (*sentence).to_owned()));
            narrow.extend(std::iter::repeat_n(0i16, between));
        }
        (narrow, spans)
    }

    fn heard_whole_sentences(spoken: &Spoken) -> (Vec<std::ops::Range<usize>>, String) {
        let (narrow, spans) = spoken;
        let windows = window_ranges(narrow);
        let heard = windows
            .iter()
            .flat_map(|window| {
                spans
                    .iter()
                    .filter(|(span, _)| window.start <= span.start && span.end <= window.end)
                    .map(|(_, text)| text.clone())
            })
            .collect::<Vec<_>>()
            .join(" ");
        (windows, heard)
    }

    const REPLY: &str = "Here's where things stand. The canvas change is merged, and the build passed on the second try. The voice work is split into three pieces, and the first one is in review, the second is being tested right now, and the third is waiting for a build slot that should free up soon. The run changed one thousand two hundred lines in four minutes, about fifty percent faster than yesterday, and memory peaked at six point five gigabytes. Two tests were slow on the last run but they passed in the end so I left them alone and nothing about them needs you to do anything at all today. Want me to walk through any of it?";

    const PIECES: [&str; 9] = [
        "Here's where things stand.",
        "The canvas change is merged, and the build passed on the second try.",
        "The voice work is split into three pieces, and the first one is in review, the second is being tested right now,",
        "and the third is waiting for a build slot that should free up soon.",
        "The run changed one thousand two hundred lines in four minutes,",
        "about fifty percent faster than yesterday, and memory peaked at six point five gigabytes.",
        "Two tests were slow on the last run but they passed in the end so I left them alone",
        "and nothing about them needs you to do anything at all today.",
        "Want me to walk through any of it?",
    ];

    fn said_with(after: usize, again: usize) -> Vec<&'static str> {
        let mut said = Vec::new();
        for (index, piece) in PIECES.iter().enumerate() {
            said.push(*piece);
            if index == after {
                said.push(PIECES[again]);
            }
        }
        said
    }

    fn repeats() -> Vec<Vec<&'static str>> {
        let mut all: Vec<Vec<&str>> = (0..PIECES.len())
            .map(|index| said_with(index, index))
            .collect();
        all.extend([said_with(4, 2), said_with(5, 3), said_with(5, 4)]);
        all
    }

    #[test]
    fn a_window_that_reaches_the_ceiling_is_cut_in_its_longest_quiet_stretch_not_mid_sentence() {
        let sentences: Vec<String> = (0..6)
            .map(|number| {
                (0..9)
                    .map(|index| format!("w{number}x{index}"))
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .collect();
        let sentences: Vec<&str> = sentences.iter().map(String::as_str).collect();
        let spoken = spoken(&sentences, 16_000 / 5);
        let (windows, heard) = heard_whole_sentences(&spoken);
        assert!(windows.len() >= 2);
        assert!(spoken.1.iter().all(|(span, _)| {
            windows
                .iter()
                .all(|window| !(span.start < window.start && window.start < span.end))
        }));
        assert_eq!(word_errors(&heard, &sentences.join(" ")), (0, 54));
    }

    #[test]
    fn a_pause_cut_on_the_last_partial_frame_stays_inside_the_capture() {
        for partial in [1, 160, 319] {
            let narrow: Vec<i16> =
                [vec![3000i16; 16_000 * 9], vec![0i16; 320 * 14 + partial]].concat();
            let windows = window_ranges(&narrow);
            assert_eq!(windows.len(), 1, "partial {partial}");
            assert_eq!(windows[0], 0..narrow.len(), "partial {partial}");
        }
    }

    #[test]
    fn a_ceiling_cut_on_the_last_partial_frame_stays_inside_the_capture() {
        for partial in [1, 160, 319] {
            let narrow = vec![3000i16; 320 * 749 + partial];
            let windows = window_ranges(&narrow);
            assert_eq!(windows.len(), 1, "partial {partial}");
            assert_eq!(windows[0], 0..narrow.len(), "partial {partial}");
        }
    }

    #[test]
    fn a_reply_with_no_quiet_at_all_is_still_cut_at_the_ceiling() {
        let narrow = vec![3000i16; 16_000 * 20];
        let windows = window_ranges(&narrow);
        assert_eq!(windows.len(), 2);
        assert_eq!(windows[0], 0..16_000 * 15);
    }

    #[test]
    fn a_perfectly_heard_reply_counts_as_perfect_at_every_cut() {
        let words: Vec<&str> = PIECES
            .iter()
            .flat_map(|piece| piece.split_whitespace())
            .collect();
        for cut in 0..=words.len() {
            let heard = [words[..cut].join(" "), words[cut..].join(" ")];
            assert_eq!(
                word_errors(&digits_as_words(&heard.join(" ")), REPLY),
                (0, 117),
                "cut at word {cut}"
            );
        }
    }

    #[test]
    fn a_piece_said_again_counts_wrong_at_every_cut() {
        for said in repeats() {
            let words: Vec<&str> = said
                .iter()
                .flat_map(|piece| piece.split_whitespace())
                .collect();
            for cut in 0..=words.len() {
                let heard = [words[..cut].join(" "), words[cut..].join(" ")];
                let (errors, _) = word_errors(&digits_as_words(&heard.join(" ")), REPLY);
                assert!(errors > 0, "hidden at cut {cut} of {said:?}");
            }
        }
    }

    #[test]
    fn a_piece_said_again_straight_after_itself_is_heard_and_counted_wrong() {
        for said in repeats() {
            let spoken = spoken(&said, 16_000 / 5);
            let (_, heard) = heard_whole_sentences(&spoken);
            let (errors, _) = word_errors(&digits_as_words(&heard), REPLY);
            assert!(errors > 0, "hidden in {said:?}");
        }
        let no_pause = spoken(&said_with(3, 3), 0);
        let (_, heard) = heard_whole_sentences(&no_pause);
        assert!(word_errors(&digits_as_words(&heard), REPLY).0 > 0);
    }

    #[test]
    fn the_capture_is_cut_into_windows_at_its_pauses() {
        let voiced = vec![3000i16; 16_000 * 9];
        let pause = vec![0i16; 16_000];
        let narrow: Vec<i16> = [voiced.clone(), pause.clone(), voiced, pause].concat();
        let cut = window_ranges(&narrow);
        assert_eq!(cut.len(), 2);
        assert!(cut.iter().all(|window| window.len() <= 16_000 * 15));
    }

    #[test]
    fn words_are_found_inside_a_longer_transcript_ignoring_case_and_punctuation() {
        assert!(words_contain(
            "One sec. Docked on this fleet. The Fleet was already open.",
            "Docked on this fleet. The Fleet was already open."
        ));
        assert!(!words_contain("One sec.", "Docked on this fleet."));
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
    fn word_errors_count_substitutions_insertions_and_deletions_as_round_four_did() {
        assert_eq!(
            word_errors("Dock on this fleet.", "dock on this Fleet"),
            (0, 4)
        );
        assert_eq!(
            word_errors("Dock on the fleet", "Dock on this fleet."),
            (1, 4)
        );
        assert_eq!(
            word_errors("Dock this fleet now please", "Dock on this fleet."),
            (3, 4)
        );
        assert_eq!(
            word_errors("What is 2 plus 2?", "What is two plus two?"),
            (0, 5)
        );
        assert_eq!(
            word_errors("Open Voyager Shell", "Open voyagershell"),
            (0, 2)
        );
        assert_eq!(
            word_errors(
                "The fleet includes a home dock, a fleet of vessels, and voyagershell.",
                "In three short sentences, tell me what this fleet has in it."
            ),
            (12, 12)
        );
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
    fn a_trace_line_the_app_is_still_writing_is_read_on_the_next_look() -> Result<()> {
        let folder = std::env::temp_dir().join(format!("voice-trace-{}", std::process::id()));
        fs::create_dir_all(&folder)?;
        let path = folder.join("voice-trace.jsonl");
        fs::write(
            &path,
            "{\"event\":\"heard\",\"atMs\":1}\n{\"event\":\"refusal-st",
        )?;
        let first = marks(&path)?;
        fs::write(
            &path,
            "{\"event\":\"heard\",\"atMs\":1}\n{\"event\":\"refusal-started\",\"atMs\":2}\n",
        )?;
        let second = marks(&path)?;
        fs::remove_dir_all(&folder)?;
        assert_eq!(first.len(), 1);
        assert_eq!(second.len(), 2);
        Ok(())
    }

    fn trace(events: &[&str]) -> Vec<Mark> {
        events
            .iter()
            .zip(0..)
            .map(|(event, at_ms)| Mark {
                event: (*event).to_owned(),
                at_ms,
                words: None,
            })
            .collect()
    }

    #[test]
    fn the_floor_is_clear_before_any_reply_is_owed() {
        assert!(floor_is_clear(&trace(&[])));
        assert!(floor_is_clear(&trace(&["capture-open", "listening"])));
    }

    #[test]
    fn a_sent_turn_owes_a_reply_that_has_not_started() {
        assert!(!floor_is_clear(&trace(&["heard", "sent"])));
        assert!(!floor_is_clear(&trace(&[
            "sent",
            "capture-open",
            "listening"
        ])));
    }

    #[test]
    fn a_reply_holds_the_floor_until_capture_reopens_after_it_ends() {
        assert!(!floor_is_clear(&trace(&["sent", "speech-started"])));
        assert!(!floor_is_clear(&trace(&[
            "sent",
            "speech-started",
            "speech-ended",
            "capture-open"
        ])));
        assert!(floor_is_clear(&trace(&[
            "sent",
            "speech-started",
            "speech-ended",
            "capture-open",
            "listening"
        ])));
    }

    #[test]
    fn a_later_sent_turn_owes_its_own_reply() {
        assert!(!floor_is_clear(&trace(&[
            "sent",
            "speech-started",
            "speech-ended",
            "listening",
            "sent",
            "capture-open",
            "listening"
        ])));
    }

    #[test]
    fn a_reply_that_never_releases_the_floor_fails_with_the_named_reason() {
        let error = wait_for(
            || Ok(trace(&["sent", "speech-started"])),
            Duration::from_millis(50),
            floor_is_clear,
        )
        .unwrap_err();
        assert!(
            format!("{error:#}").starts_with("previous reply still playing after "),
            "{error:#}"
        );
        assert!(error.downcast_ref::<Defect>().is_some());
    }

    #[test]
    fn a_clear_floor_ends_the_wait_at_once() {
        let waited = wait_for(
            || {
                Ok(trace(&[
                    "sent",
                    "speech-started",
                    "speech-ended",
                    "listening",
                ]))
            },
            Duration::from_secs(5),
            floor_is_clear,
        )
        .unwrap();
        assert!(waited < 1000);
    }

    #[test]
    fn a_reply_that_ended_with_the_microphone_closed_is_over() {
        let ended = trace(&["sent", "speech-started", "speech-ended"]);
        assert!(reply_has_stopped(&ended));
        assert!(!floor_is_clear(&ended));
        assert!(reply_has_stopped(&trace(&[])));
    }

    #[test]
    fn a_reply_owed_to_a_microphone_that_is_off_does_not_hold_the_click() {
        assert!(reply_has_stopped(&trace(&["heard", "sent"])));
        assert!(reply_has_stopped(&trace(&[
            "sent",
            "speech-started",
            "speech-ended",
            "sent"
        ])));
        assert!(!floor_is_clear(&trace(&["heard", "sent"])));
    }

    #[test]
    fn a_reply_owed_while_voice_is_off_does_not_block_the_click() {
        let waited = wait_for(
            || Ok(trace(&["heard", "sent", "capture-open", "listening"])),
            Duration::from_secs(5),
            reply_has_stopped,
        )
        .unwrap();
        assert!(waited < 1000);
    }

    #[test]
    fn the_click_off_waits_for_an_owed_reply_to_play_out() {
        let mut reads = 0;
        let waited = wait_for(
            || {
                reads += 1;
                Ok(match reads {
                    1 => trace(&["heard", "sent"]),
                    2 => trace(&["heard", "sent", "speech-started"]),
                    _ => trace(&["heard", "sent", "speech-started", "speech-ended"]),
                })
            },
            Duration::from_secs(5),
            reply_is_settled,
        )
        .unwrap();
        assert!(reads >= 3);
        assert!(waited < 5000);
    }

    #[test]
    fn a_reply_that_never_plays_fails_the_click_off_wait_with_the_named_reason() {
        let error = wait_for(
            || Ok(trace(&["heard", "sent"])),
            Duration::from_millis(50),
            reply_is_settled,
        )
        .unwrap_err();
        assert!(
            format!("{error:#}").starts_with("previous reply still playing after "),
            "{error:#}"
        );
        assert!(error.downcast_ref::<Defect>().is_some());
    }

    #[test]
    fn a_reply_that_ended_but_never_resumed_listening_is_blamed_on_the_fixture() {
        let error = wait_for(
            || Ok(trace(&["sent", "speech-started", "speech-ended"])),
            Duration::from_millis(50),
            floor_is_clear,
        )
        .unwrap_err();
        assert!(
            format!("{error:#}").starts_with("previous reply still playing after "),
            "{error:#}"
        );
        assert!(error.downcast_ref::<Defect>().is_none());
    }

    #[test]
    fn a_reply_owed_with_no_speech_is_blamed_on_the_product() {
        let error = wait_for(
            || Ok(trace(&["heard", "sent"])),
            Duration::from_millis(50),
            reply_is_settled,
        )
        .unwrap_err();
        assert!(error.downcast_ref::<Defect>().is_some());
    }

    #[test]
    fn a_trace_missing_before_voice_is_on_reads_as_empty() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("no-such-voice-trace.jsonl");
        assert!(marks(&path).unwrap().is_empty());
    }

    #[test]
    fn a_trace_missing_once_voice_is_on_fails_with_its_own_reason() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("no-such-voice-trace.jsonl");
        let error = live_marks(&path).unwrap_err();
        assert!(
            format!("{error:#}").starts_with("voice trace missing"),
            "{error:#}"
        );
        assert!(error.downcast_ref::<Defect>().is_some());
        let waited = wait_for(|| live_marks(&path), Duration::from_secs(5), floor_is_clear);
        assert!(waited.is_err());
    }

    #[test]
    fn an_empty_trace_that_is_present_reads_as_before() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("empty-voice-trace-test.jsonl");
        fs::write(&path, "").unwrap();
        let read = live_marks(&path);
        fs::remove_file(&path).unwrap();
        assert!(read.unwrap().is_empty());
        assert!(floor_is_clear(&[]));
    }

    #[test]
    fn a_heard_turn_owes_a_reply_before_it_is_sent() {
        let heard = trace(&["capture-open", "listening", "utterance-ended", "heard"]);
        assert!(reply_is_owed(&heard));
        assert!(!floor_is_clear(&heard));
        assert!(!reply_is_settled(&heard));
        assert!(reply_has_stopped(&heard));
    }

    #[test]
    fn a_heard_turn_that_is_routing_still_owes_its_reply() {
        let routing = trace(&["heard", "routed", "acknowledgement-started"]);
        assert!(!reply_is_settled(&routing));
        assert!(!floor_is_clear(&routing));
    }

    #[test]
    fn an_acknowledgement_line_never_ends_the_reply_a_sent_turn_owes() {
        let looking = trace(&[
            "heard",
            "routed",
            "acknowledgement-chosen",
            "acknowledgement-started",
            "sent",
            "acknowledgement-started",
        ]);
        assert!(reply_is_owed(&looking));
        assert!(!reply_is_settled(&looking));
        assert!(!floor_is_clear(&looking));
        let replied = trace(&[
            "heard",
            "routed",
            "acknowledgement-chosen",
            "acknowledgement-started",
            "sent",
            "speech-started",
            "speech-ended",
            "listening",
        ]);
        assert!(reply_is_settled(&replied));
        assert!(floor_is_clear(&replied));
    }

    #[test]
    fn a_refused_chatted_or_missed_turn_owes_no_spoken_reply() {
        for ending in ["refusal-started", "chat-started", "missed"] {
            let turn = trace(&["heard", "routed", ending]);
            assert!(reply_is_settled(&turn), "{ending}");
            assert!(floor_is_clear(&turn), "{ending}");
        }
    }

    #[test]
    fn a_later_heard_turn_owes_its_own_reply_after_an_earlier_one_played() {
        let turns = trace(&[
            "heard",
            "sent",
            "speech-started",
            "speech-ended",
            "listening",
            "heard",
        ]);
        assert!(!reply_is_settled(&turns));
        assert!(!floor_is_clear(&turns));
    }

    #[test]
    fn the_first_talk_over_runs_backchannel_owes_no_new_reply() {
        let backchannel = trace(&[
            "capture-open",
            "listening",
            "utterance-ended",
            "heard",
            "routed",
            "acknowledgement-chosen",
            "sent",
            "capture-open",
            "listening",
            "piece-rendered",
            "speech-started",
            "speaker-opened",
            "piece-started",
            "speech-cut",
            "piece-rendered",
            "utterance-ended",
            "heard",
            "speaker-opened",
            "piece-started",
            "piece-started",
            "speech-ended",
        ]);
        assert!(!reply_is_owed(&backchannel));
        assert!(reply_is_settled(&backchannel));
    }

    #[test]
    fn words_heard_over_a_reply_owe_no_new_reply_unless_they_are_sent() {
        let resumed = &[
            "heard",
            "sent",
            "speech-started",
            "speech-cut",
            "heard",
            "speaker-opened",
            "piece-started",
            "speech-ended",
            "listening",
        ];
        assert!(reply_is_settled(&trace(resumed)));
        assert!(floor_is_clear(&trace(resumed)));
        let stopped = &[
            "heard",
            "sent",
            "speech-started",
            "speech-cut",
            "heard",
            "listening",
        ];
        assert!(reply_is_settled(&trace(stopped)));
        let steered = [
            "heard",
            "sent",
            "speech-started",
            "speech-cut",
            "heard",
            "sent",
        ];
        assert!(reply_is_owed(&trace(&steered)));
        assert!(!reply_is_settled(&trace(&steered)));
        let answered = [
            &steered[..],
            &["speech-started", "speech-ended", "listening"],
        ]
        .concat();
        assert!(reply_is_settled(&trace(&answered)));
        assert!(floor_is_clear(&trace(&answered)));
    }

    #[test]
    fn a_request_on_a_new_microphone_after_a_cut_still_owes_its_reply() {
        let missed = [
            "speech-started",
            "speech-cut",
            "utterance-ended",
            "missed",
            "capture-open",
            "listening",
            "utterance-ended",
            "heard",
        ];
        let clicked_off = [
            "speech-started",
            "speech-cut",
            "capture-open",
            "listening",
            "utterance-ended",
            "heard",
        ];
        for turn in [&missed[..], &clicked_off[..]] {
            assert!(reply_is_owed(&trace(turn)), "{turn:?}");
            assert!(!reply_is_settled(&trace(turn)), "{turn:?}");
        }
    }

    #[test]
    fn a_cut_reply_stops_playing_until_a_resume_opens_a_speaker() {
        let playing = ["speech-started", "speaker-opened", "piece-started"];
        assert!(reply_is_playing(&trace(&playing)));
        let cut = [&playing[..], &["speech-cut"]].concat();
        assert!(!reply_is_playing(&trace(&cut)));
        let resumed = [&cut[..], &["heard", "speaker-opened", "piece-started"]].concat();
        assert!(reply_is_playing(&trace(&resumed)));
        let ended = [&resumed[..], &["speech-ended"]].concat();
        assert!(!reply_is_playing(&trace(&ended)));
        let whole = [&playing[..], &["speech-ended"]].concat();
        assert!(!reply_is_playing(&trace(&whole)));
    }

    #[test]
    fn the_speaker_is_quiet_after_a_stop_only_when_no_window_is_loud_again() {
        let loud = vec![2000_i16; ONSET_WINDOW];
        let quiet = vec![0_i16; ONSET_WINDOW];
        let windows = |pattern: &[&Vec<i16>]| {
            Samples(
                pattern
                    .iter()
                    .flat_map(|window| window.iter().copied())
                    .collect(),
            )
        };
        let still = [&loud; 10]
            .into_iter()
            .chain([&quiet; 60])
            .collect::<Vec<_>>();
        let stopped = windows(&still);
        let silent = silent_from(&stopped, 0, 0).unwrap();
        assert_eq!(silent, 10 * WINDOW_MS);
        assert_eq!(sound_from(&stopped, 0, silent), None);
        let again = [&still[..], &[&loud][..]].concat();
        let resumed = windows(&again);
        let silent = silent_from(&resumed, 0, 0).unwrap();
        assert_eq!(sound_from(&resumed, 0, silent), Some(70 * WINDOW_MS));
        assert_eq!(captured_ms(&resumed), 71 * WINDOW_MS);
        assert_eq!(silent_from(&windows(&[&loud; 80]), 0, 0), None);
    }

    #[test]
    fn a_turn_heard_with_no_cut_before_it_still_owes_its_reply() {
        assert!(reply_is_owed(&trace(&["heard"])));
        for ending in REPLY_STARTS {
            assert!(!reply_is_owed(&trace(&["heard", ending])), "{ending}");
        }
        let resumed: &[&str] = &[
            "heard",
            "sent",
            "speech-started",
            "speech-cut",
            "heard",
            "speaker-opened",
            "speech-ended",
            "listening",
        ];
        let stopped: &[&str] = &[
            "heard",
            "sent",
            "speech-started",
            "speech-cut",
            "heard",
            "listening",
        ];
        for before in [resumed, stopped] {
            let fresh = [before, &["utterance-ended", "heard"]].concat();
            assert!(reply_is_owed(&trace(&fresh)), "{fresh:?}");
            assert!(!reply_is_settled(&trace(&fresh)), "{fresh:?}");
            for ending in REPLY_STARTS {
                let replied = [&fresh[..], &[ending]].concat();
                assert!(!reply_is_owed(&trace(&replied)), "{replied:?}");
            }
        }
    }

    #[test]
    fn a_heard_turn_that_never_gets_a_reply_fails_the_turn_on_and_off_waits() {
        let waits: [fn(&[Mark]) -> bool; 2] = [floor_is_clear, reply_is_settled];
        for clear in waits {
            let error = wait_for(
                || Ok(trace(&["heard", "routed"])),
                Duration::from_millis(50),
                clear,
            )
            .unwrap_err();
            assert!(
                format!("{error:#}").starts_with("previous reply still playing after "),
                "{error:#}"
            );
            assert!(error.downcast_ref::<Defect>().is_some());
        }
    }

    #[test]
    fn a_reply_is_settled_only_when_none_is_owed_or_playing() {
        assert!(reply_is_settled(&trace(&[])));
        assert!(!reply_is_settled(&trace(&["heard", "sent"])));
        assert!(!reply_is_settled(&trace(&["sent", "speech-started"])));
        assert!(reply_is_settled(&trace(&[
            "sent",
            "speech-started",
            "speech-ended"
        ])));
    }

    #[test]
    fn a_reply_that_is_playing_has_not_stopped() {
        assert!(!reply_has_stopped(&trace(&["sent", "speech-started"])));
        assert!(reply_has_stopped(&trace(&[
            "sent",
            "speech-started",
            "speech-ended"
        ])));
    }

    #[test]
    fn a_reply_that_never_ends_fails_the_wait_before_the_click_with_the_named_reason() {
        let error = wait_for(
            || Ok(trace(&["sent", "speech-started"])),
            Duration::from_millis(50),
            reply_has_stopped,
        )
        .unwrap_err();
        assert!(
            format!("{error:#}").starts_with("previous reply still playing after "),
            "{error:#}"
        );
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
