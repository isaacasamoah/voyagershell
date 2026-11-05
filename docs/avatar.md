# Native avatar ownership

The workspace chrome places the original Voyager avatar through the bound
`voyager_avatar` module. `Layer` supplies placement/context and `Target`
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
target records and cancel the previous gesture. The same native avatar view
mounts in the outer ShellRoot's native-overlay slot, outside cached workspace
content and beneath sheets, dialogs and tooltips. The pinned SDK preparation in
CONTRIBUTING.md supplies that slot without avatar policy or another controller.
Targets retain
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

On Linux/X11, one connection subscribes to the owned window's `_NET_WM_STATE` changes
and destruction before its first read. The already-nonblocking connection's
duplicated descriptor supplies readiness only; x11rb remains the only protocol
reader. Buffered events are drained before waits and after replies. Connection
and reply work run off the UI thread. Dropping an awaited readiness task cancels
that wait, but cannot interrupt a synchronous reply already executing on a worker.

The atom list must contain `_NET_WM_STATE_HIDDEN` before floating is considered.
Mutter also publishes ICCCM Iconic state for windows on another desktop, so
Iconic alone does not establish minimize. Mutter's hidden atom excludes that
ordinary desktop switch, but also covers Show Desktop and minimized ancestors.
It is not proof that a human explicitly requested minimize. GPUI's coarse visibility
also includes complete occlusion, so it is neither the trigger nor a prerequisite.
This covers minimisation after the window was already occluded. The reply must
match the actual native window and current window intention. A changed visibility
epoch schedules a fresh actual-state read before acting. Destruction or disconnect
ends the watcher. There is no frame-driven window-manager polling. Other window
systems have an explicit unavailable result rather than an inferred equivalent.

The workspace view retains its last painted avatar center and native window
bounds. Avatar activation, native minimize and workspace close use that measured
center, rather than a fixed offset from the workspace origin. A compact dock grows
to the existing full-size floating presentation about the same screen center.
The popup uses the source display and the existing guarded positioning path to
apply its requested origin after creation. The same Avatar entity retains pose,
artwork, animation and the existing undock sound.

Hide records the native workspace identity, windowed/maximized/fullscreen bounds
and scale. A floating click starts one guarded restore in the current controller.
A windowed workspace receives one bounded native bounds request off the UI thread
before activation. Maximized and fullscreen workspaces retain their native mode
without an ordinary resize request. The popup remains until the same window's
hidden atom is absent. Only then does presentation return to the existing dock,
without a Dock operation or a new docking sound. A later explicit Dock still uses
the existing application request, epoch guards and original sound.
Identity validation happens before a restore becomes pending. A same-intent,
confirmed refusal clears the pending request and retains its error for another
human click. Connection failure after a bounds request remains uncertain and is
not automatically submitted again. A stale state read requests a fresh read through
the same observer, even if the old read consumed the last change notification.

The existing Popup kind remains override-redirect on X11. Mutter presents that
kind across virtual desktops. The narrowed minimize observer stops an ordinary
desktop switch from creating it, but deliberately floating behavior across desktop
switches still needs the native journey and owner assessment. Linux/X11 source and
checks do not establish macOS restoration or placement support.

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
parity. The travelling popup completed the bounded native cross-window docking
and release-geometry journey in the working terminal app. Full material, motion
and audible-sound parity remain unaccepted. Assets currently resolve from the build checkout; relocation or a
packaged artifact is not established here. The independently accepted P3 provider
supplies actual Voyage-owned Portals and the shared content renderer. Portal
targets and Go there now use that owner data and passed the integrated native
journey. Name focus handles grow only in application-result tasks
or a rename event, never while processing a native context result during render.

## Working-core integration

The same controller runs with the working-core workspace, terminal and
private-chat hosts. The combined release completed the bounded native docking,
floating, restoration and Portal journey. The Home overview preserves the
captured context. When its target is outside the visible Home view, it reuses
the existing compact out-of-view target and Go there action.
No Dock or terminal start follows from selecting Home.

The earlier unexpected floating startups remain unexplained. The retained P4
material and live-underlay difference, audible sound and motion comparison,
proof-size gate and exhausted corrective-build ledger remain open. The single
successful unprepared journey does not establish a startup fix or complete P4.


## Voice control placement

The feedback candidate retains one native Speech entity and audio lease. Full-size
Home, panel and floating avatars render that control on their lower-left edge,
opposite the unchanged status dot. Compact Voyage/Fleet docks and the bottom
fallback use the primary controls beside Chat. The avatar publishes this routing
through its existing presentation update, independently of explicit context.
Listening uses the existing status green. Routine Listening/Speaking captions are
absent; connection and capability failures remain in the control's accessible
description and bounded hover hint. This placement does not establish working
provider audio or another platform's microphone behavior.

Only the 38-pixel Voyage/Fleet avatar omits its fixed green dot. Header places that
same decorative indicator beside its existing primary voice/chat controls. The
full-size dot and other fallback presentations retain their existing behavior;
the dot does not establish service readiness.

The Speech Button blocks underlying mouse hit targets over its own measured
rectangle, including while disabled. Its ordinary Button focus, keyboard and
accessibility activation remain in use. Stopping only mouse-up would be too late
because the avatar handles release during the window capture phase.

Name and Composer retain the native single-line editor. They project the theme's
selection token and foreground caret onto that editor, without painting a selected
background over the entire input. Name focus still selects the actual full value.
The Composer has a 32-pixel frame with an 18-pixel line and horizontal padding.
Source formatting and inspection do not establish visible selection, caret geometry
or native speech isolation; the integrated release journey remains required.
