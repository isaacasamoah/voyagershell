use super::*;
use crate::voice_parts::Rendered;
use std::sync::mpsc::{self, Sender};

pub(super) struct Live {
    pub(super) played: Arc<Mutex<Vec<usize>>>,
    pub(super) cut: Arc<Mutex<Vec<bool>>>,
}

impl Speaker for Live {
    fn play(self: Box<Self>, clips: Clips) -> Finish {
        let played = self.played.clone();
        let drained = thread::spawn(move || {
            for clip in clips {
                played.lock().unwrap().push(clip.pcm.len());
            }
        });
        Box::new(move |cut| {
            let mut stopped = false;
            while !stopped && !drained.is_finished() {
                thread::sleep(Duration::from_millis(1));
                stopped = cut();
            }
            self.cut.lock().unwrap().push(stopped);
            drained.join().unwrap();
        })
    }
}

const SHORT: usize = 20;
const LONG: usize = 120_000;
const LAST: usize = 30;
const REPLY: &str = "One. Two. Three.";

fn piece(length: usize) -> Clip {
    Clip {
        rate: 1000,
        pcm: vec![0; length],
    }
}

fn reply_of(rendered: &[usize]) -> (Reply, Sender<Rendered>) {
    let (rendering, rest) = mpsc::channel();
    for length in &rendered[1..] {
        rendering.send(Ok((piece(*length), String::new()))).unwrap();
    }
    let reply = Reply {
        text: SpokenText::from_reply(REPLY).unwrap(),
        first: piece(rendered[0]),
        rest,
    };
    (reply, rendering)
}

fn reaches(ready: impl Fn() -> bool) -> bool {
    let until = Instant::now() + Duration::from_secs(3);
    while !ready() && Instant::now() < until {
        thread::sleep(Duration::from_millis(5));
    }
    ready()
}

fn spoken_over(reply: Reply, seen: &Arc<Mutex<Vec<Phase>>>) -> Vec<Mic> {
    let mut steps = frames(quiet, 20);
    steps.push(Step::Reply(reply));
    steps.extend(frames(quiet, 2));
    steps.push(Step::See(seen.clone()));
    steps.push(Step::Wait(Duration::from_millis(40)));
    steps.extend(spoken(20));
    steps.push(Step::See(seen.clone()));
    steps.extend(frames(quiet, 80));
    steps.push(Step::See(seen.clone()));
    steps.extend(frames(quiet, 2));
    vec![Mic::Opens(steps)]
}

fn talked_over(heard: &'static str) -> (Rig, Vec<Phase>) {
    let (reply, _rendering) = reply_of(&[SHORT, LONG]);
    let seen = Arc::default();
    let mut rig = Rig::new(spoken_over(reply, &seen), Standing::Idle, false);
    rig.audio.live = true;
    rig.serve(heard);
    let seen = seen.lock().unwrap().clone();
    (rig, seen)
}

#[test]
fn speech_over_a_reply_stops_it_and_a_backchannel_resumes_at_the_piece_it_cut() {
    for heard in ["Yeah.", "mm-hm", " ... "] {
        let (rig, seen) = talked_over(heard);
        assert_eq!(rig.played(), vec![SHORT, LONG, LONG], "{heard}");
        assert_eq!(
            seen,
            vec![Phase::SpeakingOpen, Phase::Listening, Phase::SpeakingOpen],
            "{heard}"
        );
        assert!(rig.said().is_empty(), "{heard}");
        assert_eq!(rig.notes(), vec![REPLY], "{heard}");
    }
}

#[test]
fn a_bare_stop_leaves_the_reply_stopped_with_the_unspoken_rest_in_the_chat() {
    let (rig, seen) = talked_over("Stop.");
    assert_eq!(rig.played(), vec![SHORT, LONG]);
    assert_eq!(rig.audio.cut.lock().unwrap().clone(), vec![true]);
    assert_eq!(
        seen,
        vec![Phase::SpeakingOpen, Phase::Listening, Phase::Listening]
    );
    assert!(rig.said().is_empty());
    assert_eq!(rig.notes(), vec![REPLY]);
    assert_eq!(rig.opened(), 1);
}

