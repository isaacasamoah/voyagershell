# Terminal scrolling

## Sub-features

Ordinary shell history moves locally in both directions. An alternate-screen
program receives cursor input; a mouse-reporting program receives its wheel
protocol. Closing and reopening the viewer preserves the Core shell and history.

## How to get to it (user POV)

Open the isolated fixture app, focus the default terminal and print history.
Run the fixture's native terminal probe in arrow and mouse modes. Wheel up and
down, exit the probe, close the viewer and reopen the same isolated profile.

## Driving it with the maintained fixture

Follow the exact doctor and run commands in ../SKILL.md. The Rust journey in
tests/native/src/scrolling.rs owns the recipe. Terminal product behavior is owned
by desktop/src/terminal.rs, terminal_screen.rs and terminal_view.rs in the selected
candidate. The retained fixed replay also uses terminal_scroll.rs. Source identity
and hash come from the candidate receipt, not the current checkout's file list.

The expected full-screen probe positions are 100, then 82 after six upward wheel
events, then 100 after downward events. The automated check requires movement in
both directions and changed captures; it does not rely solely on probe state.
Normal history must move and return to the same captured region. Core and shell
identity must survive viewer reattachment. Inspect all direction captures.

## Gotchas

The adapter requires the recorded viewport and DPI. Other geometry is unsupported
and must not be silently compensated. Actual Codex, physical touchpads and IME are
not established by the deterministic programs. Real compositor latency needs its
own capability in this same environment. A missing tool, failed focus or uncertain
delivery is verification failure, not proof of an app bug. Keep the failed run.
