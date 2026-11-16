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
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Labelled {
    pub(crate) terminal: CoreTerminalId,
    pub(crate) place: Result<Place, String>,
    pub(crate) cwd: String,
    pub(crate) launch: Launch,
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
            launch: match program {
                Some(program) if crate::launch::is_agent_program(&program) => Launch::Program {
                    argv: vec![program],
                },
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
                        &place.0,
                        &labelled.terminal,
                        labelled.cwd.clone(),
                        labelled.launch.clone(),
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
            place: Ok(Place(voyager_contract::PlacementOwner::Fleet { id: fleet })),
            cwd: "/work".into(),
            launch: Launch::Terminal,
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
                json!({"argv":task,"cwd":"/work","labels":{"voyager.place":"fleet:fleet-2"}}),
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
        assert_eq!(
            found[0].launch,
            Launch::Program {
                argv: vec!["claude".into()]
            }
        );
        assert_eq!(
            found[0].place.as_ref().map(|place| &place.0),
            Ok(&voyager_contract::PlacementOwner::Fleet {
                id: voyager_contract::FleetId("fleet-2".into())
            })
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
}
