# Native verification environment

This is the Rust slice of the maintained native fixture. It runs the journeys in
its journey registry on an owned Linux X11 display. The journeys are
`terminal-scrolling`, `workspace`, which covers Voyages, Fleets and Vessels,
`quit-restore` and `terminal-input`, which covers typing, keys, output,
selection and copy and paste in a terminal.
The app changes only to mark controls for inspection.
Invoke `voyager-verification` directly. New verification extends this environment,
including its shared actions and evidence contract. A single command wrapping
unrelated rigs would not meet that requirement. Unsupported capabilities remain
explicit gaps until implemented and independently verified. The Python drivers
are retained for explicit historical reproduction and migration comparison only.

## Environment scope and maintenance

The environment is a maintained development product. Its intended coverage includes
readiness, isolation, shared actions/observations, evidence, repair, cleanup,
functional journeys, boundary failures, platform behavior, resource measurements,
formal properties and ETC/ORTH/DRY review. Plan these together before adding more
journeys. Implement small complete slices of that design, not private rigs.
The environment is not yet accepted as a complete implementation of that design.

| Capability | Implemented status |
| --- | --- |
| Owned X11 scrolling, input/capture/identity, evidence and cleanup | Implemented at any window size. Input aims at the controls that the app reports through `--inspect`; see Locating controls below. |
| Hermetic runs | Implemented with bubblewrap. Each run and each `doctor` checks it with a canary. See Hermetic runs below. |
| Journey registry, verdicts for each case and one negative control for each journey | Implemented. See Journeys and Negative controls below. |
| Finite reporting gate and regression controls | Implemented for the actual Rust gate, not app/OS behavior. |
| ETC/ORTH/DRY checks | Required independent review criteria; not an automatic architecture score. |
| Versioned request/result contract and independent receipt conformance | Planned. Pilot receipts are evidence, not a certified acceptance validator. |
| Voyages, Fleets and Vessels | Implemented by the `workspace` journey. Its recipe lists the checks that it does not drive. |
| Seeded, live-edited and shared run profile, and a second identified build | Implemented by the `profile` journey. Checks the theme background only. See Profile fixtures below. |
| Terminal typing, keys, output, selection, copy and paste | Implemented by the `terminal-input` journey. Its recipe lists the checks that it does not drive. |
| Portal/content/authority/provider journeys | Existing Python coverage retained; Rust migration and parity incomplete. |
| Client decorations and window-manager requests (move, resize, minimise, maximise) | Implemented as `--decorations client` and the observer. No journey asserts on them yet. See Client decorations and window requests below. |
| Window-manager behavior, IME/audio, other OS and performance | Not established by this pilot. Coordinate existing repair and input ownership. |
| Configurable architecture YAML and typed Jev review | Separate later work. |

A fixture failure preserves its run, enters diagnosis, receives a demonstrated
repair, then retests the affected app behavior. Missing capability opens bounded
extension work here; it never licenses a private runner or a success claim.
Supporting unit tests and diagnostics remain valid, but cannot replace the named
native journey. Independent evidence inspection and negative controls are required.
Instructions and the legacy refusal gate do not prevent arbitrary shell execution;
there is no claimed CI gate certifying every acceptance receipt today.

The environment must use the app's existing Core/API and authority boundaries.
It owns its test resources without becoming a second runtime supervisor. Reuse
resource coordination and the desktop queue. Do not import pstack agent-launch or
autonomous-merge authority. Keep one owner for each action, capability definition,
success rule and evidence schema; generate derived views where practical.

### Feature registry

`tests/native/features.toml` is the one record per user feature: source globs, native
journeys, tier status and the retained Python journeys. `voyager-verification features`
validates it and prints the coverage table. `features --write` regenerates the table in
`.agents/skills/verify/features/README.md`, `features --check` fails when it is stale and
`features --changed GIT_RANGE` lists the features and journeys a diff touches.

### Journeys

`journeys!` in `src/journey.rs` is the one list of native journeys. Each row
names the journey, its module under `src/journey/`, the sidebar state that
the journey needs and the smallest window that it fits. The module declares
its cases with `cases!`, the case that its negative control must fail
(`CONTROL`) and its `drive` function. The
`--journey` choices, the plan that crosses into the sandbox, the name in
`checks.json`, the number of cases and the registry validation all read this
list. `voyager-verification journeys` prints it as JSON.

To add a journey:

1. Add one row to `journeys!` and write the module.
2. Add the module's file to `SOURCES` in `src/main.rs`. A test fails when a
   file under `src/` is missing from that list.
3. Add the control patch. See Negative controls below.
4. Name the journey in the `journeys` list of each feature that it covers in
   `features.toml`. A journey that no feature names fails `features`.

A journey that needs one sidebar state gets that state on every launch. `run`
refuses a `--sidebar` value that contradicts it, and a `--window` that is
smaller than the journey's smallest window. The `workspace` journey needs the
sidebar open and a window of at least 1180 by 1000 device pixels. At 1180 by
820 the sidebar has room for one Voyage row, so the name of a second Voyage
is never drawn.

A case runs inside `cases.check` and returns a `Verdict`. A case that creates
something a later case needs runs inside `cases.make` and also returns the
thing that it made. `make` hands that thing to the journey only when the case
passed, so a later case never starts from a creation that failed. A `Verdict`
holds named expectations, each of which held or did not, and the values that
the case observed. A case that returns a `Verdict` without an expectation
judged nothing, so it ends the run as a fixture error. A value that cannot be
recorded also ends the run as a fixture error.
`observations.json` lists every declared case with one status:

| Status | Meaning |
| --- | --- |
| `passed` | Every expectation held. |
| `failed` | An expectation did not hold. |
| `interrupted` | The case ended in an error. `diagnose` blames the product or the fixture. |
| `skipped` | The case did not run, because an earlier case failed or was interrupted. |

Cases build on each other, so a later case would start from a state that the
failed case left unknown. A failed or interrupted case therefore ends the
journey.

After each case the driver saves `observations.json` and a capture of the whole
window, named `case-CASE-STAMP.png`. If the save or the capture fails after a
case that failed, the driver records the error in `actions.jsonl` as an
`unkept` event and the failure stands. After a case that passed, the same
error ends the run as a fixture error. Cases run in their declared order, and a
case that runs out of order ends the run as a fixture error. If `drive` returns
without running a declared case although no case failed, the run is
inconclusive.

A journey may stop Core between launches, in place of a reboot.
`Native::stop_core` refuses while a candidate runs. It checks the bound Core's
identity, sends `server.stop`, and waits until the socket is gone and the
process has exited. The next `launch` lets the app's `hc connect` start a new
Core and binds that Core's identity. The verifier starts a Core only to seed a
Core document, as `--core-document` below describes.
`Native::live_terminals` returns the sorted addresses of the terminals that
Core reports live. `Terminal::program` returns the state, PID and `argv` that
Core reports for a terminal, and whether the bound shell is still the same
process. A journey judges these values as expectations. `Native::context_click`
aims at a control the way `click` does and presses the secondary button,
which the X11 adapter sends as button 3. A journey names the intent, not the
button number.

A journey may pause Core while the candidate runs, to prove what the app does
when Core gives no answer. `Native::with_core_paused` checks the bound Core's
identity, sends it SIGSTOP, runs the journey's closure and sends SIGCONT, also
when the closure fails. `actions.jsonl` gets a `Core-paused` and a
`Core-resumed` event. Core does no work while it is paused, so a request that
the app sends then is held, and Core runs it after it resumes. That differs
from the Core reply relay below, which lets Core do the work on time and holds
only the reply. The closure gets the driver without the right to change it.
It must read only the drawn frame, with `Native::drawn_label` or
`Native::screen_status`, because a driver request to a paused Core fails after
five seconds. `Native::drawn_label` waits for a control to draw a label that
the journey accepts. Its `after` argument is added to the usual deadline, for a
label that the app draws only once a deadline of its own has passed.

The `outcomes` journey proves that a refusal shows its reason and that an
uncertain result shows as uncertain and is not sent again. It declares
`terminal.kill=21000` for its last case and refuses a run that holds that
reply for 20 seconds or less.

- `refused-shows-reason` renames a Fleet to 129 bytes. It passes when the
  status line starts with `Refused.` and holds the owner's reason, and the
  Fleet keeps its saved name.
- `tool-refusal-carries-reason` plays a scripted rename to an empty name
  through the stand-in provider. It passes when the tool result holds
  `"status":"refused"` with the same reason.
- `uncertain-not-replayed` pauses Core and submits a Fleet rename. It passes
  when the status line shows the owner's uncertain answer, a second Enter on
  the same name is declined, Core's layout document is one version on with the
  typed name after Core resumes, and it is still at that version after Refresh.
- `close-refused-says-why` plays a scripted rename behind the open close
  dialog and then confirms. It passes when the dialog's message starts with
  `Refused.` and holds the owner's reason, the Voyage stays open and every
  program still runs.
- `close-uncertain-not-retried` confirms a Voyage close while the relay holds
  Core's reply to the program stop past Core's deadline. It passes when the
  dialog's message starts with `Uncertain.`, and after the reply is released
  the Voyage is still open and the dialog offers no second confirmation.

Limits. `uncertain-not-replayed` reads what Core holds after it resumes and
not which requests the app sent while Core was paused. The last case does not
prove that no second stop was sent, because a second stop's reply would be held
past the end of the case. The journey never reaches a reply that the app's
owner did not answer, because the owner answers at Core's 20-second deadline
and the caller waits 22 seconds. Two cases wait for that deadline, so a run
takes about a minute. The journey reads labels, so it does not judge the one
frame that the canvas fails to draw when a notice arrives while it is idle. The
`close-uncertain` capture shows that frame's `Render failed` banner.

