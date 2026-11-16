use super::{Message, WorkspaceNotice, save};
use crate::{
    activity::{Activity, Event},
    core::{Core, Error},
    core_shapes::Terminal,
    workspace::Model,
};
use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
        mpsc::SyncSender,
    },
    thread,
};
use voyager_contract::{
    Context, CoreTerminalId, Layout, PlacementId, Request, Response,
    observation::WorkspaceObservation,
};

pub(super) fn connect(session: &str, activity: Arc<Mutex<Activity>>) -> Result<Core, Error> {
    Core::connect_activity(session, activity).map_err(|error| match error {
        Error::Uncertain(message) => Error::Rejected {
            kind: "disconnected".into(),
            message: format!("Core is not connected, so nothing was sent: {message}"),
        },
        refused => refused,
    })
}

pub(super) fn post<R: serde::de::DeserializeOwned + Send + 'static>(
    sender: &async_channel::Sender<Message>,
    pending: crate::core::Pending<R>,
    done: impl FnOnce(Result<R, Error>) -> Message + Send + 'static,
) {
    let sender = sender.clone();
    thread::spawn(move || {
        let _ = sender.send_blocking(done(pending.wait()));
    });
}

pub(super) fn reports(
    activity: &Arc<Mutex<Activity>>,
    layout: &Layout,
    exits: &mut Vec<CoreTerminalId>,
    admit: impl Fn(&Event) -> bool,
) -> bool {
    let Ok(mut activity) = activity.lock() else {
        return false;
    };
    activity.bind(
        layout
            .vessels
            .iter()
            .filter_map(|content| content.backend.as_ref().map(|backend| backend.0.as_str())),
    );
    for event in activity.take() {
        if admit(&event) {
            for exited in activity.apply(event).into_iter().map(CoreTerminalId) {
                if !exits.contains(&exited) {
                    exits.push(exited);
                }
            }
        }
    }
    activity.take_dirty()
}

pub(super) struct Notices {
    pub(super) listener: Option<async_channel::Sender<WorkspaceNotice>>,
    pub(super) packages: Arc<AtomicU64>,
    activity: Arc<Mutex<Activity>>,
}

impl Notices {
    pub(super) fn new(activity: Arc<Mutex<Activity>>, packages: Arc<AtomicU64>) -> Self {
        Self {
            listener: None,
            packages,
            activity,
        }
    }

    pub(super) fn current(&self, revision: u64, close_revision: u64) -> WorkspaceNotice {
        WorkspaceNotice {
            revision,
            close_revision,
            package_revision: self.packages.load(Ordering::Relaxed),
            activity_revision: self
                .activity
                .lock()
                .map(|activity| activity.revision)
                .unwrap_or(0),
        }
    }

    pub(super) fn send(&self, revision: u64, close_revision: u64) {
        if let Some(listener) = &self.listener {
            let _ = listener.try_send(self.current(revision, close_revision));
        }
    }
}

pub(super) fn close_exited(
    core: &mut Core,
    (layout, version, fresh): (&mut Arc<Layout>, &mut u64, &mut bool),
    exited: &[CoreTerminalId],
    live: &[CoreTerminalId],
) {
    let mut candidate = Model {
        layout: (**layout).clone(),
    };
    let closed = match crate::terminal_lifecycle::close_exited(&mut candidate, exited, live) {
        Ok(true) => commit(core, layout, version, fresh, candidate),
        Ok(false) => Ok(()),
        Err(error) => Err(error),
    };
    if let Err(error) = closed {
        eprintln!("{error}");
    }
}

pub(super) fn relist(
    core: &mut Result<Core, Error>,
    sender: &async_channel::Sender<Message>,
    request: &Request,
    scope: Option<&Context>,
    reply: &SyncSender<Response>,
) -> Result<(), Error> {
    let core = core.as_mut().map_err(|error| error.clone())?;
    let (request, scope, reply) = (request.clone(), scope.cloned(), reply.clone());
    post(sender, core.begin_terminal_list()?, move |listed| {
        Message::Relisted {
            request,
            scope,
            reply,
            terminals: listed.map(|listed| listed.terminals),
        }
    });
    Ok(())
}

pub(super) fn unlisted(error: Error) -> String {
    format!("Cannot check live process directories: {error:?}")
}

