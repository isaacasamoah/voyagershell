use crate::client::{CallError, Client};
use serde_json::{Value, json};
use std::{sync::mpsc, thread};
use voyager_contract::{
    Action, Request, Status,
    administrator::WorkspaceInput,
    conversation::{CallbackId, Focus, ToolOutcome},
};

struct Receipt {
    call: String,
    arguments: Option<Value>,
    replies: Vec<Value>,
    waiting: Vec<Value>,
    refused_ids: Vec<Value>,
    result: Option<Value>,
}

pub(crate) struct Work {
    call: String,
    context: Focus,
    request_id: String,
    action: Action,
    receive: mpsc::Receiver<EffectResult>,
}

struct EffectResult {
    value: Value,
    text: String,
    status: Status,
    version: Option<String>,
}

#[derive(Default)]
pub(crate) struct Tools {
    receipts: Vec<Receipt>,
    work: Option<Work>,
    uncertain: bool,
}

pub(crate) struct Completed {
    pub replies: Vec<Value>,
    pub outcome: ToolOutcome,
    pub text: String,
    pub context: Focus,
}

pub(crate) fn catalog() -> Result<Value, String> {
    let schema: Value = serde_json::from_str(include_str!(
        "../../contract/generated/workspaceTool.schema.json"
    ))
    .map_err(|error| error.to_string())?;
    Ok(
        json!([{"type":"function","name":"voyager_workspace","description":"Inspect and manage the captured avatar focus. Inspect first (expectedVersion 0), then use its returned version for each effect. Use exact IDs from inspection. Dock changes focus only when the human asks; it does not retarget this request. No terminal execution or project/content-file edits. The application supplies request identity and authority.","inputSchema":schema}]),
    )
}

fn result(success: bool, text: String) -> Value {
    json!({"success":success,"contentItems":[{"type":"inputText","text":text}]})
}

fn refusal(id: Value, message: &str) -> Value {
    json!({"id":id,"result":result(false, format!("Rejected before dispatch: {message}"))})
}

fn valid_id(id: &Value) -> bool {
    id.as_str()
        .is_some_and(|id| !id.is_empty() && id.len() <= 128)
        || id.is_i64()
        || id.is_u64()
}

impl Tools {
    pub fn busy(&self) -> bool {
        self.work.is_some()
    }

    fn reject(
        &mut self,
        id: Value,
        call: &str,
        arguments: Option<Value>,
        message: &str,
    ) -> Option<Value> {
        let reply = refusal(id.clone(), message);
        self.receipts.push(Receipt {
            call: call.into(),
            arguments,
            replies: vec![id],
            waiting: Vec::new(),
            refused_ids: Vec::new(),
            result: Some(reply["result"].clone()),
        });
        Some(reply)
    }

