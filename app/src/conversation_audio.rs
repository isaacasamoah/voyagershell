use super::*;
use crate::provider::AudioEvent as ProviderAudio;

pub(super) struct Realtime {
    generation: u64,
    thread: String,
    session: String,
    answer: Option<SyncSender<String>>,
    started: bool,
    stopping: bool,
    requested: bool,
    stop_known: bool,
    closed: bool,
}

impl Owner {
    pub(super) fn start_audio(&mut self) -> Result<(), String> {
        let generation = self
            .voice_start
            .take()
            .ok_or("Missing native voice generation")?;
        if !self.audio.current(generation) {
            return self.audio.finish(generation, None, true);
        }
        let result = (|| {
            let thread = self
                .projection
                .read(|state| state.thread.clone())?
                .ok_or("Missing private voice thread")?;
            let provider = self
                .provider
                .as_ref()
                .ok_or("Private provider unavailable")?;
            let package = provider.voice_package()?;
            self.capture_scope(generation, None)?;
            let answer = voice_session::spawn(
                package,
                self.audio_environment.clone(),
                self.audio.clone(),
                generation,
                self.audio_events.clone(),
            )?;
            self.realtime = Some(Realtime {
                generation,
                thread,
                session: format!("voyager-voice-{}-{generation}", std::process::id()),
                answer: Some(answer),
                started: false,
                stopping: false,
                requested: false,
                stop_known: false,
                closed: false,
            });
            Ok(())
        })();
        if let Err(error) = result {
            self.audio.finish(generation, Some(error), true)?;
        }
        Ok(())
    }

    pub(super) fn audio_event(&mut self, event: AudioEvent) {
        match event {
            AudioEvent::Offer { generation, sdp } if self.audio.current(generation) => {
                self.offer = Some((generation, sdp))
            }
            AudioEvent::Finished { generation }
                if self.offer.as_ref().is_some_and(|(id, _)| *id == generation) =>
            {
                self.offer = None
            }
            _ => (),
        }
    }

    pub(super) fn audio_tick(&mut self) -> Result<(), String> {
        if self.pending.is_some() || self.disconnected {
            return Ok(());
        }
        if let Some((generation, sdp)) = self.offer.take() {
            if self.audio.current(generation) {
                let Some((_, focus)) = self
                    .audio_focus
                    .as_ref()
                    .filter(|(id, _)| *id == generation)
                else {
                    self.offer = Some((generation, sdp));
                    return Ok(());
                };
                let focus = focus.clone();
                let live = self
                    .realtime
                    .as_mut()
                    .filter(|live| live.generation == generation)
                    .ok_or("Missing native voice generation")?;
                live.requested = true;
                let command = Command::StartAudio {
                    thread: live.thread.clone(),
                    session: live.session.clone(),
                    offer: sdp,
                    focus,
                    instructions: VOICE_INSTRUCTIONS,
                };
                self.rpc(command)?;
            }
            return Ok(());
        }
        if let Some(live) = &mut self.realtime {
            if !self.audio.current(live.generation) && !live.requested {
                self.realtime = None;
                return Ok(());
            }
            if live.closed && live.stop_known && self.audio.exited(live.generation)? {
                self.realtime = None;
                return Ok(());
            }
            if !self.audio.current(live.generation) && !live.stopping {
                live.stopping = true;
                let thread = live.thread.clone();
                self.rpc(Command::StopAudio { thread })?;
            }
        }
        Ok(())
    }

    pub(super) fn realtime_event(&mut self, value: &ProviderAudio) -> Result<(), String> {
        let Some(live) = &mut self.realtime else {
            return Ok(());
        };
        let thread = match value {
            ProviderAudio::Started { thread, .. }
            | ProviderAudio::Answer { thread, .. }
            | ProviderAudio::Closed { thread }
            | ProviderAudio::Failed { thread } => thread,
            ProviderAudio::Transcript(transcript) => &transcript.thread,
        };
        if thread != &live.thread {
            return Ok(());
        }
        match value {
            ProviderAudio::Closed { .. } => {
                live.closed = true;
                self.audio.end((!live.stopping).then(|| "The native voice connection closed. Text and accepted work remain available.".into()))?;
            }
            ProviderAudio::Failed { .. } => self.audio.end(Some("The provider reported a native voice error. Text and accepted work remain available.".into()))?,
            ProviderAudio::Started { session, supported, .. } if self.audio.current(live.generation) => {
                if session != &live.session || !supported {
                    self.audio.end(Some("Native voice returned a different session identity".into()))?;
                } else {
                    live.started = true;
                    self.audio.update(live.generation, |state| { state.thread = Some(live.thread.clone()); state.realtime_session = Some(live.session.clone()); })?;
                }
            }
            ProviderAudio::Answer { answer: sdp, .. } if live.started && self.audio.current(live.generation) => {
                if let Some(answer) = live.answer.take() {
                    if sdp.is_empty() || sdp.len() > 65536 {
                        return Err("Native voice answer has an invalid length".into());
                    }
                    answer.try_send(sdp.clone()).map_err(|_| "Native voice negotiation is no longer waiting")?;
                }
            }
            ProviderAudio::Transcript(transcript) if live.started && self.audio.current(live.generation) => {
                self.projection.edit(|state| crate::voice_transcript::notification(state, transcript, live.generation, &live.session))?;
            }
            _ => (),
        }
        Ok(())
    }

