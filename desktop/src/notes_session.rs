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
    Close(voyager_app::voyage_close::SaveTicket),
}

struct CloseLease {
    ticket: Option<voyager_app::voyage_close::SaveTicket>,
    readonly: [bool; 2],
    waiters: Vec<async_channel::Sender<Result<(), voyager_app::client::CallError>>>,
}

pub struct Session {
    pub title: Entity<InputState>,
    pub text: Entity<TextareaState>,
    pub draft: Draft,
    pub configuration: NotesConfiguration,
    pub filenames: Vec<String>,
    pub workspace_version: u64,
    draft_file: Option<voyager_contract::content::NotesFile>,
    selection: Option<Task<()>>,
    id: ContentId,
    client: Client,
    observed: [SharedString; 2],
    view: Option<ViewBinding>,
    pending: Option<Intent>,
    read: Option<Task<()>>,
    save: Option<Task<()>>,
    _events: Vec<Subscription>,
    closing: Option<CloseLease>,
    exit: Option<Task<()>>,
    pub exited: bool,
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
            filenames: Vec::new(),
            workspace_version: 0,
            draft_file: None,
            selection: None,
            id,
            client,
            observed: ["".into(), "".into()],
            view: None,
            pending: None,
            read: None,
            save: None,
            _events: vec![title_events, text_events],
            closing: None,
            exit: None,
            exited: false,
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
        self.observe(view, window, cx);
    }

    fn observe(&mut self, view: ViewBinding, window: &mut Window, cx: &mut Context<Self>) {
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
                                    if let Some(metadata) = configuration {
                                        session.workspace_version = metadata.workspace_version;
                                    }
                                    session.configuration = configuration
                                        .as_ref()
                                        .map(|metadata| metadata.configuration.clone())
                                        .unwrap_or_default();
                                    session.hydrate(
                                        snapshot,
                                        generation,
                                        revision.as_deref(),
                                        window,
                                        cx,
                                    );
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

    fn hydrate(
        &mut self,
        snapshot: &voyager_contract::content::Snapshot,
        generation: u64,
        revision: Option<&str>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let hydrate = self.draft.load(snapshot, generation, revision);
        if hydrate[0] && hydrate[1] {
            self.draft_file = self.configuration.notes_file.clone();
        }
        if hydrate[0] && self.title.read(cx).value().as_ref() != snapshot.data.title {
            self.title.update(cx, |state, cx| {
                state.set_value(snapshot.data.title.clone(), window, cx)
            });
        }
        if hydrate[1] && self.text.read(cx).value().as_ref() != snapshot.data.text {
            self.text.update(cx, |state, cx| {
                state.set_value(snapshot.data.text.clone(), window, cx)
            });
        }
        self.observed = [self.title.read(cx).value(), self.text.read(cx).value()];
    }

    pub fn check_selected_file(
        &self,
        file: &voyager_contract::content::NotesFile,
    ) -> Result<(), &'static str> {
        if self.draft.revision.is_none()
            && !self.draft.dirty
            && self.selection.is_none()
            && self.view.is_none()
            && self.configuration.notes_file.is_none()
            && self.draft_file.is_none()
        {
            return Ok(());
        }
        if self.selection.is_some() {
            return Err("Wait for the Note to finish selecting its file");
        }
        if self.configuration.notes_file.as_ref() != Some(file) {
            return Err("The editor has not received the selected file yet");
        }
        if self.draft_file.as_ref() != Some(file) {
            return Err("The retained draft belongs to a different file");
        }
        if self.view.as_ref().is_none_or(|view| !view.is_active()) {
            return Err("The Notes view is not active yet");
        }
        Ok(())
    }

    pub fn rebind_file(
        &mut self,
        ticket: &voyager_app::voyage_close::SaveTicket,
        file: &voyager_contract::content::NotesFile,
        version: u64,
        snapshot: &voyager_contract::content::Snapshot,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self
            .closing
            .as_ref()
            .is_none_or(|lease| lease.ticket.as_ref() != Some(ticket))
            || self.draft.dirty
        {
            return;
        }
        self.read = None;
        self.configuration.notes_file = Some(file.clone());
        self.workspace_version = version;
        let revision = self.draft.revision.clone();
        self.hydrate(
            snapshot,
            self.draft.generation,
            revision.as_deref(),
            window,
            cx,
        );
        if let Some(view) = self.view.clone().filter(ViewBinding::is_active) {
            self.observe(view, window, cx);
        }
        cx.notify();
    }

    pub fn list_notes(&mut self, cx: &mut Context<Self>) {
        if self.selection.is_some() {
            return;
        }
        let Some(view) = self.view.clone().filter(ViewBinding::is_active) else {
            return;
        };
        let request = Request::ListNotes {
            version: Version::V1,
            request_id: self.client.request_id(),
            content_id: self.id.clone(),
        };
        let client = self.client.clone();
        self.selection = Some(cx.spawn(async move |session, cx| {
            let result = client.read_content_view(&view, request).await;
            let _ = session.update(cx, |session, cx| {
                session.selection = None;
                match result {
                    Ok(response) => match &*response {
                        Response::NotesList { filenames, .. } => {
                            session.filenames = filenames.clone()
                        }
                        Response::Rejected { message, .. } | Response::Limited { message, .. } => {
                            session.draft.status = message.clone()
                        }
                        _ => session.draft.status = "Notes list was not confirmed".into(),
                    },
                    Err(error) => session.draft.status = format!("{error:?}"),
                }
                cx.notify();
            });
        }));
    }

    pub fn select_note(
        &mut self,
        filename: Option<String>,
        migrate: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.closing.is_some() || self.exit.is_some() {
            self.draft.status = "The Voyage is closing; this Note is temporarily read-only".into();
            cx.notify();
            return;
        }
        if self.selection.is_some() {
            return;
        }
        if self.draft.dirty {
            self.draft.status = "Save this draft before opening another note".into();
            cx.notify();
            return;
        }
        let Some(view) = self.view.clone().filter(ViewBinding::is_active) else {
            return;
        };
        let request_id = self.client.request_id();
        let request = match (migrate, filename) {
            (true, _) => Request::MigrateNote {
                version: Version::V1,
                request_id,
                content_id: self.id.clone(),
                expected_version: self.workspace_version,
            },
            (false, Some(filename)) => Request::OpenNote {
                version: Version::V1,
                request_id,
                content_id: self.id.clone(),
                expected_version: self.workspace_version,
                filename,
            },
            (false, None) => Request::NewNote {
                version: Version::V1,
                request_id,
                content_id: self.id.clone(),
                expected_version: self.workspace_version,
                title: "Title".into(),
            },
        };
        let client = self.client.clone();
        let handle = window.window_handle();
        let readonly = [
            self.title.read(cx).presentation().is_readonly(),
            self.text.read(cx).presentation().is_readonly(),
        ];
        self.title
            .update(cx, |input, cx| input.set_readonly(true, cx));
        self.text
            .update(cx, |input, cx| input.set_readonly(true, cx));
        self.read = None;
        self.selection = Some(cx.spawn(async move |session, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { client.content_view(&view, request) })
                .await;
            let _ = handle.update(cx, |_, window, cx| {
                session.update(cx, |session, cx| {
                    session.selection = None;
                    match result {
                        Ok(response) => match &*response {
                            Response::NoteOpened {
                                snapshot,
                                configuration,
                                workspace_version,
                                ..
                            } => {
                                session.configuration = configuration.clone();
                                session.workspace_version = *workspace_version;
                                session.filenames.clear();
                                let revision = session.draft.revision.clone();
                                session.hydrate(
                                    snapshot,
                                    session.draft.generation,
                                    revision.as_deref(),
                                    window,
                                    cx,
                                );
                            }
                            Response::Rejected { message, .. }
                            | Response::Uncertain { message, .. }
                            | Response::Limited { message, .. } => {
                                session.draft.status = message.clone()
                            }
                            _ => session.draft.status = "Note selection was not confirmed".into(),
                        },
                        Err(error) => session.draft.status = format!("{error:?}"),
                    }
                    session
                        .title
                        .update(cx, |input, cx| input.set_readonly(readonly[0], cx));
                    session
                        .text
                        .update(cx, |input, cx| input.set_readonly(readonly[1], cx));
                    if let Some(view) = session.view.clone().filter(ViewBinding::is_active) {
                        session.observe(view, window, cx);
                    }
                    cx.notify();
                })
            });
        }));
    }

    pub fn save(&mut self, intent: Intent, cx: &mut Context<Self>) {
        if self.draft.dirty && self.draft_file != self.configuration.notes_file {
            self.draft.status =
                "The selected file changed while this draft was open; the draft is retained".into();
            cx.notify();
            return;
        }
        let view = match &intent {
            Intent::Native | Intent::Close(_) => self.view.clone(),
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
        let ticket = match &intent {
            Intent::Close(ticket) => Some(ticket.clone()),
            _ => self.closing.as_ref().and_then(|lease| lease.ticket.clone()),
        };
        self.save = Some(cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { client.content_native_save(ticket, &view, request) })
                .await;
            let _ = this.update(cx, |session, cx| {
                let retry = session.draft.finish(
                    save.generation,
                    result.as_ref().map(|result| result.as_ref()),
                );
                if retry && let Some(intent) = session.pending.take() {
                    session.save(intent, cx);
                }
                session.finish_close_waiters();
                cx.notify();
            });
        }));
        cx.notify();
    }

    pub fn flush_for_close(
        &mut self,
        ticket: voyager_app::voyage_close::SaveTicket,
        cx: &mut Context<Self>,
    ) -> async_channel::Receiver<Result<(), voyager_app::client::CallError>> {
        self.flush(Some(ticket), cx)
    }

    fn flush(
        &mut self,
        ticket: Option<voyager_app::voyage_close::SaveTicket>,
        cx: &mut Context<Self>,
    ) -> async_channel::Receiver<Result<(), voyager_app::client::CallError>> {
        use voyager_app::client::CallError;
        let (reply, receive) = async_channel::bounded(1);
        if self.selection.is_some()
            || self
                .closing
                .as_ref()
                .is_some_and(|lease| lease.ticket != ticket)
        {
            let _ = reply.try_send(Err(CallError::Rejected(
                "A Note is changing files or already closing; no program was stopped".into(),
            )));
            return receive;
        }
        if self.closing.is_none() {
            let readonly = [
                self.title.read(cx).presentation().is_readonly(),
                self.text.read(cx).presentation().is_readonly(),
            ];
            self.title
                .update(cx, |input, cx| input.set_readonly(true, cx));
            self.text
                .update(cx, |input, cx| input.set_readonly(true, cx));
            self.closing = Some(CloseLease {
                ticket: ticket.clone(),
                readonly,
                waiters: Vec::new(),
            });
        }
        if let Some(lease) = &mut self.closing {
            lease.waiters.push(reply);
        }
        if self.draft.dirty && !self.draft.saving() {
            self.save(ticket.map_or(Intent::Native, Intent::Close), cx);
        }
        self.finish_close_waiters();
        receive
    }

    fn finish_close_waiters(&mut self) {
        use voyager_app::client::CallError;
        if self.draft.saving() {
            return;
        }
        let result = if self.draft.unconfirmed() {
            Err(CallError::Unconfirmed(self.draft.status.clone()))
        } else if self.draft.dirty {
            Err(CallError::Rejected(format!(
                "Note save did not finish cleanly: {}",
                self.draft.status
            )))
        } else {
            Ok(())
        };
        if let Some(lease) = &mut self.closing {
            for waiter in lease.waiters.drain(..) {
                let _ = waiter.try_send(result.clone());
            }
        }
    }

    pub fn release_close(
        &mut self,
        ticket: &voyager_app::voyage_close::SaveTicket,
        cx: &mut Context<Self>,
    ) {
        self.release_flush(Some(ticket), cx);
    }

    fn release_flush(
        &mut self,
        ticket: Option<&voyager_app::voyage_close::SaveTicket>,
        cx: &mut Context<Self>,
    ) {
        if self
            .closing
            .as_ref()
            .is_none_or(|lease| lease.ticket.as_ref() != ticket)
        {
            return;
        }
        if let Some(lease) = self.closing.take() {
            self.title
                .update(cx, |input, cx| input.set_readonly(lease.readonly[0], cx));
            self.text
                .update(cx, |input, cx| input.set_readonly(lease.readonly[1], cx));
            for waiter in lease.waiters {
                let _ = waiter.try_send(Err(voyager_app::client::CallError::Unconfirmed(
                    "Note close was released before saving completed".into(),
                )));
            }
        }
    }

    pub fn exit_note(&mut self, cx: &mut Context<Self>) {
        if self.exit.is_some() || self.closing.is_some() || self.selection.is_some() {
            self.draft.status = "Wait for the current Notes operation before exiting".into();
            cx.notify();
            return;
        }
        let Some(view) = self.view.clone().filter(ViewBinding::is_active) else {
            return;
        };
        let client = self.client.clone();
        self.exit = Some(cx.spawn(async move |this, cx| {
            let result = async {
                let capture = client.clone();
                let binding = view.clone();
                let request = cx
                    .background_executor()
                    .spawn(async move { capture.note_exit_request(&binding) })
                    .await?;
                let saved = this
                    .update(cx, |session, cx| session.flush(None, cx))
                    .map_err(|error| {
                        voyager_app::client::CallError::Unconfirmed(error.to_string())
                    })?;
                saved.recv().await.map_err(|_| {
                    voyager_app::client::CallError::Unconfirmed(
                        "Notes save acknowledgement was lost".into(),
                    )
                })??;
                let revision = this
                    .update(cx, |session, _| session.draft.revision.clone())
                    .map_err(|error| {
                        voyager_app::client::CallError::Unconfirmed(error.to_string())
                    })?
                    .ok_or_else(|| {
                        voyager_app::client::CallError::Rejected(
                            "Notes has no saved revision".into(),
                        )
                    })?;
                cx.background_executor()
                    .spawn(async move { client.exit_note(view, revision, request) })
                    .await
            }
            .await;
            let _ = this.update(cx, |session, cx| {
                session.release_flush(None, cx);
                match result {
                    Ok(response) if response.status == voyager_contract::Status::Applied => {
                        session.exited = true;
                        session.suspend(cx);
                    }
                    Ok(response) => {
                        session.draft.status = response.message.unwrap_or_else(|| {
                            "Notes Exit was not confirmed; inspect the workspace".into()
                        })
                    }
                    Err(
                        voyager_app::client::CallError::Rejected(message)
                        | voyager_app::client::CallError::Unconfirmed(message),
                    ) => session.draft.status = message,
                }
                session.exit = None;
                cx.notify();
            });
        }));
    }
}
