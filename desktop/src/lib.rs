mod arrangement;
mod avatar;
mod avatar_motion;
mod avatar_pack;
mod avatar_sharp;
mod banner;
mod brand;
mod bridge;
#[cfg(all(test, target_os = "linux"))]
mod canvas_test;
mod content_host;
mod conversation;
mod diagnostics;
mod host;
mod inspect;
mod lifecycle;
mod manifest_view;
mod measure;
mod notice_listener;
mod occluding;
mod platform;
mod quit;
mod shipped;
mod source_snapshot;
mod speech;
mod split;
mod status;
mod terminal;
mod terminal_screen;
mod text;
mod window_frame;

use anyhow::{Context as _, Result, bail};
use gpui::{
    AnyWindowHandle, App, AppContext, AsyncApp, Bounds, KeyBinding, TitlebarOptions, WeakEntity,
    WindowBounds, WindowDecorations, WindowOptions, point, px, size,
};
use gpui_shell::{AppAssets, ShellRoot, ShellRuntime};
use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use voyager_app::client::{Client, StartUp};

gpui::actions!(voyager, [Quit, Restart]);

pub fn version() -> String {
    let (major, minor, patch) = voyager_app::core::MINIMUM_CORE;
    format!(
        "voyager-shell {}\ncore: {major}.{minor}.{patch}\nassets: embedded\n",
        env!("CARGO_PKG_VERSION")
    )
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

fn watch_releases(canvas: WeakEntity<host::CanvasHost>, cx: &mut App) {
    let Some(install) = voyager_app::release::checker() else {
        return;
    };
    let (sent, offers) = async_channel::unbounded();
    voyager_app::release::watch(install, sent);
    cx.spawn(async move |cx: &mut AsyncApp| {
        while let Ok(offer) = offers.recv().await {
            let _ = cx.update(|cx| {
                canvas.update(cx, |canvas, cx| {
                    canvas.banners.offer(offer.version, offer.notes);
                    cx.notify();
                })
            });
        }
    })
    .detach();
}

fn become_ready(
    client: Client,
    session: String,
    window: AnyWindowHandle,
    canvas: Option<WeakEntity<host::CanvasHost>>,
    cx: &mut App,
) {
    cx.spawn(async move |cx: &mut AsyncApp| {
        let (sent, received) = async_channel::bounded(1);
        std::thread::spawn(move || sent.send_blocking(client.start_up(&session)));
        let Ok(started) = received.recv().await else {
            return;
        };
        let (_listener, raises) = match started {
            StartUp::Refused(message) => {
                eprintln!("{message}");
                std::process::exit(1);
            }
            StartUp::Ready { listener, raises } => (
                listener.inspect_err(|error| eprintln!("The app socket is unavailable: {error}")),
                raises,
            ),
        };
        if let Some(canvas) = canvas {
            cx.update(|cx| watch_releases(canvas, cx));
        }
        while raises.recv().await.is_ok() {
            cx.update(|cx| {
                cx.activate(true);
                let _ = window.update(cx, |_, window, _| window.activate_window());
            });
        }
    })
    .detach();
}

pub fn run(profile: PathBuf, session: String, inspect: Option<PathBuf>) -> Result<()> {
    let opened = voyager_app::client::open_profile(&profile, &shipped::files())
        .map_err(anyhow::Error::msg)?;
    let package = profile.join("canvas");
    let theme = profile.join("themes/voyager.json");
    let _lock = opened.lock;
    let profile_updates = opened.updates;
    let kept_files = opened.kept;
    let content_owner = opened.owner;
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(package.join("canvas.json"))?)
            .context("Reading canvas manifest")?;
    if manifest.get("entry").and_then(serde_json::Value::as_str) != Some("main.js")
        || manifest.get("version").and_then(serde_json::Value::as_u64) != Some(1)
        || manifest
            .get("name")
            .and_then(serde_json::Value::as_str)
            .is_none_or(str::is_empty)
    {
        bail!("Canvas manifest requires a name, version 1 and main.js entry");
    }
    let initial_theme = fs::read(&theme).context("Reading theme")?;
    let initial_source =
        source_snapshot::source_snapshot(&package).map_err(|error| format!("{error:#}"));
    let assets = AppAssets::new(package.clone());
    let launches_path = profile.join("launches.json");
    seed(
        &launches_path,
        &serde_json::to_string_pretty(&voyager_app::agent_programs::default_settings())?,
    )?;
    let client = Client::with_content_and_profile(
        session.clone(),
        env::current_dir()?.to_string_lossy().into_owned(),
        content_owner,
        profile.clone(),
    );
    let ready_client = client.clone();
    let animations = avatar_pack::prepare(&profile.join("avatar"))?;
    let viewers = terminal::Viewers::default();
    let conversation = voyager_app::conversation_client::Client::with_audio(
        profile.clone(),
        client.clone(),
        platform::audio_environment(),
    );
    let voice = voyager_app::voice_layer::start(
        client.clone(),
        voyager_app::omni::Settings::from_environment(),
        std::sync::Arc::new(
            voyager_app::voice_voyager::Bound::new(client.clone(), profile.clone()).with_notes({
                let conversation = conversation.clone();
                std::sync::Arc::new(move |line: &str| {
                    if let Err(error) = conversation.note(line) {
                        eprintln!("The refusal was not added to the chat: {error}");
                    }
                })
            }),
        ),
        client.replies(),
        {
            let client = client.clone();
            std::sync::Arc::new(move || client.workspace_words())
        },
        std::sync::Arc::new(voyager_app::voice_parts::System),
        voyager_app::voice_parts::Trace::from_environment(),
    );
    gpui_platform::application()
        .with_assets(assets)
        .run(move |cx: &mut App| {
            #[cfg(feature = "frame-profiler")]
            diagnostics::frame::start(cx);
            let notices = notice_listener::install(cx);
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
            let content_host = content_host::Host::new(profile.join("vessels"), client.clone());
            let options = WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    point(px(180.), px(130.)),
                    size(px(1450.), px(940.)),
                ))),
                titlebar: Some(TitlebarOptions {
                    title: Some(format!("Voyager — {session}").into()),
                    ..Default::default()
                }),
                app_id: Some("voyager-shell".into()),
                window_decorations: cfg!(target_os = "linux").then_some(WindowDecorations::Client),
                ..Default::default()
            };
            let ready_session = session.clone();
            let mut ready_canvas = None;
            let opened = cx.open_window(options, |window, cx| {
                inspect::install(inspect, window, cx);
                #[cfg(feature = "frame-profiler")]
                if let Ok(id) = usize::try_from(window.window_handle().window_id().as_u64()) {
                    diagnostics::trace("workspace_window_id", id);
                }
                let quit_conversation = conversation.clone();
                let quit_workspace = client.clone();
                let (lifecycle, lifecycle_requests) = lifecycle::Requests::channel();
                window.on_window_should_close(cx, |window, cx| {
                    window.dispatch_action(Box::new(Quit), cx);
                    false
                });
                speech::initialize(voice.clone(), cx);
                let avatar = avatar::Binding::new(client.clone(), animations, window, cx);
                let avatar_view = avatar.view();
                let canvas = cx.new(|cx| {
                    host::CanvasHost::new(
                        runtime,
                        host::Setup {
                            package,
                            theme_path: theme,
                            initial_theme,
                            initial_source,
                            client,
                            viewers,
                            notices,
                            conversation,
                            content_host,
                            avatar,
                            lifecycle,
                            profile_updates,
                            kept_files,
                        },
                        window,
                        cx,
                    )
                });
                ready_canvas = Some(canvas.downgrade());
                quit::register(
                    std::rc::Rc::new(voyager_app::release::relaunch),
                    canvas.downgrade(),
                    quit_workspace,
                    quit_conversation,
                    voice,
                    lifecycle_requests,
                    cx,
                );
                cx.new(|cx| {
                    ShellRoot::new(canvas.into(), window, cx).with_native_overlay(avatar_view)
                })
            });
            match opened {
                Ok(window) => {
                    become_ready(ready_client, ready_session, window.into(), ready_canvas, cx)
                }
                Err(error) => {
                    eprintln!("Native window failed: {error}");
                    cx.quit();
                }
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
    notice_listener::register(&mut registry).context("Notice registration")?;
    registry.freeze().context("Native registry")
}

pub fn declarations() -> Result<String> {
    let mut declarations = gpui_shell::type_declarations(&native_registry(Default::default())?);
    for module in voyager_contract::operations::CANVAS_MODULES {
        declarations.push_str(&module.declared_module());
    }
    Ok(declarations)
}
