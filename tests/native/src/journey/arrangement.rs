use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Program, Terminal, fleets};
use crate::system::{PATIENCE, poll};
use crate::x11::Key;
use anyhow::{Context as _, Result};
use serde::Serialize;
use serde_json::{Value, json};
use std::time::Duration;
use voyager_contract::inspection::{Frame, Rect, Role};
use voyager_contract::{Axis, Fleet, FleetId, Layout, PlacementId, RenameTarget, Split};

cases! {
    SplitBelow => "split-below",
    SplitRightShortcut => "split-right-shortcut",
    ResizeDividers => "resize-dividers",
    MaximizeButton => "maximize-button",
    RestoreShortcut => "restore-shortcut",
    MoveVessel => "move-vessel",
    MoveCancelled => "move-cancelled",
    RelaunchKeepsArrangement => "relaunch-keeps-arrangement",
    WindowResizeFitsGrid => "window-resize-fits-grid",
    MaximizeShortcutRestoreButton => "maximize-shortcut-restore-button",
    SplitBelowShortcut => "split-below-shortcut",
}

pub const CONTROL: Case = Case::RestoreShortcut;

const EVEN: u16 = 5000;
const LOGICAL_TOLERANCE: f32 = 1.0;
const DIVIDER_TOLERANCE: f32 = 4.0;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
struct Grid {
    rows: u32,
    columns: u32,
}

#[derive(Clone, PartialEq, Serialize)]
struct Drawn {
    terminals: Vec<(String, Rect)>,
    names: Vec<String>,
    previews: Vec<(String, Rect)>,
}

impl Drawn {
    fn of(frame: &Frame) -> Self {
        let keyed = |role: Role| {
            let mut found: Vec<(String, Rect)> = frame
                .elements
                .iter()
                .filter(|element| element.role == role)
                .map(|element| (element.key.clone(), element.bounds))
                .collect();
            found.sort_by(|a, b| a.0.cmp(&b.0));
            found
        };
        Self {
            terminals: keyed(Role::Terminal),
            names: keyed(Role::VesselName)
                .into_iter()
                .map(|(key, _)| key)
                .collect(),
            previews: keyed(Role::MovePreview),
        }
    }

    fn terminal(&self, placement: &PlacementId) -> Option<Rect> {
        self.terminals
            .iter()
            .find(|(key, _)| key == &placement.0)
            .map(|(_, bounds)| *bounds)
    }

    fn keys(&self) -> Vec<String> {
        self.terminals.iter().map(|(key, _)| key.clone()).collect()
    }
}

