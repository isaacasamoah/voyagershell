use crate::{
    speech::{Clip, Phrase, Speaking},
    voice_layer::{Audio, Phase, Trace, Voyager},
    voice_reply::{Line, Turns, Watcher},
};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
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
    pub turns: Arc<dyn Turns>,
    pub trace: Trace,
    pub floor: Arc<Mutex<()>>,
    pub status: Arc<dyn Fn(Phase, Option<String>) + Send + Sync>,
    pub stopped: Arc<dyn Fn() -> bool + Send + Sync>,
}

pub(crate) fn spawn(parts: Parts) {
    let mut watcher = Watcher::starting_at(&parts.turns.turns());
    thread::spawn(move || {
        let mut asked = Instant::now();
        while !(parts.stopped)() {
            thread::sleep(LOOK);
            let turns = parts.turns.turns();
            let lines = watcher.lines(&turns, Instant::now(), || {
                if asked.elapsed() >= STANDING_EVERY {
                    asked = Instant::now();
                    Some(parts.voyager.standing())
                } else {
                    None
                }
            });
            for line in lines {
                say(&parts, line);
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
    }
}

fn say(parts: &Parts, line: Line) {
    let _floor = parts
        .floor
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if (parts.stopped)() {
        return;
    }
    (parts.status)(Phase::Speaking, None);
    let notice = match clip_of(parts, &line) {
        Err(reason) => Some(reason),
        Ok((clip, label)) => match parts.audio.speaker(clip.rate) {
            Err(error) => Some(format!("The speaker could not be opened: {error}")),
            Ok(speaker) => {
                parts.trace.mark_words("speech-started", &label);
                speaker.play(&clip)();
                parts.trace.mark("speech-ended");
                None
            }
        },
    };
    (parts.status)(Phase::Ready, notice);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        speech::{Fault, SpokenText, Standing},
        voice_layer::{Frames, Speaker},
        voice_reply::{Ending, Turn},
    };
    use std::{
        io,
        sync::atomic::{AtomicBool, Ordering},
    };

    struct Voice(Arc<Mutex<Vec<usize>>>);

    impl Speaker for Voice {
        fn play(self: Box<Self>, clip: &Clip) -> Box<dyn FnOnce() + Send> {
            self.0.lock().unwrap().push(clip.pcm.len());
            Box::new(|| {})
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

    struct Fixed(Mutex<Vec<Turn>>);

    impl Turns for Fixed {
        fn turns(&self) -> Vec<Turn> {
            self.0.lock().unwrap().clone()
        }
    }

    struct Here(Standing);

    impl Voyager for Here {
        fn standing(&self) -> Standing {
            self.0
        }

        fn say(&self, _: &str) -> Result<(), String> {
            Ok(())
        }
    }

    struct Rig {
        played: Arc<Mutex<Vec<usize>>>,
        turns: Arc<Fixed>,
        floor: Arc<Mutex<()>>,
        phases: Arc<Mutex<Vec<Phase>>>,
        stop: Arc<AtomicBool>,
    }

    impl Rig {
        fn start(standing: Standing) -> Self {
            let played = Arc::new(Mutex::default());
            let phases: Arc<Mutex<Vec<Phase>>> = Arc::default();
            let stop = Arc::new(AtomicBool::new(false));
            let turns = Arc::new(Fixed(Mutex::default()));
            let floor = Arc::new(Mutex::new(()));
            let recorded = phases.clone();
            let halted = stop.clone();
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
                turns: turns.clone(),
                trace: Trace::off(),
                floor: floor.clone(),
                status: Arc::new(move |phase, _| recorded.lock().unwrap().push(phase)),
                stopped: Arc::new(move || halted.load(Ordering::SeqCst)),
            });
            Self {
                played,
                turns,
                floor,
                phases,
                stop,
            }
        }

        fn show(&self, turn: Turn) {
            self.turns.0.lock().unwrap().push(turn);
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

    fn turn(id: &str, spoken: bool, ending: Ending) -> Turn {
        Turn {
            id: id.into(),
            spoken,
            ending,
        }
    }

    #[test]
    fn a_spoken_reply_is_read_aloud_and_the_phase_returns_to_ready() {
        let rig = Rig::start(Standing::Idle);
        rig.show(turn(
            "p1",
            true,
            Ending::Text("Renamed it.\n\nMore.".into()),
        ));
        rig.wait_for(1);
        let heard = "Renamed it. The rest is in the chat.".len();
        assert_eq!(rig.played.lock().unwrap().clone(), vec![heard]);
        thread::sleep(Duration::from_millis(250));
        assert_eq!(
            rig.phases.lock().unwrap().clone(),
            vec![Phase::Speaking, Phase::Ready]
        );
    }

    #[test]
    fn a_typed_reply_makes_no_sound() {
        let rig = Rig::start(Standing::Idle);
        rig.show(turn("t1", false, Ending::Text("Typed answer.".into())));
        thread::sleep(Duration::from_millis(500));
        assert!(rig.played.lock().unwrap().is_empty());
    }

    #[test]
    fn a_failed_spoken_turn_plays_the_failure_clip() {
        let rig = Rig::start(Standing::Idle);
        rig.show(turn("p1", true, Ending::Failed));
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
        rig.show(turn("p1", true, Ending::Open));
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
    fn speech_waits_for_the_floor_while_an_exchange_holds_it() {
        let rig = Rig::start(Standing::Idle);
        let held = rig.floor.lock().unwrap();
        rig.show(turn("p1", true, Ending::Text("Done.".into())));
        thread::sleep(Duration::from_millis(500));
        assert!(rig.played.lock().unwrap().is_empty());
        drop(held);
        rig.wait_for(1);
        assert_eq!(rig.played.lock().unwrap().len(), 1);
    }
}
