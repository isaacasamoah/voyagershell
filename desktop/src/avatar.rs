mod view;

use crate::avatar_motion::{self as motion, Motion};
use gpui::{
    AnyWindowHandle, App, AppContext, Bounds, Context, Entity, EventEmitter, FocusHandle,
    IntoElement, ParentElement, Pixels, Point, Styled, Subscription, Task, Window,
    WindowBackgroundAppearance, WindowBounds, WindowKind, WindowOptions, canvas, div, img, point,
    prelude::*, px, size,
};
use gpui_shell::{HostError, HostModule, HostValue, ScriptView, ShellRoot};
use std::{
    cell::{Cell, RefCell},
    path::PathBuf,
    rc::Rc,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Instant,
};
use view::AvatarView;
use voyager_app::client::Client;
use voyager_contract::{Action, Context as Scope, Request, Response, Status};

struct Changed;

pub struct Avatar {
    client: Client,
    version: u64,
    scope: Scope,
    dock_visible: bool,
    projection_key: String,
    dock_receipt: String,
    drag: Option<Drag>,
    geometry: Rc<RefCell<Geometry>>,
    motion: Motion,
    epoch: Instant,
    workspace: AnyWindowHandle,
    floating: Option<AnyWindowHandle>,
    opening: Option<u64>,
    window_epoch: Rc<Cell<u64>>,
    pending: Option<Task<()>>,
    position: Option<Position>,
    position_task: Option<Task<()>>,
    position_io: Arc<Mutex<Option<crate::platform::WindowPosition>>>,
    result: Rc<RefCell<Option<Result<Response, String>>>>,
    images: Vec<(&'static str, PathBuf)>,
}

impl EventEmitter<Changed> for Avatar {}

#[derive(Clone)]
pub struct Binding {
    avatar: Entity<Avatar>,
    view: Entity<AvatarView>,
    targets: Rc<RefCell<Geometry>>,
    result: Rc<RefCell<Option<Result<Response, String>>>>,
    window_epoch: Rc<Cell<u64>>,
}

#[derive(Clone)]
struct Target {
    scope: Scope,
    seen: bool,
    diagnosed: bool,
    fallback: bool,
    bounds: Bounds<Pixels>,
    focus: FocusHandle,
}

#[derive(Default)]
struct Geometry {
    targets: Vec<Target>,
    workspace: Bounds<Pixels>,
    visible: bool,
    diagnostics: u8,
}

impl Geometry {
    fn targets(&self) -> impl Iterator<Item = (&Scope, Bounds<Pixels>)> + Clone {
        self.targets
            .iter()
            .filter(|target| !target.fallback)
            .map(|target| (&target.scope, target.bounds))
    }

    fn dock_target(&self, scope: &Scope) -> Option<Bounds<Pixels>> {
        dock_target_bounds(scope, self.targets())
    }

