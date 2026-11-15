use super::{ANSWER, Bounded, Window, atom, connect};
use crate::system::stamp;
use anyhow::{Context, Result, anyhow, bail, ensure};
use serde::Serialize;
use std::io;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use x11rb::connection::Connection as _;
use x11rb::errors::ConnectionError;
use x11rb::protocol::Event;
use x11rb::protocol::xproto::{
    Atom, AtomEnum, ClientMessageEvent, ConnectionExt as _, CreateWindowAux, EventMask, PropMode,
    SELECTION_NOTIFY_EVENT, SelectionNotifyEvent, SelectionRequestEvent, WindowClass,
};
use x11rb::rust_connection::RustConnection;
use x11rb::wrapper::ConnectionExt as _;
use x11rb::{COPY_DEPTH_FROM_PARENT, COPY_FROM_PARENT, CURRENT_TIME, NONE};

const TRANSFER: Duration = Duration::from_secs(4);

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Selection {
    Clipboard,
    Primary,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Reading {
    Text(String),
    Refused,
    Unanswered,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "exchange", rename_all = "kebab-case")]
pub enum Exchange {
    Served {
        selection: Selection,
        target: String,
        requestor: Window,
        at: u128,
    },
    Refused {
        selection: Option<Selection>,
        target: String,
        requestor: Window,
        at: u128,
    },
    Cleared {
        selection: Option<Selection>,
        at: u128,
    },
}

enum Command {
    Own(Selection, String, Sender<Result<()>>),
    Disown(Selection, Sender<Result<()>>),
    Read(Selection, Sender<Result<Reading>>),
    Owner(Selection, Sender<Result<Window>>),
    Stop,
}

#[derive(Clone, Copy)]
struct Atoms {
    clipboard: Atom,
    primary: Atom,
    targets: Atom,
    utf8: Atom,
    transfer: Atom,
    wake: Atom,
}

#[derive(Debug, Eq, PartialEq)]
enum Content<'a> {
    Targets([Atom; 2]),
    Text(&'a [u8]),
}

#[derive(Default)]
struct Texts {
    clipboard: Option<String>,
    primary: Option<String>,
}

impl Texts {
    fn slot(&mut self, selection: Selection) -> &mut Option<String> {
        match selection {
            Selection::Clipboard => &mut self.clipboard,
            Selection::Primary => &mut self.primary,
        }
    }

    fn held(&self, selection: Selection) -> Option<&str> {
        match selection {
            Selection::Clipboard => self.clipboard.as_deref(),
            Selection::Primary => self.primary.as_deref(),
        }
    }
}

impl Atoms {
    fn atom(&self, selection: Selection) -> Atom {
        match selection {
            Selection::Clipboard => self.clipboard,
            Selection::Primary => self.primary,
        }
    }

    fn selection(&self, atom: Atom) -> Option<Selection> {
        [Selection::Clipboard, Selection::Primary]
            .into_iter()
            .find(|selection| self.atom(*selection) == atom)
    }

    fn content<'a>(&self, target: Atom, text: &'a str) -> Option<Content<'a>> {
        if target == self.targets {
            Some(Content::Targets([self.targets, self.utf8]))
        } else if target == self.utf8 {
            Some(Content::Text(text.as_bytes()))
        } else {
            None
        }
    }
}

pub struct Clipboard {
    connection: Arc<RustConnection<Bounded>>,
    window: Window,
    wake: Atom,
    commands: Sender<Command>,
    exchanges: Arc<Mutex<Vec<Exchange>>>,
    serving: JoinHandle<Result<()>>,
}

