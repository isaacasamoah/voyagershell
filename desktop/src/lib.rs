mod arrangement;
mod avatar;
mod avatar_motion;
mod avatar_pack;
#[cfg(all(test, target_os = "linux"))]
mod canvas_test;
mod content_budget;
mod conversation;
mod host;
mod inspect;
mod measure;
mod notes;
mod notes_draft;
mod notes_input;
mod notes_scope;
mod notes_session;
mod occluding;
mod platform;
mod quit;
mod script_types;
mod speech;
mod split;
mod status;
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

fn seed(path: &Path, data: &str) -> Result<()> {
    fs::create_dir_all(path.parent().context("Missing parent directory")?)?;
    match OpenOptions::new().write(true).create_new(true).open(path) {
        Ok(mut file) => file.write_all(data.as_bytes())?,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
        Err(error) => return Err(error.into()),
    }
    Ok(())
}

pub fn run(profile: PathBuf, session: String, inspect: Option<PathBuf>) -> Result<()> {
    let package = profile.join("mods/header");
    let theme = profile.join("themes/voyager.json");
    seed(
        &package.join("main.js"),
        include_str!("../mods/header/main.js"),
    )?;
    seed(&package.join("ui.js"), include_str!("../../content/ui.js"))?;
    seed(
        &package.join("mod.json"),
        include_str!("../mods/header/mod.json"),
    )?;
    seed(
        &package.join("canvas.js"),
        include_str!("../mods/header/canvas.js"),
    )?;
    seed(
        &package.join("creation.js"),
        include_str!("../mods/header/creation.js"),
    )?;
    seed(
        &package.join("navigation-view.js"),
        include_str!("../mods/header/navigation-view.js"),
    )?;
    seed(
        &package.join("panel-view.js"),
        include_str!("../mods/header/panel-view.js"),
    )?;
    seed(
        &package.join("panels.js"),
        include_str!("../mods/header/panels.js"),
    )?;
    seed(
        &package.join("menu.js"),
        include_str!("../mods/header/menu.js"),
    )?;
    seed(
        &package.join("activity.js"),
        include_str!("../mods/header/activity.js"),
    )?;
    seed(
        &package.join("voyage-colours.js"),
        include_str!("../mods/header/voyage-colours.js"),
    )?;
    seed(
        &package.join("agents.js"),
        include_str!("../mods/header/agents.js"),
    )?;
    seed(
        &package.join("processes.js"),
        include_str!("../mods/header/processes.js"),
    )?;
    seed(
        &package.join("process-icons.js"),
        include_str!("../mods/header/process-icons.js"),
    )?;
    seed(
        &package.join("worktrees.js"),
        include_str!("../mods/header/worktrees.js"),
    )?;
    seed(
        &package.join("AGENTS.md"),
        include_str!("../mods/header/AGENTS.md"),
    )?;
    seed(
        &package.join("voyage-close.js"),
        include_str!("../mods/header/voyage-close.js"),
    )?;
    seed(
        &package.join("stop-session.js"),
        include_str!("../mods/header/stop-session.js"),
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
        &package.join("chat.svg"),
        include_str!("../mods/header/chat.svg"),
    )?;
    for (name, source) in [
        ("home.svg", include_str!("../mods/header/home.svg")),
        ("activity.svg", include_str!("../mods/header/activity.svg")),
        ("sidebar.svg", include_str!("../mods/header/sidebar.svg")),
        (
            "sidebar-collapse.svg",
            include_str!("../mods/header/sidebar-collapse.svg"),
        ),
        ("bash.svg", include_str!("../mods/header/bash.svg")),
        ("note.svg", include_str!("../mods/header/note.svg")),
        ("codex.svg", include_str!("../mods/header/codex.svg")),
        ("claude.svg", include_str!("../mods/header/claude.svg")),
        (
            "icons-LICENSE.txt",
            include_str!("../mods/header/icons-LICENSE.txt"),
        ),
        (
            "icons-NOTICE.txt",
            include_str!("../mods/header/icons-NOTICE.txt"),
        ),
        ("helmet.svg", include_str!("../mods/header/helmet.svg")),
        ("orbit.svg", include_str!("../mods/header/orbit.svg")),
        ("voyager.svg", include_str!("../mods/header/voyager.svg")),
        (
            "split-horizontal.svg",
            include_str!("../mods/header/split-horizontal.svg"),
        ),
        (
            "split-vertical.svg",
            include_str!("../mods/header/split-vertical.svg"),
        ),
        ("close.svg", include_str!("../mods/header/close.svg")),
        ("embed.svg", include_str!("../mods/header/embed.svg")),
        ("overlay.svg", include_str!("../mods/header/overlay.svg")),
        ("maximize.svg", include_str!("../mods/header/maximize.svg")),
        ("restore.svg", include_str!("../mods/header/restore.svg")),
        ("folder.svg", include_str!("../mods/header/folder.svg")),
        ("branch.svg", include_str!("../mods/header/branch.svg")),
        (
            "speech-wave.svg",
            include_str!("../mods/header/speech-wave.svg"),
        ),
    ] {
        seed(&package.join(name), source)?;
    }
    seed(
        &package.join("conversation.js"),
        include_str!("../../contract/generated/conversation.js"),
    )?;
    let notes_package = profile.join("mods/notes");
    voyager_app::content::seed_package(
        &notes_package,
        &[
            ("main.js", include_str!("../../content/notes/main.js")),
            ("ui.js", include_str!("../../content/ui.js")),
            ("mod.json", include_str!("../../content/notes/mod.json")),
            (
                "validate.js",
                include_str!("../../contract/generated/validate.js"),
            ),
        ],
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
    let launches_path = profile.join("launches.json");
    seed(
        &launches_path,
        &serde_json::to_string_pretty(&voyager_contract::launch::LaunchSettings::default())?,
    )?;
    let client = Client::with_content_and_launches(
        session.clone(),
        env::current_dir()?.to_string_lossy().into_owned(),
        content_owner,
        launches_path,
    );
    let animations = avatar_pack::prepare(&profile.join("avatar"))?;
    let viewers = terminal::Viewers::default();
    let conversation = voyager_app::conversation_client::Client::with_audio(
        profile.clone(),
        client.clone(),
        platform::audio_environment(),
    );
    gpui_platform::application()
        .with_assets(assets)
        .run(move |cx: &mut App| {
            #[cfg(feature = "frame-profiler")]
            frame_profile::start(cx);
            let registry = match native_registry(viewers.clone()) {
                Ok(registry) => registry,
                Err(error) => {
                    eprintln!("{error:#}");
                    cx.quit();
                    return;
                }
            };
            gpui_shell::init_with_components(cx, &registry);
            cx.bind_keys([KeyBinding::new("ctrl-q", Quit, None)]);
            cx.bind_keys(terminal::key_bindings());
            let runtime = match ShellRuntime::new_with_components(cx, registry) {
                Ok(runtime) => runtime,
                Err(error) => {
                    eprintln!("Script runtime failed: {error:#}");
                    cx.quit();
                    return;
                }
            };
            let notes = notes::Host::new(notes_package.clone(), client.clone());
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
                inspect::install(inspect, window, cx);
                #[cfg(feature = "frame-profiler")]
                if let Ok(id) = usize::try_from(window.window_handle().window_id().as_u64()) {
                    typing_trace::record("workspace_window_id", id);
                }
                let quit_conversation = conversation.clone();
                let quit_workspace = client.clone();
                let (stop_session, stop_requests) = async_channel::bounded(1);
                window.on_window_should_close(cx, |_, cx| {
                    cx.dispatch_action(&Quit);
                    false
                });
                speech::initialize(conversation.clone(), cx);
                let avatar = avatar::Binding::new(client.clone(), animations, window, cx);
                let avatar_view = avatar.view();
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
                            avatar,
                            stop_session,
                        },
                        window,
                        cx,
                    )
                });
                quit::register(
                    header.downgrade(),
                    quit_workspace,
                    quit_conversation,
                    stop_requests,
                    cx,
                );
                cx.new(|cx| {
                    ShellRoot::new(header.into(), window, cx).with_native_overlay(avatar_view)
                })
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

