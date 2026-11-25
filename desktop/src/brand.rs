use gpui::{Image, ImageFormat};
use std::sync::{Arc, LazyLock};

pub(crate) static NATIVE_BRAND: LazyLock<Arc<Image>> =
    LazyLock::new(|| png(include_bytes!("../assets/native-brand.png")));
pub(crate) static TAGLINE: LazyLock<Arc<Image>> =
    LazyLock::new(|| png(include_bytes!("../assets/tagline.png")));

fn png(bytes: &[u8]) -> Arc<Image> {
    Arc::new(Image::from_bytes(ImageFormat::Png, bytes.to_vec()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn brand_images_are_carried_by_the_executable() {
        for (brand, size) in [(&NATIVE_BRAND, (400, 214)), (&TAGLINE, (400, 27))] {
            let decoded =
                image::load_from_memory_with_format(&brand.bytes, image::ImageFormat::Png).unwrap();
            assert_eq!((decoded.width(), decoded.height()), size);
        }
    }
}
