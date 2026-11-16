use anyhow::Result;
use libghostty_vt::{
    Terminal,
    key::Key,
    screen::{CellWide, RowSemanticPrompt, Screen},
    terminal::{Point, PointCoordinate},
};

#[derive(Clone, Copy)]
pub(super) struct Press {
    pub(super) cell: PointCoordinate,
    pub(super) clicks: usize,
}

#[derive(Debug, PartialEq, Eq)]
pub(super) struct Move {
    pub(super) key: Key,
    pub(super) count: usize,
}

pub(super) fn plan(
    terminal: &Terminal<'_, '_>,
    press: Press,
    released: Option<PointCoordinate>,
    composing: bool,
) -> Result<Option<Move>> {
    if press.clicks != 1
        || released != Some(press.cell)
        || composing
        || terminal.selection()?.is_some()
    {
        return Ok(None);
    }
    let target = press.cell;
    if terminal.active_screen()? == Screen::Alternate
        || terminal.is_mouse_tracking()?
        || !terminal.viewport_active()?
        || command_running(terminal)?
    {
        return Ok(None);
    }
    let columns = terminal.cols()?;
    let cursor = (
        u32::from(terminal.cursor_y()?),
        terminal.cursor_x()? + u16::from(terminal.is_cursor_pending_wrap()?),
    );
    let cell = |x: u16, y: u32| -> Result<_> {
        Ok(terminal
            .grid_ref(Point::Viewport(PointCoordinate { x, y }))?
            .cell()?)
    };
    let tail = cell(target.x, target.y)?.wide()? == CellWide::SpacerTail;
    let clicked = (target.y, target.x.saturating_sub(u16::from(tail)));
    let (first, last, key) = if clicked < cursor {
        (clicked, cursor, Key::ArrowLeft)
    } else {
        (cursor, clicked, Key::ArrowRight)
    };
    if first == last {
        return Ok(None);
    }
    for row in first.0..last.0 {
        let wrapped = terminal
            .grid_ref(Point::Viewport(PointCoordinate { x: 0, y: row }))?
            .row()?
            .is_wrapped()?;
        if !wrapped {
            return Ok(None);
        }
    }
    let mut count = 0;
    for row in first.0..=last.0 {
        let start = if row == first.0 { first.1 } else { 0 };
        let end = if row == last.0 { last.1 } else { columns };
        for x in start..end {
            count += usize::from(matches!(
                cell(x, row)?.wide()?,
                CellWide::Narrow | CellWide::Wide
            ));
        }
    }
    Ok((count > 0).then_some(Move { key, count }))
}

