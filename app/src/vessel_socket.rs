use crate::replies::Replies;
use crate::spoken::{Kind, TurnLedger};
use crate::voyager_binding::Binding;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use voyager_contract::{
    Action, ContentDestination, CoreTerminalId, Layout, PlacementInsertion, PlacementOwner, Reply,
    Request, Response, Unanswered, VesselId,
    activity::ReportedActivity,
    reply::ReplyEvent,
    socket::{Overview, SocketReply, SocketRequest, VesselPlacement, VesselStatus},
};

const ADDRESS_LIMIT: usize = 128;

static STATUS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

pub(crate) type Call = Arc<dyn Fn(VesselId, Request) -> Result<Response, Unanswered> + Send + Sync>;

pub(crate) type Activities =
    Arc<dyn Fn() -> std::collections::BTreeMap<String, ReportedActivity> + Send + Sync>;

#[derive(Clone)]
pub(crate) struct Services {
    pub(crate) call: Call,
    pub(crate) activities: Activities,
}

pub fn directory(session: &str) -> Option<PathBuf> {
    let valid = session.starts_with("voyager-")
        && session
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-');
    valid.then(|| {
        crate::core_endpoint::endpoint(session).with_file_name(format!("{session}.vessels"))
    })
}

pub fn path(session: &str, terminal: &str) -> Option<PathBuf> {
    let local = !terminal.is_empty()
        && terminal.len() <= ADDRESS_LIMIT
        && terminal
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit());
    local
        .then(|| directory(session))
        .flatten()
        .map(|directory| directory.join(format!("{terminal}.sock")))
}

pub(crate) struct Sockets {
    session: String,
    services: Services,
    binding: Binding,
    synced: Option<Arc<Layout>>,
    open: HashMap<String, Listener>,
    turns: Arc<Mutex<TurnLedger>>,
    replies: Replies,
}

impl Sockets {
    pub(crate) fn binding(&self) -> &Binding {
        &self.binding
    }

    pub(crate) fn new(
        session: &str,
        services: Services,
        binding: Binding,
        replies: Replies,
    ) -> Self {
        Self {
            session: session.into(),
            services,
            binding,
            synced: None,
            open: HashMap::new(),
            turns: Arc::default(),
            replies,
        }
    }

    pub(crate) fn sync(&mut self, layout: &Arc<Layout>) {
        if self
            .synced
            .as_ref()
            .is_some_and(|synced| Arc::ptr_eq(synced, layout))
        {
            return;
        }
        self.synced = Some(layout.clone());
        let wanted = placed_terminals(layout);
        self.open
            .retain(|terminal, listener| wanted.get(terminal) == Some(&listener.vessel));
        self.turns
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .keep_only(|vessel| wanted.values().any(|placed| placed.0 == vessel));
        for (terminal, vessel) in wanted {
            if !self.open.contains_key(&terminal)
                && let Some(listener) = Listener::bind(
                    &self.session,
                    &self.services,
                    &self.binding,
                    &self.turns,
                    &self.replies,
                    &CoreTerminalId(terminal.clone()),
                    vessel,
                )
            {
                self.open.insert(terminal, listener);
            }
        }
    }
}

fn placed_terminals(layout: &Layout) -> HashMap<String, VesselId> {
    let placed: Vec<&VesselId> = owners(layout)
        .into_iter()
        .flat_map(|(_, _, placements)| placements)
        .map(|placement| &placement.vessel)
        .collect();
    layout
        .vessels
        .iter()
        .filter(|content| {
            voyager_contract::launch::is_terminal_backed(&content.type_id)
                && placed.contains(&&content.id)
        })
        .filter_map(|content| {
            content
                .backend
                .clone()
                .map(|backend| (backend.0, content.id.clone()))
        })
        .collect()
}

