use super::*;
use voyager_contract::coordination::Decision;

fn worker(id: &str, rank: Rank, supervisor: Option<&str>) -> Agent {
    Agent {
        id: RunId(id.into()),
        content: ContentId(id.into()),
        placement: PlacementId(id.into()),
        name: id.into(),
        rank,
        voyage: VoyageId("voyage".into()),
        fleet: (rank != Rank::Admiral).then(|| FleetId("fleet".into())),
        supervisor: supervisor.map(|id| RunId(id.into())),
        live: true,
    }
}

fn participant(id: &str) -> Participant {
    Participant::Agent {
        id: RunId(id.into()),
    }
}

#[test]
fn conversation_remains_open_after_refusal_and_routed_work_keeps_its_source() {
    let mut owner = Owner {
        agents: vec![
            worker("admiral", Rank::Admiral, None),
            worker("commodore", Rank::Commodore, None),
            worker("captain", Rank::Captain, None),
            worker("crew", Rank::Crew, Some("captain")),
        ],
        ..Owner::default()
    };
    let instruction = Operation::Instruct {
        target: RunId("crew".into()),
        task: "Report the fixture result".into(),
    };
    assert!(owner.perform(&participant("crew"), &instruction).is_err());
    assert!(owner.inbox.messages.is_empty());
    owner
        .perform(
            &participant("crew"),
            &Operation::Send {
                to: participant("admiral"),
                text: "Can we compare results?".into(),
            },
        )
        .unwrap();
    assert_eq!(owner.inbox.read(&participant("admiral")).len(), 1);
    owner
        .perform(&participant("admiral"), &instruction)
        .unwrap();
    let message = owner.inbox.messages.back().unwrap().clone();
    assert_eq!(message.to, participant("commodore"));
    assert!(
        owner
            .perform(
                &participant("crew"),
                &Operation::Forward {
                    id: message.id.clone()
                }
            )
            .is_err()
    );
    owner
        .perform(
            &participant("commodore"),
            &Operation::Forward {
                id: message.id.clone(),
            },
        )
        .unwrap();
    assert_eq!(
        owner.inbox.messages.back().unwrap().to,
        participant("captain")
    );
    owner
        .perform(
            &participant("captain"),
            &Operation::Forward {
                id: message.id.clone(),
            },
        )
        .unwrap();
    let delivered = owner.inbox.messages.back().unwrap();
    assert_eq!(delivered.to, participant("crew"));
    assert_eq!(delivered.from, participant("admiral"));
    assert_eq!(delivered.id, message.id);
    assert_eq!(
        delivered.via,
        [RunId("commodore".into()), RunId("captain".into())]
    );
    assert!(!delivered.acknowledged);
}

#[test]
fn escalation_uses_supervisor_or_human_and_answers_only_the_original_live_run() {
    let mut owner = Owner {
        agents: vec![
            worker("captain", Rank::Captain, None),
            worker("crew", Rank::Crew, Some("captain")),
        ],
        ..Owner::default()
    };
    let escalate = Operation::Escalate {
        title: "Use the fixture?".into(),
        context: "The scratch fixture is ready".into(),
        decision: "Approve using it".into(),
        blast_radius: "Only the isolated experiment".into(),
    };
    owner.perform(&participant("crew"), &escalate).unwrap();
    let message = owner.inbox.messages.back().unwrap().clone();
    assert_eq!(message.to, participant("captain"));
    let resolve = Operation::Resolve {
        id: message.id.clone(),
        decision: Decision::Approve,
    };
    assert!(owner.perform(&Participant::User, &resolve).is_err());
    owner.perform(&participant("captain"), &resolve).unwrap();
    assert!(owner.perform(&participant("captain"), &resolve).is_err());
    assert_eq!(owner.agent(&RunId("crew".into())).unwrap().rank, Rank::Crew);
    let reply = owner.inbox.read(&participant("crew"));
    assert!(
        matches!(&reply[0].payload, Payload::Decision { in_reply_to, decision: Decision::Approve } if in_reply_to == &message.id)
    );
    owner.perform(&participant("captain"), &escalate).unwrap();
    let human = owner.inbox.messages.back().unwrap().clone();
    assert_eq!(human.to, Participant::User);
    owner.agents[0].live = false;
    assert!(
        owner
            .perform(
                &Participant::User,
                &Operation::Resolve {
                    id: human.id.clone(),
                    decision: Decision::Deny
                }
            )
            .is_err()
    );
    assert!(
        !owner
            .inbox
            .messages
            .iter()
            .find(|item| item.id == human.id)
            .unwrap()
            .resolved
    );
}