    fn target_at(&self, desktop: Point<Pixels>) -> Option<(&Scope, Bounds<Pixels>)> {
        if !self.visible || !self.workspace.contains(&desktop) {
            return None;
        }
        let local = desktop - self.workspace.origin;
        hit_target(self.targets(), local)
    }
}

fn dock_target_bounds<'a>(
    scope: &Scope,
    targets: impl Iterator<Item = (&'a Scope, Bounds<Pixels>)> + Clone,
) -> Option<Bounds<Pixels>> {
    targets
        .clone()
        .find(|(candidate, _)| *candidate == scope)
        .map(|(_, bounds)| visible_bounds(scope, bounds, targets))
        .filter(|bounds| !bounds.is_empty())
}

fn visible_bounds<'a>(
    scope: &Scope,
    mut bounds: Bounds<Pixels>,
    targets: impl Iterator<Item = (&'a Scope, Bounds<Pixels>)>,
) -> Bounds<Pixels> {
    if matches!(scope, Scope::Vessel { .. }) {
        for (scope, portal) in targets {
            if matches!(scope, Scope::Portal { .. })
                && !portal.is_empty()
                && !bounds.intersect(&portal).is_empty()
            {
                bounds.size.width = (portal.origin.x - bounds.origin.x).max(px(0.));
            }
        }
    }
    bounds
}

fn hit_target<'a>(
    targets: impl Iterator<Item = (&'a Scope, Bounds<Pixels>)> + Clone,
    local: Point<Pixels>,
) -> Option<(&'a Scope, Bounds<Pixels>)> {
    targets
        .clone()
        .filter(|(scope, _)| matches!(scope, Scope::Portal { .. }))
        .chain(
            targets
                .clone()
                .filter(|(scope, _)| !matches!(scope, Scope::Portal { .. })),
        )
        .filter(|(_, bounds)| !bounds.is_empty() && bounds.contains(&local))
        .find_map(|(scope, bounds)| {
            let bounds = visible_bounds(scope, bounds, targets.clone());
            (!bounds.is_empty() && bounds.contains(&local)).then_some((scope, bounds))
        })
}

struct Drag {
    source: AnyWindowHandle,
    start: Point<Pixels>,
    position: Point<Pixels>,
    offset: Point<Pixels>,
    size: f32,
    began: Instant,
    moved: bool,
}

#[derive(Clone, Copy, PartialEq)]
enum Surface {
    Workspace,
    Floating,
}

struct Position {
    window: AnyWindowHandle,
    native: u32,
    epoch: u64,
    desired: Point<i32>,
    cancelled: Arc<AtomicBool>,
}

impl Drop for Position {
    fn drop(&mut self) {
        self.cancelled.store(true, Ordering::Release);
    }
}

fn scope_name(scope: &Scope) -> &'static str {
    match scope {
        Scope::Workspace => "Whole workspace",
        Scope::Voyage { .. } => "Voyage",
        Scope::Fleet { .. } => "Fleet",
        Scope::Vessel { .. } => "Vessel",
        Scope::Portal { .. } => "Portal",
    }
}

fn asset(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("assets")
        .join(name)
}

impl Avatar {
    fn update_dock_visibility(&mut self, cx: &mut Context<Self>) {
        let visible = self.geometry.borrow().dock_target(&self.scope).is_some();
        if self.dock_visible != visible {
            self.dock_visible = visible;
            cx.emit(Changed);
        }
    }

    fn applied_dock(&mut self, request_id: &str, expected_epoch: u64, cx: &mut Context<Self>) {
        if request_id.is_empty() || request_id == self.dock_receipt {
            return;
        }
        self.dock_receipt = request_id.to_owned();
        if self.window_epoch.get() != expected_epoch {
            return;
        }
        self.drag = None;
        let epoch = self.advance_window_epoch();
        self.opening = None;
        let avatar = cx.weak_entity();
        let workspace = self.workspace;
        cx.defer(move |cx| {
            if avatar
                .upgrade()
                .is_some_and(|avatar| avatar.read(cx).window_epoch.get() == epoch)
            {
                let _ = workspace.update(cx, |_, window, _| window.activate_window());
            }
        });
        if let Some(floating) = self.floating.take() {
            cx.defer(move |cx| {
                let _ = floating.update(cx, |_, window, _| window.remove_window());
            });
        }
        crate::platform::tone(true);
        cx.notify();
    }

    fn advance_window_epoch(&mut self) -> u64 {
        self.position = None;
        self.position_task = None;
        let epoch = self.window_epoch.get().wrapping_add(1);
        self.window_epoch.set(epoch);
        epoch
    }

    fn report(&mut self, message: String, cx: &mut Context<Self>) {
        *self.result.borrow_mut() = Some(Err(message));
        cx.emit(Changed);
    }

    fn activate(&mut self, window: &Window, origin: Point<Pixels>, cx: &mut Context<Self>) {
        if self.floating == Some(window.window_handle()) {
            let workspace = self.workspace;
            let epoch = self.window_epoch.get();
            let avatar = cx.weak_entity();
            cx.defer(move |cx| {
                if avatar
                    .upgrade()
                    .is_some_and(|avatar| avatar.read(cx).window_epoch.get() == epoch)
                {
                    let _ = workspace.update(cx, |_, window, _| window.activate_window());
                }
            });
        } else {
            if std::env::var_os("VOYAGER_AVATAR_DIAGNOSTICS").is_some() {
                eprintln!("Avatar float trigger: activation");
            }
            self.float(origin, cx);
        }
    }

