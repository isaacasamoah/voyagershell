use std::{
    cell::{Cell, RefCell},
    fs,
    path::{Path, PathBuf},
    rc::Rc,
    time::Duration,
};

use anyhow::{Context as _, Result, bail};
use gpui::prelude::FluentBuilder;
use gpui::{
    App, Context, Entity, IntoElement, ParentElement, Render, StyleRefinement, Styled,
    Subscription, Task, Window, div, rgb,
};
use gpui_base::{ColorTokens, ThemeAppearance};
use gpui_shell::{
    Capabilities, HostValue, ShellRoot, ShellRuntime, Watcher,
    policy::{self, Policy},
};
use serde::Deserialize;
use voyager_app::{
    client::{Client, WorkspaceNotice},
    core::{Error, Viewer},
};
use voyager_contract::administrator::{ProcessAction, ProcessInput, ProcessRequest};
use voyager_contract::operations;
use voyager_contract::{Context as WorkspaceContext, Request};

use crate::bridge::{Bridge, decimal};
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
    notice: Rc<Cell<WorkspaceNotice>>,
    activity: Rc<RefCell<voyager_contract::activity::Projection>>,
    lifecycle: crate::lifecycle::Requests,
    decorated: crate::window_frame::Decorated,
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
    let module = Bridge::new(&operations::THEME)
        .function("projection", move |_| {
            let value = readable.borrow();
            let value = value
                .as_ref()
                .map_err(|error| gpui_shell::HostError::new(format!("{error:#}")))?;
            Ok(projection(value))
        })
        .finish()?;
    let client = &workspace_binding.client;
    let viewers = &workspace_binding.viewers;
    let identity = client.clone();
    let calls = client.clone();
    let worktree_calls = client.clone();
    let worktree_executor = cx.background_executor().clone();
    let context_reader = client.clone();
    let observation_reader = client.clone();
    let observation_executor = cx.background_executor().clone();
    let launches_reader = client.clone();
    let process_reader = client.clone();
    let process_executor = cx.background_executor().clone();
    let activity_reader = workspace_binding.activity.clone();
    let activity_refresh = client.clone();
    let stop = workspace_binding.lifecycle.clone();
    let quit = workspace_binding.lifecycle.clone();
    let decorated = workspace_binding.decorated.clone();
    let terminal_client = client.clone();
    let revision = workspace_binding.notice.clone();
    let notice = workspace_binding.notice.clone();
    let placement_client = client.clone();
    let terminal_viewers = viewers.clone();
    let workspace = Bridge::new(&operations::WORKSPACE)
        .async_function("launches", move |_| {
            let client = launches_reader.clone();
            Ok(async move {
                let catalog = client
                    .launches()
                    .await
                    .map_err(gpui_shell::HostError::new)?;
                let value = serde_json::to_string(&catalog)
                    .map_err(|error| gpui_shell::HostError::new(error.to_string()))?;
                Ok(gpui_shell::HostValue::from(value))
            })
        })
        .async_function("processes", move |arguments| {
            let version = decimal(arguments, 0)?;
            let client = process_reader.clone();
            let executor = process_executor.clone();
            Ok(async move {
                let response = executor
                    .spawn(async move {
                        client.process(
                            WorkspaceContext::Workspace,
                            ProcessRequest {
                                request_id: client.request_id(),
                                input: ProcessInput {
                                    expected_version: version,
                                    action: ProcessAction::List,
                                },
                            },
                        )
                    })
                    .await
                    .map_err(|error| match error {
                        voyager_app::client::CallError::Rejected(message)
                        | voyager_app::client::CallError::Unconfirmed(message) => {
                            gpui_shell::HostError::new(message)
                        }
                    })?;
                let value = serde_json::to_string(&response)
                    .map_err(|error| gpui_shell::HostError::new(error.to_string()))?;
                Ok(HostValue::from(value))
            })
        })
        .function("reported_activity", move |_| {
            let raw = serde_json::to_string(&*activity_reader.borrow())
                .map_err(|error| gpui_shell::HostError::new(error.to_string()))?;
            Ok(HostValue::from(raw))
        })
        .function("agent_programs", move |_| {
            Ok(HostValue::from(
                voyager_app::agent_programs::source().to_owned(),
            ))
        })
        .function("stop_session", move |_| {
            stop.stop_session();
            Ok(HostValue::Null)
        })
        .function("quit", move |_| {
            quit.quit();
            Ok(HostValue::Null)
        })
        .function("client_decorated", move |_| {
            Ok(HostValue::from(decorated.get()))
        })
        .async_function("refresh_activity", move |_| {
            let client = activity_refresh.clone();
            Ok(async move {
                client
                    .refresh_activity()
                    .await
                    .map_err(gpui_shell::HostError::new)?;
                Ok(HostValue::Null)
            })
        })
        .function("request_id", move |_| {
            Ok(HostValue::from(identity.request_id()))
        })
        .async_function("worktree", move |arguments| {
            let request: voyager_contract::worktree::Request =
                serde_json::from_str(arguments.string(0)?)
                    .map_err(|error| gpui_shell::HostError::new(error.to_string()))?;
            let client = worktree_calls.clone();
            let executor = worktree_executor.clone();
            Ok(async move {
                let response = executor
                    .spawn(async move { client.worktree(None, request) })
                    .await
                    .map_err(|error| match error {
                        voyager_app::client::CallError::Rejected(message)
                        | voyager_app::client::CallError::Unconfirmed(message) => {
                            gpui_shell::HostError::new(message)
                        }
                    })?;
                let raw = serde_json::to_string(&*response)
                    .map_err(|error| gpui_shell::HostError::new(error.to_string()))?;
                Ok(HostValue::from(raw))
            })
        })
        .async_function("context_facts", move |_| {
            let client = context_reader.clone();
            Ok(async move {
                let facts = client
                    .context_facts()
                    .await
                    .map_err(gpui_shell::HostError::new)?;
                let facts = voyager_app::context::resolve(facts);
                let raw = serde_json::to_string(&facts)
                    .map_err(|error| gpui_shell::HostError::new(error.to_string()))?;
                if raw.len() > 65536 {
                    return Err(gpui_shell::HostError::new("Context facts exceed 64 KiB"));
                }
                Ok(HostValue::from(raw))
            })
        })
        .async_function("workspace_observation", move |arguments| {
            let version = decimal(arguments, 0)?;
            let active = match arguments.get(1) {
                Some(HostValue::Null) => None,
                _ => Some(voyager_contract::PlacementId(
                    arguments.string(1)?.to_owned(),
                )),
            };
            let client = observation_reader.clone();
            let executor = observation_executor.clone();
            Ok(async move {
                let result = client
                    .workspace_observation(WorkspaceContext::Workspace, version, active)
                    .await
                    .map_err(gpui_shell::HostError::new)?;
                let result = executor
                    .spawn(async move { voyager_app::observation::resolve(result) })
                    .await;
                let raw = serde_json::to_string(&result)
                    .map_err(|error| gpui_shell::HostError::new(error.to_string()))?;
                if raw.len() > 65536 {
                    return Err(gpui_shell::HostError::new(
                        "Workspace observation exceeds 64 KiB",
                    ));
                }
                Ok(HostValue::from(raw))
            })
        })
        .async_function("call", move |arguments| {
            let request = arguments.string(0)?.to_owned();
            crate::diagnostics::redraw::event("script_call", || serde_json::json!({}));
            let client = calls.clone();
            Ok(async move {
                let request: Request = serde_json::from_str(&request)
                    .map_err(|error| gpui_shell::HostError::new(error.to_string()))?;
                let id = request.request_id.clone();
                crate::diagnostics::redraw::event("workspace_call", || {
                    serde_json::json!({
                        "requestId": id,
                        "operation": serde_json::to_value(&request.action)
                            .ok()
                            .and_then(|action| action.get("operation").cloned()),
                    })
                });
                let reply = voyager_contract::Reply::from(client.call(request));
                let encoded = serde_json::to_string(&reply)
                    .map_err(|error| gpui_shell::HostError::new(error.to_string()))?;
                crate::diagnostics::redraw::event("workspace_reply", || {
                    let reply = serde_json::to_value(&reply).unwrap_or_default();
                    serde_json::json!({
                        "requestId": id,
                        "status": reply.get("status"),
                        "version": reply.get("version"),
                    })
                });
                Ok(HostValue::from(encoded))
            })
        })
        .async_function("terminal_open", move |arguments| {
            let request: voyager_contract::TerminalRequest =
                serde_json::from_str(arguments.string(0)?)
                    .map_err(|error| gpui_shell::HostError::new(error.to_string()))?;
            if request.request_id.is_empty()
                || request.request_id.len() > 128
                || request.vessel_id.0.is_empty()
                || request.vessel_id.0.len() > 128
            {
                return Err(gpui_shell::HostError::new("Invalid terminal request"));
            }
            let client = terminal_client.clone();
            let viewers = terminal_viewers.clone();
            Ok(async move {
                crate::diagnostics::redraw::event("terminal_open", || {
                    serde_json::json!({"vessel": request.vessel_id.0, "requestId": request.request_id})
                });
                let result = client.terminal(
                    request.vessel_id.clone(),
                    request.request_id.clone(),
                    request.expected_version,
                );
                let result = result
                    .and_then(|viewer| install_viewer(&viewers, &request.vessel_id.0, viewer));
                let reason = match &result {
                    Err(voyager_app::core::Error::Rejected { kind, .. }) if kind == "finished" => {
                        Some(voyager_contract::TerminalReason::Ended)
                    }
                    Err(voyager_app::core::Error::Rejected { kind, .. })
                        if kind == voyager_app::client::CHANGED =>
                    {
                        Some(voyager_contract::TerminalReason::Changed)
                    }
                    _ => None,
                };
                crate::diagnostics::redraw::event("terminal_opened", || {
                    serde_json::json!({
                        "vessel": request.vessel_id.0,
                        "requestId": request.request_id,
                        "result": match &result {
                            Ok(()) => "applied",
                            Err(voyager_app::core::Error::Rejected { .. }) => "rejected",
                            Err(voyager_app::core::Error::Uncertain(_)) => "uncertain",
                        },
                    })
                });
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
                    vessel_id: request.vessel_id,
                    status,
                    reason,
                    message,
                };
                let encoded = serde_json::to_string(&response)
                    .map_err(|error| gpui_shell::HostError::new(error.to_string()))?;
                Ok(HostValue::from(encoded))
            })
        });
    let workspace = workspace
        .function("revision", move |_| {
            Ok(HostValue::from(revision.get().revision.to_string()))
        })
        .function("take_placement_notice", move |_| {
            Ok(placement_client
                .take_placement_notice()
                .map_or(HostValue::Null, HostValue::from))
        })
        .function("notice", move |_| {
            let notice = notice.get();
            crate::diagnostics::redraw::event(
                "script_read_notice",
                || serde_json::json!({"revision": notice.revision}),
            );
            Ok(HostValue::Object(vec![
                (
                    "closeRevision".into(),
                    HostValue::from(notice.close_revision.to_string()),
                ),
                (
                    "navigationRevision".into(),
                    HostValue::from(notice.navigation_revision.to_string()),
                ),
                (
                    "dockRevision".into(),
                    HostValue::from(notice.dock_revision.to_string()),
                ),
                (
                    "activityRevision".into(),
                    HostValue::from(notice.activity_revision.to_string()),
                ),
                (
                    "packageRevision".into(),
                    HostValue::from(notice.package_revision.to_string()),
                ),
                (
                    "revision".into(),
                    HostValue::from(notice.revision.to_string()),
                ),
            ]))
        })
        .finish()?;
    let policy = Policy::new()
        .with_capabilities(Capabilities::new().window(true))
        .with_host_module(module)?
        .with_host_module(workspace)?;
    let note_colors = current.clone();
    let policy =
        policy.with_host_module(workspace_binding.notes.module(Rc::new(move || {
            let current = note_colors.borrow();
            current
                .as_ref()
                .map(projection)
                .map_err(|error| gpui_shell::HostError::new(format!("{error:#}")))
        }))?)?;
    let policy = policy.with_host_module(crate::conversation::module(conversation.clone())?)?;
    let _guard = LoadGuard::enter(policy.with_host_module(workspace_binding.avatar.module()?)?)?;
    runtime.try_load(package, window, cx)
}

