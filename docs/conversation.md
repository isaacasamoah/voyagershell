# Native private text

The private conversation belongs to the Rust application. Opening chat reads its
current projection without starting Codex. The first human Send starts a separate
installed Codex app-server over stdio and creates an ephemeral private thread.
This uses the existing native account, with no API-key route or account-file read
by Voyager. Terminal agents and the private conversation remain separate.

The default model is gpt-6.1-sol with high reasoning effort. A profile-local
conversation.json may contain model and effort strings. These change only this
private administrator connection. C2 restores the supported native shell tool
for file and search inspection while retaining the read-only sandbox,
never-approval policy and disabled internal agents. Instructions keep project
and extension-source changes with working Vessels. These instructions are
application policy, not an OS-wide security boundary. Voyager does not use the
out-of-sandbox app-server command routes.

The generated voyager_workspace tool uses the same Rust Action type as the
native workspace. The application supplies its request ID and binds the call to
the human request's original focus. The workspace actor checks that scope before
an effect and projects its responses to that same scope. Docking can change focus
when the human requests it, but cannot retarget an already accepted request.
The private provider cannot supply a different owner, scope or request identity.
The current process-integration candidate adds voyager_process alongside the
accepted workspace catalogue. Its source and owned-Core checks are under review;
the combined native/account journey is not yet accepted. The N3 source candidate adds the generated voyager_content tool through the same
callback/receipt path and one Client-owned Notes writer. It admits only fresh
captured Notes membership, preserves revisions/warnings and does not recreate
missing data. Content bodies stay out of public tool-history summaries. Its larger
content-only envelope and retention bounds are recorded in docs/content.md.
Actual provider/native N3 acceptance remains pending.

Rust binds a new request to the actual workspace context at Send. Its descriptor
contains the original scope and IDs, readable Voyage/Fleet/content path, matching
layout revision and working directory where the scope has one shared directory.
These come from the same confirmed owner snapshot. A workspace-wide scope has no
single directory. Later navigation or renaming does not rewrite a sent request.
Provider
responses must match the private connection's request, thread and accepted turn.
Only visible agent messages reach the projection. Reasoning, account records,
credentials and audio data do not. A received request is not a completed turn.
The view shows actual completion, failure, unconfirmed outcome and interruption.
Interrupt requests use the active native turn and await its actual completion
notification. No timeout or disconnect automatically repeats work or replaces
the runtime. View dismissal and source reload do not cancel accepted work.

The command mailbox holds eight calls. The provider-reader mailbox holds 32
frames, each at most 1 MiB. At most 16 pre-acknowledgement events are retained
until the native turn identity arrives. Up to 16 early tool callbacks wait
separately, so display truncation cannot silently discard a tool response.
Outbound frames are capped at 64 KiB,
human text at 8 KiB, a visible message at 64 KiB and retained display text at
256 KiB. A new request trims older display history to 64 messages and 192 KiB.
The provider's own conversation context remains separate from this bounded UI
history. An exceeded display bound is explicit, not silent successful truncation.
The projection retains a display-limit warning while the underlying turn finishes.
It reports that turn's actual outcome separately. Losing the provider connection
after a confirmed completion does not turn that completed outcome into uncertainty;
the connection error is still shown and later sends are refused without recovery.
The same rule applies if early events exceed the pre-acknowledgement bound. The
projection remains explicitly incomplete, and the bounded queue retains a native
completion event so it can report the matching accepted turn's actual outcome.
Late errors or duplicate terminal notifications do not replace a known outcome.

Settings are validated before a private runtime or turn starts. Invalid settings
reject that Send. After correcting them, the user may explicitly send again;
Voyager does not retry automatically. Model and effort changes apply to the next
private runtime, not silently to an already-created thread.

The owner appends deltas in place. The native view observes a versioned snapshot
with a blocking wait off the UI thread, then coalesces visible updates at 50 ms.
Idle observation returns no unchanged full snapshot. There is no per-frame script
loop or historical snapshot cache. The transport contains no layout or tool policy.

Only the maintained proving fixture explicitly sets
VOYAGER_CONVERSATION_EVIDENCE to a candidate-specific file. The conversation host
then writes the same sanitized visible snapshot in its background observation
call. This hook is proving code and has no production-denominator credit. Real
native typing and screenshots establish the visible journey; the snapshot only
corroborates identity, progression and actual completion.

