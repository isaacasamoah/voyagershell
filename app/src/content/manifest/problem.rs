use std::fmt;

const TYPE_ID_LIMIT: usize = 64;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Problem {
    pub path: String,
    pub message: String,
}

impl Problem {
    pub(crate) fn new(path: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            message: message.into(),
        }
    }
}

impl fmt::Display for Problem {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.path, self.message)
    }
}

pub(crate) fn valid_type_id(id: &str) -> bool {
    id.len() <= TYPE_ID_LIMIT
        && id.starts_with(|first: char| first.is_ascii_lowercase() || first.is_ascii_digit())
        && id.chars().all(|found| {
            found.is_ascii_lowercase() || found.is_ascii_digit() || matches!(found, '.' | '-' | '_')
        })
}
