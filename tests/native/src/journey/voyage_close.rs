use super::layout::without_runtime;
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Program, Seen, Terminal, voyages};
use crate::sandbox;
use anyhow::{Context as _, Result};
use serde::Serialize;
use serde_json::{Value, json};
use voyager_contract::inspection::Role;
use voyager_contract::{
    ContentId, Fleet, FleetId, Layout, PlacementId, RenameTarget, Voyage, VoyageId,
};

cases! {
    SecondVoyage => "second-voyage",
    CloseAsks => "close-voyage-asks",
    CloseCancel => "close-voyage-cancel",
    CloseConfirm => "close-voyage-confirm",
    ReopenVoyage => "reopen-voyage",
    ClosedAfterRestart => "closed-after-restart",
    ReopenAfterRestart => "reopen-after-restart",
}

pub const CONTROL: Case = Case::CloseConfirm;

struct Second {
    voyage: VoyageId,
    fleet: FleetId,
    placements: Vec<PlacementId>,
    contents: Vec<ContentId>,
    shells: Vec<Terminal>,
}

#[derive(PartialEq, Serialize)]
struct Shown {
    row: bool,
    tab: bool,
    vessels: bool,
    terminals: bool,
    dialog: bool,
    reopen: bool,
}

impl Shown {
    fn whole(&self) -> bool {
        self.row && self.tab && self.vessels && self.terminals
    }

