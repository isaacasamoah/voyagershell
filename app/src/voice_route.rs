use crate::speech::{Ack, Fault, SpokenText};

pub const CHAT_CONFIDENCE: f64 = 0.99;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Route {
    Chat(SpokenText),
    Voyager(Ack),
}

#[derive(serde::Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
enum Answer {
    Chat { say: String },
    Work { ack: Ack },
}

impl Route {
    pub fn parse(heard: &str, answer: &str, chat_probability: Option<f64>) -> Route {
        let say = match serde_json::from_str(answer) {
            Ok(Answer::Chat { say }) => say,
            Ok(Answer::Work { ack }) => return Route::Voyager(ack),
            Err(_) => return Route::Voyager(Ack::None),
        };
        let sure = chat_probability.is_some_and(|chance| chance >= CHAT_CONFIDENCE);
        if !sure || asks_voyager(heard) || has_any(&say, ACTION_WORDS) || has_any(&say, OFFER_WORDS)
        {
            return Route::Voyager(Ack::None);
        }
        SpokenText::from_reply(&say).map_or(Route::Voyager(Ack::None), Route::Chat)
    }
}

const OFFER_WORDS: &str = "what would you like|want me to|do you want me|would you like me|shall i|should i|i could|i'll|i will|let me|let's|can i help|i can help|i'm here to help|happy to help|can i get|can i do|what can i do|i can show|i can get|anything i can";

const ACTION_WORDS: &str = "i'm going|going to|on it|i've|i have|i did|done|will do|right away|working on|voyager|ask|asking|check|checking|open|opening|look|looking|find|finding|move|moving|rename|renaming|dock|docking|switch|switching|start|stop|cancel|canceling|cancelling|drop|fleet|vessel|voyage|build|terminal|portal|workspace|opened|moved|renamed|docked|checked|started|stopped|canceled|cancelled|switched|found|dropped|fleets|vessels|voyages|builds|terminals|portals";

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
kind "work": everything else. That is any command, any question about the workspace, the build, the crew or progress, any vague "how's it going" or "anything new", asking for help or what you can do, and never mind or cancel. Voyager answers these. Also choose "ack", what you say before Voyager answers. "none" for a plain command whose effect they will see, such as open, go, dock, switch, show, maximize, restore, move, put, rename, hide or close, and for never mind, cancel or forget it. "look" for a question, a lookup, a status check or a summary, which takes Voyager a moment. "sure" for a request to tell or ask the crew something, or to start or stop work.
When you are not sure, it is work."#;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Example {
    Chat(&'static str),
    Work(Ack),
}

pub const ROUTE_EXAMPLES: [(&str, Example); 21] = [
    (
        "Hi, how are you doing today?",
        Example::Chat("I'm good, thanks. You?"),
    ),
    ("Open the Billing fleet.", Example::Work(Ack::None)),
    ("Okay, thanks, that's all.", Example::Chat("Anytime.")),
    ("Are the tests passing?", Example::Work(Ack::Look)),
    (
        "Can you hear me okay?",
        Example::Chat("Yes, loud and clear."),
    ),
    (
        "Could you help me with something?",
        Example::Work(Ack::Sure),
    ),
    ("Who's this?", Example::Chat("I'm Voyager's voice.")),
    ("Make the browser bigger.", Example::Work(Ack::None)),
    ("Show me the Ledger voyage.", Example::Work(Ack::None)),
    ("Move the logs over to the right.", Example::Work(Ack::None)),
    ("Call this one Sandbox.", Example::Work(Ack::None)),
    (
        "Tell the reviewer to take another pass.",
        Example::Work(Ack::Sure),
    ),
    ("Kick off a fresh build.", Example::Work(Ack::Sure)),
    ("What changed since lunch?", Example::Work(Ack::Look)),
    ("What else can you do?", Example::Work(Ack::Look)),
    ("Good evening.", Example::Chat("Evening!")),
    ("Forget about it.", Example::Work(Ack::None)),
    ("Nice one.", Example::Chat("Thanks!")),
    ("How's it going with the crew?", Example::Work(Ack::Look)),
    ("Cancel the last one.", Example::Work(Ack::None)),
    ("Bye for now.", Example::Chat("Bye, talk soon.")),
];

