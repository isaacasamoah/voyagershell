use crate::avatar_pack::Compiled;
use std::{
    f32::consts::TAU,
    sync::Arc,
    time::{Duration, Instant},
};
use voyager_contract::avatar_animation::Trigger;

fn easing(progress: f32, curve: [f32; 4]) -> f32 {
    let progress = progress.clamp(0., 1.);
    let mut low: f32 = 0.;
    let mut high: f32 = 1.;
    for _ in 0..20 {
        let t = (low + high) * 0.5;
        let x = 3. * (1. - t).powi(2) * t * curve[0] + 3. * (1. - t) * t * t * curve[2] + t.powi(3);
        if x < progress {
            low = t;
        } else {
            high = t;
        }
    }
    let t = (low + high) * 0.5;
    3. * (1. - t).powi(2) * t * curve[1] + 3. * (1. - t) * t * t * curve[3] + t.powi(3)
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

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Frame {
    pub back: usize,
    pub front: Option<(usize, f32)>,
}

impl Frame {
    fn still(pose: usize) -> Self {
        Self {
            back: pose,
            front: None,
        }
    }
}

#[derive(Clone, Copy)]
pub enum Refresh {
    Still,
    Frame,
    At(Instant),
}

struct Playback {
    clip: usize,
    started: Instant,
}

pub struct Motion {
    pub pack: Arc<Compiled>,
    pub frame: Frame,
    pub reduced_motion: bool,
    active: Option<Playback>,
    pub generation: u64,
}

impl Motion {
    pub fn new(pack: Arc<Compiled>, reduced_motion: bool) -> Self {
        Self {
            frame: Frame::still(pack.rest),
            pack,
            reduced_motion,
            active: None,
            generation: 0,
        }
    }

    pub fn replace(&mut self, pack: Arc<Compiled>) -> Arc<Compiled> {
        let retired = std::mem::replace(&mut self.pack, pack);
        self.active = None;
        self.frame = Frame::still(self.pack.rest);
        self.generation = self.generation.wrapping_add(1);
        retired
    }

    pub fn trigger(&mut self, trigger: Trigger) -> bool {
        self.tick();
        if self.reduced_motion || matches!(trigger, Trigger::Hover) && self.active.is_some() {
            return false;
        }
        if matches!(trigger, Trigger::Undock) {
            self.active = None;
            self.frame = Frame::still(self.pack.rest);
            self.generation = self.generation.wrapping_add(1);
        }
        let index = match trigger {
            Trigger::Hover => 0,
            Trigger::Click => 1,
            Trigger::Dock => 2,
            Trigger::Undock => 3,
        };
        let Some(clip) = self.pack.bindings[index] else {
            return false;
        };
        let Some(timeline) = self.pack.clips.get(clip) else {
            return false;
        };
        self.frame = Frame::still(timeline.from);
        self.active = Some(Playback {
            clip,
            started: Instant::now(),
        });
        self.generation = self.generation.wrapping_add(1);
        self.tick();
        true
    }

    pub fn tick(&mut self) -> Refresh {
        self.tick_at(Instant::now())
    }

    fn tick_at(&mut self, now: Instant) -> Refresh {
        let Some(active) = &self.active else {
            return Refresh::Still;
        };
        let Some(clip) = self.pack.clips.get(active.clip) else {
            return Refresh::Still;
        };
        let elapsed = now.saturating_duration_since(active.started);
        let elapsed_ms = u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX);
        if elapsed_ms >= clip.duration_ms {
            self.frame = Frame::still(clip.steps.last().map_or(self.pack.rest, |step| step.pose));
            self.active = None;
            return Refresh::Still;
        }
        let index = clip.steps.partition_point(|step| step.end_ms <= elapsed_ms);
        let Some(step) = clip.steps.get(index) else {
            return Refresh::Still;
        };
        let deadline = active
            .started
            .checked_add(Duration::from_millis(step.end_ms));
        let same = self
            .pack
            .poses
            .get(step.from)
            .zip(self.pack.poses.get(step.pose))
            .is_some_and(|(a, b)| {
                Arc::ptr_eq(&a.image, &b.image)
                    && a.pose.rect == b.pose.rect
                    && a.pose.anchor == b.pose.anchor
                    && a.pose.scale == b.pose.scale
            });
        let faded = elapsed.saturating_sub(Duration::from_millis(step.start_ms));
        if step.fade_ms > 0 && faded < Duration::from_millis(u64::from(step.fade_ms)) && !same {
            let alpha = easing(
                faded.as_secs_f32() * 1000. / step.fade_ms as f32,
                clip.easing,
            );
            self.frame = Frame {
                back: step.from,
                front: Some((step.pose, alpha)),
            };
            return Refresh::Frame;
        }
        self.frame = Frame::still(step.pose);
        if !same && step.end_ms.saturating_sub(elapsed_ms) <= 34 {
            return Refresh::Frame;
        }
        deadline.map_or(Refresh::Still, Refresh::At)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dock_and_undock_use_distinct_bounded_waveforms() {
        let dock = samples(true);
        let undock = samples(false);
        assert_eq!(dock.len(), 9600);
        assert_eq!(undock.len(), 9600);
        assert_eq!(dock[0], 0.);
        assert!(dock.iter().all(|x| x.is_finite() && x.abs() <= 0.06));
        let crossings = |wave: &[f32]| wave.windows(2).filter(|p| p[0] < 0. && p[1] >= 0.).count();
        assert!(crossings(&dock[4800..7680]) > crossings(&dock[..2880]));
        assert!(crossings(&undock[4800..7680]) < crossings(&undock[..2880]));
    }

    fn motion() -> Motion {
        use crate::avatar_pack::{Compiled, Drawing, TimedPose, Timeline};
        use voyager_contract::avatar_animation::{Canvas, Pose};
        let image = Arc::new(gpui::RenderImage::new(vec![image::Frame::new(
            image::RgbaImage::new(2, 2),
        )]));
        let drawing = Drawing {
            image,
            image_size: [2, 2],
            pose: Pose {
                image: "a".into(),
                rect: [0, 0, 2, 2],
                anchor: [1., 1.],
                scale: 1.,
            },
        };
        let mut shifted = drawing.clone();
        shifted.pose.anchor[1] = 2.;
        Motion::new(
            Arc::new(Compiled {
                id: "test".into(),
                canvas: Canvas {
                    size: [2, 2],
                    anchor: [1., 1.],
                },
                poses: vec![drawing, shifted],
                clips: vec![Timeline {
                    from: 0,
                    steps: vec![
                        TimedPose {
                            from: 0,
                            pose: 1,
                            start_ms: 0,
                            fade_ms: 200,
                            end_ms: 500,
                        },
                        TimedPose {
                            from: 1,
                            pose: 0,
                            start_ms: 500,
                            fade_ms: 200,
                            end_ms: 2000,
                        },
                    ],
                    easing: [0., 0., 1., 1.],
                    duration_ms: 2000,
                }],
                bindings: [Some(0), None, Some(0), None],
                rest: 0,
            }),
            false,
        )
    }

    #[test]
    fn finite_playback_settles_holds_and_never_restarts() {
        let mut motion = motion();
        assert!(matches!(motion.tick(), Refresh::Still));
        assert!(!motion.trigger(Trigger::Click));
        assert!(motion.trigger(Trigger::Hover));
        let started = motion.active.as_ref().unwrap().started;
        assert!(matches!(
            motion.tick_at(started + Duration::from_millis(100)),
            Refresh::Frame
        ));
        assert!((motion.frame.front.unwrap().1 - 0.5).abs() < 0.001);
        assert!(
            matches!(motion.tick_at(started + Duration::from_millis(300)), Refresh::At(t) if t == started + Duration::from_millis(500))
        );
        assert_eq!(motion.frame, Frame::still(1));
        assert!(matches!(
            motion.tick_at(started + Duration::from_secs(9)),
            Refresh::Still
        ));
        assert_eq!(motion.frame, Frame::still(0));
        assert!(matches!(
            motion.tick_at(started + Duration::from_secs(60)),
            Refresh::Still
        ));
        assert!(motion.active.is_none());
    }

    #[test]
    fn dock_preempts_hover_and_undock_cancels_without_changing_reduced_preference() {
        let mut motion = motion();
        assert!(motion.trigger(Trigger::Hover));
        let generation = motion.generation;
        assert!(!motion.trigger(Trigger::Hover));
        assert_eq!(motion.generation, generation);
        assert!(motion.trigger(Trigger::Dock));
        assert_ne!(motion.generation, generation);
        assert!(!motion.trigger(Trigger::Hover));
        assert!(!motion.trigger(Trigger::Undock));
        assert!(motion.active.is_none());
        assert_eq!(motion.frame, Frame::still(0));
        motion.reduced_motion = true;
        assert!(!motion.trigger(Trigger::Dock));
        motion.replace(Arc::clone(&motion.pack));
        assert!(motion.reduced_motion);
        assert!(motion.active.is_none());
    }

    #[test]
    fn identical_pose_does_not_double_alpha() {
        let mut motion = motion();
        let pack = Arc::get_mut(&mut motion.pack).unwrap();
        pack.poses[1] = pack.poses[0].clone();
        assert!(motion.trigger(Trigger::Hover));
        let started = motion.active.as_ref().unwrap().started;
        assert!(matches!(
            motion.tick_at(started + Duration::from_millis(100)),
            Refresh::At(_)
        ));
        assert!(motion.frame.front.is_none());
    }
}
