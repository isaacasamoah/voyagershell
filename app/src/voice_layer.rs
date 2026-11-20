use crate::{
    audio_io::{Gate, Heard as GateHeard},
    client::Client,
    omni::{self, Clips, Omni, Running, Settings},
    replies::Replies,
    speech::{
        Acknowledgement, Clip, Fault, Hearing, Phrase, Utterance, acknowledge, heard_nothing,
    },
    voice_parts::{Audio, Finish, Phase, Speaker, Trace, Voyager},
    voice_speaker,
};
use std::{
    collections::HashMap,
    sync::{
        Arc, Condvar, Mutex, MutexGuard,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

pub type Vocabulary = Arc<dyn Fn() -> Vec<String> + Send + Sync>;

const MICROPHONE_RETRY: Duration = Duration::from_secs(3);
const FLOOR_LOOK: Duration = Duration::from_millis(10);
const REPLY_WAIT_FRAMES: usize = 150;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Snapshot {
    pub version: u64,
    pub phase: Phase,
    pub notice: Option<String>,
    pub on: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Wanted {
    On,
    Off,
    Shutdown,
}

struct State {
    snapshot: Snapshot,
    shutdown: bool,
}

struct Shared {
    state: Mutex<State>,
    changed: Condvar,
}

impl Shared {
    fn new(phase: Phase) -> Self {
        Self {
            state: Mutex::new(State {
                snapshot: Snapshot {
                    version: 0,
                    phase,
                    notice: None,
                    on: false,
                },
                shutdown: false,
            }),
            changed: Condvar::new(),
        }
    }

    fn update(&self, change: impl FnOnce(&mut State)) {
        if let Ok(mut state) = self.state.lock() {
            change(&mut state);
            state.snapshot.version += 1;
            self.changed.notify_all();
        }
    }

    fn has_stopped(&self) -> bool {
        self.state
            .lock()
            .map(|state| state.snapshot.phase == Phase::Stopped)
            .unwrap_or(true)
    }

    fn set(&self, phase: Phase, notice: Option<String>) {
        self.update(|state| {
            state.snapshot.phase = phase;
            state.snapshot.notice = notice;
        });
    }

    fn phase(&self, phase: Phase) {
        self.update(|state| state.snapshot.phase = phase);
    }

    fn wanted(&self) -> Wanted {
        match self.state.lock() {
            Ok(state) if state.shutdown => Wanted::Shutdown,
            Ok(state) if state.snapshot.on => Wanted::On,
            Ok(_) => Wanted::Off,
            Err(_) => Wanted::Shutdown,
        }
    }

    fn is_on(&self) -> bool {
        self.wanted() == Wanted::On
    }

    fn wait_while_off(&self) -> Wanted {
        let Ok(state) = self.state.lock() else {
            return Wanted::Shutdown;
        };
        match self
            .changed
            .wait_while(state, |state| !state.shutdown && !state.snapshot.on)
        {
            Ok(state) if state.shutdown => Wanted::Shutdown,
            Ok(_) => Wanted::On,
            Err(_) => Wanted::Shutdown,
        }
    }

    fn wait_while_on(&self, within: Duration) -> Wanted {
        let Ok(state) = self.state.lock() else {
            return Wanted::Shutdown;
        };
        match self
            .changed
            .wait_timeout_while(state, within, |state| !state.shutdown && state.snapshot.on)
        {
            Ok((state, _)) if state.shutdown => Wanted::Shutdown,
            Ok((state, _)) if state.snapshot.on => Wanted::On,
            Ok(_) => Wanted::Off,
            Err(_) => Wanted::Shutdown,
        }
    }
}

#[derive(Clone)]
pub struct Layer {
    shared: Arc<Shared>,
}

impl Layer {
    pub fn snapshot(&self) -> Snapshot {
        self.shared
            .state
            .lock()
            .map(|state| state.snapshot.clone())
            .unwrap_or(Snapshot {
                version: 0,
                phase: Phase::Unavailable("Voice state is unavailable".into()),
                notice: None,
                on: false,
            })
    }

    pub fn wait_changed(&self, seen: u64, within: Duration) -> Snapshot {
        let Ok(state) = self.shared.state.lock() else {
            return self.snapshot();
        };
        self.shared
            .changed
            .wait_timeout_while(state, within, |state| state.snapshot.version == seen)
            .map(|(state, _)| state.snapshot.clone())
            .unwrap_or_else(|_| self.snapshot())
    }

    pub fn click(&self) {
        self.shared.update(|state| {
            let usable = !matches!(
                state.snapshot.phase,
                Phase::Starting | Phase::Unavailable(_) | Phase::Stopped
            );
            if usable {
                state.snapshot.on = !state.snapshot.on;
            }
        });
    }

    pub fn shutdown(&self, within: Duration) {
        self.shared.update(|state| state.shutdown = true);
        let _ = self.wait_stopped(within);
    }

    fn wait_stopped(&self, within: Duration) -> bool {
        let Ok(state) = self.shared.state.lock() else {
            return false;
        };
        self.shared
            .changed
            .wait_timeout_while(state, within, |state| {
                state.snapshot.phase != Phase::Stopped
            })
            .map(|(state, _)| state.snapshot.phase == Phase::Stopped)
            .unwrap_or(false)
    }
}

pub(crate) struct Floor {
    lock: Mutex<()>,
    wanted: AtomicBool,
}

impl Floor {
    pub(crate) fn new() -> Self {
        Self {
            lock: Mutex::new(()),
            wanted: AtomicBool::new(false),
        }
    }

    pub(crate) fn take(&self) -> MutexGuard<'_, ()> {
        self.wanted.store(true, Ordering::SeqCst);
        let guard = self
            .lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        self.wanted.store(false, Ordering::SeqCst);
        guard
    }

    pub(crate) fn hold(&self) -> MutexGuard<'_, ()> {
        while self.wanted.load(Ordering::SeqCst) {
            thread::sleep(FLOOR_LOOK);
        }
        self.lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub(crate) fn is_wanted(&self) -> bool {
        self.wanted.load(Ordering::SeqCst)
    }
}

struct Exchange<'a> {
    hearing: &'a dyn Hearing,
    clips: &'a HashMap<Phrase, Clip>,
    audio: &'a dyn Audio,
    voyager: &'a dyn Voyager,
    vocabulary: &'a Vocabulary,
    trace: &'a Trace,
    shared: &'a Shared,
    floor: &'a Floor,
}

enum Listened {
    Off,
    Shutdown,
    StepAside,
    NoMicrophone(String),
    Turn(Utterance, Option<Box<dyn Speaker>>),
}

impl Exchange<'_> {
    fn listen(&self) -> Listened {
        self.shared.phase(Phase::Connecting);
        let mut microphone = match self.audio.microphone() {
            Ok(microphone) => microphone,
            Err(error) => return Listened::NoMicrophone(error.to_string()),
        };
        self.trace.mark("capture-open");
        let rate = self.clips.values().next().map_or(24_000, |clip| clip.rate);
        let speaker = self.audio.speaker(rate).ok();
        let mut gate = Gate::default();
        let mut waited = 0;
        loop {
            match self.shared.wanted() {
                Wanted::On => {}
                Wanted::Off => return Listened::Off,
                Wanted::Shutdown => return Listened::Shutdown,
            }
            waited = if self.floor.is_wanted() {
                waited + 1
            } else {
                0
            };
            let waited_long = waited > REPLY_WAIT_FRAMES && !gate.speaking();
            if waited > 0 && (gate.quiet() || waited_long) {
                return Listened::StepAside;
            }
            let Ok(frame) = microphone.frame() else {
                return Listened::NoMicrophone("The microphone stream ended".into());
            };
            match gate.push(frame) {
                Some(GateHeard::Settled) => {
                    self.trace.mark("listening");
                    self.shared.phase(Phase::Listening);
                }
                Some(GateHeard::Ended(_)) => {
                    return Listened::Turn(
                        Utterance {
                            samples: gate.utterance(),
                        },
                        speaker,
                    );
                }
                None => {}
            }
        }
    }

    fn play(&self, phrase: Phrase, ready: Option<Box<dyn Speaker>>) -> Option<Finish> {
        if !self.shared.is_on() {
            return None;
        }
        let clip = self.clips.get(&phrase)?;
        let speaker = ready.or_else(|| self.audio.speaker(clip.rate).ok())?;
        Some(speaker.play(clip))
    }

    fn finish(&self, finish: Option<Finish>) {
        if let Some(done) = finish {
            done(&|| !self.shared.is_on());
        }
    }

    fn say_once(&self, phrase: Phrase) {
        let finish = self.play(phrase, None);
        self.trace.mark_words("notice-started", phrase.key());
        self.finish(finish);
    }

    fn answer(&self, turn: u64, utterance: Utterance, speaker: Option<Box<dyn Speaker>>) {
        let standing = self.voyager.standing();
        self.trace.mark("utterance-ended");
        let Acknowledgement { phrase, send } = acknowledge(standing, turn);
        let mut finish = self.play(phrase, speaker);
        self.trace
            .mark_words("acknowledgement-started", phrase.key());
        self.shared.set(Phase::Hearing, None);
        let mut notice = None;
        match self.hearing.hear(&utterance, &(self.vocabulary)()) {
            Ok(heard) => {
                self.trace.mark_words("heard", &heard);
                if heard_nothing(&heard) {
                    self.finish(finish.take());
                    finish = self.play(Phrase::Missed, None);
                    self.trace
                        .mark_words("acknowledgement-started", Phrase::Missed.key());
                } else if send {
                    match self.voyager.say(&crate::spoken::prompt(&heard)) {
                        Ok(()) => self.trace.mark("sent"),
                        Err(failure) => {
                            if failure.refused {
                                self.voyager.note(&failure.reason);
                                if let Some(done) = finish.take() {
                                    done(&|| !self.shared.is_on());
                                }
                                finish = self.play(Phrase::NotRunning, None);
                                self.trace
                                    .mark_words("refusal-started", Phrase::NotRunning.key());
                            }
                            notice = Some(failure.reason);
                        }
                    }
                }
            }
            Err(fault) => {
                self.finish(finish.take());
                finish = self.play(Phrase::Missed, None);
                self.trace
                    .mark_words("acknowledgement-started", Phrase::Missed.key());
                notice = Some(fault.to_string());
            }
        }
        self.shared.set(Phase::Acknowledging, notice.clone());
        self.finish(finish);
        self.shared.set(Phase::Connecting, notice);
    }

    fn serve(&self, retry: Duration) {
        let mut turn = 0u64;
        let mut said_no_microphone = false;
        loop {
            if self.shared.wanted() == Wanted::Off {
                self.shared.set(Phase::Ready, None);
                said_no_microphone = false;
            }
            if self.shared.wait_while_off() == Wanted::Shutdown {
                return;
            }
            let floor = self.floor.hold();
            match self.listen() {
                Listened::Off | Listened::StepAside => {}
                Listened::Shutdown => return,
                Listened::Turn(utterance, speaker) => {
                    said_no_microphone = false;
                    self.answer(turn, utterance, speaker);
                    turn += 1;
                }
                Listened::NoMicrophone(reason) => {
                    self.shared.set(
                        Phase::NoMicrophone,
                        Some(format!("Can't hear the microphone: {reason}")),
                    );
                    if !said_no_microphone {
                        said_no_microphone = true;
                        self.say_once(Phrase::NoMicrophone);
                    }
                    drop(floor);
                    if self.shared.wait_while_on(retry) == Wanted::Shutdown {
                        return;
                    }
                }
            }
        }
    }
}

