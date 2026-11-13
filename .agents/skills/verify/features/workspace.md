# Voyages, Fleets and Vessels

## Sub-features

A Vessel splits side by side through the content chooser. The new Vessel is
saved and drawn to the right of the first, and its terminal runs a shell. The avatar docks to a Vessel when you drag it there, and the dock
stays on that Vessel while you change Fleet or Voyage. The Fleet strip's plus
creates a Fleet through the same chooser and selects it. The sidebar's plus
creates a Voyage in the folder of the focused terminal, names it after that
folder and selects it. A new Fleet's tab and a new Voyage's row show their
saved names. A click on a Fleet or Voyage name selects it. A name is
renamed by a double-click or by F2 on the focused name, and Tab and Shift+Tab
move the keyboard from one name to the next. Enter or a click elsewhere saves
the name, Escape cancels the edit, and an empty name is refused. The name
control then shows the saved name. Closing and reopening the viewer restores
the same layout document on the same Core and shells, and draws the same
Voyage rows, Fleet tabs, Vessels and names.

The journey does not arrange the Vessels of a Fleet and does not launch an
agent Vessel. `features.toml` lists those as `Fleet arrangement` and `Agent
Vessels`, which only the Python fixture covers.

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
| `split-vessel` | Hover the Vessel's name, click `split-right`, click `create-worker` `terminal`, type `echo SPLIT-$((6*7))` into the new terminal | Exactly one Vessel is new, and the Fleet holds the first Vessel unchanged and the new Vessel. The Fleet's saved arrangement is one horizontal split with the first Vessel first and the new Vessel second. The frame draws the new Vessel's terminal to the right of the first Vessel's terminal, in the same row. The new Vessel's shell prints `SPLIT-42` |
| `dock-vessel` | Drag `avatar` onto the new Vessel's name | The document's context and the frame's `dock` are the new Vessel |
| `create-fleet` | Click `create-fleet`, click `create-worker` `terminal` | Exactly one Fleet is new, it is named `Fleet 2`, it holds one Vessel, it is selected, its tab and its Vessel are drawn, its tab shows `Fleet 2`, and the dock is unchanged |
| `switch-fleet` | Click the first Fleet's name, the new Fleet's name, then the first again | Each click selects that Fleet and the dock is unchanged at every step |
| `create-voyage` | Type `cd /voyager/home/second-project` into the new Vessel's terminal, wait until Core reports that folder for its shell, click `create-voyage` | Exactly one Voyage is new, it is open in `/voyager/home/second-project` and named `second-project`, it holds one Fleet with one Vessel, it is selected, it is drawn with its Fleet tab and its Vessel, its row shows `second-project`, its Fleet's tab shows that Fleet's saved name, and the dock is unchanged |
| `switch-voyage` | Click the first Voyage's name, the new Voyage's name, then the first again | Each click selects that Voyage, the dock is unchanged, and the first Voyage shows its first Fleet again |
| `rename-fleet-enter` | Double-click the Fleet's name, type, press Return | The editor holds the typed text before Return, the saved name is the typed text, and the drawn name is the saved name |
| `rename-voyage-blur` | Double-click the Voyage's name, type, click the first terminal | The same three, with the click as the finishing input |
| `rename-vessel-f2` | Click the Vessel's name, press F2, type `+`, press Return | The same three. The saved name is `+` and the title ends in `+` |
| `rename-keyboard` | Click the first Voyage's name, press Tab and F2, press Escape, press Shift+Tab and F2, type, press Return | F2 after Tab opens the editor of the next Voyage's name and no other. F2 after Shift+Tab opens the editor of the first Voyage's name and no other. Then the same three |
| `rename-escape-cancels` | Double-click the Fleet's name, type, press Escape | The editor holds the typed text before Escape, the saved name is unchanged, and the drawn name is the saved name |
| `rename-empty-refused` | Double-click the Vessel's name, press BackSpace, press Return | The editor is empty before Return, the saved name is unchanged, and the drawn name is the saved name |
| `relaunch-restores` | Press Ctrl+Q, launch the same profile | The candidate quits with a success status. The layout document and its version are equal before and after. Core and the shells of all four Vessels are the same processes. The Fleet, the Voyage and the Vessel that the journey renamed are saved as `Native Fleet`, `Keyboard Voyage` and `+`. The avatar is docked where the document says. The window draws every Voyage row, every Fleet tab of the selected Voyage, and the name and the terminal of every Vessel of the selected Fleet. Every Voyage row, every Fleet tab and the renamed Vessel's title shows its saved name |

