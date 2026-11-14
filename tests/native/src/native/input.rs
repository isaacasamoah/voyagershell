use super::{Defect, GLANCE, Native};
use crate::inspection::{Target, Unseen, clear_of, contains, region};
use crate::system::{PATIENCE, System, poll};
use crate::x11::{Chord, Clipboard, Exchange, Geometry, Reading, Window};
use anyhow::{Context as _, Result, ensure};
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

const DRAG_STEPS: i32 = 4;

fn along(from: (i16, i16), to: (i16, i16), step: i32) -> (i16, i16) {
    let part = |from: i16, to: i16| {
        (i32::from(from) + (i32::from(to) - i32::from(from)) * step / DRAG_STEPS) as i16
    };
    (part(from.0, to.0), part(from.1, to.1))
}

pub struct Clip<'a> {
    system: &'a System,
    owner: &'a Clipboard,
    ledgered: &'a mut usize,
}

impl Clip<'_> {
    pub fn window(&self) -> Window {
        self.owner.window()
    }

    pub fn own(&self, text: &str) -> Result<()> {
        self.system.act(json!({"clipboard":"own","text":text}), || {
            self.owner.own(text)
        })
    }

    pub fn read(&self) -> Result<Reading> {
        self.system
            .act(json!({"clipboard":"read"}), || self.owner.read())
    }

    pub fn owner(&self) -> Result<Option<Window>> {
        self.owner.owner()
    }

    pub fn exchanges(&mut self) -> Result<Vec<Exchange>> {
        let seen = self.owner.exchanges();
        for exchange in seen.iter().skip(*self.ledgered) {
            self.system
                .record(json!({"event":"clipboard","seen":exchange}))?;
            *self.ledgered += 1;
        }
        Ok(seen)
    }
}

impl Native {
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

    pub fn drag_between(&self, target: &Target, from: (i16, i16), to: (i16, i16)) -> Result<()> {
        let held = self.spot(target)?;
        ensure!(
            held.still_under(from) && held.still_under(to),
            "{target} does not hold the drag from {from:?} to {to:?} clear of the avatar"
        );
        let start = self.on_screen(target, Aim { at: from, ..held })?;
        let end = self.on_screen(target, Aim { at: to, ..held })?;
        let x11 = self.x11()?;
        self.system.act(
            json!({"input":"drag","button":1,"target":target,"from":from,"to":to,"steps":DRAG_STEPS,"aim":held}),
            || {
                x11.move_to(start.0, start.1)?;
                x11.hold(1)?;
                let moved = (1..=DRAG_STEPS).try_for_each(|step| {
                    let (x, y) = along(start, end, step);
                    x11.move_to(x, y)
                });
                x11.release(1)?;
                moved
            },
        )?;
        self.pointer()
    }

    pub fn clipboard(&mut self) -> Result<Clip<'_>> {
        if self.clipboard.is_none() {
            let display = self
                .system
                .env
                .get("DISPLAY")
                .context("Missing owned display")?;
            self.clipboard = Some(Clipboard::connect(display)?);
        }
        Ok(Clip {
            system: &self.system,
            owner: self.clipboard.as_ref().context("Missing clipboard owner")?,
            ledgered: &mut self.ledgered,
        })
    }

    pub(super) fn release_clipboard(&mut self) -> Result<()> {
        if self.clipboard.is_none() {
            return Ok(());
        }
        let ledgered = self.clipboard()?.exchanges().map(drop);
        let stopped = self.clipboard.take().map_or(Ok(()), Clipboard::stop);
        ledgered.and(stopped)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_drag_moves_in_equal_steps_and_ends_on_its_destination() {
        let (from, to) = ((10, 300), (410, 290));
        let steps: Vec<_> = (0..=DRAG_STEPS).map(|step| along(from, to, step)).collect();
        assert_eq!(
            steps,
            [(10, 300), (110, 298), (210, 295), (310, 293), (410, 290)]
        );
        assert_eq!(along(to, from, DRAG_STEPS), from);
    }
}
