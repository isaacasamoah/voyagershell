use std::sync::Arc;

use anyhow::{Context as _, ensure};
use gpui::{MouseButton, ParentElement as _, Styled as _, canvas, div};
use gpui_shell::{
    ArgumentDescriptor, ArgumentSchema, ComponentArgument, ComponentCallbackArgument,
    ComponentDescriptor, ComponentMaterializer, ComponentPayload, ComponentRegistry,
    ConstructorDescriptor, MaterializeRequest, RegistryError,
};

struct Capture;

impl ComponentMaterializer for Capture {
    fn materialize(&self, request: MaterializeRequest<'_>) -> anyhow::Result<gpui::AnyElement> {
        ensure!(request.children_len() == 0, "Capture accepts no children");
        let argument = request
            .payload()
            .downcast_ref::<ComponentArgument>()
            .context("Capture requires a callback")?;
        let callback = request.resolve_callback(argument)?;
        let element = canvas(
            |_, _, _| (),
            move |_, _, window, _| {
                let moving = callback.clone();
                window.on_mouse_event(move |event: &gpui::MouseMoveEvent, phase, window, cx| {
                    if phase == gpui::DispatchPhase::Capture {
                        let kind = if event.pressed_button == Some(MouseButton::Left) {
                            "move"
                        } else {
                            "cancel"
                        };
                        moving.invoke_and_report_with(
                            "arrangement move",
                            &[
                                ComponentCallbackArgument::String(kind.into()),
                                ComponentCallbackArgument::Number(
                                    f32::from(event.position.x).into(),
                                ),
                                ComponentCallbackArgument::Number(
                                    f32::from(event.position.y).into(),
                                ),
                            ],
                            window,
                            cx,
                        );
                    }
                });
                let released = callback.clone();
                window.on_mouse_event(move |event: &gpui::MouseUpEvent, phase, window, cx| {
                    if phase == gpui::DispatchPhase::Capture && event.button == MouseButton::Left {
                        released.invoke_and_report_with(
                            "arrangement release",
                            &[
                                ComponentCallbackArgument::String("up".into()),
                                ComponentCallbackArgument::Number(
                                    f32::from(event.position.x).into(),
                                ),
                                ComponentCallbackArgument::Number(
                                    f32::from(event.position.y).into(),
                                ),
                            ],
                            window,
                            cx,
                        );
                    }
                });
            },
        )
        .absolute()
        .size_full();
        request.finish(div().absolute().size_full().child(element))
    }
}

pub fn register(registry: &mut ComponentRegistry) -> Result<(), RegistryError> {
    registry.register(
        ComponentDescriptor::new("ArrangementCapture", Arc::new(Capture)).with_constructors(vec![
            ConstructorDescriptor::new(
                "ArrangementCapture",
                vec![ArgumentDescriptor::new(
                    "callback",
                    ArgumentSchema::Callback(
                        "(kind: string, x: number, y: number, cx: Context) => void",
                    ),
                )],
                |args| match args {
                    [argument @ ComponentArgument::Callback(_)] => {
                        Ok(ComponentPayload::new(argument.clone()))
                    }
                    _ => Err("ArrangementCapture requires a callback".into()),
                },
            ),
        ]),
    )?;
    Ok(())
}