fn owners(
    layout: &Layout,
) -> Vec<(
    &voyager_contract::VoyageId,
    PlacementOwner,
    Vec<&voyager_contract::Placement>,
)> {
    let mut result = Vec::new();
    for voyage in layout.containers() {
        for fleet in &voyage.fleets {
            result.push((
                &voyage.id,
                PlacementOwner::Fleet {
                    id: fleet.id.clone(),
                },
                fleet
                    .placements
                    .iter()
                    .filter(|placement| crate::panels::Group::of_fleet(fleet).placed(&placement.id))
                    .collect(),
            ));
        }
        let portals = crate::panels::Group::of_portals(voyage);
        result.push((
            &voyage.id,
            PlacementOwner::Portals {
                voyage: voyage.id.clone(),
            },
            voyage
                .portals
                .iter()
                .filter(|placement| portals.is_some_and(|portals| portals.placed(&placement.id)))
                .collect(),
        ));
    }
    result
}

fn in_fleet(destination: &ContentDestination) -> bool {
    matches!(
        destination,
        ContentDestination::Placement {
            owner: PlacementOwner::Fleet { .. },
            ..
        }
    )
}

fn beside_in_fleet(destination: &ContentDestination) -> bool {
    matches!(
        destination,
        ContentDestination::Placement {
            owner: PlacementOwner::Fleet { .. },
            insertion: PlacementInsertion::Beside { .. },
        }
    )
}

fn offered(action: &Action, bound: bool) -> bool {
    match action {
        Action::Inspect
        | Action::CreateFleet { .. }
        | Action::Rename { .. }
        | Action::MoveVoyage { .. }
        | Action::MoveFleet { .. }
        | Action::MovePlacement { .. }
        | Action::RemovePlacement { .. }
        | Action::SelectVoyage { .. }
        | Action::SelectFleet { .. } => true,
        Action::Dock { .. }
        | Action::CreateFleetWithVessel { .. }
        | Action::SetPlacementMaximized { .. }
        | Action::ResizePlacementSplit { .. } => bound,
        Action::CreateVessel { destination, .. } => {
            beside_in_fleet(destination) || (bound && in_fleet(destination))
        }
        Action::Home
        | Action::UpdateCanvas { .. }
        | Action::SetSidebar { .. }
        | Action::SaveArrangement { .. }
        | Action::LoadArrangement { .. }
        | Action::CreateVoyage { .. }
        | Action::CreateVoyageFromSource { .. }
        | Action::StartNewShell { .. }
        | Action::RemoveVesselPackage { .. }
        | Action::RestoreVesselPackage { .. }
        | Action::CloseVoyage { .. }
        | Action::ConfirmVoyageClose { .. }
        | Action::CancelVoyageClose { .. }
        | Action::ReopenVoyage { .. }
        | Action::CloseFleet { .. }
        | Action::ReopenFleet { .. }
        | Action::RevealPlacement { .. }
        | Action::ReopenPlacement { .. }
        | Action::SetPlacementHidden { .. }
        | Action::RemoveArrangement { .. }
        | Action::FocusVessel { .. }
        | Action::SetPortalPresentation { .. } => false,
    }
}

const NOT_OFFERED: &str = "The voyager command offers only inspect, create-fleet, rename, move-voyage, move-fleet, move-placement, remove-placement, select-voyage and select-fleet, and create-vessel beside a placement; nothing was queued";

const DOCK_NOT_OFFERED: &str = "dock is offered only to Voyager; nothing was queued";

const REPLY_NOT_OFFERED: &str = "reply is accepted only from Voyager; nothing was stored";

const FLEET_WITH_VESSEL_NOT_OFFERED: &str =
    "create-fleet-with-vessel is offered only to Voyager; nothing was queued";

const VESSEL_NOT_OFFERED: &str = "create-vessel from a Vessel other than Voyager must place beside a placement of a Fleet; nothing was queued";

const VESSEL_NOT_IN_FLEET: &str =
    "create-vessel places a Vessel in a Fleet only; nothing was queued";

const MAXIMIZE_NOT_OFFERED: &str =
    "set-placement-maximized is offered only to Voyager; nothing was queued";

const RESIZE_NOT_OFFERED: &str =
    "resize-placement-split is offered only to Voyager; nothing was queued";

