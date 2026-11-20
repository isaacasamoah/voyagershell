# Native Notes integration

The native candidate uses one Notes package in Fleet Vessels and Voyage Portals.
The 7 November Linux candidate passes real file editing/saving in both placements,
warm viewer restore, Markdown Preview/Edit with retained caret and undo, seven
source edit/error/repair phases, and package removal across application restart
followed by restoration. Core and its terminal remain the same through that
restart. A separate real content-tool journey verifies independent Notes updates
and rendered results after Chat closes. These bounded results do not establish
every agent action, resource limit or the combined-foundation proving-code cap.

`contract/src/content.rs` owns the versioned Notes request, response and data types.
The existing generator exports their validators beside the workspace and
conversation contract. `app/src/content.rs` owns persisted data, revisions and
schema checks. `create-vessel` uses the shared panel owner and an explicit
empty or beside-placement insertion with a left/right/top/bottom side and
an explicit type ID. The built-in type IDs are `terminal`, `agents` and `notes`. A package that carries a manifest declares one more type ID, as the next section describes. `NOTES_TYPE` in `app/src/content/description.rs` is the one spelling of the Notes type ID in Rust; the package folder, the Notes data folder and the stored configuration keys keep their own names.
Changing a placement does not change its Vessel ID or data. A Notes placement
never enters terminal preparation or starts a Core process.

`app/src/content/description.rs` describes the two supported Vessel types through
the generated `contentCatalog` contract. Each description names its current
GPUI Shell host version, registered native view, supported placement scopes,
generated action input and owner-result schemas, and optional Core terminal
backend. Notes state uses the same bounded package schema lookup as a bound
Describe request and the same defaults as workspace-owned initialization.
Descriptions contain no Vessel binding or authority. Discovery reads
metadata, creates no content and starts no backend.

Each entry now reports ready, removed or unavailable with a reason. Removing or
breaking Notes metadata leaves Terminal discoverable. Unavailable entries omit
state defaults and action details. Metadata errors longer than 1,024 characters
are labelled as truncated. If the complete catalogue would exceed the existing
content envelope, package state/action details are omitted with an unavailable
reason instead of hiding Terminal behind a failed catalogue response. The actual
native Notes host also reports its own VM setup failure without quitting the app
or pretending that a Notes editor loaded. Ready metadata is not native rendering
evidence.

Notes keeps selected-file metadata in `notesFile` on its stable Content record.
The declared `new-note` and `open-note` actions change that selection through the
same Rust owner used by the native menu. Direct `configure` refuses a changed
file binding. The file must belong to the owning directory's Notes folder;
selection does not change content identity or an independent Note's draft.

The shipped Notes and canvas declare numeric `contentConfiguration: 2`.
Versions 1 and 2 support selected-file configuration metadata. Notes version 2
omits configure from Describe and refuses direct configure writes at the owner.
Its Markdown interface has no NOTES eyebrow or writable presentation setting.

The legacy `showHeading` Boolean defaults to true and remains readable by personal
packages through `show_heading()`. Notes version 1 retains legacy configure when
Canvas supports metadata version 1 or 2. The current renderer ignores that value.
An unsupported or missing capability version omits metadata and configure. No
stored value or personal package is rewritten, reseeded or silently upgraded.
Removing metadata support would also remove the file binding from Snapshot.
Discovery grants no authority; dispatch retains bound caller and scope checks.

Accepted configuration is an optional object on the stable Content record in the
existing Core workspace document. The Client content queue checks fresh membership,
caller scope and the inspected workspace version, then uses the existing document
CAS. It saves no separate file or revision. A configured result identifies the
instance, accepted value and actual resulting workspace version. Confirmed saves
update the actor's workspace and publish both workspace and affected content
notifications before returning. Duplicate requests reuse their original receipt;
changed identity, stale versions, unsupported bundles and effects after Quit refuse.
Post-dispatch uncertainty keeps its receipt and invalidates only for a read. It
never resubmits the configuration or claims a confirmed workspace version. A later
content read that discovers a changed Core workspace version also publishes that
observed version to the workspace listener. It leaves the earlier receipt unchanged.