    fn moving(&mut self, event: &gpui::MouseMoveEvent, window: &Window, cx: &mut Context<Self>) {
        let Some(drag) = self
            .drag
            .as_mut()
            .filter(|drag| drag.source == window.window_handle())
        else {
            return;
        };
        if event.pressed_button != Some(gpui::MouseButton::Left) {
            self.cancel_drag(cx);
            return;
        }
        let desktop = window.bounds().origin + event.position;
        let delta = desktop - drag.start;
        if !drag.moved && f32::from(delta.x).hypot(f32::from(delta.y)) > 7. {
            drag.moved = true;
            if drag.source == self.workspace {
                crate::platform::tone(false);
            }
        }
        if drag.moved {
            drag.position = desktop - drag.offset;
            if self.floating == Some(drag.source) {
                let origin = drag.position - point(px(13.), px(13.));
                self.position_float(origin, window, cx);
            }
            cx.notify();
        }
    }

    fn cancel_drag(&mut self, cx: &mut Context<Self>) {
        if self
            .drag
            .take()
            .is_some_and(|drag| drag.moved && drag.source == self.workspace)
        {
            crate::platform::tone(true);
        }
        cx.notify();
    }

    fn released(&mut self, event: &gpui::MouseUpEvent, window: &Window, cx: &mut Context<Self>) {
        if self
            .drag
            .as_ref()
            .is_none_or(|drag| drag.source != window.window_handle())
        {
            return;
        }
        let Some(drag) = self.drag.take() else {
            return;
        };
        if drag.moved {
            let scope = self
                .geometry
                .borrow()
                .target_at(window.bounds().origin + event.position)
                .map(|(scope, _)| scope.clone());
            if let Some(scope) = scope {
                self.dock(scope, cx);
            } else if self.floating == Some(drag.source) {
                let origin =
                    window.bounds().origin + event.position - drag.offset - point(px(13.), px(13.));
                if std::env::var_os("VOYAGER_AVATAR_DIAGNOSTICS").is_some() {
                    let scaled = origin.scale(window.scale_factor());
                    eprintln!(
                        "Avatar floating release: native={:?} epoch={} window={:?} event={:?} offset={:?} scale={} scaled={scaled:?} device={:?}",
                        crate::platform::native_window(window),
                        self.window_epoch.get(),
                        window.bounds().origin,
                        event.position,
                        drag.offset,
                        window.scale_factor(),
                        scaled.map(|value| i32::from(gpui::DevicePixels::from(value))),
                    );
                }
                self.position_float(origin, window, cx);
            } else {
                crate::platform::tone(true);
            }
        } else if drag.began.elapsed().as_millis() < 350 {
            self.activate(window, drag.position - point(px(13.), px(13.)), cx);
        }
        cx.notify();
    }

    fn position_float(&mut self, origin: Point<Pixels>, window: &Window, cx: &mut Context<Self>) {
        let handle = window.window_handle();
        if self.floating != Some(handle) {
            return;
        }
        let native = match crate::platform::native_window(window) {
            Ok(native) => native,
            Err(message) => {
                self.report(message, cx);
                return;
            }
        };
        let epoch = self.window_epoch.get();
        let desired = origin
            .scale(window.scale_factor())
            .map(|value| i32::from(gpui::DevicePixels::from(value)));
        if let Some(position) = self.position.as_mut().filter(|position| {
            position.window == handle && position.native == native && position.epoch == epoch
        }) {
            position.desired = desired;
            return;
        }
        self.position = None;
        self.position_task = None;
        let cancelled = Arc::new(AtomicBool::new(false));
        self.position = Some(Position {
            window: handle,
            native,
            epoch,
            desired,
            cancelled: Arc::clone(&cancelled),
        });
        let io = Arc::clone(&self.position_io);
        self.position_task = Some(cx.spawn(async move |avatar, cx| {
            let mut position = desired;
            loop {
                let permit = Arc::clone(&cancelled);
                let io = Arc::clone(&io);
                let result = cx
                    .background_executor()
                    .spawn(async move {
                        (|| {
                            let mut connection = io.lock().map_err(|error| error.to_string())?;
                            if permit.load(Ordering::Acquire) {
                                return Ok(false);
                            }
                            match connection.as_mut() {
                                Some(connection) => connection.move_to(native, position, &permit),
                                None => match crate::platform::WindowPosition::new() {
                                    Ok(mut opened) => {
                                        let result = opened.move_to(native, position, &permit);
                                        *connection = Some(opened);
                                        result
                                    }
                                    Err(error) => Err(error),
                                },
                            }
                        })()
                    })
                    .await;
                let next = avatar
                    .update(cx, |avatar, cx| {
                        let current = avatar.position.as_ref().filter(|current| {
                            current.window == handle
                                && current.native == native
                                && current.epoch == epoch
                                && Arc::ptr_eq(&current.cancelled, &cancelled)
                                && avatar.window_epoch.get() == epoch
                                && avatar.floating == Some(handle)
                        })?;
                        if let Err(message) = result {
                            avatar.report(
                                format!("Floating avatar movement unavailable: {message}"),
                                cx,
                            );
                        } else if result == Ok(true) && current.desired != position {
                            return Some(current.desired);
                        }
                        avatar.position = None;
                        avatar.position_task = None;
                        None
                    })
                    .ok()
                    .flatten();
                let Some(next) = next else { break };
                position = next;
            }
        }));
    }

