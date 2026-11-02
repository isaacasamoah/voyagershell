use super::Pane;
use gpui::{Bounds, ClipboardItem, Context, EntityInputHandler, Pixels, UTF16Selection, Window};
use std::ops::Range;

#[derive(Default)]
pub(super) struct Composition {
    pub(super) text: String,
    selection: Range<usize>,
}

impl Composition {
    pub(super) fn clear(&mut self) {
        self.text.clear();
        self.selection = 0..0;
    }

    fn range(&self, range: Range<usize>) -> (Range<usize>, Range<usize>) {
        let boundary = |offset: usize, end: bool| {
            let mut units = 0;
            for (byte, character) in self.text.char_indices() {
                if units >= offset || (!end && units + character.len_utf16() > offset) {
                    return (byte, units);
                }
                units += character.len_utf16();
            }
            (self.text.len(), units)
        };
        let start = boundary(range.start, false);
        let end = if range.start == range.end {
            start
        } else {
            boundary(range.end.max(range.start), true)
        };
        (start.0..end.0, start.1..end.1)
    }

    fn mark(
        &mut self,
        range: Option<Range<usize>>,
        text: &str,
        selected: Option<Range<usize>>,
    ) -> anyhow::Result<()> {
        let (bytes, units) = self.range(range.unwrap_or(0..self.text.encode_utf16().count()));
        anyhow::ensure!(
            !text.contains(['\n', '\r']),
            "Composition preview must be one line"
        );
        anyhow::ensure!(
            self.text.len() - bytes.len() + text.len() <= voyager_app::core::MAX_INPUT_BYTES,
            "Composition exceeds 64 KiB"
        );
        self.text.replace_range(bytes, text);
        let length = text.encode_utf16().count();
        let selected = selected.unwrap_or(length..length);
        self.selection = self
            .range(
                (units.start + selected.start.min(length))
                    ..(units.start + selected.end.min(length)),
            )
            .1;
        Ok(())
    }
}

impl EntityInputHandler for Pane {
    fn text_for_range(
        &mut self,
        range: Range<usize>,
        adjusted: &mut Option<Range<usize>>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<String> {
        let (bytes, units) = self.composition.range(range);
        *adjusted = Some(units);
        Some(self.composition.text[bytes].to_owned())
    }

    fn selected_text_range(
        &mut self,
        _: bool,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<UTF16Selection> {
        Some(UTF16Selection {
            range: self.composition.selection.clone(),
            reversed: false,
        })
    }

    fn marked_text_range(&self, _: &mut Window, _: &mut Context<Self>) -> Option<Range<usize>> {
        (!self.composition.text.is_empty()).then(|| 0..self.composition.text.encode_utf16().count())
    }

    fn unmark_text(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.composition.clear();
        window.notify_text_input_changed(&self.focus);
        cx.notify();
    }

    fn paste(&mut self, item: ClipboardItem, _: &mut Window, cx: &mut Context<Self>) {
        if let Some(text) = item.text() {
            if let Err(error) = self.paste_text(&text) {
                self.status = format!("Paste: {error:#}");
            }
            cx.notify();
        }
    }

    fn replace_text_in_range(
        &mut self,
        _: Option<Range<usize>>,
        text: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if text.len() > voyager_app::core::MAX_INPUT_BYTES {
            self.status = "Composition exceeds 64 KiB".into();
        } else if let Err(error) = self.send(text.as_bytes().to_vec()) {
            self.status = format!("Input: {error:#}");
        }
        self.composition.clear();
        window.notify_text_input_changed(&self.focus);
        cx.notify();
    }

    fn replace_and_mark_text_in_range(
        &mut self,
        range: Option<Range<usize>>,
        text: &str,
        selected: Option<Range<usize>>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if let Err(error) = self.composition.mark(range, text, selected) {
            self.status = format!("Input: {error:#}");
        }
        window.notify_text_input_changed(&self.focus);
        cx.notify();
    }

    fn bounds_for_range(
        &mut self,
        range: Range<usize>,
        _: Bounds<Pixels>,
        window: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<Bounds<Pixels>> {
        let bounds = self.bounds.get()?;
        let cursor = self.grid.as_ref()?.cursor?.viewport?;
        let bytes = self.composition.range(range).0;
        let prefix = &self.composition.text[..bytes.start];
        let offset = window
            .text_system()
            .shape_line(
                prefix.to_owned().into(),
                gpui::px(13.),
                &[gpui::TextRun {
                    len: prefix.len(),
                    font: gpui::font("DejaVu Sans Mono"),
                    ..Default::default()
                }],
                None,
            )
            .width;
        Some(Bounds::new(
            bounds.origin
                + gpui::point(
                    self.cell_width * f32::from(cursor.x) + offset,
                    self.cell_height * cursor.y as f32,
                ),
            gpui::size(self.cell_width, self.cell_height),
        ))
    }

    fn character_index_for_point(
        &mut self,
        _: gpui::Point<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<usize> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::Composition;

    #[test]
    fn composition_tracks_utf16_without_splitting_surrogate_pairs() {
        let mut composition = Composition::default();
        composition.mark(None, "a😀界", Some(1..3)).unwrap();
        assert_eq!(composition.selection, 1..3);
        assert_eq!(composition.range(2..3), (1..5, 1..3));
        composition.mark(Some(1..3), "é", Some(1..1)).unwrap();
        assert_eq!(composition.text, "aé界");
        assert_eq!(composition.selection, 2..2);
        composition.clear();
        assert!(composition.text.is_empty());
        assert_eq!(composition.selection, 0..0);
    }

    #[test]
    fn oversized_composition_preserves_the_previous_preview() {
        let mut composition = Composition::default();
        composition.mark(None, "preview", None).unwrap();
        assert!(composition.mark(None, &"x".repeat(65537), None).is_err());
        assert_eq!(composition.text, "preview");
    }
}
