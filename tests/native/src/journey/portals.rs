use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Program, Seen, Terminal, fleets, voyages};
use crate::sandbox;
use crate::x11::Key;
use anyhow::{Context as _, Result};
use serde::Serialize;
use serde_json::json;
use voyager_contract::inspection::{Rect, Role};
use voyager_contract::{
    Context, Fleet, FleetId, Layout, PlacementId, RenameTarget, Split, Voyage, VoyageId,
};

cases! {
    OpenPortal => "open-portal",
    DockPortal => "dock-portal",
    RenamePortal => "rename-portal",
    PortalAcrossFleets => "portal-across-fleets",
    PortalStaysInItsVoyage => "portal-stays-in-its-voyage",
    HidePortals => "hide-portals",
    ShowPortals => "show-portals",
    ClosePortal => "close-portal",
    ReopenPortal => "reopen-portal",
    RelaunchRestoresPortal => "relaunch-restores-portal",
}

pub const CONTROL: Case = Case::PortalAcrossFleets;

const PORTAL_NAME: &str = "Lookout";
const DOCKED_SIZE: f32 = 94.0;
const HIDDEN_SIZE: f32 = 38.0;
const SIZE_TOLERANCE: f32 = 1.0;
const ALIGN_TOLERANCE: f32 = 4.0;

#[derive(Clone, PartialEq, Serialize)]
struct Column {
    visible: bool,
    root: Option<Split>,
    members: Vec<PlacementId>,
}

#[derive(Clone, PartialEq, Serialize)]
struct Drawn {
    name: Option<Rect>,
    label: Option<String>,
    terminal: Option<Rect>,
    area: bool,
    avatar: Option<Rect>,
    toggle: Option<Rect>,
    chooser: bool,
}

impl Drawn {
    fn of(seen: &Seen, portal: &PlacementId, voyage: &VoyageId) -> Self {
        let find = |target: Target| target.find(seen.frame).map(|element| element.bounds);
        let name = Target::name(&RenameTarget::Portal { id: portal.clone() });
        Self {
            name: find(name.clone()),
            label: seen.label(&name).map(str::to_owned),
            terminal: find(Target::terminal(portal)),
            area: seen.shows(&Target::portal_area(voyage)),
            avatar: find(Target::AVATAR),
            toggle: find(Target::toggle_portals(voyage)),
            chooser: seen
                .frame
                .elements
                .iter()
                .any(|element| element.role == Role::CreateWorker),
        }
    }

    fn portal(&self) -> bool {
        self.name.is_some() && self.terminal.is_some()
    }

    fn docked(&self) -> bool {
        let (Some(avatar), Some(name), Some(terminal)) = (self.avatar, self.name, self.terminal)
        else {
            return false;
        };
        let union = Rect {
            x: name.x.min(terminal.x),
            y: name.y.min(terminal.y),
            width: (name.x + name.width).max(terminal.x + terminal.width) - name.x.min(terminal.x),
            height: (name.y + name.height).max(terminal.y + terminal.height)
                - name.y.min(terminal.y),
        };
        let centre = (
            avatar.x + avatar.width / 2.0,
            avatar.y + avatar.height / 2.0,
        );
        (avatar.width - DOCKED_SIZE).abs() <= SIZE_TOLERANCE
            && centre.0 >= union.x
            && centre.0 <= union.x + union.width
            && centre.1 >= union.y
            && centre.1 <= union.y + union.height
    }

