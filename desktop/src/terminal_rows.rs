use super::{Cell, cursor_offset, paint_colors};
use gpui::{
    BorderStyle, Bounds, Font, FontStyle, FontWeight, ParentElement as _, Pixels, ShapedLine,
    StrikethroughStyle, Styled as _, TextAlign, TextRun, UnderlineStyle, Window, canvas, div, fill,
    outline, point, px, rgb, size,
};
use libghostty_vt::{
    render::{Cursor, CursorVisualStyle},
    screen::CellWide,
    style::{RgbColor, Underline},
};
use std::{cell::RefCell, ops::RangeInclusive, rc::Rc, sync::Arc};

pub(super) type Cache = Rc<RefCell<Option<Rc<Plan>>>>;

#[derive(PartialEq)]
pub(super) struct Input {
    pub(super) cells: Arc<[Cell]>,
    pub(super) selection: Option<RangeInclusive<u16>>,
    pub(super) cursor: Option<Cursor>,
    pub(super) y: usize,
    pub(super) background: RgbColor,
    pub(super) foreground: RgbColor,
    pub(super) cursor_color: Option<RgbColor>,
    pub(super) width: Pixels,
    pub(super) height: Pixels,
    pub(super) compact: bool,
}

#[derive(PartialEq)]
struct Key {
    input: Input,
    font: Font,
    font_size: Pixels,
    line_height: Pixels,
    align: TextAlign,
    background: Option<gpui::Hsla>,
    underline: Option<UnderlineStyle>,
    strikethrough: Option<StrikethroughStyle>,
    scale: f32,
}

enum Draw {
    Fill(Bounds<Pixels>, RgbColor),
    Glyph(Pixels, Pixels, Box<ShapedLine>),
    Outline(Bounds<Pixels>, RgbColor),
}

pub(super) struct Plan {
    key: Key,
    draws: Vec<Draw>,
}

fn snapped(value: Pixels, scale: f32) -> Pixels {
    px((f32::from(value) * scale - 0.5).ceil() / scale)
}

fn color(value: RgbColor) -> gpui::Rgba {
    rgb((u32::from(value.r) << 16) | (u32::from(value.g) << 8) | u32::from(value.b))
}

impl Plan {
    fn new(key: Key, window: &mut Window) -> Self {
        let input = &key.input;
        let cursor_column = input
            .cursor
            .and_then(|cursor| cursor.viewport)
            .map(|point| usize::from(point.x));
        let mut draws = Vec::new();
        let mut preceding_text = false;
        let height = snapped(input.height, key.scale);
        for span in super::background::spans(
            &input.cells,
            input.selection.as_ref(),
            cursor_column,
            input.compact,
        ) {
            let x = span.start;
            let cell = &input.cells[x];
            if cell.wide == CellWide::SpacerTail {
                continue;
            }
            let left = input.width * x as f32;
            let width = if cell.wide == CellWide::Wide {
                input.width * 2.
            } else {
                px(super::background::span_width(
                    f32::from(input.width),
                    key.scale,
                    span.len(),
                ))
            };
            let cursor = input.cursor.and_then(|cursor| {
                cursor_offset(cursor, x, input.y, cell.wide).map(|offset| (cursor, offset))
            });
            let cursor_color = input.cursor_color.unwrap_or(input.foreground);
            let (foreground, background) = paint_colors(
                cell,
                input
                    .selection
                    .as_ref()
                    .is_some_and(|range| range.contains(&(x as u16))),
                cursor,
                cursor_color,
            );
            if preceding_text || background != input.background {
                draws.push(Draw::Fill(
                    Bounds::new(point(left, px(0.)), size(width, height)),
                    background,
                ));
            }
            if !cell.style.invisible && !cell.text.is_empty() {
                let mut font = key.font.clone();
                if cell.style.bold {
                    font.weight = FontWeight::BOLD;
                }
                if cell.style.italic {
                    font.style = FontStyle::Italic;
                }
                let run = TextRun {
                    len: cell.text.len(),
                    font,
                    color: color(foreground).into(),
                    background_color: key.background,
                    underline: (cell.style.underline != Underline::None)
                        .then_some(UnderlineStyle {
                            thickness: px(1.),
                            ..Default::default()
                        })
                        .or(key.underline),
                    strikethrough: cell
                        .style
                        .strikethrough
                        .then_some(StrikethroughStyle {
                            thickness: px(1.),
                            ..Default::default()
                        })
                        .or(key.strikethrough),
                };
                let line =
                    window
                        .text_system()
                        .shape_line(cell.text.clone(), key.font_size, &[run], None);
                draws.push(Draw::Glyph(left, width, Box::new(line)));
                preceding_text = true;
            }
            if let Some((cursor, offset)) = cursor {
                let cursor_left = left + snapped(input.width * offset as f32, key.scale);
                let bounds = Bounds::new(
                    point(cursor_left, px(0.)),
                    size(snapped(input.width, key.scale), height),
                );
                match cursor.visual_style {
                    CursorVisualStyle::Bar => draws.push(Draw::Fill(
                        Bounds::new(bounds.origin, size(snapped(px(1.), key.scale), height)),
                        cursor_color,
                    )),
                    CursorVisualStyle::Underline => {
                        let thick = snapped(px(1.), key.scale);
                        draws.push(Draw::Fill(
                            Bounds::new(
                                point(cursor_left, height - thick),
                                size(bounds.size.width, thick),
                            ),
                            cursor_color,
                        ));
                    }
                    CursorVisualStyle::BlockHollow => {
                        draws.push(Draw::Outline(bounds, cursor_color))
                    }
                    CursorVisualStyle::Block if offset != 0 => {
                        draws.push(Draw::Fill(bounds, cursor_color))
                    }
                    CursorVisualStyle::Block => {}
                    _ => draws.push(Draw::Outline(bounds, cursor_color)),
                }
            }
        }
        Self { key, draws }
    }
}

