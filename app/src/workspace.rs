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
            let fleet = Fleet {
                id: FleetId(self.id("home-fleet")?),
                name: "Home".into(),
                vessels: Vec::new(),
                root: None,
                maximized_placement: None,
            };
            self.layout.home = Some(Voyage {
                id,
                name: "Home".into(),
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
            hidden: false,
        })
    }

    fn fleet(&mut self, name: String, cwd: String) -> Result<Fleet, String> {
        let placement = self.placement(cwd, "terminal".into(), "Terminal 1".into(), None)?;
        Ok(Fleet {
            id: FleetId(self.id("fleet")?),
            name,
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
                    fleets: vec![fleet],
                    portals: vec![],
                    portal_layout: Some(PortalLayout::default()),
                    cwd: Some(cwd.clone()),
                });
                self.ensure_home(&cwd)?;
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
            Action::SelectVoyage { id } => {
                let voyage = self
                    .layout
                    .voyages
                    .iter()
                    .find(|v| v.id == id)
                    .ok_or("Voyage not found")?;
                self.layout.selected_fleet = voyage.fleets.first().map(|f| f.id.clone());
                self.layout.selected_voyage = Some(id);
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
                        self.layout
                            .containers_mut()
                            .flat_map(|voyage| &mut voyage.fleets)
                            .flat_map(|fleet| &mut fleet.vessels)
                            .find(|item| item.id == id)
                            .ok_or("Vessel not found")?
                            .name = name
                    }
                    RenameTarget::Portal { id } => {
                        self.layout
                            .containers_mut()
                            .flat_map(|voyage| &mut voyage.portals)
                            .find(|item| item.id == id)
                            .ok_or("Portal not found")?
                            .name = name
                    }
                }
            }
            Action::SelectFleet { id } => {
                let (v, _) = self.fleet_index(&id).ok_or("Fleet not found")?;
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
