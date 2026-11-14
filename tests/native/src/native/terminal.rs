use super::{Defect, GLANCE, Native, Wheel, pid, placed};
use crate::inspection::{Target, Unseen, region};
use crate::system::{Identity, PATIENCE, TimedOut, poll, settle, until};
use crate::x11::{Geometry, Key, Pixels};
use anyhow::{Context, Result, ensure};
use serde::Serialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::ops::Range;
use std::time::Duration;
use voyager_contract::inspection::Frame;
use voyager_contract::{ContentId, CoreTerminalId, Layout, PlacementId};

pub const EXPECTATION: Duration = Duration::from_secs(4);
pub const LOOK: Duration = Duration::from_millis(10);
const WHEEL_CLICKS: usize = 6;
const PIECE: usize = 16;
const PADDING: f32 = 8.;
const MASKED: [u8; 3] = [0, 0, 0];

#[derive(Debug, PartialEq, Serialize)]
pub struct Line {
    top: usize,
    height: usize,
    #[serde(skip)]
    image: [u8; 32],
}

impl Line {
    fn new(rows: &[&[u8]], top: usize, end: usize) -> Self {
        let mut image = Sha256::new();
        for row in &rows[top..end] {
            image.update(row);
        }
        Self {
            top,
            height: end - top,
            image: image.finalize().into(),
        }
    }
}

#[derive(Debug, PartialEq, Serialize)]
pub struct Lines(Vec<Line>);

