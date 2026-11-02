use anyhow::Result;
use libghostty_vt::{
    Terminal,
    render::{CellIterator, RenderState, RowIterator},
};
use std::{cell::RefCell, rc::Rc};

#[derive(Default)]
struct Replies {
    bytes: Vec<u8>,
    overflow: bool,
}

struct Screen {
    terminal: Terminal<'static, 'static>,
    render: RenderState<'static>,
    rows: RowIterator<'static>,
    cells: CellIterator<'static>,
    replies: Rc<RefCell<Replies>>,
}

impl Screen {
    fn new(cols: u16, rows: u16) -> Result<Self> {
        let replies = Rc::new(RefCell::new(Replies::default()));
        let collected = replies.clone();
        let mut terminal = Terminal::new(cols, rows)?;
        terminal.on_pty_write(move |_, bytes| {
            if bytes.starts_with(b"\x1b_G") {
                return;
            }
            let mut replies = collected.borrow_mut();
            if replies.bytes.len().saturating_add(bytes.len()) > 65536 {
                replies.overflow = true;
            } else {
                replies.bytes.extend_from_slice(bytes);
            }
        })?;
        Ok(Self {
            terminal,
            render: RenderState::new()?,
            rows: RowIterator::new()?,
            cells: CellIterator::new()?,
            replies,
        })
    }

    fn write(&mut self, bytes: &[u8]) {
        self.terminal.vt_write(bytes);
    }

    fn take_replies(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.replies.borrow_mut().bytes)
    }

    fn lines(&mut self) -> Result<Vec<String>> {
        let snapshot = self.render.update(&self.terminal)?;
        let mut rows = self.rows.update(&snapshot)?;
        let mut output = Vec::new();
        let mut text = String::new();
        while let Some(row) = rows.next() {
            let mut cells = self.cells.update(row)?;
            let mut line = String::new();
            while let Some(cell) = cells.next() {
                if cell.graphemes_len()? == 0 {
                    line.push(' ');
                } else {
                    cell.graphemes_utf8(&mut text)?;
                    line.push_str(&text);
                }
            }
            output.push(line);
        }
        Ok(output)
    }
}

use gpui::prelude::FluentBuilder;
use gpui::{
    AnyElement, App, AppContext as _, Context, Entity, FocusHandle, InteractiveElement as _,
    KeyDownEvent, MouseButton, ParentElement as _, Render, Role, StatefulInteractiveElement as _,
    Styled as _, Subscription, Task, Window, div, px,
};
use gpui_shell::{
    ArgumentDescriptor, ArgumentSchema, COMPONENT_REGISTRY_API_VERSION, ComponentArgument,
    ComponentDescriptor, ComponentMaterializer, ComponentPayload, ComponentRegistry,
    ConstructorDescriptor, FrozenComponentRegistry, MaterializeRequest, RegistryError,
    StateDescriptor,
};
use libghostty_vt::key::{self, Key, Mods};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use voyager_app::core::Viewer;

pub type Viewers = Arc<Mutex<HashMap<String, Viewer>>>;

struct Pane {
    screen: Screen,
    viewer: Viewer,
    focus: FocusHandle,
    lines: Vec<String>,
    status: String,
    pending_credit: u32,
    pending_reply: Vec<u8>,
    _task: Task<()>,
    _focus: Vec<Subscription>,
}

impl Pane {
    fn new(screen: Screen, viewer: Viewer, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let focus = cx.focus_handle();
        let subscriptions = vec![
            cx.on_focus(&focus, window, |pane, _, cx| {
                if let Err(error) = pane.viewer.focus(true) {
                    pane.status = format!("Focus: {error:?}");
                    cx.notify();
                }
            }),
            cx.on_blur(&focus, window, |pane, _, cx| {
                if let Err(error) = pane.viewer.focus(false) {
                    pane.status = format!("Focus: {error:?}");
                    cx.notify();
                }
            }),
        ];
        let waiter = viewer.clone();
        let task = cx.spawn(async move |this, cx| {
            while waiter.ready().await.is_ok() {
                loop {
                    let retry = match this.update(cx, |pane, cx| pane.pump(cx)) {
                        Ok(retry) => retry,
                        Err(_) => return,
                    };
                    if !waiter.connected() || (!retry && waiter.finished().unwrap_or(true)) {
                        return;
                    }
                    if !retry {
                        break;
                    }
                    cx.background_executor()
                        .timer(Duration::from_millis(5))
                        .await;
                }
            }
        });
        Self {
            screen,
            viewer,
            focus,
            lines: Vec::new(),
            status: String::new(),
            pending_credit: 0,
            pending_reply: Vec::new(),
            _task: task,
            _focus: subscriptions,
        }
    }

