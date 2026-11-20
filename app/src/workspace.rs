use crate::panels;
use voyager_contract::{
    Action, ContentDestination, Context, CoreTerminalId, Fleet, FleetId, LastUsed, LastVessel,
    Layout, Placement, PlacementId, PlacementInsertion, PlacementOwner, PortalLayout, RenameTarget,
    Split, Vessel, VesselId, Voyage, VoyageId, WorkspaceView, launch::Launch,
};

pub(crate) const VOYAGER_VESSEL: &str = "voyager";

pub(crate) fn is_voyager(vessel: &Vessel) -> bool {
    vessel.id.0 == VOYAGER_VESSEL
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum FirstVessel {
    DefaultTerminal,
    Labelled,
}

enum Landing {
    Home,
    Voyage {
        voyage: VoyageId,
    },
    Fleet {
        voyage: VoyageId,
        fleet: FleetId,
        focus: Option<PlacementId>,
    },
}

#[derive(Default)]
pub struct Model {
    pub layout: Layout,
}

impl Model {
    fn ensure_home(&mut self, cwd: &str) -> Result<(), String> {
        if self.layout.home.is_none() {
            let id = VoyageId(self.id("home-voyage")?);
            let panel = self.placement(cwd.into(), "agents".into(), "Agents 1".into(), None)?;
            let fleet = Fleet {
                id: FleetId(self.id("home-fleet")?),
                name: "Home".into(),
                closed: false,
                root: Some(Split::Leaf {
                    placement: panel.id.clone(),
                }),
                placements: vec![panel],
                maximized_placement: None,
            };
            self.layout.home = Some(Voyage {
                id,
                name: "Home".into(),
                name_origin: voyager_contract::NameOrigin::Deliberate,
                primary_placement: None,
                closed: false,
                closed_order: 0,
                fleets: vec![fleet],
                portals: Vec::new(),
                portal_layout: Some(PortalLayout::default()),
                cwd: Some(cwd.into()),
            });
        }
        Ok(())
    }

    pub(crate) fn prepare(layout: Layout, cwd: &str) -> Result<Layout, String> {
        let mut model = Self { layout };
        panels::normalize(&mut model.layout)?;
        model.ensure_home(cwd)?;
        if model
            .layout
            .home
            .as_ref()
            .is_some_and(|home| home.fleets.len() != 1)
        {
            return Err("Home requires one primary arrangement".into());
        }
        Ok(model.layout)
    }

    fn id(&mut self, prefix: &str) -> Result<String, String> {
        self.layout.next_id = self
            .layout
            .next_id
            .checked_add(1)
            .ok_or("Workspace identity exhausted")?;
        Ok(format!("{prefix}-{}", self.layout.next_id))
    }

    fn placement(
        &mut self,
        cwd: String,
        type_id: String,
        name: String,
        launch: Option<voyager_contract::launch::Launch>,
    ) -> Result<Placement, String> {
        let content = VesselId(self.id("content")?);
        let placement = PlacementId(self.id("placement")?);
        self.layout.vessels.push(Vessel {
            id: content.clone(),
            type_id,
            cwd,
            backend: None,
            configuration: None,
            start_pending: None,
            launch,
            shell_intent: None,
            adopted: false,
        });
        Ok(Placement {
            id: placement,
            vessel: content,
            name,
            name_origin: voyager_contract::NameOrigin::Automatic,
            hidden: false,
        })
    }

    fn fleet(&mut self, name: String, cwd: Option<String>) -> Result<Fleet, String> {
        let placement = cwd
            .map(|cwd| self.placement(cwd, "terminal".into(), "Terminal 1".into(), None))
            .transpose()?;
        Ok(Fleet {
            id: FleetId(self.id("fleet")?),
            name,
            closed: false,
            root: placement.as_ref().map(|placement| Split::Leaf {
                placement: placement.id.clone(),
            }),
            placements: placement.into_iter().collect(),
            maximized_placement: None,
        })
    }

    fn fleet_index(&self, id: &FleetId) -> Option<(usize, usize)> {
        self.layout
            .voyages
            .iter()
            .enumerate()
            .find_map(|(v, voyage)| {
                voyage
                    .fleets
                    .iter()
                    .position(|fleet| &fleet.id == id)
                    .map(|f| (v, f))
            })
    }

    pub(crate) fn ensure_voyager(&mut self, cwd: &str, launch: Launch) -> Result<bool, String> {
        if self.layout.vessels.iter().any(is_voyager) {
            return Ok(false);
        }
        let home = self
            .layout
            .home
            .as_ref()
            .map(|home| home.id.clone())
            .ok_or("Home is missing")?;
        let placement = PlacementId(self.id("placement")?);
        let vessel = VesselId(VOYAGER_VESSEL.into());
        self.layout.vessels.push(Vessel {
            id: vessel.clone(),
            type_id: "terminal".into(),
            cwd: cwd.into(),
            backend: None,
            configuration: None,
            start_pending: None,
            launch: Some(launch),
            shell_intent: None,
            adopted: false,
        });
        self.insert(
            &PlacementOwner::Portals { voyage: home },
            PlacementInsertion::Empty,
            Placement {
                id: placement,
                vessel,
                name: "Voyager".into(),
                name_origin: voyager_contract::NameOrigin::Deliberate,
                hidden: false,
            },
        )?;
        Ok(true)
    }

    pub fn start_new_shell(
        &mut self,
        id: &VesselId,
        backend: &voyager_contract::CoreTerminalId,
        intent: &str,
    ) -> Result<(), String> {
        let content = self
            .layout
            .vessels
            .iter_mut()
            .find(|item| &item.id == id)
            .ok_or("Terminal content not found")?;
        if content.type_id != "terminal"
            || content.backend.as_ref() != Some(backend)
            || content.start_pending.is_some()
        {
            return Err("The ended terminal binding changed or is unconfirmed".into());
        }
        if !is_voyager(content) {
            content.launch = Some(voyager_contract::launch::Launch::Terminal);
        }
        content.shell_intent = Some(intent.into());
        Ok(())
    }

    fn insert(
        &mut self,
        owner: &PlacementOwner,
        insertion: PlacementInsertion,
        panel: Placement,
    ) -> Result<(), String> {
        panels::insert(
            panels::group_mut(&mut self.layout, owner)?,
            owner,
            insertion,
            panel,
        )?;
        if let PlacementOwner::Portals { voyage } = owner {
            self.layout
                .containers_mut()
                .find(|item| &item.id == voyage)
                .and_then(|item| item.portal_layout.as_mut())
                .ok_or("Portal arrangement not found")?
                .visible = true;
        }
        Ok(())
    }

    pub(crate) fn adopt(
        &mut self,
        owner: &PlacementOwner,
        terminal: &CoreTerminalId,
        cwd: String,
        launch: Launch,
        core_name: Option<String>,
    ) -> Result<bool, String> {
        if self
            .layout
            .vessels
            .iter()
            .any(|content| content.backend.as_ref() == Some(terminal))
        {
            return Ok(false);
        }
        let open = self.layout.containers().any(|voyage| {
            !voyage.closed
                && match owner {
                    PlacementOwner::Fleet { id } => voyage
                        .fleets
                        .iter()
                        .any(|fleet| &fleet.id == id && !fleet.closed),
                    PlacementOwner::Portals { voyage: id } => &voyage.id == id,
                }
        });
        if !open {
            return Err(match owner {
                PlacementOwner::Fleet { id } => format!("no open Fleet {}", id.0),
                PlacementOwner::Portals { voyage } => format!("no open Voyage {}", voyage.0),
            });
        }
        let members = panels::group(&self.layout, owner)?.members;
        let core_name = core_name
            .filter(|name| !name.is_empty() && members.iter().all(|panel| &panel.name != name));
        let named = core_name.is_some();
        let name = core_name.unwrap_or_else(|| panels::default_name(members, "terminal"));
        let mut panel = self.placement(cwd, "terminal".into(), name, Some(launch))?;
        if named {
            panel.name_origin = voyager_contract::NameOrigin::Deliberate;
        }
        if let Some(content) = self.layout.vessels.last_mut() {
            content.backend = Some(terminal.clone());
            content.adopted = true;
        }
        self.insert(owner, PlacementInsertion::Empty, panel)?;
        Ok(true)
    }

    pub(crate) fn apply_from(
        &mut self,
        program: Option<&VesselId>,
        action: Action,
    ) -> Result<(), String> {
        match action {
            Action::CreateFleet { voyage, name } if program.is_some() => {
                self.add_fleet(voyage, name, FirstVessel::Labelled)?;
                self.remember_fleet();
                Ok(())
            }
            action => self.apply(action),
        }
    }

    fn add_fleet(
        &mut self,
        voyage: VoyageId,
        name: String,
        first: FirstVessel,
    ) -> Result<(), String> {
        let index = self
            .layout
            .voyages
            .iter()
            .position(|v| v.id == voyage)
            .ok_or("Voyage not found")?;
        if name.trim().is_empty() {
            return Err("A Fleet needs a name".into());
        }
        let cwd = match first {
            FirstVessel::Labelled => None,
            FirstVessel::DefaultTerminal => Some(
                self.layout.voyages[index]
                    .fleets
                    .first()
                    .and_then(|f| f.placements.first())
                    .and_then(|v| self.layout.vessels.iter().find(|c| c.id == v.vessel))
                    .map(|c| c.cwd.clone())
                    .ok_or("Voyage has no working directory")?,
            ),
        };
        let fleet = self.fleet(name, cwd)?;
        self.layout.selected_voyage = Some(voyage);
        self.layout.selected_fleet = Some(fleet.id.clone());
        self.layout.view = WorkspaceView::Fleet;
        self.layout.voyages[index].fleets.push(fleet);
        Ok(())
    }

    pub fn apply(&mut self, action: Action) -> Result<(), String> {
        self.change(action)?;
        self.remember_fleet();
        Ok(())
    }

    fn remember_fleet(&mut self) {
        let (WorkspaceView::Fleet, Some(voyage), Some(fleet)) = (
            &self.layout.view,
            &self.layout.selected_voyage,
            &self.layout.selected_fleet,
        ) else {
            return;
        };
        match self
            .layout
            .navigation
            .iter_mut()
            .find(|entry| &entry.voyage == voyage)
        {
            Some(entry) => entry.fleet = fleet.clone(),
            None => self.layout.navigation.push(LastUsed {
                voyage: voyage.clone(),
                fleet: fleet.clone(),
            }),
        }
    }

    fn remember_vessel(&mut self, fleet: &FleetId, vessel: PlacementId) {
        match self
            .layout
            .last_vessels
            .iter_mut()
            .find(|entry| &entry.fleet == fleet)
        {
            Some(entry) => entry.vessel = vessel,
            None => self.layout.last_vessels.push(LastVessel {
                fleet: fleet.clone(),
                vessel,
            }),
        }
    }

    fn focus_vessel(&mut self, id: PlacementId) -> Result<(), String> {
        let voyage = self
            .layout
            .voyages
            .iter()
            .find(|voyage| Some(&voyage.id) == self.layout.selected_voyage.as_ref())
            .filter(|_| self.layout.view == WorkspaceView::Fleet)
            .ok_or("Only a Vessel in an open Voyage is remembered")?;
        let fleet = self
            .layout
            .selected_fleet
            .clone()
            .ok_or("Only a Vessel in an open Voyage is remembered")?;
        let shown = voyage
            .fleets
            .iter()
            .filter(|candidate| candidate.id == fleet)
            .flat_map(|candidate| &candidate.placements)
            .chain(&voyage.portals)
            .any(|placement| placement.id == id);
        if !shown {
            return Err("The Vessel is not in the open Fleet or its Portals".into());
        }
        self.remember_vessel(&fleet, id);
        Ok(())
    }

    fn dock(&mut self, context: Context) -> Result<(), String> {
        let landing = self.landing(&context)?;
        match landing {
            Landing::Home => self.layout.view = WorkspaceView::Home,
            Landing::Voyage { voyage } => {
                let found = self
                    .layout
                    .voyages
                    .iter()
                    .find(|candidate| candidate.id == voyage)
                    .ok_or("Dock target not found")?;
                self.layout.selected_fleet = opening_fleet(&self.layout.navigation, found);
                self.layout.selected_voyage = Some(voyage);
                self.layout.view = WorkspaceView::Fleet;
            }
            Landing::Fleet {
                voyage,
                fleet,
                focus,
            } => {
                self.layout.selected_voyage = Some(voyage);
                self.layout.selected_fleet = Some(fleet.clone());
                self.layout.view = WorkspaceView::Fleet;
                if let Some(vessel) = focus {
                    self.remember_vessel(&fleet, vessel);
                }
            }
        }
        self.layout.context = context;
        Ok(())
    }

    fn landing(&self, context: &Context) -> Result<Landing, String> {
        let home = |voyage: &VoyageId| self.layout.home.as_ref().is_some_and(|h| &h.id == voyage);
        let open = |voyage: &Voyage| {
            if voyage.closed {
                Err(format!(
                    "{} is closed; reopen it before docking",
                    voyage.name
                ))
            } else {
                Ok(())
            }
        };
        match context {
            Context::Workspace => Ok(Landing::Home),
            Context::Voyage { id } => {
                let voyage = self
                    .layout
                    .containers()
                    .find(|voyage| &voyage.id == id)
                    .ok_or("Dock target not found")?;
                if home(id) {
                    return Ok(Landing::Home);
                }
                open(voyage)?;
                Ok(Landing::Voyage { voyage: id.clone() })
            }
            Context::Fleet { id } => {
                let (voyage, fleet) = self
                    .layout
                    .containers()
                    .find_map(|voyage| {
                        voyage
                            .fleets
                            .iter()
                            .find(|fleet| &fleet.id == id)
                            .map(|fleet| (voyage, fleet))
                    })
                    .ok_or("Dock target not found")?;
                if home(&voyage.id) {
                    return Ok(Landing::Home);
                }
                open(voyage)?;
                if fleet.closed {
                    return Err(format!(
                        "{} is closed; reopen it before docking",
                        fleet.name
                    ));
                }
                Ok(Landing::Fleet {
                    voyage: voyage.id.clone(),
                    fleet: fleet.id.clone(),
                    focus: None,
                })
            }
            Context::Vessel { id } => {
                let (voyage, fleet, placement) = self
                    .layout
                    .containers()
                    .flat_map(|voyage| voyage.fleets.iter().map(move |fleet| (voyage, fleet)))
                    .find_map(|(voyage, fleet)| {
                        fleet
                            .placements
                            .iter()
                            .find(|placement| &placement.id == id)
                            .map(|placement| (voyage, fleet, placement))
                    })
                    .ok_or("Dock target not found")?;
                if home(&voyage.id) {
                    return Ok(Landing::Home);
                }
                open(voyage)?;
                if fleet.closed {
                    return Err(format!(
                        "{} is closed; reopen it before docking",
                        fleet.name
                    ));
                }
                Ok(Landing::Fleet {
                    voyage: voyage.id.clone(),
                    fleet: fleet.id.clone(),
                    focus: (!placement.hidden).then(|| placement.id.clone()),
                })
            }
            Context::Portal { id } => {
                let (voyage, portal) = self
                    .layout
                    .containers()
                    .find_map(|voyage| {
                        voyage
                            .portals
                            .iter()
                            .find(|portal| &portal.id == id)
                            .map(|portal| (voyage, portal))
                    })
                    .ok_or("Dock target not found")?;
                if home(&voyage.id) {
                    return Ok(Landing::Home);
                }
                open(voyage)?;
                let shown = !portal.hidden
                    && voyage
                        .portal_layout
                        .as_ref()
                        .is_some_and(|layout| layout.visible);
                match opening_fleet(&self.layout.navigation, voyage) {
                    Some(fleet) => Ok(Landing::Fleet {
                        voyage: voyage.id.clone(),
                        fleet,
                        focus: shown.then(|| portal.id.clone()),
                    }),
                    None => Ok(Landing::Voyage {
                        voyage: voyage.id.clone(),
                    }),
                }
            }
        }
    }

    fn change(&mut self, action: Action) -> Result<(), String> {
        match action {
            Action::Inspect => (),
            Action::StartNewShell { .. } => {
                return Err("New shell intent requires terminal owner validation".into());
            }
            Action::RemoveVesselPackage { .. } | Action::RestoreVesselPackage { .. } => {
                return Err("Vessel package operations require the application owner".into());
            }
            Action::Home => self.layout.view = WorkspaceView::Home,
            Action::UpdateCanvas { canvas } => {
                crate::canvas::validate(&canvas)?;
                self.layout.canvas = canvas;
            }
            Action::SetSidebar { collapsed } => self.layout.canvas.sidebar_collapsed = collapsed,
            Action::CreateVoyage { name, cwd } => {
                if name.trim().is_empty() || !std::path::Path::new(&cwd).is_absolute() {
                    return Err("A Voyage needs a name and absolute working directory".into());
                }
                let id = VoyageId(self.id("voyage")?);
                let fleet = self.fleet("Fleet 1".into(), Some(cwd.clone()))?;
                self.layout.selected_voyage = Some(id.clone());
                self.layout.selected_fleet = Some(fleet.id.clone());
                self.layout.view = WorkspaceView::Fleet;
                self.layout.voyages.push(Voyage {
                    id,
                    name,
                    name_origin: voyager_contract::NameOrigin::Deliberate,
                    primary_placement: fleet.placements.first().map(|panel| panel.id.clone()),
                    closed: false,
                    closed_order: 0,
                    fleets: vec![fleet],
                    portals: vec![],
                    portal_layout: Some(PortalLayout::default()),
                    cwd: Some(cwd.clone()),
                });
                self.ensure_home(&cwd)?;
            }
            Action::CreateVoyageFromSource { source } => {
                let cwd = match source {
                    voyager_contract::DirectorySource::Live { cwd, .. }
                    | voyager_contract::DirectorySource::Voyage { cwd, .. }
                    | voyager_contract::DirectorySource::Starting { cwd, .. } => cwd,
                };
                let name = std::path::Path::new(&cwd)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("/")
                    .to_owned();
                self.apply(Action::CreateVoyage { name, cwd })?;
                if let Some(voyage) = self.layout.voyages.last_mut() {
                    voyage.name_origin = voyager_contract::NameOrigin::Automatic;
                }
            }
            Action::CreateFleet { voyage, name } => {
                self.add_fleet(voyage, name, FirstVessel::DefaultTerminal)?;
            }
            Action::CreateFleetWithVessel {
                voyage,
                name,
                source,
                type_id,
                launch,
            } => {
                if self.layout.view != WorkspaceView::Fleet
                    || self.layout.selected_voyage.as_ref() != Some(&voyage)
                {
                    return Err("Selected Voyage changed; reopen the choice".into());
                }
                if name.trim().is_empty() || !crate::content::valid_type_id(&type_id) {
                    return Err("Fleet name or Vessel type is invalid".into());
                }
                if let Some(launch) = &launch {
                    if type_id != "terminal" {
                        return Err("Only terminal content accepts a program launch".into());
                    }
                    crate::launch::argv(launch)?;
                }
                let cwd = match source {
                    voyager_contract::DirectorySource::Live { cwd, .. }
                    | voyager_contract::DirectorySource::Voyage { cwd, .. }
                    | voyager_contract::DirectorySource::Starting { cwd, .. } => cwd,
                };
                if !std::path::Path::new(&cwd).is_absolute() {
                    return Err("Fleet working directory must be absolute".into());
                }
                let panel_name = panels::default_name(&[], &type_id);
                let panel = self.placement(cwd, type_id, panel_name, launch)?;
                let fleet = Fleet {
                    id: FleetId(self.id("fleet")?),
                    name,
                    closed: false,
                    root: Some(Split::Leaf {
                        placement: panel.id.clone(),
                    }),
                    placements: vec![panel],
                    maximized_placement: None,
                };
                self.layout.selected_fleet = Some(fleet.id.clone());
                self.layout
                    .voyages
                    .iter_mut()
                    .find(|item| item.id == voyage)
                    .ok_or("Voyage not found")?
                    .fleets
                    .push(fleet);
            }
            Action::SelectVoyage { id } => {
                let voyage = self
                    .layout
                    .voyages
                    .iter()
                    .find(|v| v.id == id)
                    .ok_or("Voyage not found")?;
                if voyage.closed {
                    return Err("Voyage is closed".into());
                }
                self.layout.selected_fleet = opening_fleet(&self.layout.navigation, voyage);
                self.layout.selected_voyage = Some(id);
                self.layout.view = WorkspaceView::Fleet;
            }
            Action::ConfirmVoyageClose { .. } | Action::CancelVoyageClose { .. } => {
                return Err("Voyage shutdown confirmation belongs to the application owner".into());
            }
            Action::CloseVoyage { id } => {
                let index = self
                    .layout
                    .voyages
                    .iter()
                    .position(|voyage| voyage.id == id)
                    .ok_or("Voyage not found")?;
                if self.layout.voyages[index].closed {
                    return Err("Voyage is already closed".into());
                }
                let order = self
                    .layout
                    .voyages
                    .iter()
                    .map(|voyage| voyage.closed_order)
                    .max()
                    .unwrap_or(0)
                    .checked_add(1)
                    .ok_or("Recent Voyage order exhausted")?;
                self.layout.voyages[index].closed_order = order;
                self.layout.voyages[index].closed = true;
                if self.layout.view == WorkspaceView::Fleet
                    && self.layout.selected_voyage.as_ref() == Some(&id)
                {
                    let next = self
                        .layout
                        .voyages
                        .iter()
                        .enumerate()
                        .filter(|(_, voyage)| !voyage.closed)
                        .min_by_key(|(other, _)| other.abs_diff(index))
                        .map(|(_, voyage)| {
                            (
                                voyage.id.clone(),
                                opening_fleet(&self.layout.navigation, voyage),
                            )
                        });
                    if let Some((voyage, fleet)) = next {
                        self.layout.selected_voyage = Some(voyage);
                        self.layout.selected_fleet = fleet;
                    } else {
                        self.layout.selected_voyage = None;
                        self.layout.selected_fleet = None;
                        self.layout.view = WorkspaceView::Home;
                    }
                }
            }
            Action::ReopenVoyage { id } => {
                let voyage = self
                    .layout
                    .voyages
                    .iter_mut()
                    .find(|voyage| voyage.id == id)
                    .ok_or("Voyage not found")?;
                if !voyage.closed {
                    return Err("Voyage is already open".into());
                }
                voyage.closed = false;
                self.layout.selected_fleet = opening_fleet(&self.layout.navigation, voyage);
                self.layout.selected_voyage = Some(id);
                self.layout.view = WorkspaceView::Fleet;
            }
            Action::CloseFleet { id } => {
                let (v, f) = self.fleet_index(&id).ok_or("Fleet not found")?;
                if self.layout.voyages[v].fleets[f].closed {
                    return Err("Fleet is already closed".into());
                }
                self.layout.voyages[v].fleets[f].closed = true;
                if self.layout.view == WorkspaceView::Fleet
                    && self.layout.selected_fleet.as_ref() == Some(&id)
                {
                    self.layout.selected_fleet = self.layout.voyages[v]
                        .fleets
                        .iter()
                        .enumerate()
                        .filter(|(_, fleet)| !fleet.closed)
                        .min_by_key(|(other, _)| other.abs_diff(f))
                        .map(|(_, fleet)| fleet.id.clone());
                }
            }
            Action::ReopenFleet { id } => {
                let (v, f) = self.fleet_index(&id).ok_or("Fleet not found")?;
                if !self.layout.voyages[v].fleets[f].closed {
                    return Err("Fleet is already open".into());
                }
                self.layout.voyages[v].closed = false;
                self.layout.voyages[v].fleets[f].closed = false;
                self.layout.selected_voyage = Some(self.layout.voyages[v].id.clone());
                self.layout.selected_fleet = Some(id);
                self.layout.view = WorkspaceView::Fleet;
            }
            Action::CreateVessel {
                type_id,
                destination: ContentDestination::Placement { owner, insertion },
                launch,
            } => {
                if !crate::content::valid_type_id(&type_id) {
                    return Err("Unsupported Vessel type".into());
                }
                if let Some(launch) = &launch {
                    if type_id != "terminal" {
                        return Err("Only terminal content accepts a program launch".into());
                    }
                    crate::launch::argv(launch)?;
                }
                let cwd = panels::insertion_cwd(&self.layout, &owner, &insertion)?;
                let name =
                    panels::default_name(panels::group(&self.layout, &owner)?.members, &type_id);
                let panel = self.placement(cwd, type_id, name, launch)?;
                self.insert(&owner, insertion, panel)?;
            }
            Action::Rename { target, name } => {
                let name = name.trim().to_owned();
                if name.is_empty() || name.len() > 128 {
                    return Err("A name must contain 1 to 128 bytes".into());
                }
                match target {
                    RenameTarget::Voyage { id } => {
                        let voyage = self
                            .layout
                            .containers_mut()
                            .find(|item| item.id == id)
                            .ok_or("Voyage not found")?;
                        voyage.name = name;
                        voyage.name_origin = voyager_contract::NameOrigin::Deliberate;
                    }
                    RenameTarget::Fleet { id } => {
                        let (v, f) = self.fleet_index(&id).ok_or("Fleet not found")?;
                        self.layout.voyages[v].fleets[f].name = name;
                    }
                    RenameTarget::Vessel { id } => {
                        let vessel = self
                            .layout
                            .containers_mut()
                            .flat_map(|voyage| &mut voyage.fleets)
                            .flat_map(|fleet| &mut fleet.placements)
                            .find(|item| item.id == id)
                            .ok_or("Vessel not found")?;
                        vessel.name = name;
                        vessel.name_origin = voyager_contract::NameOrigin::Deliberate;
                    }
                    RenameTarget::Portal { id } => {
                        let portal = self
                            .layout
                            .containers_mut()
                            .flat_map(|voyage| &mut voyage.portals)
                            .find(|item| item.id == id)
                            .ok_or("Portal not found")?;
                        portal.name = name;
                        portal.name_origin = voyager_contract::NameOrigin::Deliberate;
                    }
                }
            }
            Action::SelectFleet { id } => {
                let (v, f) = self.fleet_index(&id).ok_or("Fleet not found")?;
                if self.layout.voyages[v].closed || self.layout.voyages[v].fleets[f].closed {
                    return Err("Fleet is closed".into());
                }
                self.layout.selected_voyage = Some(self.layout.voyages[v].id.clone());
                self.layout.selected_fleet = Some(id);
                self.layout.view = WorkspaceView::Fleet;
            }
            Action::FocusVessel { id } => self.focus_vessel(id)?,
            Action::Dock { context } => self.dock(context)?,
            action @ (Action::ResizePlacementSplit { .. }
            | Action::MovePlacement { .. }
            | Action::SetPlacementMaximized { .. }
            | Action::SetPlacementHidden { .. }
            | Action::RemovePlacement { .. }
            | Action::RevealPlacement { .. }
            | Action::ReopenPlacement { .. }
            | Action::SaveArrangement { .. }
            | Action::LoadArrangement { .. }
            | Action::RemoveArrangement { .. }
            | Action::SetPortalPresentation { .. }) => panels::apply(&mut self.layout, action)?,
            Action::MoveVoyage { id, target, before } => {
                let source = self
                    .layout
                    .voyages
                    .iter()
                    .position(|item| item.id == id)
                    .ok_or("Voyage not found")?;
                let destination = self
                    .layout
                    .voyages
                    .iter()
                    .position(|item| item.id == target)
                    .ok_or("Destination Voyage not found")?;
                reorder(&mut self.layout.voyages, source, destination, before);
            }
            Action::MoveFleet { id, target, before } => {
                let voyage = self
                    .layout
                    .voyages
                    .iter_mut()
                    .find(|voyage| {
                        voyage.fleets.iter().any(|item| item.id == id)
                            && voyage.fleets.iter().any(|item| item.id == target)
                    })
                    .ok_or("Both Fleets must belong to the same Voyage")?;
                let source = voyage
                    .fleets
                    .iter()
                    .position(|item| item.id == id)
                    .ok_or("Fleet not found")?;
                let destination = voyage
                    .fleets
                    .iter()
                    .position(|item| item.id == target)
                    .ok_or("Destination Fleet not found")?;
                reorder(&mut voyage.fleets, source, destination, before);
            }
        }
        Ok(())
    }
}

pub(crate) fn open_checkout(layout: &Layout, checkout: &str) -> Result<Action, String> {
    let target = std::fs::canonicalize(checkout)
        .map_err(|error| format!("Checkout unavailable: {error}"))?;
    if let Some(voyage) = layout.voyages.iter().find(|voyage| {
        voyage
            .cwd
            .as_ref()
            .and_then(|cwd| std::fs::canonicalize(cwd).ok())
            .as_ref()
            == Some(&target)
    }) {
        return Ok(if voyage.closed {
            Action::ReopenVoyage {
                id: voyage.id.clone(),
            }
        } else {
            Action::SelectVoyage {
                id: voyage.id.clone(),
            }
        });
    }
    let name = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("/")
        .to_owned();
    let cwd = target
        .to_str()
        .ok_or("Checkout path is not UTF-8")?
        .to_owned();
    Ok(Action::CreateVoyage { name, cwd })
}

fn opening_fleet(navigation: &[LastUsed], voyage: &Voyage) -> Option<FleetId> {
    let open = |id: &FleetId| {
        voyage
            .fleets
            .iter()
            .any(|fleet| &fleet.id == id && !fleet.closed)
    };
    navigation
        .iter()
        .find(|entry| entry.voyage == voyage.id)
        .map(|entry| &entry.fleet)
        .filter(|id| open(id))
        .or_else(|| {
            voyage
                .fleets
                .iter()
                .find(|fleet| !fleet.closed)
                .map(|fleet| &fleet.id)
        })
        .cloned()
}

fn reorder<T>(items: &mut Vec<T>, source: usize, destination: usize, before: bool) {
    if source == destination {
        return;
    }
    let item = items.remove(source);
    let destination = destination - usize::from(source < destination);
    items.insert(destination + usize::from(!before), item);
}

#[cfg(test)]
mod tests;
