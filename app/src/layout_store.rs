use crate::core::{Core, Error, LayoutKeep, Pending};
use crate::core_shapes::DocSetResult;
use crate::workspace::Model;
use serde_json::Value;
use voyager_contract::layout_document::{
    BACKUP, DOCUMENT, Kept, LEGACY_DOCUMENT, READER_LEVEL, Reading, import_legacy, read, write,
};
use voyager_contract::{Action, Layout, Outcome, Response};

fn rejected(message: String) -> Error {
    Error::Rejected {
        kind: "invalid_workspace".into(),
        message,
    }
}

fn back_up(core: &mut Core, name: &str) -> Result<(), Error> {
    let original = core.document_get(name)?.value;
    let backup = core.document_get(BACKUP)?;
    if backup.value == original {
        return Ok(());
    }
    core.document_set(BACKUP, &original, backup.version)?;
    Ok(())
}

fn prepared(layout: Layout, cwd: &str) -> Result<Layout, String> {
    crate::canvas::validate(&layout.canvas)?;
    let mut layout = Model::prepare(layout, cwd)?;
    crate::content::rename::synchronize_labels(&mut layout);
    Ok(layout)
}

pub(crate) fn load(core: &mut Core, cwd: &str) -> Result<(Layout, u64, bool), Error> {
    let document = core.document_get(DOCUMENT)?;
    let version = document.version;
    let (source, value, imported) = if document.value.is_null() {
        let legacy = core.document_get(LEGACY_DOCUMENT)?;
        if legacy.value.is_null() {
            core.layout = LayoutKeep::default();
            return Ok((Layout::default(), version, true));
        }
        (LEGACY_DOCUMENT, import_legacy(legacy.value), true)
    } else {
        (DOCUMENT, document.value, false)
    };
    match read(value) {
        Reading::Open { layout, kept } => {
            let layout = match prepared(*layout, cwd) {
                Ok(layout) => layout,
                Err(error) => {
                    back_up(core, source)?;
                    return Err(rejected(format!(
                        "Stored workspace is invalid: {error}. A copy is in {BACKUP}; nothing was changed"
                    )));
                }
            };
            let notice = core.layout.notice.take();
            core.layout = LayoutKeep { kept, notice };
            if imported {
                let version = save(core, &layout, version)?;
                return Ok((layout, version, false));
            }
            Ok((layout, version, false))
        }
        Reading::Newer { min_reader } => {
            back_up(core, source)?;
            Err(rejected(format!(
                "The stored workspace was written by a newer build that needs reader level {min_reader}; this build reads level {READER_LEVEL}. Nothing was changed and a copy is in {BACKUP}"
            )))
        }
        Reading::Unreadable { message } => {
            back_up(core, source)?;
            core.layout = LayoutKeep {
                kept: Kept::default(),
                notice: Some(format!(
                    "The stored workspace could not be read ({message}). A copy is in {BACKUP} and the workspace started fresh"
                )),
            };
            Ok((Layout::default(), version, true))
        }
    }
}

pub(crate) fn carry_notice(notice: &mut Option<String>, action: &Action, response: &mut Response) {
    if response.status == Outcome::Applied && !matches!(action, Action::Inspect) {
        *notice = None;
    } else if response.message.is_none() {
        response.message.clone_from(notice);
    }
}

pub(crate) fn save(core: &mut Core, layout: &Layout, version: u64) -> Result<u64, Error> {
    Ok(begin_save(core, layout, version)?.wait()?.version)
}

pub(crate) fn begin_save(
    core: &mut Core,
    layout: &Layout,
    version: u64,
) -> Result<Pending<DocSetResult>, Error> {
    let value: Value = write(layout, &core.layout.kept).map_err(|error| Error::Rejected {
        kind: "invalid".into(),
        message: error.to_string(),
    })?;
    core.begin_document_set(DOCUMENT, &value, version)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    const NOTICE: &str = "copy kept";

    fn response(status: Outcome, message: Option<&str>) -> Response {
        Response {
            request_id: "r".into(),
            status,
            version: 1,
            layout: Arc::new(Layout::default()),
            fresh: false,
            created_workspace: false,
            created_vessels: Vec::new(),
            message: message.map(Into::into),
            close_plan: None,
        }
    }

    fn held() -> Option<String> {
        Some(NOTICE.into())
    }

    #[test]
    fn an_inspect_response_carries_the_notice_and_leaves_it_held() {
        let mut notice = held();
        let mut reply = response(Outcome::Applied, None);
        carry_notice(&mut notice, &Action::Inspect, &mut reply);
        assert_eq!(reply.message.as_deref(), Some(NOTICE));
        assert_eq!(notice, held());
    }

    #[test]
    fn a_refused_or_unconfirmed_response_without_a_message_carries_the_notice() {
        for status in [Outcome::Refused, Outcome::Uncertain] {
            let mut notice = held();
            let mut reply = response(status, None);
            carry_notice(&mut notice, &Action::Home, &mut reply);
            assert_eq!(reply.message.as_deref(), Some(NOTICE));
            assert_eq!(notice, held());
        }
    }

    #[test]
    fn a_message_of_the_responses_own_is_never_replaced() {
        let mut notice = held();
        let mut reply = response(Outcome::Refused, Some("refused"));
        carry_notice(&mut notice, &Action::Home, &mut reply);
        assert_eq!(reply.message.as_deref(), Some("refused"));
        assert_eq!(notice, held());
    }

    #[test]
    fn an_applied_change_clears_the_notice_and_does_not_carry_it() {
        let mut notice = held();
        let mut reply = response(Outcome::Applied, None);
        carry_notice(&mut notice, &Action::Home, &mut reply);
        assert_eq!(reply.message, None);
        assert_eq!(notice, None);
    }
}
