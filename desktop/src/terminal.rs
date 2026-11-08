use crate::terminal_screen::{Cell, Grid, Screen, Select};
use anyhow::Result;
use std::rc::Rc;

#[path = "terminal_font.rs"]
mod font;
#[path = "terminal_input.rs"]
mod input;
#[path = "terminal_view.rs"]
mod view;

fn faint(
    foreground: libghostty_vt::style::RgbColor,
    background: libghostty_vt::style::RgbColor,
) -> libghostty_vt::style::RgbColor {
    let blend = |fg: u8, bg: u8| ((u16::from(fg) + u16::from(bg)) / 2) as u8;
    libghostty_vt::style::RgbColor {
        r: blend(foreground.r, background.r),
        g: blend(foreground.g, background.g),
        b: blend(foreground.b, background.b),
    }
}

fn cell_colors(
    cell: &Cell,
) -> (
    libghostty_vt::style::RgbColor,
    libghostty_vt::style::RgbColor,
) {
    let foreground = if cell.style.faint {
        faint(cell.foreground, cell.background)
    } else {
        cell.foreground
    };
    (foreground, cell.background)
}

fn cursor_offset(
    cursor: libghostty_vt::render::Cursor,
    x: usize,
    y: usize,
    wide: libghostty_vt::screen::CellWide,
) -> Option<usize> {
    let point = cursor.viewport?;
    if usize::from(point.y) != y {
        return None;
    }
    let column = usize::from(point.x);
    if column == x {
        Some(0)
    } else if point.at_wide_tail && wide == libghostty_vt::screen::CellWide::Wide && column == x + 1
    {
        Some(1)
    } else {
        None
    }
}

use gpui::{
    AnyElement, App, AppContext as _, Context, Entity, FocusHandle, KeyDownEvent,
    ParentElement as _, Styled as _, Subscription, Task, Window, div, px,
};
use gpui_shell::{
    ArgumentDescriptor, ArgumentSchema, ComponentArgument, ComponentDataValue, ComponentDescriptor,
    ComponentMaterializer, ComponentPayload, ComponentRegistry, ConstructorDescriptor,
    MaterializeRequest, RegistryError, StateDescriptor, StateMethodDescriptor,
};
use libghostty_vt::key::{self, Key, Mods};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use voyager_app::core::Viewer;

pub type Viewers = Arc<Mutex<HashMap<String, Viewer>>>;
type GridSize = (u16, u16, u32, u32);

async fn yield_to_ui() {
    let mut yielded = false;
    std::future::poll_fn(|context| {
        if std::mem::replace(&mut yielded, true) {
            std::task::Poll::Ready(())
        } else {
            context.waker().wake_by_ref();
            std::task::Poll::Pending
        }
    })
    .await;
}

struct Pane {
    screen: Screen,
    viewer: Viewer,
    focus: FocusHandle,
    grid: Option<Grid>,
    font_family: gpui::SharedString,
    cell_width: gpui::Pixels,
    cell_height: gpui::Pixels,
    geometry: Rc<std::cell::Cell<Option<GridSize>>>,
    pending_resize: Option<GridSize>,
    deferred_resize: Option<GridSize>,
    retrying_resize: bool,
    status: String,
    pending_credit: u32,
    pending_reply: Vec<u8>,
    dirty: bool,
    bounds: Rc<std::cell::Cell<Option<gpui::Bounds<gpui::Pixels>>>>,
    selecting: bool,
    scroll_fraction: f32,
    composition: input::Composition,
    _task: Task<()>,
    _focus: Vec<Subscription>,
}

