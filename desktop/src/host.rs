use std::{
    cell::{Cell, RefCell},
    collections::hash_map::DefaultHasher,
    fs,
    hash::Hasher,
    io::Read,
    path::{Path, PathBuf},
    rc::Rc,
    time::Duration,
};

use anyhow::{Context as _, Result, bail};
use gpui::prelude::FluentBuilder;
use gpui::{
    App, Context, Entity, IntoElement, ParentElement, Render, StyleRefinement, Styled,
    Subscription, Task, Window, div, px, rgb,
};
use gpui_base::{ColorTokens, ThemeAppearance};
use gpui_shell::{
    HostModule, HostValue, ShellRoot, ShellRuntime, Watcher,
    policy::{self, Policy},
};
use serde::Deserialize;
use voyager_app::{
    client::Client,
    core::{Error, Viewer},
};
use voyager_contract::Request;

use crate::terminal::Viewers;

thread_local! { static LOADING: Cell<bool> = const { Cell::new(false) }; }

type SharedTheme = Rc<RefCell<Result<Theme>>>;

fn install_viewer(viewers: &Viewers, content: &str, viewer: Viewer) -> Result<(), Error> {
    let mut viewers = viewers
        .lock()
        .map_err(|error| Error::Uncertain(error.to_string()))?;
    viewer.ensure_open()?;
    if let Some(old) = viewers.get(content)
        && !old.same_channel(&viewer)
    {
        old.close()?;
    }
    viewers.insert(content.into(), viewer);
    Ok(())
}

pub(crate) struct LoadGuard;

impl LoadGuard {
    pub(crate) fn enter(bound: Policy) -> Result<Self> {
        if LOADING.with(|loading| loading.replace(true)) {
            bail!("Nested package load is not allowed");
        }
        policy::set_default(bound);
        Ok(Self)
    }
}

impl Drop for LoadGuard {
    fn drop(&mut self) {
        policy::set_default(Policy::new());
        LOADING.with(|loading| loading.set(false));
    }
}

#[derive(Deserialize)]
struct Theme {
    background: String,
    foreground: String,
    muted: String,
    #[serde(default = "accent")]
    accent: String,
}

fn accent() -> String {
    "#c4b5fd".into()
}

fn theme(bytes: &[u8]) -> Result<Theme> {
    let value: Theme = serde_json::from_slice(bytes).context("Parsing theme")?;
    for (key, color) in [
        ("background", &value.background),
        ("foreground", &value.foreground),
        ("muted", &value.muted),
        ("accent", &value.accent),
    ] {
        if color.len() != 7
            || !color.starts_with('#')
            || !color[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            bail!("Theme {key} must be a six-digit color");
        }
    }
    Ok(value)
}

fn apply_theme(value: &Theme, cx: &mut App) -> Result<()> {
    let parse = |color: &str| u32::from_str_radix(&color[1..], 16);
    let background = rgb(parse(&value.background)?).into();
    let foreground = rgb(parse(&value.foreground)?).into();
    let muted = rgb(parse(&value.muted)?).into();
    let base = gpui_base::Theme::global_mut(cx);
    base.appearance = ThemeAppearance::Dark;
    base.tokens.colors = ColorTokens::dark();
    base.tokens.colors.background = background;
    base.tokens.colors.surface = background;
    base.tokens.colors.foreground = foreground;
    base.tokens.colors.surface_foreground = foreground;
    base.tokens.colors.muted_foreground = muted;
    base.tokens.colors.border = muted;
    Ok(())
}