fn refusal(action: &Action, bound: bool) -> Option<&'static str> {
    if offered(action, bound) {
        None
    } else if matches!(action, Action::Dock { .. }) {
        Some(DOCK_NOT_OFFERED)
    } else if matches!(action, Action::CreateFleetWithVessel { .. }) {
        Some(FLEET_WITH_VESSEL_NOT_OFFERED)
    } else if matches!(action, Action::SetPlacementMaximized { .. }) {
        Some(MAXIMIZE_NOT_OFFERED)
    } else if matches!(action, Action::ResizePlacementSplit { .. }) {
        Some(RESIZE_NOT_OFFERED)
    } else if matches!(action, Action::CreateVessel { .. }) {
        Some(if bound {
            VESSEL_NOT_IN_FLEET
        } else {
            VESSEL_NOT_OFFERED
        })
    } else {
        Some(NOT_OFFERED)
    }
}

fn status(call: &Call, vessel: &VesselId, terminal: &CoreTerminalId) -> SocketReply {
    let inspected = call(
        vessel.clone(),
        Request {
            request_id: format!(
                "voyager-status-{}-{}",
                std::process::id(),
                STATUS.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ),
            expected_version: 0,
            action: Action::Inspect,
        },
    );
    match inspected {
        Err(unanswered) => SocketReply::Workspace {
            reply: Reply::Unanswered(unanswered),
        },
        Ok(response) => SocketReply::Status {
            status: vessel_status(&response, vessel, terminal),
        },
    }
}

fn vessel_status(
    response: &Response,
    vessel: &VesselId,
    terminal: &CoreTerminalId,
) -> VesselStatus {
    VesselStatus {
        vessel: vessel.clone(),
        terminal: terminal.clone(),
        version: response.version,
        placements: owners(&response.layout)
            .into_iter()
            .flat_map(|(voyage, owner, placements)| {
                placements
                    .into_iter()
                    .filter(|placement| &placement.vessel == vessel)
                    .map(move |placement| VesselPlacement {
                        placement: placement.id.clone(),
                        voyage: voyage.clone(),
                        owner: owner.clone(),
                        name: placement.name.clone(),
                    })
            })
            .collect(),
    }
}

fn overview(services: &Services, vessel: &VesselId, terminal: &CoreTerminalId) -> SocketReply {
    let inspected = (services.call)(
        vessel.clone(),
        Request {
            request_id: format!(
                "voyager-overview-{}-{}",
                std::process::id(),
                STATUS.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ),
            expected_version: 0,
            action: Action::Inspect,
        },
    );
    match inspected {
        Err(unanswered) => SocketReply::Workspace {
            reply: Reply::Unanswered(unanswered),
        },
        Ok(response) => SocketReply::Overview {
            overview: Overview {
                status: vessel_status(&response, vessel, terminal),
                voyages: crate::vessel_overview::voyages(
                    &response.layout,
                    vessel,
                    &(services.activities)(),
                ),
            },
        },
    }
}

fn focus(call: &Call, vessel: &VesselId) -> SocketReply {
    let inspected = call(
        vessel.clone(),
        Request {
            request_id: format!(
                "voyager-focus-{}-{}",
                std::process::id(),
                STATUS.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ),
            expected_version: 0,
            action: Action::Inspect,
        },
    );
    match inspected {
        Err(unanswered) => SocketReply::Workspace {
            reply: Reply::Unanswered(unanswered),
        },
        Ok(response) => match crate::context::focus(&response.layout, response.version) {
            Ok(focus) => SocketReply::Focus { focus },
            Err(message) => SocketReply::Refused { message },
        },
    }
}

