use crate::launch::Defaults;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Caller {
    Person,
    Voyager,
    Agent,
}

impl Caller {
    pub fn launch_defaults(self) -> Defaults {
        match self {
            Self::Person | Self::Voyager => Defaults::Table,
            Self::Agent => Defaults::Plain,
        }
    }

    pub fn keeps_maximize(self) -> bool {
        match self {
            Self::Person | Self::Voyager => false,
            Self::Agent => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_an_agent_starts_plain_and_keeps_the_maximize() {
        for (caller, defaults, keeps) in [
            (Caller::Person, Defaults::Table, false),
            (Caller::Voyager, Defaults::Table, false),
            (Caller::Agent, Defaults::Plain, true),
        ] {
            assert_eq!(caller.launch_defaults(), defaults, "{caller:?}");
            assert_eq!(caller.keeps_maximize(), keeps, "{caller:?}");
        }
    }
}