The app saves a change before it draws it, so a frame from before an input
can stand beside the document from after it. `split-vessel`, `create-fleet`
and `create-voyage` therefore wait for a frame that draws what the input
creates. A frame from before the input cannot draw a control with the new id.
`split-vessel` waits until one frame draws both terminals with the new one to
the right. A creation case waits until one frame draws the new tab, row and
Vessel under their saved names, and it reads the dock from that frame.

Each of these is still a separate expectation. If the frame never draws the
result, the wait ends at its 12 s deadline with the value that held, and the
case fails by name. A Fleet that is created but not selected fails on `the
new Fleet is selected`, and a tab that shows another name fails on `the new
Fleet's tab shows its saved name`.

`create-voyage` moves the shell of the second Vessel, so three folders
differ when the Voyage is created. The focused terminal is in
`/voyager/home/second-project`. The first Vessel's shell, the folder that
each terminal started in and the first Voyage's folder are all
`/voyager/home/project`. The header takes the folder from the shell of the
focused Vessel (`directorySource` in `desktop/mods/header/main.ts`).

Every rename case waits for `name-editor` to replace the name control. After
it types, it reads the editor's draft from the frame until the draft is the
typed text. A draft that never matches fails the case on `the editor held the
typed draft before the finishing input`, and the case sends no finishing
input. A lost keystroke therefore cannot pass `rename-escape-cancels` or
`rename-empty-refused`. Typing replaces the old name because the editor
selects its whole value when it opens.

The drawn name is the `label` of the name control in the frame. A Vessel's
title shows its program and folder before its name, as in `bash ·
second-project · +`, so the journey compares the last part of the title with
the saved name. A draft or a label counts only after prepared frames have
shown it unchanged for 150 ms. If the editor or the name leaves the frame
before that, the case ends as an error that names the control, and the
journey is `failed`.

A frame does not report keyboard focus, so `rename-keyboard` reads focus from
the editor that F2 opens. The first Voyage's name and the next Voyage's name
are neighbours in the Tab order. The case presses Escape between its two
halves, because Escape closes the editor and returns the keyboard to the name
that the editor belonged to. The case sends Tab and F2 straight after its
click on the first Voyage's name. That click selects a Voyage that is already
selected, so it draws nothing that a wait could name.

`relaunch-restores` compares the three renamed names with the text that the
journey typed, and not with the document that it read before Ctrl+Q. A name
that a late save changed after `rename-escape-cancels` passed therefore fails
here. It also compares the label of every Voyage row and every Fleet tab with
the saved name, so a created Fleet or Voyage that is drawn under another name
fails here as well as in its creation case.

The journey binds the shell of every Vessel that it creates, so cleanup waits
for all four shells to exit. A creation case binds the new shell only after
its expectations held, so a failed creation ends as that named expectation
and not as a wait for a terminal that was never bound.

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

Isaac approved two gaps on 13 November 2026.

- The refusal of a stale layout version is not driven here, because the
  verifier never writes to Core. `app/tests/maximize.rs` asserts
  `Status::Rejected` for a stale expected version.
- A rename during a pending selection is not driven, because the old check
  patched the profile's script to delay the selection.

Isaac approved three more for later waves.

- Docking with Shift+Enter is not driven, because a frame does not report
  which dock target has keyboard focus.
- Portals are not driven.
- Close, quit and restore of a Voyage stay with their Python journeys.

These gaps are open. Nobody has approved them.

- A `label` is the string that the header gives a name control. The journey
  does not read the pixels back. A candidate that draws other text than the
  label, or a narrow control that cuts the text short, passes. Reading the
  drawn pixels belongs to the visual tier.
- The journey keeps captures but compares no pixels, so the visual tier of
  Voyages, Fleets and Vessels is `none`. The Python `demo-feedback` journey
  also keeps captures of the Voyage rows and compares none.
- `rename-keyboard` proves one Tab step and one Shift+Tab step, between two
  Voyage names. It does not walk the Fleet tabs or the Vessel titles.

## Gotchas

A Fleet or Voyage name selects on a single click and opens its editor on a
double-click, so two clicks on one name must not follow each other closely.
A docked avatar covers part of its Vessel at two thirds of the Vessel's
height. The driver aims beside it. The header drops a workspace action that
arrives while a workspace request is in progress, so every wait for an outcome
also waits for `prepared` in the frame before the next input.
