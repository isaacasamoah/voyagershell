use anyhow::{Context, Result, bail, ensure};
use image::RgbaImage;
use rustix::event::{PollFd, PollFlags, Timespec, poll};
use serde::{Serialize, Serializer};
use std::collections::BTreeMap;
use std::fmt;
use std::io::{self, IoSlice};
use std::os::fd::AsFd;
use std::os::unix::net::UnixStream;
use std::thread::sleep;
use std::time::Duration;
use x11rb::connection::Connection as _;
use x11rb::protocol::xproto::{
    AtomEnum, BUTTON_PRESS_EVENT, BUTTON_RELEASE_EVENT, ClientMessageEvent, ConfigureWindowAux,
    ConnectionExt as _, EventMask, ImageFormat, InputFocus, KEY_PRESS_EVENT, KEY_RELEASE_EVENT,
    MOTION_NOTIFY_EVENT, MapState,
};
use x11rb::protocol::xtest::ConnectionExt as _;
use x11rb::rust_connection::{DefaultStream, PollMode, RustConnection, Stream};
use x11rb::utils::RawFdContainer;
use x11rb::{CURRENT_TIME, NONE};

pub type Window = u32;

const ANSWER: Duration = Duration::from_secs(5);
const KEY_PACE: Duration = Duration::from_millis(1);
const BACKSPACE: u32 = 0xff08;
const TAB: u32 = 0xff09;
const RETURN: u32 = 0xff0d;
const ESCAPE: u32 = 0xff1b;
const F2: u32 = 0xffbf;
const SHIFT: u32 = 0xffe1;
const CONTROL: u32 = 0xffe3;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Key {
    Return,
    Tab,
    Escape,
    BackSpace,
    F2,
    Char(char),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Chord {
    ctrl: bool,
    shift: bool,
    key: Key,
}

impl Key {
    pub fn ctrl(self) -> Chord {
        Chord {
            ctrl: true,
            ..Chord::from(self)
        }
    }

    pub fn shift(self) -> Chord {
        Chord {
            shift: true,
            ..Chord::from(self)
        }
    }

    fn symbol(self) -> Result<u32> {
        match self {
            Key::Return => Ok(RETURN),
            Key::Tab => Ok(TAB),
            Key::Escape => Ok(ESCAPE),
            Key::BackSpace => Ok(BACKSPACE),
            Key::F2 => Ok(F2),
            Key::Char(character) if (' '..='~').contains(&character) => Ok(character as u32),
            Key::Char(character) => bail!("Unsupported key {character:?}"),
        }
    }
}

impl From<Key> for Chord {
    fn from(key: Key) -> Self {
        Self {
            ctrl: false,
            shift: false,
            key,
        }
    }
}

impl fmt::Display for Chord {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.ctrl {
            f.write_str("ctrl+")?;
        }
        if self.shift {
            f.write_str("shift+")?;
        }
        match self.key {
            Key::Char(character) => write!(f, "{character}"),
            named => write!(f, "{named:?}"),
        }
    }
}

impl Serialize for Chord {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct Geometry {
    pub x: i16,
    pub y: i16,
    pub width: u16,
    pub height: u16,
}

#[derive(PartialEq)]
pub struct Pixels {
    pub region: Geometry,
    bgrx: Vec<u8>,
}

impl Pixels {
    #[cfg(test)]
    pub fn new(region: Geometry, bgrx: Vec<u8>) -> Self {
        Self { region, bgrx }
    }

    pub fn rows(&self) -> std::slice::ChunksExact<'_, u8> {
        self.bgrx
            .chunks_exact(usize::from(self.region.width).max(1) * 4)
    }

    pub fn mask(&mut self, area: Geometry) {
        let span = |start: i16, length: u16, origin: i16, limit: u16| {
            let clamp = |edge: i32| (edge - i32::from(origin)).clamp(0, i32::from(limit)) as usize;
            clamp(i32::from(start))..clamp(i32::from(start) + i32::from(length))
        };
        let columns = span(area.x, area.width, self.region.x, self.region.width);
        let stride = usize::from(self.region.width) * 4;
        for row in span(area.y, area.height, self.region.y, self.region.height) {
            self.bgrx[row * stride + columns.start * 4..row * stride + columns.end * 4].fill(0);
        }
    }

