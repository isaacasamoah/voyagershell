# Portals

## Sub-features

A Portal is a terminal placed across a Voyage in a column beside its Fleets.
Show Portals opens the column, and an empty column offers the content chooser.
The avatar docks to a Portal, and a Portal can be renamed. A Portal stays shown
on every Fleet of its Voyage and is absent from other Voyages. Go there returns
to it. Ctrl+Alt+P hides the column, and the avatar then waits small beside the
Portal toggle. Closing a Portal keeps its program running, and Hidden Portals
reopens it. A relaunch draws it again with the avatar docked on it.

## How to get to it (user POV)

Open the isolated fixture app with the sidebar open and a window of at least
1800 by 1000. Show Portals and choose a terminal. Drag the avatar onto the
Portal's title, then rename the Portal. Make a second Fleet and switch between
the Fleets. Make a second Voyage, then press Go there. Hide and show the column,
close the Portal, reopen it from Hidden Portals, then quit and open the app
again.

## Driving it with the maintained fixture

Follow the exact doctor and run commands in ../SKILL.md with
`--journey portals`. The Rust journey in tests/native/src/journey/portals.rs
owns the recipe. Portal placement and its column belong to
app/src/workspace.rs and app/src/panels.rs, and the toggle, the chooser and the
Hidden Portals list to desktop/mods/header/main.ts, panels.ts and
panel-view.ts.

- `open-portal` creates a terminal Portal through `toggle-portals` and the
  chooser. Only the new placement is added, it belongs to the Voyage, the
  Fleet is unchanged, and the column shows only it.
- `dock-portal` drags the avatar onto the Portal's title. The saved context and
  the drawn dock are the Portal, and the 94-pixel avatar sits on it.
- `rename-portal` renames the Portal by double-click. A click on its terminal
  saves the name and gives that terminal the keyboard.
- `portal-across-fleets` (the control case) makes a second Fleet with
  Ctrl+Shift+T and switches Fleets three times. The column stays shown, the
  Portal and the dock stay, and its shell is the same program.
- `portal-stays-in-its-voyage` makes a second Voyage. The Portal and its
  column are not drawn there, the context stays the Portal, and Go there
  returns to it with the avatar docked.
- `hide-portals` presses Ctrl+Alt+P in the first Vessel's terminal. The column
  hides, and the avatar is 38 pixels wide beside the toggle.
- `show-portals` shows the same Portal again, with no chooser.
- `close-portal` closes the Portal. It stays in its Voyage with the same
  content and backend, and the column hides.
- `reopen-portal` dismisses the chooser with Escape, then reopens the Portal
  from Hidden Portals. Core still holds its earlier output.
- `relaunch-restores-portal` quits and launches. The document, its version,
  the column, the dock, Core and both shells are the same.

## Negative control

tests/native/controls/portals.patch hides the Portal column whenever a Fleet
is selected. A candidate built with it must fail `portal-across-fleets` on the
expectation `the Portal column stays shown on every Fleet`.

## Gotchas

Aims dodge the Portal column, because it overlays the right of the Fleet. The
make-room presentation, splits inside the column and Portal maximize are not
driven. No case compares pixels. The Python `portal-terminal` journey keeps
its checks that are not about Portals: a Fleet created in a missing folder, a
shell's exit code, and a live edit of the header script. Linux evidence does
not establish another platform.
