use anyhow::Result;
use libghostty_vt::{Terminal, mouse};

pub(super) fn input(
    terminal: &Terminal<'_, '_>,
    lines: isize,
    position: mouse::Position,
    size: mouse::EncoderSize,
) -> Result<Option<Vec<u8>>> {
    use libghostty_vt::{key, screen::Screen};
    let mut bytes = Vec::new();
    if terminal.is_mouse_tracking()? {
        let mut event = mouse::Event::new()?;
        event.set_action(mouse::Action::Press);
        event.set_button(Some(if lines < 0 {
            mouse::Button::Four
        } else {
            mouse::Button::Five
        }));
        event.set_position(position);
        let mut encoder = mouse::Encoder::new()?;
        encoder.set_options_from_terminal(terminal).set_size(size);
        encoder.encode_to_vec(&event, &mut bytes)?;
    } else if terminal.active_screen()? == Screen::Alternate {
        let mut event = key::Event::new()?;
        event.set_action(key::Action::Press);
        event.set_key(if lines < 0 {
            key::Key::ArrowUp
        } else {
            key::Key::ArrowDown
        });
        let mut encoder = key::Encoder::new()?;
        encoder.set_options_from_terminal(terminal);
        encoder.encode_to_vec(&event, &mut bytes)?;
    } else {
        return Ok(None);
    }
    let length = bytes.len().checked_mul(lines.unsigned_abs());
    anyhow::ensure!(
        length.is_some_and(|length| length <= voyager_app::core::MAX_INPUT_BYTES),
        "Wheel input exceeds the terminal's 64 KiB input limit"
    );
    Ok(Some(bytes.repeat(lines.unsigned_abs())))
}

#[cfg(test)]
mod tests {
    use super::input;
    use libghostty_vt::{Terminal, mouse};

    fn wheel(terminal: &Terminal<'_, '_>, lines: isize) -> Option<Vec<u8>> {
        input(
            terminal,
            lines,
            mouse::Position { x: 24., y: 20. },
            mouse::EncoderSize {
                screen_width: 800,
                screen_height: 480,
                cell_width: 8,
                cell_height: 16,
                padding_top: 0,
                padding_bottom: 0,
                padding_right: 0,
                padding_left: 0,
            },
        )
        .unwrap()
    }

    #[test]
    fn normal_history_stays_local_and_alternate_screen_receives_arrow_keys() {
        let mut terminal = Terminal::new(100, 30).unwrap();
        assert_eq!(wheel(&terminal, -2), None);
        terminal.vt_write(b"\x1b[?1049h");
        assert_eq!(wheel(&terminal, -2), Some(b"\x1b[A\x1b[A".to_vec()));
        terminal.vt_write(b"\x1b[?1h");
        assert_eq!(wheel(&terminal, 1), Some(b"\x1bOB".to_vec()));
        terminal.vt_write(b"\x1b[?1049l");
        assert_eq!(wheel(&terminal, 1), None);
    }

    #[test]
    fn mouse_reporting_receives_wheel_coordinates_on_both_screens() {
        let mut terminal = Terminal::new(100, 30).unwrap();
        terminal.vt_write(b"\x1b[?1000h\x1b[?1006h");
        assert_eq!(wheel(&terminal, -1), Some(b"\x1b[<64;4;2M".to_vec()));
        terminal.vt_write(b"\x1b[?1049h");
        assert_eq!(wheel(&terminal, 1), Some(b"\x1b[<65;4;2M".to_vec()));
        assert!(
            input(
                &terminal,
                isize::MAX,
                mouse::Position { x: 24., y: 20. },
                mouse::EncoderSize {
                    screen_width: 800,
                    screen_height: 480,
                    cell_width: 8,
                    cell_height: 16,
                    padding_top: 0,
                    padding_bottom: 0,
                    padding_right: 0,
                    padding_left: 0,
                },
            )
            .is_err()
        );
        terminal.vt_write(b"\x1b[?1000l");
        assert_eq!(wheel(&terminal, 0), Some(Vec::new()));
    }
}
