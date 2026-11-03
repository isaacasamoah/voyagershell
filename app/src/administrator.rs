use crate::client::{CallError, Client};
use crate::provider::{ToolCall, ToolDefinition, ToolReply, ToolResult};
use serde_json::{Value, json};
use std::{sync::mpsc, thread};
use voyager_contract::{
    Action, Request, Status,
    administrator::{
        ProcessAction, ProcessInput, ProcessOutput, ProcessRequest, ToolAction, WorkspaceInput,
    },
    conversation::{CallbackId, Focus, ToolOutcome},
};

#[derive(Clone)]
enum Dispatch {
    Workspace(Action),
    Process(ProcessAction),
    Content(voyager_contract::content::Action),
}

impl Dispatch {
    fn receipt(&self) -> ToolAction {
        use voyager_contract::content::{Action as Content, Receipt};
        match self {
            Self::Workspace(action) => ToolAction::Workspace(action.clone()),
            Self::Process(action) => ToolAction::Process(action.clone()),
            Self::Content(action) => ToolAction::Content(match action {
                Content::Describe { content_id } => Receipt::Describe {
                    content_id: content_id.clone(),
                },
                Content::Inspect { content_id } => Receipt::Inspect {
                    content_id: content_id.clone(),
                },
                Content::Update {
                    content_id,
                    expected_revision,
                    ..
                } => Receipt::Update {
                    content_id: content_id.clone(),
                    expected_revision: expected_revision.clone(),
                },
            }),
        }
    }
}

struct Receipt {
    tool: String,
    call: String,
    arguments: Option<[u8; 32]>,
    replies: Vec<Value>,
    waiting: Vec<Value>,
    refused_ids: Vec<Value>,
    result: Option<ToolResult>,
}

pub(crate) struct Work {
    call: String,
    context: Focus,
    request_id: String,
    action: ToolAction,
    receive: mpsc::Receiver<EffectResult>,
}

struct EffectResult {
    value: ToolResult,
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
    pub replies: Vec<ToolReply>,
    pub outcome: ToolOutcome,
    pub text: String,
    pub context: Focus,
}

pub(crate) fn catalog() -> Result<Vec<ToolDefinition>, String> {
    let schema: Value = serde_json::from_str(include_str!(
        "../../contract/generated/workspaceTool.schema.json"
    ))
    .map_err(|error| error.to_string())?;
    let process_schema: Value = serde_json::from_str(include_str!(
        "../../contract/generated/processTool.schema.json"
    ))
    .map_err(|error| error.to_string())?;
    let content_schema: Value = serde_json::from_str(include_str!(
        "../../contract/generated/contentTool.schema.json"
    ))
    .map_err(|error| error.to_string())?;
    Ok(vec![
        ToolDefinition {
            name: "voyager_workspace",
            description: "Inspect and manage the captured avatar focus. Inspect first (expectedVersion 0), then use its returned version for each effect. Use exact IDs from inspection. Dock changes focus only when the human asks; it does not retarget this request. No project/content-file edits. The application supplies request identity and authority.",
            schema,
        },
        ToolDefinition {
            name: "voyager_process",
            description: "Operate only bound terminals within this request's captured focus. Inspect workspace for the current expectedVersion, then list processes for exact contentId/terminalId/PID. Ended processes remain readable without PID. Read returns screen plus at most 160 history lines, not a complete conversation. Send uses Core's paste-and-Enter. Interrupt sends the program's stop key without escalation. Stop ends that terminal's program and descendants only when explicitly requested; it reports Core's observed state and does not restart it. These three effects require the inspected running PID. Input submitted or stop requested does not mean work completed or program ended. Do not interrupt, stop, resume, restart or repeat an uncertain effect automatically. All arguments, including text, share the 8 KiB callback limit. Notes content uses the separate voyager_content tool.",
            schema: process_schema,
        },
        ToolDefinition {
            name: "voyager_content",
            description: "Describe, inspect and update an existing Notes instance only inside the immutable captured focus. Inspect workspace for expectedVersion and exact contentId, then inspect Notes for its exact expectedRevision before update. Preserve schema/freshness warnings. A dirty visible draft retains its original revision; do not bypass stale refusal. Notes data is limited to 1 MiB and content arguments/results to 1 MiB plus 16 KiB. Oversized reads explicitly refuse; missing data is never initialized by inspect. Only workspace create-content initializes new Notes. Never repeat an uncertain update. The application supplies request identity and actor scope outside arguments.",
            schema: content_schema,
        },
    ])
}

