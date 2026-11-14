# Native terminal candidate

Herdr Core owns the shell process and canonical terminal state. Voyager stores a
Core terminal address on a content instance, separate from its placement. Its
single framed Core connection carries RPC, viewer data, input, focus and credit.
Closing a viewer sends CLOSE; it does not stop the terminal. Current application
Quit closes viewers and private assistant resources while Core programs remain
running. Confirmed Close Voyage is the separate operation that saves Notes and
stops that Voyage's verified programs. Earlier shutdown checkpoints below do not
override this owner decision.

## Wheel input

The native terminal keeps normal-screen history navigation local. When a program
requests mouse tracking, wheel movement is encoded by the pinned terminal library
using that program's active mouse protocol and the current cell/display geometry.
An alternate-screen program without mouse tracking receives encoded up/down arrow
keys, including its active cursor-key mode. This follows the retained Herdr
interaction without changing the Core process or attachment policy.

Fractional movement accumulates to complete lines in the existing pane. Program
wheel input uses the current viewer's admission queue directly. It does not run
keyboard input preparation, clear selection, commit composition or force a history
viewport to the live edge. Received output still owns display invalidation.
Normal keyboard/paste input retains its existing return-to-live behavior. Oversized
encoded wheel input refuses before viewer admission rather than truncating or
replaying input.

## Tab and focus

The shell root binds Tab and Shift+Tab to focus cycling. GPUI dispatches a
matched binding before an element's key-down listener, so without a terminal
binding the root moved focus and the program never saw either key. The
terminal element carries the `Terminal` key context. In that context,
`terminal_input.rs` binds Tab and Shift+Tab to `NoAction`, which masks the
root's binding of equal precedence. The keystroke then reaches the terminal's
key-down listener, and the encoder sends `0x09` and `ESC [ Z`.

Ctrl+Tab and Ctrl+Shift+Tab are reserved in the terminal for the root's focus
actions, so a keyboard user can still leave a terminal, and the root's focus
trap still applies. The program never receives those two chords. Outside a
terminal, Tab and Shift+Tab move focus as before.

`a_focused_terminal_receives_tab_and_shift_tab_and_keeps_focus` and
`ctrl_tab_leaves_the_terminal_and_tab_still_moves_focus_elsewhere` mount the
real `ShellRoot` with the app's terminal bindings over a terminal pane and
another focusable pane. They do not draw a `TerminalView`. The native
`terminal-input` journey is the check that the real view carries the
context and that the program receives the bytes.

## Attachment geometry

The adapter attaches using a current generated Terminal record. A newly started
program reuses the common terminal metadata from its run response. An existing
binding gets a fresh typed observation. Run-only output/wait fields are unused
by these narrow helpers; output inspection remains an explicit operation.
Zero dimensions refuse before attachment. A mismatched terminal identity or
invalid dimensions after dispatch produce an uncertain result without replay.

The retained Viewer carries the dimensions from that exact AttachResult into
the native Screen. It does not reset Core or its local screen to 80 by 24 before
measured view sizing. Actual subsequent geometry changes use the existing
resize path. The real-Core canary sets 123 by 37 and verifies reattachment
preserves it. This does not by itself prove that every legitimate window resize
produces a clean Bash prompt. Native comparison owns that remaining observation.

## Explicit session Quit

Ctrl+Q closes the application viewers and waits for its private conversation and
audio resources to finish. It leaves Core programs running. Reopening attaches
the retained placements to those same live programs. After a computer restart,
confirmed-ended retained terminal placements open ordinary shells without
automatically resuming agents.

