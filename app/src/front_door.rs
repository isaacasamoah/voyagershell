use crate::content::Access;
use crate::core::{Core, Error};
use crate::terminal_lifecycle::Lifecycle;
use serde::Serialize;
use std::collections::VecDeque;
use voyager_contract::administrator::{ProcessAction, ProcessRequest};
use voyager_contract::{
    Action, Context, CoreTerminalId, Request, TerminalRequest, VesselId, VoyageId,
};

const IDENTITY_LIMIT: usize = 128;
const KEPT: usize = 32;
pub(crate) const WAITING: usize = 8;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub(crate) enum Kind {
    Workspace,
    Content,
    Worktree,
    Process,
    Terminal,
}

struct Texts {
    holder: &'static str,
    invalid: &'static str,
    changed: &'static str,
    pending: &'static str,
    quitting: &'static str,
    busy: &'static str,
}

impl Kind {
    const fn texts(self) -> Texts {
        match self {
            Self::Workspace => Texts {
                holder: "a workspace",
                invalid: "Invalid request identity",
                changed: "Changed request identity; nothing was repeated",
                pending: "The workspace operation is in progress; inspect its result instead of repeating it",
                quitting: "Voyager is quitting; no workspace effect was dispatched",
                busy: "Workspace busy; nothing was queued",
            },
            Self::Content => Texts {
                holder: "a content",
                invalid: "Invalid content request identity",
                changed: "Content request identity changed; nothing was repeated",
                pending: "Content request is still pending; nothing was repeated",
                quitting: "Voyager is quitting; no content was changed",
                busy: "Workspace busy; no content operation was queued",
            },
            Self::Worktree => Texts {
                holder: "a worktree",
                invalid: "Invalid worktree request identity",
                changed: "Worktree request identity was reused with different arguments or scope",
                pending: "Worktree request is still pending; do not repeat",
                quitting: "Voyager is quitting; no worktree operation was dispatched",
                busy: "Workspace busy; no worktree request was queued",
            },
            Self::Process => Texts {
                holder: "a process",
                invalid: "Invalid process request identity",
                changed: "Process request identity was reused with different arguments or scope",
                pending: "Process request is still pending; it was not repeated",
                quitting: "Voyager is quitting; no process effect was dispatched",
                busy: "Workspace busy; no process request was queued",
            },
            Self::Terminal => Texts {
                holder: "a terminal",
                invalid: "Invalid terminal request identity",
                changed: "Terminal request identity was reused with different content",
                pending: "Terminal request is still pending; nothing was repeated",
                quitting: "Voyager is quitting; no terminal was opened",
                busy: "Workspace busy; no terminal was started",
            },
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub(crate) enum Machine {
    Local,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub(crate) struct TerminalAddress {
    pub(crate) machine: Machine,
    pub(crate) terminal: CoreTerminalId,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub(crate) enum Caller {
    Canvas,
    Avatar { focus: Context },
    Content { vessel: VesselId },
    Core { machine: Machine },
}

impl Caller {
    fn bound(scope: Option<&Context>) -> Self {
        scope.map_or(Self::Canvas, |focus| Self::Avatar {
            focus: focus.clone(),
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub(crate) enum Target {
    Workspace,
    Voyage(VoyageId),
    Vessel(VesselId),
    Terminal(TerminalAddress),
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub(crate) enum Revision {
    Layout(u64),
    Vessel(String),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Envelope {
    pub(crate) request: String,
    pub(crate) kind: Kind,
    pub(crate) caller: Caller,
    pub(crate) target: Target,
    pub(crate) expected: Option<Revision>,
    pub(crate) effect: bool,
}

impl Envelope {
    pub(crate) fn workspace(scope: Option<&Context>, request: &Request) -> Self {
        Self {
            request: request.request_id.clone(),
            kind: Kind::Workspace,
            caller: Caller::bound(scope),
            target: Target::Workspace,
            expected: Some(Revision::Layout(request.expected_version)),
            effect: !matches!(request.action, Action::Inspect),
        }
    }

    pub(crate) fn content(access: &Access, request: &voyager_contract::content::Request) -> Self {
        use voyager_contract::content::Request as Content;
        let (vessel, request_id, expected) = crate::content::identity(request);
        Self {
            request: request_id.into(),
            kind: Kind::Content,
            caller: match access {
                Access::View(binding) => Caller::Content {
                    vessel: binding.id().clone(),
                },
                Access::Agent { scope, .. } => Caller::Avatar {
                    focus: scope.clone(),
                },
            },
            target: Target::Vessel(vessel.clone()),
            expected: expected.map(|revision| Revision::Vessel(revision.into())),
            effect: !matches!(
                request,
                Content::Inspect { .. } | Content::Describe { .. } | Content::ListNotes { .. }
            ),
        }
    }

    pub(crate) fn worktree(
        scope: Option<&Context>,
        request: &voyager_contract::worktree::Request,
    ) -> Self {
        Self {
            request: request.request_id.clone(),
            kind: Kind::Worktree,
            caller: Caller::bound(scope),
            target: Target::Voyage(request.voyage.clone()),
            expected: Some(Revision::Layout(request.expected_version)),
            effect: true,
        }
    }

    pub(crate) fn process(scope: &Context, request: &ProcessRequest) -> Self {
        let (target, effect) = match &request.input.action {
            ProcessAction::List => (Target::Workspace, false),
            ProcessAction::Read { terminal_id, .. } => (Self::terminal_at(terminal_id), false),
            ProcessAction::Send { terminal_id, .. }
            | ProcessAction::Interrupt { terminal_id, .. }
            | ProcessAction::Stop { terminal_id, .. } => (Self::terminal_at(terminal_id), true),
        };
        Self {
            request: request.request_id.clone(),
            kind: Kind::Process,
            caller: Caller::bound(Some(scope)),
            target,
            expected: Some(Revision::Layout(request.input.expected_version)),
            effect,
        }
    }

    pub(crate) fn terminal(request: &TerminalRequest) -> Self {
        Self {
            request: request.request_id.clone(),
            kind: Kind::Terminal,
            caller: Caller::Canvas,
            target: Target::Vessel(request.vessel_id.clone()),
            expected: Some(Revision::Layout(request.expected_version)),
            effect: true,
        }
    }

    pub(crate) fn observed(request: String, version: u64) -> Self {
        Self {
            request,
            kind: Kind::Workspace,
            caller: Caller::Core {
                machine: Machine::Local,
            },
            target: Target::Workspace,
            expected: Some(Revision::Layout(version)),
            effect: true,
        }
    }

    fn terminal_at(terminal: &CoreTerminalId) -> Target {
        Target::Terminal(TerminalAddress {
            machine: Machine::Local,
            terminal: terminal.clone(),
        })
    }

    fn valid(&self) -> bool {
        let bounded = |text: &str| !text.is_empty() && text.len() <= IDENTITY_LIMIT;
        bounded(&self.request)
            && !matches!(&self.expected, Some(Revision::Vessel(revision)) if !bounded(revision))
    }

    fn fingerprint(&self, payload: &impl Serialize) -> [u8; 32] {
        crate::content::fingerprint(&(
            self.kind,
            &self.caller,
            &self.target,
            &self.expected,
            payload,
        ))
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum Outcome<T> {
    Applied(T),
    Refused { kind: String, message: String },
    Uncertain(String),
}

impl<T> Outcome<T> {
    pub(crate) fn status(&self) -> voyager_contract::Outcome {
        match self {
            Self::Applied(_) => voyager_contract::Outcome::Applied,
            Self::Refused { .. } => voyager_contract::Outcome::Refused,
            Self::Uncertain(_) => voyager_contract::Outcome::Uncertain,
        }
    }
}

impl<T> From<Result<T, Error>> for Outcome<T> {
    fn from(result: Result<T, Error>) -> Self {
        match result {
            Ok(applied) => Self::Applied(applied),
            Err(Error::Rejected { kind, message }) => Self::Refused { kind, message },
            Err(Error::Uncertain(message)) => Self::Uncertain(message),
        }
    }
}

#[must_use]
#[derive(Debug)]
pub(crate) struct Ticket {
    request: String,
    kind: Kind,
    fingerprint: [u8; 32],
}

#[derive(Debug)]
pub(crate) enum Admission<T> {
    New(Ticket),
    Repeat(T),
    Pending(String),
    Refused(String),
}

struct Entry<R> {
    request: String,
    kind: Kind,
    fingerprint: [u8; 32],
    receipt: Option<R>,
}

pub(crate) struct Ledger<R> {
    entries: VecDeque<Entry<R>>,
}

impl<R> Default for Ledger<R> {
    fn default() -> Self {
        Self {
            entries: VecDeque::new(),
        }
    }
}

impl<R> Ledger<R> {
    fn find(&self, request: &str) -> Option<&Entry<R>> {
        self.entries.iter().find(|entry| entry.request == request)
    }

    fn open(&mut self, ticket: Ticket) {
        self.entries.push_back(Entry {
            request: ticket.request,
            kind: ticket.kind,
            fingerprint: ticket.fingerprint,
            receipt: None,
        });
    }

    fn settle(&mut self, request: &str, receipt: R) {
        let pending = |entry: &Entry<R>| entry.request == request && entry.receipt.is_none();
        let Some(mut entry) = self
            .entries
            .iter()
            .position(pending)
            .and_then(|index| self.entries.remove(index))
        else {
            return;
        };
        entry.receipt = Some(receipt);
        let kind = entry.kind;
        self.entries.push_back(entry);
        let settled = |entry: &Entry<R>| entry.kind == kind && entry.receipt.is_some();
        if self.entries.iter().filter(|entry| settled(entry)).count() > KEPT
            && let Some(oldest) = self.entries.iter().position(settled)
        {
            self.entries.remove(oldest);
        }
    }

    fn forget(&mut self, request: &str) {
        self.entries.retain(|entry| entry.request != request);
    }

    fn pending(&self, kind: Kind) -> usize {
        self.entries
            .iter()
            .filter(|entry| entry.kind == kind && entry.receipt.is_none())
            .count()
    }
}

pub(crate) struct FrontDoor<R> {
    ledger: Ledger<R>,
    ended: Option<(Lifecycle, Result<(), Error>)>,
    flying: bool,
}

impl<R> Default for FrontDoor<R> {
    fn default() -> Self {
        Self {
            ledger: Ledger::default(),
            ended: None,
            flying: false,
        }
    }
}

impl<R> FrontDoor<R> {
    pub(crate) fn admit<T>(
        &self,
        envelope: &Envelope,
        payload: &impl Serialize,
        own: impl FnOnce(&R) -> Option<T>,
    ) -> Admission<T> {
        let texts = envelope.kind.texts();
        if !envelope.valid() {
            return Admission::Refused(texts.invalid.into());
        }
        let fingerprint = envelope.fingerprint(payload);
        if let Some(entry) = self.ledger.find(&envelope.request) {
            let collision = || {
                Admission::Refused(format!(
                    "This request identity belongs to {} operation",
                    entry.kind.texts().holder
                ))
            };
            if entry.kind != envelope.kind {
                return collision();
            }
            if entry.fingerprint != fingerprint {
                return Admission::Refused(texts.changed.into());
            }
            return match &entry.receipt {
                None => Admission::Pending(texts.pending.into()),
                Some(receipt) => own(receipt).map_or_else(collision, Admission::Repeat),
            };
        }
        match self.gate(envelope) {
            Err(message) => Admission::Refused(message),
            Ok(()) => Admission::New(Ticket {
                request: envelope.request.clone(),
                kind: envelope.kind,
                fingerprint,
            }),
        }
    }

    pub(crate) fn gate(&self, envelope: &Envelope) -> Result<(), String> {
        let texts = envelope.kind.texts();
        match (envelope.effect, self.ended.is_some(), self.flying) {
            (false, _, _) | (true, false, false) => Ok(()),
            (true, true, _) => Err(texts.quitting.into()),
            (true, false, true) => Err(texts.busy.into()),
        }
    }

    pub(crate) fn open(&mut self, ticket: Ticket) {
        self.ledger.open(ticket);
    }

    pub(crate) fn settle(&mut self, request: &str, receipt: R) {
        self.ledger.settle(request, receipt);
    }

    pub(crate) fn record(&mut self, ticket: Ticket, receipt: R) {
        let request = ticket.request.clone();
        self.ledger.open(ticket);
        self.ledger.settle(&request, receipt);
    }

    pub(crate) fn forget(&mut self, request: &str) {
        self.ledger.forget(request);
    }

    pub(crate) fn pending(&self, kind: Kind) -> usize {
        self.ledger.pending(kind)
    }

    pub(crate) fn end(
        &mut self,
        operation: Lifecycle,
        core: &mut Result<Core, Error>,
    ) -> Result<(), Error> {
        operation.end(&mut self.ended, core)
    }

    pub(crate) fn quitting(&self) -> bool {
        self.ended.is_some()
    }

    pub(crate) fn depart(&mut self) {
        self.flying = true;
    }

    pub(crate) fn land(&mut self) {
        self.flying = false;
    }

    pub(crate) fn flying(&self) -> bool {
        self.flying
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use voyager_contract::administrator::ProcessInput;
    use voyager_contract::content::{Notes, Request as Content, Version};
    use voyager_contract::worktree;

    type Door = FrontDoor<&'static str>;

    fn own(receipt: &&'static str) -> Option<&'static str> {
        Some(receipt)
    }

    fn workspace(id: &str, action: Action) -> (Envelope, Request) {
        let request = Request {
            request_id: id.into(),
            expected_version: 7,
            action,
        };
        (Envelope::workspace(None, &request), request)
    }

    fn create(id: &str, name: &str) -> (Envelope, Request) {
        workspace(
            id,
            Action::CreateVoyage {
                name: name.into(),
                cwd: "/tmp".into(),
            },
        )
    }

    fn admitted<P: Serialize>(door: &Door, (envelope, payload): &(Envelope, P)) -> Ticket {
        match door.admit(envelope, payload, own) {
            Admission::New(ticket) => ticket,
            other => panic!("expected a new request, got {other:?}"),
        }
    }

    fn refusal<P: Serialize>(door: &Door, (envelope, payload): &(Envelope, P)) -> String {
        match door.admit(envelope, payload, own) {
            Admission::Refused(message) => message,
            other => panic!("expected a refusal, got {other:?}"),
        }
    }

    fn json(value: &impl Serialize) -> serde_json::Value {
        serde_json::to_value(value).unwrap()
    }

    fn update(id: &str, revision: &str) -> (Envelope, Content) {
        let content = Content::Update {
            version: Version::V1,
            request_id: id.into(),
            vessel_id: VesselId("vessel-1".into()),
            expected_revision: revision.into(),
            data: Notes {
                title: "title".into(),
                text: "text".into(),
            },
        };
        let access = Access::Agent {
            scope: Context::Workspace,
            expected_version: 7,
        };
        (Envelope::content(&access, &content), content)
    }

    fn every_kind(id: &str) -> Vec<(Envelope, serde_json::Value)> {
        let scope = Context::Workspace;
        let vessel = VesselId("vessel-1".into());
        let worktree = worktree::Request {
            request_id: id.into(),
            expected_version: 7,
            voyage: VoyageId("voyage-1".into()),
            action: worktree::Action::List,
        };
        let process = ProcessRequest {
            request_id: id.into(),
            input: ProcessInput {
                expected_version: 7,
                action: ProcessAction::Stop {
                    vessel_id: vessel.clone(),
                    terminal_id: CoreTerminalId("t1".into()),
                    pid: 1,
                },
            },
        };
        let terminal = TerminalRequest {
            request_id: id.into(),
            vessel_id: vessel,
            expected_version: 7,
        };
        let (workspace, request) = create(id, "one");
        let (content, update) = update(id, "revision-1");
        vec![
            (workspace, json(&request)),
            (content, json(&update)),
            (Envelope::worktree(Some(&scope), &worktree), json(&worktree)),
            (Envelope::process(&scope, &process), json(&process)),
            (Envelope::terminal(&terminal), json(&terminal)),
        ]
    }

    #[test]
    fn a_repeat_returns_the_first_outcome_and_admits_no_second_effect() {
        let mut door = Door::default();
        let first = create("request-1", "one");
        door.record(admitted(&door, &first), "first outcome");
        assert!(matches!(
            door.admit(&first.0, &first.1, own),
            Admission::Repeat("first outcome")
        ));
        door.settle("request-1", "second outcome");
        assert!(matches!(
            door.admit(&first.0, &first.1, own),
            Admission::Repeat("first outcome")
        ));
    }

    #[test]
    fn a_changed_request_or_caller_under_a_known_id_is_refused() {
        let mut door = Door::default();
        let first = create("request-1", "one");
        door.record(admitted(&door, &first), "first outcome");
        assert_eq!(
            refusal(&door, &create("request-1", "two")),
            "Changed request identity; nothing was repeated"
        );
        let scoped = Envelope::workspace(Some(&Context::Workspace), &first.1);
        assert_eq!(
            refusal(&door, &(scoped, first.1.clone())),
            "Changed request identity; nothing was repeated"
        );
    }

    #[test]
    fn an_id_held_by_one_kind_is_refused_for_every_other_kind() {
        let kinds = every_kind("request-1");
        for (holder, held) in kinds.iter().enumerate() {
            let mut door = Door::default();
            door.record(admitted(&door, held), "held");
            for (asker, asking) in kinds.iter().enumerate() {
                if asker == holder {
                    continue;
                }
                assert_eq!(
                    refusal(&door, asking),
                    format!(
                        "This request identity belongs to {} operation",
                        held.0.kind.texts().holder
                    )
                );
            }
        }
    }

    #[test]
    fn an_empty_or_long_id_or_vessel_revision_is_refused_before_the_ledger() {
        let door = Door::default();
        let long = "x".repeat(IDENTITY_LIMIT + 1);
        for id in ["", long.as_str()] {
            for asking in every_kind(id) {
                assert_eq!(refusal(&door, &asking), asking.0.kind.texts().invalid);
            }
        }
        let limit = "x".repeat(IDENTITY_LIMIT);
        let _ = admitted(&door, &create(&limit, "one"));
        for revision in ["", long.as_str()] {
            assert_eq!(
                refusal(&door, &update("request-1", revision)),
                "Invalid content request identity"
            );
        }
    }

    #[test]
    fn quitting_refuses_an_effect_of_every_kind_and_passes_a_request_with_no_effect() {
        let mut door = Door::default();
        let mut core = Err(Error::Uncertain("never connected".into()));
        door.end(Lifecycle::QuitAndKeep, &mut core).unwrap();
        assert!(door.quitting());
        for asking in every_kind("request-1") {
            assert_eq!(refusal(&door, &asking), asking.0.kind.texts().quitting);
        }
        let _ = admitted(&door, &workspace("request-2", Action::Inspect));
        let list = ProcessRequest {
            request_id: "request-3".into(),
            input: ProcessInput {
                expected_version: 7,
                action: ProcessAction::List,
            },
        };
        let _ = admitted(
            &door,
            &(Envelope::process(&Context::Workspace, &list), list),
        );
        let observed = Envelope::observed("request-4".into(), 7);
        assert_eq!(
            door.gate(&observed),
            Err("Voyager is quitting; no workspace effect was dispatched".into())
        );
    }

    #[test]
    fn a_repeat_is_answered_after_quitting_and_while_a_save_is_in_flight() {
        let mut door = Door::default();
        let first = create("request-1", "one");
        door.record(admitted(&door, &first), "first outcome");
        door.depart();
        assert!(matches!(
            door.admit(&first.0, &first.1, own),
            Admission::Repeat("first outcome")
        ));
        door.land();
        let mut core = Err(Error::Uncertain("never connected".into()));
        door.end(Lifecycle::QuitAndKeep, &mut core).unwrap();
        assert!(matches!(
            door.admit(&first.0, &first.1, own),
            Admission::Repeat("first outcome")
        ));
    }

    #[test]
    fn an_effect_is_refused_as_busy_only_while_a_save_is_in_flight() {
        let mut door = Door::default();
        door.depart();
        for asking in every_kind("request-1") {
            assert_eq!(refusal(&door, &asking), asking.0.kind.texts().busy);
        }
        let _ = admitted(&door, &workspace("request-2", Action::Inspect));
        door.land();
        let _ = admitted(&door, &create("request-1", "one"));
    }

    #[test]
    fn forty_inspects_do_not_evict_a_pending_close_confirm() {
        let mut door = Door::default();
        let confirm = workspace(
            "confirm-1",
            Action::ConfirmVoyageClose {
                id: VoyageId("voyage-1".into()),
                plan: "plan-1".into(),
            },
        );
        door.open(admitted(&door, &confirm));
        for index in 0..40 {
            let inspect = workspace(&format!("inspect-{index}"), Action::Inspect);
            door.record(admitted(&door, &inspect), "inspected");
        }
        assert_eq!(door.pending(Kind::Workspace), 1);
        assert!(matches!(
            door.admit(&confirm.0, &confirm.1, own),
            Admission::Pending(message) if message.contains("in progress")
        ));
        door.settle("confirm-1", "closed");
        assert!(matches!(
            door.admit(&confirm.0, &confirm.1, own),
            Admission::Repeat("closed")
        ));
        assert_eq!(door.pending(Kind::Workspace), 0);
    }

    #[test]
    fn each_kind_keeps_its_own_last_thirty_two_settled_outcomes() {
        let mut door = Door::default();
        let terminal = TerminalRequest {
            request_id: "terminal-1".into(),
            vessel_id: VesselId("vessel-1".into()),
            expected_version: 7,
        };
        let opened = (Envelope::terminal(&terminal), terminal);
        door.record(admitted(&door, &opened), "viewer");
        for index in 0..=KEPT {
            let inspect = workspace(&format!("inspect-{index}"), Action::Inspect);
            door.record(admitted(&door, &inspect), "inspected");
        }
        assert!(matches!(
            door.admit(&opened.0, &opened.1, own),
            Admission::Repeat("viewer")
        ));
        let _ = admitted(&door, &workspace("inspect-0", Action::Inspect));
        let kept = workspace("inspect-1", Action::Inspect);
        assert!(matches!(
            door.admit(&kept.0, &kept.1, own),
            Admission::Repeat("inspected")
        ));
    }

    #[test]
    fn a_forgotten_request_is_admitted_again() {
        let mut door = Door::default();
        let rename = create("request-1", "one");
        door.open(admitted(&door, &rename));
        door.forget("request-1");
        door.record(admitted(&door, &rename), "renamed");
        assert_eq!(door.pending(Kind::Workspace), 0);
    }

    #[test]
    fn a_receipt_of_another_shape_is_a_collision_not_a_repeat() {
        let mut door = Door::default();
        let first = create("request-1", "one");
        door.record(admitted(&door, &first), "first outcome");
        assert!(matches!(
            door.admit(&first.0, &first.1, |_| None::<()>),
            Admission::Refused(message) if message.contains("belongs to a workspace operation")
        ));
    }

    #[test]
    fn an_outcome_keeps_refused_apart_from_uncertain() {
        let refused: Outcome<()> = Err(Error::Rejected {
            kind: "conflict".into(),
            message: "changed".into(),
        })
        .into();
        let uncertain: Outcome<()> = Err(Error::Uncertain("lost".into())).into();
        assert_eq!(refused.status(), voyager_contract::Outcome::Refused);
        assert_eq!(uncertain.status(), voyager_contract::Outcome::Uncertain);
        assert_eq!(
            Outcome::from(Ok(1)).status(),
            voyager_contract::Outcome::Applied
        );
    }

    #[test]
    fn a_process_target_names_the_terminal_and_its_machine() {
        let read = ProcessRequest {
            request_id: "request-1".into(),
            input: ProcessInput {
                expected_version: 7,
                action: ProcessAction::Read {
                    vessel_id: VesselId("vessel-1".into()),
                    terminal_id: CoreTerminalId("t7".into()),
                    lines: 10,
                },
            },
        };
        let envelope = Envelope::process(&Context::Workspace, &read);
        assert_eq!(
            envelope.target,
            Target::Terminal(TerminalAddress {
                machine: Machine::Local,
                terminal: CoreTerminalId("t7".into()),
            })
        );
        assert!(!envelope.effect);
        assert_eq!(
            Envelope::observed("request-2".into(), 7).caller,
            Caller::Core {
                machine: Machine::Local
            }
        );
    }
}
