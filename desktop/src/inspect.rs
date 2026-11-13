use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use gpui::{AnyElement, IntoElement as _, ParentElement as _, Styled as _, canvas, div};
use gpui_shell::{
    ArgumentDescriptor, ArgumentSchema, ComponentArgument, ComponentDescriptor,
    ComponentMaterializer, ComponentPayload, ComponentRegistry, ConstructorDescriptor,
    MaterializeRequest, RegistryError,
};
use serde_json::{Value, json};

#[derive(Default)]
struct Store {
    elements: BTreeMap<String, Value>,
    state: BTreeMap<String, Value>,
    dirty: bool,
}

static STORE: OnceLock<Option<Arc<Mutex<Store>>>> = OnceLock::new();
static START: OnceLock<Instant> = OnceLock::new();

fn store() -> Option<&'static Arc<Mutex<Store>>> {
    STORE
        .get_or_init(|| {
            let path = PathBuf::from(std::env::var_os("VOYAGER_INSPECT")?);
            let store = Arc::new(Mutex::new(Store::default()));
            let writer = store.clone();
            START.get_or_init(Instant::now);
            std::thread::spawn(move || {
                let mut sequence = 0u64;
                loop {
                    std::thread::sleep(Duration::from_millis(16));
                    let snapshot = {
                        let mut store = writer.lock().unwrap();
                        if !store.dirty {
                            continue;
                        }
                        store.dirty = false;
                        sequence += 1;
                        json!({"sequence":sequence,"writtenMs":START.get().unwrap().elapsed().as_millis() as u64,"elements":store.elements,"state":store.state})
                    };
                    let temporary = path.with_extension("tmp");
                    if std::fs::write(&temporary, snapshot.to_string()).is_ok() {
                        let _ = std::fs::rename(&temporary, &path);
                    }
                }
            });
            Some(store)
        })
        .as_ref()
}

pub fn enabled() -> bool {
    store().is_some()
}

pub fn state(key: &str, value: Value) {
    if let Some(store) = store() {
        let mut store = store.lock().unwrap();
        if store.state.get(key) != Some(&value) {
            store.state.insert(key.into(), value);
            store.dirty = true;
        }
    }
}

pub fn marker(id: String, label: Option<String>) -> AnyElement {
    if !enabled() {
        return div().absolute().into_any_element();
    }
    canvas(
        move |bounds, window, _| {
            let Some(store) = store() else { return };
            let scale = window.scale_factor();
            let value = json!({
                "label": label,
                "x": f32::from(bounds.origin.x),
                "y": f32::from(bounds.origin.y),
                "width": f32::from(bounds.size.width),
                "height": f32::from(bounds.size.height),
                "scale": scale,
                "seenMs": START.get().unwrap().elapsed().as_millis() as u64,
            });
            let mut store = store.lock().unwrap();
            let changed = store.elements.get(&id).is_none_or(|old| {
                ["x", "y", "width", "height", "label"]
                    .iter()
                    .any(|key| old[key] != value[key])
            });
            store.elements.insert(id.clone(), value);
            if changed {
                store.dirty = true;
            }
        },
        |_, _, _, _| (),
    )
    .absolute()
    .top_0()
    .left_0()
    .size_full()
    .into_any_element()
}

struct Inspect;

impl ComponentMaterializer for Inspect {
    fn materialize(&self, request: MaterializeRequest<'_>) -> anyhow::Result<AnyElement> {
        let (id, label) = request
            .payload()
            .downcast_ref::<(String, Option<String>)>()
            .cloned()
            .unwrap_or_default();
        if !enabled() {
            return request.finish(div().absolute());
        }
        request.finish(div().absolute().top_0().left_0().size_full().child(marker(id, label)))
    }
}

pub fn register(registry: &mut ComponentRegistry) -> Result<(), RegistryError> {
    registry.register(
        ComponentDescriptor::new("Inspect", Arc::new(Inspect)).with_constructors(vec![
            ConstructorDescriptor::new(
                "Inspect",
                vec![
                    ArgumentDescriptor::new("id", ArgumentSchema::String),
                    ArgumentDescriptor::new(
                        "label",
                        ArgumentSchema::Optional(Box::new(ArgumentSchema::String)),
                    ),
                ],
                |args| match args {
                    [ComponentArgument::String(id), ComponentArgument::Optional(label)] => {
                        Ok(ComponentPayload::new((
                            id.clone(),
                            match label.as_deref() {
                                Some(ComponentArgument::String(label)) => Some(label.clone()),
                                _ => None,
                            },
                        )))
                    }
                    _ => Err("Inspect requires an identity".into()),
                },
            ),
        ]),
    )?;
    Ok(())
}
