use std::{cell::RefCell, collections::HashMap, path::PathBuf, rc::Rc, sync::Arc};

use gpui::{AppContext as _, Entity, IntoElement as _, ParentElement as _, div};
use gpui_shell::{HostError, HostModule, HostValue};
use voyager_app::client::Client;
use voyager_contract::{VesselId, operations};

use crate::{bridge::Bridge, manifest_view::ManifestView};

#[derive(Clone)]
pub struct Host {
    packages: PathBuf,
    client: Client,
}

impl Host {
    pub fn new(packages: PathBuf, client: Client) -> Self {
        Self { packages, client }
    }

    pub fn module(&self) -> Result<HostModule, HostError> {
        let packages = self.packages.clone();
        let registry = Arc::new(voyager_app::content::open_registry(packages.clone()));
        let manifests = registry.clone();
        let client = self.client.clone();
        let opened: Rc<RefCell<HashMap<String, Entity<ManifestView>>>> =
            Rc::new(RefCell::new(HashMap::new()));
        Bridge::new(&operations::CONTENT_VIEW)
            .async_function("descriptions", move |_| {
                let packages = packages.clone();
                let registry = registry.clone();
                Ok(async move {
                    let catalog = voyager_app::content::discover_all(&packages, &registry)
                        .map_err(HostError::new)?;
                    let raw = serde_json::to_string(&catalog)
                        .map_err(|error| HostError::new(error.to_string()))?;
                    if raw.len() > voyager_app::content::ENVELOPE_LIMIT {
                        return Err(HostError::new(
                            "Content descriptions exceed the envelope limit",
                        ));
                    }
                    Ok(HostValue::from(raw))
                })
            })
            .component("Vessel", move |args, _, cx| {
                let prop = |name: &str| match args.props() {
                    HostValue::Object(fields) => fields.iter().find_map(|(key, value)| {
                        (key == name)
                            .then(|| value.as_str())
                            .flatten()
                            .map(str::to_owned)
                    }),
                    _ => None,
                };
                let (Some(id), Some(type_id)) = (prop("vesselId"), prop("typeId")) else {
                    return div()
                        .child("A Vessel needs an identity and a type")
                        .into_any_element();
                };
                let cached = opened.borrow().get(&id).cloned();
                if let Some(view) = cached {
                    return view.into_any_element();
                }
                let view = cx.new(|cx| {
                    ManifestView::new(
                        VesselId(id.clone()),
                        manifests.installed(&type_id),
                        client.clone(),
                        cx,
                    )
                });
                opened.borrow_mut().insert(id, view.clone());
                view.into_any_element()
            })
            .finish()
    }
}
