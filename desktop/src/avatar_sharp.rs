use gpui::{ImageId, RenderImage, WindowId};
use image::{
    Frame, RgbaImage,
    imageops::{self, FilterType},
};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard},
};

type Key = (ImageId, [u32; 2], u32);

#[derive(Default)]
struct Cache {
    copies: HashMap<Key, Arc<RenderImage>>,
    scales: HashMap<WindowId, u32>,
}

#[derive(Default)]
pub struct Sharp(Mutex<Cache>);

pub struct Sharpened {
    pub image: Arc<RenderImage>,
    pub retired: Vec<Arc<RenderImage>>,
}

impl Sharp {
    fn cache(&self) -> MutexGuard<'_, Cache> {
        self.0.lock().unwrap_or_else(|error| error.into_inner())
    }

    pub fn copy(
        &self,
        source: &Arc<RenderImage>,
        size: [u32; 2],
        window: WindowId,
        scale: f32,
    ) -> Sharpened {
        let original = source.size(0);
        let scale = scale.to_bits();
        let mut cache = self.cache();
        let mut retired = Vec::new();
        if cache
            .scales
            .insert(window, scale)
            .is_some_and(|was| was != scale)
        {
            let current: Vec<u32> = cache.scales.values().copied().collect();
            cache.copies.retain(|(_, _, built), image| {
                let kept = current.contains(built);
                if !kept {
                    retired.push(Arc::clone(image));
                }
                kept
            });
        }
        let unchanged = |retired| Sharpened {
            image: Arc::clone(source),
            retired,
        };
        if size.contains(&0)
            || size[0] >= u32::from(original.width)
            || size[1] >= u32::from(original.height)
        {
            return unchanged(retired);
        }
        let key = (source.id, size, scale);
        if let Some(image) = cache.copies.get(&key) {
            return Sharpened {
                image: Arc::clone(image),
                retired,
            };
        }
        let Some(image) = resample(source, size) else {
            return unchanged(retired);
        };
        cache.copies.insert(key, Arc::clone(&image));
        Sharpened { image, retired }
    }

    #[cfg(test)]
    pub fn count(&self) -> usize {
        self.cache().copies.len()
    }

    pub fn drain(&self) -> Vec<Arc<RenderImage>> {
        let mut cache = self.cache();
        cache.copies.drain().map(|(_, image)| image).collect()
    }
}

fn premultiply(pixels: &mut RgbaImage) {
    for pixel in pixels.pixels_mut() {
        let alpha = u32::from(pixel.0[3]);
        for channel in &mut pixel.0[..3] {
            *channel = ((u32::from(*channel) * alpha + 127) / 255) as u8;
        }
    }
}

fn unpremultiply(pixels: &mut RgbaImage) {
    for pixel in pixels.pixels_mut() {
        let alpha = u32::from(pixel.0[3]);
        for channel in &mut pixel.0[..3] {
            *channel = (u32::from(*channel) * 255 + alpha / 2)
                .checked_div(alpha)
                .map_or(0, |value| value.min(255) as u8);
        }
    }
}

fn lanczos(source: &RgbaImage, size: [u32; 2]) -> RgbaImage {
    let mut pixels = source.clone();
    premultiply(&mut pixels);
    let mut resized = imageops::resize(&pixels, size[0], size[1], FilterType::Lanczos3);
    unpremultiply(&mut resized);
    resized
}

