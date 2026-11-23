use super::{Cases, Verdict, cases};
use crate::agent::{REPLY_MARKER, TYPED_REPLY};
use crate::audio::room;
use crate::audio::speech::{
    self as speech, DOCK_ON_THIS_FLEET, HELLO_HOW_ARE_YOU, HEY_IM_HERE, Kind, OPEN_THE_ROADMAP,
    OPEN_THEN_DOCK, PAUSED_WORDS, RENAME_THE_FLEET, RENAME_TO_HARBOR, Samples,
};
use crate::audio::voice::{
    self, CONNECTING, LISTENING, READY, Turn, median, word_errors, words_contain, words_match,
};
use crate::inspection::Target;
use crate::native::{ENGINE_START, LONG_SILENCE, Native, QUIET_MIC};
use crate::system::until;
use anyhow::{Context as _, Result};
use serde_json::json;
use voyager_contract::inspection::Role;

cases! {
    EngineReady => "engine-ready" setup,
    NoCaptureWithoutClick => "no-capture-without-click",
    VoyagerIsBound => "voyager-is-bound" setup,
    SmallTalkIsAnswered => "small-talk-is-answered-by-the-voice",
    RequestGetsNoChatReply => "request-gets-no-chat-reply",
    OfferGoesToVoyager => "small-talk-that-draws-an-offer-goes-to-voyager",
    TurnWaitsForTheSentence => "turn-waits-for-the-sentence",
    StartThumpIsNotSpeech => "start-thump-is-not-speech",
    ConnectingThenListening => "connecting-then-listening",
    SilenceKeepsVoiceOn => "silence-keeps-voice-on",
    ClickTurnsVoiceOff => "click-turns-voice-off",
    RoomSoundIsNeverATurn => "room-sound-is-never-a-turn",
    RequestInRoomSoundIsSent => "request-in-room-sound-is-sent",
    QuietVoiceIsATurn => "quiet-voice-is-a-turn",
    RenameIsHeard => "rename-is-heard-and-acknowledged",
    WordsReachVoyager => "words-reach-voyager",
    ReplyIsSpoken => "reply-is-spoken",
    TypedReplyIsSilent => "typed-reply-is-silent",
    LongReplyIsClear => "long-reply-is-clear",
    LongSentenceSplitsAtAComma => "long-sentence-splits-at-a-comma",
    LongSentenceIsCutAtTheLimit => "long-sentence-is-cut-at-the-limit",
    NumbersAreSpokenAsWords => "numbers-are-spoken-as-words",
    LongReplyWaitsOnlyForRendering => "long-reply-waits-only-for-rendering",
    TwoTurnsWithEcho => "two-turns-with-echo",
    ClickOffLetsTheReplyFinish => "click-off-lets-the-reply-finish",
    ClickOffKeepsTheMicrophoneClosed => "click-off-keeps-the-microphone-closed",
    AcknowledgementIsPrompt => "acknowledgement-is-prompt",
    RefusalIsInTheChat => "refusal-is-in-the-chat",
    RequestsAreWrittenDown => "requests-are-written-down",
}

pub const CONTROL: Case = Case::NoCaptureWithoutClick;

const TARGET_MS: i64 = 300;
const RUNS: usize = 10;
const SPOKEN_AS: &str = "Docked on this fleet. The Fleet was already open.";
const OTHER: &str = "Opened the roadmap on the right.";
const REMOVED: &[u8] = br#"{"terminal":"t-removed-9999"}"#;
const REFUSED: &str = "Not sent";
const LONG_SPOKEN: &str = "Here's where things stand. The canvas change is merged, and the build passed on the second try. The voice work is split into three pieces, and the first one is in review, the second is being tested right now, and the third is waiting for a build slot that should free up soon. The run changed one thousand two hundred lines in four minutes, about fifty percent faster than yesterday, and memory peaked at six point five gigabytes. Two tests were slow on the last run but they passed in the end so I left them alone and nothing about them needs you to do anything at all today. Want me to walk through any of it?";
const LONG_START: &str = "Here's where things stand.";
const LONG_ERROR_PERCENT: usize = 10;
const PAUSE_FLOOR_MS: u64 = 150;
const OWN_PAUSE_MS: u64 = 700;
const PIECE_WORDS: usize = 25;
const COMMA_PIECES: [&str; 2] = [
    "The voice work is split into three pieces, and the first one is in review, the second is being tested right now,",
    "and the third is waiting for a build slot that should free up soon.",
];
const LIMIT_PIECES: [&str; 2] = [
    "Two tests were slow on the last run but they passed in the end so I left them alone and nothing about them needs you",
    "to do anything at all today.",
];
const NUMBERS_SPOKEN: &str = "The run changed one thousand two hundred lines in four minutes, about fifty percent faster than yesterday, and memory peaked at six point five gigabytes.";
const CUT_AT_LIMIT: &str =
    "A spoken sentence had no comma within the piece limit, so it was cut at the limit.";
