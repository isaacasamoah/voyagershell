use super::*;

fn line_marks(left_out: Option<Phrase>) -> (usize, Vec<usize>) {
    let mut rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    rig.model = Model::Says(LOOK);
    rig.clips = clips_without(left_out);
    let name = format!("voyager-line-{left_out:?}-{}.jsonl", std::process::id());
    let path = std::env::temp_dir().join(name);
    let trace = Trace::to_file(path.clone());
    rig.shared.update(|state| state.snapshot.on = true);
    let vocabulary: Vocabulary = Arc::new(Vec::new);
    let hearing = Heard("Open the roadmap.");
    Exchange {
        trace: &trace,
        ..rig.exchange(&hearing, &vocabulary)
    }
    .serve(Duration::from_millis(5));
    let marks = std::fs::read_to_string(&path).unwrap_or_default();
    let _ = std::fs::remove_file(&path);
    let started = r#""event":"acknowledgement-started""#;
    let lines = marks
        .lines()
        .filter(|line| line.contains(started) && line.contains(r#""words":"one-sec""#))
        .count();
    (lines, rig.played())
}

#[test]
fn a_click_while_the_turn_is_decided_plays_nothing_more_and_the_request_still_goes() {
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
    assert!(rig.played().is_empty());
    assert_eq!(rig.opened(), 1);
}

#[test]
fn turns_in_a_row_vary_the_chosen_line() {
    let mut rig = Rig::new(
        vec![
            Mic::Opens(sentence()),
            Mic::Opens(sentence()),
            Mic::Opens(sentence()),
        ],
        Standing::Idle,
        false,
    );
    rig.model = Model::Says(r#"{"kind": "work", "ack": "sure"}"#);
    rig.serve("Ask the crew to run the tests.");
    assert_eq!(
        rig.played(),
        vec![mark(Phrase::Sure), mark(Phrase::Okay), mark(Phrase::GotIt)]
    );
    assert_eq!(rig.said().len(), 3);
}

#[test]
fn a_chosen_line_that_is_not_kept_plays_nothing_and_marks_no_acknowledgement() {
    assert_eq!(line_marks(Some(Phrase::OneSec)), (0, vec![]));
    assert_eq!(line_marks(None), (1, vec![mark(Phrase::OneSec)]));
}

#[test]
fn a_click_while_the_acknowledgement_plays_lets_it_finish_and_the_request_still_goes() {
    let rig = Rig::new(vec![Mic::Opens(sentence())], Standing::Idle, false);
    *rig.audio.while_playing.lock().unwrap() = Some(click);
    rig.shared.update(|state| state.snapshot.on = true);
    thread::scope(|scope| {
        scope.spawn(|| rig.serve("open the roadmap"));
        wait_until(|| {
            let snapshot = rig.snapshot();
            !snapshot.on && snapshot.phase == Phase::Ready
        });
        rig.shared.update(|state| state.shutdown = true);
    });
    assert_eq!(rig.said(), vec!["[spoken] open the roadmap"]);
    assert_eq!(rig.played(), vec![mark(Phrase::OneSec)]);
    assert_eq!(rig.audio.cut.lock().unwrap().clone(), vec![false]);
    assert_eq!(rig.opened(), 1);
}
