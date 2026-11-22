use super::*;
use crate::{
    audio_io::{FRAME, SpeechDetector},
    speech::Standing,
    voice_parts::{Clips, Frames, SendFailure},
};
use std::{
    collections::VecDeque,
    io,
    sync::atomic::{AtomicUsize, Ordering},
    time::Instant,
};

enum Step {
    Frame(Vec<i16>),
    Click,
    WantFloor,
    Fail,
}

enum Mic {
    Opens(Vec<Step>),
    Refuses,
}

struct Script {
    steps: VecDeque<Step>,
    shared: Arc<Shared>,
    floor: Arc<Floor>,
}

impl Frames for Script {
    fn frame(&mut self) -> io::Result<Vec<i16>> {
        loop {
            match self.steps.pop_front() {
                Some(Step::Frame(frame)) => return Ok(frame),
                Some(Step::Click) => click(&self.shared),
                Some(Step::WantFloor) => self.floor.wanted.store(true, Ordering::SeqCst),
                Some(Step::Fail) => return Err(io::Error::other("ended")),
                None => {
                    self.shared.update(|state| state.shutdown = true);
                    return Ok(quiet());
                }
            }
        }
    }
}

fn click(shared: &Shared) {
    shared.update(|state| state.snapshot.on = !state.snapshot.on);
}

struct Fake {
    mics: Mutex<VecDeque<Mic>>,
    played: Arc<Mutex<Vec<usize>>>,
    cut: Arc<Mutex<Vec<bool>>>,
    opened: AtomicUsize,
    speakers: AtomicUsize,
    shared: Arc<Shared>,
    floor: Arc<Floor>,
}

struct Voice {
    played: Arc<Mutex<Vec<usize>>>,
    cut: Arc<Mutex<Vec<bool>>>,
}

impl Speaker for Voice {
    fn play(self: Box<Self>, clips: Clips) -> Finish {
        self.played
            .lock()
            .unwrap()
            .extend(clips.map(|clip| clip.pcm.len()));
        Box::new(move |cut| self.cut.lock().unwrap().push(cut()))
    }
}

impl Audio for Fake {
    fn microphone(&self) -> io::Result<Box<dyn Frames>> {
        self.opened.fetch_add(1, Ordering::SeqCst);
        match self.mics.lock().unwrap().pop_front() {
            Some(Mic::Refuses) => Err(io::Error::other("no device")),
            Some(Mic::Opens(steps)) => Ok(Box::new(Script {
                steps: steps.into(),
                shared: self.shared.clone(),
                floor: self.floor.clone(),
            })),
            None => Ok(Box::new(Script {
                steps: VecDeque::new(),
                shared: self.shared.clone(),
                floor: self.floor.clone(),
            })),
        }
    }

    fn speaker(&self, _: u32) -> io::Result<Box<dyn Speaker>> {
        self.speakers.fetch_add(1, Ordering::SeqCst);
        Ok(Box::new(Voice {
            played: self.played.clone(),
            cut: self.cut.clone(),
        }))
    }

    fn detector(&self) -> Box<dyn SpeechDetector> {
        Box::new(crate::audio_io::Loudness)
    }
}