A held gesture keeps the primary button down across steps. `Native::hold`
presses at a control's aim point and returns a `Held`. `Held::toward` moves in
eight steps to a point that `Native::point_in` gives as fractions of a
control's drawn bounds, and refuses a point under the avatar.
`Held::press` sends a key while the button is down, and `Held::release`
releases it. Dropping a `Held` releases the button too, so a failed case never
leaves it pressed. An app can install its drag handling only on the draw after
the press, and that draw need not change the frame. `Held::until` therefore
nudges the held pointer by one pixel and back, then reads the frame, and
repeats within the usual deadline until the expected state is drawn. It never
sleeps for a fixed time, and a gesture the app never answers fails on its
deadline. `Native::resize_window` resizes the owned window, and
`Terminal::screen` reads Core's text for a terminal once.

### Profile fixtures, live edits and a second build

A run's profile is `profile/` in the evidence directory. The app seeds a file
only when it is missing, so a fixture file wins over the shipped one.

`--profile-fixture DIR` copies `DIR` into `profile/` before the sandbox
starts. The copy keeps nested folders and refuses a link or any entry that is
not a file or a folder. A missing or unreadable `DIR` ends `run` before any
evidence exists, with `Verification unavailable: Profile fixture ... `, which is
verifier blame. An empty `DIR` gives an empty profile, the same as no flag. The
fixture is host input and stays outside the sandbox; the sandbox sees only the
copy.

The copy is checked against the fixture, and `seeded.json` in the evidence
directory records each file's hash before the sandbox starts. Before the app
launches, the run checks the profile against that record again. A seeded file
that differs then is verifier blame, because the fixture did not arrive. After
the app starts, `Native::seeded_intact(relative)` tells a journey whether the
file is still what the fixture wrote. A journey states that as an expectation,
so a product that overwrites or deletes a seeded file is product blame. A
fixture that seeded no such file is verifier blame.

`Native::edit_profile_file(relative, bytes)` replaces a file in `profile/`
while the app runs. It writes a staging file and renames it over the target, as
an editor does, and records a `profile-edit` event with the file's hash in
`actions.jsonl`. `relative` must be a relative path of plain names. An empty
path, `..`, an absolute path, or a path through a link is refused, so an edit
cannot leave the profile. The refusal is an error in the journey, which the
driver blames on the verifier.

`--second-binary PATH --second-sha256 HASH` names a second candidate build. The
two flags go together; a path without a hash is refused before anything starts.
The second build is pinned and bound read-only like the first. It must be a
different file from `--binary`. A build reads its assets from the path compiled
into it, so the run checks the second build's assets the way it checks the
first. A second build from another checkout needs `--second-assets PATH`, the
`desktop/assets` folder of that checkout, which the sandbox binds at its own
path. Without it the second build uses `--assets`, and a build that was
compiled for another path is refused before the run starts.
`Native::relaunch_with_second` needs the first build to have quit, switches the
candidate and launches it against the same profile, Core and session. It ends
the run with verifier blame when Core is not the same process after the launch,
when the second build did not launch, or when the profile folder changed between
the first build's exit and the relaunch, which only the verifier ran. The verifier
records the folder as the first build exits. Whatever the product did to the
profile before that, including deleting it, is the product's, and a case blames it
by checking the files. The `profile` journey checks that the edited theme file
survives the first build's quit.
Without `--second-binary` it is an error. `identity.json` lists `builds`, one
entry for each build that launched with its path and hash. `checks.json` names
the build under test in `binary` and `sha256`, the second build in `second`, and
repeats `builds`. A build whose hash changes during the run makes the run
inconclusive.

`--core-document NAME=FILE` seeds a Core document before the app starts. The
verifier starts Core in the sandbox, writes the JSON in `FILE` with `doc.set` at
version 0, reads it back, and only then launches the app, which connects to that
Core. A document Core does not keep, and a seed attempted after the app launched, are
verifier blame. `actions.jsonl` records a `core-seed` event with its time, and
`launch.json` records `coreSeededAt` beside `startedAt`.
`Native::seeded_document(name)` returns the version and value that were seeded
and `Native::core_document(name)` reads the current one. A layout a newer build
wrote is seeded the same way, under the name `voyager-layout-v2`.

The `profile` journey uses all four. Give it a fixture whose
`themes/voyager.json` sets a background colour and a Core document named
`voyager-verifier-probe`. Use the checked-in
`tests/native/fixtures/profile-theme` and
`tests/native/fixtures/core-document/verifier-probe.json`. Run it with a second
build:

```sh
tests/native/target/debug/voyager-verification run --journey profile --binary "$candidate" --sha256 "$expected" --second-binary "$other" --second-sha256 "$other_hash" --profile-fixture tests/native/fixtures/profile-theme --core-document voyager-verifier-probe=tests/native/fixtures/core-document/verifier-probe.json --hc-sha256 "$core" --assets "$PWD/desktop/assets" --evidence "$run_parent/profile"
```

`seeded-theme-drawn` checks that the app left the seeded theme file alone and
that the window draws the seeded background,
`live-edit-recolours` rewrites the theme and checks that the same viewer
process draws the new colour, and `second-build-keeps-voyage` quits, relaunches
with the second build and checks that the same Voyage is selected and the edited
colour is drawn, and `seeded-core-document-kept` checks that Core still holds the
seeded document at its seeded version after both builds. A colour is drawn when at least 5 percent of the window's pixels
are within 2 of it per channel. The journey checks the background token only.
The `profile` patch makes the app ignore the profile's theme file at start, so
`seeded-theme-drawn` fails.

To add a case that uses the capability, put the files in a fixture folder, add
the case after launch, edit with `edit_profile_file`, and read the result with
`Native::watch`, which polls a closure until it returns a value or patience
runs out and returns `None` without an error. Record a missing result as a
failed expectation, so it blames the product.

### Battery

`voyager-verification battery` is the post-merge check. It takes two builds, the
new head and the previous main, and runs every journey in the registry on both.

```sh
tests/native/target/debug/voyager-verification battery --base "$old/target/release/voyager-shell" --base-assets "$old/desktop/assets" --head "$new/target/release/voyager-shell" --head-assets "$new/desktop/assets" --evidence /var/tmp/battery-NEW --runs 3 --history /var/tmp/battery-history.jsonl
```

`--evidence` is a new folder. `--runs` is the number of rounds and defaults to 3.
A journey that needs inputs gets them from the battery. `profile` runs with the
committed `tests/native/fixtures` (found from `--head-assets`, or given with
`--fixtures DIR`) and the other side's build as its second binary. A journey whose
inputs the battery cannot supply is not run. `battery.json` lists it under
`not_run` with the reason, `battery.md` says so, and it counts as neither green
nor red. A battery in which nothing could run is an error.

`--threshold` is a fraction and defaults to 0.15. `--journeys a,b` limits the
list. `hc` comes from `PATH`, and its hash is taken at the start. Each build's
hash is also taken at the start and recorded. It names the file that ran. It
does not prove how the file was built. Each candidate needs its own `--assets`
folder, because a build reads the folder of the checkout that built it. The
battery prints one line for each run on standard error.

Each round runs, for every journey, the base and then the head, or the head and
then the base on alternate journeys and rounds. Both builds therefore meet the
same machine load within minutes of each other. Every run is an ordinary `run`
in its own folder under `runs/`. A run that does not pass is run once more. A
journey that fails and then passes is a flake. One that fails twice is red.

The blame is the one the run wrote. When a journey is red in more than one
round, its blame is chosen across all red rounds in a fixed order, product, then
fixture, then unknown, so the order of the rounds never changes it. A red
journey with product blame is red. A red journey with fixture or unknown blame, or a run that wrote no
`checks.json`, makes the battery `inconclusive`. The per-case status is the
worst status seen in the final attempts.

Wall time is the whole `run` command. The verdict for a journey compares the
median over the passing runs of the head with the median of the base. A head
more than the threshold above the base is a `regression`. With `--history`, the
head's median is also compared with the median of the last ten head medians in
that file, and the battery appends this head's medians to it when the result is
`green` or `flaky`. A journey needs at least two timed runs on each side to be
judged. Otherwise its timing is `unmeasured`. When timing was not compared, for example because the base was red
or the head was, the journey's `timing_note` says why, the summary lists it in
`unmeasured`, and `battery.md` repeats it. A green verdict then means only that
the head passed.

A journey flagged as a regression is rerun on both sides for 5 more interleaved
rounds, and the verdict uses all of its rounds. `rerun` in `battery.json` names
these journeys. The default stays at 3 rounds, so only a flagged journey pays
for the extra rounds.

`battery.json` is the summary a watcher reads. Its `result` is `green`, `flaky`,
`red` or `inconclusive`. `flakes`, `regressions`, `red` and `inconclusive` name
the journeys. Each journey lists both sides, their cases, every timed run, the
median and the spread, which is the range over the median. `battery.md` is a
short table of the same. `logs/` holds each run's standard error. Exit 0 is
`green` or `flaky`, 1 is `red`, and 2 is `inconclusive`.

Limits.

- Wall time includes the sandbox and display start, which every run pays equally. That fixed cost dilutes a slowdown.
- The comparison against history spans time, so machine load at different hours is a confounder. Only the comparison against the base shares load.
- Three rounds make a median of three. One slow run cannot move it, and two can. The rerun of a flagged journey is what protects against this.
- Observed on this machine, equal builds differed by at most 5 percent in every journey over three rounds, and a 400 ms sleep in the scroll path made terminal-scrolling 39 percent slower. A planted 60 ms sleep made it 5 percent slower and was not flagged. In one battery, two slow runs in three moved a journey's head median 12 percent with no code change.
- A deterministic failure costs a second run before it is called red.
- Linux X11 only.

