use serde_json::json;
use voyager_app::{client::Client, core::Core};
use voyager_contract::{Action, Context, Request, Status};

#[test]
fn user_hats_persist_without_changing_context_or_programs_and_refuse_wrong_placement() {
    let promote = |id: &str, rank: &str| {
        serde_json::from_value::<Action>(json!({"operation":"set-agent-rank","id":id,"rank":rank}))
            .unwrap()
    };
    let _ = promote("pending", "captain");
    let session = format!("voyager-rank-hats-{}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    let checked = std::panic::catch_unwind(|| {
        let call = |version, action| {
            client
                .call(Request {
                    request_id: client.request_id(),
                    expected_version: version,
                    action,
                })
                .unwrap()
        };
        let initial = call(0, Action::Inspect);
        let vessel = initial.layout.voyages[0].fleets[0].vessels[0].id.clone();
        let content = initial.layout.contents[0].id.clone();
        let _viewer = client
            .terminal(content.clone(), client.request_id(), initial.version)
            .unwrap();
        let ready = call(0, Action::Inspect);
        let context = ready.layout.context.clone();
        let backend = ready.layout.contents[0].backend.clone();
        let wrong = call(ready.version, promote(&vessel.0, "admiral"));
        assert_eq!(wrong.status, Status::Rejected);
        assert!(wrong.message.as_deref().unwrap().contains("Portal"));
        assert_eq!(wrong.layout, ready.layout);
        assert_eq!(wrong.version, ready.version);
        let mut state = ready.clone();
        for rank in ["captain", "commodore"] {
            state = call(state.version, promote(&vessel.0, rank));
            assert_eq!(state.status, Status::Applied);
            let data = serde_json::to_value(&state.layout).unwrap();
            assert_eq!(data["contents"][0]["rank"], rank);
            assert_eq!(state.layout.context, context);
            assert_eq!(state.layout.contents[0].backend, backend);
        }
        let denied = client
            .scoped_call(
                Context::Workspace,
                Request {
                    request_id: client.request_id(),
                    expected_version: state.version,
                    action: promote(&vessel.0, "crew"),
                },
            )
            .unwrap();
        assert_eq!(denied.status, Status::Rejected);
        assert_eq!(denied.layout, state.layout);
        let voyage = state.layout.voyages[0].id.clone();
        state = call(
            state.version,
            Action::CreateContent {
                type_id: "terminal".into(),
                destination: voyager_contract::ContentDestination::Panel {
                    owner: voyager_contract::PanelOwner::Portals { voyage },
                    insertion: voyager_contract::PanelInsertion::Empty,
                },
                launch: None,
            },
        );
        let portal = state.layout.voyages[0].portals[0].id.clone();
        let unsupported = call(state.version, promote(&portal.0, "captain"));
        assert_eq!(unsupported.status, Status::Rejected);
        assert_eq!(unsupported.layout, state.layout);
        state = call(state.version, promote(&portal.0, "admiral"));
        assert_eq!(state.status, Status::Applied);
        let portal_content = &state.layout.voyages[0].portals[0].content;
        let data = serde_json::to_value(
            state
                .layout
                .contents
                .iter()
                .find(|c| &c.id == portal_content)
                .unwrap(),
        )
        .unwrap();
        assert_eq!(data["rank"], "admiral");
        let reopened = Client::open(session.clone(), "/tmp".into());
        let persisted = reopened
            .call(Request {
                request_id: reopened.request_id(),
                expected_version: 0,
                action: Action::Inspect,
            })
            .unwrap();
        assert_eq!(persisted.layout, state.layout);
        let reset = call(persisted.version, promote(&portal.0, "crew"));
        assert_eq!(reset.status, Status::Applied);
        assert!(
            serde_json::to_value(&reset.layout).unwrap()["contents"]
                .as_array()
                .unwrap()
                .iter()
                .all(|c| c["rank"] != "admiral")
        );
    });
    let mut cleanup = Core::connect(&session).unwrap();
    let stopped = cleanup.server_stop();
    cleanup.close().unwrap();
    drop(client);
    stopped.unwrap();
    checked.unwrap();
}