    fn beside_toggle(&self) -> bool {
        let (Some(avatar), Some(toggle)) = (self.avatar, self.toggle) else {
            return false;
        };
        (avatar.width - HIDDEN_SIZE).abs() <= SIZE_TOLERANCE
            && avatar.x + avatar.width <= toggle.x + ALIGN_TOLERANCE
            && ((avatar.y + avatar.height / 2.0) - (toggle.y + toggle.height / 2.0)).abs()
                <= ALIGN_TOLERANCE
    }
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let first = Terminal::first(native)?;
    let start = at_rest(native)?.1;
    let home = start
        .selected_voyage
        .clone()
        .context("The fresh workspace selects no Voyage")?;
    let first_fleet = start
        .selected_fleet
        .clone()
        .context("The fresh workspace selects no Fleet")?;
    let Some((portal, shell)) = cases.make(native, Case::OpenPortal, |native| {
        let (_, before) = at_rest(native)?;
        native.click(&Target::toggle_portals(&home))?;
        native.click(&Target::worker("terminal"))?;
        let (after, drawn) = native.settle(
            "a new Portal drawn in the column",
            |seen| {
                let born = born(&before, seen.document, &home);
                let portal = born.first()?.clone();
                let drawn = Drawn::of(seen, &portal, &home);
                drawn.portal().then(|| (seen.document.clone(), drawn))
            },
            |_| true,
        )?;
        let born = born(&before, &after, &home);
        let portal = born.first().cloned().context("No Portal was created")?;
        let shell = Terminal::bind(native, &portal)?;
        shell.line(native, "echo PORTAL-$((6*7))")?;
        let printed = shell.printed(native, "PORTAL-42")?;
        let column = column(&after, &home);
        let verdict = Verdict::new()
            .expect(
                "exactly one placement was created, and it is a Portal of the Voyage",
                born.len() == 1,
            )
            .expect(
                "the Fleet's Vessels and split tree are unchanged",
                fleet(&after, &first_fleet) == fleet(&before, &first_fleet),
            )
            .expect(
                "the column is shown and holds only the new Portal",
                column.as_ref().is_some_and(|column| {
                    column.visible
                        && column.root
                            == Some(Split::Leaf {
                                placement: portal.clone(),
                            })
                }),
            )
            .expect("the Portal's title and terminal are drawn", drawn.portal())
            .expect("the Portal's shell printed PORTAL-42", printed)
            .observed("column", &column)?;
        Ok((verdict, Some((portal, shell))))
    })?
    else {
        return Ok(());
    };
    let scope = Context::Portal { id: portal.clone() };
    let portal_name = Target::name(&RenameTarget::Portal { id: portal.clone() });
    let docked = cases.make(native, Case::DockPortal, |native| {
        native.drag(&Target::AVATAR, &portal_name)?;
        let (context, dock, drawn) = native.settle(
            "the avatar docked on the Portal",
            |seen| {
                Some((
                    seen.document.context.clone(),
                    seen.frame.dock.clone(),
                    Drawn::of(seen, &portal, &home),
                ))
            },
            |(context, dock, drawn)| context == &scope && dock == &scope && drawn.docked(),
        )?;
        let verdict = Verdict::new()
            .expect(
                "the saved context and the drawn dock are the Portal",
                context == scope && dock == scope,
            )
            .expect(
                "the avatar is drawn at full size on the Portal",
                drawn.docked(),
            )
            .observed("avatar", drawn.avatar)?;
        Ok((verdict, Some(())))
    })?;
    if docked.is_none() {
        return Ok(());
    }
    cases.check(native, Case::RenamePortal, |native| {
        let (_, before) = at_rest(native)?;
        native.double_click(&portal_name)?;
        let editor = Target::editor(&RenameTarget::Portal { id: portal.clone() });
        native.observe("the Portal's rename editor", |seen| {
            seen.shows(&editor).then_some(())
        })?;
        native.type_text(PORTAL_NAME)?;
        native.settle(
            "the editor holding the new name",
            |seen| seen.label(&editor).map(str::to_owned),
            |draft| draft == PORTAL_NAME,
        )?;
        native.click(&Target::terminal(&portal))?;
        let (after, drawn) = native.settle(
            "the Portal drawn with its new name",
            |seen| Some((seen.document.clone(), Drawn::of(seen, &portal, &home))),
            |(layout, drawn)| {
                portal_named(layout, &home, &portal) == Some(PORTAL_NAME)
                    && drawn
                        .label
                        .as_deref()
                        .is_some_and(|label| label.ends_with(PORTAL_NAME))
            },
        )?;
        native.type_text("echo RENAMED-$((6*7))")?;
        native.press(Key::Return)?;
        let printed = shell.printed(native, "RENAMED-42")?;
        Verdict::new()
            .expect(
                "the saved Portal name is the typed text",
                portal_named(&after, &home, &portal) == Some(PORTAL_NAME),
            )
            .expect(
                "the Portal's title shows the saved name",
                drawn
                    .label
                    .as_deref()
                    .is_some_and(|label| label.ends_with(PORTAL_NAME)),
            )
            .expect(
                "the Portal's placement and content are unchanged",
                members(&after, &home) == members(&before, &home)
                    && after.contents == before.contents,
            )
            .expect(
                "the click that saved the name gave the Portal's terminal the keyboard",
                printed,
            )
            .observed("label", &drawn.label)
    })?;
    let crossed = cases.make(native, Case::PortalAcrossFleets, |native| {
        let (_, before) = at_rest(native)?;
        native.click(&Target::terminal(&portal))?;
        native.press(Key::Char('t').ctrl().shift())?;
        native.click(&Target::worker("terminal"))?;
        let created = native.settle(
            "a new Fleet selected with its terminal bound",
            |seen| {
                let fresh: Vec<FleetId> = fleets(seen.document)
                    .filter(|fleet| fleets(&before).all(|known| known.id != fleet.id))
                    .map(|fleet| fleet.id.clone())
                    .collect();
                let [made] = fresh.as_slice() else {
                    return None;
                };
                let placed: Vec<_> = fleets(seen.document)
                    .filter(|fleet| &fleet.id == made)
                    .flat_map(|fleet| &fleet.vessels)
                    .map(|vessel| &vessel.content)
                    .collect();
                let bound = !placed.is_empty()
                    && seen.document.contents.iter().all(|content| {
                        !placed.contains(&&content.id)
                            || (content.backend.is_some() && content.start_pending.is_none())
                    });
                bound.then(|| made.clone())
            },
            |_| true,
        )?;
        let mut seen_each = Vec::new();
        for fleet in [&first_fleet, &created, &first_fleet] {
            native.click(&Target::name(&RenameTarget::Fleet { id: fleet.clone() }))?;
            let (layout, drawn) = native.settle(
                "the Fleet selected with the Portal still shown",
                |seen| Some((seen.document.clone(), Drawn::of(seen, &portal, &home))),
                |(layout, drawn)| {
                    layout.selected_fleet.as_ref() == Some(fleet)
                        && column(layout, &home).is_some_and(|column| column.visible)
                        && drawn.terminal.is_some()
                },
            )?;
            seen_each.push(json!({
                "fleet": fleet,
                "selected": layout.selected_fleet == Some(fleet.clone()),
                "shown": column(&layout, &home).is_some_and(|column| column.visible) && drawn.terminal.is_some(),
                "member": members(&layout, &home).contains(&portal),
                "dock": layout.context == scope,
                "same": running(&shell.program(native)?),
            }));
        }
        let held = |key: &str| seen_each.iter().all(|step| step[key] == true);
        let printed = if held("shown") {
            shell.line(native, "echo ACROSS-$((6*7))")?;
            shell.printed(native, "ACROSS-42")?
        } else {
            false
        };
        let verdict = Verdict::new()
            .expect(
                "each Fleet click selected that Fleet",
                held("selected"),
            )
            .expect(
                "the Portal column stays shown on every Fleet",
                held("shown"),
            )
            .expect(
                "the same Portal stays in its Voyage and the dock stays on it",
                held("member") && held("dock"),
            )
            .expect(
                "the Portal's shell is the same program on every Fleet and printed ACROSS-42",
                held("same") && printed,
            )
            .observed("steps", &seen_each)?;
        Ok((verdict, Some(())))
    })?;
    if crossed.is_none() {
        return Ok(());
    }
    cases.check(native, Case::PortalStaysInItsVoyage, |native| {
        shell.enter(native, sandbox::SECOND_PROJECT)?;
        let (_, before) = at_rest(native)?;
        native.click(&Target::CREATE_VOYAGE)?;
        let (away, away_drawn) = native.settle(
            "a new Voyage selected",
            |seen| {
                let fresh = voyages(seen.document)
                    .any(|voyage| voyages(&before).all(|known| known.id != voyage.id));
                let selected_new = seen.document.selected_voyage.as_ref() != Some(&home);
                (fresh && selected_new)
                    .then(|| (seen.document.clone(), Drawn::of(seen, &portal, &home)))
            },
            |(_, drawn)| !drawn.portal() && !drawn.area,
        )?;
        native.click(&Target::GO_THERE)?;
        let (back, back_drawn) = native.settle(
            "the Portal's Voyage selected again with the avatar on the Portal",
            |seen| Some((seen.document.clone(), Drawn::of(seen, &portal, &home))),
            |(layout, drawn)| layout.selected_voyage.as_ref() == Some(&home) && drawn.docked(),
        )?;
        Verdict::new()
            .expect(
                "in the new Voyage the Portal and its column are not drawn",
                !away_drawn.portal() && !away_drawn.area,
            )
            .expect(
                "in the new Voyage the context is still the Portal",
                away.context == scope,
            )
            .expect(
                "Go there selects the Portal's Voyage, draws the Portal and docks the avatar on it",
                back.selected_voyage.as_ref() == Some(&home) && back_drawn.docked(),
            )
            .observed("away", &away_drawn)?
            .observed("back", &back_drawn)
    })?;
    cases.check(native, Case::HidePortals, |native| {
        first.focus(native)?;
        native.press(Key::Char('p').ctrl().alt())?;
        let (layout, drawn) = native.settle(
            "the column hidden with the avatar beside the Portal toggle",
            |seen| Some((seen.document.clone(), Drawn::of(seen, &portal, &home))),
            |(layout, drawn)| {
                column(layout, &home).is_some_and(|column| !column.visible)
                    && !drawn.portal()
                    && drawn.beside_toggle()
            },
        )?;
        Verdict::new()
            .expect(
                "Ctrl+Alt+P in a terminal hid the column and the Portal",
                column(&layout, &home).is_some_and(|column| !column.visible) && !drawn.portal(),
            )
            .expect("the context is still the Portal", layout.context == scope)
            .expect(
                "the avatar is drawn small beside the Portal toggle",
                drawn.beside_toggle(),
            )
            .expect(
                "the Portal's shell is the same program",
                running(&shell.program(native)?),
            )
            .observed("avatar", drawn.avatar)?
            .observed("toggle", drawn.toggle)
    })?;
    cases.check(native, Case::ShowPortals, |native| {
        native.click(&Target::toggle_portals(&home))?;
        let (layout, drawn) = native.settle(
            "the same Portal shown with the avatar on it",
            |seen| Some((seen.document.clone(), Drawn::of(seen, &portal, &home))),
            |(layout, drawn)| {
                column(layout, &home).is_some_and(|column| column.visible) && drawn.docked()
            },
        )?;
        Verdict::new()
            .expect(
                "the column is shown with the same Portal and no chooser",
                column(&layout, &home).is_some_and(|column| column.visible)
                    && drawn.portal()
                    && !drawn.chooser,
            )
            .expect(
                "the avatar is drawn at full size on the Portal again",
                drawn.docked(),
            )
            .observed("avatar", drawn.avatar)
    })?;
    let before_close = at_rest(native)?.1;
    cases.check(native, Case::ClosePortal, |native| {
        native.hover(&portal_name)?;
        native.click(&Target::close_panel(&portal))?;
        let (layout, drawn) = native.settle(
            "the Portal closed and its column hidden",
            |seen| Some((seen.document.clone(), Drawn::of(seen, &portal, &home))),
            |(layout, drawn)| {
                column(layout, &home).is_some_and(|column| !column.visible && column.root.is_none())
                    && !drawn.portal()
            },
        )?;
        Verdict::new()
            .expect(
                "the closed Portal stays in its Voyage with the same content and backend",
                members(&layout, &home).contains(&portal)
                    && layout.contents == before_close.contents,
            )
            .expect(
                "the column is hidden and empty",
                column(&layout, &home)
                    .is_some_and(|column| !column.visible && column.root.is_none()),
            )
            .expect("the Portal's controls are not drawn", !drawn.portal())
            .expect(
                "the Portal's shell is the same program",
                running(&shell.program(native)?),
            )
            .observed("column", column(&layout, &home))
    })?;
    cases.check(native, Case::ReopenPortal, |native| {
        native.click(&Target::toggle_portals(&home))?;
        native.observe("the content chooser", |seen| {
            Drawn::of(seen, &portal, &home).chooser.then_some(())
        })?;
        native.press(Key::Escape)?;
        let (dismissed, _) = native.settle(
            "the chooser dismissed",
            |seen| Some((seen.document.clone(), Drawn::of(seen, &portal, &home))),
            |(_, drawn)| !drawn.chooser,
        )?;
        native.click(&Target::toggle_portals(&home))?;
        native.click(&Target::HIDDEN_PANELS)?;
        native.click(&Target::reopen_panel(&portal))?;
        let (layout, drawn) = native.settle(
            "the same Portal reopened in the column",
            |seen| Some((seen.document.clone(), Drawn::of(seen, &portal, &home))),
            |(layout, drawn)| {
                column(layout, &home).is_some_and(|column| column.visible)
                    && drawn.terminal.is_some()
            },
        )?;
        let kept = shell.screen(native)?.contains("PORTAL-42");
        Verdict::new()
            .expect(
                "Escape on the chooser left the column hidden",
                column(&dismissed, &home).is_some_and(|column| !column.visible),
            )
            .expect(
                "the same Portal is the column's only leaf, with the same content and backend",
                column(&layout, &home).is_some_and(|column| {
                    column.root
                        == Some(Split::Leaf {
                            placement: portal.clone(),
                        })
                }) && layout.contents == before_close.contents,
            )
            .expect(
                "the Portal's shell is the same program and Core still holds PORTAL-42",
                running(&shell.program(native)?) && kept,
            )
            .expect("the Portal's terminal is drawn", drawn.terminal.is_some())
            .observed("column", column(&layout, &home))
    })?;
    cases.check(native, Case::RelaunchRestoresPortal, |native| {
        let (version, layout) = at_rest(native)?;
        let core = native.core()?.clone();
        native.close()?;
        native.launch()?;
        let (after_layout, drawn) = native.settle(
            "the Portal drawn with the avatar on it after the relaunch",
            |seen| Some((seen.document.clone(), Drawn::of(seen, &portal, &home))),
            |(_, drawn)| drawn.docked(),
        )?;
        let (version_after, _) = at_rest(native)?;
        Verdict::new()
            .expect(
                "the layout document and its version are the same after the relaunch",
                version_after == version && after_layout == layout,
            )
            .expect(
                "the column is shown with the Portal and the avatar docked on it",
                column(&after_layout, &home).is_some_and(|column| column.visible) && drawn.docked(),
            )
            .expect(
                "Core and both shells are the same programs",
                native.core()? == &core
                    && running(&shell.program(native)?)
                    && running(&first.program(native)?),
            )
            .observed("drawn", &drawn)
    })
}

