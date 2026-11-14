# Inspection endpoint

The inspection endpoint tells a verifier where controls are. Start the app
with `--inspect ABS_FILE`, and the app writes one JSON frame to that file each
time the drawn workspace window changes. A verifier reads the file to aim a
click at a control, to see that a control is gone, to read the text that a
name shows, to learn when the workspace is prepared, and to read the avatar's
dock context. Without the flag the endpoint does not exist.

The endpoint only reports. It accepts no command, opens no socket, reads no
file and changes no workspace state. A marker is a statement that a script
makes about its own control. It grants no authority.

## Start the app with inspection

```sh
target/release/voyager-shell --profile /abs/profile --session voyager-name \
	--inspect /abs/evidence/frame.json
```

The path must be absolute and its directory must exist. Otherwise the app
exits before it opens a window. Give each launch its own file. The app does
not remove the file when it quits, and `sequence` starts again at 1 on the
next launch.

## The frame

```json
{
  "sequence": 12,
  "window": { "width": 1450.0, "height": 940.0, "scale": 2.0 },
  "dock": { "kind": "vessel", "id": "placement-2" },
  "dockFocus": { "kind": "fleet", "id": "fleet-1" },
  "prepared": true,
  "elements": [
    {
      "role": "voyage-name",
      "key": "voyage-1",
      "label": "Voyager",
      "bounds": { "x": 71.0, "y": 96.0, "width": 180.0, "height": 38.0 }
    },
    {
      "role": "fleet-name",
      "key": "fleet-1",
      "label": "Fleet 1",
      "bounds": { "x": 326.0, "y": 0.0, "width": 78.0, "height": 45.0 }
    },
    {
      "role": "vessel-name",
      "key": "placement-2",
      "label": "bash · voyager · Terminal 2",
      "bounds": { "x": 885.0, "y": 54.0, "width": 470.0, "height": 35.0 }
    },
    {
      "role": "split-right",
      "key": "placement-1",
      "bounds": { "x": 795.0, "y": 60.0, "width": 22.0, "height": 22.0 }
    },
    {
      "role": "sidebar-toggle",
      "key": "",
      "bounds": { "x": 12.0, "y": 6.0, "width": 32.0, "height": 32.0 }
    },
    {
      "role": "avatar",
      "key": "",
      "bounds": { "x": 1073.0, "y": 300.0, "width": 94.0, "height": 94.0 }
    }
  ],
  "ambiguous": []
}
```

| Field | Meaning |
| --- | --- |
| `sequence` | Starts at 1 and rises by one for each frame the app writes. The app writes only when the frame differs from the last one. |
| `window` | Size of the workspace window's drawable area in logical pixels, and the factor that converts logical pixels to device pixels. |
| `dock` | The avatar's dock context, in the same form as `Context` in the application contract. |
| `dockFocus` | The context of the dock target that holds keyboard focus, in the same form as `dock`. A fallback target never counts. The field is absent while no dock target holds focus. It names where Shift+Enter would dock the avatar, not where it is docked. |
| `prepared` | `true` when the header script has no workspace request in progress. While it is `false`, the header drops or defers a new workspace action. It is `false` until the script first draws. |
| `elements` | The marked controls that the latest drawn frame contains, sorted by role and key. Each `role` and `key` pair appears once. |
| `ambiguous` | Controls that share one `role` and `key` pair. They are left out of `elements`. |

Read a frame by these rules:

- A control is identified by `role` and `key` together. `role` says which
  control it is. `key` is the id of the Voyage, Fleet, placement or launch
  entry that the control acts on. A control that exists once has an empty key.
  A key is never a display label.
- `label` is the text that the control shows. A name control, the rename
  editor and the chat controls whose drawn text is their state report one.
  A name control reports the text that the header gives its title, and a
  narrow control can cut that text short when it draws it. The rename editor
  and `chat-composer` report their current draft, which is an empty string
  after the user deletes the text. `chat-message`, `chat-status`, `chat-error`
  and `chat-send` report the string that they draw. Every other control has no
  `label`.
- Wait for `prepared` before an input that starts a workspace action. The
  header answers an action that arrives earlier with "Workspace preparation is
  pending. This action was not sent."
- `bounds` are logical pixels from the top left of the window's drawable area.
  Multiply by `window.scale` for device pixels, then add the window's position
  on the screen.
- `bounds` is the part of the control's box that the frame draws. A scroll
  area or a hidden overflow can clip a control. The centre of `bounds` is
  therefore inside the control. A control that is fully clipped is absent.
