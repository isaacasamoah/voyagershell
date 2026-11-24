use super::socket_dock::{request_line, send_line, show_fleet, voyager_caller};
use super::{Cases, Verdict, cases};
use crate::inspection::{self, Target};
use crate::native::{Decorations, Native, Terminal, bound_terminal, fleets, now_millis};
use crate::x11::{Geometry, Pixels};
use anyhow::{Context as _, Result};
use serde_json::json;
use std::time::{Duration, Instant};
use voyager_contract::inspection::{Frame, Rect};
use voyager_contract::{Action, FleetId, RenameTarget};

cases! {
    FirstRealFrameAfterAFleetSwitch => "first-real-frame-after-a-fleet-switch",
}

pub const CONTROL: Case = Case::FirstRealFrameAfterAFleetSwitch;

const SWITCHES: usize = 100;
const WATCH: Duration = Duration::from_millis(1500);
const REST: Duration = Duration::from_millis(1000);
const SLOW: u64 = 300;
const KEPT_LINES: usize = 400;
const SECOND: &str = "First frame second";
const CHANGED: f64 = 2.0;
const SAME: f64 = 2.0;
const MOVED: f32 = 1.0;

fn tab(id: &FleetId) -> Target {
    Target::name(&RenameTarget::Fleet { id: id.clone() })
}

fn avatar(frame: &Frame) -> Option<Rect> {
    Target::AVATAR.find(frame).map(|element| element.bounds)
}

fn published(native: &Native) -> Result<Option<Frame>> {
    inspection::read(&native.inspection())
}

fn region(frame: &Frame, rect: Rect, (width, height): (u16, u16)) -> Geometry {
    let scale = frame.window.scale;
    let pad = 6.0;
    let (wide, high) = (f32::from(width), f32::from(height));
    let left = ((rect.x - pad) * scale).floor().clamp(0.0, wide - 1.0);
    let top = ((rect.y - pad) * scale).floor().clamp(0.0, high - 1.0);
    let right = ((rect.x + rect.width + pad) * scale).ceil().clamp(left + 1.0, wide);
    let bottom = ((rect.y + rect.height + pad) * scale).ceil().clamp(top + 1.0, high);
    Geometry {
        x: left as i16,
        y: top as i16,
        width: (right - left) as u16,
        height: (bottom - top) as u16,
    }
}

fn near(a: Rect, b: Rect) -> bool {
    (a.x - b.x).abs() < MOVED && (a.y - b.y).abs() < MOVED
}

fn difference(a: &Pixels, b: &Pixels) -> Result<f64> {
    let (a, b) = (a.image()?, b.image()?);
    if a.dimensions() != b.dimensions() {
        return Ok(f64::MAX);
    }
    let total: u64 = a
        .pixels()
        .zip(b.pixels())
        .map(|(p, q)| {
            p.0.iter()
                .zip(q.0.iter())
                .take(3)
                .map(|(x, y)| u64::from(x.abs_diff(*y)))
                .sum::<u64>()
        })
        .sum();
    Ok(total as f64 / (u64::from(a.width()) * u64::from(a.height()) * 3) as f64)
}

struct Tail {
    path: std::path::PathBuf,
    offset: u64,
}

impl Tail {
    fn new(native: &Native) -> Self {
        Self {
            path: native.system.evidence.join("native.log"),
            offset: std::fs::metadata(native.system.evidence.join("native.log"))
                .map_or(0, |meta| meta.len()),
        }
    }

    fn fresh(&mut self) -> Vec<String> {
        use std::io::{Read, Seek, SeekFrom};
        let Ok(mut file) = std::fs::File::open(&self.path) else {
            return Vec::new();
        };
        if file.seek(SeekFrom::Start(self.offset)).is_err() {
            return Vec::new();
        }
        let mut bytes = Vec::new();
        if file.read_to_end(&mut bytes).is_err() {
            return Vec::new();
        }
        let whole = bytes
            .iter()
            .rposition(|byte| *byte == b'\n')
            .map_or(0, |at| at + 1);
        self.offset += whole as u64;
        String::from_utf8_lossy(&bytes[..whole])
            .lines()
            .map(str::to_owned)
            .collect()
    }
}

