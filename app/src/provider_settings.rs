#[path = "claude.rs"]
mod claude;
#[path = "codex.rs"]
mod codex;
use crate::provider::{Event, Provider};
#[cfg(test)]
pub(crate) use codex::{
    encode_tool_reply as codex_reply, normalize as codex_event, reported_version as codex_version,
};
use serde::Deserialize;
use std::{fs, io::ErrorKind, path::Path, sync::mpsc::SyncSender};
use voyager_contract::voice::Capability;

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Kind {
    #[default]
    Codex,
    Claude,
}

impl Kind {
    fn defaults(self) -> (&'static str, &'static str) {
        match self {
            Self::Codex => (codex::DEFAULT_MODEL, codex::DEFAULT_EFFORT),
            Self::Claude => (claude::DEFAULT_MODEL, claude::DEFAULT_EFFORT),
        }
    }

    pub(crate) fn instructions(self) -> &'static str {
        match self {
            Self::Codex => codex::INSTRUCTIONS,
            Self::Claude => claude::INSTRUCTIONS,
        }
    }

    pub(crate) fn voice(self) -> Capability {
        match self {
            Self::Codex => codex::Codex::voice_capability(),
            Self::Claude => claude::voice_capability(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Settings {
    pub provider: Kind,
    pub model: String,
    pub effort: String,
    pub prompt: Option<String>,
}

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct Stored {
    provider: Option<Kind>,
    model: Option<String>,
    effort: Option<String>,
    prompt: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self::resolve(Stored::default())
    }
}

impl Settings {
    fn resolve(stored: Stored) -> Self {
        let provider = stored.provider.unwrap_or_default();
        let (model, effort) = provider.defaults();
        Self {
            provider,
            model: stored.model.unwrap_or_else(|| model.into()),
            effort: stored.effort.unwrap_or_else(|| effort.into()),
            prompt: stored.prompt,
        }
    }

    pub(crate) fn read(profile: &Path) -> Result<Self, String> {
        let stored = match fs::read(profile.join("conversation.json")) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| {
                format!("Invalid conversation settings: {error}; no turn was submitted")
            })?,
            Err(error) if error.kind() == ErrorKind::NotFound => Stored::default(),
            Err(error) => return Err(error.to_string()),
        };
        let settings = Self::resolve(stored);
        if settings.model.trim().is_empty()
            || settings.model.len() > 128
            || settings.effort.trim().is_empty()
            || settings.effort.len() > 32
            || settings
                .prompt
                .as_ref()
                .is_some_and(|prompt| prompt.trim().is_empty())
        {
            return Err("Conversation settings require non-empty model, effort and prompt strings within their limits; no turn was submitted".into());
        }
        Ok(settings)
    }

    pub(crate) fn open(
        &self,
        cwd: &Path,
        session: &str,
        events: SyncSender<Result<Event, String>>,
    ) -> Result<Box<dyn Provider>, String> {
        match self.provider {
            Kind::Codex => Ok(Box::new(codex::Codex::open(cwd, events)?)),
            Kind::Claude => Ok(Box::new(claude::Claude::open(
                &claude::Options {
                    cwd,
                    session,
                    model: &self.model,
                    effort: &self.effort,
                    prompt: self
                        .prompt
                        .as_deref()
                        .unwrap_or(self.provider.instructions()),
                },
                events,
            )?)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_settings_use_the_providers_defaults_and_malformed_ones_can_be_corrected() {
        let profile =
            std::env::temp_dir().join(format!("voyager-provider-settings-{}", std::process::id()));
        fs::create_dir(&profile).unwrap();
        let defaults = Settings::read(&profile).unwrap();
        assert_eq!(defaults, Settings::default());
        assert_eq!(
            (
                defaults.provider,
                defaults.model.as_str(),
                defaults.effort.as_str()
            ),
            (Kind::Codex, codex::DEFAULT_MODEL, codex::DEFAULT_EFFORT)
        );
        assert!(defaults.prompt.is_none());
        for invalid in [
            "{",
            r#"{"effort":false}"#,
            r#"{"model":""}"#,
            r#"{"prompt":"  "}"#,
            r#"{"provider":"unknown"}"#,
            r#"{"unexpected":true}"#,
        ] {
            fs::write(profile.join("conversation.json"), invalid).unwrap();
            assert!(Settings::read(&profile).is_err(), "{invalid} was accepted");
        }
        fs::write(
            profile.join("conversation.json"),
            r#"{"provider":"codex","model":"configured-model","prompt":"Configured policy"}"#,
        )
        .unwrap();
        assert_eq!(
            Settings::read(&profile).unwrap(),
            Settings {
                provider: Kind::Codex,
                model: "configured-model".into(),
                effort: codex::DEFAULT_EFFORT.into(),
                prompt: Some("Configured policy".into()),
            }
        );
        fs::write(
            profile.join("conversation.json"),
            r#"{"provider":"claude"}"#,
        )
        .unwrap();
        let claude = Settings::read(&profile).unwrap();
        assert_eq!(
            (
                claude.provider,
                claude.model.as_str(),
                claude.effort.as_str(),
                claude.provider.instructions()
            ),
            (
                Kind::Claude,
                claude::DEFAULT_MODEL,
                claude::DEFAULT_EFFORT,
                claude::INSTRUCTIONS
            )
        );
        assert!(matches!(
            claude.provider.voice(),
            Capability::Unavailable { .. }
        ));
        assert!(!profile.join("conversation").exists());
        fs::remove_dir_all(profile).unwrap();
    }
}