struct Heard(&'static str);

impl Hearing for Heard {
    fn hear(&self, _: &Utterance, _: &[String]) -> Result<String, Fault> {
        Ok(self.0.into())
    }
}

struct Standin {
    standing: Standing,
    said: Mutex<Vec<String>>,
    failure: Option<SendFailure>,
    notes: Mutex<Vec<String>>,
}

impl Voyager for Standin {
    fn standing(&self) -> Standing {
        self.standing
    }
    fn say(&self, text: &str) -> Result<(), SendFailure> {
        if let Some(failure) = &self.failure {
            return Err(failure.clone());
        }
        self.said.lock().unwrap().push(text.into());
        Ok(())
    }
    fn note(&self, line: &str) {
        self.notes.lock().unwrap().push(line.into());
    }
}

fn loud() -> Vec<i16> {
    (0..FRAME)
        .map(|i| {
            let at = i as f32 / crate::speech::SAMPLE_RATE as f32;
            (4000.0 * (std::f32::consts::TAU * 1000.0 * at).sin()) as i16
        })
        .collect()
}

fn quiet() -> Vec<i16> {
    vec![5; FRAME]
}

fn frames(frame: fn() -> Vec<i16>, count: usize) -> Vec<Step> {
    (0..count).map(|_| Step::Frame(frame())).collect()
}

fn spoken(count: usize) -> Vec<Step> {
    const SYLLABLES: [f32; 5] = [1.0, 0.7, 0.35, 0.9, 0.3];
    (0..count)
        .map(|index| {
            let strength = SYLLABLES[index % SYLLABLES.len()];
            Step::Frame(
                loud()
                    .into_iter()
                    .map(|sample| (f32::from(sample) * strength) as i16)
                    .collect(),
            )
        })
        .collect()
}

fn sentence() -> Vec<Step> {
    let mut steps = frames(quiet, 20);
    steps.extend(spoken(20));
    steps.extend(frames(quiet, 80));
    steps
}

fn clips() -> HashMap<Phrase, Clip> {
    Phrase::ALL
        .into_iter()
        .map(|phrase| {
            (
                phrase,
                Clip {
                    rate: 24_000,
                    pcm: vec![0; mark(phrase)],
                },
            )
        })
        .collect()
}

fn mark(phrase: Phrase) -> usize {
    Phrase::ALL.iter().position(|each| *each == phrase).unwrap() + 1
}

struct Rig {
    audio: Fake,
    voyager: Standin,
    clips: HashMap<Phrase, Clip>,
    shared: Arc<Shared>,
    floor: Arc<Floor>,
}

impl Rig {
    fn new(mics: Vec<Mic>, standing: Standing, refuse: bool) -> Self {
        let failure = refuse.then(|| SendFailure {
            reason: "Not sent. Voyager needs you on Home".into(),
            refused: true,
            phrase: Phrase::NotRunning,
        });
        Self::failing(mics, standing, failure)
    }

    fn failing(mics: Vec<Mic>, standing: Standing, failure: Option<SendFailure>) -> Self {
        let shared = Arc::new(Shared::new(Phase::Ready));
        let floor = Arc::new(Floor::default());
        Self {
            audio: Fake {
                mics: Mutex::new(mics.into()),
                played: Arc::default(),
                cut: Arc::default(),
                opened: AtomicUsize::new(0),
                speakers: AtomicUsize::new(0),
                shared: shared.clone(),
                floor: floor.clone(),
            },
            voyager: Standin {
                standing,
                said: Mutex::default(),
                failure,
                notes: Mutex::default(),
            },
            clips: clips(),
            shared,
            floor,
        }
    }

    fn exchange<'a>(
        &'a self,
        hearing: &'a dyn Hearing,
        vocabulary: &'a Vocabulary,
    ) -> Exchange<'a> {
        Exchange {
            hearing,
            clips: &self.clips,
            audio: &self.audio,
            voyager: &self.voyager,
            vocabulary,
            trace: &TRACE,
            shared: &self.shared,
            floor: &self.floor,
        }
    }

    fn serve(&self, heard: &'static str) {
        self.serve_with(&Heard(heard));
    }

    fn serve_with(&self, hearing: &dyn Hearing) {
        self.shared.update(|state| state.snapshot.on = true);
        let vocabulary: Vocabulary = Arc::new(|| vec!["Harbor".into()]);
        self.exchange(hearing, &vocabulary)
            .serve(Duration::from_millis(5));
    }

    fn said(&self) -> Vec<String> {
        self.voyager.said.lock().unwrap().clone()
    }

    fn played(&self) -> Vec<usize> {
        self.audio.played.lock().unwrap().clone()
    }

    fn opened(&self) -> usize {
        self.audio.opened.load(Ordering::SeqCst)
    }

    fn snapshot(&self) -> Snapshot {
        self.shared.state.lock().unwrap().snapshot.clone()
    }
}