- A control that is absent from `elements` and from `ambiguous` was not part
  of the latest drawn frame. Absence is an answer. A closed creation menu has
  no `create-notes` element.
- `bounds` describe geometry only. A frame does not say whether another
  element covers the control.
- After an input, wait for the element or the absence you expect. A change in
  `sequence` alone shows only that some later frame was written.
- A menu's entries appear one frame after the menu opens, because the popup
  measures its trigger first.

## Roles

`roles!` in `contract/src/inspection.rs` is the one list of roles. The serde
names, the `Marker` constructor's accepted values and the generated TypeScript
union all come from that list.

| Role | Key | Control | Marked in |
| --- | --- | --- | --- |
| `voyage-name` | Voyage id | The Voyage's row in the sidebar | `renderName` in `navigation-view.ts` |
| `fleet-name` | Fleet id | The Fleet's tab | `renderName` |
| `vessel-name` | Placement id | The Vessel's title | `renderName` |
| `portal-name` | Placement id | The Portal's title | `renderName` |
| `terminal` | Placement id of the Vessel or Portal | The terminal view, once it is attached and accepts input | `renderPanel` in `panel-view.ts` |
| `split-right`, `split-bottom` | Placement id of the Vessel or Portal to split | The split buttons | `Workspace.splitControl` |
| `sidebar-toggle` | Empty | The sidebar toggle | `Workspace.sidebarToggle` |
| `create-notes`, `create-agents` | Empty | The Notes and Agents entries of the creation menu | `CreationPicker.render` in `creation.ts` |
| `create-worker` | Launch entry id | A terminal or agent entry of the creation menu | `CreationPicker.render` |
| `create-voyage` | Empty | The Create Voyage button in the sidebar heading, or in the rail when the sidebar is collapsed | `renderSidebar` in `navigation-view.ts` |
| `create-fleet` | Voyage id | The Create Fleet button after the Voyage's Fleet tabs | `renderFleets` in `navigation-view.ts` |
| `name-editor` | Id of the Voyage, Fleet or placement being renamed | The rename editor that replaces a name control | `renderNameEditor` in `navigation-view.ts`, with `EditorMarker` |
| `avatar` | Empty | The avatar in the workspace window | `AvatarView::render` |
| `close-voyage` | Voyage id | The Close entry of the Voyage row's context menu | `renderSidebar` in `navigation-view.ts`, through `MenuItem.marker` |
| `recent-voyages` | Empty | The Recent voyages button, drawn while a closed Voyage can be reopened and the sidebar is open | `renderSidebar` |
| `reopen-voyage` | Voyage id | An entry of the Recent voyages list | `closedVoyageItems` in `main.ts`, drawn by `renderSidebar` |
| `voyage-close-entry` | Content id | One row of the close dialog's inventory | `VoyageClose.render` in `voyage-close.ts` |
| `voyage-close-cancel` | Voyage id | The Cancel or Dismiss button of the close dialog | `VoyageClose.render` |
| `voyage-close-confirm` | Voyage id | The Close Voyage button of the close dialog | `VoyageClose.render` |
| `toggle-portals` | Voyage id | The button that shows or hides the Portals | `portalControls` in `navigation-view.ts` |
| `close-panel` | Placement id | The close button of a Vessel or Portal, which keeps its process running | `renderPanel` in `panel-view.ts` |
| `hidden-panels` | Empty | The Hidden Vessels or Hidden Portals entry of the creation menu | `CreationPicker.render` in `creation.ts` |
| `reopen-panel` | Placement id | A hidden Vessel or Portal that the creation menu lists after it expands | `CreationPicker.render` |
| `workspace-dock` | Empty | The avatar's workspace dock, which wraps the brand | `renderSidebar` |
| `portal-area` | Voyage id | The area that holds the Voyage's Portals while they are visible | `Workspace.render` in `main.ts` |
| `go-there` | Empty | The Go there button of the context bar, drawn when the dock target is out of view | `renderContext` in `navigation-view.ts` |
| `chat-toggle` | Empty | The button that opens and closes the chat | `Chat.toggleView` in `chat.ts` |
| `chat-composer` | Empty | The chat's message editor. Its `label` is the current draft | `Chat.render`, with `ComposerMarker` |
| `chat-send` | Empty | The Send button, or the Interrupt button while a reply is in progress. Its `label` is `Send` or `Interrupt` | `Chat.render` |
| `chat-messages` | Empty | The chat's message viewport | `Chat.render` |
| `chat-message` | Message id | One message. Its `label` is the message text | `Chat.render` |
| `chat-status` | Empty | The Thinking line. Its `label` is the string that it draws | `Chat.render` |
| `chat-error` | Empty | The chat's error line. Its `label` is the error text | `Chat.render` |
| `split-divider` | The split's id, a JSON array `[session, owner, path]` | The resize handle of one branch of a Fleet's split tree | The handle appearance in `desktop/src/split.rs`, with `inspect::control` |
| `maximize-panel` | Placement id | The maximize or restore button of a Vessel or Portal | `renderPanel` in `panel-view.ts` |
| `move-preview` | Placement id of the destination | The highlighted half of the destination while a Vessel is dragged. Its bounds give the side | `renderPanel` |

