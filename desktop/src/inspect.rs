use std::{
    cell::RefCell,
    collections::BTreeMap,
    fs,
    panic::Location,
    path::{Path, PathBuf},
    rc::Rc,
    sync::Arc,
    time::Duration,
};

use anyhow::Context as _;
use gpui::{
    AnyElement, App, AppContext as _, Bounds, ElementId, Global, GlobalElementId,
    InspectorElementId, IntoElement, LayoutId, Pixels, Position, Style, Window, WindowId, px,
    relative,
};
use gpui_shell::{
    ArgumentDescriptor, ArgumentSchema, ComponentArgument, ComponentDescriptor,
    ComponentMaterializer, ComponentPayload, ComponentRegistry, ConstructorDescriptor,
    MaterializeRequest, RegistryError,
};
use voyager_contract::{
    Context,
    inspection::{Element, Frame, Rect, Role, Window as Viewport},
};

#[cfg(all(test, target_os = "linux"))]
mod tests;

const PERIOD: Duration = Duration::from_millis(16);

struct Inspection(Rc<RefCell<Ledger>>);

impl Global for Inspection {}

struct Ledger {
    window: WindowId,
    stage: Option<(Viewport, Context)>,
    slots: BTreeMap<u64, Element>,
    opened: u64,
    sequence: u64,
    changed: bool,
    changes: async_channel::Sender<()>,
}

impl Ledger {
    fn touch(&mut self) {
        self.changed = true;
        let _ = self.changes.try_send(());
    }

    fn place(&mut self, slot: u64, element: Option<Element>) {
        if self.slots.get(&slot) == element.as_ref() {
            return;
        }
        match element {
            Some(element) => self.slots.insert(slot, element),
            None => self.slots.remove(&slot),
        };
        self.touch();
    }

    fn frame(&mut self) -> Option<Frame> {
        let (window, dock) = self.stage.clone()?;
        if !std::mem::take(&mut self.changed) {
            return None;
        }
        self.sequence += 1;
        let mut identities: BTreeMap<_, Vec<_>> = BTreeMap::new();
        for element in self.slots.values() {
            identities
                .entry((element.role, element.key.as_str()))
                .or_default()
                .push(element);
        }
        let (elements, ambiguous): (Vec<_>, Vec<_>) =
            identities.into_values().partition(|drawn| drawn.len() == 1);
        let listed = |groups: Vec<Vec<&Element>>| groups.into_iter().flatten().cloned().collect();
        Some(Frame {
            sequence: self.sequence,
            window,
            dock,
            elements: listed(elements),
            ambiguous: listed(ambiguous),
        })
    }
}

struct Slot {
    ledger: Rc<RefCell<Ledger>>,
    id: u64,
}

impl Drop for Slot {
    fn drop(&mut self) {
        self.ledger.borrow_mut().place(self.id, None);
    }
}

struct Marker {
    id: ElementId,
    role: Role,
    key: String,
}

impl IntoElement for Marker {
    type Element = Self;

    fn into_element(self) -> Self {
        self
    }
}

impl gpui::Element for Marker {
    type RequestLayoutState = ();
    type PrepaintState = ();

    fn id(&self) -> Option<ElementId> {
        Some(self.id.clone())
    }

    fn source_location(&self) -> Option<&'static Location<'static>> {
        None
    }

    fn request_layout(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, ()) {
        let mut style = Style {
            position: Position::Absolute,
            ..Style::default()
        };
        style.inset.top = px(0.).into();
        style.inset.left = px(0.).into();
        style.size.width = relative(1.).into();
        style.size.height = relative(1.).into();
        (window.request_layout(style, [], cx), ())
    }

