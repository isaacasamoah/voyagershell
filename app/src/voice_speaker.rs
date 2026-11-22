use crate::{
    replies::Replies,
    speech::{CUT_AT_LIMIT, Clip, Phrase, Speaking},
    voice_parts::{Audio, Floor, Phase, Trace, Voyager},
    voice_reply::{Line, PARTIAL, Watcher},
};
use std::{
    collections::HashMap,
    sync::{
        Arc,
        mpsc::{self, Receiver},
    },
    thread,
    time::{Duration, Instant},
};

const LOOK: Duration = Duration::from_millis(100);
const STANDING_EVERY: Duration = Duration::from_millis(250);

pub(crate) struct Parts {
    pub speaking: Arc<dyn Speaking>,
    pub clips: Arc<HashMap<Phrase, Clip>>,
    pub audio: Arc<dyn Audio>,
    pub voyager: Arc<dyn Voyager>,
    pub replies: Replies,
    pub trace: Trace,
    pub floor: Arc<Floor>,
    pub status: Arc<dyn Fn(Phase, Option<String>) + Send + Sync>,
    pub stopped: Arc<dyn Fn() -> bool + Send + Sync>,
    pub on: Arc<dyn Fn() -> bool + Send + Sync>,
}

pub(crate) fn spawn(parts: Parts) {
    let mut watcher = Watcher::starting_at(&parts.replies.snapshot().turns);
    thread::spawn(move || {
        let mut asked = Instant::now();
        while !(parts.stopped)() {
            thread::sleep(LOOK);
            let turns = parts.replies.snapshot().turns;
            if !watcher.waiting_on_voyager(&turns) {
                continue;
            }
            let lines = watcher.lines(&turns, |urgent| {
                if urgent || asked.elapsed() >= STANDING_EVERY {
                    asked = Instant::now();
                    Some(parts.voyager.standing())
                } else {
                    None
                }
            });
            for line in lines {
                if matches!(line, Line::Partial) {
                    eprintln!("{}", PARTIAL);
                } else {
                    say(&parts, line);
                }
            }
        }
    });
}

type Rendered = Result<(Clip, String), String>;

fn clip_of(parts: &Parts, line: &Line) -> Rendered {
    match line {
        Line::Reply(text) => {
            let piece = text
                .pieces()
                .next()
                .ok_or_else(|| "The reply has nothing to speak".to_owned())?;
            parts
                .speaking
                .speak(piece)
                .map(|clip| (clip, piece.as_str().to_owned()))
                .map_err(|fault| fault.to_string())
        }
        Line::Said(phrase) => parts
            .clips
            .get(phrase)
            .cloned()
            .map(|clip| (clip, phrase.key().to_owned()))
            .ok_or_else(|| "The clip is not kept".to_owned()),
        Line::Partial => Err(PARTIAL.to_owned()),
    }
}

fn rest_of(parts: &Parts, line: &Line) -> Receiver<Rendered> {
    let (send, receive) = mpsc::channel();
    if let Line::Reply(text) = line {
        let text = text.clone();
        let speaking = parts.speaking.clone();
        let stopped = parts.stopped.clone();
        thread::spawn(move || {
            for piece in text.pieces().skip(1) {
                if stopped() {
                    break;
                }
                let rendered = speaking
                    .speak(piece)
                    .map(|clip| (clip, piece.as_str().to_owned()))
                    .map_err(|fault| fault.to_string());
                if send.send(rendered).is_err() {
                    break;
                }
            }
        });
    }
    receive
}

fn note_unspoken(parts: &Parts, line: &Line) {
    if let Line::Reply(text) = line {
        parts.voyager.note(text.as_str());
    }
}

fn label_of(line: &Line, first: &str) -> String {
    match line {
        Line::Reply(text) => text.as_str().to_owned(),
        Line::Said(_) | Line::Partial => first.to_owned(),
    }
}

