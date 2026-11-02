# Native avatar ownership

The workspace chrome places the original Voyager avatar through the bound
`voyager_avatar` module. `Layer` contains the retained native view. `Target`
describes a visible scope and measures its real layout bounds. The original
astronaut frames and brand live in `desktop/assets/`. The tagline image is the
retained native experiment's export of the original interface text.

`desktop/src/avatar.rs` owns one GPUI avatar entity. Workspace and floating
presentation views hold handles to that entity, rather than copies of its motion
state. Its clock, pose transition, float epoch, assets and active pointer gesture
survive window changes. Each presentation view owns its own focus handle and
observation subscriptions. Deferred window construction starts after the
controller's entity borrow ends, because GPUI may render a new window immediately.

The application client remains the context owner. A pointer release, recall or
keyboard docking gesture sends the existing typed `Dock` request through that
client. Only its response confirms the change. A validated applied receipt also
reconciles native window presentation when a script control requested the dock.
Navigation does not synthesize a dock. No avatar action grants authority.

Native pointer events supply the source window and real pointer coordinates.
The controller converts them to screen coordinates and compares them with the
workspace's currently presented targets. Composition changes retire omitted
target records and cancel the previous gesture. The avatar view is a direct
sibling of the JavaScript-composed workspace inside `Layer`. Targets retain
their last measured clipped bounds across cached frames. A changed measurement
schedules a weak, deferred avatar and script refresh; unchanged bounds do not
schedule one. Retiring a target also invalidates the view. Its mouse capture
listeners register during paint, including frames where the source image is
hidden. A hidden focused Vessel retains its context and uses the reference's
compact out-of-view presentation with a `Go there` action for its original Fleet.
Temporary drag previews do not change application context.

Window intentions carry a monotonically advancing local epoch. A late float
creation cannot replace a newer dock or float intention. Failed creation uses the
existing visible status path. Confirmed application snapshots are
accepted only at the newest displayed revision. Refused and unconfirmed outcomes
remain visible even when their layout snapshot is older.

Floating gestures move that same owned popup through X11 ConfigureWindow. The
controller retains one latest requested device-space point and its actual native
window, local intention epoch and cancellation permit. Logical coordinates use
the source window's actual scale. Background workers serialize configure sends
and replies through one controller-owned connection; the UI never takes that
lock. A cancelled synchronous request finishes before a later position request
can write. Stale requests check their permit before writing and their identity and
epoch before updating the model. A final release retains its final point until
acknowledged. Escape ends the gesture, retaining its last requested desktop
position as the reference's drag-end path does. Dock or a newer window intention
invalidates remaining position work. A request already sent cannot be recalled.

The moving popup supplies the travelling avatar outside the workspace. Over the
workspace, its image gives way to the native target preview. Workspace-origin
drags clamp their preview to the viewport as the reference does. Context changes
still require the typed Dock response; OS window movement does not establish a
dock. No window is created for each motion or release.

On Linux/X11, one connection subscribes to the owned window's `WM_STATE` changes
and destruction before its first read. The already-nonblocking connection's
duplicated descriptor supplies readiness only; x11rb remains the only protocol
reader. Buffered events are drained before waits and after replies. Connection
and reply work run off the UI thread. Dropping an awaited readiness task cancels
that wait, but cannot interrupt a synchronous reply already executing on a worker.

Only a confirmed Iconic state triggers floating. GPUI's coarse visibility also
includes complete occlusion, so it is neither the trigger nor a prerequisite.
This covers minimisation after the window was already occluded. The reply must
match the actual native window and current window intention. A changed visibility
epoch schedules a fresh actual-state read before acting. Destruction or disconnect
ends the watcher. There is no frame-driven window-manager polling. Other window
systems have an explicit unavailable result rather than an inferred equivalent.

The native avatar is a named button with Enter, Space and an accessibility click
action. Each visible target has a named group and a focused Shift+Enter action.
Target keyboard handlers do not intercept a child editor's focus. The brand and
tagline have one combined image name.

Normal animation invalidates the native avatar presentation. It does not rebuild
the JavaScript description on every frame. Application responses request a script
refresh once so its context indicator and layout can update. Reduced motion uses
the platform preference or `VOYAGER_REDUCED_MOTION`. The corrected settled-pose
rule retires the previous image after the crossfade.

The Linux sound adapter plays the original 48 kHz sine sweeps through `paplay`.
One worker and a four-item mailbox bound playback work. Failure is reported;
queued samples or an audio process exit do not establish audible parity. Actual
audible output still needs the native evidence and owner assessment.

The implementation uses the workspace's single GPUI pre/platform 0.3.10 family
and GPUI Shell revision `944803984cf0ba3111861d6e1aa9d6265c109ff9`.
It does not embed the old 0.2.2 demo. Native cross-window input, window-manager
behavior, exact material matching and another operating system require their own
real-surface evidence. The retained experiment's failed parity and proof-size
results remain historical limits. This integration does not establish terminal,
conversation, full foundation or performance acceptance.

The candidate restores the previous native demo's unchanged brand bitmap and
two-stop Home and non-Home circle gradients, as selected by Isaac. The current
GPUI public element API does not supply the Electron reference's live backdrop
blur and saturation. The restored gradient does not establish that material
parity. The travelling
popup path is source-prepared and still needs actual desktop video, release
geometry and cross-window docking proof. Assets currently resolve from the build checkout; relocation or a
packaged artifact is not established here. The independently accepted P3 provider
supplies actual Voyage-owned Portals and the shared content renderer. Portal
targets and Go there now use that owner data; their integrated native avatar
journey has not run yet. Name focus handles grow only in application-result tasks
or a rename event, never while processing a native context result during render.

## Working-core integration proposal

This worktree proposes the same controller with the working-core workspace,
terminal and private-chat hosts. It has not been released or exercised as one
native app. The Home overview preserves the captured context. When its target
is outside the visible Home view, the proposal reuses the existing compact
out-of-view target and Go there action; its placement requires owner review.
No Dock or terminal start follows from selecting Home.

The earlier unexpected floating startups remain unexplained. The retained P4
material and live-underlay difference, audible sound and motion comparison,
proof-size gate and exhausted corrective-build ledger remain open. The single
successful unprepared journey does not establish a startup fix or complete P4.
