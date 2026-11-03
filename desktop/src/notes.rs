use std::{cell::RefCell, collections::HashMap, path::PathBuf, rc::Rc};

use anyhow::Result;
use gpui::{
    AnyElement, App, AppContext as _, Context, Entity, IntoElement as _, ParentElement as _,
    Render, StyleRefinement, Styled as _, Subscription, Task, Window, div,
};
use gpui_shell::{
    HostError, HostModule, HostValue, ShellRoot, ShellRuntime, Watcher, policy::Policy,
};
use voyager_app::{
    client::Client,
    content::{Access, Binding},
};
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
    runtime: Rc<ShellRuntime>,
    package: PathBuf,
    budget: Budget,
    client: Client,
    views: Rc<RefCell<HashMap<String, Entity<Note>>>>,
}

impl Host {
    pub fn refresh(&self, cx: &mut App) -> Result<()> {
        for view in self.views.borrow().values() {
            view.update(cx, |note, cx| {
                if let Some(root) = &note.root {
                    self.runtime.refresh(root, cx)?;
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

    pub fn new(package: PathBuf, client: Client) -> Result<Self> {
        let runtime = ShellRuntime::new_isolated_with_components(crate::notes_input::registry()?)?;
        Ok(Self {
            runtime,
            package,
            budget: Budget::default(),
            client,
            views: Rc::new(RefCell::new(HashMap::new())),
        })
    }

    pub fn module(&self, colors: Colors) -> HostModule {
        let host = self.clone();
        HostModule::new(crate::script_types::CONTENT_VIEW_MODULE)
            .declarations(crate::script_types::CONTENT_VIEW)
            .component("Notes", move |args, window, cx| {
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
                        host.clone(),
                        ContentId(id.clone()),
                        colors.clone(),
                        window,
                        cx,
                    )
                });
                host.views.borrow_mut().insert(id, view.clone());
                view.into_any_element()
            })
    }

    fn load(
        &self,
        binding: Binding,
        id: ContentId,
        colors: Colors,
        window: &mut Window,
        cx: &mut App,
    ) -> Result<(Entity<ShellRoot>, Watcher)> {
        let application = format!("notes-{}", id.0);
        let identity = id.0.clone();
        let budget = self.budget.clone();
        let client = self.client.clone();
        let issued = self.client.clone();
        let observer = self.client.clone();
        let observed = binding.clone();
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
                    let changes = observer
                        .content_changes(binding, after)
                        .await
                        .map_err(HostError::new)?;
                    let version = changes
                        .recv()
                        .await
                        .map_err(|_| HostError::new("Content subscription closed"))?;
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
                let binding = binding.clone();
                let content_id = id.clone();
                Ok(async move {
                    let (response, permit) = match admitted {
                        Some((raw, permit)) => {
                            let request: Request = serde_json::from_str(&raw)
                                .map_err(|error| HostError::new(error.to_string()))?;
                            let (actual_id, actual_revision) = match &request {
                                Request::Describe { request_id, .. }
                                | Request::Inspect { request_id, .. } => (request_id, None),
                                Request::Update {
                                    request_id,
                                    expected_revision,
                                    ..
                                } => (request_id, Some(expected_revision)),
                            };
                            if actual_id != &request_id
                                || actual_revision != expected_revision.as_ref()
                            {
                                return Err(HostError::new("Content request identity changed"));
                            }
                            let access = Access::View(binding);
                            let response = if matches!(&request, Request::Update { .. }) {
                                client.content(access, request)
                            } else {
                                client.read_content(access, request).await
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
        let root = self.runtime.try_load(&self.package, window, cx)?;
        let watch = self.runtime.watch(&root, window, cx)?;
        Ok((root, watch))
    }
}

struct Note {
    root: Option<Entity<ShellRoot>>,
    _watch: Option<Watcher>,
    _task: Task<()>,
    _observers: Vec<Subscription>,
    error: Option<String>,
}

impl Note {
    fn new(
        host: Host,
        id: ContentId,
        colors: Colors,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let handle = window.window_handle();
        let client = host.client.clone();
        let task = cx.spawn(async move |this, cx| {
            let registered = cx
                .background_executor()
                .spawn(async move {
                    client
                        .bind_content(id.clone())
                        .await
                        .map_err(anyhow::Error::msg)
                        .map(|binding| (binding, id))
                })
                .await;
            let _ = handle.update(cx, |_, window, cx| {
                this.update(cx, |note, cx| {
                    let loaded = registered
                        .and_then(|(binding, id)| host.load(binding, id, colors, window, cx));
                    match loaded {
                        Ok((root, watch)) => {
                            note._observers
                                .push(cx.observe(&root, |_, _, cx| cx.notify()));
                            note.root = Some(root);
                            note._watch = Some(watch);
                        }
                        Err(error) => note.error = Some(format!("{error:#}")),
                    }
                    cx.notify();
                })
            });
        });
        Self {
            root: None,
            _watch: None,
            _task: task,
            _observers: Vec::new(),
            error: None,
        }
    }
}

impl Render for Note {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl gpui::IntoElement {
        let content: AnyElement = match &self.root {
            Some(root) => {
                let content = root.read(cx).content().clone();
                if window.is_a11y_active() {
                    content.into_any_element()
                } else {
                    content
                        .cached(StyleRefinement::default().size_full())
                        .into_any_element()
                }
            }
            None => div()
                .p_4()
                .child(self.error.clone().unwrap_or_else(|| "Opening Notes".into()))
                .into_any_element(),
        };
        div().size_full().child(content)
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
        ] {
            std::fs::write(directory.join(entry), format!("import {{ View }} from 'gpui-kit'; {import} export default class Notes extends View {{}}")).unwrap();
            let result = runtime.load_application(&directory, entry);
            assert_eq!(result.is_ok(), allowed, "{entry}");
        }
        std::fs::remove_dir_all(directory).unwrap();
    }
}
