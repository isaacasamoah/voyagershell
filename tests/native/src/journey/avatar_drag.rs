use super::layout::{avatar_bounds, avatar_on_dock};
use super::{Case as _, Cases, Verdict, cases};
use crate::inspection::{Target, region};
use crate::native::{
    DRAG_REST, Held, LOOK, Moved, Native, Terminal, Wheel, changed, fleets, now_millis, voyages,
};
use crate::system::{PATIENCE, poll};
use crate::x11::{Geometry, Pixels};
use anyhow::{Context as _, Result, ensure};
use serde::Serialize;
use serde_json::{Value, json};
use std::f32::consts::TAU;
use std::fs;
use voyager_contract::{Context as Scope, FleetId, RenameTarget};

cases! {
    Still => "still",
    CaughtUp => "caught-up",
    Kept => "kept",
    Throughput => "throughput",
    Idle => "idle",
    Streaming => "streaming",
    Fleets => "fleets",
    Docks => "docks",
}

pub const CONTROL: Case = Case::CaughtUp;

const SEGMENT: usize = 25;
const LAP: usize = 150;
const SEGMENTS: usize = 120;
const AFTER: usize = 3;
const HELD_SEGMENTS: usize = 100;
const APPROACH: usize = 50;
const LAPS: usize = 900;
const CENTRE: (f32, f32) = (1000., 540.);
const REACH: (f32, f32) = (330., 230.);
const KEPT_BYTES: usize = 5 << 20;
const STAIRS: u16 = 160;
const FAST_BYTES: usize = 8 << 20;
const RUNS: usize = 4;
const VISIBLE_STREAMS: usize = 8;
const HIDDEN_FLEETS: usize = 3;
const STREAMS_PER_HIDDEN_FLEET: usize = 4;
const SCROLL_CLICKS: usize = 2;
const SCROLL_PAGES: usize = 80;
const STAIRS_DONE: &str = "stairs-42";
const STREAM: &str = r#"while :; do seq -f $'\e[32mCompiling\e[0m crate-%g v0.1.0 (/voyager/home/project/crates/core) \e[2mwarning: unused variable\e[0m' 1 2000; done"#;

#[derive(PartialEq)]
struct Orbit {
    centre: (f32, f32),
    reach: (f32, f32),
    start: (i16, i16),
    clear: Geometry,
    resting: Geometry,
}

impl Orbit {
    fn around(native: &Native, area: &Target) -> Result<Self> {
        native.observe("the avatar and the terminal it circles", |seen| {
            let avatar = region(seen.frame, &avatar_bounds(seen)?);
            let area = region(seen.frame, &area.find(seen.frame)?.bounds);
            let reach = (f32::from(area.width) / 10., f32::from(area.height) / 10.);
            let centre = (
                f32::from(area.x) + f32::from(area.width) * 0.75,
                f32::from(area.y) + f32::from(area.height) * 0.7,
            );
            let side = |reach: f32, size: u16| reach + f32::from(size) * 1.5;
            let (wide, tall) = (side(reach.0, avatar.width), side(reach.1, avatar.height));
            Some(Self {
                centre,
                reach,
                start: centre_of(avatar),
                clear: Geometry {
                    x: (centre.0 - wide) as i16,
                    y: (centre.1 - tall) as i16,
                    width: (2. * wide) as u16,
                    height: (2. * tall) as u16,
                },
                resting: Geometry {
                    x: avatar.x - i16::try_from(avatar.width / 2).unwrap_or(i16::MAX),
                    y: avatar.y - i16::try_from(avatar.height / 2).unwrap_or(i16::MAX),
                    width: avatar.width.saturating_mul(2),
                    height: avatar.height.saturating_mul(2),
                },
            })
        })
    }

    fn at(&self, step: usize) -> (i16, i16) {
        let turn = TAU * (step % LAP) as f32 / LAP as f32;
        (
            (self.centre.0 + self.reach.0 * turn.sin()).round() as i16,
            (self.centre.1 + self.reach.1 * turn.cos()).round() as i16,
        )
    }

    fn approach(&self) -> Vec<(i16, i16)> {
        line(self.start, self.at(0))
    }

    fn segment(&self, index: usize) -> Vec<(i16, i16)> {
        (index * SEGMENT..(index + 1) * SEGMENT)
            .map(|step| self.at(step))
            .collect()
    }

