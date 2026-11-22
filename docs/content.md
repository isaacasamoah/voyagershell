# Vessel types and content

A Vessel type is the kind of a Vessel, keyed by its type ID. The built-in types
are `terminal`, `agent` and `agents`. `terminal` and `agent` have a Core
terminal backend. `agent` is one type for every coding agent; the program is the
Vessel's launch, not its type. `agents` is the Agents view, which lists the
workspace's running work and has no backend. Every other type is declared by a
manifest package in the profile, as [Vessel type manifests](#vessel-type-manifests)
describes.

`contract/src/content.rs` owns the versioned content request and response types
and the `Manifest` types. The existing generator exports their validators beside
the workspace and conversation contract. `app/src/content.rs` owns persisted
data, revisions and schema checks. `create-vessel` uses the shared panel owner
and an explicit empty or beside-placement insertion with a left, right, top or
bottom side and an explicit type ID. Only `terminal` and `agent` accept a
launch, so `crate::launch::requested` refuses a program launch for any other
type. Changing a placement does not change its Vessel ID or data. A Vessel of a
type without a terminal backend never enters terminal preparation or starts a
Core process.

## The Vessel catalogue

`app/src/content/description.rs` describes the built-in types in
`IMPLEMENTATIONS`. Its `discover_all` adds the description of every manifest
type that the registry in `app/src/content/manifest/registry.rs` has loaded,
with that type's declared actions. Scripts and agents read the result through
the generated `contentCatalog` contract. Each description names its GPUI Shell
host version, native view, supported placement scopes, action input and result
schemas, and optional Core terminal backend. Descriptions contain no Vessel
binding or authority. Discovery reads metadata, creates no content and starts
no backend.

Each entry reports ready, removed or unavailable with a reason. A broken or
removed manifest package leaves the built-in types discoverable. Unavailable
entries omit state defaults and action details. If the complete catalogue would
exceed the content envelope, `bound` marks each entry that carries state as
unavailable and omits its state and action details, instead of hiding Terminal
behind a failed catalogue response. Ready metadata is not native rendering
evidence.

The canvas-only `voyager_content_view.descriptions()` binding returns the
catalogue as JSON from background host work, within the content envelope limit.
`desktop/src/content_host.rs` registers it beside the `Vessel` component. The
creation picker in `desktop/canvas/creation.ts` reads this catalogue. It offers
each ready manifest type and the Agents view, and it lists each type's problems.

The `Vessel` component draws every Vessel whose type the canvas does not draw
itself. It keeps one `ManifestView` per Vessel ID. `Registry::installed` gives
that view the type's manifest, or the reason it has none.

## Package removal and restore

The `remove-vessel-package` and `restore-vessel-package` workspace actions take
a type ID. Native administration and an administrator captured at whole
Workspace scope use the existing Client queue and request receipts. Narrower
captured scopes refuse. Before changing files, the owner reads the actual Core
document and checks the expected revision and caller again. It moves the
complete package folder between `vessels/<folder>` and
`vessels/.<folder>.removed`. Restore requires no active destination. Neither
operation edits instance data, placement or any Core backend. A reused remove
receipt cannot remove a restored package. On Linux the move uses renameat2 with
RENAME_NOREPLACE, including when another actor creates the destination after
the preliminary check. Its two C strings are owned, NUL-terminated and live for
the syscall; the kernel only reads their bytes. Other platforms return an
unsupported error instead of copying source or using an overwriting rename.
This has no macOS or Windows acceptance claim.

Workspace notices carry the genuine Core document revision and a separate
package revision. The package revision advances only for successful package
operations; a filesystem-only operation does not save a layout or invent a CAS
revision. The native canvas keeps its single subscription and the script
consumes the notice before queuing a coalesced read. A document notice already
reflected in the view does not trigger another read or prepare. Automatic
notice reads still prepare newly authorized content, but do not clear and retry
known-refused terminal openings. Deliberate Refresh retains that retry. A start
that stays uncertain after the owner's settle is never repeated. The prior
revision() read remains available for personal canvas source; new composition
uses notice().

The filesystem, availability and notice changes have source tests and a
separately recorded Core-backed package receipt and scope test.

## Content envelope and retention bounds

Content arguments and results use a one MiB plus sixteen KiB envelope,
`ENVELOPE_LIMIT` in `app/src/content.rs`. Workspace and process arguments
remain eight KiB. Ordinary provider requests remain 64 KiB; correlated tool
replies and incoming content frames have an outer JSON cap of twice the content
envelope plus 4,096 bytes, allowing string escaping and callback identity.
Incoming non-content frames retain one MiB. These are adapter bounds;
large-envelope delivery by the installed provider is not yet native evidence.
A post-dispatch confirmation that cannot fit remains Uncertain. The worker
checks request size before enqueue and bounds responses before receipt
retention.

The callback and Client each retain at most 32 call results. Accepted payload
identity uses the existing SHA-256 primitive over recursively sorted JSON,
including the desktop's preserve_order feature, while request IDs, tool names
and captured access remain explicit. Full accepted request bodies are discarded
after dispatch instead of retained twice. Unchanged duplicate calls still reuse
their original result, and changed arguments or access refuse. Client outcomes
share Arc ownership. The two boundaries can retain 64 envelope-sized result
bodies, about 65 MiB of body allowance, before wrapper encoding, object
overhead, transient serialization and queues. This is a bounded retention
statement, not a process-memory or responsiveness measurement. Conversation
history stores only content operation, ID, revision and status summaries,
within its existing 128-message and 256-KiB text bounds.

The provider event queue holds up to 32 parsed frames. Its wire-equivalent
content allowance is 32 times the 2,134,016-byte outer cap, about 65.125 MiB;
parsed-object overhead is additional. Up to 16 callbacks can wait for a pending
turn-start acknowledgement, another 32.5625 MiB of wire-equivalent allowance.
The eight-message Client queue can hold about 8.125 MiB of admitted content
envelopes. These are separate bounds, not a total-memory limit.

## First-party profile files

`app/src/content/install.rs` owns the first-party files in a profile. They are the
canvas package and the themes. The table of shipped files is
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
- A missing file is written.
- A second start with nothing to change writes nothing.
- An unreadable `installed.json` is treated as missing. A record path that is
  not a plain relative path is ignored.

The history is closed. A shipped file changed after records exist needs no entry,
because every new install writes its record.

Gap. A build older than the one that updated the profile replaces untouched files
with its own, and an open build reloads files that another build writes. No
edited file is lost either way.

## Saved Notes placements

Notes was an example Vessel type that earlier builds shipped. The app no longer
ships it, draws it or describes it. A profile and a workspace from those builds
keep everything Notes saved. The profile updater removes the untouched copies of
the old `vessels/notes/` package files by its general rule, as
[First-party profile files](#first-party-profile-files) describes, and leaves
the edited ones. Nothing reads or rewrites the Notes data in the profile's
`data/` folder or the Markdown files in each Voyage's `notes/` folder.

A saved placement of type `notes` stays in the layout. The `Vessel` component
draws it, and `Registry::installed` finds no manifest for it, because the old
package has no `manifest.json`. `ManifestView` then draws its unavailable-type
view in the placement's frame. The words of that view are a placeholder. The
panel's close control removes the placement and leaves the Vessel's data in
place.

## Vessel engine limits

A Vessel script is containment for robustness, not a security boundary. The
reviewed `gpui-shell-engine-limits.patch` in `desktop/patches/` adds host-set
limits to GPUI Shell's QuickJS engine. A host that loads Vessel script into an
engine of its own calls `ShellRuntime::set_limits` before the first load. No
shipped Vessel type loads script today. Manifest Vessels draw through the
native `ManifestView`, and the app calls `set_limits` nowhere. The first-party
canvas runs without these limits.

Invariants for a host that applies the limits:

- Every load creates a new engine and calls `set_limits` before its first load.
  The candidate holds that engine, so closing the Vessel or publishing a newer
  candidate drops it. An engine never outlives the version it loaded.
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
- A Vessel whose current engine is retired draws a placeholder with the
  retirement message inside its own frame. The window and other Vessels keep
  drawing. The next source edit loads into a new engine, which is the recovery
  path. A failed load keeps the published candidate, as live authoring requires.
- Window control is denied by default. A Vessel loads with no window grant, so
  `set_rem_size`, `bind_keys`, actions, focus movement, dialogs, sheets and toasts
  are refused. Window reads stay allowed. Only the first-party canvas policy in
  `desktop/src/host.rs` grants window control, because it opens dialogs.
- `LoadedApplication` holds its engine, so dropping an engine while a loaded
  handle lives cannot abort the process.

The last script Vessel host used these numbers, chosen for a window that
several Vessels share:

| Limit | Value | Why |
|---|---|---|
| JavaScript heap | 32 MiB | A 16 MiB limit refused growth in under 30 ms in the prototype. |
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
- The placeholder appears at the Vessel's next render. Nothing notifies the
  Vessel when its engine retires inside a timer or task.
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
  load creates one. It is freed with the candidate that holds it.
- The numbers were set from a debug test-window prototype. No native journey
  opens a script Vessel, so nothing measures these limits in the release app.

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
- migrations start below the manifest version, name real fields and set values that fit them, and `merge` names real state fields;
- action and parameter names are plain identifiers, parameter types are known, and every effect path exists and is assigned a value of the right type;
- every element of an array in an effect value is typed, and every `match` key can be a value of its subject;
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
manifest package moves its folder to `.<folder>.removed`, and restoring moves it
back, as [Package removal and restore](#package-removal-and-restore) describes.
Instance data stays in `data/` through both.

### Running a declared action

`content.invoke` runs one declared action on one Vessel of a manifest type. It
takes the Vessel, the action name, its arguments and the revision the caller last
read. A view and an agent send the same request, and the one path in
`app/src/content/manifest/invoke.rs` runs it, so both change the state the same
way. The type's entry in the content catalogue lists each action with its typed arguments.

The owner checks that the action is declared and that the arguments match its
`params`. It applies the action's effects to a copy of the state, one after
another, and checks the copy against the state schema. Only then does it write
`data/<vessel>.json` with the next revision, by a write and a rename. A refused
action leaves the file as it was. A stale revision is refused when the action's
`rebase` is `refuse`. For `by-key` and `always` the effects run on the current
state, and a `by-key` effect whose item is gone refuses with `target is gone`.
`$uuid` in an effect is derived from the Vessel and the revision, so a repeated
request makes the same identifier. A confirmation that cannot fit the content envelope limit is reported as Uncertain after the state was saved, and `inspect` reports its revision. A `backend` effect refuses, because no backend
is connected. `inspect` returns the state and its revision.

The registry, not the layout, decides which Vessels have a manifest type. A
Vessel in the layout whose type has no manifest is not reachable here, and an
instance's data stays in `data/` when its package is removed.

Local state, merge fields, migrations and the view markup are declared and
checked. None of them runs yet. The Agents view is not a manifest.

### The terminal and agent types

`content/types/terminal.json` and `content/types/agent.json` are the manifests
of the `terminal` and `agent` types. `app/src/content/manifest/builtin.rs`
embeds both and runs each through the same checker as a personal package, with
its own type ID allowed. A bundled manifest that fails the checker stops the
application at its first read, and a unit test reads both on every run. Both
declare a `core-terminal` backend and no actions, because stop, send and the
other process operations stay in the process tool and the effect grammar
cannot express them. Each type's catalogue name is the manifest's `name`.

Each declares an orbit that hands an agent the screen to explain. The `agent`
type adds an entry that asks what the agent is working on. Each declares a dock
entry `screen` that reads the screen while docked, and it ships `off`. Docking
an avatar changes focus, not what it reads, so the entry stays off until the user
agrees to the behaviour. Nothing reads orbit or dock entries yet, so the
declarations are checked data only.
