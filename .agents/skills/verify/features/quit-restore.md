# Quit and restore

## Sub-features

Ctrl+Q closes the app and leaves Core, the shells and the saved layout as they
were. A warm relaunch, with Core still running, reattaches the same shells and
keeps their screens. A cold restart, after Core has stopped as it would after a
reboot, brings back the Voyages, Fleets, Vessels, names and selection, and
starts a new plain shell for each Vessel of the selected Fleet.

## How to get to it (user POV)

Open the isolated fixture app and type a command into the first terminal.
Press Ctrl+Q. Open the app again with the same profile and type again. Quit,
stop Core, and open the app once more.

## Driving it with the maintained fixture

Follow the exact doctor and run commands in ../SKILL.md with
`--journey quit-restore`. The Rust journey in
tests/native/src/journey/quit_restore.rs owns the recipe. The app quits in
desktop/src/quit.rs and decides which terminals to keep or start again in
app/src/terminal_lifecycle.rs.

- `quit-keeps-programs` prints `QUIT-42`, quits, and reads Core with no app
  running. Core, the shell, Core's live terminals and the layout document with
  its version must all be unchanged.
- `relaunch-reattaches` launches again. Core's live terminals, the document and
  its version must be the same as before Quit. Core must still hold `QUIT-42`
  for that terminal, read through `terminal.read`. The Fleet tabs, Vessels and terminals must be drawn with
  the avatar docked where the document says, and `AFTER-42` must reach the same
  shell.
- `cold-restart-restores` quits, stops Core with `Native::stop_core`, and
  launches again, so the app's `hc connect` starts a new Core. The document
  must match the saved one once each content's runtime fields (`backend`,
  `launch`, `startPending`, `shellIntent`) are removed. Each Vessel of the
  selected Fleet must be bound to a new terminal that runs the first shell's
  `argv`, and `COLD-42` must reach the restored shell.

The journey needs no sidebar state and no window size.

## Negative control

tests/native/controls/quit-restore.patch makes a relaunch clear the backend of
a terminal that is still live. A candidate built with it must fail
`relaunch-reattaches` on the expectation `Core lists the same live terminals
after the relaunch`, with two live addresses observed.

## Gotchas

No case reads the terminal's pixels after the relaunch, so a build that draws
no terminal text passes this journey. `terminal-scrolling` compares the drawn
screen after its own relaunch and catches that build.

The verifier never starts Core. Stopping Core stands in for a reboot. It does
not test a real reboot, a lost socket or a Core that crashes. Warm window close
(the window's close button) is not covered here. Bare Xvfb has no window
manager, so its minimize cannot be seen. Isaac has decided that closing the
window will behave like Quit, so today's warm close is being replaced and no
journey checks it. Closing a Voyage is not
covered here. It stays with the Python `voyage-close` journey until the
native `voyage-close` journey lands. Linux evidence does not establish another platform. Quit is bound only
to Ctrl+Q.
