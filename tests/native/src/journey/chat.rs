use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Seen};
use crate::provider::{Provider, Turn};
use crate::system::PATIENCE;
use crate::x11::Key;
use anyhow::{Context as _, Result};
use serde::Serialize;
use serde_json::{Value, json};
use std::fs;
use voyager_contract::conversation::Focus;
use voyager_contract::inspection::Role;

cases! {
    OpenChat => "open-chat",
    SendMessage => "send-message",
    StreamedReply => "streamed-reply",
    ProviderError => "provider-error",
}

pub const CONTROL: Case = Case::StreamedReply;

const FIRST: &str = "Hello from the verifier";
const REPLY_ITEM: &str = "stand-in-reply-1";
const FIRST_DELTA: &str = "oru: the quiet ";
const SECOND_DELTA: &str = "ocean";
const FAILING: &str = "Fail this turn";
const REFUSAL: &str = "Stand-in refused this turn";
const AGAIN: &str = "Are you there?";
const AGAIN_ITEM: &str = "stand-in-reply-2";
const AGAIN_REPLY: &str = "oru: yes.";

#[derive(Clone, Debug, PartialEq, Serialize)]
struct Chat {
    composer: Option<String>,
    send: Option<String>,
    status: bool,
    error: Option<String>,
    messages: Vec<(String, String)>,
}

impl Chat {
    fn of(seen: &Seen) -> Self {
        Self {
            composer: seen.label(&Target::CHAT_COMPOSER).map(str::to_owned),
            send: seen.label(&Target::CHAT_SEND).map(str::to_owned),
            status: seen.shows(&Target::CHAT_STATUS),
            error: seen.label(&Target::CHAT_ERROR).map(str::to_owned),
            messages: seen
                .frame
                .elements
                .iter()
                .filter(|element| element.role == Role::ChatMessage)
                .map(|element| {
                    (
                        element.key.clone(),
                        element.label.clone().unwrap_or_default(),
                    )
                })
                .collect(),
        }
    }

    fn reply(&self, item: &str) -> Option<&str> {
        self.messages
            .iter()
            .find(|(key, _)| key == item)
            .map(|(_, text)| text.as_str())
    }

    fn says(&self, text: &str) -> bool {
        self.messages.iter().any(|(_, shown)| shown == text)
    }

    fn sending(&self) -> bool {
        self.send.as_deref() == Some("Send")
    }

