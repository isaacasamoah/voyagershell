use super::{
    expression::{self, Root, Scope, Segment, Shape, infer_source, infer_template},
    problem::{Problem, valid_type_id},
};
use std::collections::{BTreeMap, BTreeSet};
use voyager_contract::content::{
    ActionDecl, Concurrency, DockEntry, Effect, Manifest, OrbitEntry, Run, StateDecl, ViewDecl,
};

pub(crate) struct Environment<'a> {
    pub exists: &'a dyn Fn(&str) -> bool,
    pub reserved: &'a dyn Fn(&str) -> bool,
}

struct Context<'a> {
    state: &'a Shape,
    local: Option<&'a Shape>,
    actions: &'a BTreeMap<String, ActionDecl>,
    params: BTreeMap<String, BTreeMap<String, Shape>>,
}

struct Report(Vec<Problem>);

impl Report {
    fn add(&mut self, path: &str, message: impl Into<String>) {
        self.0.push(Problem::new(path, message));
    }

    fn all(&mut self, path: &str, messages: Vec<String>) {
        for message in messages {
            self.add(path, message);
        }
    }
}

pub(crate) fn check(manifest: &Manifest, environment: &Environment) -> Vec<Problem> {
    let mut report = Report(Vec::new());
    if manifest.contract != 1 {
        report.add("contract", format!("must be 1, got {}", manifest.contract));
    }
    if !valid_type_id(&manifest.id) {
        report.add(
            "id",
            format!(
                "\"{}\" must start with a lowercase letter or digit, use only lowercase letters, digits, \".\", \"-\" and \"_\", and be at most 64 characters",
                manifest.id
            ),
        );
    } else if (environment.reserved)(&manifest.id) {
        report.add(
            "id",
            format!("\"{}\" is already a Vessel type", manifest.id),
        );
    }
    if manifest.name.trim().is_empty() {
        report.add("name", "must not be empty");
    }
    if manifest.version == 0 {
        report.add("version", "must be at least 1");
    }
    let state = declared_state(&manifest.state, "state", &mut report);
    let local = manifest
        .local
        .as_ref()
        .and_then(|local| declared_state(local, "local", &mut report));
    let Some(state) = state else {
        return report.0;
    };
    migrations(manifest, &state, &mut report);
    merge(&manifest.concurrency, &state, &mut report);
    let params = parameters(&manifest.actions, &mut report);
    let context = Context {
        state: &state,
        local: local.as_ref(),
        actions: &manifest.actions,
        params,
    };
    for (name, action) in &manifest.actions {
        action_effects(name, action, manifest, &context, &mut report);
    }
    view(&manifest.view, &context, environment, &mut report);
    behaviours(&manifest.orbit, &manifest.dock, &context, &mut report);
    report.0
}

fn declared_state(decl: &StateDecl, path: &str, report: &mut Report) -> Option<Shape> {
    let validator = match jsonschema::validator_for(&decl.schema) {
        Ok(validator) => validator,
        Err(error) => {
            report.add(&format!("{path}.schema"), error.to_string());
            return None;
        }
    };
    let shape = match Shape::from_schema(&decl.schema) {
        Ok(shape @ Shape::Record(_)) => shape,
        Ok(other) => {
            report.add(
                &format!("{path}.schema"),
                format!("must describe an object, not {}", other.name()),
            );
            return None;
        }
        Err(error) => {
            report.add(&format!("{path}.schema"), error);
            return None;
        }
    };
    for error in validator.iter_errors(&decl.initial) {
        report.add(&format!("{path}.initial"), error.to_string());
    }
    Some(shape)
}

fn migrations(manifest: &Manifest, state: &Shape, report: &mut Report) {
    let params = BTreeMap::new();
    let scope = Scope {
        state,
        local: None,
        params: &params,
    };
    for (index, migration) in manifest.state.migrations.iter().enumerate() {
        let at = format!("state.migrations[{index}]");
        if migration.from >= manifest.version {
            report.add(
                &format!("{at}.from"),
                format!("must be below the manifest version {}", manifest.version),
            );
        }
        for (key, value) in &migration.set {
            let at = format!("{at}.set.{key}");
            let path = match expression::parse_path(key) {
                Ok(path) => path,
                Err(error) => {
                    report.add(&at, error);
                    continue;
                }
            };
            let mut problems = Vec::new();
            let want = expression::infer_path(&path, &scope, &mut problems);
            let got = infer_template(value, &scope, &mut problems);
            report.all(&at, problems);
            if let Err(error) = want.accepts(&got) {
                report.add(&at, error);
            }
        }
    }
}

