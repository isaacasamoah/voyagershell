use schemars::{JsonSchema, Schema, generate::SchemaSettings};
use serde_json::json;
use voyager_contract::conversation;
use voyager_contract::{Request, Response, TerminalRequest, TerminalResponse};

fn schema<T: JsonSchema>() -> Schema {
    SchemaSettings::draft07()
        .into_generator()
        .into_root_schema_for::<T>()
}

fn main() {
    match serde_json::to_string_pretty(
        &json!({"request":schema::<Request>(),"response":schema::<Response>(),"terminalRequest":schema::<TerminalRequest>(),"terminalResponse":schema::<TerminalResponse>(),
            "conversationRequest":schema::<conversation::Request>(),
            "conversationReply":schema::<conversation::Reply>(),
            "conversationSnapshot":schema::<conversation::Snapshot>(),
            "workspaceTool":schema::<voyager_contract::administrator::WorkspaceInput>(),
            "processTool":schema::<voyager_contract::administrator::ProcessInput>(),
            "processResponse":schema::<voyager_contract::administrator::ProcessResponse>(),
            "contentTool":schema::<voyager_contract::content::Input>(),
            "contentRequest":schema::<voyager_contract::content::Request>(),
            "contentResponse":schema::<voyager_contract::content::Response>(),
            "contentCatalog":schema::<voyager_contract::content::Catalog>(),
            "notes":schema::<voyager_contract::content::Notes>()}),
    ) {
        Ok(value) => println!("{value}"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
