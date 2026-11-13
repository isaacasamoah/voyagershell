# Native verification environment

This is the first Rust slice of the maintained native fixture. It verifies terminal
scrolling on an owned Linux X11 display. The accepted application remains unchanged.
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
The active worktree SPEC.md owns the comprehensive initiative design; it is local
and remains unaccepted as a complete implementation.

| Capability | Implemented status |
| --- | --- |
| Owned X11 scrolling, input/capture/identity, evidence and cleanup | Implemented for the fixed measured viewport; see evidence limits below. |
| Hermetic runs | Implemented with bubblewrap. Each run and each `doctor` checks it with a canary. See Hermetic runs below. |
| Finite reporting gate and regression controls | Implemented for the actual Rust gate, not app/OS behavior. |
| ETC/ORTH/DRY checks | Required independent review criteria; not an automatic architecture score. |
| Versioned request/result contract and independent receipt conformance | Planned. Pilot receipts are evidence, not a certified acceptance validator. |
| Workspace/Portal/content/authority/provider journeys | Existing Python coverage retained; Rust migration and parity incomplete. |
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
cleanup. It calls installed native tools, not a Python driver. Every run creates
its own sandbox, D-Bus session, Xvfb, home folder, app profile and Core session.
Core remains the terminal/process owner. Existing-only JSON-RPC observation uses
the dedicated Unix socket and never starts or reconnects a lost Core. Shutdown
uses that same Core API after checking its recorded identity.

The input target must remain the recorded viewer and session. The first adapter
requires the checked 1450 by 940 viewport on a 3000 by 2000 Xvfb at DPI 192.
It refuses other geometry. This coordinate-bound adapter is deliberately narrow;
it is not proof of a general accessibility adapter or physical input latency.

The result is `checks.json`. Exit 0 means the named runtime journey passed;
exit 1 means an observed behavior failed; exit 2 means verification was
inconclusive or unavailable. A failed cleanup or evidence write cannot become a
pass. Quality review remains a separate required result, never inferred from a
runtime pass. Preserve an incomplete or failed directory; a new run needs a new
directory. There is no replay of failed input commands. Observation polling is
read-only. Each input intent and command acknowledgement is recorded separately.

`actions.jsonl` preserves commands, input intents, Core requests/replies and capture
hashes. `observations.json` holds the observed cases. Screenshots have unique names.
`doctor.json`, `launch.json`, `identity.json`, native/display logs and `checks.json`
retain candidate and environment identities. `sandbox.json` records the session
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
both the enum and its exhaustive list. The finite state includes phase and seven
Boolean facts, so there are at most 640 representable states; 124 are reachable.
All ten events are considered from every reachable state, including cycles.

The independent properties are: a pass requires Finished, an actual observation,
dispatch, evidence and successful cleanup, with neither unavailable nor failure;
dispatch cannot occur twice; Finished accepts no further events; rejected events
leave state unchanged; acknowledgement cannot create observation; recorded
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
| Easy to change | A new journey reuses setup, identity, recording and cleanup. A platform change does not rewrite expected feature behavior. | `scrolling.rs` describes the journey; `native.rs` handles the platform/app window; `system.rs` owns process/recording/Core primitives. |
| Orthogonality | Product code does not depend on the fixture; the reporting gate is independent of I/O. Core owns programs. | Standalone development crate; pure `lifecycle.rs`; platform dependencies remain outside the app. |
| DRY | One owner defines each run rule and action. Repeated text alone is not evidence of duplicated knowledge. | One native command, event list, reporting gate, recorder, input/capture adapter and shutdown path for the migrated journey. |

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

The native Rust probe accepts only SGR wheel buttons 64 and 65 with two nonempty decimal coordinates. Other mouse buttons and malformed reports cannot move its counter. The focused parser regression was observed failing before this correction; both crate regression tests pass afterward.

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

`--foundation --journey session-quit` uses a fresh dedicated session and profile.
It checks warm close/restore, normal Ctrl+Q detach, and deliberate reopening of
that same profile and Core session. The journey verifies the original Core and
shell PID/start identities, retained layout and fresh terminal output after
reopening. On the successful path it explicitly exits its fixture shell, verifies
no live fixture terminals remain, and stops only the dedicated Core. A failed or
uncertain journey records its last observations without replaying an effect.
It does not exercise private-provider conversation or voice.

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