fn native_registry(viewers: terminal::Viewers) -> Result<gpui_shell::FrozenComponentRegistry> {
    let mut registry = gpui_shell::ComponentRegistry::new(
        gpui_shell::COMPONENT_REGISTRY_API_VERSION,
        "voyager_native",
    )
    .context("Native registry")?;
    text::register(&mut registry).context("Native text registration")?;
    measure::register(&mut registry).context("Native measurement registration")?;
    status::register(&mut registry).context("Native status registration")?;
    arrangement::register(&mut registry).context("Arrangement registration")?;
    split::register(&mut registry).context("Split registration")?;
    occluding::register(&mut registry).context("Native overlay registration")?;
    inspect::register(&mut registry).context("Inspection registration")?;
    terminal::register(&mut registry, viewers).context("Terminal registration")?;
    registry.freeze().context("Native registry")
}

pub fn declarations() -> Result<String> {
    let mut declarations = gpui_shell::type_declarations(&native_registry(Default::default())?);
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
    Ok(declarations)
}

pub fn notes_declarations() -> Result<String> {
    let mut declarations = gpui_shell::type_declarations(&notes_input::registry()?);
    declarations.push_str(&format!(
        "\ndeclare module {:?} {{\n{}\n}}\n",
        script_types::CONTENT_MODULE,
        script_types::CONTENT
    ));
    Ok(declarations)
}
#[path = "../../experiments/performance/avatar-redraw/probe.rs"]
mod redraw_probe;
mod typing_trace {
    pub(crate) use voyager_app::record_terminal_trace as record;
}

#[cfg(feature = "frame-profiler")]
#[path = "../../experiments/performance/typing-latency/glyph.rs"]
mod glyph_probe;

#[cfg(feature = "frame-profiler")]
#[path = "../../experiments/performance/frame-work/probe.rs"]
mod frame_profile;
