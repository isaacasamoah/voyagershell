use std::{
    cell::RefCell,
    collections::HashMap,
    hash::{DefaultHasher, Hash as _, Hasher as _},
    io::Read as _,
    path::{Path, PathBuf},
    rc::Rc,
    time::Duration,
};

use anyhow::Result;
use gpui::{
    AnyElement, App, AppContext as _, Context, Entity, IntoElement as _, ParentElement as _,
    Render, Styled as _, Subscription, Task, Window, div,
};
use gpui_shell::{HostError, HostModule, HostValue, ScriptView, ShellRuntime, policy::Policy};
use voyager_app::{client::Client, content::ViewBinding};
use voyager_contract::{
    ContentId,
    content::{Request, Response, Version},
};

use crate::{content_budget::Budget, host::LoadGuard};

type Colors = Rc<dyn Fn() -> Result<HostValue, HostError>>;

fn validate_identity<'a>(
    request_id: &'a str,
    revision: &'a str,
) -> Result<(&'a str, Option<&'a str>), HostError> {
    if request_id.is_empty() || request_id.len() > 128 || revision.len() > 128 {
        return Err(HostError::new("Invalid content request identity"));
    }
    Ok((request_id, (!revision.is_empty()).then_some(revision)))
}

#[derive(Clone)]
pub struct Host {
    runtime: Result<Rc<ShellRuntime>, String>,
    package: PathBuf,
    budget: Budget,
    client: Client,
    views: Rc<RefCell<HashMap<String, Entity<Note>>>>,
    watch: Rc<RefCell<Option<Task<()>>>>,
}

impl Host {
    pub fn refresh(&self, cx: &mut App) -> Result<()> {
        for view in self.views.borrow().values() {
            view.update(cx, |note, cx| {
                if let Some(current) = &note.current {
                    current.view.update(cx, |view, cx| view.refresh(cx));
                }
                cx.notify();
                Ok::<_, anyhow::Error>(())
            })?;
        }
        Ok(())
    }

    pub fn invalidate(&self, cx: &mut App) {
        for view in self.views.borrow().values() {
            view.update(cx, |_, cx| cx.notify());
        }
    }

    pub fn new(package: PathBuf, client: Client) -> Self {
        let runtime = crate::notes_input::registry()
            .map_err(anyhow::Error::from)
            .and_then(ShellRuntime::new_isolated_with_components)
            .map_err(|error| format!("{error:#}"));
        Self {
            runtime,
            package,
            budget: Budget::default(),
            client,
            views: Rc::new(RefCell::new(HashMap::new())),
            watch: Rc::new(RefCell::new(None)),
        }
    }

    pub fn module(&self, colors: Colors) -> HostModule {
        let host = self.clone();
        let runtime_error = self.runtime.as_ref().err().cloned();
        let packages = self.package.parent().map(std::path::Path::to_path_buf);
        HostModule::new(crate::script_types::CONTENT_VIEW_MODULE)
            .declarations(crate::script_types::CONTENT_VIEW)
            .async_function("descriptions", move |_| {
                let packages = packages.clone();
                let runtime_error = runtime_error.clone();
                Ok(async move {
                    let packages = packages
                        .ok_or_else(|| HostError::new("Content package root is unavailable"))?;
                    let mut catalog =
                        voyager_app::content::discover(&packages).map_err(HostError::new)?;
                    if let Some(reason) = runtime_error {
                        for kind in &mut catalog.types {
                            if kind.type_id == "notes"
                                && kind.availability
                                    == voyager_contract::content::Availability::Ready
                            {
                                kind.availability =
                                    voyager_contract::content::Availability::Unavailable {
                                        reason: reason.clone(),
                                    };
                                kind.state = None;
                                kind.actions = None;
                            }
                        }
                    }
                    let raw = serde_json::to_string(&catalog)
                        .map_err(|error| HostError::new(error.to_string()))?;
                    if raw.len() > voyager_app::content::ENVELOPE_LIMIT {
                        return Err(HostError::new(
                            "Content descriptions exceed the envelope limit",
                        ));
                    }
                    Ok(HostValue::from(raw))
                })
            })
            .component("Notes", move |args, window, cx| {
                if let Err(error) = &host.runtime {
                    return div()
                        .p_4()
                        .child(format!("Notes unavailable: {error}"))
                        .into_any_element();
                }
                host.watch(window, cx);
                let id = match args.props() {
                    HostValue::Object(fields) => fields.iter().find_map(|(key, value)| {
                        (key == "contentId")
                            .then(|| value.as_str())
                            .flatten()
                            .map(str::to_owned)
                    }),
                    _ => None,
                };
                let Some(id) = id else {
                    return div()
                        .child("Notes requires a content identity")
                        .into_any_element();
                };
                if let Some(view) = host.views.borrow().get(&id) {
                    return view.clone().into_any_element();
                }
                let view = cx.new(|cx| {
                    Note::new(
                        ContentId(id.clone()),
                        host.client.clone(),
                        colors.clone(),
                        window,
                        cx,
                    )
                });
                host.views.borrow_mut().insert(id, view.clone());
                view.into_any_element()
            })
    }

