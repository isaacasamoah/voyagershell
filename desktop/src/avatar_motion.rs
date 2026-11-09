use std::f32::consts::TAU;
use std::{
    collections::VecDeque,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

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

pub struct Motion {
    pub previous: &'static str,
    pub frame: &'static str,
    pub since: Instant,
    pub fade: f32,
    due: Instant,
    steps: VecDeque<(&'static str, u64, u64)>,
    settle: Option<bool>,
    reading: bool,
    busy: bool,
    page: usize,
    pub reduced_motion: bool,
}

impl Motion {
    pub fn new(reduced_motion: bool) -> Self {
        let now = Instant::now();
        Self {
            previous: IDLE,
            frame: IDLE,
            since: now,
            fade: 0.,
            due: now + Self::idle_wait(),
            steps: VecDeque::new(),
            settle: None,
            reading: false,
            busy: false,
            page: 0,
            reduced_motion,
        }
    }
    fn idle_wait() -> Duration {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |value| value.subsec_nanos());
        Duration::from_millis(20000 + u64::from(nanos) % 20000)
    }
    fn start(&mut self, steps: &[(&'static str, u64, u64)], settle: Option<bool>) {
        self.steps = steps.iter().copied().collect();
        self.settle = settle;
        self.due = Instant::now();
        self.tick();
    }
    fn transition(&mut self) {
        if self.busy == self.reading {
            return;
        }
        if self.busy {
            self.page = 0;
            self.start(
                &[("book-frames/book-out.png", 560, 260), (READING[0], 0, 500)],
                Some(true),
            );
        } else {
            self.start(
                &[
                    ("book-frames/book-away.png", 520, 180),
                    ("stretch-frames/frame-1-uncrossing.png", 90, 120),
                    ("stretch-frames/frame-2-stretched.png", 120, 120),
                    ("stretch-frames/frame-3-peak-stretch.png", 950, 200),
                    (IDLE, 0, 500),
                ],
                Some(false),
            );
        }
    }
    pub fn stretch(&mut self) {
        if self.reduced_motion || self.settle.is_some() || self.busy {
            return;
        }
        self.start(
            &[
                ("stretch-frames/frame-1-uncrossing.png", 50, 120),
                ("stretch-frames/frame-2-stretched.png", 80, 120),
                ("stretch-frames/frame-3-peak-stretch.png", 1200, 200),
                (IDLE, 0, 500),
            ],
            Some(false),
        );
    }
    pub fn tick(&mut self) {
        if self.reduced_motion {
            self.frame = if self.busy { READING[0] } else { IDLE };
            self.previous = self.frame;
            self.fade = 0.;
            return;
        }
        let now = Instant::now();
        if now < self.due {
            return;
        }
        if let Some((frame, hold, fade)) = self.steps.pop_front() {
            self.previous = self.frame;
            self.frame = frame;
            self.since = now;
            self.fade = fade as f32 * 1.6 / 1000.;
            self.due = now + Duration::from_micros((hold + fade) * 1600);
        } else if let Some(reading) = self.settle.take() {
            self.reading = reading;
            self.due = now
                + if self.busy {
                    Duration::from_millis(4800)
                } else {
                    Self::idle_wait()
                };
            self.transition();
        } else if self.reading {
            self.page = 1 - self.page;
            self.start(&[(READING[self.page], 0, 240)], Some(true));
        } else {
            self.stretch();
        }
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
