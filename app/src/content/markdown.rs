use std::{
    fs::{self, OpenOptions},
    io::{self, Read, Write},
    path::{Component, Path, PathBuf},
};
use voyager_contract::content::Notes;

use super::LIMIT;

pub(crate) fn file(directory: &Path, name: &str) -> Result<PathBuf, String> {
    let mut parts = Path::new(name).components();
    if !matches!(parts.next(), Some(Component::Normal(_)))
        || parts.next().is_some()
        || !name.ends_with(".md")
    {
        return Err("Choose a Markdown filename in the Notes directory".into());
    }
    Ok(directory.join(name))
}

pub(crate) fn list(directory: &Path) -> Result<Vec<String>, String> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.to_string()),
    };
    let mut names = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        if entry.path().is_file()
            && let Some(name) = entry.file_name().to_str()
            && name.ends_with(".md")
        {
            names.push(name.to_owned());
        }
    }
    names.sort();
    Ok(names)
}

pub(crate) fn parse(name: &str, bytes: &[u8]) -> Result<Notes, String> {
    let source = std::str::from_utf8(bytes).map_err(|error| error.to_string())?;
    let first = source.split_once('\n').map_or(source, |(line, _)| line);
    if let Some(title) = first.strip_prefix("# ") {
        let body = source
            .strip_prefix(first)
            .unwrap_or_default()
            .strip_prefix('\n')
            .unwrap_or_default();
        let body = body.strip_prefix('\n').unwrap_or(body);
        return Ok(Notes {
            title: title.trim_end_matches('\r').into(),
            text: body.into(),
        });
    }
    let title = Path::new(name)
        .file_stem()
        .and_then(|name| name.to_str())
        .ok_or("Invalid filename")?;
    Ok(Notes {
        title: title.into(),
        text: source.into(),
    })
}

pub(crate) fn encode(notes: &Notes) -> Result<Vec<u8>, String> {
    if notes.title.contains(['\n', '\r']) {
        return Err("A note title must fit on one line".into());
    }
    let bytes = format!("# {}\n\n{}", notes.title, notes.text).into_bytes();
    if bytes.len() > LIMIT {
        return Err("Notes data exceeds 1 MiB".into());
    }
    Ok(bytes)
}

pub(crate) fn read(path: &Path) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    fs::File::open(path)
        .and_then(|file| file.take(LIMIT as u64 + 1).read_to_end(&mut bytes))
        .map_err(|error| error.to_string())?;
    if bytes.len() > LIMIT {
        return Err("Notes data exceeds 1 MiB".into());
    }
    Ok(bytes)
}

pub(crate) fn create(directory: &Path, notes: &Notes) -> Result<String, String> {
    let title = notes.title.trim();
    if title.is_empty() || title == "." || title == ".." || title.contains(['/', '\\', '\n', '\r'])
    {
        return Err("Choose a valid note title".into());
    }
    let bytes = encode(notes)?;
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    for index in 1.. {
        let name = if index == 1 {
            format!("{title}.md")
        } else {
            format!("{title} {index}.md")
        };
        let path = file(directory, &name)?;
        match OpenOptions::new().write(true).create_new(true).open(path) {
            Ok(mut output) => {
                output
                    .write_all(&bytes)
                    .and_then(|_| output.sync_all())
                    .map_err(|error| format!("Note {name} creation is unconfirmed: {error}"))?;
                return Ok(name);
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    unreachable!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_keeps_body_and_uses_heading_or_filename_as_title() {
        let note = parse("Sample.md", b"# Heading\n\nBody\n").unwrap();
        assert_eq!(note.title, "Heading");
        assert_eq!(note.text, "Body\n");
        assert_eq!(encode(&note).unwrap(), b"# Heading\n\nBody\n");
        let note = parse("Sample.md", b"Body\n").unwrap();
        assert_eq!(note.title, "Sample");
        assert_eq!(note.text, "Body\n");
    }

    #[test]
    fn new_note_preserves_existing_file_and_rejects_escaping_names() {
        let root = std::env::temp_dir().join(format!("voyager-markdown-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let note = Notes {
            title: "Title".into(),
            text: String::new(),
        };
        assert_eq!(create(&root, &note).unwrap(), "Title.md");
        assert_eq!(create(&root, &note).unwrap(), "Title 2.md");
        assert_eq!(read(&root.join("Title.md")).unwrap(), b"# Title\n\n");
        assert!(file(&root, "../other.md").is_err());
        assert_eq!(list(&root).unwrap().len(), 2);
        std::fs::remove_dir_all(root).unwrap();
    }
}