fn merge(concurrency: &Concurrency, state: &Shape, report: &mut Report) {
    let Shape::Record(record) = state else { return };
    for (index, field) in concurrency.merge.iter().enumerate() {
        if !record.fields.iter().any(|(name, _)| name == field) {
            report.add(
                &format!("concurrency.merge[{index}]"),
                format!("state has no field \"{field}\""),
            );
        }
    }
}

fn identifier(name: &str) -> bool {
    name.starts_with(|first: char| first.is_ascii_alphabetic() || first == '_')
        && name
            .chars()
            .all(|found| found.is_ascii_alphanumeric() || found == '_')
}

fn parameters(
    actions: &BTreeMap<String, ActionDecl>,
    report: &mut Report,
) -> BTreeMap<String, BTreeMap<String, Shape>> {
    let mut all = BTreeMap::new();
    for (name, action) in actions {
        if !identifier(name) {
            report.add(
                &format!("actions.{name}"),
                "action names use letters, digits and \"_\" and start with a letter or \"_\"",
            );
        }
        let mut shapes = BTreeMap::new();
        for (param, spec) in &action.params {
            let at = format!("actions.{name}.params.{param}");
            if !identifier(param) {
                report.add(&at, "parameter names use letters, digits and \"_\"");
            }
            match Shape::from_param(spec) {
                Ok(shape) => {
                    shapes.insert(param.clone(), shape);
                }
                Err(error) => report.add(&at, error),
            }
        }
        all.insert(name.clone(), shapes);
    }
    all
}

fn scope<'a>(context: &'a Context, params: &'a BTreeMap<String, Shape>) -> Scope<'a> {
    Scope {
        state: context.state,
        local: context.local,
        params,
    }
}

fn target(path: &str, scope: &Scope) -> Result<(Shape, expression::Path), Vec<String>> {
    let parsed = expression::parse_path(path).map_err(|error| vec![error])?;
    if !matches!(parsed.root, Root::Field(_)) {
        return Err(vec![format!(
            "\"{path}\" must start at a field of the state"
        )]);
    }
    let mut problems = Vec::new();
    let shape = expression::infer_path(&parsed, scope, &mut problems);
    if problems.is_empty() {
        Ok((shape, parsed))
    } else {
        Err(problems)
    }
}

fn element(path: &expression::Path) -> bool {
    matches!(
        path.segments.last(),
        Some(Segment::Select(..) | Segment::Index(_))
    )
}

fn action_effects(
    name: &str,
    action: &ActionDecl,
    manifest: &Manifest,
    context: &Context,
    report: &mut Report,
) {
    if action.effect.is_empty() {
        report.add(
            &format!("actions.{name}.effect"),
            "needs at least one effect",
        );
    }
    let params = &context.params[name];
    let scope = scope(context, params);
    for (index, effect) in action.effect.iter().enumerate() {
        let at = format!("actions.{name}.effect[{index}]");
        match effect {
            Effect::Set { path, value } => match target(path, &scope) {
                Ok((want, _)) => {
                    let mut problems = Vec::new();
                    let got = infer_template(value, &scope, &mut problems);
                    report.all(&at, problems);
                    if let Err(error) = want.accepts(&got) {
                        report.add(&at, format!("set {path}: {error}"));
                    }
                }
                Err(problems) => report.all(&at, problems),
            },
            Effect::Push { path, value } => match target(path, &scope) {
                Ok((Shape::List(item), _)) => {
                    let mut problems = Vec::new();
                    let got = infer_template(value, &scope, &mut problems);
                    report.all(&at, problems);
                    if let Err(error) = item.accepts(&got) {
                        report.add(&at, format!("push {path}: {error}"));
                    }
                }
                Ok((other, _)) => report.add(
                    &at,
                    format!("push {path}: expected a list, got {}", other.name()),
                ),
                Err(problems) => report.all(&at, problems),
            },
            Effect::Remove { path } => match target(path, &scope) {
                Ok((_, parsed)) if !element(&parsed) => report.add(
                    &at,
                    format!("remove {path}: must end in a selector or an index"),
                ),
                Ok(_) => {}
                Err(problems) => report.all(&at, problems),
            },
            Effect::Move { path, to, index } => {
                let mut problems = Vec::new();
                let got = infer_source(index, &scope, &mut problems);
                report.all(&at, problems);
                if let Err(error) = Shape::Number.accepts(&got) {
                    report.add(&at, format!("move index: {error}"));
                }
                match (target(path, &scope), target(to, &scope)) {
                    (Ok((moved, parsed)), Ok((Shape::List(item), _))) => {
                        if !element(&parsed) {
                            report.add(
                                &at,
                                format!("move {path}: must end in a selector or an index"),
                            );
                        }
                        if let Err(error) = item.accepts(&moved) {
                            report.add(&at, format!("move into {to}: {error}"));
                        }
                    }
                    (moved, destination) => {
                        if let Err(problems) = moved {
                            report.all(&at, problems);
                        }
                        match destination {
                            Err(problems) => report.all(&at, problems),
                            Ok((other, _)) => report.add(
                                &at,
                                format!("move into {to}: expected a list, got {}", other.name()),
                            ),
                        }
                    }
                }
            }
            Effect::Backend => {
                if manifest.backend.is_none() {
                    report.add(&at, "backend effect but no backend is declared");
                }
            }
        }
    }
}

