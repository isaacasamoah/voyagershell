use crate::speech::{Clip, SAMPLE_RATE};
use std::{
    collections::VecDeque,
    io::{self, Read, Write},
    process::{Child, ChildStdin, Command, Stdio},
    thread::{self, JoinHandle},
    time::Duration,
};

pub const FRAME: usize = 320;
const SETTLE_FRAMES: usize = 15;
const ONSET_FRAMES: usize = 5;
const PAUSE_FRAMES: usize = 75;
const CAP_FRAMES: usize = 1500;
const LEAD_FRAMES: usize = 50;
const FLOOR_FRAMES: usize = 100;
const MIN_THRESHOLD: f32 = 200.0;
const FLOOR_FACTOR: f32 = 3.0;
const START_PROBABILITY: f32 = 0.3;
const SPEAKING_PROBABILITY: f32 = 0.15;
const PLAYING_LOOK: Duration = Duration::from_millis(20);

pub trait SpeechDetector {
    fn probability(&mut self, frame: &[i16]) -> f32;
    fn reset(&mut self);
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum End {
    Pause,
    Cap,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Heard {
    Settled,
    Ended(End),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Stage {
    Settling { seen: usize },
    Waiting { run: usize },
    Speaking { frames: usize, quiet: usize },
}

pub struct Gate {
    detector: Box<dyn SpeechDetector>,
    floors: VecDeque<f32>,
    stage: Stage,
    kept: VecDeque<Vec<i16>>,
    since_sound: usize,
}

impl Gate {
    pub fn new(mut detector: Box<dyn SpeechDetector>) -> Self {
        detector.reset();
        Self {
            detector,
            floors: VecDeque::new(),
            stage: Stage::Settling { seen: 0 },
            kept: VecDeque::new(),
            since_sound: PAUSE_FRAMES,
        }
    }

    pub fn push(&mut self, frame: Vec<i16>) -> Option<Heard> {
        let probability = self.detector.probability(&frame);
        let speech = probability >= SPEAKING_PROBABILITY;
        let sounding = above_floor(&mut self.floors, plain_level(&frame)) || speech;
        if !matches!(self.stage, Stage::Settling { .. }) {
            self.since_sound = if sounding { 0 } else { self.since_sound + 1 };
        }
        match &mut self.stage {
            Stage::Settling { seen } => {
                *seen += 1;
                if *seen < SETTLE_FRAMES {
                    None
                } else {
                    self.stage = Stage::Waiting { run: 0 };
                    Some(Heard::Settled)
                }
            }
            Stage::Waiting { run } => {
                *run = if probability >= START_PROBABILITY {
                    *run + 1
                } else {
                    0
                };
                let run = *run;
                self.kept.push_back(frame);
                if run >= ONSET_FRAMES {
                    self.stage = Stage::Speaking {
                        frames: run,
                        quiet: 0,
                    };
                } else if self.kept.len() > LEAD_FRAMES {
                    self.kept.pop_front();
                }
                None
            }
            Stage::Speaking { frames, quiet } => {
                *frames += 1;
                *quiet = if speech { 0 } else { *quiet + 1 };
                self.kept.push_back(frame);
                if *quiet >= PAUSE_FRAMES {
                    Some(Heard::Ended(End::Pause))
                } else if *frames >= CAP_FRAMES {
                    Some(Heard::Ended(End::Cap))
                } else {
                    None
                }
            }
        }
    }

    pub fn speaking(&self) -> bool {
        matches!(self.stage, Stage::Speaking { .. })
    }

    pub fn quiet(&self) -> bool {
        self.since_sound >= PAUSE_FRAMES && !matches!(self.stage, Stage::Speaking { .. })
    }

    pub fn utterance(self) -> Vec<i16> {
        self.kept.into_iter().flatten().collect()
    }
}

fn above_floor(floors: &mut VecDeque<f32>, level: f32) -> bool {
    floors.push_back(level);
    if floors.len() > FLOOR_FRAMES {
        floors.pop_front();
    }
    let floor = floors.iter().copied().fold(f32::MAX, f32::min);
    level > (floor * FLOOR_FACTOR).max(MIN_THRESHOLD)
}

fn plain_level(frame: &[i16]) -> f32 {
    if frame.is_empty() {
        return 0.0;
    }
    let sum: f64 = frame.iter().map(|sample| f64::from(*sample).powi(2)).sum();
    (sum / frame.len() as f64).sqrt() as f32
}

pub struct Capture {
    child: Child,
}

impl Capture {
    pub fn open() -> io::Result<Self> {
        let child = Command::new("parec")
            .args([
                "--raw",
                "--format=s16le",
                &format!("--rate={SAMPLE_RATE}"),
                "--channels=1",
                "--latency-msec=20",
                "--client-name=voyager-voice",
                "--stream-name=voyager-voice",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;
        Ok(Self { child })
    }

    pub fn frame(&mut self) -> io::Result<Vec<i16>> {
        let output = self
            .child
            .stdout
            .as_mut()
            .ok_or_else(|| io::Error::other("The microphone stream has no output"))?;
        let mut bytes = [0u8; FRAME * 2];
        output.read_exact(&mut bytes)?;
        Ok(bytes
            .as_chunks::<2>()
            .0
            .iter()
            .map(|pair| i16::from_le_bytes(*pair))
            .collect())
    }
}

impl Drop for Capture {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub struct Playing {
    child: Child,
    input: Option<ChildStdin>,
    writer: Option<JoinHandle<()>>,
}

impl Playing {
    pub fn open(rate: u32) -> io::Result<Self> {
        let mut child = Command::new("paplay")
            .args([
                "--raw",
                "--format=s16le",
                &format!("--rate={rate}"),
                "--channels=1",
                "--latency-msec=40",
                "--client-name=voyager-voice",
                "--stream-name=voyager-voice",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?;
        let input = child
            .stdin
            .take()
            .ok_or_else(|| io::Error::other("The speaker stream has no input"))?;
        Ok(Self {
            child,
            input: Some(input),
            writer: None,
        })
    }

    pub fn play(&mut self, pcm: Vec<u8>) {
        if let Some(mut input) = self.input.take() {
            self.writer = Some(thread::spawn(move || {
                let _ = input.write_all(&pcm);
            }));
        }
    }

    pub fn finish(mut self, cut: &dyn Fn() -> bool) -> io::Result<()> {
        self.input = None;
        while self.child.try_wait()?.is_none() {
            if cut() {
                self.child.kill()?;
                self.child.wait()?;
                break;
            }
            thread::sleep(PLAYING_LOOK);
        }
        if let Some(writer) = self.writer.take() {
            let _ = writer.join();
        }
        Ok(())
    }
}

impl Drop for Playing {
    fn drop(&mut self) {
        if self.writer.is_none() {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }
}

pub fn wav(rate: u32, pcm: &[u8]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(44 + pcm.len());
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + pcm.len() as u32).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&rate.to_le_bytes());
    bytes.extend_from_slice(&(rate * 2).to_le_bytes());
    bytes.extend_from_slice(&2u16.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&(pcm.len() as u32).to_le_bytes());
    bytes.extend_from_slice(pcm);
    bytes
}

pub fn samples_wav(samples: &[i16]) -> Vec<u8> {
    let pcm: Vec<u8> = samples
        .iter()
        .flat_map(|sample| sample.to_le_bytes())
        .collect();
    wav(SAMPLE_RATE, &pcm)
}

pub fn parse_wav(bytes: &[u8]) -> Option<Clip> {
    if bytes.len() < 12 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return None;
    }
    let mut at = 12;
    let mut rate = None;
    while at + 8 <= bytes.len() {
        let name = &bytes[at..at + 4];
        let size = u32::from_le_bytes(bytes[at + 4..at + 8].try_into().ok()?) as usize;
        let body = at + 8;
        match name {
            b"fmt " => {
                let format = bytes.get(body..body + 16)?;
                let channels = u16::from_le_bytes([format[2], format[3]]);
                let bits = u16::from_le_bytes([format[14], format[15]]);
                if channels != 1 || bits != 16 {
                    return None;
                }
                rate = Some(u32::from_le_bytes(format[4..8].try_into().ok()?));
            }
            b"data" => {
                let end = body.saturating_add(size).min(bytes.len());
                let mut pcm = bytes[body..end].to_vec();
                pcm.truncate(pcm.len() & !1);
                return Some(Clip { rate: rate?, pcm });
            }
            _ => {}
        }
        at = body.checked_add(size)?.checked_add(size & 1)?;
    }
    None
}

pub fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut text = String::with_capacity(bytes.len().div_ceil(3) * 4);
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

#[cfg(test)]
pub(crate) struct Loudness;

#[cfg(test)]
impl SpeechDetector for Loudness {
    fn probability(&mut self, frame: &[i16]) -> f32 {
        if plain_level(frame) > 500.0 { 1.0 } else { 0.0 }
    }

    fn reset(&mut self) {}
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::silero::{Silero, hearing_clip};

    fn loud() -> Vec<i16> {
        (0..FRAME)
            .map(|index| {
                let at = index as f32 / SAMPLE_RATE as f32;
                (4000.0 * (std::f32::consts::TAU * 1000.0 * at).sin()) as i16
            })
            .collect()
    }

    fn quiet() -> Vec<i16> {
        vec![10; FRAME]
    }

    fn spoken(count: usize) -> impl Iterator<Item = Vec<i16>> {
        const SYLLABLES: [f32; 5] = [1.0, 0.7, 0.35, 0.9, 0.3];
        (0..count).map(|index| {
            let strength = SYLLABLES[index % SYLLABLES.len()];
            loud()
                .into_iter()
                .map(|sample| (f32::from(sample) * strength) as i16)
                .collect()
        })
    }

    struct Listened {
        heard: Vec<Heard>,
        ended_at: Option<usize>,
        gate: Gate,
    }

    fn listen(detector: Box<dyn SpeechDetector>, frames: impl IntoIterator<Item = Vec<i16>>) -> Listened {
        let mut gate = Gate::new(detector);
        let mut heard = Vec::new();
        let mut ended_at = None;
        for (number, frame) in frames.into_iter().enumerate() {
            if let Some(event) = gate.push(frame) {
                heard.push(event);
                if matches!(event, Heard::Ended(_)) {
                    ended_at = Some(number);
                    break;
                }
            }
        }
        Listened {
            heard,
            ended_at,
            gate,
        }
    }

    fn run(frames: impl IntoIterator<Item = Vec<i16>>) -> (Vec<Heard>, Gate) {
        let listened = listen(Box::new(Loudness), frames);
        (listened.heard, listened.gate)
    }

    fn heard_by_the_model(frames: impl IntoIterator<Item = Vec<i16>>) -> Listened {
        listen(Box::new(Silero::new()), frames)
    }

    fn settled() -> impl Iterator<Item = Vec<i16>> {
        std::iter::repeat_n(quiet(), SETTLE_FRAMES)
    }

    fn framed(samples: &[i16]) -> Vec<Vec<i16>> {
        samples.chunks(FRAME).map(<[i16]>::to_vec).collect()
    }

    fn voice(name: &str, percent: i32) -> Vec<i16> {
        hearing_clip(name)
            .iter()
            .map(|sample| (i32::from(*sample) * percent / 100) as i16)
            .collect()
    }

    fn first_voiced_frame(samples: &[i16]) -> usize {
        let levels: Vec<f32> = samples.chunks(FRAME).map(plain_level).collect();
        let loudest = levels.iter().copied().fold(0.0, f32::max);
        levels
            .iter()
            .position(|level| *level > loudest * 0.05)
            .unwrap_or(0)
    }

    fn hiss(count: usize, level: f32) -> Vec<Vec<i16>> {
        let mut state = 0x2545_f491_4f6c_dd1du64;
        let samples: Vec<i16> = (0..count * FRAME)
            .map(|_| {
                state ^= state << 13;
                state ^= state >> 7;
                state ^= state << 17;
                let unit = (state >> 40) as f32 / (1u64 << 24) as f32 * 2.0 - 1.0;
                (unit * level * 3f32.sqrt()) as i16
            })
            .collect();
        framed(&samples)
    }

    fn thud(frames: usize, hertz: f32, peak: f32, decay: f32) -> Vec<Vec<i16>> {
        let samples: Vec<i16> = (0..frames * FRAME)
            .map(|index| {
                let at = index as f32 / SAMPLE_RATE as f32;
                (peak * (-at / decay).exp() * (std::f32::consts::TAU * hertz * at).sin()) as i16
            })
            .collect();
        framed(&samples)
    }

    fn mixed(under: &mut [Vec<i16>], from: usize, over: &[i16]) {
        for (frame, part) in under[from..].iter_mut().zip(over.chunks(FRAME)) {
            for (sample, add) in frame.iter_mut().zip(part) {
                *sample = sample.saturating_add(*add);
            }
        }
    }

    fn one_whole_turn(frames: Vec<Vec<i16>>, voice_from: usize, voice_to: usize) {
        let listened = heard_by_the_model(frames);
        assert_eq!(
            listened.heard,
            vec![Heard::Settled, Heard::Ended(End::Pause)]
        );
        let ended = listened.ended_at.unwrap();
        let kept = listened.gate.utterance().len() / FRAME;
        assert!(ended + 1 - kept <= voice_from, "kept from {} voice from {voice_from}", ended + 1 - kept);
        assert!(ended >= voice_to, "ended {ended} voice to {voice_to}");
    }

    #[test]
    fn listening_starts_only_once_the_floor_has_settled() {
        let (heard, _) = run(std::iter::repeat_n(quiet(), SETTLE_FRAMES - 1));
        assert!(heard.is_empty());
        let (heard, _) = run(settled());
        assert_eq!(heard, vec![Heard::Settled]);
    }

    #[test]
    fn a_long_pause_after_speech_ends_the_utterance() {
        let speech = settled()
            .chain(spoken(20))
            .chain(std::iter::repeat_n(quiet(), PAUSE_FRAMES));
        let (heard, gate) = run(speech);
        assert_eq!(heard, vec![Heard::Settled, Heard::Ended(End::Pause)]);
        assert_eq!(gate.utterance().len(), (20 + PAUSE_FRAMES) * FRAME);
    }

    #[test]
    fn a_pause_just_under_the_end_of_turn_silence_does_not_end_it() {
        let words = settled()
            .chain(spoken(20))
            .chain(std::iter::repeat_n(quiet(), PAUSE_FRAMES - 1))
            .chain(spoken(20));
        assert_eq!(run(words).0, vec![Heard::Settled]);
    }

    #[test]
    fn the_room_is_quiet_only_after_the_end_of_turn_silence_since_any_sound() {
        let (_, gate) = run(settled());
        assert!(gate.quiet());
        let (_, gate) = run(settled().chain(std::iter::repeat_n(loud(), 3)));
        assert!(!gate.quiet());
        let (_, gate) = run(settled()
            .chain(std::iter::repeat_n(loud(), 3))
            .chain(std::iter::repeat_n(quiet(), PAUSE_FRAMES - 1)));
        assert!(!gate.quiet());
        let (_, gate) = run(settled()
            .chain(std::iter::repeat_n(loud(), 3))
            .chain(std::iter::repeat_n(quiet(), PAUSE_FRAMES)));
        assert!(gate.quiet());
    }

    #[test]
    fn a_silent_room_keeps_listening_and_keeps_only_the_lead_in() {
        let (heard, gate) = run(settled().chain(std::iter::repeat_n(quiet(), 5000)));
        assert_eq!(heard, vec![Heard::Settled]);
        assert_eq!(gate.utterance().len(), LEAD_FRAMES * FRAME);
    }

    #[test]
    fn speech_keeps_the_lead_in_before_its_onset() {
        let speech = settled()
            .chain(std::iter::repeat_n(quiet(), 200))
            .chain(spoken(20))
            .chain(std::iter::repeat_n(quiet(), PAUSE_FRAMES));
        let (_, gate) = run(speech);
        let kept = gate.utterance();
        let lead = LEAD_FRAMES + 1 - ONSET_FRAMES;
        assert_eq!(kept.len(), (lead + 20 + PAUSE_FRAMES) * FRAME);
        assert!(
            kept[..(lead - 1) * FRAME]
                .iter()
                .all(|sample| *sample == 10)
        );
    }

    #[test]
    fn speech_without_a_long_pause_stops_at_the_cap() {
        let talk = (0..CAP_FRAMES / 23 + 1)
            .flat_map(|_| spoken(20).chain(std::iter::repeat_n(quiet(), 3)));
        let (heard, _) = run(settled().chain(talk));
        assert_eq!(heard, vec![Heard::Settled, Heard::Ended(End::Cap)]);
    }

    #[test]
    fn a_new_gate_starts_its_detector_from_silence() {
        struct Remembers(bool);
        impl SpeechDetector for Remembers {
            fn probability(&mut self, _: &[i16]) -> f32 {
                if self.0 { 1.0 } else { 0.0 }
            }
            fn reset(&mut self) {
                self.0 = false;
            }
        }
        let listened = listen(Box::new(Remembers(true)), settled().chain(std::iter::repeat_n(quiet(), 100)));
        assert_eq!(listened.heard, vec![Heard::Settled]);
        assert!(!listened.gate.speaking());
    }

    #[test]
    fn a_quiet_voice_at_six_hundredths_of_its_level_is_one_whole_turn_with_its_first_word() {
        for name in ["question-02", "command-21", "command-28"] {
            let clip = voice(name, 6);
            let mut frames: Vec<Vec<i16>> = settled().chain(std::iter::repeat_n(quiet(), 50)).collect();
            let from = frames.len();
            frames.extend(framed(&clip));
            let to = frames.len();
            frames.extend(std::iter::repeat_n(quiet(), PAUSE_FRAMES + 25));
            one_whole_turn(frames, from + first_voiced_frame(&clip), to);
        }
    }

    #[test]
    fn a_pause_of_one_point_four_seconds_mid_request_keeps_the_turn() {
        for percent in [100, 6] {
            let first = voice("command-21", percent);
            let second = voice("question-02", percent);
            let mut frames: Vec<Vec<i16>> = settled().chain(std::iter::repeat_n(quiet(), 50)).collect();
            let from = frames.len();
            frames.extend(framed(&first));
            frames.extend(std::iter::repeat_n(quiet(), 70));
            frames.extend(framed(&second));
            let to = frames.len();
            frames.extend(std::iter::repeat_n(quiet(), PAUSE_FRAMES + 25));
            one_whole_turn(frames, from + first_voiced_frame(&first), to);
        }
    }

    #[test]
    fn a_thump_as_the_microphone_opens_is_not_speech() {
        let mut opening = thud(10, 120.0, 8000.0, 0.03);
        opening.extend(std::iter::repeat_n(quiet(), SETTLE_FRAMES + 300));
        let listened = heard_by_the_model(opening);
        assert_eq!(listened.heard, vec![Heard::Settled]);
    }

    #[test]
    fn short_clicks_while_listening_are_not_speech() {
        let mut frames: Vec<Vec<i16>> = settled().collect();
        for _ in 0..40 {
            frames.extend(thud(2, 2500.0, 6000.0, 0.006));
            frames.extend(std::iter::repeat_n(quiet(), 8));
        }
        frames.extend(std::iter::repeat_n(quiet(), PAUSE_FRAMES * 2));
        let listened = heard_by_the_model(frames);
        assert_eq!(listened.heard, vec![Heard::Settled]);
        assert!(listened.gate.quiet());
    }

    #[test]
    fn a_sound_that_switches_on_and_stays_is_not_a_turn() {
        let mut frames = hiss(200, 100.0);
        frames.extend(hiss(400, 400.0));
        let listened = heard_by_the_model(frames);
        assert_eq!(listened.heard, vec![Heard::Settled]);
        assert!(!listened.gate.speaking());
    }

    #[test]
    fn speech_as_a_fan_switches_on_is_still_a_turn() {
        let clip = voice("question-04", 15);
        let mut frames = hiss(200, 100.0);
        frames.extend(hiss(300, 400.0));
        mixed(&mut frames, 190, &clip);
        one_whole_turn(frames, 190 + first_voiced_frame(&clip), 190 + clip.len() / FRAME);
    }

    #[test]
    fn a_steady_loud_hiss_is_never_speech() {
        let listened = heard_by_the_model(hiss(750, 1500.0));
        assert_eq!(listened.heard, vec![Heard::Settled]);
    }

    #[test]
    fn a_low_thud_like_a_distant_door_is_not_speech() {
        let mut frames: Vec<Vec<i16>> = settled().collect();
        for _ in 0..6 {
            frames.extend(thud(60, 70.0, 3000.0, 0.12));
            frames.extend(std::iter::repeat_n(quiet(), PAUSE_FRAMES));
        }
        let listened = heard_by_the_model(frames);
        assert_eq!(listened.heard, vec![Heard::Settled]);
        assert!(listened.gate.quiet());
    }

    #[test]
    fn a_quiet_voice_over_a_steady_hiss_is_still_heard() {
        let clip = voice("command-25", 15);
        let mut frames = hiss(400, 400.0);
        mixed(&mut frames, 100, &clip);
        one_whole_turn(frames, 100 + first_voiced_frame(&clip), 100 + clip.len() / FRAME);
    }

    #[test]
    fn a_steady_hum_is_not_speech() {
        let hum = vec![150i16; FRAME];
        let listened = heard_by_the_model(std::iter::repeat_n(hum, 600));
        assert_eq!(listened.heard, vec![Heard::Settled]);
    }

    #[test]
    fn a_wave_file_round_trips_its_rate_and_samples() {
        let pcm = vec![1, 0, 2, 0, 255, 127];
        let clip = parse_wav(&wav(24_000, &pcm)).unwrap();
        assert_eq!((clip.rate, clip.pcm), (24_000, pcm));
    }

    #[test]
    fn a_streaming_wave_header_with_an_unknown_length_reads_to_the_end() {
        let mut bytes = wav(24_000, &[1, 0, 2, 0]);
        bytes[40..44].copy_from_slice(&u32::MAX.to_le_bytes());
        let clip = parse_wav(&bytes).unwrap();
        assert_eq!(clip.pcm, vec![1, 0, 2, 0]);
    }

    #[test]
    fn stereo_or_non_wave_bytes_are_refused() {
        let mut bytes = wav(24_000, &[0, 0]);
        bytes[22] = 2;
        assert!(parse_wav(&bytes).is_none());
        assert!(parse_wav(b"nope").is_none());
    }

    #[test]
    fn base64_matches_the_standard_vectors() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }
}
