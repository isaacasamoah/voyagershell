use crate::workspace::Model;
use serde::Deserialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use voyager_contract::{
    CoreTerminalId, Layout,
    launch::Launch,
    place::{LABEL, Place},
};

#[derive(Deserialize)]
pub(crate) struct Origin {
    #[serde(default)]
    labels: HashMap<String, String>,
    #[serde(default)]
    argv: Vec<String>,
    #[serde(default)]
    cwd: String,
    #[serde(default)]
    name: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Labelled {
    pub(crate) terminal: CoreTerminalId,
    pub(crate) place: Result<Place, String>,
    pub(crate) cwd: String,
    pub(crate) launch: Launch,
    pub(crate) name: Option<String>,
}

impl Labelled {
    pub(crate) fn of(address: &str, origin: Origin) -> Option<Self> {
        let value = origin.labels.get(LABEL)?;
        let program = origin.argv.first().and_then(|program| {
            std::path::Path::new(program)
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.trim_end_matches(".exe").to_owned())
        });
        Some(Self {
            terminal: CoreTerminalId(address.into()),
            place: value
                .parse()
                .map_err(|error| format!("Terminal {address} was not placed: {error}")),
            cwd: origin.cwd,
            name: origin.name,
            launch: match program {
                Some(program) if crate::agent_programs::is_agent_program(&program) => {
                    Launch::Program {
                        argv: vec![program],
                    }
                }
                _ => Launch::Terminal,
            },
        })
    }
}

pub(crate) enum Unsaved {
    Refused(String),
    Unconfirmed(String),
}

pub(crate) struct Adoptions {
    pending: Vec<Labelled>,
    notice: Arc<Mutex<Option<String>>>,
}

impl Adoptions {
    pub(crate) fn new(notice: Arc<Mutex<Option<String>>>) -> Self {
        Self {
            pending: Vec::new(),
            notice,
        }
    }

    pub(crate) fn found(&mut self, labelled: impl IntoIterator<Item = Labelled>) {
        self.pending.extend(labelled);
    }

    pub(crate) fn waiting(&self) -> bool {
        !self.pending.is_empty()
    }

    pub(crate) fn drop_all(&mut self) {
        self.pending.clear();
    }

