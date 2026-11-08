use anyhow::Result;
use libghostty_vt::{
    Terminal,
    render::{CellIterator, RenderState, RowIterator},
    selection::gesture::{DragEvent, Geometry, Gesture, PressEvent, ReleaseEvent},
    terminal::{Point, PointCoordinate},
};
use std::{
    cell::RefCell,
    collections::HashMap,
    rc::Rc,
    sync::Arc,
    time::{Duration, Instant},
};

pub(super) enum Select {
    Press,
    Drag,
    Release,
}

#[derive(Clone)]
pub(super) struct Cell {
    pub(super) text: gpui::SharedString,
    pub(super) foreground: libghostty_vt::style::RgbColor,
    pub(super) background: libghostty_vt::style::RgbColor,
    pub(super) style: libghostty_vt::style::Style,
    pub(super) wide: libghostty_vt::screen::CellWide,
}

pub(super) struct Grid {
    pub(super) rows: Vec<Arc<[Cell]>>,
    pub(super) selections: Vec<Option<std::ops::RangeInclusive<u16>>>,
    pub(super) cursor: Option<libghostty_vt::render::Cursor>,
    pub(super) colors: libghostty_vt::render::Colors,
}

#[derive(Default)]
struct Replies {
    bytes: Vec<u8>,
    overflow: bool,
}

pub(super) struct Screen {
    pub(super) terminal: Terminal<'static, 'static>,
    render: RenderState<'static>,
    rows: RowIterator<'static>,
    cells: CellIterator<'static>,
    replies: Rc<RefCell<Replies>>,
    cached_rows: HashMap<libghostty_vt::render::RowId, Arc<[Cell]>>,
    gesture: Gesture<'static>,
    press: PressEvent<'static>,
    drag: DragEvent<'static>,
    release: ReleaseEvent<'static>,
    epoch: Instant,
    content_dirty: bool,
}

impl Screen {
    pub(super) fn new(cols: u16, rows: u16) -> Result<Self> {
        let replies = Rc::new(RefCell::new(Replies::default()));
        let collected = replies.clone();
        let mut terminal = Terminal::new(cols, rows)?;
        use libghostty_vt::style::RgbColor;
        let rgb = |r, g, b| RgbColor { r, g, b };
        terminal.set_default_fg_color(Some(rgb(0xcd, 0xd0, 0xd6)))?;
        terminal.set_default_bg_color(Some(rgb(0x11, 0x13, 0x16)))?;
        terminal.set_default_cursor_color(Some(rgb(0xc4, 0xb5, 0xfd)))?;
        terminal.set_default_cursor_style(Some(libghostty_vt::terminal::CursorStyle::Bar))?;
        terminal.set_default_cursor_blink(Some(true))?;
        let mut palette = terminal.default_color_palette()?;
        for (index, color) in [
            rgb(0x29, 0x2c, 0x33),
            rgb(0xed, 0x85, 0x8b),
            rgb(0xa1, 0xc9, 0x9c),
            rgb(0xdf, 0xc5, 0x91),
            rgb(0x97, 0xb3, 0xd6),
            rgb(0xbb, 0x9c, 0xda),
            rgb(0x8d, 0xbf, 0xc4),
            rgb(0xde, 0xde, 0xe3),
            rgb(0x55, 0x57, 0x53),
            rgb(0xef, 0x29, 0x29),
            rgb(0x8a, 0xe2, 0x34),
            rgb(0xfc, 0xe9, 0x4f),
            rgb(0x72, 0x9f, 0xcf),
            rgb(0xad, 0x7f, 0xa8),
            rgb(0x34, 0xe2, 0xe2),
            rgb(0xee, 0xee, 0xec),
        ]
        .into_iter()
        .enumerate()
        {
            palette.0[index] = color;
        }
        terminal.set_default_color_palette(Some(palette))?;
        terminal.on_pty_write(move |_, bytes| {
            if bytes.starts_with(b"\x1b_G") {
                return;
            }
            let mut replies = collected.borrow_mut();
            if replies.bytes.len().saturating_add(bytes.len()) > 65536 {
                replies.overflow = true;
            } else {
                replies.bytes.extend_from_slice(bytes);
            }
        })?;
        Ok(Self {
            terminal,
            render: RenderState::new()?,
            rows: RowIterator::new()?,
            cells: CellIterator::new()?,
            replies,
            cached_rows: HashMap::new(),
            gesture: Gesture::new()?,
            press: PressEvent::new()?,
            drag: DragEvent::new()?,
            release: ReleaseEvent::new()?,
            epoch: Instant::now(),
            content_dirty: true,
        })
    }

    pub(super) fn write(&mut self, bytes: &[u8]) {
        self.terminal.vt_write(bytes);
        self.content_dirty = true;
    }

