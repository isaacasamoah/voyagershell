use std::sync::Arc;

use anyhow::{Context as _, ensure};
use gpui::{
    AnyElement, AppContext as _, Entity, InteractiveElement as _, MouseButton, ParentElement as _,
    Role, Styled as _, px,
};
use gpui_base::{
    Theme,
    input::{Input, InputAccessibility, InputBase, InputEditorStyle, InputMode, InputState},
};
use gpui_shell::{
    ArgumentDescriptor, ArgumentSchema, ComponentArgument, ComponentDataValue, ComponentDescriptor,
    ComponentMaterializer, ComponentPayload, ComponentRegistry, ConstructorDescriptor,
    MaterializeRequest, RegistryError, StateDescriptor, StateMethodDescriptor,
    input_token_state_methods,
};

struct Text {
    composer: bool,
}

impl ComponentMaterializer for Text {
    fn materialize(&self, request: MaterializeRequest<'_>) -> anyhow::Result<AnyElement> {
        let name = if self.composer { "Composer" } else { "Name" };
        ensure!(request.children_len() == 0, "{name} accepts no children");
        let argument = request
            .payload()
            .downcast_ref::<ComponentArgument>()
            .with_context(|| format!("{name} requires retained state"))?;
        let state = request.with_state::<Entity<InputState>, _>(argument, Clone::clone)?;
        let focus = state.clone();
        let frame = InputBase::new(request.element_id().clone())
            .role(None::<Role>)
            .w_full()
            .on_mouse_down(MouseButton::Left, move |_, window, cx| {
                focus.update(cx, |state, cx| state.focus(window, cx));
            });
        let frame = if self.composer {
            frame
                .flex()
                .items_center()
                .h(px(32.))
                .min_h(px(32.))
                .px(px(10.))
                .text_size(px(12.))
                .line_height(px(18.))
        } else {
            frame
        };
        let frame = frame.child(Input::new(&state));
        request.finish(frame)
    }
}

pub fn register(registry: &mut ComponentRegistry) -> Result<(), RegistryError> {
    register_text(registry, "Name", "NameState", false)?;
    register_text(registry, "Composer", "ComposerState", true)
}

fn register_text(
    registry: &mut ComponentRegistry,
    component: &'static str,
    state_name: &'static str,
    composer: bool,
) -> Result<(), RegistryError> {
    let mut methods = input_token_state_methods();
    methods.push(StateMethodDescriptor::new::<Entity<InputState>>(
        "focus",
        "(): void",
        move |state, args, window, cx| {
            ensure!(args.is_empty(), "focus takes no arguments");
            state.update(cx, |state, cx| {
                state.focus(window, cx);
                if !composer {
                    state.select_all(window, cx);
                }
            });
            Ok(ComponentDataValue::Null)
        },
    ));
    registry.register_state(
        StateDescriptor::new(
            state_name,
            state_name,
            vec![ArgumentDescriptor::new("value", ArgumentSchema::String)],
            move |args, window, cx| {
                let [ComponentArgument::String(value)] = args else {
                    return Err(format!("{component} requires text"));
                };
                let value = value.clone();
                Ok(Box::new(cx.new(|cx| {
                    let mut state = if composer {
                        InputState::new(window, cx)
                    } else {
                        InputState::new(window, cx).default_value(value.clone())
                    };
                    let colors = Theme::global(cx).tokens.colors;
                    state.set_editor_style(InputEditorStyle {
                        foreground: colors.foreground,
                        muted_foreground: colors.muted_foreground,
                        selection: colors.selection,
                        caret: colors.foreground,
                        ..Default::default()
                    });
                    state.set_accessibility(
                        InputAccessibility::new(Some(Role::TextInput)).with_label(Some(
                            if composer {
                                value.into()
                            } else {
                                "Name".into()
                            },
                        )),
                    );
                    state
                })))
            },
        )
        .with_methods(methods)
        .with_input_events::<InputMode>(),
    )?;
    registry.register(
        ComponentDescriptor::new(component, Arc::new(Text { composer })).with_constructors(vec![
            ConstructorDescriptor::new(
                component,
                vec![ArgumentDescriptor::new(
                    "state",
                    ArgumentSchema::Entity(state_name),
                )],
                move |args| match args {
                    [argument @ ComponentArgument::Entity { .. }] => {
                        Ok(ComponentPayload::new(argument.clone()))
                    }
                    _ => Err(format!("{component} requires {state_name}")),
                },
            ),
        ]),
    )?;
    Ok(())
}
