# Close and reopen a Voyage

## Sub-features

Right-clicking a Voyage row and choosing Close opens a dialog that lists the
Voyage's running programs. Cancel changes nothing. Close Voyage stops every
program of that Voyage, marks it closed, selects another Voyage and keeps its
Fleets, Vessels and names. Recent voyages offers it again, and Reopen opens
and selects it with a new shell in each Vessel. A closed Voyage stays closed
and starts no program across a cold restart, and Reopen after the restart
starts new shells on the new Core.

## How to get to it (user POV)

Open the isolated fixture app with the sidebar open. Create a second Voyage
and split its Vessel so it holds two terminals. Right-click its row, choose
Close, cancel, then close it again and confirm. Open Recent voyages and
reopen it. Close it once more, quit, stop Core, open the app, and reopen it.

## Driving it with the maintained fixture

Follow the exact doctor and run commands in ../SKILL.md with
`--journey voyage-close`. The Rust journey in
tests/native/src/journey/voyage_close.rs owns the recipe. The close plan and
its stops belong to app/src/voyage_close.rs, the dialog to
desktop/mods/header/voyage-close.ts, the Voyage row menu and Recent voyages to
desktop/mods/header/navigation-view.ts, and reopening to
app/src/terminal_lifecycle.rs.

Voyage A is the first Voyage with the first shell. Voyage B is made by the
journey.

- `second-voyage` creates B with one Fleet and two Vessels. Both shells must
  run.
- `close-voyage-asks` opens the dialog with a context click on B's row and
  the `close-voyage` menu entry. The dialog's `voyage-close-entry` keys must be
  exactly B's two contents. The document version, B's open state and both
  shells must be unchanged.
- `close-voyage-cancel` clicks Cancel. The dialog closes, and B stays open,
  selected and drawn, with the same version and the same shells.
- `close-voyage-confirm` (the control case) confirms. B is closed in the
  document. Core reports both of B's terminals finished and both shells are
  gone. A's shell is the same running program. A and its first Fleet are
  selected. B keeps its Fleets, Vessels and names. The window draws neither B
  nor the dialog, and Recent voyages is offered.
- `reopen-voyage` reopens B from Recent voyages. B is open and selected with
  the same shape, each Vessel runs a new shell with the first shell's `argv`,
  everything is drawn, `REOPEN-42` reaches a reopened shell, and Recent
  voyages no longer offers B.
- `closed-after-restart` closes B again, quits, stops Core and launches. B is
  still closed and not drawn, no live terminal backs a B content, and the
  document is unchanged apart from runtime fields.
- `reopen-after-restart` reopens B on the new Core. Each Vessel runs a new
  plain shell that the new Core lists live, and `COLD-42` reaches one.

The journey needs the sidebar open and a window of at least 1180 by 1000.

## Negative control

tests/native/controls/voyage-close.patch makes a confirmed close stop only the
first program of the Voyage. A candidate built with it must fail
`close-voyage-confirm` on the expectation `every program of the closed Voyage
stopped`, with one of B's shells observed live.

## Gotchas

The journey drives no refusal of a confirm. The only driven refusal was a
Notes save conflict, and Notes is not core. Escape on the dialog, the
incomplete phase after an uncertain stop, closing the only open Voyage, a
terminal Portal of the closing Voyage and an agent Vessel coming back as a
plain shell are not driven. No case compares pixels. Linux evidence does not
establish another platform.
