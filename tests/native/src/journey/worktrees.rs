use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Native, Program, Seen, Terminal, voyages};
use crate::sandbox;
use crate::x11::Key;
use anyhow::{Context as _, Result, ensure};
use serde::Serialize;
use serde_json::json;
use std::path::PathBuf;
use std::process::{Command, Output};
use voyager_contract::{Layout, RenameTarget, Voyage, VoyageId};

cases! {
    NewCancel => "new-worktree-escape-cancels",
    NewCreate => "new-worktree-creates-checkout-and-voyage",
    RemoveRefused => "remove-refused-while-shell-runs",
    RemoveAfterExit => "remove-after-shell-exit-keeps-branch",
}

pub const CONTROL: Case = Case::RemoveRefused;

const REPOSITORY: &str = sandbox::SECOND_PROJECT;
const BRANCH: &str = "demo/proof";
const CHECKOUT: &str = ".worktrees/demo-proof";

struct Worktree {
    voyage: VoyageId,
    shell: Terminal,
}

#[derive(PartialEq, Serialize)]
struct Created {
    layout: Layout,
    voyages: Vec<Voyage>,
    drawn: bool,
    dialog: bool,
}

#[derive(PartialEq, Serialize)]
struct Answer {
    reason: Option<String>,
    dialog: bool,
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let first = Terminal::first(native)?;
    repository(native)?;
    let repository = repository_voyage(native, &first)?;
    cases.check(native, Case::NewCancel, |native| {
        let before = at_rest(native)?;
        open(native, &repository, &Target::new_worktree(&repository))?;
        native.press(Key::Escape)?;
        let dialog = native.settle(
            "the New worktree dialog closed",
            |seen| Some(dialog(seen, &repository)),
            |open| !open,
        )?;
        let after = at_rest(native)?;
        let branch = branch_kept()?;
        Verdict::new()
            .expect("Escape closes the New worktree dialog", !dialog)
            .expect(
                "no Voyage was created",
                born(&before, &after).next().is_none(),
            )
            .expect(
                "no checkout folder and no branch were made",
                !checkout().exists() && !branch,
            )
            .observed("dialog", dialog)?
            .observed("branch", branch)
    })?;
    let made = cases.make(native, Case::NewCreate, |native| {
        let before = at_rest(native)?;
        open(native, &repository, &Target::new_worktree(&repository))?;
        native.type_text(BRANCH)?;
        native.press(Key::Return)?;
        let created = native.settle(
            "the worktree's Voyage with its terminal drawn",
            |seen| Some(created(seen, &before, &repository)),
            |created| !created.voyages.is_empty() && created.drawn,
        )?;
        let placement = match &created.voyages[..] {
            [voyage] => voyage
                .fleets
                .first()
                .and_then(|fleet| fleet.placements.first()),
            _ => None,
        };
        let shell = placement
            .map(|placement| Terminal::bind(native, &placement.id))
            .transpose()?;
        let program = shell
            .as_ref()
            .map(|shell| shell.program(native))
            .transpose()?;
        let branch = current_branch()?;
        let wanted = checkout_text()?;
        let in_checkout = created.voyages.iter().all(|voyage| {
            !voyage.closed
                && voyage.cwd.as_deref() == Some(wanted.as_str())
                && created.layout.selected_voyage.as_ref() == Some(&voyage.id)
        });
        let terminal = placement.is_some_and(|placement| {
            created.layout.vessels.iter().any(|vessel| {
                vessel.id == placement.vessel
                    && vessel.type_id == "terminal"
                    && vessel.cwd == wanted
            })
        });
        let verdict = Verdict::new()
            .expect("Enter closes the New worktree dialog", !created.dialog)
            .expect(
                "the checkout folder is made in the repository's .worktrees folder",
                checkout().is_dir(),
            )
            .expect(
                "the checkout is on the new branch demo/proof",
                branch.as_deref() == Some(BRANCH),
            )
            .expect(
                "exactly one Voyage was created, open and selected in the checkout folder",
                created.voyages.len() == 1 && in_checkout,
            )
            .expect(
                "the new Voyage holds one terminal Vessel in the checkout folder",
                created.voyages.iter().all(
                    |voyage| matches!(&voyage.fleets[..], [fleet] if fleet.placements.len() == 1),
                ) && terminal,
            )
            .expect(
                "the Vessel's shell is running and drawn",
                created.drawn && program.as_ref().is_some_and(running),
            )
            .observed("voyages", &created.voyages)?
            .observed("checkout", &wanted)?
            .observed("branch", &branch)?
            .observed("program", &program)?;
        let made = created
            .voyages
            .first()
            .zip(shell)
            .map(|(voyage, shell)| Worktree {
                voyage: voyage.id.clone(),
                shell,
            });
        Ok((verdict, made))
    })?;
    let Some(worktree) = made else {
        return Ok(());
    };
    cases.check(native, Case::RemoveRefused, |native| {
        open(
            native,
            &worktree.voyage,
            &Target::remove_worktree(&worktree.voyage),
        )?;
        native.click(&Target::worktree_confirm(&worktree.voyage))?;
        let answer = native.settle(
            "the removal's answer in the worktree dialog",
            |seen| {
                Some(Answer {
                    reason: seen
                        .label(&Target::worktree_status(&worktree.voyage))
                        .map(str::to_owned),
                    dialog: dialog(seen, &worktree.voyage),
                })
            },
            |answer| answer.reason.is_some() || !answer.dialog,
        )?;
        let program = worktree.shell.program(native)?;
        let layout = at_rest(native)?;
        let wanted = checkout_text()?;
        let branch = branch_kept()?;
        let cancelled = answer.dialog && {
            native.click(&Target::worktree_cancel(&worktree.voyage))?;
            !native.settle(
                "the Remove worktree dialog closed",
                |seen| Some(dialog(seen, &worktree.voyage)),
                |open| !open,
            )?
        };
        Verdict::new()
            .expect(
                "the dialog stays open and says a live process uses the checkout",
                answer.dialog
                    && answer.reason.as_deref().is_some_and(|reason| {
                        reason.contains("live process") && reason.contains(&wanted)
                    }),
            )
            .expect(
                "the worktree's shell is the same running program",
                running(&program),
            )
            .expect(
                "the checkout folder and its branch are kept",
                checkout().is_dir() && branch,
            )
            .expect(
                "the worktree's Voyage stays open",
                is_open(&layout, &worktree.voyage),
            )
            .expect("Cancel closes the dialog", cancelled)
            .observed("answer", &answer)?
            .observed("program", &program)?
            .observed("branch", branch)
    })?;
    cases.check(native, Case::RemoveAfterExit, |native| {
        worktree.shell.line(native, "exit")?;
        worktree.shell.ended(native)?;
        let emptied = native.settle(
            "the exited shell's Vessel closed and no longer drawn",
            |seen| {
                Some(
                    emptied(seen.document, &worktree.voyage)
                        && !seen.shows(&worktree.shell.target()),
                )
            },
            |emptied| *emptied,
        )?;
        open(
            native,
            &worktree.voyage,
            &Target::remove_worktree(&worktree.voyage),
        )?;
        native.click(&Target::worktree_confirm(&worktree.voyage))?;
        let (layout, dialog) = native.settle(
            "the worktree's Voyage closed and the dialog gone",
            |seen| Some((seen.document.clone(), dialog(seen, &worktree.voyage))),
            |(layout, dialog)| !is_open(layout, &worktree.voyage) && !dialog,
        )?;
        let branch = branch_kept()?;
        let program = worktree.shell.program(native)?;
        Verdict::new()
            .expect(
                "the shell's exit closed the worktree Voyage's Vessel and the window stopped drawing it",
                emptied,
            )
            .expect(
                "Remove closes the dialog and the worktree's Voyage",
                !dialog && is_closed(&layout, &worktree.voyage),
            )
            .expect("the checkout folder is gone", !checkout().exists())
            .expect("the branch demo/proof is kept", branch)
            .expect(
                "the repository's Voyage stays open",
                is_open(&layout, &repository),
            )
            .observed("program", &program)?
            .observed("branch", branch)?
            .observed("dialog", dialog)
    })
}

