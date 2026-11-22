use super::layout::avatar_bounds;
use super::{Case as _, Cases, Verdict, cases};
use crate::frames;
use crate::inspection::Target;
use crate::native::{Moved, Native, Terminal, fleets, voyages, wall_nanos};
use crate::system::save;
use anyhow::{Context as _, Result};
use serde::Serialize;
use serde_json::{Value, json};
use std::f32::consts::TAU;
use std::fs;
use std::time::Duration;
use voyager_contract::{FleetId, RenameTarget};

cases! {
    Idle => "idle",
    Streaming => "streaming",
    Fleets => "fleets",
    Builds => "builds",
}

pub const CONTROL: Case = Case::Idle;

const STEP: Duration = Duration::from_millis(4);
const APPROACH: usize = 50;
const LAPS: usize = 900;
const CENTRE: (f32, f32) = (1000., 540.);
const REACH: (f32, f32) = (330., 230.);
const VISIBLE_STREAMS: usize = 8;
const HIDDEN_FLEETS: usize = 3;
const STREAMS_PER_HIDDEN_FLEET: usize = 4;
const SETTLE: Duration = Duration::from_secs(2);
const STREAM: &str = r#"while :; do seq -f $'\e[32mCompiling\e[0m crate-%g v0.1.0 (/voyager/home/project/crates/core) \e[2mwarning: unused variable\e[0m' 1 2000; done"#;
const HOG: &str = "while :; do :; done";

#[derive(Serialize)]
struct Window {
    case: &'static str,
    opened_ns: u128,
    closed_ns: u128,
    step_micros: u128,
    scale: f32,
    moves: Vec<Moved>,
    load_before: String,
    load_after: String,
    running: usize,
}

fn loadavg() -> String {
    fs::read_to_string("/proc/loadavg")
        .unwrap_or_default()
        .trim()
        .to_owned()
}

fn path(from: (f32, f32)) -> Vec<(f32, f32)> {
    let start = (CENTRE.0, CENTRE.1 + REACH.1);
    let approach = (1..=APPROACH).map(|step| {
        let part = step as f32 / APPROACH as f32;
        (
            from.0 + (start.0 - from.0) * part,
            from.1 + (start.1 - from.1) * part,
        )
    });
    let laps = (0..LAPS).map(|step| {
        let turn = step as f32 / LAPS as f32;
        (
            CENTRE.0 + REACH.0 * (2. * TAU * turn).sin(),
            CENTRE.1 + REACH.1 * (3. * TAU * turn).cos(),
        )
    });
    approach.chain(laps).collect()
}

fn running(native: &Native) -> Result<usize> {
    let listed = native.system.watch("terminal.list", json!({"all":true}))?;
    Ok(listed["terminals"].as_array().map_or(0, |terminals| {
        terminals
            .iter()
            .filter(|terminal| {
                terminal["state"] != "finished"
                    && terminal["name"]
                        .as_str()
                        .is_some_and(|name| name.starts_with("load-"))
            })
            .count()
    }))
}

fn start(native: &Native, name: &str, fleet: Option<&FleetId>, program: &str) -> Result<()> {
    let label = fleet.map(|fleet| format!("voyager.place=fleet:{}", fleet.0));
    let mut arguments = vec!["run", "--bg", "--no-notify", "--name", name];
    if let Some(label) = &label {
        arguments.extend(["--label", label.as_str()]);
    }
    arguments.extend(["bash", "-c", program]);
    native.system.execute("hc", &arguments, None).map(drop)
}

fn show(native: &Native, fleet: &FleetId) -> Result<()> {
    native.click(&Target::name(&RenameTarget::Fleet { id: fleet.clone() }))?;
    native.observe("the first Fleet shown", |seen| {
        (seen.document.selected_fleet.as_ref() == Some(fleet)).then_some(())
    })
}

fn create_fleet(native: &Native, home: &FleetId) -> Result<FleetId> {
    show(native, home)?;
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    let voyage = voyages(&layout)
        .next()
        .map(|voyage| voyage.id.clone())
        .context("The layout has no Voyage")?;
    let known: Vec<FleetId> = fleets(&layout).map(|fleet| fleet.id.clone()).collect();
    native.click(&Target::create_fleet(&voyage))?;
    native.click(&Target::worker("terminal"))?;
    native.observe("the created Fleet in the saved layout", |seen| {
        fleets(seen.document)
            .find(|fleet| !known.contains(&fleet.id))
            .map(|fleet| fleet.id.clone())
    })
}

