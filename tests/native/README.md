# VoyagerShell verification environment

This is the first Rust slice of the maintained native fixture. It verifies terminal
scrolling on an owned Linux X11 display. The accepted application remains unchanged.
The existing Python dispatcher remains the single public entry point. `--rust`
selects the explicit migration candidate; unsupported journeys fail rather than
falling back. The other Python journeys are retained, not claimed as migrated.

## Build and inspect

From the selected checkout:

```sh
python3 desktop/prepare-sdk.py
CARGO_BUILD_JOBS=1 cargo build --manifest-path tests/native/Cargo.toml --locked --offline
python3 prove.py --foundation --rust --check-lifecycle
```

The offline build uses dependencies already available on this development machine.
It does not establish fresh-machine installation. The crate needs no GPUI linkage
or second SDK checkout. The parent Cargo patch warnings concern unused SDK crates;
do not alter or remove the shared SDK configuration to hide them.

The commands below exercise a retained, immutable experiment candidate with a known
build receipt. Its source was the current-skills scrolling fix from the earlier
paired replay, not current foundation acceptance.

```sh
candidate=/home/isaac/the-workshop/.worktrees/experiment-pstack-replay/experiments/pstack-replay/current/artifacts/voyager-shell-current
expected=eae291d9f8c772371de788884efc2469841cb8c817bfa57c95bcdc17e1f7f62d
python3 prove.py --foundation --rust --doctor --binary "$candidate" --sha256 "$expected"
run_parent=$(mktemp -d /var/tmp/voyager-verification-XXXXXX)
python3 prove.py --foundation --rust --journey terminal-scrolling --binary "$candidate" --sha256 "$expected" --evidence "$run_parent/scrolling"
```

For another candidate, take the expected hash from its reviewed build receipt.
Computing a hash from an arbitrary file alone does not establish build provenance.
Doctor checks the executable hash and installed tool paths without launching an
app. Actual readiness additionally requires the owned display, exact window title
and PID, measured viewport, Core identity and bound shell established by the run.

## One implementation and one result contract

Rust owns the migrated journey, probe, input, capture, identity, recording and
cleanup. It calls installed native tools, not a Python driver. Every run creates
its own D-Bus session, Xvfb, private XDG paths, app profile and Core session.
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
retain candidate and environment identities. The verifier records its own binary
and source fingerprints. Changed Rust source requires a rebuild before a run.
Evidence is outside Git and survives resource cleanup. Scratch data remains named
in the result for inspection; this prototype does not recursively delete it.

SIGINT and SIGTERM request cooperative cancellation. The driver stops issuing input
at its next checked boundary and still attempts cleanup. A command can take up to
eight seconds and a Core read up to five seconds before returning. SIGKILL, kernel
failure and power loss cannot guarantee cleanup. Retain the run identity and
inspect it before any later cleanup; a timeout is not permission to replay.

## Finite verification

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

## ETC, orthogonality and DRY

| Principle | Required review | Present ownership |
| --- | --- | --- |
| Easy to change | A new journey reuses setup, identity, recording and cleanup. A platform change does not rewrite expected feature behavior. | `scrolling.rs` describes the journey; `native.rs` handles the platform/app window; `system.rs` owns process/recording/Core primitives. |
| Orthogonality | Product code does not depend on the fixture; the reporting gate is independent of I/O. Core owns programs. | Standalone development crate; pure `lifecycle.rs`; platform dependencies remain outside the app. |
| DRY | One owner defines each run rule and action. Repeated text alone is not evidence of duplicated knowledge. | One dispatcher, event list, reporting gate, recorder, input/capture adapter and shutdown path for the migrated journey. |

These are review criteria, not an automated universal quality score. The retained
legacy platform helpers are a migration gap. Do not add a private runner for a new
feature. Extend this fixture, or record the missing capability and its bounded
migration. Retire an old implementation only after equivalent real-surface checks
pass. Do not change old assertions to make migration easier.

Count this entire authored verification crate, the dispatcher and one-off checks
in acceptance inventories. A Rust implementation is still proving code; calling
it development infrastructure does not exempt it from CONSTRAINTS.md. Full
acceptance stays open when the test-size gate fails. YAML architecture rules and
Jev judgments are not implemented by this increment.

## Inspected sources

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
