use crate::provider::{
    Answer, AudioEvent, Command, Event, Operation, Outcome, ToolCall, ToolReply, Transcript,
    Visible,
};
use serde_json::{Value, json};
use voyager_contract::conversation::{Phase, Role};

pub(crate) fn reported_version(result: &Value) -> Option<&str> {
    let token = result
        .get("userAgent")?
        .as_str()?
        .split_whitespace()
        .next()?;
    let (originator, version) = token.rsplit_once('/')?;
    (!originator.is_empty() && !version.is_empty()).then_some(version)
}

fn text(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)?
        .as_str()
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

pub(crate) fn encode(command: Command) -> Result<(&'static str, Value), String> {
    Ok(match command {
        Command::Initialize => (
            "initialize",
            json!({"clientInfo":{"name":"voyager_native","version":"0.1.0"},"capabilities":{"experimentalApi":true}}),
        ),
        Command::OpenConversation {
            model,
            effort,
            cwd,
            tools,
            instructions,
        } => {
            let tools = tools.into_iter().map(|tool| json!({"type":"function","name":tool.name,"description":tool.description,"inputSchema":tool.schema})).collect::<Vec<_>>();
            (
                "thread/start",
                json!({"model":model,"allowProviderModelFallback":false,"ephemeral":true,"cwd":cwd,"approvalPolicy":"never","sandbox":"read-only","config":{"model_reasoning_effort":effort},"dynamicTools":tools,"baseInstructions":instructions}),
            )
        }
        Command::StartTurn {
            thread,
            text,
            effort,
            focus,
        } => (
            "turn/start",
            json!({"threadId":thread,"input":[{"type":"text","text":text}],"effort":effort,"additionalContext":{"voyager.focus":{"kind":"application","value":serde_json::to_string(&focus).map_err(|error| error.to_string())?}}}),
        ),
        Command::InterruptTurn { thread, turn } => {
            ("turn/interrupt", json!({"threadId":thread,"turnId":turn}))
        }
        Command::ReadAccount => ("account/read", json!({"refreshToken":false})),
        Command::StartAudio {
            thread,
            session,
            offer,
            focus,
            instructions,
        } => {
            let context = serde_json::to_string(&focus).map_err(|error| error.to_string())?;
            (
                "thread/realtime/start",
                json!({"threadId":thread,"realtimeSessionId":session,"voiceSessionId":session,"outputModality":"audio","version":"v3","voice":"sol","transport":{"type":"webrtc","sdp":offer},"clientManagedHandoffs":false,"delegationAckFiller":true,"backendReasoningStatus":false,"initialItems":[{"role":"developer","text":context}],"realtimeStartInstructions":context,"prompt":instructions}),
            )
        }
        Command::StopAudio { thread } => ("thread/realtime/stop", json!({"threadId":thread})),
    })
}

pub(crate) fn tool_reply(reply: &ToolReply) -> Value {
    match reply {
        ToolReply::Result { id, result } => {
            json!({"id":id,"result":{"success":result.success,"contentItems":[{"type":"inputText","text":result.text}]}})
        }
        ToolReply::Error { id, code, message } => {
            json!({"id":id,"error":{"code":code,"message":message}})
        }
    }
}

fn outcome(value: &Value, operation: Operation) -> Outcome {
    if let Some(error) = value.pointer("/error/message").and_then(Value::as_str) {
        return Outcome::Rejected(error.into());
    }
    let Some(result) = value.get("result") else {
        return Outcome::Unconfirmed("Provider response missing its result".into());
    };
    let answer = match operation {
        Operation::Initialize => Some(Answer::Initialized {
            version: reported_version(result).map(str::to_owned),
        }),
        Operation::OpenConversation => result
            .get("thread")
            .and_then(|thread| text(thread, "id"))
            .map(|thread| Answer::Conversation {
                thread,
                model: text(result, "model"),
            }),
        Operation::StartTurn => result
            .get("turn")
            .and_then(|turn| text(turn, "id"))
            .map(|id| Answer::Turn { id }),
        Operation::ReadAccount => Some(Answer::Account {
            native: result.pointer("/account/type").and_then(Value::as_str) == Some("chatgpt"),
        }),
        _ => Some(Answer::Acknowledged),
    };
    match answer {
        Some(answer) => Outcome::Applied(answer),
        None => Outcome::Unconfirmed(
            "Provider did not return the expected conversation/turn identity".into(),
        ),
    }
}

