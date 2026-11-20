use super::{Cases, Verdict, cases};
use crate::agent::TYPED_REPLY;
use crate::audio::speech::{DOCK_ON_THIS_FLEET, RENAME_TO_HARBOR};
use crate::audio::voice::{self, LISTENING, READY, median, words_contain, words_match};
use crate::inspection::Target;
use crate::native::{ENGINE_START, Native, QUIET_MIC};
use crate::system::until;
use anyhow::{Context as _, Result};
use serde_json::json;

cases! {
    EngineReady => "engine-ready" setup,
    NoCaptureWithoutClick => "no-capture-without-click",
    VoyagerIsBound => "voyager-is-bound" setup,
    RenameIsHeard => "rename-is-heard-and-acknowledged",
    WordsReachVoyager => "words-reach-voyager",
    ReplyIsSpoken => "reply-is-spoken",
    TypedReplyIsSilent => "typed-reply-is-silent",
    AcknowledgementIsPrompt => "acknowledgement-is-prompt",
}

pub const CONTROL: Case = Case::NoCaptureWithoutClick;

const TARGET_MS: i64 = 300;
const RUNS: usize = 10;
const SPOKEN_AS: &str = "Docked on this fleet. The rest is in the chat.";
const OTHER: &str = "Opened the roadmap on the right.";

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
    let Some(voyager) = cases.make(native, Case::VoyagerIsBound, |native| {
        let terminal = until("the app to bind the Voyager it started", || {
            let bound = std::fs::read_to_string(native.profile_path("voyager.json")).ok();
            let named = bound
                .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
                .and_then(|value| value["terminal"].as_str().map(str::to_owned));
            let live = named.filter(|terminal| {
                native
                    .system
                    .watch("terminal.get", json!({"terminal":terminal}))
                    .is_ok_and(|found| found["state"] == "live")
            });
            Ok(live)
        })?;
        let verdict = Verdict::new()
            .expect(
                "the app bound a live Voyager at launch",
                !terminal.is_empty(),
            )
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
        let screen = voice::terminal_text(native, &voyager)?;
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
                "Voyager received the spoken marker and the words exactly",
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
    let Some(said) = cases.make(native, Case::ReplyIsSpoken, |native| {
        let said = voice::converse(native, &DOCK_ON_THIS_FLEET, "reply")?;
        let judged = voice::judge_reply(native, "reply", SPOKEN_AS, OTHER)?;
        let verdict = Verdict::new()
            .expect(
                "the first paragraph of the spoken turn's final message is spoken, cut to the limit",
                said.spoken_texts.iter().any(|text| text == SPOKEN_AS),
            )
            .expect(
                "the engine hears the spoken reply as the expected sentence",
                words_contain(&judged.transcript, SPOKEN_AS),
            )
            .expect(
                "the engine does not hear another sentence in it",
                !words_contain(&judged.transcript, OTHER),
            )
            .expect(
                "the reply is spoken after the words were sent",
                said.sent && said.speech_after_capture_ms.is_some(),
            )
            .observed("conversation", json!(said))?
            .observed("judgement", json!(judged))?;
        Ok((verdict, Some(said)))
    })?
    else {
        return Ok(());
    };
    cases.check(native, Case::TypedReplyIsSilent, |_| {
        Verdict::new()
            .expect(
                "the typed turn that came first was never spoken",
                said.spoken_texts
                    .iter()
                    .all(|text| !text.contains(TYPED_REPLY)),
            )
            .expect(
                "exactly one reply was spoken for the one spoken prompt",
                said.spoken_texts.len() == 1,
            )
            .observed("spokenTexts", &said.spoken_texts)
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