    fn gone(&self) -> bool {
        !self.row && !self.dialog
    }
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let first = Terminal::first(native)?;
    let start = at_rest(native)?;
    let Some(home) = start.selected_voyage.clone() else {
        anyhow::bail!("The fresh workspace selects no Voyage");
    };
    let argv = first.program(native)?.argv;
    let Some(mut second) = cases.make(native, Case::SecondVoyage, |native| {
        first.enter(native, sandbox::SECOND_PROJECT)?;
        native.click(&Target::CREATE_VOYAGE)?;
        let made = native.settle(
            "a new Voyage with its first Vessel's terminal drawn",
            |seen| {
                let voyage = born_voyage(&start, seen.document)?;
                let placement = voyage.fleets.first()?.vessels.first()?.id.clone();
                seen.shows(&Target::terminal(&placement))
                    .then(|| voyage.id.clone())
            },
            |_| true,
        )?;
        let placement = only_vessels(&at_rest(native)?, &made)
            .first()
            .cloned()
            .context("The new Voyage has no Vessel")?;
        let shell = Terminal::bind(native, &placement)?;
        native.hover(&Target::name(&RenameTarget::Vessel {
            id: placement.clone(),
        }))?;
        native.click(&Target::split_right(&placement))?;
        native.click(&Target::worker("terminal"))?;
        let layout = native.settle(
            "both of the new Voyage's terminals drawn and bound",
            |seen| {
                let placements = only_vessels(seen.document, &made);
                let drawn = placements.len() == 2
                    && placements
                        .iter()
                        .all(|placement| seen.shows(&Target::terminal(placement)));
                (drawn && bound(seen.document, &contents_of(seen.document, &made)))
                    .then(|| seen.document.clone())
            },
            |_| true,
        )?;
        let born: Vec<&Voyage> = voyages(&layout)
            .filter(|voyage| !voyages(&start).any(|known| known.id == voyage.id))
            .collect();
        let placements = only_vessels(&layout, &made);
        let other = placements
            .iter()
            .find(|candidate| **candidate != placement)
            .cloned()
            .context("The split made no second Vessel")?;
        let second_shell = Terminal::bind(native, &other)?;
        let programs = [shell.program(native)?, second_shell.program(native)?];
        let fleet = voyage(&layout, &made)
            .and_then(|voyage| voyage.fleets.first())
            .map(|fleet| fleet.id.clone())
            .context("The new Voyage has no Fleet")?;
        let verdict = Verdict::new()
            .expect(
                "exactly one Voyage was created and it is selected",
                born.len() == 1 && layout.selected_voyage.as_ref() == Some(&made),
            )
            .expect(
                "the new Voyage holds one Fleet with two Vessels",
                voyage(&layout, &made).is_some_and(
                    |voyage| matches!(&voyage.fleets[..], [fleet] if fleet.vessels.len() == 2),
                ),
            )
            .expect(
                "both of the new Voyage's shells are running",
                programs.iter().all(running),
            )
            .observed("voyage", &made)?
            .observed("programs", &programs)?;
        Ok((
            verdict,
            Some(Second {
                contents: contents_of(&layout, &made),
                voyage: made,
                fleet,
                placements: vec![placement, other],
                shells: vec![shell, second_shell],
            }),
        ))
    })?
    else {
        return Ok(());
    };
    let before = cases.make(native, Case::CloseAsks, |native| {
        let (version, layout) = rested(native, &second)?;
        open_dialog(native, &second.voyage)?;
        let entries = native.observe("the close dialog's inventory", |seen| Some(entries(seen)))?;
        let (version_after, layout_after) = rested_now(native)?;
        let programs = programs(native, &second.shells)?;
        let mut expected: Vec<String> = second.contents.iter().map(|id| id.0.clone()).collect();
        expected.sort();
        let verdict = Verdict::new()
            .expect(
                "the close dialog lists exactly the Voyage's two programs",
                expected.len() == 2 && entries == expected,
            )
            .expect(
                "nothing is closed or stopped before confirmation",
                version_after == version
                    && !is_closed(&layout_after, &second.voyage)
                    && programs.iter().all(running),
            )
            .observed("entries", &entries)?
            .observed("expected", &expected)?
            .observed("version", json!({"before":version,"after":version_after}))?;
        Ok((verdict, Some((version, layout))))
    })?;
    let Some((version, _)) = before else {
        return Ok(());
    };
    cases.check(native, Case::CloseCancel, |native| {
        native.click(&Target::voyage_close_cancel(&second.voyage))?;
        let shown = native.settle(
            "the dialog closed and the Voyage still drawn",
            |seen| Some(shown(seen, &second)),
            |shown| !shown.dialog && shown.whole(),
        )?;
        let (version_after, layout) = rested_now(native)?;
        let programs = programs(native, &second.shells)?;
        Verdict::new()
            .expect("the dialog closed", !shown.dialog)
            .expect(
                "the Voyage is still open, selected and drawn",
                !is_closed(&layout, &second.voyage)
                    && layout.selected_voyage.as_ref() == Some(&second.voyage)
                    && shown.whole(),
            )
            .expect("the layout version is unchanged", version_after == version)
            .expect(
                "both shells are the same running programs",
                programs.iter().all(running),
            )
            .observed("shown", &shown)?
            .observed("programs", &programs)
    })?;
    let before_close = at_rest(native)?;
    let closed = cases.make(native, Case::CloseConfirm, |native| {
        let (verdict, layout) = close(native, &second, &home, &first, &before_close)?;
        Ok((verdict, Some(layout)))
    })?;
    let Some(closed) = closed else {
        return Ok(());
    };
    let old = backends(&closed, &second.contents);
    cases.check(native, Case::ReopenVoyage, |native| {
        let (layout, shown) = reopen(native, &second, &old)?;
        let fresh = fresh(&layout, &second.contents, &old);
        let (programs, typed) = if fresh {
            second.shells = rebind(native, &second.placements)?;
            (
                programs(native, &second.shells)?,
                type_into(native, &second.shells, "REOPEN")?,
            )
        } else {
            (Vec::new(), false)
        };
        Verdict::new()
            .expect(
                "the Voyage is open and selected again",
                open_and_selected(&layout, &second.voyage),
            )
            .expect(
                "the reopened Voyage has the same Fleets, Vessels and names",
                same_voyage(&layout, &closed, &second.voyage),
            )
            .expect(
                "each Vessel of the reopened Voyage runs a new plain shell",
                fresh && plain(&programs, &argv),
            )
            .expect(
                "the reopened Voyage, its Fleet tab, its Vessels and their terminals are drawn",
                shown.whole(),
            )
            .expect("a reopened shell takes input", typed)
            .expect("Recent voyages no longer offers the Voyage", !shown.reopen)
            .observed("shown", &shown)?
            .observed("oldBackends", &old)?
            .observed("programs", &programs)
    })?;
    let restarted = cases.make(native, Case::ClosedAfterRestart, |native| {
        rested(native, &second)?;
        open_dialog(native, &second.voyage)?;
        native.click(&Target::voyage_close_confirm(&second.voyage))?;
        let layout = native.settle(
            "the Voyage closed a second time",
            |seen| Some(seen.document.clone()),
            |layout| is_closed(layout, &second.voyage),
        )?;
        let closed_again = is_closed(&layout, &second.voyage);
        native.close()?;
        native.stop_core()?;
        native.launch()?;
        let (after, shown) = native.settle(
            "the workspace at rest after the restart",
            |seen| Some((seen.document.clone(), shown(seen, &second))),
            |_| true,
        )?;
        let live = native.live_terminals()?;
        let running: Vec<String> = backends(&after, &second.contents)
            .into_iter()
            .filter(|backend| live.contains(backend))
            .collect();
        let verdict = Verdict::new()
            .expect("the Voyage closed a second time", closed_again)
            .expect(
                "the Voyage is still closed after the restart and is not drawn",
                is_closed(&after, &second.voyage) && !shown.row,
            )
            .expect(
                "none of the closed Voyage's Vessels runs a program after the restart",
                running.is_empty(),
            )
            .expect(
                "the Voyages, Fleets, Vessels and names are unchanged by the restart",
                without_runtime(&after) == without_runtime(&layout),
            )
            .observed("live", &live)?
            .observed("running", &running)?
            .observed("shown", &shown)?;
        Ok((verdict, Some(after)))
    })?;
    let Some(restarted) = restarted else {
        return Ok(());
    };
    let old = backends(&restarted, &second.contents);
    cases.check(native, Case::ReopenAfterRestart, |native| {
        let (layout, shown) = reopen(native, &second, &old)?;
        let fresh = fresh(&layout, &second.contents, &old);
        let live = native.live_terminals()?;
        let on_core = backends(&layout, &second.contents)
            .iter()
            .all(|backend| live.contains(backend));
        let (programs, typed) = if fresh {
            second.shells = rebind(native, &second.placements)?;
            (
                programs(native, &second.shells)?,
                type_into(native, &second.shells, "COLD")?,
            )
        } else {
            (Vec::new(), false)
        };
        Verdict::new()
            .expect(
                "the Voyage is open and selected again",
                open_and_selected(&layout, &second.voyage),
            )
            .expect(
                "each Vessel of the reopened Voyage runs a new plain shell on the new Core",
                fresh && on_core && plain(&programs, &argv),
            )
            .expect("a reopened shell takes input", typed)
            .observed("shown", &shown)?
            .observed("live", &live)?
            .observed("programs", &programs)
    })
}

