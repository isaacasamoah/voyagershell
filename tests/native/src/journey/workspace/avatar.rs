use super::super::layout::avatar_bounds;
use crate::inspection::region;
use crate::native::{Native, Reference, Sharpness};
use crate::x11::{Geometry, Pixels};
use anyhow::Result;
use image::RgbaImage;
use serde::Serialize;
use std::thread::sleep;
use std::time::Duration;

const MARGIN: i32 = 32;
const REACH: i32 = 6;
const RISE: i32 = 36;
const FRAMES: usize = 5;
const SPACING: Duration = Duration::from_millis(90);

#[derive(PartialEq, Serialize)]
pub struct Place {
    pub diameter: f32,
    pub scale: f32,
    pub side: u32,
    pub capture: Geometry,
    pub nominal: [i32; 2],
}

pub struct Avatar {
    place: Place,
}

fn expand(inner: Geometry, window: (i32, i32)) -> Geometry {
    let left = (i32::from(inner.x) - MARGIN).max(0);
    let top = (i32::from(inner.y) - MARGIN).max(0);
    let right = (i32::from(inner.x) + i32::from(inner.width) + MARGIN).min(window.0);
    let bottom = (i32::from(inner.y) + i32::from(inner.height) + MARGIN).min(window.1);
    Geometry {
        x: left as i16,
        y: top as i16,
        width: (right - left) as u16,
        height: (bottom - top) as u16,
    }
}

impl Avatar {
    pub fn find(native: &Native, diameter: f32) -> Result<Self> {
        let place = native.observe("the avatar drawn with its bounds", |seen| {
            let bounds = avatar_bounds(seen)?;
            let scale = seen.frame.window.scale;
            let window = (
                (seen.frame.window.width * scale).round() as i32,
                (seen.frame.window.height * scale).round() as i32,
            );
            let avatar = region(seen.frame, &bounds);
            let capture = expand(avatar, window);
            let image = ((diameter - 2.) * 0.72 * scale).round() as u32;
            let inset = (diameter * 0.14 * scale).round() as i32;
            Some(Place {
                diameter,
                scale,
                side: image,
                capture,
                nominal: [
                    i32::from(avatar.x) - i32::from(capture.x) + inset,
                    i32::from(avatar.y) - i32::from(capture.y) + inset,
                ],
            })
        })?;
        Ok(Self { place })
    }

    pub fn place(&self) -> &Place {
        &self.place
    }

    fn judge(&self, reference: &Reference, drawn: &RgbaImage, rise: i32) -> Result<Sharpness> {
        let [x, y] = self.place.nominal;
        reference
            .judge(drawn, x - REACH..=x + REACH, y - rise..=y + REACH)
            .ok_or_else(|| anyhow::anyhow!("The reference does not fit inside the capture"))
    }

    pub fn at_rest(&self, native: &Native) -> Result<(Sharpness, Pixels)> {
        let reference = Reference::new(self.place.side)?;
        let look = native.settle(
            "the avatar's pixels unchanged for a moment",
            |_| native.look_at(self.place.capture).ok(),
            |_| true,
        )?;
        let sharpness = self.judge(&reference, &look.image()?, REACH)?;
        Ok((sharpness, look))
    }

    pub fn floating(&self, native: &Native) -> Result<Vec<(Sharpness, Pixels)>> {
        let reference = Reference::new(self.place.side)?;
        let mut frames = Vec::new();
        for _ in 0..FRAMES {
            let look = native.look_at(self.place.capture)?;
            let sharpness = self.judge(&reference, &look.image()?, RISE)?;
            frames.push((sharpness, look));
            sleep(SPACING);
        }
        Ok(frames)
    }
}
