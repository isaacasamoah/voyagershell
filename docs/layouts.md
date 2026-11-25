# Home and saved Fleet arrangements

This guide explains Home, the Voyage that shows the workspace's running work,
and how a Fleet saves and loads named arrangements of its Vessels.

Home is one retained internal Voyage with one Fleet, kept outside the ordinary
Voyage list. It uses the same panel layout and content controls as any Fleet and
starts with an Agents Vessel. [Workspace](workspace.md) describes it. Opening it
does not start a program or change explicit avatar context.

A Fleet's layout menu saves its current split tree under a name and loads that
Fleet's saved trees. The workspace document retains the current placement and
content records, including placements omitted from the visible tree. Loading
checks each saved leaf against the current Fleet and current content records. It
does not replace current backend identities with saved copies. Missing or
repeated placements and missing content are refused before the owner saves a
change. Ended, unbound and unconfirmed backends remain as they are.

Loading, Home and navigation do not start unbound content. The owner reports
whether it created a workspace that did not exist before. A new workspace then
gets the default shell, and saved unbound data is not treated as a fresh start.
A deliberate creation action can create its own content. A start that was
refused can be retried with Refresh. An uncertain
start adopts the one terminal Core lists for its label, and is otherwise never
retried. The app does not restore processes, copy arbitrary content into Home or
manage separate floating windows.

A private administrator request keeps the focus captured when it was accepted.
Saving or loading a Fleet arrangement requires that the entire Fleet is in that
captured scope. Scoped snapshots expose saved arrangements only for complete
Fleets in the projection. Home changes the displayed view without changing that
scope, and chat remains available while Home is displayed.

When the private administrator successfully creates content, the workspace owner
keeps an in-memory list of those exact new content IDs after the document save.
The native view uses that list only for automatic preparation of currently visible
content. Home retains the eligibility without starting anything. A successful or
unconfirmed start uses it up. After a known refusal the content stays eligible
for Refresh. Inspecting, replaying a receipt, or reopening a workspace does not
mint
eligibility for older unbound content. This list is not an authority grant and
is not persisted as a process-recovery mechanism.