    fn dock(&mut self, scope: Scope, cx: &mut Context<Self>) {
        if self.pending.is_some() {
            return;
        }
        let request = Request {
            request_id: self.client.request_id(),
            expected_version: self.version,
            action: Action::Dock { context: scope },
        };
        let client = self.client.clone();
        let epoch = self.window_epoch.get();
        self.pending = Some(cx.spawn(async move |avatar, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { client.call(request) })
                .await;
            let _ = avatar.update(cx, |avatar, cx| {
                avatar.pending = None;
                if let Ok(response) = &result {
                    if response.version >= avatar.version {
                        avatar.version = response.version;
                        avatar.scope = response.layout.context.clone();
                    }
                    if response.status == Status::Applied {
                        avatar.applied_dock(&response.request_id, epoch, cx);
                    }
                }
                *avatar.result.borrow_mut() = Some(result);
                cx.emit(Changed);
                cx.notify();
            });
        }));
    }

    fn float(&mut self, origin: Point<Pixels>, cx: &mut Context<Self>) -> bool {
        let epoch = self.advance_window_epoch();
        if self.floating.is_some() {
            let workspace = self.workspace;
            let avatar = cx.weak_entity();
            cx.defer(move |cx| {
                if avatar
                    .upgrade()
                    .is_some_and(|avatar| avatar.read(cx).window_epoch.get() == epoch)
                {
                    let _ = workspace.update(cx, |_, window, _| window.minimize_window());
                }
            });
            return true;
        }
        self.opening = Some(epoch);
        let avatar = cx.entity();
        let workspace = self.workspace;
        let geometry = Rc::clone(&self.geometry);
        let options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                origin,
                size(px(120.), px(120.)),
            ))),
            titlebar: None,
            kind: WindowKind::PopUp,
            is_resizable: false,
            window_background: WindowBackgroundAppearance::Transparent,
            app_id: Some("voyager-floating-avatar".into()),
            ..Default::default()
        };
        cx.defer(move |cx| {
            if avatar.read(cx).window_epoch.get() != epoch || avatar.read(cx).floating.is_some() {
                return;
            }
            let view_avatar = avatar.clone();
            let result = cx.open_window(options, move |window, cx| {
                cx.new(|cx| AvatarView::new(view_avatar, Surface::Floating, geometry, window, cx))
            });
            if avatar.read(cx).window_epoch.get() != epoch || avatar.read(cx).floating.is_some() {
                if let Ok(window) = result {
                    let _ = window.update(cx, |_, window, _| window.remove_window());
                }
                return;
            }
            let opened = result.is_ok();
            avatar.update(cx, |avatar, cx| {
                avatar.opening = None;
                match result {
                    Ok(window) => {
                        avatar.drag = None;
                        avatar.floating = Some(window.into());
                        crate::platform::tone(false);
                    }
                    Err(error) => {
                        avatar.report(format!("Floating avatar unavailable: {error:#}"), cx)
                    }
                }
                cx.notify();
            });
            if opened {
                let _ = workspace.update(cx, |_, window, _| window.minimize_window());
            }
        });
        true
    }
}