pub(super) fn live_directories(
    terminals: Result<Vec<Terminal>, Error>,
) -> Result<Vec<String>, String> {
    let mut live = Vec::new();
    for terminal in terminals.map_err(unlisted)? {
        if terminal.is_live() {
            if terminal.cwd.is_empty() {
                return Err(
                    "A live terminal directory is unavailable; no worktree was removed".into(),
                );
            }
            live.push(terminal.cwd);
            let foreground = terminal.foreground.ok_or(
                "A live foreground process directory is unavailable; no worktree was removed",
            )?;
            if foreground.cwd.is_empty() {
                return Err(
                    "A live foreground process directory is unavailable; no worktree was removed"
                        .into(),
                );
            }
            live.push(foreground.cwd);
        }
    }
    Ok(live)
}

#[derive(Default)]
pub(super) struct Subscription {
    begun: bool,
    waiting: Vec<async_channel::Sender<()>>,
}

impl Subscription {
    pub(super) fn begin(
        &mut self,
        core: &mut Result<Core, Error>,
        quitting: bool,
        sender: &async_channel::Sender<Message>,
    ) {
        if self.begun {
            return;
        }
        let sender = sender.clone();
        self.begun = match core {
            Ok(core) if !quitting => core.begin_activity(move || {
                let _ = sender.send_blocking(Message::Subscribed);
            }),
            _ => false,
        };
        if !self.begun {
            self.answer();
        }
    }

    pub(super) fn refresh(
        &mut self,
        core: &mut Result<Core, Error>,
        quitting: bool,
        sender: &async_channel::Sender<Message>,
        reply: async_channel::Sender<()>,
    ) {
        self.waiting.push(reply);
        self.begin(core, quitting, sender);
    }

    pub(super) fn landed(&mut self) {
        self.begun = false;
        self.answer();
    }

    fn answer(&mut self) {
        for reply in self.waiting.drain(..) {
            let _ = reply.try_send(());
        }
    }
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
    observers: Vec<Observer>,
}

impl Listing {
    pub(super) fn observe(&mut self, observer: Observer) {
        self.observers.push(observer);
    }

    pub(super) fn start(
        &mut self,
        core: &mut Core,
        layout: &Arc<Layout>,
        version: u64,
        fresh: bool,
        sender: &async_channel::Sender<Message>,
    ) {
        if self.begun.is_some() || self.observers.is_empty() {
            return;
        }
        match core.begin_terminal_list() {
            Ok(pending) => {
                post(sender, pending, |listed| Message::Listed {
                    terminals: listed.map(|listed| listed.terminals),
                });
                self.begun = Some(version);
            }
            Err(_) => {
                for observer in std::mem::take(&mut self.observers) {
                    observer.answer(layout, version, fresh, None);
                }
            }
        }
    }

    pub(super) fn listed(&mut self) -> Option<u64> {
        self.begun.take()
    }

    pub(super) fn answer(
        &mut self,
        begun: Option<u64>,
        listed: Result<Option<&[Terminal]>, String>,
        layout: &Arc<Layout>,
        version: u64,
        fresh: bool,
    ) {
        for observer in std::mem::take(&mut self.observers) {
            match listed {
                Err(ref error) => drop(observer.reply.try_send(Err(error.clone()))),
                Ok(Some(_))
                    if fresh
                        && observer.version == version
                        && begun.is_some_and(|begun| begun < version) =>
                {
                    self.observers.push(observer)
                }
                Ok(terminals) => observer.answer(layout, version, fresh, terminals),
            }
        }
    }
}

impl Observer {
    pub(super) fn answer(
        self,
        layout: &Arc<Layout>,
        version: u64,
        fresh: bool,
        terminals: Option<&[Terminal]>,
    ) {
        let result = if fresh && self.version == version {
            crate::observation::capture(layout, version, &self.scope, self.active, terminals)
        } else {
            Err("Workspace changed; observe it again".into())
        };
        let _ = self.reply.try_send(result);
    }
}