pub fn source_snapshot(package: &Path) -> Result<Vec<(PathBuf, u64)>> {
    let mut pending = vec![(package.to_path_buf(), 0usize)];
    let mut files = Vec::new();
    while let Some((directory, depth)) = pending.pop() {
        for entry in fs::read_dir(&directory)
            .with_context(|| format!("Reading source directory {}", directory.display()))?
        {
            let entry = entry.context("Reading source entry")?;
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with('.') || name == "node_modules" || name == "target" {
                continue;
            }
            let kind = entry.file_type().context("Reading source file type")?;
            let path = entry.path();
            if kind.is_dir() {
                if depth >= 8 {
                    bail!("Source watch exceeds directory depth 8: {}", path.display());
                }
                pending.push((path, depth + 1));
            } else if kind.is_file()
                && matches!(
                    path.extension().and_then(|ext| ext.to_str()),
                    Some("js" | "mjs")
                )
            {
                if files.len() >= 4096 {
                    bail!("Source watch exceeds 4096 files");
                }
                let mut file = fs::File::open(&path)
                    .with_context(|| format!("Reading source {}", path.display()))?;
                let mut hash = DefaultHasher::new();
                let mut buffer = [0; 8192];
                loop {
                    let count = file
                        .read(&mut buffer)
                        .with_context(|| format!("Reading source {}", path.display()))?;
                    if count == 0 {
                        break;
                    }
                    hash.write(&buffer[..count]);
                }
                files.push((path, hash.finish()));
            }
        }
    }
    files.sort_unstable();
    Ok(files)
}

fn projection(value: &Theme) -> HostValue {
    HostValue::Object(vec![
        (
            "background".into(),
            HostValue::from(value.background.clone()),
        ),
        (
            "foreground".into(),
            HostValue::from(value.foreground.clone()),
        ),
        ("muted".into(), HostValue::from(value.muted.clone())),
        ("accent".into(), HostValue::from(value.accent.clone())),
    ])
}

struct WorkspaceBinding {
    client: Client,
    viewers: Viewers,
    notes: crate::notes::Host,
    avatar: crate::avatar::Binding,
}

fn load(
    runtime: &Rc<ShellRuntime>,
    package: &Path,
    current: &SharedTheme,
    workspace_binding: &WorkspaceBinding,
    conversation: &voyager_app::conversation_client::Client,
    window: &mut Window,
    cx: &mut App,
) -> Result<Entity<ShellRoot>> {
    let readable = current.clone();
    let module = HostModule::new(crate::script_types::HEADER_MODULE)
        .declarations(crate::script_types::HEADER)
        .function("projection", move |_| {
            let value = readable.borrow();
            let value = value
                .as_ref()
                .map_err(|error| gpui_shell::HostError::new(format!("{error:#}")))?;
            Ok(projection(value))
        });
    let client = &workspace_binding.client;
    let viewers = &workspace_binding.viewers;
    let identity = client.clone();
    let calls = client.clone();
    let terminal_client = client.clone();
    let terminal_viewers = viewers.clone();
    let workspace = HostModule::new(crate::script_types::WORKSPACE_MODULE)
        .declarations(crate::script_types::WORKSPACE)
        .function("request_id", move |_| {
            Ok(HostValue::from(identity.request_id()))
        })
        .async_function("call", move |arguments| {
            let raw = arguments.string(0)?;
            if raw.len() > 65536 {
                return Err(gpui_shell::HostError::new(
                    "Workspace request exceeds 64 KiB",
                ));
            }
            let request = raw.to_owned();
            let client = calls.clone();
            Ok(async move {
                let request: Request = serde_json::from_str(&request)
                    .map_err(|error| gpui_shell::HostError::new(error.to_string()))?;
                let result = client.call(request).map_err(gpui_shell::HostError::new)?;
                let encoded = serde_json::to_string(&result)
                    .map_err(|error| gpui_shell::HostError::new(error.to_string()))?;
                Ok(HostValue::from(encoded))
            })
        })
        .async_function("terminal_open", move |arguments| {
            let raw = arguments.string(0)?;
            if raw.len() > 1024 {
                return Err(gpui_shell::HostError::new("Terminal request too large"));
            }
            let request: voyager_contract::TerminalRequest = serde_json::from_str(raw)
                .map_err(|error| gpui_shell::HostError::new(error.to_string()))?;
            if request.request_id.is_empty()
                || request.request_id.len() > 128
                || request.content_id.0.is_empty()
                || request.content_id.0.len() > 128
            {
                return Err(gpui_shell::HostError::new("Invalid terminal request"));
            }
            let client = terminal_client.clone();
            let viewers = terminal_viewers.clone();
            Ok(async move {
                let result = client.terminal(
                    request.content_id.clone(),
                    request.request_id.clone(),
                    request.expected_version,
                );
                let result = result
                    .and_then(|viewer| install_viewer(&viewers, &request.content_id.0, viewer));
                let (status, message) = match result {
                    Ok(()) => (voyager_contract::Status::Applied, None),
                    Err(voyager_app::core::Error::Rejected { kind, message }) => (
                        voyager_contract::Status::Rejected,
                        Some(format!("{kind}: {message}")),
                    ),
                    Err(voyager_app::core::Error::Uncertain(message)) => {
                        (voyager_contract::Status::Uncertain, Some(message))
                    }
                };
                let response = voyager_contract::TerminalResponse {
                    request_id: request.request_id,
                    content_id: request.content_id,
                    status,
                    message,
                };
                let encoded = serde_json::to_string(&response)
                    .map_err(|error| gpui_shell::HostError::new(error.to_string()))?;
                Ok(HostValue::from(encoded))
            })
        });
    let policy = Policy::new()
        .with_host_module(module)?
        .with_host_module(workspace)?;
    let note_colors = current.clone();
    let policy = policy.with_host_module(workspace_binding.notes.module(Rc::new(move || {
        let current = note_colors.borrow();
        current
            .as_ref()
            .map(projection)
            .map_err(|error| gpui_shell::HostError::new(format!("{error:#}")))
    })))?;
    let policy = policy.with_host_module(crate::conversation::module(conversation.clone()))?;
    let policy = policy.with_host_module(workspace_binding.avatar.module())?;
    let _guard = LoadGuard::enter(policy)?;
    runtime.try_load(package, window, cx)
}

