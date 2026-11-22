use super::{LOOK, SPEAKER, Stack, judge, judge::Score, speech::Samples, speech::Speech};
use crate::inspection::Target;
use crate::native::{
    FLOOR_WAIT, LONG_REPLY_WAIT, Native, Owed, REPLY_WAIT, ROOM_FEED, SEND_WAIT, now_millis,
};
use crate::system::{PATIENCE, poll, settle, until};
use anyhow::{Context, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::time::Duration;

pub const APP_CLIENT: &str = "voyager-voice";
pub const READY: &str = "Start voice";
pub const LISTENING: &str = "Listening";
pub const CONNECTING: &str = "Connecting…";
const CLIP_RATE: u32 = 24_000;
const HEADER: usize = 44;
const ONSET_LEVEL: f64 = 300.0;
const ONSET_WINDOW: usize = 960;
const SIGNATURES: [&str; 3] = ["UklGR", "input_audio", "RIFF"];
const AFTER_FEED_MS: u64 = 2500;

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
    pub hummed: bool,
    pub chat: Option<String>,
    pub spoken: Score,
    pub first_sound_after_capture_ms: i64,
    pub capture_began_ms: u64,
    pub started_before_heard: bool,
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

const HUM: &str = "mm-hm";

fn answers(mark: &Mark) -> bool {
    mark.event == "chat-started"
        || (mark.event == "acknowledgement-started" && mark.words.as_deref() != Some(HUM))
}

fn mark_of<'a>(marks: &'a [Mark], event: &str) -> Option<&'a Mark> {
    marks.iter().find(|mark| mark.event == event)
}

pub fn converse(native: &Native, speech: &Speech, name: &str) -> Result<Conversation> {
    converse_within(native, speech, name, REPLY_WAIT)
}

pub fn converse_long(native: &Native, speech: &Speech, name: &str) -> Result<Conversation> {
    converse_within(native, speech, name, LONG_REPLY_WAIT)
}

