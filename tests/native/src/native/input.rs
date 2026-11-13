use super::Native;
use crate::inspection::{Target, Unseen, clear_of, contains, region};
use crate::system::PATIENCE;
use crate::x11::{Chord, Geometry};
use anyhow::{Result, anyhow, ensure};
use serde::Serialize;
use serde_json::json;
use std::time::Instant;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Wheel {
    Up,
    Down,
}

#[derive(Clone, Copy, Debug, Serialize)]
struct Aim {
    region: Geometry,
    avatar: Option<Geometry>,
    at: (i16, i16),
    sequence: u64,
}

impl Aim {
    fn still_under(&self, pointer: (i16, i16)) -> bool {
        contains(self.region, pointer)
            && !self.avatar.is_some_and(|avatar| contains(avatar, pointer))
    }
}

impl Native {
    pub fn click(&self, target: &Target) -> Result<()> {
        let aim = self.reach(target)?;
        let x11 = self.x11()?;
        self.system.act(
            json!({"input":"click","button":1,"target":target,"aim":aim}),
            || x11.click(1),
        )
    }

    pub fn wheel(&self, target: &Target, direction: Wheel, clicks: usize) -> Result<()> {
        let aim = self.reach(target)?;
        let x11 = self.x11()?;
        let button = match direction {
            Wheel::Up => 4,
            Wheel::Down => 5,
        };
        self.system.act(
            json!({"input":"wheel","direction":direction,"button":button,"clicks":clicks,"target":target,"aim":aim}),
            || (0..clicks).try_for_each(|_| x11.click(button)),
        )
    }

    pub fn press(&self, chord: impl Into<Chord>) -> Result<()> {
        let chord = chord.into();
        self.keyboard()?;
        let x11 = self.x11()?;
        self.system
            .act(json!({"input":"key","chord":chord}), || x11.chord(chord))
    }

    pub fn type_text(&self, text: &str) -> Result<()> {
        self.keyboard()?;
        let x11 = self.x11()?;
        self.system
            .act(json!({"input":"type","text":text}), || x11.type_text(text))
    }

    fn spot(&self, target: &Target) -> Result<Aim> {
        let mut covered = false;
        let spotted = self.wait_for(&target.to_string(), PATIENCE, |frame| {
            if target.ambiguous(frame) {
                return Some(Err(anyhow!(
                    "The frame draws {target} more than once, so there is no single control to aim at"
                )));
            }
            let found = region(frame, &target.find(frame)?.bounds);
            let avatar = (*target != Target::AVATAR)
                .then(|| Target::AVATAR.find(frame))
                .flatten()
                .map(|avatar| region(frame, &avatar.bounds));
            let at = clear_of(found, avatar);
            covered = at.is_none();
            Some(Ok(Aim {
                region: found,
                avatar,
                at: at?,
                sequence: frame.sequence,
            }))
        });
        match spotted {
            Err(error) if covered && error.is::<Unseen>() => {
                Err(Unseen(format!("{target} outside the avatar")).into())
            }
            Err(error) => Err(error),
            Ok(aim) => aim,
        }
    }

    fn reach(&self, target: &Target) -> Result<Aim> {
        let x11 = self.x11()?;
        let deadline = Instant::now() + PATIENCE;
        loop {
            let aim = self.spot(target)?;
            let (x, y) = self.on_screen(target, aim)?;
            self.system.act(
                json!({"input":"move","target":target,"aim":aim,"at":[x,y]}),
                || x11.move_to(x, y),
            )?;
            if self.spot(target)?.still_under(aim.at) {
                self.pointer()?;
                return Ok(aim);
            }
            if Instant::now() >= deadline {
                return Err(Unseen(format!("{target} holding still under the pointer")).into());
            }
        }
    }

    fn on_screen(&self, target: &Target, aim: Aim) -> Result<(i16, i16)> {
        let x11 = self.x11()?;
        let window = x11.geometry(self.window)?;
        let point = (window.x + aim.at.0, window.y + aim.at.1);
        ensure!(
            contains(x11.extent()?, point),
            "{target} is drawn outside the owned display, at {point:?}"
        );
        Ok(point)
    }

    fn keyboard(&self) -> Result<()> {
        self.verify()?;
        ensure!(
            self.x11()?.focused()? == self.window,
            "Keyboard focus left the owned candidate"
        );
        Ok(())
    }

    fn pointer(&self) -> Result<()> {
        self.verify()?;
        let under = self.x11()?.under_pointer()?;
        ensure!(
            under == self.window,
            "Pointer left the owned candidate: {under}"
        );
        Ok(())
    }
}
