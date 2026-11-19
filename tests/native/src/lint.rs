use anyhow::{Context, Result, ensure};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

pub const RULE: &str = "check-loosened";
pub const SETTLE: &str = "src/native/settle.rs";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Deadline {
    Literal,
    Sleep,
    Clock,
}

impl Deadline {
    fn says(self) -> &'static str {
        match self {
            Self::Literal => "builds a wall-clock deadline",
            Self::Sleep => "waits a fixed time",
            Self::Clock => "reads the wall clock",
        }
    }

    fn fix(self) -> &'static str {
        match self {
            Self::Literal => {
                "wait with native.observe, native.settle or until, which end on the app's next observation, or name a deadline the product owes as an Owed constant in src/native/settle.rs"
            }
            Self::Sleep => {
                "wait with native.observe, native.settle or until, or hold for an Owed constant from src/native/settle.rs"
            }
            Self::Clock => {
                "measure with Stopwatch from src/native/settle.rs and test the result with Elapsed::within and a named Owed"
            }
        }
    }
}

#[derive(Debug, Eq, PartialEq)]
pub struct Finding {
    pub path: String,
    pub line: usize,
    pub found: String,
    pub deadline: Deadline,
}

impl fmt::Display for Finding {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{RULE}: {}:{}: {} {} in a journey. Fix: {}.",
            self.path,
            self.line,
            self.found,
            self.deadline.says(),
            self.deadline.fix()
        )
    }
}

#[derive(Debug, Eq, PartialEq)]
enum Token {
    Word(String),
    Path,
    Dot,
    Open,
    Other,
}

fn blank(source: &str) -> String {
    let bytes = source.as_bytes();
    let mut out = String::with_capacity(source.len());
    let mut at = 0;
    let hidden = |byte: u8| if byte == b'\n' { '\n' } else { ' ' };
    while at < bytes.len() {
        let rest = &bytes[at..];
        let skip = if rest.starts_with(b"//") {
            rest.iter().position(|b| *b == b'\n').unwrap_or(rest.len())
        } else if rest.starts_with(b"/*") {
            let mut depth = 0;
            let mut end = rest.len();
            let mut index = 0;
            while index < rest.len() {
                if rest[index..].starts_with(b"/*") {
                    depth += 1;
                    index += 2;
                } else if rest[index..].starts_with(b"*/") {
                    depth -= 1;
                    index += 2;
                    if depth == 0 {
                        end = index;
                        break;
                    }
                } else {
                    index += 1;
                }
            }
            end
        } else if let Some(length) = raw_string(rest) {
            length
        } else if rest[0] == b'"' || rest.starts_with(b"b\"") {
            let mut index = if rest[0] == b'b' { 2 } else { 1 };
            while index < rest.len() && rest[index] != b'"' {
                index += if rest[index] == b'\\' { 2 } else { 1 };
            }
            (index + 1).min(rest.len())
        } else if let Some(length) = character(rest) {
            length
        } else {
            0
        };
        if skip == 0 {
            let width = source[at..].chars().next().map_or(1, char::len_utf8);
            out.push_str(&source[at..at + width]);
            at += width;
        } else {
            out.extend(rest[..skip].iter().map(|byte| hidden(*byte)));
            at += skip;
        }
    }
    out
}

fn raw_string(rest: &[u8]) -> Option<usize> {
    let start = if rest.starts_with(b"br") {
        2
    } else if rest.starts_with(b"r") {
        1
    } else {
        return None;
    };
    let hashes = rest[start..]
        .iter()
        .take_while(|byte| **byte == b'#')
        .count();
    if rest.get(start + hashes) != Some(&b'"') {
        return None;
    }
    let mut close = vec![b'"'];
    close.extend(std::iter::repeat_n(b'#', hashes));
    let body = start + hashes + 1;
    let end = rest[body..]
        .windows(close.len())
        .position(|window| window == close.as_slice())?;
    Some(body + end + close.len())
}

fn character(rest: &[u8]) -> Option<usize> {
    if rest[0] != b'\'' {
        return None;
    }
    if rest.get(1) == Some(&b'\\') {
        let end = rest[3..].iter().position(|byte| *byte == b'\'')?;
        return Some(end + 4);
    }
    let width = std::str::from_utf8(rest.get(1..)?)
        .or_else(|error| std::str::from_utf8(&rest[1..1 + error.valid_up_to()]))
        .ok()?
        .chars()
        .next()?
        .len_utf8();
    (rest.get(1 + width) == Some(&b'\'')).then_some(width + 2)
}

