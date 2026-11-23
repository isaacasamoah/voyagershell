use super::*;

#[test]
fn the_look_and_sure_pools_are_four_different_lines_each_and_share_none() {
    assert!(Ack::None.pool().is_empty());
    let look = Ack::Look.pool();
    let sure = Ack::Sure.pool();
    assert_eq!((look.len(), sure.len()), (4, 4));
    let mut every: Vec<&str> = look
        .iter()
        .chain(sure)
        .map(|phrase| phrase.words())
        .collect();
    every.sort_unstable();
    every.dedup();
    assert_eq!(every.len(), 8);
    assert!(
        look.iter()
            .chain(sure)
            .all(|phrase| Phrase::ALL.contains(phrase))
    );
}

#[test]
fn a_chosen_line_promises_nothing_and_names_nobody() {
    for phrase in Ack::Look.pool().iter().chain(Ack::Sure.pool()) {
        let words = phrase.words().to_lowercase();
        for forbidden in ["voyager", "will", "i'll", "on it", "done", "asking"] {
            assert!(!words.contains(forbidden), "{words}");
        }
    }
}

#[test]
fn a_working_voyager_queues_the_words_whatever_the_choice() {
    for ack in Ack::ALL {
        let queued = acknowledge(Standing::Working, ack, 0);
        assert_eq!((queued.phrase, queued.send), (Some(Phrase::Queued), true));
    }
}

#[test]
fn a_voyager_with_no_state_yet_is_asked_like_an_idle_one() {
    for ack in Ack::ALL {
        for turn in [0, 1] {
            let unknown = acknowledge(Standing::Unknown, ack, turn);
            let idle = acknowledge(Standing::Idle, ack, turn);
            assert_eq!(unknown, idle);
            assert!(unknown.send);
        }
    }
}

#[test]
fn a_blocked_or_absent_voyager_receives_nothing() {
    for ack in Ack::ALL {
        for (standing, phrase) in [
            (Standing::Blocked, Phrase::NeedsYou),
            (Standing::NotRunning, Phrase::Gone),
        ] {
            let held = acknowledge(standing, ack, 0);
            assert_eq!((held.phrase, held.send), (Some(phrase), false));
        }
    }
}
