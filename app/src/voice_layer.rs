use crate::{
    audio_io::{Capture, End, Gate, Playing},
    core::Core,
    omni::{self, Clips, Omni, Running, Settings},
    speech::{
        Acknowledgement, Clip, Fault, Hearing, Phrase, Standing, Utterance, acknowledge,
        spoken_prompt,
    },
};
use std::{
    collections::HashMap,
    fs::OpenOptions,
    io::{self, Write},
    path::PathBuf,
    sync::{
        Arc, Condvar, Mutex,
        mpsc::{self, Receiver, Sender, TryRecvError},
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub const TRACE_VARIABLE: &str = "VOYAGER_VOICE_TRACE";

pub trait Voyager: Send + Sync {
    fn standing(&self) -> Standing;
    fn say(&self, text: &str) -> Result<(), String>;
}

pub struct Unbound;

impl Voyager for Unbound {
    fn standing(&self) -> Standing {
        Standing::NotRunning
    }

    fn say(&self, _: &str) -> Result<(), String> {
        Err("Voyager is not bound to the avatar yet".into())
    }
}

pub type Vocabulary = Arc<dyn Fn() -> Vec<String> + Send + Sync>;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Phase {
    Starting,
    Ready,
    Listening,
    Hearing,
    Acknowledging,
    Unavailable(String),
    Stopped,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Snapshot {
    pub version: u64,
    pub phase: Phase,
    pub notice: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Command {
    Click,
    Shutdown,
}

pub trait Frames {
    fn frame(&mut self) -> io::Result<Vec<i16>>;
}

pub trait Audio: Send + Sync {
    fn microphone(&self) -> io::Result<Box<dyn Frames>>;
    fn play(&self, clip: &Clip) -> io::Result<Box<dyn FnOnce() + Send>>;
}

pub struct System;

impl Frames for Capture {
    fn frame(&mut self) -> io::Result<Vec<i16>> {
        Capture::frame(self)
    }
}

impl Audio for System {
    fn microphone(&self) -> io::Result<Box<dyn Frames>> {
        Capture::open().map(|capture| Box::new(capture) as Box<dyn Frames>)
    }

    fn play(&self, clip: &Clip) -> io::Result<Box<dyn FnOnce() + Send>> {
        let playing = Playing::start(clip)?;
        Ok(Box::new(move || {
            let _ = playing.finish();
        }))
    }
}

struct Shared {
    state: Mutex<Snapshot>,
    changed: Condvar,
}

impl Shared {
    fn set(&self, phase: Phase, notice: Option<String>) {
        if let Ok(mut state) = self.state.lock() {
            state.version += 1;
            state.phase = phase;
            state.notice = notice;
            self.changed.notify_all();
        }
    }
}

#[derive(Clone)]
pub struct Layer {
    shared: Arc<Shared>,
    commands: Sender<Command>,
}

impl Layer {
    pub fn snapshot(&self) -> Snapshot {
        self.shared
            .state
            .lock()
            .map(|state| state.clone())
            .unwrap_or(Snapshot {
                version: 0,
                phase: Phase::Unavailable("Voice state is unavailable".into()),
                notice: None,
            })
    }

    pub fn wait_changed(&self, seen: u64, within: Duration) -> Snapshot {
        let Ok(state) = self.shared.state.lock() else {
            return self.snapshot();
        };
        self.shared
            .changed
            .wait_timeout_while(state, within, |state| state.version == seen)
            .map(|(state, _)| state.clone())
            .unwrap_or_else(|_| self.snapshot())
    }

    pub fn click(&self) {
        let _ = self.commands.send(Command::Click);
    }

    pub fn shutdown(&self, within: Duration) {
        let _ = self.commands.send(Command::Shutdown);
        let _ = self.wait_stopped(within);
    }

    fn wait_stopped(&self, within: Duration) -> bool {
        let Ok(state) = self.shared.state.lock() else {
            return false;
        };
        self.shared
            .changed
            .wait_timeout_while(state, within, |state| state.phase != Phase::Stopped)
            .map(|(state, _)| state.phase == Phase::Stopped)
            .unwrap_or(false)
    }
}

pub struct Trace(Option<PathBuf>);

impl Trace {
    pub fn from_environment() -> Self {
        Self(std::env::var_os(TRACE_VARIABLE).map(PathBuf::from))
    }

    pub fn off() -> Self {
        Self(None)
    }

    pub fn mark(&self, event: &str) {
        let Some(path) = &self.0 else {
            return;
        };
        let at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_millis())
            .unwrap_or(0);
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{{\"event\":\"{event}\",\"atMs\":{at}}}");
        }
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
}

enum Outcome {
    Done,
    Shutdown,
}

impl Exchange<'_> {
    fn listen(&self, commands: &Receiver<Command>) -> Result<Option<Utterance>, Outcome> {
        let mut microphone = match self.audio.microphone() {
            Ok(microphone) => microphone,
            Err(error) => {
                self.shared.set(
                    Phase::Ready,
                    Some(format!("The microphone could not be opened: {error}. Is pulseaudio-utils installed?")),
                );
                return Err(Outcome::Done);
            }
        };
        self.trace.mark("capture-open");
        let mut gate = Gate::default();
        let mut samples = Vec::new();
        let mut spoke = true;
        loop {
            match commands.try_recv() {
                Ok(Command::Click) => break,
                Ok(Command::Shutdown) | Err(TryRecvError::Disconnected) => {
                    return Err(Outcome::Shutdown);
                }
                Err(TryRecvError::Empty) => {}
            }
            let Ok(frame) = microphone.frame() else {
                self.shared
                    .set(Phase::Ready, Some("The microphone stream ended".into()));
                return Err(Outcome::Done);
            };
            samples.extend_from_slice(&frame);
            match gate.push(&frame) {
                Some(End::NothingSaid) => {
                    spoke = false;
                    break;
                }
                Some(_) => break,
                None => {}
            }
        }
        Ok(spoke.then_some(Utterance { samples }))
    }

    fn play(&self, phrase: Phrase) -> Option<Box<dyn FnOnce() + Send>> {
        let clip = self.clips.get(&phrase)?;
        self.audio.play(clip).ok()
    }

    fn run(&self, turn: u64, commands: &Receiver<Command>) -> Outcome {
        self.trace.mark("click");
        self.shared.set(Phase::Listening, None);
        let utterance = match self.listen(commands) {
            Ok(utterance) => utterance,
            Err(outcome) => return outcome,
        };
        self.trace.mark("utterance-ended");
        self.shared.set(Phase::Hearing, None);
        let heard = match utterance {
            None => String::new(),
            Some(utterance) => match self.hearing.hear(&utterance, &(self.vocabulary)()) {
                Ok(heard) => heard,
                Err(fault) => {
                    self.shared.set(Phase::Ready, Some(fault.to_string()));
                    return Outcome::Done;
                }
            },
        };
        self.trace.mark("heard");
        let Acknowledgement { phrase, send } = acknowledge(&heard, self.voyager.standing(), turn);
        let finish = self.play(phrase);
        self.trace.mark("acknowledgement-started");
        self.shared.set(Phase::Acknowledging, None);
        let mut notice = None;
        if send {
            match self.voyager.say(&spoken_prompt(&heard)) {
                Ok(()) => self.trace.mark("sent"),
                Err(reason) => notice = Some(format!("Not sent. {reason}")),
            }
        }
        if let Some(finish) = finish {
            finish();
        }
        self.shared.set(Phase::Ready, notice);
        Outcome::Done
    }
}

fn drain(commands: &Receiver<Command>) -> bool {
    loop {
        match commands.try_recv() {
            Ok(Command::Shutdown) | Err(TryRecvError::Disconnected) => return true,
            Ok(Command::Click) => {}
            Err(TryRecvError::Empty) => return false,
        }
    }
}

struct Engine {
    core: Core,
    running: Running,
    files: omni::Files,
    omni: Arc<Omni>,
    clips: HashMap<Phrase, Clip>,
}

fn bring_up(session: &str, settings: &Settings) -> Result<Engine, String> {
    let files = omni::locate(settings)?;
    let mut core =
        Core::connect(session).map_err(|error| format!("Voice could not reach Core: {error:?}"))?;
    let running = omni::launch(&mut core, &files, settings).map_err(|fault| fault.to_string())?;
    let engine = Arc::new(Omni::new(running.port));
    engine.warm().map_err(|fault: Fault| fault.to_string())?;
    let kept = Clips::new(settings, &files);
    omni::prepare_clips(engine.as_ref(), &kept).map_err(|fault| fault.to_string())?;
    let clips = Phrase::ALL
        .into_iter()
        .filter_map(|phrase| kept.load(phrase).map(|clip| (phrase, clip)))
        .collect();
    Ok(Engine {
        core,
        running,
        files,
        omni: engine,
        clips,
    })
}

pub fn start(
    session: String,
    settings: Settings,
    voyager: Arc<dyn Voyager>,
    vocabulary: Vocabulary,
    audio: Arc<dyn Audio>,
    trace: Trace,
) -> Layer {
    let shared = Arc::new(Shared {
        state: Mutex::new(Snapshot {
            version: 0,
            phase: Phase::Starting,
            notice: None,
        }),
        changed: Condvar::new(),
    });
    let (commands, receiver) = mpsc::channel();
    let owner = shared.clone();
    thread::spawn(move || {
        let mut engine = match bring_up(&session, &settings) {
            Ok(engine) => engine,
            Err(reason) => {
                owner.set(Phase::Unavailable(reason), None);
                while let Ok(command) = receiver.recv() {
                    if command == Command::Shutdown {
                        break;
                    }
                }
                owner.set(Phase::Stopped, None);
                return;
            }
        };
        owner.set(Phase::Ready, None);
        let mut turn = 0u64;
        while let Ok(Command::Click) = receiver.recv() {
            let outcome = Exchange {
                hearing: engine.omni.as_ref(),
                clips: &engine.clips,
                audio: audio.as_ref(),
                voyager: voyager.as_ref(),
                vocabulary: &vocabulary,
                trace: &trace,
                shared: &owner,
            }
            .run(turn, &receiver);
            turn += 1;
            if matches!(outcome, Outcome::Shutdown) || drain(&receiver) {
                break;
            }
        }
        if let Err(error) = omni::stop(&mut engine.core, &engine.running, &engine.files) {
            eprintln!("Voice engine stop was not confirmed: {error:?}");
        }
        owner.set(Phase::Stopped, None);
    });
    Layer { shared, commands }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct Script(Vec<Vec<i16>>);

    impl Frames for Script {
        fn frame(&mut self) -> io::Result<Vec<i16>> {
            if self.0.is_empty() {
                Err(io::Error::other("ended"))
            } else {
                Ok(self.0.remove(0))
            }
        }
    }

    struct Fake {
        frames: Mutex<Option<Vec<Vec<i16>>>>,
        played: Mutex<Vec<usize>>,
        opened: AtomicUsize,
    }

    impl Audio for Fake {
        fn microphone(&self) -> io::Result<Box<dyn Frames>> {
            self.opened.fetch_add(1, Ordering::SeqCst);
            Ok(Box::new(Script(
                self.frames.lock().unwrap().take().unwrap_or_default(),
            )))
        }

        fn play(&self, clip: &Clip) -> io::Result<Box<dyn FnOnce() + Send>> {
            self.played.lock().unwrap().push(clip.pcm.len());
            Ok(Box::new(|| {}))
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
        refuse: bool,
    }

    impl Voyager for Standin {
        fn standing(&self) -> Standing {
            self.standing
        }
        fn say(&self, text: &str) -> Result<(), String> {
            if self.refuse {
                return Err("Voyager needs you on Home".into());
            }
            self.said.lock().unwrap().push(text.into());
            Ok(())
        }
    }

    fn loud() -> Vec<i16> {
        (0..320)
            .map(|i| if i % 2 == 0 { 4000 } else { -4000 })
            .collect()
    }

    fn speech_then_pause() -> Vec<Vec<i16>> {
        let mut frames = vec![loud(); 20];
        frames.extend(vec![vec![5; 320]; 40]);
        frames
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

    fn shared() -> Shared {
        Shared {
            state: Mutex::new(Snapshot {
                version: 0,
                phase: Phase::Ready,
                notice: None,
            }),
            changed: Condvar::new(),
        }
    }

    struct Rig {
        audio: Fake,
        voyager: Standin,
        clips: HashMap<Phrase, Clip>,
        shared: Shared,
    }

    impl Rig {
        fn new(frames: Vec<Vec<i16>>, standing: Standing, refuse: bool) -> Self {
            Self {
                audio: Fake {
                    frames: Mutex::new(Some(frames)),
                    played: Mutex::default(),
                    opened: AtomicUsize::new(0),
                },
                voyager: Standin {
                    standing,
                    said: Mutex::default(),
                    refuse,
                },
                clips: clips(),
                shared: shared(),
            }
        }

        fn run(&self, heard: &'static str, commands: &Receiver<Command>) -> Outcome {
            let vocabulary: Vocabulary = Arc::new(|| vec!["Harbor".into()]);
            let hearing = Heard(heard);
            Exchange {
                hearing: &hearing,
                clips: &self.clips,
                audio: &self.audio,
                voyager: &self.voyager,
                vocabulary: &vocabulary,
                trace: &Trace::off(),
                shared: &self.shared,
            }
            .run(0, commands)
        }

        fn said(&self) -> Vec<String> {
            self.voyager.said.lock().unwrap().clone()
        }

        fn played(&self) -> Vec<usize> {
            self.audio.played.lock().unwrap().clone()
        }

        fn snapshot(&self) -> Snapshot {
            self.shared.state.lock().unwrap().clone()
        }
    }

    #[test]
    fn a_heard_request_is_acknowledged_and_sent_with_the_spoken_marker() {
        let rig = Rig::new(speech_then_pause(), Standing::Idle, false);
        let (_keep, commands) = mpsc::channel();
        assert!(matches!(
            rig.run("Rename this fleet to Harbor.", &commands),
            Outcome::Done
        ));
        assert_eq!(rig.said(), vec!["[spoken] Rename this fleet to Harbor."]);
        assert_eq!(rig.played(), vec![mark(Phrase::Asking)]);
        assert_eq!(rig.snapshot().phase, Phase::Ready);
    }

    #[test]
    fn a_second_click_ends_the_utterance_without_waiting_for_a_pause() {
        let rig = Rig::new(vec![loud(); 3], Standing::Idle, false);
        let (click, commands) = mpsc::channel();
        click.send(Command::Click).unwrap();
        rig.run("open the roadmap", &commands);
        assert_eq!(rig.said(), vec!["[spoken] open the roadmap"]);
    }

    #[test]
    fn a_blocked_voyager_is_told_and_receives_nothing() {
        let rig = Rig::new(speech_then_pause(), Standing::Blocked, false);
        let (_keep, commands) = mpsc::channel();
        rig.run("open the roadmap", &commands);
        assert!(rig.said().is_empty());
        assert_eq!(rig.played(), vec![mark(Phrase::NeedsYou)]);
    }

    #[test]
    fn a_busy_voyager_gets_the_words_and_the_queued_phrase() {
        let rig = Rig::new(speech_then_pause(), Standing::Working, false);
        let (_keep, commands) = mpsc::channel();
        rig.run("open the roadmap", &commands);
        assert_eq!(rig.said().len(), 1);
        assert_eq!(rig.played(), vec![mark(Phrase::Queued)]);
    }

    #[test]
    fn a_refused_send_is_reported_in_the_notice_and_never_retried() {
        let rig = Rig::new(speech_then_pause(), Standing::Idle, true);
        let (_keep, commands) = mpsc::channel();
        rig.run("open the roadmap", &commands);
        let notice = rig.snapshot().notice.unwrap();
        assert!(notice.starts_with("Not sent."), "{notice}");
        assert!(rig.said().is_empty());
    }

    #[test]
    fn a_room_with_no_speech_says_it_did_not_catch_that_and_sends_nothing() {
        let rig = Rig::new(vec![vec![5; 320]; 450], Standing::Idle, false);
        let (_keep, commands) = mpsc::channel();
        rig.run("anything", &commands);
        assert!(rig.said().is_empty());
        assert_eq!(rig.played(), vec![mark(Phrase::Missed)]);
    }

    #[test]
    fn empty_heard_text_says_it_did_not_catch_that() {
        let rig = Rig::new(speech_then_pause(), Standing::Idle, false);
        let (_keep, commands) = mpsc::channel();
        rig.run("  ", &commands);
        assert!(rig.said().is_empty());
        assert_eq!(rig.played(), vec![mark(Phrase::Missed)]);
    }

    #[test]
    fn a_shutdown_while_listening_closes_the_microphone_and_sends_nothing() {
        let rig = Rig::new(vec![loud(); 3], Standing::Idle, false);
        let (command, commands) = mpsc::channel();
        command.send(Command::Shutdown).unwrap();
        assert!(matches!(rig.run("x", &commands), Outcome::Shutdown));
        assert!(rig.said().is_empty());
    }

    #[test]
    fn clicks_made_while_the_avatar_is_speaking_are_dropped_not_queued() {
        let (command, commands) = mpsc::channel();
        command.send(Command::Click).unwrap();
        command.send(Command::Click).unwrap();
        assert!(!drain(&commands));
        assert!(matches!(commands.try_recv(), Err(TryRecvError::Empty)));
        command.send(Command::Shutdown).unwrap();
        assert!(drain(&commands));
    }

    #[test]
    fn nothing_is_captured_until_a_click_asks_for_it() {
        let rig = Rig::new(speech_then_pause(), Standing::Idle, false);
        assert_eq!(rig.audio.opened.load(Ordering::SeqCst), 0);
    }
}
