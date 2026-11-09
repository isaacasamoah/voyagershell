use std::sync::Arc;

use anyhow::{Context as _, ensure};
use gpui::{
    AnyElement, App, AppContext as _, Entity, InteractiveElement as _, MouseButton,
    ParentElement as _, Role, Styled as _, Window, px,
};
use gpui_base::input::{
    Input, InputAccessibility, InputBase, InputMode, InputState, Textarea, TextareaMode,
    TextareaState,
};
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
    fn materialize(&self, request: MaterializeRequest<'_>) -> anyhow::Result<AnyElement> {
        crate::notes_scope::component((|| {
            ensure!(request.children_len() == 0, "Body does not accept children");
            let argument = request
                .payload()
                .downcast_ref::<ComponentArgument>()
                .context("Body requires a retained body state")?;
            let state = request.with_state::<Entity<TextareaState>, _>(argument, Clone::clone)?;
            let focus = state.clone();
            let frame = InputBase::new(request.element_id().clone())
                .role(None::<Role>)
                .flex()
                .flex_col()
                .size_full()
                .min_w(px(0.))
                .min_h(px(0.))
                .on_mouse_down(MouseButton::Left, move |_, window, cx| {
                    focus.update(cx, |state, cx| state.focus(window, cx));
                })
                .child(Textarea::new(&state));
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
                "show_heading",
                "(): boolean",
                |handle, args, _, cx| {
                    ensure!(args.is_empty(), "show_heading takes no arguments");
                    Ok(ComponentDataValue::Boolean(
                        handle.session.read(cx).configuration.show_heading,
                    ))
                },
            )
            .with_readonly(true),
            StateMethodDescriptor::new::<crate::notes_scope::SessionHandle>(
                "filenames",
                "(): string[]",
                |handle, args, _, cx| {
                    ensure!(args.is_empty(), "filenames takes no arguments");
                    Ok(ComponentDataValue::Array(
                        handle
                            .session
                            .read(cx)
                            .filenames
                            .iter()
                            .cloned()
                            .map(ComponentDataValue::String)
                            .collect(),
                    ))
                },
            )
            .with_readonly(true),
            StateMethodDescriptor::new::<crate::notes_scope::SessionHandle>(
                "filename",
                "(): string",
                |handle, args, _, cx| {
                    ensure!(args.is_empty(), "filename takes no arguments");
                    Ok(ComponentDataValue::String(
                        handle
                            .session
                            .read(cx)
                            .configuration
                            .notes_file
                            .as_ref()
                            .map(|file| file.filename.clone())
                            .unwrap_or_default(),
                    ))
                },
            )
            .with_readonly(true),
            StateMethodDescriptor::new::<crate::notes_scope::SessionHandle>(
                "list_notes",
                "(): void",
                |handle, args, _, cx| {
                    ensure!(args.is_empty(), "list_notes takes no arguments");
                    ensure!(handle.view.is_active(), "Notes view is not active");
                    handle
                        .session
                        .update(cx, |session, cx| session.list_notes(cx));
                    Ok(ComponentDataValue::Null)
                },
            ),
            StateMethodDescriptor::new::<crate::notes_scope::SessionHandle>(
                "exit_note",
                "(): void",
                |handle, args, _, cx| {
                    ensure!(args.is_empty(), "exit_note takes no arguments");
                    ensure!(handle.view.is_active(), "Notes view is not active");
                    handle
                        .session
                        .update(cx, |session, cx| session.exit_note(cx));
                    Ok(ComponentDataValue::Null)
                },
            ),
            StateMethodDescriptor::new::<crate::notes_scope::SessionHandle>(
                "new_note",
                "(): void",
                |handle, args, window, cx| {
                    ensure!(args.is_empty(), "new_note takes no arguments");
                    ensure!(handle.view.is_active(), "Notes view is not active");
                    handle.session.update(cx, |session, cx| {
                        session.select_note(None, false, window, cx)
                    });
                    Ok(ComponentDataValue::Null)
                },
            ),
            StateMethodDescriptor::new::<crate::notes_scope::SessionHandle>(
                "migrate_note",
                "(): void",
                |handle, args, window, cx| {
                    ensure!(args.is_empty(), "migrate_note takes no arguments");
                    ensure!(handle.view.is_active(), "Notes view is not active");
                    handle.session.update(cx, |session, cx| {
                        session.select_note(None, true, window, cx)
                    });
                    Ok(ComponentDataValue::Null)
                },
            ),
            StateMethodDescriptor::new::<crate::notes_scope::SessionHandle>(
                "open_note",
                "(filename: string): void",
                |handle, args, window, cx| {
                    let [ComponentDataValue::String(filename)] = args else {
                        anyhow::bail!("open_note requires a filename");
                    };
                    ensure!(handle.view.is_active(), "Notes view is not active");
                    handle.session.update(cx, |session, cx| {
                        session.select_note(Some(filename.clone()), false, window, cx)
                    });
                    Ok(ComponentDataValue::Null)
                },
            ),
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
