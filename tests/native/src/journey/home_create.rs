use super::socket_dock::{request_line, send_line, show_fleet, voyager_caller};
use super::{Cases, Verdict, cases};
use crate::core_relay::Fault;
use crate::inspection::Target;
use crate::native::{Native, Terminal, bound_terminal, now_millis};
use anyhow::{Context as _, Result};
use voyager_contract::{
    Action, ContentDestination, Context, PlacementId, PlacementInsertion, PlacementOwner, Side,
    WorkspaceView,
};

cases! {
    CreatedWhilePreparingIsDrawn => "created-while-preparing-is-drawn",
    CreatedDuringAvatarHomeClickIsDrawn => "created-during-avatar-home-click-is-drawn",
}

pub const CONTROL: Case = Case::CreatedWhilePreparingIsDrawn;
pub const HOLD: &str = "arm";

const ATTACH: &str = "terminal.attach";
const HELD_MS: u64 = 1500;

fn home_ids(native: &Native) -> Result<Vec<PlacementId>> {
    let (_, layout) = native.document()?.context("Missing saved layout")?;
    Ok(layout
        .home
        .iter()
        .flat_map(|home| &home.fleets)
        .flat_map(|fleet| fleet.placements.iter().map(|panel| panel.id.clone()))
        .collect())
}

fn create_during(
    native: &mut Native,
    id: &str,
    open: impl FnOnce(&mut Native) -> Result<()>,
) -> Result<Verdict> {
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
    let arm = native
        .system
        .arm_core(ATTACH, Fault::Hold { ms: HELD_MS })?;
    open(native)?;
    let held = native
        .watch(|native| native.system.arm_spent(&arm))?
        .with_context(|| {
            format!(
                "Opening Home never opened a terminal through {ATTACH}, so this case did not reach the state it judges"
            )
        })?;
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
    Verdict::new()
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
        )
        .observed("held", &held)?
        .observed("sentAtMs", sent)?
        .observed("releasedAtMs", released)?
        .observed("added", &added)
}

pub fn drive(native: &mut Native, cases: &mut Cases<Case>) -> Result<()> {
    cases.check(native, Case::CreatedWhilePreparingIsDrawn, |native| {
        create_during(native, "home-create-while-preparing", |native| {
            native.click(&Target::HOME)
        })
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
            create_during(native, "home-create-during-avatar-click", |native| {
                native.click(&Target::AVATAR)
            })
        },
    )
}