impl Clipboard {
    pub fn connect(display: &str) -> Result<Self> {
        let connection = Arc::new(connect(display)?);
        let window = connection.generate_id()?;
        connection
            .create_window(
                COPY_DEPTH_FROM_PARENT,
                window,
                connection.setup().roots[0].root,
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
            clipboard: atom(&connection, "CLIPBOARD")?,
            primary: AtomEnum::PRIMARY.into(),
            targets: atom(&connection, "TARGETS")?,
            utf8: atom(&connection, "UTF8_STRING")?,
            transfer: atom(&connection, "VOYAGER_VERIFICATION_TRANSFER")?,
            wake: atom(&connection, "VOYAGER_VERIFICATION_WAKE")?,
        };
        let (commands, received) = mpsc::channel();
        let exchanges = Arc::default();
        let owner = Owner {
            connection: Arc::clone(&connection),
            window,
            atoms,
            texts: Texts::default(),
            reading: None,
            exchanges: Arc::clone(&exchanges),
        };
        let serving = thread::spawn(move || owner.serve(&received));
        Ok(Self {
            connection,
            window,
            wake: atoms.wake,
            commands,
            exchanges,
            serving,
        })
    }

    pub fn window(&self) -> Window {
        self.window
    }

    pub fn own(&self, selection: Selection, text: &str) -> Result<()> {
        self.ask(
            |reply| Command::Own(selection, text.to_owned(), reply),
            ANSWER * 2,
        )?
        .context("The verifier's clipboard owner did not answer")
    }

    pub fn disown(&self, selection: Selection) -> Result<()> {
        self.ask(|reply| Command::Disown(selection, reply), ANSWER * 2)?
            .context("The verifier's clipboard owner did not answer")
    }

    pub fn read(&self, selection: Selection) -> Result<Reading> {
        Ok(self
            .ask(|reply| Command::Read(selection, reply), TRANSFER)?
            .unwrap_or(Reading::Unanswered))
    }

    pub fn owner(&self, selection: Selection) -> Result<Option<Window>> {
        let owner = self
            .ask(|reply| Command::Owner(selection, reply), ANSWER * 2)?
            .context("The verifier's clipboard owner did not answer")?;
        Ok(Some(owner).filter(|owner| *owner != NONE))
    }

    pub fn exchanges(&self) -> Vec<Exchange> {
        self.exchanges
            .lock()
            .expect("the clipboard record is never held across a panic")
            .clone()
    }

    pub fn stop(self) -> Result<()> {
        let _ = self.send(Command::Stop);
        self.serving
            .join()
            .map_err(|_| anyhow!("The verifier's clipboard owner panicked"))?
            .context("The verifier's clipboard owner failed")
    }

    fn ask<T>(
        &self,
        command: impl FnOnce(Sender<Result<T>>) -> Command,
        within: Duration,
    ) -> Result<Option<T>> {
        let (reply, answer) = mpsc::channel();
        self.send(command(reply))?;
        match answer.recv_timeout(within) {
            Ok(answer) => answer.map(Some),
            Err(RecvTimeoutError::Timeout) => Ok(None),
            Err(RecvTimeoutError::Disconnected) => {
                bail!("The verifier's clipboard owner stopped")
            }
        }
    }

    fn send(&self, command: Command) -> Result<()> {
        self.commands
            .send(command)
            .ok()
            .context("The verifier's clipboard owner stopped")?;
        let wake = ClientMessageEvent::new(32, self.window, self.wake, [0_u32; 5]);
        self.connection
            .send_event(false, self.window, EventMask::NO_EVENT, wake)?;
        self.connection.flush()?;
        Ok(())
    }
}

struct Owner {
    connection: Arc<RustConnection<Bounded>>,
    window: Window,
    atoms: Atoms,
    texts: Texts,
    reading: Option<Sender<Result<Reading>>>,
    exchanges: Arc<Mutex<Vec<Exchange>>>,
}

