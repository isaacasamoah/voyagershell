use super::{Avatar, Drag, Geometry, Surface, asset};
use crate::{avatar_motion as motion, platform};
use gpui::{
    Bounds, Context, Entity, FocusHandle, IntoElement, MouseButton, ParentElement, Pixels, Point,
    Render, Styled, Subscription, Task, Window, canvas, div, img, point, prelude::*, px, rgb, rgba,
};
use std::{
    cell::{Cell, RefCell},
    rc::Rc,
    time::Instant,
};
use voyager_contract::Context as Scope;

pub(super) struct AvatarView {
    avatar: Entity<Avatar>,
    surface: Surface,
    targets: Rc<RefCell<Geometry>>,
    focus: FocusHandle,
    _observe: Subscription,
    _visibility: Option<Subscription>,
    visibility_epoch: u64,
    _minimize_watch: Option<Task<()>>,
    diagnostic_last: Option<(Scope, bool, bool)>,
    diagnostic_count: u8,
    diagnostics_enabled: bool,
    painted: Rc<Cell<bool>>,
}

impl AvatarView {
    pub(super) fn new(
        avatar: Entity<Avatar>,
        surface: Surface,
        targets: Rc<RefCell<Geometry>>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        if surface == Surface::Floating {
            window.on_window_should_close(cx, |_, _| false);
        }
        let observe = cx.observe(&avatar, |_, _, cx| cx.notify());
        let visibility = (surface == Surface::Workspace).then(|| {
            cx.observe_window_visibility(window, move |this, visibility, _, _| {
                this.targets.borrow_mut().visible = visibility.is_visible();
                this.visibility_epoch = this.visibility_epoch.wrapping_add(1);
            })
        });
        let mut view = Self {
            avatar,
            surface,
            targets,
            focus: cx.focus_handle(),
            _observe: observe,
            _visibility: visibility,
            visibility_epoch: 0,
            _minimize_watch: None,
            diagnostic_last: None,
            diagnostic_count: 0,
            diagnostics_enabled: std::env::var_os("VOYAGER_AVATAR_DIAGNOSTICS").is_some(),
            painted: Rc::new(Cell::new(false)),
        };
        if surface == Surface::Workspace {
            view.watch_minimize(window, cx);
        }
        view
    }

