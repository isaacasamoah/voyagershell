use crate::shipped::StandardCanvas;
use gpui::{
    AnyElement, App, Bounds, Div, InteractiveElement, IntoElement, MouseButton, MouseDownEvent,
    ParentElement, Pixels, Size, Stateful, StatefulInteractiveElement, Styled, Window, deferred,
    div, point, px, relative, rgb, size,
};
use std::rc::Rc;
use voyager_app::content::install::{Reason, Update};
use voyager_contract::inspection::Role;

const DIFF_LINES: usize = 6;
const CARD_WIDTH: f32 = 460.;
const NARROWEST: f32 = 240.;
const SIDE: f32 = 12.;
const END: f32 = 8.;
const CLEARANCE: f32 = 8.;
const PADDING: f32 = 10.;
const BUTTON_GAP: f32 = 8.;
const BUTTON_PADDING: f32 = 4.;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Corner {
    Bottom,
    Top,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Place {
    region: Bounds<Pixels>,
    corner: Corner,
}

pub(crate) fn place(
    window: Size<Pixels>,
    avatar: Option<Bounds<Pixels>>,
    height: impl Fn(Pixels) -> Pixels,
) -> Place {
    let whole = Bounds::from_corners(
        point(px(SIDE), px(END)),
        point(window.width - px(SIDE), window.height - px(END)),
    );
    let bottom = |region| Place {
        region,
        corner: Corner::Bottom,
    };
    let Some(avatar) = avatar else {
        return bottom(whole);
    };
    let keep = avatar.dilate(px(CLEARANCE));
    let card = |region: Bounds<Pixels>| {
        let width = region.size.width.min(px(CARD_WIDTH));
        let height = height(width);
        (width >= px(NARROWEST) && height <= region.size.height).then(|| {
            Bounds::new(
                point(region.right() - width, region.bottom() - height),
                size(width, height),
            )
        })
    };
    if card(whole).is_some_and(|card| !card.intersects(&keep)) {
        return bottom(whole);
    }
    [
        Bounds::from_corners(point(keep.right(), whole.top()), whole.bottom_right()),
        Bounds::from_corners(whole.origin, point(keep.left(), whole.bottom())),
        Bounds::from_corners(whole.origin, point(whole.right(), keep.top())),
    ]
    .into_iter()
    .find(|region| card(*region).is_some())
    .map_or(
        Place {
            region: whole,
            corner: Corner::Top,
        },
        bottom,
    )
}

fn card_height(text: &str, width: Pixels, window: &Window) -> Pixels {
    let style = window.text_style();
    let rem = window.rem_size();
    let line = style.line_height_in_pixels(rem);
    let lines = window
        .text_system()
        .shape_text(
            text.to_owned().into(),
            style.font_size.to_pixels(rem),
            &[style.to_run(text.len())],
            Some(width - px(2. * PADDING)),
            None,
        )
        .map_or(text.lines().count(), |shaped| {
            shaped
                .iter()
                .map(|line| line.wrap_boundaries.len() + 1)
                .sum()
        });
    px(2. * PADDING + BUTTON_GAP + 2. * BUTTON_PADDING) + line * (lines + 1) as f32
}

pub(crate) fn load_failure(
    error: &anyhow::Error,
    kept_files: &[String],
    standard: &StandardCanvas,
) -> String {
    let mut message = format!("Canvas load failed: {error:#}");
    for path in kept_files
        .iter()
        .filter(|path| path.starts_with("canvas/") && path.ends_with(".js"))
    {
        message.push_str(&format!("\nYour edited file is kept: {path}"));
    }
    match standard {
        StandardCanvas::NotNeeded => {}
        StandardCanvas::Drawn { .. } => {
            message.push_str("\nShowing the standard canvas until it loads.")
        }
        StandardCanvas::Failed(text) => {
            message.push_str(&format!("\nThe shipped canvas also failed: {text}"))
        }
    }
    message
}

pub(crate) fn errors(text: String) -> impl IntoElement {
    div()
        .absolute()
        .bottom(px(8.))
        .left(px(12.))
        .bg(rgb(0x351e25))
        .text_color(rgb(0xffcad3))
        .p(px(8.))
        .child(crate::inspect::labelled(
            Role::HostStatus,
            String::new(),
            text.clone(),
        ))
        .child(text)
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Offer {
    pub(crate) version: String,
    pub(crate) notes: String,
}

type Hider = Rc<dyn Fn(&Hide, &mut Window, &mut App)>;

#[derive(Clone, Copy)]
pub(crate) enum Hide {
    Updates,
    Restart,
}

pub(crate) struct Notices {
    avatar: crate::avatar::Binding,
    updates: Vec<Update>,
    updates_hidden: bool,
    restart: Option<Offer>,
    restart_hidden: bool,
}

pub(crate) const RESTART_WORDS: &str = "Restart now, or the new version starts the next time you open VoyagerShell. Your programs keep running.";

impl Notices {
    pub(crate) fn new(updates: Vec<Update>, avatar: crate::avatar::Binding) -> Self {
        Self {
            avatar,
            updates,
            updates_hidden: false,
            restart: None,
            restart_hidden: false,
        }
    }

    pub(crate) fn hide(&mut self, hide: Hide) {
        match hide {
            Hide::Updates => self.updates_hidden = true,
            Hide::Restart => self.restart_hidden = true,
        }
    }

    pub(crate) fn offer(&mut self, version: String, notes: String) {
        self.restart = Some(Offer { version, notes });
        self.restart_hidden = false;
    }

    pub(crate) fn view(
        &self,
        window: &Window,
        cx: &App,
        hide: impl Fn(&Hide, &mut Window, &mut App) + 'static,
    ) -> Vec<AnyElement> {
        let hide = Rc::new(hide);
        let restart = self
            .restart
            .as_ref()
            .filter(|_| !self.restart_hidden)
            .map(|offer| self.placed_restart(offer, window, cx, hide.clone()));
        let updates = (!self.updates_hidden && !self.updates.is_empty()).then(|| {
            div()
                .absolute()
                .bottom(px(END))
                .right(px(SIDE))
                .max_h(relative(0.6))
                .flex()
                .flex_col()
                .items_end()
                .child(self.updates(move |_, window, cx| hide(&Hide::Updates, window, cx)))
                .into_any_element()
        });
        restart.into_iter().chain(updates).collect()
    }

    fn placed_restart(&self, offer: &Offer, window: &Window, cx: &App, hide: Hider) -> AnyElement {
        let text = restart_text(offer);
        let at = place(
            window.viewport_size(),
            self.avatar.drawn(window, cx),
            |width| card_height(&text, width, window),
        );
        let region = div()
            .absolute()
            .left(at.region.left())
            .top(at.region.top())
            .w(at.region.size.width)
            .h(at.region.size.height)
            .flex()
            .flex_col()
            .items_end();
        let card = restart(text, hide);
        match at.corner {
            Corner::Bottom => region.justify_end().child(card).into_any_element(),
            Corner::Top => {
                deferred(region.justify_start().child(card.occlude())).into_any_element()
            }
        }
    }

    fn updates(
        &self,
        dismiss: impl Fn(&MouseDownEvent, &mut Window, &mut App) + 'static,
    ) -> AnyElement {
        let mut notice = div()
        .id("profile-updates")
        .min_h(px(0.))
        .flex_shrink(1.)
        .max_w(px(640.))
        .overflow_y_scroll()
        .bg(rgb(0x2b2a1a))
        .text_color(rgb(0xf3e9b5))
        .p(px(8.))
        .child("A newer version of some of your Voyager files is available. Your versions stay active. Click to hide this.")
        .on_mouse_down(MouseButton::Left, dismiss);
        for update in &self.updates {
            let why = match update.reason {
                Reason::Edited => "you edited it",
                Reason::Unrecorded => "its origin is unknown",
            };
            let shown = update.diff.lines().take(DIFF_LINES).collect::<Vec<_>>();
            let more = update.diff.lines().count().saturating_sub(DIFF_LINES);
            let mut text = format!(
                "{} ({why}). Full diff: {}\n{}",
                update.path,
                update.diff_file.display(),
                shown.join("\n")
            );
            if more > 0 {
                text.push_str(&format!("\n... {more} more lines"));
            }
            notice = notice.child(
                div()
                    .mt(px(6.))
                    .child(crate::inspect::control(
                        Role::ProfileUpdate,
                        update.path.clone(),
                    ))
                    .child(text),
            );
        }
        notice.into_any_element()
    }
}

fn restart_text(offer: &Offer) -> String {
    let mut text = format!("VoyagerShell {} is ready.", offer.version);
    if !offer.notes.is_empty() {
        text.push('\n');
        text.push_str(&offer.notes);
    }
    text.push('\n');
    text.push_str(RESTART_WORDS);
    text
}

fn restart(text: String, hide: Hider) -> Stateful<Div> {
    let button = |id: &'static str, role: Role, label: &'static str| {
        div()
            .id(id)
            .px(px(10.))
            .py(px(BUTTON_PADDING))
            .rounded(px(4.))
            .cursor_pointer()
            .bg(rgb(0x2f4a66))
            .child(crate::inspect::control(role, String::new()))
            .child(label)
    };
    div()
        .id("restart-offer")
        .flex_none()
        .max_w(px(CARD_WIDTH))
        .bg(rgb(0x1b2838))
        .text_color(rgb(0xd6e8ff))
        .p(px(PADDING))
        .rounded(px(6.))
        .child(crate::inspect::labelled(
            Role::RestartOffer,
            String::new(),
            text.clone(),
        ))
        .child(text)
        .child(
            div()
                .mt(px(BUTTON_GAP))
                .flex()
                .justify_end()
                .gap(px(8.))
                .child(
                    button("restart-later", Role::RestartLater, "Later")
                        .on_mouse_down(MouseButton::Left, move |_, window, cx| {
                            hide(&Hide::Restart, window, cx)
                        }),
                )
                .child(
                    button("restart-now", Role::RestartNow, "Restart")
                        .on_mouse_down(MouseButton::Left, |_, window, cx| {
                            window.dispatch_action(Box::new(crate::Restart), cx)
                        }),
                ),
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_failed_standard_canvas_stays_named_in_every_status_built_from_it() {
        let kept = vec!["canvas/status.js".to_owned(), "canvas/icons.txt".to_owned()];
        let standard = StandardCanvas::Failed("Permission denied".to_owned());
        let at_start = load_failure(&anyhow::anyhow!("first"), &kept, &standard);
        let on_retry = load_failure(&anyhow::anyhow!("second"), &kept, &standard);
        for message in [&at_start, &on_retry] {
            assert!(message.ends_with("\nThe shipped canvas also failed: Permission denied"));
            assert!(message.contains("\nYour edited file is kept: canvas/status.js"));
            assert!(!message.contains("icons.txt"));
        }
        assert!(on_retry.starts_with("Canvas load failed: second"));
    }

    #[test]
    fn an_unneeded_standard_canvas_adds_no_line() {
        let silent = load_failure(
            &anyhow::anyhow!("broken"),
            &Vec::new(),
            &StandardCanvas::NotNeeded,
        );
        assert_eq!(silent, "Canvas load failed: broken");
    }

    fn at(left: f32, top: f32, right: f32, bottom: f32) -> Bounds<Pixels> {
        Bounds::from_corners(point(px(left), px(top)), point(px(right), px(bottom)))
    }

    fn placed(window: (f32, f32), avatar: Option<(f32, f32)>) -> Place {
        place(
            size(px(window.0), px(window.1)),
            avatar.map(|(left, top)| at(left, top, left + 94., top + 94.)),
            |_| px(200.),
        )
    }

    #[test]
    fn the_card_keeps_the_bottom_right_corner_when_it_clears_the_avatar() {
        let corner = Place {
            region: at(12., 8., 1438., 932.),
            corner: Corner::Bottom,
        };
        assert_eq!(placed((1450., 940.), Some((65., 77.))), corner);
        assert_eq!(placed((1450., 940.), None), corner);
    }

    #[test]
    fn the_card_moves_beside_the_avatar_and_then_above_it() {
        let bottom = |region| Place {
            region,
            corner: Corner::Bottom,
        };
        assert_eq!(
            placed((450., 350.), Some((64., 99.))),
            bottom(at(166., 8., 438., 342.))
        );
        assert_eq!(
            placed((450., 350.), Some((290., 179.))),
            bottom(at(12., 8., 282., 342.))
        );
        assert_eq!(
            placed((450., 350.), Some((178., 240.))),
            bottom(at(12., 8., 438., 232.))
        );
    }

    #[test]
    fn with_no_room_beside_or_above_the_card_takes_the_top_right_corner() {
        assert_eq!(
            placed((300., 300.), Some((64., 99.))),
            Place {
                region: at(12., 8., 288., 292.),
                corner: Corner::Top,
            }
        );
    }

    #[test]
    fn the_restart_card_names_the_version_and_keeps_programs_running() {
        let mut offer = Offer {
            version: "0.1.1".into(),
            notes: "Faster scrolling.".into(),
        };
        assert_eq!(
            restart_text(&offer),
            format!("VoyagerShell 0.1.1 is ready.\nFaster scrolling.\n{RESTART_WORDS}")
        );
        offer.notes.clear();
        assert_eq!(
            restart_text(&offer),
            format!("VoyagerShell 0.1.1 is ready.\n{RESTART_WORDS}")
        );
    }
}