impl Owner {
    fn serve(mut self, commands: &Receiver<Command>) -> Result<()> {
        loop {
            match self.connection.wait_for_event() {
                Ok(Event::SelectionRequest(request)) => self.answer(request)?,
                Ok(Event::SelectionClear(cleared)) => {
                    let selection = self.atoms.selection(cleared.selection);
                    if let Some(selection) = selection {
                        *self.texts.slot(selection) = None;
                    }
                    self.record(Exchange::Cleared {
                        selection,
                        at: stamp(),
                    });
                }
                Ok(Event::SelectionNotify(notice)) => self.received(notice.property),
                Ok(_) => {}
                Err(ConnectionError::IoError(error)) if error.kind() == io::ErrorKind::TimedOut => {
                }
                Err(error) => return Err(error.into()),
            }
            loop {
                match commands.try_recv() {
                    Ok(Command::Own(selection, text, reply)) => {
                        drop(reply.send(self.own(selection, text)));
                    }
                    Ok(Command::Disown(selection, reply)) => {
                        drop(reply.send(self.disown(selection)));
                    }
                    Ok(Command::Read(selection, reply)) => self.read(selection, reply),
                    Ok(Command::Owner(selection, reply)) => {
                        drop(reply.send(self.owner(selection)));
                    }
                    Ok(Command::Stop) | Err(TryRecvError::Disconnected) => return Ok(()),
                    Err(TryRecvError::Empty) => break,
                }
            }
        }
    }

    fn own(&mut self, selection: Selection, text: String) -> Result<()> {
        *self.texts.slot(selection) = Some(text);
        self.connection.set_selection_owner(
            self.window,
            self.atoms.atom(selection),
            CURRENT_TIME,
        )?;
        ensure!(
            self.owner(selection)? == self.window,
            "Another client kept the {selection:?} selection"
        );
        Ok(())
    }

    fn disown(&mut self, selection: Selection) -> Result<()> {
        ensure!(
            self.owner(selection)? == self.window,
            "The verifier does not own the {selection:?} selection"
        );
        *self.texts.slot(selection) = None;
        self.connection
            .set_selection_owner(NONE, self.atoms.atom(selection), CURRENT_TIME)?;
        ensure!(
            self.owner(selection)? == NONE,
            "Another client took the {selection:?} selection while the verifier gave it up"
        );
        Ok(())
    }

    fn owner(&self, selection: Selection) -> Result<Window> {
        Ok(self
            .connection
            .get_selection_owner(self.atoms.atom(selection))?
            .reply()?
            .owner)
    }

    fn read(&mut self, selection: Selection, reply: Sender<Result<Reading>>) {
        let asked = self
            .connection
            .convert_selection(
                self.window,
                self.atoms.atom(selection),
                self.atoms.utf8,
                self.atoms.transfer,
                CURRENT_TIME,
            )
            .and_then(|_| self.connection.flush());
        match asked {
            Ok(()) => self.reading = Some(reply),
            Err(error) => drop(reply.send(Err(error.into()))),
        }
    }

    fn received(&mut self, property: Atom) {
        if let Some(reply) = self.reading.take() {
            let reading = if property == NONE {
                Ok(Reading::Refused)
            } else {
                self.transferred(property)
            };
            drop(reply.send(reading));
        }
    }

    fn transferred(&self, property: Atom) -> Result<Reading> {
        let transfer = self
            .connection
            .get_property(true, self.window, property, AtomEnum::ANY, 0, u32::MAX / 4)?
            .reply()?;
        ensure!(
            transfer.type_ == self.atoms.utf8 && transfer.format == 8,
            "The clipboard owner answered UTF8_STRING with {}",
            self.name(transfer.type_)
        );
        Ok(Reading::Text(String::from_utf8(transfer.value)?))
    }

