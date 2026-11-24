use super::workspace::{Finish, Open, rename};
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Seen, Stopwatch};
use crate::provider::{Provider, Script, Turn};
use crate::system::PATIENCE;
use crate::x11::Key;
use anyhow::{Context as _, Result};
use serde::Serialize;
use serde_json::{Value, json};
use std::fs;
use voyager_contract::context::Focus;
use voyager_contract::inspection::Role;
use voyager_contract::{Context as Dock, FleetId, RenameTarget};

cases! {
    OpenChat => "open-chat",
    SendMessage => "send-message",
    StreamedReply => "streamed-reply",
    ProviderError => "provider-error",
    RenameWhileProviderWorks => "rename-while-provider-works",
    ToolCallInspect => "tool-call-inspect",
    ToolCallEffect => "tool-call-effect",
    DockTakesYouThere => "dock-takes-you-there",
    PeekStaysHere => "peek-stays-here";
    "peek-stays-here" needs "dock-takes-you-there",
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
const INSPECT: &str = "Inspect the workspace";
const INSPECT_ITEM: &str = "stand-in-inspect";
const EFFECT: &str = "Rename the Fleet";
const EFFECT_ITEM: &str = "stand-in-effect";
const DOCK: &str = "Take me to the other Fleet";
const DOCK_ITEM: &str = "stand-in-dock";
const PEEK: &str = "Look at the other Fleet";
const PEEK_ITEM: &str = "stand-in-peek";
const PEEK_TOOL: &str = "voyager_peek";
const DONE: &str = "oru: done.";
const RENAMED: &str = "Scripted Fleet";
const PROMPT: &str = "You are the verifier's configured administrator.";
const WORKING: &str = "Keep working";
const WORKING_ITEM: &str = "stand-in-working";
const RENAMED_BY_HAND: &str = "Renamed while working";
const WORKSPACE: &str = "voyager_workspace";

pub(super) fn inspect_script() -> Script {
    Script::parse(&format!(
        r#"{{"calls":[{{"tool":"{WORKSPACE}","arguments":{{"expectedVersion":"0","action":{{"operation":"inspect"}}}}}}]}}"#
    ))
    .expect("the built-in inspect script is valid")
}

fn effect_script() -> Script {
    Script::parse(&format!(
        r#"{{"calls":[
            {{"tool":"{WORKSPACE}","arguments":{{"expectedVersion":"0","action":{{"operation":"inspect"}}}}}},
            {{"atMs":100,"tool":"{WORKSPACE}","arguments":{{"expectedVersion":{{"$result":[0,"/version"]}},"action":{{"operation":"rename","target":{{"kind":"fleet","id":{{"$result":[0,"/layout/selectedFleet"]}}}},"name":"{RENAMED}"}}}}}}
        ]}}"#
    ))
    .expect("the built-in effect script is valid")
}

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
    let settings = json!({ "prompt": PROMPT });
    fs::write(
        native.profile_path("conversation.json"),
        settings.to_string(),
    )?;
    native
        .system
        .record(json!({"event":"conversation-settings","settings":settings}))?;
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
        let pressed = Stopwatch::start();
        native.press(Key::Return)?;
        let turn = provider.next_turn(PATIENCE)?;
        let send_to_turn = pressed.lap();
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
                "the conversation asks for a read-only sandbox, no approvals, five tools and the profile's conversation folder",
                threads.len() == 1
                    && thread["sandbox"] == "read-only"
                    && thread["approvalPolicy"] == "never"
                    && thread["dynamicTools"].as_array().map(Vec::len) == Some(5)
                    && thread["cwd"].as_str() == folder.to_str(),
            )
            .expect(
                "the conversation's instructions are the prompt configured in the profile",
                thread["baseInstructions"] == PROMPT,
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
            .observed("turn", &turn)?
            .observed("sendToTurnMs", send_to_turn)?;
        Ok((verdict, Some(turn)))
    })?
    else {
        return Ok(());
    };
    let replied = cases.make(native, Case::StreamedReply, |native| {
        provider.started(&turn)?;
        provider.item_started(&turn, REPLY_ITEM)?;
        let streamed = Stopwatch::start();
        provider.delta(&turn, REPLY_ITEM, FIRST_DELTA)?;
        let first = native.settle(
            "the first part of the reply drawn",
            |seen| Some(Chat::of(seen)),
            |chat| chat.reply(REPLY_ITEM) == Some(FIRST_DELTA) && chat.interrupting(),
        )?;
        let delta_to_drawn = streamed.lap();
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
            .observed("deltaToDrawnMs", delta_to_drawn)?
            .observed("second", &second)?
            .observed("done", &done)?;
        Ok((verdict, Some(())))
    })?;
    if replied.is_none() {
        return Ok(());
    }
    let answered = cases.make(native, Case::ProviderError, |native| {
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
        let verdict = Verdict::new()
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
            .observed("turns", provider.turn_starts().len())?;
        Ok((verdict, Some(())))
    })?;
    if answered.is_none() {
        return Ok(());
    }
    let renamed = cases.make(native, Case::RenameWhileProviderWorks, |native| {
        let (_, layout) = native
            .document()?
            .context("The layout document is missing")?;
        let fleet = layout
            .selected_fleet
            .context("The layout has no selected Fleet")?;
        let turn = ask(native, &provider, WORKING)?;
        let turns = provider.turn_starts().len();
        let started = Stopwatch::start();
        let subject = RenameTarget::Fleet { id: fleet.clone() };
        rename(native, &subject, Open::DoubleClick, RENAMED_BY_HAND, Finish::Enter)?;
        let saved = native.watch(|native| {
            Ok(saved_name(native, &fleet)?.filter(|name| name == RENAMED_BY_HAND))
        })?;
        let elapsed = started.lap();
        let working = native.settle(
            "the reply still in progress after the rename",
            |seen| Some(Chat::of(seen)),
            |chat| chat.interrupting(),
        )?;
        let quiet = provider.turn_starts().len() == turns && provider.connections() == 1;
        conclude(native, &provider, &turn, WORKING_ITEM)?;
        Ok((
            Verdict::new()
                .expect(
                    "the Fleet's saved name is the typed name while the provider's turn is still in progress",
                    saved.is_some() && working.interrupting() && working.status,
                )
                .expect(
                    "the rename started no provider turn and no second provider",
                    quiet,
                )
                .observed("renameMs", elapsed)?
                .observed("working", &working)?,
            Some(()),
        ))
    })?;
    if renamed.is_none() {
        return Ok(());
    }
    let inspected = cases.make(native, Case::ToolCallInspect, |native| {
        let turn = ask(native, &provider, INSPECT)?;
        let played = provider.play(&turn, &inspect_script())?;
        conclude(native, &provider, &turn, INSPECT_ITEM)?;
        let (_, layout) = native
            .document()?
            .context("The layout document is missing")?;
        let result = played.first().map(|call| &call.result);
        let text = result.and_then(returned_text);
        let verdict = Verdict::new()
            .expect(
                "one call reached the app's workspace tool and the app returned a successful result",
                played.len() == 1
                    && result.is_some_and(|result| result["result"]["success"] == true),
            )
            .expect(
                "the returned result is the app's Applied reply naming the saved layout's selected Fleet",
                text.as_ref().is_some_and(|text| {
                    text["status"] == "applied"
                        && text["layout"]["selectedFleet"]
                            == json!(layout.selected_fleet.as_ref().map(|fleet| &fleet.0))
                }),
            )
            .observed("played", &played)?
            .observed("returned", &text)?;
        Ok((verdict, Some(())))
    })?;
    if inspected.is_none() {
        return Ok(());
    }
    cases.check(native, Case::ToolCallEffect, |native| {
        let custom = native.script.clone();
        let script = custom.clone().unwrap_or_else(effect_script);
        let (_, before) = native
            .document()?
            .context("The layout document is missing")?;
        let fleet = before
            .selected_fleet
            .clone()
            .context("The layout has no selected Fleet")?;
        script.require_calls()?;
        let turn = ask(native, &provider, EFFECT)?;
        let played = provider.play(&turn, &script)?;
        conclude(native, &provider, &turn, EFFECT_ITEM)?;
        let mut verdict = Verdict::new().expect(
            "every scripted call received a result from the app, in script order",
            played.len() == script.calls.len()
                && played
                    .iter()
                    .zip(&script.calls)
                    .all(|(call, scripted)| call.tool == scripted.tool && is_return(&call.result)),
        );
        if custom.is_none() {
            let drawn = native.settle(
                "the renamed Fleet drawn",
                |seen| {
                    Some(
                        seen.label(&Target::name(&RenameTarget::Fleet { id: fleet.clone() }))
                            .map(str::to_owned),
                    )
                },
                |name| name.as_deref() == Some(RENAMED),
            )?;
            let saved = saved_name(native, &fleet)?;
            verdict = verdict
                .expect(
                    "the built-in rename's result was Applied",
                    played
                        .get(1)
                        .and_then(|call| returned_text(&call.result))
                        .is_some_and(|text| text["status"] == "applied"),
                )
                .expect(
                    "the Fleet's drawn name and its saved name are the scripted name",
                    drawn.as_deref() == Some(RENAMED) && saved.as_deref() == Some(RENAMED),
                )
                .observed("drawn", &drawn)?;
        }
        verdict.observed("played", &played)
    })?;

    cases.check(native, Case::DockTakesYouThere, |native| {
        let (_, before) = native
            .document()?
            .context("The layout document is missing")?;
        let voyage = before
            .selected_voyage
            .clone()
            .context("The layout has no selected Voyage")?;
        let here = before
            .selected_fleet
            .clone()
            .context("The layout has no selected Fleet")?;
        native.click(&Target::create_fleet(&voyage))?;
        native.click(&Target::worker("terminal"))?;
        let (other, vessel) = native.settle(
            "a second Fleet created and selected",
            |seen| {
                let fleet = seen
                    .document
                    .voyages
                    .iter()
                    .flat_map(|voyage| &voyage.fleets)
                    .find(|fleet| {
                        fleet.id != here && seen.document.selected_fleet.as_ref() == Some(&fleet.id)
                    })?;
                Some((fleet.id.clone(), fleet.placements.first()?.id.clone()))
            },
            |_| true,
        )?;
        native.click(&Target::name(&RenameTarget::Fleet { id: here.clone() }))?;
        native.settle(
            "the first Fleet selected again",
            |seen| Some(seen.document.selected_fleet.clone()),
            |selected| selected.as_ref() == Some(&here),
        )?;
        let target = Dock::Vessel { id: vessel.clone() };
        let script = Script::parse(
            &json!({"calls":[
                {"tool":WORKSPACE,"arguments":{"expectedVersion":"0","action":{"operation":"inspect"}}},
                {"atMs":100,"tool":WORKSPACE,"arguments":{
                    "expectedVersion":{"$result":[0,"/version"]},
                    "action":{"operation":"dock","context":{"kind":"vessel","id":vessel.0}}}}
            ]})
            .to_string(),
        )?;
        let turn = ask(native, &provider, DOCK)?;
        let played = provider.play(&turn, &script)?;
        conclude(native, &provider, &turn, DOCK_ITEM)?;
        let there = native.settle(
            "the other Fleet selected and its Vessel drawn, with the dock on that Vessel",
            |seen| {
                Some((
                    seen.document.selected_fleet.clone(),
                    seen.document.context.clone(),
                    seen.document
                        .last_vessels
                        .iter()
                        .find(|entry| Some(&entry.fleet) == seen.document.selected_fleet.as_ref())
                        .map(|entry| entry.vessel.clone()),
                    seen.shows(&Target::terminal(&vessel)),
                ))
            },
            |(selected, context, last, drawn)| {
                selected.as_ref() == Some(&other)
                    && context == &target
                    && last.as_ref() == Some(&vessel)
                    && *drawn
            },
        )?;
        Verdict::new()
            .expect(
                "both scripted calls received a result from the app",
                played.len() == 2 && played.iter().all(|call| is_return(&call.result)),
            )
            .expect(
                "the dock call's result was Applied",
                played
                    .get(1)
                    .and_then(|call| returned_text(&call.result))
                    .is_some_and(|text| text["status"] == "applied"),
            )
            .expect(
                "the other Fleet is selected, drawn with its Vessel, and remembers that Vessel",
                there.0.as_ref() == Some(&other) && there.3 && there.2.as_ref() == Some(&vessel),
            )
            .expect("the dock is on that Vessel", there.1 == target)
            .observed("there", &there)?
            .observed("played", &played)
    })?;

    cases.check(native, Case::PeekStaysHere, |native| {
        let (_, before) = native
            .document()?
            .context("The layout document is missing")?;
        let elsewhere = before
            .voyages
            .iter()
            .flat_map(|voyage| &voyage.fleets)
            .find(|fleet| before.selected_fleet.as_ref() != Some(&fleet.id))
            .context("The layout has no other Fleet")?
            .clone();
        let vessel = elsewhere
            .placements
            .first()
            .context("The other Fleet has no Vessel")?
            .id
            .clone();
        let script = Script::parse(
            &json!({"calls":[
                {"tool":PEEK_TOOL,"arguments":{"target":{"kind":"fleet","id":elsewhere.id.0}}},
                {"atMs":100,"tool":PEEK_TOOL,"arguments":{"target":{"kind":"vessel","id":vessel.0}}}
            ]})
            .to_string(),
        )?;
        let turn = ask(native, &provider, PEEK)?;
        let played = provider.play(&turn, &script)?;
        conclude(native, &provider, &turn, PEEK_ITEM)?;
        let (_, after) = native
            .document()?
            .context("The layout document is missing")?;
        Verdict::new()
            .expect(
                "both scripted calls received a result from the app",
                played.len() == 2 && played.iter().all(|call| is_return(&call.result)),
            )
            .expect(
                "each peek returned an Applied read that names the target",
                played.iter().all(|call| {
                    returned_text(&call.result).is_some_and(|text| {
                        text["status"] == "applied" && text.to_string().contains(&elsewhere.id.0)
                    })
                }),
            )
            .expect(
                "the selected Fleet, the dock, the view and every remembered Vessel are unchanged",
                after.selected_fleet == before.selected_fleet
                    && after.context == before.context
                    && after.view == before.view
                    && after.last_vessels == before.last_vessels
                    && after.navigation == before.navigation,
            )
            .observed("played", &played)
    })
}

