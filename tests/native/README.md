# Native verification environment

This is the Rust slice of the maintained native fixture. It runs the journeys in
its journey registry on an owned Linux X11 display. The journeys are
`terminal-scrolling` and `workspace`, which covers Voyages, Fleets and Vessels.
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
| Portal/content/authority/provider journeys | Existing Python coverage retained; Rust migration and parity incomplete. |
| Compositor/drag/IME/audio, other OS and performance | Not established by this pilot. Coordinate existing repair and input ownership. |
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
Core and binds that Core's identity. The verifier never starts a Core.
`Native::live_terminals` returns the sorted addresses of the terminals that
Core reports live. `Terminal::program` returns the state, PID and `argv` that
Core reports for a terminal, and whether the bound shell is still the same
process. A journey judges these values as expectations. `Native::context_click`
aims at a control the way `click` does and presses the secondary button,
which the X11 adapter sends as button 3. A journey names the intent, not the
button number.

### Negative controls

Each journey has a patch at `tests/native/controls/JOURNEY.patch`. The patch
breaks the product in one small way. The journey's control case must fail on a
candidate that was built with the patch. `voyager-verification journeys` prints
the control case and the patch of each journey. A unit test fails when a patch
no longer applies to the current tree. The verifier never applies a patch.

To run a control, use a checkout that you can discard:

1. Apply the patch: `git apply tests/native/controls/terminal-scrolling.patch`.
   A patch that changes a header script changes its compiled `.js` file too,
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
program of the closed Voyage stopped`, with one of its shells observed live.

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
contract. No input method takes a coordinate.

Before a pointer input, the driver waits for the target's element and converts
its bounds to device pixels with `window.scale` and the window's origin on the
screen. The driver aims at the centre of the element. If the avatar's reported
bounds cover that centre, the driver aims at the centre of the largest part of
the element that the avatar leaves clear, because a click on the avatar
activates the avatar and never reaches the control. After the pointer moves,
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
result. `split-vessel` wants the terminals of both Vessels drawn, with the new
one to the right. `create-fleet` and `create-voyage` want the new tab, row and
Vessel drawn under their saved names, and they read the dock from that glance.
Before this rule, `create-fleet` waited only for the new Fleet in the document
and judged the frame of the first glance that held. On a correct candidate, 2
of 20 runs on a loaded machine then failed `the new Fleet's tab and Vessel are
drawn`, on a frame from before the click. A candidate that publishes every
frame 700 ms late fails the same way on a quiet machine.

A launch ends with `observe`. The header sends no workspace action while a
workspace request is in progress, so a click on the sidebar toggle during the
first preparation is lost. In 5 of 10 runs at `--window 1180x820 --sidebar
collapsed`, a driver that clicked the toggle as soon as the toggle was drawn
never saw the sidebar collapse. The header reports that state itself, as
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

Keys are typed. `Key` in `src/x11.rs` is the one list of named keys, and a
`Chord` adds a modifier to a key. `Terminal` in `src/native/terminal.rs` binds
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
the shell of every Vessel that it creates.

One `x11rb` connection to the owned display carries all input (XTEST) and
capture (`GetImage`). A terminal capture is the `terminal` element's area, with
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

`actions.jsonl` preserves commands, input intents and acknowledgements, the
start of each case, Core requests and replies, and capture hashes. A pointer
intent carries its target, the element's region, the aim point and the frame
sequence that the driver aimed from. A read that the driver repeats while it
waits (`doc.get`, `terminal.read`) is recorded only when its reply differs
from the previous reply, so the ledger shows inputs and changes.
`inspection-N.json` holds the last frame of each launch. `observations.json` holds the observed cases. Screenshots have unique names.
`doctor.json`, `launch.json`, `identity.json`, native/display logs and `checks.json`
retain candidate and environment identities. `identity.json` names the bound
Core and lists each Core that the journey stopped, in order. A case that ends
with the candidate closed records an `unkept` event in place of its window
capture. `sandbox.json` records the session
name and the complete bubblewrap command. `containment.json` holds the canary
results. The verifier records its own binary and source fingerprints. Changed
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
| Easy to change | A new journey reuses setup, identity, recording and cleanup. A platform change does not rewrite expected feature behavior. | `journey.rs` owns the journey registry and case verdicts; `journey/scrolling.rs` and `journey/workspace.rs` describe the journeys; `native.rs` handles the app window; `native/input.rs` owns pointer and key input; `native/terminal.rs` owns a bound terminal; `x11.rs` owns the display connection; `inspection.rs` reads frames and names controls; `system.rs` owns process/recording/polling/Core primitives. |
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
places. The checks do not claim a scroll distance for shell history or the cell
that a wheel report names; both are gaps.

`foreign-exit` types `hc run --no-parent` for `/usr/bin/true` into the placed
shell, so a program outside the app starts in the run's Core session, and waits
until Core reports it finished. The saved layout version must
stay the same and the placed terminal must stay shown with no new Vessel.
`exit-closes` then proves that the placed shell's exit closes its Vessel
through Core's finished event, not through the header's observation. The
header observes the workspace, waits 3 s and observes again, and an observation
also closes an exited panel. The case writes a loop to `~/tick` in the run's
home and types only `. ~/tick` into the placed shell, because under heavy load
the app can refuse a keystroke as busy and a long typed line then loses a
character. Every 50 ms the loop writes the wall-clock time to `exit-ticks/at-N` and then changes
into `exit-ticks/tick-N`. The header's Vessel label names the folder that its
last observation listed, so the first label that names `tick-N` shows that an
observation listed Core's terminals after the time in `at-N`. The header's next
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

## Retained Python journey reference

These are retained pre-migration drivers, not the native environment default.
Execution requires `--legacy-reproduction`; read-only help remains available.
This reference preserves earlier journey details and limitations for parity work.
Select one route explicitly:

- `--foundation` reproduces retained native product journeys with this launcher and these helpers.
- `--reference` runs the retained Electron fixture.
- `--native-mod-host` uses this shared launcher with the historical native-content working directory and its retained header/Notes journeys.
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
