use voyager_app::client::CallError;
use voyager_contract::content::{Response, Snapshot};

#[derive(Clone, Copy)]
pub enum Field {
    Title,
    Text,
}

#[derive(Default)]
pub struct Draft {
    pub generation: u64,
    pub revision: Option<String>,
    pub dirty: bool,
    pub status: String,
    touched: [bool; 2],
    saving: bool,
    pending_blur: Option<u64>,
    unconfirmed: Option<u64>,
}

pub struct Save {
    pub generation: u64,
    pub revision: String,
}

impl Draft {
    pub fn changed(&mut self, field: Field) {
        self.touched[match field {
            Field::Title => 0,
            Field::Text => 1,
        }] = true;
        self.generation = self.generation.saturating_add(1);
        self.dirty = true;
    }

    pub fn load(
        &mut self,
        snapshot: &Snapshot,
        generation: u64,
        revision: Option<&str>,
    ) -> [bool; 2] {
        if self.revision.is_some()
            && (self.dirty || generation != self.generation || revision != self.revision.as_deref())
        {
            self.status = [
                snapshot.warning.as_deref().unwrap_or_default(),
                if Some(snapshot.revision.as_str()) != self.revision.as_deref() {
                    "Notes changed outside this draft. Its original revision is retained."
                } else {
                    ""
                },
            ]
            .into_iter()
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
            return [false, false];
        }
        self.revision = Some(snapshot.revision.clone());
        self.status = snapshot.warning.clone().unwrap_or_default();
        [
            !self.dirty || !self.touched[0],
            !self.dirty || !self.touched[1],
        ]
    }

    pub fn blur(&mut self) -> Option<Save> {
        if !self.dirty || self.unconfirmed == Some(self.generation) {
            return None;
        }
        let Some(revision) = self.revision.clone().filter(|_| !self.saving) else {
            self.pending_blur = Some(self.generation);
            return None;
        };
        self.pending_blur = None;
        self.saving = true;
        Some(Save {
            generation: self.generation,
            revision,
        })
    }

    pub fn finish(&mut self, generation: u64, response: Result<&Response, &CallError>) -> bool {
        let mut applied = false;
        match response {
            Ok(Response::Applied { snapshot, .. }) => {
                self.revision = Some(snapshot.revision.clone());
                applied = true;
                if self.generation == generation {
                    self.dirty = false;
                    self.status = "Saved".into();
                }
            }
            Ok(Response::Rejected { message, .. }) => self.status = message.clone(),
            Err(CallError::Rejected(message)) => self.status = message.clone(),
            other => {
                self.unconfirmed = Some(generation);
                self.status = match other {
                    Ok(Response::Uncertain { message, .. }) => message.clone(),
                    Err(CallError::Unconfirmed(error)) => error.clone(),
                    _ => "Save unconfirmed".into(),
                };
            }
        }
        self.saving = false;
        applied && self.pending() && self.dirty
    }

    pub fn pending(&self) -> bool {
        self.pending_blur == Some(self.generation)
    }

    pub fn retire(&mut self) {
        self.pending_blur = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use voyager_contract::{
        ContentId,
        content::{Notes, Version},
    };

    #[test]
    fn retained_draft_keeps_original_base_and_never_replays_unknown_save() {
        let mut snapshot = Snapshot {
            content_id: ContentId("note".into()),
            revision: "original".into(),
            data: Notes {
                title: "Title".into(),
                text: "Body".into(),
            },
            warning: None,
        };
        let mut draft = Draft::default();
        let mut initial = Draft::default();
        initial.changed(Field::Title);
        assert!(initial.blur().is_none());
        assert!(initial.pending());
        assert_eq!(initial.load(&snapshot, 0, None), [false, true]);
        assert_eq!(initial.revision.as_deref(), Some("original"));
        assert!(initial.blur().is_some());
        assert_eq!(draft.load(&snapshot, 0, None), [true, true]);
        draft.changed(Field::Title);
        snapshot.revision = "outside".into();
        assert_eq!(draft.load(&snapshot, 1, Some("original")), [false, false]);
        assert_eq!(draft.revision.as_deref(), Some("original"));
        let save = draft.blur().unwrap();
        draft.retire();
        let rejected = Response::Rejected {
            version: Version::V1,
            request_id: "save".into(),
            content_id: snapshot.content_id.clone(),
            expected_revision: Some(save.revision.clone()),
            message: "Known refusal".into(),
        };
        assert!(!draft.finish(save.generation, Ok(&rejected)));
        let retry = draft.blur().unwrap();
        assert!(!draft.finish(
            retry.generation,
            Err(&CallError::Rejected("Not queued".into()))
        ));
        let retry = draft.blur().unwrap();
        assert!(!draft.finish(
            retry.generation,
            Err(&CallError::Unconfirmed("Lost confirmation".into()))
        ));
        assert!(draft.blur().is_none());
        draft.changed(Field::Text);
        let new_save = draft.blur().unwrap();
        draft.retire();
        let applied = Response::Applied {
            version: Version::V1,
            request_id: "new-save".into(),
            content_id: snapshot.content_id.clone(),
            snapshot,
        };
        assert!(!draft.finish(new_save.generation, Ok(&applied)));
        assert!(!draft.dirty);
        assert_eq!(draft.status, "Saved");
    }
}