fn result(success: bool, text: String) -> ToolResult {
    ToolResult { success, text }
}

fn refusal(id: Value, message: &str) -> ToolReply {
    ToolReply::Result {
        id,
        result: result(false, format!("Rejected before dispatch: {message}")),
    }
}

fn valid_id(id: &Value) -> bool {
    id.as_str()
        .is_some_and(|id| !id.is_empty() && id.len() <= 128)
        || id.is_i64()
        || id.is_u64()
}

impl Tools {
    #[cfg(test)]
    fn callback(
        &mut self,
        value: &Value,
        thread: Option<&str>,
        turn: Option<&str>,
        active: bool,
        context: Option<&Focus>,
        workspace: &Client,
    ) -> Option<Value> {
        match crate::codex::normalize(value.clone(), None)? {
            crate::provider::Event::Tool(call) => self
                .call(&call, thread, turn, active, context, workspace)
                .map(|reply| crate::codex::encode_tool_reply(&reply)),
            crate::provider::Event::CallbackError { id, code, message } => {
                Some(json!({"id":id,"error":{"code":code,"message":message}}))
            }
            _ => None,
        }
    }

    pub fn busy(&self) -> bool {
        self.work.is_some()
    }

    fn reject(
        &mut self,
        tool: &str,
        id: Value,
        call: &str,
        arguments: Option<Value>,
        message: &str,
    ) -> Option<ToolReply> {
        let reply = refusal(id.clone(), message);
        self.receipts.push(Receipt {
            tool: tool.into(),
            call: call.into(),
            arguments: arguments.as_ref().map(crate::content::fingerprint),
            replies: vec![id],
            waiting: Vec::new(),
            refused_ids: Vec::new(),
            result: Some(result(
                false,
                format!("Rejected before dispatch: {message}"),
            )),
        });
        Some(reply)
    }

