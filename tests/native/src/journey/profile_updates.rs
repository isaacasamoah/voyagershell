use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::Native;
use anyhow::Result;
use serde_json::json;
use std::{collections::BTreeMap, fs, path::Path, time::SystemTime};

cases! {
    Untouched => "untouched-files-update-and-stop-session-shows",
    Edited => "edited-files-stay-as-they-were",
    Announced => "edited-files-are-announced-with-a-diff",
    Dropped => "a-dropped-file-is-deleted-only-when-untouched",
    SecondStart => "a-second-start-changes-no-file",
    KeptEditDraws => "kept-edit-that-cannot-load-still-draws",
}

pub const CONTROL: Case = Case::Edited;

const OLD_GUIDE: &str = "canvas/AGENTS.md";
const OLD_NAVIGATION: &str = "canvas/navigation-view.js";
const EDITED_RECORDED: &str = "canvas/icons-LICENSE.txt";
const EDITED_UNRECORDED: &str = "canvas/icons-NOTICE.txt";
const RETIRED: &str = "canvas/retired.js";
const RETIRED_EDITED: &str = "canvas/retired-edited.js";
const KEPT_CANVAS: &str = "canvas/status.js";
const KEPT_CANVAS_BYTES: &[u8] = b"import \"retired_theme\";\n";
const DIFF: &str = "updates/canvas__icons-LICENSE.txt.diff";

type Tree = BTreeMap<String, (Vec<u8>, SystemTime)>;

fn tree(native: &Native) -> Result<Tree> {
    let mut found = Tree::new();
    for root in ["canvas", "themes", "vessels", "updates", "installed.json"] {
        walk(&native.profile_path(""), Path::new(root), &mut found)?;
    }
    Ok(found)
}

fn walk(base: &Path, relative: &Path, found: &mut Tree) -> Result<()> {
    let path = base.join(relative);
    let Ok(meta) = fs::metadata(&path) else {
        return Ok(());
    };
    if meta.is_dir() {
        for entry in fs::read_dir(&path)? {
            walk(base, &relative.join(entry?.file_name()), found)?;
        }
    } else {
        found.insert(
            relative.to_string_lossy().into_owned(),
            (fs::read(&path)?, meta.modified()?),
        );
    }
    Ok(())
}