fn close(
    native: &mut Native,
    second: &Second,
    home: &VoyageId,
    first: &Terminal,
    before: &Layout,
) -> Result<(Verdict, Layout)> {
    open_dialog(native, &second.voyage)?;
    native.click(&Target::voyage_close_confirm(&second.voyage))?;
    let layout = native.settle(
        "the Voyage closed in the layout document",
        |seen| Some(seen.document.clone()),
        |layout| is_closed(layout, &second.voyage),
    )?;
    let shown = native.settle(
        "the closed Voyage and the dialog gone, with Recent voyages offered",
        |seen| Some((shown(seen, second), seen.shows(&Target::RECENT_VOYAGES))),
        |(shown, recent)| shown.gone() && (*recent || shown.reopen),
    )?;
    let programs = programs(native, &second.shells)?;
    let other = first.program(native)?;
    let first_fleet = voyage(&layout, home)
        .and_then(|voyage| voyage.fleets.iter().find(|fleet| !fleet.closed))
        .map(|fleet| fleet.id.clone());
    let verdict = Verdict::new()
        .expect(
            "the Voyage is closed in the layout document",
            is_closed(&layout, &second.voyage),
        )
        .expect(
            "every program of the closed Voyage stopped",
            !programs.is_empty() && programs.iter().all(stopped),
        )
        .expect(
            "the other Voyage's shell is the same running program",
            running(&other),
        )
        .expect(
            "the other Voyage and its first Fleet are selected",
            layout.selected_voyage.as_ref() == Some(home)
                && first_fleet.is_some()
                && layout.selected_fleet == first_fleet,
        )
        .expect(
            "the closed Voyage keeps its Fleets, Vessels and names",
            same_voyage(&layout, before, &second.voyage),
        )
        .expect(
            "the window no longer draws the closed Voyage or the dialog",
            shown.0.gone(),
        )
        .expect("Recent voyages is offered", shown.1 || shown.0.reopen)
        .observed("programs", &programs)?
        .observed("other", &other)?
        .observed("shown", &shown.0)?;
    Ok((verdict, layout))
}

