use super::*;
use crate::{
    audio_io::{FRAME, SpeechDetector},
    speech::{Piece, Standing},
    voice_parts::{Clips, Frames, SendFailure},
};
use std::{
    collections::VecDeque,
    io,
    sync::atomic::{AtomicUsize, Ordering},
    time::Instant,
};

#[path = "voice_layer_talk_over_tests.rs"]
mod talk_over;

enum Step {
    Frame(Vec<i16>),
    Click,
    WantFloor,
    Fail,
    Reply(Reply),
    Wait(Duration),
    See(Arc<Mutex<Vec<Phase>>>),
    QuietUntil(Phase, usize),
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
                Some(Step::Reply(reply)) => {
                    let floor = self.floor.clone();
                    thread::spawn(move || drop(floor.offer(reply)));
                    while !self.floor.is_wanted() {
                        thread::yield_now();
                    }
                }
                Some(Step::Wait(time)) => thread::sleep(time),
                Some(Step::See(seen)) => {
                    let phase = self.shared.state.lock().unwrap().snapshot.phase.clone();
                    seen.lock().unwrap().push(phase);
                }
                Some(Step::QuietUntil(phase, frames)) => {
                    let reached = self.shared.state.lock().unwrap().snapshot.phase == phase;
                    if !reached && frames > 0 {
                        self.steps.push_front(Step::QuietUntil(phase, frames - 1));
                        thread::sleep(Duration::from_millis(1));
                        return Ok(quiet());
                    }
                }
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

type WhilePlaying = Arc<Mutex<Option<fn(&Shared)>>>;

struct Fake {
    mics: Mutex<VecDeque<Mic>>,
    played: Arc<Mutex<Vec<usize>>>,
    cut: Arc<Mutex<Vec<bool>>>,
    while_playing: WhilePlaying,
    opened: AtomicUsize,
    speakers: AtomicUsize,
    shared: Arc<Shared>,
    floor: Arc<Floor>,
    live: bool,
}

struct Voice {
    played: Arc<Mutex<Vec<usize>>>,
    cut: Arc<Mutex<Vec<bool>>>,
    while_playing: WhilePlaying,
    shared: Arc<Shared>,
}

impl Speaker for Voice {
    fn play(self: Box<Self>, clips: Clips) -> Finish {
        self.played
            .lock()
            .unwrap()
            .extend(clips.map(|clip| clip.pcm.len()));
        if let Some(act) = *self.while_playing.lock().unwrap() {
            act(&self.shared);
        }
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
        if self.live {
            return Ok(Box::new(talk_over::Live {
                played: self.played.clone(),
                cut: self.cut.clone(),
            }));
        }
        Ok(Box::new(Voice {
            played: self.played.clone(),
            cut: self.cut.clone(),
            while_playing: self.while_playing.clone(),
            shared: self.shared.clone(),
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

enum Model {
    Says(&'static str),
    Slow(&'static str),
    Fails,
}

impl Routing for Model {
    fn route(&self, heard: &str) -> Result<Route, Fault> {
        match self {
            Model::Says(answer) => Ok(Route::parse(heard, answer, Some(1.0))),
            Model::Slow(answer) => {
                thread::sleep(SLOW);
                Ok(Route::parse(heard, answer, Some(1.0)))
            }
            Model::Fails => Err(Fault::Failed("no route".into())),
        }
    }
}

const CHAT_CLIP: usize = 100;
const SLOW: Duration = Duration::from_millis(150);
const LOOK: &str = r#"{"kind": "work", "ack": "look"}"#;

struct Voiced {
    speaks: bool,
}

impl Speaking for Voiced {
    fn render(&self, _: Phrase) -> Result<Clip, Fault> {
        Err(Fault::Failed("not rendered here".into()))
    }

    fn speak(&self, _: Piece<'_>) -> Result<Clip, Fault> {
        if !self.speaks {
            return Err(Fault::Failed("no speech".into()));
        }
        Ok(Clip {
            rate: 24_000,
            pcm: vec![0; CHAT_CLIP],
        })
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

fn clips() -> Kept {
    clips_without(None)
}

fn clips_without(left_out: Option<Phrase>) -> Kept {
    Phrase::ALL
        .into_iter()
        .filter(|phrase| Some(*phrase) != left_out)
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
    model: Model,
    voiced: Voiced,
    audio: Fake,
    voyager: Standin,
    clips: Kept,
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
            model: Model::Says(LOOK),
            voiced: Voiced { speaks: true },
            audio: Fake {
                mics: Mutex::new(mics.into()),
                played: Arc::default(),
                cut: Arc::default(),
                while_playing: Arc::default(),
                opened: AtomicUsize::new(0),
                speakers: AtomicUsize::new(0),
                shared: shared.clone(),
                floor: floor.clone(),
                live: false,
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
            routing: &self.model,
            speaking: &self.voiced,
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

    fn notes(&self) -> Vec<String> {
        self.voyager.notes.lock().unwrap().clone()
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
    assert_eq!(rig.played(), vec![mark(Phrase::OneSec)]);
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
        vec![mark(Phrase::OneSec), mark(Phrase::LetMeLook)]
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
fn a_shutdown_while_the_acknowledgement_plays_cuts_it() {
    let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    *rig.audio.while_playing.lock().unwrap() =
        Some(|shared: &Shared| shared.update(|state| state.shutdown = true));
    rig.shared.update(|state| state.snapshot.on = true);
    rig.serve("open the roadmap");
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
        vec![mark(Phrase::NoMicrophone), mark(Phrase::OneSec)]
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
    assert_eq!(rig.played(), vec![mark(Phrase::Missed)]);
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
    assert_eq!(rig.played(), vec![mark(Phrase::OneSec)]);
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
        vec![mark(Phrase::OneSec), mark(Phrase::NotRunning)]
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
    assert_eq!(rig.played(), vec![mark(Phrase::OneSec)]);
    assert!(rig.voyager.notes.lock().unwrap().is_empty());
}

#[test]
fn empty_heard_text_says_nothing_more_and_sends_nothing() {
    for heard in ["", "  ", " ... "] {
        let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
        rig.serve(heard);
        assert!(rig.said().is_empty(), "{heard:?}");
        assert!(rig.played().is_empty(), "{heard:?}");
        assert_eq!(rig.opened(), 2, "{heard:?}");
    }
}

struct Watching {
    played: Arc<Mutex<Vec<usize>>>,
    before_hearing: Mutex<Option<Vec<usize>>>,
}

impl Hearing for Watching {
    fn hear(&self, _: &Utterance, _: &[String]) -> Result<String, Fault> {
        thread::sleep(SLOW);
        *self.before_hearing.lock().unwrap() = Some(self.played.lock().unwrap().clone());
        Ok("open the roadmap".into())
    }
}

#[test]
fn nothing_plays_while_slow_hearing_decides_the_turn() {
    let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    let hearing = Watching {
        played: rig.audio.played.clone(),
        before_hearing: Mutex::default(),
    };
    rig.serve_with(&hearing);
    assert_eq!(
        hearing.before_hearing.lock().unwrap().clone(),
        Some(Vec::new())
    );
    assert_eq!(rig.played(), vec![mark(Phrase::OneSec)]);
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

const SURE_CHAT: &str = r#"{"kind": "chat", "say": "I'm good, thanks."}"#;

#[test]
fn small_talk_is_answered_by_the_voice_and_nothing_reaches_voyager() {
    let mut rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    rig.model = Model::Says(SURE_CHAT);
    rig.serve("How are you?");
    assert!(rig.said().is_empty());
    assert_eq!(rig.played().last(), Some(&CHAT_CLIP));
    assert_eq!(rig.notes(), vec!["I'm good, thanks."]);
    assert!(rig.snapshot().on);
}

#[test]
fn small_talk_is_answered_whatever_voyagers_state() {
    for standing in [Standing::Working, Standing::Blocked, Standing::NotRunning] {
        let mut rig = Rig::new(vec![Mic::Opens(sentence())], standing, false);
        rig.model = Model::Says(SURE_CHAT);
        rig.serve("Hello.");
        assert!(rig.said().is_empty(), "{standing:?}");
        assert_eq!(rig.played().last(), Some(&CHAT_CLIP), "{standing:?}");
    }
}

#[test]
fn help_what_can_you_do_never_mind_and_cancel_reach_voyager_even_when_the_model_says_chat() {
    for heard in ["Help.", "What can you do?", "Never mind.", "Cancel that."] {
        let mut rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
        rig.model = Model::Says(SURE_CHAT);
        rig.serve(heard);
        assert_eq!(rig.said(), vec![format!("[spoken] {heard}")]);
        assert!(!rig.played().contains(&CHAT_CLIP), "{heard}");
    }
}

#[test]
fn a_chat_reply_that_promises_an_action_is_not_spoken_and_the_words_reach_voyager() {
    let mut rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    rig.model = Model::Says(r#"{"kind": "chat", "say": "Sure, I'll rename it."}"#);
    rig.serve("Rename it to Harbor.");
    assert_eq!(rig.said(), vec!["[spoken] Rename it to Harbor."]);
    assert!(rig.played().is_empty());
    assert!(rig.notes().is_empty());
}

#[test]
fn a_failed_route_or_a_chat_reply_that_cannot_be_spoken_still_reaches_voyager() {
    let mut failed = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    failed.model = Model::Fails;
    failed.serve("Hello.");
    let mut silent = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    silent.model = Model::Says(SURE_CHAT);
    silent.voiced = Voiced { speaks: false };
    silent.serve("Hello.");
    for rig in [failed, silent] {
        assert_eq!(rig.said(), vec!["[spoken] Hello."]);
        assert!(rig.played().is_empty());
    }
}

#[test]
fn a_fast_decision_plays_only_the_chat_reply() {
    let mut rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    rig.model = Model::Says(SURE_CHAT);
    rig.serve("Hello.");
    assert_eq!(rig.played(), vec![CHAT_CLIP]);
}

#[test]
fn a_slow_decision_plays_only_the_chat_reply_once_it_is_ready() {
    let mut rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    rig.model = Model::Slow(SURE_CHAT);
    rig.serve("Hello.");
    assert_eq!(rig.played(), vec![CHAT_CLIP]);
    assert!(rig.said().is_empty());
}

#[test]
fn a_request_for_voyager_plays_only_its_chosen_line_and_never_gets_a_chat_reply() {
    for (answer, played) in [
        (r#"{"kind": "work", "ack": "none"}"#, vec![]),
        (LOOK, vec![mark(Phrase::OneSec)]),
        (
            r#"{"kind": "work", "ack": "sure"}"#,
            vec![mark(Phrase::Sure)],
        ),
    ] {
        for model in [Model::Says(answer), Model::Slow(answer)] {
            let mut rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
            rig.model = model;
            rig.serve("Open the roadmap.");
            assert_eq!(rig.played(), played, "{answer}");
            assert_eq!(rig.said(), vec!["[spoken] Open the roadmap."], "{answer}");
        }
    }
}

#[test]
fn a_chat_reply_of_two_sentences_plays_each_sentence_in_order() {
    let mut rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    rig.model = Model::Says(r#"{"kind": "chat", "say": "I'm good, thanks. You?"}"#);
    rig.serve("How are you?");
    assert_eq!(rig.played(), vec![CHAT_CLIP, CHAT_CLIP]);
    assert!(rig.said().is_empty());
}

#[derive(Default)]
struct Gated {
    released: Mutex<bool>,
    opened: Condvar,
    began: AtomicUsize,
}

impl Gated {
    fn release(&self) {
        *self.released.lock().unwrap() = true;
        self.opened.notify_all();
    }
}

impl Hearing for Gated {
    fn hear(&self, _: &Utterance, _: &[String]) -> Result<String, Fault> {
        Ok(String::new())
    }
}

impl Routing for Gated {
    fn route(&self, _: &str) -> Result<Route, Fault> {
        Ok(Route::Voyager(Ack::None))
    }
}

impl Speaking for Gated {
    fn render(&self, _: Phrase) -> Result<Clip, Fault> {
        self.began.fetch_add(1, Ordering::SeqCst);
        let released = self.released.lock().unwrap();
        drop(self.opened.wait_while(released, |open| !*open).unwrap());
        Ok(Clip {
            rate: 24_000,
            pcm: vec![0; 2],
        })
    }

    fn speak(&self, _: Piece<'_>) -> Result<Clip, Fault> {
        Err(Fault::Failed("no speech".into()))
    }
}

struct Silent;

impl Audio for Silent {
    fn microphone(&self) -> io::Result<Box<dyn Frames>> {
        Err(io::Error::other("no device"))
    }

    fn speaker(&self, _: u32) -> io::Result<Box<dyn Speaker>> {
        Err(io::Error::other("no device"))
    }

    fn detector(&self) -> Box<dyn SpeechDetector> {
        Box::new(crate::audio_io::Loudness)
    }
}

fn until_true(what: &str, check: impl Fn() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(5);
    while !check() {
        assert!(Instant::now() < deadline, "timed out waiting for {what}");
        thread::sleep(Duration::from_millis(5));
    }
}

#[test]
fn voice_is_ready_while_a_clip_is_still_rendering_and_keeps_it_once_rendered() {
    let root = std::env::temp_dir().join(format!("voyager-ready-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    let settings = Settings {
        cache: root.join("voice"),
        directory: root.join("voice/omni"),
        server: None,
        gpu_layers: 0,
        huggingface: root.join("hf"),
    };
    let files = omni::Files {
        server: root.join("s"),
        model: root.join("m"),
        projector: root.join("p"),
    };
    let engine = Arc::new(Gated::default());
    let owner = Arc::new(Shared::new(Phase::Starting));
    let serving = {
        let (owner, engine) = (owner.clone(), engine.clone());
        let store = omni::Clips::new(&settings, &files);
        thread::spawn(move || {
            serve_ready(
                &owner,
                Ready {
                    engine,
                    store,
                    voyager: Arc::new(Standin {
                        standing: Standing::Idle,
                        said: Mutex::default(),
                        failure: None,
                        notes: Mutex::default(),
                    }),
                    replies: Replies::default(),
                    vocabulary: Arc::new(Vec::new),
                    audio: Arc::new(Silent),
                    trace: Trace::off(),
                },
            );
        })
    };
    until_true("the first clip render to begin", || {
        engine.began.load(Ordering::SeqCst) == 1
    });
    until_true("voice to be ready", || {
        owner.state.lock().unwrap().snapshot.phase == Phase::Ready
    });
    assert_eq!(engine.began.load(Ordering::SeqCst), 1);
    engine.release();
    let store = omni::Clips::new(&settings, &files);
    until_true("every clip to be kept", || {
        Phrase::ALL
            .into_iter()
            .all(|phrase| store.load(phrase).is_some())
    });
    owner.update(|state| state.shutdown = true);
    serving.join().unwrap();
    owner.set(Phase::Stopped, None);
    let _ = std::fs::remove_dir_all(&root);
}

#[path = "voice_layer_line_tests.rs"]
mod lines;
