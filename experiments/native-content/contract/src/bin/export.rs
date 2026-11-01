use schemars::{JsonSchema, Schema, generate::SchemaSettings};
use serde_json::json;
use voyager_contract::{Notes, Request, Response};

fn schema<T: JsonSchema>() -> Schema {
    SchemaSettings::draft07()
        .into_generator()
        .into_root_schema_for::<T>()
}

fn main() {
    println!("{}", serde_json::to_string_pretty(&json!({"request": schema::<Request>(), "response": schema::<Response>(), "notes": schema::<Notes>()})).unwrap());
}