pub(super) fn ask(native: &Native, provider: &Provider, text: &str) -> Result<Turn> {
    type_draft(native, text)?;
    native.press(Key::Return)?;
    let turn = provider.next_turn(PATIENCE)?;
    provider.started(&turn)?;
    Ok(turn)
}

pub(super) fn conclude(
    native: &Native,
    provider: &Provider,
    turn: &Turn,
    item: &str,
) -> Result<()> {
    provider.item_started(turn, item)?;
    provider.finish(turn, item, DONE)?;
    provider.complete(turn)?;
    native.settle(
        "the turn complete with Send drawn",
        |seen| Some(Chat::of(seen)),
        |chat| chat.sending() && !chat.status && chat.reply(item) == Some(DONE),
    )?;
    Ok(())
}

fn is_return(frame: &Value) -> bool {
    frame.get("result").is_some() || frame.get("error").is_some()
}

pub(super) fn returned_text(frame: &Value) -> Option<Value> {
    serde_json::from_str(frame.pointer("/result/contentItems/0/text")?.as_str()?).ok()
}

pub(super) fn saved_name(native: &Native, fleet: &FleetId) -> Result<Option<String>> {
    Ok(native.document()?.and_then(|(_, layout)| {
        layout
            .voyages
            .iter()
            .flat_map(|voyage| &voyage.fleets)
            .find(|found| &found.id == fleet)
            .map(|found| found.name.clone())
    }))
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
