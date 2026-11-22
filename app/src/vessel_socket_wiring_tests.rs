use super::tests::{answering, services, terminal, workspace};
use super::*;
use crate::spoken::Kind;

fn reply_line(turn: &str, text: &str) -> String {
    serde_json::to_string(&SocketRequest::Reply {
        event: voyager_contract::reply::ReplyEvent::Text {
            turn: turn.into(),
            message: format!("{turn}-message"),
            index: 0,
            last: true,
            text: text.into(),
        },
    })
    .unwrap()
}

fn stop_line(turn: &str, text: &str) -> String {
    serde_json::to_string(&SocketRequest::Reply {
        event: voyager_contract::reply::ReplyEvent::TurnEnd {
            turn: turn.into(),
            text: text.into(),
        },
    })
    .unwrap()
}

fn focus_line(prompt: &str, spoken: bool) -> String {
    if spoken {
        format!(r#"{{"command":"focus","spoken":true,"prompt":"{prompt}"}}"#)
    } else {
        r#"{"command":"focus"}"#.into()
    }
}

struct Wiring {
    call: Call,
    binding: Binding,
    turns: Mutex<TurnLedger>,
    replies: Replies,
}

impl Wiring {
    fn new() -> Self {
        let binding = Binding::unbound();
        binding.bind(terminal("t8")).unwrap();
        Self {
            call: answering(workspace()),
            binding,
            turns: Mutex::default(),
            replies: Replies::default(),
        }
    }

    fn from(&self, id: &str, vessel: &str, line: &str) -> SocketReply {
        answer(
            &services(&self.call),
            &self.binding,
            &self.turns,
            &self.replies,
            &VesselId(vessel.into()),
            &terminal(id),
            line,
        )
    }

    fn spoken(&self) -> Vec<(String, bool)> {
        self.replies
            .snapshot()
            .turns
            .into_iter()
            .map(|turn| (turn.id, turn.spoken))
            .collect()
    }
}

#[test]
fn two_spoken_prompts_then_two_replies_are_both_spoken_in_order() {
    let wiring = Wiring::new();
    wiring.from("t8", "voyager", &focus_line("p1", true));
    wiring.from("t8", "voyager", &focus_line("p2", true));
    for turn in ["p1", "p2", "p3"] {
        let reply = wiring.from("t8", "voyager", &reply_line(turn, "answer"));
        assert_eq!(reply, SocketReply::Noted);
    }
    assert_eq!(
        wiring.spoken(),
        vec![
            ("p1".into(), true),
            ("p2".into(), true),
            ("p3".into(), false)
        ]
    );
}

#[test]
fn a_spoken_a_typed_and_a_spoken_prompt_before_any_reply_are_spoken_silent_spoken() {
    let wiring = Wiring::new();
    wiring.from("t8", "voyager", &focus_line("p1", true));
    wiring.from("t8", "voyager", &focus_line("p2", false));
    wiring.from("t8", "voyager", &focus_line("p3", true));
    for turn in ["p1", "p2", "p3"] {
        wiring.from("t8", "voyager", &reply_line(turn, "answer"));
    }
    assert_eq!(
        wiring.spoken(),
        vec![
            ("p1".into(), true),
            ("p2".into(), false),
            ("p3".into(), true)
        ]
    );
}

#[test]
fn a_spoken_turn_with_no_stop_or_no_reply_does_not_pass_its_mark_to_a_typed_turn() {
    let wiring = Wiring::new();
    wiring.from("t8", "voyager", &focus_line("p1", true));
    wiring.from("t8", "voyager", &reply_line("p1", "streamed, then no Stop"));
    wiring.from("t8", "voyager", &focus_line("p2", true));
    wiring.from("t8", "voyager", &focus_line("p3", false));
    wiring.from("t8", "voyager", &reply_line("p3", "typed answer"));
    assert_eq!(
        wiring.spoken(),
        vec![("p1".into(), true), ("p3".into(), false)]
    );
    wiring.from("t8", "voyager", &stop_line("p2", "Done."));
    assert_eq!(
        wiring.spoken(),
        vec![
            ("p1".into(), true),
            ("p3".into(), false),
            ("p2".into(), true)
        ]
    );
}

#[test]
fn a_spoken_focus_request_with_no_prompt_id_marks_nothing() {
    let wiring = Wiring::new();
    wiring.from("t8", "voyager", r#"{"command":"focus","spoken":true}"#);
    wiring.from("t8", "voyager", &reply_line("p1", "answer"));
    assert_eq!(wiring.spoken(), vec![("p1".into(), false)]);
}

#[test]
fn another_terminals_spoken_turn_is_not_spoken() {
    let wiring = Wiring::new();
    let marked = wiring.from("t9", "crew", &focus_line("c1", true));
    assert!(matches!(marked, SocketReply::Focus { .. }));
    let refused = wiring.from("t9", "crew", &reply_line("c1", "spoken?"));
    assert!(matches!(refused, SocketReply::Refused { .. }));
    assert!(wiring.replies.snapshot().turns.is_empty());
    wiring.from("t8", "voyager", &reply_line("p1", "typed answer"));
    assert_eq!(wiring.spoken(), vec![("p1".into(), false)]);
    assert_eq!(
        wiring
            .turns
            .lock()
            .unwrap()
            .observe(&VesselId("crew".into()), "c1"),
        Kind::Typed
    );
}

#[test]
fn a_reply_is_stored_only_when_it_comes_from_the_bound_terminal() {
    let wiring = Wiring::new();
    let refused = wiring.from("t9", "crew", &reply_line("turn-1", "no"));
    assert!(matches!(refused, SocketReply::Refused { .. }));
    assert!(wiring.replies.snapshot().turns.is_empty());
    let noted = wiring.from("t8", "voyager", &reply_line("turn-1", "yes"));
    assert_eq!(noted, SocketReply::Noted);
    assert_eq!(wiring.replies.snapshot().turns[0].messages[0].text, "yes");
}

#[test]
fn a_reply_is_refused_while_nothing_is_bound() {
    let wiring = Wiring::new();
    wiring.binding.forget();
    let reply = wiring.from("t8", "voyager", &reply_line("turn-1", "x"));
    assert!(matches!(reply, SocketReply::Refused { .. }));
    assert!(wiring.replies.snapshot().turns.is_empty());
}