The inspected native protocol is codex-cli 0.166.0 and its locally generated
experimental schema. The official reference is the
[Codex app-server documentation](https://learn.chatgpt.com/docs/app-server).
Linux native evidence does not establish macOS or Windows behavior. Full-duplex
voice remains a separate integration requirement.

The native account trial also observed the installed Codex stop hook continuing
the same turn. Its additional visible message reached chat through the native
stream; Voyager did not submit another request. The installed stop hook checks
for the owner's required oru: response prefix. C1's private instructions omitted
that convention. C2 adds it to the private administrator instructions, leaving
the global hooks and configuration unchanged. The first native C2 journey read
an undisclosed local marker and created a Fleet through the real owner. Its one
completed assistant answer used the prefix without the earlier extra continuation.
This is evidence for the tested installed account and Linux runtime, not a claim
about every user's hook configuration.

One workspace effect may run at a time, off the conversation loop. Interrupt
remains available. A new human Send waits until an accepted application effect
has returned, so it cannot inherit another request's context. Callback loss or
dismissing chat does not cancel an accepted effect. Results retain their actual
request identity and bound context. Unconfirmed results are not retried.
Tool arguments are limited to 8 KiB, structured results to 24 KiB and each turn
to 32 call identities with at most four waiting response IDs per call. Oversized
layout results report the actual effect outcome and explicitly omit the layout.
Completed replay IDs remain bound to the original call. Conflicting payloads
cannot replace an accepted pending reply or execute under a previously refused
call. Short visible outcomes such as "Fleet created" carry typed, inspectable
tool/call/callback/request/action/status/revision metadata in the same snapshot.
Callback IDs use a tagged string or integer reference. String values remain
literal strings; integer values use decimal strings to preserve their original
type and full numeric precision through the script layer. New tool outcomes cause
one read refresh of the workspace view, queued behind a current UI operation.
That refresh does not repeat an effect or introduce an idle polling loop.

The process catalogue has list, read, send, interrupt and selected-program stop operations. List and read
retain access to known-ended bound terminals without a PID. Send, interrupt and stop
require the inspected content ID, exact Core terminal address and live PID.
Process inspection also reports Core's actual optional foreground program name,
without arguments or an inferred work state. Every operation uses the same Client queue and physical Core connection as the
workspace. The owner reads the actual current document revision and mapping
before dispatch, checks the externally captured scope and refuses a stale
revision. Cached results retain request, scope and payload identity. A changed
tool name under an existing provider call ID is also refused. No view needs to
remain visible for a bound terminal to be inspected or addressed.

All callback arguments together remain limited to 8 KiB. The lower owner input
ceiling remains 64 KiB and does not enlarge that callback budget. Read adds at
most 160 history lines; the UI projection may shorten its text and marks that
limit. Core's complete/how/why fields remain distinct from the application
limit. The owner bounds serialized process output to 24 KiB before the callback
envelope. A large read/list reports its limit; a confirmed submission is not falsely
reported as refused just because its details exceed the display budget.

Send uses Core's actual paste-and-submit operation and returns its observed
status, turn and optional started result. It establishes submission, not task
completion. Interrupt is a separate explicit Core operation and returns the
actual key and observed outcome, including unknown or still_working. The
application never combines interrupt and send, retries an uncertain effect,
resumes or restarts a program. Selected Stop has a separate T4 checkpoint;
whole-session Quit and reopen retain their separate lifecycle gates.

Selected Stop uses Core's terminal.kill, not server.stop or OS signals from
Voyager. It ends that terminal's program and descendants; Interrupt remains the
program's stop key without escalation. The request carries the inspected content,
terminal and PID, while the result retains both the inspected target and Core's
observed record. Only a finished record is described as "Program ended". A live
record with the same PID is reported as still running. A malformed response,
unexpected terminal/PID/state or lost confirmation is unconfirmed and is never
automatically repeated. The placement, backend address and final screen remain.

The application rechecks the running PID immediately before dispatch. Core's
kill schema accepts a terminal address but no expected PID, so this is not an
atomic compare-and-kill guarantee against external Core mutations. The inspected
Core source is herdrdev/herdr-core at e07c2a1bedd62cf4787ee026ee23ee79c7d95491,
api.rs terminal_kill and runtime.rs kill. Its bounded escalation can return a
still-live record. The Linux native checkpoint now exercises one explicit Stop
through private Chat, an ordered read of the same ended terminal and a process
list showing its sibling remains live. The final screen and placement are retained,
and a separately owned Core program keeps the same running identity before trial
cleanup. One Stop is dispatched and its result remains bound to the original
request and context. The maintained fixture also verifies recorded process exits
and dedicated socket removal after its explicit cleanup. This establishes the
selected-program journey, not full application Quit or a complete census of every
possible detached descendant.

The Core generator accepts an optional saved-schema path after --write or
--check. It retains the complete canonical 0.1.16 hash guard and the original
run/attach shapes. Generated types add only the process methods now used. Core's
ListResult schema declares machines required, but its serializer omits an empty
machines list. The process adapter therefore requires and decodes only the
terminals array into the generated Terminal type and ignores unused federation
metadata. It does not change the upstream schema. New integer fields emit
standard integer/minimum/maximum constraints in place of nonstandard uint32
format annotations; strict validators still reject fractions and overflow.
