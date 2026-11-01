#[path = "avatar-motion.rs"]
mod motion;

use gpui::{
    AnyWindowHandle, App, Application, Bounds, ColorSpace, Context, FocusHandle, MouseButton,
    MouseDownEvent, MouseMoveEvent, MouseUpEvent, Point, Render, TitlebarOptions, Window,
    WindowBackgroundAppearance, WindowBounds, WindowKind, WindowOptions, div, img,
    linear_color_stop, linear_gradient, point, prelude::*, px, rgb, rgba, size,
};
use std::{
    collections::VecDeque,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Dock {
    Home,
    Voyage,
    Fleet,
    Vessel,
}

impl Dock {
    fn label(self) -> &'static str {
        match self {
            Self::Home => "Whole workspace",
            Self::Voyage => "Voyage · Voyager",
            Self::Fleet => "Fleet · Workbench",
            Self::Vessel => "Vessel · Avatar experiment",
        }
    }
}

#[derive(Clone)]
struct Motion {
    previous: &'static str,
    frame: &'static str,
    since: Instant,
    fade: f32,
    due: Instant,
    steps: VecDeque<(&'static str, u64, u64)>,
    settle: Option<bool>,
    reading: bool,
    busy: bool,
    page: usize,
    reduced_motion: bool,
}

impl Motion {
    fn new() -> Self {
        let reduced_motion = std::env::var_os("VOYAGER_REDUCED_MOTION").is_some()
            || Command::new("gsettings")
                .args(["get", "org.gnome.desktop.interface", "enable-animations"])
                .output()
                .is_ok_and(|result| result.status.success() && result.stdout.starts_with(b"false"));
        let now = Instant::now();
        Self {
            previous: motion::IDLE,
            frame: motion::IDLE,
            since: now,
            fade: 0.,
            due: now + Self::idle_wait(),
            steps: VecDeque::new(),
            settle: None,
            reading: false,
            busy: false,
            page: 0,
            reduced_motion,
        }
    }
    fn idle_wait() -> Duration {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |value| value.subsec_nanos());
        Duration::from_millis(20000 + u64::from(nanos) % 20000)
    }
    fn start(&mut self, steps: &[(&'static str, u64, u64)], settle: Option<bool>) {
        self.steps = steps.iter().copied().collect();
        self.settle = settle;
        self.due = Instant::now();
        self.tick();
    }
    fn change_busy(&mut self) {
        self.busy = !self.busy;
        if self.steps.is_empty() && self.settle.is_none() {
            self.transition();
        }
    }
    fn transition(&mut self) {
        if self.busy == self.reading {
            return;
        }
        if self.busy {
            self.page = 0;
            self.start(
                &[
                    ("book-frames/book-out.png", 560, 260),
                    (motion::READING[0], 0, 500),
                ],
                Some(true),
            );
        } else {
            self.start(
                &[
                    ("book-frames/book-away.png", 520, 180),
                    ("stretch-frames/frame-1-uncrossing.png", 90, 120),
                    ("stretch-frames/frame-2-stretched.png", 120, 120),
                    ("stretch-frames/frame-3-peak-stretch.png", 950, 200),
                    (motion::IDLE, 0, 500),
                ],
                Some(false),
            );
        }
    }
    fn stretch(&mut self) {
        if self.reduced_motion || self.settle.is_some() || self.busy {
            return;
        }
        self.start(
            &[
                ("stretch-frames/frame-1-uncrossing.png", 50, 120),
                ("stretch-frames/frame-2-stretched.png", 80, 120),
                ("stretch-frames/frame-3-peak-stretch.png", 1200, 200),
                (motion::IDLE, 0, 500),
            ],
            Some(false),
        );
    }
    fn tick(&mut self) {
        if self.reduced_motion {
            self.frame = if self.busy {
                motion::READING[0]
            } else {
                motion::IDLE
            };
            self.previous = self.frame;
            self.fade = 0.;
            return;
        }
        let now = Instant::now();
        if now < self.due {
            return;
        }
        if let Some((frame, hold, fade)) = self.steps.pop_front() {
            self.previous = self.frame;
            self.frame = frame;
            self.since = now;
            self.fade = fade as f32 * 1.6 / 1000.;
            self.due = now + Duration::from_micros((hold + fade) * 1600);
        } else if let Some(reading) = self.settle.take() {
            self.reading = reading;
            self.due = now
                + if self.busy {
                    Duration::from_millis(4800)
                } else {
                    Self::idle_wait()
                };
            self.transition();
        } else if self.reading {
            self.page = 1 - self.page;
            self.start(&[(motion::READING[self.page], 0, 240)], Some(true));
        } else {
            self.stretch();
        }
    }
}

struct Drag {
    start: Point<gpui::Pixels>,
    offset: Point<gpui::Pixels>,
    position: Point<gpui::Pixels>,
    time: Instant,
    moved: bool,
}

struct Native {
    owner: Option<AnyWindowHandle>,
    dock: Dock,
    preview: Option<Dock>,
    drag: Option<Drag>,
    motion: Motion,
    started: Instant,
    sidebar: bool,
    chat: bool,
    focus: FocusHandle,
    last_frame: Instant,
    frames: u64,
    longest_frame: f32,
}

fn asset(path: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(path)
}
fn image(path: &str) -> gpui::Img {
    img(asset(path))
}

fn tone(dock: bool) {
    std::thread::spawn(move || {
        let result = (|| -> std::io::Result<()> {
            let mut child = Command::new("paplay")
                .args([
                    "--raw",
                    "--rate=48000",
                    "--format=float32le",
                    "--channels=1",
                    "--client-name=Voyager native avatar experiment",
                ])
                .stdin(Stdio::piped())
                .spawn()?;
            let bytes: Vec<_> = motion::samples(dock)
                .iter()
                .flat_map(|sample| sample.to_le_bytes())
                .collect();
            if let Some(mut input) = child.stdin.take() {
                input.write_all(&bytes)?;
            }
            let status = child.wait()?;
            if !status.success() {
                return Err(std::io::Error::other(format!(
                    "Audio process exited {status}"
                )));
            }
            Ok(())
        })();
        if let Err(error) = result {
            eprintln!("Audio failed: {error}");
        }
    });
}

impl Native {
    fn new(owner: Option<AnyWindowHandle>, motion: Motion, cx: &mut Context<Self>) -> Self {
        Self {
            owner,
            dock: Dock::Home,
            preview: None,
            drag: None,
            motion,
            started: Instant::now(),
            sidebar: true,
            chat: false,
            focus: cx.focus_handle(),
            last_frame: Instant::now(),
            frames: 0,
            longest_frame: 0.,
        }
    }
    fn target(&self, p: Point<gpui::Pixels>, window: &Window) -> Option<Dock> {
        let x = f32::from(p.x);
        let y = f32::from(p.y);
        let width = f32::from(window.viewport_size().width);
        let height = f32::from(window.viewport_size().height);
        if self.sidebar
            && (((39.5..239.5).contains(&x) && (12. ..214.).contains(&y))
                || ((12. ..267.).contains(&x) && (228. ..264.).contains(&y)))
        {
            Some(Dock::Home)
        } else if self.sidebar && x < 280. && (314. ..356.).contains(&y) {
            Some(Dock::Voyage)
        } else if (if self.sidebar {
            304. ..434.
        } else {
            24. ..154.
        })
        .contains(&x)
            && (52. ..97.).contains(&y)
        {
            Some(Dock::Fleet)
        } else if x >= if self.sidebar { 288. } else { 8. }
            && x < width - 8.
            && y >= 105.
            && y < height - 30.
        {
            Some(Dock::Vessel)
        } else {
            None
        }
    }
    fn avatar_position(&self, window: &Window) -> (f32, f32, f32) {
        if self.owner.is_some() {
            return (13., 13., 94.);
        }
        if let Some(drag) = &self.drag
            && drag.moved
        {
            return (
                f32::from(drag.position.x),
                f32::from(drag.position.y),
                self.avatar_size(),
            );
        }
        let left = if self.sidebar { 280. } else { 0. };
        let width = f32::from(window.viewport_size().width);
        let height = f32::from(window.viewport_size().height);
        match self.dock {
            Dock::Home => (92.5, 59., 94.),
            Dock::Voyage => (24., 316., 38.),
            Dock::Fleet => (left + 24., 55.5, 38.),
            Dock::Vessel => (
                (left + width) * 0.5 - 47.,
                105. + (height - 135.) * 0.67 - 47.,
                94.,
            ),
        }
    }
    fn avatar_size(&self) -> f32 {
        if matches!(self.dock, Dock::Fleet | Dock::Voyage) {
            38.
        } else {
            94.
        }
    }
    fn dock(&mut self, dock: Dock, cx: &mut Context<Self>) {
        self.dock = dock;
        self.chat = false;
        self.preview = None;
        self.drag = None;
        tone(true);
        println!("DOCK {}", dock.label());
        cx.notify();
    }
    fn down(&mut self, event: &MouseDownEvent, window: &mut Window, cx: &mut Context<Self>) {
        let (x, y, _) = self.avatar_position(window);
        println!("AVATAR down {:?}", event.position);
        self.drag = Some(Drag {
            start: event.position,
            offset: event.position - point(px(x), px(y)),
            position: point(px(x), px(y)),
            time: Instant::now(),
            moved: false,
        });
        window.focus(&self.focus);
        cx.stop_propagation();
    }
    fn moving(&mut self, event: &MouseMoveEvent, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(drag) = &mut self.drag {
            let delta = event.position - drag.start;
            if !drag.moved && f32::from(delta.x).hypot(f32::from(delta.y)) > 7. {
                drag.moved = true;
                tone(false);
                if self.owner.is_some() {
                    window.start_window_move();
                }
            }
            if drag.moved {
                drag.position = event.position - drag.offset;
                self.preview = self.target(event.position, window);
                cx.notify();
            }
        }
    }
    fn up(&mut self, event: &MouseUpEvent, window: &mut Window, cx: &mut Context<Self>) {
        let Some(drag) = self.drag.take() else {
            return;
        };
        self.preview = None;
        if drag.moved {
            if self.owner.is_none() {
                if let Some(target) = self.target(event.position, window) {
                    self.dock(target, cx);
                } else {
                    tone(true);
                    println!("CANCEL invalid drop");
                }
            }
        } else if drag.time.elapsed() < Duration::from_millis(350) {
            if let Some(owner) = self.owner {
                if let Err(error) = owner.update(cx, |_, parent, _| parent.activate_window()) {
                    eprintln!("Restore failed: {error}");
                    return;
                }
                window.remove_window();
                tone(true);
            } else {
                self.minimize(window, cx);
            }
        }
        cx.notify();
    }
    fn minimize(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let (x, y, _) = self.avatar_position(window);
        let origin = window.bounds().origin + point(px(x - 13.), px(y - 13.));
        let owner = window.window_handle();
        let motion = self.motion.clone();
        let options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                origin,
                size(px(120.), px(120.)),
            ))),
            titlebar: None,
            kind: WindowKind::PopUp,
            is_resizable: false,
            window_background: WindowBackgroundAppearance::Transparent,
            app_id: Some("voyager-native-avatar-experiment".into()),
            ..Default::default()
        };
        match cx.open_window(options, move |_, cx| {
            cx.new(|cx| Self::new(Some(owner), motion, cx))
        }) {
            Ok(_) => {
                window.minimize_window();
                tone(false);
                println!("FLOAT transparent window");
            }
            Err(error) => eprintln!("Floating avatar failed: {error}"),
        }
    }
    fn avatar(&mut self, window: &mut Window, cx: &mut Context<Self>) -> gpui::AnyElement {
        let (x, y, s) = self.avatar_position(window);
        let portal = self.dock == Dock::Vessel && self.owner.is_none() && self.drag.is_none();
        let (base, fade) = motion::frame_layers(
            self.motion.previous,
            self.motion.frame,
            self.motion.since.elapsed().as_secs_f32(),
            self.motion.fade,
        );
        let float = if self.motion.reduced_motion {
            0.
        } else {
            motion::float_offset(self.started.elapsed().as_secs_f32())
        };
        let background = linear_gradient(
            145.,
            linear_color_stop(
                rgba(if self.dock == Dock::Home && self.owner.is_none() {
                    0x24283080
                } else {
                    0x30343bd9
                }),
                0.,
            ),
            linear_color_stop(
                rgba(if self.dock == Dock::Home && self.owner.is_none() {
                    0x16181c40
                } else {
                    0x252831cc
                }),
                1.,
            ),
        )
        .color_space(ColorSpace::Srgb);
        div()
            .absolute()
            .left(px(x))
            .top(px(y))
            .size(px(s))
            .id("avatar")
            .rounded_full()
            .border_1()
            .border_color(rgba(if portal {
                0x00000000
            } else if self.dock == Dock::Home && self.owner.is_none() {
                0xffffff0e
            } else {
                0xffffff24
            }))
            .when(!portal, |el| el.bg(background))
            .opacity(if portal { 0.3 } else { 1. })
            .hover(|el| el.opacity(1.))
            .cursor(gpui::CursorStyle::PointingHand)
            .on_mouse_down(MouseButton::Left, cx.listener(Self::down))
            .child(
                image(&format!("assets/{base}"))
                    .absolute()
                    .left(px(s * 0.14))
                    .top(px(s * 0.14 + float))
                    .size(px((s - 2.) * 0.72))
                    .object_fit(gpui::ObjectFit::Contain),
            )
            .child(
                div()
                    .absolute()
                    .left(px(s * 0.14))
                    .top(px(s * 0.14 + float))
                    .size(px((s - 2.) * 0.72))
                    .opacity(fade)
                    .child(
                        image(&format!("assets/{}", self.motion.frame))
                            .size_full()
                            .object_fit(gpui::ObjectFit::Contain),
                    ),
            )
            .child(
                div()
                    .absolute()
                    .right(px(s * 0.06))
                    .bottom(px(s * 0.17))
                    .size(px(5.))
                    .rounded_full()
                    .bg(rgb(0x94bda0)),
            )
            .into_any_element()
    }
    fn target_row(
        &self,
        label: &'static str,
        dock: Dock,
        bounds: [f32; 4],
        cx: &Context<Self>,
    ) -> gpui::AnyElement {
        let [x, y, w, h] = bounds;
        div()
            .id(label)
            .absolute()
            .left(px(x))
            .top(px(y))
            .w(px(w))
            .h(px(h))
            .flex()
            .items_center()
            .px(px(10.))
            .when(
                self.dock == dock && matches!(dock, Dock::Voyage | Dock::Fleet),
                |el| el.pl(px(58.)),
            )
            .text_size(px(13.))
            .text_color(rgb(0xa9a9b5))
            .when(self.dock == dock && dock != Dock::Home, |el| {
                el.bg(rgba(0xb07af512))
                    .border_l_2()
                    .border_color(rgba(0xb07af575))
            })
            .when(self.preview == Some(dock), |el| {
                el.border_1().border_color(rgb(0xb3d2e5))
            })
            .child(label)
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(move |this, event: &MouseDownEvent, _, cx| {
                    if event.click_count == 2 {
                        this.dock(dock, cx);
                    }
                }),
            )
            .into_any_element()
    }
}

