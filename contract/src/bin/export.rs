use schemars::{JsonSchema, Schema, generate::SchemaSettings};
use serde_json::json;
use voyager_contract::conversation;
use voyager_contract::{Reply, Request, TerminalRequest, TerminalResponse};

fn schema<T: JsonSchema>() -> Schema {
    SchemaSettings::draft07()
        .into_generator()
        .into_root_schema_for::<T>()
}

fn without_operation(mut schema: Schema, operation: &str) -> Schema {
    if let Some(variants) = schema
        .get_mut("definitions")
        .and_then(|definitions| definitions.get_mut("Action"))
        .and_then(|action| action.get_mut("oneOf"))
        .and_then(|variants| variants.as_array_mut())
    {
        variants.retain(|variant| {
            variant.pointer("/properties/operation/const") != Some(&json!(operation))
        });
    }
    schema
}

fn main() {
    if std::env::args().nth(1).as_deref() == Some("--operations") {
        match serde_json::to_string_pretty(&voyager_contract::operations::MODULES) {
            Ok(value) => println!("{value}"),
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
        return;
    }
    if std::env::args().nth(1).as_deref() == Some("--avatar") {
        let schemas = json!({
            "avatarAnimationPack": schema::<voyager_contract::avatar_animation::Pack>(),
            "avatarAnimationConfiguration": schema::<voyager_contract::avatar_animation::Configuration>()
        });
        match serde_json::to_string_pretty(&schemas) {
            Ok(value) => println!("{value}"),
            Err(error) => {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
        return;
    }
    match serde_json::to_string_pretty(
        &json!({"request":schema::<Request>(),"response":schema::<Reply>(),"terminalRequest":schema::<TerminalRequest>(),"terminalResponse":schema::<TerminalResponse>(),
            "conversationRequest":schema::<conversation::Request>(),
            "conversationReply":schema::<conversation::Reply>(),
            "conversationSnapshot":schema::<conversation::Snapshot>(),
            "workspaceTool":without_operation(schema::<voyager_contract::administrator::WorkspaceInput>(), "focus-vessel"),
            "peekTool":schema::<voyager_contract::administrator::PeekInput>(),
            "processTool":schema::<voyager_contract::administrator::ProcessInput>(),
            "processResponse":schema::<voyager_contract::administrator::ProcessResponse>(),
            "contentTool":schema::<voyager_contract::content::Input>(),
            "contentRequest":schema::<voyager_contract::content::Request>(),
            "contentResponse":schema::<voyager_contract::content::Response>(),
            "contentCatalog":schema::<voyager_contract::content::Catalog>(),
            "contentManifest":schema::<voyager_contract::content::Manifest>(),
            "canvas":schema::<voyager_contract::canvas::Canvas>(),
            "contextFacts":schema::<voyager_contract::context::Facts>(),
            "workspaceObservation":schema::<voyager_contract::observation::WorkspaceObservation>(),
            "worktreeTool":schema::<voyager_contract::worktree::Input>(),
            "worktreeRequest":schema::<voyager_contract::worktree::Request>(),
            "worktreeResponse":schema::<voyager_contract::worktree::Response>(),
            "reportedActivity":schema::<voyager_contract::activity::Projection>(),
            "voiceState":schema::<voyager_contract::voice::State>(),
            "launchCatalog":schema::<voyager_contract::launch::Catalog>(),
            "agentPrograms":schema::<voyager_contract::launch::AgentTable>(),
            "place":schema::<voyager_contract::place::Place>(),
            "socketRequest":schema::<voyager_contract::socket::SocketRequest>(),
            "socketReply":schema::<voyager_contract::socket::SocketReply>()}),
    ) {
        Ok(value) => println!("{value}"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