    pub fn image(&self) -> Result<RgbaImage> {
        let pixels = self
            .bgrx
            .as_chunks::<4>()
            .0
            .iter()
            .flat_map(|[blue, green, red, _]| [*red, *green, *blue, 255])
            .collect();
        RgbaImage::from_raw(
            u32::from(self.region.width),
            u32::from(self.region.height),
            pixels,
        )
        .context("Captured image has the wrong size")
    }
}

pub struct Display {
    connection: RustConnection<Bounded>,
    root: Window,
    keys: BTreeMap<u32, (u8, bool)>,
    pid: u32,
    name: u32,
    utf8: u32,
}

impl Display {
    pub fn connect(display: &str) -> Result<Self> {
        let number = display
            .strip_prefix(':')
            .context("Display is not a local X11 display")?;
        let socket = UnixStream::connect(format!("/tmp/.X11-unix/X{number}"))?;
        let (stream, _) = DefaultStream::from_unix_stream(socket)?;
        let connection = RustConnection::connect_to_stream(Bounded(stream), 0)?;
        connection.xtest_get_version(2, 2)?.reply()?;
        let root = connection.setup().roots[0].root;
        let atom = |name: &str| -> Result<u32> {
            Ok(connection
                .intern_atom(false, name.as_bytes())?
                .reply()?
                .atom)
        };
        let (pid, name, utf8) = (
            atom("_NET_WM_PID")?,
            atom("_NET_WM_NAME")?,
            atom("UTF8_STRING")?,
        );
        let keys = keymap(&connection)?;
        Ok(Self {
            connection,
            root,
            keys,
            pid,
            name,
            utf8,
        })
    }

    pub fn answers(display: &str) -> bool {
        Self::connect(display)
            .and_then(|display| Ok(display.connection.get_input_focus()?.reply()?))
            .is_ok()
    }

    pub fn windows(&self, pid: u32, title: &str) -> Result<Vec<Window>> {
        let mut found = Vec::new();
        for window in self.connection.query_tree(self.root)?.reply()?.children {
            let Ok(attributes) = self.connection.get_window_attributes(window)?.reply() else {
                continue;
            };
            if attributes.map_state == MapState::VIEWABLE
                && self.owner(window).ok() == Some((pid, title.to_owned()))
            {
                found.push(window);
            }
        }
        Ok(found)
    }

    pub fn owner(&self, window: Window) -> Result<(u32, String)> {
        let pid = self
            .connection
            .get_property(false, window, self.pid, AtomEnum::CARDINAL, 0, 1)?
            .reply()?
            .value32()
            .and_then(|mut values| values.next())
            .context("Window has no owner PID")?;
        let title = self
            .connection
            .get_property(false, window, self.name, self.utf8, 0, 1024)?
            .reply()?
            .value;
        Ok((pid, String::from_utf8(title)?))
    }

    pub fn geometry(&self, window: Window) -> Result<Geometry> {
        let size = self.connection.get_geometry(window)?.reply()?;
        let origin = self
            .connection
            .translate_coordinates(window, self.root, 0, 0)?
            .reply()?;
        Ok(Geometry {
            x: origin.dst_x,
            y: origin.dst_y,
            width: size.width,
            height: size.height,
        })
    }

    pub fn place(&self, window: Window, x: i16, y: i16) -> Result<()> {
        self.connection
            .configure_window(
                window,
                &ConfigureWindowAux::new().x(i32::from(x)).y(i32::from(y)),
            )?
            .check()?;
        Ok(())
    }

    pub fn resize(&self, window: Window, width: u16, height: u16) -> Result<()> {
        self.connection
            .configure_window(
                window,
                &ConfigureWindowAux::new()
                    .width(u32::from(width))
                    .height(u32::from(height)),
            )?
            .check()?;
        Ok(())
    }