struct Shells {
    first: PlacementId,
    second: PlacementId,
    third: PlacementId,
    terminals: Vec<Terminal>,
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let one = Terminal::first(native)?;
    let start = at_rest(native)?.1;
    let fleet = start
        .selected_fleet
        .clone()
        .context("The fresh workspace selects no Fleet")?;
    let first = one.placement().clone();
    let Some((second, two, full)) = cases.make(native, Case::SplitBelow, |native| {
        let before = grid(native, &one, "GRID-A")?;
        let (_, layout) = at_rest(native)?;
        native.hover(&Target::name(&vessel(&first)))?;
        native.click(&Target::split_bottom(&first))?;
        native.click(&Target::worker("terminal"))?;
        let (after, drawn) = native.settle(
            "a new Vessel's terminal drawn below the first",
            |seen| {
                let born = born(&layout, seen.document, &fleet);
                let drawn = Drawn::of(seen.frame);
                (born.len() == 1 && drawn.terminal(&born[0]).is_some())
                    .then(|| (seen.document.clone(), drawn))
            },
            |_| true,
        )?;
        let born = born(&layout, &after, &fleet);
        let second = born.first().cloned().context("No Vessel was created")?;
        let two = Terminal::bind(native, &second)?;
        two.line(native, "echo BELOW-$((6*7))")?;
        let printed = two.printed(native, "BELOW-42")?;
        let shrunk = grid(native, &one, "GRID-B")?;
        let above = drawn.terminal(&first);
        let below = drawn.terminal(&second);
        let verdict = Verdict::new()
            .expect("exactly one Vessel was created", born.len() == 1)
            .expect(
                "the saved tree is the first Vessel above the new one at an even share",
                root(&after, &fleet)
                    == Some(branch(Axis::Vertical, EVEN, leaf(&first), leaf(&second))),
            )
            .expect(
                "the new Vessel's terminal is drawn below the first's and overlaps it across",
                matches!((above, below), (Some(above), Some(below)) if below.y >= above.y + above.height - LOGICAL_TOLERANCE && overlaps_across(&above, &below)),
            )
            .expect("the new Vessel's shell printed BELOW-42", printed)
            .expect(
                "the first shell's grid lost rows and kept its columns",
                shrunk.rows < before.rows && shrunk.columns == before.columns,
            )
            .expect(
                "the first shell is the same program",
                running(&one.program(native)?),
            )
            .observed("grid", json!({"before":before,"after":shrunk}))?
            .observed("tree", root(&after, &fleet))?;
        Ok((verdict, Some((second, two, shrunk))))
    })?
    else {
        return Ok(());
    };
    let Some(shells) = cases.make(native, Case::SplitRightShortcut, |native| {
        two.focus(native)?;
        let before = grid(native, &two, "GRID-C")?;
        let (_, layout) = at_rest(native)?;
        native.press(Key::Char('o').ctrl().shift())?;
        native.click(&Target::worker("terminal"))?;
        let (after, drawn) = native.settle(
            "a new Vessel's terminal drawn beside the second",
            |seen| {
                let born = born(&layout, seen.document, &fleet);
                let drawn = Drawn::of(seen.frame);
                (born.len() == 1 && drawn.terminal(&born[0]).is_some())
                    .then(|| (seen.document.clone(), drawn))
            },
            |_| true,
        )?;
        let born = born(&layout, &after, &fleet);
        let third = born.first().cloned().context("No Vessel was created")?;
        let three = Terminal::bind(native, &third)?;
        three.line(native, "echo RIGHT-$((6*7))")?;
        let printed = three.printed(native, "RIGHT-42")?;
        let narrowed = grid(native, &two, "GRID-D")?;
        let beside = grid(native, &three, "GRID-E")?;
        let (top, left, right) = (
            drawn.terminal(&first),
            drawn.terminal(&second),
            drawn.terminal(&third),
        );
        let programs = [one.program(native)?, two.program(native)?];
        let verdict = Verdict::new()
            .expect("exactly one Vessel was created", born.len() == 1)
            .expect(
                "the saved tree splits the clicked second Vessel, not the first",
                root(&after, &fleet)
                    == Some(branch(
                        Axis::Vertical,
                        EVEN,
                        leaf(&first),
                        branch(Axis::Horizontal, EVEN, leaf(&second), leaf(&third)),
                    )),
            )
            .expect(
                "the new terminal is drawn right of the second, in its row, below the first",
                matches!((top, left, right), (Some(top), Some(left), Some(right))
                    if right.x >= left.x + left.width - LOGICAL_TOLERANCE
                        && (right.y - left.y).abs() <= LOGICAL_TOLERANCE
                        && right.y >= top.y + top.height - LOGICAL_TOLERANCE),
            )
            .expect("the new Vessel's shell printed RIGHT-42", printed)
            .expect(
                "both side-by-side shells have fewer columns than the full-width shell",
                narrowed.columns < full.columns && beside.columns < full.columns,
            )
            .expect(
                "the earlier shells are the same programs",
                programs.iter().all(running),
            )
            .observed(
                "grid",
                json!({"full":full,"secondBefore":before,"secondAfter":narrowed,"third":beside}),
            )?;
        Ok((
            verdict,
            Some(Shells {
                first: first.clone(),
                second: second.clone(),
                third,
                terminals: vec![one, two, three],
            }),
        ))
    })?
    else {
        return Ok(());
    };
    let Some(resized) = cases.make(native, Case::ResizeDividers, |native| {
        let root_key = divider(native, &[])?;
        let lower = Target::terminal(&shells.second);
        let (_, goal_y) = goal(native, &lower, 0.5, 0.4)?;
        let mut held = native.hold(&Target::split_divider(&root_key))?;
        held.toward(native.point_in(&lower, 0.5, 0.4)?)?;
        let followed = near(native, &root_key, None, Some(goal_y))?;
        held.release()?;
        let (_, rested_root) = shares_settled(native, &fleet, |root, _| root > EVEN)?;
        let stayed = near(native, &root_key, None, Some(goal_y))?;
        let nested_key = divider(native, &["second"])?;
        let (goal_x, _) = goal(native, &lower, 0.3, 0.5)?;
        let mut held = native.hold(&Target::split_divider(&nested_key))?;
        held.toward(native.point_in(&lower, 0.3, 0.5)?)?;
        let followed_nested = near(native, &nested_key, Some(goal_x), None)?;
        held.release()?;
        let (after_nested, rested_nested) =
            shares_settled(native, &fleet, |_, nested| nested < EVEN)?;
        let stayed_nested = near(native, &nested_key, Some(goal_x), None)?;
        let verdict = Verdict::new()
            .expect(
                "while held, the stacked divider is drawn under the pointer",
                followed,
            )
            .expect(
                "after release, the stacked divider stays where it was released",
                stayed,
            )
            .expect(
                "the stacked drag raised the root share and left the nested share even",
                rested_root.0 > EVEN && rested_root.1 == EVEN,
            )
            .expect(
                "while held, the side-by-side divider is drawn under the pointer",
                followed_nested,
            )
            .expect(
                "after release, the side-by-side divider stays where it was released",
                stayed_nested,
            )
            .expect(
                "the side-by-side drag lowered the nested share and kept the root share",
                rested_nested.1 < EVEN && rested_nested.0 == rested_root.0,
            )
            .expect(
                "every shell is the same program",
                all_running(native, &shells.terminals)?,
            )
            .observed(
                "shares",
                json!({"afterStacked":rested_root,"afterSideBySide":rested_nested}),
            )?;
        Ok((verdict, Some(after_nested)))
    })?
    else {
        return Ok(());
    };
    let Some(before_max) = cases.make(native, Case::MaximizeButton, |native| {
        shells.terminals[0].focus(native)?;
        let before = drawn_now(native)?;
        native.hover(&Target::name(&vessel(&shells.third)))?;
        native.click(&Target::maximize_panel(&shells.third))?;
        let (layout, drawn) = native.settle(
            "only the third Vessel drawn, maximized",
            |seen| Some((seen.document.clone(), Drawn::of(seen.frame))),
            |(layout, drawn)| {
                maximized(layout, &fleet).as_ref() == Some(&shells.third)
                    && drawn.keys() == vec![shells.third.0.clone()]
            },
        )?;
        native.type_text("echo MAX-$((6*7))")?;
        native.press(Key::Return)?;
        let printed = shells.terminals[2].printed(native, "MAX-42")?;
        let elsewhere = shells.terminals[0].screen(native)?.contains("MAX-42");
        let union = union(&before.terminals);
        let verdict = Verdict::new()
            .expect(
                "the saved maximized Vessel is the third, with the tree and shares unchanged",
                maximized(&layout, &fleet).as_ref() == Some(&shells.third)
                    && root(&layout, &fleet) == root(&resized, &fleet),
            )
            .expect(
                "only the third Vessel's title and terminal are drawn",
                drawn.keys() == vec![shells.third.0.clone()]
                    && drawn.names == vec![shells.third.0.clone()],
            )
            .expect(
                "the maximized terminal covers the three terminals drawn before",
                matches!((drawn.terminal(&shells.third), union), (Some(after), Some(union)) if same_rect(&after, &union)),
            )
            .expect(
                "typing without a click reached the maximized shell and not the first",
                printed && !elsewhere,
            )
            .observed("before", &before.terminals)?
            .observed("after", &drawn.terminals)?;
        Ok((verdict, Some(before)))
    })?
    else {
        return Ok(());
    };
    cases.check(native, Case::RestoreShortcut, |native| {
        native.press(Key::Char('z').ctrl().shift())?;
        let (layout, drawn) = native.settle(
            "the three terminals drawn where they were before maximize",
            |seen| Some((seen.document.clone(), Drawn::of(seen.frame))),
            |(layout, drawn)| {
                maximized(layout, &fleet).is_none() && same_terminals(drawn, &before_max)
            },
        )?;
        native.type_text("echo BACK-$((6*7))")?;
        native.press(Key::Return)?;
        let printed = shells.terminals[2].printed(native, "BACK-42")?;
        Verdict::new()
            .expect(
                "nothing is saved as maximized, and the tree and shares are unchanged",
                maximized(&layout, &fleet).is_none()
                    && root(&layout, &fleet) == root(&resized, &fleet),
            )
            .expect(
                "all three terminals are drawn where they were before maximize",
                same_terminals(&drawn, &before_max),
            )
            .expect("the third Vessel's shell printed BACK-42", printed)
            .observed("before", &before_max.terminals)?
            .observed("after", &drawn.terminals)
    })?;
    let moved = cases.make(native, Case::MoveVessel, |native| {
        let (_, before) = at_rest(native)?;
        let shares = shares(&before, &fleet);
        let destination = Target::terminal(&shells.first);
        let mut held = native.hold(&Target::name(&vessel(&shells.third)))?;
        held.toward(native.point_in(&destination, 0.1, 0.5)?)?;
        let preview = held.until("the move preview over the first Vessel's left half", |seen| {
            let drawn = Drawn::of(seen.frame);
            let preview = drawn
                .previews
                .iter()
                .find(|(key, _)| key == &shells.first.0)
                .map(|(_, bounds)| *bounds)?;
            let target = drawn.terminal(&shells.first)?;
            (preview.x + preview.width <= target.x + target.width / 2.0 + LOGICAL_TOLERANCE)
                .then_some(preview)
        })?;
        held.release()?;
        let (after, drawn) = native.settle(
            "the third Vessel moved left of the first",
            |seen| Some((seen.document.clone(), Drawn::of(seen.frame))),
            |(layout, _)| root(layout, &fleet) != root(&before, &fleet),
        )?;
        shells.terminals[2].line(native, "echo MOVED-$((6*7))")?;
        let printed = shells.terminals[2].printed(native, "MOVED-42")?;
        let (left, right, under) = (
            drawn.terminal(&shells.third),
            drawn.terminal(&shells.first),
            drawn.terminal(&shells.second),
        );
        let verdict = Verdict::new()
            .expect(
                "the saved tree puts the third Vessel left of the first, above the second, keeping the root share",
                root(&after, &fleet)
                    == Some(branch(
                        Axis::Vertical,
                        shares.0,
                        branch(Axis::Horizontal, EVEN, leaf(&shells.third), leaf(&shells.first)),
                        leaf(&shells.second),
                    )),
            )
            .expect(
                "the Fleet's Vessels, every content and the dock are unchanged",
                vessels_of(&after, &fleet) == vessels_of(&before, &fleet)
                    && after.contents == before.contents
                    && after.context == before.context,
            )
            .expect(
                "the third terminal is drawn left of the first, both above the second",
                matches!((left, right, under), (Some(left), Some(right), Some(under))
                    if left.x + left.width <= right.x + LOGICAL_TOLERANCE
                        && left.y + left.height <= under.y + LOGICAL_TOLERANCE
                        && right.y + right.height <= under.y + LOGICAL_TOLERANCE),
            )
            .expect(
                "the moved Vessel's shell is the same program and printed MOVED-42",
                running(&shells.terminals[2].program(native)?) && printed,
            )
            .observed("preview", preview)?
            .observed("tree", root(&after, &fleet))?;
        Ok((verdict, Some(())))
    })?;
    if moved.is_none() {
        return Ok(());
    }
    cases.check(native, Case::MoveCancelled, |native| {
        shells.terminals[1].line(native, "read -rsn1 k; echo KEY-$k")?;
        let (version, before) = at_rest(native)?;
        let source = Target::name(&vessel(&shells.second));
        let over = Target::terminal(&shells.first);
        let mut held = native.hold(&source)?;
        held.toward(native.point_in(&over, 0.5, 0.5)?)?;
        held.until("the move preview over the first Vessel", |seen| {
            Target::move_preview(&shells.first)
                .find(seen.frame)
                .map(drop)
        })?;
        held.press(Key::Escape)?;
        let escaped = native.observe("the move preview gone after Escape", |seen| {
            Drawn::of(seen.frame).previews.is_empty().then_some(())
        });
        held.release()?;
        let after_escape = unchanged(native, version, &before)?;
        let mut held = native.hold(&source)?;
        held.toward(native.point_in(&over, 0.5, 0.5)?)?;
        held.until("the move preview over the first Vessel", |seen| {
            Target::move_preview(&shells.first)
                .find(seen.frame)
                .map(drop)
        })?;
        held.toward(native.point_in(&Target::terminal(&shells.second), 0.5, 0.5)?)?;
        held.release()?;
        let after_own = unchanged(native, version, &before)?;
        let mut held = native.hold(&source)?;
        held.toward(native.point_in(&over, 0.5, 0.5)?)?;
        held.until("the move preview over the first Vessel", |seen| {
            Target::move_preview(&shells.first)
                .find(seen.frame)
                .map(drop)
        })?;
        held.toward(native.point_in(&Target::SIDEBAR_TOGGLE, 0.5, 0.5)?)?;
        held.release()?;
        let after_outside = unchanged(native, version, &before)?;
        let sidebar = native.observe("the workspace after the drag", |seen| {
            Some(
                seen.frame
                    .elements
                    .iter()
                    .any(|element| element.role == Role::VoyageName),
            )
        })?;
        shells.terminals[1].focus(native)?;
        native.type_text("x")?;
        let key = shells.terminals[1].printed(native, "KEY-x")?;
        Ok(Verdict::new()
            .expect(
                "Escape ended the preview, and nothing was saved",
                escaped.is_ok() && after_escape,
            )
            .expect(
                "a live drag released over the Vessel's own terminal saved nothing",
                after_own,
            )
            .expect(
                "a release outside every Vessel saved nothing and left the sidebar open",
                after_outside && sidebar,
            )
            .expect("Escape did not reach the shell, which then read x", key))
    })?;
    let relaunched = cases.make(native, Case::RelaunchKeepsArrangement, |native| {
        let (version, layout) = at_rest(native)?;
        let before = drawn_now(native)?;
        let core = native.core()?.clone();
        native.close()?;
        native.launch()?;
        let drawn = native.settle(
            "the three terminals drawn after the relaunch",
            |seen| Some(Drawn::of(seen.frame)),
            |drawn| same_terminals(drawn, &before),
        )?;
        let (version_after, layout_after) = at_rest(native)?;
        let same_core = native.core()? == &core;
        let verdict = Verdict::new()
            .expect(
                "the layout document and its version are the same after the relaunch",
                version_after == version && layout_after == layout,
            )
            .expect(
                "every terminal is drawn where it was before the quit",
                same_terminals(&drawn, &before),
            )
            .expect(
                "Core and every shell are the same programs",
                same_core && all_running(native, &shells.terminals)?,
            )
            .observed("before", &before.terminals)?
            .observed("after", &drawn.terminals)?;
        Ok((verdict, Some(())))
    })?;
    if relaunched.is_none() {
        return Ok(());
    }
    cases.check(native, Case::WindowResizeFitsGrid, |native| {
        let shell = &shells.terminals[0];
        let before = grid(native, shell, "GRID-W")?;
        let (width, height) = native.window_size()?;
        let (smaller_width, smaller_height) = (width - 300, height - 200);
        native.resize_window(smaller_width, smaller_height)?;
        native.observe("the workspace drawn at the smaller window size", |seen| {
            Target::terminal(&shells.first).find(seen.frame).map(drop)
        })?;
        let after = grid(native, shell, "GRID-X")?;
        Verdict::new()
            .expect(
                "the first shell's grid lost rows and columns when the window shrank",
                after.rows < before.rows && after.columns < before.columns,
            )
            .expect(
                "the first shell is the same program",
                running(&shell.program(native)?),
            )
            .observed("grid", json!({"before":before,"after":after}))?
            .observed(
                "window",
                json!({"before":[width,height],"after":[smaller_width,smaller_height]}),
            )
    })?;
    cases.check(native, Case::MaximizeShortcutRestoreButton, |native| {
        let (_, layout) = at_rest(native)?;
        let before = drawn_now(native)?;
        shells.terminals[0].focus(native)?;
        native.press(Key::Char('z').ctrl().shift())?;
        let (maximized_layout, alone) = native.settle(
            "only the first Vessel drawn, maximized by the shortcut",
            |seen| Some((seen.document.clone(), Drawn::of(seen.frame))),
            |(layout, drawn)| {
                maximized(layout, &fleet).as_ref() == Some(&shells.first)
                    && drawn.keys() == vec![shells.first.0.clone()]
            },
        )?;
        native.hover(&Target::name(&vessel(&shells.first)))?;
        native.click(&Target::maximize_panel(&shells.first))?;
        let (restored, drawn) = native.settle(
            "every terminal drawn where it was before the shortcut",
            |seen| Some((seen.document.clone(), Drawn::of(seen.frame))),
            |(layout, drawn)| maximized(layout, &fleet).is_none() && same_terminals(drawn, &before),
        )?;
        Verdict::new()
            .expect(
                "Ctrl+Shift+Z in a terminal saved its Vessel as maximized and drew only it",
                maximized(&maximized_layout, &fleet).as_ref() == Some(&shells.first)
                    && alone.keys() == vec![shells.first.0.clone()],
            )
            .expect(
                "the restore button cleared the maximized Vessel and kept the tree",
                maximized(&restored, &fleet).is_none()
                    && root(&restored, &fleet) == root(&layout, &fleet),
            )
            .expect(
                "every terminal is drawn where it was before the shortcut",
                same_terminals(&drawn, &before),
            )
            .observed("before", &before.terminals)?
            .observed("after", &drawn.terminals)
    })?;
    cases.check(native, Case::SplitBelowShortcut, |native| {
        let (_, layout) = at_rest(native)?;
        shells.terminals[1].focus(native)?;
        native.press(Key::Char('e').ctrl().shift())?;
        native.click(&Target::worker("terminal"))?;
        let (after, drawn) = native.settle(
            "a new Vessel's terminal drawn below the second",
            |seen| {
                let born = born(&layout, seen.document, &fleet);
                let drawn = Drawn::of(seen.frame);
                (born.len() == 1 && drawn.terminal(&born[0]).is_some())
                    .then(|| (seen.document.clone(), drawn))
            },
            |_| true,
        )?;
        let born = born(&layout, &after, &fleet);
        let fourth = born.first().cloned().context("No Vessel was created")?;
        let four = Terminal::bind(native, &fourth)?;
        four.line(native, "echo SHORTCUT-$((6*7))")?;
        let printed = four.printed(native, "SHORTCUT-42")?;
        let expected = match root(&layout, &fleet) {
            Some(Split::Branch { axis, share, first, .. }) => Some(Split::Branch {
                axis,
                share,
                first,
                second: Box::new(branch(Axis::Vertical, EVEN, leaf(&shells.second), leaf(&fourth))),
            }),
            _ => None,
        };
        let (upper, lower) = (drawn.terminal(&shells.second), drawn.terminal(&fourth));
        Verdict::new()
            .expect("exactly one Vessel was created", born.len() == 1)
            .expect(
                "the saved tree splits the clicked second Vessel into it above the new one",
                expected.is_some() && root(&after, &fleet) == expected,
            )
            .expect(
                "the new terminal is drawn below the second's and overlaps it across",
                matches!((upper, lower), (Some(upper), Some(lower)) if lower.y >= upper.y + upper.height - LOGICAL_TOLERANCE && overlaps_across(&upper, &lower)),
            )
            .expect("the new Vessel's shell printed SHORTCUT-42", printed)
            .observed("tree", root(&after, &fleet))
    })
}

