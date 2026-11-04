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
        let editor = include_str!("../mods/header/layout-panel.js")
            .split_once("return Occluding.new()")
            .unwrap()
            .1
            .split_once(".child(")
            .unwrap()
            .0;
        let editor = format!("Occluding.new(){editor}.child(div().child('Workspace layout'));");
        let mut importing = false;
        let creation = include_str!("../mods/header/creation.js")
            .lines()
            .filter(|line| {
                if importing {
                    importing = !line.ends_with(';');
                    return false;
                }
                if line.starts_with("import ") {
                    importing = !line.ends_with(';');
                    return false;
                }
                true
            })
            .collect::<Vec<_>>()
            .join("\n")
            .replace("export class CreationPicker", "class CreationPicker");
        let root = std::env::temp_dir().join(format!("voyager-occluding-{}", std::process::id()));
        std::fs::create_dir(&root).unwrap();
        let outcomes = [
            (
                "creation",
                "new CreationPicker().render('pane', {kind:'panel', owner:{kind:'fleet', id:'fleet'}, insertion:{kind:'beside', id:'pane', side:'right'}}, '7', () => {}, div());",
                true,
            ),
            (
                "creation-open",
                r#"const picker = new CreationPicker();
const destination = {kind:'panel', owner:{kind:'fleet', id:'fleet'}, insertion:{kind:'beside', id:'pane', side:'right'}};
picker.current = {id:'pane', version:'7', destination};
picker.catalog = {settings:{default:'codex', entries:[{id:'codex', name:'Codex', launch:{kind:'codex', model:'gpt-6.1-sol', effort:'high', permissions:'yolo'}}]}, available:['codex'], errors:[], path:null};
picker.render('pane', destination, '7', () => {}, div());"#,
                true,
            ),
            (
                "editor",
                editor.as_str(),
                true,
            ),
            (
                "portal",
                "Occluding.new().flex().flex_col().gap(8).px(7).py(5).child(div().child('Portal'));",
                true,
            ),
            (
                "compact",
                "Occluding.new().absolute().left(52).top(48).w(256).h(380).child(div().child('Chat'));",
                true,
            ),
            ("arguments", "Occluding.new('unsupported');", false),
            ("id", "Occluding.new().id('unsupported');", false),
            ("styled-id", "Occluding.new().w(30).id('unsupported');", false),
        ]
        .map(|(name, expression, expected)| {
            let package = root.join(name);
            std::fs::create_dir(&package).unwrap();
            std::fs::write(
                package.join("main.js"),
                format!(
                    r#"import {{ View, div }} from "gpui-kit";
import {{ Occluding }} from "voyager_native";
import {{ Button, Popover }} from "gpui-base";
{creation}
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
