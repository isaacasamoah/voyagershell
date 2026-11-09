use crate::{avatar_motion::Frame, avatar_pack::Compiled};
use gpui::{AnyElement, Bounds, Corners, IntoElement, canvas, div, point, prelude::*, px, size};
use std::sync::Arc;

fn layer(pack: Arc<Compiled>, pose: usize, opacity: f32, diameter: f32) -> AnyElement {
    div()
        .absolute()
        .size_full()
        .opacity(opacity)
        .child(
            canvas(
                move |bounds, _, _| bounds,
                move |_, bounds, window, _| {
                    let Some(drawing) = pack.poses.get(pose) else {
                        return;
                    };
                    let zoom = f32::from(bounds.size.width) / pack.canvas.size[0] as f32;
                    let zoom = zoom.min(f32::from(bounds.size.height) / pack.canvas.size[1] as f32);
                    let origin = bounds.center()
                        - point(
                            px(pack.canvas.size[0] as f32 * zoom / 2.),
                            px(pack.canvas.size[1] as f32 * zoom / 2.),
                        );
                    let scale = zoom * drawing.pose.scale;
                    let [x, y, width, height] = drawing.pose.rect.map(|value| value as f32);
                    let at = origin
                        + point(
                            px(pack.canvas.anchor[0] * zoom - drawing.pose.anchor[0] * scale),
                            px(pack.canvas.anchor[1] * zoom - drawing.pose.anchor[1] * scale),
                        );
                    let clip = Bounds::new(at, size(px(width * scale), px(height * scale)));
                    let image = Bounds::new(
                        at - point(px(x * scale), px(y * scale)),
                        size(
                            px(drawing.image_size[0] as f32 * scale),
                            px(drawing.image_size[1] as f32 * scale),
                        ),
                    );
                    if let Err(error) = window.paint_image(
                        clip,
                        image,
                        Corners::default(),
                        Arc::clone(&drawing.image),
                        0,
                        false,
                    ) {
                        eprintln!("Avatar image paint failed: {error}");
                    }
                },
            )
            .absolute()
            .left(px(diameter * 0.14))
            .top(px(diameter * 0.14))
            .size(px((diameter - 2.) * 0.72)),
        )
        .into_any_element()
}

pub(super) fn layers(pack: Arc<Compiled>, frame: Frame, diameter: f32) -> AnyElement {
    let mut element =
        div()
            .absolute()
            .size_full()
            .child(layer(Arc::clone(&pack), frame.back, 1., diameter));
    if let Some((pose, opacity)) = frame.front {
        element = element.child(layer(pack, pose, opacity, diameter));
    }
    element.into_any_element()
}