fn command_running(terminal: &Terminal<'_, '_>) -> Result<bool> {
    if terminal.is_cursor_at_prompt()? {
        return Ok(false);
    }
    for row in 0..=u32::from(terminal.cursor_y()?) {
        let mark = terminal
            .grid_ref(Point::Viewport(PointCoordinate { x: 0, y: row }))?
            .row()?
            .semantic_prompt()?;
        if mark != RowSemanticPrompt::None {
            return Ok(true);
        }
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::{Move, Press, plan};
    use libghostty_vt::{Terminal, key::Key, terminal::PointCoordinate};

    fn at(x: u16, y: u32) -> Press {
        Press {
            cell: PointCoordinate { x, y },
            clicks: 1,
        }
    }

    fn click(terminal: &Terminal<'_, '_>, x: u16, y: u32) -> Option<Move> {
        let press = at(x, y);
        plan(terminal, press, Some(press.cell), false).unwrap()
    }

    fn left(count: usize) -> Option<Move> {
        Some(Move {
            key: Key::ArrowLeft,
            count,
        })
    }

    fn right(count: usize) -> Option<Move> {
        Some(Move {
            key: Key::ArrowRight,
            count,
        })
    }

    fn shell(text: &str) -> Terminal<'static, 'static> {
        let mut terminal = Terminal::new(20, 6).unwrap();
        terminal.vt_write(text.as_bytes());
        terminal
    }

    #[test]
    fn a_click_left_of_the_cursor_sends_left_arrows_for_the_characters_between() {
        let terminal = shell("> echo abcdef");
        assert_eq!(click(&terminal, 9, 0), left(4));
        assert_eq!(click(&terminal, 2, 0), left(11));
    }

    #[test]
    fn a_click_right_of_the_cursor_sends_right_arrows_and_the_cursor_cell_sends_nothing() {
        let terminal = shell("> echo abcdef\x1b[5D");
        assert_eq!(click(&terminal, 12, 0), right(4));
        assert_eq!(click(&terminal, 8, 0), None);
    }

    #[test]
    fn a_wide_character_and_its_spacer_count_once() {
        let terminal = shell("ab界cd");
        assert_eq!(click(&terminal, 0, 0), left(5));
        assert_eq!(click(&terminal, 4, 0), left(2));
        assert_eq!(click(&terminal, 3, 0), left(3));
        assert_eq!(click(&terminal, 2, 0), left(3));
    }

    #[test]
    fn a_click_on_another_row_sends_nothing() {
        let terminal = shell("one\r\ntwo\r\n> abc");
        assert_eq!(click(&terminal, 1, 0), None);
        assert_eq!(click(&terminal, 1, 1), None);
        assert_eq!(click(&terminal, 3, 3), None);
        assert_eq!(click(&terminal, 3, 2), left(2));
    }

    #[test]
    fn a_click_across_a_soft_wrap_counts_the_characters_of_the_logical_line() {
        let terminal = shell("0123456789ABCDEFGHIJxyz");
        assert_eq!(click(&terminal, 18, 0), left(5));
        assert_eq!(click(&terminal, 0, 0), left(23));
    }

    #[test]
    fn a_click_after_output_that_fills_the_row_counts_the_pending_wrap() {
        let terminal = shell("0123456789ABCDEFGHIJ");
        assert_eq!(click(&terminal, 19, 0), left(1));
        assert_eq!(click(&terminal, 0, 0), left(20));
    }

    #[test]
    fn a_click_across_a_hard_newline_sends_nothing() {
        let terminal = shell("first\r\nsecond");
        assert_eq!(click(&terminal, 2, 0), None);
        assert_eq!(click(&terminal, 2, 1), left(4));
    }

    #[test]
    fn a_click_on_the_alternate_screen_sends_nothing() {
        let terminal = shell("\x1b[?1049h> abc");
        assert_eq!(click(&terminal, 0, 0), None);
    }

    #[test]
    fn a_click_under_mouse_tracking_sends_nothing_on_either_screen() {
        let mut terminal = shell("> abc\x1b[?1000h");
        assert_eq!(click(&terminal, 0, 0), None);
        terminal.vt_write(b"\x1b[?1000l");
        assert_eq!(click(&terminal, 0, 0), left(5));
    }

    #[test]
    fn a_click_while_scrolled_back_sends_nothing() {
        let mut terminal = Terminal::new(20, 3).unwrap();
        for index in 0..30 {
            terminal.vt_write(format!("line-{index}\r\n").as_bytes());
        }
        terminal.vt_write(b"> abc");
        assert_eq!(click(&terminal, 0, 2), left(5));
        terminal.scroll_viewport(libghostty_vt::terminal::ScrollViewport::Delta(-2));
        assert_eq!(click(&terminal, 0, 2), None);
    }

    #[test]
    fn a_double_click_a_moved_release_a_selection_and_composition_send_nothing() {
        let terminal = shell("> abc");
        let press = at(0, 0);
        let released = Some(press.cell);
        assert!(plan(&terminal, press, released, false).unwrap().is_some());
        let double = Press { clicks: 2, ..press };
        assert_eq!(plan(&terminal, double, released, false).unwrap(), None);
        let moved = Some(PointCoordinate { x: 1, y: 0 });
        assert_eq!(plan(&terminal, press, moved, false).unwrap(), None);
        assert_eq!(plan(&terminal, press, None, false).unwrap(), None);
        assert_eq!(plan(&terminal, press, released, true).unwrap(), None);
        terminal
            .set_selection(terminal.select_all().unwrap().as_ref())
            .unwrap();
        assert_eq!(plan(&terminal, press, released, false).unwrap(), None);
    }

    #[test]
    fn prompt_marks_hold_the_click_back_only_while_a_command_runs() {
        let mut terminal = shell("\x1b]133;A\x1b\\$ \x1b]133;B\x1b\\abc");
        assert_eq!(click(&terminal, 2, 0), left(3));
        terminal.vt_write(b"\r\n\x1b]133;C\x1b\\output");
        assert_eq!(click(&terminal, 2, 1), None);
        terminal.vt_write(b"\r\n\x1b]133;D;0\x1b\\\x1b]133;A\x1b\\$ \x1b]133;B\x1b\\xyz");
        assert_eq!(click(&terminal, 2, 2), left(3));
    }

    #[test]
    fn a_shell_without_prompt_marks_is_never_held_back() {
        let terminal = shell("$ abc");
        assert!(!terminal.is_cursor_at_prompt().unwrap());
        assert_eq!(click(&terminal, 2, 0), left(3));
    }
}
