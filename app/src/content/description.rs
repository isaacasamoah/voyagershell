use super::{INITIAL_NOTES, manifest, state_schema};
use std::path::Path;
use voyager_contract::content::{
    Actions, Availability, Backend, Catalog, DataDescription, Description, NativeHost, NativeView,
    Placement,
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

pub(crate) fn package_name(type_id: &str) -> Result<Option<&'static str>, String> {
    Ok(implementation(type_id)?
        .state
        .as_ref()
        .map(|state| state.package))
}

pub(crate) fn require_ready(description: &Description) -> Result<(), String> {
    match &description.availability {
        Availability::Ready => Ok(()),
        Availability::Removed => Err("Content package is removed".into()),
        Availability::Unavailable { reason } => Err(reason.clone()),
    }
}

fn installed_schema(package: &Path) -> Result<Option<serde_json::Value>, String> {
    let manifest = manifest(package)?;
    let entry = manifest
        .get("entry")
        .and_then(serde_json::Value::as_str)
        .ok_or("Content entry is missing")?;
    if manifest.get("version").and_then(serde_json::Value::as_u64) != Some(1)
        || manifest
            .get("name")
            .and_then(serde_json::Value::as_str)
            .is_none_or(str::is_empty)
        || !package.join(entry).is_file()
    {
        return Err("Content package requires a name, version 1 and an existing entry file".into());
    }
    state_schema(&manifest)
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
    let (availability, state) = match &kind.state {
        None => (Availability::Ready, None),
        Some(state) => {
            let path = packages.join(state.package);
            if super::package::removed_path(&path).exists() && !path.exists() {
                (Availability::Removed, None)
            } else {
                match installed_schema(&path) {
                    Ok(schema) => (
                        Availability::Ready,
                        Some(DataDescription {
                            schema,
                            defaults: serde_json::from_slice(state.defaults)
                                .map_err(|error| error.to_string())?,
                        }),
                    ),
                    Err(reason) => {
                        let short: String = reason.chars().take(1024).collect();
                        let reason = if short.len() < reason.len() {
                            format!("{short}... Metadata error detail truncated")
                        } else {
                            reason
                        };
                        (Availability::Unavailable { reason }, None)
                    }
                }
            }
        }
    };
    let result_schema = serde_json::from_str(kind.output).map_err(|error| error.to_string())?;
    let actions = (availability == Availability::Ready).then_some(Actions {
        tool: kind.tool.into(),
        names,
        input_schema,
        result_schema,
    });
    Ok(Description {
        type_id: kind.type_id.into(),
        name: kind.name.into(),
        availability,
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
        state,
        actions,
        backend: kind.backend,
    })
}

pub fn discover(packages: &Path) -> Result<Catalog, String> {
    let mut catalog = Catalog {
        types: IMPLEMENTATIONS
            .iter()
            .map(|kind| describe(packages, kind.type_id))
            .collect::<Result<_, _>>()?,
    };
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
            "Content type {} does not support action {name}",
            description.type_id
        ))
    }
}
