use super::*;
use std::time::SystemTime;

fn profile(name: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("voyager-install-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&path);
    fs::create_dir_all(&path).unwrap();
    path
}

fn ship<'a>(path: &'a str, bytes: &'a [u8]) -> Shipped<'a> {
    Shipped {
        path,
        bytes,
        absent: Absent::Write,
    }
}

fn stamp(path: &Path) -> SystemTime {
    fs::metadata(path).unwrap().modified().unwrap()
}

#[test]
fn a_file_is_judged_by_its_record_then_by_the_versions_shipped_before_records() {
    let (old, new) = (fingerprint(b"old"), fingerprint(b"new"));
    assert_eq!(classify(None, new, Some(old), false), Stance::Absent);
    assert_eq!(classify(Some(new), new, None, false), Stance::Current);
    assert_eq!(
        classify(Some(old), new, Some(old), false),
        Stance::Untouched
    );
    assert_eq!(classify(Some(old), new, None, true), Stance::Untouched);
    assert_eq!(classify(Some(old), new, None, false), Stance::Unrecorded);
    let mine = fingerprint(b"mine");
    assert_eq!(
        classify(Some(mine), new, Some(old), true),
        Stance::Edited { installed: old }
    );
}

#[test]
fn an_untouched_file_updates_and_an_edited_one_stays_active_with_a_diff() {
    let root = profile("update");
    install(&root, &[ship("a.js", b"a1\n"), ship("b.js", b"b1\n")]).unwrap();
    fs::write(root.join("b.js"), "b mine\n").unwrap();
    let notices = install(&root, &[ship("a.js", b"a2\n"), ship("b.js", b"b2\n")])
        .unwrap()
        .updates;
    assert_eq!(fs::read(root.join("a.js")).unwrap(), b"a2\n");
    assert_eq!(fs::read(root.join("b.js")).unwrap(), b"b mine\n");
    assert_eq!(notices.len(), 1);
    assert_eq!(notices[0].path, "b.js");
    assert_eq!(notices[0].reason, Reason::Edited);
    assert!(notices[0].diff.contains("-b mine\n+b2\n"));
    assert_eq!(
        fs::read_to_string(&notices[0].diff_file).unwrap(),
        notices[0].diff
    );
    assert!(!root.join("b.js.edited").exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn a_second_start_writes_nothing() {
    let root = profile("idempotent");
    let files = [ship("a.js", b"a1\n"), ship("b.js", b"b1\n")];
    install(&root, &files).unwrap();
    fs::write(root.join("b.js"), "mine\n").unwrap();
    let again = [ship("a.js", b"a2\n"), ship("b.js", b"b2\n")];
    install(&root, &again).unwrap();
    let paths = ["a.js", "b.js", "installed.json", "updates/b.js.diff"];
    let before = paths.map(|path| (fs::read(root.join(path)).unwrap(), stamp(&root.join(path))));
    let second = install(&root, &again).unwrap().updates;
    let after = paths.map(|path| (fs::read(root.join(path)).unwrap(), stamp(&root.join(path))));
    assert_eq!(before, after);
    assert_eq!(second.len(), 1);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn an_edit_with_no_record_is_kept_and_flagged_and_gets_no_record() {
    let root = profile("unrecorded");
    fs::write(root.join("a.js"), "mine\n").unwrap();
    let notices = install(&root, &[ship("a.js", b"a1\n")]).unwrap().updates;
    assert_eq!(fs::read(root.join("a.js")).unwrap(), b"mine\n");
    assert_eq!(notices[0].reason, Reason::Unrecorded);
    let record = fs::read_to_string(root.join(RECORD)).unwrap();
    assert!(!record.contains("a.js"));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn an_edited_file_is_kept_whether_or_not_a_newer_version_ships() {
    let root = profile("kept");
    let files = [ship("a.js", b"a1\n"), ship("b.js", b"b1\n")];
    let first = install(&root, &files).unwrap();
    assert!(first.kept.is_empty());
    fs::write(root.join("a.js"), "a mine\n").unwrap();
    fs::write(root.join("b.js"), "b mine\n").unwrap();
    let same = install(&root, &files).unwrap();
    assert!(same.updates.is_empty());
    assert_eq!(same.kept, ["a.js", "b.js"]);
    let newer = install(&root, &[ship("a.js", b"a1\n"), ship("b.js", b"b2\n")]).unwrap();
    assert_eq!(newer.updates.len(), 1);
    assert_eq!(newer.updates[0].path, "b.js");
    assert_eq!(newer.kept, ["a.js", "b.js"]);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn the_history_holds_the_versions_shipped_before_records() {
    let table = history();
    assert!(table.iter().all(|(path, _)| plain(path)));
    assert!(table.contains(&("canvas/AGENTS.md", 0x0ef4_64fd_ceb3_f66d)));
}

#[test]
fn an_unrecorded_file_equal_to_the_new_version_gets_its_record() {
    let root = profile("adopt");
    fs::write(root.join("a.js"), "a1\n").unwrap();
    assert_eq!(
        install(&root, &[ship("a.js", b"a1\n")]).unwrap(),
        Installed::default()
    );
    assert!(
        fs::read_to_string(root.join(RECORD))
            .unwrap()
            .contains("a.js")
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn a_dropped_file_is_deleted_only_when_untouched() {
    let root = profile("dropped");
    install(
        &root,
        &[
            ship("a.js", b"a\n"),
            ship("b.js", b"b\n"),
            ship("c.js", b"c\n"),
        ],
    )
    .unwrap();
    fs::write(root.join("b.js"), "mine\n").unwrap();
    install(&root, &[ship("c.js", b"c\n")]).unwrap();
    assert!(!root.join("a.js").exists());
    assert_eq!(fs::read(root.join("b.js")).unwrap(), b"mine\n");
    assert!(root.join("c.js").exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn a_record_cannot_name_a_file_outside_the_profile() {
    let root = profile("escape");
    let outside = root.join("outside.txt");
    fs::write(&outside, "keep").unwrap();
    let inner = root.join("inner");
    fs::create_dir_all(&inner).unwrap();
    let hash = format!("{:016x}", fingerprint(b"keep"));
    fs::write(
        inner.join(RECORD),
        format!("{{\"version\":1,\"files\":{{\"../outside.txt\":\"{hash}\"}}}}"),
    )
    .unwrap();
    install(&inner, &[]).unwrap();
    assert!(outside.exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn a_file_changed_during_the_swap_is_put_back_and_kept() {
    let root = profile("race");
    let target = root.join("a.js");
    fs::write(&target, "edited a moment ago\n").unwrap();
    let swap = replace(&target, b"new\n", fingerprint(b"what was judged\n")).unwrap();
    assert_eq!(swap, Swap::Changed);
    assert_eq!(fs::read(&target).unwrap(), b"edited a moment ago\n");
    let strays = fs::read_dir(&root).unwrap().count();
    assert_eq!(strays, 1);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn a_missing_file_of_a_kept_package_is_not_repaired_and_a_removed_one_stays_recorded() {
    let root = profile("keep");
    install(&root, &[ship("p/a.js", b"a\n")]).unwrap();
    fs::remove_file(root.join("p/a.js")).unwrap();
    let keep = [Shipped {
        absent: Absent::Keep,
        ..ship("p/a.js", b"a\n")
    }];
    install(&root, &keep).unwrap();
    assert!(!root.join("p/a.js").exists());
    assert!(
        fs::read_to_string(root.join(RECORD))
            .unwrap()
            .contains("p/a.js")
    );
    fs::remove_dir_all(root).unwrap();
}
