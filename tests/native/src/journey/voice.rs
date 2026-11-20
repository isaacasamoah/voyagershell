use super::{Cases, Verdict, cases};
use crate::audio::speech::{DOCK_ON_THIS_FLEET, RENAME_TO_HARBOR};
use crate::audio::voice::{self, LISTENING, READY, words_match};
use crate::inspection::Target;
use crate::native::{ENGINE_START, Native, QUIET_MIC};
use anyhow::{Context as _, Result, ensure};
use serde_json::json;

cases! {
    EngineReady => "engine-ready" setup,
    NoCaptureWithoutClick => "no-capture-without-click",
    RenameIsHeard => "rename-is-heard-and-acknowledged",
    DockIsHeard => "dock-is-heard-as-written",
}

pub const CONTROL: Case = Case::NoCaptureWithoutClick;

const ACKNOWLEDGEMENT_BAR_MS: i64 = 1000;
const NOT_RUNNING: &str = "not-running";

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    ensure!(
        native.audio.is_some() && native.voice_engine.is_some(),
        "The voice journey needs --audio on and --voice-engine"
    );
    cases.check(native, Case::EngineReady, |native| {
        let label = native.drawn_label_past(
            &Target::VOICE_CONTROL,
            ENGINE_START,
            "the voice control ready after the engine loads",
            |label| label == READY,
        )?;
        let memory = voice::memory();
        Verdict::new()
            .expect("the voice control reads Start voice", label == READY)
            .expect(
                "the engine program runs and holds memory while idle",
                memory.engine_mb.is_some(),
            )
            .observed("label", label)?
            .observed("idleMemory", memory)
    })?;
    cases.check(native, Case::NoCaptureWithoutClick, |native| {
        let seen = voice::without_capture(native, QUIET_MIC)?;
        let ever = seen.iter().any(|recorders| !recorders.is_empty());
        Verdict::new()
            .expect(
                "no program records the microphone while nobody clicks",
                !seen.is_empty() && !ever,
            )
            .observed("looks", seen.len())
    })?;
    cases.check(native, Case::RenameIsHeard, |native| {
        let said = voice::converse(native, &RENAME_TO_HARBOR, NOT_RUNNING, "rename")?;
        let words = said
            .heard
            .clone()
            .context("The app recorded no heard words")?;
        let events: Vec<&str> = said.marks.iter().map(|mark| mark.event.as_str()).collect();
        Verdict::new()
            .expect(
                "the words come back as spoken",
                words_match(&words, RENAME_TO_HARBOR.words),
            )
            .expect(
                "the acknowledgement for a Voyager that is not running plays at the speaker",
                said.spoken.matches(),
            )
            .expect(
                "the acknowledgement starts within the bar after the end of the utterance",
                said.onset_after_end_ms <= ACKNOWLEDGEMENT_BAR_MS,
            )
            .expect(
                "the microphone closes after the utterance",
                said.microphone_closed,
            )
            .expect(
                "the app opened the microphone after the click and no earlier",
                events.first() == Some(&"click") && events.contains(&"capture-open"),
            )
            .observed("conversation", json!(said))
    })?;
    cases.check(native, Case::DockIsHeard, |native| {
        let said = voice::converse(native, &DOCK_ON_THIS_FLEET, NOT_RUNNING, "dock")?;
        let words = said
            .heard
            .clone()
            .context("The app recorded no heard words")?;
        let label = native.drawn_label(
            &Target::VOICE_CONTROL,
            "the voice control ready again",
            |label| label == READY,
        )?;
        let text = voice::audio_in_text(native)?;
        Verdict::new()
            .expect(
                "dock comes back as spoken",
                words_match(&words, DOCK_ON_THIS_FLEET.words),
            )
            .expect("the control is ready for another click", label != LISTENING)
            .expect(
                "no audio reached any log or the engine's terminal",
                text["found"].as_array().is_some_and(Vec::is_empty),
            )
            .observed("conversation", json!(said))?
            .observed("textScan", text)
    })
}
