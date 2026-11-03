use voyager_contract::{
    Action, Axis, Content, ContentDestination, ContentId, Context, Fleet, FleetId, Layout,
    PlacementId, RenameTarget, SavedLayout, Side, Split, SplitChild, Vessel, Voyage, VoyageId,
    WorkspaceView,
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

    fn placement(&mut self, cwd: String) -> Result<Vessel, String> {
        let content = ContentId(self.id("content")?);
        let placement = PlacementId(self.id("placement")?);
        self.layout.contents.push(Content {
            id: content.clone(),
            type_id: "terminal".into(),
            cwd,
            backend: None,
            configuration: None,
            start_pending: None,
            launch: None,
            shell_intent: None,
        });
        Ok(Vessel {
            id: placement,
            content,
            name: None,
        })
    }

    fn fleet(&mut self, name: String, cwd: String) -> Result<Fleet, String> {
        let placement = self.placement(cwd)?;
        Ok(Fleet {
            id: FleetId(self.id("fleet")?),
            name,
            root: Split::Leaf {
                placement: placement.id.clone(),
            },
            vessels: vec![placement],
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
            Action::SaveLayout { fleet, name } => {
                let name = name.trim().to_owned();
                if name.is_empty() || name.len() > 128 {
                    return Err("A layout name must contain 1 to 128 bytes".into());
                }
                let (v, f) = self.fleet_index(&fleet).ok_or("Fleet not found")?;
                let saved = SavedLayout {
                    fleet: fleet.clone(),
                    name: name.clone(),
                    root: self.layout.voyages[v].fleets[f].root.clone(),
                };
                if let Some(existing) = self
                    .layout
                    .saved_layouts
                    .iter_mut()
                    .find(|item| item.fleet == fleet && item.name == name)
                {
                    *existing = saved;
                } else {
                    self.layout.saved_layouts.push(saved);
                }
            }
            Action::LoadLayout { fleet, name } => {
                let (v, f) = self.fleet_index(&fleet).ok_or("Fleet not found")?;
                let root = self
                    .layout
                    .saved_layouts
                    .iter()
                    .find(|item| item.fleet == fleet && item.name == name.trim())
                    .ok_or("Saved layout not found for this Fleet")?
                    .root
                    .clone();
                let mut seen = Vec::new();
                validate_saved(
                    &root,
                    &self.layout.voyages[v].fleets[f],
                    &self.layout.contents,
                    &mut seen,
                )?;
                self.layout.voyages[v].fleets[f].root = root;
            }
            Action::CreateVoyage { name, cwd } => {
                if name.trim().is_empty() || !std::path::Path::new(&cwd).is_absolute() {
                    return Err("A Voyage needs a name and absolute working directory".into());
                }
                let id = VoyageId(self.id("voyage")?);
                let fleet = self.fleet("Fleet 1".into(), cwd)?;
                self.layout.selected_voyage = Some(id.clone());
                self.layout.selected_fleet = Some(fleet.id.clone());
                self.layout.view = WorkspaceView::Fleet;
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
            Action::CreatePortal { voyage } => {
                let index = self
                    .layout
                    .voyages
                    .iter()
                    .position(|item| item.id == voyage)
                    .ok_or("Voyage not found")?;
                let cwd = self.layout.voyages[index]
                    .fleets
                    .first()
                    .and_then(|fleet| fleet.vessels.first())
                    .and_then(|placement| {
                        self.layout
                            .contents
                            .iter()
                            .find(|content| content.id == placement.content)
                    })
                    .map(|content| content.cwd.clone())
                    .ok_or("Voyage has no working directory")?;
                let placement = self.placement(cwd)?;
                self.layout.voyages[index].portals.push(placement);
            }
            Action::CreateContent {
                type_id,
                destination,
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
                let action = match destination {
                    ContentDestination::Vessel { fleet, after, axis } => {
                        Action::Split { fleet, after, axis }
                    }
                    ContentDestination::Portal { voyage } => Action::CreatePortal { voyage },
                };
                self.apply(action)?;
                let content = self
                    .layout
                    .contents
                    .last_mut()
                    .ok_or("Content was not created")?;
                content.type_id = type_id;
                content.launch = launch;
            }
            Action::Rename { target, name } => {
                let name = name.trim().to_owned();
                if name.is_empty() || name.len() > 128 {
                    return Err("A name must contain 1 to 128 bytes".into());
                }
                match target {
                    RenameTarget::Voyage { id } => {
                        self.layout
                            .voyages
                            .iter_mut()
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
                            .voyages
                            .iter_mut()
                            .flat_map(|voyage| &mut voyage.fleets)
                            .flat_map(|fleet| &mut fleet.vessels)
                            .find(|item| item.id == id)
                            .ok_or("Vessel not found")?
                            .name = Some(name)
                    }
                    RenameTarget::Portal { id } => {
                        self.layout
                            .voyages
                            .iter_mut()
                            .flat_map(|voyage| &mut voyage.portals)
                            .find(|item| item.id == id)
                            .ok_or("Portal not found")?
                            .name = Some(name)
                    }
                }
            }
            Action::SelectFleet { id } => {
                let (v, _) = self.fleet_index(&id).ok_or("Fleet not found")?;
                self.layout.selected_voyage = Some(self.layout.voyages[v].id.clone());
                self.layout.selected_fleet = Some(id);
                self.layout.view = WorkspaceView::Fleet;
            }
            Action::RevealVessel { id } => {
                let (v, f) = self
                    .layout
                    .voyages
                    .iter()
                    .enumerate()
                    .find_map(|(v, voyage)| {
                        voyage
                            .fleets
                            .iter()
                            .position(|fleet| fleet.vessels.iter().any(|vessel| vessel.id == id))
                            .map(|f| (v, f))
                    })
                    .ok_or("Vessel not found")?;
                let voyage = self.layout.voyages[v].id.clone();
                let fleet = &mut self.layout.voyages[v].fleets[f];
                let fleet_id = fleet.id.clone();
                if !contains_leaf(&fleet.root, &id) {
                    let first = std::mem::replace(
                        &mut fleet.root,
                        Split::Leaf {
                            placement: id.clone(),
                        },
                    );
                    fleet.root = Split::Branch {
                        axis: Axis::Horizontal,
                        share: Default::default(),
                        first: Box::new(first),
                        second: Box::new(Split::Leaf { placement: id }),
                    };
                }
                self.layout.selected_voyage = Some(voyage);
                self.layout.selected_fleet = Some(fleet_id);
                self.layout.view = WorkspaceView::Fleet;
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
            Action::ResizeSplit { fleet, path, share } => {
                if path.len() > 128 {
                    return Err("Split path exceeds 128 steps".into());
                }
                let (v, f) = self.fleet_index(&fleet).ok_or("Fleet not found")?;
                let mut node = &mut self.layout.voyages[v].fleets[f].root;
                for child in path {
                    node = match (node, child) {
                        (Split::Branch { first, .. }, SplitChild::First) => first,
                        (Split::Branch { second, .. }, SplitChild::Second) => second,
                        _ => return Err("Split branch not found".into()),
                    };
                }
                let Split::Branch { share: current, .. } = node else {
                    return Err("Split branch not found".into());
                };
                *current = share;
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
                    name: None,
                });
                self.layout.contents.push(Content {
                    id: new_content,
                    type_id: "terminal".into(),
                    cwd,
                    backend: None,
                    configuration: None,
                    start_pending: None,
                    launch: None,
                    shell_intent: None,
                });
            }
            Action::MoveVessel { id, target, side } => {
                let fleet = self
                    .layout
                    .voyages
                    .iter_mut()
                    .flat_map(|voyage| &mut voyage.fleets)
                    .find(|fleet| {
                        fleet.vessels.iter().any(|vessel| vessel.id == id)
                            && fleet.vessels.iter().any(|vessel| vessel.id == target)
                    })
                    .ok_or("Both Vessels must belong to the same Fleet")?;
                if id == target {
                    return Ok(());
                }
                let (root, removed) = remove_leaf(fleet.root.clone(), &id);
                let mut root = root.ok_or("The source Vessel has no destination")?;
                if !removed || !insert_leaf(&mut root, &target, &id, side) {
                    return Err("Vessel placement is not in the Fleet layout".into());
                }
                fleet.root = root;
            }
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

fn contains_leaf(root: &Split, id: &PlacementId) -> bool {
    match root {
        Split::Leaf { placement } => placement == id,
        Split::Branch { first, second, .. } => {
            contains_leaf(first, id) || contains_leaf(second, id)
        }
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

fn remove_leaf(root: Split, id: &PlacementId) -> (Option<Split>, bool) {
    match root {
        Split::Leaf { placement } if &placement == id => (None, true),
        Split::Leaf { .. } => (Some(root), false),
        Split::Branch {
            axis,
            share,
            first,
            second,
        } => {
            let (first, removed) = remove_leaf(*first, id);
            let (second, removed) = if removed {
                (Some(*second), true)
            } else {
                remove_leaf(*second, id)
            };
            let root = match (first, second) {
                (Some(first), Some(second)) => Some(Split::Branch {
                    axis,
                    share,
                    first: Box::new(first),
                    second: Box::new(second),
                }),
                (Some(child), None) | (None, Some(child)) => Some(child),
                (None, None) => None,
            };
            (root, removed)
        }
    }
}

fn insert_leaf(root: &mut Split, target: &PlacementId, id: &PlacementId, side: Side) -> bool {
    match root {
        Split::Leaf { placement } if placement == target => {
            let (axis, before) = match side {
                Side::Left => (Axis::Horizontal, true),
                Side::Right => (Axis::Horizontal, false),
                Side::Top => (Axis::Vertical, true),
                Side::Bottom => (Axis::Vertical, false),
            };
            let source = Split::Leaf {
                placement: id.clone(),
            };
            let destination = Split::Leaf {
                placement: target.clone(),
            };
            let (first, second) = if before {
                (source, destination)
            } else {
                (destination, source)
            };
            *root = Split::Branch {
                axis,
                share: Default::default(),
                first: Box::new(first),
                second: Box::new(second),
            };
            true
        }
        Split::Branch { first, second, .. } => {
            insert_leaf(first, target, id, side) || insert_leaf(second, target, id, side)
        }
        _ => false,
    }
}

fn validate_saved(
    root: &Split,
    fleet: &Fleet,
    contents: &[Content],
    seen: &mut Vec<PlacementId>,
) -> Result<(), String> {
    match root {
        Split::Leaf { placement } => {
            if seen.contains(placement) {
                return Err("Saved layout repeats a placement".into());
            }
            seen.push(placement.clone());
            let vessel = fleet
                .vessels
                .iter()
                .find(|item| &item.id == placement)
                .ok_or("Saved placement no longer belongs to this Fleet")?;
            contents
                .iter()
                .find(|item| item.id == vessel.content)
                .ok_or("Saved content not found")?;
            Ok(())
        }
        Split::Branch { first, second, .. } => {
            validate_saved(first, fleet, contents, seen)?;
            validate_saved(second, fleet, contents, seen)
        }
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
                share: Default::default(),
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
