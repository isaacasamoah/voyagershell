use anyhow::Result;

fn main() -> Result<()> {
    let declarations = if std::env::args().nth(1).as_deref() == Some("--notes") {
        voyager_desktop::notes_declarations()?
    } else {
        voyager_desktop::declarations()?
    };
    print!("{declarations}");
    Ok(())
}
