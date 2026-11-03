use std::sync::Arc;

use gpui::{InteractiveElement as _, div};
use gpui_shell::{
    ComponentDescriptor, ComponentMaterializer, ComponentPayload, ComponentRegistry,
    ConstructorDescriptor, MaterializeRequest, RegistryError,
};

struct Occluding;

impl ComponentMaterializer for Occluding {
    fn materialize(&self, request: MaterializeRequest<'_>) -> anyhow::Result<gpui::AnyElement> {
        let element = div().id(request.element_id().clone()).occlude();
        request.finish(element)
    }
}

pub fn register(registry: &mut ComponentRegistry) -> Result<(), RegistryError> {
    registry.register(
        ComponentDescriptor::new("Occluding", Arc::new(Occluding)).with_constructors(vec![
            ConstructorDescriptor::new("Occluding", vec![], |arguments| {
                if !arguments.is_empty() {
                    return Err("Occluding accepts no arguments".into());
                }
                Ok(ComponentPayload::new(()))
            }),
        ]),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use gpui_shell::{COMPONENT_REGISTRY_API_VERSION, ComponentRegistry, ShellRuntime};

    #[test]
    fn registered_container_accepts_styled_children_and_rejects_arguments() {
        let mut registry =
            ComponentRegistry::new(COMPONENT_REGISTRY_API_VERSION, "voyager_native").unwrap();
        super::register(&mut registry).unwrap();
        let runtime =
            ShellRuntime::new_isolated_with_components(registry.freeze().unwrap()).unwrap();
        runtime.set_editor_files(false);
        let root = std::env::temp_dir().join(format!("voyager-occluding-{}", std::process::id()));
        std::fs::create_dir(&root).unwrap();
        let outcomes = [
            (
                "children",
                "Occluding.new().w(30).h(20).child(div().child('Input'));",
                true,
            ),
            ("arguments", "Occluding.new('unsupported');", false),
        ]
        .map(|(name, expression, expected)| {
            let package = root.join(name);
            std::fs::create_dir(&package).unwrap();
            std::fs::write(
                package.join("main.js"),
                format!(
                    r#"import {{ View, div }} from "gpui-kit";
import {{ Occluding }} from "voyager_native";
{expression}
export default class extends View {{}}
"#
                ),
            )
            .unwrap();
            (
                name,
                expected,
                runtime.load_application(&package, "main.js").map(drop),
            )
        });
        std::fs::remove_dir_all(root).unwrap();
        for (name, expected, result) in outcomes {
            assert_eq!(result.is_ok(), expected, "{name}: {result:?}");
        }
    }
}