    pub fn callback(
        &mut self,
        value: &Value,
        thread: Option<&str>,
        turn: Option<&str>,
        active: bool,
        context: Option<&Focus>,
        workspace: &Client,
    ) -> Option<Value> {
        let id = value.get("id")?.clone();
        if !valid_id(&id) {
            return Some(
                json!({"id":null,"error":{"code":-32600,"message":"Invalid callback identity"}}),
            );
        }
        if value["method"] != "item/tool/call" {
            return Some(
                json!({"id":id,"error":{"code":-32601,"message":"Unsupported private provider callback; nothing was dispatched"}}),
            );
        }
        let params = &value["params"];
        let matches = value["method"] == "item/tool/call"
            && thread.is_some_and(|thread| !thread.is_empty() && params["threadId"] == thread)
            && turn.is_some_and(|turn| !turn.is_empty() && params["turnId"] == turn)
            && params["tool"] == "voyager_workspace"
            && params.get("namespace").is_none_or(Value::is_null);
        let call = params["callId"].as_str().unwrap_or_default();
        if !matches || call.is_empty() || call.len() > 128 {
            return Some(refusal(
                id,
                "Callback does not match the accepted private thread, turn and tool",
            ));
        }
        if self
            .receipts
            .iter()
            .any(|receipt| receipt.call != call && receipt.replies.contains(&id))
        {
            return Some(refusal(
                id,
                "Callback request identity already belongs to another tool call",
            ));
        }
        if let Some(receipt) = self
            .receipts
            .iter_mut()
            .find(|receipt| receipt.call == call)
        {
            if !receipt.replies.contains(&id) {
                if receipt.replies.len() >= 4 {
                    return Some(
                        json!({"id":id,"error":{"code":-32001,"message":"This call's response identity capacity is full. The original outcome remains recorded; nothing was repeated."}}),
                    );
                }
                receipt.replies.push(id.clone());
            }
            if receipt.refused_ids.contains(&id) {
                return Some(refusal(
                    id,
                    "Changed tool call identity; nothing was repeated",
                ));
            }
            if receipt
                .arguments
                .as_ref()
                .is_some_and(|arguments| arguments != &params["arguments"])
            {
                if receipt.waiting.contains(&id) {
                    return None;
                }
                receipt.refused_ids.push(id.clone());
                return Some(refusal(
                    id,
                    "Changed tool call identity; nothing was repeated",
                ));
            }
            if let Some(result) = &receipt.result {
                return Some(json!({"id":id,"result":result}));
            }
            if !receipt.waiting.contains(&id) {
                receipt.waiting.push(id);
            }
            return None;
        }
        if self.receipts.len() >= 32 {
            return Some(refusal(
                id,
                "The turn's 32-call limit was reached; no new call was dispatched",
            ));
        }
        let arguments =
            (params["arguments"].to_string().len() <= 8192).then(|| params["arguments"].clone());
        let Some(arguments) = arguments else {
            return self.reject(id, call, None, "Tool arguments exceed 8 KiB. This call ID remains refused; use a new call for a different request.");
        };
        if !active || context.is_none() || self.busy() {
            return self.reject(
                id,
                call,
                Some(arguments),
                "No active tool capacity; nothing was dispatched",
            );
        }
        let input = serde_json::from_value::<WorkspaceInput>(arguments.clone())
            .map_err(|error| error.to_string());
        let input = match input {
            Ok(input)
                if !self.uncertain || matches!(input.action, voyager_contract::Action::Inspect) =>
            {
                input
            }
            Ok(_) => {
                return self.reject(
                    id,
                    call,
                    Some(arguments),
                    "An earlier effect is unconfirmed. Inspect and report it; do not replay it.",
                );
            }
            Err(error) => return self.reject(id, call, Some(arguments), &error),
        };
        let context = context.cloned()?;
        let request = Request {
            request_id: workspace.request_id(),
            expected_version: input.expected_version,
            action: input.action,
        };
        let request_id = request.request_id.clone();
        let action = request.action.clone();
        let client = workspace.clone();
        let scope = context.scope.clone();
        let (send, receive) = mpsc::sync_channel(1);
        thread::spawn(move || {
            let effect_action = request.action.clone();
            let result = match client.scoped_call(scope, request) {
                Ok(response) => {
                    let text = outcome_text(
                        &effect_action,
                        &response.status,
                        response.message.as_deref(),
                    );
                    let full = serde_json::to_string(&response).unwrap_or_else(|_| text.clone());
                    let output = if full.len() <= 24 * 1024 {
                        full
                    } else {
                        json!({"requestId":response.request_id,"status":response.status,"version":response.version.to_string(),"fresh":response.fresh,"message":format!("{text}. Layout omitted because it exceeds the tool response bound. Inspect a narrower focus for details.")}).to_string()
                    };
                    EffectResult {
                        value: result(response.status == Status::Applied, output),
                        text,
                        status: response.status,
                        version: Some(response.version.to_string()),
                    }
                }
                Err(CallError::Rejected(error)) => EffectResult {
                    value: result(false, format!("Rejected before dispatch: {error}")),
                    text: format!("Workspace request refused: {error}"),
                    status: Status::Rejected,
                    version: None,
                },
                Err(CallError::Unconfirmed(error)) => EffectResult {
                    value: result(
                        false,
                        format!("Workspace result unconfirmed; do not repeat. {error}"),
                    ),
                    text: format!("Workspace result unconfirmed; do not repeat. {error}"),
                    status: Status::Uncertain,
                    version: None,
                },
            };
            let _ = send.send(result);
        });
        self.receipts.push(Receipt {
            call: call.into(),
            arguments: Some(arguments),
            replies: vec![id.clone()],
            waiting: vec![id],
            refused_ids: Vec::new(),
            result: None,
        });
        self.work = Some(Work {
            call: call.into(),
            context,
            request_id,
            action,
            receive,
        });
        None
    }

