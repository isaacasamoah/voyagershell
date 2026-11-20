use super::adopt_by_label::address;
use super::{Cases, Verdict, cases};
use crate::audio::speech::{DOCK_ON_THIS_FLEET, RENAME_TO_HARBOR};
use crate::audio::voice::{self, LISTENING, READY, median, words_match};
use crate::inspection::Target;
use crate::native::{ENGINE_START, Native, QUIET_MIC, Terminal};
use crate::x11::Key;
use anyhow::{Context as _, Result};
use serde_json::json;

cases! {
    EngineReady => "engine-ready" setup,
    NoCaptureWithoutClick => "no-capture-without-click",
    VoyagerStandsIn => "voyager-stands-in" setup,
    RenameIsHeard => "rename-is-heard-and-acknowledged",
    WordsReachVoyager => "words-reach-voyager",
    AcknowledgementIsPrompt => "acknowledgement-is-prompt",
}

pub const CONTROL: Case = Case::NoCaptureWithoutClick;

const TARGET_MS: i64 = 300;
const RUNS: usize = 10;
const STAND_IN: &str = "voyager-standin";

fn spoken(words: &str) -> String {
    format!("[spoken] {words}")
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    anyhow::ensure!(
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
    let Some(standin) = cases.make(native, Case::VoyagerStandsIn, |native| {
        let shell = Terminal::first(native)?;
        shell.focus(native)?;
        shell.echoed(native, &format!("hc run --bg --name {STAND_IN} cat"))?;
        native.press(Key::Return)?;
        let terminal = address(native, STAND_IN)?;
        native.edit_profile_file(
            "voyager.json",
            json!({ "terminal": terminal }).to_string().as_bytes(),
        )?;
        let verdict = Verdict::new()
            .expect("a stand-in Voyager runs under Core", !terminal.is_empty())
            .observed("terminal", &terminal)?;
        Ok((verdict, Some(terminal)))
    })?
    else {
        return Ok(());
    };
    cases.check(native, Case::RenameIsHeard, |native| {
        let said = voice::converse(native, &RENAME_TO_HARBOR, "rename")?;
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
                "the acknowledgement for a Voyager that is running plays at the speaker",
                said.spoken.matches()
                    && said
                        .acknowledgement
                        .as_deref()
                        .is_some_and(|key| key.contains("asking")),
            )
            .expect(
                "the acknowledgement starts before hearing ends",
                said.started_before_heard,
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
    cases.check(native, Case::WordsReachVoyager, |native| {
        let said = voice::converse(native, &DOCK_ON_THIS_FLEET, "dock")?;
        let words = said
            .heard
            .clone()
            .context("The app recorded no heard words")?;
        let screen = voice::terminal_text(native, &standin)?;
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
            .expect("the app reports that it sent the words", said.sent)
            .expect(
                "the stand-in Voyager received the spoken marker and the words exactly",
                screen.contains(&spoken(DOCK_ON_THIS_FLEET.words)),
            )
            .expect("the control is ready for another click", label != LISTENING)
            .expect(
                "no audio reached any log or the engine's terminal",
                text["found"].as_array().is_some_and(Vec::is_empty),
            )
            .observed("conversation", json!(said))?
            .observed("standInScreen", screen)?
            .observed("textScan", text)
    })?;
    cases.check(native, Case::AcknowledgementIsPrompt, |native| {
        let mut first_sounds = Vec::new();
        let mut early = 0;
        let mut heard_right = 0;
        for run in 0..RUNS {
            let said = voice::converse(native, &DOCK_ON_THIS_FLEET, &format!("prompt-{run}"))?;
            first_sounds.push(said.first_sound_after_capture_ms);
            early += usize::from(said.started_before_heard);
            heard_right += usize::from(
                said.heard
                    .as_deref()
                    .is_some_and(|words| words_match(words, DOCK_ON_THIS_FLEET.words)),
            );
            native.drawn_label(
                &Target::VOICE_CONTROL,
                "the voice control ready for the next click",
                |label| label == READY,
            )?;
        }
        let middle = median(&first_sounds);
        Verdict::new()
            .expect(
                "the acknowledgement starts before hearing ends in every run",
                early == RUNS,
            )
            .expect("every run is heard as spoken", heard_right == RUNS)
            .expect(
                "the median first sound after capture ends is under the target",
                middle.is_some_and(|middle| middle < TARGET_MS),
            )
            .observed("firstSoundAfterCaptureMs", &first_sounds)?
            .observed("medianMs", middle)?
            .observed("targetMs", TARGET_MS)
    })
}
