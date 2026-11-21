use anyhow::{Context, Result, bail, ensure};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

pub const RATE: u32 = 48_000;

pub struct Speech {
    pub name: &'static str,
    pub words: &'static str,
    pub sha256: &'static str,
    wav: &'static [u8],
}

pub const OPEN_THE_ROADMAP: Speech = Speech {
    name: "open-the-roadmap",
    words: "Open the roadmap.",
    sha256: "417c0358c6f0c92b4c252c36ef9730e339c3beac62486f27e8684d7fb75fe513",
    wav: include_bytes!("../../fixtures/speech/open-the-roadmap.wav"),
};

pub const RENAME_THE_FLEET: Speech = Speech {
    name: "rename-the-fleet",
    words: "Rename this fleet to review.",
    sha256: "33f1cf21ed5ce58c41d829101ba00d57f5fb7ef52b040faa0469f9692a5f7401",
    wav: include_bytes!("../../fixtures/speech/rename-the-fleet.wav"),
};

pub const RENAME_TO_HARBOR: Speech = Speech {
    name: "rename-this-fleet-to-harbor",
    words: "Rename this fleet to Harbor.",
    sha256: "68f7dcf80ef247d50953d6372f558fc0d736671228ea21d504f0c7a4e28717c2",
    wav: include_bytes!("../../fixtures/speech/rename-this-fleet-to-harbor.wav"),
};

pub const DOCK_ON_THIS_FLEET: Speech = Speech {
    name: "dock-on-this-fleet",
    words: "Dock on this fleet.",
    sha256: "7b278b6405cbf419de2027bfecfd5712baaaa57113ae6795faef11b299b5a1cc",
    wav: include_bytes!("../../fixtures/speech/dock-on-this-fleet.wav"),
};

pub const OPEN_THEN_DOCK: Speech = Speech {
    name: "open-the-roadmap-then-dock",
    words: "Open the roadmap, and then, when that is done, dock on this fleet.",
    sha256: "9acce6649d82fbc2b7de7c308563cb2fbbe3e7a96e5364e4a0a3477abb35b6fd",
    wav: include_bytes!("../../fixtures/speech/open-the-roadmap-then-dock.wav"),
};

pub const ALL: [&Speech; 5] = [
    &OPEN_THE_ROADMAP,
    &RENAME_THE_FLEET,
    &RENAME_TO_HARBOR,
    &DOCK_ON_THIS_FLEET,
    &OPEN_THEN_DOCK,
];

const REQUESTS_TABLE: &str = include_str!("../../fixtures/hearing/hearing.tsv");
const REQUESTS_PCM: &[u8] = include_bytes!("../../fixtures/hearing/hearing.s16");
const REQUESTS_SHA256: &str = "6e6ed751c6f762bb5fff4a12ffec4d2d1711c4bc37702d2919a2b5f728a444b6";
const REQUESTS_RATE: u32 = 16_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Question,
    Command,
}

pub struct Request {
    pub name: String,
    pub kind: Kind,
    pub words: String,
    pub samples: Samples,
}

pub fn requests() -> Result<Vec<Request>> {
    requests_from(REQUESTS_TABLE, REQUESTS_PCM)
}

fn requests_from(table: &str, pcm: &[u8]) -> Result<Vec<Request>> {
    let found = format!(
        "{:x}",
        Sha256::new()
            .chain_update(table.as_bytes())
            .chain_update(pcm)
            .finalize()
    );
    ensure!(
        found == REQUESTS_SHA256,
        "The spoken requests are not the synthetic set that was committed: {found}"
    );
    let mut at = 0;
    let mut requests = Vec::new();
    for line in table.lines() {
        let [name, kind, samples, words] = line.splitn(4, '\t').collect::<Vec<_>>()[..] else {
            bail!("A spoken request line has the wrong fields: {line}");
        };
        let kind = match kind {
            "question" => Kind::Question,
            "command" => Kind::Command,
            _ => bail!("A spoken request has an unknown kind: {kind}"),
        };
        let end = at + samples.parse::<usize>()? * 2;
        let narrow = Samples::raw(pcm.get(at..end).context("The spoken requests are cut short")?);
        requests.push(Request {
            name: name.to_owned(),
            kind,
            words: words.to_owned(),
            samples: narrow.widened(),
        });
        at = end;
    }
    ensure!(at == pcm.len(), "The spoken requests have samples left over");
    Ok(requests)
}

