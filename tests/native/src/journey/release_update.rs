use super::daily_start::{climbed, count, holds, runs, selected};
use super::{Cases, Verdict, cases};
use crate::inspection::Target;
use crate::native::{Build, Native, PAST_FIRST_CHECK, Site, Terminal, hold};
use anyhow::Result;
use serde_json::json;

cases! {
    OffersRestart => "offers-restart" setup,
    BadChecksum => "bad-checksum-changes-nothing",
    FailedDownload => "failed-download-changes-nothing",
    Restart => "restart-runs-the-newer-build",
    SourceBuild => "source-build-stages-nothing";
    "source-build-stages-nothing" needs "restart-runs-the-newer-build",
}

pub const CONTROL: Case = Case::Restart;

const RESTART_WORDS: &str = "Restart now, or the new version starts the next time you open VoyagerShell. Your programs keep running.";
const DEFAULT_LATEST: &str =
    "https://github.com/isaacasamoah/voyagershell/releases/latest/download/latest.json";

fn refused_update(
    native: &mut Native,
    terminal: &Terminal,
    served: Site,
    reason: &str,
    said: &'static str,
) -> Result<Verdict> {
    let counted = count(terminal, native)?;
    let links = native.install_links()?;
    let folders = native.install_folders()?;
    let viewer = native.candidate()?.clone();
    let program = terminal.program(native)?;
    let manifest = native.install_publish(served)?;
    let update = native.install_network_update()?;
    let links_after = native.install_links()?;
    let folders_after = native.install_folders()?;
    let same_app = native.candidate().ok() == Some(&viewer) && native.verify().is_ok();
    let program_after = terminal.program(native)?;
    let climbing = climbed(terminal, native, counted)?;
    native.install_publish(Site::Second)?;
    Verdict::new()
        .expect(
            said,
            update.code == Some(1) && update.stderr.contains(reason),
        )
        .expect(
            "current, previous and next are as they were",
            links_after == links,
        )
        .expect(
            "the builds folder holds the same builds and no .part folder",
            folders_after == folders,
        )
        .expect("the running app is the same process", same_app)
        .expect(
            "the first Vessel's terminal runs the same live program, with the same pid",
            program_after.same
                && program_after.pid == program.pid
                && program_after.state.as_deref() == Some("live"),
        )
        .expect(
            "the counter in the first Vessel kept climbing",
            climbing.is_some(),
        )
        .observed("manifest", &manifest)?
        .observed("update", &update)?
        .observed("links", json!({"before":links,"after":links_after}))?
        .observed("folders", json!({"before":folders,"after":folders_after}))?
        .observed("program", json!({"before":program,"after":program_after}))?
        .observed("counter", json!({"before":counted,"after":climbing}))
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    let first = native.install_sha256(Build::First)?;
    let second = native.install_sha256(Build::Second)?;
    let versions = native.install_versions()?;
    let terminal = cases.make(native, Case::OffersRestart, |native| {
        let terminal = Terminal::first(native)?;
        let program = terminal.program(native)?;
        let staged = native.install_staged(&versions.second)?;
        let ready = format!("VoyagerShell {} is ready.", versions.second);
        let offer = native
            .observe("the Restart card", |seen| {
                seen.label(&Target::RESTART_OFFER).map(str::to_owned)
            })
            .ok();
        let buttons = native
            .observe("the Restart and Later buttons", |seen| {
                (seen.shows(&Target::RESTART_NOW) && seen.shows(&Target::RESTART_LATER))
                    .then_some(())
            })
            .is_ok();
        let folders = native.install_folders()?;
        let program_after = terminal.program(native)?;
        let counting = climbed(&terminal, native, Some(0))?;
        let verdict = Verdict::new()
            .expect(
                "the release build staged the newer build as next and left current on itself",
                staged.as_ref().is_some_and(|links| {
                    holds(&links.next, &second)
                        && holds(&links.current, &first)
                        && links.previous.is_none()
                }),
            )
            .expect(
                "the builds folder holds the two builds and no .part folder",
                folders == [versions.first.clone(), versions.second.clone()],
            )
            .expect(
                "the card names the newer version and says programs keep running",
                offer
                    .as_deref()
                    .is_some_and(|text| text.contains(&ready) && text.contains(RESTART_WORDS)),
            )
            .expect("the card offers Restart and Later", buttons)
            .expect(
                "the first Vessel's terminal runs the same live program, with the same pid",
                program_after.same
                    && program_after.pid == program.pid
                    && program_after.state.as_deref() == Some("live"),
            )
            .expect(
                "the counter that the first Vessel's shell starts is printing",
                counting.is_some(),
            )
            .observed("versions", &versions)?
            .observed("links", &staged)?
            .observed("folders", &folders)?
            .observed("offer", &offer)?
            .observed("program", json!({"before":program,"after":program_after}))?;
        Ok((verdict, Some(terminal)))
    })?;
    let Some(terminal) = terminal else {
        return Ok(());
    };
    cases.check(native, Case::BadChecksum, |native| {
        refused_update(
            native,
            &terminal,
            Site::Damaged,
            "The download is damaged",
            "voyager update exited 1 and said the download is damaged",
        )
    })?;
    cases.check(native, Case::FailedDownload, |native| {
        refused_update(
            native,
            &terminal,
            Site::Missing,
            "The download of",
            "voyager update exited 1 and said the download failed",
        )
    })?;
    cases.check(native, Case::Restart, |native| {
        let counted = count(&terminal, native)?;
        let voyage = selected(native)?;
        let roster = native.live_terminals()?;
        let program = terminal.program(native)?;
        let ran = native.install_restart()?;
        let links = native.install_links()?;
        let running = runs(native, &second);
        let voyage_after = selected(native)?;
        let program_after = terminal.program(native)?;
        let roster_after = native.live_terminals()?;
        let climbing = climbed(&terminal, native, counted)?;
        Verdict::new()
            .expect(
                "the counter in the first Vessel kept climbing across the restart",
                climbing.is_some(),
            )
            .expect(
                "Restart ran voyager start once, which exited 0 and launched the newer build and nothing else",
                ran.code == Some(0) && ran.launched_only(&second) && ran.strays.is_empty(),
            )
            .expect(
                "current names the newer build, previous the first, and next is gone",
                holds(&links.current, &second)
                    && holds(&links.previous, &first)
                    && links.next.is_none(),
            )
            .expect("the running app is the newer build", running)
            .expect(
                "the newer build has the same Voyage selected",
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
            .observed("restart", &ran)?
            .observed("links", &links)?
            .observed("voyage", json!({"before":voyage,"after":voyage_after}))?
            .observed("program", json!({"before":program,"after":program_after}))?
            .observed("roster", json!({"before":roster,"after":roster_after}))
    })?;
    cases.check(native, Case::SourceBuild, |native| {
        let manifest = native.install_publish(Site::Ahead)?;
        let interfaces = native.install_interfaces()?;
        let earlier = native.install_requests()?.len();
        let links = native.install_links()?;
        let folders = native.install_folders()?;
        let update = native.install_network_update()?;
        native.close()?;
        native.install_launch(&versions.second)?;
        hold(PAST_FIRST_CHECK)?;
        let offered = native.observe("the source build past the first check", |seen| {
            Some(seen.shows(&Target::RESTART_OFFER))
        })?;
        let requests: Vec<String> = native
            .install_requests()?
            .into_iter()
            .skip(earlier)
            .collect();
        let links_after = native.install_links()?;
        let folders_after = native.install_folders()?;
        Verdict::new()
            .expect(
                "the sandbox has no network but loopback, so no build reaches the real releases address",
                interfaces == ["lo"],
            )
            .expect(
                "the stand-in release site received no request from the source build",
                requests.is_empty(),
            )
            .expect(
                "voyager update from the source build exited 1 and read the default releases address, not the stand-in",
                update.code == Some(1) && update.stderr.contains(DEFAULT_LATEST),
            )
            .expect(
                "the source build staged nothing while a newer release was published",
                links_after == links && links_after.next.is_none(),
            )
            .expect(
                "the builds folder gained no build and no .part folder",
                folders_after == folders,
            )
            .expect(
                "the source build, relaunched past its first check, shows no Restart card",
                !offered,
            )
            .expect("the source build is running", runs(native, &second))
            .observed("manifest", &manifest)?
            .observed("interfaces", &interfaces)?
            .observed("requests", &requests)?
            .observed("update", &update)?
            .observed("waited", PAST_FIRST_CHECK.within().as_secs())?
            .observed("links", json!({"before":links,"after":links_after}))?
            .observed("folders", json!({"before":folders,"after":folders_after}))
    })
}
