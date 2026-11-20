use gpui::{
    Context, InteractiveElement, IntoElement, MouseButton, ParentElement, Render, Styled, Task,
    Window, div, px, rgb,
};
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};
use voyager_app::{client::Client, content::Access};
use voyager_contract::{
    VesselId,
    content::{Manifest, Request, Response, Version},
    inspection::Role,
};

static SENT: AtomicU64 = AtomicU64::new(0);

pub(crate) struct ManifestView {
    id: VesselId,
    manifest: Option<Manifest>,
    client: Client,
    loaded: Option<(String, Value)>,
    error: Option<String>,
    work: Option<Task<()>>,
}

impl ManifestView {
    pub(crate) fn new(
        id: VesselId,
        manifest: Option<Manifest>,
        client: Client,
        cx: &mut Context<Self>,
    ) -> Self {
        let mut view = Self {
            id: id.clone(),
            manifest,
            client,
            loaded: None,
            error: None,
            work: None,
        };
        let request = Request::Inspect {
            version: Version::V1,
            request_id: Self::request_id(),
            vessel_id: id,
        };
        view.call(request, cx);
        view
    }

    fn request_id() -> String {
        format!("manifest-view-{}", SENT.fetch_add(1, Ordering::Relaxed))
    }

    fn call(&mut self, request: Request, cx: &mut Context<Self>) {
        let client = self.client.clone();
        let id = self.id.clone();
        self.work = Some(cx.spawn(async move |this, cx| {
            let outcome = match client.bind_content(id).await {
                Ok(binding) => {
                    let client = client.clone();
                    cx.background_executor()
                        .spawn(async move {
                            client
                                .content(Access::View(binding), request)
                                .map_err(|error| format!("{error:?}"))
                        })
                        .await
                }
                Err(error) => Err(error),
            };
            let _ = this.update(cx, |view, cx| {
                view.settle(outcome);
                cx.notify();
            });
        }));
    }

    fn settle(&mut self, outcome: Result<std::sync::Arc<Response>, String>) {
        match outcome.as_deref() {
            Ok(Response::State { snapshot, .. } | Response::Invoked { snapshot, .. }) => {
                self.loaded = Some((snapshot.revision.clone(), snapshot.state.clone()));
                self.error = None;
            }
            Ok(Response::Rejected { message, .. }) => self.error = Some(message.clone()),
            Ok(_) => self.error = Some("Unexpected reply from the Vessel owner".into()),
            Err(error) => self.error = Some(error.clone()),
        }
    }

    fn invoke(&mut self, action: &str, cx: &mut Context<Self>) {
        let request = Request::Invoke {
            version: Version::V1,
            request_id: Self::request_id(),
            vessel_id: self.id.clone(),
            expected_revision: self
                .loaded
                .as_ref()
                .map_or_else(|| "0".into(), |(revision, _)| revision.clone()),
            action: action.into(),
            args: serde_json::json!({}),
        };
        self.call(request, cx);
    }
}

impl Render for ManifestView {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let mut root = div()
            .flex()
            .flex_col()
            .gap(px(8.))
            .p(px(12.))
            .text_color(rgb(0xe6e6e6));
        let Some(manifest) = self.manifest.clone() else {
            return root.child("This Vessel type is unavailable");
        };
        root = root.child(manifest.name.clone());
        if let Some((revision, state)) = &self.loaded {
            let shown = format!("revision {revision} {state}");
            root = root
                .child(crate::inspect::labelled(
                    Role::ManifestState,
                    self.id.0.clone(),
                    shown,
                ))
                .child(div().child(state.to_string()));
        }
        for (name, action) in &manifest.actions {
            if !action.params.is_empty() {
                continue;
            }
            let chosen = name.clone();
            root = root.child(
                div()
                    .id(format!("manifest-action-{}-{name}", self.id.0))
                    .px(px(8.))
                    .py(px(4.))
                    .bg(rgb(0x2f3b4a))
                    .child(crate::inspect::control(
                        Role::ManifestAction,
                        format!("{}:{name}", self.id.0),
                    ))
                    .child(name.clone())
                    .on_mouse_down(
                        MouseButton::Left,
                        cx.listener(move |view, _, _, cx| view.invoke(&chosen, cx)),
                    ),
            );
        }
        if let Some(error) = &self.error {
            root = root.child(div().text_color(rgb(0xffcad3)).child(error.clone()));
        }
        root
    }
}
