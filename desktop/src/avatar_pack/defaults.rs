use super::asset;
use std::{collections::BTreeMap, f32::consts::PI, path::PathBuf};
use voyager_contract::avatar_animation::{Canvas, Clip, Configuration, Pack, Pose, Step, Triggers};

pub fn source(name: &str) -> PathBuf {
    if name == "idle.png" {
        asset(name)
    } else {
        asset("stretch-frames").join(name)
    }
}

pub fn pack() -> (Configuration, Pack) {
    let configuration = Configuration {
        version: 1,
        pack: "pack.json".into(),
        rest_pose: "rest".into(),
        triggers: Triggers {
            hover: Some("stretch".into()),
            click: None,
            dock: Some("float".into()),
            undock: None,
        },
    };
    let images = [
        ("rest", "idle.png"),
        ("uncross", "frame-1-uncrossing.png"),
        ("stretch", "frame-2-stretched.png"),
        ("peak", "frame-3-peak-stretch.png"),
    ]
    .map(|(id, name)| (id.into(), name.into()))
    .into_iter()
    .collect();
    let mut poses: BTreeMap<String, Pose> = ["rest", "uncross", "stretch", "peak"]
        .map(|id| {
            (
                id.into(),
                Pose {
                    image: id.into(),
                    rect: [0, 0, 512, 512],
                    anchor: [256., 256.],
                    scale: 1.,
                },
            )
        })
        .into_iter()
        .collect();
    let stretch = Clip {
        from: "rest".into(),
        steps: [
            ("uncross", 192, 80),
            ("stretch", 192, 128),
            ("peak", 320, 1920),
            ("rest", 800, 0),
        ]
        .map(|(pose, fade_ms, hold_ms)| Step {
            pose: pose.into(),
            fade_ms,
            hold_ms,
        })
        .into(),
        easing: [0.45, 0., 0.25, 1.],
        effects: Vec::new(),
    };
    let mut steps = Vec::with_capacity(120);
    let mut previous = 0;
    for index in 1..=120 {
        let id = format!("float-{index:03}");
        let offset = 96. * (PI * index as f32 / 120.).sin().powi(2);
        poses.insert(
            id.clone(),
            Pose {
                image: "rest".into(),
                rect: [0, 0, 512, 512],
                anchor: [256., 256. + offset],
                scale: 1.,
            },
        );
        let end = index * 2000 / 120;
        steps.push(Step {
            pose: id,
            fade_ms: 0,
            hold_ms: end - previous,
        });
        previous = end;
    }
    let float = Clip {
        from: "rest".into(),
        steps,
        easing: [0.45, 0., 0.25, 1.],
        effects: Vec::new(),
    };
    (
        configuration,
        Pack {
            version: 1,
            id: "voyager-default".into(),
            canvas: Canvas {
                size: [512, 512],
                anchor: [256., 256.],
            },
            images,
            poses,
            clips: [("stretch".into(), stretch), ("float".into(), float)].into(),
            effects: BTreeMap::new(),
        },
    )
}
