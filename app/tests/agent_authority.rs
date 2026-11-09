use voyager_app::coordination::{may_create, may_direct};
use voyager_contract::coordination::{Agent, RunId};
use voyager_contract::{ContentId, FleetId, PlacementId, VoyageId, rank::Rank};

fn agent(id: &str, rank: Rank, supervisor: Option<&str>, fleet: &str) -> Agent {
    Agent {
        id: RunId(id.into()),
        content: ContentId(id.into()),
        placement: PlacementId(id.into()),
        name: id.into(),
        rank,
        voyage: VoyageId("voyage".into()),
        fleet: Some(FleetId(fleet.into())),
        supervisor: supervisor.map(|s| RunId(s.into())),
        live: true,
    }
}

#[test]
fn lower_rank_creation_uses_current_scope_without_requiring_intermediate_ranks() {
    let captain = agent("captain", Rank::Captain, None, "fleet");
    assert!(
        may_create(
            &captain,
            &VoyageId("voyage".into()),
            &FleetId("fleet".into()),
            Rank::Crew
        )
        .is_ok()
    );
    assert!(
        may_create(
            &captain,
            &VoyageId("voyage".into()),
            &FleetId("other".into()),
            Rank::Crew
        )
        .is_err()
    );
    assert!(
        may_create(
            &captain,
            &VoyageId("voyage".into()),
            &FleetId("fleet".into()),
            Rank::Captain
        )
        .is_err()
    );
    let mut admiral = agent("admiral", Rank::Admiral, None, "fleet");
    admiral.fleet = None;
    assert!(
        may_create(
            &admiral,
            &VoyageId("voyage".into()),
            &FleetId("fleet".into()),
            Rank::Commodore
        )
        .is_ok()
    );
    assert!(
        may_create(
            &admiral,
            &VoyageId("other".into()),
            &FleetId("fleet".into()),
            Rank::Crew
        )
        .is_err()
    );
}

#[test]
fn captain_directs_only_assigned_crew_while_upper_ranks_use_their_scope() {
    let captain = agent("captain", Rank::Captain, None, "fleet");
    let crew = agent("crew", Rank::Crew, Some("captain"), "fleet");
    assert!(may_direct(&captain, &crew).is_ok());
    assert!(may_direct(&crew, &captain).is_err());
    let unrelated = agent("unrelated", Rank::Crew, None, "fleet");
    assert!(may_direct(&captain, &unrelated).is_err());
    let commodore = agent("commodore", Rank::Commodore, None, "fleet");
    assert!(may_direct(&commodore, &unrelated).is_ok());
    let other = agent("other", Rank::Crew, None, "other-fleet");
    assert!(may_direct(&commodore, &other).is_err());
    let mut admiral = agent("admiral", Rank::Admiral, None, "fleet");
    admiral.fleet = None;
    assert!(may_direct(&admiral, &other).is_ok());
    assert!(may_direct(&admiral, &commodore).is_ok());
    let mut elsewhere = other;
    elsewhere.voyage = VoyageId("elsewhere".into());
    assert!(may_direct(&admiral, &elsewhere).is_err());
}
