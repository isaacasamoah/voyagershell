# Inspection endpoint

The inspection endpoint tells a verifier where controls are. Start the app
with `--inspect ABS_FILE`, and the app writes one JSON frame to that file each
time the drawn workspace window changes. A verifier reads the file to aim a
click at a control, to see that a control is gone, and to read the avatar's
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
  "elements": [
    {
      "role": "voyage-name",
      "key": "voyage-1",
      "bounds": { "x": 71.0, "y": 96.0, "width": 180.0, "height": 38.0 }
    },
    {
      "role": "fleet-name",
      "key": "fleet-1",
      "bounds": { "x": 326.0, "y": 0.0, "width": 78.0, "height": 45.0 }
    },
    {
      "role": "vessel-name",
      "key": "placement-2",
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
| `elements` | The marked controls that the latest drawn frame contains, sorted by role and key. Each `role` and `key` pair appears once. |
| `ambiguous` | Controls that share one `role` and `key` pair. They are left out of `elements`. |

Read a frame by these rules:

- A control is identified by `role` and `key` together. `role` says which
  control it is. `key` is the id of the Voyage, Fleet, placement or launch
  entry that the control acts on. A control that exists once has an empty key.
  No display label appears in a frame.
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
| `voyage-name` | Voyage id | The Voyage's row in the sidebar | `Workspace.action` in `main.ts` |
| `fleet-name` | Fleet id | The Fleet's tab | `Workspace.action` |
| `vessel-name` | Placement id | The Vessel's title | `Workspace.action` |
| `portal-name` | Placement id | The Portal's title | `Workspace.action` |
| `split-right`, `split-bottom` | Placement id of the Vessel or Portal to split | The split buttons | `Workspace.splitControl` |
| `sidebar-toggle` | Empty | The sidebar toggle | `Workspace.sidebarToggle` |
| `create-notes`, `create-agents` | Empty | The Notes and Agents entries of the creation menu | `CreationPicker.render` in `creation.ts` |
| `create-worker` | Launch entry id | A terminal or agent entry of the creation menu | `CreationPicker.render` |
| `avatar` | Empty | The avatar in the workspace window | `AvatarView::render` |

A name control leaves the frame while its rename editor replaces it.

## Mark a control

1. If the control needs a new role, add one line to `roles!` in
   `contract/src/inspection.rs` and one row to the table above.
2. In the TypeScript source, add the marker as a child of the control:
   `.child(Marker.new("sidebar-toggle"))` or
   `.child(Marker.new("split-right", panel.id))`. Import `Marker` from
   `voyager_native`. Pass the id that the control acts on, never a label.
3. Run `npm run scripts:generate`.

Put the marker in the helper that builds the control, so that every caller of
the helper is marked. `content/ui.ts` cannot hold a marker, because the Notes
package loads it without `voyager_native`.

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

**A frame matches one draw.** Markers write during a draw and slots are removed
at the end of that draw. `AvatarView::render` calls `inspect::stage` in every
draw of the workspace window, so the window size, the scale and the dock
context come from the same draw. The publisher is a foreground task, and GPUI
never runs a foreground task inside a draw. Each frame is therefore a copy of
what one completed draw left. If two draws finish before the publisher runs,
the first draw is not written.

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
| A reader that polls during writes parses only whole frames | `a_polling_reader_only_parses_whole_frames` |
| Rapid changes are written at most once in each period | `rapid_changes_write_at_most_once_per_period` |
| The header marks each control by role and id | `inspection markers name each control by its role and id, never its label` in `desktop/canvas-test.cjs` |
| The example frame above is the shape that the app writes | `the_documented_frame_is_the_shape_the_app_writes` in `contract/src/inspection.rs` |

The in-process tests draw a small script through the real `Marker` component
on the headless platform. They do not run the workspace script against Core.
A journey in the [native verification environment](../tests/native/README.md)
is the check of the real controls.