fn announced(native: &Native) -> Result<(bool, bool, bool)> {
    native.settle(
        "the notice for the edited profile files",
        |seen| {
            Some((
                seen.shows(&Target::profile_update(EDITED_RECORDED)),
                seen.shows(&Target::profile_update(EDITED_UNRECORDED)),
                seen.shows(&Target::profile_update(OLD_GUIDE)),
            ))
        },
        |(recorded, unrecorded, _)| *recorded && *unrecorded,
    )
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    cases.check(native, Case::Untouched, |native| {
        let guide = !native.seeded_intact(OLD_GUIDE)?;
        let navigation = !native.seeded_intact(OLD_NAVIGATION)?;
        native.context_click(&Target::HOME)?;
        let menu = native.observe("the Home menu with Stop session", |seen| {
            seen.shows(&Target::STOP_SESSION).then_some(())
        });
        Ok(Verdict::new()
            .expect(
                "an untouched file that matches its record is replaced",
                guide,
            )
            .expect(
                "an untouched file that matches a version shipped before records is replaced",
                navigation,
            )
            .expect("the Home menu offers Stop session", menu.is_ok()))
    })?;
    cases.check(native, Case::Edited, |native| {
        let recorded = native.seeded_intact(EDITED_RECORDED)?;
        let unrecorded = native.seeded_intact(EDITED_UNRECORDED)?;
        let retired = native.seeded_intact(RETIRED_EDITED)?;
        let aside = ["-edited", "-edited-2"].iter().any(|suffix| {
            native
                .profile_path(&format!("{EDITED_RECORDED}{suffix}"))
                .exists()
        });
        Ok(Verdict::new()
            .expect(
                "an edited file with a record is byte for byte as it was",
                recorded,
            )
            .expect(
                "an edited file with no record is byte for byte as it was",
                unrecorded,
            )
            .expect("an edited file the app no longer ships is kept", retired)
            .expect("no edited file is moved aside", !aside))
    })?;
    cases.check(native, Case::Announced, |native| {
        let (recorded, unrecorded, guide) = announced(native)?;
        let diff = fs::read_to_string(native.profile_path(DIFF)).unwrap_or_default();
        Verdict::new()
            .expect("the app announces the edited file with a record", recorded)
            .expect(
                "the app announces the edited file with no record",
                unrecorded,
            )
            .expect("the app does not announce the untouched file", !guide)
            .expect(
                "the diff file names the person's line and the new version",
                diff.contains("-My own licence note.\n") && diff.contains("(new version)"),
            )
            .observed("diff", diff)
    })?;
    cases.check(native, Case::Dropped, |native| {
        Ok(Verdict::new()
            .expect(
                "an untouched file the app no longer ships is deleted",
                !native.profile_path(RETIRED).exists(),
            )
            .expect(
                "an edited file the app no longer ships stays",
                native.profile_path(RETIRED_EDITED).exists(),
            ))
    })?;
    cases.check(native, Case::SecondStart, |native| {
        let first = tree(native)?;
        native.close()?;
        native.launch()?;
        announced(native)?;
        let second = tree(native)?;
        let changed = first
            .iter()
            .filter(|(path, held)| second.get(*path) != Some(held))
            .map(|(path, _)| path.clone())
            .chain(
                second
                    .keys()
                    .filter(|path| !first.contains_key(*path))
                    .cloned(),
            )
            .collect::<Vec<_>>();
        Verdict::new()
            .expect(
                "no first-party profile file changes in content or time on a second start",
                changed.is_empty() && !first.is_empty(),
            )
            .observed("changed", json!(changed))?
            .observed("files", first.len())
    })?;
    cases.check(native, Case::KeptEditDraws, |native| {
        native.close()?;
        native.edit_profile_file(KEPT_CANVAS, KEPT_CANVAS_BYTES)?;
        native.launch()?;
        let drawn = native.observe(
            "the workspace drawn with a kept file that cannot load",
            |seen| seen.shows(&Target::HOME).then_some(()),
        );
        let status = native
            .observe("the host status line", |seen| {
                seen.label(&Target::HOST_STATUS).map(str::to_owned)
            })
            .unwrap_or_default();
        let notice = native.settle(
            "the update notice for the other edited files",
            |seen| {
                Some((
                    seen.shows(&Target::profile_update(EDITED_RECORDED)),
                    seen.shows(&Target::profile_update(KEPT_CANVAS)),
                ))
            },
            |(recorded, _)| *recorded,
        );
        let no_newer_version = matches!(notice, Ok((true, false)));
        let listed = status
            .lines()
            .any(|line| line == format!("Your edited file is kept: {KEPT_CANVAS}"));
        let names_text = status.lines().any(|line| {
            line.strip_prefix("Your edited file is kept: ")
                .is_some_and(|path| path.ends_with(".txt"))
        });
        let engine_names_file = status
            .lines()
            .filter(|line| !line.starts_with("Your edited file is kept: "))
            .any(|line| line.contains("status.js"));
        let kept = fs::read(native.profile_path(KEPT_CANVAS)).ok();
        Verdict::new()
            .expect(
                "the workspace is drawn although a kept first-party file cannot load",
                drawn.is_ok(),
            )
            .expect(
                "the kept canvas file has no newer shipped version, so the update notice does not list it",
                no_newer_version,
            )
            .expect(
                "the status line has the line Your edited file is kept: canvas/status.js",
                listed,
            )
            .expect(
                "the status line names no text file, which the canvas never loads",
                !names_text,
            )
            .observed("engineNamesFile", engine_names_file)?
            .expect(
                "the kept file stays on disk byte for byte as the person left it",
                kept.as_deref() == Some(KEPT_CANVAS_BYTES),
            )
            .observed("status", status)
    })
}
