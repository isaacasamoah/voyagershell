use super::socket_dock::{render_error, request_line, send_line, show_fleet, voyager_caller};
use super::{Cases, Verdict, cases};
use crate::core_relay::Fault;
use crate::inspection::Target;
use crate::native::{Native, STATUS_AFTER_CLICK, Terminal, bound_terminal, now_millis};
use anyhow::{Context as _, Result};
use voyager_contract::{
    Action, ContentDestination, Context, PlacementId, PlacementInsertion, PlacementOwner, Side,
    WorkspaceView,
};

cases! {
    CreatedWhilePreparingIsDrawn => "created-while-preparing-is-drawn",
    HomeClickThenCreateDrawsTheVessel => "created-right-after-a-home-click-is-drawn",
    CreatedDuringAvatarHomeClickIsDrawn => "created-during-avatar-home-click-is-drawn",
}

pub const CONTROL: Case = Case::CreatedWhilePreparingIsDrawn;
pub const HOLD: &str = "arm";

const ATTACH: &str = "terminal.attach";
const HELD_MS: u64 = 1500;

#[derive(Debug, PartialEq)]
enum Reading {
    Product,
    Fixture,
}

struct Evidence {
    ready: bool,
    drawn: bool,
}

fn reading(evidence: &Evidence) -> Reading {
    if evidence.ready && evidence.drawn {
        Reading::Product
    } else {
        Reading::Fixture
    }
}

fn home_ids(native: &Native) -> Result<Vec<PlacementId>> {
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    Ok(layout
        .home
        .iter()
        .flat_map(|home| &home.fleets)
        .flat_map(|fleet| fleet.placements.iter().map(|panel| panel.id.clone()))
        .collect())
}

fn home_request(native: &mut Native, id: &str) -> Result<(String, String, Vec<PlacementId>)> {
    Terminal::first(native)?;
    let voyager = bound_terminal(native).context("voyager.json names no terminal")?;
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    let fleet = layout
        .home
        .as_ref()
        .and_then(|home| home.fleets.first())
        .context("The layout has no Home Fleet")?;
    let agents = fleet
        .placements
        .first()
        .context("The Home Fleet has no placement")?
        .id
        .clone();
    let caller = voyager_caller(&voyager);
    let request = request_line(
        native,
        &caller,
        id,
        Action::CreateVessel {
            type_id: "terminal".into(),
            destination: ContentDestination::Placement {
                owner: PlacementOwner::Fleet {
                    id: fleet.id.clone(),
                },
                insertion: PlacementInsertion::Beside {
                    id: agents,
                    side: Side::Right,
                },
            },
            launch: None,
        },
    )?;
    let before = home_ids(native)?;
    Ok((caller, request, before))
}

