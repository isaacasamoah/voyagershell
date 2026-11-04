# Voyager workspace composition

`main.ts` controls the native workspace view, retained content preparation and
versioned action dispatch. `main.js` is its emitted profile entry. Keep the
existing Terminal, Notes, divider, avatar and conversation identities when
changing presentation. Rust owns placement, content, context and persistence.

`panel-view.ts` renders one Terminal or Notes panel and its common controls.
`navigation-view.ts` renders the sidebar, Fleet tabs and bottom context.
`panels.ts` selects the current groups and visible members from the owner's
projection. It does not own another layout or repeat Rust placement policy.
`canvas.ts` composes the saved outer regions and shared panel frames. The
controller binds each group's split tree to the native divider. `creation.ts`
retains the content menu's captured destination and workspace version.

## Panel interaction

Humans arrange panels through edge/corner gestures, keyboard shortcuts and
context menus. A split selects its owner, anchor and direction before opening
the available content menu. Only choosing a type dispatches `create-content`;
cancelling creates nothing. Keep one visible plus for Voyage creation. There is
no separate Vessel plus or human Workspace layout JSON editor. Authorized
agents use the generated typed JSON actions through the same Rust owner.

Vessels and Portals share split, resize, move, rename, maximize/restore,
hide/show, remove-entry and saved-arrangement controls. Hide retains the leaf;
remove-entry retains the placement, content and backend. Go there reveals that
same placement in its original owner. Stop, package removal and Quit remain
separate operations. Never resubmit an uncertain effect automatically.

Home uses the same retained panel layout and content controls. The Rust owner
keeps its internal Voyage/Fleet and Portal column outside the ordinary Voyage
list. Entering Home preserves the selected ordinary Voyage/Fleet and explicit
dock context. Its empty arrangement waits for a deliberate content choice.
Do not restore the former special overview or add a status/usage dashboard here.

## Portal column and dock context

Portals occupy the right column beside the full-height Fleet canvas. The native
`Column` in `desktop/src/split.rs` resizes its pixel width. `PortalArea.new(id, {})`
from `voyager_avatar` occludes and measures the actual column, including empty
space. Use it for both overlay and make-room presentation. Overlay covers the
underlying canvas; make-room gives the column ordinary flow space. Rust persists
visibility, mode and width per Voyage, including Home's own column. Do not infer
these preferences from the global legacy canvas fields or add another store.

Individual Portal targets remain separate from the opaque column. Avatar hit
testing, landing and fallback visibility use measured native geometry.
`dock_target_visible` supplies the footer's visibility decision. Keep explicit
dock context separate from keyboard focus and sidebar collapse. Overwatch is the
human name for the whole-workspace context; the protocol kind remains workspace.

Use `Occluding.new()` from `voyager_native` for other overlays such as compact
Chat. It accepts children and styles without owning durable state. It does not
accept `.id()`, even after style calls. Keep the same Chat state in expanded and
compact placement; do not mute terminals to prevent overlay click-through.

The bottom region shows the dock scope's configured starting folder and Git
branch. It does not follow a shell's later `cd`. Unavailable or multiple folders
remain explicit. `CONTEXT_REFRESH_MS` controls the background metadata refresh;
it performs no Core terminal polling.

## Authoring and compatibility

Run `npm run scripts:generate` and `npm test` after repository TypeScript or
native registration changes. Declarations come from the actual registrations.
Personal profile JavaScript remains live-editable. Source is seeded once and is
not silently replaced by a repository update. Keep personal edits and instance
data during an explicit compatible update. Source reload retains the last usable
package on error and grants no Header, process or private-conversation authority
to a content package.

The current Header declares numeric `contentConfiguration: 1` in mod.json.
Together with the matching Notes declaration, this enables Notes configuration
discovery and actions. Preserve optional Content.configuration when validating
or composing the workspace. Rust owns validation and writes. An older strict
Header may reject newer saved data; preserve both and explicitly update or
restore compatible source.

These instructions describe the current source. They do not accept the complete
native UX revision, its appearance, input behavior or performance.