    fn pump(&mut self, cx: &mut Context<Self>) -> bool {
        let start = Instant::now();
        let previous_status = self.status.clone();
        let mut consumed = 0;
        while self.pending_reply.is_empty()
            && !self.screen.replies.borrow().overflow
            && consumed < 65536
            && start.elapsed() < Duration::from_millis(2)
        {
            match self.viewer.take(4096) {
                Ok(bytes) if bytes.is_empty() => break,
                Ok(bytes) => {
                    self.screen.write(&bytes);
                    consumed += bytes.len();
                    self.pending_reply = self.screen.take_replies();
                }
                Err(error) => {
                    self.status = format!("Terminal: {error:?}");
                    break;
                }
            }
        }
        if self.screen.replies.borrow().overflow {
            self.status = "Terminal reply limit exceeded".into();
        }
        if !self.pending_reply.is_empty() && self.viewer.input(self.pending_reply.clone()).is_ok() {
            self.pending_reply.clear();
        }
        self.pending_credit += consumed as u32;
        if self.pending_credit != 0 && self.viewer.credit(self.pending_credit).is_ok() {
            self.pending_credit = 0;
        }
        if consumed != 0 {
            match self.screen.lines() {
                Ok(lines) => self.lines = lines,
                Err(error) => self.status = format!("Terminal display: {error:#}"),
            }
            cx.notify();
        }
        if !self.viewer.connected() && self.status.is_empty() {
            self.status = "Core disconnected".into();
            cx.notify();
        } else if matches!(self.viewer.finished(), Ok(true)) && self.status.is_empty() {
            self.status = "Terminal ended".into();
            cx.notify();
        }
        if self.status != previous_status {
            cx.notify();
        }
        self.pending_credit != 0 || !self.pending_reply.is_empty()
    }

    fn key(&mut self, event: &KeyDownEvent) -> Result<()> {
        let stroke = &event.keystroke;
        let mut input = key::Event::new()?;
        input.set_key(key_code(&stroke.key));
        input.set_action(if event.is_held {
            key::Action::Repeat
        } else {
            key::Action::Press
        });
        let mut modifiers = Mods::empty();
        modifiers.set(Mods::SHIFT, stroke.modifiers.shift);
        modifiers.set(Mods::ALT, stroke.modifiers.alt);
        modifiers.set(Mods::CTRL, stroke.modifiers.control);
        modifiers.set(Mods::SUPER, stroke.modifiers.platform);
        input.set_mods(modifiers);
        let text = stroke
            .key_char
            .clone()
            .or_else(|| (stroke.key.chars().count() == 1).then(|| stroke.key.clone()));
        input.set_utf8(text);
        let mut encoder = key::Encoder::new()?;
        encoder.set_options_from_terminal(&self.screen.terminal);
        let mut bytes = Vec::new();
        encoder.encode_to_vec(&input, &mut bytes)?;
        if !bytes.is_empty() {
            self.viewer
                .input(bytes)
                .map_err(|error| anyhow::anyhow!("{error:?}"))?;
        }
        Ok(())
    }
}

impl Render for Pane {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl gpui::IntoElement {
        let entity = cx.entity();
        let focus = self.focus.clone();
        div()
            .id("terminal")
            .track_focus(&self.focus)
            .role(Role::Terminal)
            .aria_label("Terminal")
            .flex()
            .flex_col()
            .size_full()
            .p(px(8.))
            .font_family("monospace")
            .text_size(px(13.))
            .text_color(gpui::rgb(0xcdd0d6))
            .on_mouse_down(MouseButton::Left, move |_, window, cx| {
                focus.focus(window, cx)
            })
            .on_key_down(move |event, _, cx| {
                if event.keystroke.modifiers.control && event.keystroke.key == "q" {
                    return;
                }
                entity.update(cx, |pane, cx| {
                    if let Err(error) = pane.key(event) {
                        pane.status = format!("Input: {error:#}");
                        cx.notify();
                    }
                });
                cx.stop_propagation();
            })
            .children(self.lines.iter().map(|line| div().child(line.clone())))
            .when(!self.status.is_empty(), |view| {
                view.child(div().child(self.status.clone()))
            })
    }
}

