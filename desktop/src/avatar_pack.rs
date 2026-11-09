use anyhow::{Context as _, Result, bail};
use gpui::RenderImage;
use image::{DynamicImage, Frame, ImageDecoder, ImageFormat, ImageReader, Limits};
use serde::de::DeserializeOwned;
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{BufReader, Read, Write},
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};
use voyager_contract::avatar_animation::{Canvas, Configuration, Pack, Pose, Trigger};

pub mod defaults;

const DOCUMENT_LIMIT: u64 = 1024 * 1024;
const IMAGE_BUDGET: u64 = 64 * 1024 * 1024;

pub struct Prepared {
    pub directory: PathBuf,
    pub pack: Arc<Compiled>,
    pub error: Option<String>,
}

pub struct Compiled {
    pub id: String,
    pub canvas: Canvas,
    pub poses: Vec<Drawing>,
    pub clips: Vec<Timeline>,
    pub bindings: [Option<usize>; 4],
    pub rest: usize,
}

#[derive(Clone)]
pub struct Drawing {
    pub image: Arc<RenderImage>,
    pub image_size: [u32; 2],
    pub pose: Pose,
}

pub struct Timeline {
    pub from: usize,
    pub steps: Vec<TimedPose>,
    pub easing: [f32; 4],
    pub duration_ms: u64,
}

pub struct TimedPose {
    pub from: usize,
    pub pose: usize,
    pub start_ms: u64,
    pub fade_ms: u32,
    pub end_ms: u64,
}

pub fn asset(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("assets")
        .join(name)
}

fn basename(name: &str, extension: &str) -> Result<()> {
    let suffix = format!(".{extension}");
    let stem = name
        .strip_suffix(&suffix)
        .context("Unsupported asset filename")?;
    if stem.is_empty()
        || !stem
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-'))
    {
        bail!("Asset names must be basenames containing letters, digits, underscores or hyphens");
    }
    Ok(())
}