fn vessel(placement: &PlacementId) -> RenameTarget {
    RenameTarget::Vessel {
        id: placement.clone(),
    }
}

fn leaf(placement: &PlacementId) -> Split {
    Split::Leaf {
        placement: placement.clone(),
    }
}

fn branch(axis: Axis, share: u16, first: Split, second: Split) -> Split {
    Split::Branch {
        axis,
        share: share.try_into().expect("a literal share is within range"),
        first: Box::new(first),
        second: Box::new(second),
    }
}

fn fleet<'a>(layout: &'a Layout, id: &FleetId) -> Option<&'a Fleet> {
    fleets(layout).find(|fleet| &fleet.id == id)
}

fn root(layout: &Layout, id: &FleetId) -> Option<Split> {
    fleet(layout, id).and_then(|fleet| fleet.root.clone())
}

fn maximized(layout: &Layout, id: &FleetId) -> Option<PlacementId> {
    fleet(layout, id).and_then(|fleet| fleet.maximized_placement.clone())
}

fn vessels_of(layout: &Layout, id: &FleetId) -> Vec<PlacementId> {
    fleet(layout, id)
        .map(|fleet| {
            fleet
                .vessels
                .iter()
                .map(|vessel| vessel.id.clone())
                .collect()
        })
        .unwrap_or_default()
}

