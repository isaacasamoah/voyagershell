# Native avatar ownership

The workspace chrome places the original Voyager avatar through the bound
`voyager_avatar` module. `Layer` supplies placement/context and `Target`
describes a visible scope and measures its real layout bounds. The original
astronaut frames and brand live in `desktop/assets/`. The tagline image is the
retained native experiment's export of the original interface text.

`desktop/src/avatar.rs` owns one GPUI avatar entity. Workspace and floating
presentation views hold handles to that entity, rather than copies of its motion
state. Its finite pose sequence, assets and active pointer gesture
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

The avatar is still at rest and runs finite animations on deliberate triggers.
Hover starts one stretch on entry. Staying over the hit area does not repeat it.
An applied dock replaces any active clip with a pronounced two-second float.
Hover is ignored while a clip runs and is never queued. Click keeps its original
minimize/restore action. Dragging keeps its placement behavior and sound.
Shift-click and focused S also play the hover binding. Focused F5 reloads the
profile's animation files. S and F5 use local press/release latches because the
pinned X11 backend does not mark repeated keys as held. Blur clears those latches.
Reduced-motion preference or `VOYAGER_REDUCED_MOTION` suppresses clips, preserving
all application actions.

`desktop/src/avatar_pack.rs` compiles typed profile data and decoded PNGs into one
immutable candidate. `avatar_motion.rs` owns monotonic finite playback. The native
painter in `avatar/paint.rs` applies the compiled image, crop, anchor and scale.
It retains the prior native base-image/front-opacity crossfade; equivalence with
the authoring proposal's weighted blends is not established. GPUI's public image
painter rounds visible bounds to device pixels. The default float uses 120
translated aliases of the same decoded idle image, zero fade and 16/17 ms holds,
for exactly 2,000 ms. It has no alternate docking renderer. Changing frames request
animation frames; long holds use one cancellable view wake, invalidated by the
motion generation on replacement. Settled or hidden views request neither.

The profile's `avatar/` folder contains `configuration.json`, its named pack JSON,
PNG assets and generated schemas. Configuration selects `restPose` and nullable
`hover`, `click`, `dock` and `undock` clip bindings. Defaults enable hover stretch
and dock float, leaving click and undock animation disabled. Files seed once;
existing personal files are preserved. A user or agent can edit these files and
focus the avatar, then press F5. Reload compiles away from the UI thread and swaps
bindings, poses and images together after validation. The previous pack returns
from the swap so its unique image IDs can be retired through GPUI App::drop_image
for all windows. One window refresh invalidates retained sprite replay after
retirement. Failed candidates never reach the atlas. Failure retains the usable
pack. A successful reload clears only its own preceding visible error. The native
Status component renders that same message with its accessibility label; the
script SDK does not expose labels on its plain text containers.

Documents are limited to 1 MiB each, PNG dimensions to 4096 per axis, and decoded
RGBA storage to 64 MiB across distinct images. The loader checks RGBA size before
decoding/conversion. Derived full-image geometry must remain finite with a 256-fold
transform margin covering the current native avatar size. Asset names are flat
basenames. Missing references, invalid rectangles, unsupported versions and
nonempty effects are refused. Version 1 currently supports PNG poses and finite
steps with easing/crossfades; native plasma effects and automatic authoring-guide
injection from PR #42 remain outside this implementation.

Application responses still refresh context through the existing owner path.
Navigation and terminal output do not themselves start avatar animation. Only a
validated applied dock receipt starts its dock clip. Animation files cannot run
code or invoke application operations. This trigger policy supersedes continuous
idle motion by Isaac's 9 November decision. Actual native motion, alpha, input and
resource evidence must accompany the release; source checks alone prove none of
those outcomes.

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


## Archived pixel-identical idle redraw experiment

`VOYAGER_EXPERIMENT_PIXEL_MOTION` was an unselected performance control. Its active view hook is removed under the deliberate-motion policy. The original source remains in the performance experiment archive and immutable measured source. The following describes that earlier experiment. The original wall-clock float, motion transitions and external state notifications remain unchanged. One pending next-frame callback checks settled idle without advancing its state. Due poses, unfinished transitions, dragging, missing measurements or changed position, diameter or scale invalidate normally.

A prepaint canvas measures the existing square image wrapper. Pinned Taffy rounds its authored absolute top before painting, so predicted movement uses the difference between snapped new and recorded authored top. Both measured vertical image edges must remain identical after the painter's own device-pixel snapping before notification can be skipped. Raw float-delta translation is incorrect near fractional-layout thresholds. The callback still follows the original display cadence; this does not cap animation or defer input. Exact native pixels and measured response remain acceptance requirements.
