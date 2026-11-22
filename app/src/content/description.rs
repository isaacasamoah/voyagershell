use super::{manifest, manifest::Registry};
use crate::vessel_type::AGENTS_TYPE;
use voyager_contract::content::{
    Actions, Availability, Backend, Catalog, Description, NativeHost, NativeView, Placement,
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
    },
    Implementation {
        type_id: "agent",
        name: "Agent",
        module: "voyager_native",
        component: "Terminal",
        backend: Some(Backend::CoreTerminal),
        tool: "voyager_process",
        input: include_str!("../../../contract/generated/processTool.schema.json"),
        output: include_str!("../../../contract/generated/processResponse.schema.json"),
        action_definition: "ProcessAction",
    },
    Implementation {
        type_id: AGENTS_TYPE,
        name: "Agents",
        module: "./agents.js",
        component: "agentsView",
        backend: None,
        tool: "voyager_process",
        input: include_str!("../../../contract/generated/processTool.schema.json"),
        output: include_str!("../../../contract/generated/processResponse.schema.json"),
        action_definition: "ProcessAction",
    },
];

fn implementation(type_id: &str) -> Result<&'static Implementation, String> {
    IMPLEMENTATIONS
        .iter()
        .find(|kind| kind.type_id == type_id)
        .ok_or_else(|| "Unsupported Vessel type".into())
}

fn is_builtin(type_id: &str) -> bool {
    implementation(type_id).is_ok()
}

pub fn open_registry(dir: std::path::PathBuf) -> Registry {
    Registry::new(dir, super::ENVELOPE_LIMIT, is_builtin)
}

pub fn require_available(registry: &Registry, type_id: &str) -> Result<(), String> {
    if let Some(found) = registry.describe(type_id) {
        return require_ready(&found);
    }
    require_ready(&describe(type_id)?)
}

pub(crate) fn require_ready(description: &Description) -> Result<(), String> {
    match &description.availability {
        Availability::Ready => Ok(()),
        Availability::Removed => Err("Vessel package is removed".into()),
        Availability::Unavailable { reason } => Err(reason.clone()),
    }
}

pub fn describe(type_id: &str) -> Result<Description, String> {
    let kind = implementation(type_id)?;
    let mut input_schema: serde_json::Value =
        serde_json::from_str(kind.input).map_err(|error| error.to_string())?;
    if kind.type_id == AGENTS_TYPE
        && let Some(actions) =
            input_schema["definitions"][kind.action_definition]["oneOf"].as_array_mut()
    {
        actions
            .retain(|action| action["properties"]["operation"]["const"].as_str() == Some("list"));
    }
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
    let result_schema = serde_json::from_str(kind.output).map_err(|error| error.to_string())?;
    Ok(Description {
        type_id: kind.type_id.into(),
        name: manifest::built_in(kind.type_id)
            .map_or(kind.name, |manifest| manifest.name.as_str())
            .into(),
        availability: Availability::Ready,
        host: NativeHost {
            runtime: "gpui-shell".into(),
            version: "0.8.1".into(),
        },
        view: NativeView {
            module: kind.module.into(),
            component: kind.component.into(),
        },
        placements: vec![Placement::Fleet, Placement::Voyage],
        state: None,
        actions: Some(Actions {
            tool: kind.tool.into(),
            names,
            input_schema,
            result_schema,
        }),
        backend: kind.backend,
        problems: Vec::new(),
    })
}

pub fn discover() -> Result<Catalog, String> {
    bound(Catalog {
        types: IMPLEMENTATIONS
            .iter()
            .map(|kind| describe(kind.type_id))
            .collect::<Result<_, _>>()?,
    })
}

pub fn discover_all(registry: &Registry) -> Result<Catalog, String> {
    let mut catalog = discover()?;
    catalog.types.extend(registry.descriptions());
    bound(catalog)
}

fn bound(mut catalog: Catalog) -> Result<Catalog, String> {
    if serde_json::to_vec(&catalog)
        .map_err(|error| error.to_string())?
        .len()
        > super::ENVELOPE_LIMIT
    {
        for kind in &mut catalog.types {
            if kind.state.is_some() {
                kind.availability = Availability::Unavailable { reason: "Content description exceeds the catalogue limit; its state and action details were not included".into() };
                kind.state = None;
                kind.actions = None;
            }
        }
    }
    Ok(catalog)
}

pub fn require_action(description: &Description, name: &str) -> Result<(), String> {
    require_ready(description)?;
    if description
        .actions
        .as_ref()
        .is_some_and(|actions| actions.names.iter().any(|action| action == name))
    {
        Ok(())
    } else {
        Err(format!(
            "Vessel type {} does not support action {name}",
            description.type_id
        ))
    }
}