fn born(before: &Layout, after: &Layout, id: &FleetId) -> Vec<PlacementId> {
    let known = vessels_of(before, id);
    vessels_of(after, id)
        .into_iter()
        .filter(|placement| !known.contains(placement))
        .collect()
}

fn shares(layout: &Layout, id: &FleetId) -> (u16, u16) {
    match root(layout, id) {
        Some(Split::Branch { share, second, .. }) => (u16::from(share), share_of(&second)),
        _ => (0, 0),
    }
}

fn share_of(split: &Split) -> u16 {
    match split {
        Split::Branch { share, .. } => u16::from(*share),
        Split::Leaf { .. } => 0,
    }
}

fn at_rest(native: &Native) -> Result<(u64, Layout)> {
    native.observe("the workspace at rest", |seen| {
        Some((seen.version, seen.document.clone()))
    })
}

fn drawn_now(native: &Native) -> Result<Drawn> {
    native.observe("the workspace drawn", |seen| Some(Drawn::of(seen.frame)))
}

fn shares_settled(
    native: &Native,
    id: &FleetId,
    wanted: impl Fn(u16, u16) -> bool,
) -> Result<(Layout, (u16, u16))> {
    native.settle(
        "the saved split shares after the release",
        |seen| Some((seen.document.clone(), shares(seen.document, id))),
        |(_, (root, nested))| wanted(*root, *nested),
    )
}

