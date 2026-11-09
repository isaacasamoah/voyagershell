use std::{rc::Rc, sync::Arc};

use anyhow::{Context as _, ensure};
use gpui::{
    AnyElement, AppContext as _, Axis, Bounds, DispatchPhase, Entity, InteractiveElement as _,
    IntoElement as _, MouseButton, Orientation, ParentElement as _, Pixels, Role,
    StatefulInteractiveElement as _, Styled as _, canvas, div, px, transparent_black,
};
use gpui_base::{ResizablePanelGroup, ResizableState, resizable_panel};
use gpui_shell::{
    ArgumentDescriptor, ArgumentSchema, ComponentArgument, ComponentCallback,
    ComponentCallbackArgument, ComponentDescriptor, ComponentMaterializer, ComponentPayload,
    ComponentRegistry, ConstructorDescriptor, MaterializeRequest, RegistryError,
};
use voyager_contract::SplitShare;

#[derive(Clone, Copy, Debug, PartialEq)]
enum Allocation {
    Ratio(SplitShare),
    TrailingPixels(u16),
}

impl Allocation {
    fn resize_target(self, extent: Pixels) -> (usize, Pixels) {
        match self {
            Self::Ratio(share) => (
                0,
                extent * (f32::from(u16::from(share)) / f32::from(SplitShare::TOTAL)),
            ),
            Self::TrailingPixels(width) => (1, px(f32::from(width))),
        }
    }

