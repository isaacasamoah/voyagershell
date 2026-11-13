---
name: core-viewers
description: Model-check VoyagerShell's Core terminal viewer slots and output buffers with TLA+. Use when a change touches Viewer, Stream or Streams in app/src/core.rs, the Core reader or writer thread, terminal_attach, Pending::wait, install_viewer in desktop/src/host.rs or the take/credit pump in desktop/src/terminal.rs. It does not cover terminal rendering, input bytes or Herdr Core itself.
---

# Core viewer slots

The promise: while Herdr Core keeps its protocol, nothing Voyager or the person
does with terminal viewers disconnects the Core bridge, and a terminal that has
ended and been read frees its viewer slot. The harm: a disconnected bridge stops
input, focus and resize for every terminal in the session, and leaked slots
eventually refuse every new terminal with `viewer_limit`.

The check is a TLA+ model, `tests/formal/core-viewers/CoreViewers.tla`, run by
TLC over every order of attaches, timeouts, output, credit, terminal exits,
viewer replacement and reader steps within the bounds below.

## Run

From the repository root, with Java 17 or later and network access on the first run:

```sh
sh tests/formal/core-viewers/check.sh
```

It downloads `tla2tools.jar` 1.8.0 once into `target/tla/`, checks its SHA-256,
runs the three configurations below in under a minute and compares each outcome
with this table. Exit 0 means every outcome matched and the covered code has not
changed since the sync commit. Exit 1 means an outcome changed or a model failed
to run. Exit 2 means the covered code changed and needs review first.

| Configuration | Expected | What it checks |
|---|---|---|
| CoreViewers | holds | Without attach timeouts: the bridge stays up, buffered bytes equal the stored streams, occupied slots stay within the limit |
| Timeouts | violated | Open finding 1 below: a timed-out attach can still disconnect the bridge |
| Ownership | violated | Open finding 2 below, issue #104: an orphaned stream keeps its slot |

Read every violation with `/statechart`, which tells the counterexample as the
shortest path of steps. Translate each step through the action table below into
the code that performs it before deciding anything.

## Open findings

1. **Timed-out attach.** `Pending::wait` gives up after 20 seconds, but Core can
   still finish the attach. The reader drops the reply, so Voyager never knows the
   channel and never closes it. Core then sends output on that channel. The
   reader tests `streams.total + frame.payload.len() > TOTAL_LIMIT` before it
   looks the channel up, so a frame it would discard anyway disconnects the
   bridge when the known streams already hold nearly 16 MiB. Shortest path:
   attach, time out, attach again, Core opens both, the second viewer is
   installed and a third attached, their output fills the buffer, then the first
   channel's output arrives.
2. **Orphaned streams, issue #104.** A terminal prints output and exits before its
   viewer is installed. `install_viewer` calls `ensure_open`, which refuses a
   closed stream, so nobody holds the viewer and its unread bytes keep the slot
   occupied for the rest of the session. A failed `old.close()` on a full control
   queue orphans the new viewer the same way.

When a fix lands, the matching configuration should hold. Change its row to
`holds` in the same change, and when Timeouts holds, set `AttachTimeouts = TRUE`
in `CoreViewers.cfg` and `Ownership.cfg` and delete `Timeouts.cfg` and its row.

## Coverage

| File | Items | Model |
|---|---|---|
| `app/src/core.rs` | `Stream::occupied`, `Streams::occupied` | `Occupied`, `OccupiedCount` |
| `app/src/core.rs` | `VIEW_LIMIT`, `TOTAL_LIMIT`, `VIEWER_LIMIT` | `ViewLimit`, `TotalLimit`, `ViewerLimit` |
| `app/src/core.rs` | `enqueue`, `Viewer::send`, control queue capacity 64 | `Enqueue`, `ControlCapacity` |
| `app/src/core.rs` | `Core::terminal_attach` slot check, `Core::begin` | `Attach` |
| `app/src/core.rs` | reader thread in `Core::connect_activity` | `Read`, `ReadReply`, `ReadData`, `ReadEnd` |
| `app/src/core.rs` | `Viewer::take`, `Viewer::credit`, `Viewer::close`, `Viewer::ensure_open`, `Core::viewer` | `Take`, `GiveCredit`, `Replace`, `Install`, `InstallFails` |
| `app/src/core_pending.rs` | `Pending::wait` timeout, `Drop for Pending` | `TimeOut`, the `waiting` check in `ReadReply` |
| `desktop/src/host.rs` | `install_viewer` | `Install`, `Replace`, `InstallFails` |
| `desktop/src/terminal.rs` | `Pane::pump` | `Take`, `GiveCredit` |

Sync commit: `7739559000ccb4729a1ecbe07687d000262a9952`

`check.sh` reads the file column and the sync commit from this file. Move the sync
commit forward only after you have read every diff in those files since the
recorded commit, including moved code, and confirmed that each model action still
does what the code does at the new commit.

## Bounds and assumptions

Three channels, two viewer slots, two units of credit per channel, a per-viewer
limit of eight units, a control queue of two frames and three attach requests.
The ratios match the code: 16 MiB is 64 slots of Core's 256 KiB credit, and 1 MiB
is four credits. A pass covers these bounds, not every size.

The model assumes, without checking, that Herdr Core:

- never reuses a channel number within a connection;
- sends output only within the credit it granted, and none after it reports the
  terminal ended or after it processes a viewer close;
- delivers frames in order in each direction, and receives requests, credits and
  closes in the order the control queue holds them.

It leaves out the activity channel, input and protocol replies, read and write
I/O failures, Core crashing, and the desktop never draining a viewer it holds.
Each modelled action is one step, matching code that holds the `streams` lock
or runs on one thread for that step.

## Telling a bug from a modelling error

For each step of a counterexample, open the code in the action table and check
that the code allows that step in that state. If it does, the path is a product
bug: report it with the path in the code's words, and do not change product code
unless asked. If some step cannot happen in the code, the model is wrong: fix the
model to match the code and say what you changed. Never weaken an invariant, cut
an action or shrink a bound to make a check pass.

## Changing the covered code on purpose

Update the matching model action in the same change, rerun `check.sh`, then
advance the sync commit. A new way to create, drain, close or drop a stream needs
a new action. To show the check still catches a break, change `Stream::occupied`
to `!self.closed`, mirror it as `Occupied(c) == c \in present /\ ~closed[c]`, and
CoreViewers must report `buffered output exceeded 16 MiB`. Restore both and it
must hold again.
