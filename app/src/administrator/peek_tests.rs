use super::tests::completed;
use super::*;
use voyager_contract::{Action, Context, Response};

#[test]
fn peek_reads_another_voyage_and_moves_nothing_and_focus_vessel_is_not_an_agent_tool() {
    let mut guard = crate::core_session::SessionGuard::new("voyager-peek-tool-test");
    let workspace = guard.open("/tmp");
    let checked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let call = |action: Action, expected_version: u64| {
            workspace
                .call(Request {
                    request_id: workspace.request_id(),
                    expected_version,
                    action,
                })
                .unwrap()
        };
        let initial = call(Action::Inspect, 0);
        let a = initial.layout.voyages[0].id.clone();
        let created = call(
            Action::CreateVoyage {
                name: "Elsewhere".into(),
                cwd: "/tmp".into(),
            },
            initial.version,
        );
        let b = created.layout.voyages[1].id.clone();
        let vessel = created.layout.voyages[1].fleets[0].placements[0].id.clone();
        call(Action::SelectVoyage { id: a.clone() }, created.version);
        let before = call(Action::Inspect, 0);
        let focus = voyager_contract::context::Focus {
            scope: Context::Voyage { id: a.clone() },
            path: vec!["A".into()],
            cwd: None,
            revision: before.version,
            preview: None,
        };
        let mut tools = Tools::default();
        let peek = json!({"id":"peek","method":"item/tool/call","params":{"threadId":"thread","turnId":"turn","callId":"peek-call","tool":"voyager_peek","arguments":{"target":{"kind":"voyage","id":b}}}});
        assert!(
            tools
                .callback(
                    &peek,
                    Some("thread"),
                    Some("turn"),
                    true,
                    Some(&focus),
                    &workspace
                )
                .is_none()
        );
        let peeked = completed(&mut tools);
        let read: Response = serde_json::from_str(
            crate::provider_settings::codex_reply(&peeked.replies[0])["result"]["contentItems"][0]
                ["text"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(read.status, Outcome::Applied);
        assert_eq!(
            read.layout
                .voyages
                .iter()
                .map(|voyage| voyage.id.clone())
                .collect::<Vec<_>>(),
            vec![b.clone()]
        );
        let after = call(Action::Inspect, 0);
        assert_eq!(after.layout.selected_voyage, before.layout.selected_voyage);
        assert_eq!(after.layout.selected_fleet, before.layout.selected_fleet);
        assert_eq!(after.layout.context, before.layout.context);
        assert_eq!(after.layout.view, before.layout.view);
        assert_eq!(after.layout.last_vessels, before.layout.last_vessels);
        assert_eq!(after.version, before.version);
        let focusing = json!({"id":"focus","method":"item/tool/call","params":{"threadId":"thread","turnId":"turn","callId":"focus-call","tool":"voyager_workspace","arguments":{"expectedVersion":"0","action":{"operation":"focus-vessel","id":vessel}}}});
        let refused = tools
            .callback(
                &focusing,
                Some("thread"),
                Some("turn"),
                true,
                Some(&focus),
                &workspace,
            )
            .unwrap();
        assert_eq!(refused["result"]["success"], false);
        assert!(
            refused.to_string().contains("not an agent tool"),
            "{refused}"
        );
        let definitions = catalog().unwrap();
        assert!(definitions.iter().any(|tool| tool.name == "voyager_peek"));
        let workspace_tool = definitions
            .iter()
            .find(|tool| tool.name == "voyager_workspace")
            .unwrap();
        assert!(!workspace_tool.schema.to_string().contains("focus-vessel"));
    }));
    drop(workspace);
    checked.unwrap();
}
