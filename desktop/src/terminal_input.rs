use super::Pane;
use gpui::{
    Bounds, ClipboardItem, Context, EntityInputHandler, KeyBinding, Pixels, UTF16Selection, Window,
};
use std::ops::Range;

pub(super) const KEY_CONTEXT: &str = "Terminal";

pub(crate) fn key_bindings() -> Vec<KeyBinding> {
    Vec::new()
}

pub(super) fn workspace_shortcut(key: &gpui::Keystroke) -> bool {
    let modifiers = key.modifiers;
    if !modifiers.function
        && modifiers.alt
        && (modifiers.control ^ modifiers.platform)
        && key.key.eq_ignore_ascii_case("p")
    {
        return true;
    }
    if !modifiers.shift || modifiers.alt || modifiers.function {
        return false;
    }
    let name = key.key.to_ascii_lowercase();
    ((modifiers.control ^ modifiers.platform) && matches!(name.as_str(), "o" | "e" | "t"))
        || if cfg!(target_os = "macos") {
            modifiers.platform && !modifiers.control && name == "enter"
        } else {
            modifiers.control && !modifiers.platform && name == "z"
        }
}

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
                    font: gpui::font(self.font_family.clone()),
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
    use gpui::{
        AppContext as _, FocusHandle, InteractiveElement as _, IntoElement, Keystroke,
        ParentElement as _, Render, Styled as _, div, px,
    };
    use std::{cell::RefCell, rc::Rc};

    struct Panes {
        terminal: FocusHandle,
        other: FocusHandle,
        received: Rc<RefCell<Vec<String>>>,
    }

    impl Render for Panes {
        fn render(
            &mut self,
            _: &mut gpui::Window,
            _: &mut gpui::Context<Self>,
        ) -> impl IntoElement {
            let received = Rc::clone(&self.received);
            div()
                .size_full()
                .child(div().id("other").track_focus(&self.other).size(px(20.)))
                .child(
                    div()
                        .id("terminal")
                        .key_context(super::KEY_CONTEXT)
                        .track_focus(&self.terminal)
                        .size(px(20.))
                        .on_key_down(move |event, _, cx| {
                            let pressed = &event.keystroke;
                            let ctrl = if pressed.modifiers.control {
                                "ctrl-"
                            } else {
                                ""
                            };
                            let shift = if pressed.modifiers.shift {
                                "shift-"
                            } else {
                                ""
                            };
                            received
                                .borrow_mut()
                                .push(format!("{ctrl}{shift}{}", pressed.key));
                            cx.stop_propagation();
                        }),
                )
        }
    }

    #[derive(Debug, PartialEq)]
    struct Pressed {
        key: &'static str,
        received: Vec<String>,
        terminal_focused: bool,
    }

    fn press_all(start_in_terminal: bool, keys: &'static [&'static str]) -> Vec<Pressed> {
        let seen = Rc::new(RefCell::new(Vec::new()));
        let record = Rc::clone(&seen);
        gpui_platform::headless()
            .with_quit_mode(gpui::QuitMode::Explicit)
            .run(move |cx| {
                let registry = gpui_shell::ComponentRegistry::new(
                    gpui_shell::COMPONENT_REGISTRY_API_VERSION,
                    "voyager_native",
                )
                .unwrap()
                .freeze()
                .unwrap();
                gpui_shell::init_with_components(cx, &registry);
                cx.bind_keys(super::key_bindings());
                let received = Rc::new(RefCell::new(Vec::new()));
                let probe = Rc::clone(&received);
                let mut panes = None;
                let window = cx
                    .open_window(gpui::WindowOptions::default(), |window, cx| {
                        let view = cx.new(|cx| Panes {
                            terminal: cx.focus_handle().tab_stop(true),
                            other: cx.focus_handle().tab_stop(true),
                            received: probe,
                        });
                        panes = Some(view.clone());
                        cx.new(|cx| gpui_shell::ShellRoot::new(view.into(), window, cx))
                    })
                    .unwrap();
                let panes = panes.unwrap();
                cx.spawn(async move |cx| {
                    cx.update_window(window.into(), |_, window, cx| {
                        let (terminal, other) = {
                            let panes = panes.read(cx);
                            (panes.terminal.clone(), panes.other.clone())
                        };
                        window.draw(cx).clear(cx);
                        for key in keys {
                            let start = if start_in_terminal { &terminal } else { &other };
                            window.focus(start, cx);
                            window.draw(cx).clear(cx);
                            received.borrow_mut().clear();
                            window.dispatch_keystroke(Keystroke::parse(key).unwrap(), cx);
                            window.draw(cx).clear(cx);
                            record.borrow_mut().push(Pressed {
                                key,
                                received: received.borrow().clone(),
                                terminal_focused: terminal.is_focused(window),
                            });
                        }
                    })
                    .unwrap();
                    cx.update(|cx| cx.quit());
                })
                .detach();
            });
        seen.take()
    }

    #[test]
    fn a_focused_terminal_receives_tab_and_shift_tab_and_keeps_focus() {
        let pressed = press_all(true, &["tab", "shift-tab"]);
        assert_eq!(
            pressed,
            [
                Pressed {
                    key: "tab",
                    received: vec!["tab".into()],
                    terminal_focused: true,
                },
                Pressed {
                    key: "shift-tab",
                    received: vec!["shift-tab".into()],
                    terminal_focused: true,
                },
            ]
        );
    }

    #[test]
    fn ctrl_tab_leaves_the_terminal_and_tab_still_moves_focus_elsewhere() {
        let from_terminal = press_all(true, &["ctrl-tab", "ctrl-shift-tab"]);
        assert!(
            from_terminal
                .iter()
                .all(|pressed| pressed.received.is_empty() && !pressed.terminal_focused),
            "{from_terminal:?}"
        );
        let elsewhere = press_all(false, &["tab"]);
        assert_eq!(
            elsewhere,
            [Pressed {
                key: "tab",
                received: Vec::new(),
                terminal_focused: true,
            }]
        );
    }

    #[test]
    fn workspace_shortcuts_leave_normal_terminal_input_alone() {
        for key in [
            "ctrl-shift-o",
            "ctrl-shift-e",
            "ctrl-shift-t",
            "ctrl-alt-p",
            "ctrl-alt-shift-p",
            if cfg!(target_os = "macos") {
                "cmd-shift-enter"
            } else {
                "ctrl-shift-z"
            },
        ] {
            assert!(
                super::workspace_shortcut(&gpui::Keystroke::parse(key).unwrap()),
                "{key}"
            );
        }
        for key in [
            "z",
            "ctrl-z",
            "ctrl-alt-shift-z",
            "enter",
            "shift-enter",
            "alt-p",
            "ctrl-p",
            "ctrl-alt-o",
        ] {
            assert!(
                !super::workspace_shortcut(&gpui::Keystroke::parse(key).unwrap()),
                "{key}"
            );
        }
    }

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