impl Binding {
    pub fn new(client: Client, window: &mut Window, cx: &mut App) -> Self {
        let workspace = window.window_handle();
        let result = Rc::default();
        let window_epoch = Rc::new(Cell::new(0));
        let targets = Rc::default();
        let avatar = cx.new(|cx| Avatar {
            client,
            version: 0,
            scope: Scope::Workspace,
            dock_visible: false,
            projection_key: String::new(),
            dock_receipt: String::new(),
            drag: None,
            geometry: Rc::clone(&targets),
            motion: Motion::new(
                cx.reduce_motion() || std::env::var_os("VOYAGER_REDUCED_MOTION").is_some(),
            ),
            epoch: Instant::now(),
            workspace,
            floating: None,
            opening: None,
            window_epoch: Rc::clone(&window_epoch),
            pending: None,
            position: None,
            position_task: None,
            position_io: Arc::new(Mutex::new(None)),
            result: Rc::clone(&result),
            images: [
                motion::IDLE,
                motion::READING[0],
                motion::READING[1],
                "book-frames/book-out.png",
                "book-frames/book-away.png",
                "stretch-frames/frame-1-uncrossing.png",
                "stretch-frames/frame-2-stretched.png",
                "stretch-frames/frame-3-peak-stretch.png",
                "avatar-tint.svg",
            ]
            .into_iter()
            .map(|name| (name, asset(name)))
            .collect(),
        });
        let view = cx.new(|cx| {
            AvatarView::new(
                avatar.clone(),
                Surface::Workspace,
                Rc::clone(&targets),
                window,
                cx,
            )
        });
        let weak = avatar.downgrade();
        window.on_window_should_close(cx, move |window, cx| {
            if std::env::var_os("VOYAGER_AVATAR_DIAGNOSTICS").is_some() {
                eprintln!("Avatar float trigger: workspace-close");
            }
            let origin = window.bounds().origin + point(px(80.), px(60.));
            let floated = weak
                .update(cx, |avatar, cx| avatar.float(origin, cx))
                .unwrap_or(false);
            !floated
        });
        Self {
            avatar,
            view,
            targets,
            result,
            window_epoch,
        }
    }

