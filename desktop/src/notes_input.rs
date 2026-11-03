use std::sync::Arc;

use anyhow::{Context as _, ensure};
use gpui::{
    AnyElement, App, AppContext as _, Axis, Context, DragMoveEvent, Empty, Entity, EntityId,
    InteractiveElement as _, MouseButton, ParentElement as _, Pixels, Refineable as _, Render,
    Role, Styled as _, Window, div, px,
};
use gpui_base::input::{
    Input, InputAccessibility, InputBase, InputMode, InputState, Textarea, TextareaMode,
    TextareaState,
};
use gpui_base::{HandleEdge, resize_handle};
use gpui_shell::{
    ArgumentDescriptor, ArgumentSchema, COMPONENT_REGISTRY_API_VERSION, ComponentArgument,
    ComponentDataValue, ComponentDescriptor, ComponentMaterializer, ComponentPayload,
    ComponentRegistry, ConstructorDescriptor, FrozenComponentRegistry, MaterializeRequest,
    RegistryError, StateDescriptor, StateMethodDescriptor, input_token_state_methods,
    textarea_token_state_methods,
};

struct Title;
struct Body;

pub(crate) fn new_title(value: String, window: &mut Window, cx: &mut App) -> Entity<InputState> {
    cx.new(|cx| {
        let mut state = InputState::new(window, cx).default_value(value);
        state.set_accessibility(
            InputAccessibility::new(Some(Role::TextInput)).with_label(Some("Note title".into())),
        );
        state
    })
}

pub(crate) fn new_body(value: String, window: &mut Window, cx: &mut App) -> Entity<TextareaState> {
    cx.new(|cx| {
        let mut state = TextareaState::new(window, cx).default_value(value);
        state.set_accessibility(
            InputAccessibility::new(Some(Role::MultilineTextInput))
                .with_label(Some("Note text".into())),
        );
        state
    })
}

pub(crate) struct BodyHeight {
    height: Pixels,
    start: Option<(Pixels, Pixels)>,
}

pub(crate) fn new_height(cx: &mut App) -> Entity<BodyHeight> {
    cx.new(|_| BodyHeight {
        height: px(180.),
        start: None,
    })
}

#[derive(Clone)]
struct ResizeBody(EntityId);

impl Render for ResizeBody {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl gpui::IntoElement {
        Empty
    }
}

impl ComponentMaterializer for Title {
    fn materialize(&self, request: MaterializeRequest<'_>) -> anyhow::Result<AnyElement> {
        crate::notes_scope::component((|| {
            ensure!(
                request.children_len() == 0,
                "Title does not accept children"
            );
            let argument = request
                .payload()
                .downcast_ref::<ComponentArgument>()
                .context("Title requires a retained title state")?;
            let state = request.with_state::<Entity<InputState>, _>(argument, Clone::clone)?;
            let focus = state.clone();
            let frame = InputBase::new(request.element_id().clone())
                .role(None::<Role>)
                .flex()
                .items_center()
                .w_full()
                .on_mouse_down(MouseButton::Left, move |_, window, cx| {
                    focus.update(cx, |state, cx| state.focus(window, cx));
                })
                .child(Input::new(&state));
            request.finish(frame)
        })())
    }
}

impl ComponentMaterializer for Body {
    fn materialize(&self, mut request: MaterializeRequest<'_>) -> anyhow::Result<AnyElement> {
        crate::notes_scope::component((|| {
            ensure!(request.children_len() == 0, "Body does not accept children");
            let argument = request
                .payload()
                .downcast_ref::<ComponentArgument>()
                .context("Body requires a retained body state")?;
            let state = request.with_state::<Entity<TextareaState>, _>(argument, Clone::clone)?;
            let editor = state.entity_id();
            let (size, height) = request.with_window_app(|window, cx| {
                let size = crate::notes_scope::body_height(editor, cx).unwrap_or_else(|| {
                    window.use_keyed_state(("voyager-body-height", editor), cx, |_, _| BodyHeight {
                        height: px(180.),
                        start: None,
                    })
                });
                let height = size.read(cx).height;
                Ok((size, height))
            })?;
            let focus = state.clone();
            let resized = size.clone();
            let handle = resize_handle("body-resize", Axis::Vertical)
                .inside(HandleEdge::Trailing)
                .on_mouse_down(MouseButton::Left, move |event, _, cx| {
                    size.update(cx, |size, _| {
                        size.start = Some((event.position.y, size.height));
                    });
                })
                .on_drag(ResizeBody(editor), |drag, _, _, cx| {
                    cx.new(|_| drag.clone())
                });
            let mut frame = InputBase::new(request.element_id().clone())
                .role(None::<Role>)
                .relative()
                .flex()
                .items_start()
                .w_full()
                .on_mouse_down(MouseButton::Left, move |_, window, cx| {
                    focus.update(cx, |state, cx| state.focus(window, cx));
                })
                .on_drag_move(move |event: &DragMoveEvent<ResizeBody>, _, cx| {
                    if event.drag(cx).0 != editor {
                        return;
                    }
                    resized.update(cx, |size, cx| {
                        if let Some((pointer_y, initial_height)) = size.start {
                            let next =
                                (initial_height + event.event.position.y - pointer_y).max(px(180.));
                            if next != size.height {
                                size.height = next;
                                cx.notify();
                            }
                        }
                    });
                })
                .child(Textarea::new(&state))
                .child(
                    div()
                        .absolute()
                        .bottom_0()
                        .right_0()
                        .w(px(16.))
                        .h(px(16.))
                        .child(handle),
                );
            frame.style().refine(&request.take_style());
            let frame = frame.h(height);
            request.finish(frame)
        })())
    }
}

