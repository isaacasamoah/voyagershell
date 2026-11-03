use super::{INITIAL_NOTES, schema};
use std::path::Path;
use voyager_contract::content::{
    Actions, Backend, Catalog, DataDescription, Description, NativeHost, NativeView, Placement,
};

struct Implementation {
    type_id: &'static str,
    name: &'static str,
    module: &'static str,
    component: &'static str,
    backend: Option<Backend>,
    tool: &'static str,
    input: &'static str,
    output: &'static str,
    action_definition: &'static str,
    state: Option<State>,
}

struct State {
    package: &'static str,
    defaults: &'static [u8],
}

const IMPLEMENTATIONS: &[Implementation] = &[
    Implementation {
        type_id: "terminal",
        name: "Terminal",
        module: "voyager_native",
        component: "Terminal",
        backend: Some(Backend::CoreTerminal),
        tool: "voyager_process",
        input: include_str!("../../../contract/generated/processTool.schema.json"),
        output: include_str!("../../../contract/generated/processResponse.schema.json"),
        action_definition: "ProcessAction",
        state: None,
    },
    Implementation {
        type_id: "notes",
        name: "Notes",
        module: "voyager_content_view",
        component: "Notes",
        backend: None,
        tool: "voyager_content",
        input: include_str!("../../../contract/generated/contentTool.schema.json"),
        output: include_str!("../../../contract/generated/contentResponse.schema.json"),
        action_definition: "Action",
        state: Some(State {
            package: "notes",
            defaults: INITIAL_NOTES,
        }),
    },
];

fn implementation(type_id: &str) -> Result<&'static Implementation, String> {
    IMPLEMENTATIONS
        .iter()
        .find(|kind| kind.type_id == type_id)
        .ok_or_else(|| "Unsupported content type".into())
}

pub(crate) fn supports_type(type_id: &str) -> bool {
    implementation(type_id).is_ok()
}

pub fn describe(packages: &Path, type_id: &str) -> Result<Description, String> {
    let kind = implementation(type_id)?;
    let input_schema: serde_json::Value =
        serde_json::from_str(kind.input).map_err(|error| error.to_string())?;
    let names = input_schema["definitions"][kind.action_definition]["oneOf"]
        .as_array()
        .ok_or("Content action schema is unavailable")?
        .iter()
        .map(|action| {
            action["properties"]["operation"]["const"]
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| "Content action name is unavailable".to_owned())
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Description {
        type_id: kind.type_id.into(),
        name: kind.name.into(),
        host: NativeHost {
            runtime: "gpui-shell".into(),
            version: "0.8.1".into(),
        },
        view: NativeView {
            module: kind.module.into(),
            component: kind.component.into(),
        },
        placements: vec![Placement::Fleet, Placement::Voyage],
        configuration: None,
        state: kind
            .state
            .as_ref()
            .map(|state| {
                Ok::<_, String>(DataDescription {
                    schema: schema(&packages.join(state.package))?,
                    defaults: serde_json::from_slice(state.defaults)
                        .map_err(|error| error.to_string())?,
                })
            })
            .transpose()?,
        actions: Actions {
            tool: kind.tool.into(),
            names,
            input_schema,
            result_schema: serde_json::from_str(kind.output).map_err(|error| error.to_string())?,
        },
        backend: kind.backend,
    })
}

pub fn discover(packages: &Path) -> Result<Catalog, String> {
    Ok(Catalog {
        types: IMPLEMENTATIONS
            .iter()
            .map(|kind| describe(packages, kind.type_id))
            .collect::<Result<_, _>>()?,
    })
}

pub fn require_action(description: &Description, name: &str) -> Result<(), String> {
    if description
        .actions
        .names
        .iter()
        .any(|action| action == name)
    {
        Ok(())
    } else {
        Err(format!(
            "Content type {} does not support action {name}",
            description.type_id
        ))
    }
}
