use super::{Cases, Verdict, cases};
use crate::native::Native;
use anyhow::Result;
use voyager_contract::layout_document::{BACKUP, DOCUMENT};

cases! {
    RefusalDrawn => "refusal-message-drawn",
    NewerLayoutBackedUp => "newer-layout-copied-to-backup",
    NewerLayoutUntouched => "newer-layout-left-unchanged",
}

pub const CONTROL: Case = Case::RefusalDrawn;

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let seeded = native.seeded_document(DOCUMENT)?.clone();
    cases.check(native, Case::RefusalDrawn, |native| {
        let drawn = native.screen_status("the refusal message in the status line", |label| {
            label.contains("needs reader level") && label.contains(BACKUP)
        })?;
        Verdict::new()
            .expect(
                "the status line on screen says the layout needs a newer build and names the backup",
                !drawn.is_empty(),
            )
            .observed("status line", drawn)
    })?;
    cases.check(native, Case::NewerLayoutBackedUp, |native| {
        let backup = native.watch(|native| {
            Ok(native
                .core_document(BACKUP)?
                .filter(|(_, value)| *value == seeded.1))
        })?;
        Ok(Verdict::new().expect(
            "the app copies the layout that needs a newer build to the backup document",
            backup.is_some(),
        ))
    })?;
    cases.check(native, Case::NewerLayoutUntouched, |native| {
        native.close()?;
        let kept = native.core_document(DOCUMENT)?;
        Verdict::new()
            .expect(
                "the layout that needs a newer build is still in Core at its seeded version after the app quits",
                kept.as_ref() == Some(&seeded),
            )
            .observed("seededVersion", seeded.0)?
            .observed("keptVersion", kept.map(|(version, _)| version))
    })
}
