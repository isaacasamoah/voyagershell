use super::{Defect, GLANCE, Native, Seen};
use crate::inspection::{Target, Unseen, clear_of, contains, region};
use crate::system::{PATIENCE, poll};
use crate::x11::{Chord, Geometry};
use anyhow::{Result, ensure};
use serde::Serialize;
use serde_json::json;
use voyager_contract::inspection::Frame;

const PRIMARY: u8 = 1;
const SECONDARY: u8 = 3;

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

const HELD_BUTTON: u8 = 1;
const HELD_STEPS: i16 = 8;

#[must_use]
pub struct Held<'a> {
    native: &'a Native,
    at: (i16, i16),
    released: bool,
}

impl Held<'_> {
    pub fn toward(&mut self, to: (i16, i16)) -> Result<()> {
        let x11 = self.native.x11()?;
        let from = self.at;
        self.native.system.act(
            json!({"input":"held-move","button":HELD_BUTTON,"from":from,"to":to,"steps":HELD_STEPS}),
            || {
                for step in 1..=HELD_STEPS {
                    let x = from.0 + (to.0 - from.0) * step / HELD_STEPS;
                    let y = from.1 + (to.1 - from.1) * step / HELD_STEPS;
                    x11.move_to(x, y)?;
                    self.native.pointer()?;
                }
                Ok(())
            },
        )?;
        self.at = to;
        Ok(())
    }

    pub fn press(&self, chord: impl Into<Chord>) -> Result<()> {
        self.native.press(chord)
    }

    pub fn until<T>(&self, expected: &str, mut read: impl FnMut(&Seen) -> Option<T>) -> Result<T> {
        let x11 = self.native.x11()?;
        let (x, y) = self.at;
        let mut nudges = 0;
        let found = poll(PATIENCE, GLANCE, true, || {
            x11.move_to(x + 1, y)?;
            x11.move_to(x, y)?;
            nudges += 1;
            Ok(self.native.look(&mut read)?.ready())
        })?;
        self.native.system.record(
            json!({"event":"held-until","expected":expected,"nudges":nudges,"seen":found.is_some()}),
        )?;
        found.ok_or_else(|| Unseen(expected.into()).into())
    }

    pub fn release(mut self) -> Result<()> {
        self.released = true;
        let x11 = self.native.x11()?;
        self.native.system.act(
            json!({"input":"release","button":HELD_BUTTON,"at":self.at}),
            || x11.release(HELD_BUTTON),
        )
    }
}

impl Drop for Held<'_> {
    fn drop(&mut self) {
        if !self.released
            && let Ok(x11) = self.native.x11()
        {
            let released = x11.release(HELD_BUTTON);
            let _ = self.native.system.record(
                json!({"event":"release-on-drop","button":HELD_BUTTON,"error":released.err().map(|error| format!("{error:#}"))}),
            );
        }
    }
}

impl Native {
    pub fn hold(&self, target: &Target) -> Result<Held<'_>> {
        let aim = self.reach(target)?;
        let at = self.on_screen(target, aim)?;
        let x11 = self.x11()?;
        self.system.act(
            json!({"input":"hold","button":HELD_BUTTON,"target":target,"aim":aim}),
            || x11.hold(HELD_BUTTON),
        )?;
        Ok(Held {
            native: self,
            at,
            released: false,
        })
    }

    pub fn point_in(&self, target: &Target, across: f32, down: f32) -> Result<(i16, i16)> {
        let at = self.wait_for(&target.to_string(), PATIENCE, |frame| {
            let found = region(frame, &target.find(frame)?.bounds);
            let x = found.x + (f32::from(found.width) * across).round() as i16;
            let y = found.y + (f32::from(found.height) * down).round() as i16;
            let avatar = Target::AVATAR
                .find(frame)
                .map(|avatar| region(frame, &avatar.bounds));
            Some((x, y, avatar.is_some_and(|avatar| contains(avatar, (x, y)))))
        })?;
        ensure!(
            !at.2,
            "{target} at {across} across and {down} down is under the avatar"
        );
        let window = self.x11()?.geometry(self.window)?;
        Ok((window.x + at.0, window.y + at.1))
    }

    pub fn resize_window(&self, width: u16, height: u16) -> Result<()> {
        let x11 = self.x11()?;
        self.system.act(
            json!({"input":"resize","window":self.window,"size":[width,height]}),
            || x11.resize(self.window, width, height),
        )
    }

    pub fn window_size(&self) -> Result<(u16, u16)> {
        let window = self.x11()?.geometry(self.window)?;
        Ok((window.width, window.height))
    }

    pub fn click(&self, target: &Target) -> Result<()> {
        self.clicks(target, 1)
    }

    pub fn double_click(&self, target: &Target) -> Result<()> {
        self.clicks(target, 2)
    }

    pub fn context_click(&self, target: &Target) -> Result<()> {
        self.press_button(target, SECONDARY, 1)
    }

    fn clicks(&self, target: &Target, count: u8) -> Result<()> {
        self.press_button(target, PRIMARY, count)
    }

    fn press_button(&self, target: &Target, button: u8, count: u8) -> Result<()> {
        let aim = self.reach(target)?;
        let x11 = self.x11()?;
        self.system.act(
            json!({"input":"click","button":button,"count":count,"target":target,"aim":aim}),
            || (0..count).try_for_each(|_| x11.click(button)),
        )
    }

    pub fn hover(&self, target: &Target) -> Result<()> {
        self.reach(target).map(drop)
    }

    pub fn drag(&self, from: &Target, onto: &Target) -> Result<()> {
        let end = self.spot(onto)?;
        let start = self.spot(from)?;
        let source = self.on_screen(from, start)?;
        let destination = self.on_screen(onto, end)?;
        let x11 = self.x11()?;
        self.system.act(
            json!({"input":"drag","button":1,"from":from,"onto":onto,"start":start,"end":end}),
            || {
                x11.move_to(source.0, source.1)?;
                x11.hold(1)?;
                let moved = x11.move_to(destination.0, destination.1);
                x11.release(1)?;
                moved
            },
        )?;
        self.pointer()
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
            if let Err(error) = single(target, frame) {
                return Some(Err(error));
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
        poll(PATIENCE, GLANCE, true, || {
            let aim = self.spot(target)?;
            let (x, y) = self.on_screen(target, aim)?;
            self.system.act(
                json!({"input":"move","target":target,"aim":aim,"at":[x,y]}),
                || x11.move_to(x, y),
            )?;
            let found = self.spot(target)?;
            if found.still_under(aim.at) {
                self.pointer()?;
                return Ok(Some(aim));
            }
            self.system
                .record(json!({"event":"re-aim","target":target,"aimed":aim,"found":found}))?;
            Ok(None)
        })?
        .ok_or_else(|| Unseen(format!("{target} holding still under the pointer")).into())
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

pub(super) fn single(target: &Target, frame: &Frame) -> Result<()> {
    if target.ambiguous(frame) {
        return Err(Defect(format!(
            "the product draws {target} more than once, so there is no single control to aim at"
        ))
        .into());
    }
    Ok(())
}