impl Pane {
    fn new(
        screen: Screen,
        viewer: Viewer,
        font_family: gpui::SharedString,
        cell_width: gpui::Pixels,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let focus = cx.focus_handle();
        let subscriptions = vec![
            cx.on_focus(&focus, window, |pane, _, cx| {
                if let Err(error) = pane.viewer.focus(true) {
                    pane.status = format!("Focus: {error:?}");
                    cx.notify();
                }
            }),
            cx.on_blur(&focus, window, |pane, _, cx| {
                pane.selecting = false;
                pane.composition.clear();
                if let Err(error) = pane.viewer.focus(false) {
                    pane.status = format!("Focus: {error:?}");
                    cx.notify();
                }
            }),
        ];
        let waiter = viewer.clone();
        let task = cx.spawn(async move |this, cx| {
            while waiter.ready().await.is_ok() {
                loop {
                    let retry = match this.update(cx, |pane, cx| pane.pump(cx)) {
                        Ok(retry) => retry,
                        Err(_) => return,
                    };
                    if !waiter.connected() || (!retry && waiter.finished().unwrap_or(true)) {
                        return;
                    }
                    yield_to_ui().await;
                    if !retry {
                        break;
                    }
                    cx.background_executor()
                        .timer(Duration::from_millis(5))
                        .await;
                }
            }
        });
        Self {
            screen,
            viewer,
            focus,
            grid: None,
            font_family,
            cell_width,
            cell_height: px(18.),
            geometry: Rc::new(std::cell::Cell::new(None)),
            pending_resize: None,
            deferred_resize: None,
            retrying_resize: false,
            status: String::new(),
            pending_credit: 0,
            pending_reply: Vec::new(),
            dirty: true,
            bounds: Rc::new(std::cell::Cell::new(None)),
            selecting: false,
            scroll_fraction: 0.,
            composition: input::Composition::default(),
            _task: task,
            _focus: subscriptions,
        }
    }

    fn pump(&mut self, cx: &mut Context<Self>) -> bool {
        let start = Instant::now();
        let previous_status = self.status.clone();
        let mut consumed = 0;
        while self.pending_reply.is_empty()
            && !self.screen.replies_overflow()
            && consumed < 65536
            && start.elapsed() < Duration::from_millis(2)
        {
            match self.viewer.take(4096) {
                Ok(bytes) if bytes.is_empty() => break,
                Ok(bytes) => {
                    self.screen.write(&bytes);
                    consumed += bytes.len();
                    self.pending_reply = self.screen.take_replies();
                }
                Err(error) => {
                    self.status = format!("Terminal: {error:?}");
                    break;
                }
            }
        }
        if self.screen.replies_overflow() {
            self.status = "Terminal reply limit exceeded".into();
        }
        if !self.pending_reply.is_empty()
            && self
                .viewer
                .protocol_reply(self.pending_reply.clone())
                .is_ok()
        {
            self.pending_reply.clear();
        }
        self.pending_credit += consumed as u32;
        if self.pending_credit != 0 && self.viewer.credit(self.pending_credit).is_ok() {
            self.pending_credit = 0;
        }
        if consumed != 0 {
            self.dirty = true;
            cx.notify();
        }
        if !self.viewer.connected() && self.status.is_empty() {
            self.status = "Core disconnected".into();
            cx.notify();
        } else if matches!(self.viewer.finished(), Ok(true)) && self.status.is_empty() {
            self.status = "Terminal ended".into();
            cx.notify();
        }
        if self.status != previous_status {
            cx.notify();
        }
        self.pending_credit != 0 || !self.pending_reply.is_empty()
    }

    fn resize(&mut self, cols: u16, rows: u16, width: u32, height: u32, cx: &mut Context<Self>) {
        self.deferred_resize = Some((cols, rows, width, height));
        if !self.flush_resize() && !self.retrying_resize {
            self.retrying_resize = true;
            cx.spawn(async move |this, cx| {
                loop {
                    cx.background_executor()
                        .timer(Duration::from_millis(100))
                        .await;
                    let pending = match this.update(cx, |pane, cx| {
                        let pending = !pane.flush_resize() && pane.viewer.connected();
                        if !pending {
                            pane.retrying_resize = false;
                        }
                        cx.notify();
                        pending
                    }) {
                        Ok(pending) => pending,
                        Err(_) => return,
                    };
                    if !pending {
                        break;
                    }
                }
            })
            .detach();
        }
        cx.notify();
    }

