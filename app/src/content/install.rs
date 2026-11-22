use diff::unified;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::{self, Write},
    path::{Component, Path, PathBuf},
};

const RECORD: &str = "installed.json";
const UPDATES: &str = "updates";
const HISTORY: &str = include_str!("pre-record-history.tsv");

#[derive(Clone, Copy, Debug)]
pub struct Shipped<'a> {
    pub path: &'a str,
    pub bytes: &'a [u8],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Reason {
    Edited,
    Unrecorded,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Update {
    pub path: String,
    pub reason: Reason,
    pub diff_file: PathBuf,
    pub diff: String,
}

#[derive(Default, Deserialize, Serialize)]
struct Record {
    version: u32,
    files: BTreeMap<String, String>,
}

#[derive(Debug, Eq, PartialEq)]
enum Stance {
    Absent,
    Current,
    Untouched,
    Edited { installed: u64 },
    Unrecorded,
}

pub fn fingerprint(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x0100_0000_01b3)
    })
}

fn classify(
    current: Option<u64>,
    shipped: u64,
    record: Option<u64>,
    shipped_before: bool,
) -> Stance {
    match current {
        None => Stance::Absent,
        Some(current) if current == shipped => Stance::Current,
        Some(current) => match record {
            Some(installed) if installed == current => Stance::Untouched,
            Some(installed) => Stance::Edited { installed },
            None if shipped_before => Stance::Untouched,
            None => Stance::Unrecorded,
        },
    }
}

fn history() -> HashSet<(&'static str, u64)> {
    HISTORY
        .lines()
        .filter_map(|line| {
            let (path, hash) = line.split_once('\t')?;
            Some((path, u64::from_str_radix(hash, 16).ok()?))
        })
        .collect()
}

impl Record {
    fn read(path: &Path) -> (Self, Option<Vec<u8>>) {
        let Ok(bytes) = fs::read(path) else {
            return (Self::default(), None);
        };
        let record = serde_json::from_slice(&bytes).unwrap_or_default();
        (record, Some(bytes))
    }

    fn installed(&self, path: &str) -> Option<u64> {
        u64::from_str_radix(self.files.get(path)?, 16).ok()
    }
}

fn plain(path: &str) -> bool {
    !path.is_empty()
        && Path::new(path)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
}

fn read_optional(path: &Path) -> io::Result<Option<Vec<u8>>> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn staged(target: &Path) -> PathBuf {
    let name = target.file_name().unwrap_or_default().to_string_lossy();
    target.with_file_name(format!(".{name}.{}.new", std::process::id()))
}

fn write_staged(target: &Path, bytes: &[u8]) -> io::Result<PathBuf> {
    let staged = staged(target);
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staged)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(staged)
}

fn write_atomic(target: &Path, bytes: &[u8]) -> io::Result<()> {
    let staged = write_staged(target, bytes)?;
    fs::rename(&staged, target).inspect_err(|_| {
        let _ = fs::remove_file(&staged);
    })
}

fn write_new(target: &Path, bytes: &[u8]) -> io::Result<()> {
    fs::create_dir_all(target.parent().unwrap_or(Path::new(".")))?;
    match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
    {
        Ok(mut file) => file.write_all(bytes),
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => Ok(()),
        Err(error) => Err(error),
    }
}

#[derive(Debug, Eq, PartialEq)]
enum Swap {
    Done,
    Changed,
}

#[cfg(target_os = "linux")]
fn exchange(first: &Path, second: &Path) -> io::Result<()> {
    use rustix::fs::{CWD, RenameFlags, renameat_with};
    renameat_with(CWD, first, CWD, second, RenameFlags::EXCHANGE).map_err(io::Error::from)
}

#[cfg(target_os = "linux")]
fn replace(target: &Path, bytes: &[u8], expected: u64) -> io::Result<Swap> {
    let staged = write_staged(target, bytes)?;
    exchange(&staged, target)?;
    let previous = fs::read(&staged)?;
    if fingerprint(&previous) == expected {
        fs::remove_file(&staged)?;
        return Ok(Swap::Done);
    }
    exchange(&staged, target)?;
    if fs::read(&staged).is_ok_and(|held| held == bytes) {
        fs::remove_file(&staged)?;
        return Ok(Swap::Changed);
    }
    Err(io::Error::other(format!(
        "{} changed while it was being updated; its newest text is kept in {}",
        target.display(),
        staged.display()
    )))
}

#[cfg(not(target_os = "linux"))]
fn replace(target: &Path, bytes: &[u8], expected: u64) -> io::Result<Swap> {
    let staged = write_staged(target, bytes)?;
    if fs::read(target).map(|held| fingerprint(&held))? != expected {
        fs::remove_file(&staged)?;
        return Ok(Swap::Changed);
    }
    fs::rename(&staged, target)?;
    Ok(Swap::Done)
}

