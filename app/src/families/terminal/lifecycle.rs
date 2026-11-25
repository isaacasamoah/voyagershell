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
            let group = panels::Group::of_fleet(fleet);
            result.extend(
                fleet
                    .placements
                    .iter()
                    .filter(|panel| group.shown(&panel.id))
                    .map(|panel| (panel.id.clone(), panel.vessel.clone())),
            );
        }
        if let Some(portals) = panels::Group::of_portals(voyage) {
            result.extend(
                voyage
                    .portals
                    .iter()
                    .filter(|panel| portals.shown(&panel.id))
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
    let placed: Vec<VesselId> = retained(layout).into_iter().map(|(_, id)| id).collect();
    let mut ready = Vec::new();
    let mut ended = Vec::new();
    for content in &mut layout.vessels {
        if !voyager_contract::launch::is_terminal_backed(&content.type_id)
            || ids.is_some_and(|ids| !ids.contains(&content.id))
            || content.start_pending.is_some()
            || content.shell_intent.is_some()
            || crate::workspace::is_voyager(content)
        {
            continue;
        }
        let Some(backend) = &content.backend else {
            continue;
        };
        let known = terminals
            .iter()
            .find(|terminal| terminal.address == backend.0);
        if known.is_some_and(|terminal| !terminal.has_ended()) {
            continue;
        }
        if content.adopted {
            ended.push(content.id.clone());
        } else if placed.contains(&content.id) {
            content.backend = None;
            content.launch = Some(Launch::Terminal);
            ready.push(content.id.clone());
        }
    }
    let closed = crate::workspace::discard_vessels(layout, &ended).unwrap_or(false);
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
    let placed = retained(&model.layout);
    let mut closing = Vec::new();
    let mut discarding = Vec::new();
    for content in &model.layout.vessels {
        let Some(backend) = &content.backend else {
            continue;
        };
        if !voyager_contract::launch::is_terminal_backed(&content.type_id)
            || !live.contains(backend)
            || !exited.contains(backend)
        {
            continue;
        }
        let tiled: Vec<_> = placed
            .iter()
            .filter(|(_, id)| id == &content.id)
            .map(|(placement, _)| placement.clone())
            .collect();
        if crate::workspace::is_voyager(content) {
            closing.extend(tiled);
        } else if content.adopted || !tiled.is_empty() {
            discarding.push(content.id.clone());
        }
    }
    for id in &closing {
        model.apply(voyager_contract::Action::RemovePlacement { id: id.clone() })?;
    }
    let discarded = crate::workspace::discard_vessels(&mut model.layout, &discarding)?;
    Ok(!closing.is_empty() || discarded)
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
    use voyager_contract::{Action, Vessel};

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
            .filter(|item| voyager_contract::launch::is_terminal_backed(&item.type_id))
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
            .filter(|item| voyager_contract::launch::is_terminal_backed(&item.type_id))
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
        assert!(model.layout.voyages[2].fleets[0].placements.is_empty());
        assert!(by_backend(&model.layout, "t2").is_none());
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

    fn adopt(model: &mut Model, address: &str) {
        for content in model.layout.vessels.iter_mut() {
            content.adopted = content.backend == Some(CoreTerminalId(address.into()));
        }
    }

    fn holds(layout: &Layout, address: &str) -> bool {
        layout
            .vessels
            .iter()
            .any(|content| content.backend == Some(CoreTerminalId(address.into())))
    }

    #[test]
    fn an_ended_adopted_vessel_leaves_no_placement_vessel_or_saved_leaf() {
        let mut model = workspace();
        adopt(&mut model, "t2");
        let owner = voyager_contract::PlacementOwner::Fleet {
            id: model.layout.voyages[2].fleets[0].id.clone(),
        };
        model
            .apply(Action::SaveArrangement {
                owner,
                name: "kept".into(),
            })
            .unwrap();
        assert!(model.layout.arrangements[0].root.is_some());
        let (ready, closed) = prepare_reopen(
            &mut model.layout,
            &[
                terminal("t0", "live", ""),
                terminal("t1", "live", ""),
                terminal("t2", "finished", "exited"),
            ],
        );
        assert!(closed);
        assert!(ready.is_empty());
        assert!(!holds(&model.layout, "t2"));
        assert!(model.layout.voyages[2].fleets[0].placements.is_empty());
        assert!(model.layout.arrangements[0].root.is_none());
        assert!(holds(&model.layout, "t0") && holds(&model.layout, "t1"));
    }

    #[test]
    fn an_adopted_vessel_closed_earlier_is_discarded_when_core_no_longer_knows_it() {
        let mut model = workspace();
        adopt(&mut model, "t2");
        let placement = model.layout.voyages[2].fleets[0].placements[0].id.clone();
        model
            .apply(Action::RemovePlacement { id: placement })
            .unwrap();
        assert_eq!(model.layout.voyages[2].fleets[0].placements.len(), 1);
        let (_, closed) = prepare_reopen(
            &mut model.layout,
            &[terminal("t0", "live", ""), terminal("t1", "live", "")],
        );
        assert!(closed);
        assert!(!holds(&model.layout, "t2"));
        assert!(model.layout.voyages[2].fleets[0].placements.is_empty());
    }

    #[test]
    fn an_uncertain_answer_from_core_keeps_the_adopted_record() {
        let mut model = workspace();
        adopt(&mut model, "t2");
        for uncertain in [
            terminal("t2", "unfamiliar", ""),
            terminal("t2", "finished", "spawn_pending"),
        ] {
            let roster = [
                terminal("t0", "live", ""),
                terminal("t1", "live", ""),
                uncertain,
            ];
            let (_, closed) = prepare_reopen(&mut model.layout, &roster);
            assert!(!closed);
            assert!(holds(&model.layout, "t2"));
            assert_eq!(model.layout.voyages[2].fleets[0].placements.len(), 1);
        }
    }

    #[test]
    fn a_vessel_that_is_not_a_terminal_is_never_discarded() {
        let mut model = workspace();
        adopt(&mut model, "t2");
        model
            .layout
            .vessels
            .iter_mut()
            .find(|content| content.backend == Some(CoreTerminalId("t2".into())))
            .unwrap()
            .type_id = "dashboard".into();
        let before = model.layout.clone();
        let (ready, closed) = prepare_reopen(
            &mut model.layout,
            &[
                terminal("t0", "live", ""),
                terminal("t1", "live", ""),
                terminal("t2", "finished", "exited"),
            ],
        );
        assert!(ready.is_empty() && !closed);
        let live = [CoreTerminalId("t2".into())];
        let exited = [CoreTerminalId("t2".into())];
        assert!(!close_exited(&mut model, &exited, &live).unwrap());
        assert_eq!(model.layout, before);
    }

    #[test]
    fn a_typed_exit_in_a_terminal_the_user_opened_deletes_its_vessel() {
        let mut model = workspace();
        let live = [CoreTerminalId("t0".into())];
        let exited = [CoreTerminalId("t0".into())];
        assert!(close_exited(&mut model, &exited, &live).unwrap());
        assert!(!holds(&model.layout, "t0"));
        assert!(model.layout.voyages[0].fleets[0].placements.is_empty());
        assert!(holds(&model.layout, "t1") && holds(&model.layout, "t2"));
    }

    #[test]
    fn a_terminal_the_user_opened_keeps_a_fresh_shell_when_its_program_ends_at_runtime_and_on_reopen()
     {
        let mut model = workspace();
        let live = [CoreTerminalId("t0".into())];
        let terminals = [terminal("t0", "live", "")];
        assert!(!close_exited(&mut model, &exited(&terminals), &live).unwrap());
        assert!(holds(&model.layout, "t0"));
        assert!(model.layout.voyages[0].fleets[0].root.is_some());
        let (ready, closed) = prepare_reopen(
            &mut model.layout,
            &[
                terminal("t0", "finished", "exited"),
                terminal("t1", "live", ""),
                terminal("t2", "live", ""),
            ],
        );
        assert!(!closed);
        assert_eq!(ready.len(), 1);
        let fresh = model
            .layout
            .vessels
            .iter()
            .find(|item| item.id == ready[0])
            .unwrap();
        assert!(!fresh.adopted);
        assert_eq!(fresh.backend, None);
        assert_eq!(fresh.launch, Some(Launch::Terminal));
        assert!(model.layout.voyages[0].fleets[0].root.is_some());
        assert_eq!(model.layout.voyages[0].fleets[0].placements.len(), 1);
    }

    fn record(model: &mut Model, fleet: (usize, usize), serial: usize, vessel: Vessel) {
        let placement = voyager_contract::Placement {
            id: voyager_contract::PlacementId(format!("placement-{serial}")),
            vessel: vessel.id.clone(),
            name: format!("Vessel {serial}"),
            name_origin: voyager_contract::NameOrigin::Deliberate,
            hidden: false,
        };
        model.layout.vessels.push(vessel);
        model.layout.voyages[fleet.0].fleets[fleet.1]
            .placements
            .push(placement);
    }

    fn vessel(serial: usize, type_id: &str, backend: &str, adopted: bool) -> Vessel {
        Vessel {
            id: VesselId(format!("content-{serial}")),
            type_id: type_id.into(),
            cwd: "/tmp".into(),
            backend: Some(CoreTerminalId(backend.into())),
            configuration: None,
            start_pending: None,
            launch: Some(Launch::Terminal),
            shell_intent: None,
            adopted,
        }
    }

    #[test]
    fn reopen_clears_a_generated_layout_shaped_like_the_trial_one_and_keeps_every_other_kind() {
        let mut model = Model::default();
        let shape = [[121, 69, 10, 6, 5, 3, 3].as_slice(), [26].as_slice()];
        let mut roster = Vec::new();
        let mut serial = 1000;
        for (voyage, counts) in shape.iter().enumerate() {
            model
                .apply(Action::CreateVoyage {
                    name: format!("Voyage {voyage}"),
                    cwd: "/tmp".into(),
                })
                .unwrap();
            let id = model.layout.voyages[voyage].id.clone();
            for (fleet, count) in counts.iter().enumerate() {
                if fleet > 0 {
                    model
                        .apply(Action::CreateFleet {
                            voyage: id.clone(),
                            name: format!("Fleet {fleet}"),
                        })
                        .unwrap();
                }
                for _ in 0..*count {
                    serial += 1;
                    let address = format!("t{serial}");
                    let finished = roster.len() < 35;
                    if finished {
                        roster.push(terminal(&address, "finished", "exited"));
                    }
                    let crew = vessel(serial, "agent", &address, true);
                    record(&mut model, (voyage, fleet), serial, crew);
                }
            }
        }
        assert_eq!(roster.len(), 35);
        assert_eq!(model.layout.voyages[0].fleets.len(), 7);
        assert_eq!(model.layout.voyages[1].fleets.len(), 1);
        let dead = serial - 1000;
        assert_eq!(dead, 243);
        for _ in 0..25 {
            serial += 1;
            let address = format!("t{serial}");
            roster.push(terminal(&address, "live", ""));
            record(
                &mut model,
                (0, 0),
                serial,
                vessel(serial, "agent", &address, true),
            );
        }
        for _ in 0..3 {
            serial += 1;
            let address = format!("t{serial}");
            roster.push(terminal(&address, "finished", "exited"));
            record(
                &mut model,
                (0, 0),
                serial,
                vessel(serial, "terminal", &address, false),
            );
        }
        serial += 1;
        record(
            &mut model,
            (0, 0),
            serial,
            vessel(serial, "dashboard", "t-missing", true),
        );
        serial += 1;
        let mut pending = vessel(serial, "agent", "t-pending", true);
        pending.start_pending = Some("unconfirmed".into());
        record(&mut model, (0, 0), serial, pending);
        serial += 1;
        let mut avatar = vessel(serial, "agent", "t-avatar", true);
        avatar.id = VesselId(crate::workspace::VOYAGER_VESSEL.into());
        record(&mut model, (0, 0), serial, avatar);
        let own = model
            .layout
            .vessels
            .iter_mut()
            .find(|content| content.backend.is_none() && !content.adopted)
            .unwrap();
        own.backend = Some(CoreTerminalId("t-own".into()));
        let own = own.id.clone();
        roster.push(terminal("t-own", "finished", "exited"));
        let (vessels, placements) = (
            model.layout.vessels.len(),
            model
                .layout
                .containers()
                .flat_map(|voyage| voyage.fleets.iter())
                .map(|fleet| fleet.placements.len())
                .sum::<usize>(),
        );

        let (ready, closed) = prepare_reopen(&mut model.layout, &roster);

        assert!(closed);
        assert_eq!(model.layout.vessels.len(), vessels - 243);
        assert_eq!(
            model
                .layout
                .containers()
                .flat_map(|voyage| voyage.fleets.iter())
                .map(|fleet| fleet.placements.len())
                .sum::<usize>(),
            placements - 243
        );
        let dead_left = model
            .layout
            .vessels
            .iter()
            .filter(|content| {
                content.adopted
                    && content.backend.as_ref().is_some_and(|backend| {
                        backend
                            .0
                            .strip_prefix('t')
                            .and_then(|n| n.parse::<usize>().ok())
                            .is_some_and(|n| n > 1000 && n <= 1243)
                    })
            })
            .count();
        assert_eq!(dead_left, 0);
        let kept = |type_id: &str, adopted: bool| {
            model
                .layout
                .vessels
                .iter()
                .filter(|content| content.type_id == type_id && content.adopted == adopted)
                .filter(|content| content.backend.is_some())
                .count()
        };
        assert_eq!(kept("agent", true), 25 + 1 + 1);
        assert_eq!(kept("terminal", false), 3);
        assert_eq!(kept("dashboard", true), 1);
        assert_eq!(ready, vec![own.clone()]);
        let restarted = model
            .layout
            .vessels
            .iter()
            .find(|content| content.id == own)
            .unwrap();
        assert_eq!(restarted.backend, None);
        assert_eq!(restarted.launch, Some(Launch::Terminal));
    }
}
