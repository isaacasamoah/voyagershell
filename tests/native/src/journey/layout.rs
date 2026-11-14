use crate::inspection::Target;
use crate::native::{Native, Seen, vessels};
use anyhow::Result;
use voyager_contract::inspection::{Rect, Role};
use voyager_contract::{Context, Layout, PlacementId, RenameTarget};

pub fn split_right(
    native: &Native,
    before: &Layout,
    vessel: &PlacementId,
) -> Result<(Layout, Rect, Vec<Rect>)> {
    native.hover(&Target::name(&RenameTarget::Vessel { id: vessel.clone() }))?;
    native.click(&Target::split_right(vessel))?;
    native.click(&Target::worker("terminal"))?;
    native.settle(
        "the first Vessel's terminal and a new Vessel's terminal drawn",
        |seen| {
            let born = born(vessels(before), vessels(seen.document), |vessel| &vessel.id);
            let pane = |id: &PlacementId| Some(Target::terminal(id).find(seen.frame)?.bounds);
            let old = pane(vessel)?;
            let new: Vec<Rect> = born
                .iter()
                .map(|vessel| pane(&vessel.id))
                .collect::<Option<_>>()?;
            (!new.is_empty()).then(|| (seen.document.clone(), old, new))
        },
        |(_, old, new)| new.iter().all(|new| right_of(new, old)),
    )
}

pub fn born<'a, T, I: PartialEq + 'a>(
    before: impl Iterator<Item = &'a T>,
    after: impl Iterator<Item = &'a T>,
    id: impl Fn(&T) -> &I,
) -> Vec<&'a T> {
    let known: Vec<&I> = before.map(&id).collect();
    after.filter(|item| !known.contains(&id(item))).collect()
}

pub fn right_of(new: &Rect, old: &Rect) -> bool {
    new.x >= old.x + old.width && new.y < old.y + old.height && old.y < new.y + new.height
}

pub fn avatar_bounds(seen: &Seen) -> Option<Rect> {
    Some(Target::AVATAR.find(seen.frame)?.bounds)
}

pub fn avatar_on_dock(seen: &Seen) -> bool {
    let Context::Vessel { id } = &seen.document.context else {
        return false;
    };
    let Some(avatar) = avatar_bounds(seen) else {
        return false;
    };
    let dock = Target::terminal(id)
        .find(seen.frame)
        .map(|dock| dock.bounds);
    let terminals: Vec<Rect> = seen
        .frame
        .elements
        .iter()
        .filter(|element| element.role == Role::Terminal)
        .map(|element| element.bounds)
        .collect();
    placed_on(&avatar, dock.as_ref(), &terminals)
}

pub fn placed_on(avatar: &Rect, dock: Option<&Rect>, terminals: &[Rect]) -> bool {
    match dock {
        Some(dock) => within(avatar, dock),
        None => terminals.iter().all(|terminal| !overlaps(avatar, terminal)),
    }
}

fn within(inner: &Rect, outer: &Rect) -> bool {
    inner.x >= outer.x
        && inner.y >= outer.y
        && inner.x + inner.width <= outer.x + outer.width
        && inner.y + inner.height <= outer.y + outer.height
}

fn overlaps(a: &Rect, b: &Rect) -> bool {
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

pub fn without_runtime(layout: &Layout) -> Layout {
    let mut layout = layout.clone();
    for content in &mut layout.contents {
        content.backend = None;
        content.launch = None;
        content.start_pending = None;
        content.shell_intent = None;
    }
    layout
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_avatar_is_on_its_dock_only_when_it_is_drawn_there() {
        let rect = |x: f32, y: f32| Rect {
            x,
            y,
            width: 50.0,
            height: 50.0,
        };
        let terminal = Rect {
            x: 100.0,
            y: 100.0,
            width: 500.0,
            height: 500.0,
        };
        let other = Rect {
            x: 700.0,
            y: 100.0,
            width: 500.0,
            height: 500.0,
        };
        let both = [terminal, other];
        assert!(placed_on(&rect(200.0, 200.0), Some(&terminal), &both));
        assert!(
            placed_on(&rect(550.0, 550.0), Some(&terminal), &both),
            "flush with the corner"
        );
        assert!(
            !placed_on(&rect(580.0, 200.0), Some(&terminal), &both),
            "partly outside"
        );
        assert!(
            !placed_on(&rect(800.0, 200.0), Some(&terminal), &both),
            "on another terminal"
        );
        assert!(
            !placed_on(&rect(0.0, 0.0), Some(&terminal), &both),
            "in the sidebar"
        );
        assert!(
            placed_on(&rect(0.0, 0.0), None, &both),
            "slot out of view, dock hidden"
        );
        assert!(
            !placed_on(&rect(580.0, 200.0), None, &both),
            "dock hidden, on a drawn terminal"
        );
        assert!(
            !placed_on(&rect(800.0, 200.0), None, &both),
            "dock hidden, on another terminal"
        );
    }
}