    pub fn poll(&mut self) -> Option<Completed> {
        let work = self.work.as_ref()?;
        let result = match work.receive.try_recv() {
            Ok(value) => value,
            Err(mpsc::TryRecvError::Empty) => return None,
            Err(mpsc::TryRecvError::Disconnected) => EffectResult {
                value: result(
                    false,
                    "Workspace result unconfirmed; nothing was replayed".into(),
                ),
                text: "Workspace result unconfirmed; nothing was replayed".into(),
                status: Status::Uncertain,
                version: None,
            },
        };
        let work = self.work.take()?;
        self.uncertain |= result.status == Status::Uncertain;
        let receipt = self
            .receipts
            .iter_mut()
            .find(|receipt| receipt.call == work.call)?;
        receipt.result = Some(result.value.clone());
        let outcome = ToolOutcome {
            name: "voyager_workspace".into(),
            call_id: work.call,
            callback_ids: receipt
                .waiting
                .iter()
                .map(|id| match id {
                    Value::String(value) => CallbackId::String(value.clone()),
                    _ => CallbackId::Integer(id.to_string()),
                })
                .collect(),
            request_id: work.request_id,
            action: work.action,
            status: result.status,
            version: result.version,
        };
        Some(Completed {
            replies: receipt
                .waiting
                .drain(..)
                .map(|id| json!({"id":id,"result":result.value}))
                .collect(),
            outcome,
            text: result.text,
            context: work.context,
        })
    }
}

