use crate::content::{Access, Owner, requests as family};
use crate::core::Core;
use crate::core::Error;
use crate::layout_parts::Part;
use crate::layout_store::{LayoutRevision, Seen, save};
use std::sync::Arc;
use voyager_contract::{
    Layout,
    content::{Request, Response},
};

pub(super) fn select_note(
    core: &mut Core,
    (layout, version, fresh): (&mut Arc<Layout>, &mut LayoutRevision, &mut bool),
    seen: &Seen,
    owner: &mut Owner,
    access: &Access,
    request: &Request,
) -> Response {
    let selected = match family::select(
        owner,
        layout,
        version.structure,
        access,
        request,
        |expected, id| {
            seen.current(expected, *version, layout, || {
                Some(vec![Part::Vessel(id.clone())])
            })
        },
    ) {
        Ok(selected) => selected,
        Err(refusal) => {
            if refusal.stale {
                *fresh = false;
            }
            return refusal.response;
        }
    };
    match save(core, &selected.candidate, *version) {
        Ok(revision) => {
            let response = selected.opened(revision.structure);
            *layout = Arc::new(selected.candidate);
            *version = revision;
            response
        }
        Err(error) => {
            *fresh = false;
            selected.unconfirmed(&error)
        }
    }
}

pub(super) fn configure(
    core: &mut Core,
    (layout, version, fresh): (&mut Arc<Layout>, &mut LayoutRevision, &mut bool),
    seen: &Seen,
    owner: &mut Owner,
    access: &Access,
    request: &Request,
) -> Response {
    let configured = match family::configure(
        owner,
        layout,
        version.structure,
        access,
        request,
        |expected, id| {
            seen.current(expected, *version, layout, || {
                Some(vec![Part::Vessel(id.clone())])
            })
        },
    ) {
        Ok(configured) => configured,
        Err(response) => return *response,
    };
    match save(core, &configured.candidate, *version) {
        Ok(revision) => {
            let response = configured.applied(revision.structure);
            *layout = Arc::new(configured.candidate);
            *version = revision;
            response
        }
        Err(error) => {
            *fresh = false;
            match error {
                Error::Rejected { kind, message } => {
                    configured.refused(request, format!("{kind}: {message}"))
                }
                Error::Uncertain(message) => configured.uncertain(message),
            }
        }
    }
}