Close Voyage is a different application operation. It presents the current work
for confirmation, saves Notes, verifies the selected programs and stops only
that Voyage's programs. Hiding or closing a Vessel or Portal view preserves its
backend. See [confirmed Voyage shutdown](workspace.md#confirmed-voyage-shutdown).

## Program-reported activity

The source candidate adds optional OSC 7501 observation on the existing framed
Core connection. Its native protocol journey is pending. Existing Vessel and
Portal headers show the program's reported working, blocked, idle, done or error
word. Unknown has an explicit reason. The ever-reported flag is the exact Core
true/false when observed, and null when its source is unavailable. Reported done
is not process exit or a verified task result. Private conversation progress remains separate.

The adapter applies subscription snapshots, ordered events and Core's missed
replacement snapshots. It does not classify output or infer activity from
silence. Unsupported observation, malformed metadata, gaps and channel loss
remain unknown without an automatic repair RPC. Explicit Refresh can renew the
observation on the same connection. Input, workspace effects and Quit keep their
existing owners and admission rules.

Retained observation payload is capped at 1 MiB of partial line, 256 KiB of early
bytes and 1 MiB of root metadata across at most 256 bound addresses. Only root
word, optional app/kind/progress and source/observation times are retained in the
live cache. Scoped process inspection also exposes root title up to 192 bytes and
message up to 2,048 bytes as program-reported data, never instructions or authority.
Oversized auxiliary text is omitted with an explicit limited flag while preserving
the valid word and progress. Title/message and child history stay out of the live
cache and inline chrome. Addresses are capped at 128 bytes, app
at 32, and kinds/progress use the pinned supported values. Object overhead,
transient parsing, script/result copies and the existing 16 MiB frame are
separate from that 2.25 MiB retained observation budget. Oversized observation
becomes limited/unknown and does not limit workspace creation or terminal input.
The projection carries a cache-limit reason when bound addresses exceed the
cache allowance. Uncovered headers show unknown with a limit label. A terminal
absent from a snapshot remains unknown with a null reported flag; a present
terminal's explicit false remains false.

One coalesced owner wake retains the latest facts through a full mailbox.
Activity has its own counter and does not change document CAS or packageRevision.
Rendering reads cached data without a status polling loop or document read per
event. Existing scoped process list/read results expose the same reported-data
meaning after their normal caller/backend checks. Snapshots supply source time;
an event without that time clears it, even when its word is unchanged. Local
observed-at time is not substituted for Core's source timestamp. See the pinned protocol in
[Core's event documentation](https://github.com/herdrdev/herdr-core/blob/e07c2a1bedd62cf4787ee026ee23ee79c7d95491/schema/README.md#events).

## Earlier session-Quit checkpoint

The source candidate routes Ctrl+Q through the existing application owners before
calling GPUI quit. One request remains pending, and its final result is retained.
Repeated Quit does not issue another stop. Errors remain visible in the native
Header. This is source behavior awaiting the actual integrated native journey.

The workspace queue stops accepting new workspace, process, content-update and
terminal-open effects after its Quit message. Existing receipts retain their
outcomes. Cached Inspect remains available. Other reads retain their existing
identity/version checks and may refuse when Core or freshness is unavailable. Quit never
connects to or starts another Core to diagnose or stop a failed initial startup.

The Core adapter retains the permanent Core ID validated by hello. Before the
one typed server.stop call, it reads server.status on the same dedicated physical
connection and compares that ID. Display name, release text and compatible
additional metadata do not identify a different Core. Core owns its programs,
holders and descendant cleanup. The app then stops and reaps its own connector
child, allowing five seconds for confirmed exit. A lost or malformed result
remains uncertain, and no second stop is sent automatically.

The private conversation receives shutdown on its existing bounded queue. It
rejects later requests and discards undispatched callbacks. Already dispatched
application work keeps its original owner result. It cancels the current native
audio generation and closes its actual app-server child. Provider and connector
exit checks each allow five seconds. The audio owner allows six seconds for the
existing worker's completion flag. That worker writes completion after closing
and waiting for its actual helper, before sending Finished to the conversation
queue. Shutdown therefore does not wait for an event that only its blocked
queue could process. Audio stop alone is not treated as confirmed helper exit.
The private owner retains a provider child when exit confirmation fails.

The private queue keeps its existing eight-slot bound. It uses the already
available asynchronous channel so Quit can wait for queue admission without
blocking GPUI or falsely treating a full queue as completed shutdown. Ordinary
conversation calls retain their existing nonblocking admission behavior.

GPUI's final on_app_quit hook is limited to 200 ms and cannot cancel shutdown,
so it does not perform this transaction. The existing native Quit action waits
for both owners first. Forced process termination, platform logout and other
OS-initiated termination paths are not accepted as equivalent verified Quit.

Viewer close/minimize and floating-avatar restoration remain the unchanged
controller behavior. They do not run this stop transaction. A later cold start
loads the same saved spaces/content/backend bindings. It does not regain the
in-memory permission for a saved agent launch or start a replacement. Ended
programs remain ended. This adds no implicit draft save or agent-session restore.

Focused owned-child and private-Core tests are preparation. Full acceptance
still requires real viewer restoration, actual Quit with provider/helper/Core
and program exits, a running unrelated survivor and cold reopen with no agent
restart. The original avatar and other corrective histories remain binding.

Before requesting a new terminal, the application saves an operation identity
in the versioned workspace document and supplies the same identity as a Core
terminal label. A known refusal clears the marker through a confirmed document
write. An uncertain start or a failed subsequent layout save retains the marker
and reports the address or label for inspection. The app does not repeat the
start automatically, including after reopening the profile.

A confirmed marker-save refusal occurs before any terminal start and remains a
known refusal. If Core has already started and saved a terminal but refuses its
attachment, the response retains that refusal and the actual terminal address.
An attachment transport failure remains unconfirmed. The view retries a known
refusal only after an explicit Refresh has obtained a fresh workspace snapshot;
it does not use Refresh to replay an uncertain start.

The generated terminal request carries a request ID, content ID and expected
workspace revision. The response returns both identities and a typed applied,
rejected or uncertain outcome. This separate request is needed because an
applied attachment yields a native viewer retained by Rust, not a serializable
layout value. The application retains the latest 32 terminal requests and their
outcomes in memory. An identical request returns its retained outcome; the same
identity with changed fields is refused. That bounded memory is not durable
deduplication; the saved pending-start marker is the restart guard. After each
successful open, the UI inspects the current layout before another workspace
effect so that both pending and binding saves are reflected in its revision.

An old successful receipt can outlive the viewer it originally attached. Before
replacing a native viewer, the host checks the returned channel while holding
the viewer-map lock. An expired channel cannot close a newer viewer. The host
reports that the original attachment applied but subsequently expired; it does
not reattach or repeat that request. Repeating a receipt for the still-current
open channel keeps the viewer in place.

The viewer uses libghostty-vt on the UI thread to interpret Core's VT stream.
It returns credit after parsing, not on receipt. The connection bounds buffered
output to 1 MiB per viewer and 16 MiB in aggregate, separately from the Core
frame limit. A dispatch parses at most 64 KiB in chunks of 4 KiB while checking
the 2 ms budget between chunks. One parse call cannot be preempted. Replies to
forwarded terminal queries are bounded and sent through the same viewer. The
current view does not render Kitty graphics and does not acknowledge them as
displayed. Core owns focus reports; Voyager sends the FOCUS frame once per
focus transition.

One Core connection has 64 viewer slots. A stream holds a slot while it is
open or still has unread output. Core opens each stream with 256 KiB of credit,
so 64 slots bound uncredited output to 64 x 256 KiB = 16 MiB, the aggregate
limit. When Core closes a stream for an ended program and the pane has read its
output, the slot is free. The ended entry remains so that the pane still
reports the ended terminal. Hidden terminals keep their slots. Attachment checks
the occupied slots before it sends anything to Core. At 64 it returns the known
refusal `viewer_limit`, and the connection and its other viewers continue.
Attachments are sequential and every other stream change frees slots, so the
check also bounds the reply. Output beyond either byte limit is a Core protocol
violation and still ends the connection.

When the connection ends, its reader or writer names the reason, such as
`read failed: UnexpectedEof` or `Core attached an invalid channel`, and prints
it once to standard error as `Core bridge disconnected: <reason>`. Voyager's own
close or quit records its reason and prints nothing. Every later viewer frame
and Core request returns the known refusal `disconnected` with that reason, and
nothing is queued. A viewer checks the connection before it queues a frame, so
no frame is accepted once the connection is known to have ended. `busy` means
only that a queue on a live connection is full. Voyager does not reconnect or
replay the refused frame.

The grid candidate retains Ghostty's cell graphemes, colors, styles and cursor
state. Its measured monospace cell size and painted pane bounds determine the
local grid. A deferred resize queues Core RESIZE and display FACTS on the same
viewer; queue pressure retains the latest size for a nonblocking retry. The
existing 64 KiB and 2 ms limits govern VT parsing, not complete snapshot or
paint time. Ghostty's dirty-row flags and row identities retain unchanged cell
arrays and shared text across updates. A full snapshot is prepared before dirty
flags are cleared; presentation then reads the retained data. Blink, overline
and exact underline variants are not yet rendered.

Initial terminal colors and the eight named ANSI colors follow the existing
Electron reference. Faint text blends its foreground at the reference renderer's
50 percent opacity while preserving the cell background. Ghostty's cell color
queries resolve the stored foreground and background independently; Voyager
applies the inverse attribute after those queries. The cursor uses its reported
color, including the reference default.

The initial release demonstrated a shell's colored wide Unicode glyph in the
alternate screen, native window resize from 101 by 41 to 88 by 35, and the same
terminal address and numeric PID. That result remains bounded: it did not prove
all full-screen applications, a coding agent, selection, clipboard, IME, hidden
output, compositor timing, another platform or the complete terminal module.
Its proof-size gate remains held.

The continuation separates native stream/focus/resize mechanics in terminal.rs,
the VT screen and cache in terminal_screen.rs, presentation and pointer routing
in terminal_view.rs, and operating-system text composition in terminal_input.rs.
These are private native implementation modules behind the same registration
boundary. No application contract, process owner or terminal parser was added.

Selection uses Ghostty's tracked grid references and gesture operations. A
selection change updates the selected column ranges separately from the retained
cell arrays. The native background uses the reference selection color
#53506a88. Copy formats the selected terminal text with wrapping removed; paste
uses Ghostty's current bracketed-paste mode and sanitization. Linux uses
Ctrl+Shift+C and Ctrl+Shift+V, while macOS uses its Command key. Clipboard text
whose encoded form exceeds the existing 64 KiB terminal input limit is refused
before invoking the input callback. Bracketed-paste markers count toward that
limit. One accepted callback is not a claim of an atomic PTY write. Ctrl+C continues to be terminal input. Wheel input preserves fractional
scroll movement; typing returns the viewport to the current screen.

GPUI's native input handler retains a local UTF-16 composition preview and draws
it at the actual terminal cursor. The running program receives only committed UTF-8
text. Composition is limited to 64 KiB and one preview line, and candidate-window
positioning uses the same font shaping as the preview. Terminal output is not
an editable document: native replacement ranges refer to the active preview,
and committed text goes to the existing terminal input path. Blur cancels the
local preview. Operating-system IME activation and composition still require a
real input-method journey; reducer tests and Unicode keysyms cannot prove it.

Hidden terminal entities keep consuming the same bounded stream into their VT
state. Output no longer constructs cell arrays in the stream callback. The next
visible render snapshots the current screen, retaining unchanged rows. A pending
geometry change can finish its one resize snapshot, but hidden output does not
run a repeating snapshot or paint loop. Input and control retain their existing
separate bounded queues. This is a source mechanism, not a measured latency or
memory result.

Each continuing pump iteration explicitly suspends its foreground future once
before consuming another ready token. A queued token alone does not suspend an
async task. The one-shot yield wakes its continuation and returns Pending once;
it adds no idle polling or timer. Disconnect and completion return directly.
This gives the event loop an opportunity to handle input and frames, but actual
saturated-output responsiveness and latency still require native evidence.

The extended maintained terminal-grid journey is prepared for native selection,
copy/paste, continued hidden output, focused input in another Fleet, restored
input to the same terminal, and actual split sizing. It has not run against the
continuation source. The first corrective release remains pending independent
source review. Performance, native agent behavior, additional terminal styles,
complete lifecycle and platform acceptance remain open.

`app/core-schema.cjs` extracts the used hello, document, terminal and server
message types from the reviewed Core 0.1.16 schema after checking its canonical
SHA-256. Cargo generates the Rust types from that checked schema. Named Core
adapter methods own the wire conversions; document values remain arbitrary JSON.
The hello request uses the generated type, while its fuller response and endpoint
compatibility validation remain the separate K2 continuation. Terminal list
decodes the used terminal records without requiring the reviewed schema's
`machines` field, which the installed Core omitted in an isolated check. The VT
binding uses [libghostty-rs at 8363442](https://github.com/Uzaaft/libghostty-rs/tree/83634421c232385f9fd7c61f454961341453d661),
which builds Ghostty's VT library and requires the matching Zig toolchain.
Core protocol behavior is based on
[Core e07c2a1](https://github.com/herdrdev/herdr-core/tree/e07c2a1bedd62cf4787ee026ee23ee79c7d95491).

The terminal chooses its font once when the pane is created. It prefers the
reference's DejaVu Sans Mono, then an available monospace family, and uses the
same family for cell width, displayed text and input-composition positioning.
On the observed Linux host DejaVu Sans Mono is absent and the reference's
monospace fallback is Noto Sans Mono. Without an explicit available mono family,
GPUI's general fallback can select a proportional font; using the advance of its
wide `M` for every cell makes narrow letters appear widely spaced. If no named
mono family is available, the earlier DejaVu request remains the last resort.
This source correction has not established native visual parity. The existing
18-pixel row height remains unchanged until a matched reference measurement.

The pane retains the measured font advance and snaps it to a device-pixel cell
width for the current window scale. Column fitting, Core's cell size, both paint
paths, selection and composition use that same width. Row positions use the
column index, including wide-cell slots. A scale change recomputes the width
from the original font measurement. This prevents individually snapped cells
from painting beyond the space allocated to their columns without changing the
font, padding or row height. The clipping correction still requires native
verification against the recorded footer and a resize.

The Core child receives an explicit dedicated-session endpoint rather than an
inherited `HC_SOCKET` or shared fixed-socket setting. On Unix this follows the
pinned Core's runtime-directory and session-state fallback; on Windows it uses
the pinned named-pipe naming rule. The existing session and its Core state are
not renamed. Core's own existing-session lock check still refuses a session
that is listening elsewhere. The Unix resolver calls `libc::getuid` in one small
unsafe expression. This C function takes no pointers and returns the calling
process's real UID; it does not mutate memory or the process. Linux evidence
does not establish macOS or Windows behavior.

Hello validates the advertised generation, framed mode, Core identity, and the
methods and features this adapter uses, without pinning the Core version or
rejecting additive fields. Dispatched replies must have the expected JSON-RPC
version and identity and exactly one valid result or structured error. A known
refusal retains its Core kind. Malformed, ambiguous, internal and unknown errors
remain uncertain without an automatic replay.

## Earlier explicit new-shell mechanism

The current source adds a deliberate `start-new-shell` workspace action for an
existing terminal content ID and expected old backend. It uses the ordinary
request revision, captured caller scope, single Client queue and receipt. The
owner refreshes the document, verifies the binding and canonical finished state,
and retains the old backend while saving a shell intent. A historical PID on a
finished Core record is valid metadata and is never signalled by this action.

Only a confirmed intent save grants the exact shell/old-backend/intent identity
through the existing creation-permission path. The ordinary native terminal-open
flow checks it again and uses the existing start marker, Core run and binding
save. Confirmation clears the intent and publishes the new backend. The old Core
terminal record remains available. Uncertain dispatch keeps its marker and is
not replayed. Quit still refuses new work. A later app start has no retained
in-memory creation grant, so it attaches the old ended binding without starting
the saved intent or old agent arguments.

Inspect retains an existing immutable creation grant even when an outside edit
makes its launch or intent ineligible. The opening owner needs that record to
reject a changed launch instead of treating it as an ordinary unbound shell.
Advertising eligibility still requires the exact current tuple to match.

The updated Header treats the typed ended reason as a neutral condition and
offers one Start new shell button inside that content placement. Placement ID,
content ID, name, tree and avatar context stay unchanged. The new program always
uses the ordinary shell launch. A fresh intent can replace the old opening;
an automatic owner notice cannot retry a refusal for the same intent. Refresh
does not gain start permission merely from an old ended response. Existing
explicit repair of a known refused opening retains its separate behavior.

Personal Header source and validators are not overwritten. Existing workspace
documents omit the new optional `shellIntent` field and continue to load. The
new button and typed ended response require the updated Header/generated API;
an older copied strict validator can reject new fields rather than understand
the new operation. Upgrade such a personal package deliberately. No automatic
package migration or source merge is implemented here.

These are source and pure-control claims. Native same-placement shell input in
both Vessel and Portal after Quit/reopen still requires the maintained session
Quit journey on the matched release. Already-attached terminal end presentation
and its original correction history are unchanged by this cold-attachment path.


## Exit and reopen feedback candidate

The 5 November feedback changes the earlier manual-restart presentation. Recognized agent launches run as children of an interactive Bash process. The executable and its arguments remain separate positional arguments; the command does not interpolate user text. Agent exit returns to an ordinary Bash prompt. Normal shell exit is confirmed by Core's `finished` state and `exited` reason before the application removes its placement from the panel tree. Losing a viewer or Core connection does not establish shell exit. The application owner publishes the resulting layout change.

At application startup, a successful Core terminal roster can prepare retained placements whose old program is confirmed finished or absent. Only ordinary shells are eligible, and their original content IDs/directories are retained. Closed Voyage/Fleet layouts can be prepared without starting programs; the existing visible-content path starts a shell when the user opens the view. A placement removed from its tree is not prepared. Live backends, pending starts and unresolved shell intents stay unchanged. The existing pending-start marker and binding save still fence uncertain effects; no agent launch or instruction is replayed.

`app/src/terminal_lifecycle.rs` holds these small layout decisions. `app/src/client.rs` owns their Core observations, versioned saves and creation grants. The desktop remains a viewer rather than another supervisor. Existing explicit new-shell operations remain available for deliberate repair; they are no longer the intended default after a confirmed cold restart. The real-Core owner test verifies new plain-shell preparation and a new binding after shutdown, alongside an unchanged unrelated session. The complete native UI journey remains a separate check.

## Terminal state words

`app/src/core_state.rs` owns the words Core reports for a terminal. `TerminalState` has `Live`, `Finished` and `Unknown(String)`. It is parsed from the `state` string on access, because the generated Core types keep `state` a string and the generator belongs to the Core adapter. `Terminal::is_live`, `has_ended` (finished with a confirmed start) and `has_exited` (ended with the `exited` reason) are the only places a state or end-reason word is compared. `ProcessInfo.state` stays Core's word unchanged, so the process wire, its schema and the seeded validators do not change.

An unknown word keeps its terminal. Comparisons treat it as neither live nor finished, so the placement, backend and attached viewer stay, and the existing known-refusal and uncertain-result paths apply. Each new word is written once to standard error. Core's event types and error kinds that are also spelled `finished` are separate vocabularies and stay in `core.rs` and `activity.rs`.

## Agent display names

Process inspection exposes an informative program-published terminal title for
recognized agents as their display name, with the working folder as fallback.
Two named sessions in one directory can therefore have different names. Generic
program titles and path-like titles are excluded. This is observed display
metadata, not an automatic mapping to provider transcripts or a native
conversation identity. OSC activity titles describe current activity and are
not used as session names. Explicit placement names remain separate.

## Conservative background-span experiment

The performance candidate preserves the existing native text, selection, cursor and input paths. It joins only equal-background, equally selected empty narrow cells after the last printed, decorated, wide or cursor cell in a row. Printed cells and their following coverage remain ordered as before. The private `terminal_background` module produces ranges without allocating a second vector.

GPUI rounds each original cell width to device pixels. A merged range must sum those individually rounded widths; rounding the total logical width changes the edge of a coloured tail. Single and wide cells retain their original layout path. The experiment uses `VOYAGER_EXPERIMENT_COMPACT_BACKGROUNDS=1`; `0` retains the baseline. It introduces no application contract, process owner, content cache or global activity filter. It remains a performance candidate until the recorded native comparisons and review support adoption.

## Rejected row drawing experiment

The isolated row-paint experiment retained one draw plan per current viewport row under the existing Pane. A plan holds the existing immutable cells, resolved per-cell text shaping and ordered background, glyph and cursor draws. Its key includes cell content, selection, that row's cursor, font, text decorations, cell size, device scale and used default colours. Unchanged rows reuse their plan. Shrinking the viewport drops retired entries; dropping Pane drops every plan. Screen and Core remain the terminal data and process owners.

The Canvas path preserves the original left-to-right paint order, including backgrounds that cover glyph overhang. Cell widths and line height follow the original device-pixel snapping. It shapes each existing cell separately and retains the same wide-cell and cursor-tail rules. Active accessibility and inherited overflow/clamp use the existing element path. The archived candidate used `VOYAGER_EXPERIMENT_ROW_PAINT` to select its path. That path is not part of the selected product build. A bounded diagnostic counter records actual Canvas row construction when proving is enabled. This is retained CPU-side preparation, not a claim that GPUI skips scene replay or GPU painting. It passed eight exact native pixel states and cut busy CPU substantially, but one matched input pair regressed beyond the frozen allowance. It was rejected for adoption. Source and its integration patch remain under `experiments/performance/row-paint/`; the selected app keeps the checked compact-background renderer. Any future attempt needs a new explanation and comparison, rather than a favorable rerun.

## Isolated typing trace

The typing investigation adds disabled diagnostic hooks at terminal key receipt, input admission, output-pump entry/completion, snapshot completion, render construction entry and the native input Canvas paint callback. The paint callback does not establish completion of all drawing, GPU submission, compositor presentation or physical scanout. Core/Codex transport remains one combined interval until separately instrumented. Values are byte counts or flags, never keyboard text or terminal contents.

`VOYAGER_TYPING_TRACE=1` activates recording only when `VOYAGER_WORKSPACE_SESSION` starts with `voyager-typing-`. The helper lives in `experiments/performance/typing-latency/trace.rs` and is private to the application crate, with one narrow desktop record function. No application operation, authority or provider/Core protocol changes. The owner preview does not enable it.

Callers take monotonic elapsed-time brackets around a wall-clock sample and try to enqueue a small record. They do no file I/O and never wait for the diagnostic writer. One scratch-only writer serializes records outside the render thread. Its queue holds at most 4,096 records, emits a limit marker after 20,000 event records, publishes attempted/dropped counters, and stops after 120 seconds. A dropped record, limit/expiry marker, null clock or missing required event makes attribution incomplete. These are diagnostic failures, not application refusals.

Internal event intervals use the common process monotonic clock. Alignment with external dispatch/capture requires recorded wall-to-monotonic brackets and checks for clock changes. Unresolved clock alignment stays unresolved. An adjacent output batch or render callback is not automatically the response to the preceding key. Validate actual glyph correlation in the isolated Codex scene before attaching those events to a key. Compare tracing off/on with the same release before using its timings to explain normal operation. The logger is experimental support and counts in authored proving inventory; it is not an accepted runtime optimization.


### CPU-contention transport observations

The private experimental trace is compiled once in the application crate. The desktop uses its narrow record function. Both existing writer paths record terminal-data frame write/flush start and completion or failure. The reader records a complete data frame after channel classification and before stream buffering; that point includes the membership-check lock interval. Metadata contains only channel, byte count, stage and clock brackets. Protocol replies can also use data frames, so timing does not prove a human-input or glyph association. Flush establishes pipe submission only.

UI, writer and reader are concurrent producers. Attempt sequences identify records and loss; log arrival order is not monotonic event order. Analysis checks unique complete sequence sets and orders by monotonic brackets, preserving overlaps as uncertain. It adds no UI lock or transport scheduling change. The scratch guard and finite queue/event/time bounds remain. These diagnostic hooks establish neither a product latency fix nor observer equivalence.


### Foreground frame-work profile

The nondefault desktop feature frame-profiler enables the pinned GPUI foreground journal. The experiment collector requires VOYAGER_FRAME_PROFILE=1, a voyager-typing- scratch session and an absolute, absent VOYAGER_FRAME_PROFILE_STOP path. A background thread creates a new JSONL file at that stop path with a jsonl extension. Creating the stop file ends collection; 120 seconds and 20,000 records remain independent limits. The end record states the requested stop, truncation, expiry, journal loss and observed-prefix boundary. It does not establish complete process-lifetime coverage.

Draw phase durations separate request/layout, prepaint and scene paint. View self-durations attribute that work without adding nested spans twice. Task polls can include drawing; their totals are another view, not an additive category. GPUI folds polls below 100 microseconds and retains view self-time only above 500 microseconds. SmallPolls records total/count, not just elapsed span. The normal completed-platform-submission record comes from the journal's Presented boundary and retains its associated draw identity and WindowId. Platform submission is not GPU completion or physical display.

All event ages are sampled within explicit wall-clock brackets before JSON formatting or file output. Original durations remain independent of collector delay. Analysis must retain scheduling overlaps, loss and unavailable intervals. The feature itself instruments GPUI even when the collector flag is absent. It is a diagnostic artifact; ordinary candidate comparisons exclude the feature. The collector does not enable unused legacy timing buffers or change application work, authority or Core behavior.

### Native presentation preference

The Linux X11 platform patch prefers Mailbox presentation, matching the pinned GPUI Wayland implementation. The renderer selects it only when the surface supports it and otherwise retains FIFO. This changes frame queueing at the platform boundary, without changing terminal cells, application state, avatar motion or input. Mailbox replaces an obsolete pending frame with the newer frame at a display refresh; it does not request unsynchronized tearing. Native Linux evidence does not establish macOS or Windows behavior.

`desktop/prepare-sdk.py` prepares the pinned gpui-pre-linux 0.3.10 crate from its checksum-verified crates.io archive, applies the small platform patch in a temporary directory, and checks every prepared source file against that result. The source cache includes the patch digest. Existing registry files and other SDK caches are not edited. Only the exact earlier generated Cargo configuration can migrate automatically; unrelated configuration or modified prepared source is refused. The lockfile records the local patch. The performance investigation owns measured effects and any resource tradeoff; the preference alone does not establish responsiveness acceptance.

The monitor-clock patch caches active CRTC rectangles and intervals per X root after subscribing to RandR screen, CRTC and output changes. Those events refresh the cache. Each existing timer selects the largest overlapping cached rectangle from the window's current bounds, converted back to its own X root units using its stored scale. Wide intersection arithmetic avoids overflow. Equal overlaps prefer the previous interval; no overlap retains it. A move or mode change takes effect by the next timer tick. No display query, new timer or extra thread enters the frame/input path. The existing resize-origin rule and hidden-window lifecycle remain unchanged. The cache supports explicitly selected X screens instead of mixing their coordinate systems.

### Terminal input invalidation

Admitting a key does not change the echoed terminal contents. After successful Core viewer admission, input preparation clears selection, resets the selection gesture and returns a historical viewport to the live edge. It reports whether selection or viewport changed. The pane combines that result with its existing dirty state, preserving pending output. A normal key at a clean live edge waits for output to invalidate the view; selection/history changes and input errors notify immediately, including when the program does not echo. Rejected admission leaves selection and viewport unchanged. Clipboard copy and IME composition retain their existing paths; composition still updates when its visible preview changes. The output pump remains responsible for drawing received terminal changes.

### Retained terminal rows

The provisional ordinary performance candidate keeps native row drawing in
`desktop/src/terminal_rows.rs`. The row module owns only drawing plans. Rust
application state, Core streams, terminal parsing and placement keep their
existing owners. No browser renderer or additional process is introduced.

Each visible row retains one plan keyed by immutable cells, selection, cursor,
font, colours, dimensions, text style and device scale. Unchanged rows reuse
their shaped text and draw operations. Changing a key replaces that plan.
Shrinking the viewport drops retired row caches. Accessibility, text overflow
or line clamping use the existing per-cell elements and clear the row caches.
Both paths retain compact empty backgrounds with the same device-pixel rounding.
Input methods and selection continue through the existing native handlers.

The original row experiment failed its earlier input regression rule. That
result remains rejected. The current candidate combines independently measured
presentation and input repairs, and requires a fresh repeated comparison plus
native fidelity checks before selection. Source location is not acceptance.
