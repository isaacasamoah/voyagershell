# VoyagerShell

VoyagerShell is a configurable workspace for people and agents, built on Herdr Core. This is the canonical standalone repository for the current prototype. Electron presents the workspace; Herdr Core owns its terminal processes and screens. Native renderer parity and collaboration remain experiments.

The 1 November UX candidate removes duplicate conversation controls, decorative dock buttons, layout/package toolbar buttons and the sidebar footer. One text control stays with the sidebar, or moves to the top bar when the sidebar is collapsed. Speech stays with the full-size avatar or its compact control location. The existing avatar animation and sound implementation is retained.

The selected vocabulary is Voyage for a space, Fleet for a tab, Vessel for content inside a Fleet, and Portal for content attached across a Voyage. The current implementation still uses the older `realm`, `dimension` and `portal` storage and API names. Voyage-wide Portals and the new typed public contract are not implemented by this UX change.

New Vessel and Split open a compact picker beside the control. It follows the live content catalogue, supports keyboard choice and cancellation, and dismisses when the user changes workspace context or clicks into embedded content. Each opening captures its destination. A stale choice cannot create in a different Fleet.

## Run and interact

Use Node 24, Rust, a Linux desktop and `hc` 0.1.16 on PATH. Chat and voice additionally need a configured Codex installation. Install dependencies and launch from this directory:

```sh
npm ci
npm start
```

Use `VOYAGER_WORKSPACE_SESSION=voyager-another-name` for an isolated Core session. `VOYAGER_WORKSPACE_CWD` selects its initial folder. `VOYAGER_HC` and `VOYAGER_CODEX_BIN` select executable paths. Starting the same profile again restores its viewer; it does not submit a new agent task.

Use a Vessel's local corner split control, Ctrl+Shift+O/E, or the creation control in an empty Fleet to choose terminal, native agent CLI or editable content. Use the dividers to arrange it. Double-click a Voyage, Fleet or Vessel name to rename it in place, or focus its navigation item/header and press F2. Enter or blur saves; Escape cancels. Drag navigation items to reorder, or use Alt+Shift+Up/Down for Voyages and Alt+Shift+Left/Right for Fleets. Drag a Vessel header onto another header or Fleet. Hover another Voyage during the drag to reveal its Fleet destinations. Space picks up a focused Vessel header; Enter or Space places it on a Fleet. Movement preserves content identity, data and backend address. Activity presentation remains pending.

Drag Voyager to a Voyage, Fleet, Vessel header or Home to change its context. For keyboard docking, focus the existing navigation item, Vessel header or Home and press Shift+Enter. Ctrl+J opens or closes text chat. Ctrl+B toggles the sidebar. Speech and text requests use the same avatar focus, while retaining the user's authority.

Closing the viewer leaves the Core session running and floats the desktop avatar. The standard application **Quit** action requests a stop for this dedicated session before exiting. A failed spawn can exit without a stop request. An unconfirmed startup or stop stays visibly unresolved and does not retry the effect. Stopped agent programs are not automatically resumed.

## Editable content

The existing package format uses these legacy paths and names:

```text
portals/
  packages/<type>/portal.json
  packages/<type>/view.html
  packages/<type>/...assets or backend files
  data/<instance-id>.json
  layouts/<dimension-id>-<name>.json
  .uninstalled/<type>/
```

The content folder is inside the selected session's Electron userData directory. The current UX removes the package/layout toolbar; this slice does not introduce a replacement menu. Existing named agent operations and file editing remain available.

A web package needs a manifest and HTML entry:

```json
{
  "id": "project-notes",
  "name": "Project notes",
  "renderer": "web",
  "entry": "view.html",
  "seed": { "text": "" },
  "contract": { "text": "The user's editable note" }
}
```

Put the folder under `packages/` while the app runs. It appears in the content catalog. HTML, JavaScript and CSS edits reload applicable views. Invalid manifests retain the previous package. A view reload does not restart its backend process.

The host injects Voyager styling and this browser interface:

```js
const snapshot = await portal.read();
await portal.write({ text: "A new note" }, snapshot.version);
portal.onChange(() => refresh());
```

The version prevents a stale host write from overwriting newer host data. It is not a transaction against arbitrary external file writers. Invalid JSON reports an error and retains the last valid data when available.

Terminal packages use `renderer: "terminal"` and `argv`. Web packages may also specify a Core-owned backend command. `{package}` and `{data}` expand to its folder and data file. Opening a new instance or explicitly starting its backend launches the command. Restoring a layout does not restart an ended process. Hiding content or uninstalling its package does not stop that backend.

The avatar's `voyager_portal` tool reads and updates content within its current focus. Source editing and package uninstall/restore require whole-workspace focus because they affect multiple instances. Uninstall moves the package into `.uninstalled/` while preserving its data, placement and backend. Restore makes those same instances available again.

These capabilities support cooperating browser content and terminal programs. Running a native GUI process does not automatically make its window embeddable or its meaning readable by an agent. Rich examples, explicit agent action contracts and voyage-wide placement are the next design work.