    fn flush_resize(&mut self) -> bool {
        if let Some((cols, rows, width, height)) = self.pending_resize {
            let Some(grid) = &self.grid else {
                return false;
            };
            let hex = |color: libghostty_vt::style::RgbColor| {
                format!("#{:02x}{:02x}{:02x}", color.r, color.g, color.b)
            };
            let result = self.viewer.resize(cols, rows).and_then(|()| {
                self.viewer.display(
                    width,
                    height,
                    hex(grid.colors.foreground),
                    hex(grid.colors.background),
                    grid.colors.cursor.map(hex),
                )
            });
            if let Err(error) = result {
                self.status = format!("Core resize: {error:?}");
                return false;
            }
            self.pending_resize = None;
        }
        if !self.pending_reply.is_empty() {
            if let Err(error) = self.viewer.protocol_reply(self.pending_reply.clone()) {
                self.status = format!("Core resize: {error:?}");
                return false;
            }
            self.pending_reply.clear();
        }
        if let Some((cols, rows, width, height)) = self.deferred_resize.take() {
            match self.screen.resize(cols, rows, width, height) {
                Ok(reply) => self.pending_reply = reply,
                Err(error) => {
                    self.status = format!("Terminal resize: {error:#}");
                    return true;
                }
            }
            match self.screen.snapshot() {
                Ok(grid) => self.grid = Some(grid),
                Err(error) => {
                    self.status = format!("Terminal display: {error:#}");
                    return true;
                }
            }
            self.pending_resize = Some((cols, rows, width, height));
            return self.flush_resize();
        }
        if self.status.starts_with("Core resize:") {
            self.status.clear();
        }
        true
    }

    fn key(&mut self, event: &KeyDownEvent) -> Result<()> {
        let stroke = &event.keystroke;
        let mut input = key::Event::new()?;
        input.set_key(key_code(&stroke.key));
        input.set_action(if event.is_held {
            key::Action::Repeat
        } else {
            key::Action::Press
        });
        let mut modifiers = Mods::empty();
        modifiers.set(Mods::SHIFT, stroke.modifiers.shift);
        modifiers.set(Mods::ALT, stroke.modifiers.alt);
        modifiers.set(Mods::CTRL, stroke.modifiers.control);
        modifiers.set(Mods::SUPER, stroke.modifiers.platform);
        input.set_mods(modifiers);
        let text = stroke
            .key_char
            .clone()
            .or_else(|| (stroke.key.chars().count() == 1).then(|| stroke.key.clone()));
        input.set_utf8(text);
        let mut encoder = key::Encoder::new()?;
        encoder.set_options_from_terminal(&self.screen.terminal);
        let mut bytes = Vec::new();
        encoder.encode_to_vec(&input, &mut bytes)?;
        if !bytes.is_empty() {
            self.send(bytes)?;
        }
        Ok(())
    }

    fn send(&mut self, bytes: Vec<u8>) -> Result<()> {
        self.viewer
            .input(bytes)
            .map_err(|error| anyhow::anyhow!("{error:?}"))?;
        self.input_sent()
    }

    fn input_sent(&mut self) -> Result<()> {
        self.dirty |= self.screen.prepare_input()?;
        Ok(())
    }

    fn paste_text(&mut self, text: &str) -> Result<()> {
        let viewer = &self.viewer;
        self.screen.paste(text, |bytes| {
            viewer
                .input(bytes)
                .map_err(|error| anyhow::anyhow!("{error:?}"))
        })?;
        self.input_sent()
    }