pub struct Header {
    root: Option<Entity<ShellRoot>>,
    _watch: Option<Watcher>,
    _avatar: Option<gpui::Subscription>,
    _task: Task<()>,
    load_error: Option<String>,
    theme_error: Option<String>,
    watch_error: Option<String>,
    accessibility: bool,
    _observers: Vec<Subscription>,
}

pub struct Setup {
    pub package: PathBuf,
    pub theme_path: PathBuf,
    pub initial_theme: Vec<u8>,
    pub initial_source: Result<Vec<(PathBuf, u64)>, String>,
    pub client: Client,
    pub viewers: Viewers,
    pub notes: crate::notes::Host,
    pub conversation: voyager_app::conversation_client::Client,
    pub avatar: crate::avatar::Binding,
}

impl Header {
    pub fn new(
        runtime: Rc<ShellRuntime>,
        setup: Setup,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let Setup {
            package,
            theme_path,
            initial_theme,
            initial_source,
            client,
            viewers,
            notes,
            conversation,
            avatar,
        } = setup;
        let workspace_binding = WorkspaceBinding {
            client,
            viewers,
            notes,
            avatar,
        };
        let current = Rc::new(RefCell::new(theme(&initial_theme)));
        let base = gpui_base::Theme::global_mut(cx);
        base.appearance = ThemeAppearance::Dark;
        base.tokens.colors = ColorTokens::dark();
        let theme_error = match current.borrow().as_ref() {
            Ok(value) => apply_theme(value, cx)
                .err()
                .map(|error| format!("{error:#}")),
            Err(error) => Some(format!("{error:#}")),
        };
        let (root, load_error) = match load(
            &runtime,
            &package,
            &current,
            &workspace_binding,
            &conversation,
            window,
            cx,
        ) {
            Ok(root) => (Some(root), None),
            Err(error) => (None, Some(format!("Header load failed: {error:#}"))),
        };
        let avatar_observe = root
            .as_ref()
            .map(|root| workspace_binding.avatar.observe(root, cx));
        let (watch, watch_error) = match root.as_ref().map(|root| runtime.watch(root, window, cx)) {
            Some(Ok(watch)) => (Some(watch), None),
            Some(Err(error)) => (None, Some(format!("Header reload unavailable: {error:#}"))),
            None => (None, initial_source.as_ref().err().cloned()),
        };
        let mut retrying = root.is_none();
        let handle = window.window_handle();
        let invalidate_notes = workspace_binding.notes.clone();
        let task = cx.spawn(async move |this, cx| {
            let mut prior_theme = Some(initial_theme);
            let mut prior_source = initial_source;
            loop {
                cx.background_executor()
                    .timer(Duration::from_millis(250))
                    .await;
                let theme_path = theme_path.clone();
                let source_path = retrying.then(|| package.clone());
                let (theme_bytes, source_bytes) = cx
                    .background_executor()
                    .spawn(async move {
                        let theme = fs::read(theme_path).ok();
                        let source = source_path.map(|path| {
                            source_snapshot(&path).map_err(|error| format!("{error:#}"))
                        });
                        (theme, source)
                    })
                    .await;
                let changed_theme = theme_bytes != prior_theme;
                let changed_source = source_bytes
                    .as_ref()
                    .is_some_and(|bytes| *bytes != prior_source);
                if changed_theme {
                    prior_theme = theme_bytes.clone();
                }
                if let Some(bytes) = &source_bytes {
                    prior_source = bytes.clone();
                }
                let result = handle.update(cx, |_, window, cx| {
                    this.update(cx, |header, cx| {
                        let active = window.is_a11y_active();
                        let changed_accessibility = header.accessibility != active;
                        header.accessibility = active;
                        if !changed_theme && !changed_source && !changed_accessibility {
                            return header.root.is_some();
                        }
                        if changed_accessibility {
                            workspace_binding.notes.invalidate(cx);
                        }
                        let mut valid_theme_change = false;
                        if changed_theme {
                            let parsed = theme_bytes
                                .context("Reading theme")
                                .and_then(|bytes| theme(&bytes));
                            match parsed.and_then(|value| {
                                apply_theme(&value, cx)?;
                                Ok(value)
                            }) {
                                Ok(value) => {
                                    *current.borrow_mut() = Ok(value);
                                    header.theme_error = None;
                                    valid_theme_change = true;
                                    if let Some(root) = &header.root
                                        && let Err(error) = runtime.refresh(root, cx)
                                    {
                                        header.theme_error = Some(format!("{error:#}"));
                                    }
                                    if let Err(error) = workspace_binding.notes.refresh(cx) {
                                        header.theme_error = Some(format!("{error:#}"));
                                    }
                                }
                                Err(error) => header.theme_error = Some(format!("{error:#}")),
                            }
                        }
                        if changed_source {
                            header.watch_error = source_bytes
                                .as_ref()
                                .and_then(|snapshot| snapshot.as_ref().err().cloned());
                        }
                        let source_ready = source_bytes.as_ref().is_some_and(Result::is_ok);
                        if (changed_source && source_ready || valid_theme_change)
                            && header.root.is_none()
                        {
                            match load(
                                &runtime,
                                &package,
                                &current,
                                &workspace_binding,
                                &conversation,
                                window,
                                cx,
                            ) {
                                Ok(root) => {
                                    header._avatar =
                                        Some(workspace_binding.avatar.observe(&root, cx));
                                    match runtime.watch(&root, window, cx) {
                                        Ok(watch) => header._watch = Some(watch),
                                        Err(error) => {
                                            header.watch_error = Some(format!(
                                                "Header reload unavailable: {error:#}"
                                            ))
                                        }
                                    }
                                    header.root = Some(root);
                                    header.load_error = None;
                                }
                                Err(error) => {
                                    header.load_error =
                                        Some(format!("Header load failed: {error:#}"))
                                }
                            }
                        }
                        cx.notify();
                        header.root.is_some()
                    })
                });
                match result {
                    Ok(Ok(loaded)) => retrying = !loaded,
                    _ => break,
                }
            }
        });
        cx.defer_in(window, move |header, window, cx| {
            if let Some(root) = window.root::<ShellRoot>().flatten() {
                let notes = invalidate_notes.clone();
                header
                    ._observers
                    .push(cx.observe_in(&root, window, move |_, _, window, cx| {
                        if window.is_a11y_active() {
                            notes.invalidate(cx);
                            cx.notify();
                        }
                    }));
                if let Some(tooltip) = ShellRoot::tooltip_overlay(window, cx) {
                    header._observers.push(cx.observe_in(
                        &tooltip,
                        window,
                        move |_, _, window, cx| {
                            if window.is_a11y_active() {
                                invalidate_notes.invalidate(cx);
                                cx.notify();
                            }
                        },
                    ));
                }
            }
        });
        Self {
            root,
            _watch: watch,
            _avatar: avatar_observe,
            _task: task,
            load_error,
            theme_error,
            watch_error,
            accessibility: window.is_a11y_active(),
            _observers: Vec::new(),
        }
    }
}

