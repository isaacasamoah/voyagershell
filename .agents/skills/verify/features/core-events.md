# Core reports

## Sub-features

Core tells the app what its programs do. One started, the program in front
changed, or one exited. The app takes each report as it arrives. The Agents list
names a new foreground program without waiting for its 3 s loop, and the Vessel
of a shell that exited closes even when Core was stopped while it exited.

## How to get to it (user POV)

Open the isolated fixture app. Split the first terminal to the right and choose
Agents, so one Fleet shows the terminal and an Agents Vessel. Run a program in
the terminal and stop it again. Then let the shell exit.

## Driving it with the maintained fixture

Follow the exact doctor and run commands in ../SKILL.md with
`--journey core-events`. The Rust journey in
tests/native/src/journey/core_events.rs owns the recipe. The Core reader in
app/src/activity.rs queues each report, and the owner in app/src/client.rs
applies it.

- `foreground-reaches-agents-list` runs `sleep 30` three times and stops it
  with Ctrl+C each time. The driver reads Core directly until Core names the
  new foreground program, then reads the `agents-row` control of the terminal
  until its program field names it. Each of the six changes must reach the row
  within 1 s of the driver seeing Core report it. The observed values are the
  six delays.
- `exit-shown-after-core-pause` types `sleep 2; exit`, waits until Core names
  `sleep` as the foreground program, and stops Core for 3 s with
  `Native::with_core_paused`, so the shell exits while Core is stopped. Then
  it lets Core run again. The driver reads Core until it reports the program
  finished. The saved layout must then hold the Vessel closed within 1 s, and
  the canvas must draw it closed. The run ends `inconclusive`, blamed on the
  verifier, unless the shell's process was gone and its Vessel still drawn at
  the end of the pause.

## What a failure means

A product failure in the first case means that a foreground change reached the
Agents list only through the canvas's 3 s loop. A product failure in the second
case means that the app lost the exit that Core reported after the pause, or
waited for something else before it closed the Vessel.

## Known gaps

- The 1 s runs from the moment the driver sees Core's report. Core reads the
  foreground program about twice a second, so a person waits up to half a
  second longer than the observed delay.
- The pause does not make Core send a `missed` snapshot. The app's unit tests
  cover a `missed` snapshot that shows an exit, and no journey does.
- Only a shell in a Fleet Vessel is driven. A Portal, a hidden Vessel and a
  program on another machine are not.
- A program that reports a status through OSC 7501 is not driven here.
