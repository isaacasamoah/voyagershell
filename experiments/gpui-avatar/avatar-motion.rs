use std::f32::consts::TAU;

pub const IDLE: &str = "idle.png";
pub const READING: [&str; 2] = ["book-frames/reading-1.png", "book-frames/reading-2.png"];

pub fn bezier(progress: f32, x1: f32, x2: f32) -> f32 {
    let progress = progress.clamp(0., 1.);
    let mut low: f32 = 0.;
    let mut high: f32 = 1.;
    for _ in 0..20 {
        let t = (low + high) * 0.5;
        let x = 3. * (1. - t).powi(2) * t * x1 + 3. * (1. - t) * t * t * x2 + t.powi(3);
        if x < progress {
            low = t;
        } else {
            high = t;
        }
    }
    let t = (low + high) * 0.5;
    3. * (1. - t) * t * t + t.powi(3)
}

pub fn float_offset(seconds: f32) -> f32 {
    let cycle = seconds.rem_euclid(8.) / 4.;
    let progress = if cycle <= 1. { cycle } else { 2. - cycle };
    -3. * bezier(progress, 0.42, 0.58)
}

pub fn samples(docking: bool) -> Vec<f32> {
    let (from, to): (f32, f32) = if docking { (310., 620.) } else { (620., 310.) };
    let rate = 48_000.;
    let k = (to / from).ln() / 0.16;
    (0..9600)
        .map(|index| {
            let t = index as f32 / rate;
            let phase = if t <= 0.16 {
                from * ((k * t).exp() - 1.) / k
            } else {
                from * ((k * 0.16).exp() - 1.) / k + to * (t - 0.16)
            };
            let gain = if t < 0.012 {
                0.06 * t / 0.012
            } else if t < 0.18 {
                0.06 * (0.001_f32 / 0.06).powf((t - 0.012) / 0.168)
            } else {
                0.001
            };
            (TAU * phase).sin() * gain
        })
        .collect()
}

pub fn frame_layers<'a>(
    previous: &'a str,
    current: &'a str,
    elapsed: f32,
    duration: f32,
) -> (&'a str, f32) {
    if duration <= 0. || elapsed >= duration {
        (current, 0.)
    } else {
        (previous, bezier(elapsed / duration, 0.45, 0.25))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settled_frames_retire_previous_pose_and_front_layer() {
        assert_eq!(frame_layers("stretch", "idle", 1., 0.8), ("idle", 0.));
        assert_eq!(frame_layers("stretch", "idle", 0., 0.), ("idle", 0.));
        let (base, opacity) = frame_layers("stretch", "idle", 0.4, 0.8);
        assert_eq!(base, "stretch");
        assert!(opacity > 0. && opacity < 1.);
    }

    #[test]
    fn float_matches_css_eight_second_cycle() {
        assert!(float_offset(0.).abs() < 0.001);
        assert!((float_offset(4.) + 3.).abs() < 0.001);
        assert!(float_offset(8.).abs() < 0.001);
        assert!((float_offset(2.) - float_offset(6.)).abs() < 0.001);
    }

    #[test]
    fn dock_and_undock_use_distinct_bounded_waveforms() {
        let dock = samples(true);
        let undock = samples(false);
        assert_eq!(dock.len(), 9600);
        assert_eq!(undock.len(), 9600);
        assert_ne!(dock, undock);
        assert_eq!(dock[0], 0.);
        assert!(dock.iter().all(|x| x.is_finite() && x.abs() <= 0.06));
        let crossings = |wave: &[f32]| wave.windows(2).filter(|p| p[0] < 0. && p[1] >= 0.).count();
        assert!(crossings(&dock[4800..7680]) > crossings(&dock[..2880]));
        assert!(crossings(&undock[4800..7680]) < crossings(&undock[..2880]));
    }
}
