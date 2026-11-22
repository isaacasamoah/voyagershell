use gpui::{AnyWindowHandle, App, Context, Global, Pixels, Point, Task};
use std::cell::{Cell, RefCell};
use std::rc::Rc;
use std::time::{Duration, Instant};

const REST: Duration = Duration::from_millis(120);

#[derive(Clone, Default)]
struct DragHold(Rc<RefCell<Option<async_channel::Receiver<()>>>>);

impl Global for DragHold {}

impl DragHold {
    fn holding(&self) -> bool {
        self.0
            .borrow()
            .as_ref()
            .is_some_and(|held| !held.is_closed())
    }

    async fn released(&self) {
        let held = self.0.borrow().clone();
        if let Some(held) = held {
            let _ = held.recv().await;
        }
    }
}

pub(crate) struct RedrawAtRest {
    hold: DragHold,
    waiting: Rc<Cell<bool>>,
}

impl RedrawAtRest {
    pub(crate) fn new(cx: &mut App) -> Self {
        Self {
            hold: cx.default_global::<DragHold>().clone(),
            waiting: Rc::default(),
        }
    }

    pub(crate) fn notify<T: 'static>(&self, cx: &mut Context<T>) {
        if !self.hold.holding() {
            cx.notify();
            return;
        }
        if self.waiting.replace(true) {
            return;
        }
        let hold = self.hold.clone();
        let waiting = Rc::clone(&self.waiting);
        cx.spawn(async move |view, cx| {
            hold.released().await;
            waiting.set(false);
            let _ = view.update(cx, |_, cx| cx.notify());
        })
        .detach();
    }
}

pub(super) struct Drag {
    pub(super) source: AnyWindowHandle,
    pub(super) start: Point<Pixels>,
    pub(super) position: Point<Pixels>,
    pub(super) offset: Point<Pixels>,
    pub(super) size: f32,
    pub(super) began: Instant,
    pub(super) moved: bool,
    pub(super) hold: Option<Hold>,
}

pub(super) struct Hold {
    last: Rc<Cell<Instant>>,
    held: async_channel::Receiver<()>,
    _rest: Task<()>,
}

impl Drag {
    pub(super) fn hold_terminals(&mut self, cx: &mut App) {
        let now = Instant::now();
        if let Some(hold) = self.hold.as_ref().filter(|hold| !hold.held.is_closed()) {
            hold.last.set(now);
            return;
        }
        let (release, held) = async_channel::bounded::<()>(1);
        cx.default_global::<DragHold>()
            .0
            .replace(Some(held.clone()));
        let last = Rc::new(Cell::new(now));
        let moved = Rc::clone(&last);
        let executor = cx.background_executor().clone();
        let rest = cx.foreground_executor().spawn(async move {
            let _release = release;
            while let Some(left) = REST
                .checked_sub(moved.get().elapsed())
                .filter(|left| !left.is_zero())
            {
                executor.timer(left).await;
            }
        });
        self.hold = Some(Hold {
            last,
            held,
            _rest: rest,
        });
    }
}
