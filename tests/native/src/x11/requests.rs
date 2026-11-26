use super::{ANSWER, Bounded, Window, atom, connect};
use crate::system::stamp;
use anyhow::{Context, Result, anyhow, ensure};
use serde::Serialize;
use std::io;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle, sleep};
use std::time::{Duration, Instant};
use x11rb::connection::Connection as _;
use x11rb::errors::ConnectionError;
use x11rb::protocol::Event;
use x11rb::protocol::xproto::{
    Atom, ChangeWindowAttributesAux, ClientMessageEvent, ConnectionExt as _, CreateWindowAux,
    EventMask, WindowClass,
};
use x11rb::rust_connection::RustConnection;
use x11rb::{COPY_DEPTH_FROM_PARENT, COPY_FROM_PARENT};

const DIRECTIONS: [&str; 12] = [
    "size-top-left",
    "size-top",
    "size-top-right",
    "size-right",
    "size-bottom-right",
    "size-bottom",
    "size-bottom-left",
    "size-left",
    "move",
    "size-keyboard",
    "move-keyboard",
    "cancel",
];
const CHANGE_STATES: [&str; 4] = ["withdrawn", "normal", "zoom", "iconic"];
const STATE_ACTIONS: [&str; 3] = ["remove", "add", "toggle"];
const MOVE: u32 = 8;
const POLL: Duration = Duration::from_millis(20);

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct Code {
    pub code: u32,
    pub name: &'static str,
}

