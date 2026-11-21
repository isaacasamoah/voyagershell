use crate::{
    client::{Client, ProgramError, ProgramReply, ProgramRequest},
    speech::{Phrase, Standing},
    voice_parts::{SendFailure, Voyager},
    voyager_binding::Binding,
};
use std::path::PathBuf;

pub type Notes = std::sync::Arc<dyn Fn(&str) + Send + Sync>;

pub struct Bound {
    client: Client,
    profile: PathBuf,
    notes: Option<Notes>,
}

impl Bound {
    pub fn new(client: Client, profile: PathBuf) -> Self {
        Self {
            client,
            profile,
            notes: None,
        }
    }

    pub fn with_notes(mut self, notes: Notes) -> Self {
        self.notes = Some(notes);
        self
    }

    fn terminal(&self) -> Option<String> {
        Binding::load(&self.profile)
            .terminal()
            .map(|terminal| terminal.0)
    }
}

pub fn standing_of(live: bool, state: Option<&str>) -> Standing {
    match (live, state) {
        (false, _) => Standing::NotRunning,
        (true, Some("working")) => Standing::Working,
        (true, Some("blocked")) => Standing::Blocked,
        (true, Some("idle" | "done" | "error")) => Standing::Idle,
        (true, _) => Standing::Unknown,
    }
}

pub fn standing_from(read: Result<ProgramReply, ProgramError>) -> Standing {
    match read {
        Ok(ProgramReply::Status { live, state }) => standing_of(live, state.as_deref()),
        _ => Standing::Unknown,
    }
}

pub fn refusal(error: &ProgramError) -> String {
    match error {
        ProgramError::Rejected { message, .. } => format!("Not sent. {message}"),
        ProgramError::Uncertain(message) => {
            format!("The send is unconfirmed and was not repeated. {message}")
        }
    }
}

pub fn failure_of(error: &ProgramError) -> SendFailure {
    SendFailure {
        reason: refusal(error),
        refused: matches!(error, ProgramError::Rejected { .. }),
        phrase: match error {
            ProgramError::Rejected { kind, .. } => Phrase::refused(kind),
            ProgramError::Uncertain(_) => Phrase::NotRunning,
        },
    }
}

impl Voyager for Bound {
    fn standing(&self) -> Standing {
        let Some(terminal) = self.terminal() else {
            return Standing::NotRunning;
        };
        standing_from(self.client.service(ProgramRequest::Status { terminal }))
    }

    fn say(&self, text: &str) -> Result<(), SendFailure> {
        let terminal = self.terminal().ok_or_else(|| SendFailure {
            reason: "Not sent. Voyager is not bound to the avatar.".to_owned(),
            refused: true,
            phrase: Phrase::Gone,
        })?;
        self.client
            .service(ProgramRequest::Send {
                terminal,
                text: text.to_owned(),
            })
            .map(|_| ())
            .map_err(|error| failure_of(&error))
    }

    fn note(&self, line: &str) {
        if let Some(notes) = &self.notes {
            notes(line);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_live_program_that_reports_nothing_is_unknown_and_the_idle_words_are_idle() {
        assert_eq!(standing_of(true, None), Standing::Unknown);
        for state in ["idle", "done", "error"] {
            assert_eq!(standing_of(true, Some(state)), Standing::Idle, "{state}");
        }
    }

    #[test]
    fn working_and_blocked_are_read_from_the_programs_own_report() {
        assert_eq!(standing_of(true, Some("working")), Standing::Working);
        assert_eq!(standing_of(true, Some("blocked")), Standing::Blocked);
    }

    #[test]
    fn a_program_that_is_gone_is_not_running_whatever_it_last_said() {
        assert_eq!(standing_of(false, Some("working")), Standing::NotRunning);
        assert_eq!(standing_of(false, None), Standing::NotRunning);
    }

    #[test]
    fn a_failed_read_of_core_is_unknown_and_never_not_running() {
        let lost = ProgramError::Uncertain("Core did not answer".into());
        assert_eq!(standing_from(Err(lost)), Standing::Unknown);
        let refused = ProgramError::Rejected {
            kind: "not_found".into(),
            message: "no such program".into(),
        };
        assert_eq!(standing_from(Err(refused)), Standing::Unknown);
    }

    #[test]
    fn a_refusal_from_core_is_known_and_an_unconfirmed_send_is_not() {
        let removed = ProgramError::Rejected {
            kind: "not_found".into(),
            message: "no such terminal".into(),
        };
        let known = failure_of(&removed);
        assert!(known.refused);
        assert_eq!(known.reason, "Not sent. no such terminal");
        let lost = failure_of(&ProgramError::Uncertain("no answer".into()));
        assert!(!lost.refused);
        assert!(lost.reason.contains("not repeated"));
    }

    #[test]
    fn a_program_core_reports_ended_or_gone_is_not_running() {
        for state in [None, Some("done"), Some("working")] {
            let ended = standing_from(Ok(ProgramReply::Status {
                live: false,
                state: state.map(str::to_owned),
            }));
            assert_eq!(ended, Standing::NotRunning);
        }
    }

    #[test]
    fn an_unclear_answer_is_unknown() {
        assert_eq!(
            standing_from(Ok(ProgramReply::Status {
                live: true,
                state: Some("starting".into())
            })),
            Standing::Unknown
        );
        assert_eq!(standing_from(Ok(ProgramReply::Sent)), Standing::Unknown);
        assert_eq!(
            standing_from(Ok(ProgramReply::Live(true))),
            Standing::Unknown
        );
    }

    #[test]
    fn only_an_answer_that_says_not_working_counts_as_idle() {
        let said = |live, state: Option<&str>| {
            standing_from(Ok(ProgramReply::Status {
                live,
                state: state.map(str::to_owned),
            }))
        };
        assert_eq!(said(true, Some("done")), Standing::Idle);
        assert_eq!(said(true, None), Standing::Unknown);
        assert_eq!(said(false, None), Standing::NotRunning);
        assert_eq!(said(true, Some("working")), Standing::Working);
    }

    #[test]
    fn a_refused_send_says_it_was_not_sent_and_an_uncertain_one_says_it_was_not_repeated() {
        let refused = ProgramError::Rejected {
            kind: "blocked".into(),
            message: "Voyager needs you".into(),
        };
        assert_eq!(refusal(&refused), "Not sent. Voyager needs you");
        let lost = refusal(&ProgramError::Uncertain("no reply".into()));
        assert!(lost.contains("unconfirmed") && lost.contains("not repeated"));
    }
}