    fn look(&self, native: &Native, terminal: &Terminal) -> Result<Pixels> {
        let mut look = terminal.look(native)?;
        look.mask(self.clear);
        look.mask(self.resting);
        Ok(look)
    }
}

fn centre_of(area: Geometry) -> (i16, i16) {
    (
        area.x + i16::try_from(area.width / 2).unwrap_or(i16::MAX),
        area.y + i16::try_from(area.height / 2).unwrap_or(i16::MAX),
    )
}

fn line(from: (i16, i16), to: (i16, i16)) -> Vec<(i16, i16)> {
    (1..=APPROACH)
        .map(|step| {
            let part = |from: i16, to: i16| {
                (f32::from(from)
                    + (f32::from(to) - f32::from(from)) * step as f32 / APPROACH as f32)
                    .round() as i16
            };
            (part(from.0, to.0), part(from.1, to.1))
        })
        .collect()
}

fn longest_pause(moves: &[Moved]) -> u64 {
    moves
        .windows(2)
        .map(|pair| pair[1].at_ms.saturating_sub(pair[0].at_ms))
        .max()
        .unwrap_or_default()
}

fn under_rest(pause: u64) -> bool {
    u128::from(pause) < DRAG_REST.within().as_millis()
}

fn stairs(terminal: &Terminal, native: &Native) -> Result<(u16, String)> {
    let columns = terminal.columns(native)?;
    let count = STAIRS.min(columns.saturating_sub(2));
    ensure!(
        count > 10,
        "The terminal is {columns} columns wide, too narrow for the staircase"
    );
    let pad = KEPT_BYTES / usize::from(count) / 3;
    let command = format!(
        "sleep 2; p=$(printf '\\e[m%.0s' {{1..{pad}}}); b=$(printf '#%.0s' {{1..{count}}}); printf '\\e[H\\e[2J\\e[3J\\n'; for i in {{1..{count}}}; do printf '%s%s\\n' \"$p\" \"${{b:0:i}}\"; sleep 0.02; done; echo; echo stairs-$((6*7)); echo"
    );
    Ok((count, command))
}

#[derive(Serialize)]
struct Drag {
    moves: Vec<Moved>,
    segments: usize,
    longest_pause_ms: u64,
    printed_while_moving: bool,
    pane_changed_while_moving: bool,
    core_changed_while_moving: bool,
}

fn circle_until_printed<'a>(
    native: &'a Native,
    terminal: &Terminal,
    orbit: &Orbit,
    printed: impl Fn(&str) -> bool,
) -> Result<(Held<'a>, Drag, Pixels)> {
    terminal.settled(native, "the terminal before the drag", |_| true)?;
    let mut held = native.hold(&Target::AVATAR)?;
    let mut moves = held.glide(&orbit.approach())?;
    let frozen = orbit.look(native, terminal)?;
    let first_screen = terminal.screen(native)?;
    let mut drag = Drag {
        moves: Vec::new(),
        segments: 0,
        longest_pause_ms: 0,
        printed_while_moving: false,
        pane_changed_while_moving: false,
        core_changed_while_moving: false,
    };
    let mut after = 0;
    while drag.segments < SEGMENTS && after < AFTER {
        moves.extend(held.glide(&orbit.segment(drag.segments))?);
        drag.segments += 1;
        let look = orbit.look(native, terminal)?;
        drag.pane_changed_while_moving |= changed(&frozen, &look).is_some();
        let screen = terminal.screen(native)?;
        drag.core_changed_while_moving |= screen != first_screen;
        if printed(&screen) {
            drag.printed_while_moving = true;
            after += 1;
        }
    }
    drag.longest_pause_ms = longest_pause(&moves);
    drag.moves = moves;
    Ok((held, drag, frozen))
}

