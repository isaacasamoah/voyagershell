use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};

pub(crate) const FRAME_LIMIT: usize = 128 * 1024;

#[derive(Deserialize, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub(crate) enum Signal {
    Hello { protocol: u32, build_commit: String },
    Ready {},
    InitializeRuntime {},
    RuntimeReady {},
    StartTransport {},
    Offer { sdp: String },
    ApplyAnswer { sdp: String },
    TransportReady {},
    TransportTimedOut {},
    OpenDevices { selection: Selection },
    DevicesOpened {},
    SetAudioControls { controls: Controls },
    AudioControlsApplied {},
    InspectAudio {},
    AudioState { state: Peaks },
    Close {},
    Closed {},
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Selection {
    pub microphone: Option<String>,
    pub speaker: Option<String>,
    pub channel: Option<Vec<std::num::NonZeroU16>>,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Controls {
    pub microphone_muted: bool,
    pub speaker_suppressed: bool,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Peaks {
    pub microphone_peak: u16,
    pub speaker_peak: u16,
}

pub(crate) fn read(reader: &mut impl Read) -> io::Result<Option<Signal>> {
    let mut header = [0; 4];
    match reader.read_exact(&mut header[..1]) {
        Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        result => result?,
    }
    reader.read_exact(&mut header[1..])?;
    let length = u32::from_be_bytes(header) as usize;
    if length > FRAME_LIMIT {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Voice control frame exceeds 128 KiB",
        ));
    }
    let mut payload = vec![0; length];
    reader.read_exact(&mut payload)?;
    let signal: Signal = serde_json::from_slice(&payload)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "Invalid voice control frame"))?;
    match &signal {
        Signal::Offer { sdp } | Signal::ApplyAnswer { sdp }
            if sdp.is_empty() || sdp.len() > 64 * 1024 =>
        {
            Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Invalid voice description length",
            ))
        }
        _ => Ok(Some(signal)),
    }
}

pub(crate) fn write(writer: &mut impl Write, signal: &Signal) -> io::Result<()> {
    if matches!(signal, Signal::Offer { sdp } | Signal::ApplyAnswer { sdp } if sdp.is_empty() || sdp.len() > 64 * 1024)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Invalid voice description length",
        ));
    }
    let payload = serde_json::to_vec(signal)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "Invalid voice control frame"))?;
    if payload.len() > FRAME_LIMIT {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Voice control frame exceeds 128 KiB",
        ));
    }
    writer.write_all(&(payload.len() as u32).to_be_bytes())?;
    writer.write_all(&payload)?;
    writer.flush()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_voice_framing_is_big_endian_bounded_and_redacts_decode_errors() {
        let mut frame = Vec::new();
        write(&mut frame, &Signal::Ready {}).unwrap();
        assert_eq!(&frame[..4], &[0, 0, 0, 16]);
        assert!(matches!(
            read(&mut frame.as_slice()).unwrap(),
            Some(Signal::Ready {})
        ));
        let oversize = ((FRAME_LIMIT + 1) as u32).to_be_bytes();
        assert_eq!(
            read(&mut oversize.as_slice()).err().unwrap().kind(),
            io::ErrorKind::InvalidData
        );
        assert_eq!(
            read(&mut &[0, 0, 0][..]).err().unwrap().kind(),
            io::ErrorKind::UnexpectedEof
        );
        let mut malformed = Vec::new();
        malformed.extend(12u32.to_be_bytes());
        malformed.extend(b"private-data");
        assert!(
            !read(&mut malformed.as_slice())
                .err()
                .unwrap()
                .to_string()
                .contains("private-data")
        );
        assert!(read(&mut &[][..]).unwrap().is_none());
    }

    #[test]
    fn outgoing_descriptions_are_checked_before_the_pipe_is_touched() {
        for sdp in [String::new(), "x".repeat(64 * 1024 + 1)] {
            let mut target = Vec::new();
            let result = write(&mut target, &Signal::ApplyAnswer { sdp });
            assert_eq!(result.err().unwrap().kind(), io::ErrorKind::InvalidInput);
            assert!(target.is_empty());
        }
    }
}