    fn completed(self, sizes: &[Pixels]) -> Option<u16> {
        let [first, second] = sizes else {
            return None;
        };
        if !f32::from(*first).is_finite()
            || !f32::from(*second).is_finite()
            || *first <= px(0.)
            || *second <= px(0.)
        {
            return None;
        }
        match self {
            Self::Ratio(_) => Some(
                (f32::from(SplitShare::TOTAL) * f32::from(*first) / f32::from(*first + *second))
                    .round()
                    .clamp(1., f32::from(SplitShare::TOTAL - 1)) as u16,
            ),
            Self::TrailingPixels(_) => {
                let width = f32::from(*second).round();
                (1. ..=4096.).contains(&width).then_some(width as u16)
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
struct Config {
    id: String,
    axis: Axis,
    allocation: Allocation,
    revision: String,
    reset: u64,
}

struct Payload {
    config: Config,
    callback: ComponentArgument,
}

#[derive(Default)]
struct Gesture {
    origin: Option<Config>,
    pressed: bool,
}

impl Gesture {
    fn begin(&mut self, config: Config) {
        self.origin = Some(config);
        self.pressed = true;
    }

    fn finish(&mut self, current: &Config) -> Option<Config> {
        self.pressed = false;
        self.origin.take().filter(|origin| origin == current)
    }
}

struct State {
    native: Entity<ResizableState>,
    config: Config,
    callback: ComponentCallback,
    gesture: Gesture,
    awaiting: Option<Config>,
    applied: Option<(Config, Pixels)>,
}

struct Split;

impl ComponentMaterializer for Split {
    fn materialize(&self, mut request: MaterializeRequest<'_>) -> anyhow::Result<AnyElement> {
        ensure!(request.children_len() == 2, "Split requires two children");
        let payload = request
            .payload()
            .downcast_ref::<Payload>()
            .context("Split requires configuration")?;
        let config = payload.config.clone();
        let callback = request.resolve_callback(&payload.callback)?;
        let host = request.with_window_app(|window, cx| {
            let host: Entity<State> =
                window.use_keyed_state(format!("voyager-split:{}", config.id), cx, |_, cx| State {
                    native: cx.new(|_| ResizableState::default()),
                    config: config.clone(),
                    callback: callback.clone(),
                    gesture: Gesture::default(),
                    awaiting: None,
                    applied: None,
                });
            host.update(cx, |state, _| {
                state.config = config.clone();
                state.callback = callback;
            });
            Ok(host)
        })?;
        let native = request.with_window_app(|_, cx| Ok(host.read(cx).native.clone()))?;
        let complete = host.clone();
        let mut group = ResizablePanelGroup::new(format!("split-panels:{}", config.id))
            .axis(config.axis)
            .with_state(&native)
            .with_handle_appearance(Rc::new(|handle, _, cx| {
                let theme = gpui_base::Theme::global(cx);
                let color = if handle.is_active() {
                    theme
                        .resizable
                        .active_handle
                        .unwrap_or(theme.tokens.colors.ring)
                } else {
                    transparent_black()
                };
                let (label, orientation) = match handle.axis() {
                    Axis::Horizontal => ("Resize side by side panes", Orientation::Vertical),
                    Axis::Vertical => ("Resize stacked panes", Orientation::Horizontal),
                };
                Some(
                    div()
                        .id("split-divider")
                        .role(Role::Splitter)
                        .aria_label(label)
                        .aria_orientation(orientation)
                        .size_full()
                        .bg(color)
                        .into_any_element(),
                )
            }))
            .on_resize(move |native, window, cx| {
                let value = complete
                    .read(cx)
                    .config
                    .allocation
                    .completed(native.read(cx).sizes());
                let original = complete.update(cx, |state, cx| {
                    let config = state.config.clone();
                    let original = state.gesture.finish(&config);
                    let callback = state.callback.clone();
                    state.awaiting = original.clone().filter(|_| value.is_some());
                    state.applied = None;
                    cx.notify();
                    original
                        .zip(value)
                        .map(|(original, value)| (original, callback, value))
                });
                if let Some((original, callback, value)) = original
                    && let Err(error) = callback.invoke_with(
                        &[
                            ComponentCallbackArgument::String(original.revision),
                            ComponentCallbackArgument::Number(value.into()),
                        ],
                        window,
                        cx,
                    )
                {
                    eprintln!("Split resize callback: {error:#}");
                    complete.update(cx, |state, cx| {
                        state.awaiting = None;
                        cx.notify();
                    });
                }
            });
        for (index, child) in request.take_children()?.into_iter().enumerate() {
            let content = div().size_full();
            let content = match (config.allocation, config.axis, index) {
                (Allocation::TrailingPixels(_), _, _) => content,
                (_, Axis::Horizontal, 0) => content.pr(px(4.)),
                (_, Axis::Horizontal, _) => content.pl(px(4.)),
                (_, Axis::Vertical, 0) => content.pb(px(4.)),
                (_, Axis::Vertical, _) => content.pt(px(4.)),
            };
            let maximum =
                if index == 1 && matches!(config.allocation, Allocation::TrailingPixels(_)) {
                    px(4096.)
                } else {
                    Pixels::MAX
                };
            let mut panel = resizable_panel().size_range(px(24.)..maximum);
            if index == 1
                && let Allocation::TrailingPixels(width) = config.allocation
            {
                panel = panel.size(px(f32::from(width))).fixed();
            }
            group = group.child(panel.child(content.child(child)));
        }
        let measuring = host.clone();
        let observing = host;
        let tracker = canvas(
            move |bounds: Bounds<Pixels>, window, cx| {
                let extent = match config.axis {
                    Axis::Horizontal => bounds.size.width,
                    Axis::Vertical => bounds.size.height,
                };
                let state = measuring.read(cx);
                if extent <= px(0.)
                    || state.gesture.pressed
                    || state.awaiting.as_ref() == Some(&state.config)
                    || state
                        .applied
                        .as_ref()
                        .is_some_and(|(applied, size)| applied == &state.config && *size == extent)
                {
                    return;
                }
                let expected = state.config.clone();
                let measuring = measuring.clone();
                window.defer(cx, move |window, cx| {
                    measuring.update(cx, |state, cx| {
                        if state.config != expected || state.gesture.pressed {
                            return;
                        }
                        let (index, size) = expected.allocation.resize_target(extent);
                        state.native.update(cx, |native, cx| {
                            native.resize_panel(index, size, window, cx);
                        });
                        state.awaiting = None;
                        state.applied = Some((expected, extent));
                        cx.notify();
                    });
                });
            },
            move |bounds, _, window, _| {
                let down = observing.clone();
                window.on_mouse_event(move |event: &gpui::MouseDownEvent, phase, _, cx| {
                    if phase == DispatchPhase::Capture
                        && event.button == MouseButton::Left
                        && bounds.contains(&event.position)
                    {
                        down.update(cx, |state, _| {
                            state.gesture.begin(state.config.clone());
                        });
                    }
                });
                let up = observing.clone();
                window.on_mouse_event(move |event: &gpui::MouseUpEvent, phase, window, cx| {
                    if phase == DispatchPhase::Capture && event.button == MouseButton::Left {
                        let up = up.clone();
                        window.defer(cx, move |_, cx| {
                            up.update(cx, |state, cx| {
                                state.gesture.pressed = false;
                                cx.notify();
                            });
                        });
                    }
                });
            },
        )
        .absolute()
        .top_0()
        .left_0()
        .size_full();
        request.finish(div().relative().size_full().child(group).child(tracker))
    }
}

fn valid_identity(id: &str, revision: &str, reset: f64) -> bool {
    !id.is_empty()
        && id.len() <= 2048
        && revision.len() <= 20
        && revision.parse::<u64>().is_ok()
        && reset.is_finite()
        && reset >= 0.
        && reset.fract() == 0.
        && reset <= 9007199254740991.
}

pub fn register(registry: &mut ComponentRegistry) -> Result<(), RegistryError> {
    registry.register(
        ComponentDescriptor::new("Split", Arc::new(Split)).with_constructors(vec![
            ConstructorDescriptor::new(
                "Split",
                vec![
                    ArgumentDescriptor::new("id", ArgumentSchema::String),
                    ArgumentDescriptor::new(
                        "axis",
                        ArgumentSchema::Enum(&["horizontal", "vertical"]),
                    ),
                    ArgumentDescriptor::new("share", ArgumentSchema::Number),
                    ArgumentDescriptor::new("revision", ArgumentSchema::String),
                    ArgumentDescriptor::new("reset", ArgumentSchema::Number),
                    ArgumentDescriptor::new(
                        "callback",
                        ArgumentSchema::Callback(
                            "(revision: string, share: number, cx: Context) => void",
                        ),
                    ),
                ],
                |args| {
                    let [
                        ComponentArgument::String(id),
                        ComponentArgument::Enum(axis),
                        ComponentArgument::Number(share),
                        ComponentArgument::String(revision),
                        ComponentArgument::Number(reset),
                        callback @ ComponentArgument::Callback(_),
                    ] = args
                    else {
                        return Err(
                            "Split requires identity, axis, share, revision, reset and callback"
                                .into(),
                        );
                    };
                    if !valid_identity(id, revision, *reset)
                        || !share.is_finite()
                        || share.fract() != 0.
                    {
                        return Err("Invalid split configuration".into());
                    }
                    let share = SplitShare::try_from(*share as u16).map_err(str::to_owned)?;
                    Ok(ComponentPayload::new(Payload {
                        config: Config {
                            id: id.clone(),
                            axis: match axis.as_str() {
                                "horizontal" => Axis::Horizontal,
                                "vertical" => Axis::Vertical,
                                _ => return Err("Invalid split axis".into()),
                            },
                            allocation: Allocation::Ratio(share),
                            revision: revision.clone(),
                            reset: *reset as u64,
                        },
                        callback: callback.clone(),
                    }))
                },
            ),
        ]),
    )?;
    registry.register(
        ComponentDescriptor::new("Column", Arc::new(Split)).with_constructors(vec![
            ConstructorDescriptor::new(
                "Column",
                vec![
                    ArgumentDescriptor::new("id", ArgumentSchema::String),
                    ArgumentDescriptor::new("widthPixels", ArgumentSchema::Number),
                    ArgumentDescriptor::new("revision", ArgumentSchema::String),
                    ArgumentDescriptor::new("reset", ArgumentSchema::Number),
                    ArgumentDescriptor::new(
                        "callback",
                        ArgumentSchema::Callback(
                            "(revision: string, widthPixels: number, cx: Context) => void",
                        ),
                    ),
                ],
                |args| {
                    let [
                        ComponentArgument::String(id),
                        ComponentArgument::Number(width),
                        ComponentArgument::String(revision),
                        ComponentArgument::Number(reset),
                        callback @ ComponentArgument::Callback(_),
                    ] = args
                    else {
                        return Err(
                            "Column requires identity, width, revision, reset and callback".into(),
                        );
                    };
                    if !valid_identity(id, revision, *reset)
                        || !width.is_finite()
                        || width.fract() != 0.
                        || !(1. ..=4096.).contains(width)
                    {
                        return Err("Invalid column configuration".into());
                    }
                    Ok(ComponentPayload::new(Payload {
                        config: Config {
                            id: id.clone(),
                            axis: Axis::Horizontal,
                            allocation: Allocation::TrailingPixels(*width as u16),
                            revision: revision.clone(),
                            reset: *reset as u64,
                        },
                        callback: callback.clone(),
                    }))
                },
            ),
        ]),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registered_split_constructor_accepts_axes_and_rejects_invalid_axis() {
        let mut registry =
            ComponentRegistry::new(gpui_shell::COMPONENT_REGISTRY_API_VERSION, "voyager_native")
                .unwrap();
        register(&mut registry).unwrap();
        let runtime =
            gpui_shell::ShellRuntime::new_isolated_with_components(registry.freeze().unwrap())
                .unwrap();
        runtime.set_editor_files(false);
        let directory =
            std::env::temp_dir().join(format!("voyager-split-constructor-{}", std::process::id()));
        std::fs::create_dir(&directory).unwrap();
        let outcomes = [
            (
                "horizontal",
                "Split.new('check', 'horizontal', 5000, '1', 0, () => {});",
                true,
            ),
            (
                "vertical",
                "Split.new('check', 'vertical', 5000, '1', 0, () => {});",
                true,
            ),
            (
                "diagonal",
                "Split.new('check', 'diagonal', 5000, '1', 0, () => {});",
                false,
            ),
            (
                "column",
                "Column.new('check', 340, '1', 0, () => {});",
                true,
            ),
            (
                "column-zero",
                "Column.new('check', 0, '1', 0, () => {});",
                false,
            ),
            (
                "column-large",
                "Column.new('check', 4097, '1', 0, () => {});",
                false,
            ),
            (
                "column-fraction",
                "Column.new('check', 340.5, '1', 0, () => {});",
                false,
            ),
        ]
        .map(|(axis, expression, expected)| {
            let package = directory.join(axis);
            std::fs::create_dir(&package).unwrap();
            std::fs::write(
                package.join("main.js"),
                format!(
                    r#"import {{ View }} from "gpui-kit";
import {{ Split, Column }} from "voyager_native";
{expression}
export default class extends View {{}}
"#
                ),
            )
            .unwrap();
            (
                axis,
                expected,
                runtime.load_application(&package, "main.js").map(drop),
            )
        });
        std::fs::remove_dir_all(directory).unwrap();
        for (axis, expected, result) in outcomes {
            assert_eq!(result.is_ok(), expected, "{axis}: {result:?}");
        }
    }

    #[test]
    fn column_allocation_keeps_pixels_while_split_keeps_its_ratio() {
        let ratio = Allocation::Ratio(SplitShare::default());
        let column = Allocation::TrailingPixels(340);
        assert_eq!(ratio.resize_target(px(1000.)), (0, px(500.)));
        assert_eq!(column.resize_target(px(1000.)), (1, px(340.)));
        assert_eq!(column.resize_target(px(1200.)), (1, px(340.)));
        assert_eq!(ratio.completed(&[px(660.), px(340.)]), Some(6600));
        assert_eq!(column.completed(&[px(660.), px(340.)]), Some(340));
        assert_eq!(column.completed(&[px(24.), px(24.)]), Some(24));
        assert_eq!(column.completed(&[px(100.), px(4097.)]), None);
        assert_eq!(column.completed(&[px(0.), px(340.)]), None);
    }

    #[test]
    fn resize_cannot_substitute_a_newer_revision_or_retarget_a_gesture() {
        let original = Config {
            id: "fleet:first".into(),
            axis: Axis::Horizontal,
            allocation: Allocation::Ratio(SplitShare::default()),
            revision: "10".into(),
            reset: 0,
        };
        let mut gesture = Gesture::default();
        gesture.begin(original.clone());
        assert_eq!(gesture.finish(&original), Some(original.clone()));
        for changed in [
            Config {
                revision: "11".into(),
                ..original.clone()
            },
            Config {
                id: "other".into(),
                ..original.clone()
            },
            Config {
                reset: 1,
                ..original.clone()
            },
            Config {
                allocation: Allocation::TrailingPixels(340),
                ..original.clone()
            },
        ] {
            gesture.begin(original.clone());
            assert_eq!(gesture.finish(&changed), None);
            assert!(!gesture.pressed);
        }
        assert_eq!(gesture.finish(&original), None);
    }
}