struct Engine {
    client: Client,
    running: Running,
    files: omni::Files,
    omni: Arc<Omni>,
    clips: Arc<HashMap<Phrase, Clip>>,
}

fn bring_up(client: &Client, settings: &Settings) -> Result<Engine, String> {
    let files = omni::locate(settings)?;
    let running = omni::launch(client, &files, settings).map_err(|fault| fault.to_string())?;
    match prepare(&running, settings, &files) {
        Ok((omni, clips)) => Ok(Engine {
            client: client.clone(),
            running,
            files,
            omni,
            clips,
        }),
        Err(reason) => {
            if let Err(error) = omni::stop(client, &running, &files) {
                eprintln!("Voice engine stop was not confirmed: {error}");
            }
            Err(reason)
        }
    }
}

type Prepared = (Arc<Omni>, Arc<HashMap<Phrase, Clip>>);

fn prepare(
    running: &Running,
    settings: &Settings,
    files: &omni::Files,
) -> Result<Prepared, String> {
    let engine = Arc::new(Omni::new(running.port));
    engine.warm().map_err(|fault: Fault| fault.to_string())?;
    let kept = Clips::new(settings, files);
    omni::prepare_clips(engine.as_ref(), &kept).map_err(|fault| fault.to_string())?;
    let clips = Phrase::ALL
        .into_iter()
        .filter_map(|phrase| kept.load(phrase).map(|clip| (phrase, clip)))
        .collect();
    Ok((engine, Arc::new(clips)))
}

