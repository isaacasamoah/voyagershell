use serde::Deserialize;

pub const SAMPLE_RATE: u32 = 16_000;
pub const CHAT_CONFIDENCE: f64 = 0.99;
pub const CEILING_WORDS: usize = 120;
pub const OFFER_MORE: &str = "I can say more if you ask.";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Standing {
    Idle,
    Working,
    Blocked,
    NotRunning,
    Unknown,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum Phrase {
    Asking,
    OkayAsking,
    Queued,
    NeedsYou,
    NotRunning,
    Missed,
    Failed,
    Gone,
    Busy,
    Disconnected,
    NoMicrophone,
}

impl Phrase {
    pub const ALL: [Phrase; 11] = [
        Phrase::Asking,
        Phrase::OkayAsking,
        Phrase::Queued,
        Phrase::NeedsYou,
        Phrase::NotRunning,
        Phrase::Missed,
        Phrase::Failed,
        Phrase::Gone,
        Phrase::Busy,
        Phrase::Disconnected,
        Phrase::NoMicrophone,
    ];

    pub fn words(self) -> &'static str {
        match self {
            Phrase::Asking => "Asking Voyager.",
            Phrase::OkayAsking => "Okay, asking Voyager.",
            Phrase::Queued => "Queued for Voyager.",
            Phrase::NeedsYou => "Voyager needs you on Home first.",
            Phrase::NotRunning => "I couldn't pass that to Voyager.",
            Phrase::Missed => "I didn't catch that.",
            Phrase::Failed => "That didn't work.",
            Phrase::Gone => "Voyager isn't running.",
            Phrase::Busy => "Voyager can't take that right now. Try again in a moment.",
            Phrase::Disconnected => "I lost the connection to Voyager.",
            Phrase::NoMicrophone => "I can't hear your microphone.",
        }
    }

    pub fn key(self) -> &'static str {
        match self {
            Phrase::Asking => "asking",
            Phrase::OkayAsking => "okay-asking",
            Phrase::Queued => "queued",
            Phrase::NeedsYou => "needs-you",
            Phrase::NotRunning => "not-running",
            Phrase::Missed => "missed",
            Phrase::Failed => "failed",
            Phrase::Gone => "gone",
            Phrase::Busy => "busy",
            Phrase::Disconnected => "disconnected",
            Phrase::NoMicrophone => "no-microphone",
        }
    }

    pub fn refused(kind: &str) -> Phrase {
        match kind {
            "not_found" | "finished" => Phrase::Gone,
            "blocked" => Phrase::NeedsYou,
            "busy" => Phrase::Busy,
            "disconnected" => Phrase::Disconnected,
            _ => Phrase::NotRunning,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Acknowledgement {
    pub phrase: Phrase,
    pub send: bool,
}

pub fn acknowledge(standing: Standing, turn: u64) -> Acknowledgement {
    match standing {
        Standing::Idle | Standing::Unknown => Acknowledgement {
            phrase: if turn.is_multiple_of(2) {
                Phrase::Asking
            } else {
                Phrase::OkayAsking
            },
            send: true,
        },
        Standing::Working => Acknowledgement {
            phrase: Phrase::Queued,
            send: true,
        },
        Standing::Blocked => Acknowledgement {
            phrase: Phrase::NeedsYou,
            send: false,
        },
        Standing::NotRunning => Acknowledgement {
            phrase: Phrase::NotRunning,
            send: false,
        },
    }
}

const READ_BACK_ENTRIES: usize = 3;

pub fn heard_nothing(heard: &str, names: &[String]) -> bool {
    !heard.chars().any(char::is_alphanumeric) || reads_back_the_hint(heard, &hint_words(names))
}

fn reads_back_the_hint(heard: &str, hint: &[&str]) -> bool {
    let entries: Vec<String> = heard
        .split(',')
        .map(|entry| {
            entry
                .trim()
                .trim_end_matches(|c: char| !c.is_alphanumeric())
                .to_lowercase()
        })
        .collect();
    let mut from = 0;
    for entry in &entries {
        match hint[from..]
            .iter()
            .position(|word| word.to_lowercase() == *entry)
        {
            Some(at) => from += at + 1,
            None => return false,
        }
    }
    entries.len() >= READ_BACK_ENTRIES
}

pub fn clean_heard(raw: &str) -> String {
    let mut text = raw.to_owned();
    while let (Some(start), Some(end)) = (text.find("<|"), text.find("|>")) {
        if end < start {
            break;
        }
        text.replace_range(start..end + 2, " ");
    }
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Utterance {
    pub samples: Vec<i16>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Clip {
    pub rate: u32,
    pub pcm: Vec<u8>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Fault {
    Unavailable(String),
    Failed(String),
}

impl std::fmt::Display for Fault {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Fault::Unavailable(reason) | Fault::Failed(reason) => formatter.write_str(reason),
        }
    }
}

pub trait Hearing: Send + Sync {
    fn hear(&self, utterance: &Utterance, vocabulary: &[String]) -> Result<String, Fault>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reply {
    pub say: SpokenText,
    pub handoff: bool,
}

#[derive(Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Kind {
    Chat,
    Work,
}

#[derive(Deserialize)]
struct Answer {
    kind: Kind,
    say: String,
}

impl Reply {
    pub fn parse(answer: &str, chat_probability: Option<f64>) -> Option<Self> {
        let Answer { kind, say } = serde_json::from_str(answer).ok()?;
        let sure_it_is_chat = chat_probability.is_some_and(|chance| chance >= CHAT_CONFIDENCE);
        Some(Self {
            say: SpokenText::from_say(&say)?,
            handoff: kind == Kind::Work || !sure_it_is_chat,
        })
    }
}

pub trait Replying: Send + Sync {
    fn reply(&self, heard: &str) -> Result<Reply, Fault>;
}

pub trait Speaking: Send + Sync {
    fn render(&self, phrase: Phrase) -> Result<Clip, Fault>;
    fn speak(&self, text: &SpokenText) -> Result<Clip, Fault>;
}

pub enum Engine {
    Pipeline {
        hearing: Box<dyn Hearing>,
        speaking: Box<dyn Speaking>,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpokenText(String);

impl SpokenText {
    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn from_say(say: &str) -> Option<Self> {
        let (kept, _) = limit(say.split_whitespace().map(str::to_owned).collect());
        if kept.is_empty() {
            return None;
        }
        let mut text = kept.join(" ");
        if !text.ends_with(['.', '!', '?']) {
            text.push('.');
        }
        Some(Self(text))
    }

    pub fn from_reply(reply: &str) -> Option<Self> {
        let mut words: Vec<String> = Vec::new();
        for (line, closes) in speakable_lines(reply) {
            let first = words.len();
            for raw in line.split_whitespace() {
                match plain_word(raw) {
                    Some(word) => words.push(word),
                    None => {
                        let end = raw
                            .trim_end_matches(['"', '\'', ')'])
                            .chars()
                            .last()
                            .filter(|character| matches!(character, '.' | '!' | '?'));
                        if let (Some(end), Some(last)) = (end, words.last_mut())
                            && !last.ends_with(['.', '!', '?'])
                        {
                            last.push(end);
                        }
                    }
                }
            }
            if closes
                && words.len() > first
                && let Some(last) = words.last_mut()
                && !last.ends_with(['.', '!', '?'])
            {
                let kept = last.trim_end_matches([':', ';', ',']).len();
                last.truncate(kept);
                last.push('.');
            }
        }
        let (kept, cut) = limit(words);
        if kept.is_empty() {
            return None;
        }
        let mut text = kept.join(" ");
        if !text.ends_with(['.', '!', '?']) {
            text.push('.');
        }
        if cut {
            text.push(' ');
            text.push_str(OFFER_MORE);
        }
        Some(Self(text))
    }
}

fn speakable_lines(reply: &str) -> Vec<(String, bool)> {
    let mut fenced = false;
    let mut lines: Vec<(String, bool)> = Vec::new();
    for line in reply.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            fenced = !fenced;
            continue;
        }
        if fenced || trimmed.starts_with('|') {
            continue;
        }
        if trimmed.is_empty() {
            if let Some(last) = lines.last_mut() {
                last.1 = true;
            }
            continue;
        }
        lines.push((trimmed.to_owned(), is_item(trimmed)));
    }
    if let Some(last) = lines.last_mut() {
        last.1 = true;
    }
    lines
}

fn is_item(line: &str) -> bool {
    let digits = line.trim_start_matches(|character: char| character.is_ascii_digit());
    line.starts_with(['#', '-', '*', '>'])
        || (digits.len() < line.len() && digits.starts_with(['.', ')']))
}

fn plain_word(word: &str) -> Option<String> {
    let mut word = word.trim_start_matches(['#', '>', '-', '*']).to_owned();
    if let Some(open) = word.find("](") {
        word = word[..open].trim_start_matches('[').to_owned();
    }
    let word: String = word
        .chars()
        .filter(|character| !matches!(character, '*' | '`' | '_' | '[' | ']'))
        .collect();
    if word.is_empty()
        || word.contains('/')
        || word.contains("://")
        || looks_like_an_id(&word)
        || (word.len() >= 16
            && word.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
            && word.chars().any(|c| c.is_ascii_digit()))
    {
        return None;
    }
    Some(word)
}

fn looks_like_an_id(word: &str) -> bool {
    let core = word
        .trim_start_matches(['(', '"', '\''])
        .trim_end_matches(['.', ',', ';', ':', '!', '?', ')', '"', '\'']);
    let hex = core.len() >= 7
        && core.chars().all(|character| character.is_ascii_hexdigit())
        && core.chars().any(|character| character.is_ascii_digit())
        && core
            .chars()
            .any(|character| character.is_ascii_alphabetic());
    let coded = core.chars().next().is_some_and(char::is_alphabetic)
        && core.chars().any(|character| character.is_ascii_digit());
    hex || coded
}

fn limit(mut words: Vec<String>) -> (Vec<String>, bool) {
    if words.len() <= CEILING_WORDS {
        return (words, false);
    }
    words.truncate(CEILING_WORDS);
    if let Some(end) = words
        .iter()
        .rposition(|word| word.ends_with(['.', '!', '?']) && !is_abbreviation(word))
        && end + 1 >= CEILING_WORDS / 2
    {
        words.truncate(end + 1);
    }
    (words, true)
}

fn is_abbreviation(word: &str) -> bool {
    let bare = word.trim_end_matches('.');
    bare.len() == 1
        || matches!(
            bare.to_ascii_lowercase().as_str(),
            "e.g" | "i.e" | "etc" | "vs"
        )
}

pub fn hearing_prompt(names: &[String]) -> String {
    format!(
        "Perform ASR in English. Words you may hear: {}.",
        hint_words(names).join(", ")
    )
}

fn hint_words(names: &[String]) -> Vec<&str> {
    let mut words: Vec<&str> = vec![
        "dock",
        "Fleet",
        "Vessel",
        "Voyage",
        "Voyager",
        "voyagershell",
        "rename",
        "maximize",
        "Portal",
        "Core",
    ];
    for name in names {
        if !words.contains(&name.as_str()) {
            words.push(name);
        }
    }
    words
}

pub const REPLY_PROMPT: &str = r#"You are Voyager's voice. Voyager is the user's workspace assistant; it does all the work, and you only talk. Reply with JSON {"kind": "chat" or "work", "say": "..."}.
chat: pure chat that needs no workspace knowledge (greetings, thanks, goodbyes, okay, are you there, compliments, who you are). Say a friendly one-sentence answer.
work: everything else: any command, any question about the workspace, the build, the crew or progress, any vague "how is it going" or "any news", asking for help or what you can do, cancel or never mind. Say one short acknowledgement of at most twelve words in your own words that repeats the topic and keeps any names exactly as spoken. Never answer the question, never claim anything is done, never state a fact, never say you cannot. Voyager does the work, so say "I'll ask Voyager" or "Let me ask Voyager", never "I'll make", "I'll do" or "I'll create"."#;

pub const REPLY_EXAMPLES: [(&str, &str, &str); 27] = [
    (
        "Hi, how are you doing today?",
        "chat",
        "I'm doing well, thanks. What can I do for you?",
    ),
    (
        "Open the Billing fleet.",
        "work",
        "Sure, opening the Billing fleet.",
    ),
    ("Okay, thanks, that's all.", "chat", "You're welcome!"),
    (
        "Are the tests passing?",
        "work",
        "Let me check whether the tests are passing.",
    ),
    ("Can you hear me okay?", "chat", "Yes, loud and clear."),
    (
        "Go to the start page.",
        "work",
        "Okay, heading to the start page.",
    ),
    (
        "Who is this?",
        "chat",
        "I'm Voyager's voice. I pass your workspace requests to Voyager.",
    ),
    (
        "What are you doing right now?",
        "work",
        "Let me see what Voyager is up to.",
    ),
    ("Cheers.", "chat", "Anytime."),
    (
        "Anything new?",
        "work",
        "Sure, I'll ask Voyager what's new.",
    ),
    ("Nice work.", "chat", "Thank you, that's kind of you."),
    (
        "Forget it.",
        "work",
        "Okay, I'll tell Voyager to drop that.",
    ),
    (
        "What can you help with?",
        "work",
        "Sure, Voyager can walk you through that.",
    ),
    (
        "Rename the third vessel to Logs.",
        "work",
        "On it, renaming that vessel.",
    ),
    (
        "Good evening.",
        "chat",
        "Good evening! What can I do for you?",
    ),
    (
        "Who is working on the login pull request?",
        "work",
        "Let me find out who is on the login pull request.",
    ),
    (
        "Write me a report of what happened this week.",
        "work",
        "Sure, I'll ask Voyager for a report.",
    ),
    ("Great, that works.", "chat", "Glad to hear it!"),
    ("You're fast.", "chat", "Thanks, I try to be."),
    (
        "How should I talk to you?",
        "chat",
        "Just speak normally, and I'll pass your requests to Voyager.",
    ),
    (
        "Fill me in.",
        "work",
        "Sure, I'll ask Voyager to fill you in.",
    ),
    (
        "Is there anything I should look at?",
        "work",
        "Sure, I'll ask Voyager what needs a look.",
    ),
    (
        "Could you help me with something?",
        "work",
        "Sure, Voyager can help with that.",
    ),
    (
        "What else can you do?",
        "work",
        "Sure, Voyager can walk you through what it can do.",
    ),
    (
        "What's the latest?",
        "work",
        "Let me ask Voyager for the latest.",
    ),
    (
        "Dock me to the Build-3 fleet.",
        "work",
        "Sure, I'll ask Voyager to dock you to the Build-3 fleet.",
    ),
    (
        "Never mind.",
        "work",
        "Okay, I'll tell Voyager to drop that.",
    ),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_idle_voyager_gets_the_two_asking_phrases_in_turn_and_the_words_are_sent() {
        let first = acknowledge(Standing::Idle, 0);
        let second = acknowledge(Standing::Idle, 1);
        assert_eq!(first.phrase, Phrase::Asking);
        assert_eq!(second.phrase, Phrase::OkayAsking);
        assert!(first.send && second.send);
    }

    #[test]
    fn a_working_voyager_queues_the_words() {
        let queued = acknowledge(Standing::Working, 0);
        assert_eq!((queued.phrase, queued.send), (Phrase::Queued, true));
    }

    #[test]
    fn a_voyager_with_no_state_yet_is_asked_like_an_idle_one() {
        for turn in [0, 1] {
            let unknown = acknowledge(Standing::Unknown, turn);
            let idle = acknowledge(Standing::Idle, turn);
            assert_eq!(unknown, idle);
            assert!(unknown.send);
        }
    }

    #[test]
    fn a_blocked_or_absent_voyager_receives_nothing() {
        for (standing, phrase) in [
            (Standing::Blocked, Phrase::NeedsYou),
            (Standing::NotRunning, Phrase::NotRunning),
        ] {
            let held = acknowledge(standing, 0);
            assert_eq!((held.phrase, held.send), (phrase, false));
        }
    }

    #[test]
    fn text_with_no_letter_or_digit_is_nothing_heard() {
        for heard in ["", " ... ", "-- !"] {
            assert!(heard_nothing(heard, &[]), "{heard:?}");
        }
        assert!(!heard_nothing("Rename it", &[]));
    }

    #[test]
    fn a_read_back_of_the_hint_in_its_order_is_nothing_heard() {
        let names: Vec<String> = vec!["Fleet 1".into(), "Home".into()];
        for heard in [
            "dock, Fleet, Vessel, Voyage, Voyager, voyagershell, rename, maximize, Portal, Core, Fleet 1, Home.",
            "dock, Fleet, Vessel.",
            "Voyager, maximize, Core, Home",
        ] {
            assert!(heard_nothing(heard, &names), "{heard:?}");
        }
    }

    #[test]
    fn short_commands_made_of_hint_words_are_kept() {
        let names: Vec<String> = vec!["Fleet 1".into(), "Home".into()];
        for heard in [
            "Maximize.",
            "Rename this Fleet.",
            "Dock.",
            "Maximize Fleet 1.",
            "Dock, Fleet.",
            "Home, Core, dock.",
            "dock, Fleet, the Vessel.",
        ] {
            assert!(!heard_nothing(heard, &names), "{heard:?}");
        }
    }

    #[test]
    fn no_acknowledgement_names_an_action_or_claims_a_result() {
        for phrase in Phrase::ALL {
            let words = phrase.words().to_lowercase();
            for forbidden in ["done", "opening", "renamed", "opened"] {
                assert!(!words.contains(forbidden), "{words}");
            }
        }
    }

    fn answer(kind: &str, say: &str) -> String {
        format!(r#"{{"kind": "{kind}", "say": "{say}"}}"#)
    }

    #[test]
    fn chat_is_answered_without_a_handoff_only_when_the_model_is_sure() {
        let chat = answer("chat", "You're welcome!");
        let sure = Reply::parse(&chat, Some(0.995)).unwrap();
        assert!(!sure.handoff);
        assert_eq!(sure.say.as_str(), "You're welcome!");
        assert!(Reply::parse(&chat, Some(CHAT_CONFIDENCE)).is_some_and(|reply| !reply.handoff));
        assert!(Reply::parse(&chat, Some(0.98)).unwrap().handoff);
        assert!(Reply::parse(&chat, None).unwrap().handoff);
    }

    #[test]
    fn work_is_always_handed_off_whatever_the_probability() {
        let work = answer("work", "Sure, opening the Billing fleet.");
        for chance in [None, Some(0.0), Some(1.0)] {
            assert!(Reply::parse(&work, chance).unwrap().handoff);
        }
    }

    #[test]
    fn an_answer_that_is_not_the_agreed_shape_is_not_a_reply() {
        for bad in [
            "",
            "Sure.",
            "{}",
            r#"{"kind": "chat"}"#,
            r#"{"kind": "maybe", "say": "Hello."}"#,
            r#"{"kind": "chat", "say": "  "}"#,
            r#"{"handoff": false, "say": "Hello."}"#,
        ] {
            assert!(Reply::parse(bad, Some(1.0)).is_none(), "{bad:?}");
        }
    }

    #[test]
    fn names_with_digits_and_hyphens_survive_in_what_is_said() {
        let said = SpokenText::from_say("Sure, docking you to voyagershell 2 and Build-3").unwrap();
        assert_eq!(
            said.as_str(),
            "Sure, docking you to voyagershell 2 and Build-3."
        );
    }

    #[test]
    fn no_example_or_rule_lets_the_voice_claim_the_work() {
        let wording = REPLY_EXAMPLES
            .iter()
            .filter(|(_, kind, _)| *kind == "work")
            .map(|(_, _, say)| *say);
        for say in wording {
            let lower = say.to_lowercase();
            for claimed in ["i'll make", "i'll do", "i'll create", "i've", "done"] {
                assert!(!lower.contains(claimed), "{say}");
            }
            assert!(say.split_whitespace().count() <= 12, "{say}");
        }
        assert!(REPLY_PROMPT.contains(r#"never "I'll make""#));
    }

    #[test]
    fn help_and_cancel_are_handed_to_voyager_in_the_examples() {
        for asked in [
            "What can you help with?",
            "Could you help me with something?",
            "What else can you do?",
            "Never mind.",
        ] {
            let (_, kind, _) = REPLY_EXAMPLES
                .iter()
                .find(|(said, ..)| *said == asked)
                .unwrap();
            assert_eq!(*kind, "work", "{asked}");
        }
    }

    #[test]
    fn heard_text_loses_control_tokens_and_extra_space() {
        assert_eq!(
            clean_heard(" Rename  this\nfleet.<|im_end|> "),
            "Rename this fleet."
        );
        assert_eq!(clean_heard("<|im_end|>"), "");
    }

    #[test]
    fn every_paragraph_is_spoken_and_nothing_points_to_the_chat() {
        let text = SpokenText::from_reply("Renamed the fleet.\n\nI also tidied the tabs.").unwrap();
        assert_eq!(text.as_str(), "Renamed the fleet. I also tidied the tabs.");
    }

    #[test]
    fn a_three_sentence_answer_is_spoken_whole() {
        let reply = "The build passed. Two tests were slow. I left them alone.";
        let text = SpokenText::from_reply(reply).unwrap();
        assert_eq!(text.as_str(), reply);
    }

    #[test]
    fn a_short_reply_is_spoken_whole_with_no_pointer() {
        let text = SpokenText::from_reply("Done. The fleet is now called Build.").unwrap();
        assert_eq!(text.as_str(), "Done. The fleet is now called Build.");
    }

    #[test]
    fn list_items_and_headings_each_end_as_a_sentence() {
        let text = SpokenText::from_reply("## Fleets\n- Build\n- Review\n1. Home").unwrap();
        assert_eq!(text.as_str(), "Fleets. Build. Review. 1. Home.");
    }

    #[test]
    fn a_wrapped_paragraph_keeps_its_own_punctuation() {
        let text = SpokenText::from_reply("The build\npassed on the\nsecond try.").unwrap();
        assert_eq!(text.as_str(), "The build passed on the second try.");
    }

    const REAL_THREE_SENTENCES: &str = "A tidy workspace helps you find what you need quickly, so you spend your time working instead of searching. It also makes mistakes less likely, because old drafts and stray files are less likely to get mixed up with the current ones. And it makes it easier to hand work to someone else or come back to it later, since anyone can see how things are organised.";

    const REAL_LIST_SUMMARY: &str = "Rust has about forty keywords in use, plus a dozen or so reserved for the future. Here they are by group:\n\n- **Declaring things:** let, fn, struct, enum, trait, impl, type, const, static.\n- **Control flow:** if, else, match, loop, while, for, in, break, continue, return.\n- **Ownership and mutability:** mut, ref, move.\n- **Modules and paths:** use, pub, crate, self, super, extern, as.\n- **Other:** async, await, dyn, unsafe, where, true, false.\n\nDo you want me to go through each one and say what it does?";

    #[test]
    fn a_real_three_sentence_answer_from_claude_is_spoken_whole() {
        let text = SpokenText::from_reply(REAL_THREE_SENTENCES).unwrap();
        assert_eq!(text.as_str(), REAL_THREE_SENTENCES);
    }

    #[test]
    fn a_real_summary_of_a_long_list_from_claude_is_spoken_whole_with_its_offer() {
        let spoken = SpokenText::from_reply(REAL_LIST_SUMMARY).unwrap();
        let text = spoken.as_str();
        assert!(text.starts_with("Rust has about forty keywords in use, plus a dozen"));
        assert!(text.contains("Here they are by group. Declaring things: let, fn,"));
        assert!(text.contains("Other: async, await, dyn, unsafe, where, true, false."));
        assert!(text.ends_with("Do you want me to go through each one and say what it does?"));
        assert!(!text.contains('*') && !text.contains("chat") && !text.contains(OFFER_MORE));
    }

    #[test]
    fn a_reply_of_exactly_the_ceiling_is_spoken_whole() {
        let reply = vec!["word"; CEILING_WORDS].join(" ");
        let text = SpokenText::from_reply(&reply).unwrap();
        assert_eq!(text.as_str(), format!("{reply}."));
    }

    #[test]
    fn past_the_ceiling_the_reply_is_cut_at_a_sentence_end_and_offers_more_not_the_chat() {
        let sentence = format!("{}.", vec!["word"; 29].join(" "));
        let sentence = format!("word {sentence}");
        let long = [sentence.as_str(); 6].join(" ");
        let text = SpokenText::from_reply(&long).unwrap();
        let spoken = text.as_str().strip_suffix(OFFER_MORE).unwrap().trim_end();
        assert_eq!(spoken.split_whitespace().count(), 120);
        assert!(spoken.ends_with("word."));
        assert!(!text.as_str().contains("chat"));
    }

    #[test]
    fn runaway_text_with_no_sentence_end_is_cut_at_the_ceiling() {
        let long = vec!["word"; 500].join(" ");
        let text = SpokenText::from_reply(&long).unwrap();
        let spoken = text.as_str().strip_suffix(OFFER_MORE).unwrap().trim_end();
        assert_eq!(spoken.split_whitespace().count(), CEILING_WORDS);
        assert!(spoken.ends_with("word."));
    }

    #[test]
    fn a_refusal_kind_gets_a_phrase_that_is_true_for_it_and_an_unknown_kind_the_generic_one() {
        for (kind, phrase) in [
            ("not_found", Phrase::Gone),
            ("finished", Phrase::Gone),
            ("blocked", Phrase::NeedsYou),
            ("busy", Phrase::Busy),
            ("disconnected", Phrase::Disconnected),
            ("conflict", Phrase::NotRunning),
            ("anything_else", Phrase::NotRunning),
        ] {
            assert_eq!(Phrase::refused(kind), phrase, "{kind}");
        }
    }

    #[test]
    fn no_phrase_points_to_the_chat() {
        for phrase in Phrase::ALL {
            assert!(!phrase.words().to_lowercase().contains("chat"));
        }
    }

    #[test]
    fn code_tables_links_paths_and_ids_are_not_read_out() {
        let reply = "```\nlet x = 1;\n```\n| a | b |\nSee [the guide](http://x.y/z) at /home/me/notes with 3f9a1c7e5b2d4a6f8c01 done.";
        let text = SpokenText::from_reply(reply).unwrap();
        assert_eq!(text.as_str(), "See the guide at with done.");
    }

    #[test]
    fn commit_ids_and_terminal_ids_are_not_read_out() {
        let text = SpokenText::from_reply("Committed 3a80051a and pushed the change.").unwrap();
        assert_eq!(text.as_str(), "Committed and pushed the change.");
        for id in [
            "t8s",
            "w1:t3",
            "fleet-25",
            "voyage-1",
            "terminal-34",
            "t128",
        ] {
            let text = SpokenText::from_reply(&format!("Opened {id} for you.")).unwrap();
            assert_eq!(text.as_str(), "Opened for you.", "{id}");
        }
    }

    #[test]
    fn a_dropped_id_at_the_end_of_a_sentence_keeps_the_sentence_end() {
        let text =
            SpokenText::from_reply("Opened terminal t8s in fleet-25 on voyage-1. Then I stopped.")
                .unwrap();
        assert_eq!(text.as_str(), "Opened terminal in on. Then I stopped.");
    }

    #[test]
    fn ordinary_words_and_plain_numbers_are_kept() {
        let text = SpokenText::from_reply(
            "Changed 3 files on the 3rd try with 1,200 lines, 50% done, in defaced mode.",
        )
        .unwrap();
        assert_eq!(
            text.as_str(),
            "Changed 3 files on the 3rd try with 1,200 lines, 50% done, in defaced mode."
        );
    }

    #[test]
    fn a_hex_run_of_seven_or_more_with_a_digit_is_dropped_and_a_shorter_one_is_kept() {
        let long = SpokenText::from_reply("Built 1a2b3c4 first.").unwrap();
        assert_eq!(long.as_str(), "Built first.");
        let short = SpokenText::from_reply("Built 1a2b3c first.").unwrap();
        assert_eq!(short.as_str(), "Built 1a2b3c first.");
    }

    #[test]
    fn markdown_marks_are_dropped() {
        let text = SpokenText::from_reply("## **Renamed** the `build` fleet.").unwrap();
        assert_eq!(text.as_str(), "Renamed the build fleet.");
    }

    #[test]
    fn a_reply_with_nothing_speakable_gives_no_text() {
        assert!(SpokenText::from_reply("```\ncode only\n```").is_none());
        assert!(SpokenText::from_reply("   ").is_none());
    }

    #[test]
    fn the_hearing_prompt_lists_the_product_words_and_the_users_names_once() {
        let prompt = hearing_prompt(&["Harbor".into(), "Fleet".into()]);
        assert!(
            prompt.contains("dock, Fleet, Vessel, Voyage, Voyager, voyagershell, rename, maximize")
        );
        assert!(prompt.ends_with("Core, Harbor."));
        assert_eq!(prompt.matches("Fleet").count(), 1);
    }

    #[test]
    fn the_hearing_prompt_is_the_models_transcription_task_and_asks_for_nothing_else() {
        let prompt = hearing_prompt(&[]);
        assert_eq!(
            prompt,
            "Perform ASR in English. Words you may hear: dock, Fleet, Vessel, Voyage, Voyager, voyagershell, rename, maximize, Portal, Core."
        );
    }
}