fn resample(source: &RenderImage, size: [u32; 2]) -> Option<Arc<RenderImage>> {
    let original = source.size(0);
    let pixels = RgbaImage::from_raw(
        u32::from(original.width),
        u32::from(original.height),
        source.as_bytes(0)?.to_vec(),
    )?;
    Some(Arc::new(RenderImage::new(vec![Frame::new(lanczos(
        &pixels, size,
    ))])))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    fn source(side: u32) -> Arc<RenderImage> {
        Arc::new(RenderImage::new(vec![Frame::new(RgbaImage::from_pixel(
            side,
            side,
            Rgba([10, 20, 30, 255]),
        ))]))
    }

    fn side(image: &RenderImage) -> u32 {
        u32::from(image.size(0).width)
    }

    #[test]
    fn a_reduction_is_resampled_once_per_image_and_device_size() {
        let sharp = Sharp::default();
        let image = source(16);
        let window = WindowId::from(1);
        let first = sharp.copy(&image, [6, 6], window, 1.);
        assert_eq!(side(&first.image), 6);
        assert!(first.retired.is_empty());
        let again = sharp.copy(&image, [6, 6], window, 1.);
        assert!(Arc::ptr_eq(&first.image, &again.image));
        assert_eq!(sharp.count(), 1);
        let smaller = sharp.copy(&image, [3, 3], window, 1.);
        assert_eq!(side(&smaller.image), 3);
        let other = sharp.copy(&source(16), [6, 6], window, 1.);
        assert!(!Arc::ptr_eq(&first.image, &other.image));
        assert_eq!(sharp.count(), 3);
    }

    #[test]
    fn a_size_that_is_not_a_reduction_draws_the_source() {
        let sharp = Sharp::default();
        let image = source(16);
        for size in [[16, 16], [32, 32], [0, 8], [8, 16]] {
            let drawn = sharp.copy(&image, size, WindowId::from(1), 1.);
            assert!(Arc::ptr_eq(&drawn.image, &image), "{size:?}");
        }
        assert_eq!(sharp.count(), 0);
    }

    #[test]
    fn a_scale_change_rebuilds_and_retires_the_superseded_copies() {
        let sharp = Sharp::default();
        let image = source(16);
        let window = WindowId::from(1);
        sharp.copy(&image, [6, 6], window, 1.);
        sharp.copy(&image, [3, 3], window, 1.);
        assert_eq!(sharp.count(), 2);
        let moved = sharp.copy(&image, [10, 10], window, 5. / 3.);
        assert_eq!(side(&moved.image), 10);
        assert_eq!(moved.retired.len(), 2);
        assert_eq!(sharp.count(), 1);
    }

    #[test]
    fn a_scale_in_use_by_another_window_is_kept() {
        let sharp = Sharp::default();
        let image = source(16);
        let (laptop, external) = (WindowId::from(1), WindowId::from(2));
        sharp.copy(&image, [10, 10], laptop, 5. / 3.);
        sharp.copy(&image, [6, 6], external, 1.);
        let moved = sharp.copy(&image, [6, 6], laptop, 1.);
        assert_eq!(moved.retired.len(), 1);
        assert_eq!(sharp.count(), 1);
        let left = sharp.copy(&image, [12, 12], external, 2.);
        assert!(left.retired.is_empty());
        assert_eq!(sharp.count(), 2);
    }

    #[test]
    fn repeated_dock_and_undock_hold_images_times_sizes() {
        let sharp = Sharp::default();
        let images = [source(16), source(16)];
        let window = WindowId::from(1);
        for _ in 0..25 {
            for size in [[6, 6], [3, 3]] {
                for image in &images {
                    let drawn = sharp.copy(image, size, window, 1.);
                    assert!(drawn.retired.is_empty());
                }
            }
        }
        assert_eq!(sharp.count(), images.len() * 2);
        assert_eq!(sharp.drain().len(), 4);
        assert_eq!(sharp.count(), 0);
    }

    #[test]
    fn colour_does_not_bleed_from_transparent_pixels() {
        let mut pixels = RgbaImage::from_pixel(16, 16, Rgba([0, 0, 0, 0]));
        for y in 0..16 {
            for x in 0..8 {
                pixels.put_pixel(x, y, Rgba([255, 255, 255, 255]));
            }
        }
        let sharp = Sharp::default();
        let image = Arc::new(RenderImage::new(vec![Frame::new(pixels)]));
        let drawn = sharp.copy(&image, [5, 5], WindowId::from(1), 1.);
        let bytes = drawn.image.as_bytes(0).unwrap();
        let edge: Vec<&[u8; 4]> = bytes
            .as_chunks::<4>()
            .0
            .iter()
            .filter(|pixel| pixel[3] > 0 && pixel[3] < 255)
            .collect();
        assert!(!edge.is_empty());
        assert!(
            edge.iter()
                .all(|pixel| pixel[..3].iter().all(|c| *c >= 250))
        );
    }
}
