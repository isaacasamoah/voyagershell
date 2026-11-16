use super::chat::{Chat, parent_of, type_draft};
use super::{Cases, Verdict, cases};
use crate::claude::Claude;
use crate::inspection::Target;
use crate::native::Native;
use crate::sandbox::RUNTIME;
use crate::system::PATIENCE;
use crate::x11::Key;
use anyhow::{Context as _, Result};
use serde_json::{Value, json};
use std::fs;
use voyager_contract::conversation::Focus;

cases! {
    SendMessage => "send-message",
    StreamedReply => "streamed-reply",
    CommandActivity => "command-activity",
    Interrupt => "interrupt",
}

pub const CONTROL: Case = Case::SendMessage;

const MODEL: &str = "verifier-model";
const EFFORT: &str = "low";
const PROMPT: &str = "You are the verifier's configured Claude administrator.";
const FIRST: &str = "Hello from the verifier";
const FIRST_DELTA: &str = "oru: the quiet ";
const SECOND_DELTA: &str = "ocean";
const STATUS: &str = "Where am I?";
const COMMAND: &str = "voyager status";
const COMMAND_ID: &str = "toolu-stand-in-status";
const COMMAND_OUTPUT: &str = r#"{"kind":"status","status":{"version":"3"}}"#;
const DONE: &str = "oru: done.";
const WORKING: &str = "Keep working";
const PARTIAL: &str = "oru: working";
const TERMINAL_VARIABLES: [&str; 3] = ["HC_TERMINAL_ID", "HC_SCOPE", "HC_TERMINAL_SOCKET"];

fn expected_arguments() -> Vec<String> {
    [
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--replay-user-messages",
        "--no-session-persistence",
        "--setting-sources",
        "",
        "--disable-slash-commands",
        "--strict-mcp-config",
        "--mcp-config",
        r#"{"mcpServers":{}}"#,
        "--tools",
        "Bash",
        "--permission-mode",
        "dontAsk",
        "--allowedTools",
        "Bash(hc *)",
        "Bash(voyager *)",
        "--model",
        MODEL,
        "--effort",
        EFFORT,
        "--system-prompt",
        PROMPT,
    ]
    .map(String::from)
    .into()
}

fn arguments(hello: &Value) -> Vec<String> {
    hello["args"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|argument| argument.as_str().map(str::to_owned))
        .collect()
}

fn focus_of(user: &Value) -> Option<Focus> {
    let text = user.pointer("/message/content/1/text")?.as_str()?;
    serde_json::from_str(text.strip_prefix("voyager.focus: ")?).ok()
}

fn sent_text(user: &Value) -> Option<&str> {
    user.pointer("/message/content/0/text")?.as_str()
}

