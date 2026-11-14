# Quit and restore

## Sub-features

Ctrl+Q and closing the window both quit and keep. The app closes and leaves
Core, the shells and the saved layout as they were. A warm relaunch, with Core
still running, reattaches the same shells and keeps their screens. A cold
restart, after Core has stopped as it would after a reboot, brings back the
Voyages, Fleets, Vessels, names and selection, and starts a new plain shell for
each Vessel of the selected Fleet. Stop session, from the Home button's context
menu, stops Core and every program it started, then closes the app.

## How to get to it (user POV)

Open the isolated fixture app and type a command into the first terminal.
Press Ctrl+Q. Open the app again with the same profile and type again. Start
a command that keeps printing, quit while it prints, and open the app again.
Close the window and open the app again. Quit, stop Core, and open the app
once more. Right-click Home, choose Stop session… and confirm.

## Driving it with the maintained fixture

Follow the exact doctor and run commands in ../SKILL.md with
`--journey quit-restore`. The Rust journey in
tests/native/src/journey/quit_restore.rs owns the recipe. The app quits in
desktop/src/quit.rs through the owner's `Lifecycle` in app/src/client.rs and
decides which terminals to keep or start again in
app/src/terminal_lifecycle.rs.

- `quit-and-keep` prints `QUIT-42`, presses Ctrl+Q, and reads Core with no app
  running. Core, the shell, Core's live terminals and the layout document with
  its version must all be unchanged. It records `quitMillis`, the time from
  sending Ctrl+Q to seeing the app process exit.
- `relaunch-reattaches` launches again. Core's live terminals, the document and
  its version must be the same as before Quit. Core must still hold `QUIT-42`
  for that terminal, read through `terminal.read`. The Fleet tabs, Vessels and terminals must be drawn with
  the avatar docked where the document says, and `AFTER-42` must reach the same
  shell.
- `quit-busy-keeps-output` starts a loop that prints `BUSY-1` to `BUSY-100`
  over ten seconds and then `BUSY-DONE-42`, and quits after `BUSY-3`. While the
  app is closed, the shell must be the same live program, and one read of Core's
  screen must not yet hold `BUSY-DONE-42`. After the relaunch the loop must
  finish in the same shell, and Core's live terminals must be unchanged.
- `close-window-keeps` asks the window to close the way a window manager's
  close button does (`WM_DELETE_WINDOW`). The app must exit cleanly and leave
  Core, the shell and Core's live terminals unchanged. The relaunch must draw
  the same Voyage from the same document and version, and `REOPENED-42` must
  reach the same shell.
- `cold-restart-restores` quits, stops Core with `Native::stop_core`, and
  launches again, so the app's `hc connect` starts a new Core. The document
  must match the saved one once each content's runtime fields (`backend`,
  `launch`, `startPending`, `shellIntent`) are removed. Each Vessel of the
  selected Fleet must be bound to a new terminal that runs the first shell's
  `argv`, and `COLD-42` must reach the restored shell.
- `stop-session` records each live program, right-clicks Home, chooses Stop
  session… and confirms. The app must exit cleanly, the session's Core must
  stop and remove its socket, and every recorded program must end.

The journey needs no sidebar state and no window size.

## Negative control

tests/native/controls/quit-restore.patch routes Ctrl+Q to stop-session. A
candidate built with it must fail `quit-and-keep` on the expectation `Core is
the same process after Quit`, with no Core answering after Quit.

## Gotchas

No case reads the terminal's pixels after the relaunch, so a build that draws
no terminal text passes this journey. `terminal-scrolling` compares the drawn
screen after its own relaunch and catches that build.

The verifier never starts Core. Stopping Core stands in for a reboot. It does
not test a real reboot, a lost socket or a Core that crashes. Bare Xvfb has no
window manager, so `close-window-keeps` sends the close request itself, and
minimise cannot be seen. Stop session ends the programs Core started. A
program that detached from its terminal, for example with `setsid`, may
survive, and no case starts one. Closing a Voyage is covered by the native
`voyage-close` journey. Linux evidence does not establish another platform.
