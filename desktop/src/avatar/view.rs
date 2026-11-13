use super::{Avatar, Drag, Geometry, Surface, paint};
use crate::{avatar_motion as motion, platform};
use gpui::{
    Bounds, Context, Entity, FocusHandle, IntoElement, MouseButton, ParentElement, Pixels, Point,
    Render, Styled, Subscription, Task, Window, canvas, div, point, prelude::*, px, rgb, rgba,
    size,
};
use std::{
    cell::{Cell, RefCell},
    rc::Rc,
    sync::Arc,
    time::Instant,
};
use voyager_contract::{Context as Scope, avatar_animation::Trigger};

fn workspace_landing(bounds: Bounds<Pixels>) -> (Point<Pixels>, f32) {
    (
        point(bounds.center().x - px(47.), bounds.origin.y + px(47.)),
        94.,
    )
}

fn small_landing(bounds: Bounds<Pixels>) -> Point<Pixels> {
    let inset = ((bounds.size.width - px(38.)) / 2.)
        .max(px(0.))
        .min(px(12.));
    bounds.origin + point(inset, px(2.))
}

fn landing_preview(scope: &Scope, bounds: Bounds<Pixels>) -> (Bounds<Pixels>, bool) {
    if matches!(scope, Scope::Workspace) {
        let (origin, diameter) = workspace_landing(bounds);
        (Bounds::new(origin, size(px(diameter), px(diameter))), true)
    } else {
        (bounds, false)
    }
}

fn status_on_avatar(scope: &Scope, diameter: f32) -> bool {
    diameter > 38. || !matches!(scope, Scope::Voyage { .. } | Scope::Fleet { .. })
}