impl Render for Header {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let content = self.root.as_ref().map(|root| {
            let view = root.read(cx).content().clone();
            if window.is_a11y_active() {
                view.into_any_element()
            } else {
                view.cached(StyleRefinement::default().size_full())
                    .into_any_element()
            }
        });
        let errors = [&self.load_error, &self.theme_error, &self.watch_error]
            .into_iter()
            .flatten()
            .cloned()
            .collect::<Vec<_>>()
            .join("\n");
        let error = (!errors.is_empty()).then_some(errors);
        div()
            .size_full()
            .bg(rgb(0x111316))
            .children(content)
            .when_some(error, |view, error| {
                view.child(
                    div()
                        .absolute()
                        .bottom(px(8.))
                        .left(px(12.))
                        .bg(rgb(0x351e25))
                        .text_color(rgb(0xffcad3))
                        .p(px(8.))
                        .child(error),
                )
            })
    }
}

#[cfg(test)]
mod tests {
    use super::{LoadGuard, ShellRuntime, install_viewer, source_snapshot, theme};
    use gpui_shell::{
        Capabilities,
        policy::{self, Policy},
    };
    use std::fs;

    #[test]
    fn content_load_scope_restores_deny_after_normal_error_and_unwind() {
        let bound = || {
            Policy::new()
                .with_application("notes-a")
                .with_capabilities(Capabilities::new().network_hosts(["example.test".to_owned()]))
        };
        let guard = LoadGuard::enter(bound()).unwrap();
        assert!(policy::default().capabilities().may_reach("example.test"));
        assert!(LoadGuard::enter(Policy::new().with_application("notes-b")).is_err());
        drop(guard);
        assert!(!policy::default().capabilities().may_reach("example.test"));
        let fail = || -> anyhow::Result<()> {
            let _guard = LoadGuard::enter(bound())?;
            anyhow::bail!("load failed")
        };
        assert!(fail().is_err());
        assert!(!policy::default().capabilities().may_reach("example.test"));
        let _ = std::panic::catch_unwind(|| {
            let _guard = LoadGuard::enter(bound()).unwrap();
            panic!("load failed");
        });
        assert!(!policy::default().capabilities().may_reach("example.test"));
        assert!(LoadGuard::enter(Policy::new()).is_ok());
    }

