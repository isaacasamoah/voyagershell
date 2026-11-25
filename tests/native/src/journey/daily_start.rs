use super::{Cases, Verdict, cases};
use crate::native::{Build, Linked, Native, STAND_IN_LINE, Terminal};
use anyhow::{Context as _, Result, ensure};
use serde::Serialize;
use serde_json::{Value, json};
use std::fs;
use voyager_contract::layout_document::DOCUMENT;

cases! {
    StartsInstalledBuild => "starts-installed-build" setup,
    UpdateAndRestart => "update-and-restart-keeps-programs",
    SecondStartFocuses => "second-start-focuses",
    FailedBuildReturns => "failed-build-returns",
    Rollback => "rollback-runs-the-previous-build",
}

pub const CONTROL: Case = Case::FailedBuildReturns;

#[derive(Clone, Debug, PartialEq, Serialize)]
struct Quiet {
    terminals: Vec<Value>,
    layout: Value,
}

fn holds(linked: &Option<Linked>, sha256: &str) -> bool {
    linked
        .as_ref()
        .is_some_and(|linked| linked.sha256.as_deref() == Some(sha256))
}

fn runs(native: &Native, sha256: &str) -> bool {
    native.running() && native.candidate.sha256 == sha256
}

fn selected(native: &Native) -> Result<Option<String>> {
    Ok(native
        .document()?
        .and_then(|(_, layout)| layout.selected_voyage)
        .map(|voyage| voyage.0))
}

fn count(terminal: &Terminal, native: &Native) -> Result<Option<u64>> {
    Ok(terminal
        .screen(native)?
        .lines()
        .filter_map(|line| line.trim().strip_prefix("count ")?.parse().ok())
        .max())
}

fn climbed(terminal: &Terminal, native: &Native, from: Option<u64>) -> Result<Option<u64>> {
    let Some(from) = from else {
        return Ok(None);
    };
    native.watch(|native| Ok(count(terminal, native)?.filter(|now| *now >= from + 2)))
}

