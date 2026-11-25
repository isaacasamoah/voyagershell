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

## Splits and shortcuts

Each Vessel's corner controls split it horizontally or vertically.
Ctrl+Shift+O and Ctrl+Shift+E split the last clicked Vessel in the selected
Fleet, and Ctrl+Shift+T creates a Fleet. The platform modifier may replace Ctrl.
A shortcut waits for the owner to confirm its result. It is discarded after a
refusal or an uncertain result. Terminal focus moves only when the previous
focus has not changed and the window is still active.

## How it is checked

The native `arrangement` journey drives maximize and restore by shortcut and by
the restore button, a cancelled Vessel move, a window resize and a split by
shortcut. [The verification guide](../tests/native/README.md) describes how to
run it.