    fn select(&mut self, step: Select, point: gpui::Point<gpui::Pixels>) -> Result<()> {
        let Some(bounds) = self.bounds.get() else {
            return Ok(());
        };
        let Some(grid) = &self.grid else {
            return Ok(());
        };
        let columns = grid.rows.first().map_or(0, |row| row.len());
        if columns == 0 || grid.rows.is_empty() {
            return Ok(());
        }
        let x = f32::from(point.x - bounds.origin.x);
        let y = f32::from(point.y - bounds.origin.y);
        let width = f32::from(self.cell_width);
        let height = f32::from(self.cell_height);
        self.screen.select(
            step,
            libghostty_vt::terminal::PointCoordinate {
                x: ((x / width).floor().max(0.) as usize).min(columns - 1) as u16,
                y: ((y / height).floor().max(0.) as usize).min(grid.rows.len() - 1) as u32,
            },
            (f64::from(x) * 64., f64::from(y) * 64.),
            libghostty_vt::selection::gesture::Geometry {
                columns: columns as u32,
                cell_width: (width * 64.).round().max(1.) as u32,
                padding_left: 0,
                screen_height: (height * grid.rows.len() as f32 * 64.).round().max(1.) as u32,
            },
        )?;
        self.dirty = true;
        Ok(())
    }
}

fn key_code(key: &str) -> Key {
    match key {
        "enter" => Key::Enter,
        "backspace" => Key::Backspace,
        "tab" => Key::Tab,
        "escape" => Key::Escape,
        "up" => Key::ArrowUp,
        "down" => Key::ArrowDown,
        "left" => Key::ArrowLeft,
        "right" => Key::ArrowRight,
        "home" => Key::Home,
        "end" => Key::End,
        "pageup" => Key::PageUp,
        "pagedown" => Key::PageDown,
        "delete" => Key::Delete,
        "insert" => Key::Insert,
        "f1" => Key::F1,
        "f2" => Key::F2,
        "f3" => Key::F3,
        "f4" => Key::F4,
        "f5" => Key::F5,
        "f6" => Key::F6,
        "f7" => Key::F7,
        "f8" => Key::F8,
        "f9" => Key::F9,
        "f10" => Key::F10,
        "f11" => Key::F11,
        "f12" => Key::F12,
        "0" => Key::Digit0,
        "1" => Key::Digit1,
        "2" => Key::Digit2,
        "3" => Key::Digit3,
        "4" => Key::Digit4,
        "5" => Key::Digit5,
        "6" => Key::Digit6,
        "7" => Key::Digit7,
        "8" => Key::Digit8,
        "9" => Key::Digit9,
        "`" => Key::Backquote,
        "\\" => Key::Backslash,
        "[" => Key::BracketLeft,
        "]" => Key::BracketRight,
        "," => Key::Comma,
        "=" => Key::Equal,
        "-" => Key::Minus,
        "." => Key::Period,
        "'" => Key::Quote,
        ";" => Key::Semicolon,
        "/" => Key::Slash,
        "space" => Key::Space,
        "a" => Key::A,
        "b" => Key::B,
        "c" => Key::C,
        "d" => Key::D,
        "e" => Key::E,
        "f" => Key::F,
        "g" => Key::G,
        "h" => Key::H,
        "i" => Key::I,
        "j" => Key::J,
        "k" => Key::K,
        "l" => Key::L,
        "m" => Key::M,
        "n" => Key::N,
        "o" => Key::O,
        "p" => Key::P,
        "q" => Key::Q,
        "r" => Key::R,
        "s" => Key::S,
        "t" => Key::T,
        "u" => Key::U,
        "v" => Key::V,
        "w" => Key::W,
        "x" => Key::X,
        "y" => Key::Y,
        "z" => Key::Z,
        _ => Key::Unidentified,
    }
}

struct TerminalMaterializer;

impl ComponentMaterializer for TerminalMaterializer {
    fn materialize(&self, request: MaterializeRequest<'_>) -> Result<AnyElement> {
        let argument = request
            .payload()
            .downcast_ref::<ComponentArgument>()
            .ok_or_else(|| anyhow::anyhow!("Terminal requires state"))?;
        let pane = request.with_state::<Entity<Pane>, _>(argument, Clone::clone)?;
        request.finish(div().size_full().child(pane))
    }
}