fn quiet(native: &Native) -> Result<Quiet> {
    let listed = native.system.watch("terminal.list", json!({"all":true}))?;
    let mut terminals: Vec<Value> = listed["terminals"]
        .as_array()
        .context("Core listed no terminals")?
        .iter()
        .map(|terminal| {
            json!({"address":terminal["address"],"state":terminal["state"],"pid":terminal["pid"]})
        })
        .collect();
    terminals.sort_by_key(|terminal| terminal["address"].to_string());
    let layout = native.system.watch("doc.get", json!({"name":DOCUMENT}))?;
    Ok(Quiet {
        terminals,
        layout: json!({"version":layout["version"],"value":layout["value"]}),
    })
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let first = native.install_sha256(Build::First)?;
    let second = native.install_sha256(Build::Second)?;
    let terminal = cases.make(native, Case::StartsInstalledBuild, |native| {
        let ran = native.install_start()?;
        let links = native.install_links()?;
        let running = runs(native, &first);
        let shown = running && native.verify().is_ok();
        let terminal = if running {
            Some(Terminal::first(native)?)
        } else {
            None
        };
        let program = terminal
            .as_ref()
            .map(|terminal| terminal.program(native))
            .transpose()?;
        let counting = match &terminal {
            Some(terminal) => climbed(terminal, native, Some(0))?,
            None => None,
        };
        let verdict = Verdict::new()
            .expect("voyager start exited 0", ran.code == Some(0))
            .expect(
                "voyager start launched the installed build and nothing else",
                ran.launched_only(&first),
            )
            .expect(
                "current names the installed build, and no previous or next build is set",
                holds(&links.current, &first) && links.previous.is_none() && links.next.is_none(),
            )
            .expect("the running app is the installed build", running)
            .expect("the app's window is shown with the session's title", shown)
            .expect(
                "the program in the first Vessel is live under Core",
                program.as_ref().is_some_and(|program| {
                    program.same && program.state.as_deref() == Some("live")
                }),
            )
            .expect(
                "the counter that the first Vessel's shell starts is printing",
                counting.is_some(),
            )
            .observed("start", &ran)?
            .observed("links", &links)?
            .observed("program", &program)?
            .observed("counter", counting)?;
        Ok((verdict, terminal))
    })?;
    let Some(terminal) = terminal else {
        return Ok(());
    };
    cases.check(native, Case::UpdateAndRestart, |native| {
        let counted = count(&terminal, native)?;
        let voyage = selected(native)?;
        let roster = native.live_terminals()?;
        let program = terminal.program(native)?;
        let update = native.install_update(Build::Second)?;
        let staged = native.install_links()?;
        native.close()?;
        let ran = native.install_start()?;
        let links = native.install_links()?;
        let running = runs(native, &second);
        let voyage_after = selected(native)?;
        let program_after = terminal.program(native)?;
        let roster_after = native.live_terminals()?;
        let climbing = climbed(&terminal, native, counted)?;
        Verdict::new()
            .expect(
                "the counter in the first Vessel kept climbing across the switch",
                climbing.is_some(),
            )
            .expect(
                "voyager update --from exited 0 and staged the second build as next",
                update.code == Some(0) && holds(&staged.next, &second),
            )
            .expect(
                "voyager start exited 0 and launched the second build and nothing else",
                ran.code == Some(0) && ran.launched_only(&second),
            )
            .expect(
                "current names the second build, previous the first, and next is gone",
                holds(&links.current, &second)
                    && holds(&links.previous, &first)
                    && links.next.is_none(),
            )
            .expect("the running app is the second build", running)
            .expect(
                "the second build has the same Voyage selected",
                voyage.is_some() && voyage == voyage_after,
            )
            .expect(
                "the first Vessel's terminal runs the same live program, with the same pid",
                program_after.same
                    && program_after.pid == program.pid
                    && program_after.state.as_deref() == Some("live"),
            )
            .expect("Core lists the same live terminals", roster_after == roster)
            .observed("counter", json!({"before":counted,"after":climbing}))?
            .observed("update", &update)?
            .observed("start", &ran)?
            .observed("links", json!({"staged":staged,"after":links}))?
            .observed("voyage", json!({"before":voyage,"after":voyage_after}))?
            .observed("program", json!({"before":program,"after":program_after}))?
            .observed("roster", json!({"before":roster,"after":roster_after}))
    })?;
    cases.check(native, Case::SecondStartFocuses, |native| {
        let counted = count(&terminal, native)?;
        let viewer = native.candidate()?.clone();
        let (ran, activations) = native.activated_by(|native| native.install_start())?;
        let same = native.candidate().ok() == Some(&viewer) && native.verify().is_ok();
        let climbing = climbed(&terminal, native, counted)?;
        Verdict::new()
            .expect(
                "the counter in the first Vessel kept climbing across the second start",
                climbing.is_some(),
            )
            .expect("the second voyager start exited 0", ran.code == Some(0))
            .expect("it launched no build", ran.launched.is_empty())
            .expect(
                "no second app process runs from the install",
                ran.strays.is_empty(),
            )
            .expect(
                "the app that was running is the same process with the same window",
                same,
            )
            .expect(
                "the running app asked to activate its window",
                !activations.is_empty(),
            )
            .observed("counter", json!({"before":counted,"after":climbing}))?
            .observed("start", &ran)?
            .observed("activations", &activations)
    })?;
    cases.check(native, Case::FailedBuildReturns, |native| {
        let counted = count(&terminal, native)?;
        native.close()?;
        let update = native.install_update(Build::StandIn)?;
        let stand_in = native.install_sha256(Build::StandIn)?;
        let staged = native.install_links()?;
        let back = staged
            .current
            .as_ref()
            .and_then(|linked| linked.sha256.clone())
            .context("No current build to return to before the failed start")?;
        let before = quiet(native)?;
        let (ran, seen) = native.install_start_watching(quiet)?;
        ensure!(
            !seen.is_empty(),
            "The verifier read Core no time before the previous build was ready"
        );
        let changed: Vec<&Quiet> = seen.iter().filter(|seen| **seen != before).collect();
        let links = native.install_links()?;
        let log = ran.log_of(&stand_in);
        let reported = log.is_some_and(|log| {
            ran.stdout.contains(&log.display().to_string())
                && fs::read_to_string(log).is_ok_and(|text| text.contains(STAND_IN_LINE))
        });
        let climbing = climbed(&terminal, native, counted)?;
        Verdict::new()
            .expect(
                "the counter in the first Vessel kept climbing across the switch",
                climbing.is_some(),
            )
            .expect(
                "voyager update --from exited 0 and staged the stand-in as next",
                update.code == Some(0) && holds(&staged.next, &stand_in),
            )
            .expect("voyager start exited 0", ran.code == Some(0))
            .expect(
                "start launched the stand-in, then the build that was current before",
                ran.launched.len() == 2
                    && ran.log_of(&stand_in).is_some()
                    && ran.log_of(&back).is_some(),
            )
            .expect(
                "current names the build that was current before, and next is gone",
                holds(&links.current, &back) && links.next.is_none(),
            )
            .expect(
                "start printed the stand-in's log, which holds the stand-in's output",
                reported,
            )
            .expect("the running app is the build that was current before", runs(native, &back))
            .expect(
                "Core's terminals and the layout document did not change before the previous build was ready",
                changed.is_empty(),
            )
            .observed("counter", json!({"before":counted,"after":climbing}))?
            .observed("update", &update)?
            .observed("start", &ran)?
            .observed("links", json!({"staged":staged,"after":links}))?
            .observed("before", &before)?
            .observed("reads", seen.len())?
            .observed("changed", &changed)
    })?;
    cases.check(native, Case::Rollback, |native| {
        let counted = count(&terminal, native)?;
        let voyage = selected(native)?;
        let roster = native.live_terminals()?;
        let program = terminal.program(native)?;
        let rollback = native.install_rollback()?;
        let staged = native.install_links()?;
        native.close()?;
        let ran = native.install_start()?;
        let links = native.install_links()?;
        let voyage_after = selected(native)?;
        let program_after = terminal.program(native)?;
        let roster_after = native.live_terminals()?;
        let climbing = climbed(&terminal, native, counted)?;
        Verdict::new()
            .expect(
                "the counter in the first Vessel kept climbing across the switch",
                climbing.is_some(),
            )
            .expect(
                "voyager rollback exited 0 and staged the first build as next",
                rollback.code == Some(0) && holds(&staged.next, &first),
            )
            .expect(
                "voyager start exited 0 and launched the first build and nothing else",
                ran.code == Some(0) && ran.launched_only(&first),
            )
            .expect(
                "current names the first build, previous the second, and next is gone",
                holds(&links.current, &first)
                    && holds(&links.previous, &second)
                    && links.next.is_none(),
            )
            .expect("the running app is the first build", runs(native, &first))
            .expect(
                "the first build has the same Voyage selected",
                voyage.is_some() && voyage == voyage_after,
            )
            .expect(
                "the first Vessel's terminal runs the same live program, with the same pid",
                program_after.same
                    && program_after.pid == program.pid
                    && program_after.state.as_deref() == Some("live"),
            )
            .expect("Core lists the same live terminals", roster_after == roster)
            .observed("counter", json!({"before":counted,"after":climbing}))?
            .observed("rollback", &rollback)?
            .observed("start", &ran)?
            .observed("links", json!({"staged":staged,"after":links}))?
            .observed("voyage", json!({"before":voyage,"after":voyage_after}))?
            .observed("program", json!({"before":program,"after":program_after}))?
            .observed("roster", json!({"before":roster,"after":roster_after}))
    })
}