    fn interrupting(&self) -> bool {
        self.send.as_deref() == Some("Interrupt")
    }
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let provider = Provider::listen(&native.system.evidence)?;
    native
        .system
        .record(json!({"event":"stand-in","ledger":provider.ledger()}))?;
    let opened = cases.make(native, Case::OpenChat, |native| {
        native.click(&Target::CHAT_TOGGLE)?;
        let chat = native.settle(
            "the chat drawn with an empty composer",
            |seen| seen.shows(&Target::CHAT_COMPOSER).then(|| Chat::of(seen)),
            |chat| chat.composer.as_deref() == Some("") && chat.sending(),
        )?;
        let verdict = Verdict::new()
            .expect(
                "the composer is drawn and empty",
                chat.composer.as_deref() == Some(""),
            )
            .expect("the send control reads Send", chat.sending())
            .expect("no message is drawn", chat.messages.is_empty())
            .expect(
                "opening the chat starts no provider",
                provider.connections() == 0,
            )
            .observed("chat", &chat)?;
        Ok((verdict, Some(())))
    })?;
    if opened.is_none() {
        return Ok(());
    }
    let Some(turn) = cases.make(native, Case::SendMessage, |native| {
        let draft = type_draft(native, FIRST)?;
        native.press(Key::Return)?;
        let turn = provider.next_turn(PATIENCE)?;
        let chat = native.settle(
            "the message drawn with the reply in progress",
            |seen| Some(Chat::of(seen)),
            |chat| {
                chat.composer.as_deref() == Some("")
                    && chat.says(FIRST)
                    && chat.status
                    && chat.interrupting()
            },
        )?;
        let (_, layout) = native
            .document()?
            .context("The layout document is missing")?;
        let threads = provider.thread_starts();
        let thread = threads.first().cloned().unwrap_or(Value::Null);
        let folder = native.system.evidence.join("profile").join("conversation");
        let focus = focus_of(&turn);
        let parent = provider.relay_pid().and_then(parent_of);
        let verdict = Verdict::new()
            .expect(
                "the composer held the typed text before Return",
                draft.as_deref() == Some(FIRST),
            )
            .expect(
                "exactly one stand-in provider started, as a child of the app",
                provider.connections() == 1 && parent == Some(native.candidate()?.pid),
            )
            .expect(
                "the conversation asks for a read-only sandbox, no approvals, four tools and the profile's conversation folder",
                threads.len() == 1
                    && thread["sandbox"] == "read-only"
                    && thread["approvalPolicy"] == "never"
                    && thread["dynamicTools"].as_array().map(Vec::len) == Some(4)
                    && thread["cwd"].as_str() == folder.to_str(),
            )
            .expect(
                "the turn carries the typed text and the saved context as its focus",
                turn.text == FIRST
                    && focus.as_ref().map(|focus| &focus.scope) == Some(&layout.context),
            )
            .expect(
                "the composer cleared and the message is drawn while the reply is in progress",
                chat.composer.as_deref() == Some("")
                    && chat.messages.iter().filter(|(_, text)| text == FIRST).count() == 1
                    && chat.status
                    && chat.interrupting(),
            )
            .observed("chat", &chat)?
            .observed("threadStart", &thread)?
            .observed("turn", &turn)?;
        Ok((verdict, Some(turn)))
    })?
    else {
        return Ok(());
    };
    let replied = cases.make(native, Case::StreamedReply, |native| {
        provider.started(&turn)?;
        provider.item_started(&turn, REPLY_ITEM)?;
        provider.delta(&turn, REPLY_ITEM, FIRST_DELTA)?;
        let first = native.settle(
            "the first part of the reply drawn",
            |seen| Some(Chat::of(seen)),
            |chat| chat.reply(REPLY_ITEM) == Some(FIRST_DELTA) && chat.interrupting(),
        )?;
        provider.delta(&turn, REPLY_ITEM, SECOND_DELTA)?;
        let whole = format!("{FIRST_DELTA}{SECOND_DELTA}");
        let second = native.settle(
            "the reply extended by the second part",
            |seen| Some(Chat::of(seen)),
            |chat| chat.reply(REPLY_ITEM) == Some(whole.as_str()) && chat.interrupting(),
        )?;
        provider.finish(&turn, REPLY_ITEM, &whole)?;
        provider.complete(&turn)?;
        let done = native.settle(
            "the reply complete with Send drawn",
            |seen| Some(Chat::of(seen)),
            |chat| chat.sending() && !chat.status,
        )?;
        let verdict = Verdict::new()
            .expect(
                "the first part of the reply is drawn while the reply is in progress",
                first.reply(REPLY_ITEM) == Some(FIRST_DELTA) && first.interrupting(),
            )
            .expect(
                "the second part extends the first while the reply is in progress",
                second.reply(REPLY_ITEM) == Some(whole.as_str()) && second.interrupting(),
            )
            .expect(
                "after completion the reply is unchanged, Send is drawn, and no status or error is drawn",
                done.reply(REPLY_ITEM) == Some(whole.as_str())
                    && done.sending()
                    && !done.status
                    && done.error.is_none(),
            )
            .observed("first", &first)?
            .observed("second", &second)?
            .observed("done", &done)?;
        Ok((verdict, Some(())))
    })?;
    if replied.is_none() {
        return Ok(());
    }
    cases.check(native, Case::ProviderError, |native| {
        type_draft(native, FAILING)?;
        native.press(Key::Return)?;
        let failing = provider.next_turn(PATIENCE)?;
        provider.started(&failing)?;
        provider.fail(&failing, REFUSAL)?;
        let refused = native.settle(
            "the provider's error drawn",
            |seen| Some(Chat::of(seen)),
            |chat| chat.error.as_deref() == Some(REFUSAL) && chat.sending(),
        )?;
        type_draft(native, AGAIN)?;
        native.press(Key::Return)?;
        let again = provider.next_turn(PATIENCE)?;
        provider.started(&again)?;
        provider.delta(&again, AGAIN_ITEM, AGAIN_REPLY)?;
        provider.complete(&again)?;
        let answered = native.settle(
            "the next reply drawn",
            |seen| Some(Chat::of(seen)),
            |chat| chat.reply(AGAIN_ITEM) == Some(AGAIN_REPLY) && chat.sending(),
        )?;
        Verdict::new()
            .expect(
                "the provider's error is drawn, Send is drawn, and the message is kept",
                refused.error.as_deref() == Some(REFUSAL)
                    && refused.sending()
                    && refused.says(FAILING),
            )
            .expect(
                "the next message is a new turn on the same conversation and provider",
                provider.connections() == 1
                    && provider.thread_starts().len() == 1
                    && again.thread == turn.thread
                    && again.text == AGAIN,
            )
            .expect(
                "the next reply is drawn",
                answered.reply(AGAIN_ITEM) == Some(AGAIN_REPLY) && answered.sending(),
            )
            .observed("refused", &refused)?
            .observed("answered", &answered)?
            .observed("turns", provider.turn_starts().len())
    })
}

