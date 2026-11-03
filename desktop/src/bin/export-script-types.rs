#[path = "../arrangement.rs"]
mod arrangement;
#[path = "../notes_draft.rs"]
pub mod notes_draft;
#[path = "../notes_input.rs"]
mod notes_input;
#[path = "../notes_scope.rs"]
pub mod notes_scope;
#[path = "../notes_session.rs"]
pub mod notes_session;
#[path = "../occluding.rs"]
mod occluding;
#[path = "../script_types.rs"]
mod script_types;
#[path = "../split.rs"]
mod split;
#[path = "../terminal.rs"]
mod terminal;
#[path = "../terminal_screen.rs"]
mod terminal_screen;
#[path = "../text.rs"]
mod text;

use anyhow::Result;
use gpui_shell::{COMPONENT_REGISTRY_API_VERSION, ComponentRegistry};

fn main() -> Result<()> {
    if std::env::args().nth(1).as_deref() == Some("--notes") {
        let mut declarations = gpui_shell::type_declarations(&notes_input::registry()?);
        declarations.push_str(&format!(
            "\ndeclare module {:?} {{\n{}\n}}\n",
            script_types::CONTENT_MODULE,
            script_types::CONTENT
        ));
        print!("{declarations}");
        return Ok(());
    }
    let mut registry = ComponentRegistry::new(COMPONENT_REGISTRY_API_VERSION, "voyager_native")?;
    text::register(&mut registry)?;
    arrangement::register(&mut registry)?;
    split::register(&mut registry)?;
    occluding::register(&mut registry)?;
    terminal::register(&mut registry, Default::default())?;
    let mut declarations = gpui_shell::type_declarations(&registry.freeze()?);
    for (name, body) in [
        (script_types::HEADER_MODULE, script_types::HEADER),
        (script_types::AVATAR_MODULE, script_types::AVATAR),
        (script_types::WORKSPACE_MODULE, script_types::WORKSPACE),
        (
            script_types::CONTENT_VIEW_MODULE,
            script_types::CONTENT_VIEW,
        ),
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
