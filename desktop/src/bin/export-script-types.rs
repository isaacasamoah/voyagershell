use anyhow::Result;

fn main() -> Result<()> {
    print!("{}", voyager_desktop::declarations()?);
    Ok(())
}