    pub fn call(
        &mut self,
        value: &ToolCall,
        thread: Option<&str>,
        turn: Option<&str>,
        active: bool,
        context: Option<&Focus>,
        workspace: &Client,
    ) -> Option<ToolReply> {
        let id = value.id.clone();
        let tool = value.name.as_str();
        let matches = valid_id(&id)
            && thread.is_some_and(|thread| !thread.is_empty() && value.thread == thread)
            && turn.is_some_and(|turn| !turn.is_empty() && value.turn == turn)
            && matches!(
                tool,
                "voyager_workspace" | "voyager_process" | "voyager_content"
            )
            && value.namespace.is_none();
        let call = value.call.as_str();
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
        let fingerprint = crate::content::fingerprint(&value.arguments);
        if let Some(receipt) = self
            .receipts
            .iter_mut()
            .find(|receipt| receipt.call == call)
        {
            if !receipt.replies.contains(&id) {
                if receipt.replies.len() >= 4 {
                    return Some(
                        ToolReply::Error { id, code: -32001, message: "This call's response identity capacity is full. The original outcome remains recorded; nothing was repeated.".into() },
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
            if receipt.tool != tool
                || receipt
                    .arguments
                    .as_ref()
                    .is_some_and(|arguments| arguments != &fingerprint)
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
                return Some(ToolReply::Result {
                    id,
                    result: result.clone(),
                });
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
        let limit = if tool == "voyager_content" {
            crate::content::ENVELOPE_LIMIT
        } else {
            8192
        };
        let arguments =
            (value.arguments.to_string().len() <= limit).then(|| value.arguments.clone());
        let Some(arguments) = arguments else {
            let message = if tool == "voyager_content" {
                "Content arguments exceed 1 MiB plus 16 KiB. This call ID remains refused; use a new call for a different request."
            } else {
                "Tool arguments exceed 8 KiB. This call ID remains refused; use a new call for a different request."
            };
            return self.reject(tool, id, call, None, message);
        };
        if !active || context.is_none() || self.busy() {
            return self.reject(
                tool,
                id,
                call,
                Some(arguments),
                "No active tool capacity; nothing was dispatched",
            );
        }
        let parsed = match tool {
            "voyager_workspace" => serde_json::from_value::<WorkspaceInput>(arguments.clone())
                .map(|input| (input.expected_version, Dispatch::Workspace(input.action))),
            "voyager_process" => serde_json::from_value::<ProcessInput>(arguments.clone())
                .map(|input| (input.expected_version, Dispatch::Process(input.action))),
            _ => serde_json::from_value::<voyager_contract::content::Input>(arguments.clone())
                .map(|input| (input.expected_version, Dispatch::Content(input.action))),
        };
        let (expected_version, action) = match parsed {
            Ok(input) if !self.uncertain || reads(&input.1) => input,
            Ok(_) => {
                return self.reject(
                    tool,
                    id,
                    call,
                    Some(arguments),
                    "An earlier effect is unconfirmed. Inspect and report it; do not replay it.",
                );
            }
            Err(error) => return self.reject(tool, id, call, Some(arguments), &error.to_string()),
        };
        let context = context.cloned()?;
        let request_id = workspace.request_id();
        let client = workspace.clone();
        let scope = context.scope.clone();
        let receipt_action = action.receipt();
        let effect_action = action;
        let action = receipt_action;
        let effect_id = request_id.clone();
        let (send, receive) = mpsc::sync_channel(1);
        thread::spawn(move || {
            let result = match effect_action {
                Dispatch::Workspace(action) => {
                    let request = Request {
                        request_id: effect_id,
                        expected_version,
                        action: action.clone(),
                    };
                    match client.scoped_call(scope, request) {
                        Ok(response) => {
                            let text = outcome_text(
                                &action,
                                &response.status,
                                response.message.as_deref(),
                            );
                            let full =
                                serde_json::to_string(&response).unwrap_or_else(|_| text.clone());
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
                        Err(error) => failed(error, "Workspace"),
                    }
                }
                Dispatch::Process(action) => {
                    let request = ProcessRequest {
                        request_id: effect_id,
                        input: ProcessInput {
                            expected_version,
                            action,
                        },
                    };
                    match client.process(scope, request) {
                        Ok(response) => {
                            let text = process_text(
                                &response.status,
                                response.output.as_ref(),
                                response.message.as_deref(),
                            );
                            let value = result(
                                response.status == Status::Applied,
                                serde_json::to_string(&response).unwrap_or_else(|_| text.clone()),
                            );
                            EffectResult {
                                value,
                                text,
                                status: response.status.clone(),
                                version: Some(response.version.to_string()),
                            }
                        }
                        Err(error) => failed(error, "Process"),
                    }
                }
                Dispatch::Content(action) => {
                    let request = crate::content::request(action, effect_id);
                    match client.content(
                        crate::content::Access::Agent {
                            scope,
                            expected_version,
                        },
                        request,
                    ) {
                        Ok(response) => content_result(&response),
                        Err(error) => failed(error, "Content"),
                    }
                }
            };
            let _ = send.send(result);
        });
        self.receipts.push(Receipt {
            tool: tool.into(),
            call: call.into(),
            arguments: Some(fingerprint),
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
            name: receipt.tool.clone(),
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
                .map(|id| ToolReply::Result {
                    id,
                    result: result.value.clone(),
                })
                .collect(),
            outcome,
            text: result.text,
            context: work.context,
        })
    }
}

fn reads(action: &Dispatch) -> bool {
    matches!(
        action,
        Dispatch::Workspace(Action::Inspect)
            | Dispatch::Process(ProcessAction::List | ProcessAction::Read { .. })
            | Dispatch::Content(
                voyager_contract::content::Action::Describe { .. }
                    | voyager_contract::content::Action::Inspect { .. }
            )
    )
}

fn content_result(response: &voyager_contract::content::Response) -> EffectResult {
    use voyager_contract::content::Response;
    let (status, id, revision, warning) = match response {
        Response::Described { content_id, .. } => (Status::Applied, content_id, None, None),
        Response::Snapshot {
            content_id,
            snapshot,
            ..
        }
        | Response::Applied {
            content_id,
            snapshot,
            ..
        } => (
            Status::Applied,
            content_id,
            Some(snapshot.revision.clone()),
            snapshot.warning.as_deref(),
        ),
        Response::Rejected {
            content_id,
            message,
            ..
        } => (Status::Rejected, content_id, None, Some(message.as_str())),
        Response::Limited {
            content_id,
            revision,
            message,
            ..
        } => (
            Status::Rejected,
            content_id,
            revision.clone(),
            Some(message.as_str()),
        ),
        Response::Uncertain {
            content_id,
            message,
            ..
        } => (Status::Uncertain, content_id, None, Some(message.as_str())),
    };
    let raw = serde_json::to_string(response).expect("Content response serializes");
    let displayed_warning = warning.map(|message| {
        if message.len() <= 2048 { message.to_owned() } else { "Warning details exceed the conversation display limit; the result explicitly reports when complete details are unavailable.".into() }
    });
    let text = format!(
        "Notes {}: {:?}; revision {}{}",
        id.0,
        status,
        revision.as_deref().unwrap_or("unavailable"),
        displayed_warning
            .as_deref()
            .map(|message| format!("; {message}"))
            .unwrap_or_default()
    );
    let value = result(status == Status::Applied, raw);
    EffectResult {
        value,
        text,
        status,
        version: revision,
    }
}

fn failed(error: CallError, label: &str) -> EffectResult {
    let (status, text) = match error {
        CallError::Rejected(message) => (
            Status::Rejected,
            format!("{label} request refused: {message}"),
        ),
        CallError::Unconfirmed(message) => (
            Status::Uncertain,
            format!("{label} result unconfirmed; do not repeat. {message}"),
        ),
    };
    EffectResult {
        value: result(false, text.clone()),
        text,
        status,
        version: None,
    }
}

fn process_text(status: &Status, output: Option<&ProcessOutput>, message: Option<&str>) -> String {
    if *status != Status::Applied {
        return format!(
            "Process request {}: {}",
            if *status == Status::Uncertain {
                "unconfirmed; do not repeat"
            } else {
                "refused"
            },
            message.unwrap_or("The result was not confirmed")
        );
    }
    match output {
        Some(ProcessOutput::List { .. }) => "Processes inspected".into(),
        Some(ProcessOutput::Read { limited, .. }) => if *limited {
            "Terminal read, output shortened"
        } else {
            "Terminal read"
        }
        .into(),
        Some(ProcessOutput::Send { .. }) => "Input submitted".into(),
        Some(ProcessOutput::Interrupt { outcome, .. }) => {
            format!("Interrupt submitted; Core reports {outcome}")
        }
        Some(ProcessOutput::Stop { observed, .. }) => if observed.state == "finished" {
            "Program ended"
        } else {
            "Stop requested; Core still reports running"
        }
        .into(),
        None => message.unwrap_or("Process operation applied").into(),
    }
}

fn outcome_text(action: &Action, status: &Status, message: Option<&str>) -> String {
    match status {
        Status::Applied => match action {
            Action::Inspect => "Workspace inspected",
            Action::Home => "Home opened",
            Action::UpdateCanvas { .. } => "Workspace layout updated",
            Action::SetSidebar { .. } => "Sidebar updated",
            Action::SaveLayout { .. } => "Fleet layout saved",
            Action::LoadLayout { .. } => "Fleet layout loaded",
            Action::CreateVoyage { .. } => "Voyage created",
            Action::CreateFleet { .. } => "Fleet created",
            Action::CreatePortal { .. } => "Voyage Portal created",
            Action::CreateContent { .. } => "Content created",
            Action::Rename { .. } => "Name changed",
            Action::Split { .. } => "Vessel split",
            Action::ResizeSplit { .. } => "Split resized",
            Action::MoveVessel { .. } => "Vessel moved",
            Action::MoveVoyage { .. } => "Voyage reordered",
            Action::MoveFleet { .. } => "Fleet reordered",
            Action::SelectVoyage { .. } => "Voyage selected",
            Action::SelectFleet { .. } => "Fleet selected",
            Action::RevealVessel { .. } => "Vessel revealed",
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

    #[test]
    fn content_results_are_bounded_and_never_claim_a_partial_read_is_complete() {
        use voyager_contract::content::{Notes, Response as ContentResponse, Snapshot, Version};
        let response = ContentResponse::Snapshot {
            version: Version::V1,
            request_id: "read".into(),
            content_id: voyager_contract::ContentId("notes".into()),
            snapshot: Snapshot {
                content_id: voyager_contract::ContentId("notes".into()),
                revision: "revision".into(),
                data: Notes {
                    title: "Title".into(),
                    text: "x".repeat(crate::content::LIMIT),
                },
                warning: Some("warning".repeat(4096)),
            },
        };
        let request = voyager_contract::content::Request::Inspect {
            version: Version::V1,
            request_id: "read".into(),
            content_id: voyager_contract::ContentId("notes".into()),
        };
        let response = crate::content::bounded_response(&request, response);
        let result = content_result(&response);
        assert_eq!(result.status, Status::Rejected);
        let limited: Value = serde_json::from_str(&result.value.text).unwrap();
        assert_eq!(limited["requestId"], "read");
        assert_eq!(limited["revision"], "revision");
        assert_eq!(limited["status"], "limited");
        assert_eq!(limited["warningPresent"], true);
        assert!(result.text.len() < 4096);
    }

    #[test]
    fn content_callbacks_share_the_owner_and_recheck_the_live_workspace() {
        use crate::{
            content::{Access, Owner},
            core::Core,
        };
        use voyager_contract::{
            Axis, ContentDestination,
            content::{Notes, Request as ContentRequest, Response as ContentResponse, Version},
        };
        let directory =
            std::env::temp_dir().join(format!("voyager-n3-owner-{}", std::process::id()));
        std::fs::create_dir_all(directory.join("mods/notes")).unwrap();
        std::fs::write(
            directory.join("mods/notes/mod.json"),
            include_str!("../../content/notes/mod.json"),
        )
        .unwrap();
        let session = format!("voyager-n3-owner-{}", std::process::id());
        let workspace = Client::with_content(
            session.clone(),
            "/tmp".into(),
            Owner::open(&directory).unwrap(),
        );
        let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let call = |action, expected_version| {
                workspace
                    .call(Request {
                        request_id: workspace.request_id(),
                        expected_version,
                        action,
                    })
                    .unwrap()
            };
            let initial = call(Action::Inspect, 0);
            let voyage = initial.layout.voyages[0].id.clone();
            let fleet = initial.layout.voyages[0].fleets[0].id.clone();
            let created = call(
                Action::CreateContent {
                    type_id: "notes".into(),
                    destination: ContentDestination::Vessel {
                        fleet,
                        after: initial.layout.voyages[0].fleets[0].vessels[0].id.clone(),
                        axis: Axis::Horizontal,
                    },
                },
                initial.version,
            );
            assert_eq!(created.status, Status::Applied);
            let a = created.layout.contents.last().unwrap().id.clone();
            let placement = created.layout.voyages[0].fleets[0]
                .vessels
                .last()
                .unwrap()
                .id
                .clone();
            let created = call(
                Action::CreateContent {
                    type_id: "notes".into(),
                    destination: ContentDestination::Portal { voyage },
                },
                created.version,
            );
            let b = created.layout.contents.last().unwrap().id.clone();
            let b_before = std::fs::read(directory.join(format!("data/{}.json", b.0))).unwrap();
            let mut binding = Box::pin(workspace.bind_content(a.clone()));
            let deadline = Instant::now() + Duration::from_secs(5);
            let binding = loop {
                let mut cx = std::task::Context::from_waker(std::task::Waker::noop());
                if let std::task::Poll::Ready(result) =
                    std::future::Future::poll(binding.as_mut(), &mut cx)
                {
                    break result.unwrap();
                }
                assert!(Instant::now() < deadline);
                thread::sleep(Duration::from_millis(5));
            };
            let inspect = |id: &voyager_contract::ContentId| ContentRequest::Inspect {
                version: Version::V1,
                request_id: workspace.request_id(),
                content_id: id.clone(),
            };
            let read = inspect(&a);
            let snapshot = workspace
                .content(Access::View(binding.clone()), read.clone())
                .unwrap();
            let duplicate_read = workspace
                .content(Access::View(binding.clone()), read.clone())
                .unwrap();
            assert!(std::sync::Arc::ptr_eq(&snapshot, &duplicate_read));
            assert!(matches!(
                &*workspace
                    .content(
                        Access::Agent {
                            scope: Context::Vessel {
                                id: placement.clone()
                            },
                            expected_version: created.version
                        },
                        read
                    )
                    .unwrap(),
                ContentResponse::Rejected { .. }
            ));
            let revision = match &*snapshot {
                ContentResponse::Snapshot { snapshot, .. } => snapshot.revision.clone(),
                other => panic!("{other:?}"),
            };
            let focus = Focus {
                scope: Context::Vessel { id: placement },
                path: vec!["Notes A".into()],
                cwd: None,
                revision: created.version,
            };
            let mut tools = Tools::default();
            let mut callback = json!({"id":"callback","method":"item/tool/call","params":{"threadId":"thread","turnId":"turn","callId":"call","tool":"voyager_content","arguments":{"expectedVersion":created.version.to_string(),"action":{"operation":"update","contentId":a,"expectedRevision":revision,"data":Notes { title: "Agent".into(), text: "x".repeat(9000) }}}}});
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
            let applied = completed(&mut tools);
            assert_eq!(applied.outcome.status, Status::Applied);
            let applied_content: ContentResponse =
                serde_json::from_str(
                    crate::codex::encode_tool_reply(&applied.replies[0])["result"]["contentItems"]
                        [0]["text"]
                        .as_str()
                        .unwrap(),
                )
                .unwrap();
            let applied_revision = match applied_content {
                ContentResponse::Applied { snapshot, .. } => snapshot.revision,
                other => panic!("{other:?}"),
            };
            let mut changed_data = callback.clone();
            changed_data["id"] = "changed-data".into();
            changed_data["params"]["arguments"]["action"]["data"]["title"] = "Changed".into();
            assert_eq!(
                tools
                    .callback(
                        &changed_data,
                        Some("thread"),
                        Some("turn"),
                        true,
                        Some(&focus),
                        &workspace
                    )
                    .unwrap()["result"]["success"],
                false
            );
            assert!(
                !serde_json::to_string(&applied.outcome)
                    .unwrap()
                    .contains(&"x".repeat(9000))
            );
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
            assert_eq!(
                duplicate["result"],
                crate::codex::encode_tool_reply(&applied.replies[0])["result"]
            );
            callback["id"] = "changed".into();
            callback["params"]["arguments"]["action"]["contentId"] = json!(b);
            assert_eq!(
                tools
                    .callback(
                        &callback,
                        Some("thread"),
                        Some("turn"),
                        true,
                        Some(&focus),
                        &workspace
                    )
                    .unwrap()["result"]["success"],
                false
            );
            callback["id"] = "forged".into();
            callback["params"]["callId"] = "forged".into();
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
            assert_eq!(completed(&mut tools).outcome.status, Status::Rejected);
            let mut external = Core::connect(&session).unwrap();
            let bumped = external
                .document_set("voyager-layout-v1", &created.layout, created.version)
                .unwrap();
            callback["id"] = "stale".into();
            callback["params"]["callId"] = "stale".into();
            callback["params"]["arguments"]["action"]["contentId"] = json!(a);
            callback["params"]["arguments"]["action"]["expectedRevision"] = json!(applied_revision);
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
            assert_eq!(completed(&mut tools).outcome.status, Status::Rejected);
            assert_eq!(
                std::fs::read(directory.join(format!("data/{}.json", b.0))).unwrap(),
                b_before
            );
            std::fs::write(
                directory.join("mods/notes/mod.json"),
                br#"{"name":"Notes"}"#,
            )
            .unwrap();
            let current = workspace
                .content(
                    Access::Agent {
                        scope: focus.scope.clone(),
                        expected_version: bumped.version,
                    },
                    inspect(&a),
                )
                .unwrap();
            assert!(
                matches!(&*current, ContentResponse::Snapshot { snapshot, .. } if snapshot.warning.as_deref() == Some("No state schema declared") && snapshot.data.title == "Agent")
            );
            std::fs::remove_file(directory.join(format!("data/{}.json", a.0))).unwrap();
            assert!(matches!(
                &*workspace
                    .content(Access::View(binding), inspect(&a))
                    .unwrap(),
                ContentResponse::Rejected { .. }
            ));
            assert!(!directory.join(format!("data/{}.json", a.0)).exists());
            external.close().unwrap();
        }));
        let mut cleanup = Core::connect(&session).unwrap();
        let stopped = cleanup.server_stop();
        cleanup.close().unwrap();
        drop(workspace);
        std::fs::remove_dir_all(directory).unwrap();
        stopped.unwrap();
        checked.unwrap();
    }

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
        let mut changed_tool = callback.clone();
        changed_tool["id"] = "changed-tool".into();
        changed_tool["params"]["tool"] = "voyager_process".into();
        let wrong_tool = tools
            .callback(
                &changed_tool,
                Some("thread"),
                Some("turn"),
                true,
                Some(&focus),
                &workspace,
            )
            .unwrap();
        let numeric_id = serde_json::to_value(&inspection.outcome.callback_ids).unwrap();
        let observed: Response =
            serde_json::from_str(
                crate::codex::encode_tool_reply(&inspection.replies[0])["result"]["contentItems"]
                    [0]["text"]
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
        let process_callback = json!({"id":"process-callback","method":"item/tool/call","params":{"threadId":"thread","turnId":"turn","callId":"process-call","tool":"voyager_process","arguments":{"expectedVersion":final_state.version.to_string(),"action":{"operation":"list"}}}});
        assert!(
            tools
                .callback(
                    &process_callback,
                    Some("thread"),
                    Some("turn"),
                    true,
                    Some(&focus),
                    &workspace
                )
                .is_none()
        );
        let processes = completed(&mut tools);
        let mut oversized = process_callback.clone();
        oversized["id"] = "oversized-process".into();
        oversized["params"]["callId"] = "oversized-process".into();
        oversized["params"]["arguments"] = json!({"expectedVersion":final_state.version.to_string(),"action":{"operation":"send","contentId":"none","terminalId":"t1","pid":1,"text":"x".repeat(8192)}});
        let large_refusal = tools
            .callback(
                &oversized,
                Some("thread"),
                Some("turn"),
                true,
                Some(&focus),
                &workspace,
            )
            .unwrap();
        oversized["params"]["arguments"] = process_callback["params"]["arguments"].clone();
        let replacement_refusal = tools
            .callback(
                &oversized,
                Some("thread"),
                Some("turn"),
                true,
                Some(&focus),
                &workspace,
            )
            .unwrap();
        let mut cleanup = crate::core::Core::connect(&session).unwrap();
        cleanup.server_stop().unwrap();
        cleanup.close().unwrap();
        assert_eq!(wrong_tool["result"]["success"], false);
        assert_eq!(processes.outcome.name, "voyager_process");
        assert_eq!(processes.outcome.status, Status::Applied);
        assert!(matches!(
            processes.outcome.action,
            ToolAction::Process(ProcessAction::List)
        ));
        assert_eq!(large_refusal["result"]["success"], false);
        assert_eq!(replacement_refusal["result"], large_refusal["result"]);
        assert!(invalid_identity && refused && untouched && duplicate_pending);
        assert_eq!(
            crate::codex::encode_tool_reply(&effect.replies[0])["id"],
            "callback-two"
        );
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
        assert_eq!(
            crate::codex::encode_tool_reply(&effect.replies[0])["result"],
            duplicate["result"]
        );
        assert_eq!(duplicate["result"], replay["result"]);
        assert!(
            !redispatched && reused_id.is_some_and(|reply| reply["result"]["success"] == false)
        );
        assert_eq!(changed["result"]["success"], false);
        assert_eq!(final_state.layout.voyages[0].fleets.len(), 2);
        assert_eq!(final_state.layout.voyages[0].fleets[1].name, "Delegated");
        assert_eq!(tools.receipts.len(), 5);
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
        cleanup.server_stop().unwrap();
        cleanup.close().unwrap();
        assert_eq!(first["result"], repeat["result"]);
        assert_eq!(first["result"]["success"], false);
        assert!(!dispatched && changed.is_some_and(|reply| reply["result"]["success"] == false));
        assert!(
            !redispatched && reused_id.is_some_and(|reply| reply["result"]["success"] == false)
        );
    }
}