fn safe_file(path: &str, at: &str, environment: &Environment, report: &mut Report) {
    let inside = !path.is_empty()
        && !path.starts_with('/')
        && !path.contains('\\')
        && path.split('/').all(|part| !part.is_empty() && part != "..");
    if !inside {
        report.add(at, "must be a relative path inside the package");
    } else if !(environment.exists)(path) {
        report.add(at, format!("file \"{path}\" is not in the package"));
    }
}

fn view(view: &ViewDecl, context: &Context, environment: &Environment, report: &mut Report) {
    safe_file(&view.source, "view.source", environment, report);
    let no_params = BTreeMap::new();
    let scope = scope(context, &no_params);
    for (name, island) in &view.islands {
        let at = format!("view.islands.{name}");
        safe_file(&island.script, &format!("{at}.script"), environment, report);
        for (prop, source) in &island.props {
            let mut problems = Vec::new();
            infer_source(source, &scope, &mut problems);
            report.all(&format!("{at}.props.{prop}"), problems);
        }
        for (index, action) in island.actions.iter().enumerate() {
            if !context.actions.contains_key(action) {
                report.add(
                    &format!("{at}.actions[{index}]"),
                    undeclared(action, context.actions),
                );
            }
        }
    }
}

fn undeclared(action: &str, actions: &BTreeMap<String, ActionDecl>) -> String {
    format!(
        "action \"{action}\" is not declared (declared: {})",
        actions.keys().cloned().collect::<Vec<_>>().join(", ")
    )
}

fn behaviours(orbit: &[OrbitEntry], dock: &[DockEntry], context: &Context, report: &mut Report) {
    let no_params = BTreeMap::new();
    let scope = scope(context, &no_params);
    let mut seen = BTreeSet::new();
    for entry in orbit {
        let at = format!("orbit.{}", entry.id);
        if !seen.insert(entry.id.as_str()) {
            report.add(&at, "id is used twice");
        }
        if entry.label.trim().is_empty() {
            report.add(&at, "label must not be empty");
        }
        run(&entry.run, &at, context, &scope, report);
    }
    let mut seen = BTreeSet::new();
    for entry in dock {
        let at = format!("dock.{}", entry.id);
        if !seen.insert(entry.id.as_str()) {
            report.add(&at, "id is used twice");
        }
        let mut problems = Vec::new();
        infer_source(&entry.read, &scope, &mut problems);
        report.all(&at, problems);
    }
}

fn run(run: &Run, at: &str, context: &Context, scope: &Scope, report: &mut Report) {
    match (&run.action, &run.agent) {
        (Some(_), Some(_)) | (None, None) => {
            report.add(at, "run needs exactly one of \"action\" or \"agent\"");
        }
        (Some(action), None) => {
            if run.read.is_some() {
                report.add(at, "\"read\" belongs to an agent run");
            }
            let Some(declared) = context.actions.get(action) else {
                report.add(at, undeclared(action, context.actions));
                return;
            };
            let params = &context.params[action];
            for name in declared.params.keys() {
                if !run.args.contains_key(name) && !run.ask.contains_key(name) {
                    report.add(
                        at,
                        format!("{action}: argument \"{name}\" is neither given nor asked"),
                    );
                }
            }
            for name in run.ask.keys().chain(run.args.keys()) {
                if !declared.params.contains_key(name) {
                    report.add(at, format!("{action}: unknown argument \"{name}\""));
                }
            }
            for (name, source) in &run.args {
                let mut problems = Vec::new();
                let got = infer_source(source, scope, &mut problems);
                report.all(at, problems);
                if let Some(want) = params.get(name)
                    && let Err(error) = want.accepts(&got)
                {
                    report.add(at, format!("{action}.{name}: {error}"));
                }
            }
        }
        (None, Some(_)) => {
            if !run.args.is_empty() || !run.ask.is_empty() {
                report.add(at, "\"args\" and \"ask\" belong to an action run");
            }
            match &run.read {
                Some(source) => {
                    let mut problems = Vec::new();
                    infer_source(source, scope, &mut problems);
                    report.all(at, problems);
                }
                None => report.add(at, "an agent run needs \"read\""),
            }
        }
    }
}