fn tokens(clean: &str) -> Vec<(Token, usize)> {
    let mut found = Vec::new();
    let mut line = 1;
    let mut chars = clean.char_indices().peekable();
    while let Some((start, c)) = chars.next() {
        if c == '\n' {
            line += 1;
        } else if c.is_alphabetic() || c == '_' {
            let mut end = start + c.len_utf8();
            while let Some((index, next)) = chars.peek().copied() {
                if next.is_alphanumeric() || next == '_' {
                    end = index + next.len_utf8();
                    chars.next();
                } else {
                    break;
                }
            }
            found.push((Token::Word(clean[start..end].to_owned()), line));
        } else if c == ':' && matches!(chars.peek(), Some((_, ':'))) {
            chars.next();
            found.push((Token::Path, line));
        } else if c == '.' {
            found.push((Token::Dot, line));
        } else if c == '(' {
            found.push((Token::Open, line));
        } else if !c.is_whitespace() {
            found.push((Token::Other, line));
        }
    }
    found
}

fn word<'a>(token: Option<&'a (Token, usize)>) -> Option<&'a str> {
    match token {
        Some((Token::Word(text), _)) => Some(text),
        _ => None,
    }
}

pub fn deadlines(path: &str, source: &str) -> Vec<Finding> {
    if !in_scope(path) {
        return Vec::new();
    }
    let all = tokens(&blank(source));
    let mut findings = Vec::new();
    for (index, (token, line)) in all.iter().enumerate() {
        let Token::Word(text) = token else { continue };
        let after = |offset: usize| all.get(index + offset);
        let seen = match text.as_str() {
            "Duration"
                if matches!(after(1), Some((Token::Path, _)))
                    && word(after(2))
                        .is_some_and(|name| name == "new" || name.starts_with("from_")) =>
            {
                Some((
                    format!("Duration::{}", word(after(2)).unwrap_or_default()),
                    Deadline::Literal,
                ))
            }
            "sleep" => Some(("sleep".to_owned(), Deadline::Sleep)),
            "Instant" | "SystemTime"
                if matches!(after(1), Some((Token::Path, _))) && word(after(2)) == Some("now") =>
            {
                Some((format!("{text}::now"), Deadline::Clock))
            }
            "elapsed"
                if index > 0
                    && matches!(all[index - 1].0, Token::Dot)
                    && matches!(after(1), Some((Token::Open, _))) =>
            {
                Some((".elapsed()".to_owned(), Deadline::Clock))
            }
            _ => None,
        };
        if let Some((found, deadline)) = seen {
            findings.push(Finding {
                path: path.to_owned(),
                line: *line,
                found,
                deadline,
            });
        }
    }
    findings
}

fn in_scope(path: &str) -> bool {
    path != SETTLE && (path == "src/journey.rs" || path.starts_with("src/journey/"))
}

fn rust_files(folder: &Path, found: &mut Vec<PathBuf>) -> Result<()> {
    for entry in fs::read_dir(folder).with_context(|| format!("Reading {}", folder.display()))? {
        let path = entry?.path();
        if path.is_dir() {
            rust_files(&path, found)?;
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            found.push(path);
        }
    }
    Ok(())
}

pub fn scan(root: &Path) -> Result<Vec<Finding>> {
    let mut files = Vec::new();
    rust_files(&root.join("src"), &mut files)?;
    files.sort();
    let mut findings = Vec::new();
    let mut scanned = 0;
    for file in files {
        let relative = file
            .strip_prefix(root)?
            .to_str()
            .context("A journey path that is not text")?
            .replace('\\', "/");
        if in_scope(&relative) {
            scanned += 1;
            findings.extend(deadlines(&relative, &fs::read_to_string(&file)?));
        }
    }
    ensure!(
        scanned > 0,
        "No journey files under {}/src, so the lint checked nothing",
        root.display()
    );
    Ok(findings)
}