### Profile updates

The `profile-updates` journey starts the build on a profile that an older build
wrote. Give it the checked-in `tests/native/fixtures/profile-updates`, which holds
an `installed.json` and these files under `canvas/`:

- `AGENTS.md` equals its record, so it is untouched.
- `navigation-view.js` is the version shipped before Stop session existed. It has
  no record and matches the history of shipped versions, so it is untouched.
- `icons-LICENSE.txt` differs from its record, and `icons-NOTICE.txt` has no
  record and is in no history. Both are edited.
- `retired.js` equals its record and is no longer shipped. `retired-edited.js`
  differs from its record and is no longer shipped.

```sh
tests/native/target/debug/voyager-verification run --journey profile-updates --binary "$candidate" --sha256 "$expected" --profile-fixture tests/native/fixtures/profile-updates --hc-sha256 "$core" --assets "$PWD/desktop/assets" --evidence "$run_parent/profile-updates"
```

`untouched-files-update-and-stop-session-shows` checks that the two untouched
files changed and that the Home menu offers Stop session. `edited-files-stay-as-they-were`
checks that the edited files are byte for byte as seeded and none is moved aside.
`edited-files-are-announced-with-a-diff` reads the `profile-update` controls and the
diff file. `a-dropped-file-is-deleted-only-when-untouched` checks the two retired
files. `a-second-start-changes-no-file` quits, starts again and compares the
bytes and modification times of every first-party file. The `profile-updates`
patch makes the app treat an edited file as untouched, so
`edited-files-stay-as-they-were` fails.

The journey does not use a second build. A record in the fixture stands for the
older build, which is the only way a profile reaches a new build. It does not
check that a build older than the profile's writer leaves the files alone. That is a
known gap.

### Client decorations and window requests

`--decorations client` makes the owned display look composited, so the app takes
the client-decoration path that GNOME forces on it. The default, `server`, changes
nothing. A bare Xvfb has no window manager, so GPUI sees no compositor and keeps
server decorations. `Compositor` in `src/x11/compositor.rs` holds a connection
for the whole run. It owns the selections `_NET_WM_CM_S0` and
`_NET_WM_CM_S<root window id>`, because GPUI names the selection from the root
window id and not the screen number, and it adds `_GTK_FRAME_EXTENTS` to
`_NET_SUPPORTED` on the root window. It starts before the app launches, because
GPUI checks once at startup. Whether the app then draws a title bar is the
app's choice. An app that asks for server decorations stays undecorated.

`Requests` in `src/x11/requests.rs` is a third X client with one thread. It
selects SubstructureNotify on the root window and records each ClientMessage that
a client sends to the window manager as `_NET_WM_MOVERESIZE`, `WM_CHANGE_STATE`
or `_NET_WM_STATE`. A move or resize keeps its pointer position, its direction
(`code` and `name`, so a move is code 8 and `move`, and edges are `size-top-left`
to `size-left`), the button and the source. A minimise is `change-state` with the
`iconic` state. A maximise or restore is `net-wm-state` with the action and the
two property names. Nothing in the verifier answers the requests, so no window
moves. `Native::window_requests` returns the requests about the app's window and
writes every new request to `actions.jsonl` as a `window-request` event, again at
cleanup. A journey asserts on the returned list, for example that a drag of the
top bar produced one `move` request.

After each launch under `--decorations client`, the run records a `decorations`
event with the window's `_MOTIF_WM_HINTS` and `_GTK_FRAME_EXTENTS`. The hints
`[2, 0, 0, 0, 0]` mean that the app took client decorations and `[2, 0, 1, 0, 0]`
mean that it kept server decorations. The record is an observation. The flag
makes the client path available and the app must ask for it.
The app asks for client decorations, so every run under `--decorations client`
asserts the hints `[2, 0, 0, 0, 0]` after each launch. Any other hints end the run
`inconclusive`, blamed on the fixture, because the verifier's compositor did not
take effect. `Native::decorate_as` switches a run between `server` and `client`
while the app is closed, so a case can pick the surface it needs. The
`quit-restore` journey does this for the window buttons, the corner grip, the close
button and the absent controls.

Before the app starts, a verifier-owned test client sends one move request for
the observer's own window. The observer must see it with direction 8 within the
polling patience, or the run ends `inconclusive` blamed on the fixture. That first
`window-request` event in the ledger is this test move. It names the observer's
window and never the app's. A run without `--decorations client` starts no
observer and writes no `window-request` events. A thread that failed is a cleanup
error.

### Stand-in provider

The app starts its private conversation by running `codex app-server` from
`PATH`. In the sandbox that finds the verifier binary, which sees its own name
and runs as a relay. The relay connects to `/voyager/runtime/provider.sock`,
sends a hello line with its PID and arguments, then copies the app's stdin lines
to the socket and the socket's lines to its stdout. It does not exit when stdin
closes, only when the socket closes or the app stops it.

`Provider::listen` in `src/provider.rs` owns that socket in the journey. It
answers `initialize`, `thread/start` and `turn/start` at once, in the Codex
app-server shapes the app decodes, and hands each turn to the journey. The
journey then scripts the turn with `started`, `item_started`, `delta`,
`finish`, `complete` and `fail`. No timer drives the stand-in: each frame
answers an app frame, or follows a state the journey has just observed. Every
frame in both directions is recorded in `provider.jsonl` in the evidence folder,
with its connection number. The frames are written by hand, so they are only as
faithful as the shapes in `app/src/codex_protocol.rs`. No pinned app-server
schema checks them yet.

### Core reply relay

`run --core-delay METHOD=MS[,METHOD=MS]` holds Core's replies to the named
methods for that many milliseconds, so a journey can prove what the app does
while Core is slow. The app reaches Core through a child process, `hc connect`,
that it starts from the `VOYAGER_HC` variable. With the flag, the driver sets
`VOYAGER_HC` to `/voyager/bin/hc-delay`. That is the verifier binary, which sees
its own name, starts the real `hc connect` as a child, copies the hello line
each way, then copies frames in both directions. It reads the JSON-RPC message
in each frame on channel 0. When a request names a held method, it remembers the
request identity. The matching reply waits for the delay and every other frame
passes at once, so a held reply can arrive after later replies. The request
itself is never held, so Core does the work on time and only the app's knowledge
of it is late.

A zero delay forwards the frame unchanged and records nothing. The relay is
still in the path, so zero measures the relay and not its absence. A run without
`--core-delay` has no relay. The driver's own requests to Core, including its
`doc.get` and `terminal.list` reads, go to the socket directly and are never
held, so an observation sees the true state while the app sees the delayed one.
Core accepts and answers those requests within 5 s each. When it does not, the
error reads "Core did not accept METHOD" or "Core did not answer METHOD", then
"within 5000 ms on the verifier's own connection", with the operating system's
error 11 after it, and the run is not blamed on the relay.

Each relay process writes lines to `core-relay.jsonl` in the evidence folder.
Every line is one JSON object tagged by `event` and carries `relay`, the pid and
start time of the relay process that wrote it. The app starts a new relay on each
launch and kills it when it closes its Core connection, and request identities
restart with each launch, so a hold is identified by its relay and its request
identity together.

- `alive` is written every 250 ms for as long as the relay runs, with `atMs`.
- `held` is written when a held reply arrives from Core. It holds the method,
  the request identity, the delay, and the times in milliseconds since the Unix
  epoch at which the request was seen and the reply arrived.
- `released` repeats those fields and adds `releasedAtMs`. It is written only
  after the relay has written the reply to the app's socket.
- `undelivered` repeats those fields and adds `undeliveredAtMs` and the error
  kind, in place of a release when the write fails.

`checks.json` records the delays as `coreDelay`.

After the journey the driver reads that ledger and audits it against the delays
that the flag asked for, with its own lookup into the parsed flag and not the
relay's `CoreDelay::hold`. A line that does not parse as one of these events, or
a ledger that cannot be read, ends the run the same way. Any of these ends the
run `inconclusive`, blamed on the verifier, even when a case failed first.

- A line whose method or delay the flag did not ask for. A relay that holds every
  method fails here.
- A `released` line written more than 1000 ms after `repliedAtMs` plus the
  delay. A relay that waits several times its delay fails here. In 40 runs of
  `slow-save` and `outcomes` the release was at most 3 ms late with the machine
  quiet and at most 8 ms late under 18 busy loops. In 7 runs of `quit-restore`
  it was at most 119 ms late, while other heavy builds ran on the machine, so the
  bound leaves room for that.
- A `held` line with no `released` or `undelivered` line from the same relay,
  when that relay was still writing `alive` lines more than 1000 ms after the
  hold was due. A relay that loses a held reply fails here. A relay that was
  killed before the hold was due did not lose it, which is what happens to a
  hold in flight when the app closes its Core connection.
- An `undelivered` line whose error is not `BrokenPipe`. A broken pipe means the
  app closed its end, which is the app's doing.

Gaps the audit does not close. A relay that overruns its delay by less than
1000 ms is not caught. A reply lost in the last 1000 ms of a relay's life is not
caught. A relay that writes a `released` line without writing the reply is
caught only by the journeys' own checks. `slow-save` reads `released` lines by
`releasedAtMs` and `outcomes` by `event`, and neither journey fails when either
filter is removed, so those two filters are unproved.

