# Slow Core lists

## Sub-features

The app does not wait for Core's terminal list. A shell that exits closes its
Vessel from Core's report, and a request that changes nothing is answered while
the Agents list waits for Core's reply.

## How to get to it (user POV)

Open the isolated fixture app with Core's `terminal.list` replies held. Open
the chat and send a message, so the assistant has a turn. Split the first
terminal to the right and choose Agents. While the Agents list waits for Core,
the assistant inspects the workspace. Then let the shell exit.

## Driving it with the maintained fixture

Follow the exact doctor and run commands in ../SKILL.md with
`--journey slow-list`. The Rust journey in
tests/native/src/journey/slow_list.rs owns the recipe. The journey declares
`terminal.list=2000`, so no `--core-delay` is needed. A `--core-delay` that
holds `terminal.list` for at least 1000 ms replaces it.

- `inspect-answered-during-held-list` shows an Agents Vessel, so the canvas
  asks the app for the process list every few seconds and each of Core's
  replies is held. The stand-in then plays 16 scripted workspace inspects,
  500 ms apart. Every inspect must return Applied, and every round trip must be
  under a quarter of the hold. `round trips ms` records them.
- `exit-closes-during-held-list` types `exit` in the terminal. The saved layout
  must hold the Vessel closed in under half of the hold, and the canvas must
  draw it closed.

## What a failure means

A product failure in the first case means that the app's owner waited for
Core's terminal list before it took the inspect. A product failure in the
second case means that the app learned of the exit from a terminal list and not
from Core's report.

The run ends `inconclusive`, blamed on the verifier, when `terminal.list` is
held for under 1000 ms, or when no inspect was sent while a list reply was
held. In both the app was not tested.

## Known gaps

- The relay cannot tell the Agents list's process read from the canvas's
  workspace observation, because both are `terminal.list`. The script spans
  8 s, which is longer than one canvas loop under the hold, so an inspect is
  sent during a process read. That is inferred from the loop's timing and not
  observed.
- A round trip includes the stand-in, the conversation owner and the tool
  dispatch, so it is an upper bound on the owner's delay and not a measure of
  it.
- A process Read, the list before a worktree removal, the plan of a Voyage
  close and a create from a live directory are not driven under the hold.