fn circle_through<'a>(
    native: &'a Native,
    terminal: &Terminal,
    orbit: &Orbit,
) -> Result<(Held<'a>, Drag, Pixels)> {
    terminal.settled(native, "the terminal before the drag", |_| true)?;
    let frozen = orbit.look(native, terminal)?;
    let first_screen = terminal.screen(native)?;
    ensure!(
        !first_screen
            .lines()
            .any(|line| line.trim_start().starts_with('#')),
        "The staircase began before the drag, so this run cannot judge the hold; rerun it"
    );
    let mut held = native.hold(&Target::AVATAR)?;
    let mut path = orbit.approach();
    path.extend((0..HELD_SEGMENTS).flat_map(|index| orbit.segment(index)));
    let moves = held.glide(&path)?;
    let look = orbit.look(native, terminal)?;
    let looked_ms = now_millis().saturating_sub(moves.last().map_or(0, |last| last.at_ms));
    let screen = terminal.screen(native)?;
    let longest_pause_ms = longest_pause(&moves);
    ensure!(
        under_rest(longest_pause_ms) && under_rest(looked_ms),
        "The fixture paused the pointer {longest_pause_ms} ms between moves, or looked {looked_ms} ms after the last move, at or past the 120 ms rest, so this run cannot judge the hold; rerun it"
    );
    ensure!(
        stairs_done(&screen),
        "The staircase did not finish within the drag, so this run cannot judge the hold; rerun it"
    );
    let drag = Drag {
        moves,
        segments: HELD_SEGMENTS,
        longest_pause_ms,
        printed_while_moving: true,
        pane_changed_while_moving: changed(&frozen, &look).is_some(),
        core_changed_while_moving: screen != first_screen,
    };
    Ok((held, drag, frozen))
}

fn rested(
    native: &Native,
    terminal: &Terminal,
    orbit: &Orbit,
    frozen: &Pixels,
) -> Result<Option<u64>> {
    poll(PATIENCE, LOOK, true, || {
        let look = orbit.look(native, terminal)?;
        Ok(changed(frozen, &look).map(|_| now_millis()))
    })
}

fn stairs_done(screen: &str) -> bool {
    screen.contains(STAIRS_DONE)
}

fn still(native: &mut Native, terminal: &Terminal) -> Result<Verdict> {
    let native: &Native = native;
    let (_, command) = stairs(terminal, native)?;
    let orbit = Orbit::around(native, &terminal.target())?;
    terminal.line(native, &command)?;
    let (held, drag, _) = circle_through(native, terminal, &orbit)?;
    held.release()?;
    native.keep_window("drag-still")?;
    Verdict::new()
        .expect(
            "the staircase printed in Core while the avatar moved",
            drag.printed_while_moving && drag.core_changed_while_moving,
        )
        .expect(
            "the pane outside the avatar's path stayed as drawn while the avatar moved",
            !drag.pane_changed_while_moving,
        )
        .observed("drag", &drag)
}

fn caught_up(native: &mut Native, terminal: &Terminal) -> Result<Verdict> {
    let native: &Native = native;
    let (_, command) = stairs(terminal, native)?;
    let orbit = Orbit::around(native, &terminal.target())?;
    terminal.line(native, &command)?;
    let (held, drag, frozen) = circle_through(native, terminal, &orbit)?;
    let shown = rested(native, terminal, &orbit, &frozen)?;
    let rested_at = drag.moves.last().map_or(0, |last| last.at_ms);
    let delay = shown.map(|shown| shown.saturating_sub(rested_at));
    let look = orbit.look(native, terminal)?;
    native.keep("caught-up", &look)?;
    held.release()?;
    Verdict::new()
        .expect(
            "the staircase printed in Core while the avatar moved",
            drag.printed_while_moving,
        )
        .expect(
            "the pane stayed as drawn while the avatar moved",
            !drag.pane_changed_while_moving,
        )
        .expect(
            "with the avatar held still, the pane drew the program's output",
            shown.is_some(),
        )
        .expect(
            "the pane drew it only after the pointer had rested 120 ms",
            delay.is_some_and(|delay| !under_rest(delay)),
        )
        .observed("rest to drawn ms", delay)?
        .observed("drag", &drag)
}

#[derive(Serialize)]
struct Page {
    widths: Vec<u16>,
    broken: Option<(u16, u16)>,
}

fn steps(widths: &[u16], count: u16) -> (Vec<u16>, Option<(u16, u16)>) {
    let mut seen = Vec::new();
    let mut broken = None;
    for pair in widths.windows(2) {
        let (above, below) = (pair[0], pair[1]);
        if above == 0 || below == 0 || above > count || below > count {
            continue;
        }
        if below == above + 1 {
            seen.extend([above, below]);
        } else if broken.is_none() {
            broken = Some((above, below));
        }
    }
    (seen, broken)
}