fn say(parts: &Parts, line: Line) {
    if !(parts.on)() {
        note_unspoken(parts, &line);
        return;
    }
    if let Line::Reply(text) = &line
        && text.cut_at_limit()
    {
        eprintln!("{CUT_AT_LIMIT}");
    }
    let first = clip_of(parts, &line);
    let _floor = parts.floor.take();
    if (parts.stopped)() {
        return;
    }
    if !(parts.on)() {
        note_unspoken(parts, &line);
        return;
    }
    (parts.status)(Phase::Speaking, None);
    let notice = match first {
        Err(reason) => Some(reason),
        Ok(first) => play_all(parts, &line, first, &rest_of(parts, &line)),
    };
    let after = if (parts.on)() {
        Phase::Connecting
    } else {
        Phase::Ready
    };
    (parts.status)(after, notice);
}

fn play_all(
    parts: &Parts,
    line: &Line,
    (first, words): (Clip, String),
    rest: &Receiver<Rendered>,
) -> Option<String> {
    let mut playing = (first, words);
    let mut started = false;
    let notice = loop {
        let (clip, words) = &playing;
        let speaker = match parts.audio.speaker(clip.rate) {
            Err(error) => break Some(format!("The speaker could not be opened: {error}")),
            Ok(speaker) => speaker,
        };
        if !started {
            parts
                .trace
                .mark_words("speech-started", &label_of(line, words));
        }
        if matches!(line, Line::Reply(_)) {
            parts.trace.mark_words("piece-started", words);
        }
        let finish = speaker.play(clip);
        if !started {
            note_unspoken(parts, line);
            started = true;
        }
        finish(&|| (parts.stopped)());
        if (parts.stopped)() {
            break None;
        }
        match rest.recv() {
            Err(_) => break None,
            Ok(Err(reason)) => break Some(reason),
            Ok(Ok(next)) => playing = next,
        }
    };
    if started {
        parts.trace.mark("speech-ended");
    }
    notice
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        speech::{Fault, Piece, SpokenText, Standing},
        voice_parts::{Frames, Speaker},
    };
    use std::{
        io,
        sync::{
            Mutex,
            atomic::{AtomicBool, Ordering},
        },
    };
    use voyager_contract::reply::ReplyEvent;

    struct Voice(
        Arc<Mutex<Vec<usize>>>,
        Arc<Mutex<Vec<bool>>>,
        Arc<AtomicBool>,
    );

    impl Speaker for Voice {
        fn play(self: Box<Self>, clip: &Clip) -> crate::voice_parts::Finish {
            self.0.lock().unwrap().push(clip.pcm.len());
            Box::new(move |cut| {
                if self.2.load(Ordering::SeqCst) {
                    thread::sleep(Duration::from_millis(300));
                }
                self.1.lock().unwrap().push(cut());
            })
        }
    }

    struct Out(
        Arc<Mutex<Vec<usize>>>,
        Arc<Mutex<Vec<bool>>>,
        Arc<AtomicBool>,
    );

    impl Audio for Out {
        fn microphone(&self) -> io::Result<Box<dyn Frames>> {
            Err(io::Error::other("the speaker watcher never listens"))
        }

        fn speaker(&self, _: u32) -> io::Result<Box<dyn Speaker>> {
            Ok(Box::new(Voice(
                self.0.clone(),
                self.1.clone(),
                self.2.clone(),
            )))
        }

        fn detector(&self) -> Box<dyn crate::audio_io::SpeechDetector> {
            Box::new(crate::audio_io::Loudness)
        }
    }

    struct Reader;

    impl Speaking for Reader {
        fn render(&self, _: Phrase) -> Result<Clip, Fault> {
            Err(Fault::Unavailable("unused".into()))
        }

        fn speak(&self, piece: Piece<'_>) -> Result<Clip, Fault> {
            Ok(Clip {
                rate: 24_000,
                pcm: vec![0; piece.as_str().len()],
            })
        }
    }

    struct Here(
        Standing,
        Arc<Mutex<Vec<usize>>>,
        Arc<Mutex<Vec<(String, usize)>>>,
    );

    impl Voyager for Here {
        fn standing(&self) -> Standing {
            self.0
        }

        fn say(&self, _: &str) -> Result<(), crate::voice_parts::SendFailure> {
            Ok(())
        }

        fn note(&self, line: &str) {
            let started = self.1.lock().unwrap().len();
            self.2.lock().unwrap().push((line.to_owned(), started));
        }
    }

    struct Rig {
        played: Arc<Mutex<Vec<usize>>>,
        replies: Replies,
        floor: Arc<Floor>,
        phases: Arc<Mutex<Vec<Phase>>>,
        stop: Arc<AtomicBool>,
        on: Arc<AtomicBool>,
        noted: Arc<Mutex<Vec<(String, usize)>>>,
        cut: Arc<Mutex<Vec<bool>>>,
        slow: Arc<AtomicBool>,
    }

    impl Rig {
        fn start(standing: Standing) -> Self {
            let played = Arc::new(Mutex::default());
            let phases: Arc<Mutex<Vec<Phase>>> = Arc::default();
            let stop = Arc::new(AtomicBool::new(false));
            let replies = Replies::default();
            let noted: Arc<Mutex<Vec<(String, usize)>>> = Arc::default();
            let cut: Arc<Mutex<Vec<bool>>> = Arc::default();
            let slow = Arc::new(AtomicBool::new(false));
            let floor = Arc::new(Floor::default());
            let recorded = phases.clone();
            let halted = stop.clone();
            let on = Arc::new(AtomicBool::new(true));
            let listening = on.clone();
            spawn(Parts {
                speaking: Arc::new(Reader),
                clips: Arc::new(
                    Phrase::ALL
                        .into_iter()
                        .enumerate()
                        .map(|(index, phrase)| {
                            (
                                phrase,
                                Clip {
                                    rate: 24_000,
                                    pcm: vec![0; 1000 + index],
                                },
                            )
                        })
                        .collect(),
                ),
                audio: Arc::new(Out(played.clone(), cut.clone(), slow.clone())),
                voyager: Arc::new(Here(standing, played.clone(), noted.clone())),
                replies: replies.clone(),
                trace: Trace::off(),
                floor: floor.clone(),
                status: Arc::new(move |phase, _| recorded.lock().unwrap().push(phase)),
                stopped: Arc::new(move || halted.load(Ordering::SeqCst)),
                on: Arc::new(move || listening.load(Ordering::SeqCst)),
            });
            Self {
                played,
                replies,
                floor,
                phases,
                stop,
                on,
                noted,
                cut,
                slow,
            }
        }

        fn say(&self, turn: &str, spoken: bool, words: &str) {
            let text = ReplyEvent::Text {
                turn: turn.into(),
                message: format!("m-{turn}"),
                index: 0,
                last: true,
                text: words.into(),
            };
            let end = ReplyEvent::TurnEnd {
                turn: turn.into(),
                text: words.into(),
            };
            self.replies.accept_with(text, |_| spoken);
            self.replies.accept(end);
        }

        fn wait_for(&self, count: usize) {
            let until = Instant::now() + Duration::from_secs(3);
            while self.played.lock().unwrap().len() < count && Instant::now() < until {
                thread::sleep(Duration::from_millis(10));
            }
        }
    }

    impl Drop for Rig {
        fn drop(&mut self) {
            self.stop.store(true, Ordering::SeqCst);
        }
    }

    #[test]
    fn a_spoken_reply_is_read_aloud_and_listening_resumes() {
        let rig = Rig::start(Standing::Idle);
        rig.say("p1", true, "Renamed it.\n\nMore.");
        rig.wait_for(2);
        let heard = vec!["Renamed it.".len(), "More.".len()];
        assert_eq!(rig.played.lock().unwrap().clone(), heard);
        thread::sleep(Duration::from_millis(250));
        assert_eq!(
            rig.phases.lock().unwrap().clone(),
            vec![Phase::Speaking, Phase::Connecting]
        );
    }

    #[test]
    fn a_long_reply_is_played_one_piece_at_a_time_in_order() {
        let rig = Rig::start(Standing::Idle);
        rig.say("p1", true, "One two. Three four five!\n\nSix?");
        rig.wait_for(3);
        thread::sleep(Duration::from_millis(250));
        let pieces = ["One two.", "Three four five!", "Six?"]
            .map(str::len)
            .to_vec();
        assert_eq!(rig.played.lock().unwrap().clone(), pieces);
        assert_eq!(
            rig.phases.lock().unwrap().clone(),
            vec![Phase::Speaking, Phase::Connecting]
        );
    }

    #[test]
    fn a_spoken_reply_after_voice_was_clicked_off_is_noted_in_the_chat_and_not_played() {
        let rig = Rig::start(Standing::Idle);
        rig.on.store(false, Ordering::SeqCst);
        rig.say("p1", true, "Renamed it.");
        let until = Instant::now() + Duration::from_secs(3);
        while rig.noted.lock().unwrap().is_empty() && Instant::now() < until {
            thread::sleep(Duration::from_millis(10));
        }
        thread::sleep(Duration::from_millis(250));
        assert_eq!(
            rig.noted.lock().unwrap().clone(),
            vec![("Renamed it.".to_owned(), 0)]
        );
        assert!(rig.played.lock().unwrap().is_empty());
    }

    #[test]
    fn a_reply_asks_the_listener_for_the_floor_while_it_waits() {
        let rig = Rig::start(Standing::Idle);
        let held = rig.floor.hold();
        rig.say("p1", true, "Done.");
        let until = Instant::now() + Duration::from_secs(3);
        while !rig.floor.is_wanted() && Instant::now() < until {
            thread::sleep(Duration::from_millis(10));
        }
        assert!(rig.floor.is_wanted());
        drop(held);
        rig.wait_for(1);
        assert!(!rig.floor.is_wanted());
    }

    fn wait_for_finish(rig: &Rig) {
        let until = Instant::now() + Duration::from_secs(3);
        while rig.cut.lock().unwrap().is_empty() && Instant::now() < until {
            thread::sleep(Duration::from_millis(10));
        }
    }

    #[test]
    fn a_click_off_while_a_reply_plays_lets_it_finish() {
        let rig = Rig::start(Standing::Idle);
        rig.slow.store(true, Ordering::SeqCst);
        rig.say("p1", true, "Renamed it. Then I tidied the tabs.");
        rig.wait_for(1);
        rig.on.store(false, Ordering::SeqCst);
        wait_for_finish(&rig);
        assert_eq!(rig.cut.lock().unwrap().clone(), vec![false]);
        thread::sleep(Duration::from_millis(250));
        assert_eq!(rig.phases.lock().unwrap().last(), Some(&Phase::Ready));
    }

    #[test]
    fn stopping_the_voice_layer_while_a_reply_plays_cuts_it() {
        let rig = Rig::start(Standing::Idle);
        rig.slow.store(true, Ordering::SeqCst);
        rig.say("p1", true, "Renamed it. Then I tidied the tabs.");
        rig.wait_for(1);
        rig.stop.store(true, Ordering::SeqCst);
        wait_for_finish(&rig);
        assert_eq!(rig.cut.lock().unwrap().clone(), vec![true]);
    }

    #[test]
    fn the_spoken_reply_is_noted_in_the_chat_only_after_its_audio_has_started() {
        let rig = Rig::start(Standing::Idle);
        rig.say("p1", true, "Renamed it. Then I tidied the tabs.");
        rig.wait_for(1);
        thread::sleep(Duration::from_millis(250));
        assert_eq!(
            rig.noted.lock().unwrap().clone(),
            vec![("Renamed it. Then I tidied the tabs.".to_owned(), 1)]
        );
    }

    #[test]
    fn a_typed_reply_adds_nothing_to_the_chat() {
        let rig = Rig::start(Standing::Idle);
        rig.say("t1", false, "Typed answer.");
        thread::sleep(Duration::from_millis(500));
        assert!(rig.noted.lock().unwrap().is_empty());
    }

    #[test]
    fn a_typed_reply_makes_no_sound() {
        let rig = Rig::start(Standing::Idle);
        rig.say("t1", false, "Typed answer.");
        thread::sleep(Duration::from_millis(500));
        assert!(rig.played.lock().unwrap().is_empty());
    }

    #[test]
    fn a_failed_spoken_turn_plays_the_failure_clip() {
        let rig = Rig::start(Standing::Idle);
        rig.replies.accept_with(
            ReplyEvent::Text {
                turn: "p1".into(),
                message: "m1".into(),
                index: 0,
                last: true,
                text: "Working.".into(),
            },
            |_| true,
        );
        rig.replies.accept(ReplyEvent::TurnFailed {
            turn: Some("p1".into()),
            error: "rate_limit".into(),
        });
        rig.wait_for(1);
        let failed = 1000
            + Phrase::ALL
                .iter()
                .position(|p| *p == Phrase::Failed)
                .unwrap();
        assert_eq!(rig.played.lock().unwrap().clone(), vec![failed]);
    }

    #[test]
    fn a_blocked_voyager_is_announced_once_while_its_spoken_turn_is_open() {
        let rig = Rig::start(Standing::Blocked);
        rig.replies.accept_with(
            ReplyEvent::Text {
                turn: "p1".into(),
                message: "m1".into(),
                index: 0,
                last: false,
                text: "Starting.".into(),
            },
            |_| true,
        );
        rig.wait_for(1);
        thread::sleep(Duration::from_millis(800));
        let blocked = 1000
            + Phrase::ALL
                .iter()
                .position(|p| *p == Phrase::NeedsYou)
                .unwrap();
        assert_eq!(rig.played.lock().unwrap().clone(), vec![blocked]);
    }

    #[test]
    fn a_stateless_answer_from_core_never_speaks() {
        let rig = Rig::start(crate::voice_voyager::standing_of(true, None));
        assert_eq!(
            crate::voice_voyager::standing_of(true, None),
            Standing::Unknown
        );
        rig.say("p1", true, "Done.");
        thread::sleep(Duration::from_millis(700));
        assert!(rig.played.lock().unwrap().is_empty());
    }

    #[test]
    fn a_flicker_that_speaks_the_first_stop_then_reopening_speaks_nothing_more() {
        let rig = Rig::start(Standing::Idle);
        rig.say("p1", true, "Part one.");
        rig.wait_for(1);
        rig.replies.accept(ReplyEvent::Text {
            turn: "p1".into(),
            message: "m2".into(),
            index: 0,
            last: true,
            text: "Part two.".into(),
        });
        rig.replies.accept(ReplyEvent::TurnEnd {
            turn: "p1".into(),
            text: "Part one. Part two.".into(),
        });
        thread::sleep(Duration::from_millis(700));
        assert_eq!(rig.played.lock().unwrap().len(), 1);
    }

    #[test]
    fn speech_waits_for_the_floor_while_an_exchange_holds_it() {
        let rig = Rig::start(Standing::Idle);
        let held = rig.floor.hold();
        rig.say("p1", true, "Done.");
        thread::sleep(Duration::from_millis(500));
        assert!(rig.played.lock().unwrap().is_empty());
        drop(held);
        rig.wait_for(1);
        assert_eq!(rig.played.lock().unwrap().len(), 1);
    }
}
