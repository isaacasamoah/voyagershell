pub const SAMPLE_RATE: u32 = 16_000;
pub const CEILING_WORDS: usize = 120;
pub const OFFER_MORE: &str = "I can say more if you ask.";
pub const PIECE_WORDS: usize = 25;
pub const CUT_AT_LIMIT: &str =
    "A spoken sentence had no comma within the piece limit, so it was cut at the limit.";

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
            phrase: Phrase::Gone,
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
    fn speak(&self, piece: Piece<'_>) -> Result<Clip, Fault>;
}

pub enum Engine {
    Pipeline {
        hearing: Box<dyn Hearing>,
        speaking: Box<dyn Speaking>,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpokenText {
    text: String,
    pieces: Vec<String>,
    cut_at_limit: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Piece<'a>(&'a str);

impl Piece<'_> {
    pub fn as_str(&self) -> &str {
        self.0
    }
}

impl SpokenText {
    pub fn as_str(&self) -> &str {
        &self.text
    }

    pub fn pieces(&self) -> impl Iterator<Item = Piece<'_>> {
        self.pieces.iter().map(|piece| Piece(piece))
    }

    pub fn cut_at_limit(&self) -> bool {
        self.cut_at_limit
    }

    pub fn from_reply(reply: &str) -> Option<Self> {
        let mut words: Vec<String> = Vec::new();
        for (line, closes) in speakable_lines(reply) {
            let first = words.len();
            for raw in line.split_whitespace() {
                match plain_word(raw) {
                    Some(word) => words.extend(spoken_numbers(&word)),
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
        let (mut kept, cut) = limit(words);
        let last = kept.last_mut()?;
        if !last.ends_with(['.', '!', '?']) {
            last.push('.');
        }
        if cut {
            kept.extend(OFFER_MORE.split_whitespace().map(str::to_owned));
        }
        let mut cut_at_limit = false;
        let pieces = sentences(&kept)
            .flat_map(|sentence| split_long(sentence, &mut cut_at_limit))
            .collect();
        Some(Self {
            text: kept.join(" "),
            pieces,
            cut_at_limit,
        })
    }
}

fn sentences(words: &[String]) -> impl Iterator<Item = &[String]> {
    words.split_inclusive(|word| word.ends_with(['.', '!', '?']) && !is_abbreviation(word))
}

fn split_long(mut words: &[String], cut_at_limit: &mut bool) -> Vec<String> {
    let mut pieces = Vec::new();
    while words.len() > PIECE_WORDS {
        let at = words[..PIECE_WORDS]
            .iter()
            .rposition(|word| word.ends_with([',', ';', ':']))
            .map_or_else(
                || {
                    *cut_at_limit = true;
                    PIECE_WORDS
                },
                |comma| comma + 1,
            );
        pieces.push(words[..at].join(" "));
        words = &words[at..];
    }
    if !words.is_empty() {
        pieces.push(words.join(" "));
    }
    pieces
}

fn spoken_numbers(word: &str) -> Vec<String> {
    let start = word.len() - word.trim_start_matches(['(', '"', '\'']).len();
    let end = word
        .trim_end_matches(['.', ',', ';', ':', '!', '?', ')', '"', '\''])
        .len()
        .max(start);
    let (lead, core, tail) = (&word[..start], &word[start..end], &word[end..]);
    let (number, percent) = match core.strip_suffix('%') {
        Some(number) => (number, true),
        None => (core, false),
    };
    let Some(mut spoken) = number_words(number) else {
        return vec![word.to_owned()];
    };
    if percent {
        spoken.push("percent".to_owned());
    }
    if let Some(first) = spoken.first_mut() {
        first.insert_str(0, lead);
    }
    if let Some(last) = spoken.last_mut() {
        last.push_str(tail);
    }
    spoken
}

fn number_words(number: &str) -> Option<Vec<String>> {
    let (whole, fraction) = match number.split_once('.') {
        Some((whole, fraction)) => (whole, Some(fraction)),
        None => (number, None),
    };
    let grouped = whole.split(',').enumerate().all(|(index, group)| {
        let digits = !group.is_empty() && group.chars().all(|character| character.is_ascii_digit());
        digits && (index == 0 && group.len() <= 3 || group.len() == 3)
    });
    let plain = !whole.is_empty() && whole.chars().all(|character| character.is_ascii_digit());
    if !(plain || whole.contains(',') && grouped) {
        return None;
    }
    let value: u64 = whole.replace(',', "").parse().ok()?;
    if value >= 1_000_000_000_000 {
        return None;
    }
    let mut words = integer_words(value);
    if let Some(fraction) = fraction {
        if fraction.is_empty() || !fraction.chars().all(|character| character.is_ascii_digit()) {
            return None;
        }
        words.push("point".to_owned());
        words.extend(
            fraction
                .chars()
                .filter_map(|digit| digit.to_digit(10))
                .map(|digit| ONES[digit as usize].to_owned()),
        );
    }
    Some(words)
}

const ONES: [&str; 20] = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
];
const TENS: [&str; 10] = [
    "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];
const SCALES: [(u64, &str); 3] = [
    (1_000_000_000, "billion"),
    (1_000_000, "million"),
    (1_000, "thousand"),
];

fn integer_words(value: u64) -> Vec<String> {
    if value == 0 {
        return vec![ONES[0].to_owned()];
    }
    let mut words = Vec::new();
    let mut rest = value;
    for (scale, name) in SCALES {
        if rest >= scale {
            words.extend(below_thousand(rest / scale));
            words.push(name.to_owned());
            rest %= scale;
        }
    }
    words.extend(below_thousand(rest));
    words
}

fn below_thousand(value: u64) -> Vec<String> {
    let mut words = Vec::new();
    let hundreds = value / 100;
    let rest = (value % 100) as usize;
    if hundreds > 0 {
        words.push(ONES[hundreds as usize].to_owned());
        words.push("hundred".to_owned());
    }
    match rest {
        0 => {}
        1..20 => words.push(ONES[rest].to_owned()),
        _ if rest.is_multiple_of(10) => words.push(TENS[rest / 10].to_owned()),
        _ => words.push(format!("{}-{}", TENS[rest / 10], ONES[rest % 10])),
    }
    words
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
            (Standing::NotRunning, Phrase::Gone),
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
        assert_eq!(text.as_str(), "Fleets. Build. Review. one. Home.");
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
    fn ordinary_words_are_kept_and_numbers_are_spoken_as_words() {
        let text = SpokenText::from_reply(
            "Changed 3 files on the 3rd try with 1,200 lines, 50% done, in defaced mode.",
        )
        .unwrap();
        assert_eq!(
            text.as_str(),
            "Changed three files on the 3rd try with one thousand two hundred lines, fifty percent done, in defaced mode."
        );
    }

    #[test]
    fn decimals_large_numbers_and_numbers_in_brackets_are_spoken_as_words() {
        let text = SpokenText::from_reply(
            "Memory peaked at 6.5 gigabytes (38 checks), after 2,026,105 rows and 0.25 of the time.",
        )
        .unwrap();
        assert_eq!(
            text.as_str(),
            "Memory peaked at six point five gigabytes (thirty-eight checks), after two million twenty-six thousand one hundred five rows and zero point two five of the time."
        );
    }

    #[test]
    fn digits_that_are_not_a_plain_number_are_left_alone() {
        for word in ["4:20", "1,2,3", "12,34", "1.2.3", "3rd", "1a2b3c"] {
            let text = SpokenText::from_reply(&format!("Then {word} came.")).unwrap();
            assert_eq!(text.as_str(), format!("Then {word} came."), "{word}");
        }
    }

    fn piece_texts(text: &SpokenText) -> Vec<String> {
        text.pieces()
            .map(|piece| piece.as_str().to_owned())
            .collect()
    }

    #[test]
    fn each_sentence_is_its_own_piece_and_the_pieces_hold_every_word_in_order() {
        let text = SpokenText::from_reply(
            "The build passed. Two tests were slow!\n\n- Review\nWant the rest?",
        )
        .unwrap();
        assert_eq!(
            piece_texts(&text),
            [
                "The build passed.",
                "Two tests were slow!",
                "Review.",
                "Want the rest?"
            ]
        );
        assert_eq!(piece_texts(&text).join(" "), text.as_str());
        assert!(!text.cut_at_limit());
    }

    #[test]
    fn an_abbreviation_does_not_end_a_piece() {
        let text =
            SpokenText::from_reply("Use a short name, e.g. Build, for it. Then dock.").unwrap();
        assert_eq!(
            piece_texts(&text),
            ["Use a short name, e.g. Build, for it.", "Then dock."]
        );
    }

    #[test]
    fn a_sentence_over_the_piece_limit_splits_at_its_last_comma_within_the_limit() {
        let first = vec!["word"; 18].join(" ");
        let second = vec!["more"; 14].join(" ");
        let reply = format!("{first}, then {second}.");
        let text = SpokenText::from_reply(&reply).unwrap();
        let pieces = piece_texts(&text);
        assert_eq!(pieces, [format!("{first},"), format!("then {second}.")]);
        assert!(
            pieces
                .iter()
                .all(|piece| piece.split_whitespace().count() <= PIECE_WORDS)
        );
        assert_eq!(pieces.join(" "), text.as_str());
        assert!(!text.cut_at_limit());
    }

    #[test]
    fn a_sentence_over_the_piece_limit_with_no_comma_is_cut_at_the_limit_and_says_so() {
        let reply = format!("{}.", vec!["word"; 60].join(" "));
        let text = SpokenText::from_reply(&reply).unwrap();
        let counts: Vec<usize> = text
            .pieces()
            .map(|piece| piece.as_str().split_whitespace().count())
            .collect();
        assert_eq!(counts, [PIECE_WORDS, PIECE_WORDS, 10]);
        assert_eq!(piece_texts(&text).join(" "), text.as_str());
        assert!(text.cut_at_limit());
    }

    #[test]
    fn the_offer_of_more_is_its_own_piece() {
        let long = format!("{}.", vec!["word"; 500].join(" "));
        let text = SpokenText::from_reply(&long).unwrap();
        assert_eq!(
            text.pieces().last().map(|piece| piece.as_str().to_owned()),
            Some(OFFER_MORE.to_owned())
        );
        assert!(
            text.pieces()
                .all(|piece| piece.as_str().split_whitespace().count() <= PIECE_WORDS)
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