fn reopen(native: &Native, second: &Second, old: &[String]) -> Result<(Layout, Shown)> {
    let entry = Target::reopen_voyage(&second.voyage);
    let offered = native.observe("the workspace with the sidebar drawn", |seen| {
        Some(seen.shows(&entry))
    })?;
    if !offered {
        native.click(&Target::RECENT_VOYAGES)?;
    }
    native.click(&entry)?;
    native.settle(
        "the reopened Voyage drawn with a new terminal in each Vessel",
        |seen| Some((seen.document.clone(), shown(seen, second))),
        |(layout, shown)| {
            open_and_selected(layout, &second.voyage)
                && shown.whole()
                && fresh(layout, &second.contents, old)
        },
    )
}

fn open_dialog(native: &Native, voyage: &VoyageId) -> Result<()> {
    native.context_click(&Target::name(&RenameTarget::Voyage { id: voyage.clone() }))?;
    native.click(&Target::close_voyage(voyage))?;
    native.observe("the close dialog", |seen| {
        seen.shows(&Target::voyage_close_confirm(voyage))
            .then_some(())
    })
}

fn rested(native: &Native, second: &Second) -> Result<(u64, Layout)> {
    native.settle(
        "the second Voyage's programs bound and the workspace at rest",
        |seen| {
            bound(seen.document, &second.contents).then(|| (seen.version, seen.document.clone()))
        },
        |_| true,
    )
}

fn rested_now(native: &Native) -> Result<(u64, Layout)> {
    native.document()?.context("The layout document is missing")
}

fn at_rest(native: &Native) -> Result<Layout> {
    native.observe("the workspace at rest", |seen| Some(seen.document.clone()))
}

fn rebind(native: &mut Native, placements: &[PlacementId]) -> Result<Vec<Terminal>> {
    placements
        .iter()
        .map(|placement| Terminal::bind(native, placement))
        .collect()
}

fn type_into(native: &Native, shells: &[Terminal], word: &str) -> Result<bool> {
    let Some(shell) = shells.first() else {
        return Ok(false);
    };
    shell.line(native, &format!("echo {word}-$((6*7))"))?;
    shell.printed(native, &format!("{word}-42"))
}

fn programs(native: &Native, shells: &[Terminal]) -> Result<Vec<Program>> {
    shells.iter().map(|shell| shell.program(native)).collect()
}

fn running(program: &Program) -> bool {
    program.same && program.state.as_deref() == Some("live")
}

fn stopped(program: &Program) -> bool {
    !program.same && program.state.as_deref() == Some("finished")
}

fn plain(programs: &[Program], argv: &Value) -> bool {
    !programs.is_empty()
        && programs
            .iter()
            .all(|program| running(program) && &program.argv == argv)
}