    pub(super) fn voice_turn(&mut self, value: &Visible) -> Result<bool, String> {
        let Visible::Started { thread, turn } = value else {
            return Ok(false);
        };
        if self
            .pending
            .as_ref()
            .is_some_and(|p| p.operation == Operation::StartTurn)
        {
            return Ok(false);
        }
        let Some(live) = self
            .realtime
            .as_ref()
            .filter(|live| live.started && self.audio.current(live.generation))
        else {
            return Ok(false);
        };
        if thread != &live.thread || turn.is_empty() || turn.len() > 256 {
            return Ok(false);
        }
        if self
            .projection
            .read(|state| state.turn.as_deref() == Some(turn.as_str()))?
        {
            return Ok(true);
        }
        if self.tools.busy()
            || self.projection.read(|state| {
                matches!(
                    state.phase,
                    Phase::Working | Phase::Starting | Phase::Unconfirmed
                )
            })?
        {
            return Err("Native voice started a different turn before the previous request completed. No tools were retargeted.".into());
        }
        let generation = live.generation;
        let turn = turn.to_owned();
        self.audio
            .update(generation, |state| state.turn = Some(turn.clone()))?;
        self.active = format!("voice-{generation}-{turn}");
        self.context = None;
        self.tools = Tools::default();
        self.deferred.clear();
        self.callbacks.clear();
        self.scope_pending = Some((generation, turn.clone()));
        self.projection.edit(|state| {
            state.turn = Some(turn.clone());
            state.phase = Phase::Working;
            state.error = None;
            state.limited = false;
            true
        })?;
        self.capture_scope(generation, Some(turn))?;
        Ok(true)
    }

    fn capture_scope(&self, generation: u64, turn: Option<String>) -> Result<(), String> {
        let inspection = self
            .workspace
            .queue_inspection()
            .map_err(|error| match error {
                crate::client::CallError::Rejected(message)
                | crate::client::CallError::Unconfirmed(message) => message,
            })?;
        let scopes = self.scopes.clone();
        let workspace = self.workspace.clone();
        thread::Builder::new()
            .name("voice-turn-focus".into())
            .spawn(move || {
                let result = inspection
                    .wait()
                    .map_err(|error| match error {
                        crate::client::CallError::Rejected(message)
                        | crate::client::CallError::Unconfirmed(message) => message,
                    })
                    .and_then(|snapshot| {
                        if snapshot.status != Status::Applied || !snapshot.fresh {
                            return Err(
                                "Native voice could not inspect its accepted workspace focus"
                                    .into(),
                            );
                        }
                        workspace.conversation_focus(&snapshot.layout, snapshot.version)
                    });
                let scope = match turn {
                    Some(turn) => CapturedScope::Turn {
                        generation,
                        turn,
                        result,
                    },
                    None => CapturedScope::Opening { generation, result },
                };
                let _ = scopes.send(scope);
            })
            .map_err(|_| "Native voice focus reader could not start")?;
        Ok(())
    }

    pub(super) fn initial_scope(&mut self, generation: u64, result: Result<Focus, String>) {
        if !self.audio.current(generation) {
            return;
        }
        match result {
            Ok(focus) => self.audio_focus = Some((generation, focus)),
            Err(error) => {
                let _ = self.audio.end(Some(error));
            }
        }
    }

    pub(super) fn accept_scope(
        &mut self,
        generation: u64,
        turn: &str,
        result: Result<Focus, String>,
    ) -> Result<(), String> {
        if !self
            .scope_pending
            .as_ref()
            .is_some_and(|(id, pending)| *id == generation && pending == turn)
        {
            return Ok(());
        }
        self.scope_pending = None;
        self.context = Some(result?);
        while let Some(value) = self.deferred.pop_front() {
            self.reduce(value)?;
        }
        while let Some(value) = self.callbacks.pop_front() {
            self.receive(ProviderEvent::Tool(value))?;
        }
        Ok(())
    }

