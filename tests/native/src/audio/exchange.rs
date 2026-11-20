use super::speech::{self, Speech};
use super::{Client, LOOK, Recording, Stack, wait_for_exit};
use crate::journey::Verdict;
use crate::system::{PATIENCE, System, poll};
use anyhow::Result;
use serde::Serialize;

pub const OPENED_RECORD: &str = "the program opened a record stream on the default source";
pub const HEARD: &str = "the speech the program recorded matches the speech that was fed";
pub const OPENED_PLAY: &str = "the program opened a play stream on the default sink";
pub const SPOKEN: &str = "the speech captured at the speaker matches the speech that was fed";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Voice {
    WhatItHeard,
    OtherSpeech,
}

#[derive(Clone, Copy, Debug, Serialize)]
pub struct Exchange {
    pub name: &'static str,
    pub client: Client,
    pub capture: &'static str,
    pub voice: Voice,
}

pub const CAPTURE: &str = "speaker.monitor";

impl Exchange {
    pub const fn through(name: &'static str, client: Client) -> Self {
        Self {
            name,
            client,
            capture: CAPTURE,
            voice: Voice::WhatItHeard,
        }
    }

    pub const fn captured_at(mut self, node: &'static str) -> Self {
        self.capture = node;
        self
    }

    pub const fn speaking(mut self, voice: Voice) -> Self {
        self.voice = voice;
        self
    }

    pub const fn severed(self) -> Self {
        self.captured_at(UNPLUGGED_MONITOR)
    }
}

pub const UNPLUGGED_MONITOR: &str = "unplugged.monitor";

impl Stack {
    pub fn exchange(&self, system: &System, exchange: &Exchange) -> Result<Verdict> {
        let wanted = &speech::OPEN_THE_ROADMAP;
        let folder = self.folder().to_owned();
        let heard_name = format!("{}-heard", exchange.name);
        let mut capture = self.capture(
            system,
            exchange.capture,
            &format!("{}-speaker", exchange.name),
        )?;
        let mut recorder = exchange
            .client
            .start_recording(system, &folder, &heard_name)?;
        let outcome = self.drive(system, exchange, wanted, &mut capture, &mut recorder);
        let stops = [
            recorder.finish(&folder, &heard_name),
            capture.finish(&folder, &format!("{}-speaker", exchange.name)),
        ];
        let verdict = outcome?;
        for stopped in stops {
            stopped?;
        }
        Ok(verdict)
    }

    fn drive(
        &self,
        system: &System,
        exchange: &Exchange,
        wanted: &Speech,
        capture: &mut Recording,
        recorder: &mut Recording,
    ) -> Result<Verdict> {
        let opened = poll(PATIENCE, LOOK, true, || {
            anyhow::ensure!(
                recorder.alive()? && capture.alive()?,
                "A recording client exited before the exchange began"
            );
            let streams = self.recorders(system)?;
            Ok((!streams.is_empty()).then_some(streams))
        })?;
        let verdict = Verdict::new()
            .expect(OPENED_RECORD, opened.is_some())
            .observed("record streams", &opened)?;
        if opened.is_none() {
            return Ok(verdict);
        }
        self.feed(system, wanted)?;
        let heard = recorder.heard(wanted)?;
        let verdict = verdict
            .expect(HEARD, heard.matches())
            .observed("heard", heard)?;
        if !heard.matches() {
            return Ok(verdict);
        }
        recorder.finish(self.folder(), &format!("{}-heard", exchange.name))?;
        let voice = match exchange.voice {
            Voice::WhatItHeard => self.folder().join(format!("{}-heard.wav", exchange.name)),
            Voice::OtherSpeech => speech::RENAME_THE_FLEET.place(self.folder())?,
        };
        let mut player =
            exchange
                .client
                .start_playing(system, &voice, &format!("{}-voice", exchange.name))?;
        let playing = poll(PATIENCE, LOOK, true, || {
            let streams = self.players(system)?;
            Ok((!streams.is_empty()).then_some(streams))
        })?;
        let verdict = verdict
            .expect(OPENED_PLAY, playing.is_some())
            .observed("play streams", &playing)?;
        wait_for_exit(&mut player)?;
        let spoken = capture.heard(wanted)?;
        verdict
            .expect(SPOKEN, spoken.matches())
            .observed("spoken", spoken)
    }

    pub fn canary(&self, system: &System) -> Result<()> {
        let verdict = self.exchange(system, &Exchange::through("canary", Client::Pulse))?;
        anyhow::ensure!(
            verdict.passed(),
            "The verifier's own clients did not complete the audio loop: {}",
            verdict.first_unmet().unwrap_or("no expectation was judged")
        );
        Ok(())
    }
}
