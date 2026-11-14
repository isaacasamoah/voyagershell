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
    AnyElement, App, AppContext as _, Bounds, ElementId, Entity, Global, GlobalElementId,
    InspectorElementId, IntoElement, LayoutId, Pixels, Position, Style, WeakEntity, Window,
    WindowId, px, relative,
};
use gpui_base::input::InputState;
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
    stage: Option<Stage>,
    slots: BTreeMap<u64, Drawn>,
    opened: u64,
    sequence: u64,
    changed: bool,
    changes: async_channel::Sender<()>,
}

#[derive(Clone, PartialEq)]
struct Stage {
    window: Viewport,
    dock: Context,
    dock_focus: Option<Context>,
}

#[derive(PartialEq)]
enum Drawn {
    Control {
        element: Element,
        draft: Option<WeakEntity<InputState>>,
    },
    Prepared,
}

fn drafted(draft: &WeakEntity<InputState>, cx: &App) -> Option<String> {
    let draft = draft.upgrade()?;
    Some(draft.read(cx).value().to_string())
}

impl Ledger {
    fn touch(&mut self) {
        self.changed = true;
        let _ = self.changes.try_send(());
    }

    fn place(&mut self, slot: u64, drawn: Option<Drawn>) {
        if self.slots.get(&slot) == drawn.as_ref() {
            return;
        }
        match drawn {
            Some(drawn) => self.slots.insert(slot, drawn),
            None => self.slots.remove(&slot),
        };
        self.touch();
    }

    fn redraft(&mut self, cx: &App) {
        let mut changed = false;
        for drawn in self.slots.values_mut() {
            if let Drawn::Control {
                element,
                draft: Some(draft),
            } = drawn
                && let Some(text) = drafted(draft, cx)
                && element.label.as_deref() != Some(text.as_str())
            {
                element.label = Some(text);
                changed = true;
            }
        }
        if changed {
            self.touch();
        }
    }

