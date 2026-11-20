use crate::{
    client::{Client, ProgramError, ProgramReply, ProgramRequest},
    speech::Standing,
    voice_parts::Voyager,
    voyager_binding::Binding,
};
use std::path::PathBuf;

pub struct Bound {
    client: Client,
    profile: PathBuf,
}

impl Bound {
    pub fn new(client: Client, profile: PathBuf) -> Self {
        Self { client, profile }
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
        (true, _) => Standing::Idle,
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

impl Voyager for Bound {
    fn standing(&self) -> Standing {
        let Some(terminal) = self.terminal() else {
            return Standing::NotRunning;
        };
        match self.client.service(ProgramRequest::Status { terminal }) {
            Ok(ProgramReply::Status { live, state }) => standing_of(live, state.as_deref()),
            _ => Standing::NotRunning,
        }
    }

    fn say(&self, text: &str) -> Result<(), String> {
        let terminal = self
            .terminal()
            .ok_or_else(|| "Not sent. Voyager is not bound to the avatar.".to_owned())?;
        self.client
            .service(ProgramRequest::Send {
                terminal,
                text: text.to_owned(),
            })
            .map(|_| ())
            .map_err(|error| refusal(&error))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_live_program_that_reports_nothing_counts_as_idle() {
        assert_eq!(standing_of(true, None), Standing::Idle);
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
