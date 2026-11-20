use super::expression::{Call, Expr, Function, Op, Path, Root, Segment};
use serde_json::{Map, Value};
use std::cell::Cell;

pub(crate) struct Env<'a> {
    pub state: &'a Value,
    pub params: &'a Map<String, Value>,
    pub seed: &'a str,
    pub issued: Cell<u32>,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub(crate) enum Step {
    Key(String),
    Index(usize),
}

fn same(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Number(left), Value::Number(right)) => left.as_f64() == right.as_f64(),
        _ => left == right,
    }
}

fn truth(value: &Value, operator: &str) -> Result<bool, String> {
    value
        .as_bool()
        .ok_or_else(|| format!("{operator} needs a boolean"))
}

pub(crate) fn template(source: &Value, env: &Env) -> Result<Value, String> {
    match source {
        Value::String(text) => eval(&super::expression::parse(text)?, env),
        Value::Array(items) => items
            .iter()
            .map(|item| template(item, env))
            .collect::<Result<_, _>>()
            .map(Value::Array),
        Value::Object(fields) => fields
            .iter()
            .map(|(name, value)| Ok((name.clone(), template(value, env)?)))
            .collect::<Result<Map<_, _>, String>>()
            .map(Value::Object),
        other => Ok(other.clone()),
    }
}

pub(crate) fn eval(expr: &Expr, env: &Env) -> Result<Value, String> {
    match expr {
        Expr::Null => Ok(Value::Null),
        Expr::Bool(value) => Ok(Value::Bool(*value)),
        Expr::Number(value) => Ok(serde_json::json!(*value)),
        Expr::Text(value) => Ok(Value::String(value.clone())),
        Expr::Path(path) => read(path, env),
        Expr::Not(inner) => Ok(Value::Bool(!truth(&eval(inner, env)?, "!")?)),
        Expr::Binary(Op::And, left, right) => Ok(Value::Bool(
            truth(&eval(left, env)?, "&&")? && truth(&eval(right, env)?, "&&")?,
        )),
        Expr::Binary(Op::Or, left, right) => Ok(Value::Bool(
            truth(&eval(left, env)?, "||")? || truth(&eval(right, env)?, "||")?,
        )),
        Expr::Binary(op, left, right) => {
            let equal = same(&eval(left, env)?, &eval(right, env)?);
            Ok(Value::Bool(equal == (*op == Op::Eq)))
        }
        Expr::Call(call) => call_function(call, env),
    }
}

fn call_function(call: &Call, env: &Env) -> Result<Value, String> {
    let subject = eval(&call.subject, env)?;
    if call.function == Function::Match {
        let key = match &subject {
            Value::String(text) => text.clone(),
            Value::Number(number) => number.as_f64().map_or_else(
                || number.to_string(),
                |found| {
                    if found.fract() == 0.0 {
                        format!("{}", found as i64)
                    } else {
                        found.to_string()
                    }
                },
            ),
            other => other.to_string(),
        };
        return call
            .named
            .iter()
            .find(|(name, _)| *name == key)
            .map_or(Ok(Value::Null), |(_, case)| eval(case, env));
    }
    let Value::Array(items) = subject else {
        return Err("expected a list".into());
    };
    let wanted: Vec<(&str, Value)> = call
        .named
        .iter()
        .map(|(name, value)| Ok((name.as_str(), eval(value, env)?)))
        .collect::<Result<_, String>>()?;
    let mut kept = items.into_iter().filter(|item| {
        wanted
            .iter()
            .all(|(name, value)| item.get(*name).is_some_and(|found| same(found, value)))
    });
    match call.function {
        Function::Count => Ok(serde_json::json!(kept.count())),
        Function::First => Ok(kept.next().unwrap_or(Value::Null)),
        _ => Ok(Value::Array(kept.collect())),
    }
}

fn root(path: &Path, env: &Env) -> Result<Value, String> {
    match &path.root {
        Root::Field(name) => Ok(env.state.get(name).cloned().unwrap_or(Value::Null)),
        Root::Param(name) => env
            .params
            .get(name)
            .cloned()
            .ok_or_else(|| format!("unknown name ${name}")),
        Root::Uuid => {
            let nth = env.issued.get();
            env.issued.set(nth + 1);
            let digest = <sha2::Sha256 as sha2::Digest>::digest(format!("{}:{nth}", env.seed));
            Ok(Value::String(
                digest
                    .iter()
                    .take(8)
                    .map(|byte| format!("{byte:02x}"))
                    .collect(),
            ))
        }
        Root::Local => Ok(Value::Null),
    }
}

fn read(path: &Path, env: &Env) -> Result<Value, String> {
    let mut current = vec![root(path, env)?];
    let mut many = false;
    for segment in &path.segments {
        let mut next = Vec::new();
        for value in current {
            match segment {
                Segment::Field(name) => next.push(value.get(name).cloned().unwrap_or(Value::Null)),
                Segment::Index(index) => {
                    next.push(value.get(*index).cloned().unwrap_or(Value::Null))
                }
                Segment::All => {
                    many = true;
                    next.extend(value.as_array().cloned().unwrap_or_default());
                }
                Segment::Select(field, wanted) => {
                    let wanted = eval(wanted, env)?;
                    next.push(
                        value
                            .as_array()
                            .and_then(|items| {
                                items
                                    .iter()
                                    .find(|item| item.get(field).is_some_and(|f| same(f, &wanted)))
                            })
                            .cloned()
                            .unwrap_or(Value::Null),
                    );
                }
            }
        }
        current = next;
    }
    Ok(if many {
        Value::Array(current)
    } else {
        current.into_iter().next().unwrap_or(Value::Null)
    })
}

type Place<'a> = (Vec<Step>, Option<&'a Value>);

fn along<'a>(steps: &[Step], step: Step, found: Option<&'a Value>) -> Place<'a> {
    let mut taken = steps.to_vec();
    taken.push(step);
    (taken, found)
}

pub(crate) fn locate(path: &Path, env: &Env) -> Result<Vec<Vec<Step>>, String> {
    let Root::Field(name) = &path.root else {
        return Err("a target path starts at a state field".into());
    };
    let mut places: Vec<Place> = vec![(vec![Step::Key(name.clone())], env.state.get(name))];
    for segment in &path.segments {
        let mut next: Vec<Place> = Vec::new();
        for (steps, value) in places {
            let Some(value) = value else { continue };
            match segment {
                Segment::Field(name) => {
                    next.push(along(&steps, Step::Key(name.clone()), value.get(name)))
                }
                Segment::Index(index) => {
                    next.push(along(&steps, Step::Index(*index), value.get(*index)))
                }
                Segment::All => {
                    for (index, item) in value.as_array().into_iter().flatten().enumerate() {
                        next.push(along(&steps, Step::Index(index), Some(item)));
                    }
                }
                Segment::Select(field, wanted) => {
                    let wanted = eval(wanted, env)?;
                    let hit = value
                        .as_array()
                        .into_iter()
                        .flatten()
                        .enumerate()
                        .find(|(_, item)| item.get(field).is_some_and(|f| same(f, &wanted)));
                    if let Some((index, item)) = hit {
                        next.push(along(&steps, Step::Index(index), Some(item)));
                    }
                }
            }
        }
        places = next;
    }
    Ok(places.into_iter().map(|(steps, _)| steps).collect())
}

pub(crate) fn at<'a>(state: &'a mut Value, steps: &[Step]) -> Option<&'a mut Value> {
    steps.iter().try_fold(state, |value, step| match step {
        Step::Key(name) => value.get_mut(name),
        Step::Index(index) => value.get_mut(*index),
    })
}