pub(super) struct AvatarView {
    avatar: Entity<Avatar>,
    surface: Surface,
    targets: Rc<RefCell<Geometry>>,
    focus: FocusHandle,
    _observe: Subscription,
    _blur: Subscription,
    _visibility: Option<Subscription>,
    visibility_epoch: u64,
    _minimize_watch: Option<Task<()>>,
    diagnostic_last: Option<(Scope, bool, bool)>,
    diagnostic_count: u8,
    diagnostics_enabled: bool,
    painted: Rc<Cell<bool>>,
    command_down: [bool; 2],
    wake: Option<Task<()>>,
    wake_at: Option<(u64, Instant)>,
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
        let focus = cx.focus_handle();
        let blur = cx.on_blur(&focus, window, |view, _, _| view.command_down = [false; 2]);
        let mut view = Self {
            avatar,
            surface,
            targets,
            focus,
            _observe: observe,
            _blur: blur,
            _visibility: visibility,
            visibility_epoch: 0,
            _minimize_watch: None,
            diagnostic_last: None,
            diagnostic_count: 0,
            diagnostics_enabled: std::env::var_os("VOYAGER_AVATAR_DIAGNOSTICS").is_some(),
            painted: Rc::new(Cell::new(false)),
            command_down: [false; 2],
            wake: None,
            wake_at: None,
        };
        if surface == Surface::Workspace {
            view.watch_minimize(window, cx);
        }
        view
    }

    fn refresh(
        &mut self,
        refresh: motion::Refresh,
        generation: u64,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match refresh {
            motion::Refresh::Frame => {
                self.wake = None;
                self.wake_at = None;
                window.request_animation_frame();
            }
            motion::Refresh::At(deadline) => {
                if self.wake_at == Some((generation, deadline)) {
                    return;
                }
                self.wake_at = Some((generation, deadline));
                self.wake = Some(cx.spawn(async move |view, cx| {
                    cx.background_executor()
                        .timer(deadline.saturating_duration_since(Instant::now()))
                        .await;
                    let _ = view.update(cx, |view, cx| {
                        if view.avatar.read(cx).motion.generation == generation {
                            view.wake_at = None;
                            cx.notify();
                        }
                    });
                }));
            }
            motion::Refresh::Still => {
                self.wake = None;
                self.wake_at = None;
            }
        }
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
                                return Some(true);
                            }
                            if view.visibility_epoch != visibility_epoch {
                                return Some(true);
                            }
                            match result {
                                Ok(Some(true)) => {
                                    view.avatar.update(cx, |avatar, cx| {
                                        if avatar.floating.is_none() && avatar.opening.is_none() {
                                            if std::env::var_os("VOYAGER_AVATAR_DIAGNOSTICS")
                                                .is_some()
                                            {
                                                eprintln!("Avatar float trigger: native-minimize");
                                            }
                                            avatar.float(window, cx);
                                        }
                                    });
                                }
                                Ok(Some(false)) => {
                                    view.avatar
                                        .update(cx, |avatar, cx| avatar.restored(window, cx));
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
        let (b, fallback) = geometry
            .dock_target(&avatar.scope)
            .map(|bounds| (bounds, false))
            .or_else(|| {
                geometry
                    .targets
                    .iter()
                    .find(|target| target.fallback)
                    .map(|target| (target.bounds, true))
            })?;
        if b.size.width <= px(0.) || b.size.height <= px(0.) {
            return None;
        }
        if fallback {
            return Some((b.origin + point(px(5.), px(2.)), 38.));
        }
        match avatar.scope {
            Scope::Workspace => Some(workspace_landing(b)),
            Scope::Voyage { .. } | Scope::Fleet { .. } => Some((small_landing(b), 38.)),
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
        let refresh = self.avatar.update(cx, |avatar, _| avatar.motion.tick());
        let generation = self.avatar.read(cx).motion.generation;
        let position = self.position(self.avatar.read(cx));
        self.refresh(
            if position.is_some() && window.is_visible() {
                refresh
            } else {
                motion::Refresh::Still
            },
            generation,
            window,
            cx,
        );
        let avatar = self.avatar.read(cx);
        crate::inspect::stage(&avatar.scope, window, cx);
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
        let dragging = avatar.drag.as_ref().is_some_and(|drag| drag.moved);
        let quiet = !dragging
            && self.surface == Surface::Workspace
            && s > 38.
            && matches!(avatar.scope, Scope::Vessel { .. } | Scope::Portal { .. });
        let home =
            !dragging && self.surface == Surface::Workspace && avatar.scope == Scope::Workspace;

        let painted = self.painted.clone();
        let geometry = Rc::clone(&self.targets);
        let workspace = self.surface == Surface::Workspace && !dragging;
        let diagnostics = self.diagnostics_enabled;
        let image = div()
            .id("voyager-avatar")
            .absolute()
            .left(position.x)
            .top(position.y)
            .size(px(s))
            .child(crate::inspect::avatar())
            .track_focus(&self.focus)
            .tab_stop(true)
            .role(gpui::Role::Button)
            .aria_label("Voyager avatar")
            .aria_description(format!("{} Drag to move or dock. Hover, Shift-click or S plays the hover animation. F5 reloads animation pack {}.", if self.surface == Surface::Floating { "Enter or Space to show the workspace." } else { "Enter or Space to minimize the workspace." }, avatar.motion.pack.id))
            .on_a11y_action(gpui::AccessibleAction::Click, {
                let avatar = self.avatar.downgrade();
                move |_, window, cx| {
                    let _ = avatar.update(cx, |avatar, cx| avatar.activate(window, cx));
                }
            })
            .on_hover(cx.listener(|this, hovered, _, cx| {
                if *hovered && this.avatar.read(cx).drag.is_none() {
                    this.avatar.update(cx, |avatar, cx| avatar.animate(Trigger::Hover, cx));
                }
            }))
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
                            if event.modifiers.shift {
                                this.avatar.update(cx, |avatar, cx| {
                                    avatar.animate(Trigger::Hover, cx);
                                });
                                cx.stop_propagation();
                                return;
                            }
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
                    .child(paint::layers(Arc::clone(&avatar.motion.pack), avatar.motion.frame, s))
                    .when(status_on_avatar(&avatar.scope, s), |element| {
                        element.child(
                            div()
                                .absolute()
                                .right(px(s * 0.06))
                                .bottom(px(s * 0.17))
                                .size(px(5.))
                                .rounded_full()
                                .bg(rgb(0x94bda0)),
                        )
                    })
                    .child(
                        canvas(
                            |_, _, _| (),
                            move |bounds, _, window, _| {
                                if workspace && window.is_visible() {
                                    let mut geometry = geometry.borrow_mut();
                                    geometry.avatar = Some(Bounds::new(
                                        window.bounds().origin + bounds.origin,
                                        bounds.size,
                                    ));
                                    geometry.window_bounds = Some(window.window_bounds());
                                }
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
                    } else if matches!(event.keystroke.key.as_str(), "s" | "f5")
                        && event.keystroke.modifiers == gpui::Modifiers::default()
                        && this.focus.is_focused(window)
                        && !event.is_held
                    {
                        let reload = event.keystroke.key == "f5";
                        if !std::mem::replace(&mut this.command_down[usize::from(reload)], true) {
                            this.avatar.update(cx, |avatar, cx| {
                                if reload { avatar.reload_animations(cx); }
                                else { avatar.animate(Trigger::Hover, cx); }
                            });
                        }
                        cx.stop_propagation();
                    } else if event.keystroke.key == "enter" || event.keystroke.key == "space" {
                        this.avatar
                            .update(cx, |avatar, cx| avatar.activate(window, cx));
                        cx.stop_propagation();
                    }
                }),
            )
            .on_key_up(cx.listener(|this, event: &gpui::KeyUpEvent, _, _| {
                if event.keystroke.key.eq_ignore_ascii_case("s") {
                    this.command_down[0] = false;
                } else if event.keystroke.key.eq_ignore_ascii_case("f5") {
                    this.command_down[1] = false;
                }
            }))
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
            && let Some((scope, bounds)) =
                self.targets.borrow().target_at(drag.position + drag.offset)
        {
            let (bounds, circular) = landing_preview(scope, bounds);
            layer = layer.child(
                div()
                    .absolute()
                    .left(bounds.origin.x)
                    .top(bounds.origin.y)
                    .w(bounds.size.width)
                    .h(bounds.size.height)
                    .when(circular, |element| element.rounded_full())
                    .border_1()
                    .border_color(rgb(0xb3d2e5)),
            );
        }
        layer = layer.child(image);
        if s > 38.
            && !avatar.primary_speech.get()
            && let Some(speech) = crate::speech::view(cx)
        {
            layer = layer.child(
                div()
                    .absolute()
                    .left(position.x + px(s * 0.06 + 2.5 - 10.))
                    .top(position.y + px(s * 0.83 - 2.5 - 10.))
                    .child(speech),
            );
        }
        layer.into_any_element()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compact_container_docks_move_the_dot_without_changing_full_size_or_fallback() {
        for scope in [
            Scope::Voyage {
                id: voyager_contract::VoyageId("v".into()),
            },
            Scope::Fleet {
                id: voyager_contract::FleetId("f".into()),
            },
        ] {
            assert!(!status_on_avatar(&scope, 38.));
            assert!(status_on_avatar(&scope, 94.));
        }
        assert!(status_on_avatar(&Scope::Workspace, 38.));
        assert!(status_on_avatar(
            &Scope::Vessel {
                id: voyager_contract::PlacementId("p".into())
            },
            38.
        ));
    }

    #[test]
    fn workspace_preview_matches_avatar_landing_and_other_targets_keep_bounds() {
        let brand = Bounds::new(point(px(20.), px(30.)), size(px(200.), px(202.)));
        let (landing, diameter) = workspace_landing(brand);
        let (preview, circular) = landing_preview(&Scope::Workspace, brand);
        assert!(circular);
        assert_eq!(preview.origin, landing);
        assert_eq!(preview.origin, point(px(73.), px(77.)));
        assert_eq!(preview.size, size(px(diameter), px(diameter)));
        assert_eq!(preview.size, size(px(94.), px(94.)));
        assert_ne!(preview, brand);
        let (other, circular) = landing_preview(
            &Scope::Voyage {
                id: voyager_contract::VoyageId("voyage".into()),
            },
            brand,
        );
        assert!(!circular);
        assert_eq!(other, brand);
        assert_eq!(small_landing(brand), brand.origin + point(px(12.), px(2.)));
        let compact = Bounds::new(brand.origin, size(px(40.), px(50.)));
        assert_eq!(small_landing(compact), brand.origin + point(px(1.), px(2.)));
    }
}
