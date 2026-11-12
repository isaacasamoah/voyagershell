use crate::system::save;
use anyhow::{Result, ensure};
use rustix::termios::{OptionalActions, Termios, tcgetattr, tcsetattr};
use serde_json::json;
use std::io::{Read, Write, stdin, stdout};
use std::path::Path;

struct TerminalMode(Termios);

impl Drop for TerminalMode {
    fn drop(&mut self) {
        let _ = write!(stdout(), "\x1b[?1000l\x1b[?1006l\x1b[?1049l");
        let _ = stdout().flush();
        let _ = tcsetattr(stdin(), OptionalActions::Now, &self.0);
    }
}

pub fn run(path: &Path, mode: &str) -> Result<()> {
    ensure!(["arrows", "mouse"].contains(&mode), "Unknown probe mode");
    let original = tcgetattr(stdin())?;
    let mut raw = original.clone();
    raw.make_raw();
    tcsetattr(stdin(), OptionalActions::Now, &raw)?;
    let _restore = TerminalMode(original);
    write!(
        stdout(),
        "\x1b[?1049h{}",
        if mode == "mouse" {
            "\x1b[?1000h\x1b[?1006h"
        } else {
            ""
        }
    )?;
    let mut position: i32 = 100;
    let mut pending = Vec::new();
    loop {
        write!(stdout(), "\x1b[H\x1b[2J")?;
        for line in position..position + 30 {
            write!(stdout(), "SCROLL {line:03}\r\n")?;
        }
        stdout().flush()?;
        save(
            path,
            &json!({"position":position,"pid":std::process::id(),"mode":mode}),
        )?;
        let mut bytes = [0; 512];
        let count = stdin().read(&mut bytes)?;
        if count == 0 || bytes[..count].contains(&b'q') {
            break;
        }
        pending.extend_from_slice(&bytes[..count]);
        while pending.len() >= 3 {
            let (length, up) = if pending.starts_with(b"\x1b[<") {
                let Some(end) = pending.iter().position(|b| *b == b'M') else {
                    break;
                };
                let up = pending[3..end].starts_with(b"64;");
                (end + 1, up)
            } else if pending.starts_with(b"\x1b[A") || pending.starts_with(b"\x1bOA") {
                (3, true)
            } else if pending.starts_with(b"\x1b[B") || pending.starts_with(b"\x1bOB") {
                (3, false)
            } else {
                pending.remove(0);
                continue;
            };
            position = (position + if up { -1 } else { 1 }).clamp(0, 200);
            pending.drain(..length);
        }
        ensure!(pending.len() < 1024, "Unrecognized probe input");
    }
    save(
        path,
        &json!({"position":position,"pid":std::process::id(),"ended":true}),
    )
}