fn load() -> String {
    std::fs::read_to_string("/proc/loadavg")
        .map(|text| text.split_whitespace().take(3).collect::<Vec<_>>().join(" "))
        .unwrap_or_default()
}

struct Look {
    at: u64,
    sequence: u64,
    prepared: bool,
    seen: Option<Rect>,
    old: Pixels,
    new: Pixels,
}

fn first<T>(looks: &[Look], mut hit: impl FnMut(&Look) -> Result<bool>, at: impl Fn(&Look) -> T) -> Result<Option<T>> {
    for look in looks {
        if hit(look)? {
            return Ok(Some(at(look)));
        }
    }
    Ok(None)
}

fn timed_switch(
    native: &Native,
    onto: &Target,
    old: Rect,
    new: Rect,
    index: usize,
    tail: &mut Tail,
) -> Result<serde_json::Value> {
    let frame = published(native)?.context("The app has drawn no picture")?;
    let size = native.window_size()?;
    let (old_box, new_box) = (region(&frame, old, size), region(&frame, new, size));
    let old_before = native.look_at(old_box)?;
    let new_before = native.look_at(new_box)?;
    let load_before = load();
    tail.fresh();
    let started = now_millis();
    native.click(onto)?;
    let sent = now_millis();
    let watch = Instant::now();
    let mut looks = Vec::new();
    let mut lines: Vec<(u64, String)> = Vec::new();
    while watch.elapsed() < WATCH {
        let at = now_millis().saturating_sub(started);
        for line in tail.fresh() {
            if lines.len() < KEPT_LINES {
                lines.push((at, line));
            }
        }
        let frame = published(native)?;
        let old_now = native.look_at(old_box)?;
        let new_now = native.look_at(new_box)?;
        looks.push(Look {
            at,
            sequence: frame.as_ref().map_or(0, |frame| frame.sequence),
            prepared: frame.as_ref().is_some_and(|frame| frame.prepared),
            seen: frame.as_ref().and_then(avatar),
            old: old_now,
            new: new_now,
        });
        std::thread::sleep(Duration::from_millis(2));
    }
    let last = looks.last().context("The watch took no look")?;
    let new_after = native.look_at(new_box)?;
    let settled_from = looks
        .iter()
        .rposition(|look| difference(&look.new, &new_after).map_or(true, |d| d >= SAME))
        .map_or(0, |at| at + 1);
    let published_left = first(&looks, |look| Ok(look.seen.is_some_and(|seen| !near(seen, old))), |look| look.at)?;
    let published_arrived = first(&looks, |look| Ok(look.seen.is_some_and(|seen| near(seen, new))), |look| look.at)?;
    let real_old_changed = first(&looks, |look| Ok(difference(&look.old, &old_before)? >= CHANGED), |look| look.at)?;
    let real_new_changed = first(&looks, |look| Ok(difference(&look.new, &new_before)? >= CHANGED), |look| look.at)?;
    let real_new_settled = looks.get(settled_from).map(|look| look.at);
    let slow_lines = if real_new_settled.is_none_or(|at| at > SLOW) {
        json!(lines)
    } else {
        serde_json::Value::Null
    };
    let pictures = looks
        .iter()
        .map(|look| look.sequence)
        .collect::<std::collections::BTreeSet<_>>()
        .len();
    Ok(json!({
        "switch": index,
        "oldBox": format!("{old_box:?}"),
        "newBox": format!("{new_box:?}"),
        "windowSize": format!("{size:?}"),
        "frameWindow": format!("{:?}", frame.window),
        "toTab": format!("{onto}"),
        "clickTookMs": sent.saturating_sub(started),
        "publishedAvatarLeftOldMs": published_left,
        "publishedAvatarAtNewMs": published_arrived,
        "realOldBoxChangedMs": real_old_changed,
        "realNewBoxChangedMs": real_new_changed,
        "realNewBoxMatchesSettledMs": real_new_settled,
        "epochMs": started,
        "loadBefore": load_before,
        "loadAfter": load(),
        "logLines": lines.len(),
        "logWhileSlow": slow_lines,
        "looks": looks.len(),
        "lookEveryMs": WATCH.as_millis() as f64 / looks.len().max(1) as f64,
        "distinctPictures": pictures,
        "preparedAtLastLook": last.prepared,
    }))
}