#[test]
fn other_words_over_a_reply_reach_voyager_once_as_a_cut_off_prompt() {
    let (rig, _) = talked_over("Yeah but wait, open the logs.");
    assert_eq!(
        rig.said(),
        vec![
            "[spoken] [cut off] You were saying: \"Two.\". Not heard: 1 more sentences. They say: Yeah but wait, open the logs."
        ]
    );
    assert_eq!(rig.played(), vec![SHORT, LONG]);
    assert_eq!(rig.notes(), vec![REPLY]);
}

#[test]
fn words_over_a_reply_that_cannot_be_heard_leave_it_stopped_and_say_so() {
    struct Down;
    impl Hearing for Down {
        fn hear(&self, _: &Utterance, _: &[String]) -> Result<String, Fault> {
            Err(Fault::Failed("The voice engine did not answer".into()))
        }
    }
    let (reply, _rendering) = reply_of(&[SHORT, LONG]);
    let mut rig = Rig::new(spoken_over(reply, &Arc::default()), Standing::Idle, false);
    rig.audio.live = true;
    rig.serve_with(&Down);
    assert_eq!(rig.played(), vec![SHORT, LONG, mark(Phrase::Missed)]);
    assert!(rig.said().is_empty());
}

#[test]
fn a_reply_nobody_talks_over_plays_to_its_end_and_the_same_microphone_hears_the_next_request() {
    let (reply, rendering) = reply_of(&[SHORT, LONG, LAST]);
    drop(rendering);
    let mut steps = frames(quiet, 20);
    steps.push(Step::Reply(reply));
    steps.extend(frames(quiet, 2));
    steps.push(Step::QuietUntil(Phase::Listening, 3000));
    steps.extend(sentence());
    let mut rig = Rig::new(vec![Mic::Opens(steps)], Standing::Idle, false);
    rig.audio.live = true;
    rig.serve("open the roadmap");
    assert_eq!(rig.played(), vec![SHORT, LONG, LAST, mark(Phrase::OneSec)]);
    assert_eq!(rig.audio.cut.lock().unwrap().clone(), vec![false, false]);
    assert_eq!(rig.said(), vec!["[spoken] open the roadmap"]);
    assert_eq!(rig.opened(), 2);
}

#[test]
fn a_click_off_while_a_reply_plays_with_the_microphone_open_lets_every_piece_finish() {
    let (reply, rendering) = reply_of(&[SHORT, LONG]);
    let mut steps = frames(quiet, 20);
    steps.push(Step::Reply(reply));
    steps.extend(frames(quiet, 2));
    steps.push(Step::Click);
    steps.extend(sentence());
    let mut rig = Rig::new(vec![Mic::Opens(steps)], Standing::Idle, false);
    rig.audio.live = true;
    rig.shared.update(|state| state.snapshot.on = true);
    thread::scope(|scope| {
        scope.spawn(|| rig.serve_with(&Heard("open the roadmap")));
        let paused = reaches(|| {
            let snapshot = rig.snapshot();
            !snapshot.on && snapshot.phase == Phase::Speaking && rig.played().len() == 2
        });
        rendering.send(Ok((piece(LAST), String::new()))).unwrap();
        let off = reaches(|| rig.snapshot().phase == Phase::Ready);
        rig.shared.update(|state| state.shutdown = true);
        assert!(paused, "the reply did not go on with the microphone paused");
        assert!(off, "voice did not turn off after the reply");
    });
    assert_eq!(rig.played(), vec![SHORT, LONG, LAST]);
    assert_eq!(rig.audio.cut.lock().unwrap().clone(), vec![false]);
    assert!(rig.said().is_empty());
    assert_eq!(rig.opened(), 1);
}
