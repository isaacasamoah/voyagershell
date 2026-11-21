use super::speech::{RATE, RENAME_TO_HARBOR, Samples, Speech};
use anyhow::Result;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::f64::consts::TAU;

pub const ROOM_SECONDS: u32 = 300;
const SEED: u64 = 0x5eed_2026_1121;
const TONE_RMS: f64 = 60.0;
const SOFT_FAN_RMS: f64 = 250.0;
const LOUD_FAN_RMS: f64 = 700.0;
const FAN_HZ: f64 = 100.0;
const FAN_SWAY_HZ: f64 = 0.3;
const FAN_SWAY: f64 = 0.15;
const KEY_PEAK: f64 = 6000.0;
const KEY_DECAY_S: f64 = 0.006;
const DOOR_PEAK: f64 = 3000.0;
const DOOR_HZ: f64 = 70.0;
const DOOR_DECAY_S: f64 = 0.12;
const TAIL_GAIN: f64 = 0.05;
const TAIL_SECONDS: f64 = 0.5;
const TAIL_FEEDBACK: f64 = 0.6;
const TAIL_DELAYS_MS: [f64; 4] = [29.7, 37.1, 41.1, 43.7];
const FIRST_EVENT_S: f64 = 5.0;
const LAST_EVENT_BEFORE_END_S: f64 = 10.0;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Sound {
    Typing,
    Door,
    ReplyTail,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub sound: Sound,
    pub at_ms: u64,
}

pub struct Room {
    pub samples: Samples,
    pub events: Vec<Event>,
    pub loud_fan_from_ms: u64,
}

impl Room {
    pub fn sha256(&self) -> String {
        format!("{:x}", Sha256::digest(self.samples.encode()))
    }
}

struct Noise(u64);

impl Noise {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^ (z >> 31)
    }

    fn unit(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64
    }

    fn between(&mut self, low: f64, high: f64) -> f64 {
        low + (high - low) * self.unit()
    }

    fn white(&mut self) -> f64 {
        let radius = (-2.0 * (1.0 - self.unit()).ln()).sqrt();
        radius * (TAU * self.unit()).cos()
    }

    fn pink(&mut self, count: usize, rms: f64) -> Vec<f64> {
        let (mut b0, mut b1, mut b2) = (0.0, 0.0, 0.0);
        let raw: Vec<f64> = (0..count)
            .map(|_| {
                let white = self.white();
                b0 = 0.99765 * b0 + white * 0.099_046;
                b1 = 0.963 * b1 + white * 0.296_516_4;
                b2 = 0.57 * b2 + white * 1.052_691_3;
                b0 + b1 + b2 + white * 0.1848
            })
            .collect();
        scaled(raw, rms)
    }

    fn click(&mut self, peak: f64) -> Vec<f64> {
        (0..seconds(0.03))
            .map(|index| self.white() * peak * (-at(index) / KEY_DECAY_S).exp())
            .collect()
    }
}

fn seconds(span: f64) -> usize {
    (span * f64::from(RATE)) as usize
}

fn at(index: usize) -> f64 {
    index as f64 / f64::from(RATE)
}

fn scaled(raw: Vec<f64>, rms: f64) -> Vec<f64> {
    let power = raw.iter().map(|value| value * value).sum::<f64>() / raw.len().max(1) as f64;
    let gain = if power > 0.0 { rms / power.sqrt() } else { 0.0 };
    raw.into_iter().map(|value| value * gain).collect()
}

fn add(into: &mut [f64], from: usize, sound: &[f64]) {
    for (slot, value) in into.iter_mut().skip(from).zip(sound) {
        *slot += value;
    }
}