fn divider(native: &Native, path: &[&str]) -> Result<String> {
    native.observe("the split divider", |seen| {
        let mut found = seen.frame.elements.iter().filter(|element| {
            element.role == Role::SplitDivider
                && divider_path(&element.key)
                    .is_some_and(|found| found.iter().map(String::as_str).eq(path.iter().copied()))
        });
        let key = found.next()?.key.clone();
        found.next().is_none().then_some(key)
    })
}

fn divider_path(key: &str) -> Option<Vec<String>> {
    let parsed: Value = serde_json::from_str(key).ok()?;
    parsed
        .get(2)?
        .as_array()?
        .iter()
        .map(|step| step.as_str().map(str::to_owned))
        .collect()
}

fn goal(native: &Native, target: &Target, across: f32, down: f32) -> Result<(f32, f32)> {
    native.observe(&target.to_string(), |seen| {
        let bounds = target.find(seen.frame)?.bounds;
        Some((
            bounds.x + bounds.width * across,
            bounds.y + bounds.height * down,
        ))
    })
}

fn near(native: &Native, key: &str, x: Option<f32>, y: Option<f32>) -> Result<bool> {
    let target = Target::split_divider(key);
    let close = |bounds: &Rect| {
        let centre = (
            bounds.x + bounds.width / 2.0,
            bounds.y + bounds.height / 2.0,
        );
        x.is_none_or(|x| (centre.0 - x).abs() <= DIVIDER_TOLERANCE)
            && y.is_none_or(|y| (centre.1 - y).abs() <= DIVIDER_TOLERANCE)
    };
    let bounds = native.settle(
        "the divider at the pointer",
        |seen| target.find(seen.frame).map(|element| element.bounds),
        |bounds| close(bounds),
    )?;
    Ok(close(&bounds))
}

