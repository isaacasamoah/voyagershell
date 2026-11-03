# Native Notes integration

The integration candidate uses one Notes package in Fleet Vessels and Voyage
Portals. Its seventeen-stage Linux native journey passes on the combined
workspace candidate. The earlier standalone Notes proving-size failure remains
recorded. Conditional integration still requires the unchanged combined-foundation
cap and does not accept the agent or live-authoring lifecycle work.

`contract/src/content.rs` owns the versioned Notes request, response and data types.
The existing generator exports their validators beside the workspace and
conversation contract. `app/src/content.rs` owns persisted data, revisions and
schema checks. `create-content` uses the existing split or Portal placement rule,
with an explicit type ID. The supported type IDs are `terminal` and `notes`.
Changing a placement does not change its content ID or data. A Notes placement
never enters terminal preparation or starts a Core process.

`desktop/src/notes.rs` installs a `voyager_content_view` component only in the
Header policy. Its native factory retains one view per content ID. Before opening
data, background work obtains a fresh workspace snapshot through the existing
Client and verifies that the requested content is Notes. The Rust owner then
registers that ID and issues an opaque binding. Requests cannot supply their own
binding or a filesystem path.

All Notes instances share one isolated QuickJS VM with the private `voyager_input`
registry. They cannot import the Header's Terminal, Name or workspace modules.
Each has its own captured `voyager_content` module, application generation,
controller and Watcher. The host retains the controller but embeds its public
`content()` view beneath the single window overlay root. The existing accessibility
activation and overlay invalidation route is retained. This follows the corrected
Notes provider. The integrated journey observes both instances through native
accessibility and also edits with accessibility disabled. The VM has an additional
fixed memory cost that has not been measured.

The private host accepts the request ID and expected revision beside the JSON.
It validates those small identity fields and reserves the existing request/byte
budget before copying a large request. Background work parses the admitted JSON
and compares its identity with that envelope before calling the bound owner.
Admission refusals retain a correlated rejected result. The limits remain eight
admitted requests per instance, four MiB of aggregate raw request bytes, one MiB
of Notes data and one MiB plus sixteen KiB for each request/result envelope.
These limits describe admitted raw payload, not total process memory. Data reads
stop after the data limit plus one byte, so an oversized file is refused without
reading the complete file into memory.

The view's save behavior is preserved. Known rejection leaves a usable draft and
permits a deliberate unchanged retry after its cause clears. Missing, malformed,
mismatched or uncertain confirmation marks that generation unconfirmed and does
not submit it again on another unchanged blur. Title/body values stay local until
the owner confirms an update. Schema warnings and last-good data remain visible.

Packages are seeded once into the selected profile. Personal JavaScript is not
overwritten. The retained Notes JavaScript is outside the current strict
TypeScript composition gate. Its actual private declarations are available through
`cargo run --locked -p voyager-desktop --bin export-script-types -- --notes`.
The Header's broader registry is not a substitute for those declarations.
The emitted JavaScript and live customization path remain available.

The real native journey covers save/reopen, stale and forged refusal, delayed
hydration, uncertain confirmation without replay, body resizing and independent
draft/focus retention. Switching Fleets retains the same Portal and data. Native
input still reaches the original Core terminal afterward. The sibling pixel checks
cover its measured title, body and status area, not the whole Portal header or
desktop. Earlier failed fixture attempts remain recorded separately.

Actual agent data updates, live refresh after an agent write, remove/restore,
strict Notes authoring, complete generation/lifecycle and aggregate proof-size
acceptance remain separate work. These native checks establish no performance
gain, another platform or complete avatar/voice parity.

Source basis is the retained Voyager Notes provider, GPUI Shell at
[the pinned GPUI Shell source](https://github.com/longbridge/gpui-kit/tree/944803984cf0ba3111861d6e1aa9d6265c109ff9),
and Herdr App at
[the pinned Herdr App source](https://github.com/herdrdev/herdr-app/tree/1581a587919dddd6f1efd5f78eb542c4b2b02cb5).
The integration uses supported isolated runtimes, host components and retained
views. It adds no browser engine or second Core connection.