The driver refuses a delay it cannot apply. A method must be written in lower
case with dots and underscores, named once, and held for at most 30000 ms. After
Core is up and before the first case, the driver reads Core's own method list
from its hello reply. A method that Core does not offer ends the run
`inconclusive`, blamed on the verifier. The app has already started by then, so
that check does not stop the app from starting.

Limits. The relay reads only channel 0, so it holds replies to requests and
never the terminal data frames or events that arrive on other channels. It
cannot hold a request, reorder requests or drop a frame. It sits in front of the
one `hc connect` that the app starts, so each further bridge process is its own
relay with its own ledger lines. The app limits itself to eleven pending Core
requests, so a long delay on a busy method can make the app refuse new requests
as busy. That is the app's behavior and what the delay is for. The relay delays
the reply, not Core's work.

Observed, on one machine and with the app at the time of writing. The app sends
one `doc.set` at a time and waits for each reply, so `--core-delay doc.set=2000`
stretched the `workspace` journey from about 24 s to between 70 s and 100 s. Of
five such runs, three passed, one failed `switch-voyage` on its 12 s observation
deadline, and one ended `inconclusive` with an operating system error 11 in
`split-vessel` that no delay run explained. With `terminal.list=2000`, the
`terminal-scrolling` journey fails `exit-closes`, because the app learns of an
exit through that reply. A journey that holds a method this long therefore
measures the app's tolerance for the delay, and a failure under it is the
journey's finding about the app, not a defect of the relay.

A journey can declare the delay that it runs under. `Journey::core_delay` in
`src/journey.rs` names it, `voyager-verification journeys` prints it as
`coreDelay`, and `run` uses it when no `--core-delay` is given. A `--core-delay`
on the command line replaces it. `slow-save` declares `doc.set=1500` and `outcomes` declares
`terminal.kill=21000`.

The `slow-save` journey proves what the app answers while Core's reply to a
layout save is held. It opens the chat and starts a turn, so the stand-in can
play tool calls. Each case then creates a Fleet from the canvas and reads Core's
document directly until Core holds the new Fleet. At that moment Core has done
the save and the relay still holds the reply, so the app's save is in flight.

- `inspect-answered-during-held-save` plays one scripted workspace inspect. It
  passes when the app returned Applied, the driver had the reply before the
  relay's `releasedAtMs` for that save, and the round trip was under a quarter
  of the hold.
- `effect-answered-after-held-save` inspects first, then creates the Fleet, then
  plays a scripted rename that carries the version from that inspect. It passes
  when the driver had the reply at or after `releasedAtMs`, the app refused the
  rename because the layout changed, and the Fleet kept its saved name. A
  rename that ran during the flight would reach Core at the old version and
  come back as a Core conflict instead.

Each case reads its save from `core-relay.jsonl` as the last `doc.set` that was
requested before the scripted call was sent. The journey ends the run
`inconclusive`, blamed on the verifier, when the run holds `doc.set` for under
1000 ms, or when the driver sent its call after that save was released, because
then the two never overlapped and the app was not tested. The round trip in
`played` is the measured latency of a request with no effect during a held
save. It includes the stand-in, the conversation owner and the tool dispatch.

Limits. The journey holds only the layout save of a canvas Fleet create. It
does not hold the saves that open the new Fleet's terminal, which still block
the app's owner, so each case waits for that terminal before it ends. It plays
one scripted call during each held save, so it does not fill the app's list of
waiting effects and does not reach the busy refusal. It does not quit during a
held save.

#### Scripted tool calls

`run --provider-script FILE` gives the stand-in a list of tool calls to play
inside a turn. The file is JSON, `{"calls":[CALL,...]}`, and each call is
`{"atMs":N,"tool":"voyager_workspace","arguments":{...}}`. `atMs` is optional,
counts from the moment the journey calls `Provider::play`, and must not
decrease from one call to the next. A time is at most 60000 ms. `arguments` is
the object that the app's tool takes, with no other fields in the file. The
driver reads and checks the file before it starts anything, so a malformed file
ends the run `inconclusive` with no sandbox. `checks.json` records the script as
`providerScript`.

A later call can use an earlier result. An argument that is exactly
`{"$result":[INDEX,"/json/pointer"]}` is replaced by the value at that pointer
in the JSON that call INDEX returned. A workspace result is the app's whole
response, so `/version` is the layout version to give as `expectedVersion`, and
`/layout/selectedFleet` is the selected Fleet. A reference to a call that has not
run, or to a pointer the result lacks, ends the run `inconclusive`, blamed on
the verifier. A `--provider-script` given to a journey other than `chat` is
refused before the run starts, because only that journey plays it.

`Provider::play` first checks every scripted tool name against the tools the app
offered in its `thread/start` request. A name the app did not offer ends the run
`inconclusive`, blamed on the verifier, before any call is sent. Then it sends
each call as the provider's `item/tool/call` request, in the Codex app-server
shape, with a new call identity, and waits up to the usual patience for the
app's reply to that identity. The call therefore takes the app's real tool path.
`provider.jsonl` gets one `tool-call` line for each call, holding the call
identity, the tool, the arguments the script resolved to (`scripted`), the
arguments in the request frame as the stand-in wrote it (`arguments`), the app's
reply frame exactly as returned and the round trip in milliseconds. A refusal is a reply like any other
and is recorded as the app returned it, with `success` false or an error. The
round trip runs from writing the request to reading the reply on the socket, so
it includes the relay and the app's dispatch but not drawing. After the journey the
driver reads those lines, and one that does not hold the app's reply to its own
call, or whose written request carried arguments other than the scripted ones,
ends the run `inconclusive` at `stand-in-ledger`, blamed on the verifier even
when a case failed first. When a Core delay is also given, the driver checks both
ledgers and the report names the first that failed, `core-relay-ledger` or
`stand-in-ledger`.

The `chat` journey's `tool-call-inspect` case plays one built-in workspace
`inspect` and compares the returned selected Fleet with the saved layout. Its
`tool-call-effect` case plays the file's script when `--provider-script` is
given, and otherwise a built-in inspect followed by a rename of the selected
Fleet. For a file script it checks only that every call was answered in order,
so the journey does not know what a custom script should have done and the
reader of `provider.jsonl` must judge each result. For the built-in script it
also checks that the saved name and the drawn name are the new name. A
`--provider-script` with no calls ends the run `inconclusive` in that case,
blamed on the verifier, because nothing was played and the app did nothing
wrong. The `streamed-reply` control patch still fails first with product blame,
so the negative control runs with an empty script.

Limits. The script runs only inside a turn that the journey has started, one
call at a time, so it cannot test two calls in flight or a call that arrives
after the turn ended. It does not play callbacks the app does not support, for
example a method other than `item/tool/call`. The app allows 32 calls in a turn.
The stand-in does not count them. Result text is read as JSON when it is JSON,
so a plain-text refusal is kept as a string. The app's tool names and argument
shapes come from `contract/generated`, and nothing in the verifier checks the
script's arguments against them, so a call that the app refuses as malformed is
a refusal to read in the ledger and not a verifier error.

### Negative controls

Each journey has a patch at `tests/native/controls/JOURNEY.patch`. The patch
breaks the product in one small way. The journey's control case must fail on a
candidate that was built with the patch. `voyager-verification journeys` prints
the control case and the patch of each journey. A unit test fails when a patch
no longer applies to the current tree. The verifier never applies a patch.

To run a control, use a checkout that you can discard:

1. Apply the patch: `git apply tests/native/controls/terminal-scrolling.patch`.
   A patch that changes a canvas script changes its compiled `.js` file too,
   so no generation step is needed.
2. Build the candidate with the release command in Build and inspect below.
3. Run the journey against that candidate with a new evidence directory.
4. Confirm that the run exits 1 and that `firstFailingCheck.check` in
   `checks.json` is the control case.
5. Revert the patch with `git apply -R` and build again before any other run.

The `terminal-scrolling` patch makes the terminal ignore an upward wheel in
ordinary shell history. `normal-history` then fails on the expectation
`wheel up draws the live screen's lines lower, below earlier history`. The `workspace` patch upper-cases a
submitted name. `rename-fleet-enter` then fails on the expectation `the saved
name is the typed text`, and the observed name is `NATIVE FLEET`. The
`quit-restore` patch makes a relaunch clear the backend of a terminal that is
still live, so the app starts a second shell while the first keeps running.
`relaunch-reattaches` then fails on the expectation `Core lists the same live
terminals after the relaunch`, with two live addresses observed. The
`voyage-close` patch makes a confirmed close stop only the first program of
the Voyage. `close-voyage-confirm` then fails on the expectation `every
program of the closed Voyage stopped`, with one of its shells observed live. The
`arrangement` patch stops the split tracker from applying a saved share, so a
restore from maximize puts every divider back in the middle.
`restore-shortcut` then fails on the expectation `all three terminals are
drawn where they were before maximize`. The
`portals` patch hides the Portal column whenever a Fleet is selected.
`portal-across-fleets` then fails on the expectation `the Portal column stays
shown on every Fleet`. The `chat`
patch makes a streamed delta replace the reply instead of extending it.
`streamed-reply` then fails on the expectation `the second part extends the
first while the reply is in progress`. The final `item/completed` frame repairs
the text, so only a read taken while the reply streams catches it. The `terminal-input` patch makes Ctrl+Shift+C an ordinary key, so copy does
nothing. `copy-puts-the-selection-on-the-clipboard` then fails on the
expectation `another X client reads exactly COPYβ界 from the clipboard`, and
the observed text is the verifier's own `VERIFIER-SENTINEL`.

The `outcomes` patch makes the canvas drop the reason from a refusal.
`refused-shows-reason` then fails on the expectation `the status line says
Refused and gives the owner's reason`, and the observed status is `Refused.`.