fn unchanged(native: &Native, version: u64, before: &Layout) -> Result<bool> {
    let (version_after, after) = at_rest(native)?;
    let quiet = native.observe("no move preview", |seen| {
        Some(Drawn::of(seen.frame).previews.is_empty())
    })?;
    Ok(version_after == version && &after == before && quiet)
}

fn grid(native: &Native, shell: &Terminal, marker: &str) -> Result<Grid> {
    shell.line(native, &format!("echo {marker}=$(stty size | tr ' ' x)"))?;
    let tag = format!("{marker}=");
    poll(PATIENCE, Duration::from_millis(80), true, || {
        let screen = shell.screen(native)?;
        Ok(screen.lines().rev().find_map(|line| parse_grid(line, &tag)))
    })?
    .with_context(|| format!("{marker} was not printed"))
}

fn parse_grid(line: &str, tag: &str) -> Option<Grid> {
    let rest = line.split(tag).nth(1)?;
    let (rows, columns) = rest.trim().split_once('x')?;
    let digits = |text: &str| {
        text.chars()
            .take_while(char::is_ascii_digit)
            .collect::<String>()
    };
    Some(Grid {
        rows: digits(rows).parse().ok()?,
        columns: digits(columns).parse().ok()?,
    })
}

fn running(program: &Program) -> bool {
    program.same && program.state.as_deref() == Some("live")
}