fn ask(native: &Native, claude: &Claude, text: &str) -> Result<Value> {
    type_draft(native, text)?;
    native.press(Key::Return)?;
    let user = claude.next("user", PATIENCE)?;
    claude.replay(&user)?;
    Ok(user)
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let claude = Claude::listen(&native.system.evidence)?;
    native
        .system
        .record(json!({"event":"stand-in","ledger":claude.ledger()}))?;
    let settings = json!({"provider":"claude","model":MODEL,"effort":EFFORT,"prompt":PROMPT});
    fs::write(
        native.profile_path("conversation.json"),
        settings.to_string(),
    )?;
    native
        .system
        .record(json!({"event":"conversation-settings","settings":settings}))?;
    let sent = cases.make(native, Case::SendMessage, |native| {
        native.click(&Target::CHAT_TOGGLE)?;
        native.settle(
            "the chat drawn with an empty composer",
            |seen| seen.shows(&Target::CHAT_COMPOSER).then(|| Chat::of(seen)),
            |chat| chat.composer.as_deref() == Some("") && chat.sending(),
        )?;
        let user = ask(native, &claude, FIRST)?;
        let chat = native.settle(
            "the message drawn with the reply in progress",
            |seen| Some(Chat::of(seen)),
            |chat| chat.says(FIRST) && chat.status && chat.interrupting(),
        )?;
        let (_, layout) = native
            .document()?
            .context("The layout document is missing")?;
        let hello = claude.hello();
        let parent = hello["pid"]
            .as_u64()
            .and_then(|pid| u32::try_from(pid).ok())
            .and_then(parent_of);
        let environment = &hello["environment"];
        let session = &native.system.session;
        let socket = format!("{RUNTIME}/herdr-core/{session}.sock");
        let folder = native.system.evidence.join("profile").join("conversation");
        let verdict = Verdict::new()
            .expect(
                "exactly one stand-in Claude started, as a child of the app",
                claude.connections() == 1 && parent == Some(native.candidate()?.pid),
            )
            .expect(
                "Claude runs with only its Bash tool, allowed only for hc and voyager, with no permission prompts, settings, slash commands, MCP servers or saved session, and with the model, effort and prompt configured in the profile",
                arguments(&hello) == expected_arguments(),
            )
            .expect(
                "Claude runs in the profile's conversation folder against VoyagerShell's own Core session, with no terminal of its own",
                hello["cwd"].as_str() == folder.to_str()
                    && environment["HC_SESSION"].as_str() == Some(session)
                    && environment["HC_SOCKET"].as_str() == Some(socket.as_str())
                    && TERMINAL_VARIABLES
                        .iter()
                        .all(|name| environment.get(name).is_none()),
            )
            .expect(
                "the message carries the typed text and the saved dock context as its focus",
                sent_text(&user) == Some(FIRST)
                    && focus_of(&user).map(|focus| focus.scope) == Some(layout.context.clone()),
            )
            .expect(
                "the composer cleared and the message is drawn while the reply is in progress",
                chat.composer.as_deref() == Some("")
                    && chat.messages.iter().filter(|(_, text)| text == FIRST).count() == 1
                    && chat.status
                    && chat.interrupting(),
            )
            .observed("chat", &chat)?
            .observed("hello", &hello)?
            .observed("user", &user)?;
        Ok((verdict, Some(())))
    })?;
    if sent.is_none() {
        return Ok(());
    }
    let replied = cases.make(native, Case::StreamedReply, |native| {
        let item = "stand-in-message-1:0";
        claude.start_message("stand-in-message-1")?;
        claude.delta(FIRST_DELTA)?;
        let first = native.settle(
            "the first part of the reply drawn",
            |seen| Some(Chat::of(seen)),
            |chat| chat.reply(item) == Some(FIRST_DELTA) && chat.interrupting(),
        )?;
        claude.delta(SECOND_DELTA)?;
        let whole = format!("{FIRST_DELTA}{SECOND_DELTA}");
        let second = native.settle(
            "the reply extended by the second part",
            |seen| Some(Chat::of(seen)),
            |chat| chat.reply(item) == Some(whole.as_str()) && chat.interrupting(),
        )?;
        claude.result("success", false)?;
        let done = native.settle(
            "the reply complete with Send drawn",
            |seen| Some(Chat::of(seen)),
            |chat| chat.sending() && !chat.status,
        )?;
        let verdict = Verdict::new()
            .expect(
                "the first text delta is drawn while the reply is in progress",
                first.reply(item) == Some(FIRST_DELTA) && first.interrupting(),
            )
            .expect(
                "the second text delta extends the first while the reply is in progress",
                second.reply(item) == Some(whole.as_str()) && second.interrupting(),
            )
            .expect(
                "after the result the reply is unchanged, Send is drawn, and no status or error is drawn",
                done.reply(item) == Some(whole.as_str())
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
    let shown = cases.make(native, Case::CommandActivity, |native| {
        ask(native, &claude, STATUS)?;
        claude.tool_use("stand-in-message-2", COMMAND_ID, COMMAND)?;
        let command = format!("$ {COMMAND}");
        let running = native.settle(
            "the command drawn in the conversation",
            |seen| Some(Chat::of(seen)),
            |chat| chat.reply(COMMAND_ID) == Some(command.as_str()) && chat.interrupting(),
        )?;
        claude.tool_result(COMMAND_ID, COMMAND_OUTPUT)?;
        let finished = format!("{command}\n{COMMAND_OUTPUT}");
        let answered = native.settle(
            "the command's output drawn under it",
            |seen| Some(Chat::of(seen)),
            |chat| chat.reply(COMMAND_ID) == Some(finished.as_str()),
        )?;
        let item = "stand-in-message-3:0";
        claude.start_message("stand-in-message-3")?;
        claude.delta(DONE)?;
        claude.result("success", false)?;
        let done = native.settle(
            "the turn complete with Send drawn",
            |seen| Some(Chat::of(seen)),
            |chat| chat.sending() && !chat.status && chat.reply(item) == Some(DONE),
        )?;
        let verdict = Verdict::new()
            .expect(
                "the command Claude runs is drawn in the conversation while the reply is in progress",
                running.reply(COMMAND_ID) == Some(command.as_str()) && running.interrupting(),
            )
            .expect(
                "the command's output is drawn under the command",
                answered.reply(COMMAND_ID) == Some(finished.as_str()),
            )
            .expect(
                "the reply after the command is drawn and the turn completes with no error",
                done.reply(item) == Some(DONE) && done.sending() && done.error.is_none(),
            )
            .expect(
                "the command was Claude's own; the app sent Claude nothing but the human's message",
                claude.connections() == 1,
            )
            .observed("running", &running)?
            .observed("answered", &answered)?
            .observed("done", &done)?;
        Ok((verdict, Some(())))
    })?;
    if shown.is_none() {
        return Ok(());
    }
    cases.check(native, Case::Interrupt, |native| {
        ask(native, &claude, WORKING)?;
        let item = "stand-in-message-4:0";
        claude.start_message("stand-in-message-4")?;
        claude.delta(PARTIAL)?;
        let working = native.settle(
            "the partial reply drawn with Interrupt",
            |seen| Some(Chat::of(seen)),
            |chat| chat.reply(item) == Some(PARTIAL) && chat.interrupting(),
        )?;
        native.click(&Target::CHAT_SEND)?;
        let request = claude.next("control_request", PATIENCE)?;
        let id = request["request_id"].as_str().unwrap_or_default().to_owned();
        claude.control_success(&id)?;
        claude.result("error_during_execution", true)?;
        let stopped = native.settle(
            "Send drawn after the interruption",
            |seen| Some(Chat::of(seen)),
            |chat| chat.sending() && !chat.status,
        )?;
        Verdict::new()
            .expect(
                "pressing Interrupt sends Claude its interrupt control request",
                request["request"]["subtype"] == "interrupt" && !id.is_empty(),
            )
            .expect(
                "after the interruption Send is drawn, the partial reply is kept and no error is drawn",
                working.interrupting()
                    && stopped.sending()
                    && !stopped.status
                    && stopped.reply(item) == Some(PARTIAL)
                    && stopped.error.is_none(),
            )
            .expect(
                "the interruption ended no provider and started no other",
                claude.connections() == 1,
            )
            .observed("request", &request)?
            .observed("working", &working)?
            .observed("stopped", &stopped)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use voyager_contract::Context;

    #[test]
    fn the_sent_text_and_focus_are_read_from_the_users_message() {
        let user = json!({"type":"user","message":{"role":"user","content":[{"type":"text","text":FIRST},{"type":"text","text":"voyager.focus: {\"scope\":{\"kind\":\"workspace\"},\"path\":[],\"cwd\":null,\"revision\":\"3\"}"}]}});
        assert_eq!(sent_text(&user), Some(FIRST));
        assert_eq!(
            focus_of(&user).map(|focus| focus.scope),
            Some(Context::Workspace)
        );
        assert!(focus_of(&json!({})).is_none());
    }
}
