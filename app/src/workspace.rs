use voyager_contract::{
    Action, Axis, Content, ContentId, Context, Fleet, FleetId, Layout, PlacementId, Split, Vessel,
    Voyage, VoyageId,
};

#[derive(Default)]
pub struct Model {
    pub layout: Layout,
}

impl Model {
    fn id(&mut self, prefix: &str) -> Result<String, String> {
        self.layout.next_id = self
            .layout
            .next_id
            .checked_add(1)
            .ok_or("Workspace identity exhausted")?;
        Ok(format!("{prefix}-{}", self.layout.next_id))
    }

    fn fleet(&mut self, name: String, cwd: String) -> Result<Fleet, String> {
        let content = ContentId(self.id("content")?);
        let placement = PlacementId(self.id("placement")?);
        self.layout.contents.push(Content {
            id: content.clone(),
            type_id: "terminal".into(),
            cwd,
            backend: None,
        });
        Ok(Fleet {
            id: FleetId(self.id("fleet")?),
            name,
            vessels: vec![Vessel {
                id: placement.clone(),
                content,
            }],
            root: Split::Leaf { placement },
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

    pub fn apply(&mut self, action: Action) -> Result<(), String> {
        match action {
            Action::Inspect => (),
            Action::CreateVoyage { name, cwd } => {
                if name.trim().is_empty() || !std::path::Path::new(&cwd).is_absolute() {
                    return Err("A Voyage needs a name and absolute working directory".into());
                }
                let id = VoyageId(self.id("voyage")?);
                let fleet = self.fleet("Workbench".into(), cwd)?;
                self.layout.selected_voyage = Some(id.clone());
                self.layout.selected_fleet = Some(fleet.id.clone());
                self.layout.voyages.push(Voyage {
                    id,
                    name,
                    fleets: vec![fleet],
                    portals: vec![],
                });
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
            }
            Action::SelectFleet { id } => {
                let (v, _) = self.fleet_index(&id).ok_or("Fleet not found")?;
                self.layout.selected_voyage = Some(self.layout.voyages[v].id.clone());
                self.layout.selected_fleet = Some(id);
            }
            Action::Dock { context } => {
                let exists = match &context {
                    Context::Workspace => true,
                    Context::Voyage { id } => self.layout.voyages.iter().any(|v| &v.id == id),
                    Context::Fleet { id } => self.fleet_index(id).is_some(),
                    Context::Vessel { id } => self
                        .layout
                        .voyages
                        .iter()
                        .flat_map(|v| &v.fleets)
                        .flat_map(|f| &f.vessels)
                        .any(|p| &p.id == id),
                    Context::Portal { id } => self
                        .layout
                        .voyages
                        .iter()
                        .flat_map(|v| &v.portals)
                        .any(|p| &p.id == id),
                };
                if !exists {
                    return Err("Dock target not found".into());
                }
                self.layout.context = context;
            }
            Action::Split { fleet, after, axis } => {
                let (v, f) = self.fleet_index(&fleet).ok_or("Fleet not found")?;
                let content_id = self.layout.voyages[v].fleets[f]
                    .vessels
                    .iter()
                    .find(|p| p.id == after)
                    .map(|p| p.content.clone())
                    .ok_or("Split target not found")?;
                let cwd = self
                    .layout
                    .contents
                    .iter()
                    .find(|c| c.id == content_id)
                    .map(|c| c.cwd.clone())
                    .ok_or("Content not found")?;
                let new_content = ContentId(self.id("content")?);
                let placement = PlacementId(self.id("placement")?);
                let target = &mut self.layout.voyages[v].fleets[f];
                if !replace_leaf(&mut target.root, &after, &placement, axis) {
                    return Err("Split layout target not found".into());
                }
                target.vessels.push(Vessel {
                    id: placement,
                    content: new_content.clone(),
                });
                self.layout.contents.push(Content {
                    id: new_content,
                    type_id: "terminal".into(),
                    cwd,
                    backend: None,
                });
            }
        }
        Ok(())
    }
}

fn replace_leaf(
    root: &mut Split,
    target: &PlacementId,
    inserted: &PlacementId,
    axis: Axis,
) -> bool {
    match root {
        Split::Leaf { placement } if placement == target => {
            *root = Split::Branch {
                axis,
                first: Box::new(Split::Leaf {
                    placement: target.clone(),
                }),
                second: Box::new(Split::Leaf {
                    placement: inserted.clone(),
                }),
            };
            true
        }
        Split::Branch { first, second, .. } => {
            replace_leaf(first, target, inserted, axis)
                || replace_leaf(second, target, inserted, axis)
        }
        _ => false,
    }
}