fn all_running(native: &Native, shells: &[Terminal]) -> Result<bool> {
    Ok(shells
        .iter()
        .map(|shell| shell.program(native))
        .collect::<Result<Vec<_>>>()?
        .iter()
        .all(running))
}

fn overlaps_across(a: &Rect, b: &Rect) -> bool {
    a.x < b.x + b.width && b.x < a.x + a.width
}

fn union(terminals: &[(String, Rect)]) -> Option<Rect> {
    let mut rects = terminals.iter().map(|(_, rect)| *rect);
    let first = rects.next()?;
    Some(rects.fold(first, |all, rect| {
        let x = all.x.min(rect.x);
        let y = all.y.min(rect.y);
        Rect {
            x,
            y,
            width: (all.x + all.width).max(rect.x + rect.width) - x,
            height: (all.y + all.height).max(rect.y + rect.height) - y,
        }
    }))
}

fn same_rect(a: &Rect, b: &Rect) -> bool {
    (a.x - b.x).abs() <= LOGICAL_TOLERANCE
        && (a.y - b.y).abs() <= LOGICAL_TOLERANCE
        && (a.width - b.width).abs() <= LOGICAL_TOLERANCE
        && (a.height - b.height).abs() <= LOGICAL_TOLERANCE
}

fn same_terminals(drawn: &Drawn, before: &Drawn) -> bool {
    drawn.terminals.len() == before.terminals.len()
        && drawn
            .terminals
            .iter()
            .zip(&before.terminals)
            .all(|((key, rect), (was, then))| key == was && same_rect(rect, then))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_printed_grid_is_read_from_the_marker_line_only() {
        assert_eq!(
            parse_grid("GRID-A=44x149", "GRID-A="),
            Some(Grid {
                rows: 44,
                columns: 149
            })
        );
        assert_eq!(
            parse_grid("bash$ echo GRID-A=$(stty size | tr ' ' x)", "GRID-A="),
            None
        );
    }

    #[test]
    fn a_divider_key_gives_its_branch_path() {
        assert_eq!(
            divider_path(r#"["s1",{"kind":"fleet","id":"fleet-4"},["second"]]"#),
            Some(vec!["second".to_owned()])
        );
        assert_eq!(
            divider_path(r#"["s1",{"kind":"fleet"},[]]"#),
            Some(Vec::new())
        );
        assert_eq!(divider_path("not json"), None);
    }
}