const ROOM_SILENCE_MS: u32 = 3000;
const WORD_ERROR_PERCENT: usize = 5;
const ROOM_BEFORE_REQUEST_S: u32 = 8;
const ROOM_AFTER_REQUEST_S: u32 = 4;
const QUIET_VOICE_AROUND_S: u32 = 3;
const QUIET_VOICES: [(f64, room::Bed); 4] = [
    (0.15, room::Bed::Tone),
    (0.06, room::Bed::Tone),
    (0.15, room::Bed::SoftFan),
    (0.15, room::Bed::LoudFan),
];

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct QuietTurn {
    gain: f64,
    bed: room::Bed,
    turns: usize,
    sent: usize,
    waited_ms: u64,
    heard: String,
    word_errors: usize,
    words: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Written {
    name: String,
    kind: Kind,
    spoken: String,
    heard: Vec<String>,
    errors: usize,
    words: usize,
}

impl Written {
    fn answered(&self) -> bool {
        self.heard.len() != 1 || self.errors * 2 > self.words
    }
}

fn most_words_heard(heard: &str, said: &str) -> bool {
    let plain = |text: &str| -> Vec<String> {
        text.split(|c: char| !c.is_alphanumeric() && c != '\'')
            .filter(|word| !word.is_empty())
            .map(str::to_lowercase)
            .collect()
    };
    let heard = plain(heard);
    let said = plain(said);
    let found = said.iter().filter(|word| heard.contains(word)).count();
    !said.is_empty() && found * 2 >= said.len()
}

fn spoken(words: &str) -> String {
    format!("[spoken] {words}")
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let driven = drive_cases(native, cases);
    let kept = voice::keep_engine_log(native);
    driven.and(kept)
}

fn drive_cases(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
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
    cases.check(native, Case::SmallTalkIsAnswered, |native| {
        let replanted = voice::planted_hum_rendered_again(native)?;
        if !(replanted.replaced && replanted.all_kept) {
            return Verdict::new()
                .expect(
                    "the run-on Mm-hm planted in the clip cache is rendered again before the first turn",
                    replanted.replaced,
                )
                .expect(
                    "the app marks every clip kept before the first turn",
                    replanted.all_kept,
                )
                .observed("plantedHum", replanted);
        }
        let said = voice::converse(native, &HELLO_HOW_ARE_YOU, "small-talk")?;
        let reply = said.chat.clone().unwrap_or_default();
        let transcript = voice::transcribe(native, "small-talk")?;
        let screen = voice::terminal_text(native, &voyager)?;
        Verdict::new()
            .expect("the voice answers the small talk itself", !reply.is_empty())
            .expect(
                "nothing reaches Voyager",
                !said.sent && !screen.contains(&spoken(HELLO_HOW_ARE_YOU.words)),
            )
            .expect(
                "a soft Mm-hm plays first while the engine decides, and reaches the speaker",
                said.hummed && said.spoken.matches(),
            )
            .expect(
                "the speaker carries most of the reply's words",
                most_words_heard(&transcript, &reply),
            )
            .observed(
                "firstSoundAfterCaptureMs",
                said.first_sound_after_capture_ms,
            )?
            .observed("conversation", json!(said))?
            .observed("plantedHum", replanted)?
            .observed("speakerHeard", transcript)
    })?;
    cases.check(native, Case::RequestGetsNoChatReply, |native| {
        let said = voice::converse(native, &RENAME_TO_HARBOR, "no-chat-reply")?;
        let chatted = said.marks.iter().any(|mark| mark.event == "chat-started");
        Verdict::new()
            .expect(
                "the request plays the asking clip at the speaker",
                said.spoken.matches()
                    && matches!(
                        said.acknowledgement.as_deref(),
                        Some("asking" | "okay-asking")
                    ),
            )
            .expect(
                "the voice gives no chat reply",
                said.chat.is_none() && !chatted,
            )
            .expect("the words are sent to Voyager", said.sent)
            .observed("hummed", said.hummed)?
            .observed("conversation", json!(said))
    })?;
    cases.check(native, Case::OfferGoesToVoyager, |native| {
        let said = voice::converse(native, &HEY_IM_HERE, "offer")?;
        let chatted = said.marks.iter().any(|mark| mark.event == "chat-started");
        Verdict::new()
            .expect(
                "the small talk is heard as spoken",
                said.heard
                    .as_deref()
                    .is_some_and(|words| words_match(words, HEY_IM_HERE.words)),
            )
            .expect(
                "the voice speaks no reply of its own, because the model's reply offers to help",
                said.chat.is_none() && !chatted,
            )
            .expect(
                "the request plays the asking clip at the speaker",
                said.spoken.matches()
                    && matches!(
                        said.acknowledgement.as_deref(),
                        Some("asking" | "okay-asking")
                    ),
            )
            .expect("the words are sent to Voyager", said.sent)
            .observed("conversation", json!(said))
    })?;
    cases.check(native, Case::TurnWaitsForTheSentence, |native| {
        let speech = Samples::silence(ROOM_SILENCE_MS).then(&Samples::paused_request()?);
        voice::turn_on(native)?;
        let turn = voice::feed_turn(native, "silence-then-paused-request", &speech)?;
        voice::turn_off(native)?;
        Verdict::new()
            .expect(
                "one turn ends, and only after the whole request was spoken",
                turn.ended_after_the_feed(),
            )
            .expect(
                "the turn holds both sentences across a pause just under the end-of-turn silence",
                turn.heard.len() == 1 && words_match(&turn.heard[0], PAUSED_WORDS),
            )
            .observed("pauseMs", speech.longest_inner_quiet_ms())?
            .observed("turn", turn)
    })?;
    cases.check(native, Case::StartThumpIsNotSpeech, |native| {
        let speech = Samples::thump()
            .then(&Samples::silence(ROOM_SILENCE_MS))
            .then(&OPEN_THEN_DOCK.samples()?);
        let waited_ms = voice::turn_on(native)?;
        let turn = voice::feed_turn(native, "thump-then-sentence", &speech)?;
        voice::turn_off(native)?;
        Verdict::new()
            .expect(
                "a thump as the microphone opens does not end a turn before the sentence",
                turn.ended_after_the_feed(),
            )
            .expect(
                "the turn holds the whole sentence",
                turn.heard.len() == 1 && words_match(&turn.heard[0], OPEN_THEN_DOCK.words),
            )
            .observed("waitedMs", waited_ms)?
            .observed("turn", turn)
    })?;
    cases.check(native, Case::ConnectingThenListening, |native| {
        native.drawn_label(&Target::VOICE_CONTROL, "the voice control off", |label| {
            label == READY
        })?;
        voice::await_reply_stop(native)?;
        native.click(&Target::VOICE_CONTROL)?;
        let connecting = native.drawn_label(&Target::VOICE_CONTROL, "connecting", |label| {
            label == CONNECTING || label == LISTENING
        })?;
        let listening = native.drawn_label(&Target::VOICE_CONTROL, "listening", |label| {
            label == LISTENING
        })?;
        let marks = voice::marks(&native.voice_trace())?;
        let settle_ms = voice::settle_ms(&marks);
        voice::turn_off(native)?;
        Verdict::new()
            .expect(
                "the control reads Connecting first",
                connecting == CONNECTING,
            )
            .expect("then it reads Listening", listening == LISTENING)
            .expect(
                "listening starts only after the microphone has settled",
                settle_ms.is_some_and(|settle| settle >= 280),
            )
            .observed("settleMs", settle_ms)
    })?;
    cases.check(native, Case::SilenceKeepsVoiceOn, |native| {
        voice::turn_on(native)?;
        let trace = native.voice_trace();
        let before = voice::marks(&trace)?.len();
        let looks = voice::watch_control(native, LONG_SILENCE)?;
        let fresh: Vec<String> = voice::marks(&trace)?
            .into_iter()
            .skip(before)
            .map(|mark| mark.event)
            .collect();
        Verdict::new()
            .expect(
                "voice stays on and listening through a long silence",
                !looks.is_empty()
                    && looks.iter().all(|(label, recorders)| {
                        label == LISTENING && recorders.iter().any(|who| who == voice::APP_CLIENT)
                    }),
            )
            .expect("the silence is never a turn", fresh.is_empty())
            .observed("looks", looks.len())?
            .observed("events", fresh)
    })?;
    cases.check(native, Case::ClickTurnsVoiceOff, |native| {
        native.click(&Target::VOICE_CONTROL)?;
        let label =
            native.drawn_label(&Target::VOICE_CONTROL, "the voice control off", |label| {
                label == READY
            })?;
        let closed = until("the microphone to close", || {
            Ok(voice::recorders(native)?.is_empty().then_some(()))
        })
        .is_ok();
        let trace = native.voice_trace();
        let before = voice::marks(&trace)?.len();
        voice::feed(native, &DOCK_ON_THIS_FLEET)?;
        let after = voice::without_capture(native, QUIET_MIC)?;
        let fresh = voice::marks(&trace)?.len() - before;
        Verdict::new()
            .expect("the control reads Start voice", label == READY)
            .expect("the microphone closes", closed)
            .expect(
                "speech after the click is never heard",
                fresh == 0 && after.iter().all(Vec::is_empty),
            )
            .observed("freshEvents", fresh)
    })?;
    cases.check(native, Case::RoomSoundIsNeverATurn, |native| {
        let made = room::room(room::ROOM_SECONDS)?;
        voice::turn_on(native)?;
        let listened = voice::feed_and_settle(native, "room-sound", &made.samples);
        voice::turn_off(native)?;
        let listened = listened?;
        let heard: Vec<&str> = listened
            .turns
            .iter()
            .filter_map(|turn| turn.heard.as_deref())
            .collect();
        Verdict::new()
            .expect(
                "five minutes of room tone, fan, keys, a door and a reply's echo is never a turn",
                listened.turns.is_empty(),
            )
            .expect(
                "nothing in the room sound is acknowledged",
                listened.acknowledged() == 0,
            )
            .expect(
                "nothing heard in the room sound reaches Voyager",
                listened.sent() == 0,
            )
            .observed("turns", listened.turns.len())?
            .observed("acknowledged", listened.acknowledged())?
            .observed("sent", listened.sent())?
            .observed("droppedAfterHearing", listened.dropped())?
            .observed("heard", &heard)?
            .observed("roomSha256", made.sha256())?
            .observed("roomEvents", &made.events)?
            .observed("loudFanFromMs", made.loud_fan_from_ms)?
            .observed("listened", listened)
    })?;
    cases.check(native, Case::RequestInRoomSoundIsSent, |native| {
        let mixed = room::request_in_room(
            &RENAME_THE_FLEET,
            ROOM_BEFORE_REQUEST_S,
            ROOM_AFTER_REQUEST_S,
        )?;
        let before = voice::terminal_text(native, &voyager)?;
        voice::turn_on(native)?;
        let listened = voice::feed_and_settle(native, "request-in-room-sound", &mixed);
        voice::turn_off(native)?;
        let listened = listened?;
        let after = voice::terminal_text(native, &voyager)?;
        let heard = listened
            .turns
            .first()
            .and_then(|turn| turn.heard.clone())
            .unwrap_or_default();
        let received = |screen: &str| screen.matches(&spoken(&heard)).count();
        let (errors, words) = word_errors(&heard, RENAME_THE_FLEET.words);
        Verdict::new()
            .expect(
                "the spoken request among room sound is exactly one turn",
                listened.turns.len() == 1,
            )
            .expect(
                "that turn is sent to Voyager once, and Voyager receives the spoken marker and the words heard",
                listened.sent() == 1
                    && !heard.is_empty()
                    && received(&after) > received(&before),
            )
            .observed("spoken", RENAME_THE_FLEET.words)?
            .observed("heard", &heard)?
            .observed("wordErrors", errors)?
            .observed("words", words)?
            .observed("listened", listened)
    })?;
    cases.check(native, Case::QuietVoiceIsATurn, |native| {
        let mut quiet = Vec::new();
        for (gain, bed) in QUIET_VOICES {
            let samples =
                room::quiet_request(&DOCK_ON_THIS_FLEET, gain, bed, QUIET_VOICE_AROUND_S)?;
            let turned_on_ms = voice::turn_on(native)?;
            let listened = voice::feed_and_settle(native, "quiet-voice", &samples);
            voice::turn_off(native)?;
            let listened = listened?;
            let heard = listened
                .turns
                .first()
                .and_then(|turn| turn.heard.clone())
                .unwrap_or_default();
            let (word_errors, words) = word_errors(&heard, DOCK_ON_THIS_FLEET.words);
            quiet.push(QuietTurn {
                gain,
                bed,
                turns: listened.turns.len(),
                sent: listened.sent(),
                waited_ms: turned_on_ms + listened.waited_ms,
                heard,
                word_errors,
                words,
            });
        }
        Verdict::new()
            .expect(
                "a request at 0.15 and 0.06 of its level over room tone, and at 0.15 over a soft and a loud fan, is exactly one turn each",
                quiet.iter().all(|one| one.turns == 1),
            )
            .expect(
                "each of those turns is sent to Voyager once",
                quiet.iter().all(|one| one.sent == 1),
            )
            .observed("spoken", DOCK_ON_THIS_FLEET.words)?
            .observed("quiet", &quiet)
    })?;
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
                "listening resumes after the turn without another click",
                said.listening_resumed,
            )
            .expect(
                "the microphone closes when voice is clicked off",
                said.microphone_closed,
            )
            .expect(
                "the app opened the microphone after the click and no earlier",
                events.first() == Some(&"capture-open") && said.opened_after_click,
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
            "the voice control off again",
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
            .expect("the control is off after the click", label == READY)
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
                "the whole final message of the spoken turn is spoken, both paragraphs, with no pointer to the chat",
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
    cases.check(native, Case::TypedReplyIsSilent, |native| {
        let ever = voice::spoken_ever(native)?;
        Verdict::new()
            .expect(
                "no typed turn was ever spoken in the whole run",
                ever.iter().all(|text| !text.contains(TYPED_REPLY)),
            )
            .expect(
                "exactly one reply was spoken for the one spoken prompt",
                said.spoken_texts.len() == 1,
            )
            .observed("spokenTexts", &said.spoken_texts)?
            .observed("spokenEver", ever)
    })?;
    let Some(long) = cases.make(native, Case::LongReplyIsClear, |native| {
        let said = voice::converse_long(native, &OPEN_THE_ROADMAP, "long-reply")?;
        anyhow::ensure!(
            said.spoken_texts.iter().any(|text| text.starts_with(LONG_START)),
            "Inconclusive, blame on hearing: the request was heard as {:?}, so the stand-in gave its short reply and the long reply was never spoken",
            said.heard
        );
        let heard = voice::transcribe_long(native, "long-reply", &said)?;
        let (errors, words) = word_errors(&voice::digits_as_words(&heard.join(" ")), LONG_SPOKEN);
        let verdict = Verdict::new()
            .expect(
                "the long reply is spoken after the words were sent",
                said.sent && said.speech_after_capture_ms.is_some(),
            )
            .expect(
                "the engine hears the whole long reply with at most a tenth of its words wrong",
                words > 0 && errors * 100 <= words * LONG_ERROR_PERCENT,
            )
            .observed("firstAudioAfterCaptureMs", said.speech_after_capture_ms)?
            .observed("wordErrors", json!({"errors": errors, "words": words}))?
            .observed("heardWindows", &heard)?
            .observed("pieceStartsMs", piece_starts(&said.marks))?
            .observed("conversation", json!(said))?;
        Ok((verdict, Some(said)))
    })?
    else {
        return Ok(());
    };
    let pieces = pieces_of(&long.marks);
    cases.check(native, Case::LongSentenceSplitsAtAComma, |_| {
        Verdict::new()
            .expect(
                "the long sentence with commas is spoken as two pieces split at its last comma within the limit",
                in_order(&pieces, &COMMA_PIECES),
            )
            .observed("pieces", &pieces)
    })?;
    cases.check(native, Case::LongSentenceIsCutAtTheLimit, |native| {
        let log = std::fs::read_to_string(native.system.evidence.join("native.log"))?;
        let logged = log.matches(CUT_AT_LIMIT).count();
        Verdict::new()
            .expect(
                "the long sentence with no comma is spoken as its first words up to the limit and then the rest",
                in_order(&pieces, &LIMIT_PIECES),
            )
            .expect(
                "the app logged once that it cut a sentence at the limit",
                logged == 1,
            )
            .expect(
                "no piece of the reply is longer than the limit",
                !pieces.is_empty()
                    && pieces
                        .iter()
                        .all(|piece| piece.split_whitespace().count() <= PIECE_WORDS),
            )
            .observed("pieces", &pieces)?
            .observed("loggedCuts", logged)
    })?;
    cases.check(native, Case::NumbersAreSpokenAsWords, |_| {
        Verdict::new()
            .expect(
                "the reply's numbers, percent and decimal are spoken as words",
                long.spoken_texts
                    .iter()
                    .any(|text| text.contains(NUMBERS_SPOKEN)),
            )
            .expect(
                "the whole spoken reply is the stand-in's reply as the filter says it",
                long.spoken_texts.iter().any(|text| text == LONG_SPOKEN),
            )
            .expect(
                "no digit reaches the engine",
                !long.spoken_texts.is_empty()
                    && long
                        .spoken_texts
                        .iter()
                        .all(|text| !text.chars().any(|c| c.is_ascii_digit())),
            )
            .observed("spokenTexts", &long.spoken_texts)
    })?;
    cases.check(native, Case::LongReplyWaitsOnlyForRendering, |native| {
        let opened = voice::marks_between(
            &long.marks,
            "speaker-opened",
            "speech-started",
            "speech-ended",
        );
        let pauses = voice::pauses(native, "long-reply", &long, PAUSE_FLOOR_MS)?;
        let rendered: Vec<u64> = long
            .marks
            .iter()
            .filter(|mark| mark.event == "piece-rendered")
            .map(|mark| mark.at_ms)
            .collect();
        let judged: Vec<serde_json::Value> = pauses
            .iter()
            .map(|pause| {
                let waited = rendered
                    .iter()
                    .any(|at| (pause.from_ms..=pause.to_ms).contains(at));
                json!({"fromMs": pause.from_ms, "toMs": pause.to_ms, "pauseMs": pause.to_ms - pause.from_ms, "renderWait": waited})
            })
            .collect();
        let ready_pauses_held = pauses.iter().all(|pause| {
            pause.to_ms - pause.from_ms <= OWN_PAUSE_MS
                || rendered
                    .iter()
                    .any(|at| (pause.from_ms..=pause.to_ms).contains(at))
        });
        Verdict::new()
            .expect(
                "the whole long reply plays through one speaker stream",
                opened == 1,
            )
            .expect(
                "every pause over 150 ms is no longer than the speech's own 700 ms, unless a sentence finished rendering during it",
                !rendered.is_empty() && ready_pauses_held,
            )
            .observed("speakerStreams", opened)?
            .observed("pauses", judged)
    })?;
    cases.check(native, Case::TwoTurnsWithEcho, |native| {
        let echo = voice::echo(native)?;
        voice::turn_on(native)?;
        let first = voice::speak_and_hear_reply(native, &DOCK_ON_THIS_FLEET);
        let resumed = native
            .drawn_label(&Target::VOICE_CONTROL, "listening again", |label| {
                label == LISTENING
            })
            .is_ok();
        let second = voice::speak_and_hear_reply(native, &RENAME_TO_HARBOR);
        let still_on = native
            .drawn_label(&Target::VOICE_CONTROL, "listening again", |label| {
                label == LISTENING
            })
            .is_ok();
        voice::turn_off(native)?;
        echo.stop(&native.system)?;
        let (first, second): (Turn, Turn) = (first?, second?);
        let heard: Vec<&String> = first.heard.iter().chain(&second.heard).collect();
        let spoken = |turn: &Turn| {
            turn.marks
                .iter()
                .filter(|mark| mark.event == "speech-ended")
                .count()
        };
        Verdict::new()
            .expect(
                "each request is one turn, and Voyager's own voice is never a turn",
                first.ended_ms.len() == 1 && second.ended_ms.len() == 1 && heard.len() == 2,
            )
            .expect(
                "both requests are heard as spoken",
                heard
                    .first()
                    .is_some_and(|words| words_match(words, DOCK_ON_THIS_FLEET.words))
                    && heard
                        .get(1)
                        .is_some_and(|words| words_match(words, RENAME_TO_HARBOR.words)),
            )
            .expect(
                "each reply is spoken",
                spoken(&first) == 1 && spoken(&second) == 1,
            )
            .expect(
                "listening resumes between the turns and after them without a click",
                resumed && still_on,
            )
            .observed("first", first)?
            .observed("second", second)
    })?;
    cases.check(native, Case::ClickOffLetsTheReplyFinish, |native| {
        let off =
            voice::click_off_during_reply(native, &DOCK_ON_THIS_FLEET, "click-off", QUIET_MIC)?;
        Verdict::new()
            .expect(
                "the control reads Start voice and the microphone closes at the click",
                off.label_after_click == READY && off.microphone_closed,
            )
            .expect(
                "the reply was still playing at the click and ends after it",
                off.reply_started_ms <= off.clicked_ms
                    && off
                        .reply_ended_ms
                        .is_some_and(|ended| ended > off.clicked_ms),
            )
            .expect(
                "the whole reply reaches the speaker, both sentences, and the engine hears it",
                words_contain(&off.heard, SPOKEN_AS),
            )
            .expect(
                "voice stays off after the reply ends",
                off.label_at_end == READY,
            )
            .observed("clickOff", off)
    })?;
    cases.check(native, Case::ClickOffKeepsTheMicrophoneClosed, |native| {
        let off = voice::click_off_during_reply(
            native,
            &DOCK_ON_THIS_FLEET,
            "click-off-quiet",
            QUIET_MIC,
        )?;
        Verdict::new()
            .expect(
                "the control reads Start voice and the microphone closes at the click",
                off.label_after_click == READY && off.microphone_closed,
            )
            .expect(
                "after the reply ends the microphone is never opened again and voice stays off",
                !off.opened_after_click
                    && off.label_at_end == READY
                    && off.recorders_after.iter().all(Vec::is_empty),
            )
            .expect(
                "the next click opens the microphone",
                off.opened_after_next_click,
            )
            .observed("clickOff", off)
    })?;
    cases.check(native, Case::AcknowledgementIsPrompt, |native| {
        let mut first_sounds = Vec::new();
        let mut early = 0;
        let mut heard_right = 0;
        let mut played = std::collections::BTreeSet::new();
        for run in 0..RUNS {
            let said = voice::converse(native, &DOCK_ON_THIS_FLEET, &format!("prompt-{run}"))?;
            first_sounds.push(said.first_sound_after_capture_ms);
            played.extend(said.acknowledgement.clone());
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
        let clips_heard = played
            .iter()
            .map(|key| voice::kept_clip_heard(native, key))
            .collect::<Result<Vec<_>>>()?;
        let openings = voice::kept_clip_openings(native)?;
        let loud: Vec<_> = openings
            .iter()
            .filter(|clip| !clip.opens_quiet)
            .map(|clip| format!("{} opens at level {:.0}", clip.file, clip.opening_level))
            .collect();
        Verdict::new()
            .expect(
                "every kept clip begins below the first-sound level; a clip that opens loud was cut by the trim, or was rendered already loud by the engine and kept whole before any trim, and clipsOpeningLoud names each",
                !openings.is_empty() && loud.is_empty(),
            )
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
            .observed("clipsHeardBack", clips_heard)?
            .observed("clipsOpeningLoud", loud)?
            .observed("clipOpenings", openings)?
            .observed("targetMs", TARGET_MS)
    })?;
    cases.check(native, Case::RefusalIsInTheChat, |native| {
        let bound = std::fs::read(native.profile_path("voyager.json"))?;
        native.edit_profile_file("voyager.json", REMOVED)?;
        let said = voice::converse(native, &DOCK_ON_THIS_FLEET, "refused");
        native.edit_profile_file("voyager.json", &bound)?;
        let said = said?;
        native.click(&Target::CHAT_TOGGLE)?;
        let lines = native.settle(
            "the chat drawn with the refusal",
            |seen| {
                Some(
                    seen.frame
                        .elements
                        .iter()
                        .filter(|element| element.role == Role::ChatMessage)
                        .filter_map(|element| element.label.clone())
                        .collect::<Vec<_>>(),
                )
            },
            |lines| lines.iter().any(|label| label.starts_with(REFUSED)),
        )?;
        let refused: Vec<_> = lines
            .iter()
            .filter(|label| label.starts_with(REFUSED))
            .collect();
        Verdict::new()
            .expect(
                "the words were not sent to a Voyager that Core no longer has",
                !said.sent,
            )
            .expect(
                "the app played the refusal clip",
                said.marks
                    .iter()
                    .any(|mark| mark.event == "refusal-started"),
            )
            .expect(
                "the refusal clip names the reason, not a pointer to the chat",
                said.marks.iter().any(|mark| {
                    mark.event == "refusal-started" && mark.words.as_deref() == Some("gone")
                }),
            )
            .expect(
                "the chat shows the refusal once, as a line the user can read",
                refused.len() == 1,
            )
            .expect(
                "the chat also shows the reply that was spoken, as an assistant line and not as a user turn",
                lines.iter().any(|label| label.contains(SPOKEN_AS)),
            )
            .expect(
                "no chat line carries the reply marker",
                lines.iter().all(|label| !label.contains(REPLY_MARKER)),
            )
            .observed("chatLines", lines)?
            .observed("conversation", json!(said))
    })?;
    cases.check(native, Case::RequestsAreWrittenDown, |native| {
        let bound = std::fs::read(native.profile_path("voyager.json"))?;
        native.edit_profile_file("voyager.json", REMOVED)?;
        let written = write_down(native);
        native.edit_profile_file("voyager.json", &bound)?;
        let written = written?;
        let answered = written.iter().filter(|one| one.answered()).count();
        let errors: usize = written.iter().map(|one| one.errors).sum();
        let words: usize = written.iter().map(|one| one.words).sum();
        let exact = written.iter().filter(|one| one.errors == 0).count();
        Verdict::new()
            .expect(
                "no spoken question or command comes back as an answer instead of its words",
                answered == 0,
            )
            .expect(
                "the words heard are the words spoken, within the word error target",
                errors * 100 <= words * WORD_ERROR_PERCENT,
            )
            .observed("answered", answered)?
            .observed("wordErrors", errors)?
            .observed("wordsSpoken", words)?
            .observed("exact", exact)?
            .observed("requests", written)
    })
}

fn write_down(native: &mut Native) -> Result<Vec<Written>> {
    voice::turn_on(native)?;
    let mut written = Vec::new();
    for request in speech::requests()? {
        let turn = voice::feed_until_listening(native, &request.name, &request.samples)?;
        let (errors, words) = word_errors(&turn.heard.join(" "), &request.words);
        written.push(Written {
            name: request.name,
            kind: request.kind,
            spoken: request.words,
            heard: turn.heard,
            errors,
            words,
        });
    }
    voice::turn_off(native)?;
    Ok(written)
}

fn pieces_of(marks: &[voice::Mark]) -> Vec<String> {
    marks
        .iter()
        .filter(|mark| mark.event == "piece-started")
        .filter_map(|mark| mark.words.clone())
        .collect()
}

fn piece_starts(marks: &[voice::Mark]) -> Vec<u64> {
    marks
        .iter()
        .filter(|mark| mark.event == "piece-started")
        .map(|mark| mark.at_ms)
        .collect()
}

fn in_order(pieces: &[String], wanted: &[&str]) -> bool {
    pieces
        .windows(wanted.len())
        .any(|run| run.iter().zip(wanted).all(|(piece, want)| piece == want))
}