    fn watch_minimize(&mut self, window: &Window, cx: &mut Context<Self>) {
        let target = match platform::native_window(window) {
            Ok(target) => target,
            Err(message) => {
                self.avatar
                    .update(cx, |avatar, cx| avatar.report(message, cx));
                return;
            }
        };
        let window_handle = window.window_handle();
        self._minimize_watch = Some(cx.spawn(async move |view, cx| {
            let initial = cx
                .background_executor()
                .spawn(async move { platform::WindowState::new(target) })
                .await;
            let mut watch = match initial {
                Ok(watch) => watch,
                Err(message) => {
                    let _ = view.update(cx, |view, cx| {
                        view.avatar
                            .update(cx, |avatar, cx| avatar.report(message, cx));
                    });
                    return;
                }
            };
            loop {
                let (next_watch, changed) = cx
                    .background_executor()
                    .spawn(async move {
                        let changed = watch.next().await;
                        (watch, changed)
                    })
                    .await;
                watch = next_watch;
                match changed {
                    Ok(true) => (),
                    Ok(false) => break,
                    Err(message) => {
                        let _ = view.update(cx, |view, cx| {
                            view.avatar
                                .update(cx, |avatar, cx| avatar.report(message, cx));
                        });
                        break;
                    }
                }
                let snapshot = window_handle
                    .update(cx, |_, window, cx| {
                        view.update(cx, |view, cx| {
                            (platform::native_window(window).ok() == Some(target)).then(|| {
                                (
                                    view.visibility_epoch,
                                    view.avatar.read(cx).window_epoch.get(),
                                )
                            })
                        })
                    })
                    .ok()
                    .and_then(Result::ok)
                    .flatten();
                let Some((visibility_epoch, intent)) = snapshot else {
                    break;
                };
                let (next_watch, result) = cx
                    .background_executor()
                    .spawn(async move {
                        let result = watch.read();
                        (watch, result)
                    })
                    .await;
                watch = next_watch;
                let retry = window_handle
                    .update(cx, |_, window, cx| {
                        view.update(cx, |view, cx| {
                            if platform::native_window(window).ok() != Some(target) {
                                return None;
                            }
                            if view.avatar.read(cx).window_epoch.get() != intent {
                                return Some(false);
                            }
                            if view.visibility_epoch != visibility_epoch {
                                return Some(true);
                            }
                            match result {
                                Ok(Some(true)) => {
                                    let origin = window.bounds().origin + point(px(80.), px(60.));
                                    view.avatar.update(cx, |avatar, cx| {
                                        if avatar.floating.is_none() && avatar.opening.is_none() {
                                            if std::env::var_os("VOYAGER_AVATAR_DIAGNOSTICS")
                                                .is_some()
                                            {
                                                eprintln!("Avatar float trigger: native-minimize");
                                            }
                                            avatar.float(origin, cx);
                                        }
                                    });
                                }
                                Ok(_) => (),
                                Err(message) => {
                                    view.avatar
                                        .update(cx, |avatar, cx| avatar.report(message, cx));
                                    return None;
                                }
                            }
                            Some(false)
                        })
                    })
                    .ok()
                    .and_then(Result::ok)
                    .flatten();
                match retry {
                    Some(true) => watch.recheck(),
                    Some(false) => (),
                    None => break,
                }
            }
        }));
    }

    fn events(&self) -> impl IntoElement {
        let avatar = self.avatar.downgrade();
        canvas(
            |_, _, _| (),
            move |_, _, window, _| {
                let moving = avatar.clone();
                window.on_mouse_event(move |event: &gpui::MouseMoveEvent, phase, window, cx| {
                    if phase == gpui::DispatchPhase::Capture {
                        let _ = moving.update(cx, |avatar, cx| avatar.moving(event, window, cx));
                    }
                });
                let released = avatar.clone();
                window.on_mouse_event(move |event: &gpui::MouseUpEvent, phase, window, cx| {
                    if phase == gpui::DispatchPhase::Capture && event.button == MouseButton::Left {
                        let _ =
                            released.update(cx, |avatar, cx| avatar.released(event, window, cx));
                    }
                });
                let cancelled = avatar.clone();
                window.on_mouse_event(move |event: &gpui::MouseExitEvent, phase, window, cx| {
                    if phase == gpui::DispatchPhase::Capture && event.pressed_button.is_none() {
                        let _ = cancelled.update(cx, |avatar, cx| {
                            if avatar
                                .drag
                                .as_ref()
                                .is_some_and(|drag| drag.source == window.window_handle())
                            {
                                avatar.cancel_drag(cx);
                            }
                        });
                    }
                });
            },
        )
        .absolute()
        .size_full()
    }

