use crate::terminal::holds_keyboard;
use gpui::{
    AppContext as _, Context, FocusHandle, IntoElement, ParentElement as _, Render, Window,
    WindowOptions, div,
};
use std::{cell::Cell, rc::Rc};

struct Panes {
    first: FocusHandle,
    second: FocusHandle,
}

impl Render for Panes {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div().child("panes")
    }
}

#[test]
fn a_focus_change_is_visible_to_the_very_next_read() {
    let observed = Rc::new(Cell::new(false));
    let result = observed.clone();
    gpui_platform::headless()
        .with_quit_mode(gpui::QuitMode::Explicit)
        .run(move |cx| {
            let window = cx
                .open_window(
                    WindowOptions {
                        focus: false,
                        show: false,
                        ..Default::default()
                    },
                    |_, cx| {
                        cx.new(|cx| Panes {
                            first: cx.focus_handle(),
                            second: cx.focus_handle(),
                        })
                    },
                )
                .unwrap();
            window
                .update(cx, |panes, window, cx| {
                    panes.first.focus(window, cx);
                    let first = holds_keyboard(&panes.first, window)
                        && !holds_keyboard(&panes.second, window);
                    panes.second.focus(window, cx);
                    let second = holds_keyboard(&panes.second, window)
                        && !holds_keyboard(&panes.first, window);
                    result.set(first && second);
                })
                .unwrap();
            cx.quit();
        });
    assert!(observed.get());
}
