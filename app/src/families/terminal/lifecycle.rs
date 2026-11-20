use crate::{
    core::{Core, Error},
    core_shapes::Terminal,
    panels,
    workspace::Model,
};
use voyager_contract::{CoreTerminalId, Layout, VesselId, launch::Launch};

fn retained(layout: &Layout) -> Vec<(voyager_contract::PlacementId, VesselId)> {
    let mut result = Vec::new();
    for voyage in layout.containers() {
        for fleet in voyage.fleets.iter() {
            let root = panels::visible(&fleet.root, &fleet.placements);
            result.extend(
                fleet
                    .placements
                    .iter()
                    .filter(|panel| panels::contains(&root, &panel.id))
                    .map(|panel| (panel.id.clone(), panel.vessel.clone())),
            );
        }
        if let Some(column) = &voyage.portal_layout {
            let root = panels::visible(&column.root, &voyage.portals);
            result.extend(
                voyage
                    .portals
                    .iter()
                    .filter(|panel| panels::contains(&root, &panel.id))
                    .map(|panel| (panel.id.clone(), panel.vessel.clone())),
            );
        }
    }
    result
}

pub(crate) fn prepare_reopen(layout: &mut Layout, terminals: &[Terminal]) -> (Vec<VesselId>, bool) {
    prepare_selected(layout, terminals, None)
}

pub(crate) fn prepare_voyage_reopen(
    layout: &mut Layout,
    terminals: &[Terminal],
    voyage: &voyager_contract::VoyageId,
) -> Vec<VesselId> {
    let ids: Vec<_> = layout
        .voyages
        .iter()
        .filter(|item| &item.id == voyage)
        .flat_map(|item| {
            item.fleets
                .iter()
                .flat_map(|fleet| fleet.placements.iter())
                .chain(item.portals.iter())
        })
        .map(|panel| panel.vessel.clone())
        .collect();
    prepare_selected(layout, terminals, Some(&ids)).0
}

fn prepare_selected(
    layout: &mut Layout,
    terminals: &[Terminal],
    ids: Option<&[VesselId]>,
) -> (Vec<VesselId>, bool) {
    let retained = retained(layout);
    let mut ready = Vec::new();
    let mut closing = Vec::new();
    for content in &mut layout.vessels {
        if content.type_id != "terminal"
            || ids.is_some_and(|ids| !ids.contains(&content.id))
            || content.start_pending.is_some()
            || content.shell_intent.is_some()
            || crate::workspace::is_voyager(content)
            || !retained.iter().any(|(_, id)| id == &content.id)
        {
            continue;
        }
        let Some(backend) = &content.backend else {
            continue;
        };
        let observed = terminals
            .iter()
            .find(|terminal| terminal.address == backend.0);
        if observed.is_some_and(|terminal| !terminal.has_ended()) {
            continue;
        }
        if content.adopted {
            closing.extend(
                retained
                    .iter()
                    .filter(|(_, id)| id == &content.id)
                    .map(|(placement, _)| placement.clone()),
            );
            continue;
        }
        content.backend = None;
        content.launch = Some(Launch::Terminal);
        ready.push(content.id.clone());
    }
    let closed = closing
        .into_iter()
        .filter(|id| {
            panels::apply(
                layout,
                voyager_contract::Action::RemovePlacement { id: id.clone() },
            )
            .is_ok()
        })
        .count()
        > 0;
    (ready, closed)
}

pub(crate) fn exited(terminals: &[Terminal]) -> Vec<CoreTerminalId> {
    terminals
        .iter()
        .filter(|terminal| terminal.has_exited())
        .map(|terminal| CoreTerminalId(terminal.address.clone()))
        .collect()
}

