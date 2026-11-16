use std::{collections::HashMap, path::PathBuf, sync::Arc};
use voyager_contract::{
    Action, CoreTerminalId, Layout, PlacementOwner, Reply, Request, Response, Unanswered, VesselId,
    socket::{SocketReply, SocketRequest, VesselPlacement, VesselStatus},
};

const ADDRESS_LIMIT: usize = 128;

static STATUS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

pub(crate) type Call = Arc<dyn Fn(VesselId, Request) -> Result<Response, Unanswered> + Send + Sync>;

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
    call: Call,
    synced: Option<Arc<Layout>>,
    open: HashMap<String, Listener>,
}

impl Sockets {
    pub(crate) fn new(session: &str, call: Call) -> Self {
        Self {
            session: session.into(),
            call,
            synced: None,
            open: HashMap::new(),
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
        for (terminal, vessel) in wanted {
            if !self.open.contains_key(&terminal)
                && let Some(listener) = Listener::bind(
                    &self.session,
                    &self.call,
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
        .filter(|content| content.type_id == "terminal" && placed.contains(&&content.id))
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
                    .filter(|placement| crate::panels::contains(&fleet.root, &placement.id))
                    .collect(),
            ));
        }
        let root = voyage
            .portal_layout
            .as_ref()
            .and_then(|portals| portals.root.clone());
        result.push((
            &voyage.id,
            PlacementOwner::Portals {
                voyage: voyage.id.clone(),
            },
            voyage
                .portals
                .iter()
                .filter(|placement| crate::panels::contains(&root, &placement.id))
                .collect(),
        ));
    }
    result
}

fn offered(action: &Action) -> bool {
    match action {
        Action::Inspect
        | Action::CreateFleet { .. }
        | Action::Rename { .. }
        | Action::MoveVoyage { .. }
        | Action::MoveFleet { .. }
        | Action::MovePlacement { .. }
        | Action::SelectVoyage { .. }
        | Action::SelectFleet { .. } => true,
        Action::Home
        | Action::UpdateCanvas { .. }
        | Action::SetSidebar { .. }
        | Action::SaveArrangement { .. }
        | Action::LoadArrangement { .. }
        | Action::CreateVoyage { .. }
        | Action::CreateVoyageFromSource { .. }
        | Action::CreateFleetWithVessel { .. }
        | Action::CreateVessel { .. }
        | Action::StartNewShell { .. }
        | Action::RemoveVesselPackage { .. }
        | Action::RestoreVesselPackage { .. }
        | Action::ResizePlacementSplit { .. }
        | Action::CloseVoyage { .. }
        | Action::ConfirmVoyageClose { .. }
        | Action::CancelVoyageClose { .. }
        | Action::ReopenVoyage { .. }
        | Action::CloseFleet { .. }
        | Action::ReopenFleet { .. }
        | Action::RevealPlacement { .. }
        | Action::ReopenPlacement { .. }
        | Action::Dock { .. }
        | Action::SetPlacementMaximized { .. }
        | Action::SetPlacementHidden { .. }
        | Action::RemovePlacement { .. }
        | Action::RemoveArrangement { .. }
        | Action::SetPortalPresentation { .. } => false,
    }
}

const NOT_OFFERED: &str = "The voyager command offers only inspect, create-fleet, rename, move-voyage, move-fleet, move-placement, select-voyage and select-fleet; nothing was queued";

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
            status: VesselStatus {
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
            },
        },
    }
}

fn answer(call: &Call, vessel: &VesselId, terminal: &CoreTerminalId, line: &str) -> SocketReply {
    match serde_json::from_str::<SocketRequest>(line) {
        Err(error) => SocketReply::Refused {
            message: format!("Invalid voyager request: {error}; nothing was queued"),
        },
        Ok(SocketRequest::Status) => status(call, vessel, terminal),
        Ok(SocketRequest::Workspace { request }) if !offered(&request.action) => {
            SocketReply::Refused {
                message: NOT_OFFERED.into(),
            }
        }
        Ok(SocketRequest::Workspace { request }) => SocketReply::Workspace {
            reply: call(vessel.clone(), *request).into(),
        },
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
        call: &Call,
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
        let call = call.clone();
        let (owner, address) = (vessel.clone(), terminal.clone());
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                if stopped.load(Ordering::SeqCst) {
                    break;
                }
                let Ok(mut stream) = stream else {
                    continue;
                };
                let (call, owner, address) = (call.clone(), owner.clone(), address.clone());
                std::thread::spawn(move || {
                    let mut line = String::new();
                    let limit = u64::try_from(crate::activity::LINE_LIMIT).unwrap_or(u64::MAX);
                    let reply =
                        match std::io::BufReader::new((&stream).take(limit)).read_line(&mut line) {
                            Ok(_) => answer(&call, &owner, &address, &line),
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
    fn bind(_: &str, _: &Call, _: &CoreTerminalId, _: VesselId) -> Option<Self> {
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
    fn the_command_offers_only_workspace_arrangement_and_focus() {
        let fleet = voyager_contract::FleetId("fleet-2".into());
        assert!(offered(&Action::CreateFleet {
            voyage: voyager_contract::VoyageId("voyage-1".into()),
            name: "Crew".into(),
        }));
        assert!(offered(&Action::SelectFleet { id: fleet.clone() }));
        assert!(!offered(&Action::CloseFleet { id: fleet }));
        assert!(!offered(&Action::RemovePlacement {
            id: voyager_contract::PlacementId("placement-3".into()),
        }));
    }
}
