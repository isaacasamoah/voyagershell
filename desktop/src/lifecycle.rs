use voyager_app::client::Lifecycle;

#[derive(Clone)]
pub struct Requests(async_channel::Sender<Lifecycle>);

impl Requests {
    pub fn channel() -> (Self, async_channel::Receiver<Lifecycle>) {
        let (sender, receiver) = async_channel::bounded(1);
        (Self(sender), receiver)
    }

    pub fn quit(&self) {
        let _ = self.0.try_send(Lifecycle::QuitAndKeep);
    }

    pub fn stop_session(&self) {
        let _ = self.0.try_send(Lifecycle::StopSession);
    }
}

#[cfg(test)]
mod tests {
    use super::Requests;
    use voyager_app::client::Lifecycle;

    #[test]
    fn quit_requests_quit_and_keep_and_never_stop_the_session() {
        let (requests, received) = Requests::channel();
        requests.quit();
        assert_eq!(received.try_recv(), Ok(Lifecycle::QuitAndKeep));
        assert!(received.try_recv().is_err());
    }

    #[test]
    fn stop_session_requests_only_stop_session() {
        let (requests, received) = Requests::channel();
        requests.stop_session();
        assert_eq!(received.try_recv(), Ok(Lifecycle::StopSession));
        assert!(received.try_recv().is_err());
    }
}
