use super::structure_calls::{eligible_contents, grant_new_shell, record_created_terminals};
use super::*;
use crate::core::Core;
use crate::families::structure::{reopen_backend, require_live, visible_content};
use crate::workspace::Model;
use std::time::Duration;
use terminal_start::require_finished;
use voyager_contract::{Action, Outcome};

#[test]
fn worktree_creation_opens_one_voyage_and_reopens_its_identity() {
    use voyager_contract::worktree::{
        Action as GitAction, Request as GitRequest, Status as GitStatus,
    };
    let root = std::env::temp_dir().join(format!(
        "voyager-worktree-owner-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir(&root).unwrap();
    for args in [
        &["init", "-q"][..],
        &["config", "user.name", "Voyager test"],
        &["config", "user.email", "test@example.invalid"],
        &["commit", "--allow-empty", "-qm", "initial"],
    ] {
        let output = std::process::Command::new("git")
            .arg("-C")
            .arg(&root)
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    let session = format!("voyager-git-{}", std::process::id());
    let client = Client::open(session.clone(), root.to_string_lossy().into_owned());
    let checked = std::panic::catch_unwind(|| {
        let inspect = || {
            client
                .call(Request {
                    request_id: client.request_id(),
                    expected_version: 0,
                    action: Action::Inspect,
                })
                .unwrap()
        };
        let initial = inspect();
        assert_eq!(initial.status, Outcome::Applied);
        let source = initial.layout.voyages[0].id.clone();
        let refused = client
            .worktree(
                Some(Context::Voyage { id: source.clone() }),
                GitRequest {
                    request_id: client.request_id(),
                    expected_version: initial.version,
                    voyage: source.clone(),
                    action: GitAction::Create {
                        name: "forbidden".into(),
                        branch: "forbidden".into(),
                        base: "HEAD".into(),
                    },
                },
            )
            .unwrap();
        assert_eq!(refused.status, GitStatus::Rejected);
        assert!(!root.join(".worktree/forbidden").exists());
        let created = client
            .worktree(
                None,
                GitRequest {
                    request_id: client.request_id(),
                    expected_version: initial.version,
                    voyage: source.clone(),
                    action: GitAction::Create {
                        name: "branch".into(),
                        branch: "test-branch".into(),
                        base: "HEAD".into(),
                    },
                },
            )
            .unwrap();
        assert_eq!(created.status, GitStatus::Applied, "{:?}", created.message);
        let checkout = created.checkouts[0].path.clone();
        let after = inspect();
        let selected = after.layout.selected_voyage.clone().unwrap();
        assert_eq!(
            after
                .layout
                .voyages
                .iter()
                .find(|voyage| voyage.id == selected)
                .unwrap()
                .cwd
                .as_deref(),
            Some(checkout.as_str())
        );
        let closed = client
            .call(Request {
                request_id: client.request_id(),
                expected_version: after.version,
                action: Action::CloseVoyage {
                    id: selected.clone(),
                },
            })
            .unwrap();
        let reopened = client
            .worktree(
                None,
                GitRequest {
                    request_id: client.request_id(),
                    expected_version: closed.version,
                    voyage: source,
                    action: GitAction::Open {
                        path: checkout.clone(),
                    },
                },
            )
            .unwrap();
        assert_eq!(
            reopened.status,
            GitStatus::Applied,
            "{:?}",
            reopened.message
        );
        let after = inspect();
        assert_eq!(after.layout.selected_voyage, Some(selected));
        assert_eq!(
            after
                .layout
                .voyages
                .iter()
                .filter(|voyage| voyage.cwd.as_deref() == Some(checkout.as_str()))
                .count(),
            1
        );
    });
    let mut cleanup = Core::connect(&session).unwrap();
    cleanup.server_stop().unwrap();
    cleanup.close().unwrap();
    std::fs::remove_dir_all(root).unwrap();
    if let Err(error) = checked {
        std::panic::resume_unwind(error);
    }
}

#[test]
fn reopen_uses_live_core_identity_and_refuses_stale_or_ended_programs() {
    use voyager_contract::{ContentDestination, PlacementInsertion, PlacementOwner};
    for key in ["HC_SOCKET", "HC_SESSION", "HC_TERMINAL_ID"] {
        assert!(std::env::var_os(key).is_none(), "Clear ambient {key}");
    }
    let runtime = std::path::PathBuf::from(std::env::var_os("XDG_RUNTIME_DIR").unwrap());
    let session = format!("voyager-reopen-{}", std::process::id());
    assert!(
        !runtime
            .join("herdr-core")
            .join(format!("{session}.sock"))
            .exists()
    );
    let client = Client::open(session.clone(), "/tmp".into());
    let checked = std::panic::catch_unwind(|| {
        let request = |version, action| Request {
            request_id: client.request_id(),
            expected_version: version,
            action,
        };
        let initial = client.call(request(0, Action::Inspect)).unwrap();
        assert_eq!(initial.status, Outcome::Applied, "{:?}", initial.message);
        let panel = initial.layout.voyages[0].fleets[0].placements[0].clone();
        let _viewer = client
            .terminal(panel.vessel.clone(), client.request_id(), initial.version)
            .unwrap();
        let bound = client.call(request(0, Action::Inspect)).unwrap();
        let created = client
            .call(request(
                bound.version,
                Action::CreateFleet {
                    voyage: bound.layout.voyages[0].id.clone(),
                    name: "Next".into(),
                },
            ))
            .unwrap();
        assert_eq!(created.status, Outcome::Applied);
        let target = created.layout.voyages[0].fleets[1].clone();
        let _other_viewer = client
            .terminal(
                target.placements[0].vessel.clone(),
                client.request_id(),
                created.version,
            )
            .unwrap();
        let bound = client.call(request(0, Action::Inspect)).unwrap();
        let backend = bound
            .layout
            .vessels
            .iter()
            .find(|item| item.id == panel.vessel)
            .unwrap()
            .backend
            .clone()
            .unwrap();
        let mut core = Core::connect(&session).unwrap();
        let live = core.terminal_get(&backend.0).unwrap();
        require_live(&live, &backend).unwrap();
        for state in ["finished", "unknown"] {
            let mut invalid = live.clone();
            invalid.state = state.into();
            assert!(require_live(&invalid, &backend).is_err());
        }
        assert!(require_live(&live, &CoreTerminalId("other".into())).is_err());
        let mut uncertain = (*bound.layout).clone();
        uncertain
            .vessels
            .iter_mut()
            .find(|item| item.id == panel.vessel)
            .unwrap()
            .start_pending = Some("pending".into());
        assert!(reopen_backend(&uncertain, &panel.id, &HashMap::new()).is_err());
        assert!(
            reopen_backend(
                &bound.layout,
                &panel.id,
                &HashMap::from([(panel.vessel.0.clone(), "uncertain".into())])
            )
            .is_err()
        );
        let closed = client
            .call(request(
                bound.version,
                Action::RemovePlacement {
                    id: panel.id.clone(),
                },
            ))
            .unwrap();
        assert_eq!(closed.status, Outcome::Applied);
        let action = Action::ReopenPlacement {
            id: panel.id.clone(),
            destination: ContentDestination::Placement {
                owner: PlacementOwner::Fleet {
                    id: target.id.clone(),
                },
                insertion: PlacementInsertion::Beside {
                    id: target.placements[0].id.clone(),
                    side: voyager_contract::Side::Right,
                },
            },
        };
        let mut changed = (*closed.layout).clone();
        changed.voyages[0].fleets[1].name = "Changed outside".into();
        let external = core
            .document_set("voyager-layout-v2", &changed, closed.version)
            .unwrap();
        let stale = client
            .call(request(closed.version, action.clone()))
            .unwrap();
        assert_eq!(stale.status, Outcome::Refused);
        assert_eq!(stale.version, external.version);
        assert_eq!(*stale.layout, changed);
        let inspected = client.call(request(0, Action::Inspect)).unwrap();
        let reopen = request(inspected.version, action.clone());
        let opened = client.call(reopen.clone()).unwrap();
        assert_eq!(opened.status, Outcome::Applied);
        assert_eq!(client.call(reopen).unwrap(), opened);
        assert_eq!(opened.layout.vessels, bound.layout.vessels);
        assert!(opened.layout.voyages[0].fleets[0].placements.is_empty());
        let placed = &opened.layout.voyages[0].fleets[1].placements;
        assert_eq!(placed[0], target.placements[0]);
        assert_eq!(placed[1], panel);
        assert_eq!(placed[0].name, placed[1].name);
        assert_ne!(placed[0].id, placed[1].id);
        assert_eq!(core.terminal_get(&backend.0).unwrap().pid, live.pid);
        assert_eq!(core.terminal_list().unwrap().len(), 2);
        let closed = client
            .call(request(
                opened.version,
                Action::RemovePlacement { id: panel.id },
            ))
            .unwrap();
        core.terminal_kill(&backend.0).unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while core.terminal_get(&backend.0).unwrap().state == "live" {
            assert!(std::time::Instant::now() < deadline);
            thread::sleep(Duration::from_millis(10));
        }
        let refused = client.call(request(closed.version, action)).unwrap();
        assert_eq!(refused.status, Outcome::Refused);
        assert_eq!(refused.layout, closed.layout);
        assert_eq!(refused.version, closed.version);
        assert_eq!(core.terminal_list().unwrap().len(), 2);
        core.close().unwrap();
    });
    let mut cleanup = Core::connect(&session).unwrap();
    let stopped = cleanup.server_stop();
    cleanup.close().unwrap();
    drop(client);
    stopped.unwrap();
    checked.unwrap();
}

#[test]
fn explicit_new_shell_preserves_placement_and_grants_only_a_fresh_shell() {
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "Voyage".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    model
        .apply(Action::CreateVessel {
            type_id: "terminal".into(),
            destination: voyager_contract::ContentDestination::Placement {
                owner: voyager_contract::PlacementOwner::Portals {
                    voyage: model.layout.voyages[0].id.clone(),
                },
                insertion: voyager_contract::PlacementInsertion::Empty,
            },
            launch: None,
        })
        .unwrap();
    let id = model.layout.vessels[0].id.clone();
    let backend = CoreTerminalId("t1".into());
    model.layout.vessels[0].backend = Some(backend.clone());
    model.layout.vessels[0].launch = Some(voyager_contract::launch::Launch::Codex {
        model: "old-worker".into(),
        effort: Default::default(),
        permissions: Default::default(),
    });
    let mut observed: crate::core_shapes::Terminal = serde_json::from_value(serde_json::json!({
        "address": "t1", "labels": {}, "argv": ["old-agent"], "cwd": "/tmp", "state": "finished", "pid": 123,
        "created_ms": 1, "screen": "exact", "cols": 80, "rows": 24
    })).unwrap();
    assert_eq!(observed.pid, Some(123));
    require_finished(&observed, &backend).unwrap();
    for state in ["live", "unknown"] {
        observed.state = state.into();
        assert!(require_finished(&observed, &backend).is_err());
    }
    observed.state = "finished".into();
    assert!(require_finished(&observed, &CoreTerminalId("another".into())).is_err());
    let before = model.layout.clone();
    let action = Action::StartNewShell {
        vessel_id: id.clone(),
        expected_backend: backend.clone(),
    };
    let scope = Context::Vessel {
        id: model.layout.voyages[0].fleets[0].placements[0].id.clone(),
    };
    crate::scope::check(&Arc::new(before.clone()), Some(&scope), &action).unwrap();
    assert!(
        crate::scope::check(
            &Arc::new(before.clone()),
            Some(&Context::Portal {
                id: model.layout.voyages[0].portals[0].id.clone()
            }),
            &action
        )
        .is_err()
    );
    crate::scope::check(
        &Arc::new(before.clone()),
        Some(&Context::Portal {
            id: model.layout.voyages[0].portals[0].id.clone(),
        }),
        &Action::StartNewShell {
            vessel_id: model.layout.voyages[0].portals[0].vessel.clone(),
            expected_backend: CoreTerminalId("t2".into()),
        },
    )
    .unwrap();
    model
        .start_new_shell(&id, &CoreTerminalId("wrong".into()), "intent")
        .unwrap_err();
    assert_eq!(model.layout, before);
    model.start_new_shell(&id, &backend, "intent").unwrap();
    let mut expected = before;
    expected.vessels[0].launch = Some(voyager_contract::launch::Launch::Terminal);
    expected.vessels[0].shell_intent = Some("intent".into());
    assert_eq!(model.layout, expected);
    let mut pending = Vec::new();
    assert!(eligible_contents(&Arc::new(model.layout.clone()), None, &pending).is_empty());
    grant_new_shell(
        &mut pending,
        &id,
        &backend,
        "intent",
        voyager_contract::launch::Launch::Terminal,
    );
    model.layout.vessels[0].shell_intent = Some("changed".into());
    assert!(eligible_contents(&Arc::new(model.layout.clone()), None, &pending).is_empty());
    model.layout.vessels[0].shell_intent = Some("intent".into());
    assert_eq!(
        eligible_contents(&Arc::new(model.layout), None, &pending),
        vec![id.clone()]
    );
    settle_created_content(&mut pending, &id, &Err(Error::Uncertain("lost".into())));
    assert!(pending.is_empty());
}

#[test]
fn automatic_terminal_eligibility_excludes_notes() {
    let mut model = Model::default();
    model
        .apply(Action::CreateVoyage {
            name: "Voyage".into(),
            cwd: "/tmp".into(),
        })
        .unwrap();
    let fleet = model.layout.voyages[0].fleets[0].id.clone();
    let after = model.layout.voyages[0].fleets[0].placements[0].id.clone();
    let terminal = model.layout.vessels[0].id.clone();
    let previous = model.layout.clone();
    model
        .apply(Action::CreateVessel {
            launch: None,
            type_id: crate::vessel_type::NOTES_TYPE.into(),
            destination: voyager_contract::ContentDestination::Placement {
                owner: voyager_contract::PlacementOwner::Fleet { id: fleet.clone() },
                insertion: voyager_contract::PlacementInsertion::Beside {
                    id: after.clone(),
                    side: voyager_contract::Side::Right,
                },
            },
        })
        .unwrap();
    let notes = model.layout.vessels.last().unwrap().id.clone();
    let record = |id| CreatedTerminal {
        id,
        launch: Default::default(),
        backend: None,
        shell_intent: None,
    };
    let mut pending = vec![record(terminal.clone())];
    record_created_terminals(&mut pending, &previous, &model.layout);
    assert_eq!(pending, vec![record(terminal.clone())]);
    let previous = model.layout.clone();
    model
        .apply(Action::CreateVessel {
            launch: None,
            type_id: "terminal".into(),
            destination: voyager_contract::ContentDestination::Placement {
                owner: voyager_contract::PlacementOwner::Fleet { id: fleet },
                insertion: voyager_contract::PlacementInsertion::Beside {
                    id: after,
                    side: voyager_contract::Side::Bottom,
                },
            },
        })
        .unwrap();
    let new_terminal = model.layout.vessels.last().unwrap().id.clone();
    record_created_terminals(&mut pending, &previous, &model.layout);
    assert_eq!(
        pending,
        vec![record(terminal.clone()), record(new_terminal.clone())]
    );
    let mut layout = Arc::new(model.layout);
    pending.push(record(notes));
    assert_eq!(
        eligible_contents(&layout, None, &pending),
        vec![terminal.clone(), new_terminal.clone()]
    );
    let changed = Arc::make_mut(&mut layout)
        .vessels
        .iter_mut()
        .find(|item| item.id == new_terminal)
        .unwrap();
    changed.launch = Some(voyager_contract::launch::Launch::Program {
        argv: vec!["/different".into()],
    });
    assert_eq!(
        eligible_contents(&layout, None, &pending),
        vec![terminal.clone()]
    );
    let changed = Arc::make_mut(&mut layout)
        .vessels
        .iter_mut()
        .find(|item| item.id == new_terminal)
        .unwrap();
    changed.launch = Some(voyager_contract::launch::Launch::Terminal);
    assert_eq!(
        eligible_contents(&layout, None, &pending),
        vec![terminal, new_terminal]
    );
}

#[test]
fn maximized_groups_exclude_occluded_pending_terminals() {
    for portals in [false, true] {
        let mut model = Model::default();
        model
            .apply(Action::CreateVoyage {
                name: "Work".into(),
                cwd: "/tmp".into(),
            })
            .unwrap();
        let owner = if portals {
            voyager_contract::PlacementOwner::Portals {
                voyage: model.layout.voyages[0].id.clone(),
            }
        } else {
            voyager_contract::PlacementOwner::Fleet {
                id: model.layout.voyages[0].fleets[0].id.clone(),
            }
        };
        if portals {
            model
                .apply(Action::CreateVessel {
                    type_id: "terminal".into(),
                    launch: None,
                    destination: voyager_contract::ContentDestination::Placement {
                        owner: owner.clone(),
                        insertion: voyager_contract::PlacementInsertion::Empty,
                    },
                })
                .unwrap();
        }
        let first = crate::panels::group(&model.layout, &owner).unwrap().members[0].clone();
        model
            .apply(Action::CreateVessel {
                type_id: "terminal".into(),
                launch: None,
                destination: voyager_contract::ContentDestination::Placement {
                    owner: owner.clone(),
                    insertion: voyager_contract::PlacementInsertion::Beside {
                        id: first.id.clone(),
                        side: voyager_contract::Side::Right,
                    },
                },
            })
            .unwrap();
        let second = crate::panels::group(&model.layout, &owner).unwrap().members[1].clone();
        let pending = vec![CreatedTerminal {
            id: second.vessel.clone(),
            launch: Default::default(),
            backend: None,
            shell_intent: None,
        }];
        assert_eq!(
            eligible_contents(&Arc::new(model.layout.clone()), None, &pending),
            vec![second.vessel.clone()]
        );
        model
            .apply(Action::SetPlacementMaximized {
                id: first.id.clone(),
                maximized: true,
            })
            .unwrap();
        assert!(!visible_content(&model.layout, &second.vessel));
        assert_eq!(
            eligible_contents(&Arc::new(model.layout.clone()), None, &pending),
            vec![second.vessel.clone()]
        );
        model
            .apply(Action::SetPlacementMaximized {
                id: first.id,
                maximized: false,
            })
            .unwrap();
        assert_eq!(
            eligible_contents(&Arc::new(model.layout), None, &pending),
            vec![second.vessel]
        );
    }
}

#[test]
fn uncertain_start_discards_only_its_automatic_eligibility() {
    let first = VesselId("first".into());
    let other = VesselId("other".into());
    let record = |id| CreatedTerminal {
        id,
        launch: Default::default(),
        backend: None,
        shell_intent: None,
    };
    let mut pending = vec![record(first.clone()), record(other.clone())];
    let refused = Err(Error::Rejected {
        kind: "refused".into(),
        message: "not started".into(),
    });
    settle_created_content(&mut pending, &first, &refused);
    assert_eq!(pending, vec![record(first.clone()), record(other.clone())]);
    let uncertain = Err(Error::Uncertain("marker cleanup not confirmed".into()));
    settle_created_content(&mut pending, &first, &uncertain);
    assert_eq!(pending, vec![record(other)]);
}

#[test]
fn known_finished_attach_is_not_an_unconfirmed_start() {
    let error = terminal_start::attach_failure(
        Error::Rejected {
            kind: "finished".into(),
            message: "Terminal has exited".into(),
        },
        true,
        "t1",
    );
    assert!(
        matches!(error, Error::Rejected { kind, message } if kind == "finished" && message.contains("t1"))
    );
    assert!(matches!(
        terminal_start::attach_failure(Error::Uncertain("connection lost".into()), true, "t1"),
        Error::Uncertain(_)
    ));
}

#[test]
fn inspect_reads_the_workspace_that_owner_start_prepared_and_writes_nothing() {
    use voyager_contract::layout_document::DOCUMENT;
    for key in ["HC_SOCKET", "HC_SESSION", "HC_TERMINAL_ID"] {
        assert!(std::env::var_os(key).is_none(), "Clear ambient {key}");
    }
    let session = format!("voyager-inspect-reads-{}", std::process::id());
    let client = Client::open(session.clone(), "/tmp".into());
    let checked = std::panic::catch_unwind(|| {
        let (reply, facts) = async_channel::bounded(1);
        client
            .sender
            .send_blocking(Message::ContextFacts { reply })
            .unwrap();
        facts.recv_blocking().unwrap().unwrap();
        let mut core = Core::connect(&session).unwrap();
        let prepared = core.document_get(DOCUMENT).unwrap();
        assert!(
            !prepared.value.is_null(),
            "owner start saved the first Voyage before any inspect"
        );
        let first = client.inspect().unwrap();
        assert_eq!(first.status, Outcome::Applied, "{:?}", first.message);
        assert!(first.fresh);
        assert!(
            first.created_workspace,
            "first inspect reports the creation"
        );
        assert_eq!(first.layout.voyages[0].name, "Voyager");
        for _ in 0..30 {
            let again = client.inspect().unwrap();
            assert_eq!(again.status, Outcome::Applied, "{:?}", again.message);
            assert!(
                !again.created_workspace,
                "only the first inspect reports it"
            );
            assert_eq!(again.version, first.version);
            let stored = core.document_get(DOCUMENT).unwrap();
            assert_eq!(stored.version, prepared.version, "inspect saved nothing");
            assert_eq!(stored.value, prepared.value, "inspect changed nothing");
        }
        core.close().unwrap();
    });
    let mut cleanup = Core::connect(&session).unwrap();
    cleanup.server_stop().unwrap();
    cleanup.close().unwrap();
    if let Err(error) = checked {
        std::panic::resume_unwind(error);
    }
}
