use crate::{
    audio_io::{Capture, Playing},
    speech::{Clip, Standing},
};
use std::{
    fs::OpenOptions,
    io::{self, Write},
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

pub const TRACE_VARIABLE: &str = "VOYAGER_VOICE_TRACE";

pub trait Voyager: Send + Sync {
    fn standing(&self) -> Standing;
    fn say(&self, text: &str) -> Result<(), String>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Phase {
    Starting,
    Ready,
    Listening,
    Hearing,
    Acknowledging,
    Speaking,
    Unavailable(String),
    Stopped,
}

pub trait Frames {
    fn frame(&mut self) -> io::Result<Vec<i16>>;
}

pub trait Speaker: Send {
    fn play(self: Box<Self>, clip: &Clip) -> Box<dyn FnOnce() + Send>;
}

pub trait Audio: Send + Sync {
    fn microphone(&self) -> io::Result<Box<dyn Frames>>;
    fn speaker(&self, rate: u32) -> io::Result<Box<dyn Speaker>>;
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
}

impl Speaker for Playing {
    fn play(mut self: Box<Self>, clip: &Clip) -> Box<dyn FnOnce() + Send> {
        Playing::play(&mut self, clip.pcm.clone());
        Box::new(move || {
            let _ = self.finish();
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