static TRACE: std::sync::LazyLock<Trace> = std::sync::LazyLock::new(Trace::off);

#[test]
fn a_heard_request_is_acknowledged_sent_and_listening_resumes() {
    let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    rig.serve("Rename this fleet to Harbor.");
    assert_eq!(rig.said(), vec!["[spoken] Rename this fleet to Harbor."]);
    assert!(crate::spoken::is_spoken(&rig.said()[0]));
    assert_eq!(rig.played(), vec![mark(Phrase::Asking)]);
    assert_eq!(rig.opened(), 2);
    assert!(rig.snapshot().on);
}

#[test]
fn two_requests_in_a_row_are_two_turns_without_another_click() {
    let rig = Rig::new(
        vec![Mic::Opens(sentence()), Mic::Opens(sentence())],
        Standing::Idle,
        false,
    );
    rig.serve("open the roadmap");
    assert_eq!(rig.said().len(), 2);
    assert_eq!(
        rig.played(),
        vec![mark(Phrase::Asking), mark(Phrase::OkayAsking)]
    );
    assert!(rig.snapshot().on);
}

#[test]
fn a_silent_room_keeps_voice_on_and_says_nothing() {
    let rig = Rig::new(vec![Mic::Opens(frames(quiet, 3000))], Standing::Idle, false);
    rig.serve("anything");
    assert!(rig.said().is_empty());
    assert!(rig.played().is_empty());
    assert_eq!(rig.opened(), 1);
    let snapshot = rig.snapshot();
    assert!(snapshot.on);
    assert_eq!(snapshot.phase, Phase::Listening);
}

#[test]
fn the_phase_is_connecting_until_the_floor_settles_then_listening() {
    let rig = Rig::new(vec![Mic::Opens(frames(quiet, 3))], Standing::Idle, false);
    rig.serve("anything");
    assert_eq!(rig.snapshot().phase, Phase::Connecting);
    let rig = Rig::new(vec![Mic::Opens(frames(quiet, 30))], Standing::Idle, false);
    rig.serve("anything");
    assert_eq!(rig.snapshot().phase, Phase::Listening);
}

#[test]
fn a_click_mid_sentence_turns_voice_off_and_drops_what_was_said() {
    let mut steps = frames(quiet, 20);
    steps.extend(spoken(20));
    steps.push(Step::Click);
    steps.extend(frames(quiet, 80));
    let rig = Rig::new(vec![Mic::Opens(steps)], Standing::Idle, false);
    rig.shared.update(|state| state.snapshot.on = true);
    thread::scope(|scope| {
        scope.spawn(|| rig.serve("open the roadmap"));
        wait_until(|| {
            let snapshot = rig.snapshot();
            !snapshot.on && snapshot.phase == Phase::Ready
        });
        rig.shared.update(|state| state.shutdown = true);
    });
    assert!(rig.said().is_empty());
    assert!(rig.played().is_empty());
    assert!(!rig.snapshot().on);
    assert_eq!(rig.opened(), 1);
}

#[test]
fn a_click_while_the_acknowledgement_plays_lets_it_finish_and_the_request_still_goes() {
    struct Clicking(Arc<Shared>);
    impl Hearing for Clicking {
        fn hear(&self, _: &Utterance, _: &[String]) -> Result<String, Fault> {
            click(&self.0);
            Ok("open the roadmap".into())
        }
    }
    let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    rig.shared.update(|state| state.snapshot.on = true);
    thread::scope(|scope| {
        scope.spawn(|| rig.serve_with(&Clicking(rig.shared.clone())));
        wait_until(|| {
            let snapshot = rig.snapshot();
            !snapshot.on && snapshot.phase == Phase::Ready
        });
        rig.shared.update(|state| state.shutdown = true);
    });
    assert_eq!(rig.said(), vec!["[spoken] open the roadmap"]);
    assert_eq!(rig.played(), vec![mark(Phrase::Asking)]);
    assert_eq!(rig.audio.cut.lock().unwrap().clone(), vec![false]);
    assert_eq!(rig.opened(), 1);
}

