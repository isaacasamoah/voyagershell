use super::{CallError, Client};
use crate::families::voyage_close::Calls;
use std::sync::Arc;
use voyager_contract::administrator::{ProcessInput, ProcessRequest, ProcessResponse};
use voyager_contract::{Action, Context, Request, Response, Unanswered, VesselId};

impl Client {
    pub fn replies(&self) -> crate::replies::Replies {
        self.replies.clone()
    }

    pub fn inspect(&self) -> Result<Response, Unanswered> {
        self.call(Request {
            request_id: self.request_id(),
            expected_version: 0,
            action: Action::Inspect,
        })
    }

    pub fn take_placement_notice(&self) -> Option<String> {
        self.placement_notice
            .lock()
            .ok()
            .and_then(|mut notice| notice.take())
    }

    pub fn call(&self, request: Request) -> Result<Response, Unanswered> {
        self.answer(None, request)
    }

    pub(crate) fn program_call(
        &self,
        vessel: VesselId,
        request: Request,
    ) -> Result<Response, Unanswered> {
        self.answer(Some(vessel), request)
    }

    fn answer(&self, program: Option<VesselId>, request: Request) -> Result<Response, Unanswered> {
        let id = request.request_id.clone();
        self.ask(None, program, request)
            .map_err(|error| match error {
                CallError::Rejected(message) => Unanswered::refused(id, message),
                CallError::Unconfirmed(message) => Unanswered::uncertain(id, message),
            })
    }
}

impl Calls for Client {
    fn inspected(&self) -> Result<Response, Unanswered> {
        self.inspect()
    }

    fn stopped(
        &self,
        scope: Context,
        input: ProcessInput,
    ) -> Result<Arc<ProcessResponse>, CallError> {
        self.process(
            scope,
            ProcessRequest {
                request_id: self.request_id(),
                input,
            },
        )
    }
}

#[cfg(test)]
mod tests {
    use super::super::{Message, PendingCall};
    use super::*;
    use crate::core::Error;
    use crate::families::voyage_close::{Confirmed, execute};
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
    const CANCELLED: &str = "Workspace busy; the workspace request was still queued when its wait ended, so it was cancelled and nothing was sent";

    fn detached() -> (Client, async_channel::Receiver<Message>) {
        let (sender, queue) = async_channel::bounded(8);
        let client = Client {
            sender,
            sequence: Arc::new(AtomicU64::new(0)),
            identity: "reply-test".into(),
            activity: Arc::default(),
            prepared_context: Arc::default(),
            placement_notice: Arc::default(),
            replies: crate::replies::Replies::default(),
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
                    .queue_workspace(None, None, inspect(&format!("filler-{filler}")))
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
        let owner = thread::spawn(move || {
            let Ok(Message::Workspace { claim, reply, .. }) = queue.recv_blocking() else {
                panic!("Expected one workspace request");
            };
            assert!(claim.take());
            drop(reply);
        });
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
    fn a_request_still_queued_when_its_wait_ends_is_cancelled_and_refused() {
        let (client, queue) = detached();
        let PendingCall(receive, _, claim) = client
            .queue_workspace(None, None, inspect("queued"))
            .unwrap();
        let waited = PendingCall(receive, std::time::Duration::from_millis(20), claim).wait();
        assert!(matches!(waited, Err(CallError::Rejected(message)) if message == CANCELLED));
        let Ok(Message::Workspace { claim, .. }) = queue.try_recv() else {
            panic!("Expected the cancelled request in the queue");
        };
        assert!(
            !claim.take(),
            "the owner skips a request its caller cancelled"
        );
    }

    #[test]
    fn a_caller_whose_wait_ended_asks_the_owner_by_the_same_request_identity() {
        let (client, queue) = detached();
        let owner = thread::spawn(move || {
            let Ok(Message::Workspace {
                claim,
                request,
                reply: unanswered,
                ..
            }) = queue.recv_blocking()
            else {
                panic!("Expected the first request");
            };
            assert!(claim.take());
            drop(unanswered);
            let Ok(Message::Workspace {
                claim,
                request: asked,
                reply,
                ..
            }) = queue.recv_blocking()
            else {
                panic!("Expected the ask");
            };
            assert!(claim.take());
            assert_eq!(
                asked, request,
                "the ask repeats the request and its identity"
            );
            reply.send(inspected(asked)).unwrap();
        });
        let answered = client.call(inspect("asked")).unwrap();
        owner.join().unwrap();
        assert_eq!(
            (answered.request_id.as_str(), answered.status),
            ("asked", Outcome::Applied)
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