pub struct CanvasHost {
    root: Option<Entity<ShellRoot>>,
    _watch: Option<Watcher>,
    _avatar: Option<gpui::Subscription>,
    _task: Task<()>,
    _workspace_task: Task<()>,
    _close_saves: Task<()>,
    load_error: Option<String>,
    theme_error: Option<String>,
    watch_error: Option<String>,
    quit_status: Option<String>,
    decorated: crate::window_frame::Decorated,
    profile_updates: crate::banner::Updates,
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
    pub lifecycle: crate::lifecycle::Requests,
    pub profile_updates: Vec<voyager_app::content::install::Update>,
}

impl CanvasHost {
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
            lifecycle,
            profile_updates,
        } = setup;
        let workspace_binding = WorkspaceBinding {
            client,
            viewers,
            notes,
            avatar,
            notice: Rc::new(Cell::new(WorkspaceNotice::default())),
            activity: Rc::new(RefCell::new(
                voyager_contract::activity::Projection::default(),
            )),
            lifecycle,
            decorated: crate::window_frame::Decorated::new(window),
        };
        let decorated = workspace_binding.decorated.clone();
        let close_saves = workspace_binding.notes.watch_close_saves(window, cx);
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
            Err(error) => (None, Some(format!("Canvas load failed: {error:#}"))),
        };
        let avatar_observe = root
            .as_ref()
            .map(|root| workspace_binding.avatar.observe(root, cx));
        let (watch, watch_error) = match root.as_ref().map(|root| runtime.watch(root, window, cx)) {
            Some(Ok(watch)) => (Some(watch), None),
            Some(Err(error)) => (None, Some(format!("Canvas reload unavailable: {error:#}"))),
            None => (None, initial_source.as_ref().err().cloned()),
        };
        let changed_client = workspace_binding.client.clone();
        let changed_revision = workspace_binding.notice.clone();
        let changed_activity = workspace_binding.activity.clone();
        let changed_runtime = runtime.clone();
        let workspace_task = cx.spawn(async move |this, cx| {
            let mut after = None;
            loop {
                let next = match changed_client.workspace_changes(after).await {
                    Ok(receive) => receive
                        .recv()
                        .await
                        .map_err(|_| "Workspace observer was replaced".to_owned()),
                    Err(error) => Err(error),
                };
                let failed = next.is_err();
                let activity = if next.is_ok() {
                    let reader = changed_client.clone();
                    Some(
                        cx.background_executor()
                            .spawn(async move { reader.reported_activity() })
                            .await,
                    )
                } else {
                    None
                };
                let updated = this.update(cx, |canvas, cx| {
                    match next {
                        Ok(notice) => {
                            crate::diagnostics::redraw::event("workspace_notice", || {
                                serde_json::json!({
                                    "revision": notice.revision,
                                    "navigation": notice.navigation_revision,
                                    "dock": notice.dock_revision,
                                    "close": notice.close_revision,
                                    "activity": notice.activity_revision,
                                })
                            });
                            after = Some(notice);
                            changed_revision.set(notice);
                            if let Some(activity) = activity {
                                *changed_activity.borrow_mut() = activity;
                            }
                            if let Some(root) = &canvas.root
                                && let Err(error) = changed_runtime.refresh(root, cx)
                            {
                                canvas.watch_error = Some(format!("{error:#}"));
                            }
                        }
                        Err(error) => canvas.watch_error = Some(error),
                    }
                    cx.notify();
                });
                if failed || updated.is_err() {
                    break;
                }
            }
        });
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
                            crate::source_snapshot::source_snapshot(&path)
                                .map_err(|error| format!("{error:#}"))
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
                    this.update(cx, |canvas, cx| {
                        let active = window.is_a11y_active();
                        crate::diagnostics::redraw::record("a11y_poll_active", u64::from(active));
                        let changed_accessibility = canvas.accessibility != active;
                        canvas.accessibility = active;
                        if !changed_theme && !changed_source && !changed_accessibility {
                            return canvas.root.is_some();
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
                                    canvas.theme_error = None;
                                    valid_theme_change = true;
                                    if let Some(root) = &canvas.root
                                        && let Err(error) = runtime.refresh(root, cx)
                                    {
                                        canvas.theme_error = Some(format!("{error:#}"));
                                    }
                                    if let Err(error) = workspace_binding.notes.refresh(cx) {
                                        canvas.theme_error = Some(format!("{error:#}"));
                                    }
                                }
                                Err(error) => canvas.theme_error = Some(format!("{error:#}")),
                            }
                        }
                        if changed_source {
                            canvas.watch_error = source_bytes
                                .as_ref()
                                .and_then(|snapshot| snapshot.as_ref().err().cloned());
                        }
                        let source_ready = source_bytes.as_ref().is_some_and(Result::is_ok);
                        if (changed_source && source_ready || valid_theme_change)
                            && canvas.root.is_none()
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
                                    canvas._avatar =
                                        Some(workspace_binding.avatar.observe(&root, cx));
                                    match runtime.watch(&root, window, cx) {
                                        Ok(watch) => canvas._watch = Some(watch),
                                        Err(error) => {
                                            canvas.watch_error = Some(format!(
                                                "Canvas reload unavailable: {error:#}"
                                            ))
                                        }
                                    }
                                    canvas.root = Some(root);
                                    canvas.load_error = None;
                                }
                                Err(error) => {
                                    canvas.load_error =
                                        Some(format!("Canvas load failed: {error:#}"))
                                }
                            }
                        }
                        cx.notify();
                        canvas.root.is_some()
                    })
                });
                match result {
                    Ok(Ok(loaded)) => retrying = !loaded,
                    _ => break,
                }
            }
        });
        cx.defer_in(window, move |canvas, window, cx| {
            if let Some(root) = window.root::<ShellRoot>().flatten() {
                let notes = invalidate_notes.clone();
                canvas
                    ._observers
                    .push(cx.observe_in(&root, window, move |_, _, window, cx| {
                        if window.is_a11y_active() {
                            notes.invalidate(cx);
                            cx.notify();
                        }
                    }));
                if let Some(tooltip) = ShellRoot::tooltip_overlay(window, cx) {
                    canvas._observers.push(cx.observe_in(
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
            _workspace_task: workspace_task,
            _close_saves: close_saves,
            load_error,
            theme_error,
            watch_error,
            quit_status: None,
            decorated,
            profile_updates: crate::banner::Updates::new(profile_updates),
            accessibility: window.is_a11y_active(),
            _observers: Vec::new(),
        }
    }

    pub(crate) fn quit_status(&mut self, status: String, cx: &mut Context<Self>) {
        self.quit_status = Some(status);
        cx.notify();
    }
}

impl Render for CanvasHost {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        crate::diagnostics::redraw::record("canvas_renders", 1);
        let content = self.root.as_ref().map(|root| {
            let view = root.read(cx).content().clone();
            if window.is_a11y_active() {
                view.into_any_element()
            } else {
                view.cached(StyleRefinement::default().size_full())
                    .into_any_element()
            }
        });
        self.decorated.update(window);
        let errors = [
            &self.load_error,
            &self.theme_error,
            &self.watch_error,
            &self.quit_status,
        ]
        .into_iter()
        .flatten()
        .cloned()
        .collect::<Vec<_>>()
        .join("\n");
        div()
            .size_full()
            .bg(rgb(0x111316))
            .children(content)
            .children(crate::window_frame::grips(window))
            .children(self.profile_updates.view(cx.listener(|host, _, _, cx| {
                host.profile_updates.dismiss();
                cx.notify();
            })))
            .when(!errors.is_empty(), |view| {
                view.child(crate::banner::errors(errors))
            })
    }
}

#[cfg(test)]
mod tests {
    use super::{LoadGuard, ShellRuntime, install_viewer, theme};
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
        let mut import_continues = false;
        let source = include_str!("../canvas/main.js")
            .lines()
            .filter(|line| {
                if import_continues {
                    import_continues = !line.ends_with(';');
                    return false;
                }
                if line.starts_with("import ") {
                    import_continues = !line.ends_with(';');
                }
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
        let content = first_layout.layout.vessels[0].id.clone();
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
        let result = client
            .terminal(content.clone(), request, first_layout.version)
            .and_then(|repeated| install_viewer(&viewers, &content.0, repeated));
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
        let stopped = cleanup.server_stop();
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
