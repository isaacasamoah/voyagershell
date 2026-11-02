#[path = "../arrangement.rs"]
mod arrangement;
#[path = "../script_types.rs"]
mod script_types;
#[path = "../terminal.rs"]
mod terminal;
#[path = "../terminal_screen.rs"]
mod terminal_screen;
#[path = "../text.rs"]
mod text;

use anyhow::Result;
use gpui_shell::{COMPONENT_REGISTRY_API_VERSION, ComponentRegistry};

fn main() -> Result<()> {
    let mut registry = ComponentRegistry::new(COMPONENT_REGISTRY_API_VERSION, "voyager_native")?;
    text::register(&mut registry)?;
    arrangement::register(&mut registry)?;
    terminal::register(&mut registry, Default::default())?;
    let mut declarations = gpui_shell::type_declarations(&registry.freeze()?);
    for (name, body) in [
        (script_types::HEADER_MODULE, script_types::HEADER),
        (script_types::WORKSPACE_MODULE, script_types::WORKSPACE),
        (
            script_types::CONVERSATION_MODULE,
            script_types::CONVERSATION,
        ),
    ] {
        declarations.push_str(&format!("\ndeclare module \"{name}\" {{\n{body}\n}}\n"));
    }
    print!("{declarations}");
    Ok(())
}