pub const CHAT_CLOSING: &str = "For a chat reply, this rule comes before the guide above: never offer to do anything, never ask whether to do something, and never say what you or Voyager will do. Answer the small talk and stop.";

pub fn route_prompt() -> String {
    format!("{ROUTE_RULE}\n\n{}\n\n{CHAT_CLOSING}", crate::spoken::TALK)
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
                Route::Voyager(Ack::None)
            );
        }
    }

    #[test]
    fn work_goes_to_voyager_with_its_chosen_acknowledgement_whatever_the_probability() {
        for ack in Ack::ALL {
            let answer = serde_json::json!({"kind": "work", "ack": ack.key()}).to_string();
            for chance in [None, Some(0.0), Some(1.0)] {
                assert_eq!(
                    Route::parse("Open the roadmap.", &answer, chance),
                    Route::Voyager(ack)
                );
            }
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
            r#"{"kind": "work"}"#,
            r#"{"kind": "work", "ack": "maybe"}"#,
            r#"{"kind": "work", "ack": "look", "say": "Let me check."}"#,
            r#"{"kind": "chat", "say": "Hi"#,
        ] {
            assert_eq!(
                Route::parse("Hello.", bad, Some(1.0)),
                Route::Voyager(Ack::None),
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
                Route::Voyager(Ack::None),
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
                Route::Voyager(Ack::None),
                "{heard}"
            );
        }
    }

    #[test]
    fn no_example_teaches_the_voice_to_answer_work_or_promise_an_action() {
        for (said, example) in ROUTE_EXAMPLES {
            let Example::Chat(say) = example else {
                continue;
            };
            assert!(
                matches!(Route::parse(said, &chat(say), Some(1.0)), Route::Chat(_)),
                "{said}"
            );
        }
    }

    #[test]
    fn the_examples_teach_every_acknowledgement_choice() {
        for ack in Ack::ALL {
            assert!(
                ROUTE_EXAMPLES
                    .iter()
                    .any(|(_, example)| *example == Example::Work(ack)),
                "{ack:?}"
            );
        }
    }

    #[test]
    fn the_routing_rule_names_each_choice_the_schema_allows() {
        for ack in Ack::ALL {
            assert!(
                ROUTE_RULE.contains(&format!("\"{}\" for", ack.key())),
                "{ack:?}"
            );
        }
    }

    #[test]
    fn the_routing_prompt_is_the_rule_then_the_spoken_guide_unchanged_then_the_chat_closing() {
        assert_eq!(
            route_prompt(),
            format!("{ROUTE_RULE}\n\n{}\n\n{CHAT_CLOSING}", crate::spoken::TALK)
        );
    }

    #[test]
    fn saying_yes_i_can_hear_you_is_still_small_talk() {
        let Route::Chat(said) =
            Route::parse("Can you hear me?", &chat("Yes, I can hear you."), Some(1.0))
        else {
            panic!("a plain yes to can you hear me is a chat reply");
        };
        assert_eq!(said.as_str(), "Yes, I can hear you.");
    }

    #[test]
    fn a_chat_reply_that_offers_to_do_something_goes_to_voyager() {
        for offering in [
            "Want me to show you around?",
            "Hi! Do you want me to open something?",
            "Would you like me to find it?",
            "Shall I take you there?",
            "Should I keep going?",
            "I can show you what's new.",
            "Can I get you anything?",
            "What can I do for you?",
            "Is there anything I can do?",
            "I can get that for you.",
            "I can help with that.",
            "Can I help with anything?",
            "I'm here to help.",
            "Happy to help!",
            "I could pull that up.",
            "I'll be right here.",
            "Let me know what you need.",
            "Let's get started.",
        ] {
            assert_eq!(
                Route::parse("Hi there.", &chat(offering), Some(1.0)),
                Route::Voyager(Ack::None),
                "{offering}"
            );
        }
        assert_eq!(
            Route::parse(
                "I'm bored.",
                &chat("I hear you. What would you like to do?"),
                Some(1.0)
            ),
            Route::Voyager(Ack::None)
        );
    }
}
