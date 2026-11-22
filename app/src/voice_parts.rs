use crate::{
    audio_io::{Capture, Playing, SpeechDetector},
    silero::Silero,
    speech::{Clip, Phrase, Standing},
};
use std::{
    fs::OpenOptions,
    io::{self, Write},
    path::PathBuf,
    sync::{
        Mutex, MutexGuard,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub const TRACE_VARIABLE: &str = "VOYAGER_VOICE_TRACE";
const FLOOR_LOOK: Duration = Duration::from_millis(10);

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SendFailure {
    pub reason: String,
    pub refused: bool,
    pub phrase: Phrase,
}

pub trait Voyager: Send + Sync {
    fn standing(&self) -> Standing;
    fn say(&self, text: &str) -> Result<(), SendFailure>;
    fn note(&self, _line: &str) {}
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Phase {
    Starting,
    Ready,
    Connecting,
    Listening,
    NoMicrophone,
    Hearing,
    Acknowledging,
    Speaking,
    Unavailable(String),
    Stopped,
}

pub trait Frames {
    fn frame(&mut self) -> io::Result<Vec<i16>>;
}

pub type Finish = Box<dyn FnOnce(&dyn Fn() -> bool) + Send>;
pub type Clips = Box<dyn Iterator<Item = Clip> + Send>;

pub trait Speaker: Send {
    fn play(self: Box<Self>, clips: Clips) -> Finish;
}

pub trait Audio: Send + Sync {
    fn microphone(&self) -> io::Result<Box<dyn Frames>>;
    fn speaker(&self, rate: u32) -> io::Result<Box<dyn Speaker>>;
    fn detector(&self) -> Box<dyn SpeechDetector>;
}

#[derive(Default)]
pub struct Floor {
    lock: Mutex<()>,
    pub(crate) wanted: AtomicBool,
}

impl Floor {
    pub fn take(&self) -> MutexGuard<'_, ()> {
        self.wanted.store(true, Ordering::SeqCst);
        let guard = self
            .lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        self.wanted.store(false, Ordering::SeqCst);
        guard
    }

    pub fn hold(&self) -> MutexGuard<'_, ()> {
        while self.wanted.load(Ordering::SeqCst) {
            thread::sleep(FLOOR_LOOK);
        }
        self.lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn is_wanted(&self) -> bool {
        self.wanted.load(Ordering::SeqCst)
    }
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

    fn speaker(&self, rate: u32) -> io::Result<Box<dyn Speaker>> {
        Playing::open(rate).map(|playing| Box::new(playing) as Box<dyn Speaker>)
    }

    fn detector(&self) -> Box<dyn SpeechDetector> {
        Box::new(Silero::new())
    }
}

impl Speaker for Playing {
    fn play(mut self: Box<Self>, clips: Clips) -> Finish {
        Playing::play(&mut self, clips.map(|clip| clip.pcm));
        Box::new(move |cut| {
            let _ = self.finish(cut);
        })
    }
}

#[derive(Clone)]
pub struct Trace(Option<PathBuf>);

impl Trace {
    pub fn from_environment() -> Self {
        Self(std::env::var_os(TRACE_VARIABLE).map(PathBuf::from))
    }

    pub fn off() -> Self {
        Self(None)
    }

    pub fn mark(&self, event: &str) {
        self.record(event, None);
    }

    pub fn mark_words(&self, event: &str, words: &str) {
        self.record(event, Some(words));
    }

    fn record(&self, event: &str, words: Option<&str>) {
        let Some(path) = &self.0 else {
            return;
        };
        let at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_millis())
            .unwrap_or(0);
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let line = match words {
                Some(words) => serde_json::json!({"event": event, "atMs": at, "words": words}),
                None => serde_json::json!({"event": event, "atMs": at}),
            };
            let _ = writeln!(file, "{line}");
        }
    }
}