pub fn register(registry: &mut ComponentRegistry, viewers: Viewers) -> Result<(), RegistryError> {
    let remembered = Arc::new(Mutex::new(None::<Option<FocusHandle>>));
    let remembered_focus = remembered.clone();
    registry.register_state(
        StateDescriptor::new(
            "TerminalState",
            "TerminalState",
            vec![ArgumentDescriptor::new("content", ArgumentSchema::String)],
            move |args, window, cx: &mut App| {
                let [ComponentArgument::String(id)] = args else {
                    return Err("Terminal requires content identity".into());
                };
                let viewer = viewers
                    .lock()
                    .map_err(|e| e.to_string())?
                    .get(id)
                    .cloned()
                    .ok_or_else(|| "Terminal is not attached".to_string())?;
                let screen = Screen::new(80, 24).map_err(|e| e.to_string())?;
                let names = cx.text_system().all_font_names();
                let font_family: gpui::SharedString = font::family(&names).to_owned().into();
                let font = cx
                    .text_system()
                    .resolve_font(&gpui::font(font_family.clone()));
                let cell_width = cx
                    .text_system()
                    .advance(font, px(13.), 'M')
                    .map_err(|error| error.to_string())?
                    .width;
                Ok(Box::new(cx.new(|cx| {
                    Pane::new(screen, viewer, font_family, cell_width, window, cx)
                })))
            },
        )
        .with_methods(vec![
            StateMethodDescriptor::new::<Entity<Pane>>(
                "rememberFocus",
                "(): boolean",
                move |pane, args, window, cx| {
                    anyhow::ensure!(args.is_empty(), "rememberFocus takes no arguments");
                    let current = window.focused(cx);
                    let eligible = current.is_none() || pane.read(cx).focus.is_focused(window);
                    *remembered
                        .lock()
                        .map_err(|error| anyhow::anyhow!(error.to_string()))? =
                        eligible.then_some(current);
                    Ok(ComponentDataValue::Boolean(eligible))
                },
            ),
            StateMethodDescriptor::new::<Entity<Pane>>(
                "focusIfUnchanged",
                "(): void",
                move |pane, args, window, cx| {
                    anyhow::ensure!(args.is_empty(), "focusIfUnchanged takes no arguments");
                    let previous = remembered_focus
                        .lock()
                        .map_err(|error| anyhow::anyhow!(error.to_string()))?
                        .take();
                    if window.is_window_active()
                        && previous.is_some_and(|focus| focus == window.focused(cx))
                    {
                        pane.read(cx).focus.clone().focus(window, cx);
                    }
                    Ok(ComponentDataValue::Null)
                },
            ),
        ]),
    )?;
    registry.register(
        ComponentDescriptor::new("Terminal", Arc::new(TerminalMaterializer)).with_constructors(
            vec![ConstructorDescriptor::new(
                "Terminal",
                vec![ArgumentDescriptor::new(
                    "state",
                    ArgumentSchema::Entity("TerminalState"),
                )],
                |args| match args {
                    [argument @ ComponentArgument::Entity { .. }] => {
                        Ok(ComponentPayload::new(argument.clone()))
                    }
                    _ => Err("Terminal requires terminal state".into()),
                },
            )],
        ),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::Screen;

    #[test]
    fn foreground_yield_wakes_and_suspends_once_before_continuing() {
        use std::{
            future::Future,
            sync::{
                Arc,
                atomic::{AtomicUsize, Ordering},
            },
            task::{Context, Wake, Waker},
        };
        #[derive(Default)]
        struct Wakes(AtomicUsize);
        impl Wake for Wakes {
            fn wake(self: Arc<Self>) {
                self.0.fetch_add(1, Ordering::SeqCst);
            }
        }
        let wakes = Arc::new(Wakes::default());
        let waker = Waker::from(wakes.clone());
        let mut context = Context::from_waker(&waker);
        let mut future = Box::pin(super::yield_to_ui());
        assert!(future.as_mut().poll(&mut context).is_pending());
        assert_eq!(wakes.0.load(Ordering::SeqCst), 1);
        assert!(future.as_mut().poll(&mut context).is_ready());
        assert_eq!(wakes.0.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn selection_and_copy_use_terminal_unicode_and_keep_cached_cells() {
        use crate::terminal_screen::Select;
        use libghostty_vt::{selection::gesture::Geometry, terminal::PointCoordinate};
        let mut screen = Screen::new(20, 3).unwrap();
        screen.write("alpha β界\r\nsecond".as_bytes());
        let before = screen.snapshot().unwrap();
        let geometry = Geometry {
            columns: 20,
            cell_width: 512,
            padding_left: 0,
            screen_height: 3456,
        };
        screen
            .select(
                Select::Press,
                PointCoordinate { x: 0, y: 0 },
                (64., 576.),
                geometry,
            )
            .unwrap();
        screen
            .select(
                Select::Drag,
                PointCoordinate { x: 4, y: 0 },
                (2496., 576.),
                geometry,
            )
            .unwrap();
        screen
            .select(
                Select::Release,
                PointCoordinate { x: 4, y: 0 },
                (2496., 576.),
                geometry,
            )
            .unwrap();
        assert_eq!(screen.selection_text().unwrap().as_deref(), Some("alpha"));
        let after = screen.snapshot().unwrap();
        assert!(std::sync::Arc::ptr_eq(&before.rows[0], &after.rows[0]));
        assert!(after.selections[0].as_ref().unwrap().contains(&4));
        screen.write(b"\x1b[3;1Hnew output");
        assert_eq!(screen.selection_text().unwrap().as_deref(), Some("alpha"));
    }

    #[test]
    fn clipboard_paste_respects_terminal_bracketing_and_plain_newlines() {
        let mut screen = Screen::new(20, 3).unwrap();
        assert_eq!(screen.paste_bytes("one\ntwo").unwrap(), b"one\rtwo");
        screen.write(b"\x1b[?2004h");
        assert_eq!(
            screen.paste_bytes("one\ntwo").unwrap(),
            b"\x1b[200~one\ntwo\x1b[201~"
        );
    }

    #[test]
    fn grid_preserves_cell_color_cursor_and_resize() {
        let mut screen = Screen::new(12, 2).unwrap();
        screen.write("\u{1b}[31m界\u{1b}[0mA".as_bytes());
        let grid = screen.snapshot().unwrap();
        assert_eq!(grid.rows[0][0].text, "界");
        assert_ne!(grid.rows[0][0].foreground, grid.rows[0][2].foreground);
        assert_eq!(grid.cursor.unwrap().viewport.unwrap().x, 3);
        screen.resize(16, 4, 8, 16).unwrap();
        let resized = screen.snapshot().unwrap();
        assert_eq!(resized.rows.len(), 4);
        assert_eq!(resized.rows[0].len(), 16);
    }

    #[test]
    fn unchanged_rows_are_retained_while_changed_rows_are_rebuilt() {
        let mut screen = Screen::new(12, 2).unwrap();
        screen.write(b"first\r\nsecond\x1b[1;1H");
        let before = screen.snapshot().unwrap();
        screen.write(b"new");
        let after = screen.snapshot().unwrap();
        assert!(!std::sync::Arc::ptr_eq(&before.rows[0], &after.rows[0]));
        assert!(std::sync::Arc::ptr_eq(&before.rows[1], &after.rows[1]));
        assert_eq!(after.rows[0][0].text.as_ref(), "n");
    }

    #[test]
    fn wide_tail_cursor_is_positioned_inside_the_leading_glyph_cell() {
        let mut screen = Screen::new(12, 2).unwrap();
        screen.write("中\u{1b}[2G".as_bytes());
        let grid = screen.snapshot().unwrap();
        let cursor = grid.cursor.unwrap();
        assert_eq!(
            super::cursor_offset(cursor, 0, 0, grid.rows[0][0].wide),
            Some(1)
        );
        assert_eq!(
            super::cursor_offset(cursor, 2, 0, grid.rows[0][2].wide),
            None
        );
    }

    #[test]
    fn reference_bright_ansi_and_default_cursor_are_preserved() {
        use libghostty_vt::{render::CursorVisualStyle, style::RgbColor};
        let mut screen = Screen::new(12, 2).unwrap();
        screen.write(b"\x1b[1;31mX\x1b[0m");
        let grid = screen.snapshot().unwrap();
        assert_eq!(
            grid.rows[0][0].foreground,
            RgbColor {
                r: 0xef,
                g: 0x29,
                b: 0x29
            }
        );
        assert_eq!(grid.cursor.unwrap().visual_style, CursorVisualStyle::Bar);
    }

    #[test]
    fn bold_inverse_promotes_the_effective_foreground_only() {
        use libghostty_vt::style::RgbColor;
        let mut screen = Screen::new(12, 2).unwrap();
        screen.write(b"\x1b[1;31;44;7mX");
        let grid = screen.snapshot().unwrap();
        let cell = &grid.rows[0][0];
        assert_eq!(
            cell.foreground,
            RgbColor {
                r: 0x72,
                g: 0x9f,
                b: 0xcf
            }
        );
        assert_eq!(
            cell.background,
            RgbColor {
                r: 0xed,
                g: 0x85,
                b: 0x8b
            }
        );
    }

    #[test]
    fn resize_delivers_viewer_owned_pixel_report_without_new_output() {
        let mut screen = Screen::new(12, 2).unwrap();
        screen.write(b"\x1b[?2048h");
        screen.take_replies();
        let reply = screen.resize(16, 4, 8, 16).unwrap();
        assert!(reply.starts_with(b"\x1b[48;"));
    }

    #[test]
    fn reference_colors_and_inverse_resolve_before_foreground_fainting() {
        use libghostty_vt::style::RgbColor;
        let mut screen = Screen::new(12, 2).unwrap();
        screen.write(b"\x1b[2;31;44;7mX\x1b[0m");
        let grid = screen.snapshot().unwrap();
        let cell = &grid.rows[0][0];
        assert_eq!(
            cell.foreground,
            RgbColor {
                r: 0x97,
                g: 0xb3,
                b: 0xd6
            }
        );
        assert_eq!(
            cell.background,
            RgbColor {
                r: 0xed,
                g: 0x85,
                b: 0x8b
            }
        );
        assert_eq!(
            grid.colors.cursor,
            Some(RgbColor {
                r: 0xc4,
                g: 0xb5,
                b: 0xfd
            })
        );
        let (faint_foreground, faint_background) = super::cell_colors(cell);
        assert_eq!(
            faint_foreground,
            RgbColor {
                r: 0xc2,
                g: 0x9c,
                b: 0xb0
            }
        );
        assert_eq!(faint_background, cell.background);
        assert_eq!(
            cell.background,
            RgbColor {
                r: 0xed,
                g: 0x85,
                b: 0x8b
            }
        );
    }

    #[test]
    fn terminal_interprets_cursor_motion_instead_of_printing_escape_bytes() {
        let mut screen = Screen::new(12, 2).unwrap();
        screen.write(b"hello\rY");
        assert!(screen.lines().unwrap()[0].starts_with("Yello"));
    }

    #[test]
    fn terminal_retains_device_status_reply_for_core() {
        let mut screen = Screen::new(12, 2).unwrap();
        screen.write(b"\x1b[6n");
        assert_eq!(screen.take_replies(), b"\x1b[1;1R");
    }

    #[test]
    fn ghostty_encodes_printable_text_without_a_named_physical_key() {
        let mut encoder = libghostty_vt::key::Encoder::new().unwrap();
        let mut event = libghostty_vt::key::Event::new().unwrap();
        event.set_key(libghostty_vt::key::Key::Unidentified);
        event.set_utf8(Some("1"));
        let mut output = Vec::new();
        encoder.encode_to_vec(&event, &mut output).unwrap();
        assert_eq!(output, b"1");
    }

    #[test]
    fn ghostty_encodes_control_c_as_terminal_interrupt() {
        let mut encoder = libghostty_vt::key::Encoder::new().unwrap();
        let mut event = libghostty_vt::key::Event::new().unwrap();
        event.set_key(libghostty_vt::key::Key::C);
        event.set_mods(libghostty_vt::key::Mods::CTRL);
        event.set_utf8(Some("c"));
        let mut output = Vec::new();
        encoder.encode_to_vec(&event, &mut output).unwrap();
        assert_eq!(output, [3]);
    }
}