The `slow-save` patch makes the app's owner wait for Core's reply to a layout
save before it takes the next request. `inspect-answered-during-held-save` then
fails on the expectation `the inspect was answered before Core's held reply to
the Fleet's save was released`.

`--fault kill:SECONDS` and `--fault stop:SECONDS` remain the controls for a
candidate that crashes or hangs. They work with every journey, before and
after a journey launches the candidate again.

### Build and inspect

From the selected checkout:

```sh
python3 desktop/prepare-sdk.py
CARGO_BUILD_JOBS=1 cargo build --manifest-path tests/native/Cargo.toml --locked --offline
tests/native/target/debug/voyager-verification check-lifecycle
```

The offline build uses dependencies already available on this development machine.
It does not establish fresh-machine installation. The crate needs no GPUI linkage
or second SDK checkout. The parent Cargo patch warnings concern unused SDK crates;
do not alter or remove the shared SDK configuration to hide them.

Unit tests that need a folder take one from `Scratch` in `src/scratch.rs`. Each
folder is `vv-<label>-<pid>-<time>` in the temporary folder and holds an
exclusive lock on its `alive.lock` file. The lock is taken under another name and
renamed into place, so `alive.lock` is never unlocked while its owner lives.
Dropping the guard removes the folder, including after a failed assertion. The
kernel releases the lock when a test process is killed. The first `Scratch` in
each test process then removes every `vv-` folder whose `alive.lock` it can lock,
and it removes `alive.lock` last so that an interrupted removal is retried. It
leaves folders without `alive.lock` alone and reports a folder it cannot remove.
The process ID in a folder name is only for reading, never for liveness.

The commands below exercise the release build in this checkout. Build it first
with `cargo build --release --locked -p voyager-desktop --bin voyager-shell`.

```sh
candidate="$PWD/target/release/voyager-shell"
expected=$(sha256sum "$candidate" | cut -d" " -f1)
core=$(sha256sum "$(command -v hc)" | cut -d" " -f1)
tests/native/target/debug/voyager-verification doctor --binary "$candidate" --sha256 "$expected" --hc-sha256 "$core" --assets "$PWD/desktop/assets"
run_parent=$(mktemp -d /var/tmp/voyager-verification-XXXXXX)
tests/native/target/debug/voyager-verification run --journey terminal-scrolling --binary "$candidate" --sha256 "$expected" --hc-sha256 "$core" --assets "$PWD/desktop/assets" --evidence "$run_parent/scrolling"
```

For a retained candidate, take the expected hash from its reviewed build receipt.
Take the `hc` hash from the Core release you intend to test. Computing a hash
from an arbitrary file alone does not establish build provenance. Doctor checks
both hashes, the installed tool paths and the sandbox canary without launching
an app. Actual readiness additionally requires the owned display, exact window
title and PID, measured viewport, Core identity and bound shell established by
the run.

### Hermetic runs

`run` and `doctor` start bubblewrap (`/usr/bin/bwrap`) with an empty environment
before any other process. The journey driver, its D-Bus session, Xvfb, the
candidate, Core and each shell run inside one user, mount, PID, network, IPC and
UTS namespace. `src/sandbox.rs` owns the namespace, the environment table and
the canary. The host needs bubblewrap and unprivileged user namespaces.

The sandbox root is an empty tmpfs. It holds only these paths:

| Path in the sandbox | Source |
| --- | --- |
| `/usr`, `/etc` and the `/bin`, `/sbin`, `/lib` and `/lib64` links | The host's, read-only. |
| `/proc`, `/dev` and `/tmp` | New and private. |
| `/voyager/runtime` | A private tmpfs. It is `XDG_RUNTIME_DIR` and holds the Core socket. |
| `/voyager/bin/hc` | The hashed `hc`, read-only. It is the only `hc` on `PATH`. |
| `/voyager/bin/codex` | The verifier binary itself, read-only. Under that name it runs as the stand-in provider's relay, so the app's private conversation never reaches a real model. It does nothing until the app starts a conversation. |
| `/voyager/bin/hc-delay` | The verifier binary itself, read-only. Under that name it runs as the Core reply relay. It does nothing unless `--core-delay` names it as the app's Core bridge. |
| `/voyager/home` | `home/` in the evidence directory. It is `HOME`. |
| `/voyager/home/project` | The fixture project. It is the app's working directory, so it becomes the Voyage. |
| `/voyager/home/second-project` | An empty second folder. The `workspace` journey moves one shell into it before it creates a Voyage. |
| The verifier, the candidate and the `--assets` folder | Read-only, at their host paths. |
| The evidence directory | Writable, at its host path. |

The environment is the `ENVIRONMENT` table in `src/sandbox.rs`, plus the private
`DBUS_SESSION_BUS_ADDRESS`, `DISPLAY`, `HC_SESSION` and `HC_SOCKET` that the
driver sets. No variable comes from the caller. The table forces Mesa software
rendering. On a host with a vendor GPU driver, Xvfb otherwise loads that
driver's EGL library and crashes, because the sandbox has no GPU devices. The
network namespace has loopback only. It also hides the host's abstract sockets,
which include the real X server.

The candidate reads its avatar artwork from the `desktop/assets` folder of the
checkout that built it. Name that folder with `--assets`. Without it the app
does not start.

`hc` comes from the caller's `PATH` and must match `--hc-sha256`. `doctor.json`
records its path and hash. The verifier refuses a different binary before it
starts anything, and the driver checks the bound copy again before each launch.

Before the driver starts Xvfb, a canary inside the sandbox looks for the host
session. It looks for the home folder, `/run/user/<uid>`, each socket in that
folder (the session bus and the Wayland socket are two of them) and the X11
sockets. The canary compares device and inode numbers, so it opens no connection
to the real session. `containment.json` holds one result for each resource.
`absent` means that the path does not exist in the sandbox. `replaced` means
that a different object is at that path, for example an empty parent folder of
the candidate. `reached` means that the sandbox can see the host object, and it
makes the run inconclusive. `doctor` runs the same canary and prints the results
under `containment`.

Before its first case, `terminal-input` checks that the fixture home holds no
`.bashrc`, `.bash_profile`, `.profile` or `.inputrc` (`plain_shell` in
`src/sandbox.rs`). It adds a `startup-file` entry for each name and a
`first-shell` entry with the first shell's `argv` to `containment.json`. A
file that is present ends the run `inconclusive`, because the journey would
then measure a line editor's startup and not the app. Readline still reads the
host's `/etc/inputrc`.

The sandbox does not virtualize the kernel, and `/usr` and `/etc` are the
host's. A different host package set can still change a result.

### One implementation and one result contract

Rust owns the migrated journey, probe, input, capture, identity, recording and
cleanup. It starts Xvfb and runs `xrdb` once, and calls no Python driver. Every run creates
its own sandbox, D-Bus session, Xvfb, home folder, app profile and Core session.
Core remains the terminal/process owner. Existing-only JSON-RPC observation uses
the dedicated Unix socket and never starts or reconnects a lost Core. Shutdown
uses that same Core API after checking its recorded identity.

The input target must remain the recorded viewer and session. Before each input
the driver checks that the window belongs to the candidate's PID and carries the
session's title, that keyboard focus is on that window, and that the pointer is
over it. It is not proof of a general accessibility adapter or physical input
latency.

#### Locating controls

The driver starts the candidate with `--inspect inspection-N.json` in the
evidence folder, a new file for each launch, and parses each frame with the
`Frame` type from the `voyager-contract` crate (see
[the inspection endpoint](../../docs/inspection.md)). A journey names a control
with a `Target` from `src/inspection.rs`. A `Target` pairs a role with the key
that the app gives that role, and its constructors take the id types of the
contract. No input method takes a coordinate, except `Native::drag_between`,
which takes two points inside a named control.

Before a pointer input, the driver waits for the target's element and converts
its bounds to device pixels with `window.scale` and the window's origin on the
screen. The driver aims at the centre of the element. If the avatar's reported
bounds cover that centre, the driver aims at the centre of the largest part of
the element that the avatar leaves clear, because a click on the avatar
activates the avatar and never reaches the control. A Portal column drawn over
a control (`portal-area`) is an obstacle in the same way, unless the control
lies inside that column. The driver first takes the part of the element that
each column leaves clear, then the part that the avatar leaves clear. After the pointer moves,
the driver reads the frame again and aims again if the element no longer
contains the pointer. It records each miss in `actions.jsonl` as a `re-aim`
event with both aims, and it waits 80 ms before the next attempt. A frame that
lists the target under `ambiguous` ends the run as a product failure, because
the product drew one control twice. A frame drawn for another window size is ignored. The
frame is polled every 10 ms. When the deadline passes, the journey ends
`failed`, blamed on the product, and the error names the missing role and key.
The app marks `terminal` only once the terminal view is attached, so the
driver clicks and types only after that element appears.

`settle` in `src/system.rs` is the one rule for waiting. It reads a value
again and again. A value counts only after every read has returned it
unchanged for 150 ms, and a read that returns no value starts the 150 ms
again. `settle` returns a value that counts as soon as that value is the
wanted one. When the deadline passes, it returns the value that counts at
that moment, wanted or not, and it returns nothing when no value counts.

`observe` in `src/native.rs` is the one way to wait for an outcome that must
happen. Every 80 ms it reads the layout document (`doc.get`, parsed as the
`Layout` type of the contract, with its version) and the latest frame, and
gives `settle` the value of its check. A glance that has no frame, no
document, no value or an unprepared workspace gives no value. Every value is
wanted, so `observe` returns the first value that counts. When the deadline
passes, the journey ends `failed`, blamed on the product.