    pub(crate) fn settle<Revision: Copy>(
        &mut self,
        save: impl FnOnce(&Layout, Revision) -> Result<Revision, Unsaved>,
        (layout, version, fresh): (&mut Arc<Layout>, &mut Revision, &mut bool),
        live: &mut Vec<CoreTerminalId>,
    ) -> bool {
        let mut candidate = Model {
            layout: (**layout).clone(),
        };
        let mut placed = Vec::new();
        let mut shown = None;
        for labelled in std::mem::take(&mut self.pending) {
            let result = labelled.place.clone().and_then(|place| {
                candidate
                    .adopt(
                        place,
                        &labelled.terminal,
                        labelled.cwd.clone(),
                        labelled.launch.clone(),
                        labelled.name.clone(),
                    )
                    .map_err(|error| {
                        format!("Terminal {} was not placed: {error}", labelled.terminal.0)
                    })
            });
            match result {
                Ok(true) => placed.push(labelled),
                Ok(false) => (),
                Err(message) => shown = Some(message),
            }
        }
        if !placed.is_empty() {
            match save(&candidate.layout, *version) {
                Ok(saved) => {
                    *version = saved;
                    *layout = Arc::new(candidate.layout);
                    live.extend(placed.into_iter().map(|labelled| labelled.terminal));
                }
                Err(Unsaved::Refused(message)) => {
                    *fresh = false;
                    eprintln!("Labelled terminal placement refused: {message}");
                    self.pending = placed;
                }
                Err(Unsaved::Unconfirmed(message)) => {
                    *fresh = false;
                    let terminals: Vec<&str> = placed
                        .iter()
                        .map(|labelled| labelled.terminal.0.as_str())
                        .collect();
                    shown = Some(format!(
                        "Placing terminal {} is unconfirmed: {message}",
                        terminals.join(", ")
                    ));
                }
            }
        }
        let Some(message) = shown else {
            return false;
        };
        self.notice
            .lock()
            .map(|mut shown| *shown = Some(message))
            .is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::activity::{Activity, Report};
    use serde_json::{Value, json};

    fn event(seq: u64, terminal: &str, data: Value) -> Value {
        json!({"jsonrpc":"2.0","method":"event","params":{"seq":seq,"type":"created","terminal":terminal,"data":data}})
    }

    fn labelled(facts: &mut Activity) -> Vec<Labelled> {
        facts
            .take()
            .into_iter()
            .flat_map(|event| match event.report {
                Report::Labelled { labelled, .. } => vec![labelled],
                Report::Snapshot { labelled, .. } => labelled,
                _ => Vec::new(),
            })
            .collect()
    }

    #[test]
    fn a_refused_save_keeps_the_adoption_and_an_unsettled_one_is_shown_not_retried() {
        let mut model = Model::default();
        model
            .apply(voyager_contract::Action::CreateVoyage {
                name: "Crew".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        let fleet = model.layout.voyages[0].fleets[0].id.clone();
        let labelled = Labelled {
            terminal: CoreTerminalId("t9".into()),
            place: Ok(Place::Fleet {
                id: fleet,
                beside: None,
            }),
            cwd: "/work".into(),
            launch: Launch::Terminal,
            name: None,
        };
        let notice = Arc::new(Mutex::new(None));
        let mut adoptions = Adoptions::new(notice.clone());
        let mut layout = Arc::new(model.layout);
        let (mut version, mut fresh, mut live) = (7, true, Vec::new());
        adoptions.found([labelled.clone()]);
        let refused = |_: &Layout, _| Err(Unsaved::Refused("moved".into()));
        let saved = (&mut layout, &mut version, &mut fresh);
        assert!(!adoptions.settle(refused, saved, &mut live));
        assert!(adoptions.waiting());
        assert!(!fresh);
        fresh = true;
        let unsettled = |_: &Layout, _| Err(Unsaved::Unconfirmed("lost".into()));
        let saved = (&mut layout, &mut version, &mut fresh);
        assert!(adoptions.settle(unsettled, saved, &mut live));
        assert!(!adoptions.waiting());
        assert!(!fresh);
        assert!(live.is_empty());
        assert!(
            notice
                .lock()
                .unwrap()
                .as_deref()
                .is_some_and(|shown| shown.contains("t9") && shown.contains("unconfirmed"))
        );
    }

    #[test]
    fn a_labelled_terminal_is_reported_from_its_creation_and_from_a_resync() {
        let mut facts = Activity::default();
        facts.bind(["t1"]);
        facts.begin();
        facts
            .install(json!({"seq":0,"channel":9,"terminals":[]}))
            .unwrap();
        facts.take();
        let task = json!(["/usr/bin/claude", "Fix x.rs"]);
        facts
            .notification(event(
                1,
                "t2",
                json!({"argv":task,"cwd":"/work","labels":{}}),
            ))
            .unwrap();
        assert!(facts.take().is_empty());
        facts
            .notification(event(
                2,
                "t3",
                json!({"argv":task,"cwd":"/work","name":"arch","labels":{"voyager.place":"fleet:fleet-2"}}),
            ))
            .unwrap();
        facts
            .notification(event(
                3,
                "t4",
                json!({"argv":["bash"],"labels":{"voyager.place":"tab:2"}}),
            ))
            .unwrap();
        let found = labelled(&mut facts);
        assert_eq!(found.len(), 2);
        assert_eq!(found[0].terminal, CoreTerminalId("t3".into()));
        assert_eq!(found[0].cwd, "/work");
        assert_eq!(found[0].name.as_deref(), Some("arch"));
        assert_eq!(found[1].name, None);
        assert_eq!(
            found[0].launch,
            Launch::Program {
                argv: vec!["claude".into()]
            }
        );
        assert_eq!(
            found[0].place.clone().map(Place::into_parts),
            Ok((
                voyager_contract::PlacementOwner::Fleet {
                    id: voyager_contract::FleetId("fleet-2".into())
                },
                voyager_contract::PlacementInsertion::Empty
            ))
        );
        assert_eq!(found[1].launch, Launch::Terminal);
        assert!(
            found[1]
                .place
                .as_ref()
                .is_err_and(|error| error.contains("t4"))
        );
        facts
            .notification(json!({"jsonrpc":"2.0","method":"missed","params":{"seq":9,"terminals":[
                {"address":"t1","state":"live","labels":{"voyager.place":"fleet:fleet-2"}},
                {"address":"t5","state":"live","argv":["bash"],"labels":{"voyager.place":"portal:voyage-1"}},
                {"address":"t6","state":"finished","labels":{"voyager.place":"fleet:fleet-2"}},
                {"address":"t7","state":"live","labels":{}}
            ]}}))
            .unwrap();
        let resynced: Vec<String> = labelled(&mut facts)
            .into_iter()
            .map(|labelled| labelled.terminal.0)
            .collect();
        assert_eq!(resynced, vec!["t5".to_owned()]);
    }

    fn crew() -> (
        Model,
        voyager_contract::FleetId,
        voyager_contract::PlacementId,
    ) {
        let mut model = Model::default();
        model
            .apply(voyager_contract::Action::CreateVoyage {
                name: "Crew".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        let fleet = &model.layout.voyages[0].fleets[0];
        let ids = (fleet.id.clone(), fleet.placements[0].id.clone());
        (model, ids.0, ids.1)
    }

    fn labelled_at(text: &str) -> Labelled {
        let origin: Origin = serde_json::from_value(json!({
            "argv": ["bash"],
            "cwd": "/work",
            "labels": {LABEL: text}
        }))
        .unwrap();
        Labelled::of("t9", origin).unwrap()
    }

    fn settled(layout: &Layout, pending: Vec<Labelled>) -> (Layout, Option<String>) {
        let notice = Arc::new(Mutex::new(None));
        let mut adoptions = Adoptions::new(notice.clone());
        let mut shared = Arc::new(layout.clone());
        let (mut version, mut fresh, mut live): (u64, bool, Vec<CoreTerminalId>) =
            (1, true, Vec::new());
        adoptions.found(pending);
        let save = |_: &Layout, revision: u64| Ok(revision + 1);
        adoptions.settle(save, (&mut shared, &mut version, &mut fresh), &mut live);
        let shown = notice.lock().unwrap().clone();
        (Layout::clone(&shared), shown)
    }

    #[test]
    fn a_terminal_labelled_with_a_side_lands_on_that_side_of_the_named_placement() {
        use voyager_contract::{Axis, Split, SplitShare};
        let leaf = |id: &voyager_contract::PlacementId| {
            Box::new(Split::Leaf {
                placement: id.clone(),
            })
        };
        for (side, axis, new_first) in [
            ("left", Axis::Horizontal, true),
            ("right", Axis::Horizontal, false),
            ("top", Axis::Vertical, true),
            ("bottom", Axis::Vertical, false),
        ] {
            let (model, fleet, target) = crew();
            let text = format!("fleet:{}:{side}:{}", fleet.0, target.0);
            let (layout, shown) = settled(&model.layout, vec![labelled_at(&text)]);
            assert_eq!(shown, None, "{side}");
            let placed = &layout.voyages[0].fleets[0];
            assert_eq!(placed.placements.len(), 2, "{side}");
            let new = placed.placements[1].id.clone();
            let (first, second) = if new_first {
                (leaf(&new), leaf(&target))
            } else {
                (leaf(&target), leaf(&new))
            };
            assert_eq!(
                placed.root,
                Some(Split::Branch {
                    axis,
                    share: SplitShare::default(),
                    first,
                    second,
                }),
                "{side}"
            );
            let content = layout
                .vessels
                .iter()
                .find(|content| content.id == placed.placements[1].vessel)
                .unwrap();
            assert_eq!(content.backend, Some(CoreTerminalId("t9".into())), "{side}");
            assert_eq!(content.cwd, "/work", "{side}");
            assert!(content.adopted, "{side}");
        }
    }

    #[test]
    fn a_side_label_naming_no_usable_placement_places_nothing_and_says_so() {
        let (mut model, fleet, target) = crew();
        let voyage = model.layout.voyages[0].id.clone();
        model
            .apply(voyager_contract::Action::CreateFleet {
                voyage,
                name: "Second".into(),
            })
            .unwrap();
        let foreign = model.layout.voyages[0].fleets[1].placements[0].id.clone();
        let cases = [
            (
                "unknown placement",
                format!("fleet:{}:left:placement-404", fleet.0),
                "has no visible placement placement-404",
            ),
            (
                "another Fleet's placement",
                format!("fleet:{}:right:{}", fleet.0, foreign.0),
                "has no visible placement",
            ),
            (
                "unknown Fleet",
                format!("fleet:fleet-404:top:{}", target.0),
                "no open Fleet fleet-404",
            ),
            (
                "bad side",
                format!("fleet:{}:up:{}", fleet.0, target.0),
                "invalid side up",
            ),
        ];
        for (name, text, expected) in cases {
            let (layout, shown) = settled(&model.layout, vec![labelled_at(&text)]);
            assert_eq!(layout, model.layout, "{name}");
            let shown = shown.unwrap_or_default();
            assert!(shown.contains("t9 was not placed"), "{name}: {shown}");
            assert!(shown.contains(expected), "{name}: {shown}");
        }
    }

    #[test]
    fn a_refused_side_label_leaves_no_stray_content_when_another_terminal_is_placed() {
        let (model, fleet, target) = crew();
        let bad = labelled_at(&format!("fleet:{}:left:placement-404", fleet.0));
        let mut good = labelled_at(&format!("fleet:{}:left:{}", fleet.0, target.0));
        good.terminal = CoreTerminalId("t10".into());
        let (layout, _) = settled(&model.layout, vec![bad, good]);
        assert_eq!(layout.vessels.len(), model.layout.vessels.len() + 1);
        assert_eq!(layout.voyages[0].fleets[0].placements.len(), 2);
    }
}
