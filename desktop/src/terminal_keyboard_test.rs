use crate::terminal::holds_keyboard;
use gpui::{
    AppContext as _, Context, FocusHandle, InteractiveElement as _, IntoElement,
    ParentElement as _, Render, Window, WindowOptions, div,
};
use std::{cell::Cell, rc::Rc};

struct Panes {
    first: FocusHandle,
    second: FocusHandle,
}

impl Render for Panes {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
            .child(div().track_focus(&self.first))
            .child(div().track_focus(&self.second))
    }
}

#[test]
fn a_focus_change_is_visible_to_the_very_next_read() {
    let observed = Rc::new(Cell::new(false));
    let result = observed.clone();
    gpui_platform::headless()
        .with_quit_mode(gpui::QuitMode::Explicit)
        .run(move |cx| {
            let first = cx.focus_handle();
            let second = cx.focus_handle();
            let held = (first.clone(), second.clone());
            let window = cx
                .open_window(
                    WindowOptions {
                        focus: false,
                        show: false,
                        ..Default::default()
                    },
                    move |_, cx| cx.new(|_| Panes { first, second }),
                )
                .unwrap();
            cx.spawn(async move |cx| {
                cx.update_window(window.into(), |_, window, cx| {
                    window.draw(cx).clear(cx);
                    let (first, second) = held;
                    window.focus(&first, cx);
                    let one = holds_keyboard(&first, window) && !holds_keyboard(&second, window);
                    window.focus(&second, cx);
                    let two = holds_keyboard(&second, window) && !holds_keyboard(&first, window);
                    result.set(one && two);
                })
                .unwrap();
                cx.update(|cx| cx.quit());
            })
            .detach();
        });
    assert!(observed.get());
}