fn answer(
    services: &Services,
    binding: &Binding,
    turns: &Mutex<TurnLedger>,
    replies: &Replies,
    vessel: &VesselId,
    terminal: &CoreTerminalId,
    line: &str,
) -> SocketReply {
    match serde_json::from_str::<SocketRequest>(line) {
        Err(error) => SocketReply::Refused {
            message: format!("Invalid voyager request: {error}; nothing was queued"),
        },
        Ok(SocketRequest::Status) => status(&services.call, vessel, terminal),
        Ok(SocketRequest::Overview) => overview(services, vessel, terminal),
        Ok(SocketRequest::Focus { spoken, prompt }) => {
            let reply = focus(&services.call, vessel);
            if spoken && binding.names(terminal) && matches!(reply, SocketReply::Focus { .. }) {
                match prompt {
                    Some(prompt) => turns
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner)
                        .spoken_prompt(vessel, &prompt),
                    None => eprintln!(
                        "A spoken focus request carried no prompt id and was treated as typed"
                    ),
                }
            }
            reply
        }
        Ok(SocketRequest::Reply { event }) if binding.names(terminal) => {
            if let ReplyEvent::Unreadable { event, error } = &event {
                eprintln!("Voyager's {event} hook input was unreadable: {error}");
            }
            replies.accept_with(event, |turn| {
                turns
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner)
                    .observe(vessel, turn)
                    == Kind::Spoken
            });
            SocketReply::Noted
        }
        Ok(SocketRequest::Reply { .. }) => SocketReply::Refused {
            message: REPLY_NOT_OFFERED.into(),
        },
        Ok(SocketRequest::Workspace { request }) => {
            match refusal(&request.action, binding.names(terminal)) {
                Some(message) => SocketReply::Refused {
                    message: message.into(),
                },
                None => SocketReply::Workspace {
                    reply: (services.call)(vessel.clone(), *request).into(),
                },
            }
        }
    }
}

#[cfg(unix)]
struct Listener {
    vessel: VesselId,
    path: std::path::PathBuf,
    closed: Arc<std::sync::atomic::AtomicBool>,
}

#[cfg(unix)]
impl Listener {
    fn bind(
        session: &str,
        services: &Services,
        binding: &Binding,
        turns: &Arc<Mutex<TurnLedger>>,
        replies: &Replies,
        terminal: &CoreTerminalId,
        vessel: VesselId,
    ) -> Option<Self> {
        use std::io::{BufRead, Read, Write};
        use std::os::unix::{fs::PermissionsExt, net::UnixListener};
        use std::sync::atomic::Ordering;
        let path = crate::vessel_socket::path(session, &terminal.0)?;
        let bound = path
            .parent()
            .ok_or_else(|| std::io::Error::other("Vessel socket has no directory"))
            .and_then(|directory| {
                std::fs::create_dir_all(directory)?;
                std::fs::set_permissions(directory, std::fs::Permissions::from_mode(0o700))
            })
            .and_then(|()| match std::fs::remove_file(&path) {
                Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error),
                _ => UnixListener::bind(&path),
            });
        let listener = match bound {
            Ok(listener) => listener,
            Err(error) => {
                eprintln!("Vessel socket {} unavailable: {error}", path.display());
                return None;
            }
        };
        let closed = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let stopped = closed.clone();
        let (services, binding, turns, replies) = (
            services.clone(),
            binding.clone(),
            turns.clone(),
            replies.clone(),
        );
        let (owner, address) = (vessel.clone(), terminal.clone());
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                if stopped.load(Ordering::SeqCst) {
                    break;
                }
                let Ok(mut stream) = stream else {
                    continue;
                };
                let (services, binding, turns, replies) = (
                    services.clone(),
                    binding.clone(),
                    turns.clone(),
                    replies.clone(),
                );
                let (owner, address) = (owner.clone(), address.clone());
                std::thread::spawn(move || {
                    let mut line = String::new();
                    let limit = u64::try_from(crate::activity::LINE_LIMIT).unwrap_or(u64::MAX);
                    let reply =
                        match std::io::BufReader::new((&stream).take(limit)).read_line(&mut line) {
                            Ok(_) => answer(
                                &services, &binding, &turns, &replies, &owner, &address, &line,
                            ),
                            Err(error) => SocketReply::Refused {
                                message: format!(
                                    "Unreadable voyager request: {error}; nothing was queued"
                                ),
                            },
                        };
                    if let Ok(mut encoded) = serde_json::to_vec(&reply) {
                        encoded.push(b'\n');
                        let _ = stream.write_all(&encoded);
                    }
                });
            }
        });
        Some(Self {
            vessel,
            path,
            closed,
        })
    }
}