    fn watch(&self, window: &mut Window, cx: &mut App) {
        let mut watch = self.watch.borrow_mut();
        if watch.is_some() {
            return;
        }
        let views = Rc::downgrade(&self.views);
        let loader = Loader {
            runtime: self.runtime.clone(),
            package: self.package.clone(),
            budget: self.budget.clone(),
            client: self.client.clone(),
        };
        let handle = window.window_handle();
        *watch = Some(cx.spawn(async move |cx| {
            let mut prior = None;
            let mut package_revision = loader.client.package_revision();
            loop {
                cx.background_executor()
                    .timer(Duration::from_millis(250))
                    .await;
                let package = loader.package.clone();
                let source = cx
                    .background_executor()
                    .spawn(async move { signature(&package).map_err(|error| format!("{error:#}")) })
                    .await;
                let revision = loader.client.package_revision();
                let changed = prior.as_ref() != Some(&source) || revision != package_revision;
                prior = Some(source.clone());
                package_revision = revision;
                if changed {
                    let _ = loader.client.refresh_content_views().await;
                }
                let Some(views) = views.upgrade() else {
                    break;
                };
                let targets: Vec<_> = views
                    .borrow()
                    .iter()
                    .map(|(id, view)| (ContentId(id.clone()), view.clone()))
                    .collect();
                let Ok(targets) = handle.update(cx, |_, _, cx| {
                    targets
                        .into_iter()
                        .filter(|(_, view)| {
                            view.update(cx, |note, _| {
                                if changed {
                                    note.scheduled = true;
                                }
                                let scheduled = note.scheduled;
                                note.scheduled = false;
                                scheduled
                            })
                        })
                        .collect::<Vec<_>>()
                }) else {
                    break;
                };
                for (id, note) in targets {
                    let binding = match &source {
                        Ok(_) => loader.client.bind_content_view(id.clone()).await,
                        Err(error) => Err(error.clone()),
                    };
                    if handle
                        .update(cx, |_, window, cx| {
                            note.update(cx, |note, cx| {
                                match binding {
                                    Ok(binding) => {
                                        let entry = &source.as_ref().expect("source checked").entry;
                                        let candidate = loader.load(
                                            binding.clone(),
                                            note,
                                            id,
                                            entry,
                                            window,
                                            cx,
                                        );
                                        match candidate {
                                            Ok(candidate) => {
                                                note.pending = Some(candidate);
                                                note.error = None;
                                            }
                                            Err(error) => {
                                                binding.retire();
                                                note.error =
                                                    Some(format!("Notes reload failed: {error:#}"));
                                            }
                                        }
                                    }
                                    Err(error) => {
                                        note.error = Some(error);
                                    }
                                }
                                if note
                                    .current
                                    .as_ref()
                                    .is_some_and(|current| current.binding.is_retired())
                                {
                                    note.session.update(cx, |session, cx| session.suspend(cx));
                                }
                                cx.notify();
                            })
                        })
                        .is_err()
                    {
                        break;
                    }
                }
            }
        }));
    }
}

