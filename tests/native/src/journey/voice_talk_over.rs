use super::voice::{
    REPLY_PIECES, bind_voyager, engine_ready, needs_the_engine, pieces_of, while_playing,
};
use super::{Cases, Verdict, cases};
use crate::audio::speech::{
    DOCK_ON_THIS_FLEET, OPEN_THE_ROADMAP, STOP, Speech, WHAT_ABOUT_THE_TESTS, YEAH,
};
use crate::audio::voice::{self, LISTENING, Mark, SPEAKING_OPEN, TalkedOver, words_match};
use crate::inspection::Target;
use crate::native::Native;
use anyhow::Result;
use voyager_contract::inspection::Role;

cases! {
    EngineReady => "engine-ready" setup,
    VoyagerIsBound => "voyager-is-bound" setup,
    WaveIsGreen => "wave-is-green-while-a-reply-plays",
    BackchannelResumes => "backchannel-resumes-the-sentence",
    SteerReachesVoyager => "steer-reaches-voyager-as-cut-off",
    StopLeavesItStopped => "stop-leaves-it-stopped",
}

pub const CONTROL: Case = Case::WaveIsGreen;

const HEARD: &str = "Stand-in claude heard: ";
const CUT_OFF: &str = "[spoken] [cut off]";
const SPOKEN: &str = "[spoken]";
const LONG_START: &str = "Here's where things stand.";
const LONG_LAST: &str = "Want me to walk through any of it?";

fn after<'a>(marks: &'a [Mark], event: &str) -> &'a [Mark] {
    marks
        .iter()
        .position(|mark| mark.event == event)
        .map_or(&[], |at| &marks[at + 1..])
}

fn first<'a>(marks: &'a [Mark], event: &str) -> Option<&'a Mark> {
    marks.iter().find(|mark| mark.event == event)
}

fn count(marks: &[Mark], event: &str) -> usize {
    marks.iter().filter(|mark| mark.event == event).count()
}

fn heard_over(talked: &TalkedOver, wanted: &Speech) -> Result<String> {
    let heard = first(after(&talked.marks, "speech-cut"), "heard")
        .and_then(|mark| mark.words.clone())
        .unwrap_or_default();
    anyhow::ensure!(
        first(&talked.marks, "speech-cut").is_none() || words_match(&heard, wanted.words),
        "Inconclusive, blame on hearing: {:?} was fed over the reply and heard as {heard:?}",
        wanted.words
    );
    Ok(heard)
}

fn squashed(text: &str) -> String {
    text.chars().filter(|c| !c.is_whitespace()).collect()
}

fn occurrences(screen: &str, wanted: &str) -> usize {
    squashed(screen).matches(&squashed(wanted)).count()
}

fn heard_lines(screen: &str, starting: &str) -> usize {
    occurrences(screen, &format!("{HEARD}{starting}"))
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let driven = drive_cases(native, cases);
    let kept = voice::keep_engine_log(native);
    driven.and(kept)
}