fn kept(native: &mut Native, terminal: &Terminal) -> Result<Verdict> {
    let native: &Native = native;
    let (count, command) = stairs(terminal, native)?;
    let orbit = Orbit::around(native, &terminal.target())?;
    let parked = native.observe("a resting place clear of the terminal", |seen| {
        let area = region(seen.frame, &terminal.target().find(seen.frame)?.bounds);
        Some((area.x - 60, area.y + i16::try_from(area.height).ok()? - 60))
    })?;
    terminal.line(native, &command)?;
    let (mut held, drag, frozen) = circle_until_printed(native, terminal, &orbit, stairs_done)?;
    held.glide(&line(orbit.at(drag.segments * SEGMENT), parked))?;
    held.release()?;
    rested(native, terminal, &orbit, &frozen)?;
    let clear = native.observe("the avatar resting clear of the terminal", |seen| {
        let avatar = avatar_bounds(seen)?;
        let area = terminal.target().find(seen.frame)?.bounds;
        Some(
            avatar.x + avatar.width <= area.x
                || area.x + area.width <= avatar.x
                || avatar.y + avatar.height <= area.y
                || area.y + area.height <= avatar.y,
        )
    })?;
    let mut pages = Vec::new();
    let mut found = vec![false; usize::from(count) + 1];
    let mut previous: Option<Vec<u16>> = None;
    for _ in 0..SCROLL_PAGES {
        terminal.settled(native, "the scrolled terminal", |_| true)?;
        let widths = terminal.widths(native, None)?;
        if previous.as_ref() == Some(&widths) {
            break;
        }
        let (seen, broken) = steps(&widths, count);
        for width in seen {
            found[usize::from(width)] = true;
        }
        pages.push(Page {
            widths: widths.clone(),
            broken,
        });
        previous = Some(widths);
        native.wheel(&terminal.target(), Wheel::Up, SCROLL_CLICKS)?;
    }
    let missing: Vec<usize> = (1..=usize::from(count))
        .filter(|row| !found[*row])
        .collect();
    let broken: Vec<(u16, u16)> = pages.iter().filter_map(|page| page.broken).collect();
    native.keep_window("drag-kept")?;
    let record = native.system.evidence.join("drag-kept.json");
    fs::write(&record, serde_json::to_vec(&json!({"pages":pages}))?)?;
    Verdict::new()
        .expect(
            "the staircase printed in Core while the avatar moved",
            drag.printed_while_moving,
        )
        .expect("the avatar rested clear of the terminal", clear)
        .expect(
            "the pane's scrollback holds every staircase row",
            missing.is_empty(),
        )
        .expect(
            "every scrollback page shows the staircase rows in order",
            broken.is_empty(),
        )
        .observed("rows", count)?
        .observed("bytes", KEPT_BYTES)?
        .observed("missing", &missing)?
        .observed("broken", &broken)?
        .observed("pages", pages.len())
}

fn rate(screen: &str) -> Option<(u64, u64)> {
    screen.lines().rev().find_map(|line| {
        let rest = line.trim().strip_prefix("rate-")?.strip_suffix("-done")?;
        let (start, end) = rest.split_once('-')?;
        Some((start.parse().ok()?, end.parse().ok()?))
    })
}

#[derive(Serialize)]
struct Run {
    dragged: bool,
    millis: u64,
    within_drag: bool,
}

fn fast(terminal: &Terminal, native: &Native, orbit: &Orbit, dragged: bool) -> Result<Run> {
    let command = format!(
        "printf '\\e[H\\e[2J\\e[3J'; sleep 2; s=$(date +%s%3N); yes {} | head -c {FAST_BYTES}; e=$(date +%s%3N); echo; echo rate-$s-$e-done",
        "x".repeat(99)
    );
    let before = rate(&terminal.screen(native)?);
    let reported = |screen: &str| rate(screen).filter(|reported| Some(*reported) != before);
    terminal.line(native, &command)?;
    let (moves, screen) = if dragged {
        let (held, drag, _) =
            circle_until_printed(native, terminal, orbit, |screen| reported(screen).is_some())?;
        held.release()?;
        let screen = terminal.screen(native)?;
        (drag.moves, screen)
    } else {
        let screen = poll(PATIENCE, LOOK, true, || {
            let screen = terminal.screen(native)?;
            Ok(reported(&screen).map(|_| screen))
        })?
        .context("The fast printer reported no rate at rest")?;
        (Vec::new(), screen)
    };
    let (start, end) = reported(&screen).context("The fast printer reported no new rate")?;
    let within_drag = match (moves.first(), moves.last()) {
        (Some(first), Some(last)) => first.at_ms <= start && end <= last.at_ms,
        _ => false,
    };
    Ok(Run {
        dragged,
        millis: end.saturating_sub(start),
        within_drag,
    })
}