    fn answer(&mut self, request: SelectionRequestEvent) -> Result<()> {
        let property = if request.property == NONE {
            request.target
        } else {
            request.property
        };
        let selection = self.atoms.selection(request.selection);
        let content = selection
            .and_then(|selection| self.texts.held(selection))
            .and_then(|text| self.atoms.content(request.target, text));
        match content {
            Some(Content::Targets(targets)) => {
                self.connection.change_property32(
                    PropMode::REPLACE,
                    request.requestor,
                    property,
                    AtomEnum::ATOM,
                    &targets,
                )?;
            }
            Some(Content::Text(text)) => {
                self.connection.change_property8(
                    PropMode::REPLACE,
                    request.requestor,
                    property,
                    self.atoms.utf8,
                    text,
                )?;
            }
            None => {}
        }
        let served = content.is_some();
        let notice = SelectionNotifyEvent {
            response_type: SELECTION_NOTIFY_EVENT,
            sequence: 0,
            time: request.time,
            requestor: request.requestor,
            selection: request.selection,
            target: request.target,
            property: if served { property } else { NONE },
        };
        self.connection
            .send_event(false, request.requestor, EventMask::NO_EVENT, notice)?;
        self.connection.flush()?;
        let (target, requestor, at) = (self.name(request.target), request.requestor, stamp());
        self.record(match selection {
            Some(selection) if served => Exchange::Served {
                selection,
                target,
                requestor,
                at,
            },
            _ => Exchange::Refused {
                selection,
                target,
                requestor,
                at,
            },
        });
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

    fn record(&self, exchange: Exchange) {
        self.exchanges
            .lock()
            .expect("the clipboard record is never held across a panic")
            .push(exchange);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_clipboard_owner_offers_only_its_targets_and_utf8_text() {
        let atoms = Atoms {
            clipboard: 1,
            primary: 6,
            targets: 2,
            utf8: 3,
            transfer: 4,
            wake: 5,
        };
        assert_eq!(
            atoms.content(atoms.targets, "β"),
            Some(Content::Targets([atoms.targets, atoms.utf8]))
        );
        assert_eq!(
            atoms.content(atoms.utf8, "β界"),
            Some(Content::Text("β界".as_bytes()))
        );
        let string: Atom = AtomEnum::STRING.into();
        for refused in [string, atoms.clipboard, atoms.transfer] {
            assert_eq!(atoms.content(refused, "β"), None, "target {refused}");
        }
    }

    #[test]
    fn each_selection_is_its_own_atom_and_only_the_two_are_served() {
        let atoms = Atoms {
            clipboard: 1,
            primary: 6,
            targets: 2,
            utf8: 3,
            transfer: 4,
            wake: 5,
        };
        assert_eq!(atoms.atom(Selection::Clipboard), 1);
        assert_eq!(atoms.atom(Selection::Primary), 6);
        assert_eq!(atoms.selection(1), Some(Selection::Clipboard));
        assert_eq!(atoms.selection(6), Some(Selection::Primary));
        let secondary: Atom = AtomEnum::SECONDARY.into();
        for other in [secondary, atoms.utf8, atoms.transfer, NONE] {
            assert_eq!(atoms.selection(other), None, "atom {other}");
        }
    }

    #[test]
    fn a_text_is_held_for_one_selection_only() {
        let mut texts = Texts::default();
        *texts.slot(Selection::Primary) = Some("p".into());
        assert_eq!(texts.held(Selection::Primary), Some("p"));
        assert_eq!(texts.held(Selection::Clipboard), None);
        *texts.slot(Selection::Clipboard) = Some("c".into());
        *texts.slot(Selection::Primary) = None;
        assert_eq!(texts.held(Selection::Clipboard), Some("c"));
        assert_eq!(texts.held(Selection::Primary), None);
    }

    #[test]
    fn a_clipboard_reading_and_exchange_are_recorded_by_kind() {
        assert_eq!(
            serde_json::to_value(Reading::Text("β".into())).unwrap(),
            serde_json::json!({"text":"β"})
        );
        assert_eq!(
            serde_json::to_value(Reading::Unanswered).unwrap(),
            "unanswered"
        );
        assert_eq!(
            serde_json::to_value(Exchange::Refused {
                selection: Some(Selection::Clipboard),
                target: "STRING".into(),
                requestor: 7,
                at: 9,
            })
            .unwrap(),
            serde_json::json!({"exchange":"refused","selection":"clipboard","target":"STRING","requestor":7,"at":9})
        );
        assert_eq!(
            serde_json::to_value(Exchange::Cleared {
                selection: Some(Selection::Primary),
                at: 3,
            })
            .unwrap(),
            serde_json::json!({"exchange":"cleared","selection":"primary","at":3})
        );
    }
}
