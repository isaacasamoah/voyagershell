# Direct workspace arrangement

The workspace owner handles typed Vessel moves and Voyage and Fleet reorders. A Vessel move resolves both placements within the same Fleet and changes its split tree while retaining the placement, content and Core terminal identities. A Fleet reorder resolves both Fleets within one Voyage. A Voyage reorder moves an existing Voyage. Invalid identities are refused before an owner write. Selection and explicit avatar context are independent of ordering.

A drag begins in the visible native workspace. It retains the current workspace revision and selected Voyage and Fleet. Movement highlights the source and destination, with a preview of the proposed side. Release sends the typed operation only while the destination, selected context and revision still match. Escape, release outside the destination and a changed snapshot cancel the gesture. The native capture component uses the existing window and current JavaScript callback; it does not own the layout or start a process.

Vessel corner controls expose horizontal and vertical splits. Ctrl+Shift+O and Ctrl+Shift+E split the last clicked Vessel in the selected Fleet; Ctrl+Shift+T creates a Fleet. The platform modifier may replace Ctrl. Unsent shortcut intents wait for a confirmed owner result and are discarded after refusal or uncertainty. Terminal focus moves only when the previous focus has not changed and the window remains active.

The integration source retains the existing native terminal and private-conversation owners. The current combined native drag, reordering, keyboard and focus journey and its proof-size review remain pending. The earlier separately tested providers do not establish this combined behavior.
