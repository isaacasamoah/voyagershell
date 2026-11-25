use super::*;
use std::os::unix::fs::PermissionsExt;

struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let path =
            std::env::temp_dir().join(format!("voyager-install-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn source(root: &Path, label: &str, version_exit: u8) -> PathBuf {
    let folder = root.join(format!("source-{label}"));
    fs::create_dir_all(&folder).unwrap();
    let shell = folder.join(SHELL);
    fs::write(
        &shell,
        format!("#!/bin/sh\necho 'voyager-shell {label}'\nexit {version_exit}\n"),
    )
    .unwrap();
    fs::set_permissions(&shell, fs::Permissions::from_mode(0o755)).unwrap();
    fs::write(folder.join(COMMAND), format!("command {label}")).unwrap();
    folder
}

fn installed(scratch: &Scratch, names: &[&str]) -> Install {
    let install = Install::at(scratch.0.join("install"));
    for name in names {
        fs::create_dir_all(install.build(name)).unwrap();
    }
    install
}

fn links(install: &Install) -> [Option<String>; 3] {
    Link::ALL.map(|link| install.linked(link).unwrap())
}

fn builds(install: &Install) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(install.root().join(BUILDS))
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .collect();
    names.sort();
    names
}

#[test]
fn adding_from_a_folder_twice_stages_one_verified_build() {
    let scratch = Scratch::new("add");
    let install = Install::at(scratch.0.join("install"));
    let from = source(&scratch.0, "a", 0);
    let first = install.add_from(&from).unwrap();
    assert!(first.starts_with("local-") && first.len() == 14, "{first}");
    assert_eq!(install.stage(&first).unwrap(), Staged::Next(first.clone()));
    assert_eq!(install.add_from(&from).unwrap(), first);
    assert_eq!(install.stage(&first).unwrap(), Staged::Next(first.clone()));
    assert_eq!(builds(&install), std::slice::from_ref(&first));
    assert_eq!(links(&install), [None, None, Some(first.clone())]);
    assert_eq!(
        fs::read(install.build(&first).join(COMMAND)).unwrap(),
        b"command a"
    );
}

#[test]
fn a_copy_that_differs_from_its_source_is_refused_and_leaves_next_alone() {
    let scratch = Scratch::new("mismatch");
    let install = Install::at(scratch.0.join("install"));
    let staged = install.add_from(&source(&scratch.0, "a", 0)).unwrap();
    install.stage(&staged).unwrap();
    let refusal = install
        .add_from_with(&source(&scratch.0, "b", 0), |from, to| {
            fs::copy(from, to)?;
            if to.ends_with(COMMAND) {
                fs::write(to, "truncated")?;
            }
            Ok(())
        })
        .unwrap_err();
    assert!(refusal.contains("does not match its source"), "{refusal}");
    assert_eq!(builds(&install), std::slice::from_ref(&staged));
    assert_eq!(links(&install), [None, None, Some(staged)]);
}

#[test]
fn a_build_whose_version_check_fails_is_refused() {
    let scratch = Scratch::new("version");
    let install = Install::at(scratch.0.join("install"));
    let refusal = install
        .add_from(&source(&scratch.0, "broken", 1))
        .unwrap_err();
    assert!(refusal.contains("--version failed"), "{refusal}");
    assert!(builds(&install).is_empty());
    assert_eq!(links(&install), [None, None, None]);
}

#[test]
fn a_failed_rename_removes_the_partial_folder_and_leaves_next_alone() {
    let scratch = Scratch::new("rename");
    let install = Install::at(scratch.0.join("install"));
    let from = source(&scratch.0, "a", 0);
    let name = format!("local-{}", &digest(&from.join(SHELL)).unwrap()[..8]);
    fs::create_dir_all(install.root().join(BUILDS)).unwrap();
    fs::write(install.build(&name), "a file where the build folder goes").unwrap();
    let refusal = install.add_from(&from).unwrap_err();
    assert!(refusal.starts_with("Moving "), "{refusal}");
    assert_eq!(builds(&install), [name]);
    assert_eq!(links(&install), [None, None, None]);
}

#[test]
fn applying_next_twice_converges_and_keeps_the_old_build_as_previous() {
    let scratch = Scratch::new("apply");
    let install = installed(&scratch, &["a", "b"]);
    install.stage("a").unwrap();
    assert_eq!(
        install.apply_next().unwrap().map(|switch| switch.to),
        Some("a".into())
    );
    assert_eq!(install.apply_next().unwrap(), None);
    assert_eq!(links(&install), [Some("a".into()), None, None]);
    install.stage("b").unwrap();
    install.point(Link::Previous, "a").unwrap();
    install.point(Link::Current, "b").unwrap();
    assert_eq!(
        install.apply_next().unwrap().map(|switch| switch.to),
        Some("b".into())
    );
    assert_eq!(
        links(&install),
        [Some("b".into()), Some("a".into()), None],
        "a crash after current moved still keeps a as previous"
    );
    assert_eq!(install.apply_next().unwrap(), None);
    assert_eq!(links(&install), [Some("b".into()), Some("a".into()), None]);
}