fn converse_within(
    native: &Native,
    speech: &Speech,
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
    stack.feed(system, speech)?;
    let answer = until("the turn to be answered", || {
        let now = marks(&trace)?;
        Ok(now
            .get(before..)
            .and_then(|fresh| fresh.iter().find(|mark| answers(mark)).cloned()))
    })?;
    let chat = (answer.event == "chat-started").then(|| answer.words.clone().unwrap_or_default());
    let started = answer.words.clone().unwrap_or_default();
    let judged = if chat.is_some() {
        HUM
    } else {
        started.as_str()
    };
    let reference = clip(&system.evidence.join("home"), judged)?;
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
    if sent {
        poll(reply_wait.within(), LOOK, true, || {
            Ok(marks(&trace)?
                .get(before..)
                .and_then(|fresh| mark_of(fresh, "speech-ended"))
                .map(|_| ()))
        })?;
    }
    let listening_resumed = native
        .drawn_label(&Target::VOICE_CONTROL, "listening again", |label| {
            label == LISTENING
        })
        .is_ok();
    let microphone_closed = turn_off(native).is_ok();
    capture.finish(stack.folder(), name)?;
    let marks: Vec<Mark> = marks(&trace)?.into_iter().skip(before).collect();
    let ended = mark_of(&marks, "utterance-ended")
        .map(|mark| mark.at_ms)
        .context("The app marked no end of capture")?;
    let first_sound = i64::try_from(began)? + onset - i64::try_from(ended)?;
    let acknowledged = mark_of(&marks, "acknowledgement-started").map(|mark| mark.at_ms);
    let heard_at = mark_of(&marks, "heard").map(|mark| mark.at_ms);
    let hummed = marks
        .iter()
        .take_while(|mark| !answers(mark))
        .any(|mark| mark.event == "acknowledgement-started" && mark.words.as_deref() == Some(HUM));
    Ok(Conversation {
        heard: mark_of(&marks, "heard").and_then(|mark| mark.words.clone()),
        acknowledgement: chat.is_none().then_some(started),
        hummed,
        chat,
        spoken: score,
        first_sound_after_capture_ms: first_sound,
        capture_began_ms: began,
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
        Ok(marks(&trace)?
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
        Ok(marks(&trace)?
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

pub fn turn_on(native: &Native) -> Result<()> {
    native.drawn_label(&Target::VOICE_CONTROL, "the voice control off", |label| {
        label == READY
    })?;
    native.click(&Target::VOICE_CONTROL)?;
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
    Ok(())
}

pub fn feed_turn(native: &Native, name: &str, samples: &Samples) -> Result<Turn> {
    let stack = stack(native)?;
    let before = marks(&native.voice_trace())?.len();
    let mut player = stack.start_feed(&native.system, name, samples)?;
    super::wait_for_exit(&mut player)?;
    let fed_until_ms = now_millis();
    turn_since(native, before, fed_until_ms, "heard")
}

pub fn feed_until_listening(native: &Native, name: &str, samples: &Samples) -> Result<Turn> {
    let stack = stack(native)?;
    let before = marks(&native.voice_trace())?.len();
    let mut player = stack.start_feed(&native.system, name, samples)?;
    super::wait_for_exit(&mut player)?;
    let fed_until_ms = now_millis();
    turn_since(native, before, fed_until_ms, "listening")
}

pub fn speak_and_hear_reply(native: &Native, speech: &Speech) -> Result<Turn> {
    let before = marks(&native.voice_trace())?.len();
    feed(native, speech)?;
    let fed_until_ms = now_millis();
    turn_since(native, before, fed_until_ms, "speech-ended")
}

fn turn_since(native: &Native, before: usize, fed_until_ms: u64, last: &str) -> Result<Turn> {
    let trace = native.voice_trace();
    until(&format!("the turn's {last} mark"), || {
        Ok(marks(&trace)?
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
        let fresh: Vec<Mark> = marks(&trace)?.into_iter().skip(before).collect();
        Ok((now_millis() >= fed + AFTER_FEED_MS && settled_since(&fresh)).then_some(()))
    })?
    .context("The app did not settle back to listening after the room sound")?;
    let fresh: Vec<Mark> = marks(&trace)?.into_iter().skip(before).collect();
    Ok(Listened {
        fed_ms: fed - began,
        turns: turns_in(&fresh, began),
    })
}

fn floor_is_clear(marks: &[Mark]) -> bool {
    let reply_owed = marks
        .iter()
        .rposition(|mark| mark.event == "sent")
        .is_some_and(|sent| {
            !marks[sent..]
                .iter()
                .any(|mark| mark.event == "speech-started")
        });
    let floor_held = marks
        .iter()
        .rposition(|mark| mark.event == "speech-started")
        .is_some_and(|started| {
            match marks[started..]
                .iter()
                .position(|mark| mark.event == "speech-ended")
            {
                None => true,
                Some(ended) => !marks[started + ended..]
                    .iter()
                    .any(|mark| mark.event == "listening"),
            }
        });
    !reply_owed && !floor_held
}

pub fn await_floor(native: &Native) -> Result<u64> {
    let trace = native.voice_trace();
    wait_for_floor(|| marks(&trace), FLOOR_WAIT.within())
}

fn wait_for_floor(mut read: impl FnMut() -> Result<Vec<Mark>>, within: Duration) -> Result<u64> {
    let began = now_millis();
    poll(within, LOOK, true, || {
        Ok(floor_is_clear(&read()?).then_some(()))
    })?
    .with_context(|| {
        format!(
            "previous reply still playing after {} s, so the feed was not started",
            within.as_secs()
        )
    })?;
    Ok(now_millis() - began)
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

fn hear_16k(native: &Native, narrow: &[i16]) -> Result<String> {
    let body = json!({
        "temperature": 0,
        "max_tokens": 200,
        "messages": [
            {"role": "system", "content": "Perform ASR in English."},
            {"role": "user", "content": [{"type": "input_audio", "input_audio": {"data": base64(&wav_16k(narrow)), "format": "wav"}}]}
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

pub fn windows(narrow: &[i16]) -> Vec<&[i16]> {
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
        if (quiet >= PAUSE_FRAMES && length >= WINDOW_FRAMES) || length >= LONGEST_FRAMES {
            start = index + 1;
            cuts.push(start * frame);
        }
    }
    cuts.push(narrow.len());
    cuts.windows(2)
        .map(|pair| &narrow[pair[0].min(narrow.len())..pair[1]])
        .filter(|window| window.iter().any(|s| s.unsigned_abs() >= 1000))
        .collect()
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
    windows(&narrow[reply_from..])
        .into_iter()
        .map(|window| hear_16k(native, window))
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
    use crate::native::Defect;

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

    #[test]
    fn the_capture_is_cut_into_windows_at_its_pauses() {
        let voiced = vec![3000i16; 16_000 * 9];
        let pause = vec![0i16; 16_000];
        let narrow: Vec<i16> = [voiced.clone(), pause.clone(), voiced, pause].concat();
        let cut = windows(&narrow);
        assert_eq!(cut.len(), 2);
        assert!(cut.iter().all(|window| window.len() <= 16_000 * 15));
    }

    #[test]
    fn words_are_found_inside_a_longer_transcript_ignoring_case_and_punctuation() {
        assert!(words_contain(
            "Asking Voyager. Docked on this fleet. The Fleet was already open.",
            "Docked on this fleet. The Fleet was already open."
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
        let error = wait_for_floor(
            || Ok(trace(&["sent", "speech-started"])),
            Duration::from_millis(50),
        )
        .unwrap_err();
        assert!(
            format!("{error:#}").starts_with("previous reply still playing after "),
            "{error:#}"
        );
        assert!(error.downcast_ref::<Defect>().is_none());
    }

    #[test]
    fn a_clear_floor_ends_the_wait_at_once() {
        let waited = wait_for_floor(
            || {
                Ok(trace(&[
                    "sent",
                    "speech-started",
                    "speech-ended",
                    "listening",
                ]))
            },
            Duration::from_secs(5),
        )
        .unwrap();
        assert!(waited < 1000);
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