A name control leaves the frame while its rename editor replaces it, and
`name-editor` with the same key takes its place. The editor takes keyboard
focus when it opens. Enter or a loss of focus saves the name, and Escape
cancels the edit. A frame reports keyboard focus only for dock targets, through
`dockFocus`. It does not say which other control holds focus. The sidebar button and the
rail button share the `create-voyage` role, because the app draws only one of
them at a time.

`renderName` builds a name control's marker and its title from one string, so
the `label` in the frame is the string that the control draws. A Vessel or
Portal title shows the program and the folder before the name, as in
`bash · voyager · Terminal 2`.

## Mark a control

1. If the control needs a new role, add one line to `roles!` in
   `contract/src/inspection.rs` and one row to the table above.
2. In the TypeScript source, add the marker as a child of the control:
   `.child(Marker.new("sidebar-toggle"))` or
   `.child(Marker.new("split-right", panel.id))`. Import `Marker` from
   `voyager_native`. Pass the id that the control acts on, never a label.
3. If the control shows a name, pass the text that it draws as the third
   argument: `Marker.new("fleet-name", fleet.id, label)`. Build the drawn text
   and the marker from the same value.
4. Run `npm run scripts:generate`.

Put the marker in the helper that builds the control, so that every caller of
the helper is marked. A context menu entry takes its marker through
`MenuItem.marker`, which `WorkspaceMenu.render` draws inside the entry's
button. `content/ui.ts` cannot hold a marker, because the Notes
package loads it without `voyager_native`.

`voyager_native` exports three more constructors for the same component.
`EditorMarker.new(id, state)` marks the rename editor and reports the draft
that `state` holds. `ComposerMarker.new(state)` marks the chat composer. It
takes a `ComposerState`, so the state kind fixes the role and a wrong pairing
cannot be written. It reports the draft in the same way. `Prepared.new(ready)` is drawn once, at the root of the
header, and reports whether the header has a workspace request in progress.

## Mechanism and invariants

`desktop/src/inspect.rs` owns the mechanism. `contract/src/inspection.rs` owns
the frame's shape, so a reader can parse a frame with the type that the app
writes.

**Off unless requested.** `main.rs` passes the `--inspect` path to `run`, and
`inspect::install` is the only caller that creates the recorder. Without a path
there is no recorder, no task, no element state and no file. A marker is the
same element in both cases. It is positioned absolutely, takes no space, paints
nothing and handles no input, so the flag cannot change the layout.

**A control is reported while GPUI holds its marker's element state.** A marker
records its bounds during prepaint and keeps a slot through
`Window::with_element_state`. GPUI keeps that state while the element is part
of each drawn frame, and carries it forward when it reuses a cached view. The
Header and its script view are cached, and the avatar redraws often, so most
frames reuse every Header marker without running it. GPUI drops the state
inside the draw in which the control is no longer drawn, and the slot's `Drop`
removes the control. A counter that marks what was prepainted in a frame would
be wrong here. That counter would remove every Header control on a frame in
which only the avatar changed.

**One slot for each drawn marker.** A slot belongs to one marker element, not
to a `role` and `key` pair. A marker only writes and removes its own slot. Two
drawn markers with one pair therefore stay two slots, and the frame lists both
under `ambiguous`.

**Preparation is a drawn fact.** `Workspace.render` in `main.ts` draws
`Prepared.new(!this.busy)` in every header draw. The marker keeps a slot while
`busy` is false and removes the slot while `busy` is true. `prepared` in a
frame is true when such a slot exists. Before the script draws there is no
slot, so `prepared` is false. The header sets `busy` for the whole of a
workspace request, including the preparation of the contents that the request
creates, and it redraws each time `busy` changes.

**A draft is read in every draw.** The rename editor's text changes without a
new header draw, because the header's view is reused. `inspect::stage`
therefore reads the draft of each drawn `EditorMarker` again in every draw of
the workspace window, and a changed draft causes a new frame. The marker holds
the draft weakly, so inspection does not keep a released editor alive.

