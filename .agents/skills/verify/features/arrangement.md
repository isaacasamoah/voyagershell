# Arrangement

## Sub-features

A Vessel splits below or to the right, from its title buttons or from
Ctrl+Shift+E and Ctrl+Shift+O. Dragging a divider resizes one branch and saves
its share. A Vessel maximizes from its title button or Ctrl+Shift+Z, and
restores the same way, with every divider back where it was. Dragging a Vessel's
title onto another Vessel moves it beside that Vessel, and Escape, the Vessel
itself or a release outside every Vessel cancels the move. The arrangement
survives a relaunch, and a shell's grid has fewer rows or columns after its pane
or the window shrinks.

## How to get to it (user POV)

Open the isolated fixture app with the sidebar open. Split the first Vessel
below, then split the new Vessel right with the shortcut. Drag both dividers.
Maximize and restore. Drag a Vessel onto another, then cancel three drags.
Quit and open the app again, shrink the window, maximize and restore once
more the other way, and split below with the shortcut.

## Driving it with the maintained fixture

Follow the exact doctor and run commands in ../SKILL.md with
`--journey arrangement`. The Rust journey in
tests/native/src/journey/arrangement.rs owns the recipe. The split tree
belongs to app/src/panels.rs, the divider and its share tracker to
desktop/src/split.rs, and the title buttons, shortcuts and drag preview to
desktop/mods/header/main.ts and panel-view.ts.

V1 is the first Vessel, and the journey makes V2, V3 and V4.

- `split-below` splits V1 with its `split-bottom` button. The saved tree is V1
  above V2 at an even share, V2 is drawn below V1, V2's shell runs, and V1's
  `stty size` lost rows and kept its columns.
- `split-right-shortcut` clicks V2's terminal and presses Ctrl+Shift+O. The
  tree splits V2, not V1, V3 is drawn right of V2, and V2 and V3 each have
  fewer columns than the full-width V1 had.
- `resize-dividers` drags the stacked divider into V2 and the side-by-side
  divider left. Each divider follows the pointer while held and stays where it
  is released, and each drag changes only its own branch's saved share.
- `maximize-button` maximizes V3 by its button with keyboard focus in V1. Only
  V3 is drawn, over the area all three filled, and typing reaches V3.
- `restore-shortcut` (the control case) restores with Ctrl+Shift+Z. All three
  terminals return to where they were, and typing still reaches V3.
- `move-vessel` drags V3's title onto V1's left edge. The tree puts V3 left of
  V1, above V2, with the root share kept, and V3's shell is the same program.
- `move-cancelled` cancels three live drags: by Escape, by release over the
  dragged Vessel itself, and by release outside every Vessel. Nothing is
  saved, the sidebar stays open, and Escape never reaches the shell.
- `relaunch-keeps-arrangement` quits and launches. The document, its version,
  every terminal's bounds, Core and every shell are the same.
- `window-resize-fits-grid` shrinks the window. V1's `stty size` loses rows
  and columns.
- `maximize-shortcut-restore-button` maximizes V1 with Ctrl+Shift+Z and
  restores it with its button.
- `split-below-shortcut` splits V2 below with Ctrl+Shift+E.

## Negative control

tests/native/controls/arrangement.patch stops the split tracker from applying
a saved share. A candidate built with it must fail `restore-shortcut` on the
expectation `all three terminals are drawn where they were before maximize`,
because every divider returns to the middle.

## Gotchas

Drags use `Held::until`, which nudges the held pointer until the app draws the
expected state. Do not replace it with a fixed wait. Moving a dragged Vessel
over a neighbour and then back over itself leaves the neighbour's preview
drawn, and the journey does not judge that preview. Fleet and Voyage reorder
by drag stay with the trimmed Python `arrangement` journey. Tab to the
maximize button and a layout change during a held divider gesture are not
driven. No case compares pixels. Linux evidence does not establish another
platform.
