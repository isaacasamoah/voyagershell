use super::{Cases, Verdict, cases};
use crate::agent::{REPLY_MARKER, TYPED_REPLY};
use crate::audio::room;
use crate::audio::speech::{
    self as speech, DOCK_ON_THIS_FLEET, Kind, OPEN_THEN_DOCK, PAUSED_WORDS, RENAME_THE_FLEET,
    RENAME_TO_HARBOR, Samples, Wanted,
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
    TurnWaitsForTheSentence => "turn-waits-for-the-sentence",
    StartThumpIsNotSpeech => "start-thump-is-not-speech",
    ConnectingThenListening => "connecting-then-listening",
    SilenceKeepsVoiceOn => "silence-keeps-voice-on",
    ClickTurnsVoiceOff => "click-turns-voice-off",
    RoomSoundIsNeverATurn => "room-sound-is-never-a-turn",
    RequestInRoomSoundIsSent => "request-in-room-sound-is-sent",
    RenameIsHeard => "rename-is-heard-and-acknowledged",
    WordsReachVoyager => "words-reach-voyager",
    ReplyIsSpoken => "reply-is-spoken",
    TypedReplyIsSilent => "typed-reply-is-silent",
    TwoTurnsWithEcho => "two-turns-with-echo",
    AcknowledgementIsPrompt => "acknowledgement-is-prompt",
    RefusalIsInTheChat => "refusal-is-in-the-chat",
    RequestsAreWrittenDown => "requests-are-written-down",
    RepliesFollowRoundSeven => "replies-follow-round-seven",
}

pub const CONTROL: Case = Case::NoCaptureWithoutClick;