fn document<T: DeserializeOwned>(path: &Path) -> Result<T> {
    let mut bytes = Vec::new();
    File::open(path)
        .with_context(|| format!("Opening {}", path.display()))?
        .take(DOCUMENT_LIMIT + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > DOCUMENT_LIMIT {
        bail!("Animation document exceeds 1 MiB");
    }
    serde_json::from_slice(&bytes).with_context(|| format!("Reading {}", path.display()))
}

fn image(path: &Path, remaining: &mut u64) -> Result<Arc<RenderImage>> {
    let mut reader = ImageReader::with_format(BufReader::new(File::open(path)?), ImageFormat::Png);
    let mut limits = Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(*remaining);
    reader.limits(limits);
    let decoder = reader.into_decoder()?;
    let (width, height) = decoder.dimensions();
    let bytes = u64::from(width) * u64::from(height) * 4;
    *remaining = remaining
        .checked_sub(bytes)
        .context("Animation images exceed 64 MiB decoded RGBA")?;
    let mut pixels = DynamicImage::from_decoder(decoder)?.into_rgba8();
    for pixel in pixels.pixels_mut() {
        pixel.0.swap(0, 2);
    }
    Ok(Arc::new(RenderImage::new(vec![Frame::new(pixels)])))
}

fn compile(
    configuration: &Configuration,
    pack: Pack,
    path: impl Fn(&str) -> PathBuf,
) -> Result<Compiled> {
    if configuration.version != 1 || pack.version != 1 || pack.id.is_empty() {
        bail!("Animation format must be version 1 with a nonempty pack id");
    }
    if pack
        .canvas
        .size
        .iter()
        .any(|size| *size == 0 || *size > 4096)
        || pack
            .canvas
            .anchor
            .iter()
            .zip(pack.canvas.size)
            .any(|(a, size)| !a.is_finite() || *a < 0. || *a > size as f32)
    {
        bail!("Animation canvas or anchor is invalid");
    }
    if !pack.effects.is_empty() {
        bail!("Native animation effects are not supported");
    }
    let mut remaining = IMAGE_BUDGET;
    let mut files = BTreeMap::new();
    let mut images = BTreeMap::new();
    for (id, filename) in &pack.images {
        basename(filename, "png")?;
        if !files.contains_key(filename) {
            let decoded = image(&path(filename), &mut remaining)
                .with_context(|| format!("Loading animation image {filename}"))?;
            files.insert(filename.clone(), decoded);
        }
        images.insert(
            id.as_str(),
            Arc::clone(files.get(filename).context("Missing decoded image")?),
        );
    }
    let names: BTreeMap<_, _> = pack
        .poses
        .keys()
        .enumerate()
        .map(|(index, name)| (name.as_str(), index))
        .collect();
    let pose_index = |name: &str| {
        names
            .get(name)
            .copied()
            .with_context(|| format!("Unknown animation pose {name}"))
    };
    let rest = pose_index(&configuration.rest_pose)?;
    let mut poses = Vec::with_capacity(pack.poses.len());
    for (name, pose) in &pack.poses {
        let image = images
            .get(pose.image.as_str())
            .context("Pose names an unknown image")?;
        let image_size = image.size(0);
        let size = [u32::from(image_size.width), u32::from(image_size.height)];
        let [x, y, width, height] = pose.rect;
        if width == 0
            || height == 0
            || x.checked_add(width).is_none_or(|end| end > size[0])
            || y.checked_add(height).is_none_or(|end| end > size[1])
            || !pose.scale.is_finite()
            || pose.scale <= 0.
            || !(pose.scale * width as f32).is_finite()
            || !(pose.scale * height as f32).is_finite()
            || size
                .iter()
                .any(|dimension| !(*dimension as f32 * pose.scale * 256.).is_finite())
            || pose
                .anchor
                .iter()
                .zip([width, height])
                .any(|(a, limit)| !a.is_finite() || *a < 0. || *a > limit as f32)
        {
            bail!("Animation pose {name} has invalid bounds, anchor or scale");
        }
        poses.push(Drawing {
            image: Arc::clone(image),
            image_size: size,
            pose: pose.clone(),
        });
    }
    let clip_names: BTreeMap<_, _> = pack
        .clips
        .keys()
        .enumerate()
        .map(|(index, name)| (name.as_str(), index))
        .collect();
    let mut clips = Vec::with_capacity(pack.clips.len());
    for (name, clip) in &pack.clips {
        if clip.steps.is_empty()
            || !clip.effects.is_empty()
            || clip
                .easing
                .iter()
                .any(|value| !value.is_finite() || !(0. ..=1.).contains(value))
        {
            bail!("Animation clip {name} is empty or uses unsupported easing/effects");
        }
        let from = pose_index(&clip.from)?;
        let mut previous = from;
        let mut duration_ms = 0_u64;
        let mut steps = Vec::with_capacity(clip.steps.len());
        for step in &clip.steps {
            let pose = pose_index(&step.pose)?;
            let end_ms = duration_ms
                .checked_add(u64::from(step.fade_ms) + u64::from(step.hold_ms))
                .context("Animation duration overflow")?;
            steps.push(TimedPose {
                from: previous,
                pose,
                start_ms: duration_ms,
                fade_ms: step.fade_ms,
                end_ms,
            });
            previous = pose;
            duration_ms = end_ms;
        }
        if duration_ms == 0
            || Instant::now()
                .checked_add(Duration::from_millis(duration_ms))
                .is_none()
        {
            bail!("Animation clip {name} must have a finite positive supported duration");
        }
        clips.push(Timeline {
            from,
            steps,
            easing: clip.easing,
            duration_ms,
        });
    }
    let binding = |trigger| {
        configuration
            .triggers
            .clip(trigger)
            .map(|name| {
                clip_names
                    .get(name)
                    .copied()
                    .with_context(|| format!("Unknown trigger clip {name}"))
            })
            .transpose()
    };
    let bindings = [
        binding(Trigger::Hover)?,
        binding(Trigger::Click)?,
        binding(Trigger::Dock)?,
        binding(Trigger::Undock)?,
    ];
    Ok(Compiled {
        id: pack.id,
        canvas: pack.canvas,
        poses,
        clips,
        bindings,
        rest,
    })
}

pub fn load(directory: &Path) -> Result<Arc<Compiled>> {
    let configuration: Configuration = document(&directory.join("configuration.json"))?;
    basename(&configuration.pack, "json")?;
    let pack = document(&directory.join(&configuration.pack))?;
    Ok(Arc::new(compile(&configuration, pack, |name| {
        directory.join(name)
    })?))
}

fn seed(path: &Path, bytes: &[u8]) -> Result<()> {
    match OpenOptions::new().write(true).create_new(true).open(path) {
        Ok(mut file) => file.write_all(bytes)?,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
        Err(error) => return Err(error.into()),
    }
    Ok(())
}

pub fn prepare(directory: &Path) -> Result<Prepared> {
    let (configuration, pack) = defaults::pack();
    let attempt = || -> Result<Arc<Compiled>> {
        fs::create_dir_all(directory)?;
        for name in pack.images.values() {
            seed(&directory.join(name), &fs::read(defaults::source(name))?)?;
        }
        seed(
            &directory.join("pack.json"),
            &serde_json::to_vec_pretty(&pack)?,
        )?;
        seed(
            &directory.join("configuration.json"),
            &serde_json::to_vec_pretty(&configuration)?,
        )?;
        seed(
            &directory.join("pack.schema.json"),
            include_bytes!("../../contract/generated/avatar/avatarAnimationPack.schema.json"),
        )?;
        seed(
            &directory.join("configuration.schema.json"),
            include_bytes!(
                "../../contract/generated/avatar/avatarAnimationConfiguration.schema.json"
            ),
        )?;
        load(directory)
    };
    let (pack, error) = match attempt() {
        Ok(pack) => (pack, None),
        Err(error) => (
            Arc::new(compile(&configuration, pack, defaults::source)?),
            Some(format!("Avatar animations: {error:#}")),
        ),
    };
    Ok(Prepared {
        directory: directory.to_path_buf(),
        pack,
        error,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_pack_is_finite_shared_and_validated() {
        let (configuration, pack) = defaults::pack();
        let loaded = compile(&configuration, pack.clone(), defaults::source).unwrap();
        let float = &loaded.clips[loaded.bindings[2].unwrap()];
        assert_eq!(float.duration_ms, 2000);
        assert_eq!(loaded.clips[loaded.bindings[0].unwrap()].duration_ms, 3632);
        assert_eq!(loaded.bindings[1], None);
        assert_eq!(loaded.bindings[3], None);
        assert!(
            loaded
                .poses
                .iter()
                .filter(|p| p.pose.image == "rest")
                .all(|p| Arc::ptr_eq(&p.image, &loaded.poses[loaded.rest].image))
        );
        let mut bad = pack.clone();
        bad.poses.get_mut("rest").unwrap().rect[2] = 513;
        assert!(compile(&configuration, bad, defaults::source).is_err());
        let mut bad = configuration.clone();
        bad.triggers.dock = Some("missing".into());
        assert!(compile(&bad, pack.clone(), defaults::source).is_err());
        let mut bad = pack.clone();
        let pose = bad.poses.get_mut("rest").unwrap();
        pose.rect = [0, 0, 1, 1];
        pose.anchor = [0., 0.];
        pose.scale = 1e38;
        assert!(compile(&configuration, bad, defaults::source).is_err());
        let mut bad = pack.clone();
        bad.clips.get_mut("float").unwrap().effects.push(());
        assert!(compile(&configuration, bad, defaults::source).is_err());
        let mut bad = pack;
        bad.images.insert("bad".into(), "../idle.png".into());
        assert!(compile(&configuration, bad, defaults::source).is_err());
    }
    #[test]
    fn rgba_budget_is_checked_for_rgb_images_and_corrupt_png_is_refused() {
        let path = std::env::temp_dir().join(format!(
            "voyager-animation-budget-{}.png",
            std::process::id()
        ));
        image::RgbImage::new(8, 8).save(&path).unwrap();
        let mut budget = 255;
        let refusal = image(&path, &mut budget).unwrap_err().to_string();
        assert!(refusal.contains("decoded RGBA"), "{refusal}");
        fs::write(&path, b"not PNG").unwrap();
        assert!(image(&path, &mut budget).is_err());
        fs::remove_file(path).unwrap();
    }
}
