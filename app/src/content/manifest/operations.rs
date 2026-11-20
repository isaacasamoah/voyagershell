use serde_json::{Value, json};
use voyager_contract::content::{ActionDecl, Actions, Manifest};

const TOOL: &str = "voyager_vessel";

fn parameter(spec: &str) -> Value {
    let kinds: Vec<&str> = spec
        .split('|')
        .map(str::trim)
        .filter(|kind| *kind != "any")
        .collect();
    match kinds.as_slice() {
        [] => json!({}),
        [one] => json!({"type": one}),
        many => json!({"type": many}),
    }
}

fn invoke(name: &str, action: &ActionDecl) -> Value {
    let names: Vec<&String> = action.params.keys().collect();
    let properties: serde_json::Map<String, Value> = action
        .params
        .iter()
        .map(|(param, spec)| (param.clone(), parameter(spec)))
        .collect();
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["operation", "vesselId", "action", "args", "expectedRevision"],
        "properties": {
            "operation": {"const": "invoke"},
            "vesselId": {"type": "string"},
            "action": {"const": name},
            "args": {
                "type": "object",
                "additionalProperties": false,
                "required": names,
                "properties": properties
            },
            "expectedRevision": {"type": "string"}
        }
    })
}

fn read(operation: &str) -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["operation", "vesselId"],
        "properties": {"operation": {"const": operation}, "vesselId": {"type": "string"}}
    })
}

pub(crate) fn actions(manifest: &Manifest) -> Result<Actions, String> {
    let mut variants = vec![read("describe"), read("inspect")];
    variants.extend(
        manifest
            .actions
            .iter()
            .map(|(name, action)| invoke(name, action)),
    );
    Ok(Actions {
        tool: TOOL.into(),
        names: vec!["describe".into(), "inspect".into(), "invoke".into()],
        input_schema: json!({
            "type": "object",
            "additionalProperties": false,
            "required": ["expectedVersion", "action"],
            "properties": {
                "expectedVersion": {"type": "string"},
                "action": {"oneOf": variants}
            }
        }),
        result_schema: serde_json::from_str(include_str!(
            "../../../../contract/generated/contentResponse.schema.json"
        ))
        .map_err(|error| error.to_string())?,
    })
}
