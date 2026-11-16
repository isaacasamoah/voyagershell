use crate::core::{Core, Error, LayoutKeep, Pending};
use crate::core_shapes::{DocGetResult, DocSetResult};
use crate::workspace::Model;
use serde_json::Value;
use voyager_contract::layout_document::{
    BACKUP, DOCUMENT, Kept, LEGACY_DOCUMENT, READER_LEVEL, Reading, import_legacy, read, write,
};
use voyager_contract::{Action, Layout, Outcome, Response};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct LayoutRevision {
    pub(crate) document: u64,
    pub(crate) structure: u64,
}

impl LayoutRevision {
    pub(crate) fn after(self, document: u64, before: &Layout, after: &Layout) -> Self {
        Self {
            document,
            structure: if before.same_structure(after) {
                self.structure
            } else {
                document
            },
        }
    }

    fn structural(document: u64) -> Self {
        Self {
            document,
            structure: document,
        }
    }
}

pub(crate) fn rejected(message: String) -> Error {
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

pub(crate) fn load(
    core: &mut Core,
    cwd: &str,
    held: &Layout,
    revision: LayoutRevision,
) -> Result<(Layout, LayoutRevision, bool), Error> {
    let document = core.document_get(DOCUMENT)?;
    let version = document.version;
    let observed = |layout: &Layout| revision.after(version, held, layout);
    let (source, value, imported) = if document.value.is_null() {
        let legacy = core.document_get(LEGACY_DOCUMENT)?;
        if legacy.value.is_null() {
            core.layout = LayoutKeep::default();
            let layout = Layout::default();
            let revision = observed(&layout);
            return Ok((layout, revision, true));
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
                let revision = save(core, &layout, LayoutRevision::structural(version))?;
                return Ok((layout, revision, false));
            }
            let revision = observed(&layout);
            Ok((layout, revision, false))
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
            Ok((Layout::default(), LayoutRevision::structural(version), true))
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

pub(crate) fn save(
    core: &mut Core,
    layout: &Layout,
    revision: LayoutRevision,
) -> Result<LayoutRevision, Error> {
    match begin_save(core, layout, revision)?.wait() {
        Err(Error::Uncertain(message)) => {
            settle_save(core, layout, revision, message).map(LayoutRevision::structural)
        }
        saved => Ok(LayoutRevision::structural(saved?.version)),
    }
}

pub(crate) fn begin_save(
    core: &mut Core,
    layout: &Layout,
    revision: LayoutRevision,
) -> Result<Pending<DocSetResult>, Error> {
    let value = written(core, layout)?;
    core.begin_document_set(DOCUMENT, &value, revision.document)
}

pub(crate) fn settle_save(
    core: &mut Core,
    layout: &Layout,
    revision: LayoutRevision,
    message: String,
) -> Result<u64, Error> {
    let value = written(core, layout)?;
    let read = |core: &mut Core| match core.document_get(DOCUMENT) {
        Ok(read) => landing(&read, &value, revision.document),
        Err(_) => Landing::Unknown,
    };
    let unsettled = || Error::Uncertain(format!("{message}; a read of Core did not settle it"));
    match read(core) {
        Landing::Applied(saved) => Ok(saved),
        Landing::Unknown => Err(unsettled()),
        Landing::Missing => match core
            .begin_document_set(DOCUMENT, &value, revision.document)?
            .wait()
        {
            Err(Error::Rejected { kind, .. }) if kind == "conflict" => match read(core) {
                Landing::Applied(saved) => Ok(saved),
                _ => Err(unsettled()),
            },
            retried => Ok(retried?.version),
        },
    }
}

#[derive(Debug, Eq, PartialEq)]
enum Landing {
    Applied(u64),
    Missing,
    Unknown,
}

fn landing(read: &DocGetResult, written: &Value, expected: u64) -> Landing {
    if read.version == expected {
        Landing::Missing
    } else if read.version > expected && read.value == *written {
        Landing::Applied(read.version)
    } else {
        Landing::Unknown
    }
}

fn written(core: &Core, layout: &Layout) -> Result<Value, Error> {
    write(layout, &core.layout.kept).map_err(|error| Error::Rejected {
        kind: "invalid".into(),
        message: error.to_string(),
    })
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

    fn document(version: u64, value: Value) -> DocGetResult {
        DocGetResult { value, version }
    }

    #[test]
    fn a_read_settles_an_unconfirmed_save_without_doubling_it() {
        let ours = serde_json::json!({"name": "Held Fleet"});
        let theirs = serde_json::json!({"name": "Other"});
        assert_eq!(
            landing(&document(8, ours.clone()), &ours, 7),
            Landing::Applied(8)
        );
        assert_eq!(
            landing(&document(7, theirs.clone()), &ours, 7),
            Landing::Missing
        );
        assert_eq!(landing(&document(8, theirs), &ours, 7), Landing::Unknown);
        assert_eq!(
            landing(&document(6, ours.clone()), &ours, 7),
            Landing::Unknown
        );
    }

    #[test]
    fn only_a_structural_save_moves_the_structure_revision() {
        let held = LayoutRevision {
            document: 4,
            structure: 2,
        };
        let before = Layout::default();
        let mut navigated = before.clone();
        navigated.selected_voyage = Some(voyager_contract::VoyageId("voyage-1".into()));
        navigated.context = voyager_contract::Context::Voyage {
            id: voyager_contract::VoyageId("voyage-1".into()),
        };
        assert_eq!(
            held.after(5, &before, &navigated),
            LayoutRevision {
                document: 5,
                structure: 2
            }
        );
        let mut restructured = navigated.clone();
        restructured.next_id += 1;
        assert_eq!(
            held.after(6, &before, &restructured),
            LayoutRevision {
                document: 6,
                structure: 6
            }
        );
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