pub(crate) fn decode(value: Value, pending: Option<(u64, Operation)>) -> Option<Event> {
    if value.get("method").is_none() {
        let id = value.get("id")?.as_u64()?;
        let (_, operation) = pending.filter(|(expected, _)| *expected == id)?;
        return Some(Event::Response {
            id,
            outcome: outcome(&value, operation),
        });
    }
    let method = value.get("method")?.as_str()?;
    let params = &value["params"];
    if let Some(id) = value.get("id") {
        let valid = id
            .as_str()
            .is_some_and(|id| !id.is_empty() && id.len() <= 128)
            || id.is_i64()
            || id.is_u64();
        if !valid {
            return Some(Event::CallbackError {
                id: Value::Null,
                code: -32600,
                message: "Invalid callback identity".into(),
            });
        }
        if method != "item/tool/call" {
            return Some(Event::CallbackError {
                id: id.clone(),
                code: -32601,
                message: "Unsupported private provider callback; nothing was dispatched".into(),
            });
        }
        return Some(Event::Tool(Box::new(ToolCall {
            id: id.clone(),
            thread: text(params, "threadId").unwrap_or_default(),
            turn: text(params, "turnId").unwrap_or_default(),
            call: text(params, "callId").unwrap_or_default(),
            name: text(params, "tool").unwrap_or_default(),
            namespace: params
                .get("namespace")
                .filter(|value| !value.is_null())
                .cloned(),
            arguments: params["arguments"].clone(),
        })));
    }
    let thread = text(params, "threadId")?;
    let event = match method {
        "item/agentMessage/delta" => Visible::Message {
            thread,
            turn: text(params, "turnId")?,
            item: text(params, "itemId")?,
            text: params.get("delta")?.as_str()?.into(),
            complete: false,
        },
        "item/completed"
            if params.pointer("/item/type").and_then(Value::as_str) == Some("agentMessage") =>
        {
            Visible::Message {
                thread,
                turn: text(params, "turnId")?,
                item: text(&params["item"], "id")?,
                text: params.pointer("/item/text")?.as_str()?.into(),
                complete: true,
            }
        }
        "turn/started"
            if params.pointer("/turn/status").and_then(Value::as_str) == Some("inProgress") =>
        {
            Visible::Started {
                thread,
                turn: text(&params["turn"], "id")?,
            }
        }
        "turn/completed" => Visible::Completed {
            thread,
            turn: text(&params["turn"], "id")?,
            phase: match params.pointer("/turn/status").and_then(Value::as_str) {
                Some("completed") => Phase::Completed,
                Some("interrupted") => Phase::Interrupted,
                _ => Phase::Failed,
            },
            error: params
                .pointer("/turn/error/message")
                .and_then(Value::as_str)
                .map(str::to_owned),
        },
        "error" => Visible::Error {
            thread,
            turn: text(params, "turnId")?,
            message: params
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("Private provider reported an error")
                .into(),
            retrying: params.get("willRetry").and_then(Value::as_bool) == Some(true),
        },
        _ => {
            let event = match method {
                "thread/realtime/started" => AudioEvent::Started {
                    thread,
                    session: text(params, "realtimeSessionId").unwrap_or_default(),
                    supported: params.get("version").and_then(Value::as_str) == Some("v3"),
                },
                "thread/realtime/sdp" => AudioEvent::Answer {
                    thread,
                    answer: text(params, "sdp").unwrap_or_default(),
                },
                "thread/realtime/closed" => AudioEvent::Closed { thread },
                "thread/realtime/error" => AudioEvent::Failed { thread },
                "thread/realtime/item/started" | "thread/realtime/item/completed"
                    if params.pointer("/item/type").and_then(Value::as_str)
                        == Some("transcriptSegment") =>
                {
                    let item = &params["item"];
                    let role = match item.get("role").and_then(Value::as_str) {
                        Some("user") => Role::User,
                        Some("assistant") => Role::Assistant,
                        _ => return None,
                    };
                    AudioEvent::Transcript(Transcript {
                        thread,
                        session: text(item, "realtimeSessionId"),
                        item: text(item, "id")?,
                        role: Some(role),
                        text: item.get("text")?.as_str()?.into(),
                        delta: false,
                    })
                }
                "thread/realtime/item/transcript/delta" => AudioEvent::Transcript(Transcript {
                    thread,
                    session: None,
                    item: text(params, "itemId")?,
                    role: None,
                    text: params.get("delta")?.as_str()?.into(),
                    delta: true,
                }),
                _ => return None,
            };
            return Some(Event::Audio(event));
        }
    };
    Some(Event::Visible(event))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::ToolResult;
    use voyager_contract::{Context, conversation::Focus};

    #[test]
    fn codex_normalizes_visible_identity_and_filters_private_items() {
        let event = json!({"method":"item/completed","params":{"threadId":"private","turnId":"turn","item":{"type":"agentMessage","id":"answer","text":"visible"}}});
        assert!(
            matches!(decode(event.clone(), None), Some(Event::Visible(Visible::Message { thread, turn, item, text, complete: true })) if thread == "private" && turn == "turn" && item == "answer" && text == "visible")
        );
        let mut reasoning = event;
        reasoning["params"]["item"]["type"] = "reasoning".into();
        assert!(decode(reasoning, None).is_none());
        assert!(decode(json!({"method":"item/agentMessage/delta","params":{"threadId":"private","itemId":"answer","delta":"unbound"}}), None).is_none());
    }

    #[test]
    fn codex_normalizes_only_the_correlated_reply_and_exact_callback_identity() {
        let reply = json!({"id":7,"result":{"turn":{"id":"actual-turn"}}});
        assert!(decode(reply.clone(), Some((6, Operation::StartTurn))).is_none());
        assert!(
            matches!(decode(reply, Some((7, Operation::StartTurn))), Some(Event::Response { id: 7, outcome: Outcome::Applied(Answer::Turn { id }) }) if id == "actual-turn")
        );
        assert!(matches!(
            decode(json!({"id":7,"result":{}}), Some((7, Operation::StartTurn))),
            Some(Event::Response {
                outcome: Outcome::Unconfirmed(_),
                ..
            })
        ));
        assert!(
            matches!(decode(json!({"id":7,"error":{"message":"known refusal"}}), Some((7, Operation::StopAudio))), Some(Event::Response { outcome: Outcome::Rejected(message), .. }) if message == "known refusal")
        );
        for id in [json!("callback"), json!(u64::MAX)] {
            let callback = json!({"id":id,"method":"item/tool/call","params":{"threadId":"thread","turnId":"turn","callId":"call","tool":"voyager_workspace","arguments":{"expectedVersion":"0","action":{"operation":"inspect"}}}});
            let Some(Event::Tool(call)) = decode(callback.clone(), None) else {
                panic!("Missing normalized tool call");
            };
            assert_eq!(call.id, id);
            assert_eq!(
                (&call.thread, &call.turn, &call.call, &call.name),
                (
                    &"thread".into(),
                    &"turn".into(),
                    &"call".into(),
                    &"voyager_workspace".into()
                )
            );
            assert_eq!(call.arguments, callback["params"]["arguments"]);
            let reply = tool_reply(&ToolReply::Result {
                id: call.id,
                result: ToolResult {
                    success: false,
                    text: "Rejected".into(),
                },
            });
            assert_eq!(reply["id"], id);
            assert_eq!(reply["result"]["success"], false);
            assert_eq!(reply["result"]["contentItems"][0]["text"], "Rejected");
        }
        let error = tool_reply(&ToolReply::Error {
            id: json!("callback"),
            code: -32001,
            message: "Response capacity reached".into(),
        });
        assert_eq!(
            error,
            json!({"id":"callback","error":{"code":-32001,"message":"Response capacity reached"}})
        );
    }

    #[test]
    fn native_audio_keeps_the_subscription_route_and_captured_focus() {
        assert_eq!(
            encode(Command::ReadAccount).unwrap(),
            ("account/read", json!({"refreshToken":false}))
        );
        let focus = Focus {
            scope: Context::Workspace,
            path: vec!["Workspace".into()],
            cwd: None,
            revision: 42,
            preview: None,
        };
        let (method, params) = encode(Command::StartAudio {
            thread: "thread".into(),
            session: "session".into(),
            offer: "synthetic description".into(),
            focus: focus.clone(),
            instructions: "voice policy",
        })
        .unwrap();
        assert_eq!(method, "thread/realtime/start");
        assert_eq!(params["threadId"], "thread");
        assert_eq!(params["realtimeSessionId"], "session");
        assert_eq!(params["voiceSessionId"], "session");
        assert_eq!(params["version"], "v3");
        assert_eq!(
            params["transport"],
            json!({"type":"webrtc","sdp":"synthetic description"})
        );
        assert_eq!(
            serde_json::from_str::<Focus>(params["initialItems"][0]["text"].as_str().unwrap())
                .unwrap(),
            focus
        );
        assert_eq!(
            encode(Command::StopAudio {
                thread: "thread".into()
            })
            .unwrap(),
            ("thread/realtime/stop", json!({"threadId":"thread"}))
        );
    }

    #[test]
    fn commands_keep_bound_context_and_the_existing_text_profile() {
        let focus = Focus {
            scope: Context::Workspace,
            path: vec!["Workspace".into()],
            cwd: None,
            revision: 42,
            preview: None,
        };
        let (method, params) = encode(Command::StartTurn {
            thread: "thread".into(),
            text: "bounded request".into(),
            effort: "high".into(),
            focus: Some(focus.clone()),
        })
        .unwrap();
        assert_eq!(method, "turn/start");
        assert_eq!(params["threadId"], "thread");
        assert_eq!(params["input"][0]["text"], "bounded request");
        let captured: Focus = serde_json::from_str(
            params["additionalContext"]["voyager.focus"]["value"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(captured, focus);
        let (method, params) = encode(Command::OpenConversation {
            model: "configured-model".into(),
            effort: "high".into(),
            cwd: "/tmp/private".into(),
            tools: crate::administrator::catalog().unwrap(),
            instructions: "administrator policy".into(),
        })
        .unwrap();
        assert_eq!(method, "thread/start");
        assert_eq!(params["approvalPolicy"], "never");
        assert_eq!(params["sandbox"], "read-only");
        assert_eq!(params["allowProviderModelFallback"], false);
        let schemas = [
            (
                "voyager_worktree",
                include_str!("../../contract/generated/worktreeTool.schema.json"),
            ),
            (
                "voyager_workspace",
                include_str!("../../contract/generated/workspaceTool.schema.json"),
            ),
            (
                "voyager_process",
                include_str!("../../contract/generated/processTool.schema.json"),
            ),
            (
                "voyager_vessel",
                include_str!("../../contract/generated/contentTool.schema.json"),
            ),
        ];
        assert_eq!(
            params["dynamicTools"].as_array().unwrap().len(),
            schemas.len()
        );
        for (tool, (name, schema)) in params["dynamicTools"]
            .as_array()
            .unwrap()
            .iter()
            .zip(schemas)
        {
            assert_eq!(tool["name"], name);
            assert_eq!(
                tool["inputSchema"],
                serde_json::from_str::<Value>(schema).unwrap()
            );
        }
        assert_eq!(
            encode(Command::InterruptTurn {
                thread: "thread".into(),
                turn: "turn".into()
            })
            .unwrap(),
            (
                "turn/interrupt",
                json!({"threadId":"thread","turnId":"turn"})
            )
        );
    }
}