## Evidence and limits

The maintained fixture is `prove.py`, extended by focused journey modules. Run `npm test` and `npm run format:check` here. `prove.py --ux` checks the quiet interface, keyboard/drag docking, control placement, stable terminal identity and Electron Quit in an isolated running candidate. It compares removed controls with the preserved preview through its local debugging endpoint.

The Linux journeys passed on 1 November using Electron 44.10.0 and real Herdr Core. The organisation journey completed in stages within the same corrected instance after browser-driver setup errors; its run-history receipt retains those errors and the explicit drag cancellation used to clear a stuck driver gesture. It verified rename variants, pointer/keyboard placement, live backend and note identity, pinned avatar focus after a renderer reload, and a real stale-document save refusal. The maintained suite now has 16 passing tests. Quit was driven through Electron's `Browser.close` debugging command. OS menu and desktop keyboard activation remain unproved. Startup/uncertain-stop failure scenarios have an isolated boundary test; they are not native failure trials. This establishes neither macOS nor Windows behavior.

Independent review found no remaining Required source issue in this quiet-interface increment. The known quiet-interface proving inventory fits its scoped size rule. The inherited prototype's aggregate acceptance gate remains open. No active demo was replaced, no main-branch integration occurred and no production release is claimed.

The picker journey passed in an isolated Electron/Core session after an owner-approved additional iframe-dismissal correction. Independent review verified focus remained in the embedded Notes field and a missing-close negative control reproduced the defect. The final journey also exercised live type changes, stale controls, a single terminal creation and an actual stale-save rejection without replay. The earlier failed attempts remain recorded. The known scoped picker inventory fits, while the inherited aggregate gate remains open.

## Direct-controls candidate

The next candidate removes the fixed New Vessel/split toolbar and visible Move chooser. Drag a Vessel header to preview the exact destination half, then release to place it. Split choices appear near the upper-right header corner or with keyboard focus. Ctrl+Shift+O/E opens a side-by-side/top-bottom split picker and Ctrl+Shift+T opens a Fleet. Empty Fleets retain local creation. Alt+Shift+H/J/K/L rearranges beside a directional neighbour. Space on a focused header picks up a Vessel; Enter or Space on a Fleet places it, including another Voyage. Escape cancels.

The native journey passed in stages in one corrected owned instance. It verified normal docking before failure tests, terminal text selection, web editing, cancelled/self-drop cleanup, both placement directions, retained process/data identity, empty-Fleet creation and keyboard movement. A real catalogue watcher update cancelled an active drag without a late move. A final deliberate stale-save rejection remained gated without replay. The earlier closed trial may explain the owner's docking report, but its timing was not matched, so that cause is unconfirmed.

Independent source review has no remaining Required issue. Acceptance remains blocked by the written size rule: 2,879 normally formatted proof/bookkeeping lines exceed 2,781 mapped production lines by 98. Failed diagnostics and retired helpers remain counted. The inherited aggregate gate and physical OS keyboard/menu evidence are also open. This is a draft checkpoint, not accepted completion, a merge or a release. All disposable candidates were explicitly quit; the preserved demo remains unchanged.

## Consolidated proof checkpoint

Isaac approved consolidating the verification after the tagged direct-controls prototype. Runtime source is unchanged. The maintained picker and direct-controls journeys now share recording, process snapshots, settlement and picker opening. Cross-Voyage keyboard carry, moved-source stale choices and actual watcher cancellation are maintained checks rather than separate successful review scripts. Historical resume-only branches belong to the earlier tagged fixture.

The corrected full journey passed uninterrupted on an isolated Xvfb/X11 desktop with real Electron and Herdr Core. It asserted zero late move dispatches after watcher cancellation, preserved process/data identity, and ended with one actual stale-save rejection. The first full run is retained because its initial watcher assertion could miss an asynchronous move. The corrected second run and independent geometry mutation completed without a remaining Required issue. Eighteen unchanged boundary tests and formatting passed.

The fresh scoped inventory is 2,425 normally formatted proof/bookkeeping lines against 2,781 mapped production-function/dispatch lines. It includes the retained first-run module, shared Quit helper, setup/cleanup, mutation, audit code and embedded programs. The older 2,879/2,781 result remains historical evidence, not a rewritten passing result. This scoped check does not close inherited aggregate acceptance or establish GNOME compositor behavior, physical OS keyboard/menu operation, audible voice, macOS or Windows. Both owner previews remain on their separate immutable source tags.

Use the candidate's prove.py with --launch --picker --direct-controls and a dedicated --session, --port and --evidence directory. A new launch requires a fresh evidence directory. Later --quit uses that same directory and verified owned candidate. Do not run these destructive test journeys against an owner's session.

## Standalone repository