    pub fn request_close(&self, window: Window) -> Result<()> {
        let atom = |name: &str| -> Result<u32> {
            Ok(self
                .connection
                .intern_atom(false, name.as_bytes())?
                .reply()?
                .atom)
        };
        let event = ClientMessageEvent::new(
            32,
            window,
            atom("WM_PROTOCOLS")?,
            [atom("WM_DELETE_WINDOW")?, CURRENT_TIME, 0, 0, 0],
        );
        self.connection
            .send_event(false, window, EventMask::NO_EVENT, event)?
            .check()?;
        self.connection.flush()?;
        Ok(())
    }

    pub fn focus(&self, window: Window) -> Result<()> {
        self.connection
            .set_input_focus(InputFocus::PARENT, window, CURRENT_TIME)?
            .check()?;
        ensure!(self.focused()? == window, "Focus did not reach the window");
        Ok(())
    }

    pub fn focused(&self) -> Result<Window> {
        Ok(self.connection.get_input_focus()?.reply()?.focus)
    }

    pub fn under_pointer(&self) -> Result<Window> {
        Ok(self.connection.query_pointer(self.root)?.reply()?.child)
    }

    pub fn move_to(&self, x: i16, y: i16) -> Result<()> {
        self.fake(MOTION_NOTIFY_EVENT, 0, x, y)
    }

    pub fn click(&self, button: u8) -> Result<()> {
        self.hold(button)?;
        self.release(button)
    }

    pub fn hold(&self, button: u8) -> Result<()> {
        self.fake(BUTTON_PRESS_EVENT, button, 0, 0)
    }

    pub fn release(&self, button: u8) -> Result<()> {
        self.fake(BUTTON_RELEASE_EVENT, button, 0, 0)
    }

    pub fn chord(&self, chord: Chord) -> Result<()> {
        let mut held = Vec::new();
        if chord.ctrl {
            held.push(self.code(CONTROL)?);
        }
        if chord.shift {
            held.push((self.code(SHIFT)?.0, false));
        }
        held.push(self.code(chord.key.symbol()?)?);
        self.press(&held)
    }

    pub fn type_text(&self, text: &str) -> Result<()> {
        for character in text.chars() {
            let key = match character {
                '\n' => Key::Return,
                character => Key::Char(character),
            };
            self.press(&[self.code(key.symbol()?)?])?;
        }
        Ok(())
    }

    pub fn capture(&self, window: Window, region: Geometry) -> Result<Pixels> {
        let reply = self
            .connection
            .get_image(
                ImageFormat::Z_PIXMAP,
                window,
                region.x,
                region.y,
                region.width,
                region.height,
                !0,
            )?
            .reply()?;
        ensure!(
            matches!(reply.depth, 24 | 32)
                && reply.data.len() == usize::from(region.width) * usize::from(region.height) * 4,
            "Unsupported image format: depth {} with {} bytes",
            reply.depth,
            reply.data.len()
        );
        Ok(Pixels {
            region,
            bgrx: reply.data,
        })
    }

    pub fn extent(&self) -> Result<Geometry> {
        let size = self.connection.get_geometry(self.root)?.reply()?;
        Ok(Geometry {
            x: 0,
            y: 0,
            width: size.width,
            height: size.height,
        })
    }

    pub fn screen(&self) -> Result<Pixels> {
        self.capture(self.root, self.extent()?)
    }

    fn code(&self, symbol: u32) -> Result<(u8, bool)> {
        self.keys
            .get(&symbol)
            .copied()
            .with_context(|| format!("No key produces keysym {symbol:#x}"))
    }

    fn press(&self, keys: &[(u8, bool)]) -> Result<()> {
        let shift = self.code(SHIFT)?.0;
        let mut sequence = Vec::new();
        for &(code, shifted) in keys {
            if shifted {
                sequence.push(shift);
            }
            sequence.push(code);
        }
        for &code in &sequence {
            self.fake(KEY_PRESS_EVENT, code, 0, 0)?;
            sleep(KEY_PACE);
        }
        for &code in sequence.iter().rev() {
            self.fake(KEY_RELEASE_EVENT, code, 0, 0)?;
            sleep(KEY_PACE);
        }
        Ok(())
    }