Inspect returns optional configuration metadata beside the data snapshot. The
metadata comes from the fresh workspace, independently of last-good Notes data.
Title/text revisions and dirty drafts remain separate. Missing stored configuration
means the default. Unknown fields and non-Boolean values refuse at the typed
content boundary. The current compatible canvas/Notes bundle is required after
saving configuration. Loading an older strict canvas may expose its own validation
or load error; source, data and configuration remain preserved until an explicit
compatible package update or restore. There is no migration, reseeding or response
stripping.

The legacy configuration owner has Core-backed checks for persistence, both
notices, independent data, stale/scope/capability refusal, duplicate identity and
fresh configuration over last-good data. They do not establish current native
file selection, dirty-editor behavior or lost Core confirmation. New/Open,
retained draft and sibling isolation require their actual integrated journey.

The canvas-only `voyager_content_view.descriptions()` binding returns typed
contract data as JSON from background host work, within the existing content
envelope limit. It does not extend the private Notes registry. The catalogue and
bound Describe use the same owner. The creation picker reads this catalogue to
check Notes availability; its direct Notes selection still needs its own native
journey. The configuration journey creates Notes through actual administrator
tools. Personal package JavaScript remains independently editable.

The source adds explicit remove-vessel-package and restore-vessel-package
workspace actions. Native administration and an administrator captured at whole
Workspace scope use the existing Client queue and request receipts. Narrower
captured scopes refuse. Before changing files, the owner reads the actual Core
document and checks the expected revision and caller again. It moves the complete
personal Notes directory between vessels/notes and vessels/.notes.removed. Restore
requires no active destination; neither operation edits instance data, placement
or any Core backend. A reused remove receipt cannot remove a restored package.
On Linux the move uses renameat2 with RENAME_NOREPLACE, including when another
actor creates the destination after the preliminary check. Its two C strings
are owned, NUL-terminated and live for the syscall; the kernel only reads their
bytes. Other platforms return an unsupported error instead of copying source or
using an overwriting rename. This has no macOS or Windows acceptance claim.

Notes launch seeding occurs only when neither the active nor preserved directory
exists. An existing partial package is reported instead of being silently repaired
from shipped files. This keeps deliberate removal in place across restart and
keeps personal source, assets, guides and configuration available for restore.

Workspace notices carry the genuine Core document revision and a separate
package revision. The package revision advances only for successful package
operations; a filesystem-only operation does not save a layout or invent a CAS
revision. The native canvas keeps its single subscription and the script consumes
the notice before queuing a coalesced read. A document notice already reflected
in the view does not trigger another read or prepare. Automatic notice reads still
prepare newly authorized content, but do not clear and retry known-refused
terminal openings. Deliberate Refresh retains that retry. A start that stays
uncertain after the owner's settle is never repeated. The prior revision() read remains available for personal canvas
source; new composition uses notice().

The filesystem/availability and notice changes have source tests and a separately
recorded Core-backed package receipt/scope test. The retained lifetime journey requires the original shell to end with zero
live programs after a stopped session and cold reopen. Its warm Restore step was
removed with the warm close, which closing the window no longer performs. Package restore
keeps that ended binding rather than starting a replacement. The earlier
seventeen-stage result remains tied to its legacy controller.

## Retained editors and staged source replacement

`desktop/src/notes_session.rs` owns one real native Title editor, Body editor,
resizable body height, dirty draft, original data revision and accepted save task
per mounted Vessel ID. The fresh shipped TypeScript remains the visual
composition. It opts into SessionState, RetainedTitleState and RetainedBodyState.
The retained editor handles expose values, not setters or focus commands, so an
unpublished candidate cannot replace a dirty buffer during construction. Native
input events update the draft and request a save on blur. Change comparison
keeps cheap native shared-string handles rather than cloning the whole body
on each keystroke. SessionState.save is an
optional explicit save intent, permitted only for the active generation.

A single native Task per active edit session subscribes before reading the real
Client owner. Replacing or removing its view drops that Task. It retains the
editors and their focus handles, text, dirty state and original revision. A save
already admitted to Client completes against that same session independently of
its old presentation. Known refusal permits a later deliberate retry. Unconfirmed
saves remain unconfirmed and unchanged blur never repeats them. Publication does
not itself retry an unsent script save.

