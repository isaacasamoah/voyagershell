# Native Notes integration

The integration candidate uses one Notes package in Fleet Vessels and Voyage
Portals. Its seventeen-stage Linux native journey passes on the combined
workspace candidate. The earlier standalone Notes proving-size failure remains
recorded. Conditional integration still requires the unchanged combined-foundation
cap and does not accept the agent or live-authoring lifecycle work.

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

Neither type currently has a separate configuration operation, so configuration
is explicitly absent. Action names come from the existing generated tool schema;
the capability lookup refuses unknown actions, including configure. It does not
dispatch an action or replace the existing caller, revision or receipt checks.
The workspace validates a requested type through the shared lookup, rather than
its own list of type names. The native factory still owns actual view creation.

The Header-only `voyager_content_view.descriptions()` binding returns typed
contract data as JSON from background host work, within the existing content
envelope limit. It does not extend the private Notes registry. The catalogue and
existing bound Describe are source-tested; the creation picker has not yet been
wired to this binding or observed in a native trial. Existing Notes appearance,
editing and profile JavaScript are unchanged by this source increment.

`desktop/src/notes.rs` installs a `voyager_content_view` component only in the
Header policy. Its native factory retains one view per content ID. Before opening
data, background work asks the existing Client worker for a binding. That worker
reads the authoritative workspace and checks the exact Notes placement before
binding existing data. It never creates a missing file while binding or inspecting.
Only a confirmed workspace creation initializes its newly issued Notes IDs with
create-new semantics. Failure after the workspace write returns Uncertain and does
not retry initialization. Requests cannot supply their own binding or path.

All Notes instances share one isolated QuickJS VM with the private `voyager_input`
registry. They cannot import the Header's Terminal, Name or workspace modules.
Each has its own captured `voyager_content` module, application generation,
controller and Watcher. The host retains the controller but embeds its public
`content()` view beneath the single window overlay root. The existing accessibility
activation and overlay invalidation route is retained. This follows the corrected
Notes provider. The integrated journey observes both instances through native
accessibility and also edits with accessibility disabled. The VM has an additional
fixed memory cost that has not been measured.

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

The small host function declarations still live in `desktop/src/script_types.rs`;
this seam checks calls against that exported ABI and does not infer the callback's
Rust argument parsing from its implementation. The invocation remains three strings
with correlated generated request/result validation. No owner or protocol changes
are part of this authoring change. The emitted Notes runtime code is unchanged
apart from blank-line formatting. Type-only fields use `declare` so they cannot
initialize after View.init and overwrite native state. Catch and non-null type
assertions preserve the existing host-error/base-revision assumptions without
adding runtime behavior.

The profile still receives editable JavaScript seeded once. Repository checking
covers the shipped TypeScript and emitted bytes, not arbitrary later personal
JavaScript edits. Personal files are not implicitly overwritten or migrated.

The real native journey covers save/reopen, stale and forged refusal, delayed
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

Dropping the Rust admission future cancels its pending async-channel send, as the
headless queue test establishes. The pinned Shell HostModule awaiting path detaches
its foreground/background work and checks owner readiness afterward. It does not
install the same cancellation callback used by neighboring scheduler paths. The
queue test therefore does not establish actual retired-ScriptView cancellation
or an aggregate bound on old pending observers. Those lifecycle limits remain
explicitly unproved under N4; no SDK cancellation claim is inferred.

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