impl Code {
    fn of(code: u32, names: &[&'static str]) -> Self {
        Self {
            code,
            name: usize::try_from(code)
                .ok()
                .and_then(|index| names.get(index))
                .copied()
                .unwrap_or("unknown"),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "request", rename_all = "kebab-case")]
pub enum Request {
    MoveResize {
        window: Window,
        x: i32,
        y: i32,
        direction: Code,
        button: u32,
        source: u32,
    },
    ChangeState {
        window: Window,
        state: Code,
    },
    NetWmState {
        window: Window,
        action: Code,
        first: Option<String>,
        second: Option<String>,
        source: u32,
    },
    Activate {
        window: Window,
        source: u32,
    },
}

impl Request {
    pub fn window(&self) -> Window {
        match self {
            Request::MoveResize { window, .. }
            | Request::ChangeState { window, .. }
            | Request::NetWmState { window, .. }
            | Request::Activate { window, .. } => *window,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Observed {
    pub at: u128,
    #[serde(flatten)]
    pub request: Request,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Kind {
    MoveResize,
    ChangeState,
    NetWmState,
    Activate,
}

#[derive(Clone, Copy)]
struct Atoms {
    move_resize: Atom,
    change_state: Atom,
    net_wm_state: Atom,
    activate: Atom,
    wake: Atom,
}

impl Atoms {
    fn kind(&self, message: Atom) -> Option<Kind> {
        [
            (self.move_resize, Kind::MoveResize),
            (self.change_state, Kind::ChangeState),
            (self.net_wm_state, Kind::NetWmState),
            (self.activate, Kind::Activate),
        ]
        .into_iter()
        .find_map(|(atom, kind)| (atom == message).then_some(kind))
    }
}

fn decode(
    kind: Kind,
    window: Window,
    data: [u32; 5],
    mut name: impl FnMut(Atom) -> String,
) -> Request {
    match kind {
        Kind::MoveResize => Request::MoveResize {
            window,
            x: data[0] as i32,
            y: data[1] as i32,
            direction: Code::of(data[2], &DIRECTIONS),
            button: data[3],
            source: data[4],
        },
        Kind::ChangeState => Request::ChangeState {
            window,
            state: Code::of(data[0], &CHANGE_STATES),
        },
        Kind::NetWmState => {
            let mut property = |atom: Atom| (atom != 0).then(|| name(atom));
            Request::NetWmState {
                window,
                action: Code::of(data[0], &STATE_ACTIONS),
                first: property(data[1]),
                second: property(data[2]),
                source: data[3],
            }
        }
        Kind::Activate => Request::Activate {
            window,
            source: data[0],
        },
    }
}

pub struct Requests {
    connection: Arc<RustConnection<Bounded>>,
    window: Window,
    wake: Atom,
    display: String,
    stopping: Arc<AtomicBool>,
    seen: Arc<Mutex<Vec<Observed>>>,
    watching: JoinHandle<Result<()>>,
}

impl Requests {
    pub fn connect(display: &str) -> Result<Self> {
        let connection = Arc::new(connect(display)?);
        let window = connection.generate_id()?;
        let root = connection.setup().roots[0].root;
        connection
            .create_window(
                COPY_DEPTH_FROM_PARENT,
                window,
                root,
                0,
                0,
                1,
                1,
                0,
                WindowClass::INPUT_OUTPUT,
                COPY_FROM_PARENT,
                &CreateWindowAux::new(),
            )?
            .check()?;
        let atoms = Atoms {
            move_resize: atom(&connection, "_NET_WM_MOVERESIZE")?,
            change_state: atom(&connection, "WM_CHANGE_STATE")?,
            net_wm_state: atom(&connection, "_NET_WM_STATE")?,
            activate: atom(&connection, "_NET_ACTIVE_WINDOW")?,
            wake: atom(&connection, "VOYAGER_VERIFICATION_REQUESTS_WAKE")?,
        };
        connection
            .change_window_attributes(
                root,
                &ChangeWindowAttributesAux::new().event_mask(EventMask::SUBSTRUCTURE_NOTIFY),
            )?
            .check()?;
        let stopping = Arc::new(AtomicBool::new(false));
        let seen = Arc::default();
        let watcher = Watcher {
            connection: Arc::clone(&connection),
            atoms,
            stopping: Arc::clone(&stopping),
            seen: Arc::clone(&seen),
        };
        Ok(Self {
            connection,
            window,
            wake: atoms.wake,
            display: display.to_owned(),
            stopping,
            seen,
            watching: thread::spawn(move || watcher.watch()),
        })
    }

    pub fn seen(&self) -> Vec<Observed> {
        self.seen
            .lock()
            .expect("the request record is never held across a panic")
            .clone()
    }

    pub fn confirm(&self) -> Result<()> {
        ask_to_move(&self.display, self.window)?;
        let deadline = Instant::now() + ANSWER;
        loop {
            let seen = self.seen();
            if seen.iter().any(|seen| {
                matches!(&seen.request, Request::MoveResize { window, direction, .. }
                    if *window == self.window && direction.code == MOVE)
            }) {
                return Ok(());
            }
            ensure!(
                Instant::now() < deadline,
                "The verifier's window-request observer missed its own test move request; it recorded {seen:?}"
            );
            sleep(POLL);
        }
    }

    pub fn stop(self) -> Result<()> {
        self.stopping.store(true, Ordering::SeqCst);
        let wake = ClientMessageEvent::new(32, self.window, self.wake, [0_u32; 5]);
        self.connection
            .send_event(false, self.window, EventMask::NO_EVENT, wake)?;
        self.connection.flush()?;
        self.watching
            .join()
            .map_err(|_| anyhow!("The verifier's window-request observer panicked"))?
            .context("The verifier's window-request observer failed")
    }
}

fn ask_to_move(display: &str, window: Window) -> Result<()> {
    let client = connect(display)?;
    let root = client.setup().roots[0].root;
    let message = ClientMessageEvent::new(
        32,
        window,
        atom(&client, "_NET_WM_MOVERESIZE")?,
        [0, 0, MOVE, 0, 0],
    );
    client
        .send_event(
            false,
            root,
            EventMask::SUBSTRUCTURE_NOTIFY | EventMask::SUBSTRUCTURE_REDIRECT,
            message,
        )?
        .check()?;
    client
        .get_input_focus()?
        .reply()
        .context("The test client's request did not reach the display")?;
    Ok(())
}

struct Watcher {
    connection: Arc<RustConnection<Bounded>>,
    atoms: Atoms,
    stopping: Arc<AtomicBool>,
    seen: Arc<Mutex<Vec<Observed>>>,
}

impl Watcher {
    fn watch(self) -> Result<()> {
        while !self.stopping.load(Ordering::SeqCst) {
            match self.connection.wait_for_event() {
                Ok(Event::ClientMessage(message)) if message.format == 32 => {
                    if let Some(kind) = self.atoms.kind(message.type_) {
                        let request =
                            decode(kind, message.window, message.data.as_data32(), |atom| {
                                self.name(atom)
                            });
                        self.seen
                            .lock()
                            .expect("the request record is never held across a panic")
                            .push(Observed {
                                at: stamp(),
                                request,
                            });
                    }
                }
                Ok(_) => {}
                Err(ConnectionError::IoError(error)) if error.kind() == io::ErrorKind::TimedOut => {
                }
                Err(error) => return Err(error.into()),
            }
        }
        Ok(())
    }

    fn name(&self, atom: Atom) -> String {
        self.connection
            .get_atom_name(atom)
            .ok()
            .and_then(|name| name.reply().ok())
            .map_or_else(
                || format!("atom {atom}"),
                |reply| String::from_utf8_lossy(&reply.name).into_owned(),
            )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const ATOMS: Atoms = Atoms {
        move_resize: 10,
        change_state: 11,
        net_wm_state: 12,
        activate: 14,
        wake: 13,
    };

    fn named(atom: Atom) -> String {
        format!("atom-{atom}")
    }

    #[test]
    fn a_message_type_selects_one_kind_and_the_wake_selects_none() {
        let kinds: Vec<_> = [10, 11, 12, 14, 13, 99]
            .map(|message| ATOMS.kind(message))
            .into();
        assert_eq!(
            kinds,
            [
                Some(Kind::MoveResize),
                Some(Kind::ChangeState),
                Some(Kind::NetWmState),
                Some(Kind::Activate),
                None,
                None
            ]
        );
    }

    #[test]
    fn an_activate_request_keeps_its_window_and_source() {
        let request = decode(Kind::Activate, 7, [1, 0, 0, 0, 0], named);
        assert_eq!(
            serde_json::to_value(&request).unwrap(),
            json!({"request":"activate","window":7,"source":1})
        );
        assert_eq!(request.window(), 7);
    }

    #[test]
    fn a_move_resize_request_keeps_its_point_direction_button_and_source() {
        let request = decode(Kind::MoveResize, 7, [100, 40, 8, 1, 2], named);
        assert_eq!(
            serde_json::to_value(&request).unwrap(),
            json!({"request":"move-resize","window":7,"x":100,"y":40,"direction":{"code":8,"name":"move"},"button":1,"source":2})
        );
        for (code, name) in [(0, "size-top-left"), (7, "size-left"), (11, "cancel")] {
            let Request::MoveResize { direction, .. } =
                decode(Kind::MoveResize, 7, [0, 0, code, 0, 0], named)
            else {
                unreachable!()
            };
            assert_eq!(direction, Code { code, name });
        }
        let Request::MoveResize { x, direction, .. } =
            decode(Kind::MoveResize, 7, [u32::MAX, 0, 12, 0, 0], named)
        else {
            unreachable!()
        };
        assert_eq!((x, direction.name), (-1, "unknown"));
    }

    #[test]
    fn a_change_state_request_names_the_iconic_state() {
        let request = decode(Kind::ChangeState, 7, [3, 0, 0, 0, 0], named);
        assert_eq!(
            serde_json::to_value(&request).unwrap(),
            json!({"request":"change-state","window":7,"state":{"code":3,"name":"iconic"}})
        );
        assert_eq!(request.window(), 7);
    }

    #[test]
    fn a_net_wm_state_request_names_its_action_and_both_properties() {
        let request = decode(Kind::NetWmState, 7, [2, 21, 22, 1, 0], named);
        assert_eq!(
            serde_json::to_value(&request).unwrap(),
            json!({"request":"net-wm-state","window":7,"action":{"code":2,"name":"toggle"},"first":"atom-21","second":"atom-22","source":1})
        );
        let Request::NetWmState { first, second, .. } =
            decode(Kind::NetWmState, 7, [1, 21, 0, 1, 0], named)
        else {
            unreachable!()
        };
        assert_eq!((first.as_deref(), second), (Some("atom-21"), None));
    }

    #[test]
    fn a_seen_request_is_recorded_flat_with_its_time() {
        let seen = Observed {
            at: 9,
            request: decode(Kind::ChangeState, 7, [3, 0, 0, 0, 0], named),
        };
        assert_eq!(
            serde_json::to_value(&seen).unwrap(),
            json!({"at":9,"request":"change-state","window":7,"state":{"code":3,"name":"iconic"}})
        );
    }
}
