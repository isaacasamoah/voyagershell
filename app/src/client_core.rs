use super::{Message, WorkspaceNotice, save};
use crate::{
    activity::Activity,
    core::{Core, Error},
    core_shapes::Terminal,
    workspace::Model,
};
use std::{
    sync::{Arc, Mutex},
    thread,
};
use voyager_contract::{
    Context, CoreTerminalId, Layout, PlacementId, observation::WorkspaceObservation,
};

fn post<R: serde::de::DeserializeOwned + Send + 'static>(
    sender: &async_channel::Sender<Message>,
    pending: crate::core::Pending<R>,
    done: impl FnOnce(Result<R, Error>) -> Message + Send + 'static,
) {
    let sender = sender.clone();
    thread::spawn(move || {
        let _ = sender.send_blocking(done(pending.wait()));
    });
}

pub(super) fn next_message(
    receiver: &async_channel::Receiver<Message>,
    activity: &Arc<Mutex<Activity>>,
    layout: &Layout,
    mut notice: WorkspaceNotice,
    listener: Option<&async_channel::Sender<WorkspaceNotice>>,
) -> Result<Message, async_channel::RecvError> {
    let message = receiver.recv_blocking()?;
    if let Ok(mut activity) = activity.lock() {
        activity.bind(
            layout
                .contents
                .iter()
                .filter_map(|content| content.backend.as_ref().map(|backend| backend.0.as_str())),
        );
        if activity.take_dirty()
            && let Some(listener) = listener
        {
            notice.activity_revision = activity.revision;
            let _ = listener.try_send(notice);
        }
    }
    Ok(message)
}

pub(super) struct Observer {
    pub(super) scope: Context,
    pub(super) version: u64,
    pub(super) active: Option<PlacementId>,
    pub(super) reply: async_channel::Sender<Result<WorkspaceObservation, String>>,
}

#[derive(Default)]
pub(super) struct Listing {
    begun: Option<u64>,
    exit: bool,
    observers: Vec<Observer>,
}

impl Listing {
    pub(super) fn exit(&mut self) {
        self.exit = true;
    }

    pub(super) fn observe(&mut self, observer: Observer) {
        self.observers.push(observer);
    }

    pub(super) fn start(
        &mut self,
        core: &mut Core,
        version: u64,
        sender: &async_channel::Sender<Message>,
    ) -> Vec<Observer> {
        if self.begun.is_some() || (!self.exit && self.observers.is_empty()) {
            return Vec::new();
        }
        match core.begin_terminal_list() {
            Ok(pending) => {
                post(sender, pending, |listed| Message::Listed {
                    terminals: listed.map(|listed| listed.terminals),
                });
                self.begun = Some(version);
                self.exit = false;
                Vec::new()
            }
            Err(_) => std::mem::take(&mut self.observers),
        }
    }

    pub(super) fn listed(&mut self) -> (Option<u64>, Vec<Observer>) {
        (self.begun.take(), std::mem::take(&mut self.observers))
    }
}

pub(super) fn answer(
    observers: Vec<Observer>,
    layout: &Arc<Layout>,
    version: u64,
    fresh: bool,
    terminals: Option<&[Terminal]>,
) {
    for observer in observers {
        let result = if fresh && observer.version == version {
            crate::observation::capture(
                layout,
                version,
                &observer.scope,
                observer.active,
                terminals,
            )
        } else {
            Err("Workspace changed; observe it again".into())
        };
        let _ = observer.reply.try_send(result);
    }
}

pub(super) fn commit(
    core: &mut Core,
    layout: &mut Arc<Layout>,
    version: &mut u64,
    fresh: &mut bool,
    candidate: Model,
) -> Result<(), String> {
    match save(core, &candidate.layout, *version) {
        Ok(saved) => {
            *version = saved;
            *layout = Arc::new(candidate.layout);
            Ok(())
        }
        Err(error) => {
            *fresh = false;
            Err(format!("Exited panel closure unconfirmed: {error:?}"))
        }
    }
}

pub(super) fn live(
    bindings: &[CoreTerminalId],
    closing: &crate::voyage_close::Closing,
) -> Vec<CoreTerminalId> {
    bindings
        .iter()
        .filter(|address| !closing.owns_terminal(address))
        .cloned()
        .collect()
}

#[cfg(test)]
mod activity_notice_tests {
    use super::*;
    use serde_json::json;
    use voyager_contract::Action;

    #[test]
    fn reported_activity_full_mailbox_is_published_before_a_continuing_message() {
        let (sender, receiver) = async_channel::bounded(8);
        for _ in 0..8 {
            sender.try_send(Message::RefreshContentViews).unwrap();
        }
        let activity = Arc::new(Mutex::new(Activity::default()));
        let mut model = Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Status".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        model.layout.contents[0].backend = Some(CoreTerminalId("t1".into()));
        {
            let mut facts = activity.lock().unwrap();
            facts.bind(["t1"]);
            facts.begin();
            facts
                .install(json!({"seq":0,"channel":7,"terminals":[]}))
                .unwrap();
            facts.take_dirty();
            facts.wake_with(Box::new(move || {
                let _ = sender.try_send(Message::ActivityChanged);
            }));
            facts.notification(json!({"jsonrpc":"2.0","method":"event","params":{"seq":1,"type":"status","terminal":"t1","data":{"status":{"state":"done"},"reported":true}}})).unwrap();
        }
        let (listener, changed) = async_channel::bounded(1);
        let notice = WorkspaceNotice {
            close_revision: 0,
            revision: 55,
            package_revision: 7,
            activity_revision: 0,
        };
        assert!(matches!(
            next_message(&receiver, &activity, &model.layout, notice, Some(&listener)).unwrap(),
            Message::RefreshContentViews
        ));
        let actual = changed.try_recv().unwrap();
        assert_eq!((actual.revision, actual.package_revision), (55, 7));
        assert!(actual.activity_revision > 0);
        assert_eq!(
            activity.lock().unwrap().get("t1").state,
            voyager_contract::activity::ActivityState::Done
        );
    }
}