    fn prepaint(
        &mut self,
        id: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        bounds: Bounds<Pixels>,
        _: &mut (),
        window: &mut Window,
        cx: &mut App,
    ) {
        let (Some(id), Some(inspection)) = (id, cx.try_global::<Inspection>()) else {
            return;
        };
        let ledger = inspection.0.clone();
        if ledger.borrow().window != window.window_handle().window_id() {
            return;
        }
        let drawn = bounds.intersect(&window.content_mask().bounds);
        let element = (!drawn.is_empty()).then(|| Element {
            role: self.role,
            key: self.key.clone(),
            bounds: Rect {
                x: drawn.origin.x.into(),
                y: drawn.origin.y.into(),
                width: drawn.size.width.into(),
                height: drawn.size.height.into(),
            },
        });
        window.with_element_state(id, |slot: Option<Slot>, _| {
            let slot = slot.unwrap_or_else(|| {
                let mut opening = ledger.borrow_mut();
                opening.opened += 1;
                Slot {
                    ledger: ledger.clone(),
                    id: opening.opened,
                }
            });
            ledger.borrow_mut().place(slot.id, element);
            ((), slot)
        });
    }

    fn paint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        _: Bounds<Pixels>,
        _: &mut (),
        _: &mut (),
        _: &mut Window,
        _: &mut App,
    ) {
    }
}

pub fn avatar() -> impl IntoElement {
    Marker {
        id: "inspect-avatar".into(),
        role: Role::Avatar,
        key: String::new(),
    }
}

pub fn stage(dock: &Context, window: &Window, cx: &App) {
    let Some(inspection) = cx.try_global::<Inspection>() else {
        return;
    };
    let mut ledger = inspection.0.borrow_mut();
    if ledger.window != window.window_handle().window_id() {
        return;
    }
    let size = window.viewport_size();
    let stage = Some((
        Viewport {
            width: size.width.into(),
            height: size.height.into(),
            scale: window.scale_factor(),
        },
        dock.clone(),
    ));
    if ledger.stage != stage {
        ledger.stage = stage;
        ledger.touch();
    }
}

pub fn install(path: Option<PathBuf>, window: &Window, cx: &mut App) {
    let Some(path) = path else {
        return;
    };
    let (changes, changed) = async_channel::bounded(1);
    let ledger = Rc::new(RefCell::new(Ledger {
        window: window.window_handle().window_id(),
        stage: None,
        slots: BTreeMap::new(),
        opened: 0,
        sequence: 0,
        changed: false,
        changes,
    }));
    cx.set_global(Inspection(ledger.clone()));
    cx.spawn(async move |cx| {
        while changed.recv().await.is_ok() {
            let Some(frame) = ledger.borrow_mut().frame() else {
                continue;
            };
            let path = path.clone();
            let written = cx
                .background_spawn(async move { write(&path, &frame) })
                .await;
            if let Err(error) = written {
                eprintln!("Inspection stopped: {error}");
                return;
            }
            cx.background_executor().timer(PERIOD).await;
        }
    })
    .detach();
}

fn write(path: &Path, frame: &Frame) -> std::io::Result<()> {
    let mut partial = path.as_os_str().to_owned();
    partial.push(".partial");
    fs::write(&partial, serde_json::to_vec(frame)?)?;
    fs::rename(&partial, path)
}

struct Component;

impl ComponentMaterializer for Component {
    fn materialize(&self, request: MaterializeRequest<'_>) -> anyhow::Result<AnyElement> {
        let (role, key) = request
            .payload()
            .downcast_ref::<(Role, String)>()
            .context("Marker requires a role")?
            .clone();
        Ok(Marker {
            id: request.element_id().clone(),
            role,
            key,
        }
        .into_any_element())
    }
}

pub fn register(registry: &mut ComponentRegistry) -> Result<(), RegistryError> {
    registry.register(
        ComponentDescriptor::new("Marker", Arc::new(Component)).with_constructors(vec![
            ConstructorDescriptor::new(
                "Marker",
                vec![
                    ArgumentDescriptor::new("role", ArgumentSchema::Enum(Role::NAMES)),
                    ArgumentDescriptor::new(
                        "key",
                        ArgumentSchema::Optional(Box::new(ArgumentSchema::String)),
                    ),
                ],
                |args| match args {
                    [
                        ComponentArgument::Enum(role),
                        ComponentArgument::Optional(key),
                    ] => {
                        let role = Role::parse(role).ok_or("Marker requires a known role")?;
                        let key = match key.as_deref() {
                            Some(ComponentArgument::String(key)) => key.clone(),
                            _ => String::new(),
                        };
                        Ok(ComponentPayload::new((role, key)))
                    }
                    _ => Err("Marker requires a role and an optional key".into()),
                },
            ),
        ]),
    )?;
    Ok(())
}
