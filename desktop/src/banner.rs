use gpui::{
    AnyElement, App, InteractiveElement, IntoElement, MouseButton, MouseDownEvent, ParentElement,
    StatefulInteractiveElement, Styled, Window, div, px, relative, rgb,
};
use voyager_app::content::install::{Reason, Update};
use voyager_contract::inspection::Role;

const DIFF_LINES: usize = 6;

pub(crate) enum Standard<'a> {
    Drawn,
    Missing,
    Failed(&'a anyhow::Error),
}

impl Standard<'_> {
    pub(crate) fn drawn(drawn: bool) -> Self {
        if drawn { Self::Drawn } else { Self::Missing }
    }
}

pub(crate) fn load_failure(
    error: &anyhow::Error,
    kept_files: &[String],
    standard: Standard,
) -> String {
    let mut message = format!("Canvas load failed: {error:#}");
    for path in kept_files
        .iter()
        .filter(|path| path.starts_with("canvas/") && path.ends_with(".js"))
    {
        message.push_str(&format!("\nYour edited file is kept: {path}"));
    }
    match standard {
        Standard::Drawn => message.push_str("\nShowing the standard canvas until it loads."),
        Standard::Missing => {}
        Standard::Failed(second) => {
            message.push_str(&format!("\nThe shipped canvas also failed: {second:#}"))
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

pub(crate) struct Updates {
    updates: Vec<Update>,
    dismissed: bool,
}

impl Updates {
    pub(crate) fn new(updates: Vec<Update>) -> Self {
        Self {
            updates,
            dismissed: false,
        }
    }

    pub(crate) fn dismiss(&mut self) {
        self.dismissed = true;
    }

    pub(crate) fn view(
        &self,
        dismiss: impl Fn(&MouseDownEvent, &mut Window, &mut App) + 'static,
    ) -> Option<AnyElement> {
        if self.dismissed || self.updates.is_empty() {
            return None;
        }
        let mut notice = div()
        .id("profile-updates")
        .absolute()
        .bottom(px(8.))
        .right(px(12.))
        .max_w(px(640.))
        .max_h(relative(0.6))
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
        Some(notice.into_any_element())
    }
}