    pub fn module(&self) -> HostModule {
        let view = self.view.clone();
        let avatar = self.avatar.clone();
        let targets = Rc::clone(&self.targets);
        let layout_targets = Rc::clone(&self.targets);
        let target_avatar = self.avatar.clone();
        let target_view = self.view.downgrade();
        let result = Rc::clone(&self.result);
        let epoch = Rc::clone(&self.window_epoch);
        let visibility = Rc::clone(&self.targets);
        HostModule::new(crate::script_types::AVATAR_MODULE)
            .declarations(crate::script_types::AVATAR)
            .function("dock_target_visible", move |arguments| {
                let scope: Scope = serde_json::from_str(arguments.string(0)?)
                    .map_err(|error| HostError::new(error.to_string()))?;
                Ok(HostValue::from(visibility.borrow().dock_target(&scope).is_some()))
            })
            .component("Brand", |_, _, _| {
                div()
                    .id("voyager-brand")
                    .role(gpui::Role::Image)
                    .aria_label("Voyager. Let's Go Together.")
                    .relative()
                    .w(px(200.))
                    .h(px(202.))
                    .child(
                        img(asset("native-brand.png"))
                            .absolute()
                            .top_0()
                            .left_0()
                            .w(px(200.))
                            .h(px(107.)),
                    )
                    .child(
                        img(asset("tagline.png"))
                            .absolute()
                            .left_0()
                            .top(px(153.5))
                            .w(px(200.))
                            .h(px(13.5)),
                    )
                    .into_any_element()
            })
            .component("Layer", move |mut args, _, cx| {
                let key = args
                    .props()
                    .get("layoutKey")
                    .and_then(HostValue::as_str)
                    .unwrap_or("");
                let receipt = args
                    .props()
                    .get("dockReceipt")
                    .and_then(HostValue::as_str)
                    .unwrap_or("");
                let receipt_epoch = args
                    .props()
                    .get("dockEpoch")
                    .and_then(HostValue::as_str)
                    .and_then(|value| value.parse::<u64>().ok());
                let scope = args.props().get("scope").and_then(HostValue::as_str);
                let version = args
                    .props()
                    .get("version")
                    .and_then(HostValue::as_str)
                    .and_then(|s| s.parse::<u64>().ok());
                let retired = {
                    let mut geometry = layout_targets.borrow_mut();
                    let before = geometry.targets.len();
                    geometry.targets.retain(|target| target.seen);
                    for target in &mut geometry.targets {
                        target.seen = false;
                    }
                    geometry.targets.len() != before
                };
                avatar.update(cx, |avatar, cx| {
                    if retired {
                        cx.notify();
                    }
                    if let Some(epoch) = receipt_epoch {
                        avatar.applied_dock(receipt, epoch, cx);
                    }
                    if let (Some(raw), Some(version)) = (scope, version)
                        && version >= avatar.version
                        && let Ok(scope) = serde_json::from_str::<Scope>(raw)
                    {
                        let changed = avatar.scope != scope || avatar.projection_key != key;
                        avatar.scope = scope;
                        avatar.version = version;
                        if avatar.projection_key != key {
                            avatar.cancel_drag(cx);
                        }
                        avatar.projection_key = key.to_owned();
                        if changed {
                            cx.notify();
                        }
                    }
                    avatar.update_dock_visibility(cx);
                });
                div()
                    .relative()
                    .size_full()
                    .children(args.take_children())
                    .child(view.clone())
                    .into_any_element()
            })
            .component("Target", move |mut args, _, cx| {
                let scope = args
                    .props()
                    .get("scope")
                    .and_then(HostValue::as_str)
                    .and_then(|s| serde_json::from_str::<Scope>(s).ok());
                let Some(scope) = scope else {
                    return div().child("Invalid avatar scope").into_any_element();
                };
                let fallback = args
                    .props()
                    .get("fallback")
                    .and_then(HostValue::as_bool)
                    .unwrap_or(false);
                let focus = {
                    let mut geometry = targets.borrow_mut();
                    let targets = &mut geometry.targets;
                    if let Some(target) = targets
                        .iter_mut()
                        .find(|target| target.scope == scope && target.fallback == fallback)
                    {
                        target.seen = true;
                        target.focus.clone()
                    } else {
                        let focus = cx.focus_handle();
                        targets.push(Target {
                            scope: scope.clone(),
                            seen: true,
                            diagnosed: false,
                            fallback,
                            bounds: Bounds::default(),
                            focus: focus.clone(),
                        });
                        focus
                    }
                };
                let measure = Rc::clone(&targets);
                let measured_scope = scope.clone();
                let view = target_view.clone();
                let geometry_avatar = target_avatar.downgrade();
                let keyboard = target_avatar.clone();
                let key_scope = scope.clone();
                let element = div()
                    .id(args.id().to_owned())
                    .relative()
                    .size_full()
                    .flex()
                    .flex_col()
                    .min_w(px(0.))
                    .min_h(px(0.))
                    .flex_1()
                    .when(!fallback, |element| {
                        element
                            .track_focus(&focus)
                            .tab_stop(true)
                            .role(gpui::Role::Group)
                            .aria_label(format!("{} dock", scope_name(&scope)))
                            .aria_description("Shift+Enter to dock Voyager in this context")
                    })
                    .children(args.take_children())
                    .child(
                        canvas(
                            move |bounds, window, cx| {
                                let clipped = bounds.intersect(&window.content_mask().bounds);
                                let mut geometry = measure.borrow_mut();
                                let (changed, first) = if let Some(target) =
                                    geometry.targets.iter_mut().find(|target| {
                                        target.scope == measured_scope
                                            && target.fallback == fallback
                                    })
                                {
                                    let changed = target.bounds != clipped;
                                    target.bounds = clipped;
                                    let first = !target.diagnosed;
                                    target.diagnosed = true;
                                    (changed, first)
                                } else {
                                    (false, false)
                                };
                                if (changed || first) && geometry.diagnostics < 24 && std::env::var_os("VOYAGER_AVATAR_DIAGNOSTICS").is_some() {
                                    geometry.diagnostics += 1;
                                    eprintln!("Avatar target: scope={measured_scope:?} fallback={fallback} raw={bounds:?} clipped={clipped:?} mask={:?}", window.content_mask().bounds);
                                }
                                drop(geometry);
                                if changed {
                                    let view = view.clone();
                                    let avatar = geometry_avatar.clone();
                                    window.defer(cx, move |_, cx| {
                                        let _ = view.update(cx, |_, cx| cx.notify());
                                        let _ = avatar.update(cx, |avatar, cx| avatar.update_dock_visibility(cx));
                                    });
                                }
                            },
                            |_, _, _, _| {},
                        )
                        .absolute()
                        .size_full(),
                    );
                if fallback {
                    return element.into_any_element();
                }
                element
                    .on_key_down(move |event, window, cx| {
                        if focus.is_focused(window)
                            && event.keystroke.key == "enter"
                            && event.keystroke.modifiers.shift
                        {
                            keyboard.update(cx, |avatar, cx| avatar.dock(key_scope.clone(), cx));
                            cx.stop_propagation();
                        }
                    })
                    .into_any_element()
            })
            .function("window_epoch", move |_| {
                Ok(HostValue::from(epoch.get().to_string()))
            })
            .function("take_result", move |_| match result.borrow_mut().take() {
                None => Ok(HostValue::Null),
                Some(Ok(response)) => serde_json::to_string(&response)
                    .map(HostValue::from)
                    .map_err(|error| HostError::new(error.to_string())),
                Some(Err(error)) => Err(HostError::new(error)),
            })
    }