    fn fake(&self, kind: u8, detail: u8, x: i16, y: i16) -> Result<()> {
        self.connection
            .xtest_fake_input(kind, detail, CURRENT_TIME, self.root, x, y, NONE as u8)?
            .check()?;
        Ok(())
    }
}

fn keymap(connection: &RustConnection<Bounded>) -> Result<BTreeMap<u32, (u8, bool)>> {
    let setup = connection.setup();
    let (first, last) = (setup.min_keycode, setup.max_keycode);
    let mapping = connection
        .get_keyboard_mapping(first, last - first + 1)?
        .reply()?;
    let width = usize::from(mapping.keysyms_per_keycode);
    let mut keys = BTreeMap::new();
    for level in 0..width.min(2) {
        for (offset, symbols) in mapping.keysyms.chunks_exact(width).enumerate() {
            let code = first + u8::try_from(offset)?;
            if symbols[level] != 0 {
                keys.entry(symbols[level]).or_insert((code, level == 1));
            }
        }
    }
    Ok(keys)
}

struct Bounded(DefaultStream);

impl Stream for Bounded {
    fn poll(&self, mode: PollMode) -> io::Result<()> {
        let mut flags = PollFlags::empty();
        if mode.readable() {
            flags |= PollFlags::IN;
        }
        if mode.writable() {
            flags |= PollFlags::OUT;
        }
        let timeout = Timespec {
            tv_sec: ANSWER.as_secs() as i64,
            tv_nsec: 0,
        };
        loop {
            match poll(
                &mut [PollFd::from_borrowed_fd(self.0.as_fd(), flags)],
                Some(&timeout),
            ) {
                Ok(0) => {
                    return Err(io::Error::new(
                        io::ErrorKind::TimedOut,
                        "The owned display did not answer",
                    ));
                }
                Ok(_) => return Ok(()),
                Err(rustix::io::Errno::INTR) => {}
                Err(error) => return Err(error.into()),
            }
        }
    }

    fn read(&self, buf: &mut [u8], fd_storage: &mut Vec<RawFdContainer>) -> io::Result<usize> {
        self.0.read(buf, fd_storage)
    }

    fn write(&self, buf: &[u8], fds: &mut Vec<RawFdContainer>) -> io::Result<usize> {
        self.0.write(buf, fds)
    }

    fn write_vectored(
        &self,
        bufs: &[IoSlice<'_>],
        fds: &mut Vec<RawFdContainer>,
    ) -> io::Result<usize> {
        self.0.write_vectored(bufs, fds)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masking_blanks_only_the_overlap() {
        let region = Geometry {
            x: 10,
            y: 10,
            width: 4,
            height: 3,
        };
        let mut pixels = Pixels {
            region,
            bgrx: vec![9; 4 * 3 * 4],
        };
        pixels.mask(Geometry {
            x: 12,
            y: 9,
            width: 5,
            height: 2,
        });
        let blank: Vec<_> = pixels
            .bgrx
            .as_chunks::<4>()
            .0
            .iter()
            .map(|pixel| pixel == &[0; 4])
            .collect();
        assert_eq!(
            blank,
            [
                false, false, true, true, false, false, false, false, false, false, false, false
            ]
        );
        pixels.mask(Geometry {
            x: 0,
            y: 0,
            width: 2,
            height: 2,
        });
        assert_eq!(pixels.bgrx.iter().filter(|byte| **byte == 0).count(), 8);
    }

    #[test]
    fn a_chord_is_recorded_by_its_modifier_and_key() {
        assert_eq!(Key::Char('q').ctrl().to_string(), "ctrl+q");
        assert_eq!(Key::Tab.shift().to_string(), "shift+Tab");
        assert_eq!(Chord::from(Key::F2).to_string(), "F2");
        assert_eq!(Chord::from(Key::Return).to_string(), "Return");
        assert_eq!(
            serde_json::to_value(Chord::from(Key::Char('q'))).unwrap(),
            "q"
        );
        assert!(Key::Char('\t').symbol().is_err());
    }
}