    #[test]
    fn workspace_builtin_imports_link_in_real_quickjs() {
        let directory = std::env::temp_dir().join(format!(
            "voyager-arrangement-imports-{}",
            std::process::id()
        ));
        let source = include_str!("../mods/header/main.js")
            .lines()
            .filter(|line| {
                !line.starts_with("import ")
                    || line.ends_with("from \"gpui-kit\";")
                    || line.ends_with("from \"gpui-base\";")
            })
            .collect::<Vec<_>>()
            .join("\n");
        let source = format!(
            "{source}\nButton.new('navigation-test').justify_start().line_height(1.618034);"
        );
        fs::create_dir(&directory).unwrap();
        fs::write(directory.join("main.js"), source).unwrap();
        let runtime = ShellRuntime::new_isolated().unwrap();
        runtime.set_editor_files(false);
        let loaded = runtime.load_application(&directory, "main.js");
        fs::remove_dir_all(directory).unwrap();
        loaded.map(drop).unwrap();
    }

    #[test]
    fn source_snapshot_tracks_edits_additions_and_removals() {
        let directory =
            std::env::temp_dir().join(format!("voyager-source-snapshot-{}", std::process::id()));
        fs::create_dir(&directory).unwrap();
        fs::write(directory.join("main.js"), b"one").unwrap();
        let initial = source_snapshot(&directory).unwrap();
        fs::write(directory.join("main.js"), b"two").unwrap();
        let edited = source_snapshot(&directory).unwrap();
        fs::write(directory.join("helper.mjs"), b"helper").unwrap();
        let added = source_snapshot(&directory).unwrap();
        fs::remove_file(directory.join("helper.mjs")).unwrap();
        let removed = source_snapshot(&directory).unwrap();
        fs::remove_dir_all(directory).unwrap();
        assert_ne!(initial, edited);
        assert_ne!(edited, added);
        assert_eq!(edited, removed);
    }