fn repository(native: &Native) -> Result<()> {
    let identity = [
        "-c",
        "user.name=Voyager verification",
        "-c",
        "user.email=verification@example.invalid",
    ];
    for args in [
        &["init", "-q"][..],
        &[
            identity.as_slice(),
            &["commit", "--allow-empty", "-qm", "Initial"],
        ]
        .concat(),
    ] {
        let output = git(REPOSITORY, args)?;
        native.system.record(
            json!({"event":"fixture","git":args,"status":output.status.code(),"stderr":String::from_utf8_lossy(&output.stderr)}),
        )?;
        ensure!(
            output.status.success(),
            "git {} failed in {REPOSITORY}",
            args.join(" ")
        );
    }
    Ok(())
}

fn repository_voyage(native: &mut Native, first: &Terminal) -> Result<VoyageId> {
    let before = at_rest(native)?;
    first.enter(native, REPOSITORY)?;
    native.click(&Target::CREATE_VOYAGE)?;
    native.observe("the repository's Voyage with its terminal drawn", |seen| {
        let voyage = born(&before, seen.document)
            .find(|voyage| voyage.cwd.as_deref() == Some(REPOSITORY))?;
        let placement = voyage.fleets.first()?.placements.first()?;
        seen.shows(&Target::terminal(&placement.id))
            .then(|| voyage.id.clone())
    })
}

