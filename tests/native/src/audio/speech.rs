use anyhow::{Context, Result, bail, ensure};
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

pub const ALL: [&Speech; 4] = [
    &OPEN_THE_ROADMAP,
    &RENAME_THE_FLEET,
    &RENAME_TO_HARBOR,
    &DOCK_ON_THIS_FLEET,
];

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
    fn other_formats_are_refused() {
        let mut wav = OPEN_THE_ROADMAP.wav.to_vec();
        wav[24..28].copy_from_slice(&16_000u32.to_le_bytes());
        assert!(Samples::decode(&wav).is_err());
    }
}
