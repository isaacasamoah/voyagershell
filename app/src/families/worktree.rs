use crate::{layout_parts::Part, scope, workspace::Model};
use std::path::Path;
use std::sync::Arc;
use voyager_contract::{
    Action, Context, Layout,
    worktree::{Action as WorktreeAction, Checkout, Request, Response, Status},
};

mod git;
use git::{Error, check_live_directories, execute, open, remove};
pub(crate) use git::{list, uncommitted_changes};

fn refusal(request: &Request, status: Status, message: String) -> Arc<Response> {
    Arc::new(Response {
        request_id: request.request_id.clone(),
        status,
        message: Some(message),
        checkouts: Vec::new(),
    })
}

pub(crate) fn rejected(request: &Request, message: String) -> Arc<Response> {
    refusal(request, Status::Rejected, message)
}

pub(crate) fn uncertain(request: &Request, message: String) -> Arc<Response> {
    refusal(request, Status::Uncertain, message)
}

pub(crate) fn parts(request: &Request) -> Vec<Part> {
    vec![Part::Voyage(request.voyage.clone())]
}

fn authorizes(scope: Option<&Context>, request: &Request) -> bool {
    matches!(scope, None | Some(Context::Workspace))
        || matches!(scope, Some(Context::Voyage { id }) if id == &request.voyage)
}

fn source<'layout>(layout: &'layout Layout, request: &Request) -> Result<&'layout str, String> {
    layout
        .voyages
        .iter()
        .find(|voyage| voyage.id == request.voyage)
        .and_then(|voyage| voyage.cwd.as_deref())
        .ok_or_else(|| "Source Voyage is unavailable".into())
}

pub(crate) fn decide(
    crowded: bool,
    fresh: bool,
    current: impl FnOnce() -> bool,
    scope: Option<&Context>,
    request: &Request,
) -> Result<(), String> {
    if crowded {
        return Err("A worktree operation is already pending".into());
    }
    if !fresh || !current() {
        return Err("Inspect the current workspace before using worktrees".into());
    }
    if !authorizes(scope, request) {
        return Err("The request's captured focus does not authorize this Voyage".into());
    }
    Ok(())
}

pub(crate) fn prepare(
    layout: &Arc<Layout>,
    scope: Option<&Context>,
    request: &Request,
) -> Result<(String, Vec<String>), String> {
    let voyage = layout
        .containers()
        .find(|voyage| voyage.id == request.voyage)
        .ok_or("Voyage not found")?;
    let directory = voyage
        .cwd
        .clone()
        .filter(|value| !value.is_empty())
        .ok_or("Voyage working directory is unavailable")?;
    if matches!(request.action, WorktreeAction::Create { .. }) {
        scope::check(
            layout,
            scope,
            &Action::CreateVoyage {
                name: "worktree".into(),
                cwd: directory.clone(),
            },
        )?;
    }
    Ok((directory, Vec::new()))
}

fn removal(
    cwd: &Path,
    path: &str,
    approve: impl FnOnce() -> Result<Vec<String>, String>,
) -> Result<Vec<Checkout>, Error> {
    let checkout = open(cwd, path)?;
    if checkout.main {
        return Err(Error::Rejected("Cannot remove the main checkout".into()));
    }
    let live = approve().map_err(Error::Rejected)?;
    check_live_directories(&checkout.path, &live)
        .map_err(|error| Error::Rejected(format!("{error:?}")))?;
    remove(cwd, &checkout.path)
}

pub(crate) fn run(
    request: &Request,
    directory: &str,
    live: &[String],
    approve: impl FnOnce() -> Result<Vec<String>, String>,
) -> Response {
    let cwd = Path::new(directory);
    let result = if let WorktreeAction::Remove { path } = &request.action {
        removal(cwd, path, approve)
    } else {
        execute(cwd, &request.action, live)
    };
    let (status, message, checkouts) = match result {
        Ok(checkouts) => (Status::Applied, None, checkouts),
        Err(Error::Rejected(message)) => (Status::Rejected, Some(message), Vec::new()),
        Err(Error::Uncertain(message)) => (Status::Uncertain, Some(message), Vec::new()),
    };
    Response {
        request_id: request.request_id.clone(),
        status,
        message,
        checkouts,
    }
}

pub(crate) fn confirm_removal(
    layout: &Layout,
    scope: Option<&Context>,
    request: &Request,
    source_directory: &str,
) -> Result<(), String> {
    if !authorizes(scope, request) {
        return Err("Captured focus no longer authorizes this Voyage".into());
    }
    let source = source(layout, request)?;
    let original = std::fs::canonicalize(source_directory).map_err(|error| error.to_string())?;
    let current = std::fs::canonicalize(source).map_err(|error| error.to_string())?;
    if original != current {
        return Err("Source Voyage directory changed; no worktree was removed".into());
    }
    Ok(())
}

pub(crate) fn moves_voyages(request: &Request, response: &Response) -> bool {
    response.status == Status::Applied
        && matches!(
            request.action,
            WorktreeAction::Create { .. }
                | WorktreeAction::Open { .. }
                | WorktreeAction::Remove { .. }
        )
}

pub(crate) fn plan(
    layout: &Arc<Layout>,
    scope: Option<&Context>,
    request: &Request,
    source_directory: &str,
    checkout: &Checkout,
) -> Result<Model, String> {
    let current_source = source(layout, request)?;
    let removing = matches!(request.action, WorktreeAction::Remove { .. });
    if removing {
        if current_source != source_directory {
            return Err("Source Voyage directory changed".into());
        }
    } else {
        let original = std::fs::canonicalize(source_directory)
            .map_err(|error| format!("Source directory unavailable: {error}"))?;
        let current = std::fs::canonicalize(current_source)
            .map_err(|error| format!("Current Voyage directory unavailable: {error}"))?;
        if original != current {
            return Err("Source Voyage directory changed".into());
        }
    }
    let mut candidate = Model {
        layout: (**layout).clone(),
    };
    let actions = if let WorktreeAction::Remove { path } = &request.action {
        candidate
            .layout
            .voyages
            .iter()
            .filter(|voyage| {
                voyage
                    .cwd
                    .as_ref()
                    .is_some_and(|cwd| Path::new(cwd).starts_with(path))
            })
            .map(|voyage| Action::CloseVoyage {
                id: voyage.id.clone(),
            })
            .collect::<Vec<_>>()
    } else {
        vec![crate::workspace::open_checkout(
            &candidate.layout,
            &checkout.path,
        )?]
    };
    for action in actions {
        scope::check(layout, scope, &action)?;
        candidate.apply(action)?;
    }
    Ok(candidate)
}

pub(crate) fn completed(mut response: Response, completion: Result<(), String>) -> Arc<Response> {
    if let Err(error) = completion {
        response.status = Status::Uncertain;
        response.message = Some(format!(
            "Git completed, but updating its Voyage was not confirmed: {error}. Inspect the checkout and workspace; do not repeat creation."
        ));
    }
    Arc::new(response)
}
