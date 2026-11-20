use super::terminal_start::{CreatedTerminal, Owned, start_terminal};
use super::{Owner, Start};
use crate::core::Error;
use crate::layout_store::{rejected, save};
use crate::voyager_start::{self, Standing};
use crate::workspace::Model;
use std::sync::Arc;
use voyager_contract::{CoreTerminalId, TerminalRequest, Vessel};

impl Owner {
    pub(super) fn bind_voyager(&self, terminal: &CoreTerminalId) {
        if let Err(error) = self.sockets.binding().bind(terminal.clone()) {
            self.say(format!("Voyager's binding was not written: {error}"));
        }
    }

    fn say(&self, message: String) {
        if let Ok(mut notice) = self.client.placement_notice.lock() {
            *notice = Some(message);
        }
    }

    pub(super) fn voyager(&mut self) {
        if self.voyager_started
            || self.launches.is_none()
            || !matches!(self.start, Start::Created | Start::Ready)
        {
            return;
        }
        self.voyager_started = true;
        self.sockets.binding().forget();
        if let Err(error) = self.bring_up_voyager() {
            self.say(format!("Voyager was not started: {error:?}"));
        }
    }

    fn bring_up_voyager(&mut self) -> Result<(), Error> {
        let core = self.core.as_mut().map_err(|error| error.clone())?;
        let mut candidate = Model {
            layout: (*self.layout).clone(),
        };
        if candidate
            .ensure_voyager(
                &self.cwd,
                crate::focus_hook::saved_launch(&voyager_start::new_session()),
            )
            .map_err(rejected)?
        {
            self.version = save(core, &candidate.layout, self.version)?;
            self.layout = Arc::new(candidate.layout);
        }
        let vessel: Vessel = self
            .layout
            .vessels
            .iter()
            .find(|item| item.is_voyager())
            .cloned()
            .ok_or_else(|| rejected("Voyager's Vessel is missing".into()))?;
        if let Some(operation) = &vessel.start_pending {
            return Err(Error::Uncertain(format!(
                "Voyager start {operation} is unconfirmed; inspect Core terminals with voyager-operation={operation}. No start was repeated"
            )));
        }
        let session = crate::focus_hook::session(&vessel)
            .ok_or_else(|| rejected("Voyager's saved launch lost its session".into()))?
            .to_owned();
        let request_id = format!("voyager-{}", self.client.request_id());
        let created = match &vessel.backend {
            None => CreatedTerminal {
                id: vessel.id.clone(),
                launch: vessel.launch.clone().unwrap_or_default(),
                backend: None,
                shell_intent: None,
            },
            Some(backend) => {
                match voyager_start::standing(core.terminal_get(&backend.0), &session) {
                    Standing::Running => {
                        let backend = backend.clone();
                        self.bind_voyager(&backend);
                        self.live_bindings.push(backend);
                        return Ok(());
                    }
                    Standing::Unread(error) => return Err(error),
                    Standing::Absent => {}
                }
                let mut pending = Model {
                    layout: (*self.layout).clone(),
                };
                pending
                    .start_new_shell(&vessel.id, backend, &request_id)
                    .map_err(rejected)?;
                self.version = save(core, &pending.layout, self.version)?;
                self.layout = Arc::new(pending.layout);
                CreatedTerminal {
                    id: vessel.id.clone(),
                    launch: vessel.launch.clone().unwrap_or_default(),
                    backend: Some(backend.clone()),
                    shell_intent: Some(request_id.clone()),
                }
            }
        };
        self.created_vessels.push(created);
        let request = TerminalRequest {
            request_id,
            vessel_id: vessel.id.clone(),
            expected_version: self.version.structure,
        };
        let (terminal, _) = start_terminal(
            &mut Owned {
                core,
                layout: &mut self.layout,
                version: &mut self.version,
                fresh: &mut self.fresh,
                unconfirmed: &mut self.unconfirmed,
                created_vessels: &mut self.created_vessels,
                launches: self.launches.as_deref(),
            },
            &request,
        )?;
        let started = CoreTerminalId(terminal.address);
        self.bind_voyager(&started);
        self.live_bindings.push(started);
        Ok(())
    }
}