    fn frame(&mut self) -> Option<Frame> {
        let Stage {
            window,
            dock,
            dock_focus,
        } = self.stage.clone()?;
        if !std::mem::take(&mut self.changed) {
            return None;
        }
        self.sequence += 1;
        let mut identities: BTreeMap<_, Vec<_>> = BTreeMap::new();
        let mut prepared = false;
        for drawn in self.slots.values() {
            match drawn {
                Drawn::Control { element, .. } => identities
                    .entry((element.role, element.key.as_str()))
                    .or_default()
                    .push(element),
                Drawn::Prepared => prepared = true,
            }
        }
        let (elements, ambiguous): (Vec<_>, Vec<_>) =
            identities.into_values().partition(|drawn| drawn.len() == 1);
        let listed = |groups: Vec<Vec<&Element>>| groups.into_iter().flatten().cloned().collect();
        Some(Frame {
            sequence: self.sequence,
            window,
            dock,
            dock_focus,
            prepared,
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
    mark: Mark,
}

enum Mark {
    Control {
        role: Role,
        key: String,
        shown: Shown,
    },
    Prepared(bool),
}

enum Shown {
    Nothing,
    Text(String),
    Draft(WeakEntity<InputState>),
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
        let drawn = match &self.mark {
            Mark::Prepared(prepared) => prepared.then_some(Drawn::Prepared),
            Mark::Control { role, key, shown } => {
                let visible = bounds.intersect(&window.content_mask().bounds);
                let (label, draft) = match shown {
                    Shown::Nothing => (None, None),
                    Shown::Text(text) => (Some(text.clone()), None),
                    Shown::Draft(draft) => (drafted(draft, cx), Some(draft.clone())),
                };
                (!visible.is_empty()).then(|| Drawn::Control {
                    element: Element {
                        role: *role,
                        key: key.clone(),
                        label,
                        bounds: Rect {
                            x: visible.origin.x.into(),
                            y: visible.origin.y.into(),
                            width: visible.size.width.into(),
                            height: visible.size.height.into(),
                        },
                    },
                    draft,
                })
            }
        };
        window.with_element_state(id, |slot: Option<Slot>, _| {
            let slot = slot.unwrap_or_else(|| {
                let mut opening = ledger.borrow_mut();
                opening.opened += 1;
                Slot {
                    ledger: ledger.clone(),
                    id: opening.opened,
                }
            });
            ledger.borrow_mut().place(slot.id, drawn);
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
        mark: Mark::Control {
            role: Role::Avatar,
            key: String::new(),
            shown: Shown::Nothing,
        },
    }
}

pub fn stage(dock: &Context, dock_focus: Option<Context>, window: &Window, cx: &App) {
    let Some(inspection) = cx.try_global::<Inspection>() else {
        return;
    };
    let mut ledger = inspection.0.borrow_mut();
    if ledger.window != window.window_handle().window_id() {
        return;
    }
    let size = window.viewport_size();
    let stage = Some(Stage {
        window: Viewport {
            width: size.width.into(),
            height: size.height.into(),
            scale: window.scale_factor(),
        },
        dock: dock.clone(),
        dock_focus,
    });
    if ledger.stage != stage {
        ledger.stage = stage;
        ledger.touch();
    }
    ledger.redraft(cx);
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

enum Marked {
    Control(Role, String, Option<String>),
    Editor(String, ComponentArgument),
    Composer(ComponentArgument),
    Prepared(bool),
}

impl ComponentMaterializer for Component {
    fn materialize(&self, request: MaterializeRequest<'_>) -> anyhow::Result<AnyElement> {
        let marked = request
            .payload()
            .downcast_ref::<Marked>()
            .context("Marker requires a role")?;
        let mark = match marked {
            Marked::Control(role, key, label) => Mark::Control {
                role: *role,
                key: key.clone(),
                shown: label.clone().map_or(Shown::Nothing, Shown::Text),
            },
            Marked::Editor(key, state) => Mark::Control {
                role: Role::NameEditor,
                key: key.clone(),
                shown: Shown::Draft(
                    request.with_state::<Entity<InputState>, _>(state, Entity::downgrade)?,
                ),
            },
            Marked::Composer(state) => Mark::Control {
                role: Role::ChatComposer,
                key: String::new(),
                shown: Shown::Draft(
                    request.with_state::<Entity<InputState>, _>(state, Entity::downgrade)?,
                ),
            },
            Marked::Prepared(prepared) => Mark::Prepared(*prepared),
        };
        Ok(Marker {
            id: request.element_id().clone(),
            mark,
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
                    ArgumentDescriptor::new(
                        "label",
                        ArgumentSchema::Optional(Box::new(ArgumentSchema::String)),
                    ),
                ],
                |args| match args {
                    [
                        ComponentArgument::Enum(role),
                        ComponentArgument::Optional(key),
                        ComponentArgument::Optional(label),
                    ] => {
                        let role = Role::parse(role).ok_or("Marker requires a known role")?;
                        let text =
                            |argument: &Option<Box<ComponentArgument>>| match argument.as_deref() {
                                Some(ComponentArgument::String(text)) => Some(text.clone()),
                                _ => None,
                            };
                        Ok(ComponentPayload::new(Marked::Control(
                            role,
                            text(key).unwrap_or_default(),
                            text(label),
                        )))
                    }
                    _ => {
                        Err("Marker requires a role, an optional key and an optional label".into())
                    }
                },
            ),
            ConstructorDescriptor::new(
                "EditorMarker",
                vec![
                    ArgumentDescriptor::new("key", ArgumentSchema::String),
                    ArgumentDescriptor::new("state", ArgumentSchema::Entity("NameState")),
                ],
                |args| match args {
                    [
                        ComponentArgument::String(key),
                        state @ ComponentArgument::Entity { .. },
                    ] => Ok(ComponentPayload::new(Marked::Editor(
                        key.clone(),
                        state.clone(),
                    ))),
                    _ => Err("EditorMarker requires an id and NameState".into()),
                },
            ),
            ConstructorDescriptor::new(
                "ComposerMarker",
                vec![ArgumentDescriptor::new(
                    "state",
                    ArgumentSchema::Entity("ComposerState"),
                )],
                |args| match args {
                    [state @ ComponentArgument::Entity { .. }] => {
                        Ok(ComponentPayload::new(Marked::Composer(state.clone())))
                    }
                    _ => Err("ComposerMarker requires ComposerState".into()),
                },
            ),
            ConstructorDescriptor::new(
                "Prepared",
                vec![ArgumentDescriptor::new("prepared", ArgumentSchema::Boolean)],
                |args| match args {
                    [ComponentArgument::Boolean(prepared)] => {
                        Ok(ComponentPayload::new(Marked::Prepared(*prepared)))
                    }
                    _ => Err("Prepared requires true or false".into()),
                },
            ),
        ]),
    )?;
    Ok(())
}