    pub fn observe(&self, root: &Entity<ShellRoot>, cx: &mut App) -> Subscription {
        let root = root.downgrade();
        cx.subscribe(&self.avatar, move |_, _: &Changed, cx| {
            if let Some(root) = root.upgrade()
                && let Ok(script) = root.read(cx).content().clone().downcast::<ScriptView>()
            {
                script.update(cx, |script, cx| script.refresh(cx));
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portal_hit_precedes_an_earlier_vessel_and_uses_its_visible_bounds() {
        let vessel = Scope::Vessel {
            id: voyager_contract::PlacementId("vessel".into()),
        };
        let portal = Scope::Portal {
            id: voyager_contract::PlacementId("portal".into()),
        };
        let raw = Bounds::new(point(px(10.), px(20.)), size(px(200.), px(100.)));
        let overlay = Bounds::new(point(px(160.), px(40.)), size(px(50.), px(80.)));
        let targets = [(&vessel, raw), (&portal, overlay)];
        assert_eq!(
            hit_target(targets.into_iter(), point(px(180.), px(60.))),
            Some((&portal, overlay))
        );
        let visible = Bounds::new(raw.origin, size(px(150.), px(100.)));
        assert_eq!(visible_bounds(&vessel, raw, targets.into_iter()), visible);
        assert_eq!(
            dock_target_bounds(&vessel, targets.into_iter()),
            Some(visible)
        );
        assert_eq!(
            hit_target(targets.into_iter(), point(px(80.), px(60.))),
            Some((&vessel, visible))
        );
        assert!(hit_target(targets.into_iter(), point(px(180.), px(30.))).is_none());
        assert_eq!(
            visible_bounds(&portal, overlay, targets.into_iter()),
            overlay
        );
    }

    #[test]
    fn disjoint_portals_keep_vessels_unchanged_and_full_cover_has_no_vessel_hit() {
        let vessel = Scope::Vessel {
            id: voyager_contract::PlacementId("vessel".into()),
        };
        let portal = Scope::Portal {
            id: voyager_contract::PlacementId("portal".into()),
        };
        let raw = Bounds::new(point(px(10.), px(20.)), size(px(200.), px(100.)));
        assert_eq!(visible_bounds(&vessel, raw, [].into_iter()), raw);
        assert_eq!(dock_target_bounds(&vessel, [].into_iter()), None);
        for origin in [point(px(210.), px(20.)), point(px(160.), px(120.))] {
            let disjoint = Bounds::new(origin, size(px(50.), px(100.)));
            assert_eq!(
                visible_bounds(&vessel, raw, [(&portal, disjoint)].into_iter()),
                raw
            );
        }
        let covered = visible_bounds(&vessel, raw, [(&portal, raw)].into_iter());
        assert!(covered.is_empty());
        assert_eq!(
            dock_target_bounds(&vessel, [(&vessel, raw), (&portal, raw)].into_iter()),
            None
        );
        assert!(hit_target([(&vessel, covered)].into_iter(), raw.center()).is_none());
    }
}
