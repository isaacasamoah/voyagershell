use super::{
    eval::{Env, Step, at, eval, locate, template},
    expression::{Shape, parse, parse_path},
};
use serde_json::{Map, Value};
use std::cell::Cell;
use voyager_contract::content::{Effect, Manifest, Rebase};

pub(crate) fn rebase(manifest: &Manifest, action: &str) -> Option<Rebase> {
    manifest.actions.get(action).map(|declared| declared.rebase)
}

fn arguments(
    manifest: &Manifest,
    action: &str,
    args: &Value,
) -> Result<Map<String, Value>, String> {
    let declared = manifest.actions.get(action).ok_or_else(|| {
        format!(
            "undeclared action \"{action}\" (declared: {})",
            manifest
                .actions
                .keys()
                .cloned()
                .collect::<Vec<_>>()
                .join(", ")
        )
    })?;
    let given = match args {
        Value::Object(map) => map.clone(),
        Value::Null => Map::new(),
        _ => return Err("arguments must be an object".into()),
    };
    for (name, spec) in &declared.params {
        let want = Shape::from_param(spec)?;
        let value = given
            .get(name)
            .ok_or_else(|| format!("{action}: missing argument \"{name}\""))?;
        if let Err(error) = want.accepts(&Shape::of_value(value)) {
            return Err(format!("{action}: argument \"{name}\": {error}"));
        }
    }
    if let Some(extra) = given
        .keys()
        .find(|name| !declared.params.contains_key(*name))
    {
        return Err(format!("{action}: unknown argument \"{extra}\""));
    }
    Ok(given)
}

fn element(steps: &[Step]) -> Result<(&[Step], usize), String> {
    match steps.split_last() {
        Some((Step::Index(index), parent)) => Ok((parent, *index)),
        _ => Err("target is not a list item".into()),
    }
}

fn list<'a>(state: &'a mut Value, steps: &[Step]) -> Result<&'a mut Vec<Value>, String> {
    at(state, steps)
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "target list is gone".into())
}

pub(crate) fn run(
    manifest: &Manifest,
    action: &str,
    args: &Value,
    state: &Value,
    seed: &str,
) -> Result<Value, String> {
    let params = arguments(manifest, action, args)?;
    let mut next = state.clone();
    let issued = Cell::new(0);
    for effect in &manifest.actions[action].effect {
        let snapshot = next.clone();
        let env = Env {
            state: &snapshot,
            params: &params,
            seed,
            issued: Cell::new(issued.get()),
        };
        match effect {
            Effect::Set { path, value } => {
                let places = locate(&parse_path(path)?, &env)?;
                if places.is_empty() {
                    return Err(format!("target is gone: {path}"));
                }
                let value = template(value, &env)?;
                for steps in places {
                    *at(&mut next, &steps).ok_or("target is gone")? = value.clone();
                }
            }
            Effect::Push { path, value } => {
                let places = locate(&parse_path(path)?, &env)?;
                let [steps] = places.as_slice() else {
                    return Err(format!("target is gone: {path}"));
                };
                let value = template(value, &env)?;
                list(&mut next, steps)?.push(value);
            }
            Effect::Remove { path } => {
                let mut places = locate(&parse_path(path)?, &env)?;
                places.sort();
                places.reverse();
                for steps in places {
                    let (parent, index) = element(&steps)?;
                    list(&mut next, parent)?.remove(index);
                }
            }
            Effect::Move { path, to, index } => {
                let places = locate(&parse_path(path)?, &env)?;
                let [from] = places.as_slice() else {
                    return Err(format!("target is gone: {path}"));
                };
                let destinations = locate(&parse_path(to)?, &env)?;
                let [destination] = destinations.as_slice() else {
                    return Err(format!("target is gone: {to}"));
                };
                let wanted = eval(&parse(index)?, &env)?
                    .as_f64()
                    .ok_or("move index must be a number")?;
                let (parent, position) = element(from)?;
                let moved = list(&mut next, parent)?.remove(position);
                let target = list(&mut next, destination)?;
                let slot = (wanted.max(0.0) as usize).min(target.len());
                target.insert(slot, moved);
            }
            Effect::Backend => {
                return Err("this action is forwarded to a backend, which is not connected".into());
            }
        }
        issued.set(env.issued.get());
    }
    let validator = jsonschema::validator_for(&manifest.state.schema).map_err(|e| e.to_string())?;
    if let Some(error) = validator.iter_errors(&next).next() {
        return Err(format!("the result would break the state schema: {error}"));
    }
    Ok(next)
}
