# Voyages, Fleets and Vessels

## Sub-features

A Vessel splits side by side through the content chooser, and the new terminal
runs a shell. The avatar docks to a Vessel when you drag it there, and the dock
stays on that Vessel while you change Fleet or Voyage. The Fleet strip's plus
creates a Fleet through the same chooser and selects it. The sidebar's plus
creates a Voyage named after its working folder and selects it. A click on a
Fleet or Voyage name selects it. A name is renamed by a double-click or by F2
on the focused name. Enter or a click elsewhere saves the name, Escape cancels
the edit, and an empty name is refused. Closing and reopening the viewer
restores the same layout document on the same Core and shells.

## How to get to it (user POV)

Open the isolated fixture app with the sidebar open. Hover the first Vessel,
click its split-right button and choose the terminal entry. Drag the avatar
onto the new Vessel's title. Click the plus after the Fleet tabs and choose
the terminal entry, then click each Fleet tab. Click the plus beside Voyages,
then click each Voyage row. Double-click a name, type and press Enter. Close
the viewer with Ctrl+Q and open the same profile again.

## Driving it with the maintained fixture

Follow the doctor command in ../SKILL.md, then run the journey:

```sh
tests/native/target/debug/voyager-verification run --journey workspace --binary "$candidate" --sha256 "$expected" --hc-sha256 "$core" --assets "$PWD/desktop/assets" --evidence "$run_parent/workspace"
```

The Rust journey in tests/native/src/journey/workspace.rs owns the recipe. Its
cases run in this order on one workspace, and each case leaves the state that
the next case needs.

| Case | Input | Passes when |
| --- | --- | --- |
| `split-vessel` | Hover the Vessel's name, click `split-right`, click `create-worker` `terminal` | Exactly one Vessel is new, the Fleet holds the first Vessel unchanged beside it, and the new terminal prints `SPLIT-42` |
| `dock-vessel` | Drag `avatar` onto the new Vessel's name | The document's context and the frame's `dock` are the new Vessel |
| `create-fleet` | Click `create-fleet`, click `create-worker` `terminal` | Exactly one Fleet is new, it is named `Fleet 2`, it holds one Vessel, it is selected, and the dock is unchanged |
| `switch-fleet` | Click the first Fleet's name, the new Fleet's name, then the first again | Each click selects that Fleet and the dock is unchanged at every step |
| `create-voyage` | Click `create-voyage` | Exactly one Voyage is new, its name is the last part of its working folder, it is selected, and the dock is unchanged |
| `switch-voyage` | Click the first Voyage's name, the new Voyage's name, then the first again | Each click selects that Voyage, the dock is unchanged, and the first Voyage shows its first Fleet again |
| `rename-fleet-enter` | Double-click the Fleet's name, type, press Return | The saved name is the typed text |
| `rename-voyage-blur` | Double-click the Voyage's name, type, click the first terminal | The saved name is the typed text |
| `rename-vessel-f2` | Click the Vessel's name, press F2, type `+`, press Return | The saved name is `+` |
| `rename-keyboard` | Click the Voyage's name, press Tab, Shift+Tab and F2, type, press Return | The saved name is the typed text |
| `rename-escape-cancels` | Double-click the Fleet's name, type, press Escape | The saved name is unchanged |
| `rename-empty-refused` | Double-click the Vessel's name, press BackSpace, press Return | The saved name is unchanged |
| `relaunch-restores` | Press Ctrl+Q, launch the same profile | The whole layout document is equal before and after, and both shells and Core are the same processes |

Every rename case also waits for `name-editor` to replace the name control and
for the name control to return. Typing replaces the old name because the
editor selects its whole value when it opens.

The journey needs the sidebar open, because the Voyage rows are drawn only
there. `run` refuses `--sidebar collapsed`. The journey also needs a window of
at least 1180 by 1000 device pixels, and `run` refuses a smaller `--window`.
At 1180 by 820 the sidebar has room for one Voyage row, so the second Voyage's
name is never drawn.

## Negative control

tests/native/controls/workspace.patch upper-cases a submitted name in
desktop/mods/header/main.ts and in the compiled main.js. A candidate built
with it must fail `rename-fleet-enter` on the expectation `the saved name is
the typed text`, and `firstFailingCheck.observed.rename.after` must read
`NATIVE FLEET`.

## Gaps

Isaac approved these gaps on 13 November 2026.

- The refusal of a stale layout version is not driven here, because the
  verifier never writes to Core. `app/tests/maximize.rs` asserts
  `Status::Rejected` for a stale expected version.
- A rename during a pending selection is not driven, because the old check
  patched the profile's script to delay the selection.
- Docking with Shift+Enter is not driven, because a frame does not report
  which dock target has keyboard focus.
- Portals and close, quit and restore stay with their Python journeys.
- `rename-keyboard` cannot tell a Tab that did nothing from a Tab and a
  Shift+Tab that returned to the same name.

## Gotchas

A Fleet or Voyage name selects on a single click and opens its editor on a
double-click, so two clicks on one name must not follow each other closely.
A docked avatar covers part of its Vessel at two thirds of the Vessel's
height. The driver aims beside it. The app sends no workspace action while it
prepares a new terminal, so every case waits for the new terminal's element
before the next input.
