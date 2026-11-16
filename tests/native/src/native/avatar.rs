use anyhow::{Context, Result, ensure};
use image::{
    ImageFormat, RgbaImage,
    imageops::{self, FilterType},
};
use serde::Serialize;
use std::ops::RangeInclusive;

const ARTWORK: &[u8] = include_bytes!("../../../../desktop/assets/idle.png");

pub struct Reference {
    side: u32,
    lanczos: RgbaImage,
    bilinear: RgbaImage,
    inside: Vec<(u32, u32)>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Fit {
    pub offset: [i32; 2],
    pub distance: f64,
    pub gain: f64,
    pub base: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Sharpness {
    pub side: u32,
    pub compared: usize,
    pub lanczos: Fit,
    pub bilinear: Fit,
}

impl Sharpness {
    pub fn sharper(&self) -> bool {
        self.lanczos.distance < self.bilinear.distance
    }
}

pub fn artwork() -> Result<RgbaImage> {
    Ok(image::load_from_memory_with_format(ARTWORK, ImageFormat::Png)
        .context("The shipped avatar artwork")?
        .into_rgba8())
}

fn lanczos(source: &RgbaImage, side: u32) -> RgbaImage {
    let mut pixels = source.clone();
    for pixel in pixels.pixels_mut() {
        let alpha = u32::from(pixel.0[3]);
        for channel in &mut pixel.0[..3] {
            *channel = ((u32::from(*channel) * alpha + 127) / 255) as u8;
        }
    }
    let mut resized = imageops::resize(&pixels, side, side, FilterType::Lanczos3);
    for pixel in resized.pixels_mut() {
        let alpha = u32::from(pixel.0[3]);
        for channel in &mut pixel.0[..3] {
            *channel = if alpha == 0 {
                0
            } else {
                ((u32::from(*channel) * 255 + alpha / 2) / alpha).min(255) as u8
            };
        }
    }
    resized
}

fn bilinear(source: &RgbaImage, side: u32) -> RgbaImage {
    let (width, height) = source.dimensions();
    let tap = |at: f32, length: u32, limit: u32| {
        let position = ((at + 0.5) * length as f32 / side as f32 - 0.5).clamp(0., (limit - 1) as f32);
        let low = position.floor() as u32;
        (low, (low + 1).min(limit - 1), position - low as f32)
    };
    RgbaImage::from_fn(side, side, |x, y| {
        let (left, right, across) = tap(x as f32, width, width);
        let (top, bottom, down) = tap(y as f32, height, height);
        let mut out = [0u8; 4];
        for (channel, value) in out.iter_mut().enumerate() {
            let at = |x: u32, y: u32| f32::from(source.get_pixel(x, y).0[channel]);
            let above = at(left, top) * (1. - across) + at(right, top) * across;
            let below = at(left, bottom) * (1. - across) + at(right, bottom) * across;
            *value = (above * (1. - down) + below * down).round() as u8;
        }
        image::Rgba(out)
    })
}

impl Reference {
    pub fn new(side: u32) -> Result<Self> {
        let source = artwork()?;
        ensure!(
            side > 0 && side < source.width().min(source.height()),
            "The reference side {side} is not a reduction of the artwork"
        );
        let lanczos = lanczos(&source, side);
        let opaque = |x: u32, y: u32| lanczos.get_pixel(x, y).0[3] == 255;
        let mut inside = Vec::new();
        for y in 1..side - 1 {
            for x in 1..side - 1 {
                if (y - 1..=y + 1).all(|y| (x - 1..=x + 1).all(|x| opaque(x, y))) {
                    inside.push((x, y));
                }
            }
        }
        ensure!(!inside.is_empty(), "The reference has no opaque interior");
        Ok(Self {
            side,
            bilinear: bilinear(&source, side),
            lanczos,
            inside,
        })
    }

    fn distance(
        &self,
        drawn: &RgbaImage,
        reference: &RgbaImage,
        offset: [i32; 2],
    ) -> Option<(f64, f64, f64)> {
        let mut pairs = Vec::with_capacity(self.inside.len() * 3);
        for &(x, y) in &self.inside {
            let (at_x, at_y) = (x as i32 + offset[0], y as i32 + offset[1]);
            if at_x < 0 || at_y < 0 || at_x >= drawn.width() as i32 || at_y >= drawn.height() as i32
            {
                return None;
            }
            let (seen, want) = (
                drawn.get_pixel(at_x as u32, at_y as u32).0,
                reference.get_pixel(x, y).0,
            );
            pairs.extend((0..3).map(|c| (f64::from(want[c]), f64::from(seen[c]))));
        }
        let n = pairs.len() as f64;
        let (sum_r, sum_c) = pairs.iter().fold((0., 0.), |(r, c), p| (r + p.0, c + p.1));
        let (sum_rr, sum_rc) = pairs
            .iter()
            .fold((0., 0.), |(rr, rc), p| (rr + p.0 * p.0, rc + p.0 * p.1));
        let spread = n * sum_rr - sum_r * sum_r;
        let gain = if spread > 0. {
            (n * sum_rc - sum_r * sum_c) / spread
        } else {
            1.
        };
        let base = (sum_c - gain * sum_r) / n;
        let residual = pairs
            .iter()
            .map(|(r, c)| (c - gain * r - base).abs())
            .sum::<f64>()
            / n;
        Some((residual, gain, base))
    }

    fn fit(
        &self,
        drawn: &RgbaImage,
        reference: &RgbaImage,
        across: &RangeInclusive<i32>,
        down: &RangeInclusive<i32>,
    ) -> Option<Fit> {
        down.clone()
            .flat_map(|y| across.clone().map(move |x| [x, y]))
            .filter_map(|offset| {
                self.distance(drawn, reference, offset)
                    .map(|(distance, gain, base)| Fit {
                        offset,
                        distance,
                        gain,
                        base,
                    })
            })
            .min_by(|a, b| a.distance.total_cmp(&b.distance))
    }

    pub fn judge(
        &self,
        drawn: &RgbaImage,
        across: RangeInclusive<i32>,
        down: RangeInclusive<i32>,
    ) -> Option<Sharpness> {
        Some(Sharpness {
            side: self.side,
            compared: self.inside.len() * 3,
            lanczos: self.fit(drawn, &self.lanczos, &across, &down)?,
            bilinear: self.fit(drawn, &self.bilinear, &across, &down)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    fn drawn_with(reference: &RgbaImage, at: [u32; 2]) -> RgbaImage {
        let mut canvas = RgbaImage::from_fn(reference.width() + 20, reference.height() + 20, |x, y| {
            Rgba([(x * 3) as u8, (y * 2) as u8, 90, 255])
        });
        for (x, y, pixel) in reference.enumerate_pixels() {
            let alpha = u32::from(pixel.0[3]);
            let below = canvas.get_pixel_mut(x + at[0], y + at[1]);
            for channel in 0..3 {
                below.0[channel] = ((u32::from(pixel.0[channel]) * alpha
                    + u32::from(below.0[channel]) * (255 - alpha))
                    / 255) as u8;
            }
        }
        canvas
    }

    #[test]
    fn a_lanczos_drawing_fits_lanczos_at_its_offset_and_is_sharper() {
        let reference = Reference::new(64).unwrap();
        let drawn = drawn_with(&reference.lanczos, [6, 9]);
        let fit = reference.judge(&drawn, 0..=12, 0..=12).unwrap();
        assert_eq!(fit.lanczos.offset, [6, 9]);
        assert!(fit.lanczos.distance < 0.5, "{fit:?}");
        assert!(fit.sharper());
    }

    #[test]
    fn a_dimmed_drawing_fits_with_its_gain_and_base() {
        let reference = Reference::new(64).unwrap();
        let mut drawn = drawn_with(&reference.lanczos, [5, 5]);
        for pixel in drawn.pixels_mut() {
            for channel in &mut pixel.0[..3] {
                *channel = (f64::from(*channel) * 0.55 + 17.) as u8;
            }
        }
        let fit = reference.judge(&drawn, 0..=12, 0..=12).unwrap();
        assert_eq!(fit.lanczos.offset, [5, 5]);
        assert!((fit.lanczos.gain - 0.55).abs() < 0.03, "{fit:?}");
        assert!(fit.sharper(), "{fit:?}");
    }

    #[test]
    fn a_bilinear_drawing_is_not_sharper() {
        let reference = Reference::new(64).unwrap();
        let drawn = drawn_with(&reference.bilinear, [4, 4]);
        let fit = reference.judge(&drawn, 0..=12, 0..=12).unwrap();
        assert_eq!(fit.bilinear.offset, [4, 4]);
        assert!(!fit.sharper(), "{fit:?}");
        assert!(fit.lanczos.distance > fit.bilinear.distance + 1.);
    }

    #[test]
    fn an_offset_outside_the_capture_is_not_judged() {
        let reference = Reference::new(64).unwrap();
        let drawn = drawn_with(&reference.lanczos, [6, 9]);
        assert!(reference.judge(&drawn, 70..=80, 0..=12).is_none());
    }

    #[test]
    fn a_reference_must_be_a_reduction() {
        assert!(Reference::new(512).is_err());
        assert!(Reference::new(0).is_err());
    }
}
