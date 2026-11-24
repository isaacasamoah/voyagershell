use crate::speech::Clip;
use crate::voice_parts::{RATE_CHANGED, Rendered, Reply, Speaker, Trace};
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, Sender, TryRecvError},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

const BACKCHANNELS: [&str; 10] = [
    "yeah", "mm-hm", "mm-hmm", "mhm", "uh-huh", "okay", "ok", "right", "sure", "got it",
];
const STOPS: [&str; 6] = ["stop", "wait", "hang on", "hold on", "never mind", "shush"];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Interjection {
    Backchannel,
    Stop,
    Steer,
}

fn letters(words: &str) -> String {
    words
        .chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

pub fn interjection(heard: &str) -> Interjection {
    let heard = letters(heard);
    let holds = |table: &[&str]| table.iter().any(|entry| letters(entry) == heard);
    if holds(&BACKCHANNELS) {
        Interjection::Backchannel
    } else if holds(&STOPS) {
        Interjection::Stop
    } else {
        Interjection::Steer
    }
}

pub(crate) struct Held {
    text: String,
    words: Vec<String>,
    clips: Vec<Clip>,
    rest: Receiver<Rendered>,
    pub failed: Option<String>,
}

impl Held {
    pub fn new(reply: Reply) -> Self {
        Self {
            text: reply.text.as_str().to_owned(),
            words: reply
                .text
                .pieces()
                .map(|piece| piece.as_str().to_owned())
                .collect(),
            clips: vec![reply.first],
            rest: reply.rest,
            failed: None,
        }
    }

    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn rate(&self) -> u32 {
        self.clips[0].rate
    }

    pub fn piece(&self, at: usize) -> &str {
        &self.words[at]
    }

    pub fn unheard(&self, at: usize) -> usize {
        self.words.len().saturating_sub(at + 1)
    }

    fn gather(&mut self) {
        while self.failed.is_none() && self.clips.len() < self.words.len() {
            match self.rest.try_recv() {
                Ok(Ok((clip, _))) if clip.rate == self.rate() => self.clips.push(clip),
                Ok(Ok(_)) => self.failed = Some(RATE_CHANGED.to_owned()),
                Ok(Err(reason)) => self.failed = Some(reason),
                Err(TryRecvError::Empty) => return,
                Err(TryRecvError::Disconnected) => self.words.truncate(self.clips.len()),
            }
        }
    }

    fn renders_no_more(&self) -> bool {
        self.failed.is_some() || self.clips.len() == self.words.len()
    }
}

fn length(clip: &Clip) -> Duration {
    Duration::from_secs_f64(clip.pcm.len() as f64 / 2.0 / f64::from(clip.rate.max(1)))
}

pub(crate) struct Playing {
    from: usize,
    starts: Vec<Instant>,
    until: Instant,
    feed: Option<Sender<Clip>>,
    cut: Arc<AtomicBool>,
    ended: JoinHandle<()>,
}

impl Playing {
    pub fn start(speaker: Box<dyn Speaker>, from: usize) -> Self {
        let (feed, clips) = mpsc::channel();
        let finish = speaker.play(Box::new(clips.into_iter()));
        let cut = Arc::new(AtomicBool::new(false));
        let asked = cut.clone();
        let ended = thread::spawn(move || finish(&|| asked.load(Ordering::SeqCst)));
        Self {
            from,
            starts: Vec::new(),
            until: Instant::now(),
            feed: Some(feed),
            cut,
            ended,
        }
    }

    pub fn feed(&mut self, held: &mut Held, trace: &Trace) {
        held.gather();
        let Some(feed) = &self.feed else {
            return;
        };
        while let Some(clip) = held.clips.get(self.from + self.starts.len()) {
            trace.mark_words("piece-started", held.piece(self.from + self.starts.len()));
            let start = self.until.max(Instant::now());
            self.until = start + length(clip);
            self.starts.push(start);
            let _ = feed.send(clip.clone());
        }
        if held.renders_no_more() {
            self.feed = None;
        }
    }

    pub fn ended(&self) -> bool {
        self.ended.is_finished()
    }

    pub fn cut(self) -> usize {
        let now = Instant::now();
        self.cut.store(true, Ordering::SeqCst);
        drop(self.feed);
        let _ = self.ended.join();
        let sounding = self.starts.iter().rposition(|start| *start <= now);
        self.from + sounding.unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_backchannel_or_a_stop_is_the_whole_utterance_whatever_its_case_and_punctuation() {
        for heard in [
            "yeah", "Yeah.", " Mm-hm. ", "mm hm", "Mm-hmm.", "Mhm.", "Uh-huh!", "Okay", "OK.",
            "right?", "Sure.", "Got it.",
        ] {
            assert_eq!(interjection(heard), Interjection::Backchannel, "{heard}");
        }
        for heard in [
            "Stop.",
            "wait",
            "Hang on!",
            "hold on",
            "Never mind.",
            "Shush",
        ] {
            assert_eq!(interjection(heard), Interjection::Stop, "{heard}");
        }
    }

    #[test]
    fn a_sentence_that_holds_a_listed_word_steers() {
        for heard in [
            "yeah but wait, open the logs",
            "Yeah, yeah.",
            "Stop the build.",
            "wait for the tests",
            "okay now open the roadmap",
            "OK, open the logs",
            "mhm, and the tests",
            "right click it",
        ] {
            assert_eq!(interjection(heard), Interjection::Steer, "{heard}");
        }
    }
}
