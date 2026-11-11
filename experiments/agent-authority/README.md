# Working communication and rank experiment

This unmerged experiment extends the real Rust application owner and native workspace. The approved hats use uniform 12-pixel monochrome outlines. Core continues to own programs; the application owns conversation, explicit rank/assignment checks and escalation decisions. No current user program is adopted or replaced.

Implementation is in progress. The scope policy and non-destructive inbox checks pass; the complete native communication, ranked creation and Inbox journeys are not established yet. The worktree-local SPEC.md and tasks/plan.md define the whole outcome. This source record is not a production capability claim.

## Ownership and binding

Coordination requests enter the existing Client queue. Socket handling and waiting stay outside that queue. The command has no caller-role field and cannot reach the native-user method. A Linux Unix-socket peer credential identifies the command process. Each actual operation checks its ancestry, process start identity and the exact recorded native Codex run against Core's current foreground.

Fresh coordinated Codex launches use a small command that enrolls once, then execs the native Codex executable in place. It does not spawn, supervise, wait for or recover another process. The existing Core/Bash wrapper remains responsible for returning to Bash. Enrollment is acknowledged only after the Core operation, saved content/backend and root-shell identity are confirmed. The command's argument vector and executable identity must match the reserved launch. An acknowledgement permits attempting exec; it does not prove that Codex started. Before exec, after Codex exits, and in a replacement program, no work-changing capability is available.

Linux process inspection is kept in coordination_linux.rs. The getsockopt call supplies a live UnixStream descriptor, a correctly sized initialized ucred buffer and its writable length. The result and returned length are checked before consuming credentials. PID/start and UID checks surround the bounded ancestry walk. Reading metadata through /proc/PID/exe supports an executable whose installed path was replaced. This is an application binding under a shared trusted OS account, not protection against hostile same-user programs or a general shell sandbox.

The trial supports fresh native ELF Codex with --no-daemon. It does not establish another provider, a spawning Node wrapper, remote-machine identities or another OS. Viewer Quit leaves Core programs running but ends this in-memory coordination owner. Reopening does not automatically adopt surviving agents, restore their command rights or replay messages.

## Message and authority semantics

Conversation shares information and needs no work-changing rank. Starting, instructing or redirecting work uses one decision against the authenticated current run, rank, placement and explicit assignment. Captain directs assigned Crew, Commodore lower ranks in its Fleet, Admiral lower ranks in its Voyage. Intermediate supervisors guide coordination and are optional. Message content is not classified to decide whether it may pass.

Read does not remove a message. Only its recipient can acknowledge it. Unanswered escalations remain pending even when read. The bounded inbox refuses capacity before discarding unread work. Recorded submission, recipient retrieval, acknowledgement, decision and actual completed work are distinct observations. No body is pasted into a terminal or surviving Bash process. Waiting releases the owner queue and rechecks the sender after waking.

Escalations are intended to name the context, decision and affected work in plain language. They go to the actual supervisor or the human Inbox when none exists. Approve, Deny and a written response answer that exact agent run; they do not change its rank or execute unspecified work. The later complete implementation and native evidence must establish those paths before they are reported as working.

## Sources and verification

The design study inspected Herdr Core guidance at e07c2a1bedd62cf4787ee026ee23ee79c7d95491 and Herdr App at 1581a587919dddd6f1efd5f78eb542c4b2b02cb5. It adopts the small deciding-code/IO split, one generated API, explicit launch context, native interactive agents, private proving and the separation of Core parentage from application authority. It does not copy the upstream implementation or import the maintainer's approval/release rules.

The Linux contracts are documented in [unix(7)](https://man7.org/linux/man-pages/man7/unix.7.html), [proc_pid_stat(5)](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html) and [execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html). The older Python delivery producer remains archival with isolation/protection findings and a failed proof-size gate. It must not be rerun. Full ordinary checks, independent source/Rust review, a relevant mutation, actual native journeys and complete proof accounting remain required. No merge, installation or current-preview replacement follows from this experiment.

## Current review boundary

The typed contract and approved icon correction are pushed in the dependent experiment stack. Source review of the Rust owner found no remaining Required finding after preserving request IDs, separating option arguments from task text, and releasing only unused tickets after a confirmed launch refusal. The assignment-guard mutation failed as intended and passed after restoration. Full native enrollment, real conversation, child action and Inbox decisions remain unproved.

For this trial, a Captain's assignment also requires the same Fleet. Moving assigned Crew elsewhere retains the relationship record but ends that Captain's instruction authority until its scope matches again. Conversation remains available. This follows the current trial brief and is a behavior for user feedback, not a new automatic reassignment policy.

The worker command and Inbox use a bounded pull model. An idle assistant does not automatically receive a new model turn. During the demonstration, the real agents explicitly inspect or wait for their messages. The private native administrator's original tool catalog is unchanged; this experiment does not claim its chat already exposes the new coordination operations.

## First native attempt and correction

The first release candidate enrolled a fresh native Codex run and saved the user-selected Captain promotion. It did not establish peer conversation, child work or Inbox decisions. The native journey first needed to expose hover controls and handle Codex's first-use folder-trust prompt. Then the actual model's tool command failed because the user's `shell_environment_policy.inherit = "core"` removed the three `VOYAGER_AGENT_*` bindings. All test viewers, their isolated Core sessions and foreground programs were closed; the retained protected process cohort was unchanged. Failed evidence is preserved outside Git, and no failure is relabeled as a pass.

The narrow correction sets each of those three values through Codex's per-key `shell_environment_policy.set` overrides and uses the same map for the original Core launch environment. It leaves `inherit` and the user's other environment settings intact. The [official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) documents explicit `set` values and notes that include filters may still remove them. Such a custom filter remains a configuration prerequisite rather than permission to broaden inheritance automatically. The correction needs its ordinary checks and independent review before one corrective release build. The repaired real-agent journey remains unproved and requires a later desktop reservation; no second shared-input round is taken implicitly.

## Native reply field

Escalation replies use the existing Composer with retained ComposerState. Its constructor supplies the accessible label and leaves the input blank. Each message keeps its own state. Name is a rename editor with a fixed accessibility label and does not expose an accessibility_label component method. Native06 reached real Admiral routing but failed while drawing this unsupported method. The corrected reply uses the standard 32-pixel Composer beside the existing compact buttons; no Rust binding or authority rule changes. The real journey must verify all three decisions and the actual reply text.
