use crate::system::save;
use anyhow::{Context as _, Result, bail, ensure};
use rustix::termios::{OptionalActions, Termios, tcgetattr, tcsetattr};
use serde_json::json;
use std::io::{Read, Write, stdin, stdout};
use std::path::Path;
use std::thread::sleep;
use std::time::{Duration, Instant};

pub const READY: [u8; 3] = [208, 32, 144];
pub const SCROLL_LINES: usize = 30;
pub const WAITING: [u8; 3] = [150, 110, 20];
const END: u8 = 0x04;
pub const SIGNALS: [&str; 3] = ["go", "back", "end"];
pub const COMPOSER: &str = "ab界cdef";
pub const COMPOSER_ROW: u16 = 2;
const PROMPT: &str = "> ";

pub struct Block {
    pub rgb: [u8; 3],
    pub row: u16,
    pub column: u16,
    pub text: &'static str,
}

pub const BLOCKS: [Block; 2] = [
    Block {
        rgb: [200, 60, 40],
        row: 3,
        column: 3,
        text: "BLOCKA",
    },
    Block {
        rgb: [40, 90, 200],
        row: 7,
        column: 23,
        text: "BLOCKB",
    },
];

const SIGNAL_PATIENCE: Duration = Duration::from_secs(60);
const RESTORE: &str = "\x1b[?1000l\x1b[?1006l\x1b[?1l\x1b[?2004l\x1b[?1049l";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Mode {
    Arrows,
    Mouse,
    Keys {
        application_cursor: bool,
        bracketed_paste: bool,
    },
    Draw,
    Line {
        mouse_tracking: bool,
    },
}

impl Mode {
    pub fn parse(arguments: &[String]) -> Result<Self> {
        let (name, options) = arguments.split_first().context("Probe needs a mode")?;
        let (mut application_cursor, mut bracketed_paste, mut mouse_tracking) =
            (false, false, false);
        for option in options {
            let chosen = match (name.as_str(), option.as_str()) {
                ("keys", "--application-cursor") => &mut application_cursor,
                ("keys", "--bracketed-paste") => &mut bracketed_paste,
                ("line", "--mouse-tracking") => &mut mouse_tracking,
                _ => bail!("The {name} probe takes no option {option}"),
            };
            ensure!(!*chosen, "Repeated probe option {option}");
            *chosen = true;
        }
        match name.as_str() {
            "arrows" => Ok(Mode::Arrows),
            "mouse" => Ok(Mode::Mouse),
            "draw" => Ok(Mode::Draw),
            "line" => Ok(Mode::Line { mouse_tracking }),
            "keys" => Ok(Mode::Keys {
                application_cursor,
                bracketed_paste,
            }),
            _ => bail!("Unknown probe mode"),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Mode::Arrows => "arrows",
            Mode::Mouse => "mouse",
            Mode::Keys { .. } => "keys",
            Mode::Draw => "draw",
            Mode::Line { .. } => "line",
        }
    }
}

struct TerminalMode(Termios);

impl TerminalMode {
    fn raw() -> Result<Self> {
        let original = tcgetattr(stdin())?;
        let mut raw = original.clone();
        raw.make_raw();
        tcsetattr(stdin(), OptionalActions::Now, &raw)?;
        Ok(Self(original))
    }
}

impl Drop for TerminalMode {
    fn drop(&mut self) {
        let _ = write!(stdout(), "{RESTORE}");
        let _ = stdout().flush();
        let _ = tcsetattr(stdin(), OptionalActions::Now, &self.0);
    }
}

pub fn run(path: &Path, mode: Mode) -> Result<()> {
    let _restore = TerminalMode::raw()?;
    match mode {
        Mode::Arrows | Mode::Mouse => scroll(path, mode),
        Mode::Keys {
            application_cursor,
            bracketed_paste,
        } => keys(path, application_cursor, bracketed_paste),
        Mode::Draw => draw(path),
        Mode::Line { mouse_tracking } => line(path, mouse_tracking),
    }
}

