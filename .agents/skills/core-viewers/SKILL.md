---
name: core-viewers
description: Model-check VoyagerShell's Core terminal viewer slots and output buffers with TLA+. Use when a change touches Viewer, WeakViewer or Lease in app/src/core_viewer.rs, Stream or Streams in app/src/core.rs, the terminal receipt cache in app/src/client.rs, the Core reader in app/src/core_reader.rs, the Core writer thread, terminal_attach, Core::begin, Pending::wait, install_viewer in desktop/src/host.rs or the take/credit pump in desktop/src/terminal.rs. It does not cover terminal rendering, input bytes or Herdr Core itself.
---

# Core viewer slots

The promise: while Herdr Core keeps its protocol, nothing Voyager or the person
does with terminal viewers disconnects the Core bridge, and every occupied viewer
slot belongs to a viewer someone holds. The harm: a disconnected bridge stops
input, focus and resize for every terminal in the session, and leaked slots
eventually refuse every new terminal with `viewer_limit`.

The check is a TLA+ model, `tests/formal/core-viewers/CoreViewers.tla`, run by
TLC over every order of attaches, attach timeouts, output, credit, terminal
exits, viewer installs, failed installs, viewer replacement and reader steps
within the bounds below.

## Run

From the repository root, with Java 17 or later and network access on the first run:

```sh
sh tests/formal/core-viewers/check.sh
```

It downloads `tla2tools.jar` 1.8.0 once into `target/tla/`, checks its SHA-256,
runs the configuration below in about a minute on a laptop and compares the
outcome with this table. Exit 0 means the outcome matched and the covered code
has not changed since the sync commit. Exit 1 means the outcome changed or the
model failed to run. Exit 2 means the covered code changed and needs review first.

| Configuration | Expected | What it checks |
|---|---|---|
| CoreViewers | holds | With attach timeouts: the bridge stays up, buffered bytes equal the stored streams, occupied slots stay within the limit, and every occupied slot belongs to a held or attaching viewer |

Read every violation with `/statechart`, which tells the counterexample as the
shortest path of steps. Translate each step through the coverage table below into
the code that performs it before deciding anything.

## What the model has caught

These were real bugs, found by this model and fixed. A change that brings either
path back fails the check.

1. **Stale output from a timed-out attach.** `Pending::wait` gives up after 20
   seconds, but Core can still finish the attach. The reader once tested the
   16 MiB total before it looked the channel up, so output on that abandoned
   channel could disconnect the bridge. `Reader::output` now drops unknown
   channels first, and `Reader::reply` closes the channel of an attach reply
   that nobody is waiting for.
2. **Orphaned streams, issue #104.** A terminal that printed and exited before its
   viewer was installed, or a new viewer refused because the old one's close
   found the control queue full, kept its slot for the rest of the session. A
   `Lease` shared by every clone of a `Viewer` now frees the stream and queues
   CLOSE when the last clone drops. The client's receipt cache holds only a
   `WeakViewer`, so a cached receipt never keeps a refused viewer alive.

## Coverage

| File | Items | Model |
|---|---|---|
| `app/src/core.rs` | `Stream::occupied`, `Streams::occupied` | `Occupied`, `OccupiedCount` |
| `app/src/core.rs` | `VIEW_LIMIT`, `TOTAL_LIMIT`, `VIEWER_LIMIT` | `ViewLimit`, `TotalLimit`, `ViewerLimit` |
| `app/src/core.rs` | `enqueue`, control queue capacity 64 | `Enqueue`, `TryEnqueue`, `ControlCapacity` |
| `app/src/core_viewer.rs` | `Viewer::send` | `Enqueue` |
| `app/src/core.rs` | `Core::terminal_attach` slot check, `Core::begin` and its `attaches` set | `Attach` |
| `app/src/core_viewer.rs` | `Lease::close`, `Lease::release`, `Drop for Lease`, `WeakViewer::upgrade` | `Replace`, `InstallFails` |
| `app/src/core_viewer.rs` | `Viewer::take`, `Viewer::credit`, `Viewer::close`, `Viewer::ensure_open` | `Take`, `GiveCredit`, `Replace`, `Install`, `InstallFails` |
| `app/src/core.rs` | `Core::viewer` | `Install`, `InstallFails` |
| `app/src/core_reader.rs` | `Reader::receive`, `Reader::reply`, `Reader::output`, `Reader::ended` | `Read`, `ReadReply`, `ReadData`, `ReadEnd` |
| `app/src/core_pending.rs` | `Pending::wait` timeout and its recheck under the replies lock, `Drop for Pending` | `TimeOut`, the `waiting` check in `ReadReply` |
| `app/src/client.rs` | `terminal_requests` receipt cache of `WeakViewer` | `InstallFails` frees the slot because no other strong `Viewer` exists |
| `desktop/src/host.rs` | `install_viewer` | `Install`, `Replace`, `InstallFails` |
| `desktop/src/terminal.rs` | `Pane::pump` | `Take`, `GiveCredit` |

Sync commit: `d99d854a12ac60ed2c3cff82b84093dc1bf667b2`

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

- never reuses a channel number within a connection (Core's `Conn::new_channel`
  increments a per-connection counter);
- sends output only within the credit it granted, and none after it reports the
  terminal ended or after it processes a viewer close;
- delivers frames in order in each direction, and receives requests, credits and
  closes in the order the control queue holds them.

It leaves out the activity channel, input and protocol replies, read and write
I/O failures, Core crashing, and the desktop never draining a viewer it holds.
Each modelled action is one step, matching code that holds the `streams` lock
or runs on one thread for that step. A timeout and an attach reply are separate
steps. That is true to the code because `Pending::wait`, after it times out,
removes its reply slot under the replies lock and takes any reply the reader
already handed over.

## Telling a bug from a modelling error

For each step of a counterexample, open the code in the coverage table and check
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
