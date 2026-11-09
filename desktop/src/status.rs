use std::sync::Arc;

use anyhow::Context as _;
use gpui::{
    InteractiveElement as _, ParentElement as _, Role, StatefulInteractiveElement as _, div,
};
use gpui_shell::{
    ArgumentDescriptor, ArgumentSchema, ComponentArgument, ComponentDescriptor,
    ComponentMaterializer, ComponentPayload, ComponentRegistry, ConstructorDescriptor,
    MaterializeRequest, RegistryError,
};

struct Status;

impl ComponentMaterializer for Status {
    fn materialize(&self, request: MaterializeRequest<'_>) -> anyhow::Result<gpui::AnyElement> {
        let (id, text) = request
            .payload()
            .downcast_ref::<(String, String)>()
            .context("Status requires identity and text")?
            .clone();
        request.finish(
            div()
                .id(id)
                .role(Role::Status)
                .aria_label(text.clone())
                .child(text),
        )
    }
}

pub fn register(registry: &mut ComponentRegistry) -> Result<(), RegistryError> {
    registry.register(
        ComponentDescriptor::new("Status", Arc::new(Status)).with_constructors(vec![
            ConstructorDescriptor::new(
                "Status",
                vec![
                    ArgumentDescriptor::new("id", ArgumentSchema::String),
                    ArgumentDescriptor::new("text", ArgumentSchema::String),
                ],
                |args| match args {
                    [
                        ComponentArgument::String(id),
                        ComponentArgument::String(text),
                    ] => Ok(ComponentPayload::new((id.clone(), text.clone()))),
                    _ => Err("Status requires identity and text".into()),
                },
            ),
        ]),
    )?;
    Ok(())
}