`Native::settle` reads the same way for a value that a case will judge, and
`observe` is `Native::settle` with every value wanted. It returns the value
once the value is the wanted one and counts. When the deadline passes it
returns the value that counts at that moment, so the case states a named
expectation about that value and `firstFailingCheck` shows what the app drew.
A value from an unprepared frame, or from a frame that no longer shows the
control, never counts. If no value counts when the deadline passes, the
journey ends `failed`, blamed on the product, and the error names what never
held still. The `workspace` journey uses `Native::settle` for the draft of
the rename editor, for the text of a name after a rename, for the editor that
F2 opens, for what a split or a creation draws and for the controls that a
relaunch draws.

A glance pairs the layout document with the latest frame, and nothing says
which document a frame drew. The app saves a change before it draws it. Until
that draw is published, a glance holds the new document beside a frame from
before the input, and that frame is still `prepared`. On a loaded machine
this lasts longer than 150 ms. A wait after an input therefore names what the
input must draw. Its check gives a value only from a frame that shows that
result, or its wanted value requires that result. A frame from before the
input cannot show a control that the input creates, so the wait goes on, and
every frame value that the case judges comes from the glance that showed the
result. The same rule holds for a capture that a later capture is compared
with. `terminal-input` takes such a capture only once it shows what the
program drew last. That is the waiting block of the `draw` probe, and the
prompt below the text to select. `split-vessel` wants the terminals of both Vessels drawn, with the new
one to the right. `create-fleet` and `create-voyage` want the new tab, row and
Vessel drawn under their saved names, and they read the dock from that glance.
Before this rule, `create-fleet` waited only for the new Fleet in the document
and judged the frame of the first glance that held. On a correct candidate, 2
of 20 runs on a loaded machine then failed `the new Fleet's tab and Vessel are
drawn`, on a frame from before the click. A candidate that publishes every
frame 700 ms late fails the same way on a quiet machine.

A launch ends with `observe`. The canvas sends no workspace action while a
workspace request is in progress, so a click on the sidebar toggle during the
first preparation is lost. In 5 of 10 runs at `--window 1180x820 --sidebar
collapsed`, a driver that clicked the toggle as soon as the toggle was drawn
never saw the sidebar collapse. The canvas reports that state itself, as
`prepared` in each frame (see
[the inspection endpoint](../../docs/inspection.md)), and the driver waits for
that report. The driver does not guess it from the drawn terminals.

Pointer input is a click, a double-click, a hover, a wheel or a drag. A drag
aims at its destination before it presses, because the avatar follows the
pointer once it is held. A drag is one press at the source, one move to the
destination and one release, with no pause. The avatar starts to float on the
first move of more than 7 logical pixels with the button held, and it docks
where the button is released (`moving` and `released` in
`desktop/src/avatar.rs`). The button is released even when the move fails.

`Native::drag_between` drags inside one control, between two points in device
pixels relative to the window. A journey takes the points from a capture. The
driver refuses a point that is outside the control or under the avatar. It
presses at the first point, moves to the second in 4 equal steps and releases,
and it releases the button even when a move fails.

Keys are typed. `Key` in `src/x11.rs` is the one list of named keys, and a
`Chord` adds Ctrl, Shift or Alt to a key. `Terminal` in `src/native/terminal.rs` binds
one terminal Vessel by its placement. It owns the terminal's Core address and
shell identity, its captures and its wheel input, so a journey without a
terminal does not wait for one. `Terminal::first` reads the layout document
(`doc.get`, parsed as the `Layout` type of the contract). A document that does
not parse as `Layout` is a fixture error. Rebuild the verifier from the
candidate's checkout. `line` clicks its own terminal before it types, so the
text cannot reach another control that holds the keyboard. `enter` types `cd`
with a folder and waits until Core reports that folder for the shell.
`Terminal::bind` binds the terminal of one Vessel, and `Terminal::first` binds
the first one. Every bound shell is adopted, so cleanup waits for its exit and
`processes.json` lists it as `shell PLACEMENT`. The `workspace` journey binds
the shell of every Vessel that it creates. `split_right` in
`src/journey/layout.rs` is the one way to split a Vessel with a terminal, and
`workspace` and `terminal-input` both use it. `Terminal::foreground` returns
the name of the program that Core reports in the terminal's foreground. It
reads again until Core names one. In 1 of 10 runs on a loaded machine, one
`terminal.get` reply carried no `foreground` while `timeout 30 yes flood`
ran, between two replies that named `timeout`. A journey that judged that
reply failed a correct candidate.
`Terminal::shown` waits up to 12 s for a capture that shows a named thing. It
serves readiness, which no case judges. `Terminal::echoed` types a long shell
line in pieces of 16 characters and waits until Core's screen ends with each
piece before it types the next. The app queues at most 64 frames for Core and
drops a key that arrives while the queue is full. In 1 of 10 runs on a loaded
machine, a 190-character line typed in one burst at the 1 ms pace lost two
characters, and the terminal showed `Core output queue is full; frame was not
queued`. A piece that the shell does not echo is never typed again. It ends
the journey `failed`, blamed on the product, with the typed text beside the
screen's text. A terminal that has lost the keyboard fails the same way. After
`drag-selects-text`, `terminal-input` types with `echoed` and `press` on the
terminal that already holds the keyboard, because a click would start a new
selection.

One `x11rb` connection to the owned display carries all input (XTEST) and
capture (`GetImage`). A second connection belongs to the verifier's clipboard
owner, described below, and carries nothing else. A terminal capture is the `terminal` element's area, with
the avatar's reported bounds blanked. After an input, `Terminal::settled` gives
`settle` a capture every 10 ms for up to 4 s. It returns the capture once the
capture is the expected one and has not changed for 150 ms. After 4 s it
returns the capture that has not changed for 150 ms, and the case decides pass
or fail. A terminal that never holds still for 150 ms ends the journey
`failed`, blamed on the product. No
step waits a fixed time for the app. Key events are 1 ms apart, as with the
earlier `xdotool --delay 1`: typed back to back, 2 of 10 runs lost characters.

Xvfb runs with `-noreset`. By default it resets when its last client
disconnects. While the driver ran one process per action, that reset discarded
the `Xft.dpi: 192` resource, so the candidate drew at scale 1 in a 1450 by 940
window. It now draws at scale 2, in a 2900 by 1880 window. A reset during
cleanup also left Xvfb deaf to SIGTERM in 1 of 30 runs.

`Owned::stop` in `src/system.rs` stops a process that the driver owns. It
sends SIGTERM and waits up to 12 s for the exit. While it waits, it sends
SIGTERM again every second. An X server checks its exit flag and then sleeps
in its poll. A signal that lands between the two only sets the flag, and the
server sleeps on until something else wakes it. Under a debugger, an Xvfb that
took SIGTERM at that point was still asleep in `ep_poll` 5 s later, and a
second SIGTERM ended it within 0.04 s. Before the driver repeated the signal,
Xvfb outlived the 12 s wait in 2 of 744 runs, both on a loaded machine, and
both runs ended `inconclusive`. Nobody inspected those two runs while they
hung. Three later runs were inspected. In each, 0.4 s after its last client
had gone, Xvfb was asleep in `ep_poll` with no signal pending and a timer
about two minutes away. Two left as soon as a tracer attached, and the third
left on the second SIGTERM. So each had its exit flag set while it slept.

Cleanup stops the display while the driver's X connection is still open, and
closes the connection afterwards. Closing the last connection wakes the
server, and a SIGTERM sent right after the close arrives while the server is
on its way back to its poll. The three sleeping displays were in 128 runs
that closed the connection first. In 120 runs that stopped the display first,
no stop needed a second signal. That difference is too small to prove that
the order matters. A bare Xvfb with one client slept through 1 of 37,000
stops that closed the connection first, so the close alone does not explain
three in 128.

A stop that needed more than one signal is a `repeated-stop` event in
`actions.jsonl`, with the process and the number of signals. If the process is
still alive at the deadline, the driver reads its state, the kernel function
that it sleeps in and its system call from `/proc`, kills it, records all of
that as a `forced-stop` event and reports a cleanup error. A cleanup error
still prevents a pass.

The verifier's clipboard owner (`Clipboard` in `src/x11/clipboard.rs`) is a
second X client with its own connection, an unmapped window and one thread.
The clipboard owner is the one exception to the single X connection. It must answer the
app's request for the clipboard while the journey waits in `settle` on the
first connection. On one connection the app would wait out its 4 s timeout.
The owner also lets a journey read what the app copied as another X client
does. The app answers its own paste from a cache while it owns CLIPBOARD, so a
copy and a paste inside the app prove nothing about X.

Only the owner's thread waits on that connection, for events and for replies.
The journey's thread sends it a command through a channel and wakes it with a
ClientMessage to the owner's window. `own` takes CLIPBOARD and confirms the
owner with `GetSelectionOwner`. The thread answers `TARGETS`, listing
`TARGETS` and `UTF8_STRING`, and it answers `UTF8_STRING`. It refuses any
other target with the property None. `read` converts CLIPBOARD to
`UTF8_STRING` and gives the owner of the clipboard 4 s. It returns the text,
`refused` or `unanswered`. `owner` returns the window that owns CLIPBOARD.
The thread records each request that it served or refused, with the name of
the target, the requestor and the time, and each `SelectionClear`.
`Native::clipboard` writes that record to `actions.jsonl` as `clipboard`
events when a journey reads it and again at cleanup. Every wait has a
deadline. The owner's connection gives the display 5 s to answer, as the
first connection does, and a wait for an event that runs that long starts
again.

