use std::{
    cell::{Cell, RefCell},
    rc::Rc,
    sync::Arc,
};

use anyhow::{Context as _, ensure};
use gpui::{
    AnyWindowHandle, App, AsyncApp, Global, ParentElement as _, Styled as _, Window, canvas, div,
};
use gpui_shell::{
    ArgumentDescriptor, ArgumentSchema, ComponentArgument, ComponentCallback, ComponentDescriptor,
    ComponentMaterializer, ComponentPayload, ComponentRegistry, ConstructorDescriptor,
    MaterializeRequest, RegistryError,
};

#[derive(Clone)]
pub struct Listener(Rc<Slot>);

impl Global for Listener {}

#[derive(Clone, Copy, PartialEq)]
enum Delivery {
    Settled,
    Owed,
    Retrying,
}

struct Slot {
    handler: RefCell<Option<ComponentCallback>>,
    delivery: Cell<Delivery>,
    raised: async_channel::Sender<()>,
    waiting: async_channel::Receiver<()>,
}

impl Default for Listener {
    fn default() -> Self {
        let (raised, waiting) = async_channel::bounded(1);
        Self(Rc::new(Slot {
            handler: RefCell::new(None),
            delivery: Cell::new(Delivery::Settled),
            raised,
            waiting,
        }))
    }
}

pub fn install(cx: &mut App) -> Listener {
    let listener = Listener::default();
    cx.set_global(listener.clone());
    listener
}

impl Listener {
    pub fn raise(&self) {
        let _ = self.0.raised.try_send(());
    }

    pub async fn deliver_to(self, window: AnyWindowHandle, cx: &mut AsyncApp) {
        while self.0.waiting.recv().await.is_ok() {
            if window
                .update(cx, |_, window, cx| self.deliver(window, cx))
                .is_err()
            {
                return;
            }
        }
    }

    fn deliver(&self, window: &mut Window, cx: &mut App) {
        let handler = self.0.handler.borrow().clone();
        let outcome = match handler {
            Some(handler) => handler.invoke_with(&[], window, cx),
            None => Err(anyhow::anyhow!("no notice handler is registered")),
        };
        let delivery = match (outcome, self.0.delivery.get()) {
            (Ok(()), _) => Delivery::Settled,
            (Err(error), Delivery::Retrying) => {
                eprintln!("Workspace notice not delivered: {error:#}");
                Delivery::Settled
            }
            (Err(_), Delivery::Settled | Delivery::Owed) => Delivery::Owed,
        };
        self.0.delivery.set(delivery);
    }

    fn listen(&self, handler: ComponentCallback) {
        self.0.handler.replace(Some(handler));
        if self.0.delivery.get() == Delivery::Owed {
            self.0.delivery.set(Delivery::Retrying);
            self.raise();
        }
    }
}

struct Materializer;

impl ComponentMaterializer for Materializer {
    fn materialize(&self, request: MaterializeRequest<'_>) -> anyhow::Result<gpui::AnyElement> {
        ensure!(
            request.children_len() == 0,
            "NoticeListener accepts no children"
        );
        let argument = request
            .payload()
            .downcast_ref::<ComponentArgument>()
            .context("NoticeListener requires a handler")?;
        let handler = request.resolve_callback(argument)?;
        let element = canvas(
            move |_, _, cx| {
                if let Some(listener) = cx.try_global::<Listener>() {
                    listener.listen(handler);
                }
            },
            |_, _, _, _| {},
        );
        request.finish(div().absolute().child(element))
    }
}

pub fn register(registry: &mut ComponentRegistry) -> Result<(), RegistryError> {
    registry.register(
        ComponentDescriptor::new("NoticeListener", Arc::new(Materializer)).with_constructors(vec![
            ConstructorDescriptor::new(
                "NoticeListener",
                vec![ArgumentDescriptor::new(
                    "handler",
                    ArgumentSchema::Callback("(cx: Context) => void"),
                )],
                |args| match args {
                    [argument @ ComponentArgument::Callback(_)] => {
                        Ok(ComponentPayload::new(argument.clone()))
                    }
                    _ => Err("NoticeListener requires a handler".into()),
                },
            ),
        ]),
    )?;
    Ok(())
}

#[cfg(all(test, target_os = "linux"))]
#[path = "notice_listener/tests.rs"]
mod tests;
