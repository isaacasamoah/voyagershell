pub const SAMPLE_RATE: u32 = 16_000;
pub const MAX_SENTENCES: usize = 2;
pub const MAX_WORDS: usize = 30;
pub const REST_IN_CHAT: &str = "The rest is in the chat.";

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
    Blocked,
}

impl Phrase {
    pub const ALL: [Phrase; 8] = [
        Phrase::Asking,
        Phrase::OkayAsking,
        Phrase::Queued,
        Phrase::NeedsYou,
        Phrase::NotRunning,
        Phrase::Missed,
        Phrase::Failed,
        Phrase::Blocked,
    ];

    pub fn words(self) -> &'static str {
        match self {
            Phrase::Asking => "Asking Voyager.",
            Phrase::OkayAsking => "Okay, asking Voyager.",
            Phrase::Queued => "Queued for Voyager.",
            Phrase::NeedsYou => "Voyager needs you on Home first.",
            Phrase::NotRunning => "Voyager isn't running. Resume it in the chat.",
            Phrase::Missed => "I didn't catch that.",
            Phrase::Failed => "That didn't work. The reason is in the chat.",
            Phrase::Blocked => "I need you on Home.",
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
            Phrase::Blocked => "blocked",
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

pub fn heard_nothing(heard: &str) -> bool {
    !heard.chars().any(char::is_alphanumeric)
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

    pub fn from_reply(reply: &str) -> Option<Self> {
        let (paragraph, more) = first_paragraph(reply)?;
        let mut words: Vec<String> = Vec::new();
        for raw in paragraph.split_whitespace() {
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
        let (kept, cut) = limit(&words);
        if kept.is_empty() {
            return None;
        }
        let mut text = kept.join(" ");
        if !text.ends_with(['.', '!', '?']) {
            text.push('.');
        }
        if cut || more {
            text.push(' ');
            text.push_str(REST_IN_CHAT);
        }
        Some(Self(text))
    }
}

fn first_paragraph(reply: &str) -> Option<(String, bool)> {
    let mut fenced = false;
    let mut paragraphs: Vec<Vec<&str>> = vec![Vec::new()];
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
            if paragraphs.last().is_some_and(|last| !last.is_empty()) {
                paragraphs.push(Vec::new());
            }
            continue;
        }
        if let Some(last) = paragraphs.last_mut() {
            last.push(trimmed);
        }
    }
    paragraphs.retain(|paragraph| !paragraph.is_empty());
    let more = paragraphs.len() > 1;
    paragraphs
        .into_iter()
        .next()
        .map(|lines| (lines.join(" "), more))
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

fn limit(words: &[String]) -> (Vec<&str>, bool) {
    let mut kept = Vec::new();
    let mut sentences = 0;
    for (index, word) in words.iter().enumerate() {
        if kept.len() == MAX_WORDS {
            return (kept, true);
        }
        kept.push(word.as_str());
        if word.ends_with(['.', '!', '?']) && !is_abbreviation(word) {
            sentences += 1;
            if sentences == MAX_SENTENCES {
                return (kept, index + 1 < words.len());
            }
        }
    }
    (kept, false)
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
    format!(
        "Transcribe the audio exactly as spoken. Output only the words, nothing else. The speaker is using a workspace app. Words you may hear: {}.",
        words.join(", ")
    )
}

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
            assert!(heard_nothing(heard), "{heard:?}");
        }
        assert!(!heard_nothing("Rename it"));
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

    #[test]
    fn heard_text_loses_control_tokens_and_extra_space() {
        assert_eq!(
            clean_heard(" Rename  this\nfleet.<|im_end|> "),
            "Rename this fleet."
        );
        assert_eq!(clean_heard("<|im_end|>"), "");
    }

    #[test]
    fn only_the_first_paragraph_is_spoken_and_the_rest_is_pointed_to() {
        let text = SpokenText::from_reply("Renamed the fleet.\n\nI also tidied the tabs.").unwrap();
        assert_eq!(text.as_str(), "Renamed the fleet. The rest is in the chat.");
    }

    #[test]
    fn a_short_reply_is_spoken_whole_with_no_pointer() {
        let text = SpokenText::from_reply("Done. The fleet is now called Build.").unwrap();
        assert_eq!(text.as_str(), "Done. The fleet is now called Build.");
    }

    #[test]
    fn two_sentences_is_the_limit() {
        let text = SpokenText::from_reply("One. Two. Three.").unwrap();
        assert_eq!(text.as_str(), "One. Two. The rest is in the chat.");
    }

    #[test]
    fn thirty_words_is_the_limit() {
        let long = vec!["word"; 40].join(" ");
        let text = SpokenText::from_reply(&long).unwrap();
        let spoken = text.as_str().strip_suffix(REST_IN_CHAT).unwrap();
        assert_eq!(spoken.split_whitespace().count(), MAX_WORDS);
        assert!(text.as_str().ends_with(REST_IN_CHAT));
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
}
