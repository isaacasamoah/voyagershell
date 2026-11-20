use super::*;
use crate::provider::StandIn;
use std::path::Path;

fn owner(profile: &Path) -> Owner {
    let message = Message {
        id: "conversation-0".into(),
        request_id: "conversation-0".into(),
        role: Role::User,
        text: "Hello".into(),
        context: None,
        tool: None,
    };
    let projection = Arc::new(Projection {
        value: Mutex::new(Snapshot {
            messages: vec![message],
            ..Default::default()
        }),
        changed: Condvar::new(),
    });
    let (events, _) = mpsc::sync_channel(2);
    let (scopes, _) = mpsc::sync_channel(1);
    let mut owner = Owner::new(
        projection,
        profile.into(),
        Workspace::open("invalid-for-core-start".into(), "/tmp".into()),
        Arc::new(AudioState::new(Capability::Checking)),
        Vec::new(),
        events,
        scopes,
    );
    owner.active = "conversation-0".into();
    owner
}

fn opened_through_the_stand_in(profile: &Path) -> Vec<String> {
    opened_with(profile, |_| {})
}

fn opened_with(profile: &Path, between: impl FnOnce(&Owner)) -> Vec<String> {
    let mut owner = owner(profile);
    owner.settings = Settings::read(profile).unwrap();
    let seen = Arc::default();
    owner.provider = Some(Box::new(StandIn(Arc::clone(&seen))));
    owner.rpc(Command::Initialize).unwrap();
    let answers = [
        Answer::Initialized { version: None },
        Answer::Conversation {
            thread: "thread".into(),
            model: None,
        },
    ];
    let mut between = Some(between);
    for (id, answer) in (1..).zip(answers) {
        if id == 2
            && let Some(between) = between.take()
        {
            between(&owner);
        }
        let outcome = Outcome::Applied(answer);
        owner
            .receive(ProviderEvent::Response { id, outcome })
            .unwrap();
    }
    seen.lock().unwrap().clone()
}

#[test]
fn the_configured_or_default_settings_reach_the_provider_through_the_trait() {
    let profile =
        std::env::temp_dir().join(format!("voyager-provider-trait-{}", std::process::id()));
    fs::create_dir(&profile).unwrap();
    let model = Settings::default().model;
    assert_eq!(
        opened_through_the_stand_in(&profile),
        [
            "1 Initialize".to_owned(),
            "initialized".into(),
            format!("2 open {model} high {ADMINISTRATOR}"),
            "3 turn Hello high".into(),
        ]
    );
    fs::write(
        profile.join("conversation.json"),
        r#"{"model":"configured-model","effort":"low","prompt":"Configured policy"}"#,
    )
    .unwrap();
    assert_eq!(
        opened_through_the_stand_in(&profile),
        [
            "1 Initialize",
            "initialized",
            "2 open configured-model low Configured policy",
            "3 turn Hello low",
        ]
    );
    fs::remove_dir_all(profile).unwrap();
}

#[test]
fn a_note_is_a_line_in_the_chat_and_makes_room_for_itself() {
    let workspace = Workspace::open("invalid-for-core-start".into(), "/tmp".into());
    let private = Client::open(std::env::temp_dir(), workspace);
    private.note("Not sent. Voyager needs you on Home").unwrap();
    let state = private.snapshot(None).unwrap().unwrap();
    assert_eq!(state.messages.len(), 1);
    assert_eq!(
        state.messages[0].text,
        "Not sent. Voyager needs you on Home"
    );
    assert_eq!(state.messages[0].role, Role::Assistant);
    for _ in 0..70 {
        private.note("again").unwrap();
    }
    let state = private.snapshot(None).unwrap().unwrap();
    assert_eq!(state.messages.len(), 64);
    assert!(state.omitted >= 7);
}

#[test]
fn a_note_landing_before_the_turn_starts_is_never_sent_as_the_users_message() {
    let profile = std::env::temp_dir().join(format!("voyager-note-turn-{}", std::process::id()));
    fs::create_dir(&profile).unwrap();
    let seen = opened_with(&profile, |owner| {
        owner
            .projection
            .edit(|state| {
                state.messages.push(Message {
                    id: "conversation-9".into(),
                    request_id: "conversation-9".into(),
                    role: Role::Assistant,
                    text: "Not sent. Voyager needs you on Home".into(),
                    context: None,
                    tool: None,
                });
                true
            })
            .unwrap();
    });
    let turns: Vec<_> = seen.iter().filter(|line| line.contains(" turn ")).collect();
    assert_eq!(turns.len(), 1);
    assert!(turns[0].ends_with("turn Hello high"));
    assert!(seen.iter().all(|line| !line.contains("Not sent")));
    fs::remove_dir_all(profile).unwrap();
}
