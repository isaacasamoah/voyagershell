use crate::panels;
use voyager_contract::{
    Action, Content, ContentDestination, ContentId, Context, Fleet, FleetId, Layout, PanelOwner,
    PlacementId, PortalLayout, RenameTarget, Split, Vessel, Voyage, VoyageId, WorkspaceView,
};

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
                vessels: vec![panel],
                maximized_placement: None,
            };
            self.layout.home = Some(Voyage {
                id,
                name: "Home".into(),
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
    ) -> Result<Vessel, String> {
        let content = ContentId(self.id("content")?);
        let placement = PlacementId(self.id("placement")?);
        self.layout.contents.push(Content {
            id: content.clone(),
            type_id,
            cwd,
            backend: None,
            configuration: None,
            start_pending: None,
            launch,
            shell_intent: None,
        });
        Ok(Vessel {
            id: placement,
            content,
            name,
            name_origin: voyager_contract::NameOrigin::Automatic,
            hidden: false,
        })
    }

    fn fleet(&mut self, name: String, cwd: String) -> Result<Fleet, String> {
        let placement = self.placement(cwd, "terminal".into(), "Terminal 1".into(), None)?;
        Ok(Fleet {
            id: FleetId(self.id("fleet")?),
            name,
            closed: false,
            root: Some(Split::Leaf {
                placement: placement.id.clone(),
            }),
            vessels: vec![placement],
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

    pub fn start_new_shell(
        &mut self,
        id: &ContentId,
        backend: &voyager_contract::CoreTerminalId,
        intent: &str,
    ) -> Result<(), String> {
        let content = self
            .layout
            .contents
            .iter_mut()
            .find(|item| &item.id == id)
            .ok_or("Terminal content not found")?;
        if content.type_id != "terminal"
            || content.backend.as_ref() != Some(backend)
            || content.start_pending.is_some()
        {
            return Err("The ended terminal binding changed or is unconfirmed".into());
        }
        content.launch = Some(voyager_contract::launch::Launch::Terminal);
        content.shell_intent = Some(intent.into());
        Ok(())
    }

    pub fn apply(&mut self, action: Action) -> Result<(), String> {
        match action {
            Action::Inspect => (),
            Action::StartNewShell { .. } => {
                return Err("New shell intent requires terminal owner validation".into());
            }
            Action::RemoveContentPackage { .. } | Action::RestoreContentPackage { .. } => {
                return Err("Content package operations require the application owner".into());
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
                let fleet = self.fleet("Fleet 1".into(), cwd.clone())?;
                self.layout.selected_voyage = Some(id.clone());
                self.layout.selected_fleet = Some(fleet.id.clone());
                self.layout.view = WorkspaceView::Fleet;
                self.layout.voyages.push(Voyage {
                    id,
                    name,
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
            }
            Action::CreateFleet { voyage, name } => {
                let index = self
                    .layout
                    .voyages
                    .iter()
                    .position(|v| v.id == voyage)
                    .ok_or("Voyage not found")?;
                if name.trim().is_empty() {
                    return Err("A Fleet needs a name".into());
                }
                let cwd = self.layout.voyages[index]
                    .fleets
                    .first()
                    .and_then(|f| f.vessels.first())
                    .and_then(|v| self.layout.contents.iter().find(|c| c.id == v.content))
                    .map(|c| c.cwd.clone())
                    .ok_or("Voyage has no working directory")?;
                let fleet = self.fleet(name, cwd)?;
                self.layout.selected_voyage = Some(voyage);
                self.layout.selected_fleet = Some(fleet.id.clone());
                self.layout.view = WorkspaceView::Fleet;
                self.layout.voyages[index].fleets.push(fleet);
            }
            Action::CreateFleetWithContent {
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
                if name.trim().is_empty() || !crate::content::supports_type(&type_id) {
                    return Err("Fleet name or content type is invalid".into());
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
                    vessels: vec![panel],
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
                self.layout.selected_fleet = voyage
                    .fleets
                    .iter()
                    .find(|fleet| !fleet.closed)
                    .map(|f| f.id.clone());
                self.layout.selected_voyage = Some(id);
                self.layout.view = WorkspaceView::Fleet;
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
                                voyage
                                    .fleets
                                    .iter()
                                    .find(|fleet| !fleet.closed)
                                    .map(|fleet| fleet.id.clone()),
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
                self.layout.selected_fleet = voyage
                    .fleets
                    .iter()
                    .find(|fleet| !fleet.closed)
                    .map(|fleet| fleet.id.clone());
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
            Action::CreateContent {
                type_id,
                destination: ContentDestination::Panel { owner, insertion },
                launch,
            } => {
                if !crate::content::supports_type(&type_id) {
                    return Err("Unsupported content type".into());
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
                panels::insert(
                    panels::group_mut(&mut self.layout, &owner)?,
                    &owner,
                    insertion,
                    panel,
                )?;
                if let PanelOwner::Portals { voyage } = owner {
                    self.layout
                        .containers_mut()
                        .find(|item| item.id == voyage)
                        .and_then(|item| item.portal_layout.as_mut())
                        .ok_or("Portal arrangement not found")?
                        .visible = true;
                }
            }
            Action::Rename { target, name } => {
                let name = name.trim().to_owned();
                if name.is_empty() || name.len() > 128 {
                    return Err("A name must contain 1 to 128 bytes".into());
                }
                match target {
                    RenameTarget::Voyage { id } => {
                        self.layout
                            .containers_mut()
                            .find(|item| item.id == id)
                            .ok_or("Voyage not found")?
                            .name = name
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
                            .flat_map(|fleet| &mut fleet.vessels)
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
            Action::Dock { context } => {
                let exists = match &context {
                    Context::Workspace => true,
                    Context::Voyage { id } => self.layout.containers().any(|v| &v.id == id),
                    Context::Fleet { id } => self
                        .layout
                        .containers()
                        .any(|voyage| voyage.fleets.iter().any(|fleet| &fleet.id == id)),
                    Context::Vessel { id } => self
                        .layout
                        .containers()
                        .flat_map(|v| &v.fleets)
                        .flat_map(|f| &f.vessels)
                        .any(|p| &p.id == id),
                    Context::Portal { id } => self
                        .layout
                        .containers()
                        .flat_map(|v| &v.portals)
                        .any(|p| &p.id == id),
                };
                if !exists {
                    return Err("Dock target not found".into());
                }
                self.layout.context = context;
            }
            action @ (Action::ResizePanelSplit { .. }
            | Action::MovePanel { .. }
            | Action::SetPanelMaximized { .. }
            | Action::SetPanelHidden { .. }
            | Action::RemovePanel { .. }
            | Action::RevealPanel { .. }
            | Action::ReopenPanel { .. }
            | Action::SavePanelLayout { .. }
            | Action::LoadPanelLayout { .. }
            | Action::RemovePanelLayout { .. }
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

fn reorder<T>(items: &mut Vec<T>, source: usize, destination: usize, before: bool) {
    if source == destination {
        return;
    }
    let item = items.remove(source);
    let destination = destination - usize::from(source < destination);
    items.insert(destination + usize::from(!before), item);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_agents_seed_only_a_previously_absent_home() {
        let initial = Model::prepare(Layout::default(), "/tmp").unwrap();
        let home = initial.home.as_ref().unwrap();
        let panel = &home.fleets[0].vessels[0];
        let content = initial
            .contents
            .iter()
            .find(|item| item.id == panel.content)
            .unwrap();
        assert_eq!(content.type_id, "agents");
        assert_eq!(panel.name, "Agents 1");
        assert!(content.backend.is_none());
        assert!(content.launch.is_none());
        let mut model = Model { layout: initial };
        let id = model.layout.home.as_ref().unwrap().fleets[0].vessels[0]
            .id
            .clone();
        model.apply(Action::RemovePanel { id }).unwrap();
        let empty = model.layout.clone();
        assert_eq!(Model::prepare(empty.clone(), "/elsewhere").unwrap(), empty);
        model.layout.home.as_mut().unwrap().fleets[0].name = "My landing".into();
        let customized = model.layout;
        assert_eq!(
            Model::prepare(customized.clone(), "/elsewhere").unwrap(),
            customized
        );
    }
}