    fn position(&self, avatar: &Avatar) -> Option<(Point<Pixels>, f32)> {
        if let Some(drag) = &avatar.drag
            && drag.moved
        {
            let geometry = self.targets.borrow();
            let over_workspace =
                geometry.visible && geometry.workspace.contains(&(drag.position + drag.offset));
            if self.surface == Surface::Workspace && over_workspace {
                return Some((drag.position - geometry.workspace.origin, drag.size));
            }
            if self.surface == Surface::Floating && over_workspace {
                return None;
            }
            if self.surface == Surface::Workspace {
                if drag.source == avatar.workspace {
                    let local = drag.position - geometry.workspace.origin;
                    return Some((
                        point(
                            local.x.clamp(
                                px(0.),
                                (geometry.workspace.size.width - px(drag.size)).max(px(0.)),
                            ),
                            local.y.clamp(
                                px(0.),
                                (geometry.workspace.size.height - px(drag.size)).max(px(0.)),
                            ),
                        ),
                        drag.size,
                    ));
                }
                return None;
            }
        }
        if self.surface != Surface::Workspace {
            return Some((point(px(13.), px(13.)), 94.));
        }
        if avatar.floating.is_some() {
            return None;
        }
        let geometry = self.targets.borrow();
        let target = geometry
            .targets
            .iter()
            .find(|target| target.scope == avatar.scope && !target.fallback)
            .or_else(|| geometry.targets.iter().find(|target| target.fallback))?;
        let b = target.bounds;
        if b.size.width <= px(0.) || b.size.height <= px(0.) {
            return None;
        }
        if target.fallback {
            return Some((b.origin + point(px(5.), px(2.)), 38.));
        }
        match target.scope {
            Scope::Workspace => Some((point(b.center().x - px(47.), b.origin.y + px(47.)), 94.)),
            Scope::Voyage { .. } | Scope::Fleet { .. } => {
                Some((b.origin + point(px(12.), px(2.)), 38.))
            }
            Scope::Vessel { .. } | Scope::Portal { .. } => Some((
                point(
                    b.center().x - px(47.),
                    b.origin.y + b.size.height * 0.67 - px(47.),
                ),
                94.,
            )),
        }
    }
}