    pub(super) fn audio_stopped(&mut self) {
        if let Some(live) = &mut self.realtime {
            live.stop_known = true;
        }
    }
}

const VOICE_INSTRUCTIONS: &str = "You are Voyager, the human's concise private voice companion and administrator. Begin human-facing replies with oru:. The initial focus describes where this voice conversation opened; later accepted work captures the avatar's then-current focus. Use the backing Codex agent for workspace inspection and all workspace effects. Never claim an effect without its real tool outcome. Do not perform project changes or replay uncertain work. Keep replies brief and natural. Do not expose private reasoning, credentials or audio negotiation. Native voice and the backing text conversation are one administrator, not separate workers.";

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::Core;

    #[test]
    fn a_known_stop_refusal_settles_only_after_closed_and_confirmed_helper_exit() {
        let session = format!("voyager-c3-stop-{}", std::process::id());
        let workspace = Workspace::open(session.clone(), "/tmp".into());
        let mut cleanup = Core::connect(&session).unwrap();
        let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let projection = Arc::new(Projection {
                value: Mutex::new(Snapshot::default()),
                changed: Condvar::new(),
            });
            let audio = Arc::new(AudioState::new(Capability::Candidate {
                version: "0.166.0".into(),
            }));
            let lease = audio.binding().unwrap();
            let generation = audio.begin(&lease).unwrap();
            let (events, _) = mpsc::sync_channel(2);
            let (scopes, _) = mpsc::sync_channel(1);
            let mut owner = Owner::new(
                projection,
                PathBuf::from("/tmp"),
                workspace,
                audio.clone(),
                Vec::new(),
                events,
                scopes,
            );
            owner.realtime = Some(Realtime {
                generation,
                thread: "private-thread".into(),
                session: "voice-session".into(),
                answer: None,
                started: true,
                stopping: true,
                requested: true,
                stop_known: false,
                closed: true,
            });
            audio.stop(&lease).unwrap();
            audio.finish(generation, None, false).unwrap();
            owner.audio_tick().unwrap();
            assert!(owner.realtime.is_some());
            owner.pending = Some(Pending {
                id: 1,
                operation: Operation::StopAudio,
                deadline: Instant::now() + Duration::from_secs(25),
            });
            owner
                .event(json!({"id":1,"error":{"code":-32600,"message":"already closed"}}))
                .unwrap();
            owner.audio_tick().unwrap();
            assert!(owner.realtime.is_some());
            owner.realtime.as_mut().unwrap().closed = false;
            audio.finish(generation, None, true).unwrap();
            owner.audio_tick().unwrap();
            assert!(owner.realtime.is_some());
            owner
                .event(json!({"method":"thread/realtime/closed","params":{"threadId":"private-thread"}}))
                .unwrap();
            owner.audio_tick().unwrap();
            assert!(owner.realtime.is_none());
            let stopped = audio.snapshot().unwrap();
            assert!(stopped.error.as_deref().unwrap().contains("refused"));
            assert_ne!(stopped.phase, voyager_contract::voice::Phase::Unconfirmed);
        }));
        let stopped = cleanup.server_stop();
        cleanup.close().unwrap();
        assert!(stopped.is_ok());
        checked.unwrap();
    }

    #[test]
    fn native_voice_binds_the_actual_turn_before_tools_and_retains_it_after_audio_loss() {
        let session = format!("voyager-c3-context-{}", std::process::id());
        let workspace = Workspace::open(session.clone(), "/tmp".into());
        let inspect = || {
            workspace
                .call(WorkspaceRequest {
                    request_id: workspace.request_id(),
                    expected_version: 0,
                    action: WorkspaceAction::Inspect,
                })
                .unwrap()
        };
        let initial = inspect();
        let mut cleanup = Core::connect(&session).unwrap();
        let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let projection = Arc::new(Projection {
                value: Mutex::new(Snapshot {
                    thread: Some("private-thread".into()),
                    ..Snapshot::default()
                }),
                changed: Condvar::new(),
            });
            let audio = Arc::new(AudioState::new(Capability::Candidate {
                version: "0.166.0".into(),
            }));
            let lease = audio.binding().unwrap();
            let generation = audio.begin(&lease).unwrap();
            let (events, _) = mpsc::sync_channel(2);
            let (scopes, captured) = mpsc::sync_channel(1);
            let (answer, _) = mpsc::sync_channel(1);
            let mut owner = Owner::new(
                projection.clone(),
                PathBuf::from("/tmp"),
                workspace.clone(),
                audio.clone(),
                Vec::new(),
                events,
                scopes,
            );
            owner.realtime = Some(Realtime {
                generation,
                thread: "private-thread".into(),
                session: "voice-session".into(),
                answer: Some(answer),
                started: true,
                stopping: false,
                requested: true,
                stop_known: false,
                closed: false,
            });
            let mut turn = json!({"method":"turn/started","params":{"threadId":"wrong-thread","turn":{"id":"native-turn","status":"inProgress"}}});
            let voice_turn = |owner: &mut Owner, value| {
                let Some(ProviderEvent::Visible(event)) = crate::codex::normalize(value, None)
                else {
                    panic!("Missing normalized turn");
                };
                owner.voice_turn(&event).unwrap()
            };
            assert!(!voice_turn(&mut owner, turn.clone()));
            assert!(owner.scope_pending.is_none());
            turn["params"]["threadId"] = json!("private-thread");
            assert!(voice_turn(&mut owner, turn));
            assert_eq!(owner.sequence, 0);
            assert!(owner.provider.is_none() && owner.context.is_none());
            let callback = json!({"id":"callback","method":"item/tool/call","params":{"threadId":"private-thread","turnId":"native-turn","callId":"inspection","tool":"voyager_workspace","arguments":{"expectedVersion":"0","action":{"operation":"inspect"}}}});
            owner.event(callback).unwrap();
            assert_eq!(owner.callbacks.len(), 1);
            assert!(!owner.tools.busy());
            let later = workspace
                .call(WorkspaceRequest {
                    request_id: workspace.request_id(),
                    expected_version: initial.version,
                    action: WorkspaceAction::Dock {
                        context: voyager_contract::Context::Fleet {
                            id: initial.layout.voyages[0].fleets[0].id.clone(),
                        },
                    },
                })
                .unwrap();
            assert_eq!(later.status, Status::Applied);
            let CapturedScope::Turn {
                generation,
                turn,
                result,
            } = captured.recv_timeout(Duration::from_secs(5)).unwrap()
            else {
                panic!("Wrong scope response");
            };
            let context = result.as_ref().unwrap().clone();
            assert_eq!(context.scope, voyager_contract::Context::Workspace);
            assert_eq!(context.revision, initial.version);
            audio.stop(&lease).unwrap();
            owner
                .accept_scope(generation + 1, &turn, result.clone())
                .unwrap();
            assert!(owner.context.is_none());
            owner.accept_scope(generation, &turn, result).unwrap();
            assert_eq!(owner.context.as_ref(), Some(&context));
            let deadline = Instant::now() + Duration::from_secs(5);
            let completed = loop {
                if let Some(result) = owner.tools.poll() {
                    break result;
                }
                assert!(Instant::now() < deadline);
                thread::sleep(Duration::from_millis(5));
            };
            assert_eq!(completed.context, context);
            assert_eq!(context.scope, voyager_contract::Context::Workspace);
            assert_eq!(
                projection
                    .read(|state| state.thread.clone())
                    .unwrap()
                    .as_deref(),
                Some("private-thread")
            );
            assert_eq!(completed.outcome.status, Status::Applied);
            assert_eq!(inspect().version, later.version);
            let effect = json!({"id":"effect-callback","method":"item/tool/call","params":{"threadId":"private-thread","turnId":"native-turn","callId":"fleet-effect","tool":"voyager_workspace","arguments":{"expectedVersion":later.version.to_string(),"action":{"operation":"create-fleet","voyage":initial.layout.voyages[0].id,"name":"Voice context"}}}});
            owner.event(effect.clone()).unwrap();
            let deadline = Instant::now() + Duration::from_secs(5);
            loop {
                if let Err(error) = owner.tool_result() {
                    assert_eq!(error, "Private provider unavailable");
                    break;
                }
                assert!(Instant::now() < deadline);
                thread::sleep(Duration::from_millis(5));
            }
            let effect_version = inspect().version;
            assert_eq!(effect_version, later.version + 1);
            assert!(owner.event(effect).is_err());
            assert_eq!(inspect().version, effect_version);
            let final_state = workspace
                .call(WorkspaceRequest {
                    request_id: workspace.request_id(),
                    expected_version: 0,
                    action: WorkspaceAction::Inspect,
                })
                .unwrap();
            assert_eq!(final_state.layout.voyages[0].fleets.len(), 2);
        }));
        let stopped = cleanup.server_stop();
        cleanup.close().unwrap();
        assert!(stopped.is_ok());
        checked.unwrap();
    }
}
