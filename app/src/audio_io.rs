use crate::speech::{Clip, SAMPLE_RATE};
use std::{
    collections::VecDeque,
    io::{self, Read, Write},
    process::{Child, ChildStdin, Command, Stdio},
    thread::{self, JoinHandle},
};

pub const FRAME: usize = 320;
const PAUSE_FRAMES: usize = 30;
const CAP_FRAMES: usize = 1500;
const WAIT_FRAMES: usize = 400;
const MIN_SPEECH_FRAMES: usize = 5;
const FLOOR_FRAMES: usize = 100;
const MIN_THRESHOLD: f32 = 200.0;
const MAX_THRESHOLD: f32 = 600.0;
const FLOOR_FACTOR: f32 = 3.0;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum End {
    Pause,
    Cap,
    NothingSaid,
}

#[derive(Debug, Default)]
pub struct Gate {
    floors: VecDeque<f32>,
    frames: usize,
    speech: usize,
    quiet: usize,
}

impl Gate {
    pub fn push(&mut self, frame: &[i16]) -> Option<End> {
        let level = rms(frame);
        self.floors.push_back(level);
        if self.floors.len() > FLOOR_FRAMES {
            self.floors.pop_front();
        }
        let floor = self.floors.iter().copied().fold(f32::MAX, f32::min);
        let threshold = (floor * FLOOR_FACTOR).clamp(MIN_THRESHOLD, MAX_THRESHOLD);
        self.frames += 1;
        if level > threshold {
            self.speech += 1;
            self.quiet = 0;
        } else if self.speech > 0 {
            self.quiet += 1;
        }
        if self.speech >= MIN_SPEECH_FRAMES && self.quiet >= PAUSE_FRAMES {
            Some(End::Pause)
        } else if self.frames >= CAP_FRAMES {
            Some(End::Cap)
        } else if self.speech < MIN_SPEECH_FRAMES && self.frames >= WAIT_FRAMES {
            Some(End::NothingSaid)
        } else {
            None
        }
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

    pub fn finish(mut self) -> io::Result<()> {
        self.input = None;
        if let Some(writer) = self.writer.take() {
            let _ = writer.join();
        }
        self.child.wait().map(|_| ())
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

    fn run(frames: impl IntoIterator<Item = Vec<i16>>) -> Option<End> {
        let mut gate = Gate::default();
        frames.into_iter().find_map(|frame| gate.push(&frame))
    }

    #[test]
    fn a_pause_after_speech_ends_the_utterance() {
        let speech = std::iter::repeat_n(loud(), 20);
        let pause = std::iter::repeat_n(quiet(), 40);
        assert_eq!(run(speech.chain(pause)), Some(End::Pause));
    }

    #[test]
    fn a_short_gap_inside_speech_does_not_end_it() {
        let words = std::iter::repeat_n(loud(), 10)
            .chain(std::iter::repeat_n(quiet(), 20))
            .chain(std::iter::repeat_n(loud(), 10));
        assert_eq!(run(words), None);
    }

    #[test]
    fn a_room_with_no_speech_gives_up_instead_of_listening_forever() {
        assert_eq!(
            run(std::iter::repeat_n(quiet(), 500)),
            Some(End::NothingSaid)
        );
    }

    #[test]
    fn unbroken_speech_stops_at_the_cap() {
        assert_eq!(run(std::iter::repeat_n(loud(), 1600)), Some(End::Cap));
    }

    #[test]
    fn a_steady_hum_is_not_speech() {
        let hum = vec![150i16; FRAME];
        assert_eq!(run(std::iter::repeat_n(hum, 500)), Some(End::NothingSaid));
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