Cleanup stops the clipboard owner first, before the viewer, Core and the
display. It sends the thread a stop command, wakes it, joins it and then drops
the connection. The first connection is still open then, so the display does
not lose its last client. A thread that failed is a cleanup error. Before its
first case, `terminal-input` owns a canary text and reads it back. A canary
that does not come back ends the run `inconclusive`, blamed on the fixture.

`--window WIDTHxHEIGHT` resizes the candidate's window in device pixels, and
`--sidebar open|collapsed` sets the sidebar with its own toggle. Both apply
again after reattachment and do nothing when the window already matches.

Each launch moves the candidate's window to the origin of the display. The
app opens its 2900 by 1880 window at 362, 260, which puts the right 262 and
the bottom 140 device pixels outside the 3000 by 2000 screen, and the pointer
cannot leave the screen. An aim point outside the display is a fixture error.

The result is `checks.json`. Exit 0 means the named runtime journey passed;
exit 1 means an observed behavior failed; exit 2 means verification was
inconclusive or unavailable.

An error inside the journey is blamed after the fact (`diagnose` in `src/native.rs`):

| Observation when the journey stopped | Verdict |
| --- | --- |
| Candidate exited or was killed, or is stopped, during a case or when the last case ends | `failed`, blamed on the product |
| Core exited while the candidate ran | `failed`, blamed on the product |
| A bound shell died or Core reports another program for its terminal (`Terminal::same_program`), or the candidate quit with a failure status (`Native::close`) | `failed`, blamed on the product |
| Timeout while the display still answers | `failed`, a hang, blamed on the product |
| A case's expectation did not hold | `failed`, and `firstFailingCheck` names the case, the expectation and the observed values |
| The save or the capture after a failed case failed | `failed`. The failed case stands, and `actions.jsonl` holds the error as an `unkept` event |
| A case returned no expectation, or an observed value could not be recorded | `inconclusive`, blamed on the fixture |
| `drive` returned without running a declared case although no case failed | `inconclusive` |
| Owned display exited or stopped answering, a host tool is missing, failed or ran out of time, the sandbox refused, or an unrelated verifier error | `inconclusive` |
| Cleanup or evidence write failed, or the candidate or Core changed on disk | `inconclusive` |

A case whose expectation did not hold is recorded as `failed` only while the
candidate is still running. A stopped candidate keeps its last frame and its
last pixels, so a wait would otherwise judge the hang as an expectation that
the product did not meet. If the candidate has exited or is stopped when a
case returns such a verdict, the case is `interrupted` and the first row
applies.

`Terminal::same_program` reports a defect only when the shell's process is
gone or Core names another program for the terminal. A Core request that
fails there is diagnosed like any other error, so it is a product failure
only when Core has exited.

`Acknowledge` is a real event. It fires only when at least one recorded action
(an input the display answered, or a host command) completed successfully after
dispatch, and a match is rejected without it. `run` accepts `--fault kill:SECONDS` or `--fault stop:SECONDS`, a test-only
control that sends SIGKILL or SIGSTOP after that delay to the candidate that is
running then. Each launch records its candidate's identity for the fault, and
the fault checks that identity before it sends the signal. If no candidate is
running when the delay ends, because the journey closed it and has not launched
it again, the fault goes to the next candidate that the journey launches.
When the last case ends, the driver withdraws a fault that has not fired, so
the fault cannot reach the candidate during diagnosis or cleanup. The journey
then ends in an error if its candidate has exited or is stopped. A fault that
fires after the last case therefore ends the run `failed`, blamed on the
product, and a run whose fault fired cannot pass.
`checks.json` records the fault, and a fault that never fires before the journey ends makes the run inconclusive. Liveness reads the candidate's own process state, so a zombie counts as exited, and the candidate gets a one second grace to finish dying before an error is blamed on the fixture. `--assets` is required. Before launch, `doctor` and `run` refuse an assets folder that is not the `assets` folder next to the path the candidate was built for, or that lacks a frame file the candidate names.