pub(super) fn row(input: Input, cache: Cache) -> gpui::Div {
    let width = input.width * input.cells.len() as f32;
    let height = input.height;
    let background = input.background;
    div()
        .flex()
        .flex_row()
        .w(width)
        .h(height)
        .bg(color(background))
        .flex_none()
        .whitespace_nowrap()
        .child(
            canvas(
                move |_, window, _| {
                    let style = window.text_style();
                    let key = Key {
                        input,
                        font: style.font(),
                        font_size: style.font_size.to_pixels(window.rem_size()),
                        line_height: window.pixel_snap(
                            style
                                .line_height
                                .to_pixels(style.font_size, window.rem_size()),
                        ),
                        align: style.text_align,
                        background: style.background_color,
                        underline: style.underline,
                        strikethrough: style.strikethrough,
                        scale: window.scale_factor(),
                    };
                    if let Some(plan) = cache.borrow().as_ref().filter(|plan| plan.key == key) {
                        return plan.clone();
                    }
                    let plan = Rc::new(Plan::new(key, window));
                    *cache.borrow_mut() = Some(plan.clone());
                    plan
                },
                move |bounds, plan, window, cx| {
                    for draw in &plan.draws {
                        match draw {
                            Draw::Fill(rect, value) => window.paint_quad(fill(
                                Bounds::new(bounds.origin + rect.origin, rect.size),
                                color(*value),
                            )),
                            Draw::Outline(rect, value) => window.paint_quad(outline(
                                Bounds::new(bounds.origin + rect.origin, rect.size),
                                color(*value),
                                BorderStyle::Solid,
                            )),
                            Draw::Glyph(left, width, line) => {
                                if plan.key.background.is_some()
                                    && let Err(error) = line.paint_background(
                                        bounds.origin + point(*left, px(0.)),
                                        plan.key.line_height,
                                        plan.key.align,
                                        Some(*width),
                                        window,
                                        cx,
                                    )
                                {
                                    eprintln!("Terminal row background failed: {error:#}");
                                }
                                if let Err(error) = line.paint(
                                    bounds.origin + point(*left, px(0.)),
                                    plan.key.line_height,
                                    plan.key.align,
                                    Some(*width),
                                    window,
                                    cx,
                                ) {
                                    eprintln!("Terminal row paint failed: {error:#}");
                                }
                            }
                        }
                    }
                },
            )
            .size_full(),
        )
}
