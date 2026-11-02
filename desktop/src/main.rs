mod arrangement;
mod content_budget;
mod conversation;
mod host;
mod notes;
mod notes_input;
mod script_types;
mod terminal;
mod terminal_screen;
mod text;

use anyhow::{Context as _, Result, bail};
use gpui::{
    App, AppContext, Bounds, KeyBinding, TitlebarOptions, WindowBounds, WindowOptions, point, px,
    size,
};
use gpui_shell::{AppAssets, ShellRoot, ShellRuntime};
use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use voyager_app::client::Client;

gpui::actions!(voyager, [Quit]);

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

fn seed(path: &Path, data: &str) -> Result<()> {
    fs::create_dir_all(path.parent().context("Missing parent directory")?)?;
    match OpenOptions::new().write(true).create_new(true).open(path) {
        Ok(mut file) => file.write_all(data.as_bytes())?,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
        Err(error) => return Err(error.into()),
    }
    Ok(())
}

fn run() -> Result<()> {
    let (profile, session) = arguments()?;
    let package = profile.join("mods/header");
    let theme = profile.join("themes/voyager.json");
    seed(
        &package.join("main.js"),
        include_str!("../mods/header/main.js"),
    )?;
    seed(
        &package.join("mod.json"),
        include_str!("../mods/header/mod.json"),
    )?;
    seed(
        &package.join("home.js"),
        include_str!("../mods/header/home.js"),
    )?;
    seed(
        &package.join("AGENTS.md"),
        include_str!("../mods/header/AGENTS.md"),
    )?;
    seed(&theme, include_str!("../themes/voyager.json"))?;
    seed(
        &package.join("validate.js"),
        include_str!("../../contract/generated/validate.js"),
    )?;
    seed(
        &package.join("workspace.js"),
        include_str!("../../contract/generated/workspace.js"),
    )?;
    seed(
        &package.join("chat.js"),
        include_str!("../mods/header/chat.js"),
    )?;
    seed(
        &package.join("conversation.js"),
        include_str!("../../contract/generated/conversation.js"),
    )?;
    let notes_package = profile.join("mods/notes");
    seed(
        &notes_package.join("main.js"),
        include_str!("../../content/notes/main.js"),
    )?;
    seed(
        &notes_package.join("mod.json"),
        include_str!("../../content/notes/mod.json"),
    )?;
    seed(
        &notes_package.join("validate.js"),
        include_str!("../../contract/generated/validate.js"),
    )?;
    let content_owner = voyager_app::content::Owner::open(&profile)?;
    let manifest: serde_json::Value = serde_json::from_slice(&fs::read(package.join("mod.json"))?)
        .context("Reading header manifest")?;
    if manifest.get("entry").and_then(serde_json::Value::as_str) != Some("main.js")
        || manifest.get("version").and_then(serde_json::Value::as_u64) != Some(1)
        || manifest
            .get("name")
            .and_then(serde_json::Value::as_str)
            .is_none_or(str::is_empty)
    {
        bail!("Header manifest requires a name, version 1 and main.js entry");
    }
    let initial_theme = fs::read(&theme).context("Reading theme")?;
    let initial_source = host::source_snapshot(&package).map_err(|error| format!("{error:#}"));
    let assets = AppAssets::new(package.clone());
    let client = Client::open(
        session.clone(),
        env::current_dir()?.to_string_lossy().into_owned(),
    );
    let viewers = terminal::Viewers::default();
    let conversation =
        voyager_app::conversation_client::Client::open(profile.clone(), client.clone());
    gpui_platform::application()
        .with_assets(assets)
        .run(move |cx: &mut App| {
            let mut registry = match gpui_shell::ComponentRegistry::new(
                gpui_shell::COMPONENT_REGISTRY_API_VERSION,
                "voyager_native",
            ) {
                Ok(registry) => registry,
                Err(error) => {
                    eprintln!("Native registry: {error}");
                    cx.quit();
                    return;
                }
            };
            if let Err(error) = text::register(&mut registry) {
                eprintln!("Native text registration: {error}");
                cx.quit();
                return;
            }
            if let Err(error) = terminal::register(&mut registry, viewers.clone()) {
                eprintln!("Terminal registration: {error}");
                cx.quit();
                return;
            }
            if let Err(error) = arrangement::register(&mut registry) {
                eprintln!("Arrangement registration: {error}");
                cx.quit();
                return;
            }
            let registry = match registry.freeze() {
                Ok(registry) => registry,
                Err(error) => {
                    eprintln!("Native registry: {error}");
                    cx.quit();
                    return;
                }
            };
            gpui_shell::init_with_components(cx, &registry);
            cx.on_action(|_: &Quit, cx| cx.quit());
            cx.bind_keys([KeyBinding::new("ctrl-q", Quit, None)]);
            let runtime = match ShellRuntime::new_with_components(cx, registry) {
                Ok(runtime) => runtime,
                Err(error) => {
                    eprintln!("Script runtime failed: {error:#}");
                    cx.quit();
                    return;
                }
            };
            let notes = match notes::Host::new(notes_package.clone(), content_owner, client.clone())
            {
                Ok(notes) => notes,
                Err(error) => {
                    eprintln!("Notes runtime failed: {error:#}");
                    cx.quit();
                    return;
                }
            };
            let options = WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    point(px(180.), px(130.)),
                    size(px(1450.), px(940.)),
                ))),
                titlebar: Some(TitlebarOptions {
                    title: Some(format!("Voyager — {session}").into()),
                    ..Default::default()
                }),
                app_id: Some("voyager-native-mod-host".into()),
                ..Default::default()
            };
            if let Err(error) = cx.open_window(options, |window, cx| {
                let header = cx.new(|cx| {
                    host::Header::new(
                        runtime,
                        host::Setup {
                            package,
                            theme_path: theme,
                            initial_theme,
                            initial_source,
                            client,
                            viewers,
                            conversation,
                            notes,
                        },
                        window,
                        cx,
                    )
                });
                cx.new(|cx| ShellRoot::new(header.into(), window, cx))
            }) {
                eprintln!("Native window failed: {error}");
                cx.quit();
            }
            cx.on_window_closed(|cx, _| {
                if cx.windows().is_empty() {
                    cx.quit();
                }
            })
            .detach();
            cx.activate(true);
        });
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error:#}");
        std::process::exit(1);
    }
}
