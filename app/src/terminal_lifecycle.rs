use crate::{core_shapes::Terminal, panels, workspace::Model};
use voyager_contract::{ContentId, CoreTerminalId, Layout, launch::Launch};

fn retained(layout: &Layout) -> Vec<(voyager_contract::PlacementId, ContentId)> {
    let mut result = Vec::new();
    for voyage in layout.containers() {
        for fleet in voyage.fleets.iter() {
            let root = panels::visible(&fleet.root, &fleet.vessels);
            result.extend(
                fleet
                    .vessels
                    .iter()
                    .filter(|panel| panels::contains(&root, &panel.id))
                    .map(|panel| (panel.id.clone(), panel.content.clone())),
            );
        }
        if let Some(column) = &voyage.portal_layout {
            let root = panels::visible(&column.root, &voyage.portals);
            result.extend(
                voyage
                    .portals
                    .iter()
                    .filter(|panel| panels::contains(&root, &panel.id))
                    .map(|panel| (panel.id.clone(), panel.content.clone())),
            );
        }
    }
    result
}

pub(crate) fn prepare_reopen(layout: &mut Layout, terminals: &[Terminal]) -> Vec<ContentId> {
    prepare_selected(layout, terminals, None)
}

pub(crate) fn prepare_voyage_reopen(
    layout: &mut Layout,
    terminals: &[Terminal],
    voyage: &voyager_contract::VoyageId,
) -> Vec<ContentId> {
    let ids: Vec<_> = layout
        .voyages
        .iter()
        .filter(|item| &item.id == voyage)
        .flat_map(|item| {
            item.fleets
                .iter()
                .flat_map(|fleet| fleet.vessels.iter())
                .chain(item.portals.iter())
        })
        .map(|panel| panel.content.clone())
        .collect();
    prepare_selected(layout, terminals, Some(&ids))
}

fn prepare_selected(
    layout: &mut Layout,
    terminals: &[Terminal],
    ids: Option<&[ContentId]>,
) -> Vec<ContentId> {
    let retained = retained(layout);
    let mut ready = Vec::new();
    for content in &mut layout.contents {
        if content.type_id != "terminal"
            || ids.is_some_and(|ids| !ids.contains(&content.id))
            || content.start_pending.is_some()
            || content.shell_intent.is_some()
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
        content.backend = None;
        content.launch = Some(Launch::Terminal);
        ready.push(content.id.clone());
    }
    ready
}

pub(crate) fn close_exited(
    model: &mut Model,
    terminals: &[Terminal],
    live: &[CoreTerminalId],
) -> Result<bool, String> {
    let closing: Vec<_> = retained(&model.layout)
        .into_iter()
        .filter(|(_, id)| {
            model
                .layout
                .contents
                .iter()
                .find(|content| &content.id == id)
                .and_then(|content| content.backend.as_ref())
                .filter(|backend| live.contains(backend))
                .is_some_and(|backend| {
                    terminals
                        .iter()
                        .any(|terminal| terminal.address == backend.0 && terminal.has_exited())
                })
        })
        .map(|(id, _)| id)
        .collect();
    for id in &closing {
        model.apply(voyager_contract::Action::RemovePanel { id: id.clone() })?;
    }
    Ok(!closing.is_empty())
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
            .contents
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
            .contents
            .iter_mut()
            .find(|item| item.backend == Some(CoreTerminalId("t2".into())))
            .unwrap();
        content.start_pending = Some("uncertain-start".into());
        let ready = prepare_reopen(
            &mut model.layout,
            &[
                terminal("t1", "live", ""),
                terminal("t2", "finished", "exited"),
            ],
        );
        assert_eq!(ready.len(), 1);
        let restarted = model
            .layout
            .contents
            .iter()
            .find(|item| item.id == ready[0])
            .unwrap();
        assert_eq!(restarted.backend, None);
        assert_eq!(restarted.launch, Some(Launch::Terminal));
        assert!(
            model
                .layout
                .contents
                .iter()
                .any(|item| item.backend == Some(CoreTerminalId("t1".into())))
        );
        assert!(
            model
                .layout
                .contents
                .iter()
                .any(|item| item.start_pending.as_deref() == Some("uncertain-start"))
        );
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
        assert!(close_exited(&mut model, &terminals, &live).unwrap());
        assert!(model.layout.voyages[0].fleets[0].root.is_none());
        assert!(model.layout.voyages[1].fleets[0].root.is_some());
        assert!(!close_exited(&mut model, &terminals, &[]).unwrap());
        assert!(
            prepare_reopen(&mut model.layout, &terminals)
                .iter()
                .all(|id| {
                    model.layout.voyages[0].fleets[0]
                        .vessels
                        .iter()
                        .all(|vessel| &vessel.content != id)
                })
        );
    }
}
