use crate::terminal_screen::Grid;
use std::sync::LazyLock;

const EXPECTED: &[u8] = b"xvqzjkmnprst";

static ENABLED: LazyLock<bool> = LazyLock::new(|| {
    std::env::var("VOYAGER_TYPING_TRACE").as_deref() == Ok("1")
        && std::env::var("VOYAGER_WORKSPACE_SESSION")
            .is_ok_and(|session| session.starts_with("voyager-typing-"))
});

fn prefix<'a>(mut cells: impl Iterator<Item = &'a str>) -> Option<usize> {
    let expected = EXPECTED;
    if cells.find(|cell| !cell.is_empty() && *cell != " ") != Some("›") || cells.next() != Some(" ")
    {
        return None;
    }
    let mut count = 0;
    while let Some(cell) = cells.next() {
        if count < expected.len() && cell.as_bytes() == &expected[count..count + 1] {
            count += 1;
        } else if (cell.is_empty() || cell == " ")
            && cells.all(|cell| cell.is_empty() || cell == " ")
        {
            break;
        } else {
            return None;
        }
    }
    (count > 0).then_some(count)
}

fn parsed_prefix(terminal: &libghostty_vt::Terminal<'_, '_>) -> Option<usize> {
    use libghostty_vt::terminal::{Point, PointCoordinate};
    if terminal.cols().ok()? != 145 || terminal.rows().ok()? != 39 {
        return None;
    }
    let mut cells = [""; 145];
    for (x, cell) in cells.iter_mut().enumerate() {
        let at = terminal
            .grid_ref(Point::Viewport(PointCoordinate { x: x as u16, y: 35 }))
            .ok()?;
        let mut glyph = ['\0'];
        *cell = match at.graphemes(&mut glyph).ok()? {
            0 => "",
            1 if glyph[0] == '›' => "›",
            1 if glyph[0] == ' ' => " ",
            1 => {
                let index = EXPECTED
                    .iter()
                    .position(|value| char::from(*value) == glyph[0])?;
                std::str::from_utf8(&EXPECTED[index..index + 1]).ok()?
            }
            _ => return None,
        };
    }
    prefix(cells.into_iter())
}

pub(crate) fn observe_parsed(terminal: &libghostty_vt::Terminal<'_, '_>) {
    if !*ENABLED {
        return;
    }
    crate::diagnostics::trace("glyph_scan_start", 0);
    let count = parsed_prefix(terminal);
    crate::diagnostics::trace("glyph_scan_end", 0);
    if let Some(count) = count {
        crate::diagnostics::trace("glyph_parsed", count);
    }
}

pub(crate) fn observe(grid: Option<&Grid>) -> Option<usize> {
    if !*ENABLED {
        return None;
    }
    let mut found = None;
    for row in &grid?.rows {
        if let Some(count) = prefix(row.iter().map(|cell| cell.text.as_ref()))
            && found.replace(count).is_some()
        {
            return None;
        }
    }
    if let Some(count) = found {
        crate::diagnostics::trace("glyph_snapshot", count);
    }
    found
}

#[cfg(test)]
mod tests {
    #[test]
    fn parsed_probe_reads_the_real_viewport_without_cleaning_render_state() {
        let mut screen = crate::terminal_screen::Screen::new(145, 39).unwrap();
        for count in 1..=12 {
            screen.write(format!("\x1b[36;1H› {}", &"xvqzjkmnprst"[..count]).as_bytes());
            assert_eq!(super::parsed_prefix(&screen.terminal), Some(count));
            let grid = screen.snapshot().unwrap();
            assert_eq!(
                super::prefix(grid.rows[35].iter().map(|cell| cell.text.as_ref())),
                Some(count)
            );
        }
        for text in ["› xq", "› xv extra", "› x\u{301}", "report › xv"] {
            screen.write(format!("\x1b[2J\x1b[36;1H{text}").as_bytes());
            assert_eq!(super::parsed_prefix(&screen.terminal), None);
        }
        screen.write(b"\x1b[2J\x1b[35;1H");
        screen.write("› xv".as_bytes());
        assert_eq!(super::parsed_prefix(&screen.terminal), None);
        assert_eq!(
            super::parsed_prefix(
                &crate::terminal_screen::Screen::new(144, 39)
                    .unwrap()
                    .terminal
            ),
            None
        );
    }

    #[test]
    fn only_the_exact_probe_prefix_at_a_prompt_is_reported() {
        let observed = |row: &[&str]| super::prefix(row.iter().copied());
        assert_eq!(observed(&[" ", "›", " ", "x", "v", "", " "]), Some(2));
        assert_eq!(
            observed(&[
                "›", " ", "x", "v", "q", "z", "j", "k", "m", "n", "p", "r", "s", "t"
            ]),
            Some(12)
        );
        for row in [
            vec!["x", "v", "q"],
            vec!["report", " ", "›", " ", "x", "v"],
            vec!["›", " ", "", " "],
            vec!["›", "x", "v"],
            vec!["›", " ", "x", "q"],
            vec!["›", " ", "x", " ", "v"],
            vec![
                "›", " ", "x", "v", "q", "z", "j", "k", "m", "n", "p", "r", "s", "t", "u",
            ],
        ] {
            assert_eq!(observed(&row), None);
        }
    }
}