This repository extracts core-workspace history from voyagershellapp. Source tags named source/voyagershellapp-* identify historical extracted trees before standalone path adaptation; their original runnable releases remain in [voyagershellapp releases](https://github.com/isaacasamoah/voyagershellapp/releases). The original web application is preserved in [voyagershell-legacy](https://github.com/isaacasamoah/voyagershell-legacy).

The initial main baseline has the latest tagged demo's runtime UI plus the consolidated proving fixture. Contract, binding and typed-content work stays on separate branches. The two typed-content review findings are not accepted or hidden by this repository move. No running demo or installed service is migrated automatically.

The standalone checkout owns its avatar controller, tests and artwork. It does not load source from a neighbouring checkout. Its default starting folder is this repository. Existing profile/session naming remains unchanged. Dedicated session names must begin with voyager- and contain only lowercase letters, digits and hyphens.

Before a native test interacts or issues Quit, the maintained fixture checks the CDP browser PID against its recorded launch, then verifies Linux process start identity, user, working directory, command, session and exact application page. A mismatched connection is refused before input or Browser.close. This Linux proving check is not a new production recovery system or another platform's evidence.

## Typed content foundation, draft


This first foundation increment gives ordinary content reads and all host-managed content writes one versioned contract. The small [Rust crate](contract/README.md) owns the wire types. Its locked exporter produces TypeScript declarations and standalone runtime validators. A typed application module checks caller scope, package state schema and revision before using the existing file writer. Electron remains the transport and viewer. Herdr Core remains the only process owner.

The operations are content.describe, content.inspect and content.update. Requests contain version, requestId and contentId. Updates also contain data and expectedRevision. Caller authority and the frame's bound identity come from the application rather than request fields. Responses retain request/content identity. Rejected writes and uncertain outcomes also retain the attempted revision. The client verifies serialized replies and their identity. It does not retry an unconfirmed operation. Request IDs provide correlation, not durable duplicate suppression or safe replay.

The existing avatar tool voyager_portal exposes describe for agents. Its update action calls the same typed write owner as embedded content. Source editing, uninstall/restore, workspace-enriched inspect and placement still use their explicit existing adapters. This is one migrated path, not a fully typed replacement of the application or a native renderer.

Fresh Notes packages declare stateSchema for title and text. Agents can inspect that schema before editing. A schema-less installed package remains usable and is described as schema-less. Adding a compatible stateSchema through an ordinary live manifest edit opts it in without changing its ID, data or view source. Updating defaults never overwrites user packages. The existing contract field is descriptive guidance, not validation. A schema is not an executable sandbox.

The write owner rejects a stale revision observed before replacement and leaves the file unchanged. Atomic replacement does not make its preceding hash check transactional against arbitrary external editors. External file editing remains supported. A failed readback after an actual replacement reports uncertainty rather than claiming the write failed. Invalid data may expose a previous valid snapshot with a warning. Notes avoids resetting an edit when a delayed refresh contains the same revision it has already saved.

Run npm test, npm run typecheck and npm run format:check. The build checks declaration drift before emitting ignored runtime bundles. Run npm run contract:generate after an intentional Rust wire change and review the declaration diff. Generated bundles and third-party code do not enlarge the authored production budget.

For the native Notes journey, build once, then run prove.py with --launch --content and a dedicated session, port and fresh evidence directory. It creates Notes through the picker, edits its actual field, injects a stale expected revision into one save, checks the visible rejection and unchanged file, then edits the same instance successfully. This uses an actual Electron/Core instance; injected rejection is a deterministic fault, not a concurrent human editing trial. Quit that dedicated candidate through the same fixture afterward. The preserved owner previews are separate and must not be used for destructive proving.

The isolated X11 journey passed on 1 November. The first failed attempt had runner frame-wait ordering and cleanup-expression errors. The second caught a late same-revision refresh overwriting the next edit; the corrected third completed. Those failures remain evidence. Independent review found two Required issues that remain open: named state schemas can collide after a rescan, and ordinary agent inspect bypasses the typed reader and omits schema warnings. The corrective pass and final capability inventory are pending. The Notes journey above was observed in the original worktree before standalone extraction; it is not new native acceptance of this branch. No merge, owner-preview replacement, GPUI parity, audible voice or cross-platform result is claimed.

## Learning from Herdr

Herdr Core is an external Apache-2.0 runtime. Voyager's own code retains its MIT license. We learn from the [Core guidance](https://github.com/herdrdev/herdr-core/blob/7a54c2975225a859b7e7d67302df5efc249fb9d0/AGENTS.md), [App guidance](https://github.com/herdrdev/herdr-app/blob/1581a587919dddd6f1efd5f78eb542c4b2b02cb5/AGENTS.md) and [agent-facing app guide](https://github.com/herdrdev/herdr-app/blob/1581a587919dddd6f1efd5f78eb542c4b2b02cb5/defaults/AGENTS.md). These references explain the runtime/application boundary, small application core, extensible interface and release/compatibility practices. Their current development revisions are design references, not proof of the installed runtime's exact source. The local migration journey used hc 0.1.16.