    pub(super) fn clear_selection(&mut self) -> Result<()> {
        self.terminal.set_selection(None)?;
        self.gesture.reset(&self.terminal);
        Ok(())
    }

    pub(super) fn prepare_input(&mut self) -> Result<bool> {
        let selected = self.terminal.selection()?.is_some();
        let scrolled = !self.terminal.viewport_active()?;
        self.clear_selection()?;
        if scrolled {
            self.scroll_bottom();
        }
        Ok(selected || scrolled)
    }

    pub(super) fn scroll(&mut self, lines: isize) {
        self.terminal
            .scroll_viewport(libghostty_vt::terminal::ScrollViewport::Delta(lines));
        self.content_dirty = true;
    }

    pub(super) fn scroll_bottom(&mut self) {
        self.terminal
            .scroll_viewport(libghostty_vt::terminal::ScrollViewport::Bottom);
        self.content_dirty = true;
    }

    pub(super) fn select(
        &mut self,
        step: Select,
        coordinate: PointCoordinate,
        position: (f64, f64),
        geometry: Geometry,
    ) -> Result<()> {
        let at = self.terminal.grid_ref(Point::Viewport(coordinate))?;
        let selection = match step {
            Select::Press => {
                self.press.set_position(position.0, position.1)?;
                self.press.set_time(self.epoch.elapsed())?;
                self.press.set_repeat_interval(Duration::from_millis(500))?;
                self.press.set_repeat_distance(256.)?;
                self.press.apply(&mut self.gesture, &self.terminal, at)?
            }
            Select::Drag => {
                self.drag.set_position(position.0, position.1)?;
                let selection = self
                    .drag
                    .apply(&mut self.gesture, &self.terminal, at, geometry)?;
                if selection.is_none() {
                    return Ok(());
                }
                selection
            }
            Select::Release => {
                self.release
                    .apply(&mut self.gesture, &self.terminal, Some(at))?;
                return Ok(());
            }
        };
        self.terminal.set_selection(selection.as_ref())?;
        Ok(())
    }

    pub(super) fn selection_text(&self) -> Result<Option<String>> {
        self.terminal
            .format_selection_alloc(
                None,
                libghostty_vt::selection::FormatOptions::new()
                    .with_unwrap(true)
                    .with_trim(true),
            )?
            .map(|bytes| String::from_utf8(bytes.to_vec()).map_err(Into::into))
            .transpose()
    }

    pub(super) fn paste_bytes(&self, text: &str) -> Result<Vec<u8>> {
        anyhow::ensure!(
            text.len() <= voyager_app::core::MAX_INPUT_BYTES,
            "Clipboard text exceeds the terminal's 64 KiB input limit"
        );
        let mut input = text.as_bytes().to_vec();
        let mut output = vec![0; input.len() + 12];
        let written = libghostty_vt::paste::encode(
            &mut input,
            self.terminal
                .mode(libghostty_vt::terminal::Mode::BRACKETED_PASTE)?,
            &mut output,
        )?;
        anyhow::ensure!(
            written <= voyager_app::core::MAX_INPUT_BYTES,
            "Encoded paste exceeds the terminal's 64 KiB input limit, including bracketed-paste markers"
        );
        output.truncate(written);
        Ok(output)
    }

    pub(super) fn paste(&self, text: &str, send: impl FnOnce(Vec<u8>) -> Result<()>) -> Result<()> {
        send(self.paste_bytes(text)?)
    }

    pub(super) fn replies_overflow(&self) -> bool {
        self.replies.borrow().overflow
    }

