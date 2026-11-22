use super::super::core_calls::{live_directories, post, unlisted};
use super::super::{Message, Receipt};
use super::Owner;
use super::structure_calls::record_created_terminals;
use crate::core::Error;
use crate::families::worktree;
use crate::front_door::{Admission, Envelope};
use crate::layout_store::{load, save};
use std::sync::{
    Arc,
    mpsc::{self, SyncSender},
};
use std::thread;
use voyager_contract::Context;
use voyager_contract::worktree::{Request, Response};

impl Owner {
    pub(super) fn worktree_remove_ready(
        &mut self,
        scope: Option<Context>,
        request: &Request,
        source_directory: &str,
        reply: SyncSender<Result<Vec<String>, String>>,
    ) {
        let preflight = (|| -> Result<_, String> {
            self.door
                .gate(&Envelope::worktree(scope.as_ref(), request))
                .map_err(|_| "Voyager is quitting; no worktree was removed".to_owned())?;
            let core = self
                .core
                .as_mut()
                .map_err(|error| format!("Core unavailable: {error:?}"))?;
            let (current, revision, missing) = load(core, &self.cwd, &self.layout, self.version)
                .map_err(|error| format!("Workspace unavailable: {error:?}"))?;
            self.layout = Arc::new(current);
            self.version = revision;
            self.fresh = !missing;
            if missing
                || !self
                    .seen
                    .current(request.expected_version, self.version, &self.layout, || {
                        Some(worktree::parts(request))
                    })
            {
                return Err("Workspace changed; no worktree was removed".into());
            }
            worktree::confirm_removal(&self.layout, scope.as_ref(), request, source_directory)?;
            core.begin_terminal_list().map_err(unlisted)
        })();
        match preflight {
            Ok(pending) => {
                self.door.depart();
                post(&self.sender, pending, move |listed| {
                    Message::RemovalListed {
                        reply,
                        terminals: listed.map(|listed| listed.terminals),
                    }
                });
            }
            Err(error) => drop(reply.send(Err(error))),
        }
    }

    pub(super) fn removal_listed(
        &mut self,
        reply: &SyncSender<Result<Vec<String>, String>>,
        terminals: Result<Vec<crate::core_shapes::Terminal>, Error>,
    ) {
        self.door.land();
        let _ = reply.send(live_directories(terminals));
    }

    pub(super) fn worktree_done(
        &mut self,
        scope: Option<&Context>,
        request: &Request,
        source_directory: &str,
        response: Response,
        reply: &SyncSender<Arc<Response>>,
    ) {
        let completion = if worktree::moves_voyages(request, &response) {
            (|| -> Result<(), String> {
                self.door
                    .gate(&Envelope::worktree(scope, request))
                    .map_err(|_| "Voyager is quitting".to_owned())?;
                let checkout = response
                    .checkouts
                    .first()
                    .ok_or("Git did not return the selected checkout")?;
                let core = self
                    .core
                    .as_mut()
                    .map_err(|error| format!("Core unavailable: {error:?}"))?;
                let (current, revision, missing) =
                    load(core, &self.cwd, &self.layout, self.version)
                        .map_err(|error| format!("Workspace unavailable: {error:?}"))?;
                self.layout = Arc::new(current);
                self.version = revision;
                self.fresh = !missing;
                if missing {
                    return Err("Workspace is unavailable".into());
                }
                if !self
                    .seen
                    .current(request.expected_version, self.version, &self.layout, || {
                        Some(worktree::parts(request))
                    })
                {
                    return Err("Workspace changed after Git dispatch".into());
                }
                let candidate =
                    worktree::plan(&self.layout, scope, request, source_directory, checkout)?;
                let saved = save(core, &candidate.layout, self.version)
                    .map_err(|error| format!("Workspace save not confirmed: {error:?}"))?;
                record_created_terminals(
                    &mut self.created_vessels,
                    &self.layout,
                    &candidate.layout,
                );
                self.layout = Arc::new(candidate.layout);
                self.version = saved;
                self.notices.send(self.version, self.closing.revision);
                Ok(())
            })()
        } else {
            Ok(())
        };
        let answer = worktree::completed(response, completion);
        self.door
            .settle(&request.request_id, Receipt::Worktree(Arc::clone(&answer)));
        let _ = reply.send(answer);
    }

    pub(super) fn worktree(
        &mut self,
        scope: Option<Context>,
        request: Request,
        reply: SyncSender<Arc<Response>>,
    ) {
        let ticket = match self.door.admit(
            &Envelope::worktree(scope.as_ref(), &request),
            &request,
            Receipt::worktree,
        ) {
            Admission::New(ticket) => ticket,
            Admission::Repeat(first) => return drop(reply.send(first)),
            Admission::Pending(message) => {
                return drop(reply.send(worktree::uncertain(&request, message)));
            }
            Admission::Refused(message) => {
                return drop(reply.send(worktree::rejected(&request, message)));
            }
        };
        let prepared = (|| -> Result<(String, Vec<String>), String> {
            worktree::decide(
                self.door
                    .crowded(&Envelope::worktree(scope.as_ref(), &request)),
                self.fresh,
                || {
                    self.seen
                        .current(request.expected_version, self.version, &self.layout, || {
                            Some(worktree::parts(&request))
                        })
                },
                scope.as_ref(),
                &request,
            )?;
            let core = self
                .core
                .as_mut()
                .map_err(|error| format!("Core unavailable: {error:?}"))?;
            let (current, revision, missing) = load(core, &self.cwd, &self.layout, self.version)
                .map_err(|error| format!("Workspace unavailable: {error:?}"))?;
            self.layout = Arc::new(current);
            self.version = revision;
            if missing
                || !self
                    .seen
                    .current(request.expected_version, self.version, &self.layout, || {
                        Some(worktree::parts(&request))
                    })
            {
                return Err("Workspace changed; inspect before using worktrees".into());
            }
            worktree::prepare(&self.layout, scope.as_ref(), &request)
        })();
        match prepared {
            Err(message) => {
                let answer = worktree::rejected(&request, message);
                self.door
                    .record(ticket, Receipt::Worktree(Arc::clone(&answer)));
                let _ = reply.send(answer);
            }
            Ok((directory, live)) => {
                self.door.open(ticket);
                let task_sender = self.sender.clone();
                thread::spawn(move || {
                    let response = worktree::run(&request, &directory, &live, || {
                        let (approval, receive) = mpsc::sync_channel(1);
                        task_sender
                            .send_blocking(Message::WorktreeRemoveReady {
                                scope: scope.clone(),
                                request: request.clone(),
                                source_directory: directory.clone(),
                                reply: approval,
                            })
                            .map_err(|_| "Owner unavailable; no worktree was removed".to_owned())?;
                        receive.recv().map_err(|_| {
                            "Owner check unavailable; no worktree was removed".to_owned()
                        })?
                    });
                    let _ = task_sender.send_blocking(Message::WorktreeDone {
                        scope,
                        request,
                        source_directory: directory,
                        response,
                        reply,
                    });
                });
            }
        }
    }
}
