use super::{CallError, Client, PendingCall};
use voyager_contract::{Action, Request, Response, Unanswered};

impl Client {
    pub fn inspect(&self) -> Result<Response, Unanswered> {
        self.call(Request {
            request_id: self.request_id(),
            expected_version: 0,
            action: Action::Inspect,
        })
    }

    pub fn call(&self, request: Request) -> Result<Response, Unanswered> {
        let id = request.request_id.clone();
        let answer = self
            .queue_workspace(None, request)
            .and_then(PendingCall::wait);
        answer.map_err(|error| match error {
            CallError::Rejected(message) => Unanswered::refused(id, message),
            CallError::Unconfirmed(message) => Unanswered::uncertain(id, message),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::super::Message;
    use super::*;
    use crate::core::Error;
    use crate::voyage_close::{Confirmed, execute};
    use serde_json::json;
    use std::sync::{Arc, atomic::AtomicU64};
    use std::thread;
    use voyager_contract::administrator::{
        ProcessAction, ProcessInfo, ProcessOutput, ProcessRequest, ProcessResponse,
    };
    use voyager_contract::voyage_close::Entry;
    use voyager_contract::{CoreTerminalId, Layout, Outcome, Reply, Status, VesselId, Voyage};

    const BUSY: &str = "Workspace busy or unavailable; nothing was queued";
    const SILENT: &str = "Workspace result unconfirmed; do not repeat the request";

    fn detached() -> (Client, async_channel::Receiver<Message>) {
        let (sender, queue) = async_channel::bounded(8);
        let client = Client {
            sender,
            sequence: Arc::new(AtomicU64::new(0)),
            identity: "reply-test".into(),
            activity: Arc::default(),
            prepared_context: Arc::default(),
            package_revision: Arc::new(AtomicU64::new(0)),
        };
        (client, queue)
    }

    fn inspect(id: &str) -> Request {
        Request {
            request_id: id.into(),
            expected_version: 0,
            action: Action::Inspect,
        }
    }

    fn fill(client: &Client) -> Vec<PendingCall> {
        (0..8)
            .map(|filler| {
                client
                    .queue_workspace(None, inspect(&format!("filler-{filler}")))
                    .unwrap()
            })
            .collect()
    }

    fn voyage() -> Voyage {
        serde_json::from_value(json!({"id": "voyage", "name": "Demo", "fleets": [], "portals": []}))
            .unwrap()
    }

    fn program(terminal: &str) -> Entry {
        Entry {
            vessel: VesselId(format!("vessel-{terminal}")),
            name: terminal.into(),
            type_id: "terminal".into(),
            terminal: Some(CoreTerminalId(terminal.into())),
            pid: Some(7),
        }
    }

    fn inspected(request: Request) -> Response {
        Response {
            request_id: request.request_id,
            status: Outcome::Applied,
            version: 1,
            layout: Arc::new(Layout {
                voyages: vec![voyage()],
                ..Layout::default()
            }),
            fresh: true,
            created_workspace: false,
            created_vessels: Vec::new(),
            message: None,
            close_plan: None,
        }
    }

    fn ended(request: ProcessRequest) -> Arc<ProcessResponse> {
        let ProcessAction::Stop {
            terminal_id,
            vessel_id,
            pid,
        } = request.input.action
        else {
            panic!("Expected a program stop");
        };
        let seen = |state: &str| ProcessInfo {
            vessel_id: vessel_id.clone(),
            terminal_id: terminal_id.clone(),
            pid: Some(pid),
            cwd: "/".into(),
            state: state.into(),
            foreground: None,
            agent_name: None,
            placement_names: Vec::new(),
            reported_activity: None,
        };
        Arc::new(ProcessResponse {
            request_id: request.request_id,
            status: Status::Applied,
            version: 1,
            fresh: true,
            output: Some(ProcessOutput::Stop {
                target: seen("live"),
                observed: seen("finished"),
            }),
            message: None,
        })
    }

    #[test]
    fn a_voyage_close_refused_before_any_program_stopped_is_a_refusal() {
        let (client, _queue) = detached();
        let _waiting = fill(&client);
        let closed = execute(&client, Confirmed::stopping(voyage(), vec![program("t1")]));
        assert!(matches!(
            closed,
            Err(Error::Rejected { kind, message }) if kind == "voyage_close" && message == BUSY
        ));
    }

    #[test]
    fn a_voyage_close_that_stopped_a_program_is_uncertain_when_a_later_step_is_refused() {
        let (client, queue) = detached();
        let caller = client.clone();
        let owner = thread::spawn(move || {
            let Ok(Message::Workspace { request, reply, .. }) = queue.recv_blocking() else {
                panic!("Expected the inspect before the first stop");
            };
            reply.send(inspected(request)).unwrap();
            let Ok(Message::Process { request, reply, .. }) = queue.recv_blocking() else {
                panic!("Expected the first stop");
            };
            let waiting = fill(&caller);
            reply.send(ended(request)).unwrap();
            (waiting, queue)
        });
        let closed = execute(
            &client,
            Confirmed::stopping(voyage(), vec![program("t1"), program("t2")]),
        );
        let (waiting, queue) = owner.join().unwrap();
        assert_eq!(queue.len(), waiting.len(), "A second stop was queued");
        assert!(matches!(
            closed,
            Err(Error::Uncertain(message))
                if message.starts_with("voyage_close: Workspace busy")
                    && message.ends_with("1 of this Voyage's programs had already stopped")
        ));
    }

    #[test]
    fn a_request_that_finds_the_queue_full_is_refused_and_never_queued() {
        let (client, queue) = detached();
        let waiting = fill(&client);
        let unanswered = client.call(inspect("ninth")).unwrap_err();
        assert_eq!(unanswered, Unanswered::refused("ninth".into(), BUSY.into()));
        assert_eq!(queue.len(), waiting.len());
        assert_eq!(
            serde_json::to_value(Reply::from(Err(unanswered))).unwrap(),
            json!({"requestId": "ninth", "status": "refused", "message": BUSY})
        );
    }

    #[test]
    fn a_request_the_owner_takes_and_never_answers_is_uncertain() {
        let (client, queue) = detached();
        let owner = thread::spawn(move || drop(queue.recv_blocking()));
        let unanswered = client.call(inspect("lost")).unwrap_err();
        owner.join().unwrap();
        assert_eq!(
            unanswered,
            Unanswered::uncertain("lost".into(), SILENT.into())
        );
        assert_eq!(
            serde_json::to_value(Reply::from(Err(unanswered))).unwrap(),
            json!({"requestId": "lost", "status": "uncertain", "message": SILENT})
        );
    }

    #[test]
    fn the_owners_answer_arrives_with_the_status_it_gave() {
        for status in [Outcome::Applied, Outcome::Refused, Outcome::Uncertain] {
            let (client, queue) = detached();
            let given = status.clone();
            let owner = thread::spawn(move || {
                let Ok(Message::Workspace { request, reply, .. }) = queue.recv_blocking() else {
                    panic!("Expected one workspace request");
                };
                let answer = Response {
                    request_id: request.request_id,
                    status: given,
                    version: 1,
                    layout: Arc::new(Layout::default()),
                    fresh: true,
                    created_workspace: false,
                    created_vessels: Vec::new(),
                    message: None,
                    close_plan: None,
                };
                reply.send(answer).unwrap();
            });
            let answered = client.call(inspect("answered")).unwrap();
            owner.join().unwrap();
            assert_eq!(answered.status, status);
            let wire = serde_json::to_value(Reply::from(Ok(answered))).unwrap();
            assert_eq!(wire["status"], serde_json::to_value(&status).unwrap());
            assert_eq!(wire["version"], "1");
        }
    }
}