**A frame matches one draw.** Markers write during a draw and slots are removed
at the end of that draw. `AvatarView::render` calls `inspect::stage` in every
draw of the workspace window, so the window size, the scale and the dock
context come from the same draw. The publisher is a foreground task, and GPUI
never runs a foreground task inside a draw. Each frame is therefore a copy of
what one completed draw left. If two draws finish before the publisher runs,
the first draw is not written.

**Dock focus is read in every draw.** `AvatarView::render` passes `inspect::stage`
the scope of the non-fallback dock target whose focus handle is focused.
GPUI redraws the window when focus moves or is cleared, and the avatar is an
uncached overlay, so a Tab between dock targets changes `dockFocus` in the next
frame. A focused control inside a target, such as a terminal, does not make the
target focused.

**The workspace window only.** `install` records the workspace window, and
markers and `stage` ignore every other window. The avatar's floating window is
not reported.

**Whole files at a bounded rate.** The publisher waits on a channel that holds
one token, so the app does no inspection work while nothing changes. The
publisher writes `ABS_FILE.partial` on the background executor and renames it
over `ABS_FILE`. A reader opens the previous frame or the new frame, never a
part of one. The publisher waits 16 ms after each write, so a burst of changes
becomes at most about 60 writes a second and the last state is always written.
If a write fails, the app prints `Inspection stopped` once and stops writing.
The workspace is not affected.

## Checks

| Behavior | Test |
| --- | --- |
| No flag gives no inspection path, and a bad path is refused | `inspection_is_requested_only_by_the_flag` in `desktop/src/main.rs` |
| No path gives no recorder, and markers leave the layout unchanged | `without_a_path_nothing_is_recorded_and_layout_is_unchanged` in `desktop/src/inspect/tests.rs` |
| Bounds follow a resize and a collapsed sidebar, reused views keep their controls, closed entries leave, clipped controls are cut or absent | `layout_change_moves_bounds_and_closed_entries_leave` |
| Two controls with one identity are listed as ambiguous | `two_controls_with_one_identity_are_listed_as_ambiguous` |
| A frame reports preparation, the text of a name, and the draft of an editor in a reused view | `a_frame_reports_preparation_and_the_text_a_control_shows` |
| A reader that polls during writes parses only whole frames | `a_polling_reader_only_parses_whole_frames` |
| Rapid changes are written at most once in each period | `rapid_changes_write_at_most_once_per_period` |
| The header marks each control by role and id, and a name's marker carries the text that the control draws | `inspection markers name each control by its role and id and report the text it shows` in `desktop/canvas-test.cjs` |
| The header draws `Prepared` as false while a workspace request is in progress | `Home presents the retained out-of-view avatar without docking or starting content` in `desktop/terminal-test.cjs` |
| Each header control is marked with its role, key and label, and a menu item's marker is kept and drawn | `inspection markers name each control by its role and id and report the text it shows`, `a context menu keeps the marker of each item and draws it inside the entry` and `the workspace context menu passes each item's marker to the menu` in `desktop/canvas-test.cjs` |
| The chat marks its toggle, messages, composer, send control, status and error by what they draw | `chat marks its toggle, messages, composer, send control, status and error by what they draw` in `desktop/canvas-test.cjs` |
| The close dialog marks its inventory and its two buttons | `Voyage confirmation inspects an invocation error without repeating shutdown` in `desktop/canvas-test.cjs` |
| `ComposerMarker` reports `chat-composer` with the draft and follows a retype in a reused view | `the_composer_marker_reports_the_chat_composer_and_follows_its_draft` in `desktop/src/inspect/tests.rs` |
| `dockFocus` is the non-fallback dock target that holds focus, a fallback target never counts, and blur clears it | `the_focused_dock_is_the_non_fallback_target_that_holds_focus` in `desktop/src/avatar/view.rs` |
| A frame omits `dockFocus` until a dock holds focus, reports it while it does, and drops it on blur | `the_frame_reports_the_dock_that_holds_keyboard_focus_and_drops_it_on_blur` in `desktop/src/inspect/tests.rs` |
| The example frame above is the shape that the app writes | `the_documented_frame_is_the_shape_the_app_writes` in `contract/src/inspection.rs` |

The in-process tests draw a small script through the real `Marker` component
on the headless platform. They do not run the workspace script against Core.
A journey in the [native verification environment](../tests/native/README.md)
is the check of the real controls.

No in-process test draws `AvatarView`, so none fails when `AvatarView::render`
stops passing the focused dock to `inspect::stage`. A journey that moves focus
between dock targets and reads `dockFocus` is the check of that step.
