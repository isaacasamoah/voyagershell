pub(crate) fn valid(session: &str) -> bool {
    session.starts_with("voyager-")
        && session
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}
