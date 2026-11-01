use schemars::{JsonSchema, Schema, generate::SchemaSettings};
use serde_json::json;
use voyager_contract::{Request, Response};

fn schema<T: JsonSchema>() -> Schema {
    SchemaSettings::draft07()
        .into_generator()
        .into_root_schema_for::<T>()
}

fn main() {
    match serde_json::to_string_pretty(
        &json!({"request":schema::<Request>(),"response":schema::<Response>()}),
    ) {
        Ok(value) => println!("{value}"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
