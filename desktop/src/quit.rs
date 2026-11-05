use crate::{Quit, host::Header};
use gpui::{App, WeakEntity};
use std::{cell::RefCell, rc::Rc};
use voyager_app::conversation_client;

enum State {
    Ready,
    Pending,
    Finished(Result<(), String>),
}

pub fn register(
    header: WeakEntity<Header>,
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
            header.quit_status("Closing Voyager. Programs keep running.".into(), cx);
        });
        let conversation = conversation.clone();
        let state = state.clone();
        let header = header.clone();
        cx.spawn(async move |cx| {
            let private = cx
                .background_executor()
                .spawn(async move { conversation.quit().await });
            let private = private.await;
            let mut errors = Vec::new();
            if let Err(error) = private {
                errors.push(format!("Private conversation shutdown: {error}"));
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