const TARGET_MS: i64 = 300;
const RUNS: usize = 10;
const SPOKEN_AS: &str = "Docked on this fleet. The Fleet was already open.";
const OTHER: &str = "Opened the roadmap on the right.";
const REMOVED: &[u8] = br#"{"terminal":"t-removed-9999"}"#;
const REFUSED: &str = "Not sent";
const ROOM_SILENCE_MS: u32 = 3000;
const WORD_ERROR_PERCENT: usize = 5;
const ROOM_BEFORE_REQUEST_S: u32 = 8;
const ROOM_AFTER_REQUEST_S: u32 = 4;
const RIGHT_PERCENT: usize = 95;

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
        voice::turn_on(native)?;
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
            .observed("turn", turn)
    })?;
    cases.check(native, Case::ConnectingThenListening, |native| {
        native.drawn_label(&Target::VOICE_CONTROL, "the voice control off", |label| {
            label == READY
        })?;
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
                "nothing heard in the room sound reaches Voyager",
                listened.sent() == 0,
            )
            .expect(
                "the voice asks no reply call and says nothing for the room sound",
                listened.answered() == 0,
            )
            .observed("turns", listened.turns.len())?
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
                "the voice answers a request for a Voyager that is running in its own words at the speaker",
                said.reply.as_deref().is_some_and(|words| !words.is_empty()),
            )
            .expect(
                "the answer starts after the words are heard",
                said.started_after_heard,
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
    cases.check(native, Case::AcknowledgementIsPrompt, |native| {
        let mut first_sounds = Vec::new();
        let mut after = 0;
        let mut heard_right = 0;
        for run in 0..RUNS {
            let said = voice::converse(native, &DOCK_ON_THIS_FLEET, &format!("prompt-{run}"))?;
            first_sounds.push(said.first_sound_after_capture_ms);
            after += usize::from(said.started_after_heard && said.reply.is_some());
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
                "the voice's own words start after hearing in every run",
                after == RUNS,
            )
            .expect("every run is heard as spoken", heard_right == RUNS)
            .expect(
                "the median first sound after capture ends is under the CPU target",
                middle.is_some_and(|middle| middle < TARGET_MS),
            )
            .observed("firstSoundAfterCaptureMs", &first_sounds)?
            .observed("medianMs", middle)?
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
    cases.check(native, Case::RepliesFollowRoundSeven, |native| {
        let bound = std::fs::read(native.profile_path("voyager.json"))?;
        native.edit_profile_file("voyager.json", REMOVED)?;
        let answered = answer_remarks(native);
        native.edit_profile_file("voyager.json", &bound)?;
        let answered = answered?;
        let kept: Vec<&Answered> = answered.iter().filter(|one| one.kept_workspace()).collect();
        let right = answered.iter().filter(|one| one.right()).count();
        let claimed: Vec<&Answered> = answered
            .iter()
            .filter(|one| one.claims_the_work())
            .collect();
        let garbled: Vec<&Answered> = answered.iter().filter(|one| one.garbles_a_name()).collect();
        Verdict::new()
            .expect(
                "every spoken remark got a reply from the voice model",
                answered.iter().all(|one| one.reply.is_some()),
            )
            .expect(
                "no workspace request is kept by the voice instead of being handed to Voyager",
                kept.is_empty(),
            )
            .expect(
                "at least 95 percent of the remarks are chat or handed off as labelled",
                right * 100 >= answered.len() * RIGHT_PERCENT,
            )
            .expect(
                "no acknowledgement says the voice does the work",
                claimed.is_empty(),
            )
            .expect(
                "no acknowledgement carries a name that was not in the words heard",
                garbled.is_empty(),
            )
            .observed("kept", kept.len())?
            .observed("right", right)?
            .observed("remarks", answered)
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Answered {
    name: String,
    wanted: Wanted,
    spoken: String,
    heard: Vec<String>,
    reply: Option<Reply>,
}

#[derive(serde::Deserialize, serde::Serialize)]
struct Reply {
    handoff: bool,
    say: String,
}

impl Answered {
    fn handed_off(&self) -> Option<bool> {
        self.reply.as_ref().map(|reply| reply.handoff)
    }

    fn right(&self) -> bool {
        self.handed_off() == Some(self.wanted == Wanted::Handoff)
    }

    fn kept_workspace(&self) -> bool {
        self.wanted == Wanted::Handoff && self.handed_off() == Some(false)
    }

    fn says(&self) -> &str {
        self.reply.as_ref().map_or("", |reply| reply.say.as_str())
    }

    fn claims_the_work(&self) -> bool {
        claims_the_work(self.says())
    }

    fn garbles_a_name(&self) -> bool {
        let heard = words_of(&self.heard.join(" "));
        let said = self.says();
        let mut names = said
            .split_whitespace()
            .enumerate()
            .map(|(at, word)| (at, word.trim_matches(|c: char| !c.is_alphanumeric())))
            .filter(|(at, word)| {
                !word.is_empty()
                    && (word.chars().any(|c| c.is_ascii_digit())
                        || (*at > 0 && word.chars().next().is_some_and(char::is_uppercase)))
            })
            .map(|(_, word)| word.to_lowercase());
        names.any(|name| {
            let name = name.trim_end_matches("'s").to_owned();
            name != "voyager" && name != "i" && !heard.contains(&name)
        })
    }
}

const FINISHED: [&str; 3] = ["done", "finished", "completed"];
const DID: [&str; 11] = [
    "made", "did", "set", "put", "found", "sent", "got", "ran", "wrote", "took", "built",
];
const PROMISED: [&str; 4] = ["ask", "tell", "pass", "let"];

fn claims_the_work(say: &str) -> bool {
    let words = words_of(&say.replace('\u{2019}', "'"));
    let finished = words.iter().any(|word| FINISHED.contains(&word.as_str()));
    let did_it = words.windows(2).any(|pair| {
        pair[0] == "i"
            && (pair[1].len() > 3 && pair[1].ends_with("ed")
                || DID.contains(&pair[1].as_str())
                || pair[1] == "have")
    });
    let has_done = words.iter().any(|word| word == "i've");
    let will_do = words
        .windows(2)
        .any(|pair| pair[0] == "i'll" && !PROMISED.contains(&pair[1].as_str()))
        || words.windows(3).any(|trio| {
            trio[0] == "i" && trio[1] == "will" && !PROMISED.contains(&trio[2].as_str())
        });
    finished || did_it || has_done || will_do
}

fn words_of(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|word| {
            word.trim_matches(|c: char| !c.is_alphanumeric())
                .to_lowercase()
        })
        .collect()
}

fn answer_remarks(native: &mut Native) -> Result<Vec<Answered>> {
    voice::turn_on(native)?;
    let mut answered = Vec::new();
    for remark in speech::remarks()? {
        let turn = voice::feed_until_listening(native, &remark.name, &remark.samples)?;
        let reply = turn
            .marks
            .iter()
            .find(|mark| mark.event == "replied")
            .and_then(|mark| mark.words.as_deref())
            .and_then(|words| serde_json::from_str::<Reply>(words).ok());
        answered.push(Answered {
            name: remark.name,
            wanted: remark.wanted,
            spoken: remark.words,
            heard: turn.heard,
            reply,
        });
    }
    voice::turn_off(native)?;
    Ok(answered)
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

#[cfg(test)]
mod tests {
    use super::claims_the_work;

    #[test]
    fn a_reply_that_claims_the_work_is_caught() {
        for planted in [
            "Done.",
            "All finished.",
            "Sure, I'll make that fleet.",
            "I will create it now.",
            "I made a new fleet.",
            "I renamed the vessel to Logs.",
            "I've changed the layout.",
            "I have moved it.",
        ] {
            assert!(claims_the_work(planted), "{planted}");
        }
    }

    #[test]
    fn an_acknowledgement_that_only_passes_the_work_on_is_not_caught() {
        for honest in [
            "Sure, opening the Billing fleet.",
            "Sure, I'll ask Voyager what's new.",
            "Okay, I'll tell Voyager to drop that.",
            "Let me check whether the tests are passing.",
            "Sure, Voyager can walk you through that.",
            "I'm doing well, thanks. What can I do for you?",
            "I'm Voyager's voice. I pass your workspace requests to Voyager.",
        ] {
            assert!(!claims_the_work(honest), "{honest}");
        }
    }
}
