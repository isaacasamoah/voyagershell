use gpui::{
    App, AppContext, Context, Entity, IntoElement, ParentElement, Render,
    StatefulInteractiveElement as _, Styled, Task, Window, div, prelude::FluentBuilder as _, px,
    rgb, svg,
};
use gpui_base::{Button, Theme, Tooltip};
use std::{sync::Arc, time::Duration};
use voyager_app::conversation_client::{AudioLease, Client};
use voyager_contract::{
    conversation::Delivery,
    voice::{Capability, Phase, State},
};

struct Controller(Entity<Speech>);

impl gpui::Global for Controller {}

pub(crate) fn initialize(client: Client, cx: &mut App) {
    if cx.try_global::<Controller>().is_none() {
        let speech = cx.new(|cx| Speech::new(client.audio_lease(), cx));
        cx.set_global(Controller(speech));
    }
}

pub(crate) fn view(cx: &App) -> Option<Entity<Speech>> {
    cx.try_global::<Controller>()
        .map(|controller| controller.0.clone())
}

pub fn component(
    client: Client,
) -> impl Fn(gpui_shell::ComponentArgs<'_>, &mut Window, &mut App) -> gpui::AnyElement {
    move |_args, _window, cx| {
        initialize(client.clone(), cx);
        match view(cx) {
            Some(speech) => speech.into_any_element(),
            None => div().into_any_element(),
        }
    }
}

pub(crate) struct Speech {
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
        let state = self.state.as_ref();
        let active = state.is_some_and(|state| state.phase == Phase::Active);
        let stopping = state.is_some_and(|state| state.phase == Phase::Stopping);
        let unavailable = state.is_none_or(|state| {
            matches!(
                state.capability,
                Capability::Checking | Capability::Unavailable { .. }
            )
        });
        let color = if active { rgb(0x94bda0) } else { rgb(0x989ba9) };
        let wave = svg()
            .path("speech-wave.svg")
            .w(px(14.))
            .h(px(12.))
            .text_color(color);
        let status = if !self.error.is_empty() {
            self.error.clone()
        } else {
            state
                .and_then(|state| {
                    state.error.clone().or_else(|| match &state.capability {
                        Capability::Unavailable { reason } => Some(reason.clone()),
                        _ => None,
                    })
                })
                .unwrap_or_else(|| match state.map(|state| &state.phase) {
                    Some(Phase::Preparing | Phase::Negotiating) => "Connecting voice…".into(),
                    Some(Phase::Stopping) => "Stopping voice…".into(),
                    Some(Phase::Unconfirmed) => "Audio stop is unconfirmed".into(),
                    _ => String::new(),
                })
        };
        let label = if active { "Stop voice" } else { "Start voice" };
        Button::new("voyager-speech")
            .accessibility_label(label)
            .aria_description(status.clone())
            .disabled(unavailable || self.pending || stopping)
            .flex()
            .items_center()
            .justify_center()
            .w(px(20.))
            .h(px(20.))
            .rounded(px(10.))
            .on_click(cx.listener(|speech, _, _, cx| speech.activate(cx)))
            .child(wave)
            .when(!status.is_empty(), |control| {
                control.tooltip(move |_, cx| cx.new(|_| VoiceHint(status.clone())).into())
            })
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
