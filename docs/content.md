# Native Notes integration

The native candidate uses one Notes package in Fleet Vessels and Voyage Portals.
The integrated Linux configuration journey demonstrates independent settings,
real assistant updates arriving with Chat closed, a retained dirty sibling and
persistence after explicit Quit and cold reopen. The same release also demonstrates warm viewer Restore, seven source
edit/error/repair states and real package removal/restoration across deliberate
Quit and cold reopen. Those observations do not accept the whole content lifecycle,
resource limits or combined-foundation proving-code cap.

`contract/src/content.rs` owns the versioned Notes request, response and data types.
The existing generator exports their validators beside the workspace and
conversation contract. `app/src/content.rs` owns persisted data, revisions and
schema checks. `create-content` uses the existing split or Portal placement rule,
with an explicit type ID. The supported type IDs are `terminal` and `notes`.
Changing a placement does not change its content ID or data. A Notes placement
never enters terminal preparation or starts a Core process.

`app/src/content/description.rs` describes the two supported content types through
the generated `contentCatalog` contract. Each description names its current
GPUI Shell host version, registered native view, supported placement scopes,
generated action input and owner-result schemas, and optional Core terminal
backend. Notes state uses the same bounded package schema lookup as a bound
Describe request and the same defaults as workspace-owned initialization.
Descriptions contain no content-instance binding or authority. Discovery reads
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

Notes has one typed presentation setting, `showHeading`, which defaults to true
and controls the existing NOTES eyebrow. Configuration is advertised and accepted
only when the installed Notes and Header manifests both declare numeric
`contentConfiguration: 1`. Older personal packages retain their default Notes
behavior and omit the configuration capability. The generated action schema and
names omit configure when that capability is unavailable. Discovery grants no
authority and dispatch retains the same bound caller and scope checks.

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
content boundary. The current compatible Header/Notes bundle is required after
saving configuration. Loading an older strict Header may expose its own validation
or load error; source, data and configuration remain preserved until an explicit
compatible package update or restore. There is no migration, reseeding or response
stripping.

The configuration owner has Core-backed checks for persistence, both notices,
independent data, stale/scope/capability refusal, duplicate identity and fresh
configuration over last-good data. These checks do not establish native heading
rendering, retained dirty-editor behavior or configuration-specific lost Core
confirmation. Those remain part of the integrated native journey.

The Header-only `voyager_content_view.descriptions()` binding returns typed
contract data as JSON from background host work, within the existing content
envelope limit. It does not extend the private Notes registry. The catalogue and
bound Describe use the same owner. The creation picker reads this catalogue to
check Notes availability; its direct Notes selection still needs its own native
journey. The configuration journey creates Notes through actual administrator
tools. Personal package JavaScript remains independently editable.

The source adds explicit remove-content-package and restore-content-package
workspace actions. Native administration and an administrator captured at whole
Workspace scope use the existing Client queue and request receipts. Narrower
captured scopes refuse. Before changing files, the owner reads the actual Core
document and checks the expected revision and caller again. It moves the complete
personal Notes directory between mods/notes and mods/.notes.removed. Restore
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
revision. The native Header keeps its single subscription and the script consumes
the notice before queuing a coalesced read. A document notice already reflected
in the view does not trigger another read or prepare. Automatic notice reads still
prepare newly authorized content, but do not clear and retry known-refused
terminal openings. Deliberate Refresh retains that retry. Uncertain starts are
never replayed. The prior revision() read remains available for personal Header
source; new composition uses notice().

The filesystem/availability and notice changes have source tests and a separately
recorded Core-backed package receipt/scope test. The current lifetime journey reuses the session-Quit viewer Close/Restore
helper. It requires the original shell live through warm Restore, then ended
with zero live programs after deliberate Quit and cold reopen. Package restore
keeps that ended binding rather than starting a replacement. The earlier
seventeen-stage result remains tied to its legacy controller.

## Retained editors and staged source replacement

`desktop/src/notes_session.rs` owns one real native Title editor, Body editor,
resizable body height, dirty draft, original data revision and accepted save task
per mounted content ID. The fresh shipped TypeScript remains the visual
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

## Personal-source compatibility

Existing profile JavaScript is never overwritten. The original TitleState,
BodyState, Title, Body and bound voyager_content methods remain available with
their previous signatures. Old packages continue to own their legacy local
controller and do not automatically gain retained native draft migration. Using
the new session requires a deliberate personal-package source upgrade. The exact
old emitted controller is retained in desktop/notes-legacy-fixture.js as proving
code, not production credit. Its maintained read/refusal/lost-confirmation tests
establish only that supported legacy behavior. They do not establish the fresh
native session or a new native lifecycle journey.

`desktop/src/notes.rs` installs a `voyager_content_view` component only in the
Header policy. Its native factory retains one view per content ID. Before opening
data, background work asks the existing Client worker for a binding. That worker
reads the authoritative workspace and checks the exact Notes placement before
binding existing data. It never creates a missing file while binding or inspecting.
Only a confirmed workspace creation initializes its newly issued Notes IDs with
create-new semantics. Failure after the workspace write returns Uncertain and does
not retry initialization. Requests cannot supply their own binding or path.

All Notes instances share one isolated QuickJS VM with the private voyager_input
registry. They cannot import Header Terminal, Name or workspace modules. Each
candidate has its captured voyager_content module and application generation.
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
Header and Notes separately using the same compiler/configuration: Notes receives
its actual `export-script-types --notes` declarations, not the Header's broader
registry. Native Title/Body signatures and the content request/result types come
from the actual registry exporter and generated Rust contract. Each scope records
its declaration hash/modules in `desktop/script-types.json`. Wrong native calls,
unknown builder properties, missing invoke arguments, invalid data types and
Header-only imports fail the maintained control.

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
cover its measured title, body and status area, not the whole Portal header or
desktop. Earlier failed fixture attempts remain recorded separately.

The N3 source candidate adds generated voyager_content describe/inspect/update to
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
