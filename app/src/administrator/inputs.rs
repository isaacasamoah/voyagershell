use crate::provider::ToolDefinition;
use serde_json::Value;
use voyager_contract::{
    Action, Context,
    administrator::{PeekInput, ProcessAction, ProcessInput, ToolAction, WorkspaceInput},
};

#[derive(Clone)]
pub(super) enum Dispatch {
    Workspace(Action),
    Process(ProcessAction),
    Worktree(voyager_contract::worktree::Input),
    Content(voyager_contract::content::Action),
}

impl Dispatch {
    pub(super) fn receipt(&self) -> ToolAction {
        match self {
            Self::Workspace(action) => ToolAction::Workspace(action.clone()),
            Self::Process(action) => ToolAction::Process(action.clone()),
            Self::Worktree(input) => ToolAction::Worktree(input.clone()),
            Self::Content(action) => ToolAction::Content(action.receipt()),
        }
    }
}

type Parsed = Result<(u64, Dispatch, Option<Context>), serde_json::Error>;

pub(super) fn parse(tool: &str, arguments: &Value) -> Parsed {
    let arguments = arguments.clone();
    match tool {
        "voyager_workspace" => serde_json::from_value::<WorkspaceInput>(arguments).map(|input| {
            (
                input.expected_version,
                Dispatch::Workspace(input.action),
                None,
            )
        }),
        "voyager_peek" => serde_json::from_value::<PeekInput>(arguments)
            .map(|input| (0, Dispatch::Workspace(Action::Inspect), Some(input.target))),
        "voyager_process" => serde_json::from_value::<ProcessInput>(arguments).map(|input| {
            (
                input.expected_version,
                Dispatch::Process(input.action),
                None,
            )
        }),
        "voyager_worktree" => {
            serde_json::from_value::<voyager_contract::worktree::Input>(arguments)
                .map(|input| (input.expected_version, Dispatch::Worktree(input), None))
        }
        _ => serde_json::from_value::<voyager_contract::content::Input>(arguments).map(|input| {
            (
                input.expected_version,
                Dispatch::Content(input.action),
                None,
            )
        }),
    }
}

pub(crate) fn catalog() -> Result<Vec<ToolDefinition>, String> {
    let schema: Value = serde_json::from_str(include_str!(
        "../../../contract/generated/workspaceTool.schema.json"
    ))
    .map_err(|error| error.to_string())?;
    let process_schema: Value = serde_json::from_str(include_str!(
        "../../../contract/generated/processTool.schema.json"
    ))
    .map_err(|error| error.to_string())?;
    let peek_schema: Value = serde_json::from_str(include_str!(
        "../../../contract/generated/peekTool.schema.json"
    ))
    .map_err(|error| error.to_string())?;
    let content_schema: Value = serde_json::from_str(include_str!(
        "../../../contract/generated/contentTool.schema.json"
    ))
    .map_err(|error| error.to_string())?;
    let worktree_schema: Value = serde_json::from_str(include_str!(
        "../../../contract/generated/worktreeTool.schema.json"
    ))
    .map_err(|error| error.to_string())?;
    Ok(vec![
        ToolDefinition {
            name: "voyager_worktree",
            description: "List, create, open or remove registered Git worktrees inside the captured Voyage or whole-workspace dock context. Inspect the workspace first for its exact version and Voyage ID. New checkouts use .worktree. Create and Open select or create the corresponding Voyage. Remove never forces, deletes branches or stops programs; live process use is refused. Never repeat an unconfirmed effect.",
            schema: worktree_schema,
        },
        ToolDefinition {
            name: "voyager_workspace",
            description: "Inspect and manage the captured dock context. Inspect first (expectedVersion 0), then use its returned version for each effect. Use exact IDs from inspection. Dock takes the human to its target and sets the context, so use it only when the human asks to go there; it does not retarget this request. No project/content-file edits. The application supplies request identity and authority.",
            schema,
        },
        ToolDefinition {
            name: "voyager_peek",
            description: "Look at one Voyage, Fleet, Vessel, Portal or the whole workspace without moving the human. Returns the same read as inspecting that target, in one call, and changes nothing: the human's screen and dock stay where they are. Use it to check on something elsewhere while the human stays here. Use workspace dock only when the human wants to be taken there.",
            schema: peek_schema,
        },
        ToolDefinition {
            name: "voyager_process",
            description: "Operate only bound terminals within this request's captured dock context. Inspect workspace for the current expectedVersion, then list processes for exact vesselId/terminalId/PID. Ended processes remain readable without PID. Read returns screen plus at most 160 history lines, not a complete conversation. Send uses Core's paste-and-Enter. Interrupt sends the program's stop key without escalation. Stop ends that terminal's program and descendants only when explicitly requested; it reports Core's observed state and does not restart it. These three effects require the inspected running PID. Input submitted or stop requested does not mean work completed or program ended. Do not interrupt, stop, resume, restart or repeat an uncertain effect automatically. All arguments, including text, share the 8 KiB callback limit. A Vessel's content uses the separate voyager_vessel tool.",
            schema: process_schema,
        },
        ToolDefinition {
            name: "voyager_vessel",
            description: "Describe, inspect and invoke the declared actions of an existing Vessel only inside the immutable captured dock context. Inspect workspace for expectedVersion and exact vesselId. Describe returns the state schema of the Vessel's type. Inspect returns the Vessel's state and its revision, and never writes. Invoke runs one action that the Vessel's type declares, with that action's args and the inspected revision as expectedRevision. Do not bypass a stale refusal; inspect again. Content arguments and results are limited to 1 MiB plus 16 KiB, and an oversized read explicitly refuses. A Vessel whose type is not installed has no content actions. Never repeat an uncertain write. The application supplies request identity and actor scope outside arguments.",
            schema: content_schema,
        },
    ])
}
