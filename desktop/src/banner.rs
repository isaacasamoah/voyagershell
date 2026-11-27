use crate::shipped::StandardCanvas;
use gpui::{
    AnyElement, App, InteractiveElement, IntoElement, MouseButton, MouseDownEvent, ParentElement,
    StatefulInteractiveElement, Styled, Window, div, px, relative, rgb,
};
use std::rc::Rc;
use voyager_app::content::install::{Reason, Update};
use voyager_contract::inspection::Role;

const DIFF_LINES: usize = 6;

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

#[derive(Clone, Copy)]
pub(crate) enum Hide {
    Updates,
    Restart,
}

pub(crate) struct Notices {
    updates: Vec<Update>,
    updates_hidden: bool,
    restart: Option<Offer>,
    restart_hidden: bool,
}

pub(crate) const RESTART_WORDS: &str = "Restart now, or the new version starts the next time you open VoyagerShell. Your programs keep running.";

impl Notices {
    pub(crate) fn new(updates: Vec<Update>) -> Self {
        Self {
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
        hide: impl Fn(&Hide, &mut Window, &mut App) + 'static,
    ) -> Option<AnyElement> {
        let hide = Rc::new(hide);
        let restart = self
            .restart
            .as_ref()
            .filter(|_| !self.restart_hidden)
            .map(|offer| restart(offer, hide.clone()));
        let updates = (!self.updates_hidden && !self.updates.is_empty())
            .then(|| self.updates(move |_, window, cx| hide(&Hide::Updates, window, cx)));
        if restart.is_none() && updates.is_none() {
            return None;
        }
        Some(
            div()
                .absolute()
                .bottom(px(8.))
                .right(px(12.))
                .max_h(relative(0.6))
                .flex()
                .flex_col()
                .items_end()
                .gap(px(6.))
                .children(restart)
                .children(updates)
                .into_any_element(),
        )
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

fn restart(offer: &Offer, hide: Rc<dyn Fn(&Hide, &mut Window, &mut App)>) -> AnyElement {
    let button = |id: &'static str, role: Role, label: &'static str| {
        div()
            .id(id)
            .px(px(10.))
            .py(px(4.))
            .rounded(px(4.))
            .cursor_pointer()
            .bg(rgb(0x2f4a66))
            .child(crate::inspect::control(role, String::new()))
            .child(label)
    };
    let text = restart_text(offer);
    div()
        .id("restart-offer")
        .flex_none()
        .max_w(px(460.))
        .bg(rgb(0x1b2838))
        .text_color(rgb(0xd6e8ff))
        .p(px(10.))
        .rounded(px(6.))
        .child(crate::inspect::labelled(
            Role::RestartOffer,
            String::new(),
            text.clone(),
        ))
        .child(text)
        .child(
            div()
                .mt(px(8.))
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
        .into_any_element()
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