fn key_code(key: &str) -> Key {
    match key {
        "enter" => Key::Enter,
        "backspace" => Key::Backspace,
        "tab" => Key::Tab,
        "escape" => Key::Escape,
        "up" => Key::ArrowUp,
        "down" => Key::ArrowDown,
        "left" => Key::ArrowLeft,
        "right" => Key::ArrowRight,
        "space" => Key::Space,
        "a" => Key::A,
        "b" => Key::B,
        "c" => Key::C,
        "d" => Key::D,
        "e" => Key::E,
        "f" => Key::F,
        "g" => Key::G,
        "h" => Key::H,
        "i" => Key::I,
        "j" => Key::J,
        "k" => Key::K,
        "l" => Key::L,
        "m" => Key::M,
        "n" => Key::N,
        "o" => Key::O,
        "p" => Key::P,
        "q" => Key::Q,
        "r" => Key::R,
        "s" => Key::S,
        "t" => Key::T,
        "u" => Key::U,
        "v" => Key::V,
        "w" => Key::W,
        "x" => Key::X,
        "y" => Key::Y,
        "z" => Key::Z,
        _ => Key::Unidentified,
    }
}

struct TerminalMaterializer;

impl ComponentMaterializer for TerminalMaterializer {
    fn materialize(&self, request: MaterializeRequest<'_>) -> Result<AnyElement> {
        let argument = request
            .payload()
            .downcast_ref::<ComponentArgument>()
            .ok_or_else(|| anyhow::anyhow!("Terminal requires state"))?;
        let pane = request.with_state::<Entity<Pane>, _>(argument, Clone::clone)?;
        request.finish(div().size_full().child(pane))
    }
}

pub fn registry(viewers: Viewers) -> Result<FrozenComponentRegistry, RegistryError> {
    let mut registry = ComponentRegistry::new(COMPONENT_REGISTRY_API_VERSION, "voyager_terminal")?;
    register(&mut registry, viewers)?;
    registry.freeze()
}

pub fn register(registry: &mut ComponentRegistry, viewers: Viewers) -> Result<(), RegistryError> {
    registry.register_state(StateDescriptor::new(
        "TerminalState",
        "TerminalState",
        vec![ArgumentDescriptor::new("content", ArgumentSchema::String)],
        move |args, window, cx: &mut App| {
            let [ComponentArgument::String(id)] = args else {
                return Err("Terminal requires content identity".into());
            };
            let viewer = viewers
                .lock()
                .map_err(|e| e.to_string())?
                .get(id)
                .cloned()
                .ok_or_else(|| "Terminal is not attached".to_string())?;
            let screen = Screen::new(80, 24).map_err(|e| e.to_string())?;
            Ok(Box::new(cx.new(|cx| Pane::new(screen, viewer, window, cx))))
        },
    ))?;
    registry.register(
        ComponentDescriptor::new("Terminal", Arc::new(TerminalMaterializer)).with_constructors(
            vec![ConstructorDescriptor::new(
                "Terminal",
                vec![ArgumentDescriptor::new(
                    "state",
                    ArgumentSchema::Entity("TerminalState"),
                )],
                |args| match args {
                    [argument @ ComponentArgument::Entity { .. }] => {
                        Ok(ComponentPayload::new(argument.clone()))
                    }
                    _ => Err("Terminal requires terminal state".into()),
                },
            )],
        ),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::Screen;

    #[test]
    fn terminal_interprets_cursor_motion_instead_of_printing_escape_bytes() {
        let mut screen = Screen::new(12, 2).unwrap();
        screen.write(b"hello\rY");
        assert!(screen.lines().unwrap()[0].starts_with("Yello"));
    }

    #[test]
    fn terminal_retains_device_status_reply_for_core() {
        let mut screen = Screen::new(12, 2).unwrap();
        screen.write(b"\x1b[6n");
        assert_eq!(screen.take_replies(), b"\x1b[1;1R");
    }

    #[test]
    fn ghostty_encodes_printable_text_without_a_named_physical_key() {
        let mut encoder = libghostty_vt::key::Encoder::new().unwrap();
        let mut event = libghostty_vt::key::Event::new().unwrap();
        event.set_key(libghostty_vt::key::Key::Unidentified);
        event.set_utf8(Some("1"));
        let mut output = Vec::new();
        encoder.encode_to_vec(&event, &mut output).unwrap();
        assert_eq!(output, b"1");
    }

    #[test]
    fn ghostty_encodes_control_c_as_terminal_interrupt() {
        let mut encoder = libghostty_vt::key::Encoder::new().unwrap();
        let mut event = libghostty_vt::key::Event::new().unwrap();
        event.set_key(libghostty_vt::key::Key::C);
        event.set_mods(libghostty_vt::key::Mods::CTRL);
        event.set_utf8(Some("c"));
        let mut output = Vec::new();
        encoder.encode_to_vec(&event, &mut output).unwrap();
        assert_eq!(output, [3]);
    }
}
