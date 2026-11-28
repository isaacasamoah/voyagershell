use crate::{Quit, Restart, host::CanvasHost};
use gpui::{App, AsyncApp, WeakEntity};
use std::{cell::RefCell, rc::Rc};
use voyager_app::{
    client::{Client, Lifecycle},
    conversation_client,
    core::Error,
    voice_layer::Layer,
};

fn restart_failed(error: &std::io::Error) -> String {
    format!(
        "Programs keep running, but the restart did not begin: {error}. Press Ctrl+Q, then run voyager start."
    )
}

#[derive(Clone, Copy)]
enum After {
    Quit,
    Relaunch,
}

enum State {
    Ready,
    Pending,
    Finished(Lifecycle, Result<(), String>),
}

#[derive(Clone)]
struct Ending {
    relaunch: Rc<dyn Fn() -> std::io::Result<()>>,
    canvas: WeakEntity<CanvasHost>,
    workspace: Client,
    conversation: conversation_client::Client,
    voice: Layer,
    state: Rc<RefCell<State>>,
}

pub fn register(
    relaunch: Rc<dyn Fn() -> std::io::Result<()>>,
    canvas: WeakEntity<CanvasHost>,
    workspace: Client,
    conversation: conversation_client::Client,
    voice: Layer,
    requests: async_channel::Receiver<Lifecycle>,
    cx: &mut App,
) {
    let ending = Ending {
        relaunch,
        canvas,
        workspace,
        conversation,
        voice,
        state: Rc::new(RefCell::new(State::Ready)),
    };
    let quit = ending.clone();
    cx.on_action(move |_: &Quit, cx| quit.run(Lifecycle::QuitAndKeep, After::Quit, cx));
    let restart = ending.clone();
    cx.on_action(move |_: &Restart, cx| restart.run(Lifecycle::QuitAndKeep, After::Relaunch, cx));
    cx.spawn(async move |cx: &mut AsyncApp| {
        while let Ok(operation) = requests.recv().await {
            cx.update(|cx| ending.run(operation, After::Quit, cx));
        }
    })
    .detach();
}

impl Ending {
    fn run(&self, operation: Lifecycle, after: After, cx: &mut App) {
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
            let voice = ending.voice.clone();
            executor
                .spawn(async move { voice.shutdown(std::time::Duration::from_secs(10)) })
                .await;
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
                match (&result, after) {
                    (Ok(()), After::Quit) => cx.quit(),
                    (Ok(()), After::Relaunch) => match (ending.relaunch)() {
                        Ok(()) => cx.quit(),
                        Err(error) => ending.status(restart_failed(&error), cx),
                    },
                    (Err(error), _) => ending.status(error.clone(), cx),
                }
                *ending.state.borrow_mut() = State::Finished(operation, result);
            });
        })
        .detach();
    }

    fn status(&self, status: String, cx: &mut App) {
        let _ = self
            .canvas
            .update(cx, |canvas, cx| canvas.quit_status(status, cx));
    }
}

#[cfg(test)]
mod tests {
    use super::restart_failed;

    #[test]
    fn a_restart_that_did_not_begin_says_programs_keep_running_and_how_to_start() {
        let error = std::io::Error::other("sh is missing");
        assert_eq!(
            restart_failed(&error),
            "Programs keep running, but the restart did not begin: sh is missing. Press Ctrl+Q, then run voyager start."
        );
    }
}