fn diff_name(path: &str) -> String {
    format!("{}.diff", path.replace('/', "__"))
}

fn update(profile: &Path, file: &Shipped, current: &[u8], reason: Reason) -> Update {
    let path = file.path.to_owned();
    let diff = unified(
        &format!("{path} (yours)"),
        &format!("{path} (new version)"),
        &String::from_utf8_lossy(current),
        &String::from_utf8_lossy(file.bytes),
    );
    Update {
        diff_file: profile.join(UPDATES).join(diff_name(&path)),
        path,
        reason,
        diff,
    }
}

fn keep_diffs(profile: &Path, updates: &[Update], known: &HashSet<String>) -> io::Result<()> {
    let directory = profile.join(UPDATES);
    for update in updates {
        fs::create_dir_all(&directory)?;
        if read_optional(&update.diff_file)?.as_deref() != Some(update.diff.as_bytes()) {
            write_atomic(&update.diff_file, update.diff.as_bytes())?;
        }
    }
    let kept = updates
        .iter()
        .map(|update| diff_name(&update.path))
        .collect::<HashSet<_>>();
    let Ok(entries) = fs::read_dir(&directory) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !kept.contains(&name) && known.iter().any(|path| diff_name(path) == name) {
            fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}

fn hold(
    next: &mut BTreeMap<String, String>,
    updates: &mut Vec<Update>,
    profile: &Path,
    file: &Shipped,
    current: &[u8],
    installed: Option<u64>,
) {
    match installed {
        Some(installed) => {
            next.insert(file.path.to_owned(), format!("{installed:016x}"));
            if installed != fingerprint(file.bytes) {
                updates.push(update(profile, file, current, Reason::Edited));
            }
        }
        None => updates.push(update(profile, file, current, Reason::Unrecorded)),
    }
}

pub fn install(profile: &Path, files: &[Shipped], kept: &[&str]) -> io::Result<Vec<Update>> {
    let record_path = profile.join(RECORD);
    let (record, original) = Record::read(&record_path);
    let before = history();
    let mut next = BTreeMap::new();
    let mut updates = Vec::new();
    for file in files {
        let target = profile.join(file.path);
        let current = read_optional(&target)?;
        let shipped = fingerprint(file.bytes);
        let installed = record.installed(file.path);
        let found = current.as_deref().map(fingerprint);
        let stance = classify(
            found,
            shipped,
            installed,
            found.is_some_and(|found| before.contains(&(file.path, found))),
        );
        match stance {
            Stance::Absent => {
                write_new(&target, file.bytes)?;
                next.insert(file.path.to_owned(), format!("{shipped:016x}"));
            }
            Stance::Current => {
                next.insert(file.path.to_owned(), format!("{shipped:016x}"));
            }
            Stance::Untouched => {
                let found = found.unwrap_or_default();
                match replace(&target, file.bytes, found)? {
                    Swap::Done => {
                        next.insert(file.path.to_owned(), format!("{shipped:016x}"));
                    }
                    Swap::Changed => {
                        let latest = fs::read(&target)?;
                        hold(&mut next, &mut updates, profile, file, &latest, installed);
                    }
                }
            }
            Stance::Edited { installed } => hold(
                &mut next,
                &mut updates,
                profile,
                file,
                &current.unwrap_or_default(),
                Some(installed),
            ),
            Stance::Unrecorded => hold(
                &mut next,
                &mut updates,
                profile,
                file,
                &current.unwrap_or_default(),
                None,
            ),
        }
    }
    let shipped_paths = files.iter().map(|file| file.path).collect::<HashSet<_>>();
    for path in record.files.keys() {
        if shipped_paths.contains(path.as_str())
            || !plain(path)
            || kept.iter().any(|prefix| path.starts_with(prefix))
        {
            continue;
        }
        let target = profile.join(path);
        if let (Some(installed), Some(held)) = (record.installed(path), read_optional(&target)?)
            && fingerprint(&held) == installed
        {
            fs::remove_file(&target)?;
        }
    }
    let known = files
        .iter()
        .map(|file| file.path.to_owned())
        .chain(record.files.keys().cloned())
        .collect::<HashSet<_>>();
    updates.sort_by(|a, b| a.path.cmp(&b.path));
    keep_diffs(profile, &updates, &known)?;
    let mut text = serde_json::to_string_pretty(&Record {
        version: 1,
        files: next,
    })?;
    text.push('\n');
    if original.as_deref() != Some(text.as_bytes()) {
        write_atomic(&record_path, text.as_bytes())?;
    }
    Ok(updates)
}

mod diff;

#[cfg(test)]
mod tests;