fn median(values: &mut [u64]) -> u64 {
    values.sort_unstable();
    values.get(values.len() / 2).copied().unwrap_or_default()
}

fn throughput(native: &mut Native, terminal: &Terminal) -> Result<Verdict> {
    let native: &Native = native;
    let orbit = Orbit::around(native, &terminal.target())?;
    let mut runs = Vec::new();
    for _ in 0..RUNS {
        runs.push(fast(terminal, native, &orbit, false)?);
        runs.push(fast(terminal, native, &orbit, true)?);
    }
    let mut rest: Vec<u64> = runs
        .iter()
        .filter(|run| !run.dragged)
        .map(|run| run.millis)
        .collect();
    let mut dragged: Vec<u64> = runs
        .iter()
        .filter(|run| run.dragged)
        .map(|run| run.millis)
        .collect();
    let (fastest, slowest) = (
        rest.iter().copied().min().unwrap_or_default(),
        rest.iter().copied().max().unwrap_or_default(),
    );
    let noise = slowest - fastest;
    let dragged_median = median(&mut dragged);
    Verdict::new()
        .expect(
            "every dragged run printed while the avatar moved",
            runs.iter().filter(|run| run.dragged).all(|run| run.within_drag),
        )
        .expect(
            "the fast printer's median time during a drag is within the noise band of its times at rest",
            dragged_median <= slowest + noise,
        )
        .observed("bytes", FAST_BYTES)?
        .observed("rest median ms", median(&mut rest))?
        .observed("rest band ms", [fastest, slowest])?
        .observed("noise ms", noise)?
        .observed("drag median ms", dragged_median)?
        .observed("runs", &runs)
}

