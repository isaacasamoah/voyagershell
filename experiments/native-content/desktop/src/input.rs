use std::sync::Arc;

use anyhow::{Context as _, ensure};
use gpui::{
    AnyElement, AppContext as _, Axis, Context, DragMoveEvent, Empty, Entity, EntityId,
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
    ComponentDescriptor, ComponentMaterializer, ComponentPayload, ComponentRegistry,
    ConstructorDescriptor, FrozenComponentRegistry, MaterializeRequest, RegistryError,
    StateDescriptor, input_token_state_methods, textarea_token_state_methods,
};

struct Title;
struct Body;

struct BodyHeight {
    height: Pixels,
    start: Option<(Pixels, Pixels)>,
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
    }
}

impl ComponentMaterializer for Body {
    fn materialize(&self, mut request: MaterializeRequest<'_>) -> anyhow::Result<AnyElement> {
        ensure!(request.children_len() == 0, "Body does not accept children");
        let argument = request
            .payload()
            .downcast_ref::<ComponentArgument>()
            .context("Body requires a retained body state")?;
        let state = request.with_state::<Entity<TextareaState>, _>(argument, Clone::clone)?;
        let editor = state.entity_id();
        let (size, height) = request.with_window_app(|window, cx| {
            let size =
                window.use_keyed_state(("voyager-body-height", editor), cx, |_, _| BodyHeight {
                    height: px(180.),
                    start: None,
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
                Ok(Box::new(cx.new(|cx| {
                    let mut state = InputState::new(window, cx).default_value(value);
                    state.set_accessibility(
                        InputAccessibility::new(Some(Role::TextInput))
                            .with_label(Some("Note title".into())),
                    );
                    state
                })))
            },
        )
        .with_methods(input_token_state_methods())
        .with_input_events::<InputMode>(),
    )?;
    registry.register_state(
        StateDescriptor::new("BodyState", "BodyState", arguments, |args, window, cx| {
            let value = initial_value(args)?;
            Ok(Box::new(cx.new(|cx| {
                let mut state = TextareaState::new(window, cx).default_value(value);
                state.set_accessibility(
                    InputAccessibility::new(Some(Role::MultilineTextInput))
                        .with_label(Some("Note text".into())),
                );
                state
            })))
        })
        .with_methods(textarea_token_state_methods())
        .with_input_events::<TextareaMode>(),
    )?;
    registry.register(control("Title", "TitleState", Arc::new(Title)))?;
    registry.register(control("Body", "BodyState", Arc::new(Body)))?;
    registry.freeze()
}
