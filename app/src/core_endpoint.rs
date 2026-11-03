use std::{env, path::PathBuf};

#[cfg(unix)]
use std::ffi::OsString;

#[cfg(unix)]
fn unix_endpoint(
    session: &str,
    runtime: Option<OsString>,
    state: PathBuf,
    user_runtime: Option<PathBuf>,
) -> PathBuf {
    let root = runtime
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or(user_runtime);
    root.map_or_else(
        || state.join("herdr-core").join(session),
        |path| path.join("herdr-core"),
    )
    .join(format!("{session}.sock"))
}

#[cfg(unix)]
pub(crate) fn endpoint(session: &str) -> PathBuf {
    let uid = unsafe { libc::getuid() };
    let user_runtime = PathBuf::from(format!("/run/user/{uid}"));
    let state = env::var_os("XDG_STATE_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env::var_os("HOME").unwrap_or_else(|| "/".into())).join(".local/state")
        });
    unix_endpoint(
        session,
        env::var_os("XDG_RUNTIME_DIR"),
        state,
        user_runtime.is_dir().then_some(user_runtime),
    )
}

#[cfg(windows)]
pub(crate) fn endpoint(session: &str) -> PathBuf {
    let user: String = env::var("USERNAME")
        .unwrap_or_default()
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .collect();
    PathBuf::from(r"\\.\pipe\").join(format!("herdr-core-{user}-{session}.sock"))
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn selects_the_same_session_endpoint_as_core() {
        let state = PathBuf::from("/state");
        let user = Some(PathBuf::from("/run/user/42"));
        assert_eq!(
            unix_endpoint(
                "voyager-test",
                Some("/runtime".into()),
                state.clone(),
                user.clone()
            ),
            PathBuf::from("/runtime/herdr-core/voyager-test.sock")
        );
        assert_eq!(
            unix_endpoint(
                "voyager-test",
                Some(OsString::new()),
                state.clone(),
                user.clone()
            ),
            PathBuf::from("/run/user/42/herdr-core/voyager-test.sock")
        );
        assert_eq!(
            unix_endpoint("voyager-test", None, state.clone(), user),
            PathBuf::from("/run/user/42/herdr-core/voyager-test.sock")
        );
        assert_eq!(
            unix_endpoint("voyager-test", None, state, None),
            PathBuf::from("/state/herdr-core/voyager-test/voyager-test.sock")
        );
    }
}
