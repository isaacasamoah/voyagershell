use crate::{notes_input::BodyHeight, notes_session::Session};
use anyhow::{Result, ensure};
use gpui::{App, Entity, EntityId};
use gpui_base::input::{InputState, TextareaState};
use std::{cell::RefCell, rc::Rc};
use voyager_app::content::ViewBinding;

struct Loading {
    session: Entity<Session>,
    view: ViewBinding,
    retained: bool,
}

#[derive(Clone)]
struct Frame {
    session: Entity<Session>,
    error: Rc<RefCell<Option<String>>>,
}

thread_local! {
    static LOADING: RefCell<Option<Loading>> = const { RefCell::new(None) };
    static FRAME: RefCell<Option<Frame>> = const { RefCell::new(None) };
}

#[derive(Clone)]
pub struct SessionHandle {
    pub session: Entity<Session>,
    pub view: ViewBinding,
}

pub struct LoadSession;

impl LoadSession {
    pub fn enter(session: Entity<Session>, view: ViewBinding) -> Result<Self> {
        LOADING.with(|loading| {
            let mut loading = loading.borrow_mut();
            ensure!(
                loading.is_none(),
                "Nested Notes construction is unavailable"
            );
            *loading = Some(Loading {
                session,
                view,
                retained: false,
            });
            Ok(Self)
        })
    }

    pub fn retained(&self) -> bool {
        LOADING.with(|loading| {
            loading
                .borrow()
                .as_ref()
                .is_some_and(|loading| loading.retained)
        })
    }
}

impl Drop for LoadSession {
    fn drop(&mut self) {
        LOADING.with(|loading| *loading.borrow_mut() = None);
    }
}

pub fn session() -> Result<SessionHandle, String> {
    LOADING.with(|loading| {
        let mut loading = loading.borrow_mut();
        let loading = loading
            .as_mut()
            .ok_or("Retained Notes state requires its owned content view")?;
        loading.retained = true;
        Ok(SessionHandle {
            session: loading.session.clone(),
            view: loading.view.clone(),
        })
    })
}

pub fn title(cx: &App) -> Option<Entity<InputState>> {
    LOADING.with(|loading| {
        loading
            .borrow()
            .as_ref()
            .filter(|loading| loading.retained)
            .map(|loading| loading.session.read(cx).title.clone())
    })
}

pub fn body(cx: &App) -> Option<Entity<TextareaState>> {
    LOADING.with(|loading| {
        loading
            .borrow()
            .as_ref()
            .filter(|loading| loading.retained)
            .map(|loading| loading.session.read(cx).text.clone())
    })
}

pub struct Build {
    frame: Frame,
    previous: Option<Frame>,
}

impl Build {
    pub fn enter(session: Entity<Session>) -> Self {
        let frame = Frame {
            session,
            error: Rc::new(RefCell::new(None)),
        };
        let previous = FRAME.with(|current| current.replace(Some(frame.clone())));
        Self { frame, previous }
    }

    pub fn error(&self) -> Option<String> {
        self.frame.error.borrow().clone()
    }
}

impl Drop for Build {
    fn drop(&mut self) {
        FRAME.with(|frame| *frame.borrow_mut() = self.previous.take());
    }
}

pub(crate) fn body_height(editor: EntityId, cx: &App) -> Option<Entity<BodyHeight>> {
    FRAME.with(|frame| {
        frame.borrow().as_ref().and_then(|frame| {
            let session = frame.session.read(cx);
            (session.text.entity_id() == editor).then(|| session.height.clone())
        })
    })
}

pub fn component<T>(result: Result<T>) -> Result<T> {
    if let Err(error) = &result {
        FRAME.with(|frame| {
            if let Some(frame) = frame.borrow().as_ref() {
                *frame.error.borrow_mut() = Some(error.to_string());
            }
        });
    }
    result
}