fn drive_cases(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    needs_the_engine(native)?;
    cases.check(native, Case::EngineReady, engine_ready)?;
    let Some(voyager) = cases.make(native, Case::VoyagerIsBound, bind_voyager)? else {
        return Ok(());
    };
    cases.check(native, Case::WaveIsGreen, |native| {
        let talked =
            voice::talk_during_reply(native, &DOCK_ON_THIS_FLEET, None, "wave", &["speech-ended"])?;
        let playing = while_playing(&talked);
        Verdict::new()
            .expect(
                "while the reply plays the control is drawn listening while speaking, never busy",
                playing.iter().any(|look| look.label == SPEAKING_OPEN)
                    && playing.iter().all(|look| look.label != voice::BUSY),
            )
            .expect(
                "the app keeps recording the microphone while the reply plays",
                !playing.is_empty() && playing.iter().all(|look| look.recording),
            )
            .expect(
                "the reply plays to its end",
                talked.reached == ["speech-ended"] && count(&talked.marks, "speech-cut") == 0,
            )
            .observed("talkedOver", talked)
    })?;
    cases.check(native, Case::BackchannelResumes, |native| {
        let talked = voice::talk_during_reply(
            native,
            &DOCK_ON_THIS_FLEET,
            Some(&YEAH),
            "backchannel",
            &["speech-ended"],
        )?;
        let heard = heard_over(&talked, &YEAH)?;
        let cut = first(&talked.marks, "speech-cut").and_then(|mark| mark.words.clone());
        let resumed = after(&talked.marks, "speech-cut");
        let replayed = pieces_of(resumed);
        let from = cut
            .as_deref()
            .and_then(|cut| REPLY_PIECES.iter().position(|piece| *piece == cut));
        Verdict::new()
            .expect(
                "the backchannel cuts the reply at a piece of it",
                from.is_some(),
            )
            .expect(
                "the reply plays again from the start of the piece it cut, through a new speaker stream",
                first(resumed, "speaker-opened").is_some()
                    && replayed.first().map(String::as_str) == cut.as_deref(),
            )
            .expect(
                "and plays every piece from there to its end",
                from.is_some_and(|from| replayed == REPLY_PIECES[from..])
                    && first(resumed, "speech-ended").is_some(),
            )
            .expect(
                "nothing is sent to Voyager",
                count(after(&talked.marks, "speech-started"), "sent") == 0,
            )
            .observed("heard", heard)?
            .observed("onsetToSilenceAtSpeakerMs", talked.onset_to_silence_ms)?
            .observed("onsetToCutMs", talked.onset_to_cut_ms)?
            .observed("talkedOver", talked)
    })?;
    cases.check(native, Case::SteerReachesVoyager, |native| {
        let before = voice::terminal_text(native, &voyager)?;
        let talked = voice::talk_during_reply(
            native,
            &DOCK_ON_THIS_FLEET,
            Some(&WHAT_ABOUT_THE_TESTS),
            "steer",
            &["sent", "speech-ended"],
        )?;
        let screen = voice::terminal_text(native, &voyager)?;
        let cut = first(&talked.marks, "speech-cut").and_then(|mark| mark.words.clone());
        let heard = first(after(&talked.marks, "speech-cut"), "heard")
            .and_then(|mark| mark.words.clone());
        anyhow::ensure!(
            cut.is_none() || heard.is_some(),
            "Inconclusive, blame on hearing: the sentence fed over the reply cut it but was never heard"
        );
        let heard = heard.unwrap_or_default();
        let at = cut
            .as_deref()
            .and_then(|cut| REPLY_PIECES.iter().position(|piece| *piece == cut));
        let prompt = at.zip(cut.as_deref()).map(|(at, cut)| {
            format!(
                "{CUT_OFF} You were saying: \"{cut}\". Not heard: {} more sentences. They say: {heard}",
                REPLY_PIECES.len() - at - 1
            )
        });
        let received = prompt
            .as_deref()
            .map_or(0, |prompt| occurrences(&screen, &format!("{HEARD}{prompt}")));
        let stopped = after(&talked.marks, "speech-cut");
        let until_answer = stopped
            .iter()
            .position(|mark| mark.event == "speech-started")
            .map_or(stopped, |at| &stopped[..at]);
        Verdict::new()
            .expect("the sentence cuts the reply at a piece of it", at.is_some())
            .expect(
                "the stand-in receives exactly one cut-off prompt, the piece cut, the count not heard and the words",
                received == 1
                    && heard_lines(&screen, CUT_OFF) == heard_lines(&before, CUT_OFF) + 1,
            )
            .expect(
                "the app sends it once",
                count(after(&talked.marks, "speech-started"), "sent") == 1,
            )
            .expect(
                "the cut reply never resumes",
                count(until_answer, "piece-started") == 0,
            )
            .observed("expectedPrompt", &prompt)?
            .observed("standInScreen", screen)?
            .observed("talkedOver", talked)
    })?;
    cases.check(native, Case::StopLeavesItStopped, |native| {
        let before = voice::terminal_text(native, &voyager)?;
        let talked = voice::talk_during_reply(
            native,
            &OPEN_THE_ROADMAP,
            Some(&STOP),
            "stop",
            &["heard"],
        )?;
        anyhow::ensure!(
            first(&talked.marks, "speech-started")
                .and_then(|mark| mark.words.as_deref())
                .is_some_and(|words| words.starts_with(LONG_START)),
            "Inconclusive, blame on hearing: the request was not heard as the roadmap, so the long reply was never spoken"
        );
        let heard = heard_over(&talked, &STOP)?;
        let screen = voice::terminal_text(native, &voyager)?;
        let stopped = after(&talked.marks, "speech-cut");
        native.click(&Target::CHAT_TOGGLE)?;
        let lines = native.settle(
            "the chat drawn with the long reply",
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
            |lines| lines.iter().any(|label| label.contains(LONG_START)),
        )?;
        let last_look = talked.looks.last().map(|look| look.label.clone());
        Verdict::new()
            .expect(
                "the stop cuts the reply",
                first(&talked.marks, "speech-cut").is_some(),
            )
            .expect(
                "the reply does not resume",
                count(stopped, "piece-started") == 0
                    && count(stopped, "speaker-opened") == 0
                    && count(stopped, "speech-ended") == 0,
            )
            .expect(
                "nothing is sent to Voyager",
                count(after(&talked.marks, "speech-started"), "sent") == 0
                    && heard_lines(&screen, SPOKEN) == heard_lines(&before, SPOKEN) + 1,
            )
            .expect(
                "the control is drawn listening again",
                last_look.as_deref() == Some(LISTENING),
            )
            .expect(
                "the reply's last sentence, never spoken, is in the chat",
                pieces_of(&talked.marks).iter().all(|piece| piece != LONG_LAST)
                    && lines.iter().any(|label| {
                        label.contains(LONG_START) && label.contains(LONG_LAST)
                    }),
            )
            .observed("heard", heard)?
            .observed("chatLines", lines)?
            .observed("talkedOver", talked)
    })
}