fn outcome_text(action: &Action, status: &Status, message: Option<&str>) -> String {
    match status {
        Status::Applied => match action {
            Action::Inspect => "Workspace inspected",
            Action::Home => "Home opened",
            Action::SaveLayout { .. } => "Fleet layout saved",
            Action::LoadLayout { .. } => "Fleet layout loaded",
            Action::CreateVoyage { .. } => "Voyage created",
            Action::CreateFleet { .. } => "Fleet created",
            Action::CreatePortal { .. } => "Voyage Portal created",
            Action::Rename { .. } => "Name changed",
            Action::Split { .. } => "Vessel split",
            Action::MoveVessel { .. } => "Vessel moved",
            Action::MoveVoyage { .. } => "Voyage reordered",
            Action::MoveFleet { .. } => "Fleet reordered",
            Action::SelectVoyage { .. } => "Voyage selected",
            Action::SelectFleet { .. } => "Fleet selected",
            Action::Dock { .. } => "Focus changed",
        }
        .into(),
        Status::Rejected => format!(
            "Workspace request refused: {}",
            message.unwrap_or("The requested change was not applied")
        ),
        Status::Uncertain => format!(
            "Workspace result unconfirmed; do not repeat. {}",
            message.unwrap_or("The result was not confirmed")
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};
    use voyager_contract::{Action, Context, Response};

    fn completed(tools: &mut Tools) -> Completed {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if let Some(completed) = tools.poll() {
                return completed;
            }
            assert!(Instant::now() < deadline, "workspace effect did not return");
            thread::sleep(Duration::from_millis(5));
        }
    }

    #[test]
    fn callbacks_require_the_actual_turn_and_reuse_only_unchanged_effects() {
        let session = format!("voyager-c2-tool-test-{}", std::process::id());
        let workspace = Client::open(session.clone(), "/tmp".into());
        let initial = workspace
            .call(Request {
                request_id: workspace.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            })
            .unwrap();
        let focus = Focus {
            scope: Context::Workspace,
            path: vec!["Workspace".into()],
            cwd: None,
            revision: initial.version,
        };
        let mut tools = Tools::default();
        let mut callback = json!({"id":u64::MAX,"method":"item/tool/call","params":{"threadId":"thread","turnId":"turn","callId":"call-one","tool":"voyager_workspace","arguments":{"expectedVersion":"0","action":{"operation":"inspect"}}}});
        let invalid_identity = [json!(true), json!("x".repeat(65537)), Value::Null]
            .iter()
            .all(|id| {
                let mut invalid = callback.clone();
                invalid["id"] = id.clone();
                let reply = tools
                    .callback(
                        &invalid,
                        Some("thread"),
                        Some("turn"),
                        true,
                        Some(&focus),
                        &workspace,
                    )
                    .unwrap();
                reply["id"].is_null()
                    && reply["error"]["code"] == -32600
                    && reply.to_string().len() < 512
            });
        let invalid: Vec<_> = ["threadId", "turnId", "tool", "callId"]
            .into_iter()
            .map(|field| {
                let mut invalid = callback.clone();
                invalid["params"][field] = if field == "callId" { "" } else { "wrong" }.into();
                invalid
            })
            .chain([{
                let mut invalid = callback.clone();
                invalid["id"] = "invalid-rpc".into();
                invalid["params"]["callId"] = "invalid-input".into();
                invalid["params"]["arguments"]["requestId"] = "forged".into();
                invalid
            }])
            .collect();
        let refused = invalid.iter().all(|value| {
            tools
                .callback(
                    value,
                    Some("thread"),
                    Some("turn"),
                    true,
                    Some(&focus),
                    &workspace,
                )
                .is_some_and(|reply| reply["result"]["success"] == false)
        });
        let untouched = !tools.busy() && tools.receipts.len() == 1;
        assert!(
            tools
                .callback(
                    &callback,
                    Some("thread"),
                    Some("turn"),
                    true,
                    Some(&focus),
                    &workspace
                )
                .is_none()
        );
        let inspection = completed(&mut tools);
        let numeric_id = serde_json::to_value(&inspection.outcome.callback_ids).unwrap();
        let observed: Response = serde_json::from_str(
            inspection.replies[0]["result"]["contentItems"][0]["text"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
        callback["id"] = "callback-two".into();
        callback["params"]["callId"] = "call-two".into();
        callback["params"]["arguments"] = json!({"expectedVersion":observed.version.to_string(),"action":{"operation":"create-fleet","voyage":observed.layout.voyages[0].id,"name":"Delegated"}});
        tools.callback(
            &callback,
            Some("thread"),
            Some("turn"),
            true,
            Some(&focus),
            &workspace,
        );
        let duplicate_pending = tools
            .callback(
                &callback,
                Some("thread"),
                Some("turn"),
                true,
                Some(&focus),
                &workspace,
            )
            .is_none();
        let mut changed_pending = callback.clone();
        changed_pending["params"]["arguments"]["action"]["name"] = "Different".into();
        let same_pending = tools.callback(
            &changed_pending,
            Some("thread"),
            Some("turn"),
            true,
            Some(&focus),
            &workspace,
        );
        changed_pending["id"] = "changed-pending".into();
        changed_pending["params"]["arguments"]["action"]["name"] = "Different".into();
        let pending_refused = tools
            .callback(
                &changed_pending,
                Some("thread"),
                Some("turn"),
                true,
                Some(&focus),
                &workspace,
            )
            .unwrap();
        let effect = completed(&mut tools);
        let duplicate = tools
            .callback(
                &callback,
                Some("thread"),
                Some("turn"),
                false,
                Some(&focus),
                &workspace,
            )
            .unwrap();
        callback["id"] = "replayed-response".into();
        let replay = tools
            .callback(
                &callback,
                Some("thread"),
                Some("turn"),
                false,
                Some(&focus),
                &workspace,
            )
            .unwrap();
        let mut reused = callback.clone();
        reused["params"]["callId"] = "different-call".into();
        reused["params"]["arguments"] =
            json!({"expectedVersion":"0","action":{"operation":"inspect"}});
        let reused_id = tools.callback(
            &reused,
            Some("thread"),
            Some("turn"),
            true,
            Some(&focus),
            &workspace,
        );
        let redispatched = tools.busy();
        if redispatched {
            completed(&mut tools);
        }
        callback["params"]["arguments"]["action"]["name"] = "Changed".into();
        let changed = tools
            .callback(
                &callback,
                Some("thread"),
                Some("turn"),
                true,
                Some(&focus),
                &workspace,
            )
            .unwrap();
        let final_state = workspace
            .call(Request {
                request_id: workspace.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            })
            .unwrap();
        let mut cleanup = crate::core::Core::connect(&session).unwrap();
        cleanup.rpc("server.stop", json!({})).unwrap();
        cleanup.close().unwrap();
        assert!(invalid_identity && refused && untouched && duplicate_pending);
        assert_eq!(effect.replies[0]["id"], "callback-two");
        assert_eq!(
            numeric_id,
            json!([{"kind":"integer","value":u64::MAX.to_string()}])
        );
        assert_eq!(
            serde_json::to_value(&effect.outcome.callback_ids).unwrap(),
            json!([{"kind":"string","value":"callback-two"}])
        );
        assert_eq!(effect.replies.len(), 1);
        assert!(same_pending.is_none());
        assert_eq!(pending_refused["result"]["success"], false);
        assert_eq!(effect.replies[0]["result"], duplicate["result"]);
        assert_eq!(duplicate["result"], replay["result"]);
        assert!(
            !redispatched && reused_id.is_some_and(|reply| reply["result"]["success"] == false)
        );
        assert_eq!(changed["result"]["success"], false);
        assert_eq!(final_state.layout.voyages[0].fleets.len(), 2);
        assert_eq!(final_state.layout.voyages[0].fleets[1].name, "Delegated");
        assert_eq!(tools.receipts.len(), 3);
    }

    #[test]
    fn a_refused_correlated_call_cannot_be_replaced_with_valid_arguments() {
        let session = format!("voyager-c2-refusal-test-{}", std::process::id());
        let workspace = Client::open(session.clone(), "/tmp".into());
        let context = Focus {
            scope: Context::Workspace,
            path: vec!["Workspace".into()],
            cwd: None,
            revision: 0,
        };
        let mut tools = Tools::default();
        let mut callback = json!({"id":"rpc-one","method":"item/tool/call","params":{"threadId":"thread","turnId":"turn","callId":"call-one","tool":"voyager_workspace","arguments":{"expectedVersion":"0","action":{"operation":"inspect"},"requestId":"forged"}}});
        let first = tools
            .callback(
                &callback,
                Some("thread"),
                Some("turn"),
                true,
                Some(&context),
                &workspace,
            )
            .unwrap();
        callback["id"] = "rpc-two".into();
        let repeat = tools
            .callback(
                &callback,
                Some("thread"),
                Some("turn"),
                true,
                Some(&context),
                &workspace,
            )
            .unwrap();
        callback["params"]["arguments"]
            .as_object_mut()
            .unwrap()
            .remove("requestId");
        let changed = tools.callback(
            &callback,
            Some("thread"),
            Some("turn"),
            true,
            Some(&context),
            &workspace,
        );
        let dispatched = tools.busy();
        if dispatched {
            completed(&mut tools);
        }
        callback["params"]["callId"] = "another-call".into();
        let reused_id = tools.callback(
            &callback,
            Some("thread"),
            Some("turn"),
            true,
            Some(&context),
            &workspace,
        );
        let redispatched = tools.busy();
        if redispatched {
            completed(&mut tools);
        }
        let mut cleanup = crate::core::Core::connect(&session).unwrap();
        cleanup.rpc("server.stop", json!({})).unwrap();
        cleanup.close().unwrap();
        assert_eq!(first["result"], repeat["result"]);
        assert_eq!(first["result"]["success"], false);
        assert!(!dispatched && changed.is_some_and(|reply| reply["result"]["success"] == false));
        assert!(
            !redispatched && reused_id.is_some_and(|reply| reply["result"]["success"] == false)
        );
    }
}
