use crate::{
    voice::Shared,
    voice_host::{Host, Package},
    voice_wire::{Controls, Selection, Signal},
};
use std::{
    ffi::OsString,
    sync::{
        Arc,
        mpsc::{self, Receiver, SyncSender},
    },
    thread,
    time::{Duration, Instant},
};
use voyager_contract::voice::{Capability, Phase};

pub(crate) enum Event {
    Offer { generation: u64, sdp: String },
    Finished { generation: u64 },
}

pub(crate) fn spawn(
    package: Package,
    environment: Vec<(OsString, OsString)>,
    shared: Arc<Shared>,
    generation: u64,
    events: SyncSender<Event>,
) -> Result<SyncSender<String>, String> {
    let (answer, answers) = mpsc::sync_channel(1);
    thread::Builder::new()
        .name("native-voice".into())
        .spawn(move || {
            let mut host = None;
            let result = run(
                &package,
                &environment,
                &shared,
                generation,
                &events,
                answers,
                &mut host,
            );
            let confirmed_exit = if let Some(host) = host {
                let cancellation = host.cancellation.clone();
                let _ = host.close();
                cancellation.wait(Duration::from_secs(5)).is_ok()
            } else {
                true
            };
            let _ = shared.finish(generation, result.err(), confirmed_exit);
            let _ = events.send(Event::Finished { generation });
        })
        .map_err(|_| "Native audio worker could not start")?;
    Ok(answer)
}

fn run(
    package: &Package,
    environment: &[(OsString, OsString)],
    shared: &Shared,
    generation: u64,
    events: &SyncSender<Event>,
    answers: Receiver<String>,
    owned: &mut Option<Host>,
) -> Result<(), String> {
    if !shared.current(generation) {
        return Ok(());
    }
    *owned = Some(Host::spawn(package, environment)?);
    let host = owned.as_mut().ok_or("Native voice helper is unavailable")?;
    if !shared.attach(generation, host.cancellation.clone())? {
        return Ok(());
    }
    host.handshake(package.build.clone())?;
    shared.capability(Capability::Compatible {
        version: package.version.clone(),
    })?;
    if !matches!(
        host.exchange(&Signal::InitializeRuntime {}, Duration::from_secs(10))?,
        Signal::RuntimeReady {}
    ) {
        return Err("Native audio runtime could not initialize".into());
    }
    if !shared.current(generation) {
        return Ok(());
    }
    let Signal::Offer { sdp } =
        host.exchange(&Signal::StartTransport {}, Duration::from_secs(10))?
    else {
        return Err("Native WebRTC offer was not produced".into());
    };
    shared.update(generation, |state| state.phase = Phase::Negotiating)?;
    events
        .send(Event::Offer { generation, sdp })
        .map_err(|_| "Private voice connection closed")?;
    let deadline = Instant::now() + Duration::from_secs(30);
    let answer = loop {
        if !shared.current(generation) {
            return Ok(());
        }
        match answers.recv_timeout(Duration::from_millis(50)) {
            Ok(answer) => break answer,
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return Err("Private voice negotiation closed".into());
            }
            Err(mpsc::RecvTimeoutError::Timeout) if Instant::now() >= deadline => {
                return Err("Private voice negotiation was not confirmed".into());
            }
            Err(_) => (),
        }
    };
    if !matches!(
        host.exchange(
            &Signal::ApplyAnswer { sdp: answer },
            Duration::from_secs(25)
        )?,
        Signal::TransportReady {}
    ) {
        return Err("Native voice transport did not connect".into());
    }
    if !shared.current(generation) {
        return Ok(());
    }
    if !matches!(
        host.exchange(
            &Signal::OpenDevices {
                selection: Selection {
                    microphone: None,
                    speaker: None,
                    channel: None
                }
            },
            Duration::from_secs(10)
        )?,
        Signal::DevicesOpened {}
    ) {
        return Err("Native microphone or speaker could not open".into());
    }
    if !shared.current(generation) {
        return Ok(());
    }
    if !matches!(
        host.exchange(
            &Signal::SetAudioControls {
                controls: Controls {
                    microphone_muted: false,
                    speaker_suppressed: false
                }
            },
            Duration::from_secs(5)
        )?,
        Signal::AudioControlsApplied {}
    ) {
        return Err("Native microphone and speaker controls were not applied".into());
    }
    shared.update(generation, |state| state.phase = Phase::Active)?;
    while shared.current(generation) {
        let Signal::AudioState { state: peaks } =
            host.exchange(&Signal::InspectAudio {}, Duration::from_secs(3))?
        else {
            return Err("Native audio status is unavailable".into());
        };
        shared.update(generation, |state| {
            state.microphone_peak = peaks.microphone_peak;
            state.speaker_peak = peaks.speaker_peak;
        })?;
        thread::sleep(Duration::from_millis(50));
    }
    Ok(())
}
