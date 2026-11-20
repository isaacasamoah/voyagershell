use crate::{
    replies::Replies,
    speech::{Clip, Phrase, Speaking},
    voice_layer::Floor,
    voice_parts::{Audio, Phase, Trace, Voyager},
    voice_reply::{Line, PARTIAL, Watcher},
};
use std::{
    collections::HashMap,
    sync::Arc,
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

fn clip_of(parts: &Parts, line: &Line) -> Result<(Clip, String), String> {
    match line {
        Line::Reply(text) => parts
            .speaking
            .speak(text)
            .map(|clip| (clip, text.as_str().to_owned()))
            .map_err(|fault| fault.to_string()),
        Line::Said(phrase) => parts
            .clips
            .get(phrase)
            .cloned()
            .map(|clip| (clip, phrase.key().to_owned()))
            .ok_or_else(|| "The clip is not kept".to_owned()),
        Line::Partial => Err(PARTIAL.to_owned()),
    }
}

fn say(parts: &Parts, line: Line) {
    if !(parts.on)() {
        return;
    }
    let spoken = clip_of(parts, &line);
    let _floor = parts.floor.take();
    if (parts.stopped)() || !(parts.on)() {
        return;
    }
    (parts.status)(Phase::Speaking, None);
    let notice = match spoken {
        Err(reason) => Some(reason),
        Ok((clip, label)) => match parts.audio.speaker(clip.rate) {
            Err(error) => Some(format!("The speaker could not be opened: {error}")),
            Ok(speaker) => {
                parts.trace.mark_words("speech-started", &label);
                speaker.play(&clip)(&|| !(parts.on)());
                parts.trace.mark("speech-ended");
                None
            }
        },
    };
    let after = if (parts.on)() {
        Phase::Connecting
    } else {
        Phase::Ready
    };
    (parts.status)(after, notice);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        speech::{Fault, SpokenText, Standing},
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

    struct Voice(Arc<Mutex<Vec<usize>>>);

    impl Speaker for Voice {
        fn play(self: Box<Self>, clip: &Clip) -> crate::voice_parts::Finish {
            self.0.lock().unwrap().push(clip.pcm.len());
            Box::new(|_| {})
        }
    }

    struct Out(Arc<Mutex<Vec<usize>>>);

    impl Audio for Out {
        fn microphone(&self) -> io::Result<Box<dyn Frames>> {
            Err(io::Error::other("the speaker watcher never listens"))
        }

        fn speaker(&self, _: u32) -> io::Result<Box<dyn Speaker>> {
            Ok(Box::new(Voice(self.0.clone())))
        }
    }

    struct Reader;

    impl Speaking for Reader {
        fn render(&self, _: Phrase) -> Result<Clip, Fault> {
            Err(Fault::Unavailable("unused".into()))
        }

        fn speak(&self, text: &SpokenText) -> Result<Clip, Fault> {
            Ok(Clip {
                rate: 24_000,
                pcm: vec![0; text.as_str().len()],
            })
        }
    }

    struct Here(Standing);

    impl Voyager for Here {
        fn standing(&self) -> Standing {
            self.0
        }

        fn say(&self, _: &str) -> Result<(), crate::voice_parts::SendFailure> {
            Ok(())
        }
    }

    struct Rig {
        played: Arc<Mutex<Vec<usize>>>,
        replies: Replies,
        floor: Arc<Floor>,
        phases: Arc<Mutex<Vec<Phase>>>,
        stop: Arc<AtomicBool>,
        on: Arc<AtomicBool>,
    }

    impl Rig {
        fn start(standing: Standing) -> Self {
            let played = Arc::new(Mutex::default());
            let phases: Arc<Mutex<Vec<Phase>>> = Arc::default();
            let stop = Arc::new(AtomicBool::new(false));
            let replies = Replies::default();
            let floor = Arc::new(Floor::new());
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
                audio: Arc::new(Out(played.clone())),
                voyager: Arc::new(Here(standing)),
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
        rig.wait_for(1);
        let heard = "Renamed it. The rest is in the chat.".len();
        assert_eq!(rig.played.lock().unwrap().clone(), vec![heard]);
        thread::sleep(Duration::from_millis(250));
        assert_eq!(
            rig.phases.lock().unwrap().clone(),
            vec![Phase::Speaking, Phase::Connecting]
        );
    }

    #[test]
    fn a_spoken_reply_after_voice_was_clicked_off_is_not_read_aloud() {
        let rig = Rig::start(Standing::Idle);
        rig.on.store(false, Ordering::SeqCst);
        rig.say("p1", true, "Renamed it.");
        thread::sleep(Duration::from_millis(500));
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
                .position(|p| *p == Phrase::Blocked)
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
