use gpui::{App, Context, Entity, SharedString, Subscription, Task, Window};
use gpui_base::input::{InputEvent, InputState, TextareaState};
use voyager_app::{client::Client, content::ViewBinding};
use voyager_contract::{
    ContentId,
    content::{Notes, NotesConfiguration, Request, Response, Version},
};

use crate::notes_draft::{Draft, Field};

#[derive(Clone)]
pub enum Intent {
    Native,
    Script(ViewBinding),
}

pub struct Session {
    pub title: Entity<InputState>,
    pub text: Entity<TextareaState>,
    pub draft: Draft,
    pub configuration: NotesConfiguration,
    id: ContentId,
    client: Client,
    observed: [SharedString; 2],
    view: Option<ViewBinding>,
    pending: Option<Intent>,
    read: Option<Task<()>>,
    save: Option<Task<()>>,
    _events: Vec<Subscription>,
}

impl Drop for Session {
    fn drop(&mut self) {
        if let Some(view) = &self.view {
            view.retire();
        }
    }
}

impl Session {
    pub fn new(id: ContentId, client: Client, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let title = crate::notes_input::new_title(String::new(), window, cx);
        let text = crate::notes_input::new_body(String::new(), window, cx);
        let title_events = cx.subscribe(&title, |session, _, event: &InputEvent, cx| match event {
            InputEvent::Change => session.changed(Field::Title, cx),
            InputEvent::Blur => session.save(Intent::Native, cx),
            _ => (),
        });
        let text_events = cx.subscribe(&text, |session, _, event: &InputEvent, cx| match event {
            InputEvent::Change => session.changed(Field::Text, cx),
            InputEvent::Blur => session.save(Intent::Native, cx),
            _ => (),
        });
        Self {
            title,
            text,
            draft: Draft::default(),
            configuration: NotesConfiguration::default(),
            id,
            client,
            observed: ["".into(), "".into()],
            view: None,
            pending: None,
            read: None,
            save: None,
            _events: vec![title_events, text_events],
        }
    }

    fn data(&self, cx: &App) -> Notes {
        Notes {
            title: self.title.read(cx).value().to_string(),
            text: self.text.read(cx).value().to_string(),
        }
    }

    fn changed(&mut self, field: Field, cx: &mut Context<Self>) {
        let (index, value) = match field {
            Field::Title => (0, self.title.read(cx).value()),
            Field::Text => (1, self.text.read(cx).value()),
        };
        if self.observed[index] != value {
            self.observed[index] = value;
            self.draft.changed(field);
        }
    }

    pub fn suspend(&mut self, cx: &mut Context<Self>) {
        if let Some(view) = self.view.take() {
            view.retire();
        }
        self.read = None;
        self.pending = None;
        self.draft.retire();
        cx.notify();
    }

    pub fn activate(&mut self, view: ViewBinding, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(previous) = self.view.replace(view.clone()) {
            previous.retire();
        }
        self.read = None;
        let client = self.client.clone();
        let id = self.id.clone();
        let handle = window.window_handle();
        self.read = Some(cx.spawn(async move |this, cx| {
            let mut after = None;
            loop {
                let next = client.view_changed(&view, after).await;
                let version = match next {
                    Ok(version) => version,
                    Err(error) => {
                        let _ = this.update(cx, |session, cx| {
                            session.draft.status = format!("{error:?}");
                            cx.notify();
                        });
                        break;
                    }
                };
                after = Some(version);
                let Ok((generation, revision)) = this.update(cx, |session, _| {
                    (session.draft.generation, session.draft.revision.clone())
                }) else {
                    break;
                };
                let request = Request::Inspect {
                    version: Version::V1,
                    request_id: client.request_id(),
                    content_id: id.clone(),
                };
                let result = client.read_content_view(&view, request).await;
                let updated = handle.update(cx, |_, window, cx| {
                    this.update(cx, |session, cx| {
                        match result {
                            Ok(response) => match &*response {
                                Response::Snapshot {
                                    snapshot,
                                    configuration,
                                    ..
                                } => {
                                    session.configuration = configuration
                                        .as_ref()
                                        .map(|metadata| metadata.configuration)
                                        .unwrap_or_default();
                                    let hydrate = session.draft.load(
                                        snapshot,
                                        generation,
                                        revision.as_deref(),
                                    );
                                    if hydrate[0]
                                        && session.title.read(cx).value().as_ref()
                                            != snapshot.data.title
                                    {
                                        session.title.update(cx, |state, cx| {
                                            state.set_value(snapshot.data.title.clone(), window, cx)
                                        });
                                    }
                                    if hydrate[1]
                                        && session.text.read(cx).value().as_ref()
                                            != snapshot.data.text
                                    {
                                        session.text.update(cx, |state, cx| {
                                            state.set_value(snapshot.data.text.clone(), window, cx)
                                        });
                                    }
                                    session.observed = [
                                        session.title.read(cx).value(),
                                        session.text.read(cx).value(),
                                    ];
                                    if session.draft.pending()
                                        && let Some(intent) = session.pending.take()
                                    {
                                        session.save(intent, cx);
                                    }
                                }
                                Response::Rejected { message, .. }
                                | Response::Limited { message, .. } => {
                                    session.draft.status = message.clone()
                                }
                                _ => session.draft.status = "Notes read was not confirmed".into(),
                            },
                            Err(error) => session.draft.status = format!("{error:?}"),
                        }
                        cx.notify();
                    })
                });
                if !matches!(updated, Ok(Ok(()))) {
                    break;
                }
            }
        }));
    }

    pub fn save(&mut self, intent: Intent, cx: &mut Context<Self>) {
        let view = match &intent {
            Intent::Native => self.view.clone(),
            Intent::Script(view) => Some(view.clone()),
        };
        let Some(view) = view.filter(ViewBinding::is_active) else {
            return;
        };
        let Some(save) = self.draft.blur() else {
            if self.draft.pending() {
                self.pending = Some(intent);
            }
            return;
        };
        let request = Request::Update {
            version: Version::V1,
            request_id: self.client.request_id(),
            content_id: self.id.clone(),
            expected_revision: save.revision,
            data: self.data(cx),
        };
        let client = self.client.clone();
        self.save = Some(cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { client.content_view(&view, request) })
                .await;
            let _ = this.update(cx, |session, cx| {
                let retry = session.draft.finish(
                    save.generation,
                    result.as_ref().map(|result| result.as_ref()),
                );
                if retry && let Some(intent) = session.pending.take() {
                    session.save(intent, cx);
                }
                cx.notify();
            });
        }));
        cx.notify();
    }
}