#[cfg(unix)]
impl Drop for Listener {
    fn drop(&mut self) {
        self.closed.store(true, std::sync::atomic::Ordering::SeqCst);
        let _ = std::os::unix::net::UnixStream::connect(&self.path);
        let _ = std::fs::remove_file(&self.path);
    }
}

#[cfg(not(unix))]
struct Listener {
    vessel: VesselId,
}

#[cfg(not(unix))]
impl Listener {
    fn bind(
        _: &str,
        _: &Services,
        _: &Binding,
        _: &Arc<Mutex<TurnLedger>>,
        _: &Replies,
        _: &CoreTerminalId,
        _: VesselId,
    ) -> Option<Self> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_vessel_socket_sits_beside_its_core_session_and_names_one_local_terminal() {
        let socket = path("voyager-test", "t7").unwrap();
        assert_eq!(socket.file_name().unwrap(), "t7.sock");
        assert_eq!(
            socket.parent().unwrap(),
            crate::core_endpoint::endpoint("voyager-test").with_file_name("voyager-test.vessels")
        );
        assert!(path("voyager-test", "machine/t7").is_none());
        assert!(path("voyager-test", "../t7").is_none());
        assert!(path("voyager-test", "").is_none());
        assert!(path("default", "t7").is_none());
    }

    #[test]
    fn the_command_offers_only_workspace_arrangement_removal_and_focus() {
        let fleet = voyager_contract::FleetId("fleet-2".into());
        assert!(offered(
            &Action::CreateFleet {
                voyage: voyager_contract::VoyageId("voyage-1".into()),
                name: "Crew".into(),
            },
            false
        ));
        assert!(offered(&Action::SelectFleet { id: fleet.clone() }, false));
        assert!(!offered(&Action::CloseFleet { id: fleet }, false));
        assert!(offered(
            &Action::RemovePlacement {
                id: voyager_contract::PlacementId("placement-3".into()),
            },
            false
        ));
        assert!(!offered(
            &Action::SetPlacementHidden {
                id: voyager_contract::PlacementId("placement-3".into()),
                hidden: true,
            },
            false
        ));
    }

    pub(super) fn recorded() -> (Call, Arc<std::sync::Mutex<Vec<Action>>>) {
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let log = seen.clone();
        let call: Call = Arc::new(move |_, request: Request| {
            log.lock().unwrap().push(request.action.clone());
            Ok(Response {
                request_id: request.request_id,
                status: voyager_contract::Outcome::Applied,
                version: 2,
                layout: Arc::new(Layout::default()),
                fresh: false,
                created_workspace: false,
                created_vessels: Vec::new(),
                message: None,
                close_plan: None,
            })
        });
        (call, seen)
    }

    fn dock_line() -> String {
        serde_json::to_string(&SocketRequest::Workspace {
            request: Box::new(Request {
                request_id: "dock-1".into(),
                expected_version: 1,
                action: Action::Dock {
                    context: voyager_contract::Context::Workspace,
                },
            }),
        })
        .unwrap()
    }

    pub(super) fn services(call: &Call) -> Services {
        Services {
            call: call.clone(),
            activities: Arc::new(Default::default),
        }
    }

    pub(super) fn terminal(id: &str) -> CoreTerminalId {
        CoreTerminalId(id.into())
    }