fn at_rest(native: &Native) -> Result<(u64, Layout)> {
    native.observe("the workspace at rest", |seen| {
        Some((seen.version, seen.document.clone()))
    })
}

fn voyage<'a>(layout: &'a Layout, id: &VoyageId) -> Option<&'a Voyage> {
    voyages(layout).find(|voyage| &voyage.id == id)
}

fn fleet(layout: &Layout, id: &FleetId) -> Option<Fleet> {
    fleets(layout).find(|fleet| &fleet.id == id).cloned()
}

fn members(layout: &Layout, id: &VoyageId) -> Vec<PlacementId> {
    voyage(layout, id)
        .map(|voyage| {
            voyage
                .portals
                .iter()
                .map(|portal| portal.id.clone())
                .collect()
        })
        .unwrap_or_default()
}

fn born(before: &Layout, after: &Layout, id: &VoyageId) -> Vec<PlacementId> {
    let known = members(before, id);
    members(after, id)
        .into_iter()
        .filter(|placement| !known.contains(placement))
        .collect()
}

fn column(layout: &Layout, id: &VoyageId) -> Option<Column> {
    voyage(layout, id).map(|voyage| {
        let shown = voyage.portal_layout.clone().unwrap_or_default();
        Column {
            visible: shown.visible,
            root: shown.root,
            members: members(layout, id),
        }
    })
}

fn portal_named<'a>(layout: &'a Layout, id: &VoyageId, portal: &PlacementId) -> Option<&'a str> {
    voyage(layout, id)?
        .portals
        .iter()
        .find(|placed| &placed.id == portal)
        .map(|placed| placed.name.as_str())
}

fn running(program: &Program) -> bool {
    program.same && program.state.as_deref() == Some("live")
}
