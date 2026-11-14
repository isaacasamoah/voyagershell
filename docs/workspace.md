# Native workspace boundary

## Libraries and entry points

`contract/` defines shared identities, commands and results. `app/src/lib.rs`
exposes the Rust application independently of GPUI. The application owns
workspace changes, content state, captured context and effect policy. Its Core
adapter owns protocol translation, while Herdr Core owns terminals and programs.

`desktop/src/lib.rs` owns native composition, asset seeding and view modules.
`desktop/src/main.rs` parses command-line arguments and invokes that library.
The declaration exporter calls the same library and component registry as the
running app. A component registration therefore has one owner for both runtime
presentation and generated script definitions. The Notes registry remains its
own supported component set.

`desktop/mods/` and `content/` provide configurable presentation through those
native components and the generated application contract. Moving a placement
does not change its content identity or backend. These layers implement the
architecture's ownership rules; they do not require a file for every diagram box.
Browser embedding and additional provider implementations remain separate work.

## Shared panel arrangements

The current owner contract uses `PanelOwner`: a Fleet ID or a Voyage's Portal
column. Home is one retained internal Voyage/Fleet with its own Portal column,
kept outside the ordinary Voyage list. Entering Home preserves the selected
ordinary Voyage/Fleet and explicit dock context. A previously absent Home starts
with an ordinary Agents 1 panel. Every stored Home, including an empty or
customized arrangement, remains unchanged. Closing that panel does not seed it
again. New ordinary Voyages and Fleets keep their initial plain shell.

`create-content` names the chosen content type and a panel destination. Insertion
is either `empty` or `beside` a captured placement with a left, right, top or
bottom side. Split controls choose content before dispatch. Cancellation creates
nothing. Old default-terminal split and Fleet-only action aliases are removed;
the current Header, agent declarations and generated validators use the common
create, resize, move, maximize, visibility, reveal and saved-layout actions.

Roots may be empty. Hiding retains a panel's leaf and proportions; removing its
layout entry retains its placement, content, configuration and backend in the
same membership list. Reveal reuses that instance in its original owner. If all
panels are hidden, a new empty insertion preserves their subtree beside the new
visible panel. Hidden-leaf pruning preserves original accepted resize paths.
Save captures the visible arrangement; load shows its included retained panels.
Neither operation stops or restarts a program or changes explicit context.

`reopen-panel` takes a retained placement ID and the same destination as
`create-content`. It inserts that instance into the chosen empty or beside slot,
preserving its content, data, name and Core binding. A closed Fleet panel may
transfer between Fleets in the same Voyage. A Portal stays in its column, and
Home stays separate. A transfer prunes only that leaf from source saved layouts,
retaining their names and other leaves. Duplicate human names remain unchanged;
placement IDs and owner paths distinguish the panels. Reopening does not select
a Fleet, reveal a column or change the explicit dock context.

The owner rechecks source and destination scope, the current workspace revision
and insertion target. It refuses panels already placed, including siblings
occluded by maximization. Terminal reopening additionally requires a confirmed
binding and a fresh Core observation of the same live backend and PID. Missing,
ended or unconfirmed programs refuse unchanged. Reopening grants no creation
permission and never starts or resumes a process. Duplicate and uncertain
requests retain the existing receipt and no-replay rules. These owner checks do
not establish the new corner controls or native chooser journey.

Each Voyage's Portal visibility, overlay/make-room mode and width persist in the
existing Core workspace document. Portal moves remain within that column.
Legacy Portal lists, nonempty Fleet roots, saved Fleet arrangements and missing
names are decoded at the same owner boundary. This does not rewrite personal
package source or save a migration merely because the workspace is inspected.

New names are stored once as Terminal 1, Notes 1, Agents 1 and the next available
suffix in that owner. Hidden and unplaced names remain reserved. Legacy missing names are
resolved deterministically before projection. UI, context facts and conversation
tools receive the same required name; rendering and reordering do not renumber
panels. Explicit rename preserves identity and may deliberately duplicate a name.
Tools retain IDs and full paths for disambiguation. Home paths omit its internal
container labels.

`app/src/panels.rs` owns the shared tree rules; workspace, scope, content and
process routes keep their existing application queue, grants, CAS and receipts.
Home is omitted from subordinate ordinary Voyage projections. The source and
Core checks do not establish the separate integrated native UX journey.