fn measure(native: &mut Native, case: Case) -> Result<Verdict> {
    let avatar = native.observe("the avatar at rest", avatar_bounds)?;
    let from = (avatar.x + avatar.width / 2., avatar.y + avatar.height / 2.);
    let scale = native.observe("the window scale", |seen| Some(seen.frame.window.scale))?;
    let logical = path(from);
    let end = *logical.last().context("The glide has no points")?;
    let planned: Vec<(i16, i16)> = logical
        .iter()
        .map(|(x, y)| ((x * scale).round() as i16, (y * scale).round() as i16))
        .collect();
    let window = native.system.evidence.join(frames::WINDOW);
    let load_before = loadavg();
    let running = running(native)?;
    fs::write(&window, b"")?;
    let opened_ns = wall_nanos();
    std::thread::sleep(Duration::from_millis(300));
    let (moves, followed) = native.glide(&Target::AVATAR, &planned, STEP, |native| {
        Ok(native
            .observe("the held avatar under the pointer", |seen| {
                avatar_bounds(seen)
                    .filter(|drawn| {
                        let (x, y) = end;
                        drawn.x <= x
                            && x <= drawn.x + drawn.width
                            && drawn.y <= y
                            && y <= drawn.y + drawn.height
                    })
                    .map(|_| ())
            })
            .is_ok())
    })?;
    std::thread::sleep(Duration::from_millis(500));
    let closed_ns = wall_nanos();
    fs::remove_file(&window)?;
    let load_after = loadavg();
    let record = Window {
        case: case.name(),
        opened_ns,
        closed_ns,
        step_micros: STEP.as_micros(),
        scale,
        moves,
        load_before,
        load_after,
        running,
    };
    save(
        native
            .system
            .evidence
            .join(format!("drag-{}.json", case.name())),
        &record,
    )?;
    native.keep_window(&format!("drag-{}", case.name()))?;
    let expected = match case {
        Case::Idle => 0,
        Case::Streaming => VISIBLE_STREAMS,
        Case::Fleets | Case::Builds => VISIBLE_STREAMS + HIDDEN_FLEETS * STREAMS_PER_HIDDEN_FLEET,
    };
    let hogs = if case == Case::Builds {
        std::thread::available_parallelism().map_or(1, usize::from)
    } else {
        0
    };
    Verdict::new()
        .expect(
            "while held, the avatar is drawn under the pointer at the end of the glide",
            followed,
        )
        .expect(
            "every planned pointer move reached the display",
            record.moves.len() == planned.len(),
        )
        .expect(
            "the case's load programs were running when the glide began",
            record.running == expected + hogs,
        )
        .observed("moves", record.moves.len())?
        .observed("load", json!([record.load_before, record.load_after]))
        .and_then(|verdict| verdict.observed("running", Value::from(record.running)))
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    Terminal::first(native)?;
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    let home = fleets(&layout)
        .next()
        .map(|fleet| fleet.id.clone())
        .context("The layout has no Fleet")?;
    let mut hidden = Vec::new();
    for _ in 0..HIDDEN_FLEETS {
        hidden.push(create_fleet(native, &home)?);
    }
    show(native, &home)?;
    cases.check(native, Case::Idle, |native| measure(native, Case::Idle))?;
    cases.check(native, Case::Streaming, |native| {
        for index in 0..VISIBLE_STREAMS {
            start(
                native,
                &format!("load-visible-{index}"),
                Some(&home),
                STREAM,
            )?;
        }
        native.observe("the streaming Vessels drawn", |seen| {
            (seen
                .frame
                .elements
                .iter()
                .filter(|element| element.role == voyager_contract::inspection::Role::Terminal)
                .count()
                > VISIBLE_STREAMS)
                .then_some(())
        })?;
        std::thread::sleep(SETTLE);
        measure(native, Case::Streaming)
    })?;
    cases.check(native, Case::Fleets, |native| {
        for (fleet, id) in hidden.iter().enumerate() {
            for index in 0..STREAMS_PER_HIDDEN_FLEET {
                start(
                    native,
                    &format!("load-hidden-{fleet}-{index}"),
                    Some(id),
                    STREAM,
                )?;
            }
        }
        show(native, &home)?;
        std::thread::sleep(SETTLE);
        measure(native, Case::Fleets)
    })?;
    cases.check(native, Case::Builds, |native| {
        let cores = std::thread::available_parallelism().map_or(1, usize::from);
        for index in 0..cores {
            start(native, &format!("load-hog-{index}"), None, HOG)?;
        }
        std::thread::sleep(SETTLE);
        measure(native, Case::Builds)
    })
}
