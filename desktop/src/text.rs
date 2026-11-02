use std::sync::Arc;

use anyhow::{Context as _, ensure};
use gpui::{
    AnyElement, AppContext as _, Entity, InteractiveElement as _, MouseButton, ParentElement as _,
    Role, Styled as _,
};
use gpui_base::input::{Input, InputAccessibility, InputBase, InputMode, InputState};
use gpui_shell::{
    ArgumentDescriptor, ArgumentSchema, ComponentArgument, ComponentDataValue, ComponentDescriptor,
    ComponentMaterializer, ComponentPayload, ComponentRegistry, ConstructorDescriptor,
    MaterializeRequest, RegistryError, StateDescriptor, StateMethodDescriptor,
    input_token_state_methods,
};

struct Name;

impl ComponentMaterializer for Name {
    fn materialize(&self, request: MaterializeRequest<'_>) -> anyhow::Result<AnyElement> {
        ensure!(request.children_len() == 0, "Name accepts no children");
        let argument = request
            .payload()
            .downcast_ref::<ComponentArgument>()
            .context("Name requires retained state")?;
        let state = request.with_state::<Entity<InputState>, _>(argument, Clone::clone)?;
        let focus = state.clone();
        let frame = InputBase::new(request.element_id().clone())
            .role(None::<Role>)
            .w_full()
            .on_mouse_down(MouseButton::Left, move |_, window, cx| {
                focus.update(cx, |state, cx| state.focus(window, cx));
            })
            .child(Input::new(&state));
        request.finish(frame)
    }
}

pub fn register(registry: &mut ComponentRegistry) -> Result<(), RegistryError> {
    let mut methods = input_token_state_methods();
    methods.push(StateMethodDescriptor::new::<Entity<InputState>>(
        "focus",
        "(): void",
        |state, args, window, cx| {
            ensure!(args.is_empty(), "focus takes no arguments");
            state.update(cx, |state, cx| state.focus(window, cx));
            Ok(ComponentDataValue::Null)
        },
    ));
    registry.register_state(
        StateDescriptor::new(
            "NameState",
            "NameState",
            vec![ArgumentDescriptor::new("value", ArgumentSchema::String)],
            |args, window, cx| {
                let [ComponentArgument::String(value)] = args else {
                    return Err("Name requires text".into());
                };
                let value = value.clone();
                Ok(Box::new(cx.new(|cx| {
                    let mut state = InputState::new(window, cx).default_value(value);
                    state.set_accessibility(
                        InputAccessibility::new(Some(Role::TextInput))
                            .with_label(Some("Name".into())),
                    );
                    state
                })))
            },
        )
        .with_methods(methods)
        .with_input_events::<InputMode>(),
    )?;
    registry.register(
        ComponentDescriptor::new("Name", Arc::new(Name)).with_constructors(vec![
            ConstructorDescriptor::new(
                "Name",
                vec![ArgumentDescriptor::new(
                    "state",
                    ArgumentSchema::Entity("NameState"),
                )],
                |args| match args {
                    [argument @ ComponentArgument::Entity { .. }] => {
                        Ok(ComponentPayload::new(argument.clone()))
                    }
                    _ => Err("Name requires NameState".into()),
                },
            ),
        ]),
    )?;
    Ok(())
}