fn settled_place(native: &Native, expected: &str) -> Result<Rect> {
    native.settle(
        expected,
        |seen| {
            avatar(seen.frame).map(|rect| {
                (
                    (rect.x * 2.0) as i32,
                    (rect.y * 2.0) as i32,
                    (rect.width * 2.0) as i32,
                )
            })
        },
        |_| true,
    )?;
    published(native)?
        .as_ref()
        .and_then(avatar)
        .context("The avatar is not drawn")
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    cases.check(native, Case::FirstRealFrameAfterAFleetSwitch, |native| {
        native.launch_as(Decorations::Client)?;
        native.observe("the avatar drawn", |seen| {
            seen.shows(&Target::AVATAR).then_some(())
        })?;
        show_fleet(native)?;
        let first_shell = Terminal::first(native)?;
        let voyager = bound_terminal(native).context("voyager.json names no terminal")?;
        let (_, layout) = native.document()?.context("Missing saved layout")?;
        let fleet_a = layout
            .selected_fleet
            .clone()
            .context("The layout has no selected Fleet")?;
        let voyage = layout
            .selected_voyage
            .clone()
            .context("The layout has no selected Voyage")?;
        let caller = voyager_caller(&voyager);
        let request = request_line(
            native,
            &caller,
            "first-frame-second-fleet",
            Action::CreateFleet {
                voyage,
                name: SECOND.into(),
            },
        )?;
        send_line(native, &caller, &request)?;
        let fleet_b = native.observe("the second Fleet saved", |seen| {
            fleets(seen.document)
                .find(|item| item.name == SECOND)
                .map(|item| item.id.clone())
        })?;
        native.observe("the second Fleet's tab drawn", |seen| {
            seen.shows(&tab(&fleet_b)).then_some(())
        })?;
        native.click(&tab(&fleet_a))?;
        native.observe("the first Fleet shown again", |seen| {
            (seen.document.selected_fleet.as_ref() == Some(&fleet_a)).then_some(())
        })?;
        native.drag(
            &Target::AVATAR,
            &Target::name(&RenameTarget::Vessel {
                id: first_shell.placement().clone(),
            }),
        )?;
        let place_a = settled_place(native, "the avatar settled on the Vessel of the first Fleet")?;
        native.click(&tab(&fleet_b))?;
        native.observe("the second Fleet shown", |seen| {
            (seen.document.selected_fleet.as_ref() == Some(&fleet_b)).then_some(())
        })?;
        let place_b = settled_place(native, "the avatar settled while the second Fleet is shown")?;
        native.click(&tab(&fleet_a))?;
        native.observe("the first Fleet shown", |seen| {
            (seen.document.selected_fleet.as_ref() == Some(&fleet_a)).then_some(())
        })?;
        settled_place(native, "the avatar back on the Vessel of the first Fleet")?;
        let mut tail = Tail::new(native);
        let mut switches = Vec::new();
        for index in 0..SWITCHES {
            std::thread::sleep(REST);
            let (onto, old, new) = if index % 2 == 0 {
                (tab(&fleet_b), place_a, place_b)
            } else {
                (tab(&fleet_a), place_b, place_a)
            };
            switches.push(timed_switch(native, &onto, old, new, index, &mut tail)?);
            settled_place(native, "the avatar settled after the switch")?;
        }
        native.keep_window("first-real-frame-after-a-fleet-switch")?;
        Verdict::new()
            .expect(
                "every switch was timed",
                switches.len() == SWITCHES,
            )
            .observed("placeA", &place_a)?
            .observed("placeB", &place_b)?
            .observed("switches", &switches)
    })
}