#[test]
fn a_shutdown_while_the_acknowledgement_plays_cuts_it() {
    struct Closing(Arc<Shared>);
    impl Hearing for Closing {
        fn hear(&self, _: &Utterance, _: &[String]) -> Result<String, Fault> {
            self.0.update(|state| state.shutdown = true);
            Ok("open the roadmap".into())
        }
    }
    let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    rig.shared.update(|state| state.snapshot.on = true);
    rig.serve_with(&Closing(rig.shared.clone()));
    assert_eq!(rig.audio.cut.lock().unwrap().clone(), vec![true]);
}

#[test]
fn a_click_off_while_a_reply_holds_the_floor_never_opens_the_microphone_again() {
    let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    let held = rig.floor.hold();
    thread::scope(|scope| {
        scope.spawn(|| rig.serve("open the roadmap"));
        thread::sleep(Duration::from_millis(100));
        click(&rig.shared);
        drop(held);
        thread::sleep(Duration::from_millis(150));
        wait_until(|| {
            let snapshot = rig.snapshot();
            !snapshot.on && snapshot.phase == Phase::Ready
        });
        rig.shared.update(|state| state.shutdown = true);
    });
    assert_eq!(rig.opened(), 0);
    assert!(rig.said().is_empty());
}

#[test]
fn a_microphone_that_cannot_open_is_announced_once_and_retried_until_it_hears() {
    let rig = Rig::new(
        vec![Mic::Refuses, Mic::Refuses, Mic::Opens(sentence())],
        Standing::Idle,
        false,
    );
    rig.serve("open the roadmap");
    assert_eq!(
        rig.played(),
        vec![mark(Phrase::NoMicrophone), mark(Phrase::Asking)]
    );
    assert_eq!(rig.said().len(), 1);
    assert!(rig.snapshot().on);
}

#[test]
fn a_stream_that_ends_shows_no_microphone_and_keeps_voice_on() {
    let mut steps = frames(quiet, 30);
    steps.push(Step::Fail);
    let mut mics = vec![Mic::Opens(steps)];
    mics.extend((0..1000).map(|_| Mic::Refuses));
    let rig = Rig::new(mics, Standing::Idle, false);
    thread::scope(|scope| {
        scope.spawn(|| rig.serve("x"));
        wait_until(|| rig.opened() >= 3);
        rig.shared.update(|state| state.shutdown = true);
    });
    let snapshot = rig.snapshot();
    assert_eq!(snapshot.phase, Phase::NoMicrophone);
    assert!(snapshot.on);
    assert_eq!(rig.played(), vec![mark(Phrase::NoMicrophone)]);
}

#[test]
fn a_hearing_fault_says_it_did_not_catch_that_and_listening_resumes() {
    struct Down;
    impl Hearing for Down {
        fn hear(&self, _: &Utterance, _: &[String]) -> Result<String, Fault> {
            Err(Fault::Failed("The voice engine did not answer".into()))
        }
    }
    let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    rig.serve_with(&Down);
    assert!(rig.said().is_empty());
    assert_eq!(
        rig.played(),
        vec![mark(Phrase::Asking), mark(Phrase::Missed)]
    );
    assert_eq!(rig.opened(), 2);
    assert_eq!(
        rig.snapshot().notice.as_deref(),
        Some("The voice engine did not answer")
    );
}

