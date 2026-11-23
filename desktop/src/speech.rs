use gpui::{
    App, AppContext, Context, Entity, InteractiveElement as _, IntoElement, ParentElement, Render,
    StatefulInteractiveElement as _, Styled, Task, Window, div, prelude::FluentBuilder as _, px,
    rgb, svg,
};
use gpui_base::{Button, Theme, Tooltip};
use std::time::Duration;
use voyager_app::{
    voice_layer::{Layer, Snapshot},
    voice_parts::Phase,
};
use voyager_contract::inspection::Role;

struct Controller(Entity<Speech>);

impl gpui::Global for Controller {}

pub(crate) fn initialize(layer: Layer, cx: &mut App) {
    if cx.try_global::<Controller>().is_none() {
        let speech = cx.new(|cx| Speech::new(layer, cx));
        cx.set_global(Controller(speech));
    }
}

pub(crate) fn view(cx: &App) -> Option<Entity<Speech>> {
    cx.try_global::<Controller>()
        .map(|controller| controller.0.clone())
}

pub fn component()
-> impl Fn(gpui_shell::ComponentArgs<'_>, &mut Window, &mut App) -> gpui::AnyElement {
    move |_args, _window, cx| match view(cx) {
        Some(speech) => speech.into_any_element(),
        None => div().into_any_element(),
    }
}

pub(crate) struct Speech {
    layer: Layer,
    state: Snapshot,
    watch: Option<Task<()>>,
}

impl Speech {
    fn new(layer: Layer, cx: &mut Context<Self>) -> Self {
        let state = layer.snapshot();
        let mut speech = Self {
            layer,
            state,
            watch: None,
        };
        speech.observe(cx);
        speech
    }

    fn observe(&mut self, cx: &mut Context<Self>) {
        let layer = self.layer.clone();
        self.watch = Some(cx.spawn(async move |this, cx| {
            let mut seen = layer.snapshot().version;
            loop {
                let watching = layer.clone();
                let state = cx
                    .background_executor()
                    .spawn(async move { watching.wait_changed(seen, Duration::from_millis(500)) })
                    .await;
                seen = state.version;
                let stopped = state.phase == Phase::Stopped;
                let alive = this
                    .update(cx, |speech, cx| {
                        if speech.state != state {
                            speech.state = state;
                            cx.notify();
                        }
                    })
                    .is_ok();
                if stopped || !alive {
                    break;
                }
            }
        }));
    }
}

fn colour(phase: &Phase) -> u32 {
    match phase {
        Phase::Listening | Phase::SpeakingOpen => 0x94bda0,
        Phase::Connecting => 0xd9b26a,
        Phase::NoMicrophone => 0xc98585,
        _ => 0x989ba9,
    }
}

fn hint(notice: Option<&str>, phase: &Phase) -> String {
    match (notice, phase) {
        (Some(notice), _) => notice.to_owned(),
        (None, Phase::Starting) => "Loading voice…".into(),
        (None, Phase::Connecting) => "Connecting…".into(),
        (None, Phase::Listening) => "Listening".into(),
        (None, Phase::NoMicrophone) => "Can't hear the microphone".into(),
        (None, Phase::Hearing) => "Listening to what you said…".into(),
        (None, Phase::SpeakingOpen) => "Listening. Talk any time to interrupt.".into(),
        (None, Phase::Speaking) => "Mic paused while Voyager speaks. Turn on Talk over Voyager in voice settings if you wear headphones.".into(),
        (None, Phase::Unavailable(reason)) => reason.clone(),
        _ => String::new(),
    }
}

impl Render for Speech {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let phase = &self.state.phase;
        let on = self.state.on;
        let usable = !matches!(
            phase,
            Phase::Starting | Phase::Unavailable(_) | Phase::Stopped
        );
        let wave = svg()
            .path("speech-wave.svg")
            .w(px(14.))
            .h(px(12.))
            .text_color(rgb(colour(phase)));
        let status = hint(self.state.notice.as_deref(), phase);
        let label = if on { "Turn voice off" } else { "Start voice" };
        let layer = self.layer.clone();
        let control = Button::new("voyager-speech")
            .block_mouse_except_scroll()
            .accessibility_label(label)
            .aria_description(status.clone())
            .disabled(!usable)
            .flex()
            .items_center()
            .justify_center()
            .w(px(20.))
            .h(px(20.))
            .rounded(px(10.))
            .on_click(cx.listener(move |_, _, _, _| layer.click()))
            .child(wave)
            .when(!status.is_empty(), |control| {
                control.tooltip(move |_, cx| cx.new(|_| VoiceHint(status.clone())).into())
            })
            .into_any_element();
        let shown = match phase {
            Phase::Starting => "Loading voice…".to_owned(),
            Phase::Unavailable(reason) => reason.clone(),
            _ if !on => label.to_owned(),
            Phase::Connecting => "Connecting…".to_owned(),
            Phase::Listening => "Listening".to_owned(),
            Phase::NoMicrophone => "Can't hear the microphone".to_owned(),
            Phase::Hearing | Phase::Acknowledging | Phase::Speaking => "Busy".to_owned(),
            Phase::SpeakingOpen => "Listening while speaking".to_owned(),
            _ => label.to_owned(),
        };
        div()
            .relative()
            .w(px(20.))
            .h(px(20.))
            .child(control)
            .child(crate::inspect::labelled(
                Role::VoiceControl,
                String::new(),
                shown,
            ))
            .into_any_element()
    }
}

struct VoiceHint(String);

impl Render for VoiceHint {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let colors = Theme::global(cx).tokens.colors;
        Tooltip::new("voyager-voice-detail")
            .max_w(px(110.))
            .p(px(5.))
            .rounded(px(4.))
            .bg(rgb(0x16181c))
            .text_size(px(10.))
            .text_color(colors.muted_foreground)
            .child(self.0.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const GREEN: u32 = 0x94bda0;
    const GREY: u32 = 0x989ba9;

    #[test]
    fn the_wave_is_green_only_while_the_microphone_hears_the_person() {
        for phase in [Phase::Listening, Phase::SpeakingOpen] {
            assert_eq!(colour(&phase), GREEN, "{phase:?}");
        }
        for phase in [
            Phase::Ready,
            Phase::Hearing,
            Phase::Acknowledging,
            Phase::Speaking,
        ] {
            assert_eq!(colour(&phase), GREY, "{phase:?}");
        }
        for phase in [Phase::Connecting, Phase::NoMicrophone] {
            assert!(![GREEN, GREY].contains(&colour(&phase)), "{phase:?}");
        }
    }

    #[test]
    fn a_speaking_voyager_says_whether_the_person_can_talk_over_it() {
        assert_eq!(
            hint(None, &Phase::SpeakingOpen),
            "Listening. Talk any time to interrupt."
        );
        assert_eq!(
            hint(None, &Phase::Speaking),
            "Mic paused while Voyager speaks. Turn on Talk over Voyager in voice settings if you wear headphones."
        );
        assert_eq!(hint(None, &Phase::Listening), "Listening");
        assert_eq!(hint(None, &Phase::Hearing), "Listening to what you said…");
        assert_eq!(hint(None, &Phase::Acknowledging), "");
    }

    #[test]
    fn a_notice_replaces_the_hint_in_every_phase() {
        for phase in [Phase::Speaking, Phase::SpeakingOpen, Phase::Listening] {
            assert_eq!(hint(Some("Not sent."), &phase), "Not sent.", "{phase:?}");
        }
    }
}
