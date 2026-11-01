# Voyager Shell

VoyagerShell is a workspace for people and coding agents, built on Herdr Core.
Electron provides the workspace, a floating astronaut and text and voice chat.
Herdr Core runs the terminal programs. Voyager brings their views, editable
content and conversation together.

We build small, real experiments, try them ourselves, and share the results here.

## Vision

Let's go together. We're building VoyagerShell for agent-to-agent,
agent-to-human and human-to-human collaboration alongside a strong solo dev flow.

We want a workspace people can shape with their agents. A panel might hold a
terminal, a live code diff, a walkthrough, a whiteboard or a view someone else
has made. People and agents should be able to inspect that content, act on it
and change how it works while the app is running.

The longer-term direction is shared context and knowledge graphs that connect
what a team learns, decides and builds. Messaging and voice would keep people
and agents in conversation, with decisions available to the work they affect.
These collaboration features are research, not part of the current build.

## Current build

This is a working Linux prototype. Voyages group related work. Each Voyage has
Fleets as tabs, and each Fleet contains Vessels arranged in flexible splits.
A Vessel can show a terminal program or editable web content.

- Choose a terminal, Codex, Claude or installed content type from the local split
  picker. Native agent types use their installed command-line tools.
- Drag a Vessel header to preview where it will go, then release to place it.
  Move it within a Fleet or into another Fleet or Voyage without replacing its
  process or data. Drag dividers to resize the views.
- Double-click a Voyage, Fleet or Vessel name to rename it. Drag navigation items
  to reorder them. Keyboard controls cover creation, movement and docking too.
- Dock Voyager on Home, a Voyage, a Fleet or a Vessel to select its context.
  Text and voice use that same focus. The interface shows where Voyager is docked.
- Ask Voyager to save or load a Fleet layout, or change the Home overview.
  Restoring a layout does not restart an ended agent program.
- Close or minimise the workspace to leave its processes running and the avatar
  floating on the desktop. Explicit application **Quit** stops its dedicated
  Core session. Stopped agents are not automatically resumed. An uncertain start
  or stop remains unresolved, without an automatic retry.

