use super::speech::{RATE, Samples};
use serde::Serialize;

const FRAME: usize = (RATE as usize) / 50;
const HOP: usize = FRAME / 2;
const BANDS: [f64; 8] = [200.0, 400.0, 800.0, 1200.0, 1800.0, 2600.0, 3600.0, 5000.0];
const FLOOR: f64 = 1e-8;

pub const MATCH: f64 = 0.8;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Score {
    pub similarity: f64,
    pub lag_ms: u64,
    pub peak: i16,
}

impl Score {
    pub fn matches(&self) -> bool {
        self.similarity >= MATCH
    }
}

pub fn score(reference: &Samples, capture: &Samples) -> Score {
    let wanted = features(reference);
    let heard = features(capture);
    let mut best = (0.0, 0);
    if !wanted.is_empty() && heard.len() >= wanted.len() {
        for lag in 0..=(heard.len() - wanted.len()) {
            let similarity = correlation(&wanted, &heard[lag..lag + wanted.len()]);
            if similarity > best.0 {
                best = (similarity, lag);
            }
        }
    }
    Score {
        similarity: best.0,
        lag_ms: (best.1 * HOP * 1000 / RATE as usize) as u64,
        peak: capture.peak(),
    }
}

fn features(samples: &Samples) -> Vec<[f64; BANDS.len()]> {
    if samples.0.len() < FRAME {
        return Vec::new();
    }
    let floats: Vec<f64> = samples.0.iter().map(|s| f64::from(*s) / 32768.0).collect();
    (0..=(floats.len() - FRAME) / HOP)
        .map(|index| {
            let frame = &floats[index * HOP..index * HOP + FRAME];
            BANDS.map(|frequency| (goertzel(frame, frequency) + FLOOR).ln())
        })
        .collect()
}

fn goertzel(frame: &[f64], frequency: f64) -> f64 {
    let coefficient = 2.0 * (2.0 * std::f64::consts::PI * frequency / f64::from(RATE)).cos();
    let (mut previous, mut before) = (0.0, 0.0);
    for sample in frame {
        let current = sample + coefficient * previous - before;
        before = previous;
        previous = current;
    }
    let power = previous * previous + before * before - coefficient * previous * before;
    power / (frame.len() * frame.len()) as f64
}

fn correlation(left: &[[f64; BANDS.len()]], right: &[[f64; BANDS.len()]]) -> f64 {
    let count = (left.len() * BANDS.len()) as f64;
    let mean = |frames: &[[f64; BANDS.len()]]| frames.iter().flatten().sum::<f64>() / count;
    let (left_mean, right_mean) = (mean(left), mean(right));
    let (mut both, mut left_spread, mut right_spread) = (0.0, 0.0, 0.0);
    for (a, b) in left.iter().flatten().zip(right.iter().flatten()) {
        let (a, b) = (a - left_mean, b - right_mean);
        both += a * b;
        left_spread += a * a;
        right_spread += b * b;
    }
    let spread = (left_spread * right_spread).sqrt();
    if spread < 1e-9 { 0.0 } else { both / spread }
}

#[cfg(test)]
mod tests {
    use super::super::speech::{OPEN_THE_ROADMAP, RENAME_THE_FLEET};
    use super::*;
    use anyhow::Result;

    fn padded(speech: &Samples, before: usize, after: usize, gain: f64) -> Samples {
        let mut samples = vec![0i16; before];
        samples.extend(speech.0.iter().map(|s| (f64::from(*s) * gain) as i16));
        samples.extend(vec![0i16; after]);
        Samples(samples)
    }

    fn noisy(samples: &Samples, amplitude: i16) -> Samples {
        let mut state = 0x2545_f491_u32;
        Samples(
            samples
                .0
                .iter()
                .map(|s| {
                    state ^= state << 13;
                    state ^= state >> 17;
                    state ^= state << 5;
                    s.saturating_add((state % (2 * amplitude as u32 + 1)) as i16 - amplitude)
                })
                .collect(),
        )
    }

    #[test]
    fn the_same_speech_matches_wherever_it_sits_and_however_loud() -> Result<()> {
        let wanted = OPEN_THE_ROADMAP.samples()?;
        for (before, gain) in [(0, 1.0), (24_000, 1.0), (96_000, 0.3)] {
            let score = score(&wanted, &padded(&wanted, before, 48_000, gain));
            assert!(score.matches(), "{score:?}");
            assert!(score.similarity > 0.95, "{score:?}");
            assert!(score.lag_ms.abs_diff(before as u64 / 48) <= 10, "{score:?}");
        }
        Ok(())
    }

    #[test]
    fn the_same_speech_matches_through_background_noise() -> Result<()> {
        let wanted = OPEN_THE_ROADMAP.samples()?;
        let heard = noisy(&padded(&wanted, 12_000, 24_000, 1.0), 40);
        assert!(score(&wanted, &heard).matches());
        Ok(())
    }

    #[test]
    fn other_speech_and_silence_do_not_match() -> Result<()> {
        let wanted = OPEN_THE_ROADMAP.samples()?;
        let other = RENAME_THE_FLEET.samples()?;
        let confusing = score(&wanted, &padded(&other, 12_000, 12_000, 1.0));
        assert!(!confusing.matches(), "{confusing:?}");
        let quiet = score(&wanted, &Samples(vec![0; 240_000]));
        assert!(!quiet.matches(), "{quiet:?}");
        let hiss = score(&wanted, &noisy(&Samples(vec![0; 240_000]), 40));
        assert!(!hiss.matches(), "{hiss:?}");
        Ok(())
    }

    #[test]
    fn a_capture_shorter_than_the_speech_does_not_match() -> Result<()> {
        let wanted = OPEN_THE_ROADMAP.samples()?;
        let cut = Samples(wanted.0[..wanted.0.len() / 2].to_vec());
        assert!(!score(&wanted, &cut).matches());
        assert!(!score(&wanted, &Samples::default()).matches());
        Ok(())
    }
}