pub fn start(
    client: Client,
    settings: Settings,
    voyager: Arc<dyn Voyager>,
    replies: Replies,
    vocabulary: Vocabulary,
    audio: Arc<dyn Audio>,
    trace: Trace,
) -> Layer {
    let shared = Arc::new(Shared::new(Phase::Starting));
    let owner = shared.clone();
    thread::spawn(move || {
        let engine = match bring_up(&client, &settings) {
            Ok(engine) => engine,
            Err(reason) => {
                owner.set(Phase::Unavailable(reason), None);
                let _ = owner.wait_while_off();
                owner.set(Phase::Stopped, None);
                return;
            }
        };
        owner.set(Phase::Ready, None);
        let floor = Arc::new(Floor::new());
        let (status, stopped, listening) = (owner.clone(), owner.clone(), owner.clone());
        voice_speaker::spawn(voice_speaker::Parts {
            speaking: engine.omni.clone(),
            clips: engine.clips.clone(),
            audio: audio.clone(),
            voyager: voyager.clone(),
            replies,
            trace: trace.clone(),
            floor: floor.clone(),
            status: Arc::new(move |phase, notice| status.set(phase, notice)),
            stopped: Arc::new(move || stopped.has_stopped()),
            on: Arc::new(move || listening.is_on()),
        });
        Exchange {
            hearing: engine.omni.as_ref(),
            clips: &engine.clips,
            audio: audio.as_ref(),
            voyager: voyager.as_ref(),
            vocabulary: &vocabulary,
            trace: &trace,
            shared: &owner,
            floor: &floor,
        }
        .serve(MICROPHONE_RETRY);
        if let Err(error) = omni::stop(&engine.client, &engine.running, &engine.files) {
            eprintln!("Voice engine stop was not confirmed: {error:?}");
        }
        owner.set(Phase::Stopped, None);
    });
    Layer { shared }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        audio_io::FRAME,
        speech::Standing,
        voice_parts::{Frames, SendFailure},
    };
    use std::{collections::VecDeque, io, sync::atomic::AtomicUsize, time::Instant};

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
        fn play(self: Box<Self>, clip: &Clip) -> Finish {
            self.played.lock().unwrap().push(clip.pcm.len());
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
            .map(|i| if i % 2 == 0 { 4000 } else { -4000 })
            .collect()
    }

    fn quiet() -> Vec<i16> {
        vec![5; FRAME]
    }

    fn frames(frame: fn() -> Vec<i16>, count: usize) -> Vec<Step> {
        (0..count).map(|_| Step::Frame(frame())).collect()
    }

    fn sentence() -> Vec<Step> {
        let mut steps = frames(quiet, 20);
        steps.extend(frames(loud, 20));
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
            });
            Self::failing(mics, standing, failure)
        }

        fn failing(mics: Vec<Mic>, standing: Standing, failure: Option<SendFailure>) -> Self {
            let shared = Arc::new(Shared::new(Phase::Ready));
            let floor = Arc::new(Floor::new());
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
        steps.extend(frames(loud, 20));
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
    fn a_click_while_the_acknowledgement_plays_cuts_it_and_the_request_still_goes() {
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
        assert_eq!(rig.audio.cut.lock().unwrap().clone(), vec![true]);
        assert_eq!(rig.opened(), 1);
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
        steps.extend(frames(loud, 8));
        steps.push(Step::WantFloor);
        steps.extend(frames(quiet, 9));
        steps.extend(frames(loud, 30));
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
            steps.extend(frames(loud, 3));
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
        steps.extend(frames(loud, 12));
        steps.push(Step::WantFloor);
        steps.extend(frames(loud, 10));
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
        assert_eq!(rig.played(), vec![mark(Phrase::NotRunning)]);
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
        };
        let rig = Rig::failing(vec![Mic::Opens(sentence())], Standing::Idle, Some(failure));
        rig.serve("open the roadmap");
        assert!(rig.snapshot().notice.unwrap().contains("unconfirmed"));
        assert_eq!(rig.played(), vec![mark(Phrase::Asking)]);
        assert!(rig.voyager.notes.lock().unwrap().is_empty());
    }

    #[test]
    fn empty_heard_text_says_it_did_not_catch_that() {
        let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
        rig.serve("  ");
        assert!(rig.said().is_empty());
        assert_eq!(
            rig.played(),
            vec![mark(Phrase::Asking), mark(Phrase::Missed)]
        );
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
}