fn type_draft(native: &Native, text: &str) -> Result<Option<String>> {
    native.click(&Target::CHAT_COMPOSER)?;
    native.type_text(text)?;
    native.settle(
        "the composer holding the typed text",
        |seen| Some(seen.label(&Target::CHAT_COMPOSER).map(str::to_owned)),
        |draft| draft.as_deref() == Some(text),
    )
}

fn focus_of(turn: &Turn) -> Option<Focus> {
    let value = turn
        .params
        .pointer("/additionalContext/voyager.focus/value")?
        .as_str()?;
    serde_json::from_str(value).ok()
}

fn parent_of(pid: u32) -> Option<u32> {
    let stat = fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    let after = stat.rsplit_once(')')?.1;
    after.split_whitespace().nth(1)?.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use voyager_contract::Context;

    #[test]
    fn a_reply_is_found_by_its_item_and_the_send_label_names_the_phase() {
        let chat = Chat {
            composer: Some(String::new()),
            send: Some("Interrupt".into()),
            status: true,
            error: None,
            messages: vec![
                ("request-1".into(), FIRST.into()),
                (REPLY_ITEM.into(), FIRST_DELTA.into()),
            ],
        };
        assert_eq!(chat.reply(REPLY_ITEM), Some(FIRST_DELTA));
        assert!(chat.says(FIRST) && chat.interrupting() && !chat.sending());
        assert_eq!(chat.reply("other"), None);
    }

    #[test]
    fn a_process_parent_is_read_after_the_command_name() {
        assert_eq!(
            parent_of(std::process::id()),
            Some(std::os::unix::process::parent_id())
        );
    }

    #[test]
    fn the_focus_is_read_from_the_turn_context() {
        let focus = json!({"scope":{"kind":"workspace"},"path":[],"cwd":null,"revision":"3"});
        let turn = Turn {
            thread: "t".into(),
            id: "u".into(),
            text: FIRST.into(),
            params: json!({"additionalContext":{"voyager.focus":{"kind":"application","value":focus.to_string()}}}),
        };
        assert_eq!(
            focus_of(&turn).map(|focus| focus.scope),
            Some(Context::Workspace)
        );
    }
}
