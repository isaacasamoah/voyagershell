use crate::{Quit, host::Header};
use gpui::{App, WeakEntity};
use std::{cell::RefCell, rc::Rc};
use voyager_app::{client::Client, conversation_client, core::Error};

enum State {
    Ready,
    Pending,
    Finished(Result<(), String>),
}

pub fn register(
    header: WeakEntity<Header>,
    workspace: Client,
    conversation: conversation_client::Client,
    cx: &mut App,
) {
    let state = Rc::new(RefCell::new(State::Ready));
    cx.on_action(move |_: &Quit, cx| {
        match &*state.borrow() {
            State::Pending => return,
            State::Finished(Err(error)) => {
                let _ = header.update(cx, |header, cx| header.quit_status(error.clone(), cx));
                return;
            }
            State::Finished(Ok(())) => {
                cx.quit();
                return;
            }
            State::Ready => (),
        }
        *state.borrow_mut() = State::Pending;
        let _ = header.update(cx, |header, cx| {
            header.quit_status("Quitting the owned session".into(), cx);
        });
        let workspace = workspace.clone();
        let conversation = conversation.clone();
        let state = state.clone();
        let header = header.clone();
        cx.spawn(async move |cx| {
            let private = cx
                .background_executor()
                .spawn(async move { conversation.quit().await });
            let session = cx.background_executor().spawn(async move {
                workspace.quit().await.map_err(|error| match error {
                    Error::Rejected { message, .. } | Error::Uncertain(message) => message,
                })
            });
            let private = private.await;
            let session = session.await;
            let mut errors = Vec::new();
            if let Err(error) = private {
                errors.push(format!("Private conversation shutdown: {error}"));
            }
            if let Err(error) = session {
                errors.push(format!("Owned session shutdown: {error}"));
            }
            let result = if errors.is_empty() {
                Ok(())
            } else {
                Err(format!(
                    "Quit did not complete. Nothing was repeated.\n{}",
                    errors.join("\n")
                ))
            };
            cx.update(|cx| {
                match &result {
                    Ok(()) => cx.quit(),
                    Err(error) => {
                        let _ =
                            header.update(cx, |header, cx| header.quit_status(error.clone(), cx));
                    }
                }
                *state.borrow_mut() = State::Finished(result);
            });
        })
        .detach();
    });
}
