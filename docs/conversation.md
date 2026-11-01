# Native private text

The private conversation belongs to the Rust application. Opening chat reads its
current projection without starting Codex. The first human Send starts a separate
installed Codex app-server over stdio and creates an ephemeral private thread.
This uses the existing native account, with no API-key route or account-file read
by Voyager. Terminal agents and the private conversation remain separate.

The default model is gpt-6.1-sol with high reasoning effort. A profile-local
conversation.json may contain model and effort strings. These change only this
private administrator connection. The sandbox is read-only, shell_tool and
multi_agent are disabled as in the retained companion, and application tools
are not installed in this first checkpoint. Restoring native inspection and
the existing application tool groups is C2 work. Instructions describe the
administrator role; they are not represented as an OS-wide security boundary.

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
until the native turn identity arrives. Outbound frames are capped at 64 KiB,
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
voice and application tools remain separate integration requirements.

The native account trial also observed the installed Codex stop hook continuing
the same turn. Its additional visible message reached chat through the native
stream; Voyager did not submit another request. Reconciling those account-local
instructions with the administrator's native tools belongs to C2. This checkpoint
does not change global hooks or claim that continuation is the finished chat UX.
