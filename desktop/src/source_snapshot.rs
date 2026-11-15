use anyhow::{Context as _, Result, bail};
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::Hasher,
    io::Read,
    path::{Path, PathBuf},
};

pub fn source_snapshot(package: &Path) -> Result<Vec<(PathBuf, u64)>> {
    let mut pending = vec![(package.to_path_buf(), 0usize)];
    let mut files = Vec::new();
    while let Some((directory, depth)) = pending.pop() {
        for entry in fs::read_dir(&directory)
            .with_context(|| format!("Reading source directory {}", directory.display()))?
        {
            let entry = entry.context("Reading source entry")?;
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with('.') || name == "node_modules" || name == "target" {
                continue;
            }
            let kind = entry.file_type().context("Reading source file type")?;
            let path = entry.path();
            if kind.is_dir() {
                if depth >= 8 {
                    bail!("Source watch exceeds directory depth 8: {}", path.display());
                }
                pending.push((path, depth + 1));
            } else if kind.is_file()
                && matches!(
                    path.extension().and_then(|ext| ext.to_str()),
                    Some("js" | "mjs")
                )
            {
                if files.len() >= 4096 {
                    bail!("Source watch exceeds 4096 files");
                }
                let mut file = fs::File::open(&path)
                    .with_context(|| format!("Reading source {}", path.display()))?;
                let mut hash = DefaultHasher::new();
                let mut buffer = [0; 8192];
                loop {
                    let count = file
                        .read(&mut buffer)
                        .with_context(|| format!("Reading source {}", path.display()))?;
                    if count == 0 {
                        break;
                    }
                    hash.write(&buffer[..count]);
                }
                files.push((path, hash.finish()));
            }
        }
    }
    files.sort_unstable();
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::source_snapshot;
    use std::fs;

    #[test]
    fn source_snapshot_tracks_edits_additions_and_removals() {
        let directory =
            std::env::temp_dir().join(format!("voyager-source-snapshot-{}", std::process::id()));
        fs::create_dir(&directory).unwrap();
        fs::write(directory.join("main.js"), b"one").unwrap();
        let initial = source_snapshot(&directory).unwrap();
        fs::write(directory.join("main.js"), b"two").unwrap();
        let edited = source_snapshot(&directory).unwrap();
        fs::write(directory.join("helper.mjs"), b"helper").unwrap();
        let added = source_snapshot(&directory).unwrap();
        fs::remove_file(directory.join("helper.mjs")).unwrap();
        let removed = source_snapshot(&directory).unwrap();
        fs::remove_dir_all(directory).unwrap();
        assert_ne!(initial, edited);
        assert_ne!(edited, added);
        assert_eq!(edited, removed);
    }
}