fn create_during(
    native: &mut Native,
    id: &str,
    status_after_open: bool,
    open: impl FnOnce(&mut Native) -> Result<()>,
) -> Result<Verdict> {
    let (caller, request, before) = home_request(native, id)?;
    let arm = native
        .system
        .arm_core(ATTACH, Fault::Hold { ms: HELD_MS })?;
    let ready = native
        .observe("the app prepared before the click", |_| Some(()))
        .is_ok();
    open(native)?;
    let status = if status_after_open {
        Some(native.drawn_labels(&Target::STATUS, STATUS_AFTER_CLICK)?)
    } else {
        None
    };
    let Some(held) = native.watch(|native| native.system.arm_spent(&arm))? else {
        let homes = home_ids(native)?;
        let drawn = native
            .observe("the Home view drawn after the click", |seen| {
                (seen.document.view == WorkspaceView::Home
                    && homes.iter().any(|id| seen.shows(&Target::split_right(id))))
                .then_some(())
            })
            .is_ok();
        let evidence = Evidence { ready, drawn };
        anyhow::ensure!(
            reading(&evidence) == Reading::Product,
            "Opening Home never opened a terminal through {ATTACH}, so this case did not reach the state it judges"
        );
        return Verdict::new()
            .expect(
                "a click on the avatar that the app accepted and drew, with the app prepared before it, opened the Home Vessels through terminal.attach",
                false,
            )
            .observed("preparedBeforeTheClick", ready)?
            .observed("homeDrawnAfterTheClick", drawn);
    };
    let sent = now_millis();
    let created = send_line(native, &caller, &request)?;
    let added = native
        .observe(
            "the Vessel created during the Home preparation drawn",
            |seen| {
                let fresh = seen
                    .document
                    .home
                    .iter()
                    .flat_map(|home| &home.fleets)
                    .flat_map(|fleet| &fleet.placements)
                    .map(|panel| &panel.id)
                    .find(|id| !before.contains(id))?;
                (seen.document.view == WorkspaceView::Home && seen.shows(&Target::terminal(fresh)))
                    .then(|| fresh.clone())
            },
        )
        .ok();
    let released = native.watch(|native| {
        let ledger =
            std::fs::read_to_string(native.system.evidence.join(crate::core_relay::LEDGER))
                .unwrap_or_default();
        Ok(ledger
            .lines()
            .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
            .find(|line| line["arm"].as_u64() == Some(arm.id) && line["event"] == "released")
            .and_then(|line| line["releasedAtMs"].as_u64()))
    })?;
    let verdict = Verdict::new()
        .expect(
            "the create was sent while the Home preparation's terminal attach was held",
            released.is_some_and(|at| at > sent),
        )
        .expect(
            "voyager do workspace applied the create-vessel from Voyager's terminal",
            created["reply"]["status"] == "applied",
        )
        .expect(
            "the Vessel created during the Home preparation is drawn with its terminal",
            added.is_some(),
        );
    let verdict = match &status {
        Some(labels) => verdict
            .expect(
                "the click left no render error in the status line",
                !render_error(labels),
            )
            .observed("statusLabels", labels)?,
        None => verdict,
    };
    verdict
        .observed("held", &held)?
        .observed("sentAtMs", sent)?
        .observed("releasedAtMs", released)?
        .observed("added", &added)
}

fn create_at_once(native: &mut Native, id: &str) -> Result<Verdict> {
    let (caller, request, before) = home_request(native, id)?;
    native.click(&Target::HOME)?;
    let created = send_line(native, &caller, &request)?;
    let added = native
        .observe(
            "the Vessel created right after the click on Home drawn",
            |seen| {
                let fresh = seen
                    .document
                    .home
                    .iter()
                    .flat_map(|home| &home.fleets)
                    .flat_map(|fleet| &fleet.placements)
                    .map(|panel| &panel.id)
                    .find(|id| !before.contains(id))?;
                (seen.document.view == WorkspaceView::Home && seen.shows(&Target::terminal(fresh)))
                    .then(|| fresh.clone())
            },
        )
        .ok();
    Verdict::new()
        .expect(
            "voyager do workspace applied the create-vessel from Voyager's terminal",
            created["reply"]["status"] == "applied",
        )
        .expect(
            "the Vessel created right after a click on Home from a Fleet view is drawn with its terminal",
            added.is_some(),
        )
        .observed("added", &added)
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    cases.check(native, Case::CreatedWhilePreparingIsDrawn, |native| {
        create_during(native, "home-create-while-preparing", false, |native| {
            native.click(&Target::HOME)
        })
    })?;
    cases.check(native, Case::HomeClickThenCreateDrawsTheVessel, |native| {
        show_fleet(native)?;
        create_at_once(native, "home-create-at-once")
    })?;
    cases.check(
        native,
        Case::CreatedDuringAvatarHomeClickIsDrawn,
        |native| {
            if native
                .document()?
                .context("Missing saved layout")?
                .1
                .context
                != Context::Workspace
            {
                native.drag(&Target::AVATAR, &Target::WORKSPACE_DOCK)?;
            }
            show_fleet(native)?;
            native.close()?;
            native.launch()?;
            create_during(native, "home-create-during-avatar-click", true, |native| {
                native.click(&Target::AVATAR)
            })
        },
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_click_the_app_took_after_it_was_ready_that_opens_no_terminal_is_the_product() {
        assert_eq!(
            reading(&Evidence {
                ready: true,
                drawn: true
            }),
            Reading::Product
        );
    }

    #[test]
    fn a_click_the_app_never_took_or_took_before_it_was_ready_blames_the_fixture() {
        for (ready, drawn) in [(true, false), (false, true), (false, false)] {
            assert_eq!(reading(&Evidence { ready, drawn }), Reading::Fixture);
        }
    }
}
