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
    let (mut wheel, mut keys) = (0_u32, 0_u32);
    let mut pending = Vec::new();
    loop {
        write!(stdout(), "\x1b[H\x1b[2J")?;
        for line in position..position + 30 {
            write!(stdout(), "SCROLL {line:03}\r\n")?;
        }
        stdout().flush()?;
        save(
            path,
            &json!({"position":position,"pid":std::process::id(),"mode":mode,"wheel":wheel,"keys":keys}),
        )?;
        let mut bytes = [0; 512];
        let count = stdin().read(&mut bytes)?;
        if count == 0 || bytes[..count].contains(&b'q') {
            break;
        }
        pending.extend_from_slice(&bytes[..count]);
        while let Some((input, up)) = movement(&mut pending) {
            match input {
                Input::Wheel => wheel += 1,
                Input::Key => keys += 1,
            }
            position = (position + if up { -1 } else { 1 }).clamp(0, 200);
        }
        ensure!(pending.len() < 1024, "Unrecognized probe input");
    }
    save(
        path,
        &json!({"position":position,"pid":std::process::id(),"ended":true}),
    )
}

#[derive(Debug, Eq, PartialEq)]
enum Input {
    Wheel,
    Key,
}

fn movement(pending: &mut Vec<u8>) -> Option<(Input, bool)> {
    while pending.len() >= 3 {
        if pending.starts_with(b"\x1b[<") {
            let end = pending.iter().position(|byte| *byte == b'M')?;
            let up = wheel_button(&pending[3..end]);
            pending.drain(..=end);
            if let Some(up) = up {
                return Some((Input::Wheel, up));
            }
        } else if let Some(up) = cursor_key(&pending[..3]) {
            pending.drain(..3);
            return Some((Input::Key, up));
        } else {
            pending.remove(0);
        }
    }
    None
}

fn cursor_key(sequence: &[u8]) -> Option<bool> {
    match sequence {
        b"\x1b[A" | b"\x1bOA" => Some(true),
        b"\x1b[B" | b"\x1bOB" => Some(false),
        _ => None,
    }
}

fn wheel_button(payload: &[u8]) -> Option<bool> {
    let fields: Vec<_> = payload.split(|byte| *byte == b';').collect();
    if fields.len() != 3
        || fields
            .iter()
            .any(|field| field.is_empty() || !field.iter().all(u8::is_ascii_digit))
    {
        return None;
    }
    match fields[0] {
        b"64" => Some(true),
        b"65" => Some(false),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{Input, movement, wheel_button};

    #[test]
    fn each_movement_is_counted_as_the_input_that_caused_it() {
        let mut pending = b"\x1b[<64;3;2M\x1b[A\x1bOBx\x1b[<0;3;2M\x1b[<65;1;1M\x1b[<64;9".to_vec();
        let moved: Vec<_> = std::iter::from_fn(|| movement(&mut pending)).collect();
        assert_eq!(
            moved,
            [
                (Input::Wheel, true),
                (Input::Key, true),
                (Input::Key, false),
                (Input::Wheel, false),
            ]
        );
        assert_eq!(
            pending, b"\x1b[<64;9",
            "an unfinished report waits for its end"
        );
    }

    #[test]
    fn only_valid_wheel_reports_move_the_probe() {
        assert_eq!(wheel_button(b"64;3;2"), Some(true));
        assert_eq!(wheel_button(b"65;3;2"), Some(false));
        for invalid in [
            b"0;3;2".as_slice(),
            b"66;3;2",
            b"65;x;2",
            b"64;3;",
            b"64;3;2;4",
            b"",
        ] {
            assert_eq!(wheel_button(invalid), None, "malformed report {invalid:?}");
        }
    }
}
