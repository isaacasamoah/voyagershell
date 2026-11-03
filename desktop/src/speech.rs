use gpui::{
    App, AppContext, Context, Entity, IntoElement, ParentElement, Render, Styled, Task, Window,
    div, px,
};
use gpui_base::{Button, Theme};
use std::{sync::Arc, time::Duration};
use voyager_app::conversation_client::{AudioLease, Client};
use voyager_contract::{
    conversation::Delivery,
    voice::{Capability, Phase, State},
};

struct Controller(Entity<Speech>);

impl gpui::Global for Controller {}

pub fn component(
    client: Client,
) -> impl Fn(gpui_shell::ComponentArgs<'_>, &mut Window, &mut App) -> gpui::AnyElement {
    move |_args, _window, cx| {
        let speech = match cx.try_global::<Controller>() {
            Some(controller) => controller.0.clone(),
            None => {
                let speech = cx.new(|cx| Speech::new(client.audio_lease(), cx));
                cx.set_global(Controller(speech.clone()));
                speech
            }
        };
        speech.into_any_element()
    }
}

struct Speech {
    audio: Option<Arc<AudioLease>>,
    state: Option<State>,
    error: String,
    watching: bool,
    pending: bool,
    watch: Option<Task<()>>,
    call: Option<Task<()>>,
}

impl Speech {
    fn new(audio: Result<AudioLease, String>, cx: &mut Context<Self>) -> Self {
        let (audio, error) = match audio {
            Ok(audio) => (Some(Arc::new(audio)), String::new()),
            Err(error) => (None, error),
        };
        let state = audio.as_ref().and_then(|audio| audio.snapshot().ok());
        let mut speech = Self {
            audio,
            state,
            error,
            watching: false,
            pending: false,
            watch: None,
            call: None,
        };
        speech.observe(cx);
        speech
    }

    fn observe(&mut self, cx: &mut Context<Self>) {
        if self.watching {
            return;
        }
        self.watching = true;
        self.watch = Some(cx.spawn(async move |this, cx| {
            let mut recorded = None;
            loop {
                let mut evidence = None;
                let keep = this
                    .update(cx, |speech, cx| {
                        match speech.audio.as_ref().map(|audio| audio.snapshot()) {
                            Some(Ok(state)) => {
                                if recorded != Some(state.version) {
                                    recorded = Some(state.version);
                                    evidence = Some(state.clone());
                                }
                                let keep = state.capability == Capability::Checking
                                    || matches!(
                                        state.phase,
                                        Phase::Preparing
                                            | Phase::Negotiating
                                            | Phase::Active
                                            | Phase::Stopping
                                    );
                                if speech.state.as_ref() != Some(&state) {
                                    speech.state = Some(state);
                                    cx.notify();
                                }
                                speech.watching = keep;
                                keep
                            }
                            Some(Err(error)) => {
                                speech.error = error;
                                speech.watching = false;
                                cx.notify();
                                false
                            }
                            None => {
                                speech.watching = false;
                                false
                            }
                        }
                    })
                    .unwrap_or(false);
                if let Some(state) = evidence {
                    record(state, cx.background_executor()).await;
                }
                if !keep {
                    break;
                }
                cx.background_executor()
                    .timer(Duration::from_millis(50))
                    .await;
            }
        }));
    }

    fn activate(&mut self, cx: &mut Context<Self>) {
        if self.pending {
            return;
        }
        let Some(audio) = self.audio.clone() else {
            return;
        };
        self.error.clear();
        if self.state.as_ref().is_some_and(|state| {
            matches!(
                state.phase,
                Phase::Preparing | Phase::Negotiating | Phase::Active
            )
        }) {
            if let Err(error) = audio.stop() {
                self.error = error;
            }
            self.observe(cx);
            cx.notify();
            return;
        }
        self.pending = true;
        self.call = Some(cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { audio.start() })
                .await;
            let _ = this.update(cx, |speech, cx| {
                speech.pending = false;
                speech.error = match result {
                    Ok(reply) if reply.delivery == Delivery::Accepted => String::new(),
                    Ok(reply) => reply.error.unwrap_or_else(|| "Voice did not start".into()),
                    Err(error) => error,
                };
                speech.observe(cx);
                cx.notify();
            });
        }));
        cx.notify();
    }
}

async fn record(state: State, executor: &gpui::BackgroundExecutor) {
    let Some(path) = std::env::var_os("VOYAGER_VOICE_EVIDENCE") else {
        return;
    };
    executor
        .spawn(async move {
            let path = std::path::PathBuf::from(path);
            let temporary = path.with_extension("tmp");
            if let Ok(bytes) = serde_json::to_vec(&state) {
                let _ = std::fs::write(&temporary, bytes)
                    .and_then(|()| std::fs::rename(temporary, path));
            }
        })
        .await;
}

impl Drop for Speech {
    fn drop(&mut self) {
        if let Some(audio) = &self.audio {
            audio.release();
        }
    }
}

impl Render for Speech {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let colors = Theme::global(cx).tokens.colors;
        let state = self.state.as_ref();
        if state.is_some_and(|state| matches!(state.capability, Capability::Unavailable { .. })) {
            return div().into_any_element();
        }
        let active = state.is_some_and(|state| state.phase == Phase::Active);
        let stopping = state.is_some_and(|state| state.phase == Phase::Stopping);
        let unavailable = state.is_none_or(|state| {
            matches!(
                state.capability,
                Capability::Checking | Capability::Unavailable { .. }
            )
        });
        let color = if active {
            colors.accent
        } else {
            colors.muted_foreground
        };
        let level = state.map_or(0, |state| state.microphone_peak.max(state.speaker_peak)) as f32
            / u16::MAX as f32;
        let mut wave = div()
            .flex()
            .items_center()
            .justify_center()
            .gap(px(2.))
            .w(px(28.))
            .h(px(22.));
        for weight in [0.35, 0.7, 1., 0.7, 0.35] {
            wave = wave.child(
                div()
                    .w(px(2.))
                    .h(px(4. + 14. * weight * level))
                    .rounded(px(1.))
                    .bg(color),
            );
        }
        let label = if active { "Stop voice" } else { "Start voice" };
        let control = Button::new("voyager-speech")
            .accessibility_label(label)
            .disabled(unavailable || self.pending || stopping)
            .px(px(8.))
            .py(px(5.))
            .rounded(px(8.))
            .on_click(cx.listener(|speech, _, _, cx| speech.activate(cx)))
            .child(wave);
        let status = if !self.error.is_empty() {
            self.error.clone()
        } else {
            state
                .and_then(|state| state.error.clone())
                .unwrap_or_else(|| match state.map(|state| &state.phase) {
                    Some(Phase::Preparing | Phase::Negotiating) => "Connecting voice…".into(),
                    Some(Phase::Active) => {
                        if state.is_some_and(|state| state.speaker_peak > 0) {
                            "Speaking".into()
                        } else {
                            "Listening".into()
                        }
                    }
                    Some(Phase::Stopping) => "Stopping voice…".into(),
                    Some(Phase::Unconfirmed) => "Audio stop is unconfirmed".into(),
                    _ => String::new(),
                })
        };
        div()
            .flex()
            .flex_col()
            .gap(px(3.))
            .child(control)
            .child(
                div()
                    .text_size(px(10.))
                    .text_color(colors.muted_foreground)
                    .child(status),
            )
            .into_any_element()
    }
}