fn fan(noise: &mut Noise, count: usize, rms: f64) -> Vec<f64> {
    let broadband = noise.pink(count, 1.0);
    let raw = broadband
        .into_iter()
        .enumerate()
        .map(|(index, hiss)| {
            let time = at(index);
            let hum: f64 = (1..=4)
                .map(|harmonic| {
                    let harmonic = f64::from(harmonic);
                    (TAU * FAN_HZ * harmonic * time + harmonic).sin() / harmonic
                })
                .sum();
            let sway = 1.0 + FAN_SWAY * (TAU * FAN_SWAY_HZ * time).sin();
            (0.5 * hum + 0.85 * hiss) * sway
        })
        .collect();
    scaled(raw, rms)
}

fn typing(noise: &mut Noise, span: f64) -> Vec<f64> {
    let mut sound = vec![0.0; seconds(span)];
    let mut key = 0.0;
    while key < span - 0.2 {
        let strength = noise.between(0.6, 1.0);
        let press = noise.click(KEY_PEAK * strength);
        add(&mut sound, seconds(key), &press);
        let release = noise.click(KEY_PEAK * 0.4);
        add(
            &mut sound,
            seconds(key + noise.between(0.06, 0.11)),
            &release,
        );
        key += noise.between(0.09, 0.3);
    }
    sound
}

fn door(noise: &mut Noise) -> Vec<f64> {
    let count = seconds(1.2);
    let rumble = noise.pink(count, 1.0);
    let mut sound: Vec<f64> = rumble
        .into_iter()
        .enumerate()
        .map(|(index, rumble)| {
            let time = at(index);
            let thud = (TAU * DOOR_HZ * time).sin() * (-time / DOOR_DECAY_S).exp();
            let hiss = rumble * (-time / 0.18).exp() * 0.25;
            (thud + hiss) * DOOR_PEAK
        })
        .collect();
    let latch = noise.click(DOOR_PEAK * 0.8);
    add(&mut sound, seconds(0.15), &latch);
    sound
}

fn reply_tail(reply: &[i16]) -> Vec<f64> {
    let last: Vec<f64> = reply[reply.len().saturating_sub(seconds(TAIL_SECONDS))..]
        .iter()
        .map(|sample| f64::from(*sample) * TAIL_GAIN)
        .collect();
    let count = last.len() + seconds(0.8);
    let delays: Vec<usize> = TAIL_DELAYS_MS
        .iter()
        .map(|ms| seconds(ms / 1000.0))
        .collect();
    let mut combs: Vec<Vec<f64>> = delays.iter().map(|delay| vec![0.0; *delay]).collect();
    (0..count)
        .map(|index| {
            let dry = last.get(index).copied().unwrap_or(0.0);
            let wet: f64 = combs
                .iter_mut()
                .zip(&delays)
                .map(|(line, delay)| {
                    let slot = index % delay;
                    let out = line[slot];
                    line[slot] = dry + out * TAIL_FEEDBACK;
                    out
                })
                .sum();
            dry * 0.3 + wet * 0.25
        })
        .collect()
}

fn to_samples(mix: &[f64]) -> Samples {
    Samples(
        mix.iter()
            .map(|value| value.round().clamp(-32768.0, 32767.0) as i16)
            .collect(),
    )
}

pub fn room(span_seconds: u32) -> Result<Room> {
    let mut noise = Noise(SEED);
    let count = seconds(f64::from(span_seconds));
    let half = count / 2;
    let mut mix = noise.pink(count, TONE_RMS);
    add(&mut mix, 0, &fan(&mut noise, half, SOFT_FAN_RMS));
    add(&mut mix, half, &fan(&mut noise, count - half, LOUD_FAN_RMS));
    let reply = RENAME_TO_HARBOR.samples()?.0;
    let kinds = [Sound::Typing, Sound::Door, Sound::ReplyTail];
    let mut events = Vec::new();
    let mut next = FIRST_EVENT_S;
    while next < f64::from(span_seconds) - LAST_EVENT_BEFORE_END_S {
        let sound = kinds[events.len() % kinds.len()];
        let made = match sound {
            Sound::Typing => {
                let span = noise.between(3.0, 8.0);
                typing(&mut noise, span)
            }
            Sound::Door => door(&mut noise),
            Sound::ReplyTail => reply_tail(&reply),
        };
        add(&mut mix, seconds(next), &made);
        events.push(Event {
            sound,
            at_ms: (next * 1000.0) as u64,
        });
        next += noise.between(8.0, 16.0);
    }
    Ok(Room {
        samples: to_samples(&mix),
        events,
        loud_fan_from_ms: u64::from(span_seconds) * 500,
    })
}

