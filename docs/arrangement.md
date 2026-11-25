# Direct workspace arrangement

This guide explains how a person rearranges the workspace directly. They can
drag a Vessel to a new place in its Fleet, reorder Fleets and Voyages, and split
a Vessel with a corner control or a shortcut.

## Moves and reorders

The workspace owner handles typed Vessel moves and Voyage and Fleet reorders. A
Vessel move resolves both placements within the same Fleet and changes its split
tree. The placement, content and Core terminal identities stay the same. A Fleet
reorder resolves both Fleets within one Voyage. A Voyage reorder moves an
existing Voyage. The owner refuses an invalid identity before it writes
anything. Ordering does not change the selection or the avatar's context.

## Dragging

A drag begins in the visible native workspace. It keeps the current workspace
revision and the selected Voyage and Fleet. While the pointer moves, the source
and destination are highlighted, with a preview of the side the Vessel would
take. Release sends the typed operation only while the destination, the selected
context and the revision still match. Escape, a release outside the destination
and a changed snapshot cancel the gesture. The native capture component uses the
existing window and the current JavaScript callback. It does not own the layout
or start a process.

## Splits, maximize and shortcuts

Hover over a Vessel to show the controls at the top right of its title bar. The
first two split the Vessel, side by side or above and below. The third maximizes
the Vessel in its Fleet, or restores it. Maximize is available when the Fleet
shows more than one Vessel. The last closes the view, and its process keeps
running. The Vessel's menu offers the same choices, and Rename. A split opens
the creation menu, where the person chooses what fills the new space.

The keyboard gives the same actions:

- Ctrl+Shift+O splits the focused Vessel side by side, and Ctrl+Shift+E splits
  it above and below. The focused Vessel is the one last clicked. Without one,
  the shortcut splits the first Vessel in the selected Fleet.
- Ctrl+Shift+T opens the creation menu for a new Fleet.
- Ctrl+Shift+Z maximizes or restores the focused Vessel.

The platform modifier may replace Ctrl. With the platform modifier, maximize is
Shift+Enter instead of Shift+Z. A split or new-Fleet shortcut pressed while
another workspace request is pending waits for the owner to confirm that
request. It is discarded after a refusal or an uncertain result. The maximize
shortcut isn't queued. While a request is pending it is refused, and the status
line says that maximize was not changed. Terminal focus moves only when the
previous focus has not changed and the window is still active.

## How it is checked

The native `arrangement` journey splits Vessels with the controls and the
shortcuts, and resizes the dividers. It maximizes and restores by button and by
shortcut. It moves a Vessel, cancels a move, relaunches the app to check that
the arrangement is kept, and resizes the window. [The verification
guide](../tests/native/README.md) describes how to run it.
