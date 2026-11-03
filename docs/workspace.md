# Native workspace boundary

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

The repository authors the workspace composition, Home and chat in TypeScript.
The profile receives the emitted JavaScript through the existing seed-once and
live-edit path. Contract generation produces typed workspace and conversation
wrappers alongside their runtime validators. Run `npm run contract:generate` after
changing contracts and `npm run scripts:generate` after changing composition or
native registrations. `npm test` checks strict types and emitted-file drift before
the controller and validator tests. This headless check requires the Rust toolchain
and GPUI's native linker libraries; it does not create a window or establish native
interaction behavior.

The exporter obtains declarations from the real Name, Terminal and arrangement
registrations, plus declarations attached to the runtime host modules. It retains
the raw declaration hash and the transitive imported-module slice. The slice is
checked without skipping library declarations. The pinned Shell's invalid
`ElementBounds` extension is converted to an equivalent intersection only when
its expected exact form appears. Missing or changed declarations fail the check.

Notes is a separate live-editable JavaScript package. It is not yet inside this
strict TypeScript gate. Its actual private input and host declarations are
exported separately with `export-script-types --notes`, and it cannot import the
Header's broader native registry. See [native Notes](content.md).

Go there for a hidden Vessel uses its existing placement identity. The workspace
owner selects that Vessel's original Voyage and Fleet, keeps the current split
tree intact and adds the hidden leaf beside it only when absent. It does not
change the captured avatar context, content, backend or ID counter, and an
unknown placement is refused before mutation. Requests from a captured scope
remain limited to the Vessel visible in that scope's projection. The integrated
Linux journey verifies the revealed Vessel's same live PID and process start.

Name and Composer share the native text adapter in desktop/src/text.rs. Each
retains one gpui-base InputState and supplies accessibility metadata through that
editor. The current Linux bridge exposes its label and focus but lacks the Text
interface needed for an external accessibility text read. Name keeps its initial text and rename
events. Composer uses its constructor string as the placeholder and accessible
label, with an initially empty buffer. Chat keeps that same state through its
open, close and sidebar placements. This adapter addresses the pinned Shell
Input materializer's omitted accessibility metadata; it does not introduce
another editor or change the conversation/provider contract. The integrated
native chat journey verifies typing, one actual provider turn and draft retention
through native clipboard copy, independently of the missing Text interface.
Compact chat is anchored below the Fleet row and uses the opaque sidebar surface
to keep terminal output from crossing its text. The regular sidebar keeps its
original translucent surface. Following the newest reply automatically remains
an open parity requirement.
