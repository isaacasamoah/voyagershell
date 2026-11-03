# Voyager workspace composition

`main.js` is the native workspace view. Its region factories render the sidebar,
Fleet tabs, active Fleet or Home, Voyage Portals and bottom context. `canvas.js`
arranges these regions from the Rust-owned workspace definition. A Fleet's Vessel
split tree is separate from this outer arrangement. Keep the existing native
Terminal, Notes, divider and avatar identities when changing presentation.
Use `Occluding.new()` from `voyager_native` for a real overlay that must receive
input above other content. It accepts ordinary children and styles without owning
geometry or durable state. Do not replace it with a plain div or mute terminals.
It does not accept `.id()`, even if the pinned Shell's editor hints offer it.
The layout editor, overlay Portals and compact Chat already use this container.

Use Workspace layout to edit the outer JSON definition. Apply uses the revision
captured when opening the editor. Invalid definitions and stale edits retain the
draft and show the owner's result. Reload explicitly replaces the draft with the
current definition. Unconfirmed effects are never submitted again automatically.

Overlay Portals occupy the first or last edge of their parent row or column.
Make-room Portals take ordinary flow space. This does not add reveal, hide or
pin behavior. Collapsing the sidebar retains a rail and does not change the
avatar's explicit dock context. Keep the primary speech/chat control row and
Chat panel immediately beneath the Brand/avatar dock, ahead of Home and Voyages.
Compact placement reuses the same Chat state.

The bottom region shows the dock scope's configured starting folder and the Git
branch read there. It does not follow a shell's later `cd`. Unavailable or multiple
folders remain explicit. The background refresh interval is the named
`CONTEXT_REFRESH_MS` value in `main.js`; it performs no Core terminal polling.

The repository authors these files in TypeScript, using declarations from the
actual native registrations. Run `npm run scripts:generate` and `npm test` after
repository edits. Personal profile JavaScript remains live-editable. Source
reload retains the last usable package on error and does not grant content
packages Header, process or private conversation authority.

The current Header declares numeric `contentConfiguration: 1` in mod.json.
Together with the matching Notes declaration, this enables Notes configuration
discovery and actions. Preserve the optional Content.configuration object when
validating or composing the workspace. Rust owns its validation and writes.
Personal source is not silently updated. An older strict Header may reject a
workspace containing saved configuration; keep source and data and explicitly
update or restore the compatible Header.

## Home

`home.js` composes the native Home overview from the current workspace snapshot.
Edit this file to change its arrangement or presentation. `navigate` accepts the
workspace's generated selection actions. Selecting a Voyage or Fleet changes the
view; it does not change the avatar's explicit context or start another program.
The application keeps the last usable package when a live edit fails.

Fleet saved layouts are separate workspace data. They retain placement and
content identities and do not change this source composition.
