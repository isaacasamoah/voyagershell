use gpui::{
    AnyElement, CursorStyle, Decorations, InteractiveElement as _, IntoElement as _, MouseButton,
    ResizeEdge, Styled as _, Tiling, Window, div, px,
};
use std::{cell::Cell, rc::Rc};

const EDGE: f32 = 6.0;

#[derive(Clone)]
pub struct Decorated(Rc<Cell<bool>>);

impl Decorated {
    pub fn new(window: &Window) -> Self {
        Self(Rc::new(Cell::new(client_decorated(window))))
    }

    pub fn update(&self, window: &Window) {
        self.0.set(client_decorated(window));
    }

    pub fn get(&self) -> bool {
        self.0.get()
    }
}

fn client_decorated(window: &Window) -> bool {
    matches!(window.window_decorations(), Decorations::Client { .. })
}

struct Grip {
    id: &'static str,
    edge: ResizeEdge,
    cursor: CursorStyle,
}

const GRIPS: [Grip; 8] = [
    Grip {
        id: "resize-top",
        edge: ResizeEdge::Top,
        cursor: CursorStyle::ResizeUpDown,
    },
    Grip {
        id: "resize-bottom",
        edge: ResizeEdge::Bottom,
        cursor: CursorStyle::ResizeUpDown,
    },
    Grip {
        id: "resize-left",
        edge: ResizeEdge::Left,
        cursor: CursorStyle::ResizeLeftRight,
    },
    Grip {
        id: "resize-right",
        edge: ResizeEdge::Right,
        cursor: CursorStyle::ResizeLeftRight,
    },
    Grip {
        id: "resize-top-left",
        edge: ResizeEdge::TopLeft,
        cursor: CursorStyle::ResizeUpLeftDownRight,
    },
    Grip {
        id: "resize-top-right",
        edge: ResizeEdge::TopRight,
        cursor: CursorStyle::ResizeUpRightDownLeft,
    },
    Grip {
        id: "resize-bottom-left",
        edge: ResizeEdge::BottomLeft,
        cursor: CursorStyle::ResizeUpRightDownLeft,
    },
    Grip {
        id: "resize-bottom-right",
        edge: ResizeEdge::BottomRight,
        cursor: CursorStyle::ResizeUpLeftDownRight,
    },
];

fn free(edge: ResizeEdge, tiling: Tiling) -> bool {
    let (top, bottom, left, right) = (!tiling.top, !tiling.bottom, !tiling.left, !tiling.right);
    match edge {
        ResizeEdge::Top => top,
        ResizeEdge::Bottom => bottom,
        ResizeEdge::Left => left,
        ResizeEdge::Right => right,
        ResizeEdge::TopLeft => top && left,
        ResizeEdge::TopRight => top && right,
        ResizeEdge::BottomLeft => bottom && left,
        ResizeEdge::BottomRight => bottom && right,
    }
}

pub fn grips(window: &Window) -> Vec<AnyElement> {
    let Decorations::Client { tiling } = window.window_decorations() else {
        return Vec::new();
    };
    if window.is_maximized() || window.is_fullscreen() {
        return Vec::new();
    }
    let edge = px(EDGE);
    GRIPS
        .iter()
        .filter(|grip| free(grip.edge, tiling))
        .map(|grip| {
            let target = grip.edge;
            let element = div()
                .id(grip.id)
                .absolute()
                .occlude()
                .cursor(grip.cursor)
                .on_mouse_down(MouseButton::Left, move |_, window, cx| {
                    cx.stop_propagation();
                    window.start_window_resize(target);
                });
            match grip.edge {
                ResizeEdge::Top => element.top_0().left(edge).right(edge).h(edge),
                ResizeEdge::Bottom => element.bottom_0().left(edge).right(edge).h(edge),
                ResizeEdge::Left => element.left_0().top(edge).bottom(edge).w(edge),
                ResizeEdge::Right => element.right_0().top(edge).bottom(edge).w(edge),
                ResizeEdge::TopLeft => element.top_0().left_0().size(edge * 2.),
                ResizeEdge::TopRight => element.top_0().right_0().size(edge * 2.),
                ResizeEdge::BottomLeft => element.bottom_0().left_0().size(edge * 2.),
                ResizeEdge::BottomRight => element.bottom_0().right_0().size(edge * 2.),
            }
            .into_any_element()
        })
        .collect()
}
