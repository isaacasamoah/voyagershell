use std::env;

pub const TALK_OVER_VARIABLE: &str = "VOYAGER_VOICE_TALK_OVER";

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum TalkOver {
    #[default]
    Auto,
    On,
    Off,
}

impl TalkOver {
    pub fn from_environment() -> Self {
        let value =
            env::var_os(TALK_OVER_VARIABLE).map(|value| value.to_string_lossy().into_owned());
        let (talk_over, unknown) = named(value.as_deref());
        if let Some(unknown) = unknown {
            eprintln!("{TALK_OVER_VARIABLE} is '{unknown}'; using auto");
        }
        talk_over
    }
}

fn named(value: Option<&str>) -> (TalkOver, Option<&str>) {
    let Some(value) = value else {
        return (TalkOver::Auto, None);
    };
    match value.to_ascii_lowercase().as_str() {
        "auto" => (TalkOver::Auto, None),
        "on" => (TalkOver::On, None),
        "off" => (TalkOver::Off, None),
        _ => (TalkOver::Auto, Some(value)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unset_means_auto_and_auto_on_and_off_are_read_in_any_letter_case() {
        for (value, talk_over) in [
            (None, TalkOver::Auto),
            (Some("auto"), TalkOver::Auto),
            (Some("on"), TalkOver::On),
            (Some("off"), TalkOver::Off),
            (Some("Auto"), TalkOver::Auto),
            (Some("ON"), TalkOver::On),
            (Some("Off"), TalkOver::Off),
        ] {
            assert_eq!(named(value), (talk_over, None), "{value:?}");
        }
    }

    #[test]
    fn an_unknown_value_means_auto_and_is_reported() {
        for value in ["onn", "", "yes", " on", "0"] {
            assert_eq!(
                named(Some(value)),
                (TalkOver::Auto, Some(value)),
                "{value:?}"
            );
        }
    }
}
