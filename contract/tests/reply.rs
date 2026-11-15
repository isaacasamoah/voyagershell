use serde_json::{Value, json};
use std::sync::Arc;
use voyager_contract::{Layout, Outcome, Reply, Response, Unanswered, Unapplied};

const REASON: &str = "invalid_workspace: A name must contain 1 to 128 bytes";
const LOST: &str = "Core disconnected after dispatch; no request was repeated";
const BUSY: &str = "Workspace busy or unavailable; nothing was queued";
const SILENT: &str = "Workspace result unconfirmed; do not repeat the request";

fn answered(status: Outcome, message: Option<&str>) -> Reply {
    Reply::from(Ok(Response {
        request_id: "request-1".into(),
        status,
        version: 7,
        layout: Arc::new(Layout::default()),
        fresh: true,
        created_workspace: false,
        created_vessels: Vec::new(),
        message: message.map(Into::into),
        close_plan: None,
    }))
}

fn unanswered(status: Unapplied, message: &str) -> Reply {
    Reply::from(Err(Unanswered {
        request_id: "request-1".into(),
        status,
        message: message.into(),
    }))
}

fn replies() -> [(&'static str, Reply); 5] {
    [
        ("applied", answered(Outcome::Applied, None)),
        ("refused", answered(Outcome::Refused, Some(REASON))),
        ("uncertain", answered(Outcome::Uncertain, Some(LOST))),
        ("unansweredRefused", unanswered(Unapplied::Refused, BUSY)),
        (
            "unansweredUncertain",
            unanswered(Unapplied::Uncertain, SILENT),
        ),
    ]
}

#[test]
fn each_reply_is_written_and_read_as_its_committed_example() {
    let examples: Value = serde_json::from_str(include_str!("replies.json")).unwrap();
    assert_eq!(examples.as_object().unwrap().len(), replies().len());
    for (name, reply) in replies() {
        assert_eq!(
            serde_json::to_value(&reply).unwrap(),
            examples[name],
            "{name}"
        );
        assert_eq!(
            serde_json::from_value::<Reply>(examples[name].clone()).unwrap(),
            reply,
            "{name}"
        );
    }
}

#[test]
fn a_reply_without_the_owners_answer_cannot_say_applied() {
    let forged = json!({"requestId": "request-1", "status": "applied", "message": "done"});
    assert!(serde_json::from_value::<Reply>(forged).is_err());
}

#[test]
fn the_retired_word_for_a_refusal_is_not_read() {
    let mut retired = serde_json::to_value(answered(Outcome::Refused, Some(REASON))).unwrap();
    retired["status"] = json!("rejected");
    assert!(serde_json::from_value::<Reply>(retired).is_err());
}
