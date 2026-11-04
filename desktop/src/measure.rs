use std::sync::Arc;

use anyhow::{Context as _, ensure};
use gpui::{
    Entity, InteractiveElement as _, ParentElement as _, Pixels, Role,
    StatefulInteractiveElement as _, Styled as _, canvas, div, px,
};
use gpui_shell::{
    ArgumentDescriptor, ArgumentSchema, ComponentArgument, ComponentCallbackArgument,
    ComponentDescriptor, ComponentMaterializer, ComponentPayload, ComponentRegistry,
    ConstructorDescriptor, MaterializeRequest, RegistryError,
};

struct Measure;
struct Payload {
    id: String,
    callback: ComponentArgument,
    label: Option<String>,
}
struct Measurement {
    height: Option<Pixels>,
}

impl ComponentMaterializer for Measure {
    fn materialize(&self, mut request: MaterializeRequest<'_>) -> anyhow::Result<gpui::AnyElement> {
        ensure!(
            request.children_len() == 1,
            "MeasureHeight requires one child"
        );
        let payload = request
            .payload()
            .downcast_ref::<Payload>()
            .context("MeasureHeight requires a callback")?;
        let callback = request.resolve_callback(&payload.callback)?;
        let id = payload.id.clone();
        let label = payload.label.clone();
        let state = request.with_window_app(|window, cx| {
            let state: Entity<Measurement> =
                window.use_keyed_state(format!("measure-height:{id}"), cx, |_, _| Measurement {
                    height: None,
                });
            Ok(state)
        })?;
        let measuring = canvas(
            move |bounds, window, cx| {
                let height = bounds.size.height;
                if height <= px(0.) || state.read(cx).height == Some(height) {
                    return;
                }
                state.update(cx, |state, _| state.height = Some(height));
                let callback = callback.clone();
                window.defer(cx, move |window, cx| {
                    callback.invoke_and_report_with(
                        "measured height",
                        &[ComponentCallbackArgument::Number(f32::from(height).into())],
                        window,
                        cx,
                    );
                });
            },
            |_, _, _, _| (),
        )
        .absolute()
        .size_full();
        let children = request.take_children()?;
        let mut frame = div()
            .id(request.element_id().clone())
            .relative()
            .flex()
            .flex_col()
            .min_h(px(0.))
            .children(children)
            .child(measuring);
        if let Some(label) = label {
            frame = frame.role(Role::Pane).aria_label(label);
        }
        request.finish(frame)
    }
}

pub fn register(registry: &mut ComponentRegistry) -> Result<(), RegistryError> {
    registry.register(
        ComponentDescriptor::new("MeasureHeight", Arc::new(Measure)).with_constructors(vec![
            ConstructorDescriptor::new(
                "MeasureHeight",
                vec![
                    ArgumentDescriptor::new("id", ArgumentSchema::String),
                    ArgumentDescriptor::new(
                        "callback",
                        ArgumentSchema::Callback("(height: number, cx: Context) => void"),
                    ),
                    ArgumentDescriptor::new(
                        "label",
                        ArgumentSchema::Optional(Box::new(ArgumentSchema::String)),
                    ),
                ],
                |args| {
                    let [
                        ComponentArgument::String(id),
                        callback @ ComponentArgument::Callback(_),
                        ComponentArgument::Optional(label),
                    ] = args
                    else {
                        return Err("MeasureHeight requires an identity and callback".into());
                    };
                    if id.is_empty() || id.len() > 256 {
                        return Err("Invalid measurement identity".into());
                    }
                    Ok(ComponentPayload::new(Payload {
                        id: id.clone(),
                        callback: callback.clone(),
                        label: match label.as_deref() {
                            Some(ComponentArgument::String(label)) => Some(label.clone()),
                            None => None,
                            _ => return Err("Invalid region label".into()),
                        },
                    }))
                },
            ),
        ]),
    )?;
    Ok(())
}
