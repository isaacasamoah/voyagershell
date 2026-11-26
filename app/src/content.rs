mod description;
mod manifest;
mod package;
pub(crate) mod requests;
pub use description::{describe, discover, require_action};
pub use description::{discover_all, open_registry};
pub(crate) use manifest::valid_type_id;
pub mod install;

pub use install::{Installed, Shipped, Update};

pub fn install_and_open(profile: &Path, files: &[Shipped]) -> std::io::Result<(Installed, Owner)> {
    let installed = install::install(profile, files)?;
    Ok((installed, Owner::open(profile)?))
}

use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};
use voyager_contract::{
    VesselId,
    content::{Request, Response, Version},
};

pub const LIMIT: usize = 1024 * 1024;
pub const ENVELOPE_LIMIT: usize = LIMIT + 16 * 1024;

pub(crate) fn fingerprint(value: &impl serde::Serialize) -> [u8; 32] {
    let mut value = serde_json::to_value(value).expect("Content identity serializes");
    value.sort_all_objects();
    Sha256::digest(serde_json::to_vec(&value).expect("Content identity serializes")).into()
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Binding(VesselId);

impl Binding {
    pub(crate) fn id(&self) -> &VesselId {
        &self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Access {
    View(Binding),
    Agent {
        scope: voyager_contract::Context,
        expected_version: u64,
    },
}

pub fn identity(request: &Request) -> (&VesselId, &str, Option<&str>) {
    match request {
        Request::Describe {
            vessel_id,
            request_id,
            ..
        }
        | Request::Inspect {
            vessel_id,
            request_id,
            ..
        } => (vessel_id, request_id, None),
        Request::Invoke {
            vessel_id,
            request_id,
            expected_revision,
            ..
        } => (vessel_id, request_id, Some(expected_revision)),
    }
}

pub fn reject(request: &Request, message: String) -> Response {
    let (id, request_id, expected) = identity(request);
    Response::Rejected {
        version: Version::V1,
        request_id: request_id.into(),
        vessel_id: id.clone(),
        expected_revision: expected.map(str::to_owned),
        message,
    }
}

pub struct Owner {
    root: PathBuf,
    registry: std::sync::Arc<manifest::Registry>,
}

impl Owner {
    pub fn open(profile: &Path) -> std::io::Result<Self> {
        let root = profile.join("data");
        fs::create_dir_all(&root)?;
        Ok(Self {
            root,
            registry: std::sync::Arc::new(description::open_registry(profile.join("vessels"))),
        })
    }

    fn package_path(&self, type_id: &str) -> Result<PathBuf, String> {
        let name = self
            .registry
            .folder(type_id)
            .ok_or("This Vessel type has no removable package")?;
        Ok(self
            .root
            .parent()
            .expect("profile root")
            .join("vessels")
            .join(name))
    }

    fn manifest_entry(
        &self,
        layout: &voyager_contract::Layout,
        id: &VesselId,
    ) -> Option<manifest::Entry> {
        let vessel = layout.vessels.iter().find(|vessel| vessel.id == *id)?;
        self.registry.find(&vessel.type_id)
    }

    fn manifest_call(
        &mut self,
        layout: &std::sync::Arc<voyager_contract::Layout>,
        version: u64,
        access: &Access,
        request: &Request,
    ) -> Option<Response> {
        let (id, request_id, _) = identity(request);
        let entry = self.manifest_entry(layout, id)?;
        let outcome = (|| {
            let scope = match access {
                Access::View(binding) if binding.id() == id => None,
                Access::View(_) => return Err("That content is outside this view".to_owned()),
                Access::Agent {
                    scope,
                    expected_version,
                } if *expected_version == version => Some(scope),
                Access::Agent { .. } => {
                    return Err(
                        "Workspace revision changed; inspect before content dispatch".into(),
                    );
                }
            };
            manifest::placed(layout, scope, id)?;
            manifest::respond(&self.root, ENVELOPE_LIMIT, entry, id, request_id, request)
        })();
        Some(outcome.unwrap_or_else(|message| reject(request, message)))
    }

    pub fn require_available(&self, type_id: &str) -> Result<(), String> {
        description::require_available(&self.registry, type_id)
    }

    pub fn remove_package(&mut self, type_id: &str) -> Result<(), String> {
        package::remove(&self.package_path(type_id)?)
    }

    pub fn restore_package(&mut self, type_id: &str) -> Result<(), String> {
        package::restore(&self.package_path(type_id)?)
    }
}

#[cfg(test)]
mod tests {
    use super::requests::{bind, run};
    use super::*;

    #[test]
    fn built_in_descriptions_name_their_views_and_refuse_unsupported_actions() {
        let catalog = discover().unwrap();
        assert_eq!(catalog.types.len(), 3);
        let terminal = describe("terminal").unwrap();
        let agents = describe("agents").unwrap();
        assert_eq!(terminal.view.module, "voyager_native");
        assert_eq!(terminal.view.component, "Terminal");
        assert!(terminal.backend.is_some());
        assert!(terminal.state.is_none());
        assert_eq!(agents.view.module, "./agents.js");
        assert_eq!(agents.view.component, "agentsView");
        assert!(agents.backend.is_none());
        assert!(agents.state.is_none());
        assert_eq!(agents.actions.as_ref().unwrap().names, ["list"]);
        assert!(require_action(&agents, "list").is_ok());
        assert!(require_action(&agents, "send").is_err());
        let agents_validator =
            jsonschema::validator_for(&agents.actions.as_ref().unwrap().input_schema).unwrap();
        assert!(agents_validator.is_valid(&serde_json::json!({
            "expectedVersion": "7", "action": {"operation": "list"}
        })));
        let stop = serde_json::json!({
            "expectedVersion": "7",
            "action": {"operation": "stop", "vesselId": "opaque-id", "terminalId": "terminal", "pid": 7}
        });
        assert!(
            jsonschema::validator_for(&terminal.actions.as_ref().unwrap().input_schema)
                .unwrap()
                .is_valid(&stop)
        );
        assert!(!agents_validator.is_valid(&stop));
        assert!(require_action(&terminal, "launch-another-program").is_err());
        assert!(describe("unknown").is_err());
        let mut model = crate::workspace::Model::default();
        model
            .apply(voyager_contract::Action::CreateVoyage {
                name: "Test".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        let before_layout = model.layout.clone();
        assert!(
            model
                .apply(voyager_contract::Action::CreateVessel {
                    launch: None,
                    type_id: "Not Valid".into(),
                    destination: voyager_contract::ContentDestination::Placement {
                        owner: voyager_contract::PlacementOwner::Portals {
                            voyage: before_layout.voyages[0].id.clone()
                        },
                        insertion: voyager_contract::PlacementInsertion::Empty
                    }
                })
                .is_err()
        );
        assert_eq!(model.layout, before_layout);
    }

    #[test]
    fn fingerprints_ignore_nested_object_order_but_keep_payload_identity() {
        let first: serde_json::Value = serde_json::from_str(r#"{"expectedVersion":"7","action":{"operation":"invoke","args":{"title":"Title","text":"Body"}}}"#).unwrap();
        let mut reordered: serde_json::Value = serde_json::from_str(r#"{"action":{"args":{"text":"Body","title":"Title"},"operation":"invoke"},"expectedVersion":"7"}"#).unwrap();
        assert_eq!(fingerprint(&first), fingerprint(&reordered));
        reordered["action"]["args"]["text"] = "Changed".into();
        assert_ne!(fingerprint(&first), fingerprint(&reordered));
    }

    #[test]
    fn a_saved_vessel_of_a_type_with_no_package_loads_and_refuses_content_without_writing() {
        use voyager_contract::{Action, Context};
        let profile =
            std::env::temp_dir().join(format!("voyager-unavailable-type-{}", std::process::id()));
        let _ = fs::remove_dir_all(&profile);
        let mut owner = Owner::open(&profile).unwrap();
        let mut model = crate::workspace::Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Test".into(),
                cwd: profile.to_string_lossy().into_owned(),
            })
            .unwrap();
        model
            .apply(Action::CreateVessel {
                launch: None,
                type_id: "dashboard".into(),
                destination: voyager_contract::ContentDestination::Placement {
                    owner: voyager_contract::PlacementOwner::Portals {
                        voyage: model.layout.voyages[0].id.clone(),
                    },
                    insertion: voyager_contract::PlacementInsertion::Empty,
                },
            })
            .unwrap();
        let stored: serde_json::Map<String, serde_json::Value> =
            [("panel".to_owned(), serde_json::json!({"rows": 3}))]
                .into_iter()
                .collect();
        model.layout.vessels.last_mut().unwrap().configuration = Some(stored.clone());
        let saved = model.layout.clone();
        let id = saved.vessels.last().unwrap().id.clone();
        let placement = saved.voyages[0].portals[0].clone();
        let loaded = crate::workspace::Model::prepare(saved, &profile.to_string_lossy()).unwrap();
        let vessel = loaded.vessels.iter().find(|item| item.id == id).unwrap();
        assert_eq!(vessel.type_id, "dashboard");
        assert_eq!(vessel.configuration.as_ref(), Some(&stored));
        assert_eq!(loaded.voyages[0].portals, [placement]);
        assert_eq!(
            open_registry(profile.join("vessels")).installed("dashboard"),
            Err(None)
        );
        assert_eq!(
            owner.require_available("dashboard").unwrap_err(),
            "Unsupported Vessel type"
        );
        let layout = std::sync::Arc::new(loaded);
        assert!(bind(&mut owner, &layout, &id).is_err());
        let requests = [
            Request::Describe {
                version: Version::V1,
                request_id: "describe".into(),
                vessel_id: id.clone(),
            },
            Request::Inspect {
                version: Version::V1,
                request_id: "inspect".into(),
                vessel_id: id.clone(),
            },
        ];
        for access in [
            Access::View(Binding(id.clone())),
            Access::Agent {
                scope: Context::Workspace,
                expected_version: 7,
            },
        ] {
            for request in &requests {
                let response = run(&mut owner, &layout, 7, &access, request.clone());
                assert!(
                    matches!(&response, Response::Rejected { vessel_id, .. } if *vessel_id == id),
                    "{response:?}"
                );
            }
        }
        assert_eq!(fs::read_dir(profile.join("data")).unwrap().count(), 0);
        fs::remove_dir_all(profile).unwrap();
    }
}
