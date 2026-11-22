use crate::speech::{Fault, SpokenText};

pub const CHAT_CONFIDENCE: f64 = 0.99;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Route {
    Chat(SpokenText),
    Voyager,
}

#[derive(serde::Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
enum Answer {
    Chat { say: String },
    Work,
}

impl Route {
    pub fn parse(heard: &str, answer: &str, chat_probability: Option<f64>) -> Route {
        let Ok(Answer::Chat { say }) = serde_json::from_str(answer) else {
            return Route::Voyager;
        };
        let sure = chat_probability.is_some_and(|chance| chance >= CHAT_CONFIDENCE);
        if !sure || asks_voyager(heard) || has_any(&say, ACTION_WORDS) {
            return Route::Voyager;
        }
        SpokenText::from_reply(&say).map_or(Route::Voyager, Route::Chat)
    }
}

const ACTION_WORDS: &str = "i'll|i will|i'm going|going to|let me|let's|on it|i've|i have|i did|done|will do|right away|working on|voyager|ask|asking|check|checking|open|opening|look|looking|find|finding|move|moving|rename|renaming|dock|docking|switch|switching|start|stop|cancel|canceling|cancelling|drop|fleet|vessel|voyage|build|terminal|portal|workspace|opened|moved|renamed|docked|checked|started|stopped|canceled|cancelled|switched|found|dropped|fleets|vessels|voyages|builds|terminals|portals";

const VOYAGER_WORDS: &str = "help|can you do|never mind|nevermind|cancel";

fn asks_voyager(heard: &str) -> bool {
    has_any(heard, VOYAGER_WORDS)
}

fn has_any(text: &str, phrases: &str) -> bool {
    let words: Vec<String> = text
        .to_lowercase()
        .replace('\u{2019}', "'")
        .split(|character: char| !(character.is_alphanumeric() || character == '\''))
        .filter(|word| !word.is_empty())
        .map(str::to_owned)
        .collect();
    let spaced = format!(" {} ", words.join(" "));
    phrases
        .split('|')
        .any(|phrase| spaced.contains(&format!(" {phrase} ")))
}

pub trait Routing: Send + Sync {
    fn route(&self, heard: &str) -> Result<Route, Fault>;
}

pub const ROUTE_RULE: &str = r#"You are the voice in front of Voyager. Voyager is the person's workspace assistant. It does every action and knows every fact about their work. You only make small talk. Answer in JSON.
kind "chat": pure small talk that needs nothing from the workspace, such as hello, how are you, thanks, goodbye, okay, can you hear me, are you there, who are you, or a compliment. Put a short friendly reply in "say", in the style of the guide below. Never offer, promise or describe an action, and never state a fact about their work.
kind "work": everything else. That is any command, any question about the workspace, the build, the crew or progress, any vague "how's it going" or "anything new", asking for help or what you can do, and never mind or cancel. Voyager answers these, so give only the kind.
When you are not sure, it is work."#;

pub const ROUTE_EXAMPLES: [(&str, Option<&str>); 14] = [
    (
        "Hi, how are you doing today?",
        Some("I'm good, thanks. You?"),
    ),
    ("Open the Billing fleet.", None),
    ("Okay, thanks, that's all.", Some("Anytime.")),
    ("Are the tests passing?", None),
    ("Can you hear me okay?", Some("Yes, loud and clear.")),
    ("Could you help me with something?", None),
    ("Who's this?", Some("I'm Voyager's voice.")),
    ("What else can you do?", None),
    ("Good evening.", Some("Evening!")),
    ("Forget about it.", None),
    ("Nice one.", Some("Thanks!")),
    ("How's it going with the crew?", None),
    ("Cancel the last one.", None),
    ("Bye for now.", Some("Bye, talk soon.")),
];

