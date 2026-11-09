use crate::terminal_screen::Cell;
use std::ops::{Range, RangeInclusive};

pub(super) fn spans<'a>(
    cells: &'a [Cell],
    selection: Option<&'a RangeInclusive<u16>>,
    cursor: Option<usize>,
    compact: bool,
) -> impl Iterator<Item = Range<usize>> + 'a {
    let tail = if compact {
        cells
            .iter()
            .rposition(|cell| {
                !cell.text.is_empty()
                    || cell.wide != libghostty_vt::screen::CellWide::Narrow
                    || cell.style.underline != libghostty_vt::style::Underline::None
                    || cell.style.strikethrough
            })
            .map_or(0, |column| column + 1)
            .max(cursor.map_or(0, |column| column.saturating_add(1)))
    } else {
        cells.len()
    };
    let selected =
        move |column: usize| selection.is_some_and(|range| range.contains(&(column as u16)));
    let mut start = 0;
    std::iter::from_fn(move || {
        if start >= cells.len() {
            return None;
        }
        let from = start;
        start += 1;
        if from >= tail {
            while start < cells.len()
                && cells[start].background == cells[from].background
                && selected(start) == selected(from)
            {
                start += 1;
            }
        }
        Some(from..start)
    })
}

pub(super) fn span_width(cell_width: f32, scale: f32, cells: usize) -> f32 {
    (cell_width * scale - 0.5).ceil() * cells as f32 / scale
}

#[cfg(test)]
mod tests {
    use super::span_width;
    use crate::terminal_screen::Screen;
    use std::ops::{Range, RangeInclusive};
    use std::sync::Arc;

    fn row(text: &str) -> Arc<[crate::terminal_screen::Cell]> {
        let mut screen = Screen::new(10, 2).unwrap();
        screen.write(text.as_bytes());
        screen.snapshot().unwrap().rows[0].clone()
    }

    fn spans(
        cells: &[crate::terminal_screen::Cell],
        selection: Option<&RangeInclusive<u16>>,
        cursor: Option<usize>,
        compact: bool,
    ) -> Vec<Range<usize>> {
        super::spans(cells, selection, cursor, compact).collect()
    }

    #[test]
    fn merged_width_preserves_each_original_device_pixel_cell() {
        for (width, scale, cells, expected) in [
            (7.9, 2., 100, 800.),
            (7.9, 1., 100, 800.),
            (7.9, 1.25, 100, 800.),
            (7.9, 1.5, 100, 800.),
            (7.25, 2., 2, 14.),
            (6.2, 1.25, 10, 64.),
        ] {
            assert_eq!(span_width(width, scale, cells), expected);
        }
    }

    #[test]
    fn compact_empty_tail_keeps_every_column_and_the_printed_cells() {
        let cells = row("x ");
        let compact = spans(&cells, None, None, true);
        assert_eq!(compact, vec![0..1, 1..2, 2..10]);
        assert_eq!(
            compact.into_iter().flatten().collect::<Vec<_>>(),
            (0..10).collect::<Vec<_>>()
        );
        assert_eq!(spans(&cells, None, None, false).len(), 10);
    }

    #[test]
    fn background_selection_and_cursor_boundaries_stay_separate() {
        let colours = row("x\x1b[44m\x1b[3X\x1b[0m");
        assert_eq!(spans(&colours, None, None, true), vec![0..1, 1..4, 4..10]);
        let cells = row("x\x1b[44m\x1b[K");
        assert_eq!(
            spans(&cells, Some(&(3..=5)), None, true),
            vec![0..1, 1..3, 3..6, 6..10]
        );
        assert_eq!(
            spans(&cells, None, Some(2), true),
            vec![0..1, 1..2, 2..3, 3..10]
        );
        assert!(
            spans(&cells, None, Some(usize::MAX), true)
                .iter()
                .all(|span| span.len() == 1)
        );
    }

    #[test]
    fn wide_combining_and_decorated_cells_retain_their_original_slots() {
        let cells = row("界e\u{301}");
        assert_eq!(
            spans(&cells, None, None, true),
            vec![0..1, 1..2, 2..3, 3..10]
        );
        let decorated = row("x\x1b[4m \x1b[0m");
        assert_eq!(decorated[1].text, " ");
        assert_ne!(
            decorated[1].style.underline,
            libghostty_vt::style::Underline::None
        );
        assert_eq!(spans(&decorated, None, None, true), vec![0..1, 1..2, 2..10]);
    }
}