fn initial_value(arguments: &[ComponentArgument]) -> Result<String, String> {
    match arguments {
        [ComponentArgument::Optional(Some(value))] => match value.as_ref() {
            ComponentArgument::String(value) => Ok(value.clone()),
            _ => Err("Initial value must be text".into()),
        },
        [ComponentArgument::Optional(None)] => Ok(String::new()),
        _ => Err("Expected an optional initial value".into()),
    }
}

fn control(
    name: &'static str,
    state: &'static str,
    materializer: Arc<dyn ComponentMaterializer>,
) -> ComponentDescriptor {
    ComponentDescriptor::new(name, materializer).with_constructors(vec![
        ConstructorDescriptor::new(
            name,
            vec![ArgumentDescriptor::new(
                "state",
                ArgumentSchema::Entity(state),
            )],
            move |arguments| match arguments {
                [argument @ ComponentArgument::Entity { .. }] => {
                    Ok(ComponentPayload::new(argument.clone()))
                }
                _ => Err(format!("{name} requires {state}")),
            },
        ),
    ])
}

pub fn registry() -> Result<FrozenComponentRegistry, RegistryError> {
    let mut registry = ComponentRegistry::new(COMPONENT_REGISTRY_API_VERSION, "voyager_input")?;
    registry.register_state(
        StateDescriptor::new("SessionState", "SessionState", vec![], |args, _, _| {
            if !args.is_empty() {
                return Err("SessionState takes no arguments".into());
            }
            Ok(Box::new(crate::notes_scope::session()?))
        })
        .with_methods(vec![
            StateMethodDescriptor::new::<crate::notes_scope::SessionHandle>(
                "status",
                "(): string",
                |handle, args, _, cx| {
                    ensure!(args.is_empty(), "status takes no arguments");
                    Ok(ComponentDataValue::String(
                        handle.session.read(cx).draft.status.clone(),
                    ))
                },
            )
            .with_readonly(true),
            StateMethodDescriptor::new::<crate::notes_scope::SessionHandle>(
                "save",
                "(): void",
                |handle, args, _, cx| {
                    ensure!(args.is_empty(), "save takes no arguments");
                    ensure!(handle.view.is_active(), "Notes view is not active");
                    handle.session.update(cx, |session, cx| {
                        session.save(
                            crate::notes_session::Intent::Script(handle.view.clone()),
                            cx,
                        )
                    });
                    Ok(ComponentDataValue::Null)
                },
            ),
        ]),
    )?;
    let arguments = vec![ArgumentDescriptor::new(
        "initial_value",
        ArgumentSchema::Optional(Box::new(ArgumentSchema::String)),
    )];
    registry.register_state(
        StateDescriptor::new(
            "TitleState",
            "TitleState",
            arguments.clone(),
            |args, window, cx| {
                let value = initial_value(args)?;
                Ok(Box::new(new_title(value, window, cx)))
            },
        )
        .with_methods(input_token_state_methods())
        .with_input_events::<InputMode>(),
    )?;
    registry.register_state(
        StateDescriptor::new("BodyState", "BodyState", arguments, |args, window, cx| {
            let value = initial_value(args)?;
            Ok(Box::new(new_body(value, window, cx)))
        })
        .with_methods(textarea_token_state_methods())
        .with_input_events::<TextareaMode>(),
    )?;
    registry.register(control("Title", "TitleState", Arc::new(Title)))?;
    registry.register(control("Body", "BodyState", Arc::new(Body)))?;
    registry.register_state(
        StateDescriptor::new(
            "RetainedTitleState",
            "RetainedTitleState",
            vec![],
            |args, _, cx| {
                if !args.is_empty() {
                    return Err("RetainedTitleState takes no arguments".into());
                }
                Ok(Box::new(crate::notes_scope::title(cx).ok_or(
                    "Create SessionState before its retained editors",
                )?))
            },
        )
        .with_methods(vec![
            StateMethodDescriptor::new::<Entity<InputState>>(
                "value",
                "(): string",
                |state, args, _, cx| {
                    ensure!(args.is_empty(), "value takes no arguments");
                    Ok(ComponentDataValue::String(
                        state.read(cx).value().to_string(),
                    ))
                },
            )
            .with_readonly(true),
        ]),
    )?;
    registry.register_state(
        StateDescriptor::new(
            "RetainedBodyState",
            "RetainedBodyState",
            vec![],
            |args, _, cx| {
                if !args.is_empty() {
                    return Err("RetainedBodyState takes no arguments".into());
                }
                Ok(Box::new(crate::notes_scope::body(cx).ok_or(
                    "Create SessionState before its retained editors",
                )?))
            },
        )
        .with_methods(vec![
            StateMethodDescriptor::new::<Entity<TextareaState>>(
                "value",
                "(): string",
                |state, args, _, cx| {
                    ensure!(args.is_empty(), "value takes no arguments");
                    Ok(ComponentDataValue::String(
                        state.read(cx).value().to_string(),
                    ))
                },
            )
            .with_readonly(true),
        ]),
    )?;
    registry.register(control(
        "RetainedTitle",
        "RetainedTitleState",
        Arc::new(Title),
    ))?;
    registry.register(control("RetainedBody", "RetainedBodyState", Arc::new(Body)))?;
    registry.freeze()
}