impl Render for AvatarView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.surface == Surface::Workspace {
            let mut geometry = self.targets.borrow_mut();
            geometry.workspace = Bounds::new(window.bounds().origin, window.viewport_size());
            geometry.visible = window.is_visible();
        }
        self.avatar.update(cx, |avatar, _| avatar.motion.tick());
        let avatar = self.avatar.read(cx);
        let position = self.position(avatar);
        if self.diagnostics_enabled && self.diagnostic_count < 24 {
            let signature = (
                avatar.scope.clone(),
                avatar.floating.is_some(),
                position.is_some(),
            );
            if self.diagnostic_last.as_ref() != Some(&signature) {
                self.diagnostic_count += 1;
                self.diagnostic_last = Some(signature);
                let geometry = self.targets.borrow();
                eprintln!(
                    "Avatar position: scope={:?} version={} floating={} opening={} workspace={:?} targets={} position={position:?}",
                    avatar.scope,
                    avatar.version,
                    avatar.floating.is_some(),
                    avatar.opening.is_some(),
                    geometry.workspace,
                    geometry.targets.len()
                );
            }
        }
        let Some((position, s)) = position else {
            return div()
                .absolute()
                .top_0()
                .left_0()
                .size_full()
                .child(self.events())
                .into_any_element();
        };
        if !avatar.motion.reduced_motion {
            window.request_animation_frame();
        }
        let (base, fade) = motion::frame_layers(
            avatar.motion.previous,
            avatar.motion.frame,
            avatar.motion.since.elapsed().as_secs_f32(),
            avatar.motion.fade,
        );
        let frame_path = |name| {
            avatar
                .images
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, path)| path.clone())
                .unwrap_or_else(|| asset(motion::IDLE))
        };
        let float = if avatar.motion.reduced_motion {
            0.
        } else {
            motion::float_offset(avatar.epoch.elapsed().as_secs_f32())
        };
        let dragging = avatar.drag.as_ref().is_some_and(|drag| drag.moved);
        let quiet = !dragging
            && self.surface == Surface::Workspace
            && s > 38.
            && matches!(avatar.scope, Scope::Vessel { .. } | Scope::Portal { .. });
        let home =
            !dragging && self.surface == Surface::Workspace && avatar.scope == Scope::Workspace;

        let painted = self.painted.clone();
        let diagnostics = self.diagnostics_enabled;
        let image = div()
            .id("voyager-avatar")
            .absolute()
            .left(position.x)
            .top(position.y)
            .size(px(s))
            .track_focus(&self.focus)
            .tab_stop(true)
            .role(gpui::Role::Button)
            .aria_label("Voyager avatar")
            .aria_description(if self.surface == Surface::Floating {
                "Enter or Space to show the workspace. Drag to move or dock."
            } else {
                "Enter or Space to minimize the workspace. Drag to change context."
            })
            .on_a11y_action(gpui::AccessibleAction::Click, {
                let avatar = self.avatar.downgrade();
                move |_, window, cx| {
                    let origin = window.bounds().origin + position - point(px(13.), px(13.));
                    let _ = avatar.update(cx, |avatar, cx| avatar.activate(window, origin, cx));
                }
            })
            .child(
                div()
                    .id("avatar")
                    .size_full()
                    .rounded_full()
                    .border_1()
                    .border_color(rgba(if quiet {
                        0
                    } else if home {
                        0xffffff0e
                    } else {
                        0xffffff24
                    }))
                    .when(!quiet, |element| {
                        element.bg(gpui::linear_gradient(
                            145.,
                            gpui::linear_color_stop(
                                rgba(if home { 0x24283080 } else { 0x30343bd9 }),
                                0.,
                            ),
                            gpui::linear_color_stop(
                                rgba(if home { 0x16181c40 } else { 0x252831cc }),
                                1.,
                            ),
                        )
                        .color_space(gpui::ColorSpace::Srgb))
                    })
                    .opacity(if quiet { 0.3 } else { 1. })
                    .hover(|el| el.opacity(1.))
                    .cursor(if dragging {
                        gpui::CursorStyle::ClosedHand
                    } else {
                        gpui::CursorStyle::OpenHand
                    })
                    .on_mouse_down(
                        MouseButton::Left,
                        cx.listener(move |this, event: &gpui::MouseDownEvent, window, cx| {
                            let desktop = window.bounds().origin + event.position;
                            window.activate_window();
                            window.focus(&this.focus, cx);
                            this.avatar.update(cx, |avatar, _| {
                                avatar.drag = Some(Drag {
                                    source: window.window_handle(),
                                    start: desktop,
                                    position: window.bounds().origin + position,
                                    offset: event.position - position,
                                    size: s,
                                    began: Instant::now(),
                                    moved: false,
                                });
                            });
                            cx.stop_propagation();
                        }),
                    )
                    .child(
                        img(frame_path(base))
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
                                img(frame_path(avatar.motion.frame))
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
                    .child(
                        canvas(
                            |_, _, _| (),
                            move |bounds, _, _, _| {
                                if diagnostics && !painted.replace(true) {
                                    eprintln!("Avatar painted: bounds={bounds:?}");
                                }
                            },
                        )
                        .absolute()
                        .size_full(),
                    ),
            )
            .on_key_down(
                cx.listener(move |this, event: &gpui::KeyDownEvent, window, cx| {
                    if event.keystroke.key == "escape" {
                        this.avatar.update(cx, |avatar, cx| avatar.cancel_drag(cx));
                    } else if event.keystroke.key == "enter" || event.keystroke.key == "space" {
                        this.avatar.update(cx, |avatar, cx| {
                            avatar.activate(
                                window,
                                window.bounds().origin + position - point(px(13.), px(13.)),
                                cx,
                            )
                        });
                        cx.stop_propagation();
                    }
                }),
            )
            .into_any_element();
        let mut layer = div()
            .absolute()
            .top_0()
            .left_0()
            .size_full()
            .child(self.events());
        if self.surface == Surface::Workspace
            && let Some(drag) = &avatar.drag
            && drag.moved
            && let Some(target) = self.targets.borrow().target_at(drag.position + drag.offset)
        {
            layer = layer.child(
                div()
                    .absolute()
                    .left(target.bounds.origin.x)
                    .top(target.bounds.origin.y)
                    .w(target.bounds.size.width)
                    .h(target.bounds.size.height)
                    .border_1()
                    .border_color(rgb(0xb3d2e5)),
            );
        }
        layer.child(image).into_any_element()
    }
}