`desktop/src/notes.rs` owns one background package watcher for all retained Notes.
It compares streamed JavaScript fingerprints, bounded metadata and the existing
actor-owned package revision. The reused source scanner limits directory depth
to eight and the file list to 4,096 entries. It uses an 8,192-byte read buffer
but has no per-file byte or scan-time cap. This is not a CPU or memory benchmark. Removal followed by restore is observable even if
both operations happen between source scans. Metadata/source reads occur outside
rendering. A changed source constructs a separate ScriptView through the pinned
public load_application and mount_application methods. The old view stays current
until the candidate's real render reports no build_error or owned Title/Body
materializer error. Publication is deferred outside rendering. Parse,
construction and observed first-render failures retain the current usable view
and expose the error. Repair stages a new candidate.

The pinned SDK does not expose a general materialization-result or layout-failure
API. This implementation observes public ScriptView.build_error and errors from
our actual Title/Body components. It cannot promise rejection of every later
built-in, deferred, layout or paint failure. It uses no hidden window, SDK fork,
private cache mutation or replacement of the workspace root.

`app/src/content/view.rs` gives each view a Pending, Active or Retired admission
state. Pending reads wait for publication and pending effects refuse. Retirement
and queue admission use the same short mutex boundary. Retired waits wake and
refuse before queueing; accepted messages retain their original binding and
receipt and finish normally. Confirmed remove/restore retires all registered
Notes generations. Normal data invalidation does not retire them. The package
watcher reads the same actor-owned packageRevision through a native atomic
projection, without another workspace listener or another revision clock.

These explicit gates fence detached legacy host work at actual Client admission.
They do not claim that dropping a JavaScript future cancels the pinned SDK's
background task. An admitted read may still finish after retirement. An admitted
save must finish and keep its actual result. Actual repeated reload and pending
host-task lifetime remain required native/resource observations.

## First-party profile files

`app/src/content/install.rs` owns the first-party files in a profile. They are the
canvas package, the themes and the Notes package. The table of shipped files is
`desktop/src/shipped.rs`. On every start the app compares each file with
`installed.json` in the profile, which maps the file's path to the FNV-1a 64
fingerprint of the bytes the app installed.

- A file equal to the shipped version only gets its record.
- A file equal to its record is untouched. The app replaces it with the new
  version by a Linux `RENAME_EXCHANGE` swap and checks the swapped-out bytes. If
  they are not what it judged untouched, it swaps back and keeps them.
- A file that differs from its record is edited. It stays active and is never
  moved or rewritten. When a new version ships for it, the app shows a notice
  and writes the diff from the person's version to the new one to
  `updates/<path with / as __>.diff`. The diff file is rewritten only when its
  text changes and is removed when the update no longer applies.
- A file with no record is judged by `app/src/content/pre-record-history.tsv`,
  the fingerprints of every version that main shipped before records existed. A
  match is untouched. No match is kept and flagged, and gets no record.
- A file that the app no longer ships is deleted only when it equals its record.
- A missing file is written, except in a Notes package that exists or was
  removed. Such a package is never repaired.
- A second start with nothing to change writes nothing.
- An unreadable `installed.json` is treated as missing. A record path that is
  not a plain relative path is ignored.

The history is closed. A shipped file changed after records exist needs no entry,
because every new install writes its record.

Gap. A build older than the one that updated the profile replaces untouched files
with its own, and an open build reloads files that another build writes. No
edited file is lost either way.

## Personal-source compatibility

Existing edited profile JavaScript is never overwritten. The original TitleState,
BodyState, Title, Body and bound voyager_vessel methods remain available with
their previous signatures. Old packages continue to own their legacy local
controller and do not automatically gain retained native draft migration. Using
the new session requires a deliberate personal-package source upgrade. The exact
old emitted controller is retained in desktop/notes-legacy-fixture.js as proving
code, not production credit. Its maintained read/refusal/lost-confirmation tests
establish only that supported legacy behavior. They do not establish the fresh
native session or a new native lifecycle journey.