impl Lines {
    pub fn of(look: &Pixels) -> Self {
        let rows: Vec<&[u8]> = look.rows().collect();
        let Some(background) = background(&rows) else {
            return Self(Vec::new());
        };
        let blank: Vec<u8> = rows
            .first()
            .map(|row| {
                row.as_chunks::<4>()
                    .0
                    .iter()
                    .flat_map(|_| background)
                    .collect()
            })
            .unwrap_or_default();
        let ink = |row: &[u8]| {
            row != blank.as_slice()
                && row
                    .as_chunks::<4>()
                    .0
                    .iter()
                    .any(|pixel| pixel[..3] != background[..3] && pixel[..3] != MASKED)
        };
        let mut lines = Vec::new();
        let mut top = None;
        for (y, row) in rows.iter().enumerate() {
            match (ink(row), top) {
                (true, None) => top = Some(y),
                (false, Some(start)) => {
                    lines.push(Line::new(&rows, start, y));
                    top = None;
                }
                _ => {}
            }
        }
        if let Some(start) = top {
            lines.push(Line::new(&rows, start, rows.len()));
        }
        Self(lines)
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn count(&self) -> usize {
        self.0.len()
    }

    pub fn lowered(&self, to: &Self) -> Option<usize> {
        let first = self.0.first()?;
        let last = to.0.last()?.top.max(self.0.last()?.top);
        to.0.iter().enumerate().find_map(|(above, line)| {
            let distance = line.top.checked_sub(first.top).filter(|moved| *moved > 0)?;
            let kept = self.0.iter().filter(|kept| kept.top + distance <= last);
            let found = |kept: &Line| {
                to.0.iter()
                    .any(|drawn| drawn.top == kept.top + distance && drawn.image == kept.image)
            };
            (line.image == first.image && kept.into_iter().all(found)).then_some(above)
        })
    }

    pub fn lowered_below_history(&self, to: &Self) -> bool {
        self.lowered(to).is_some_and(|above| {
            above > 0
                && to.0[..above]
                    .iter()
                    .all(|earlier| self.0.iter().all(|live| live.image != earlier.image))
        })
    }
}

fn background(rows: &[&[u8]]) -> Option<[u8; 4]> {
    let mut counts: BTreeMap<[u8; 4], usize> = BTreeMap::new();
    for row in rows.iter().step_by(8) {
        for pixel in row.as_chunks::<4>().0.iter().step_by(8) {
            if pixel[..3] != MASKED {
                *counts.entry(*pixel).or_default() += 1;
            }
        }
    }
    counts
        .into_iter()
        .max_by_key(|(_, count)| *count)
        .map(|(pixel, _)| pixel)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct Patch {
    pub area: Geometry,
    pub ink: usize,
}

fn near(pixel: &[u8; 4], rgb: [u8; 3], tolerance: u8) -> bool {
    let [blue, green, red, _] = *pixel;
    red.abs_diff(rgb[0]) <= tolerance
        && green.abs_diff(rgb[1]) <= tolerance
        && blue.abs_diff(rgb[2]) <= tolerance
}

fn runs(length: usize, hit: impl Fn(usize) -> bool) -> Vec<Range<usize>> {
    let mut found = Vec::new();
    let mut start = None;
    for index in 0..=length {
        match (index < length && hit(index), start) {
            (true, None) => start = Some(index),
            (false, Some(first)) => {
                found.push(first..index);
                start = None;
            }
            _ => {}
        }
    }
    found
}

pub fn boxes(look: &Pixels, rgb: [u8; 3], tolerance: u8) -> Vec<Patch> {
    let rows: Vec<&[[u8; 4]]> = look.rows().map(|row| row.as_chunks::<4>().0).collect();
    let coloured = |x: usize, y: usize| near(&rows[y][x], rgb, tolerance);
    let width = usize::from(look.region.width);
    let mut found = Vec::new();
    for band in runs(rows.len(), |y| (0..width).any(|x| coloured(x, y))) {
        for columns in runs(width, |x| band.clone().any(|y| coloured(x, y))) {
            let holds = |y: &usize| columns.clone().any(|x| coloured(x, *y));
            let (Some(top), Some(bottom)) =
                (band.clone().find(holds), band.clone().rev().find(holds))
            else {
                continue;
            };
            let ink = (top..=bottom)
                .flat_map(|y| columns.clone().map(move |x| (x, y)))
                .filter(|(x, y)| !coloured(*x, *y))
                .count();
            found.push(Patch {
                area: Geometry {
                    x: look.region.x + columns.start as i16,
                    y: look.region.y + top as i16,
                    width: columns.len() as u16,
                    height: (bottom - top + 1) as u16,
                },
                ink,
            });
        }
    }
    found
}

pub fn changed(before: &Pixels, after: &Pixels) -> Option<Geometry> {
    if before.region != after.region {
        return Some(after.region);
    }
    let mut edges: Option<(usize, usize, usize, usize)> = None;
    for (y, (was, is)) in before.rows().zip(after.rows()).enumerate() {
        if was == is {
            continue;
        }
        let pixels = was.as_chunks::<4>().0.iter().zip(is.as_chunks::<4>().0);
        let differs = |(was, is): (&[u8; 4], &[u8; 4])| was != is;
        let (Some(left), Some(right)) = (
            pixels.clone().position(differs),
            pixels.clone().rposition(differs),
        ) else {
            continue;
        };
        edges = Some(match edges {
            None => (left, y, right, y),
            Some((first, top, last, _)) => (first.min(left), top, last.max(right), y),
        });
    }
    edges.map(|(left, top, right, bottom)| Geometry {
        x: before.region.x + left as i16,
        y: before.region.y + top as i16,
        width: (right - left + 1) as u16,
        height: (bottom - top + 1) as u16,
    })
}

pub fn repainted(
    before: &Pixels,
    after: &Pixels,
    rgb: [u8; 3],
    tolerance: u8,
) -> BTreeSet<[u8; 3]> {
    if before.region != after.region {
        return BTreeSet::new();
    }
    before
        .rows()
        .zip(after.rows())
        .flat_map(|(was, is)| was.as_chunks::<4>().0.iter().zip(is.as_chunks::<4>().0))
        .filter(|(was, _)| near(was, rgb, tolerance))
        .map(|(_, [blue, green, red, _])| [*red, *green, *blue])
        .collect()
}

fn padding(area: Geometry, inset: u16) -> [Geometry; 4] {
    let inset = inset.min(area.width / 2).min(area.height / 2);
    let far = |start: i16, length: u16| (i32::from(start) + i32::from(length - inset)) as i16;
    [
        Geometry {
            height: inset,
            ..area
        },
        Geometry {
            y: far(area.y, area.height),
            height: inset,
            ..area
        },
        Geometry {
            width: inset,
            ..area
        },
        Geometry {
            x: far(area.x, area.width),
            width: inset,
            ..area
        },
    ]
}

#[derive(Serialize)]
pub struct Terminal {
    #[serde(rename = "terminal")]
    address: CoreTerminalId,
    placement: PlacementId,
    shell: Identity,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Program {
    pub state: Option<String>,
    pub pid: Option<u64>,
    pub argv: serde_json::Value,
    pub same: bool,
}

impl Terminal {
    pub fn first(native: &mut Native) -> Result<Self> {
        let placement = until("a placed first terminal", || {
            let Some((_, layout)) = native.document()? else {
                return Ok(None);
            };
            Ok(layout
                .contents
                .first()
                .and_then(|content| placement_of(&layout, &content.id).cloned()))
        })?;
        let terminal = Self::bind(native, &placement)?;
        native.identify_first(&terminal)?;
        Ok(terminal)
    }

    pub fn bind(native: &mut Native, placement: &PlacementId) -> Result<Self> {
        let address = until("the Vessel's bound terminal", || {
            let Some((_, layout)) = native.document()? else {
                return Ok(None);
            };
            let content = placed(&layout)
                .find(|placed| &placed.id == placement)
                .and_then(|placed| {
                    layout
                        .contents
                        .iter()
                        .find(|content| content.id == placed.content)
                });
            Ok(content.and_then(|content| content.backend.clone()))
        })?;
        let shell = Identity::read(pid(&native
            .system
            .rpc("terminal.get", json!({"terminal":address}))?)?)?;
        native.system.record(
            json!({"event":"bind","terminal":address,"placement":placement,"shell":shell}),
        )?;
        native.adopt(format!("shell {}", placement.0), shell.clone());
        Ok(Self {
            address,
            placement: placement.clone(),
            shell,
        })
    }

    pub fn program(&self, native: &Native) -> Result<Program> {
        let reported = native
            .system
            .rpc("terminal.get", json!({"terminal":self.address}))?;
        let pid = reported["pid"].as_u64();
        Ok(Program {
            state: reported["state"].as_str().map(str::to_owned),
            pid,
            argv: reported["argv"].clone(),
            same: self.shell.verify().is_ok() && pid == Some(u64::from(self.shell.pid)),
        })
    }

    pub fn placement(&self) -> &PlacementId {
        &self.placement
    }

    pub fn target(&self) -> Target {
        Target::terminal(&self.placement)
    }

    pub fn focus(&self, native: &Native) -> Result<()> {
        native.click(&self.target())
    }

    pub fn line(&self, native: &Native, text: &str) -> Result<()> {
        self.focus(native)?;
        native.type_text(text)?;
        native.press(Key::Return)
    }

    pub fn echoed(&self, native: &Native, text: &str) -> Result<()> {
        let characters: Vec<char> = text.chars().collect();
        let mut typed = String::new();
        for piece in characters.chunks(PIECE) {
            let piece: String = piece.iter().collect();
            native.type_text(&piece)?;
            typed.push_str(&piece);
            let mut shown = String::new();
            let echoed = poll(PATIENCE, LOOK, true, || {
                let read = native
                    .system
                    .watch("terminal.read", json!({"terminal":self.address}))?;
                shown = read["text"].as_str().unwrap_or_default().to_owned();
                Ok(echoes(&shown, &typed).then_some(()))
            })?;
            if echoed.is_none() {
                return Err(Defect(format!(
                    "the shell of {} did not echo the typed text {typed:?}; its screen holds {shown:?}",
                    self.target()
                ))
                .into());
            }
        }
        Ok(())
    }

    pub fn enter(&self, native: &Native, folder: &str) -> Result<()> {
        self.line(native, &format!("cd {folder}"))?;
        until(
            &format!("the shell of {} in {folder}", self.target()),
            || {
                let reported = native
                    .system
                    .watch("terminal.get", json!({"terminal":self.address}))?;
                Ok((reported["foreground"]["cwd"] == folder).then_some(()))
            },
        )
    }

    pub fn shows(&self, native: &Native, text: &str) -> Result<()> {
        if self.printed(native, text)? {
            return Ok(());
        }
        Err(TimedOut(format!("{text} in the terminal")).into())
    }

    pub fn printed(&self, native: &Native, text: &str) -> Result<bool> {
        let printed = poll(PATIENCE, GLANCE, true, || {
            let read = native
                .system
                .watch("terminal.read", json!({"terminal":self.address}))?;
            Ok(read["text"]
                .as_str()
                .is_some_and(|shown| shown.contains(text))
                .then_some(()))
        })?;
        Ok(printed.is_some())
    }

    pub fn foreground(&self, native: &Native) -> Result<String> {
        until(
            &format!("the foreground program of {}", self.target()),
            || {
                let reported = native
                    .system
                    .watch("terminal.get", json!({"terminal":self.address}))?;
                Ok(foreground_name(&reported))
            },
        )
    }

    pub fn shown(
        &self,
        native: &Native,
        name: &str,
        awaited: impl Fn(&Pixels) -> bool,
    ) -> Result<Pixels> {
        let look = poll(PATIENCE, LOOK, true, || {
            Ok(Some(self.look(native)?).filter(|look| awaited(look)))
        })?
        .ok_or_else(|| Unseen(format!("{name} in {}", self.target())))?;
        native.keep(name, &look)?;
        Ok(look)
    }

    pub fn wheel(&self, native: &Native, direction: Wheel) -> Result<()> {
        native.wheel(&self.target(), direction, WHEEL_CLICKS)
    }

    pub fn origin(&self, native: &Native) -> Result<(i16, i16)> {
        let target = self.target();
        native.wait_for(&target.to_string(), PATIENCE, |frame| {
            let area = region(frame, &target.find(frame)?.bounds);
            let inset = inset(frame) as i16;
            Some((area.x + inset, area.y + inset))
        })
    }

    pub fn look(&self, native: &Native) -> Result<Pixels> {
        let target = self.target();
        let (terminal, avatar, inset) =
            native.wait_for(&target.to_string(), PATIENCE, |frame| {
                let terminal = target.find(frame)?;
                let avatar = Target::AVATAR.find(frame);
                Some((
                    region(frame, &terminal.bounds),
                    avatar.map(|avatar| region(frame, &avatar.bounds)),
                    inset(frame),
                ))
            })?;
        let mut pixels = native.x11()?.capture(native.window, terminal)?;
        for edge in padding(terminal, inset).into_iter().chain(avatar) {
            pixels.mask(edge);
        }
        Ok(pixels)
    }

    pub fn settled(
        &self,
        native: &Native,
        name: &str,
        expected: impl Fn(&Pixels) -> bool,
    ) -> Result<Pixels> {
        let ((), look) = self.settled_with(native, name, || Ok(()), |(), look| expected(look))?;
        Ok(look)
    }

    pub fn settled_with<T: PartialEq>(
        &self,
        native: &Native,
        name: &str,
        mut observe: impl FnMut() -> Result<T>,
        expected: impl Fn(&T, &Pixels) -> bool,
    ) -> Result<(T, Pixels)> {
        let (value, look) = settle(
            EXPECTATION,
            LOOK,
            || Ok(Some((observe()?, self.look(native)?))),
            |(value, look)| expected(value, look),
        )?
        .ok_or_else(|| Unseen(format!("{} holding still", self.target())))?;
        native.keep(name, &look)?;
        Ok((value, look))
    }

    pub fn same_program(&self, native: &Native) -> Result<()> {
        let gone = |reason: String| {
            Defect(format!(
                "the shell of {} did not survive: {reason}",
                self.target()
            ))
        };
        self.shell
            .verify()
            .map_err(|error| gone(format!("{error:#}")))?;
        let reported = native
            .system
            .rpc("terminal.get", json!({"terminal":self.address}))?;
        if reported["pid"].as_u64() != Some(u64::from(self.shell.pid)) {
            return Err(gone("Core reports another program for the terminal".into()).into());
        }
        native
            .core
            .as_ref()
            .context("Missing Core identity")?
            .verify()?;
        ensure!(
            native.system.rpc("server.status", json!({}))?["core"]["id"] == native.core_id,
            "Core identity changed"
        );
        Ok(())
    }
}

fn echoes(shown: &str, typed: &str) -> bool {
    let unspaced = |text: &str| -> String {
        text.chars()
            .filter(|character| !character.is_whitespace())
            .collect()
    };
    unspaced(shown).ends_with(&unspaced(typed))
}

fn foreground_name(reported: &serde_json::Value) -> Option<String> {
    reported["foreground"]["name"].as_str().map(str::to_owned)
}

fn inset(frame: &Frame) -> u16 {
    (PADDING * frame.window.scale).ceil() as u16
}

fn placement_of<'a>(layout: &'a Layout, content: &ContentId) -> Option<&'a PlacementId> {
    placed(layout)
        .find(|placed| &placed.content == content)
        .map(|placed| &placed.id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native::{Cause, tests::native};
    use std::path::Path;

    const WIDTH: u16 = 12;
    const HEIGHT: u16 = 30;
    const BACKGROUND: [u8; 4] = [22, 19, 17, 0];

    fn screen(lines: &[(usize, u8)]) -> Pixels {
        let stride = usize::from(WIDTH) * 4;
        let mut bgrx: Vec<u8> = (0..usize::from(WIDTH) * usize::from(HEIGHT))
            .flat_map(|_| BACKGROUND)
            .collect();
        for (top, shade) in lines {
            for row in *top..top + 2 {
                bgrx[row * stride + 8..row * stride + 16].fill(*shade);
            }
        }
        let region = Geometry {
            x: 0,
            y: 0,
            width: WIDTH,
            height: HEIGHT,
        };
        Pixels::new(region, bgrx)
    }

    #[test]
    fn lines_drawn_lower_after_a_scroll_are_found_with_the_lines_above_them() {
        let live = Lines::of(&screen(&[(3, 90), (11, 120), (19, 150)]));
        let history = Lines::of(&screen(&[(3, 60), (11, 90), (19, 120), (27, 150)]));
        assert_eq!(live.lowered(&history), Some(1));
        let history = Lines::of(&screen(&[(3, 60), (11, 70), (19, 90), (27, 120)]));
        assert_eq!(live.lowered(&history), Some(2));
    }

    #[test]
    fn a_scroll_that_drops_every_line_or_draws_none_shows_no_lowered_lines() {
        let live = Lines::of(&screen(&[(3, 90), (11, 120), (19, 150)]));
        let elsewhere = Lines::of(&screen(&[(3, 30), (11, 40), (19, 50)]));
        assert_eq!(live.lowered(&elsewhere), None);
        let blank = Lines::of(&screen(&[]));
        assert!(blank.is_empty());
        assert_eq!(live.lowered(&blank), None);
        assert_eq!(blank.lowered(&live), None);
        assert_eq!(live.lowered(&live), None);
    }

    #[test]
    fn lines_drawn_above_must_be_earlier_history_and_every_lowered_line_that_fits_must_be_drawn() {
        let live = Lines::of(&screen(&[(3, 90), (11, 120), (19, 150)]));
        let history = Lines::of(&screen(&[(3, 60), (11, 90), (19, 120)]));
        assert!(live.lowered_below_history(&history));
        let repeated = Lines::of(&screen(&[(3, 150), (11, 90), (19, 120)]));
        assert_eq!(live.lowered(&repeated), Some(1));
        assert!(!live.lowered_below_history(&repeated));
        let cut = Lines::of(&screen(&[(3, 60), (11, 90)]));
        assert_eq!(live.lowered(&cut), None);
        assert!(!live.lowered_below_history(&cut));
        assert!(!live.lowered_below_history(&live));
    }

    #[test]
    fn a_line_that_moved_by_a_different_distance_from_its_neighbours_is_not_lowered() {
        let live = Lines::of(&screen(&[(3, 90), (11, 120), (19, 150)]));
        let torn = Lines::of(&screen(&[(3, 60), (11, 90), (19, 150), (27, 120)]));
        assert_eq!(live.lowered(&torn), None);
    }

    #[test]
    fn masked_padding_and_the_avatar_are_not_drawn_lines() {
        let mut look = screen(&[(11, 90)]);
        let area = look.region;
        for edge in padding(area, 2) {
            look.mask(edge);
        }
        look.mask(Geometry {
            x: 3,
            y: 20,
            width: 4,
            height: 4,
        });
        let lines = Lines::of(&look);
        assert_eq!(lines.0.len(), 1);
        assert_eq!(lines.0[0].top, 11);
    }

    fn paint(look: &mut [u8], columns: Range<usize>, rows: Range<usize>, bgr: [u8; 3]) {
        let stride = usize::from(WIDTH) * 4;
        for row in rows {
            for column in columns.clone() {
                let at = row * stride + column * 4;
                look[at..at + 3].copy_from_slice(&bgr);
            }
        }
    }

    fn painted(patches: &[(Range<usize>, Range<usize>, [u8; 3])]) -> Pixels {
        let mut bgrx: Vec<u8> = (0..usize::from(WIDTH) * usize::from(HEIGHT))
            .flat_map(|_| BACKGROUND)
            .collect();
        for (columns, rows, bgr) in patches {
            paint(&mut bgrx, columns.clone(), rows.clone(), *bgr);
        }
        let region = Geometry {
            x: 100,
            y: 50,
            width: WIDTH,
            height: HEIGHT,
        };
        Pixels::new(region, bgrx)
    }

    const GREEN: [u8; 3] = [24, 160, 96];
    const GREEN_BGR: [u8; 3] = [96, 160, 24];

    #[test]
    fn each_coloured_box_is_found_where_it_is_drawn_with_the_ink_inside_it() {
        let look = painted(&[
            (2..8, 4..7, GREEN_BGR),
            (4..5, 5..6, [200, 200, 200]),
            (3..6, 20..22, [97, 159, 25]),
            (9..11, 20..22, GREEN_BGR),
            (0..1, 28..29, [98, 160, 24]),
        ]);
        let found = boxes(&look, GREEN, 1);
        let area = |x, y, width, height| Geometry {
            x,
            y,
            width,
            height,
        };
        assert_eq!(
            found,
            [
                Patch {
                    area: area(102, 54, 6, 3),
                    ink: 1
                },
                Patch {
                    area: area(103, 70, 3, 2),
                    ink: 0
                },
                Patch {
                    area: area(109, 70, 2, 2),
                    ink: 0
                },
            ]
        );
        assert_eq!(boxes(&look, GREEN, 0).len(), 2);
        assert!(boxes(&look, [1, 2, 3], 1).is_empty());
    }

    #[test]
    fn the_changed_area_bounds_every_pixel_that_differs() {
        let before = painted(&[(2..8, 4..7, GREEN_BGR)]);
        assert_eq!(changed(&before, &before), None);
        let after = painted(&[(2..8, 4..7, GREEN_BGR), (3..5, 10..12, [1, 2, 3])]);
        assert_eq!(
            changed(&before, &after),
            Some(Geometry {
                x: 103,
                y: 60,
                width: 2,
                height: 2
            })
        );
        let moved = painted(&[(3..9, 5..8, GREEN_BGR)]);
        assert_eq!(
            changed(&before, &moved),
            Some(Geometry {
                x: 102,
                y: 54,
                width: 7,
                height: 4
            })
        );
        let elsewhere = screen(&[]);
        assert_eq!(changed(&before, &elsewhere), Some(elsewhere.region));
    }

    #[test]
    fn the_colours_that_replace_a_colour_are_read_where_it_was_drawn() {
        let before = painted(&[(2..8, 4..7, GREEN_BGR), (4..5, 5..6, [200, 200, 200])]);
        assert_eq!(
            repainted(&before, &before, GREEN, 1),
            BTreeSet::from([GREEN])
        );
        let selected = painted(&[(2..8, 4..7, [105, 118, 57]), (4..5, 5..6, [9, 9, 9])]);
        assert_eq!(
            repainted(&before, &selected, GREEN, 1),
            BTreeSet::from([[57, 118, 105]])
        );
        let partly = painted(&[(2..8, 4..7, GREEN_BGR), (2..5, 4..7, [105, 118, 57])]);
        assert_eq!(
            repainted(&before, &partly, GREEN, 1),
            BTreeSet::from([GREEN, [57, 118, 105]])
        );
        assert!(repainted(&before, &screen(&[]), GREEN, 1).is_empty());
        assert!(repainted(&before, &selected, [1, 2, 3], 1).is_empty());
    }

    #[test]
    fn a_shell_that_died_is_a_product_failure() -> Result<()> {
        let mut native = native()?;
        let mut shell = native.system.spawn(
            Path::new("/usr/bin/tail"),
            &["-f", "/dev/null"],
            &[],
            "shell.log",
        )?;
        shell.child.kill()?;
        shell.child.wait()?;
        let terminal = Terminal {
            address: CoreTerminalId("t1".into()),
            placement: PlacementId("placement-3".into()),
            shell: shell.identity.clone(),
        };
        let error = terminal
            .same_program(&native)
            .expect_err("A shell that died counted as the same program");
        ensure!(
            matches!(native.diagnose(&error), Cause::Product(detail) if detail.contains("placement-3")),
            "A shell that died was blamed on the fixture: {error:#}"
        );
        Ok(())
    }

    #[test]
    fn a_core_that_does_not_answer_is_not_a_dead_shell() -> Result<()> {
        let mut native = native()?;
        let idle = |native: &Native, log: &str| {
            native
                .system
                .spawn(Path::new("/usr/bin/tail"), &["-f", "/dev/null"], &[], log)
        };
        let shell = idle(&native, "shell.log")?;
        let terminal = Terminal {
            address: CoreTerminalId("t1".into()),
            placement: PlacementId("placement-3".into()),
            shell: shell.identity.clone(),
        };
        let error = terminal
            .same_program(&native)
            .expect_err("A terminal that Core does not answer for counted as the same program");
        ensure!(
            error.downcast_ref::<Defect>().is_none(),
            "A Core that did not answer was reported as a shell that died: {error:#}"
        );
        ensure!(
            matches!(native.diagnose(&error), Cause::Fixture(_)),
            "A Core that did not answer was blamed on the product while Core was not known to be gone"
        );
        let mut core = idle(&native, "core.log")?;
        core.child.kill()?;
        core.child.wait()?;
        native.core = Some(core.identity.clone());
        ensure!(
            matches!(native.diagnose(&error), Cause::Product(detail) if detail.contains("Core exited")),
            "A Core that exited was not blamed on the product"
        );
        Ok(())
    }

    #[test]
    fn typed_text_is_echoed_when_the_screen_ends_with_it_whatever_the_wrapping() {
        let typed = "'/a/b' probe '/c d/e' keys";
        assert!(echoes("bash-5.3$ '/a/b' probe '/c d/e' keys", typed));
        assert!(echoes(
            "COPY\n\nbash-5.3$ '/a/b' probe\n'/c d/e' keys",
            typed
        ));
        assert!(echoes("bash-5.3$ '/a/b' probe '/c\nd/e' keys", typed));
        assert!(!echoes("bash-5.3$ '/a/b' probe '/c d/e' key", typed));
        assert!(!echoes("bash-5.3$ '/ab' probe '/c d/e' keys", typed));
        assert!(!echoes(
            "bash-5.3$ '/a/b' probe '/c d/e' keys\nbash: no",
            typed
        ));
        assert!(!echoes("", typed));
    }

    #[test]
    fn a_reply_without_a_foreground_names_no_program() {
        let flooding = json!({"pid":238,"foreground":{"name":"timeout","pid":258}});
        assert_eq!(foreground_name(&flooding).as_deref(), Some("timeout"));
        assert_eq!(foreground_name(&json!({"pid":238})), None);
        assert_eq!(foreground_name(&json!({"pid":238,"foreground":null})), None);
    }

    #[test]
    fn the_terminal_placement_is_found_by_its_content() {
        let layout: Layout = serde_json::from_value(json!({
            "voyages": [{
                "id": "voyage-1",
                "name": "Voyager",
                "fleets": [{
                    "id": "fleet-4",
                    "name": "Fleet 1",
                    "root": null,
                    "vessels": [
                        {"id": "placement-7", "content": "content-6", "name": "Agents 1"},
                        {"id": "placement-3", "content": "content-2", "name": "Terminal 1"}
                    ]
                }],
                "portals": [{"id": "placement-9", "content": "content-8", "name": "Notes"}]
            }],
            "contents": [],
            "selectedVoyage": "voyage-1",
            "selectedFleet": "fleet-4",
            "context": {"kind": "workspace"},
            "nextId": "10"
        }))
        .expect("a contract layout");
        let placed = |content: &str| {
            placement_of(&layout, &ContentId(content.into())).map(|placement| placement.0.as_str())
        };
        assert_eq!(placed("content-2"), Some("placement-3"));
        assert_eq!(placed("content-8"), Some("placement-9"));
        assert_eq!(placed("content-1"), None);
    }
}