    #[test]
    fn theme_accepts_colors_and_reports_json_errors() {
        assert!(
            theme(br##"{"background":"#111316","foreground":"#d4d5dc","muted":"#878994"}"##)
                .is_ok()
        );
        assert!(
            theme(br##"{"background":"#bad","foreground":"#d4d5dc","muted":"#878994"}"##).is_err()
        );
        let error = theme(b"{ broken").err().expect("invalid JSON");
        assert!(format!("{error:#}").contains("line 1"));
    }

    #[test]
    fn stale_receipt_cannot_replace_a_live_viewer() {
        use crate::terminal::Viewers;
        use std::{
            thread,
            time::{Duration, Instant},
        };
        use voyager_app::{
            client::Client,
            core::{Core, Error},
        };
        use voyager_contract::{Action, Request};

        let session = format!("voyager-stale-viewer-test-{}", std::process::id());
        let client = Client::open(session.clone(), "/tmp".into());
        let inspect = || {
            client
                .call(Request {
                    request_id: client.request_id(),
                    expected_version: 0,
                    action: Action::Inspect,
                })
                .unwrap()
        };
        let first_layout = inspect();
        let content = first_layout.layout.contents[0].id.clone();
        let request = client.request_id();
        let first = client
            .terminal(content.clone(), request.clone(), first_layout.version)
            .unwrap();
        let viewers = Viewers::default();
        install_viewer(&viewers, &content.0, first).unwrap();
        let current_layout = inspect();
        let second_request = client.request_id();
        let second = client
            .terminal(
                content.clone(),
                second_request.clone(),
                current_layout.version,
            )
            .unwrap();
        install_viewer(&viewers, &content.0, second.clone()).unwrap();
        let repeated = client
            .terminal(content.clone(), request, first_layout.version)
            .unwrap();
        let result = install_viewer(&viewers, &content.0, repeated);
        let retained = viewers
            .lock()
            .unwrap()
            .get(&content.0)
            .unwrap()
            .same_channel(&second);
        let current = client
            .terminal(content.clone(), second_request, current_layout.version)
            .unwrap();
        let same_current = install_viewer(&viewers, &content.0, current).is_ok();
        let input = second.input(b"printf 'receipt_%s\\n' 'viewer_ok'\n".to_vec());
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut output = Vec::new();
        while Instant::now() < deadline
            && !output
                .windows(b"receipt_viewer_ok".len())
                .any(|part| part == b"receipt_viewer_ok")
        {
            match second.take(65536) {
                Ok(bytes) if !bytes.is_empty() => {
                    second.credit(bytes.len() as u32).unwrap();
                    output.extend(bytes);
                }
                Ok(_) => thread::sleep(Duration::from_millis(10)),
                Err(_) => break,
            }
        }
        let mut cleanup = Core::connect(&session).unwrap();
        let stopped = cleanup.rpc("server.stop", serde_json::json!({}));
        cleanup.close().unwrap();
        assert!(stopped.is_ok());
        assert!(matches!(result, Err(Error::Rejected { kind, .. }) if kind == "viewer_expired"));
        assert!(retained && same_current && input.is_ok());
        assert!(
            output
                .windows(b"receipt_viewer_ok".len())
                .any(|part| part == b"receipt_viewer_ok")
        );
    }
}