fn open(native: &Native, voyage: &VoyageId, entry: &Target) -> Result<()> {
    native.context_click(&Target::name(&RenameTarget::Voyage { id: voyage.clone() }))?;
    native.click(entry)?;
    native.observe("the worktree dialog ready to confirm", |seen| {
        seen.shows(&Target::worktree_confirm(voyage)).then_some(())
    })
}

fn created(seen: &Seen, before: &Layout, repository: &VoyageId) -> Created {
    let voyages: Vec<Voyage> = born(before, seen.document).cloned().collect();
    let drawn = voyages.iter().all(|voyage| {
        voyage
            .fleets
            .iter()
            .flat_map(|fleet| &fleet.placements)
            .all(|placement| seen.shows(&Target::terminal(&placement.id)))
    });
    Created {
        layout: seen.document.clone(),
        voyages,
        drawn,
        dialog: dialog(seen, repository),
    }
}

fn dialog(seen: &Seen, voyage: &VoyageId) -> bool {
    seen.shows(&Target::worktree_cancel(voyage))
}

fn at_rest(native: &Native) -> Result<Layout> {
    native.observe("the workspace at rest", |seen| Some(seen.document.clone()))
}

fn born<'a>(before: &'a Layout, after: &'a Layout) -> impl Iterator<Item = &'a Voyage> {
    voyages(after).filter(|voyage| !voyages(before).any(|known| known.id == voyage.id))
}

fn voyage<'a>(layout: &'a Layout, id: &VoyageId) -> Option<&'a Voyage> {
    voyages(layout).find(|voyage| &voyage.id == id)
}

fn is_open(layout: &Layout, id: &VoyageId) -> bool {
    voyage(layout, id).is_some_and(|voyage| !voyage.closed)
}

fn is_closed(layout: &Layout, id: &VoyageId) -> bool {
    voyage(layout, id).is_some_and(|voyage| voyage.closed)
}

fn emptied(layout: &Layout, id: &VoyageId) -> bool {
    voyage(layout, id)
        .and_then(|voyage| voyage.fleets.first())
        .is_some_and(|fleet| fleet.root.is_none())
}

fn running(program: &Program) -> bool {
    program.same && program.state.as_deref() == Some("live")
}

fn checkout() -> PathBuf {
    PathBuf::from(REPOSITORY).join(CHECKOUT)
}

fn checkout_text() -> Result<String> {
    sandbox::text(&checkout())
}

fn current_branch() -> Result<Option<String>> {
    if !checkout().is_dir() {
        return Ok(None);
    }
    let output = git(&checkout_text()?, &["branch", "--show-current"])?;
    Ok(output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned()))
}

fn branch_kept() -> Result<bool> {
    let reference = format!("refs/heads/{BRANCH}");
    let output = git(
        REPOSITORY,
        &["show-ref", "--verify", "--quiet", reference.as_str()],
    )?;
    Ok(output.status.success())
}

fn git(directory: &str, args: &[&str]) -> Result<Output> {
    Command::new("git")
        .arg("-C")
        .arg(directory)
        .args(args)
        .output()
        .with_context(|| format!("git {} could not run in {directory}", args.join(" ")))
}