pub fn run(args: &[String]) -> Result<i32> {
    let root = match args {
        [] => PathBuf::from(env!("CARGO_MANIFEST_DIR")),
        [flag, root] if flag == "--root" => PathBuf::from(root),
        _ => anyhow::bail!("lint takes no options, or --root DIR"),
    };
    let findings = scan(&root)?;
    for finding in &findings {
        println!("{finding}");
    }
    if findings.is_empty() {
        println!("{RULE}: no wall-clock deadline in a journey file");
        return Ok(0);
    }
    Ok(1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::Scratch;

    const PLANTED: &str = "fn case() {\n    let wait = Duration::from_millis(500);\n    std::thread::sleep(wait);\n}\n";

    #[test]
    fn a_planted_deadline_in_a_journey_file_is_found_at_its_line() {
        let found = deadlines("src/journey/planted.rs", PLANTED);
        assert_eq!(
            found
                .iter()
                .map(|finding| (finding.line, finding.found.as_str()))
                .collect::<Vec<_>>(),
            [(2, "Duration::from_millis"), (3, "sleep")]
        );
        let message = found[0].to_string();
        assert!(message.starts_with("check-loosened: src/journey/planted.rs:2:"));
        assert!(message.contains("native.observe") && message.contains("settle.rs"));
    }

    #[test]
    fn the_settle_file_may_hold_the_deadlines() {
        assert!(deadlines(SETTLE, PLANTED).is_empty());
        let own = include_str!("native/settle.rs");
        assert!(own.contains("Duration::from_secs") && own.contains("Instant::now"));
        assert!(deadlines(SETTLE, own).is_empty());
        assert!(!deadlines("src/journey/settle.rs", own).is_empty());
    }

    #[test]
    fn a_file_outside_the_journeys_is_not_linted() {
        assert!(deadlines("src/native.rs", PLANTED).is_empty());
    }

    #[test]
    fn text_in_strings_comments_and_lifetimes_is_not_a_deadline() {
        let source = "fn case<'a>(native: &'a Native) {\n    // Duration::from_secs(1) and sleep\n    native.line(\"sleep 30; Duration::from_secs(2)\");\n    native.line(r#\"sleep \"1\"; x.elapsed()\"#);\n    let quote = '\"';\n    native.line(\"timeout 30 yes\");\n}\n";
        assert_eq!(deadlines("src/journey/quoted.rs", source), []);
    }

    #[test]
    fn a_token_after_a_string_is_still_found() {
        let source = "fn case() {\n    say(\"a \\\" quote\"); sleep(wait);\n}\n";
        let found = deadlines("src/journey/after.rs", source);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].line, 2);
    }

    #[test]
    fn a_wall_clock_reading_is_found() {
        let source = "let began = Instant::now();\nlet at = SystemTime::now();\nlet took = began.elapsed();\nlet shown = Stopwatch::start().lap();\n";
        let found = deadlines("src/journey/clock.rs", source);
        assert_eq!(
            found.iter().map(|finding| finding.line).collect::<Vec<_>>(),
            [1, 2, 3]
        );
        assert!(
            found
                .iter()
                .all(|finding| finding.deadline == Deadline::Clock)
        );
    }

    const REPLAY: &str = "    cases.check(native, Case::ExitCloses, |native| {\n        let (before, _) = native.document()?.context(\"Missing saved layout\")?;\n        terminal.line(native, \"exit\")?;\n        let typed = Instant::now();\n        native.observe(\"the exited shell's Vessel closed\", |seen| {\n            (!seen.shows(&terminal.target()) && seen.version > before).then_some(())\n        })?;\n        let delay = typed.elapsed().as_millis();\n        native.keep_window(\"exit-closes\")?;\n        Verdict::new()\n            .expect(\n                \"the exited shell's Vessel closes within 1 s of the typed exit\",\n                delay < 1000,\n            )\n            .observed(\"exit to closed ms\", delay)\n    })\n";

    #[test]
    fn the_one_second_exit_closes_bound_is_found_at_the_line_that_started_its_clock() {
        let found = deadlines("src/journey/scrolling.rs", REPLAY);
        assert_eq!(
            found
                .iter()
                .map(|finding| (finding.line, finding.found.as_str()))
                .collect::<Vec<_>>(),
            [(4, "Instant::now"), (8, ".elapsed()")]
        );
    }

    #[test]
    fn a_scan_of_a_folder_with_no_journeys_is_an_error() {
        let folder = Scratch::new("lint-empty").unwrap();
        fs::create_dir_all(folder.path().join("src")).unwrap();
        assert!(scan(folder.path()).is_err());
    }
}
