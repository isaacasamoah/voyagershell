use crate::{Quit, host::Header};
use gpui::{App, AsyncApp, WeakEntity};
use std::{cell::RefCell, rc::Rc};
use voyager_app::{
    client::{Client, Lifecycle},
    conversation_client,
    core::Error,
};

enum State {
    Ready,
    Pending,
    Finished(Lifecycle, Result<(), String>),
}

#[derive(Clone)]
struct Ending {
    header: WeakEntity<Header>,
    workspace: Client,
    conversation: conversation_client::Client,
    state: Rc<RefCell<State>>,
}

pub fn register(
    header: WeakEntity<Header>,
    workspace: Client,
    conversation: conversation_client::Client,
    stop_requests: async_channel::Receiver<()>,
    cx: &mut App,
) {
    let ending = Ending {
        header,
        workspace,
        conversation,
        state: Rc::new(RefCell::new(State::Ready)),
    };
    let quit = ending.clone();
    cx.on_action(move |_: &Quit, cx| quit.run(Lifecycle::QuitAndKeep, cx));
    cx.spawn(async move |cx: &mut AsyncApp| {
        while stop_requests.recv().await.is_ok() {
            cx.update(|cx| ending.run(Lifecycle::StopSession, cx));
        }
    })
    .detach();
}

pub fn stop(
    stop_requests: &async_channel::Sender<()>,
) -> impl Fn(&gpui_shell::HostArguments) -> gpui_shell::HostResult + 'static {
    let stop_requests = stop_requests.clone();
    move |_| {
        let _ = stop_requests.try_send(());
        Ok(gpui_shell::HostValue::Null)
    }
}

impl Ending {
    fn run(&self, operation: Lifecycle, cx: &mut App) {
        match &*self.state.borrow() {
            State::Pending => return,
            State::Finished(_, Ok(())) => {
                cx.quit();
                return;
            }
            State::Finished(done, Err(error)) if *done == operation => {
                self.status(error.clone(), cx);
                return;
            }
            State::Ready | State::Finished(..) => (),
        }
        *self.state.borrow_mut() = State::Pending;
        self.status(
            match operation {
                Lifecycle::QuitAndKeep => "Closing Voyager. Programs keep running.",
                Lifecycle::StopSession => "Stopping the session. Programs Core started will end.",
            }
            .into(),
            cx,
        );
        let ending = self.clone();
        cx.spawn(async move |cx: &mut AsyncApp| {
            let conversation = ending.conversation.clone();
            let workspace = ending.workspace.clone();
            let executor = cx.background_executor().clone();
            let private = executor.spawn(async move { conversation.quit().await });
            let owner = executor.spawn(async move { workspace.end(operation).await });
            let (private, owner) = (private.await, owner.await);
            let mut errors = Vec::new();
            if let Err(error) = private {
                errors.push(format!("Private conversation shutdown: {error}"));
            }
            match owner {
                Ok(()) => (),
                Err(Error::Rejected { message, .. }) => {
                    errors.push(format!("Workspace shutdown refused: {message}"));
                }
                Err(Error::Uncertain(message)) => {
                    errors.push(format!("Workspace shutdown unconfirmed: {message}"));
                }
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
                    Err(error) => ending.status(error.clone(), cx),
                }
                *ending.state.borrow_mut() = State::Finished(operation, result);
            });
        })
        .detach();
    }

    fn status(&self, status: String, cx: &mut App) {
        let _ = self
            .header
            .update(cx, |header, cx| header.quit_status(status, cx));
    }
}
