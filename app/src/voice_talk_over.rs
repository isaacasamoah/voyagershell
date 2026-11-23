const BACKCHANNELS: [&str; 7] = ["yeah", "mm-hm", "uh-huh", "okay", "right", "sure", "got it"];
const STOPS: [&str; 6] = ["stop", "wait", "hang on", "hold on", "never mind", "shush"];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Interjection {
    Backchannel,
    Stop,
    Steer,
}

fn letters(words: &str) -> String {
    words
        .chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

pub fn interjection(heard: &str) -> Interjection {
    let heard = letters(heard);
    let holds = |table: &[&str]| table.iter().any(|entry| letters(entry) == heard);
    if holds(&BACKCHANNELS) {
        Interjection::Backchannel
    } else if holds(&STOPS) {
        Interjection::Stop
    } else {
        Interjection::Steer
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_backchannel_or_a_stop_is_the_whole_utterance_whatever_its_case_and_punctuation() {
        for heard in [
            "yeah", "Yeah.", " Mm-hm. ", "mm hm", "Uh-huh!", "Okay", "right?", "Sure.", "Got it.",
        ] {
            assert_eq!(interjection(heard), Interjection::Backchannel, "{heard}");
        }
        for heard in [
            "Stop.",
            "wait",
            "Hang on!",
            "hold on",
            "Never mind.",
            "Shush",
        ] {
            assert_eq!(interjection(heard), Interjection::Stop, "{heard}");
        }
    }

    #[test]
    fn a_sentence_that_holds_a_listed_word_steers() {
        for heard in [
            "yeah but wait, open the logs",
            "Yeah, yeah.",
            "Stop the build.",
            "wait for the tests",
            "okay now open the roadmap",
            "right click it",
        ] {
            assert_eq!(interjection(heard), Interjection::Steer, "{heard}");
        }
    }
}
