# Terminal scrolling

## Sub-features

Ordinary shell history moves locally in both directions. An alternate-screen
program that did not ask for mouse reports receives cursor keys and no wheel
reports. A program that asked for SGR mouse reports receives wheel reports and
no cursor keys. Closing and reopening the viewer preserves the Core shell and
history.

## How to get to it (user POV)

Open the isolated fixture app, focus the default terminal and print history.
Run the fixture's native terminal probe in arrow and mouse modes. Wheel up and
down, exit the probe, close the viewer and reopen the same isolated profile.

## Driving it with the maintained fixture

Follow the exact doctor and run commands in ../SKILL.md. The Rust journey in
tests/native/src/journey/scrolling.rs owns the recipe. Terminal product behavior is owned
by desktop/src/terminal.rs, terminal_screen.rs and terminal_view.rs in the selected
candidate. The retained fixed replay also uses terminal_scroll.rs. Source identity
and hash come from the candidate receipt, not the current checkout's file list.

The expected full-screen probe positions are 100, then 82 after six upward wheel
events, then 100 after downward events. The automated check requires movement in
both directions, and the probe's drawn lines must move by as many rows as its
position changed; it does not rely solely on probe state.
The probe counts the cursor keys and the wheel reports that move it, as `keys`
and `wheel` in its state file. The `arrows` case expects cursor keys only, and
the `mouse` case expects wheel reports only. A wheel report is an SGR report
for button 64 or 65. The journey proves no other mouse protocol.
In normal history, wheel up must draw the live screen's lines lower, below
earlier lines, and wheel down must return the same capture. After reattachment
the live screen must draw the same printed lines at the same places. Core and
shell identity must survive viewer reattachment. Inspect all direction captures.

## Negative control

tests/native/controls/terminal-scrolling.patch makes the terminal ignore an
upward wheel in ordinary shell history. A candidate built with it must fail
`normal-history` on the expectation
`wheel up draws the live screen's lines lower, below earlier history`.

## Gotchas

The adapter requires the recorded viewport and DPI. Other geometry is unsupported
and must not be silently compensated. Actual Codex, physical touchpads and IME are
not established by the deterministic programs. Real compositor latency needs its
own capability in this same environment. A missing tool, failed focus or uncertain
delivery is verification failure, not proof of an app bug. Keep the failed run.