pub fn request_in_room(
    speech: &Speech,
    before_seconds: u32,
    after_seconds: u32,
) -> Result<Samples> {
    let mut noise = Noise(SEED ^ 0x0071_0e57);
    let words = speech.samples()?.0;
    let from = seconds(f64::from(before_seconds));
    let count = from + words.len() + seconds(f64::from(after_seconds));
    let mut mix = noise.pink(count, TONE_RMS);
    add(&mut mix, 0, &fan(&mut noise, count, SOFT_FAN_RMS));
    let keys = typing(&mut noise, f64::from(before_seconds) - 1.0);
    add(&mut mix, 0, &keys);
    let spoken: Vec<f64> = words.iter().map(|sample| f64::from(*sample)).collect();
    add(&mut mix, from, &spoken);
    Ok(to_samples(&mix))
}

pub fn quiet_request(speech: &Speech, gain: f64, around_seconds: u32) -> Result<Samples> {
    let mut noise = Noise(SEED ^ 0x0000_9e17);
    let words = speech.samples()?.0;
    let from = seconds(f64::from(around_seconds));
    let mut mix = noise.pink(from * 2 + words.len(), TONE_RMS);
    let spoken: Vec<f64> = words
        .iter()
        .map(|sample| f64::from(*sample) * gain)
        .collect();
    add(&mut mix, from, &spoken);
    Ok(to_samples(&mix))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame_rms(samples: &[i16]) -> Vec<f64> {
        samples
            .chunks(seconds(0.02))
            .map(|frame| {
                let sum: f64 = frame.iter().map(|value| f64::from(*value).powi(2)).sum();
                (sum / frame.len() as f64).sqrt()
            })
            .collect()
    }

    #[test]
    fn the_room_lasts_five_minutes_and_holds_every_kind_of_sound() -> Result<()> {
        let made = room(ROOM_SECONDS)?;
        assert_eq!(made.samples.0.len(), seconds(f64::from(ROOM_SECONDS)));
        for sound in [Sound::Typing, Sound::Door, Sound::ReplyTail] {
            assert!(
                made.events
                    .iter()
                    .filter(|event| event.sound == sound)
                    .count()
                    >= 5,
                "{sound:?}"
            );
        }
        Ok(())
    }

    #[test]
    fn the_same_seed_makes_the_same_room() -> Result<()> {
        assert_eq!(room(20)?.samples.0, room(20)?.samples.0);
        Ok(())
    }

    #[test]
    fn the_loud_fan_is_louder_than_the_soft_fan_and_quieter_than_speech() -> Result<()> {
        let made = room(40)?;
        let levels = frame_rms(&made.samples.0);
        let quietest = |range: &[f64]| range.iter().copied().fold(f64::MAX, f64::min);
        let soft = quietest(&levels[..levels.len() / 2]);
        let loud = quietest(&levels[levels.len() / 2..]);
        assert!(soft > TONE_RMS && soft < SOFT_FAN_RMS * 1.5, "{soft}");
        assert!(
            loud > SOFT_FAN_RMS * 1.5 && loud < LOUD_FAN_RMS * 1.5,
            "{loud}"
        );
        Ok(())
    }

    #[test]
    fn a_request_in_the_room_is_louder_than_the_room_around_it() -> Result<()> {
        let mixed = request_in_room(&RENAME_TO_HARBOR, 6, 3)?;
        let levels = frame_rms(&mixed.0);
        let room_peak = levels[..250].iter().copied().fold(0.0, f64::max);
        let speech_peak = levels[300..400].iter().copied().fold(0.0, f64::max);
        assert!(speech_peak > room_peak, "{speech_peak} {room_peak}");
        Ok(())
    }
}