pub(super) fn changed_layout(
    layout: &Layout,
    terminals: &[Terminal],
    live: &[CoreTerminalId],
    current: bool,
) -> Result<Option<Model>, String> {
    let names = if current {
        crate::observation::voyage_names(layout, terminals)
    } else {
        Vec::new()
    };
    let renamed = !names.is_empty();
    let mut candidate = Model {
        layout: layout.clone(),
    };
    for (id, name) in names {
        if let Some(voyage) = candidate
            .layout
            .voyages
            .iter_mut()
            .find(|voyage| voyage.id == id)
        {
            voyage.name = name;
        }
    }
    let exited = crate::terminal_lifecycle::exited(terminals);
    let closed = crate::terminal_lifecycle::close_exited(&mut candidate, &exited, live)?;
    Ok((closed || renamed).then_some(candidate))
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
    fn reports_behind_a_full_mailbox_are_applied_and_a_refused_report_changes_nothing() {
        let (sender, _receiver) = async_channel::bounded(8);
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
        model.layout.vessels[0].backend = Some(CoreTerminalId("t1".into()));
        let mut exits = Vec::new();
        assert!(reports(&activity, &model.layout, &mut exits, |_| true));
        let event = |seq: u64, kind: &str, terminal: &str, data: serde_json::Value| json!({"jsonrpc":"2.0","method":"event","params":{"seq":seq,"type":kind,"terminal":terminal,"data":data}});
        let done = json!({"status":{"state":"done"},"reported":true});
        {
            let mut facts = activity.lock().unwrap();
            facts.begin();
            facts
                .install(json!({"seq":0,"channel":7,"terminals":[]}))
                .unwrap();
            facts.wake_with(Box::new(move || {
                let _ = sender.try_send(Message::CoreReported);
            }));
            facts.notification(event(1, "status", "t1", done)).unwrap();
        }
        assert!(reports(&activity, &model.layout, &mut exits, |_| true));
        assert_eq!(
            activity.lock().unwrap().get("t1").state,
            voyager_contract::activity::ActivityState::Done
        );
        let exited = json!({"reason":"exited"});
        for (seq, terminal) in [(2, "foreign"), (3, "t1")] {
            let finished = event(seq, "finished", terminal, exited.clone());
            activity.lock().unwrap().notification(finished).unwrap();
        }
        assert!(!reports(&activity, &model.layout, &mut exits, |_| false));
        assert!(exits.is_empty());
        let again = event(4, "finished", "t1", exited);
        activity.lock().unwrap().notification(again).unwrap();
        assert!(reports(&activity, &model.layout, &mut exits, |_| true));
        assert!(!reports(&activity, &model.layout, &mut exits, |_| true));
        assert_eq!(exits, [CoreTerminalId("t1".into())]);
    }

    #[test]
    fn live_directories_name_each_live_terminal_and_its_foreground_program() {
        let terminal = |address: &str, state: &str, foreground: serde_json::Value| -> Terminal {
            serde_json::from_value(json!({
                "address":address, "labels":{}, "argv":["bash"], "cwd":"/tmp/shell",
                "state":state, "created_ms":0, "screen":"exact", "cols":80, "rows":24,
                "foreground":foreground
            }))
            .unwrap()
        };
        let running = json!({"name":"vim","cwd":"/tmp/project","pid":17,"argv":["vim"]});
        let listed = vec![
            terminal("t1", "live", running),
            terminal("t2", "finished", serde_json::Value::Null),
        ];
        assert_eq!(
            live_directories(Ok(listed)),
            Ok(vec!["/tmp/shell".to_owned(), "/tmp/project".to_owned()])
        );
        let unseen = vec![terminal("t3", "live", serde_json::Value::Null)];
        assert!(live_directories(Ok(unseen)).is_err_and(|error| error.contains("foreground")));
        let unlisted = live_directories(Err(Error::Uncertain("no reply".into())));
        assert!(unlisted.is_err_and(|error| error.starts_with("Cannot check live process")));
    }

    #[test]
    fn an_observation_newer_than_the_list_waits_for_the_next_list() {
        let (reply, answered) = async_channel::bounded(1);
        let mut listing = Listing::default();
        listing.observe(Observer {
            scope: Context::Workspace,
            version: 2,
            active: None,
            reply,
        });
        let layout = Arc::new(Layout::default());
        listing.answer(Some(1), Ok(Some(&[])), &layout, 2, true);
        assert!(answered.try_recv().is_err());
        listing.answer(Some(2), Ok(Some(&[])), &layout, 2, true);
        assert!(answered.try_recv().is_ok());
    }
}