#[test]
fn a_reply_waiting_for_the_floor_closes_the_microphone_before_speech_starts() {
    let mut steps = frames(quiet, 20);
    steps.push(Step::WantFloor);
    steps.extend(frames(quiet, 20));
    let rig = Rig::new(vec![Mic::Opens(steps)], Standing::Idle, false);
    rig.shared.update(|state| state.snapshot.on = true);
    let vocabulary: Vocabulary = Arc::new(Vec::new);
    let listened = rig.exchange(&Heard("x"), &vocabulary).listen();
    assert!(matches!(listened, Listened::StepAside));
}

#[test]
fn a_reply_waits_through_a_short_gap_after_the_first_word() {
    let mut steps = frames(quiet, 20);
    steps.extend(spoken(8));
    steps.push(Step::WantFloor);
    steps.extend(frames(quiet, 9));
    steps.extend(spoken(30));
    steps.extend(frames(quiet, 80));
    let rig = Rig::new(vec![Mic::Opens(steps)], Standing::Idle, false);
    rig.shared.update(|state| state.snapshot.on = true);
    let vocabulary: Vocabulary = Arc::new(Vec::new);
    let listened = rig.exchange(&Heard("x"), &vocabulary).listen();
    assert!(matches!(listened, Listened::Turn(..)));
}

#[test]
fn a_reply_waits_at_most_three_seconds_in_a_room_that_is_never_quiet() {
    let mut steps = frames(quiet, 20);
    steps.push(Step::WantFloor);
    for _ in 0..60 {
        steps.extend(spoken(3));
        steps.extend(frames(quiet, 3));
    }
    let rig = Rig::new(vec![Mic::Opens(steps)], Standing::Idle, false);
    rig.shared.update(|state| state.snapshot.on = true);
    let vocabulary: Vocabulary = Arc::new(Vec::new);
    let listened = rig.exchange(&Heard("x"), &vocabulary).listen();
    assert!(matches!(listened, Listened::StepAside));
}

#[test]
fn a_reply_waits_while_the_person_is_mid_sentence() {
    let mut steps = frames(quiet, 20);
    steps.extend(spoken(12));
    steps.push(Step::WantFloor);
    steps.extend(spoken(10));
    steps.extend(frames(quiet, 80));
    let rig = Rig::new(vec![Mic::Opens(steps)], Standing::Idle, false);
    rig.shared.update(|state| state.snapshot.on = true);
    let vocabulary: Vocabulary = Arc::new(Vec::new);
    let listened = rig.exchange(&Heard("x"), &vocabulary).listen();
    assert!(matches!(listened, Listened::Turn(..)));
}

#[test]
fn a_blocked_voyager_is_told_and_receives_nothing() {
    let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Blocked, false);
    rig.serve("open the roadmap");
    assert!(rig.said().is_empty());
    assert_eq!(rig.played(), vec![mark(Phrase::NeedsYou)]);
}

#[test]
fn a_live_voyager_with_no_state_yet_receives_the_words() {
    let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Unknown, false);
    rig.serve("open the roadmap");
    assert_eq!(rig.said(), vec!["[spoken] open the roadmap"]);
    assert_eq!(rig.played(), vec![mark(Phrase::Asking)]);
}

#[test]
fn a_gone_or_ended_voyager_is_told_it_is_not_running_and_receives_nothing() {
    let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::NotRunning, false);
    rig.serve("open the roadmap");
    assert!(rig.said().is_empty());
    assert_eq!(rig.played(), vec![mark(Phrase::Gone)]);
}

#[test]
fn a_busy_voyager_gets_the_words_and_the_queued_phrase() {
    let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Working, false);
    rig.serve("open the roadmap");
    assert_eq!(rig.said().len(), 1);
    assert_eq!(rig.played(), vec![mark(Phrase::Queued)]);
}

#[test]
fn a_refused_send_is_said_aloud_once_and_put_in_the_chat_and_never_retried() {
    let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, true);
    rig.serve("open the roadmap");
    let notice = rig.snapshot().notice.unwrap();
    assert_eq!(notice, "Not sent. Voyager needs you on Home");
    assert!(rig.said().is_empty());
    assert_eq!(
        rig.played(),
        vec![mark(Phrase::Asking), mark(Phrase::NotRunning)]
    );
    assert_eq!(
        rig.voyager.notes.lock().unwrap().clone(),
        vec!["Not sent. Voyager needs you on Home"]
    );
}

