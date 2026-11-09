use anyhow::{Context as _, Result, bail};
use std::{env, path::PathBuf};

fn arguments() -> Result<(PathBuf, String)> {
    let mut profile = None;
    let mut session = None;
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--profile" => profile = args.next().map(PathBuf::from),
            "--session" => session = args.next(),
            "--help" => {
                println!("voyager-shell --profile ABS_DIR --session NAME");
                std::process::exit(0);
            }
            _ => bail!("Unknown argument: {arg}"),
        }
    }
    let profile = profile.context("--profile is required")?;
    if !profile.is_absolute() {
        bail!("--profile must be an absolute path");
    }
    let session = session.context("--session is required")?;
    if session.is_empty()
        || !session
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        bail!("--session must contain lowercase letters, digits or hyphens");
    }
    Ok((profile, session))
}

fn main() {
    if let Err(error) =
        arguments().and_then(|(profile, session)| voyager_desktop::run(profile, session))
    {
        eprintln!("{error:#}");
        std::process::exit(1);
    }
}
