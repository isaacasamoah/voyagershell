use crate::{
    audio_io::{Gate, Heard as GateHeard},
    client::Client,
    omni::{self, Clips, Omni, Running, Settings},
    replies::Replies,
    speech::{
        Acknowledgement, Clip, Fault, Hearing, Phrase, Route, Routing, Speaking, SpokenText,
        Utterance, acknowledge, heard_nothing,
    },
    voice_parts::{Audio, Finish, Floor, Phase, Speaker, Trace, Voyager},
    voice_speaker,
};
use std::{
    collections::HashMap,
    sync::{Arc, Condvar, Mutex, mpsc},
    thread,
    time::Duration,
};

pub type Vocabulary = Arc<dyn Fn() -> Vec<String> + Send + Sync>;

const MICROPHONE_RETRY: Duration = Duration::from_secs(3);
const REPLY_WAIT_FRAMES: usize = 150;
const HUM_AFTER: Duration = Duration::from_millis(50);

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

struct Exchange<'a> {
    hearing: &'a dyn Hearing,
    routing: &'a dyn Routing,
    speaking: &'a dyn Speaking,
    clips: &'a HashMap<Phrase, Clip>,
    audio: &'a dyn Audio,
    voyager: &'a dyn Voyager,
    vocabulary: &'a Vocabulary,
    trace: &'a Trace,
    shared: &'a Shared,
    floor: &'a Floor,
}

enum Decided {
    Nothing,
    Missed(Fault),
    Chat(SpokenText, Vec<Clip>),
    Voyager(String),
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
        let mut gate = Gate::new(self.audio.detector());
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
        self.play_clips(vec![self.clips.get(&phrase)?.clone()], ready)
    }

    fn play_clips(&self, clips: Vec<Clip>, ready: Option<Box<dyn Speaker>>) -> Option<Finish> {
        if !self.shared.is_on() {
            return None;
        }
        let rate = clips.first()?.rate;
        let speaker = ready.or_else(|| self.audio.speaker(rate).ok())?;
        Some(speaker.play(Box::new(clips.into_iter())))
    }

    fn finish(&self, finish: Option<Finish>) {
        if let Some(done) = finish {
            done(&|| self.shared.wanted() == Wanted::Shutdown);
        }
    }

    fn say_once(&self, phrase: Phrase) {
        let finish = self.play(phrase, None);
        self.trace.mark_words("notice-started", phrase.key());
        self.finish(finish);
    }

    fn route(&self, heard: &str) -> Route {
        match self.routing.route(heard) {
            Ok(route) => {
                let said = match &route {
                    Route::Chat(text) => text.as_str(),
                    Route::Voyager => "",
                };
                self.trace.mark_words("routed", said);
                route
            }
            Err(fault) => {
                self.trace.mark_words("route-failed", &fault.to_string());
                Route::Voyager
            }
        }
    }

    fn decide(&self, utterance: &Utterance, names: &[String]) -> Decided {
        let heard = match self.hearing.hear(utterance, names) {
            Ok(heard) => heard,
            Err(fault) => return Decided::Missed(fault),
        };
        self.trace.mark_words("heard", &heard);
        if heard_nothing(&heard) {
            self.trace.mark("dropped");
            return Decided::Nothing;
        }
        let Route::Chat(text) = self.route(&heard) else {
            return Decided::Voyager(heard);
        };
        let clips: Result<Vec<Clip>, Fault> = text
            .pieces()
            .map(|piece| self.speaking.speak(piece))
            .collect();
        match clips {
            Ok(clips) => Decided::Chat(text, clips),
            Err(fault) => {
                self.trace.mark_words("chat-failed", &fault.to_string());
                Decided::Voyager(heard)
            }
        }
    }

    fn decide_or_hum(
        &self,
        utterance: &Utterance,
        speaker: &mut Option<Box<dyn Speaker>>,
    ) -> (Decided, Option<Finish>) {
        let names = (self.vocabulary)();
        let names = names.as_slice();
        thread::scope(|scope| {
            let (tell, told) = mpsc::channel();
            scope.spawn(move || {
                let _ = tell.send(self.decide(utterance, names));
            });
            if let Ok(decided) = told.recv_timeout(HUM_AFTER) {
                return (decided, None);
            }
            let hum = self.play(Phrase::Hum, speaker.take());
            self.trace
                .mark_words("acknowledgement-started", Phrase::Hum.key());
            let decided = told.recv().unwrap_or_else(|_| {
                Decided::Missed(Fault::Failed("The voice stopped deciding".into()))
            });
            (decided, hum)
        })
    }

    fn hand_off(
        &self,
        heard: &str,
        held: Acknowledgement,
        speaker: Option<Box<dyn Speaker>>,
        notice: &mut Option<String>,
    ) -> Option<Finish> {
        let mut finish = self.play(held.phrase, speaker);
        self.trace
            .mark_words("acknowledgement-started", held.phrase.key());
        if !held.send {
            return finish;
        }
        match self.voyager.say(&crate::spoken::prompt(heard)) {
            Ok(()) => self.trace.mark("sent"),
            Err(failure) => {
                if failure.refused {
                    self.voyager.note(&failure.reason);
                    self.finish(finish.take());
                    finish = self.play(failure.phrase, None);
                    self.trace
                        .mark_words("refusal-started", failure.phrase.key());
                }
                *notice = Some(failure.reason);
            }
        }
        finish
    }

    fn answer(&self, turn: u64, utterance: Utterance, speaker: Option<Box<dyn Speaker>>) {
        let held = acknowledge(self.voyager.standing(), turn);
        self.trace.mark("utterance-ended");
        self.shared.set(Phase::Hearing, None);
        let mut speaker = speaker;
        let (decided, hum) = self.decide_or_hum(&utterance, &mut speaker);
        self.finish(hum);
        let mut notice = None;
        let finish = match decided {
            Decided::Nothing => None,
            Decided::Missed(fault) => {
                notice = Some(fault.to_string());
                let finish = self.play(Phrase::Missed, speaker);
                self.trace
                    .mark_words("acknowledgement-started", Phrase::Missed.key());
                finish
            }
            Decided::Chat(text, clips) => {
                let finish = self.play_clips(clips, speaker);
                self.trace.mark_words("chat-started", text.as_str());
                self.voyager.note(text.as_str());
                finish
            }
            Decided::Voyager(heard) => self.hand_off(&heard, held, speaker, &mut notice),
        };
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
            if self.shared.wanted() != Wanted::On {
                continue;
            }
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
        let floor = Arc::new(Floor::default());
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
            routing: engine.omni.as_ref(),
            speaking: engine.omni.as_ref(),
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
#[path = "voice_layer_tests.rs"]
mod tests;