#[test]
fn an_unconfirmed_send_stays_silent_and_out_of_the_chat() {
    let failure = SendFailure {
        reason: "The send is unconfirmed and was not repeated. Core did not answer".into(),
        refused: false,
        phrase: Phrase::NotRunning,
    };
    let rig = Rig::failing(vec![Mic::Opens(sentence())], Standing::Idle, Some(failure));
    rig.serve("open the roadmap");
    assert!(rig.snapshot().notice.unwrap().contains("unconfirmed"));
    assert_eq!(rig.played(), vec![mark(Phrase::Asking)]);
    assert!(rig.voyager.notes.lock().unwrap().is_empty());
}

#[test]
fn empty_heard_text_says_nothing_more_and_sends_nothing() {
    for heard in ["", "  ", " ... "] {
        let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
        rig.serve(heard);
        assert!(rig.said().is_empty(), "{heard:?}");
        assert_eq!(rig.played(), vec![mark(Phrase::Asking)], "{heard:?}");
        assert_eq!(rig.opened(), 2, "{heard:?}");
    }
}

struct Watching {
    played: Arc<Mutex<Vec<usize>>>,
    before_hearing: Mutex<Option<Vec<usize>>>,
}

impl Hearing for Watching {
    fn hear(&self, _: &Utterance, _: &[String]) -> Result<String, Fault> {
        *self.before_hearing.lock().unwrap() = Some(self.played.lock().unwrap().clone());
        Ok("open the roadmap".into())
    }
}

#[test]
fn the_acknowledgement_has_started_before_hearing_begins() {
    let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    let hearing = Watching {
        played: rig.audio.played.clone(),
        before_hearing: Mutex::default(),
    };
    rig.serve_with(&hearing);
    assert_eq!(
        hearing.before_hearing.lock().unwrap().clone(),
        Some(vec![mark(Phrase::Asking)])
    );
    assert_eq!(rig.said(), vec!["[spoken] open the roadmap"]);
}

#[test]
fn the_speaker_is_opened_with_the_microphone_so_the_clip_starts_at_once() {
    let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    rig.serve("open the roadmap");
    assert_eq!(rig.audio.speakers.load(Ordering::SeqCst), 2);
    assert_eq!(rig.opened(), 2);
}

#[test]
fn nothing_is_captured_until_a_click_asks_for_it() {
    let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    let vocabulary: Vocabulary = Arc::new(Vec::new);
    thread::scope(|scope| {
        scope.spawn(|| {
            rig.exchange(&Heard("x"), &vocabulary)
                .serve(Duration::from_millis(5))
        });
        wait_until(|| rig.snapshot().phase == Phase::Ready);
        assert_eq!(rig.opened(), 0);
        rig.shared.update(|state| state.shutdown = true);
    });
    assert_eq!(rig.opened(), 0);
}

#[test]
fn a_click_turns_voice_on_and_a_second_click_turns_it_off() {
    let layer = Layer {
        shared: Arc::new(Shared::new(Phase::Ready)),
    };
    layer.click();
    assert!(layer.snapshot().on);
    layer.click();
    assert!(!layer.snapshot().on);
}

#[test]
fn a_click_before_the_engine_is_ready_does_nothing() {
    let layer = Layer {
        shared: Arc::new(Shared::new(Phase::Starting)),
    };
    layer.click();
    assert!(!layer.snapshot().on);
}

fn wait_until(ready: impl Fn() -> bool) {
    let until = Instant::now() + Duration::from_secs(3);
    while !ready() && Instant::now() < until {
        thread::sleep(Duration::from_millis(5));
    }
    assert!(ready());
}
