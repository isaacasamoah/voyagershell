use anyhow::{Context as _, Result, bail};
use std::{env, path::PathBuf};

#[derive(Debug)]
struct Arguments {
    profile: PathBuf,
    session: String,
    inspect: Option<PathBuf>,
}

fn arguments(mut args: impl Iterator<Item = String>) -> Result<Arguments> {
    let mut profile = None;
    let mut session = None;
    let mut inspect = None;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--profile" => profile = args.next().map(PathBuf::from),
            "--session" => session = args.next(),
            "--inspect" => {
                inspect = Some(PathBuf::from(
                    args.next().context("--inspect requires a path")?,
                ))
            }
            "--help" => {
                println!("voyager-shell --profile ABS_DIR --session NAME [--inspect ABS_FILE]");
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
    if let Some(file) = &inspect
        && !(file.is_absolute() && file.parent().is_some_and(|parent| parent.is_dir()))
    {
        bail!("--inspect must be an absolute path in an existing directory");
    }
    Ok(Arguments {
        profile,
        session,
        inspect,
    })
}

fn main() {
    if let Err(error) = arguments(env::args().skip(1)).and_then(|arguments| {
        voyager_desktop::run(arguments.profile, arguments.session, arguments.inspect)
    }) {
        eprintln!("{error:#}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::arguments;
    use std::path::PathBuf;

    fn parse(extra: &[&str]) -> anyhow::Result<Option<PathBuf>> {
        let required = ["--profile", "/profile", "--session", "voyager-test"];
        arguments(required.iter().chain(extra).map(|part| (*part).to_owned()))
            .map(|arguments| arguments.inspect)
    }

    #[test]
    fn inspection_is_requested_only_by_the_flag() {
        assert_eq!(parse(&[]).unwrap(), None);
        let file = std::env::temp_dir().join("voyager-inspect.json");
        assert_eq!(
            parse(&["--inspect", file.to_str().unwrap()]).unwrap(),
            Some(file)
        );
        for refused in [
            vec!["--inspect"],
            vec!["--inspect", "relative.json"],
            vec!["--inspect", "/voyager-missing-directory/inspect.json"],
        ] {
            assert!(parse(&refused).is_err(), "{refused:?}");
        }
    }
}
