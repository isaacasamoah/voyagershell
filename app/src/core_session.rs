#[cfg(unix)]
pub fn running(session: &str) -> bool {
    std::os::unix::net::UnixStream::connect(crate::core_endpoint::endpoint(session)).is_ok()
}

#[cfg(not(unix))]
pub fn running(_session: &str) -> bool {
    false
}