fn path(native: &Native) -> Result<Vec<(i16, i16)>> {
    let (from, scale) = native.observe("the avatar at rest and the window scale", |seen| {
        Some((
            centre_of(region(seen.frame, &avatar_bounds(seen)?)),
            seen.frame.window.scale,
        ))
    })?;
    let scaled = |(x, y): (f32, f32)| ((x * scale).round() as i16, (y * scale).round() as i16);
    let start = scaled((CENTRE.0, CENTRE.1 + REACH.1));
    let laps = (0..LAPS).map(|step| {
        let turn = step as f32 / LAPS as f32;
        scaled((
            CENTRE.0 + REACH.0 * (2. * TAU * turn).sin(),
            CENTRE.1 + REACH.1 * (3. * TAU * turn).cos(),
        ))
    });
    Ok(line(from, start).into_iter().chain(laps).collect())
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

fn start(native: &Native, name: &str, fleet: &FleetId) -> Result<()> {
    let label = format!("voyager.place=fleet:{}", fleet.0);
    native
        .system
        .execute(
            "hc",
            &[
                "run",
                "--bg",
                "--no-notify",
                "--name",
                name,
                "--label",
                &label,
                "bash",
                "-c",
                STREAM,
            ],
            None,
        )
        .map(drop)
}

fn show(native: &Native, fleet: &FleetId) -> Result<()> {
    native.click(&Target::name(&RenameTarget::Fleet { id: fleet.clone() }))?;
    native.observe("the Fleet shown", |seen| {
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

fn follows(native: &mut Native, case: Case, expected: usize) -> Result<Verdict> {
    let native: &Native = native;
    let planned = path(native)?;
    let end = *planned.last().context("The glide has no points")?;
    let load = running(native)?;
    let mut held = native.hold(&Target::AVATAR)?;
    let moves = held.glide(&planned)?;
    let followed = held
        .until("the held avatar under the pointer", |seen| {
            let drawn = region(seen.frame, &avatar_bounds(seen)?);
            let inside = drawn.x <= end.0
                && end.0 <= drawn.x + i16::try_from(drawn.width).ok()?
                && drawn.y <= end.1
                && end.1 <= drawn.y + i16::try_from(drawn.height).ok()?;
            inside.then_some(())
        })
        .is_ok();
    held.release()?;
    native.keep_window(&format!("drag-{}", case.name()))?;
    Verdict::new()
        .expect(
            "while held, the avatar is drawn under the pointer at the end of the glide",
            followed,
        )
        .expect(
            "the case's load programs were running when the glide began",
            load == expected,
        )
        .observed("moves", moves.len())?
        .observed("longest pause ms", longest_pause(&moves))?
        .observed("running", Value::from(load))
}

fn docks(native: &mut Native, terminal: &Terminal, streaming: &Terminal) -> Result<Verdict> {
    let native: &Native = native;
    let vessel = Target::name(&RenameTarget::Vessel {
        id: terminal.placement().clone(),
    });
    let orbit = Orbit::around(native, &streaming.target())?;
    let onto = native.observe("the Vessel to dock on", |seen| {
        Some(centre_of(region(
            seen.frame,
            &vessel.find(seen.frame)?.bounds,
        )))
    })?;
    let mut held = native.hold(&Target::AVATAR)?;
    held.glide(&orbit.approach())?;
    let frozen = orbit.look(native, streaming)?;
    for segment in 0..AFTER {
        held.glide(&orbit.segment(segment))?;
    }
    held.glide(&line(orbit.at(AFTER * SEGMENT), onto))?;
    held.release()?;
    let docked = Scope::Vessel {
        id: terminal.placement().clone(),
    };
    let landed = native
        .observe("the avatar docked on the Vessel", |seen| {
            (seen.document.context == docked && avatar_on_dock(seen)).then_some(())
        })
        .is_ok();
    let redrawn = rested(native, streaming, &orbit, &frozen)?.is_some();
    native.keep_window("drag-docks")?;
    Ok(Verdict::new()
        .expect(
            "a drag over streaming terminals that ends on a Vessel docks the avatar there",
            landed,
        )
        .expect(
            "once the drag ended, a streaming terminal drew its current output",
            redrawn,
        ))
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let terminal = Terminal::first(native)?;
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    let home = fleets(&layout)
        .next()
        .map(|fleet| fleet.id.clone())
        .context("The layout has no Fleet")?;
    cases.check(native, Case::Still, |native| still(native, &terminal))?;
    cases.check(native, Case::CaughtUp, |native| {
        caught_up(native, &terminal)
    })?;
    cases.check(native, Case::Kept, |native| kept(native, &terminal))?;
    cases.check(native, Case::Throughput, |native| {
        throughput(native, &terminal)
    })?;
    let mut hidden = Vec::new();
    for _ in 0..HIDDEN_FLEETS {
        hidden.push(create_fleet(native, &home)?);
    }
    show(native, &home)?;
    cases.check(native, Case::Idle, |native| follows(native, Case::Idle, 0))?;
    for index in 0..VISIBLE_STREAMS {
        start(native, &format!("load-visible-{index}"), &home)?;
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
    cases.check(native, Case::Streaming, |native| {
        follows(native, Case::Streaming, VISIBLE_STREAMS)
    })?;
    for (fleet, id) in hidden.iter().enumerate() {
        for index in 0..STREAMS_PER_HIDDEN_FLEET {
            start(native, &format!("load-hidden-{fleet}-{index}"), id)?;
        }
    }
    show(native, &home)?;
    let loaded = VISIBLE_STREAMS + HIDDEN_FLEETS * STREAMS_PER_HIDDEN_FLEET;
    cases.check(native, Case::Fleets, |native| {
        follows(native, Case::Fleets, loaded)
    })?;
    let placement = native.observe("a streaming Vessel's placement", |seen| {
        fleets(seen.document)
            .find(|fleet| fleet.id == home)?
            .placements
            .iter()
            .find(|placed| &placed.id != terminal.placement())
            .map(|placed| placed.id.clone())
    })?;
    let streamer = Terminal::bind(native, &placement)?;
    cases.check(native, Case::Docks, |native| {
        docks(native, &terminal, &streamer)
    })
}