fn scroll(path: &Path, mode: Mode) -> Result<()> {
    write!(
        stdout(),
        "\x1b[?1049h{}",
        if mode == Mode::Mouse {
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
        for line in position..position + SCROLL_LINES as i32 {
            write!(stdout(), "SCROLL {line:03}\r\n")?;
        }
        stdout().flush()?;
        save(
            path,
            &json!({"position":position,"pid":std::process::id(),"mode":mode.name(),"wheel":wheel,"keys":keys}),
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

fn keys(path: &Path, application_cursor: bool, bracketed_paste: bool) -> Result<()> {
    let modes = [
        (application_cursor, "\x1b[?1h"),
        (bracketed_paste, "\x1b[?2004h"),
    ];
    let requested: String = modes
        .iter()
        .filter(|(wanted, _)| *wanted)
        .map(|(_, sequence)| *sequence)
        .collect();
    write!(
        stdout(),
        "\x1b[?1049h\x1b[2J\x1b[H{requested}{}",
        painted(READY, "    ")
    )?;
    stdout().flush()?;
    let mut received = Vec::new();
    let mut ended = false;
    while !ended {
        save(
            path,
            &json!({"pid":std::process::id(),"mode":"keys","received":received,"ended":false}),
        )?;
        let mut bytes = [0; 512];
        let count = stdin().read(&mut bytes)?;
        ended = count == 0 || keep(&mut received, &bytes[..count]);
    }
    save(
        path,
        &json!({"pid":std::process::id(),"mode":"keys","received":received,"ended":true}),
    )
}

pub fn composer_column(characters: usize) -> u16 {
    PROMPT.len() as u16 + COMPOSER.chars().take(characters).map(columns).sum::<u16>()
}

fn columns(character: char) -> u16 {
    if u32::from(character) >= 0x1100 { 2 } else { 1 }
}

struct Composer {
    text: Vec<char>,
    cursor: usize,
}

impl Composer {
    fn new() -> Self {
        let text: Vec<char> = COMPOSER.chars().collect();
        Self {
            cursor: text.len(),
            text,
        }
    }

    fn edit(&mut self, pending: &mut Vec<u8>) {
        while let Some(&first) = pending.first() {
            let used = match first {
                0x1b => match pending.get(1) {
                    None => return,
                    Some(b'[') => {
                        let Some(end) = pending[2..]
                            .iter()
                            .position(|byte| (0x40..=0x7e).contains(byte))
                        else {
                            return;
                        };
                        self.arrow(pending[2 + end]);
                        end + 3
                    }
                    Some(b'O') => {
                        let Some(&key) = pending.get(2) else { return };
                        self.arrow(key);
                        3
                    }
                    Some(_) => 1,
                },
                0x00..=0x1f | 0x7f => 1,
                lead => {
                    let length = match lead {
                        0xf0.. => 4,
                        0xe0.. => 3,
                        0xc0.. => 2,
                        _ => 1,
                    };
                    if pending.len() < length {
                        return;
                    }
                    if let Ok(text) = std::str::from_utf8(&pending[..length]) {
                        for character in text.chars() {
                            self.text.insert(self.cursor, character);
                            self.cursor += 1;
                        }
                    }
                    length
                }
            };
            pending.drain(..used);
        }
    }

    fn arrow(&mut self, key: u8) {
        match key {
            b'D' => self.cursor = self.cursor.saturating_sub(1),
            b'C' => self.cursor = (self.cursor + 1).min(self.text.len()),
            _ => {}
        }
    }

    fn draw(&self) -> String {
        let column = PROMPT.len() as u16
            + self.text[..self.cursor]
                .iter()
                .copied()
                .map(columns)
                .sum::<u16>();
        format!(
            "\x1b[{row};1H\x1b[2K{PROMPT}{text}\x1b[{row};{column}H",
            row = COMPOSER_ROW + 1,
            text = self.text.iter().collect::<String>(),
            column = column + 1,
        )
    }
}

fn line(path: &Path, mouse_tracking: bool) -> Result<()> {
    let mut composer = Composer::new();
    write!(
        stdout(),
        "\x1b[2J\x1b[H{}{}{}",
        painted(READY, "    "),
        if mouse_tracking {
            "\x1b[?1000h\x1b[?1006h"
        } else {
            ""
        },
        composer.draw()
    )?;
    stdout().flush()?;
    let (mut received, mut pending, mut ended) = (Vec::new(), Vec::new(), false);
    while !ended {
        save(
            path,
            &json!({"pid":std::process::id(),"mode":"line","received":received,"text":composer.text.iter().collect::<String>(),"cursor":composer.cursor,"ended":false}),
        )?;
        let mut bytes = [0; 512];
        let count = stdin().read(&mut bytes)?;
        let before = received.len();
        ended = count == 0 || keep(&mut received, &bytes[..count]);
        pending.extend_from_slice(&received[before..]);
        composer.edit(&mut pending);
        write!(stdout(), "{}", composer.draw())?;
        stdout().flush()?;
    }
    write!(stdout(), "\x1b[2J\x1b[H")?;
    stdout().flush()?;
    save(
        path,
        &json!({"pid":std::process::id(),"mode":"line","received":received,"text":composer.text.iter().collect::<String>(),"cursor":composer.cursor,"ended":true}),
    )
}

fn keep(received: &mut Vec<u8>, read: &[u8]) -> bool {
    let end = read.iter().position(|byte| *byte == END);
    received.extend_from_slice(&read[..end.unwrap_or(read.len())]);
    end.is_some()
}

fn draw(path: &Path) -> Result<()> {
    let stage = |stage: &str| {
        save(
            path,
            &json!({"pid":std::process::id(),"mode":"draw","stage":stage,"ended":stage == "ended"}),
        )
    };
    let [go, back, end] = SIGNALS;
    write!(stdout(), "{}\r\n", painted(WAITING, "    "))?;
    stdout().flush()?;
    stage("waiting")?;
    signalled(path, go)?;
    write!(stdout(), "\x1b[?1049h\x1b[2J{}", blocks())?;
    stdout().flush()?;
    stage("drawn")?;
    signalled(path, back)?;
    write!(stdout(), "\x1b[?1049l")?;
    stdout().flush()?;
    stage("back")?;
    signalled(path, end)?;
    stage("ended")
}

fn signalled(path: &Path, signal: &str) -> Result<()> {
    let file = path.with_extension(signal);
    let deadline = Instant::now() + SIGNAL_PATIENCE;
    while !file.exists() {
        ensure!(
            Instant::now() < deadline,
            "The draw probe never saw {}",
            file.display()
        );
        sleep(Duration::from_millis(10));
    }
    Ok(())
}

fn painted([red, green, blue]: [u8; 3], text: &str) -> String {
    format!("\x1b[48;2;{red};{green};{blue}m{text}\x1b[0m")
}

fn blocks() -> String {
    BLOCKS
        .iter()
        .map(|block| {
            format!(
                "\x1b[{};{}H{}",
                block.row,
                block.column,
                painted(block.rgb, block.text)
            )
        })
        .collect()
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
    use super::*;

    fn parse(arguments: &[&str]) -> Result<Mode> {
        let arguments: Vec<String> = arguments.iter().map(|part| (*part).to_owned()).collect();
        Mode::parse(&arguments)
    }

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

    #[test]
    fn a_probe_mode_is_its_name_and_only_keys_and_line_take_options() -> Result<()> {
        assert_eq!(parse(&["arrows"])?, Mode::Arrows);
        assert_eq!(parse(&["mouse"])?, Mode::Mouse);
        assert_eq!(parse(&["draw"])?, Mode::Draw);
        let keys = |application_cursor, bracketed_paste| Mode::Keys {
            application_cursor,
            bracketed_paste,
        };
        assert_eq!(
            parse(&["line"])?,
            Mode::Line {
                mouse_tracking: false
            }
        );
        assert_eq!(
            parse(&["line", "--mouse-tracking"])?,
            Mode::Line {
                mouse_tracking: true
            }
        );
        assert_eq!(parse(&["keys"])?, keys(false, false));
        assert_eq!(parse(&["keys", "--application-cursor"])?, keys(true, false));
        assert_eq!(parse(&["keys", "--bracketed-paste"])?, keys(false, true));
        assert_eq!(
            parse(&["keys", "--bracketed-paste", "--application-cursor"])?,
            keys(true, true)
        );
        for refused in [
            &[][..],
            &["scroll"],
            &["arrows", "--bracketed-paste"],
            &["draw", "now"],
            &["keys", "--mouse"],
            &["line", "--bracketed-paste"],
            &["line", "--mouse-tracking", "--mouse-tracking"],
            &["keys", "--mouse-tracking"],
            &["keys", "--bracketed-paste", "--bracketed-paste"],
            &[
                "keys",
                "--application-cursor",
                "--bracketed-paste",
                "--mouse",
            ],
        ] {
            assert!(parse(refused).is_err(), "accepted {refused:?}");
        }
        for mode in [
            Mode::Arrows,
            Mode::Mouse,
            Mode::Draw,
            Mode::Line {
                mouse_tracking: true,
            },
            keys(true, true),
        ] {
            assert_eq!(parse(&[mode.name()])?.name(), mode.name());
        }
        Ok(())
    }

    #[test]
    fn the_keys_probe_keeps_every_byte_before_the_end_byte() {
        let mut received = Vec::new();
        assert!(!keep(&mut received, b"aZ\x1b[A"));
        assert!(!keep(&mut received, b"\x03\r"));
        assert!(keep(&mut received, b"~\x04late"));
        assert_eq!(received, b"aZ\x1b[A\x03\r~");
        assert!(keep(&mut received, &[END]));
        assert_eq!(received, b"aZ\x1b[A\x03\r~");
    }

    fn composed(input: &[u8]) -> (String, usize) {
        let mut composer = Composer::new();
        let mut pending = input.to_vec();
        composer.edit(&mut pending);
        assert!(pending.is_empty());
        (composer.text.iter().collect(), composer.cursor)
    }

    #[test]
    fn the_line_probe_moves_its_cursor_by_characters_and_inserts_at_it() {
        assert_eq!(composed(b""), ("ab界cdef".into(), 7));
        assert_eq!(
            composed(b"\x1b[D\x1b[D\x1b[D\x1b[DX"),
            ("ab界Xcdef".into(), 4)
        );
        assert_eq!(
            composed(b"\x1bOD\x1bOD\x1bOC\x1bOC\x1bOCY"),
            ("ab界cdefY".into(), 8)
        );
        assert_eq!(composed(&b"\x1b[D".repeat(20)), ("ab界cdef".into(), 0));
        assert_eq!(composed("é".as_bytes()), ("ab界cdefé".into(), 8));
    }

    #[test]
    fn the_line_probe_ignores_mouse_reports_and_waits_for_an_unfinished_sequence() {
        assert_eq!(
            composed(b"\x1b[<0;5;3M\x1b[<0;5;3m"),
            ("ab界cdef".into(), 7)
        );
        let mut composer = Composer::new();
        let mut pending = b"\x1b[".to_vec();
        composer.edit(&mut pending);
        assert_eq!(pending, b"\x1b[");
        pending.push(b'D');
        composer.edit(&mut pending);
        assert!(pending.is_empty());
        assert_eq!(composer.cursor, 6);
    }

    #[test]
    fn the_line_probe_draws_its_cursor_at_the_column_a_click_must_reach() {
        assert_eq!(composer_column(0), 2);
        assert_eq!(composer_column(3), 6);
        assert_eq!(composer_column(7), 10);
        assert!(Composer::new().draw().ends_with("\x1b[3;11H"));
    }

    #[test]
    fn the_draw_probe_addresses_each_block_and_paints_its_colour() {
        assert_eq!(
            blocks(),
            "\x1b[3;3H\x1b[48;2;200;60;40mBLOCKA\x1b[0m\x1b[7;23H\x1b[48;2;40;90;200mBLOCKB\x1b[0m"
        );
        assert_eq!(painted(READY, "    "), "\x1b[48;2;208;32;144m    \x1b[0m");
    }
}