#[derive(Clone, Eq, PartialEq)]
struct Source {
    files: Vec<(PathBuf, u64)>,
    metadata: u64,
    entry: String,
}

fn signature(package: &Path) -> Result<Source> {
    let files = crate::host::source_snapshot(package)?;
    let mut bytes = Vec::new();
    std::fs::File::open(package.join("mod.json"))?
        .take(voyager_app::content::ENVELOPE_LIMIT as u64 + 1)
        .read_to_end(&mut bytes)?;
    anyhow::ensure!(
        bytes.len() <= voyager_app::content::ENVELOPE_LIMIT,
        "Notes metadata exceeds its envelope limit"
    );
    let metadata: serde_json::Value = serde_json::from_slice(&bytes)?;
    anyhow::ensure!(metadata.is_object(), "Notes metadata must be an object");
    if let Some(version) = metadata.get("version") {
        anyhow::ensure!(
            version.as_u64() == Some(1),
            "Notes requires package version 1"
        );
    }
    let entry = match metadata.get("entry") {
        None => "main.js",
        Some(entry) => entry
            .as_str()
            .filter(|entry| !entry.is_empty())
            .ok_or_else(|| anyhow::anyhow!("Notes entry must be nonempty text"))?,
    }
    .to_owned();
    let mut hash = DefaultHasher::new();
    bytes.hash(&mut hash);
    Ok(Source {
        files,
        metadata: hash.finish(),
        entry,
    })
}

#[derive(Clone)]
struct Loader {
    runtime: Result<Rc<ShellRuntime>, String>,
    package: PathBuf,
    budget: Budget,
    client: Client,
}

