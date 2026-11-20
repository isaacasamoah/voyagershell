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
const ONSET_FRAMES: usize = 10;
const PAUSE_FRAMES: usize = 75;
const CAP_FRAMES: usize = 1500;
const LEAD_FRAMES: usize = 50;
const FLOOR_FRAMES: usize = 100;
const MIN_THRESHOLD: f32 = 200.0;
const MAX_THRESHOLD: f32 = 600.0;
const FLOOR_FACTOR: f32 = 3.0;
const PLAYING_LOOK: Duration = Duration::from_millis(20);

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

#[derive(Debug)]
pub struct Gate {
    floors: VecDeque<f32>,
    stage: Stage,
    kept: VecDeque<Vec<i16>>,
    since_sound: usize,
}

impl Default for Gate {
    fn default() -> Self {
        Self {
            floors: VecDeque::new(),
            stage: Stage::Settling { seen: 0 },
            kept: VecDeque::new(),
            since_sound: PAUSE_FRAMES,
        }
    }
}

impl Gate {
    pub fn push(&mut self, frame: Vec<i16>) -> Option<Heard> {
        let level = rms(&frame);
        self.floors.push_back(level);
        if self.floors.len() > FLOOR_FRAMES {
            self.floors.pop_front();
        }
        let floor = self.floors.iter().copied().fold(f32::MAX, f32::min);
        let threshold = (floor * FLOOR_FACTOR).clamp(MIN_THRESHOLD, MAX_THRESHOLD);
        let loud = level > threshold;
        if !matches!(self.stage, Stage::Settling { .. }) {
            self.since_sound = if loud { 0 } else { self.since_sound + 1 };
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
                *run = if loud { *run + 1 } else { 0 };
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
                *quiet = if loud { 0 } else { *quiet + 1 };
                let ended = if *quiet >= PAUSE_FRAMES {
                    Some(Heard::Ended(End::Pause))
                } else if *frames >= CAP_FRAMES {
                    Some(Heard::Ended(End::Cap))
                } else {
                    None
                };
                self.kept.push_back(frame);
                ended
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

fn rms(frame: &[i16]) -> f32 {
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
mod tests {
    use super::*;

    fn loud() -> Vec<i16> {
        (0..FRAME)
            .map(|index| if index % 2 == 0 { 4000 } else { -4000 })
            .collect()
    }

    fn quiet() -> Vec<i16> {
        vec![10; FRAME]
    }

    fn run(frames: impl IntoIterator<Item = Vec<i16>>) -> (Vec<Heard>, Gate) {
        let mut gate = Gate::default();
        let mut heard = Vec::new();
        for frame in frames {
            if let Some(event) = gate.push(frame) {
                heard.push(event);
                if matches!(event, Heard::Ended(_)) {
                    break;
                }
            }
        }
        (heard, gate)
    }

    fn settled() -> impl Iterator<Item = Vec<i16>> {
        std::iter::repeat_n(quiet(), SETTLE_FRAMES)
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
            .chain(std::iter::repeat_n(loud(), 20))
            .chain(std::iter::repeat_n(quiet(), PAUSE_FRAMES));
        let (heard, gate) = run(speech);
        assert_eq!(heard, vec![Heard::Settled, Heard::Ended(End::Pause)]);
        assert_eq!(gate.utterance().len(), (20 + PAUSE_FRAMES) * FRAME);
    }

    #[test]
    fn a_pause_just_under_the_end_of_turn_silence_does_not_end_it() {
        let words = settled()
            .chain(std::iter::repeat_n(loud(), 20))
            .chain(std::iter::repeat_n(quiet(), PAUSE_FRAMES - 1))
            .chain(std::iter::repeat_n(loud(), 20));
        assert_eq!(run(words).0, vec![Heard::Settled]);
    }

    #[test]
    fn a_thump_as_the_microphone_opens_is_not_speech() {
        let opening =
            std::iter::repeat_n(loud(), 5).chain(std::iter::repeat_n(quiet(), SETTLE_FRAMES + 600));
        assert_eq!(run(opening).0, vec![Heard::Settled]);
    }

    #[test]
    fn short_clicks_while_listening_are_not_speech() {
        let mut frames: Vec<Vec<i16>> = settled().collect();
        for _ in 0..20 {
            frames.extend(std::iter::repeat_n(loud(), ONSET_FRAMES - 1));
            frames.extend(std::iter::repeat_n(quiet(), 3));
        }
        frames.extend(std::iter::repeat_n(quiet(), PAUSE_FRAMES * 2));
        let (heard, gate) = run(frames);
        assert_eq!(heard, vec![Heard::Settled]);
        assert!(gate.quiet());
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
            .chain(std::iter::repeat_n(loud(), 20))
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
    fn unbroken_speech_stops_at_the_cap() {
        let (heard, _) = run(settled().chain(std::iter::repeat_n(loud(), CAP_FRAMES)));
        assert_eq!(heard, vec![Heard::Settled, Heard::Ended(End::Cap)]);
    }

    #[test]
    fn a_steady_hum_is_not_speech() {
        let hum = vec![150i16; FRAME];
        let (heard, _) = run(std::iter::repeat_n(hum, 2000));
        assert_eq!(heard, vec![Heard::Settled]);
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