impl Render for Native {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.motion.tick();
        let frame_ms = self.last_frame.elapsed().as_secs_f32() * 1000.;
        self.last_frame = Instant::now();
        self.frames += 1;
        if self.frames > 5 {
            self.longest_frame = self.longest_frame.max(frame_ms);
        }
        if self.frames.is_multiple_of(600) {
            println!(
                "FRAMES {} max_interval_ms {:.2}",
                self.frames, self.longest_frame
            );
        }
        if !self.motion.reduced_motion {
            window.request_animation_frame();
        }
        window.set_window_title(if self.owner.is_some() {
            "Voyager native floating avatar"
        } else {
            self.dock.label()
        });
        let mut root = div()
            .id("workspace")
            .size_full()
            .relative()
            .font_family("Inter")
            .text_color(rgb(0xd4d5dc))
            .text_size(px(13.))
            .track_focus(&self.focus)
            .capture_any_mouse_down(|event, _, _| println!("POINTER down {:?}", event.position))
            .on_mouse_move(cx.listener(Self::moving))
            .on_mouse_up(MouseButton::Left, cx.listener(Self::up))
            .on_mouse_up_out(MouseButton::Left, cx.listener(Self::up))
            .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, window, cx| {
                match event.keystroke.key.as_str() {
                    "escape" => {
                        if this.drag.take().is_some() {
                            this.preview = None;
                            tone(true);
                            println!("CANCEL escape");
                        }
                        this.chat = false;
                    }
                    "b" => this.motion.change_busy(),
                    "s" => this.motion.stretch(),
                    "h" => this.dock(Dock::Home, cx),
                    "q" if event.keystroke.modifiers.control => cx.quit(),
                    _ => {}
                }
                window.refresh();
            }));
        if self.owner.is_none() {
            let left = if self.sidebar { 280. } else { 0. };
            root = root.bg(rgb(0x111316));
            if self.sidebar {
                root = root
                    .child(
                        div()
                            .absolute()
                            .left_0()
                            .top_0()
                            .bottom_0()
                            .w(px(280.))
                            .bg(rgb(0x16181c))
                            .border_r_1()
                            .border_color(rgba(0xffffff0c)),
                    )
                    .child(
                        image("native-brand.png")
                            .absolute()
                            .left(px(39.5))
                            .top(px(12.))
                            .w(px(200.))
                            .h(px(107.)),
                    )
                    .child(
                        image("native-tagline.png")
                            .absolute()
                            .left(px(39.5))
                            .top(px(165.5))
                            .w(px(200.))
                            .h(px(13.5)),
                    )
                    .child(
                        image("native-wave.svg")
                            .absolute()
                            .left(px(114.5))
                            .top(px(196.))
                            .w(px(14.))
                            .h(px(12.)),
                    )
                    .child(
                        div()
                            .absolute()
                            .left(px(145.5))
                            .top(px(190.))
                            .size(px(24.))
                            .id("chat-toggle")
                            .cursor_pointer()
                            .child(image("native-chat.svg").size_full())
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.chat = !this.chat;
                                cx.notify();
                            })),
                    )
                    .child(self.target_row("Home", Dock::Home, [12., 228., 255., 36.], cx))
                    .child(
                        div()
                            .absolute()
                            .left(px(22.))
                            .top(px(296.))
                            .text_size(px(10.))
                            .text_color(rgb(0x92939d))
                            .child("VOYAGES"),
                    )
                    .child(self.target_row("Voyager", Dock::Voyage, [12., 314., 255., 42.], cx));
            }
            root = root
                .child(div().absolute().left(px(left)).top_0().right_0().h(px(52.)).border_b_1().border_color(rgba(0xffffff0c)))
                .child(div().absolute().left(px(left+16.)).top(px(10.)).id("sidebar-toggle").size(px(32.)).child("◧").cursor_pointer().on_click(cx.listener(|this,_,_,cx|{this.sidebar = !this.sidebar;if !this.sidebar{this.dock(Dock::Fleet,cx);}cx.notify();})))
                .child(div().absolute().left(px(left+54.)).top(px(19.)).text_color(rgb(0x92939d)).text_size(px(11.)).child("Voyager"))
                .child(div().absolute().right(px(32.)).top(px(19.)).text_size(px(10.)).text_color(rgb(0x878994)).child(self.dock.label()))
                .child(self.target_row("Workbench", Dock::Fleet, [left+24.,52.,130.,45.], cx))
                .child(div().absolute().left(px(left+8.)).right(px(8.)).top(px(105.)).bottom(px(30.)).border_1().rounded(px(3.)).border_color(rgba(0xb07af560))
                    .when(self.preview==Some(Dock::Vessel),|el|el.border_color(rgb(0xb3d2e5)))
                    .child(div().absolute().left(px(5.)).top(px(10.)).text_size(px(10.)).text_color(rgb(0x92939e)).child("Avatar experiment"))
                    .child(div().absolute().right(px(8.)).top(px(5.)).id("vessel-dock").text_size(px(17.)).text_color(rgb(0xa49ab6)).child("◎").cursor_pointer().on_mouse_down(MouseButton::Left,cx.listener(|this,event:&MouseDownEvent,_,cx|{if event.click_count==2{this.dock(Dock::Vessel,cx);}})))
                    .child(div().absolute().left(px(24.)).top(px(76.)).text_size(px(11.)).text_color(rgb(0x878994)).child("Native avatar proof. B toggles reading. S stretches. Escape cancels a drag.")))
                .child(div().absolute().left(px(left+12.)).bottom(px(6.)).text_size(px(9.)).text_color(rgb(0x878994)).child("GPUI avatar experiment · terminals and conversation are outside this proof"));
            if self.chat && self.sidebar {
                root = root.child(
                    div()
                        .absolute()
                        .left(px(12.))
                        .top(px(220.))
                        .w(px(255.))
                        .h(px(320.))
                        .bg(rgb(0x101215))
                        .rounded(px(10.))
                        .border_1()
                        .border_color(rgba(0xffffff0c))
                        .child(div().p(px(16.)).text_size(px(11.)).child(self.dock.label()))
                        .child(
                            div()
                                .absolute()
                                .left(px(16.))
                                .top(px(60.))
                                .text_color(rgb(0x878994))
                                .text_size(px(11.))
                                .child("Conversation is outside this avatar proof."),
                        ),
                );
            }
        }
        root.child(self.avatar(window, cx))
    }
}

fn main() {
    Application::new().run(|cx: &mut App| {
        let options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                point(px(180.), px(130.)),
                size(px(1450.), px(940.)),
            ))),
            titlebar: Some(TitlebarOptions {
                title: Some("Voyager native avatar experiment".into()),
                ..Default::default()
            }),
            app_id: Some("voyager-native-avatar-experiment".into()),
            ..Default::default()
        };
        if let Err(error) = cx.open_window(options, |window, cx| {
            cx.new(|cx| {
                let state = Native::new(None, Motion::new(), cx);
                window.focus(&state.focus);
                state
            })
        }) {
            eprintln!("Native window failed: {error}");
            cx.quit();
        }
        cx.on_window_closed(|cx| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();
        cx.activate(true);
    });
}