    #[test]
    fn dock_is_accepted_from_the_bound_terminal_and_refused_from_any_other() {
        let (call, seen) = recorded();
        let binding = Binding::unbound();
        binding.bind(terminal("t8")).unwrap();
        let vessel = VesselId("vessel-1".into());

        let refused = answer(
            &services(&call),
            &binding,
            &Mutex::default(),
            &Replies::default(),
            &vessel,
            &terminal("t9"),
            &dock_line(),
        );
        assert_eq!(
            refused,
            SocketReply::Refused {
                message: DOCK_NOT_OFFERED.into()
            }
        );
        assert!(seen.lock().unwrap().is_empty());

        let accepted = answer(
            &services(&call),
            &binding,
            &Mutex::default(),
            &Replies::default(),
            &vessel,
            &terminal("t8"),
            &dock_line(),
        );
        assert!(matches!(
            accepted,
            SocketReply::Workspace {
                reply: Reply::Answered(_)
            }
        ));
        assert!(matches!(
            seen.lock().unwrap().as_slice(),
            [Action::Dock { .. }]
        ));
    }

    #[test]
    fn dock_is_refused_from_every_terminal_while_nothing_is_bound() {
        let (call, seen) = recorded();
        let binding = Binding::unbound();
        let vessel = VesselId("vessel-1".into());
        for id in ["t8", "t9"] {
            let reply = answer(
                &services(&call),
                &binding,
                &Mutex::default(),
                &Replies::default(),
                &vessel,
                &terminal(id),
                &dock_line(),
            );
            assert!(matches!(reply, SocketReply::Refused { .. }), "{id}");
        }
        assert!(seen.lock().unwrap().is_empty());
    }

    #[test]
    fn rebinding_withdraws_the_dock_from_the_previous_terminal() {
        let (call, seen) = recorded();
        let binding = Binding::unbound();
        binding.bind(terminal("t8")).unwrap();
        binding.bind(terminal("t12")).unwrap();
        let reply = answer(
            &services(&call),
            &binding,
            &Mutex::default(),
            &Replies::default(),
            &VesselId("vessel-1".into()),
            &terminal("t8"),
            &dock_line(),
        );
        assert!(matches!(reply, SocketReply::Refused { .. }));
        assert!(seen.lock().unwrap().is_empty());
    }

    #[test]
    fn a_fleet_with_a_first_vessel_is_offered_only_to_the_bound_terminal() {
        let (call, seen) = recorded();
        let binding = Binding::unbound();
        binding.bind(terminal("t8")).unwrap();
        let line = serde_json::to_string(&SocketRequest::Workspace {
            request: Box::new(Request {
                request_id: "fleet-1".into(),
                expected_version: 1,
                action: Action::CreateFleetWithVessel {
                    voyage: voyager_contract::VoyageId("voyage-1".into()),
                    name: "Review".into(),
                    source: voyager_contract::DirectorySource::Voyage {
                        voyage_id: voyager_contract::VoyageId("voyage-1".into()),
                        cwd: "/tmp".into(),
                    },
                    type_id: "terminal".into(),
                    launch: None,
                },
            }),
        })
        .unwrap();
        let vessel = VesselId("vessel-1".into());
        let refused = answer(
            &services(&call),
            &binding,
            &Mutex::default(),
            &Replies::default(),
            &vessel,
            &terminal("t9"),
            &line,
        );
        assert_eq!(
            refused,
            SocketReply::Refused {
                message: FLEET_WITH_VESSEL_NOT_OFFERED.into()
            }
        );
        assert!(seen.lock().unwrap().is_empty());
        let accepted = answer(
            &services(&call),
            &binding,
            &Mutex::default(),
            &Replies::default(),
            &vessel,
            &terminal("t8"),
            &line,
        );
        assert!(matches!(accepted, SocketReply::Workspace { .. }));
        assert!(matches!(
            seen.lock().unwrap().as_slice(),
            [Action::CreateFleetWithVessel { .. }]
        ));
    }

    #[test]
    fn the_other_offered_operations_do_not_depend_on_the_binding() {
        let (call, seen) = recorded();
        let line = serde_json::to_string(&SocketRequest::Workspace {
            request: Box::new(Request {
                request_id: "inspect-1".into(),
                expected_version: 0,
                action: Action::Inspect,
            }),
        })
        .unwrap();
        let reply = answer(
            &services(&call),
            &Binding::unbound(),
            &Mutex::default(),
            &Replies::default(),
            &VesselId("vessel-1".into()),
            &terminal("t9"),
            &line,
        );
        assert!(matches!(reply, SocketReply::Workspace { .. }));
        assert_eq!(seen.lock().unwrap().len(), 1);
    }