## Pane maximize and restore

Each Fleet and Portal arrangement optionally records `maximizedPlacement` in the
existing workspace document. `set-panel-maximized` names one placement and an
explicit Boolean.
The Rust owner checks scope, accepted tree membership and the existing version
before saving. A restore for another placement refuses unchanged. Stored invalid
targets are rejected before publication; a narrow projection omits other IDs.

Maximize renders the existing content through a temporary leaf. The accepted
split tree, saved layouts, backend bindings and explicit context remain intact.
Preparation retains all accepted-tree terminal and Notes entities. Ordinary
splits clear maximize; loading an arrangement clears an omitted or redundant
target. Go there to an occluded sibling restores the tree. A same-Fleet move
retains a still-present target.

The corner Button stays keyboard reachable and appears on hover or native focus.
Its left pointer press stops before the native default-focus listener, retaining
the terminal focus used by the existing unchanged-focus check. Tab and keyboard
activation keep the Button's native focus behavior.
Linux uses Ctrl+Shift+Z; macOS uses Cmd+Shift+Enter. The displayed Vessel frame
handles a chord that reaches it, preserving native text-editor handling. A busy
action refuses the chord without queuing it. Terminal focus transfers through
the existing captured-focus check only if the user has not changed focus.
This follows ordinary split/zoom behavior in pinned
[Herdr App](https://github.com/herdrdev/herdr-app/tree/1581a587919dddd6f1efd5f78eb542c4b2b02cb5).
Owner, contract and script checks establish this source path. Current native
geometry, keyboard accessibility and retained input mapping require the separate
application journey; no macOS runtime result is claimed.

## Outer canvas

The workspace document owns an outer canvas separately from each Fleet's Vessel
split tree. `contract/src/canvas.rs` defines rows, columns, stacks, named blocks and
fixed/content/fill sizing. Older documents receive the supported default through
Serde. Existing Fleet names are retained; a new Voyage starts with Fleet 1.

`update-canvas` and `set-sidebar` use the same request identity, expected version,
Client queue, receipt and Core document save as other workspace actions. Only the
application/Workspace caller can change global composition. Collapsing the rail
does not dock Voyager. Invalid definitions are refused before mutation. A bad
stored definition preserves the Client's last usable layout with its error.

Each displayed arrangement retains exactly one Sidebar, Fleet strip, active
Fleet, Portals and context region. The initial sidebar is 224 logical pixels, from the pinned
Electron composition source; its unchanged 200-pixel Brand is centred. A retained
capture appears wider, but its equal-scale provenance has not been established.
Matched native/reference screenshots must resolve that discrepancy rather than
introducing an arbitrary scale adjustment. Maximum depth is 12, maximum node count is 64, and fixed sizes
contain 1 to 4096 logical pixels. These bounds limit the native composition, not
total application memory. In both modes the Portal block must be
the last child of a row with the active Fleet in another sibling subtree. Its
subtree must also be last in every enclosing row; columns may retain chrome
above and below it. Left, top, bottom and middle Portal placement refuses unchanged.
Intrinsic/content overlay size is also refused. Legacy canvas mode and fixed
width supply defaults when older data has no Portal presentation. The current
owner projects `portalLayout` per Voyage, with visibility, overlay/make-room mode
and pixel width. Home has its own settings. The Header uses that projection and
the native `Column` control for the full-height right column.

A Stack stores a selected child index and alternative arrangements of the same
regions. Rust validates every alternative, including inactive Portal geometry,
against one global depth and node budget. Alternatives may reference the same
regions, but each arrangement and its surrounding siblings may show each region
only once. An invalid index or a different region set refuses unchanged. A Stack
that includes Portals must also include their active Fleet, preserving the
native column's shared geometry. The default canvas has no Stack.

The script visits only the selected alternative and keeps the parent sizing
axis. Terminal and Notes view owners remain keyed by content identity, rather
than by an alternative's position. Selection changes neither content, process
identity nor avatar context. The existing versioned `update-canvas` operation
persists selection and arrangement together. Legacy Portal width migration
traverses only the selected alternative. No human JSON editor or additional
selector style is introduced by this contract.

`desktop/mods/header/main.ts` controls retained preparation and versioned actions.
`panel-view.ts` renders shared panel controls and content; `navigation-view.ts`
renders the sidebar, Fleet tabs and context bar. `panels.ts` selects groups and
visible members from the Rust projection. `canvas.ts` composes the saved outer
tree and panel frames. Home uses the same panel factories and its retained global
arrangement. These modules retain the existing
terminal, Notes, divider, avatar and conversation owners.

Collapsing the sidebar keeps a 48-pixel rail and sends only `set-sidebar`, without
Dock. Expanded and compact speech/chat controls share their retained owners.
Humans arrange panels through gestures, keyboard shortcuts and context menus.
Split captures its destination and revision before offering content choice;
cancelling creates nothing. Fleet context menus expose saved arrangements.
Authorized agents use the generated JSON actions, including `update-canvas`,
through the same owner. The current Header exposes no raw layout JSON editor.

The earlier Workspace layout-editor trial and the separate Home overview have
been removed from source. Their recorded evidence remains historical, and
existing profiles may still hold their seeded copies, which nothing loads. The
original avatar trial's Home pose and rectangular preview are also historical;
current source has a circular primary landing preview. These source changes do not complete the full native UX checkpoint or
establish matched appearance, input behavior or performance.

The pinned ShellRoot and Header bypass their content cache while native
accessibility is active. GPUI's current cached prepaint/paint path does not
replay accessibility nodes after each frame clears them. An avatar-only frame
would otherwise publish the overlay controls without the workspace controls.
Ordinary rendering keeps both caches, and avatar animation remains enabled in
both modes. This preserves the existing renderer ownership; it does not add a
second accessibility tree. The 7 November correction is built for normal-motion
native verification. Composition cost with accessibility active needs its own
measurement and is not covered by ordinary cached-rendering results.

## Native overlay input

The PortalArea native module owns its full-size flex column and measured
occlusion. Its Header composition uses an ordinary script div for the opaque
theme background. The pinned module host does not apply script style refinement
to the native component returned by its callback. Keep the native layout and
ordinary wrapper aligned so the visible column matches the blocked input area.

`desktop/src/occluding.rs` registers `Occluding.new()` in the actual
`voyager_native` component registry. Its generated declaration comes from the
same registry used by the application. It has no arguments or state. The public
GPUI `div().occlude()` excludes mouse and scroll hitboxes behind that container;
`MaterializeRequest::finish` applies the authored styles and takes its ordinary
children once. Child editors retain their native focus/input/scroll handlers.
There is no full-window input shield, terminal mute or second panel owner.

Compact Chat and the retained earlier layout-editor trial use this container.
The current Portal region uses `PortalArea.new(id, {})` from `voyager_avatar`.
It applies the same native occlusion and measures the opaque column, including
empty space, in workspace-local coordinates. The existing avatar Geometry keeps
one optional area and retires it when the wrapper disappears. Individual Portal
targets still identify the panel under a drop. Vessel hit testing excludes only
the actual area; landing, preview and visibility use the largest uncovered
rectangle. The measured `dock_target_visible` read drives the existing compact
footer fallback without changing explicit context.

`Column` in `desktop/src/split.rs` provides the same pixel-width resize control
in both modes. Overlay paints it above the Fleet canvas; make-room places both
in ordinary flow. Accepted width changes use `set-portal-presentation` with the
captured workspace version. Rust persists that Voyage's visibility, mode and
width. Content identity and durable actions remain in their existing owners.
Outside the actual opaque rectangle, ordinary controls remain available.
Constructor, typing and geometry checks do not establish native focus, pointer
routing or the complete UX revision. Keep earlier editor evidence at its original
scope when comparing the current application.

Pinned Herdr App `1581a587` uses this public mechanism for float content in
`src/window/floats.rs:209`. The pinned GPUI implementation sets
`HitboxBehavior::BlockMouse` through `InteractiveElement::occlude`; the script
SDK does not expose an equivalent method on `NativeElement`. This registration
adds only the missing concrete container, without copying its implementation.

## Dock context metadata

The existing Client queue captures the explicit dock scope, its names and its
scoped content directories. These are the configured starting folders from
`Content.cwd`, matching the retained Electron workspace's starting-folder
meaning. They are not a claim about the shell's current directory after `cd`.
The existing Core terminal_get/process-inspection path exposes actual terminal
cwd; this increment does not add all-terminal polling or another directory
tracker. It does not use the selected pane as a substitute.
`app/src/context.rs` resolves the captured directory outside rendering by reading
bounded Git marker and HEAD files. It supports Git worktree marker files without
starting Git or reading account configuration. Multiple directories, unavailable
metadata and detached HEAD remain distinct typed results. One Header-owned task
refreshes these facts at the named `CONTEXT_REFRESH_MS` default of 3000 ms. It
notifies only changed facts, checks their captured revision and scope, and never
polls Core or reloads the workspace snapshot.

The Header receives this read through `voyager_workspace.context_facts`. Late
metadata is bound to the captured workspace revision and scope. This read does
not change the document, publish an effect or query Core terminal state.

The native workspace creates, selects and renames Voyages and Fleets, splits a
placement and sets explicit dock context. Voyage-wide Portals use the same
placement/content interface and remain present across Fleet selection. Herdr Core
stores the versioned layout. This branch integrates the independently reviewed
terminal and placement providers; the combined native behavior is under review.
Full avatar, conversation and UX parity remain open.

The divider-resize candidate adds a validated first-child share to each split.
Existing layouts without that field open at half. Shares travel with the saved
split tree, while placement, content, Core backend and explicit avatar context
remain unchanged. This has source and boundary checks; native resizing and
integrated acceptance have not been established yet.

`desktop/src/split.rs` wraps the pinned public native resizable group and state.
The SDK owns the pointer drag and local preview. A non-consuming public window
observer captures the original revision and group configuration on left-down.
Only the SDK's actual resize-completion callback may submit a resize. A changed
configuration retires that gesture. The Header passes the captured revision to
the existing generated owner call and sends no per-motion document writes.
Known refusal restores the owner projection through a read, without retrying
the resize. Uncertainty retains its original request and is not resubmitted.

The adapter measures native bounds and uses public `ResizableState::resize_panel`
after layout to apply committed proportions, including saved-layout loads and
refusal restoration. This programmatic synchronization does not dispatch an
application save. It does not access private SDK resize state or copy a divider
implementation. Native children keep their existing content-owned entities.
The measurement/event canvas is explicitly anchored at the group's top-left.
An absolute second child with automatic insets otherwise takes the block-flow
position after the full-height SDK group. The pinned layout-engine contrast
reproduced that misplaced origin; actual native event delivery remains a
separate check. Mouse-up defers clearing the held flag until the event's effect
cycle ends, preserving the SDK's bubble-phase completion callback.
The actual divider line declares a native Splitter role, an orientation and a name
through the SDK's public handle appearance. The SDK still owns its wider hit
band and drag behavior. Native accessibility exposure remains to be checked;
the surrounding panels are not labeled as a handle.
The isolated source is based on the selected UX checkpoint; its exhausted
correction histories and held proving cap remain unchanged. Zoom, navigation
and new content actions are outside this increment.

`contract/` owns the Rust request, response, identity and layout types.
`contract/build.cjs` generates declarations and strict runtime validators from
those types. Layout revisions and the allocation counter cross JavaScript as
decimal strings so a JavaScript number cannot round a Rust `u64`. Core's own
document protocol still uses its native numeric revision field. Placement,
content and optional Core terminal identities are distinct types.

`app/src/workspace.rs` applies domain changes to a proposed layout.
`app/src/client.rs` owns the current layout and revision on one worker thread.
It publishes a proposal only after Core confirms the save. Confirmed snapshots
are immutable and shared by Rust responses; a new layout proposal makes one
copy at the transaction boundary, outside rendering and input callbacks.
`app/src/core.rs`
owns the single CLI bridge to the selected dedicated session. Its framed
connection carries document RPC and terminal viewer channels together. The
terminal's start and attachment boundary is described in [terminal.md](terminal.md).

The application owner publishes confirmed change notices directly to one
bounded native Header subscription. Its Rust task survives script reload and
is canceled with Header. It invalidates the retained script description and
exposes only a small read-only revision projection to JavaScript. Retired scripts
cannot register or replace this subscription.

Each notice carries the actual Core document revision and a separate package
revision. Package remove/restore advances only the package revision without
saving a layout or changing its CAS revision. The Header reads the latest snapshot
for a new notice, even with Chat closed,
and coalesces it behind the current action. It records the notice before queuing
the read, so a failed read does not retry from every render. A newer revision or
explicit Refresh can request another read. Unchanged reads, refused requests and
receipt replays do not publish another change. A confirmed layout save still
publishes when subsequent content initialization makes the overall result
uncertain. Its original uncertain receipt remains unchanged and is not replayed.
A replacement native Header retires the previous subscription. The next
subscription compares its last revision pair with the owner's current pair, so a
full bounded notification cannot hide the final accepted state. This is a view
notification, not another writer or effect retry. A caught-up document notice
is consumed without another read or preparation, including after a busy action.

Notice reads keep normal preparation for newly authorized visible content, but
do not retry known-refused terminal starts. Explicit Refresh retains that retry;
uncertain starts are never replayed. The package filesystem/availability source
and its remaining native-lifetime requirements are described in [content.md](content.md).

Header keeps application requests and terminal preparation serialized. While
preparing, it can retain one unsent Close or discrete Portal visibility/mode
intent. The slot stores the original callback and an immutable signature of
the displayed panel/content/owner and arrangement, or the Voyage's Portal
layout. Admission refuses a stale menu version or a second intent. Width drags
use the existing reset/refusal path. The slot is removed before dispatch and
drains only after an accepted, fresh applied result and successful required
preparation. Its target must still match before a new request uses the current
version. Failed or uncertain preparation cancels it visibly. This is an unsent
UI intent, not replay of an application request. The additional corrective build
was approved on 7 November. Native acceptance remains open, and the correction
is not yet in the owner preview.

The channel holds at most eight pending calls. A client timeout reports an
unconfirmed result and never retries it. The actor keeps the accepted request
even when its caller disappears. It retains 32 request/outcome pairs without
historical layout snapshots. An identical request returns its recorded outcome
with the current confirmed snapshot, and a changed request with the same
identity is refused. A Core conflict or failed inspection marks the retained
snapshot not fresh. This is bounded in-process retention, not durable
cross-restart deduplication. New mutations must match the confirmed layout
revision. An uncertain Core result requires inspection before another change.

The `voyager_workspace` host module is installed only in the workspace chrome's
policy. A caller cannot grant itself a role through its request. The host limits
request JSON to 64 KiB before dispatching asynchronous work. Content packages
do not receive this module. Additional agent/content entry points must bind
their caller at the host boundary before reaching the same owner.

`desktop/mods/header/main.js` is retained presentation and interaction binding.
It receives confirmed snapshots and uses the generated wrapper for operations.
Switching a Voyage or Fleet changes navigation, not the explicit avatar context.
The scope controls in this checkpoint set that context; they are not the final
animated avatar interaction. Rust owns effects and GPUI draws the view. There
is no browser engine in this runtime.

Voyage, Fleet, Vessel and Portal names edit in place. Double-click or focus the
name with Tab and press F2. Enter or leaving the field saves; Escape cancels a
changed draft. An empty name reports the error and restores the existing label.
A pending selection does not discard a double-click. The submitted name stays
bound to its target; an unconfirmed name is not sent again on blur or Enter.
An explicit Refresh can confirm the latest label before a distinct new edit.
Queued navigation after a rename follows the latest selected destination and is
cleared if its prerequisite is refused or unconfirmed.

The Linux native fixture drives actual mouse actions, checks the saved Core
document and captures the rendered result. An external document edit makes the
next visible action fail unchanged; an explicit Refresh obtains the new revision.
The fixture then reopens the same profile and verifies retained layout identity.
Its dedicated Core session is stopped only after the owned application quits.
Closing the current checkpoint's window closes its bridge, not the Core server.
The complete application's floating-avatar and explicit-Quit lifecycle remains
assigned to the later integration tasks.

Source basis: Core 0.1.16 at
[`e07c2a1`](https://github.com/herdrdev/herdr-core/tree/e07c2a1bedd62cf4787ee026ee23ee79c7d95491),
including its document schema and plain/framed protocol; GPUI Shell at
[`9448039`](https://github.com/longbridge/gpui-kit/tree/944803984cf0ba3111861d6e1aa9d6265c109ff9),
including asynchronous host functions and retained views. The accepted native
header supplies hosting and last-good reload behavior. This checkpoint does not
claim new platform support or a measured performance improvement.

## Script authoring and checking

The repository authors workspace, shared panel, navigation and chat views in
TypeScript.
The profile receives the emitted JavaScript through the existing seed-once and
live-edit path. Contract generation produces typed workspace and conversation
wrappers alongside their runtime validators. Run `npm run contract:generate` after
changing contracts and `npm run scripts:generate` after changing composition or
native registrations. `npm test` checks strict types and emitted-file drift before
the controller and validator tests. This headless check requires the Rust toolchain
and GPUI's native linker libraries; it does not create a window or establish native
interaction behavior.

Size an avatar dock target through an ordinary `div` around `Target.new`, such as
`div().h(42).flex_shrink_0().child(target)`. The pinned Shell renders a registered
module's factory result directly and does not apply style chains attached to
that module element. A native factory owns its own geometry; ordinary layout
containers apply the surrounding geometry. The built-in Button and Div paths
have their own style handling. Generated types check accepted calls and values,
but do not prove that a factory applies a requested visual style. Check the actual
native result when changing a registered component's size or presentation.

The exporter obtains declarations from the real Name, Terminal and arrangement
registrations, plus declarations attached to the runtime host modules. It retains
the raw declaration hash and the transitive imported-module slice. The slice is
checked without skipping library declarations. The pinned Shell's invalid
`ElementBounds` extension is converted to an equivalent intersection only when
its expected exact form appears. Missing or changed declarations fail the check.
The Header declaration slice also withholds `id` from the registered Occluding
element, including after style calls. The pinned Shell advertises that method
but rejects it at runtime. This exact-form adjustment changes no runtime method.
The Shell's separate profile editor hints still contain the upstream declaration;
they do not provide the repository's corrected strict authoring check.

The shipped Notes package is also authored in TypeScript and emitted by this
same gate. Its compilation uses the actual `export-script-types --notes` private
input/host declarations in a separate scope, so Header/Terminal imports remain
unavailable. The profile's seeded JavaScript stays editable and is preserved;
repository checks do not automatically validate later personal edits. See
[native Notes](content.md) for remaining owner, signature and lifecycle limits.

Go there sends `reveal-panel` with a retained Vessel or Portal placement ID. The
owner selects its original arrangement, clears hidden state and reinserts its
leaf only when absent. A Portal reveal also opens its own Voyage's column. This
preserves content, backend and explicit dock context. Unknown placements refuse
before mutation, and captured scope still limits each request. The earlier Linux
Vessel-reveal journey recorded the same live PID and process start; it does not
accept the new shared Portal/Home UI or the full native UX checkpoint.

Name and Composer share the native text adapter in desktop/src/text.rs. Each
retains one gpui-base InputState and supplies accessibility metadata through that
editor. The current Linux bridge exposes its label and focus but lacks the Text
interface needed for an external accessibility text read. Name keeps its initial text and rename
events. Entering Name selects its current value; only submit or blur commits
the rename. Composer uses its constructor string as its accessible label, with
an empty visible placeholder and initially empty buffer. Chat keeps that same state through its
open, close and sidebar placements. This adapter addresses the pinned Shell
Input materializer's omitted accessibility metadata; it does not introduce
another editor or change the conversation/provider contract. The integrated
native chat journey verifies typing, one actual provider turn and draft retention
through native clipboard copy, independently of the missing Text interface.
Compact chat is anchored below the Fleet row and uses the opaque sidebar surface
to keep terminal output from crossing its text. The regular sidebar keeps its
original translucent surface. Following the newest reply automatically remains
an open parity requirement.


## Sidebar disclosure and content menus

The current feedback candidate gives Chat the sidebar's width beneath the primary
avatar. Opening it pushes Home and Voyages down; closing uses the same chat icon
and retains the draft. Native height and opacity transitions use 180 milliseconds,
matching the original Electron disclosure. MeasureHeight reports changed native
container heights to the script so it can reserve room for navigation. It has
one retained measurement per container and reports no unchanged height. It does
not own conversation state or persistence. The compact conversation overlay
exists only while Chat is present, including its closing transition.

Creation and right-click menus share the same bordered surface and menu-item
builders. Launch labels omit configuration details; the captured launch settings
and destination remain unchanged. Revealing an empty Portal column opens the
chooser under P after a successful current-owner response. Cancelling creates
nothing. Revealing an existing column retains its content. The native Column
starts its trailing panel at the saved width and keeps its resize handle on the
visible seam. These feedback changes require the combined native journey before
UX acceptance.


## Worktree and Home feedback candidate

The 5 November candidate uses the Voyage context menu for Rename, Close, New worktree, Open worktree and, for a linked checkout, Remove worktree. Fleet creation remains at its own plus control. A native centered dialog owns filtering and keyboard selection. Its list uses the SDK's retained virtual-list scroll handle so keyboard selection stays visible. Worktree Voyages appear beneath an open parent with an indent and branch icon. They remain independent open Voyages, without indentation, when that parent closes.

New worktrees use the main checkout's `.worktrees/` folder, with a local Git exclude entry. Git creates and checks out the chosen branch. The removal dialog reports uncommitted changes and retains the branch. The Rust owner rechecks live program directories and uses ordinary Git removal without force. After deletion, it reads the remaining checkouts from the primary directory and closes matching target Voyages, not the request's source Voyage. Successful checkout observations suppress removed project-local worktrees from Recent voyages without deleting retained application data.

The layout and Git operation owners remain distinct. The script cannot grant deletion or launch authority. Dialog observations keep their captured request identity/version. Async list and text changes explicitly refresh the separate native dialog. The dialog handles Escape and Cancel itself, and waits for a dispatched operation before dismissal.

Worktree completion publishes the existing Rust workspace notice. Its native watcher invalidates Header, which inspects through its own view context. The dialog only updates its checkout cache and closes. It must not start workspace inspection from its own task: closing a dialog cancels that view's continuations and can strand the workspace busy flag.

Home groups existing content by Voyage using the same colour function as the sidebar. Agent status groups start collapsed. Closed Voyages are absent from Home. Voyage headings start expanded and collapse their contents when clicked, without a separate arrow. A successful complete Core process snapshot excludes ended or absent bindings from the running-work list; failed retrieval remains unavailable. Notes and other content without processes remain present. The current reported-activity contract has task progress, not reliable context-window usage, so this candidate does not display a context percentage.

This UX follows the [Herdr worktree mod](https://github.com/herdrdev/herdr-app/blob/f896da489de594fdb18a92a31dd953da3cf58da2/defaults/mods/worktree/main.js), with Voyager's project-local storage, styling and typed application owner. Source checks do not establish the complete native journey.


## Confirmed Voyage shutdown

Close Voyage prepares a typed inventory and asks the native user to confirm. It
is distinct from hiding a panel, closing a Fleet or quitting the application.
Those operations detach views and retain programs. Existing closed Voyages are
not stopped by migration or inspection. An administrator can request the same
confirmation but cannot confirm or cancel it through a scoped tool call.

The application owns one close plan. Its separate close revision wakes Header
even when no layout changed. Header displays the plan and uses compact shared
controls from content/ui.ts. Confirm and Cancel bind the exact plan identity;
Cancel remains available after unrelated revisions or an uncertain observation.
A lost invocation offers Inspect, which reads state and never repeats shutdown.
Dialog tasks do not call Workspace.run or own the application continuation.

After confirmation, the native Notes host resolves the target content IDs to
retained Sessions. It makes their inputs read-only, joins ordinary revision-based
saves and releases them after completion or refusal. A dirty inactive draft,
file change or unconfirmed current save blocks all program stops. The private
native-save path does not grant Update access to scripts or agents. Draft body
text never enters the public close plan. Client keeps processing messages while
the host acknowledges saves.

Core owns shutdown signals. Voyager submits its existing Stop action for each
captured terminal address/PID and requires an observed finished state. A request
receipt does not establish exit. Notes failure stops nothing; a later partial
failure reports the actual result and never restarts work or repeats an uncertain
stop. The application saves closed state only after successful acknowledgements.
Uncertain storage marks the projection non-fresh until inspection.

A private snapshot checks the target Voyage and its content identities. Target
mutations and terminal opening are refused during shutdown. Unrelated Voyages
and navigation remain available. Membership comes from the selected Voyage's
Fleets and Portals, including retained placements, rather than directories or
worktree parentage. Recent reopening prepares only that Voyage's confirmed-ended
retained terminals as ordinary shells. It preserves Notes file selection and
never resumes an agent command or its instructions.

Source and dedicated Core tests cover this policy. The native shutdown journey
and complete foundation acceptance remain separately recorded in the walkthrough.

## Activity scope and Portal closure

Activity derives scope from its placement. The Home Fleet sees the workspace,
a Portal sees its Voyage, and an ordinary Vessel sees its Fleet. Avatar context
and keyboard focus do not change that scope. Agents are listed directly with a
status symbol, ordered by Needs attention, Working, Done and Idle. Idle is the
presentation fallback for other or absent reports. Raw reports and diagnostic
reasons remain distinct. Confirmed-ended programs and closed Voyages are absent.
Voyage headings remain expandable, and Home uses its Home icon.

RemovePanel retains the placement, content and backend. Removing the last
visible Portal panel also collapses that Voyage's column. Opening an empty
column shows new types and hidden Portals. Dismissing that empty chooser
collapses it; restoring a hidden Portal keeps its existing identity and backend.

New directory-derived Voyages record their original primary Vessel and an
automatic name origin. Observed directory changes from that Vessel may update
the Voyage's displayed name. Reordering does not choose another primary Vessel.
Deliberate names, including legacy records without automatic-name metadata,
remain fixed. Display-name changes do not move Notes or change the stored Voyage
directory. Worktree close confirmations include the current uncommitted-change
count when its registered checkout can be identified. Closing preserves the
worktree directory and branch.

Background worktree discovery is serialized through its existing controller.
Queued observations retain the latest requested revision. Activity refresh and
hidden-content choices share an in-flight process observation for the same
revision. The chooser publishes the local worker and content catalogues together,
so selectable rows do not move when those reads finish in a different order.
Hidden-view observations arrive separately below those choices. These changes
do not raise the actor queue capacity or bypass Core's input safeguards.

## Delayed process effects

The application owner validates a process request's captured scope, workspace
revision, content binding and observed terminal/PID before dispatch. Send,
Interrupt and Stop then wait outside that owner. Completion returns to the same
owner to record the original result. A later dock change does not retarget an
already dispatched request. A duplicate pending request reports that it remains
pending and does not dispatch again. An identical completed request returns its
retained result.

The single framed Core connection routes replies by request ID. It admits at
most nine pending RPCs, including capacity for ordinary owner reads alongside
at most eight admitted process effects. Process admissions remain counted until
the owner reconciles completion. The thirty-two-entry process receipt history
evicts completed entries only. Replies received after a caller has gone away
are ignored without disconnecting unrelated viewers. Disconnects release all
waiting callers with uncertain outcomes. Each request's twenty-second deadline
starts when dispatched, rather than when a completion worker starts waiting.
No timeout or disconnect repeats an effect.

This isolates delayed process effects. Initial revision/target checks, List,
Read and context preparation still use synchronous Core reads. A stalled Core
can delay those paths; this change does not claim that every application
operation is asynchronous. The real-Core regression verifies workspace
inspection, pending-duplicate refusal, a dock change and original-target
completion during a deliberately delayed Send. Native UX and broader load
acceptance require their separate journeys.

## Restoring a decorated Linux window

GPUI reports the client window's root-relative origin. An X11 ConfigureRequest
without explicit gravity instead uses the window frame's reference point. In
the observed desktop the top frame is 74 device pixels, so reusing the client
origin in that request moved the restored window down by 74 pixels each time.

The Linux platform adapter restores windowed bounds through the advertised
`_NET_MOVERESIZE_WINDOW` operation with Static gravity, all four coordinate/size
flags and the application source flag. Static gravity addresses the client
origin directly. The adapter checks the window and supported operation before
dispatch and checks cancellation again immediately before sending. It does not
modify global size hints, subtract a fixed decoration height, retry an uncertain
request or add another window controller. Unsupported desktops report refusal.
The existing controller still owns minimization, activation, window identity,
restoration epochs and removal of the temporary floating avatar.

The governing protocol is the [EWMH move/resize message](https://specifications.freedesktop.org/wm/latest/ar01s04.html)
and its [window geometry rules](https://specifications.freedesktop.org/wm/latest/ar01s09.html).
Pinned Herdr App's X11 backend uses the same root-window client-message mechanism
for its native window-manager operations. The actual native journey compares
both window position and size before/after, requires no stray floating window,
and verifies the retained layout, Core and shell identities across reopening.
This is a Linux/X11 repair, not evidence for macOS, Windows or Wayland.

## Tested Core upgrade

The 7 November release uses generated Core types from the pinned 0.1.16 input.
Its real native restore/reattach and Notes/Voyage-shutdown journeys ran against
Core 0.1.18. The owner handoff also retained an existing 0.1.18 Core. This
establishes that these consumed operations work across that additive upgrade.
It does not establish a general compatibility matrix. Generation/capability
checks remain the admission rule; a newer version string alone is not refusal.