pub fn route_prompt() -> String {
    format!("{ROUTE_RULE}\n\n{}", crate::spoken::TALK)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chat(say: &str) -> String {
        serde_json::json!({"kind": "chat", "say": say}).to_string()
    }

    #[test]
    fn small_talk_is_answered_by_the_voice_only_when_the_model_is_sure() {
        let answer = chat("I'm good, thanks. You?");
        let Route::Chat(said) = Route::parse("How are you?", &answer, Some(0.995)) else {
            panic!("a sure chat answer is a chat reply");
        };
        assert_eq!(said.as_str(), "I'm good, thanks. You?");
        assert!(matches!(
            Route::parse("How are you?", &answer, Some(CHAT_CONFIDENCE)),
            Route::Chat(_)
        ));
        for unsure in [Some(0.98), Some(0.0), None] {
            assert_eq!(
                Route::parse("How are you?", &answer, unsure),
                Route::Voyager
            );
        }
    }

    #[test]
    fn work_goes_to_voyager_whatever_the_probability() {
        for chance in [None, Some(0.0), Some(1.0)] {
            assert_eq!(
                Route::parse("Open the roadmap.", r#"{"kind": "work"}"#, chance),
                Route::Voyager
            );
        }
    }

    #[test]
    fn an_answer_that_is_not_the_agreed_shape_goes_to_voyager() {
        for bad in [
            "",
            "Hello.",
            "{}",
            r#"{"kind": "chat"}"#,
            r#"{"kind": "maybe", "say": "Hello."}"#,
            r#"{"kind": "chat", "say": "  "}"#,
            r#"{"kind": "chat", "say": "Hi.", "handoff": false}"#,
            r#"{"kind": "work", "say": "Sure."}"#,
            r#"{"kind": "chat", "say": "Hi"#,
        ] {
            assert_eq!(
                Route::parse("Hello.", bad, Some(1.0)),
                Route::Voyager,
                "{bad:?}"
            );
        }
    }

    #[test]
    fn a_chat_reply_that_promises_or_describes_an_action_goes_to_voyager() {
        for promising in [
            "Sure, I'll cancel that.",
            "On it, renaming that vessel to Planar.",
            "Let me check on that for you.",
            "Okay, opening the roadmap.",
            "Done, you're there.",
            "I\u{2019}ll ask Voyager.",
            "I've moved it.",
            "The build is green.",
            "Your Fleet has three things in it.",
        ] {
            assert_eq!(
                Route::parse("How are you?", &chat(promising), Some(1.0)),
                Route::Voyager,
                "{promising}"
            );
        }
        for plain in [
            "I'm good, thanks. You?",
            "Morning!",
            "Yes, loud and clear.",
            "I'm Voyager's voice.",
        ] {
            assert!(
                matches!(Route::parse("Hi.", &chat(plain), Some(1.0)), Route::Chat(_)),
                "{plain}"
            );
        }
    }

    #[test]
    fn help_what_can_you_do_never_mind_and_cancel_go_to_voyager_even_as_sure_chat() {
        let answer = chat("Sure, what do you need?");
        for heard in [
            "Help.",
            "Can you help me?",
            "What can you do?",
            "What else can you do?",
            "Never mind.",
            "Nevermind.",
            "Cancel that.",
        ] {
            assert_eq!(
                Route::parse(heard, &answer, Some(1.0)),
                Route::Voyager,
                "{heard}"
            );
        }
    }

    #[test]
    fn no_example_teaches_the_voice_to_answer_work_or_promise_an_action() {
        for (said, say) in ROUTE_EXAMPLES {
            let Some(say) = say else { continue };
            assert!(
                matches!(Route::parse(said, &chat(say), Some(1.0)), Route::Chat(_)),
                "{said}"
            );
        }
        assert!(ROUTE_EXAMPLES.iter().any(|(_, say)| say.is_none()));
    }

    #[test]
    fn the_routing_prompt_ends_with_the_spoken_guide_from_its_owner() {
        assert!(route_prompt().starts_with(ROUTE_RULE));
        assert!(route_prompt().ends_with(crate::spoken::TALK));
    }
}