impl Loader {
    fn load(
        &self,
        binding: ViewBinding,
        note: &Note,
        id: ContentId,
        entry: &str,
        window: &mut Window,
        cx: &mut App,
    ) -> Result<Candidate> {
        let runtime = self
            .runtime
            .as_ref()
            .map_err(|error| anyhow::Error::msg(error.clone()))?;
        let application = format!("notes-{}", id.0);
        let colors = note.colors.clone();
        let identity = id.0.clone();
        let budget = self.budget.clone();
        let client = self.client.clone();
        let issued = self.client.clone();
        let observer = self.client.clone();
        let observed = binding.clone();
        let invoked = binding.clone();
        let module = HostModule::new(crate::script_types::CONTENT_MODULE)
            .declarations(crate::script_types::CONTENT)
            .function("identity", move |_| Ok(HostValue::from(identity.clone())))
            .function("request_id", move |_| {
                Ok(HostValue::from(issued.request_id()))
            })
            .async_function("changed", move |arguments| {
                let after = match arguments.get(0) {
                    Some(HostValue::Null) => None,
                    Some(value) => Some(
                        value
                            .as_str()
                            .ok_or_else(|| {
                                HostError::new("Content notification version must be text")
                            })?
                            .parse::<u64>()
                            .map_err(|_| HostError::new("Invalid content notification version"))?,
                    ),
                    _ => {
                        return Err(HostError::new(
                            "Content notification requires its previous version",
                        ));
                    }
                };
                let observer = observer.clone();
                let binding = observed.clone();
                Ok(async move {
                    let version = observer
                        .view_changed(&binding, after)
                        .await
                        .map_err(|error| HostError::new(format!("{error:?}")))?;
                    Ok(HostValue::from(version.to_string()))
                })
            })
            .function("theme", move |_| colors())
            .async_function("invoke", move |arguments| {
                let raw = arguments.string(0)?;
                let request_id = arguments.string(1)?;
                let revision = arguments.string(2)?;
                let (request_id, expected_revision) = validate_identity(request_id, revision)?;
                let request_id = request_id.to_owned();
                let expected_revision = expected_revision.map(str::to_owned);
                let oversized = raw.len() > 1024 * 1024 + 16384;
                let admitted = (!oversized)
                    .then(|| budget.reserve(&id.0, raw.len()))
                    .flatten()
                    .map(|permit| (raw.to_owned(), permit));
                let client = client.clone();
                let binding = invoked.clone();
                let content_id = id.clone();
                Ok(async move {
                    let (response, permit) = match admitted {
                        Some((raw, permit)) => {
                            let request: Request = serde_json::from_str(&raw)
                                .map_err(|error| HostError::new(error.to_string()))?;
                            let (_, actual_id, actual_revision) =
                                voyager_app::content::identity(&request);
                            if actual_id != request_id
                                || actual_revision != expected_revision.as_deref()
                            {
                                return Err(HostError::new("Content request identity changed"));
                            }
                            let response = if matches!(
                                &request,
                                Request::Update { .. } | Request::Configure { .. }
                            ) {
                                client.content_view(&binding, request)
                            } else {
                                client.read_content_view(&binding, request).await
                            }
                            .map_err(|error| HostError::new(format!("{error:?}")))?;
                            ((*response).clone(), Some(permit))
                        }
                        None => (
                            Response::Rejected {
                                version: Version::V1,
                                request_id,
                                content_id,
                                expected_revision,
                                message: if oversized {
                                    "Request exceeds limit"
                                } else {
                                    "Content is busy"
                                }
                                .into(),
                            },
                            None,
                        ),
                    };
                    let raw = serde_json::to_string(&response)
                        .map_err(|error| HostError::new(error.to_string()))?;
                    if raw.len() > 1024 * 1024 + 16384 {
                        return Err(HostError::new("Response exceeds limit"));
                    }
                    drop(permit);
                    Ok(HostValue::from(raw))
                })
            });
        let _guard = LoadGuard::enter(
            Policy::new()
                .with_application(application)
                .with_host_module(module)?,
        )?;
        let session =
            crate::notes_scope::LoadSession::enter(note.session.clone(), binding.clone())?;
        let application = runtime.load_application(&self.package, entry)?;
        let view = runtime.mount_application(&application, window, cx)?;
        Ok(Candidate {
            view,
            binding,
            retained: session.retained(),
            validated: false,
        })
    }
}

struct Candidate {
    view: Entity<ScriptView>,
    binding: ViewBinding,
    retained: bool,
    validated: bool,
}

impl Drop for Candidate {
    fn drop(&mut self) {
        self.binding.retire();
    }
}

struct Note {
    current: Option<Candidate>,
    pending: Option<Candidate>,
    session: Entity<crate::notes_session::Session>,
    colors: Colors,
    scheduled: bool,
    publishing: bool,
    view_observer: Option<Subscription>,
    _session_observer: Subscription,
    error: Option<String>,
}

impl Note {
    fn new(
        id: ContentId,
        client: Client,
        colors: Colors,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let session = cx.new(|cx| crate::notes_session::Session::new(id, client, window, cx));
        let observer = cx.observe(&session, |note, _, cx| {
            if let Some(current) = &note.current {
                current.view.update(cx, |view, cx| view.refresh(cx));
            }
            cx.notify();
        });
        Self {
            current: None,
            pending: None,
            session,
            colors,
            scheduled: true,
            publishing: false,
            view_observer: None,
            _session_observer: observer,
            error: None,
        }
    }