pub const PAUSED_WORDS: &str = "Open the roadmap. Dock on this fleet.";
const PAUSE_INSERTED_MS: u32 = 810;
const QUIET_LEVEL: f64 = 200.0;
const THUMP_HZ: f64 = 120.0;
const THUMP_PEAK: f64 = 8000.0;
const THUMP_DECAY_S: f64 = 0.03;
const THUMP_MS: u32 = 200;

impl Speech {
    pub fn verify(&self) -> Result<()> {
        let found = format!("{:x}", Sha256::digest(self.wav));
        ensure!(
            found == self.sha256,
            "The speech fixture {} is not the synthetic recording that was committed: {found}",
            self.name
        );
        Ok(())
    }

    pub fn samples(&self) -> Result<Samples> {
        self.verify()?;
        Samples::decode(self.wav)
    }

    pub fn place(&self, folder: &Path) -> Result<PathBuf> {
        self.verify()?;
        let path = folder.join(format!("{}.wav", self.name));
        fs::write(&path, self.wav)?;
        Ok(path)
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Samples(pub Vec<i16>);

impl Samples {
    pub fn raw(bytes: &[u8]) -> Self {
        Self(
            bytes
                .as_chunks::<2>()
                .0
                .iter()
                .map(|pair| i16::from_le_bytes(*pair))
                .collect(),
        )
    }

    pub fn decode(wav: &[u8]) -> Result<Self> {
        ensure!(
            wav.len() >= 12 && &wav[..4] == b"RIFF" && &wav[8..12] == b"WAVE",
            "Not a WAVE file"
        );
        let mut at = 12;
        let mut format_checked = false;
        while at + 8 <= wav.len() {
            let name = &wav[at..at + 4];
            let size = u32::from_le_bytes(wav[at + 4..at + 8].try_into()?) as usize;
            let body = wav
                .get(at + 8..at + 8 + size.min(wav.len() - at - 8))
                .context("Truncated WAVE chunk")?;
            match name {
                b"fmt " => {
                    ensure!(body.len() >= 16, "Short WAVE format chunk");
                    let field = |from: usize| u16::from_le_bytes([body[from], body[from + 1]]);
                    let rate = u32::from_le_bytes(body[4..8].try_into()?);
                    ensure!(
                        field(0) == 1 && field(2) == 1 && field(14) == 16 && rate == RATE,
                        "Speech must be 48 kHz mono 16-bit PCM"
                    );
                    format_checked = true;
                }
                b"data" => {
                    ensure!(format_checked, "WAVE data before its format");
                    return Ok(Self::raw(body));
                }
                _ => {}
            }
            at += 8 + size + (size & 1);
        }
        bail!("WAVE file has no data chunk")
    }

    pub fn encode(&self) -> Vec<u8> {
        let data = u32::try_from(self.0.len() * 2).unwrap_or(u32::MAX);
        let mut wav = Vec::with_capacity(44 + self.0.len() * 2);
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&RATE.to_le_bytes());
        wav.extend_from_slice(&(RATE * 2).to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data.to_le_bytes());
        for sample in &self.0 {
            wav.extend_from_slice(&sample.to_le_bytes());
        }
        wav
    }

    pub fn silence(millis: u32) -> Self {
        Self(vec![0; (RATE / 1000 * millis) as usize])
    }

    pub fn thump() -> Self {
        let count = RATE / 1000 * THUMP_MS;
        Self(
            (0..count)
                .map(|index| {
                    let at = f64::from(index) / f64::from(RATE);
                    let level = THUMP_PEAK * (-at / THUMP_DECAY_S).exp();
                    (level * (std::f64::consts::TAU * THUMP_HZ * at).sin()) as i16
                })
                .collect(),
        )
    }

    pub fn then(mut self, next: &Samples) -> Self {
        self.0.extend_from_slice(&next.0);
        self
    }

    pub fn paused_request() -> Result<Self> {
        Ok(OPEN_THE_ROADMAP
            .samples()?
            .then(&Self::silence(PAUSE_INSERTED_MS))
            .then(&DOCK_ON_THIS_FLEET.samples()?))
    }

    pub fn longest_inner_quiet_ms(&self) -> u32 {
        let frame = (RATE / 50) as usize;
        let loud: Vec<bool> = self
            .0
            .chunks(frame)
            .map(|chunk| {
                let sum: f64 = chunk.iter().map(|s| f64::from(*s).powi(2)).sum();
                (sum / chunk.len() as f64).sqrt() > QUIET_LEVEL
            })
            .collect();
        let first = loud.iter().position(|loud| *loud).unwrap_or(0);
        let last = loud.iter().rposition(|loud| *loud).unwrap_or(0);
        let longest = loud
            .get(first..=last)
            .unwrap_or_default()
            .split(|loud| *loud)
            .map(<[bool]>::len)
            .max()
            .unwrap_or(0);
        u32::try_from(longest * 20).unwrap_or(u32::MAX)
    }

    fn widened(&self) -> Self {
        let step = (RATE / REQUESTS_RATE) as i32;
        let mut wide = Vec::with_capacity(self.0.len() * step as usize);
        for (index, sample) in self.0.iter().enumerate() {
            let from = i32::from(*sample);
            let to = i32::from(self.0.get(index + 1).copied().unwrap_or(*sample));
            for part in 0..step {
                wide.push((from + (to - from) * part / step) as i16);
            }
        }
        Self(wide)
    }

    pub fn peak(&self) -> i16 {
        self.0
            .iter()
            .map(|sample| sample.saturating_abs())
            .max()
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn committed_speech_is_the_recorded_synthetic_speech() -> Result<()> {
        for speech in ALL {
            speech.verify()?;
            let samples = speech.samples()?;
            assert!(samples.0.len() > RATE as usize, "{}", speech.name);
            assert!(samples.peak() > 4000, "{}", speech.name);
        }
        Ok(())
    }

    #[test]
    fn the_spoken_requests_are_twenty_questions_and_twenty_commands_at_the_feed_rate() -> Result<()> {
        let requests = requests()?;
        let count = |kind| requests.iter().filter(|request| request.kind == kind).count();
        assert_eq!((count(Kind::Question), count(Kind::Command)), (20, 20));
        for request in &requests {
            assert!(request.samples.0.len() > RATE as usize, "{}", request.name);
            assert!(request.samples.peak() > 4000, "{}", request.name);
        }
        Ok(())
    }

    #[test]
    fn a_changed_spoken_request_is_refused() {
        let mut pcm = REQUESTS_PCM.to_vec();
        pcm[1000] ^= 1;
        assert!(requests_from(REQUESTS_TABLE, &pcm).is_err());
        let table = REQUESTS_TABLE.replacen("fleet", "fleat", 1);
        assert!(requests_from(&table, REQUESTS_PCM).is_err());
    }

    #[test]
    fn a_changed_recording_is_refused() {
        let altered = Speech {
            name: "altered",
            words: "",
            sha256: OPEN_THE_ROADMAP.sha256,
            wav: RENAME_THE_FLEET.wav,
        };
        assert!(altered.verify().is_err());
    }

    #[test]
    fn encoding_round_trips() -> Result<()> {
        let samples = OPEN_THE_ROADMAP.samples()?;
        assert_eq!(Samples::decode(&samples.encode())?, samples);
        Ok(())
    }

    #[test]
    fn the_paused_request_pauses_just_under_the_end_of_turn_silence() -> Result<()> {
        let pause = Samples::paused_request()?.longest_inner_quiet_ms();
        assert!((1300..1450).contains(&pause), "{pause} ms");
        assert!(OPEN_THEN_DOCK.samples()?.longest_inner_quiet_ms() < 600);
        Ok(())
    }

    #[test]
    fn the_thump_is_loud_for_about_a_tenth_of_a_second_and_then_silent() {
        let frame = (RATE / 50) as usize;
        let loud: Vec<bool> = Samples::thump()
            .0
            .chunks(frame)
            .map(|chunk| {
                let sum: f64 = chunk.iter().map(|s| f64::from(*s).powi(2)).sum();
                (sum / chunk.len() as f64).sqrt() > 200.0
            })
            .collect();
        assert_eq!(
            loud,
            [
                true, true, true, true, true, false, false, false, false, false
            ]
        );
    }

    #[test]
    fn other_formats_are_refused() {
        let mut wav = OPEN_THE_ROADMAP.wav.to_vec();
        wav[24..28].copy_from_slice(&16_000u32.to_le_bytes());
        assert!(Samples::decode(&wav).is_err());
    }
}