`desktop/src/notes.rs` installs a `voyager_content_view` component only in the
Canvas policy. Its native factory retains one view per Vessel ID. Before opening
data, background work asks the existing Client worker for a binding. That worker
reads the authoritative workspace and checks the exact Notes placement before
binding existing data. It never creates a missing file while binding or inspecting.
Only a confirmed workspace creation initializes its newly issued Notes IDs with
create-new semantics. Failure after the workspace write returns Uncertain and does
not retry initialization. Requests cannot supply their own binding or path.

Each Notes candidate loads in its own isolated QuickJS VM with the private
voyager_input registry, under the limits in
[Vessel engine limits](#vessel-engine-limits). Candidates cannot import canvas
Terminal, Name or workspace modules. Each candidate has its captured
voyager_vessel module and application generation.
The host renders the published ScriptView beneath the existing single window
ShellRoot and retains the accessibility activation/overlay invalidation route.
The older native journey observed the legacy inputs with accessibility enabled
and disabled. The retained editor/staging path has separate native edit/error/repair captures.
The current configuration path has matched native input and captures with a dirty
sibling. Neither result measures VM memory or repeated-edit retention.

The private host accepts the request ID and expected revision beside the JSON.
It validates those small identity fields and reserves the existing request/byte
budget before copying a large request. Background work parses the admitted JSON
and compares its identity with that envelope before calling the bound owner.
Admission refusals retain a correlated rejected result. The limits remain eight
admitted data invokes per instance, four MiB of aggregate raw request bytes, one MiB
of Notes data and one MiB plus sixteen KiB for each request/result envelope.
These limits describe admitted raw payload, not total process memory. Data reads
stop after the data limit plus one byte, so an oversized file is refused without
reading the complete file into memory.

The view's save behavior is preserved. Known rejection leaves a usable draft and
permits a deliberate unchanged retry after its cause clears. Missing, malformed,
mismatched or uncertain confirmation marks that generation unconfirmed and does
not submit it again on another unchanged blur. Title/body values stay local until
the owner confirms an update. Schema warnings and last-good data remain visible.

Packages are seeded once into the selected profile. Personal JavaScript is not
overwritten. The shipped Notes composition is authored in `content/notes/main.ts` and emitted
to the same `main.js` by the existing strict TypeScript pipeline. The gate checks
Canvas and Notes separately using the same compiler/configuration. Notes receives
its actual `export-script-types --notes` declarations, not the canvas's broader
registry. Native Title/Body signatures and the content request/result types come
from the actual registry exporter and generated Rust contract. Each scope records
its declaration hash/modules in `desktop/script-types.json`. Wrong native calls,
unknown builder properties, missing invoke arguments, invalid data types and
Canvas-only imports fail the maintained control.

The small host function declarations remain in desktop/src/script_types.rs.
The gate checks that exported ABI, not an inferred Rust callback signature. The
legacy invocation still accepts three strings with correlated generated
request/result validation. Fresh Notes uses the additive actual native registry
signatures and the native session's typed Client calls. Type-only fields retain
declare so View.init state is not overwritten after construction.

The profile still receives editable JavaScript seeded once. Repository checking
covers the shipped TypeScript and emitted bytes, not arbitrary later personal
JavaScript edits. Personal files are not implicitly overwritten or migrated.

The earlier artifact's native journey covers save/reopen, stale and forged refusal, delayed
hydration, uncertain confirmation without replay, body resizing and independent
draft/focus retention. Switching Fleets retains the same Portal and data. Native
input still reaches the original Core terminal afterward. The sibling pixel checks
cover its measured title, body and status area, not the whole Portal title bar or
desktop. Earlier failed fixture attempts remain recorded separately.

The N3 source candidate adds generated voyager_vessel describe/inspect/update to
the same actual-provider callback path. Captured focus stays outside its payload.
The Client worker now owns the one Notes Owner and orders both UI and agent calls
with fresh membership checks. An existing hidden Notes instance is allowed only
inside the fresh captured projection and only when its data already exists. Old
request identities retain the same result; changed scope or arguments refuse.

Each retained view subscribes through a public async channel and an owner-held
invalidation counter before its first read. Only one wait is retained per instance;
a newer wait closes the previous one. A counter mismatch returns immediately, so
updates between waits remain observable. Applied and post-dispatch Uncertain
writes both trigger a read-only invalidation. The latter retains its uncertain
receipt and never resubmits the update. The controller rereads the actual owner,
independently of Chat. A dirty buffer, including typing while a read is pending,
keeps its original base revision and receives an external-change warning. Early
typing before the first read can acquire its first actual base without losing the
draft. No conversation result supplies an editor revision.

Only content arguments/results use the existing one MiB plus sixteen KiB envelope.
Workspace/process arguments remain eight KiB. Ordinary provider requests remain
64 KiB; correlated tool replies and incoming content frames have an outer JSON cap
of twice the Notes envelope plus 4,096 bytes, allowing string escaping and callback
identity. Incoming non-content frames retain one MiB. These are adapter bounds;
large-envelope delivery by the installed provider is not yet native evidence.
Oversized reads return a typed Limited result with the actual known revision and
warning-presence flag, explicitly withholding a complete snapshot/warning. A
post-dispatch confirmation that cannot fit remains Uncertain. The worker checks
request size before enqueue and bounds responses before receipt retention.

The Client mailbox remains eight messages. Binding, notification and UI
Describe/Inspect await asynchronous read-only admission and replies. A full queue
therefore delays the initial read instead of permanently disabling the view.
Updates keep try-send refusal and the existing 25-second reply timeout. The async
read API rejects Update; it cannot bypass effect admission. No read retry loop
resubmits an effect.

The callback and Client each retain at most 32 call results. Accepted payload
identity uses the existing SHA-256 primitive over recursively sorted JSON,
including the desktop's preserve_order feature, while
request IDs, tool names and captured access remain explicit. Full accepted update
bodies are discarded after dispatch instead of retained twice. Unchanged duplicate
calls still reuse their original result, and changed arguments or access refuse.
Client outcomes share Arc ownership. The two boundaries can retain 64
envelope-sized result bodies, about 65 MiB of body allowance, before wrapper
encoding, object overhead, transient serialization, queues and per-instance
last-good snapshots. The two result forms serve the UI/Client and provider reply
boundaries; replacing them with one cache would require new cross-owner machinery. This is a bounded retention statement,
not a process-memory or responsiveness measurement. Conversation history stores
only content operation/ID/revision/status summaries, within its existing 128-message
and 256-KiB text bounds. It omits the Notes data object from public history;
bounded warning messages can still quote invalid field values.

The provider event queue holds up to 32 parsed frames. Its wire-equivalent content
allowance is 32 times the 2,134,016-byte outer cap, about 65.125 MiB; parsed-object
overhead is additional. Up to 16 callbacks can wait for a pending turn-start
acknowledgement, another 32.5625 MiB of wire-equivalent allowance. The eight-message
Client queue can hold about 8.125 MiB of admitted content envelopes. These are
separate bounds and do not make the existing four-MiB raw UI admission budget a
total-memory limit.

Owner.last retains the existing per-ID last-good snapshots without an aggregate
byte or entry cap. Agent access to never-mounted hidden Notes can add entries.
Its registered-ID set has no aggregate entry cap. Notification state is created
only for a subscribed retained view, with one counter and pending receiver per ID;
updates before the first subscription need no entry because that subscription
always triggers a fresh read. Existing owner-cache fallback semantics are preserved.
Aggregate memory, cache release and measurement remain N4/load gates.

The headless queue test covers pending publication, queue pressure, retirement
before admission, a retired observer and an accepted save completing afterward.
Native session Task ownership and explicit generation gates address the actual
read/admission path. The pinned Shell awaiting path still detaches background
work. There is no claim that a dropped Rust test future proves Shell retirement
or a whole-process memory bound.

Actual-provider updates and native dirty-sibling refresh, remove/restore,
complete private-signature derivation, personal-package compatibility,
generation/lifecycle and aggregate proof-size acceptance remain separate work. These native checks establish no performance
gain, another platform or complete avatar/voice parity.

Source basis is the retained Voyager Notes provider, GPUI Shell at
[the pinned GPUI Shell source](https://github.com/longbridge/gpui-kit/tree/944803984cf0ba3111861d6e1aa9d6265c109ff9),
and Herdr App at
[the pinned Herdr App source](https://github.com/herdrdev/herdr-app/tree/1581a587919dddd6f1efd5f78eb542c4b2b02cb5).
The integration uses supported isolated runtimes, host components and retained
views. It adds no browser engine or second Core connection.


## Vessel engine limits

A Vessel script is containment for robustness, not a security boundary. The
reviewed `gpui-shell-engine-limits.patch` in `desktop/patches/` adds host-set
limits to GPUI Shell's QuickJS engine. `desktop/src/notes.rs` applies them.

Invariants:

- Every Notes load creates a new engine and calls `set_limits` before its first
  load. The candidate holds that engine, so closing the Vessel or publishing a
  newer candidate drops it. An engine never outlives the version it loaded.
- A refused call is one strike. A call is refused when it runs past its render,
  event or load budget, when the engine's calls together pass their share of
  one second, or when the JavaScript heap reaches its limit. At the strike limit
  the engine retires. A retired engine refuses every later render, event, task
  and promise continuation at its entry, without running script.
- Budgets and the share stop a call only when QuickJS polls its interrupt
  handler. It polls in bytecode, inside regular-expression matching and in some
  native loops. A long native operation that does not poll, such as a large
  string or JSON call, runs to its end before it can be stopped. The time it
  took still counts toward the share for later calls.
- A Note whose current engine is retired draws a placeholder with the
  retirement message inside its own frame. The window and other Vessels keep
  drawing. The next source edit loads into a new engine, which is the recovery
  path. A failed load keeps the published candidate, as live authoring requires.
- Window control is denied by default. Notes loads with no window grant, so
  `set_rem_size`, `bind_keys`, actions, focus movement, dialogs, sheets and toasts
  are refused. Window reads stay allowed. Only the first-party canvas policy in
  `desktop/src/host.rs` grants window control, because it opens dialogs.
- `LoadedApplication` holds its engine, so dropping an engine while a loaded
  handle lives cannot abort the process.

Numbers, chosen for a window that several Vessels share:

| Limit | Value | Why |
|---|---|---|
| JavaScript heap | 32 MiB | Notes rests near 1.2 MiB of heap. A 16 MiB limit refused growth in under 30 ms in the prototype. |
| Render and layout call | 30 ms | A stopped spin costs one frame under the 50 ms frame rule. |
| Event or task call | 30 ms | Event handlers and resumed tasks also hold the UI thread. |
| Module load | 200 ms | The share stops a longer load in any case. |
| Share of each second | 200 ms | Many short calls cannot hold the window where one long call could not. |
| Strike limit | 3 | A spinning Vessel stalls at most three frames before retiring. |

The engine's busy time is measured at its entry points, so calls too short to
reach QuickJS's interrupt poll still count toward the share.

Known gaps, outside these limits:

- Rust-side memory a script causes, such as spec arenas, copied strings, text
  layout and entity records, is not counted by the heap limit.
- Anchored and deferred elements such as popovers, menus and tooltips may draw
  outside the Vessel's frame. The patch removes window-wide calls only.
- Element key handlers under focus were not tested beyond global `bind_keys`.
- Timers and tasks are not counted. Each callback is stopped by the budgets and
  the share, but a Vessel can still schedule many wakeups.
- `cx.open_url` stays ungated. GPUI Shell treats it as equal to a `Link`, which
  needs no grant.
- A render or task that runs out of memory and frees its garbage while
  unwinding reports a thrown `null` and counts no strike. The budgets and the
  share still stop repeated growth.
- Running out of memory inside a promise continuation counts no strike,
  whatever the heap still holds. The second E1 verifier observed no strike at a
  strike limit of 1.
- The placeholder appears at the Note's next render. Nothing notifies the Note
  when its engine retires inside a timer or task.
- No native journey opens the canvas's worktrees dialog, which uses the same
  gated calls as the voyage-close dialog.
- Long native operations that do not poll the interrupt handler, such as large
  string or JSON calls, escape refusal. The E1 verifier ran 12 such
  module loads in 961 ms under a 30 ms budget and a 60 ms share, and none was
  refused.
- A script that catches its own out-of-memory error counts no strike.
- The share is a fixed one-second window, so a burst that straddles the window
  edge can use up to about twice the share. The E1 verifier observed 360 ms of
  spinning in 384 ms under a 200 ms share.
- Each idle engine costs about 1.9 MiB resident in a debug unit test, and every
  Notes load creates one. It is freed with the candidate that holds it.
- The numbers were set from a debug test-window prototype. No native journey
  opens a script Vessel, so nothing measures these limits in the release app.
  Whether a healthy Notes stays inside 30 ms per call and 200 ms per second on a
  loaded machine is unproved.

## Notes controls in the feedback candidate

The Notes toolbar has one down arrow containing New and Open, with a preview switch beside it. Open shows the current directory's Markdown file list beside those menu actions. The switch is off for the retained native editors and on for Markdown preview; it never replaces the draft owner. The current filename and status remain available. Existing content configuration retains the selected file when the same Notes instance reopens. A new instance starts with a blank note if no file was selected.

New, Open and save continue through the one Rust file owner. Opening the menu does not rebuild Markdown for each typed character. Preview is constructed only when selected. Existing external-change/revision checks and dirty-editor retention remain unchanged. Native interactions, including menu dismissal and real file selection, must pass before accepting this presentation.

## Exiting a retained Note

Exit in the Notes file menu captures one visible placement and the workspace
revision before saving. Native inputs become read-only while the existing
revision-checked save completes. A refusal or unconfirmed save retains the view
and draft. The captured binding, placement and saved file revision are checked
again at the application owner. The request then enters the existing typed
RemovePlacement dispatch, including receipts, workspace revision checks and owner
notifications. Exit never stops a Core program. Notes has no separate process.

A confirmed Exit retires the view and releases its cached native instance. The
factory also rejects an exited cache entry synchronously, so an immediate reopen
cannot reuse a retired view before periodic cleanup. The Markdown file remains
available through Open. Activity includes visible document placements, rather
than all retained document memberships. Hidden live terminals remain running
work and are independent of this document rule.

## Markdown filenames and placement names

New, Open and legacy conversion set placement names to the selected Markdown
filename. Rename normalizes the .md suffix and moves the file through the same
application owner. The Markdown heading and body do not change. All bindings
of that path are collected by resolved directory and filename, while each
binding keeps its original directory spelling. A scoped caller must have access
to every affected Vessel.

The existing native save bridge freezes those instances and checks their exact
selected and draft file bindings before saving. More than one dirty view of the
same file refuses rename so competing drafts are not merged implicitly. The
actor keeps serving saves while the native bridge returns the final saved
revision. Completion revalidates the workspace, target, aliases and file bytes.
The existing rustix filesystem primitive performs an atomic no-replace rename
relative to an opened directory. Reads refuse source symlinks. No hard-link or
later unlink is used. The primitive is enabled for Linux and macOS; Windows
rename is unsupported by this implementation, and macOS runtime remains unproved.

A post-move revision mismatch or uncertain Core document save reports the moved
path and an uncertain result without replay or automatic undo. A confirmed
document save updates every affected binding and label. The native bridge
hydrates frozen clean editors from that saved snapshot before restoring their
editability. A scoped release guard retains the exact ticket and receiver and
releases editors on admission, stale-state and shutdown exits as well as success.
The captured revision is a stale-read check, not a lock on external OS editors.
The file remains subject to ordinary subsequent filesystem changes.

A cached native Note can exist before its first retained snapshot is loaded.
Only a clean, unselected cache with no revision, native view, configured file
or retained draft file has no file identity to protect.
Rename preparation permits it without treating it as an open retained draft.
A selected, loaded or dirty Session still requires all original file and active
view checks. Confirmed-exited Sessions are removed before preparation. The
ordinary reply rebinds clean caches through the same saved snapshot; it does
not activate a view or recreate a placement.

## Vessel type manifests

A Vessel type is data. A package folder `vessels/<folder>/manifest.json` in the
profile declares one type with no new application code. The folder name is not
the type ID. The manifest's `id` is, and it appears in the Vessel catalogue
beside the built-in types. `contract/src/content.rs` owns the `Manifest` types,
and `contract/generated/contentManifest.schema.json` is their generated schema.
The manifest format here replaces the field list of the planned `content-manifest`
interface, which no atlas holds.

| Section | Meaning |
| --- | --- |
| `contract`, `id`, `name`, `version` | Manifest format version (1), the type ID, its display name and the type's own version. |
| `state` | `schema` (JSON Schema for the instance data), `initial` data and `migrations`. |
| `local` | Optional view-local state with its own `schema` and `initial`. It is never revisioned. |
| `concurrency` | `default` is `turns` or `merge`, and `merge` lists the top-level state fields that merge. |
| `actions` | Named actions. Each has typed `params`, a `rebase` policy (`by-key`, `always` or `refuse`), an optional `risk` and a list of `effect` steps. |
| `view` | `source` file in the package and optional script `islands` with declared props, actions and budget. |
| `lifecycle`, `presence` | Open, close and retire behaviour and attribution display. |
| `orbit`, `dock` | Orbit entries that run a declared action or hand an agent a `read`, and dock behaviours with a trigger, a default and a `read`. |
| `backend` | Optional `core-document` or `core-terminal` backend that `backend` effects target. |

An effect step is one of `set`, `push`, `remove`, `move` or `backend`. Paths start
at a state field and may use `.field`, `[0]`, `[*]` and a selector such as
`[id=$id]`.

### Expressions

Every expression is a string in one grammar. It has paths, the literals `true`,
`false`, `null`, numbers and single-quoted text, `!`, `==`, `!=`, `&&`, `||`,
parentheses and four functions, `count`, `first`, `filter` and `match`. A bare name
is a field of the state. `local.x` is local state, `$name` is an action parameter
and `$uuid` is a fresh identifier. `count(items, done: false)` keeps the items
whose fields equal the given values. A string inside an effect `value` is an
expression, and text is quoted.

### The checker

One checker in `app/src/content/manifest/check.rs` runs once when a manifest is
loaded. Loading has two phases. The structural phase reads each section, each
action and each orbit and dock entry on its own, so every malformed part is listed
at once. If any structural problem exists, only those are reported, because typed
checks need parsed parts. The semantic phase then lists every problem it finds. It
checks that:

- the format version is 1, the type ID is well formed and does not name a built-in type, and the name and version are set;
- the state schema is valid JSON Schema, describes an object, and the initial data fits it;
- migrations start below the manifest version and name real fields, and `merge` names real state fields;
- action and parameter names are plain identifiers, parameter types are known, and every effect path exists and is assigned a value of the right type;
- `backend` effects have a declared backend;
- the view source and script files exist inside the package, island props type-check and island actions are declared;
- every orbit and dock entry has a unique ID, runs exactly one of an action or an agent read, names a declared action, gives or asks every parameter, and reads fields that exist.

A problem names its place and the fix, for example
`dock.open: state has no field "itemz" (fields: items, title)`.

### Last good manifest

The registry keeps the last manifest that passed for each package. A broken edit
is refused, the previous version keeps working and the catalogue entry lists every
problem in its `problems` field. A package that never passed is listed as
unavailable with the same list in its reason. Two packages that declare one type ID
are refused, and the later folder name loses.

The registry reads a manifest again only when the file's modification time or
length changes. A catalogue read otherwise costs one directory listing and one
file stat for each package, with no parse.

### Admission and removal

`Owner::require_available` is the one place that admits a type for a new Vessel.
The workspace owner checks only that a type ID is well formed. Removing a
manifest package moves its folder to `.<folder>.removed` as for Notes, and
restoring moves it back. Instance data stays in `data/` through both.

The checker and the registry decide what a manifest declares. They run no action
and draw no view. Notes, the terminal and the agents are not manifests, and the
view markup language is not parsed.