fn entries(seen: &Seen) -> Vec<String> {
    let mut keys: Vec<String> = seen
        .frame
        .elements
        .iter()
        .filter(|element| element.role == Role::VoyageCloseEntry)
        .map(|element| element.key.clone())
        .collect();
    keys.sort();
    keys
}

fn shown(seen: &Seen, second: &Second) -> Shown {
    let id = &second.voyage;
    Shown {
        row: seen.shows(&Target::name(&RenameTarget::Voyage { id: id.clone() })),
        tab: seen.shows(&Target::name(&RenameTarget::Fleet {
            id: second.fleet.clone(),
        })),
        vessels: second.placements.iter().all(|placement| {
            seen.shows(&Target::name(&RenameTarget::Vessel {
                id: placement.clone(),
            }))
        }),
        terminals: second
            .placements
            .iter()
            .all(|placement| seen.shows(&Target::terminal(placement))),
        dialog: seen.shows(&Target::voyage_close_confirm(id))
            || seen.shows(&Target::voyage_close_cancel(id)),
        reopen: seen.shows(&Target::reopen_voyage(id)),
    }
}

fn voyage<'a>(layout: &'a Layout, id: &VoyageId) -> Option<&'a Voyage> {
    voyages(layout).find(|voyage| &voyage.id == id)
}

fn born_voyage<'a>(before: &Layout, after: &'a Layout) -> Option<&'a Voyage> {
    voyages(after).find(|voyage| !voyages(before).any(|known| known.id == voyage.id))
}

fn only_vessels(layout: &Layout, id: &VoyageId) -> Vec<PlacementId> {
    voyage(layout, id)
        .into_iter()
        .flat_map(|voyage| &voyage.fleets)
        .flat_map(|fleet: &Fleet| &fleet.vessels)
        .map(|vessel| vessel.id.clone())
        .collect()
}

fn contents_of(layout: &Layout, id: &VoyageId) -> Vec<ContentId> {
    voyage(layout, id)
        .into_iter()
        .flat_map(|voyage| &voyage.fleets)
        .flat_map(|fleet| &fleet.vessels)
        .map(|vessel| vessel.content.clone())
        .collect()
}

fn bound(layout: &Layout, contents: &[ContentId]) -> bool {
    !contents.is_empty()
        && contents.iter().all(|id| {
            layout.contents.iter().any(|content| {
                &content.id == id
                    && content.backend.is_some()
                    && content.start_pending.is_none()
                    && content.shell_intent.is_none()
            })
        })
}

fn backends(layout: &Layout, contents: &[ContentId]) -> Vec<String> {
    layout
        .contents
        .iter()
        .filter(|content| contents.contains(&content.id))
        .filter_map(|content| content.backend.as_ref())
        .map(|backend| backend.0.clone())
        .collect()
}

fn fresh(layout: &Layout, contents: &[ContentId], old: &[String]) -> bool {
    bound(layout, contents)
        && backends(layout, contents)
            .iter()
            .all(|backend| !old.contains(backend))
}

fn is_closed(layout: &Layout, id: &VoyageId) -> bool {
    voyage(layout, id).is_some_and(|voyage| voyage.closed)
}

fn open_and_selected(layout: &Layout, id: &VoyageId) -> bool {
    !is_closed(layout, id) && layout.selected_voyage.as_ref() == Some(id)
}

fn same_voyage(layout: &Layout, before: &Layout, id: &VoyageId) -> bool {
    let shape = |layout: &Layout| {
        voyage(layout, id).map(|voyage| {
            (
                voyage.name.clone(),
                voyage
                    .fleets
                    .iter()
                    .map(|fleet| {
                        (
                            fleet.id.clone(),
                            fleet.name.clone(),
                            fleet
                                .vessels
                                .iter()
                                .map(|vessel| (vessel.id.clone(), vessel.name.clone()))
                                .collect::<Vec<_>>(),
                        )
                    })
                    .collect::<Vec<_>>(),
            )
        })
    };
    shape(layout).is_some() && shape(layout) == shape(before)
}
