# Home and saved Fleet arrangements

Home is an editable native overview in `mods/header/home.js` in the selected
profile. Its package instructions are beside it. It receives the current typed
workspace snapshot and can navigate to existing Voyages and Fleets. Home is a
view of the workspace, not another content placement. Opening or editing it
does not start a program or change explicit avatar context.

A Fleet's layout menu saves its current split tree under a name and loads that
Fleet's saved trees. The workspace document retains the current placement and
content records, including placements omitted from the visible tree. Loading
checks each saved leaf against the current Fleet and current content records;
it does not replace current backend identities with saved copies. Missing or
repeated placements and missing content are refused before the owner saves a
change. Ended, unbound and unconfirmed backends remain as they are.

Loading, Home and navigation do not start unbound content. The owner reports
whether it created an initially absent workspace, allowing the default shell
for a new workspace without treating persisted unbound data as a fresh start.
A deliberate creation action can create its own content; a known refused start
may be retried by the existing explicit Refresh interaction. An uncertain
start is never retried automatically. These boundaries do not implement process
restoration, arbitrary Home content duplication or the separate floating-window
lifecycle.

A private administrator request keeps the focus captured when it was accepted.
Saving or loading a Fleet arrangement requires that the entire Fleet is in that
captured scope. Scoped snapshots expose saved arrangements only for complete
Fleets in the projection. Home changes the displayed view without changing that
scope, and chat remains available while Home is displayed.

When the private administrator successfully creates content, the workspace owner
keeps an in-memory list of those exact new content IDs after the document save.
The native view uses that list only for automatic preparation of currently visible
content. Home retains the eligibility without starting anything. A successful or
unconfirmed start consumes it; a known refusal remains eligible for explicit
Refresh. Inspecting, replaying a receipt, or reopening a workspace does not mint
eligibility for older unbound content. This list is not an authority grant and
is not persisted as a process-recovery mechanism.