pub(crate) fn close_exited(
    model: &mut Model,
    exited: &[CoreTerminalId],
    live: &[CoreTerminalId],
) -> Result<bool, String> {
    let closing: Vec<_> = retained(&model.layout)
        .into_iter()
        .filter(|(_, id)| {
            model
                .layout
                .vessels
                .iter()
                .find(|content| &content.id == id)
                .and_then(|content| content.backend.as_ref())
                .is_some_and(|backend| live.contains(backend) && exited.contains(backend))
        })
        .map(|(id, _)| id)
        .collect();
    for id in &closing {
        model.apply(voyager_contract::Action::RemovePlacement { id: id.clone() })?;
    }
    Ok(!closing.is_empty())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Lifecycle {
    QuitAndKeep,
    StopSession,
}

impl Lifecycle {
    pub(crate) fn end(
        self,
        ended: &mut Option<(Lifecycle, Result<(), Error>)>,
        core: &mut Result<Core, Error>,
    ) -> Result<(), Error> {
        match (&*ended, self) {
            (Some((done, result)), _) if *done == self => result.clone(),
            (Some((Lifecycle::StopSession, Ok(()))), Lifecycle::QuitAndKeep) => Ok(()),
            (Some((Lifecycle::QuitAndKeep, _)), Lifecycle::StopSession) => Err(Error::Rejected {
                kind: "quitting".into(),
                message: "Voyager already quit and kept the session; no session was stopped".into(),
            }),
            _ => {
                let result = match (core.as_mut(), self) {
                    (Ok(core), _) => core.end(self == Lifecycle::StopSession),
                    (Err(_), Lifecycle::QuitAndKeep) => Ok(()),
                    (Err(error), Lifecycle::StopSession) => Err(error.clone()),
                };
                *ended = Some((self, result.clone()));
                result
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use voyager_contract::Action;

    fn workspace() -> Model {
        let mut model = Model::default();
        for name in ["ended", "survivor", "unconfirmed"] {
            model
                .apply(Action::CreateVoyage {
                    name: name.into(),
                    cwd: "/tmp".into(),
                })
                .unwrap();
        }
        for (index, content) in model
            .layout
            .vessels
            .iter_mut()
            .filter(|item| item.type_id == "terminal")
            .enumerate()
        {
            content.backend = Some(CoreTerminalId(format!("t{index}")));
        }
        model
    }

    fn terminal(id: &str, state: &str, reason: &str) -> Terminal {
        serde_json::from_value(serde_json::json!({
            "address": id, "labels": {}, "argv": ["bash"], "cwd": "/tmp", "state": state, "reason": reason, "pid": 123,
            "created_ms":0,"screen":"exact","cols":80,"rows":24,"status": {"state":"unknown", "turn":0, "reported":false}
        })).unwrap()
    }

    #[test]
    fn cold_reopen_prepares_only_confirmed_dead_retained_programs_as_plain_shells() {
        let mut model = workspace();
        model.layout.voyages[0].closed = true;
        model.layout.voyages[0].fleets[0].closed = true;
        let content = model
            .layout
            .vessels
            .iter_mut()
            .find(|item| item.backend == Some(CoreTerminalId("t2".into())))
            .unwrap();
        content.start_pending = Some("uncertain-start".into());
        let (ready, closed) = prepare_reopen(
            &mut model.layout,
            &[
                terminal("t1", "live", ""),
                terminal("t2", "finished", "exited"),
            ],
        );
        assert!(!closed);
        assert_eq!(ready.len(), 1);
        let restarted = model
            .layout
            .vessels
            .iter()
            .find(|item| item.id == ready[0])
            .unwrap();
        assert_eq!(restarted.backend, None);
        assert_eq!(restarted.launch, Some(Launch::Terminal));
        assert!(
            model
                .layout
                .vessels
                .iter()
                .any(|item| item.backend == Some(CoreTerminalId("t1".into())))
        );
        assert!(
            model
                .layout
                .vessels
                .iter()
                .any(|item| item.start_pending.as_deref() == Some("uncertain-start"))
        );
    }

    #[test]
    fn reopen_closes_an_adopted_vessel_whose_program_ended_and_starts_no_shell() {
        let mut model = workspace();
        for content in model
            .layout
            .vessels
            .iter_mut()
            .filter(|item| item.type_id == "terminal")
        {
            content.adopted = content.backend == Some(CoreTerminalId("t2".into()));
        }
        let (ready, closed) = prepare_reopen(
            &mut model.layout,
            &[
                terminal("t0", "finished", "exited"),
                terminal("t1", "live", ""),
                terminal("t2", "finished", "exited"),
            ],
        );
        assert!(closed);
        let by_backend = |layout: &Layout, address: &str| {
            layout
                .vessels
                .iter()
                .find(|item| item.backend == Some(CoreTerminalId(address.into())))
                .map(|item| item.id.clone())
        };
        assert_eq!(ready.len(), 1);
        assert!(model.layout.voyages[2].fleets[0].root.is_none());
        assert!(by_backend(&model.layout, "t2").is_some());
        assert!(model.layout.voyages[0].fleets[0].root.is_some());
        assert!(model.layout.voyages[1].fleets[0].root.is_some());
        assert!(
            model
                .layout
                .vessels
                .iter()
                .any(|item| item.backend.is_none() && item.launch == Some(Launch::Terminal))
        );
    }

    #[test]
    fn automatic_cleanup_never_removes_a_placement_whose_program_is_live() {
        let mut model = workspace();
        let live = [
            CoreTerminalId("t0".into()),
            CoreTerminalId("t1".into()),
            CoreTerminalId("t2".into()),
        ];
        let terminals = [
            terminal("t0", "live", ""),
            terminal("t1", "live", ""),
            terminal("t2", "finished", "exited"),
        ];
        assert!(close_exited(&mut model, &exited(&terminals), &live).unwrap());
        assert!(model.layout.voyages[0].fleets[0].root.is_some());
        assert!(model.layout.voyages[1].fleets[0].root.is_some());
        assert!(model.layout.voyages[2].fleets[0].root.is_none());
    }

    #[test]
    fn normal_exit_closes_only_a_previously_live_placement() {
        let mut model = workspace();
        let live = [CoreTerminalId("t0".into()), CoreTerminalId("t1".into())];
        let terminals = [
            terminal("t0", "finished", "exited"),
            terminal("t1", "finished", "killed"),
            terminal("t2", "live", ""),
        ];
        assert!(close_exited(&mut model, &exited(&terminals), &live).unwrap());
        assert!(model.layout.voyages[0].fleets[0].root.is_none());
        assert!(model.layout.voyages[1].fleets[0].root.is_some());
        assert!(!close_exited(&mut model, &exited(&terminals), &[]).unwrap());
        assert!(
            prepare_reopen(&mut model.layout, &terminals)
                .0
                .iter()
                .all(|id| {
                    model.layout.voyages[0].fleets[0]
                        .placements
                        .iter()
                        .all(|vessel| &vessel.vessel != id)
                })
        );
    }
}