    fn publish(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.publishing = false;
        let Some(candidate) = self.pending.take() else {
            return;
        };
        if !candidate.validated {
            self.pending = Some(candidate);
            cx.notify();
            return;
        }
        if let Err(error) = candidate.binding.activate() {
            self.error = Some(error);
            cx.notify();
            return;
        }
        if let Some(previous) = self.current.take() {
            previous.binding.retire();
        }
        if candidate.retained {
            self.session.update(cx, |session, cx| {
                session.activate(candidate.binding.clone(), window, cx)
            });
        } else {
            self.session.update(cx, |session, cx| session.suspend(cx));
        }
        self.view_observer = Some(cx.observe(&candidate.view, |_, _, cx| cx.notify()));
        self.current = Some(candidate);
        self.error = None;
        cx.notify();
    }

    fn draw(
        candidate: &Candidate,
        window: &mut Window,
        cx: &mut App,
    ) -> (AnyElement, Option<String>) {
        let frame = crate::notes_scope::Build::enter();
        let element = candidate
            .view
            .update(cx, |view, cx| view.render(window, cx).into_any_element());
        let error = frame
            .error()
            .or_else(|| candidate.view.read(cx).build_error().map(str::to_owned));
        (element, error)
    }
}

impl Render for Note {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl gpui::IntoElement {
        if let Some(candidate) = &self.pending {
            let (_, error) = Self::draw(candidate, window, cx);
            if let Some(error) = error {
                self.pending = None;
                self.error = Some(format!("Notes reload failed: {error}"));
            } else {
                if let Some(candidate) = &mut self.pending {
                    candidate.validated = true;
                }
                if !self.publishing {
                    self.publishing = true;
                    cx.defer_in(window, |note, window, cx| note.publish(window, cx));
                }
            }
        }
        let content = match &self.current {
            Some(current) if !current.binding.is_retired() => Self::draw(current, window, cx).0,
            _ => div()
                .p_4()
                .child(if self.current.is_some() {
                    "Notes is unavailable"
                } else {
                    "Opening Notes"
                })
                .into_any_element(),
        };
        div()
            .relative()
            .size_full()
            .child(content)
            .children(self.error.as_ref().map(|error| {
                div()
                    .absolute()
                    .bottom_0()
                    .left_0()
                    .w_full()
                    .p_2()
                    .bg(gpui::rgb(0x16181c))
                    .child(error.clone())
            }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_is_borrowed_after_bounded_validation() {
        let request = "request";
        let revision = "revision";
        let (actual, expected) = validate_identity(request, revision).unwrap();
        assert_eq!(actual.as_ptr(), request.as_ptr());
        assert_eq!(expected.unwrap().as_ptr(), revision.as_ptr());
        assert!(validate_identity("", revision).is_err());
        assert!(validate_identity(&"x".repeat(128), &"y".repeat(128)).is_ok());
        assert!(validate_identity(request, "").unwrap().1.is_none());
        assert!(validate_identity(&"x".repeat(129), revision).is_err());
        assert!(validate_identity(request, &"x".repeat(129)).is_err());
    }

    #[test]
    fn notes_runtime_links_private_inputs_without_terminal_constructors() {
        let runtime =
            ShellRuntime::new_isolated_with_components(crate::notes_input::registry().unwrap())
                .unwrap();
        let directory =
            std::env::temp_dir().join(format!("voyager-notes-imports-{}", std::process::id()));
        std::fs::create_dir(&directory).unwrap();
        for (entry, import, allowed) in [
            (
                "inputs.js",
                "import { TitleState, BodyState } from 'voyager_input';",
                true,
            ),
            (
                "terminal.js",
                "import { TerminalState } from 'voyager_native';",
                false,
            ),
            (
                "workspace.js",
                "import { call } from 'voyager_workspace';",
                false,
            ),
            ("broken.js", "export const broken = ;", false),
        ] {
            std::fs::write(directory.join(entry), format!("import {{ View }} from 'gpui-kit'; {import} export default class Notes extends View {{}}")).unwrap();
            let result = runtime.load_application(&directory, entry);
            assert_eq!(result.is_ok(), allowed, "{entry}");
        }
        std::fs::remove_dir_all(directory).unwrap();
    }
}