#[test]
fn rollback_twice_stages_the_previous_build_once() {
    let scratch = Scratch::new("rollback");
    let install = installed(&scratch, &["a", "b"]);
    assert!(install.rollback().is_err());
    install.stage("a").unwrap();
    install.apply_next().unwrap();
    install.stage("b").unwrap();
    install.apply_next().unwrap();
    for _ in 0..2 {
        assert_eq!(install.rollback().unwrap(), Staged::Next("a".into()));
        assert_eq!(
            links(&install),
            [Some("b".into()), Some("a".into()), Some("a".into())]
        );
    }
    install.apply_next().unwrap();
    assert_eq!(links(&install), [Some("a".into()), Some("b".into()), None]);
}

#[test]
fn staging_the_current_build_clears_next() {
    let scratch = Scratch::new("current");
    let install = installed(&scratch, &["a", "b"]);
    install.stage("a").unwrap();
    install.apply_next().unwrap();
    install.stage("b").unwrap();
    assert_eq!(
        install.stage("a").unwrap(),
        Staged::AlreadyCurrent("a".into())
    );
    assert_eq!(links(&install), [Some("a".into()), None, None]);
}

#[test]
fn a_failed_switch_falls_back_twice_and_keeps_the_build_before_for_rollback() {
    let scratch = Scratch::new("fall-back");
    let install = installed(&scratch, &["a", "b", "c"]);
    install.stage("a").unwrap();
    install.apply_next().unwrap();
    install.stage("b").unwrap();
    install.apply_next().unwrap();
    install.stage("c").unwrap();
    let switch = install.apply_next().unwrap().unwrap();
    assert_eq!(links(&install), [Some("c".into()), Some("b".into()), None]);
    for _ in 0..2 {
        assert_eq!(install.fall_back(&switch).unwrap(), "b");
        assert_eq!(links(&install), [Some("b".into()), Some("a".into()), None]);
    }
    assert_eq!(install.rollback().unwrap(), Staged::Next("a".into()));
}

#[test]
fn pruning_keeps_linked_and_running_builds_and_removes_partial_ones() {
    let scratch = Scratch::new("prune");
    let install = Install::at(scratch.0.join("install"));
    for name in ["a", "b", "c", "d", "e", "e.part"] {
        fs::create_dir_all(install.build(name)).unwrap();
    }
    install.stage("a").unwrap();
    install.apply_next().unwrap();
    install.stage("b").unwrap();
    install.apply_next().unwrap();
    install.stage("c").unwrap();
    let running = [install.build("d").join(SHELL)];
    for _ in 0..2 {
        install.prune(&running).unwrap();
        assert_eq!(builds(&install), ["a", "b", "c", "d"]);
    }
}

#[test]
fn locate_needs_a_builds_folder_and_a_current_link() {
    let scratch = Scratch::new("locate");
    let install = installed(&scratch, &["a"]);
    let executable = install.build("a").join(SHELL);
    assert_eq!(Install::locate(&executable), None);
    install.stage("a").unwrap();
    install.apply_next().unwrap();
    assert_eq!(Install::locate(&executable), Some(install.clone()));
    assert_eq!(
        Install::locate(&scratch.0.join("target/release").join(SHELL)),
        None
    );
}

#[test]
fn start_file_is_parsed_at_the_boundary() {
    let scratch = Scratch::new("start");
    let install = Install::at(scratch.0.clone());
    let write = |text: &str| fs::write(scratch.0.join(START), text).unwrap();
    write(r#"{"profile":"/home/friend/profile","session":"voyager-daily"}"#);
    assert_eq!(
        install.start().unwrap(),
        Start {
            profile: "/home/friend/profile".into(),
            session: "voyager-daily".into()
        }
    );
    for refused in [
        r#"{"profile":"relative","session":"voyager-daily"}"#,
        r#"{"profile":"/p","session":"daily"}"#,
        r#"{"profile":"/p","session":"voyager-Daily"}"#,
        r#"{"profile":"/p"}"#,
        r#"{"profile":"/p","session":"voyager-daily","extra":1}"#,
    ] {
        write(refused);
        assert!(install.start().is_err(), "{refused}");
    }
}