A `failed` or `inconclusive` run also writes `bundle/` in the evidence folder:
`summary.json` (the first failing check and which side to blame), `processes.json`
(exit code or signal and state of the candidate, display, Core and shell),
`core-doc.json` and `core-terminals.json` (read-only `doc.get` and `terminal.list`
at failure time), `inspection.json` (the candidate's latest inspection frame),
`final-screen.png`, the last four captures, `actions-tail.jsonl`
(the last 60 ledger lines) and `core/` (Core's logs). The candidate runs with
`RUST_LOG=debug` and `RUST_BACKTRACE=full`; its stdout and stderr go to `native.log`,
and the display's to `display.log`. The current candidate writes nothing to
`native.log` at that level, so an empty file is expected for a clean start. A failed cleanup or evidence write cannot become a
pass. Quality review remains a separate required result, never inferred from a
runtime pass. Preserve an incomplete or failed directory; a new run needs a new
directory. There is no replay of failed input commands. Observation polling is
read-only. Each input intent and command acknowledgement is recorded separately.

`core-relay.jsonl` holds each held Core reply when `--core-delay` was given.

`actions.jsonl` preserves commands, input intents and acknowledgements, the
start of each case, Core requests and replies, and capture hashes. A pointer
intent carries its target, the element's region, the aim point and the frame
sequence that the driver aimed from. A read that the driver repeats while it
waits (`doc.get`, `terminal.read`) is recorded only when its reply differs
from the previous reply, so the ledger shows inputs and changes.
`inspection-N.json` holds the last frame of each launch. `observations.json` holds the observed cases. Screenshots have unique names.
`doctor.json`, `launch.json`, `identity.json`, native/display logs and `checks.json`
retain candidate and environment identities. `identity.json` names the bound
Core, each build that launched and each Core that the journey stopped, in order. `profile-edit` events in `actions.jsonl` record each live profile edit. A case that ends
with the candidate closed records an `unkept` event in place of its window
capture. `sandbox.json` records the session
name and the complete bubblewrap command. `containment.json` holds the canary
results, and the shell entries that `terminal-input` adds. The verifier records its own binary and source fingerprints. Changed
Rust source requires a rebuild before a run.
Evidence is outside Git and survives resource cleanup. `home/` keeps what the
app, Core and the shell wrote under `HOME`, and the fixture project. The runtime
folder and `/tmp` are tmpfs and end with the namespace.

When the driver finishes, bubblewrap exits and the kernel kills every process
left in the PID namespace. On SIGINT or SIGTERM, `run` kills the namespace,
returns after its last process is gone and exits 2. If `run` itself is killed,
SIGKILL included, bubblewrap dies with it and the kernel kills the namespace.
In that case a process can take a moment to disappear after `run` is gone. A
run that ends early leaves its evidence directory without `checks.json`. Treat
it as inconclusive and start a new run in a new directory. A timeout is not
permission to replay.

### Finite verification

`src/proof.rs` explores the actual `Run::step` and `Run::verdict` functions in
`src/lifecycle.rs`, not a separately translated model. The event macro defines
both the enum and its exhaustive list. The finite state includes phase and eight
Boolean facts, so there are at most 1280 representable states; 212 are reachable.
All eleven events are considered from every reachable state, including cycles.

The independent properties are: a pass requires Finished, an actual observation,
dispatch, an acknowledged command, evidence and successful cleanup, with neither unavailable nor failure;
dispatch cannot occur twice; Finished accepts no further events; rejected events
leave state unchanged; acknowledgement cannot create observation; a crash or mismatch always records failure; recorded
evidence cannot be erased. The trace on failure is a shortest discovered path.

This checks the whole-journey reporting gate. It does not model each key event,
the scheduler, external process behavior, the correctness of the observations or
Voyager's full state machine. The native journey and independent review are
separate evidence. Kani is not installed or used. Its separate toolchain and
unsupported concurrency do not earn their cost for this small closed state space.
Reconsider a code verifier when the next concrete property needs one.

### ETC, orthogonality and DRY

| Principle | Required review | Present ownership |
| --- | --- | --- |
| Easy to change | A new journey reuses setup, identity, recording and cleanup. A platform change does not rewrite expected feature behavior. | `journey.rs` owns the journey registry and case verdicts; `journey/scrolling.rs`, `journey/workspace.rs`, `journey/quit_restore.rs` and `journey/input.rs` describe the journeys; `native.rs` handles the app window; `native/input.rs` owns pointer, key and clipboard input; `native/terminal.rs` owns a bound terminal and reads its captures; `x11.rs` owns the display connection, `x11/clipboard.rs` the verifier's clipboard owner, `x11/compositor.rs` the compositor that client decorations need and `x11/requests.rs` the window-request observer; `inspection.rs` reads frames and names controls; `system.rs` owns process/recording/polling/Core primitives. |
| Orthogonality | Product code does not depend on the fixture; the reporting gate is independent of I/O. Core owns programs. | Standalone development crate; pure `lifecycle.rs`; platform dependencies remain outside the app. |
| DRY | One owner defines each run rule and action. Repeated text alone is not evidence of duplicated knowledge. | One native command, journey list, event list, reporting gate, recorder, polling loop, input/capture adapter, locator and shutdown path for the migrated journeys. The frame and layout types are the app's own. |

These are review criteria, not an automated universal quality score. The retained
legacy platform helpers are a migration gap. Do not add a private runner for a new
feature. Extend this fixture, or record the missing capability and its bounded
migration. Retire an old implementation only after equivalent real-surface checks
pass. Do not change old assertions to make migration easier.

This crate is maintained as its own product with its own tests. Architecture
rules live in `tests/architecture/`.

### Inspected sources

The pstack generators and Codex mapping were inspected in Michael Denyer's port
at `bc09365fe61c725c486ba95157fc4048bf8a0b99`, version 0.9.135, with its retained MIT
notice and declared upstream pstack revision. They guided the project skills,
real-surface proof, negative control, maintenance and evidence requirements.
No global plugin hook or workflow policy was activated.

Herdr Core was inspected at its 0.1.19 source revision
`06793ede1bedb1fed8d22d3cae476d3eb239edf0`: AGENTS.md, README.md,
`crates/herdr-core/src/client.rs`, `cli.rs` and `server.rs`. In particular,
`hc connect` can autostart; the adapter instead uses the published plain JSON-RPC
socket protocol with no start behavior. Herdr App guidance was inspected at
`1581a587919dddd6f1efd5f78eb542c4b2b02cb5`. Upstream approval policies remain upstream.

The scrolling checks judge the lines that a capture draws, not whether the
screen changed. A terminal capture masks the terminal's 8-pixel padding, scaled
to device pixels, and the avatar. Each run of pixel rows that holds a pixel other
than the background is one drawn line, identified by the SHA-256 of its pixels.
After wheel up, the lines of the live screen must appear again at one common
distance lower. Every one that lands at or above the lowest line either capture
draws must be drawn there, so a terminal that leaves its lower rows blank fails.
At least one line must be drawn above them, and in shell history every line
above must be one the live capture does not draw, so a terminal that repeats the
live screen as its history fails. Wheel down must restore the exact live capture. In `arrows` and `mouse`,
the probe draws `SCROLL` lines from its position, so its lines must move by as
many rows as its position changed. `reattached-history` first prints 60 short
`REATTACH` lines, so the live screen holds only lines that the journey printed,
and after the relaunch the live screen must draw the same lines at the same
places. A capture that holds still for 150 ms is not proof that the app drew
what Core already holds. Under load the app can go longer than that without
painting. The journey therefore keeps the shell's first prompt line as a
reference. Before `normal-history` and `reattached-history` type their
`printf`, each holds a capture whose last drawn line is that prompt. The live
screen that each case keeps must differ from that capture and again end with
the prompt, which the shell prints only after the last line of output. A
screen that still shows the earlier commands, the half-typed command or only
part of the output therefore never stands as the live screen. In `arrows` and
`mouse`, the capture taken before the first wheel must draw exactly the
probe's 30 `SCROLL` lines and the cursor on the row below them, so the shell
with the probe command still being typed, or a probe screen drawn only in
part, is never taken as the probe's screen. The checks do not claim a scroll distance for shell history or the cell
that a wheel report names; both are gaps.

`foreign-exit` types `hc run --no-parent` for `/usr/bin/true` into the placed
shell, so a program outside the app starts in the run's Core session, and waits
until Core reports it finished. The saved layout version must
stay the same and the placed terminal must stay shown with no new Vessel.
`exit-closes` then proves that the placed shell's exit closes its Vessel
through Core's finished event, not through the canvas's observation. The
canvas observes the workspace, waits 3 s and observes again, and an observation
also closes an exited panel. The case writes a loop to `~/tick` in the run's
home and types only `. ~/tick` into the placed shell, because under heavy load
the app can refuse a keystroke as busy and a long typed line then loses a
character. Every 50 ms the loop writes the wall-clock time to `exit-ticks/at-N` and then changes
into `exit-ticks/tick-N`. The canvas's Vessel label names the folder that its
last observation listed, so the first label that names `tick-N` shows that an
observation listed Core's terminals after the time in `at-N`. The canvas's next
observation cannot start until 3 s after that. The case then creates
`exit-ticks/stop`; the loop ends and the shell exits. A newer layout must be saved
before the time in `at-N` plus 3 s, and the Vessel must then leave the drawn
frame. The deadline does not depend on machine speed: a build that waits for the
observation misses it under any load, and load only takes margin from a build
that closes on the event. The case records `observed tick`, `refresh margin ms`,
`exit to saved ms` (from `stop` to the newer saved layout, at the fixture's 80 ms
poll) and `exit to closed ms` (from `stop` to the drawn closure, at its 80 ms
glance). `exit to closed ms` is the exit-to-shown delay. The case assumes that
nothing else saves the layout or observes the workspace in that interval, which
holds after `foreign-exit` because that case leaves the layout unchanged.

The native Rust probe accepts only SGR wheel buttons 64 and 65 with two nonempty decimal coordinates. Other mouse buttons and malformed reports cannot move its counter. The probe counts the wheel reports and the cursor keys that move it, and it writes both counts to its state file. The `arrows` case expects cursor keys and no wheel reports, and the `mouse` case expects wheel reports and no cursor keys. The focused parser regression was observed failing before this correction; both crate regression tests pass afterward.

The probe has four modes, parsed into `Mode` in `src/probe.rs`. `arrows` and
`mouse` serve `terminal-scrolling`. `keys` and `draw` serve `terminal-input`.
Every mode puts the terminal in raw mode and restores its modes when it ends.
In raw mode Ctrl+C arrives as a byte and raises no signal. `keys` enters the
alternate screen, asks for application cursor keys with `--application-cursor`
and for bracketed paste with `--bracketed-paste`, and then draws a ready block
in one truecolor. It saves every byte that it reads to its state file after
each read. It ends on Ctrl+D (`0x04`), which it does not save. `draw` draws a
waiting block in another colour and then waits for three files beside its
state file. They carry the state file's name with the extensions `go`, `back`
and `end`. On `go` it enters the alternate screen and draws two blocks of text
at fixed rows and columns. On `back` it leaves the alternate screen. Its state
file names the stage that it reached.

A journey types to a `keys` probe only after it sees the ready block in a
capture. The app parses output in order, so a drawn block shows that the app
has parsed the modes that the probe set before it. The state file alone shows
only that the probe wrote them. A journey also checks that no ready block is
drawn before it starts a probe, so the block that it then sees belongs to that
probe. No case waits on a status that the shell reports itself. Core drops
such a status within about 100 ms.

`boxes`, `changed` and `repainted` in `src/native/terminal.rs` read a capture
by colour. `boxes` finds each box that a capture draws in one colour and
counts the pixels of another colour inside it, which are glyph ink. `changed`
bounds the pixels that differ between two captures. `repainted` lists the
colours that a later capture draws where an earlier one drew a given colour.
A colour matches within 1 per channel. The app draws a selected run of cells
in two shades that differ by 1 in one channel (observed on Mesa software
rendering), so one colour means one colour within that tolerance. The helpers
give device pixels relative to the window, as `drag_between` takes them.

## Retained Python journey reference

These are retained pre-migration drivers, not the native environment default.
Execution requires `--legacy-reproduction`; read-only help remains available.
This reference preserves earlier journey details and limitations for parity work.
Select one route explicitly:

- `--foundation` reproduces retained native product journeys with this launcher and these helpers.
- `--reference` runs the retained Electron fixture.
- `--native-mod-host` uses this shared launcher with the historical native-content working directory and its retained canvas/Notes journeys.
- `--native-avatar` runs the original avatar experiment's own historical driver.

Root help lists the choices. Route help lists that driver's options:

```sh
python prove.py --help
python prove.py --foundation --help
python prove.py --reference --help
python -m unittest discover -s tests/native -p test_routes.py
```

The route/path checks do not launch an app, model, Core or desktop-input session.
Compile or inspect input scripts without importing them: the native input script
opens a desktop session when executed. Native journeys still require the actual
candidate binary, a unique session/profile/evidence path and serialized input.

The migrated helper source retains binary/profile/session, process/window and
input-target identity checks. Foundation app cwd is the repository root; legacy
native-content cwd remains experiments/native-content. Binary resolution retains
the existing caller-relative --binary behavior, so use an explicit binary path.
Moving source does not reaccept an old journey or prove the migrated native path.
Keep historical failures and separately gated product behavior in their existing
records. Root coordinates the next actual native verification.

`--foundation --journey feedback-ux` checks the reviewed rename, sidebar/chat,
voice-control placement and Portal-menu changes. `rename-typing` runs only its
rename comparison. Both use the same launcher, pointer and cleanup helpers.
Rename typing sends ordinary keys without Ctrl+A or a per-character delay.
The recorder reuses the actual Mutter capture stream and measured crop, writes
a bounded video, and records its decoded frame count. Its resampled 30 fps video
supports visual review; it does not measure input-to-paint latency. Preserve the
recorded monitor scale and window origin for a matched comparison. A capture on
another scaled monitor is not a pixel-matched result.

Use `--legacy-reproduction --foundation --review --launch --compositor` with the same explicit binary,
session, evidence and desktop environment to leave a review app open. This mode
captures the window and closes its input helper. It retains the app and its
processes, records no passed journey, and marks `reviewOnly` in its receipt.

The `notes-configuration` native journey still checks the former heading and
cold-Quit behavior. Its runtime acceptance is pending an update for the current
Notes and detach requirements. Passing route checks only confirms routing and
fixture source checks; it does not accept that journey.

The `terminal-scrolling` journey covers primary-screen history, alternate-screen
arrow fallback, program mouse reporting and same-program reattachment. It uses
the ordinary compositor input path, or `--isolated-x11 XVFB_PID` for a separately
started, same-user Xvfb display. The isolated adapter verifies the exact Xvfb
process/display and keeps the launcher's candidate input guards. Its measured
terminal rectangle requires the recorded 1450 by 940 viewport. Set
`VOYAGER_SCROLL_ISOLATED_X11=1` only for that isolated route. This path does not
establish physical touchpad behavior or native IME. `VOYAGER_SCROLL_AGENT=1` adds
one real installed-Codex response and captures actual wheel navigation and typing.
Fixture cleanup explicitly ends only its verified dedicated Core after app Quit;
that cleanup is separate from the application's detach policy.
