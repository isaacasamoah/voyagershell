mod git;
pub(crate) use git::{
    Error, check_live_directories, execute, list, open, remove, uncommitted_changes,
};