    pub(super) fn answering(layout: Layout) -> Call {
        let layout = Arc::new(layout);
        Arc::new(move |_, request| {
            Ok(Response {
                request_id: request.request_id,
                status: voyager_contract::Outcome::Applied,
                version: 1,
                layout: layout.clone(),
                fresh: true,
                created_workspace: false,
                created_vessels: Vec::new(),
                message: None,
                close_plan: None,
            })
        })
    }

    pub(super) fn workspace() -> Layout {
        let mut model = crate::workspace::Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Alpha".into(),
                cwd: "/alpha".into(),
            })
            .unwrap();
        model.layout
    }

    fn ask(call: &Call, turns: &Mutex<TurnLedger>, vessel: &VesselId, line: &str) -> SocketReply {
        let binding = Binding::unbound();
        binding.bind(CoreTerminalId("t1".into())).unwrap();
        answer(
            &services(call),
            &binding,
            turns,
            &Replies::default(),
            vessel,
            &CoreTerminalId("t1".into()),
            line,
        )
    }

    #[test]
    fn the_turn_after_a_spoken_focus_read_is_spoken_and_typed_ones_are_not() {
        use crate::spoken::Kind;
        let call = answering(workspace());
        let turns = Mutex::new(TurnLedger::default());
        let voyager = VesselId("voyager".into());

        ask(&call, &turns, &voyager, r#"{"command":"focus"}"#);
        assert_eq!(
            turns.lock().unwrap().observe(&voyager, "typed-1"),
            Kind::Typed
        );

        let reply = ask(
            &call,
            &turns,
            &voyager,
            r#"{"command":"focus","spoken":true,"prompt":"spoken-1"}"#,
        );
        assert!(matches!(reply, SocketReply::Focus { .. }));
        assert_eq!(
            turns.lock().unwrap().observe(&voyager, "spoken-1"),
            Kind::Spoken
        );

        ask(&call, &turns, &voyager, r#"{"command":"focus"}"#);
        assert_eq!(
            turns.lock().unwrap().observe(&voyager, "note-1"),
            Kind::Typed
        );
        assert_eq!(
            turns.lock().unwrap().observe(&voyager, "spoken-1"),
            Kind::Spoken
        );
    }

    #[test]
    fn a_refused_spoken_focus_read_marks_nothing() {
        use crate::spoken::Kind;
        let refused: Call =
            Arc::new(|_, request| Err(Unanswered::refused(request.request_id, "no".into())));
        let turns = Mutex::new(TurnLedger::default());
        let voyager = VesselId("voyager".into());
        let reply = ask(
            &refused,
            &turns,
            &voyager,
            r#"{"command":"focus","spoken":true,"prompt":"turn-1"}"#,
        );
        assert!(matches!(reply, SocketReply::Workspace { .. }));
        assert_eq!(
            turns.lock().unwrap().observe(&voyager, "turn-1"),
            Kind::Typed
        );
    }

    #[test]
    fn a_spoken_mark_from_one_vessel_never_marks_another_vessels_turn() {
        use crate::spoken::Kind;
        let call = answering(workspace());
        let turns = Mutex::new(TurnLedger::default());
        ask(
            &call,
            &turns,
            &VesselId("crew".into()),
            r#"{"command":"focus","spoken":true,"prompt":"turn-1"}"#,
        );
        assert_eq!(
            turns
                .lock()
                .unwrap()
                .observe(&VesselId("voyager".into()), "turn-1"),
            Kind::Typed
        );
    }
}

#[cfg(test)]
#[path = "vessel_socket_wiring_tests.rs"]
mod wiring_tests;

#[cfg(test)]
#[path = "vessel_socket_authority_tests.rs"]
mod authority_tests;
