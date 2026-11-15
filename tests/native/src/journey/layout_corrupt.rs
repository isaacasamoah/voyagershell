use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::Native;
use anyhow::Result;
use voyager_contract::layout_document::{BACKUP, DOCUMENT, Reading, read};

cases! {
    NoticeDrawn => "corrupt-layout-notice-drawn",
    CorruptLayoutBackedUp => "corrupt-layout-copied-to-backup",
    WorkspaceStartsFresh => "workspace-starts-fresh",
}

pub const CONTROL: Case = Case::CorruptLayoutBackedUp;

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let seeded = native.seeded_document(DOCUMENT)?.clone();
    cases.check(native, Case::NoticeDrawn, |native| {
        native.observe("the fresh workspace drawn", |seen| {
            seen.shows(&Target::SIDEBAR_TOGGLE).then_some(())
        })?;
        let drawn = native.screen_status("the notice in the status line", |label| {
            label.contains("could not be read") && label.contains(BACKUP)
        })?;
        Verdict::new()
            .expect(
                "after the fresh workspace is drawn, the status line on screen still says the stored layout could not be read and names the backup",
                !drawn.is_empty(),
            )
            .observed("status line", drawn)
    })?;
    cases.check(native, Case::CorruptLayoutBackedUp, |native| {
        let backup = native.watch(|native| {
            Ok(native
                .core_document(BACKUP)?
                .filter(|(_, value)| *value == seeded.1))
        })?;
        Ok(Verdict::new().expect(
            "the app copies the unreadable layout to the backup document",
            backup.is_some(),
        ))
    })?;
    cases.check(native, Case::WorkspaceStartsFresh, |native| {
        native.close()?;
        let fresh = native.watch(|native| {
            Ok(native
                .core_document(DOCUMENT)?
                .filter(|(version, _)| *version > seeded.0))
        })?;
        let voyages = fresh
            .as_ref()
            .and_then(|(_, value)| match read(value.clone()) {
                Reading::Open { layout, .. } => Some(layout.voyages.len()),
                _ => None,
            });
        Verdict::new()
            .expect(
                "the app replaces the unreadable layout with one it can read",
                voyages.is_some(),
            )
            .expect(
                "the fresh workspace holds a Voyage",
                voyages.unwrap_or(0) > 0,
            )
            .observed("voyages", voyages)
    })
}
