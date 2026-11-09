use super::{Pane, Select, cursor_offset, paint_colors};
use gpui::prelude::FluentBuilder;
use gpui::{
    Context, InteractiveElement as _, MouseButton, ParentElement as _, Render, Role,
    StatefulInteractiveElement as _, Styled as _, Window, canvas, div, px,
};

impl Render for Pane {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl gpui::IntoElement {
        crate::typing_trace::record("render_start", usize::from(self.dirty));
        crate::redraw_probe::record("terminal_renders", 1);
        if self.dirty {
            match self.screen.snapshot() {
                Ok(grid) => {
                    self.grid = Some(grid);
                    self.dirty = false;
                    crate::typing_trace::record("snapshot_done", 0);
                }
                Err(error) => self.status = format!("Terminal display: {error:#}"),
            }
        }
        let entity = cx.entity();
        let input_entity = entity.clone();
        let input_focus = self.focus.clone();
        self.cell_width = px(super::font::cell_width(
            f32::from(self.font_advance),
            window.scale_factor(),
        ));
        let width = self.cell_width;
        let height = self.cell_height;
        let geometry = self.geometry.clone();
        let terminal_bounds = self.bounds.clone();
        let weak = entity.downgrade();
        #[cfg(feature = "frame-profiler")]
        let glyph = crate::glyph_probe::observe(self.grid.as_ref());
        let measure = canvas(
            move |bounds, window, cx| {
                if bounds.size.width <= px(16.) || bounds.size.height <= px(16.) {
                    terminal_bounds.set(None);
                    return;
                }
                terminal_bounds.set(Some(gpui::Bounds::new(
                    bounds.origin + gpui::point(px(8.), px(8.)),
                    gpui::size(bounds.size.width - px(16.), bounds.size.height - px(16.)),
                )));
                let cols = super::font::fitted_columns(
                    f32::from(bounds.size.width - px(16.)),
                    f32::from(width),
                );
                let rows = ((f32::from(bounds.size.height - px(16.)) / f32::from(height)).floor()
                    as u16)
                    .max(1);
                let scale = window.scale_factor();
                let size = (
                    cols,
                    rows,
                    (f32::from(width) * scale).round().max(1.) as u32,
                    (f32::from(height) * scale).round().max(1.) as u32,
                );
                if geometry.replace(Some(size)) != Some(size) {
                    let weak = weak.clone();
                    window.defer(cx, move |_, cx| {
                        let _ = weak.update(cx, |pane, cx| {
                            if pane.geometry.get() == Some(size) {
                                pane.resize(size.0, size.1, size.2, size.3, cx);
                            }
                        });
                    });
                }
            },
            move |bounds, _, window, cx| {
                crate::typing_trace::record("native_paint_callback", 0);
                #[cfg(feature = "frame-profiler")]
                if let Some(count) = glyph {
                    crate::typing_trace::record("glyph_paint_callback", count);
                }
                window.handle_input(
                    &input_focus,
                    gpui::ElementInputHandler::new(bounds, input_entity),
                    cx,
                );
            },
        )
        .absolute()
        .size_full();
        let color = |value: libghostty_vt::style::RgbColor| {
            gpui::rgb((u32::from(value.r) << 16) | (u32::from(value.g) << 8) | u32::from(value.b))
        };
        let mut rows = Vec::new();
        let row_paint = !window.is_a11y_active()
            && window.text_style().text_overflow.is_none()
            && window.text_style().line_clamp.is_none();
        crate::typing_trace::record(
            "terminal_renderer_mode",
            usize::from(row_paint) | (usize::from(window.is_a11y_active()) << 1),
        );
        if !row_paint {
            self.row_paints.clear();
        }
        if let Some(grid) = &self.grid {
            if row_paint {
                self.row_paints
                    .resize_with(grid.rows.len(), Default::default);
                crate::redraw_probe::record("terminal_canvas_rows", grid.rows.len() as u64);
                crate::typing_trace::record("row_paint_used", grid.rows.len());
            }
            for (y, cells) in grid.rows.iter().enumerate() {
                if row_paint {
                    rows.push(super::row_paint::row(
                        super::row_paint::Input {
                            cells: cells.clone(),
                            selection: grid.selections.get(y).cloned().flatten(),
                            cursor: grid.cursor.filter(|cursor| {
                                cursor
                                    .viewport
                                    .is_some_and(|point| usize::from(point.y) == y)
                            }),
                            y,
                            background: grid.colors.background,
                            foreground: grid.colors.foreground,
                            cursor_color: grid.colors.cursor,
                            width,
                            height,
                            compact: true,
                        },
                        self.row_paints[y].clone(),
                    ));
                    continue;
                }
                let mut row = div()
                    .flex()
                    .flex_row()
                    .w(width * cells.len() as f32)
                    .h(height)
                    .bg(color(grid.colors.background))
                    .flex_none()
                    .whitespace_nowrap();
                let mut preceding_text = false;
                let compact = true;
                let selected = grid.selections.get(y).and_then(Option::as_ref);
                let cursor = grid
                    .cursor
                    .and_then(|cursor| cursor.viewport)
                    .filter(|point| usize::from(point.y) == y)
                    .map(|point| usize::from(point.x));
                for span in super::background::spans(cells, selected, cursor, compact) {
                    let x = span.start;
                    let cell = &cells[x];
                    use libghostty_vt::screen::CellWide;
                    if cell.wide == CellWide::SpacerTail {
                        continue;
                    }
                    let count = span.len();
                    let merged = cell.wide == CellWide::Narrow && count > 1;
                    let span = if cell.wide == CellWide::Wide {
                        2.
                    } else {
                        count as f32
                    };
                    let cursor = grid.cursor.and_then(|cursor| {
                        cursor_offset(cursor, x, y, cell.wide).map(|offset| (cursor, offset))
                    });
                    let cursor_color = grid.colors.cursor.unwrap_or(grid.colors.foreground);
                    let (foreground, background) = paint_colors(
                        cell,
                        selected.is_some_and(|range| range.contains(&(x as u16))),
                        cursor,
                        cursor_color,
                    );
                    let item_width = if merged {
                        px(super::background::span_width(
                            f32::from(width),
                            window.scale_factor(),
                            count,
                        ))
                    } else {
                        width * span
                    };
                    let mut item = div()
                        .relative()
                        .w(item_width)
                        .h(height)
                        .flex_none()
                        .when(
                            preceding_text || background != grid.colors.background,
                            |item| item.bg(color(background)),
                        )
                        .text_color(color(foreground));
                    if cell.style.bold {
                        item = item.font_weight(gpui::FontWeight::BOLD);
                    }
                    if cell.style.italic {
                        item = item.italic();
                    }
                    if cell.style.strikethrough {
                        item = item.line_through();
                    }
                    if cell.style.underline != libghostty_vt::style::Underline::None {
                        item = item.underline();
                    }
                    if !cell.style.invisible && !cell.text.is_empty() {
                        item = item.child(cell.text.clone());
                        preceding_text = true;
                    }
                    if let Some((cursor, offset)) = cursor {
                        use libghostty_vt::render::CursorVisualStyle;
                        let marker = div()
                            .absolute()
                            .left(width * offset as f32)
                            .bg(color(cursor_color));
                        item = match cursor.visual_style {
                            CursorVisualStyle::Bar => item.child(marker.top_0().w(px(1.)).h_full()),
                            CursorVisualStyle::Underline => {
                                item.child(marker.bottom_0().w(width).h(px(1.)))
                            }
                            CursorVisualStyle::BlockHollow => item.child(
                                div()
                                    .absolute()
                                    .left(width * offset as f32)
                                    .top_0()
                                    .w(width)
                                    .h(height)
                                    .border_1()
                                    .border_color(color(cursor_color)),
                            ),
                            CursorVisualStyle::Block if offset != 0 => {
                                item.child(marker.top_0().w(width).h(height))
                            }
                            CursorVisualStyle::Block => item,
                            _ => item.child(
                                div()
                                    .absolute()
                                    .left(width * offset as f32)
                                    .top_0()
                                    .w(width)
                                    .h(height)
                                    .border_1()
                                    .border_color(color(cursor_color)),
                            ),
                        };
                    }
                    row = row.child(item);
                }
                rows.push(row);
            }
        }
        let marked = self
            .grid
            .as_ref()
            .and_then(|grid| grid.cursor)
            .and_then(|cursor| cursor.viewport)
            .filter(|_| !self.composition.text.is_empty())
            .map(|cursor| {
                div()
                    .absolute()
                    .left(px(8.) + width * f32::from(cursor.x))
                    .top(px(8.) + height * cursor.y as f32)
                    .h(height)
                    .bg(gpui::rgb(0x111316))
                    .text_color(gpui::rgb(0xcdd0d6))
                    .underline()
                    .whitespace_nowrap()
                    .child(self.composition.text.clone())
            });
        div()
            .id("terminal")
            .track_focus(&self.focus)
            .role(Role::Terminal)
            .aria_label("Terminal")
            .flex()
            .flex_col()
            .size_full()
            .min_w_0()
            .min_h_0()
            .p(px(8.))
            .font_family(self.font_family.clone())
            .text_size(px(13.))
            .line_height(height)
            .text_color(gpui::rgb(0xcdd0d6))
            .overflow_hidden()
            .child(measure)
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|pane, event: &gpui::MouseDownEvent, window, cx| {
                    pane.focus.focus(window, cx);
                    pane.selecting = true;
                    if let Err(error) = pane.select(Select::Press, event.position) {
                        pane.status = format!("Selection: {error:#}");
                    }
                    cx.notify();
                }),
            )
            .on_mouse_move(cx.listener(|pane, event: &gpui::MouseMoveEvent, _, cx| {
                if pane.selecting && event.pressed_button == Some(MouseButton::Left) {
                    if let Err(error) = pane.select(Select::Drag, event.position) {
                        pane.status = format!("Selection: {error:#}");
                    }
                    cx.notify();
                }
            }))
            .on_mouse_up(
                MouseButton::Left,
                cx.listener(|pane, event: &gpui::MouseUpEvent, _, cx| {
                    pane.selecting = false;
                    if let Err(error) = pane.select(Select::Release, event.position) {
                        pane.status = format!("Selection: {error:#}");
                    }
                    cx.notify();
                }),
            )
            .on_mouse_up_out(
                MouseButton::Left,
                cx.listener(|pane, event: &gpui::MouseUpEvent, _, cx| {
                    if pane.selecting {
                        pane.selecting = false;
                        if let Err(error) = pane.select(Select::Release, event.position) {
                            pane.status = format!("Selection: {error:#}");
                        }
                        cx.notify();
                    }
                }),
            )
            .on_scroll(cx.listener(|pane, event: &gpui::ScrollEvent, _, cx| {
                pane.scroll_fraction -= f32::from(event.delta.pixel_delta(pane.cell_height).y)
                    / f32::from(pane.cell_height);
                let lines = pane.scroll_fraction.trunc() as isize;
                pane.scroll_fraction -= lines as f32;
                pane.screen.scroll(lines);
                pane.dirty = true;
                cx.notify();
                cx.stop_propagation();
            }))
            .on_key_down(move |event, _, cx| {
                crate::typing_trace::record("key_received", 0);
                if event.keystroke.modifiers.control && event.keystroke.key == "q" {
                    return;
                }
                if !entity.read(cx).composition.text.is_empty() {
                    return;
                }
                if super::input::workspace_shortcut(&event.keystroke) {
                    return;
                }
                entity.update(cx, |pane, cx| {
                    let modifiers = event.keystroke.modifiers;
                    let clipboard = if cfg!(target_os = "macos") {
                        modifiers.platform && !modifiers.control && !modifiers.alt
                    } else {
                        modifiers.control
                            && modifiers.shift
                            && !modifiers.alt
                            && !modifiers.platform
                    };
                    let result = if clipboard && event.keystroke.key == "c" {
                        pane.screen.selection_text().map(|text| {
                            if let Some(text) = text {
                                cx.write_to_clipboard(gpui::ClipboardItem::new_string(text));
                            }
                        })
                    } else if clipboard && event.keystroke.key == "v" {
                        cx.read_from_clipboard()
                            .and_then(|item| item.text())
                            .map_or(Ok(()), |text| pane.paste_text(&text))
                    } else {
                        pane.key(event)
                    };
                    if let Err(error) = result {
                        pane.status = format!("Input: {error:#}");
                        cx.notify();
                    } else if pane.dirty {
                        cx.notify();
                    }
                });
                cx.stop_propagation();
            })
            .children(rows)
            .children(marked)
            .when(!self.status.is_empty(), |view| {
                view.child(
                    div()
                        .absolute()
                        .bottom_0()
                        .left_0()
                        .bg(gpui::rgb(0x351e25))
                        .child(self.status.clone()),
                )
            })
    }
}