Electron is the working renderer. A native GPUI renderer remains an experiment;
we have not established equivalent UX or better performance as load increases.
The [typed-content foundation](https://github.com/isaacasamoah/voyagershell/stack/6)
is a separate, unfinished draft. The current build does not enforce delegated
agent ranks or guarantee native same-turn steering.

## Talk to Voyager

Click the text control or press Ctrl+J to open the conversation beneath the
avatar's home position. Press the soundwave to use voice. Voyager can inspect
the selected workspace context, arrange Vessels, read process output, send input
and edit cooperating content through named application tools.

Docking changes the context and permitted targets for those tools. Home selects
the whole workspace; a Voyage, Fleet or Vessel narrows it. The conversation can
remember earlier exchanges, while each new request uses the current focus.
Your authority stays the same when the avatar moves.

The private Codex conversation is separate from agents running in Vessels.
Receiving input is not proof that an agent completed a task. Use process output
and content state to verify the result. Voyager does not automatically resubmit
uncertain work.

## Vessels and Portals

A Vessel places content within a Fleet. A Portal will place content across a
Voyage, staying available when you switch Fleets. Voyage-wide placement is part
of the proposed design, not implemented yet.

The current package format already supports live edits and reversible removal.
It still uses the older `realm`, `dimension` and `portal` names in storage and
APIs. Its web views can read and update their instance data. The companion can
inspect that data and its declared contract within the avatar's focus.

Source edits affect every instance of a package, so they require Home focus.
Uninstall moves a package aside while keeping its data, placement and backend.
Restore makes the same instances available again. Hiding a view or removing its
package does not stop its backend process.

<details>
<summary>Create a content package</summary>

Packages live under `portals/` in the selected session's Electron userData folder:

```text
portals/
  packages/<type>/portal.json
  packages/<type>/view.html
  data/<instance-id>.json
  layouts/<dimension-id>-<name>.json
  .uninstalled/<type>/
```

A web package needs a manifest and an HTML entry:

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

Add its folder under `packages/` while the app runs. It appears in the content
picker. HTML, JavaScript and CSS edits reload applicable views. Invalid manifests
retain the prior valid package when available. Reloading a view leaves its
backend running.

The host supplies Voyager styling and a browser interface:

```js
const snapshot = await portal.read();
await portal.write({ text: "A new note" }, snapshot.version);
portal.onChange(() => refresh());
```

The version check rejects stale host writes. It is not a transaction against
other programs editing the data file. Invalid JSON reports an error and keeps
the prior valid data when available.

Terminal packages use `renderer: "terminal"` and `argv`. Web packages can also
name a Core-owned backend command. `{package}` and `{data}` expand to the package
folder and instance data file. Creating an instance or explicitly starting its
backend launches that command.

These packages support terminal programs and cooperating web views. Arbitrary
native app windows are not automatically embeddable, and agents need explicit
data and action interfaces to understand richer content. The broader typed
contract and general action catalogue remain unfinished.

</details>

## Try it

Use Node 24, a Linux desktop and [Herdr Core](https://github.com/herdrdev/herdr-core)
with `hc` on PATH. The standalone verification used Core 0.1.16. Text and voice
also need a configured Codex installation. Codex and Claude Vessels need their
respective command-line tools on PATH.

```sh
git clone https://github.com/isaacasamoah/voyagershell.git
cd voyagershell
npm ci
VOYAGER_WORKSPACE_SESSION=voyager-try npm start
```

Reuse that session name to reopen its workspace. Closing the viewer leaves Core
running; explicit Quit stops it. Reopening a stopped session does not resume its
agent conversations or submit work for them.

Use a Vessel's corner split control or Ctrl+Shift+O/E to open the content picker.
Ctrl+Shift+T opens a Fleet. Ctrl+B toggles the sidebar. For keyboard docking,
focus Home, a Voyage, a Fleet or a Vessel header and press Shift+Enter.
Alt+Shift+H/J/K/L moves a Vessel beside a directional neighbour. Space picks up a
focused Vessel header; Enter or Space places it on a Fleet. Escape cancels.

`VOYAGER_WORKSPACE_SESSION` selects both the local profile and Core session.
Names must begin with `voyager-` and use lowercase letters, digits and hyphens.
`VOYAGER_WORKSPACE_CWD` selects the initial folder. `VOYAGER_HC` selects the Core
executable, and `VOYAGER_CODEX_BIN` selects the private companion's Codex executable.

## Checks

From the repository root:

```sh
npm run format:check
npm test
```

Normal tests use disposable fixtures without a desktop or model account.
The maintained `prove.py` runner exercises a dedicated Electron/Core candidate,
including picker dismissal, dragging, docking, retained process identity,
stale-save rejection and explicit Quit. Give it a unique session, debugging port
and fresh evidence directory. Use that same evidence directory for later Quit.
Never point destructive proving at an owner's session. See
[the contribution guide](CONTRIBUTING.md) and [build constraints](CONSTRAINTS.md).

The [standalone baseline review](https://github.com/isaacasamoah/voyagershell/pull/1)
records passing isolated Xvfb/X11 journeys and the scoped proof-size check.
The earlier [consolidation review](https://github.com/isaacasamoah/voyagershellapp/pull/77)
retains the prior results and limits. Broader prototype acceptance, GNOME
compositor behavior, physical OS menu and keyboard operation, audible voice,
macOS and Windows remain unproved. Automated checks do not replace a person
trying gestures and sound.

## Source map

| Location                                                                        | Responsibility                                                   |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `main.cjs`, `preload.cjs`                                                       | Electron windows, application requests and client checks         |
| `core.cjs`                                                                      | Connection to the external Herdr Core runtime                    |
| `workspace.cjs`, `organisation.js`, `placement.js`                              | Workspace state, organisation and layout interactions            |
| `renderer.js`, `index.html`, `style.css`                                        | Workspace rendering and terminal views                           |
| `companion.cjs`, `chat.js`, `voice.js`                                          | Private Codex conversation, named tools and voice                |
| `portal-library.cjs`, `portal-host.cjs`, `portal-client.js`, `portal-frames.js` | Content packages, state, requests and embedded views             |
| `portal-defaults/`                                                              | Shipped content packages                                         |
| `astronaut.js`, `avatar-art.js`, `identity.js`, `floating.js`, `assets/`        | Avatar artwork, animation, docking presentation and desktop view |
| `*-test.cjs`, `test.cjs`, `astronaut.test.cjs`                                  | Boundary and interaction tests                                   |
| `prove.py`, `proof_*.py`                                                        | Maintained native proving fixture and journeys                   |

Herdr Core owns processes and terminal screens. Voyager owns workspace
presentation, content placement and application policy. We learn from the
[Core guidance](https://github.com/herdrdev/herdr-core/blob/7a54c2975225a859b7e7d67302df5efc249fb9d0/AGENTS.md),
[App guidance](https://github.com/herdrdev/herdr-app/blob/1581a587919dddd6f1efd5f78eb542c4b2b02cb5/AGENTS.md)
and [agent-facing app guide](https://github.com/herdrdev/herdr-app/blob/1581a587919dddd6f1efd5f78eb542c4b2b02cb5/defaults/AGENTS.md).
Those pinned development sources inform the design; they are not a claim about
the installed Core version's exact source.

This repository preserves the workspace history extracted from
[voyagershellapp](https://github.com/isaacasamoah/voyagershellapp). The original
[tagged demos](https://github.com/isaacasamoah/voyagershellapp/releases) remain
there, and the old web project is archived as
[voyagershell-legacy](https://github.com/isaacasamoah/voyagershell-legacy).
Voyager's own code uses the [MIT license](LICENSE).

Read [the contribution guide](CONTRIBUTING.md). Reports of real workflows,
failures and integration limits are welcome.