    pub(super) fn take_replies(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.replies.borrow_mut().bytes)
    }

    pub(super) fn resize(
        &mut self,
        cols: u16,
        rows: u16,
        cell_width: u32,
        cell_height: u32,
    ) -> Result<Vec<u8>> {
        self.terminal.resize(cols, rows, cell_width, cell_height)?;
        self.content_dirty = true;
        anyhow::ensure!(
            !self.replies.borrow().overflow,
            "Terminal reply limit exceeded"
        );
        Ok(self.take_replies())
    }

    pub(super) fn snapshot(&mut self) -> Result<Grid> {
        let snapshot = self.render.update(&self.terminal)?;
        let colors = snapshot.colors()?;
        let cursor = snapshot.cursor()?;
        let full = snapshot.dirty()? == libghostty_vt::render::Dirty::Full;
        let mut rows = self.rows.update(&snapshot)?;
        let mut output = Vec::new();
        let mut selections = Vec::new();
        let mut previous = std::mem::take(&mut self.cached_rows);
        let mut retained = HashMap::new();
        let mut text = String::new();
        while let Some(row) = rows.next() {
            let id = row.id()?;
            selections.push(row.selection()?.map(|range| range.start_x..=range.end_x));
            if (!self.content_dirty || (!full && !row.dirty()?))
                && let Some(line) = previous.remove(&id)
            {
                output.push(line.clone());
                retained.insert(id, line);
                continue;
            }
            let mut cells = self.cells.update(row)?;
            let mut line = Vec::new();
            while let Some(cell) = cells.next() {
                text.clear();
                if cell.graphemes_len()? != 0 {
                    cell.graphemes_utf8(&mut text)?;
                }
                let style = cell.style()?;
                let mut foreground = cell.fg_color()?.unwrap_or(colors.foreground);
                let mut background = cell.bg_color()?.unwrap_or(colors.background);
                let effective_foreground = if style.inverse {
                    style.bg_color
                } else {
                    style.fg_color
                };
                if style.inverse {
                    std::mem::swap(&mut foreground, &mut background);
                }
                if style.bold
                    && let libghostty_vt::style::StyleColor::Palette(index) = effective_foreground
                    && index.0 < 8
                {
                    foreground = colors.palette[usize::from(index.0) + 8];
                }
                line.push(Cell {
                    text: text.clone().into(),
                    foreground,
                    background,
                    style,
                    wide: cell.raw_cell()?.wide()?,
                });
            }
            let line: Arc<[Cell]> = line.into();
            output.push(line.clone());
            retained.insert(id, line);
        }
        snapshot.clean()?;
        self.cached_rows = retained;
        self.content_dirty = false;
        Ok(Grid {
            rows: output,
            selections,
            cursor: cursor.visible.then_some(cursor),
            colors,
        })
    }

    #[cfg(test)]
    pub(super) fn lines(&mut self) -> Result<Vec<String>> {
        let snapshot = self.render.update(&self.terminal)?;
        let mut rows = self.rows.update(&snapshot)?;
        let mut output = Vec::new();
        let mut text = String::new();
        while let Some(row) = rows.next() {
            let mut cells = self.cells.update(row)?;
            let mut line = String::new();
            while let Some(cell) = cells.next() {
                if cell.graphemes_len()? == 0 {
                    line.push(' ');
                } else {
                    cell.graphemes_utf8(&mut text)?;
                    line.push_str(&text);
                }
            }
            output.push(line);
        }
        Ok(output)
    }
}

impl Drop for Screen {
    fn drop(&mut self) {
        self.gesture.reset(&self.terminal);
    }
}

#[cfg(test)]
mod tests {
    use super::Screen;

    #[test]
    fn input_preparation_only_repaints_selection_or_scrollback() {
        let mut screen = Screen::new(20, 3).unwrap();
        for index in 0..40 {
            screen.write(format!("line-{index}\r\n").as_bytes());
        }
        screen.snapshot().unwrap();
        assert!(!screen.prepare_input().unwrap());
        assert!(!screen.content_dirty);
        screen
            .terminal
            .set_selection(screen.terminal.select_all().unwrap().as_ref())
            .unwrap();
        assert!(screen.terminal.selection().unwrap().is_some());
        assert!(screen.prepare_input().unwrap());
        assert!(screen.terminal.selection().unwrap().is_none());
        assert!(!screen.prepare_input().unwrap());
        screen.scroll(-4);
        assert!(!screen.terminal.viewport_active().unwrap());
        assert!(screen.prepare_input().unwrap());
        assert!(screen.terminal.viewport_active().unwrap());
        assert!(screen.lines().unwrap()[1].starts_with("line-39"));
        assert!(!screen.prepare_input().unwrap());
    }

    #[test]
    fn oversized_bracketed_paste_never_calls_the_input_owner() {
        let mut screen = Screen::new(20, 3).unwrap();
        screen.write(b"\x1b[?2004h");
        let mut calls = 0;
        let result = screen.paste(&"x".repeat(65536), |_| {
            calls += 1;
            Ok(())
        });
        assert!(result.is_err());
        assert_eq!(calls, 0);
        screen
            .paste(&"x".repeat(65524), |bytes| {
                calls += 1;
                assert_eq!(bytes.len(), 65536);
                Ok(())
            })
            .unwrap();
        assert_eq!(calls, 1);
    }

    #[test]
    fn output_waits_for_a_snapshot_and_scrollback_returns_to_the_current_screen() {
        let mut screen = Screen::new(20, 3).unwrap();
        for index in 0..40 {
            screen.write(format!("line-{index}\r\n").as_bytes());
        }
        assert!(screen.cached_rows.is_empty());
        let current = screen.snapshot().unwrap();
        assert_eq!(current.rows[1][0].text, "l");
        assert!(screen.lines().unwrap()[1].starts_with("line-39"));
        screen.scroll(-4);
        let earlier = screen.lines().unwrap();
        assert!(earlier.iter().any(|line| line.starts_with("line-35")));
        screen.scroll_bottom();
        assert!(screen.lines().unwrap()[1].starts_with("line-39"));
        assert!(screen.paste_bytes(&"x".repeat(1_048_577)).is_err());
    }
}
