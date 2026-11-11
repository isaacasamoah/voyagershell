# Vessel finding and local voice

This is an unmerged experiment on `experiment/vessel-finding-local-voice`. It starts from main as of 11 November 2026, the product README merge. Nothing here is accepted product behavior, and no native app journey has run yet.

Isaac's main complaint about the avatar is the delay between asking for an action and seeing it happen. Neither prototype may add a model tool call.

## Prototype 1: finding the right vessel

The avatar used to read a stored name such as "Terminal 1" while the screen showed the folder name, and several panels could share one name. It also had to work out "top right" from a tree of splits.

### What changed

- **One name.** The application observation numbers repeated on-screen names among siblings, for example "voyagershell" and "voyagershell 2". The header shows the same numbered name. A deliberate name stays authoritative on screen and only gains the number.
- **One address.** Every Vessel and Portal has `Voyage/Fleet/Vessel` or `Voyage/Portals/Portal`. Repeated Voyage and Fleet names are numbered the same way, and a final pass keeps every address unique across the workspace.
- **A position.** Each shown panel has a column counted from the left, a row counted from the top, its spans, the size of the grid and the corners it occupies. Every corner of a Fleet belongs to exactly one shown panel, so "top right" resolves to one Vessel.
- **No extra call.** Every `voyager_workspace` response now carries `panels`, taken from the same observation the screen uses.

### How it works

Source stays comment-free, so the mechanism is recorded here.

- `app/src/locate.rs` holds the pure logic. `distinct` numbers repeats in layout order. `positions` walks the visible split tree with integer arithmetic on the split shares, so two edges on the same line compare equal. `locate` builds names, addresses and positions for the whole layout.
- `app/src/observation.rs` calls `locate` on the whole layout before it narrows to the caller's focus. A Vessel therefore keeps the same name and address whether the avatar is docked to the workspace, its Fleet or the Vessel itself.
- A hidden panel, a panel covered by a maximized sibling and a Portal in a hidden column have no position.
- `app/src/administrator.rs` asks for the observation at the version the workspace just returned and stores its panels in the typed `Response.panels`. If that observation itself moved the layout, an inspection is repeated once inside the application so the model holds a current version. An effect is never repeated.
- When a response exceeds the 24 KiB tool bound the layout is dropped and `panels` is kept.
- Numbers follow layout order. Closing "voyagershell" turns "voyagershell 2" into "voyagershell".

### Evidence so far

Run on Linux on 11 November 2026, in this worktree.

- `cargo fmt --all --check` and `cargo clippy -p voyager-contract -p voyager-app --all-targets --locked -- -D warnings` pass.
- `cargo test -p voyager-contract -p voyager-app --locked` passes with `HC_SOCKET`, `HC_SESSION` and `HC_TERMINAL_ID` cleared, as the suite requires.
- `npm run format:check` and `npm run contract:check` pass. The Node tests for the validator, terminal, rename, Notes and canvas pass.
- Negative control: disabling the numbering failed the naming test, and treating a side-by-side split as stacked failed the position test. Both were restored.
- The tests were written after the code. The negative control stands in for a first failing run.

Not run:

- `npm test` as a whole and any build of the desktop crate. The type check builds the native exporter, which needs `zig`, and `zig` is not on this shell's path.
- Any native application journey. The desktop is reserved for another Vessel's task.
- Any check that a model picks the right Vessel from `panels`.

### Known gaps

- The Agents view and the focus path still use the earlier names.
- Fleets or Voyages that already share a name are numbered in addresses but not on their tabs.
- Creating or renaming something does not store the numbered name.
- Focus rules are unchanged. Docked to a Fleet, the avatar still sees only that Fleet.

## Prototype 2: local voice for Claude or Codex

Not started in source. The plan and the measurements behind it are in the session report of 11 November 2026.
