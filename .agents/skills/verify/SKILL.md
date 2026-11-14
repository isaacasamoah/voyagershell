---
name: verify
description: Verify VoyagerShell native behavior through its maintained fixture, preserving candidate identity, raw evidence and owned cleanup. Use for native feature changes and fixture diagnosis; `voyager-verification journeys` lists the Rust journeys, which cover Linux X11 only.
---

# Verify VoyagerShell

Read CONSTRAINTS.md, CONTRIBUTING.md and tests/native/README.md. Functionality,
easy change, orthogonality and one authoritative definition per rule all matter.
Use the native Rust environment directly. Missing capability means extend this
environment and keep the requested behavior unverified. Never create a private
runner, inline proving program or Python acceptance script, or drive the human's app. Keep native observations, finite checks and quality review
as separate evidence. Missing proof is not a pass.

## Launch

Work in the selected checkout. Prepare the pinned SDK and build once:

```sh
python3 desktop/prepare-sdk.py
CARGO_BUILD_JOBS=1 cargo build --manifest-path tests/native/Cargo.toml --locked --offline
```

The scoped example below uses an actual retained build and reviewed hash. Select
another candidate only with its source/build receipt. Each run automatically owns
a new sandbox, Xvfb, D-Bus session, home folder, profile and Core session. The
sandbox is a private user, mount, PID and network namespace with a fixed
environment, so the caller's variables, home folder and desktop session cannot
reach the run. Never provide a live desktop or existing profile. The checked
viewport is 1450 by 940.

## Doctor

Run this read-only check first and after anything surprising:

```sh
candidate="$PWD/target/release/voyager-shell"
expected=$(sha256sum "$candidate" | cut -d" " -f1)
core=$(sha256sum "$(command -v hc)" | cut -d" " -f1)
tests/native/target/debug/voyager-verification doctor --binary "$candidate" --sha256 "$expected" --hc-sha256 "$core" --assets "$PWD/desktop/assets"
```

Doctor establishes the candidate hash, the `hc` hash and tool availability. It
also runs the sandbox canary. Every `containment` entry must read `absent` or
`replaced`. `reached` means that the sandbox can see the host session, and
doctor exits 2. `--assets` names the `desktop/assets` folder of the checkout
that built the candidate. Launch readiness
additionally verifies the actual window, Core and shell. A stopped Core must not
be implicitly restarted by an observation. The Rust adapter uses existing-only
socket requests. A changed verifier source fingerprint requires a rebuild.

## Drive

Read features/README.md and the selected feature file. `voyager-verification
journeys` prints each native journey with its cases, the sidebar state it needs
and its negative control. For scrolling:

```sh
run_parent=$(mktemp -d /var/tmp/voyager-verification-XXXXXX)
tests/native/target/debug/voyager-verification run --journey terminal-scrolling --binary "$candidate" --sha256 "$expected" --hc-sha256 "$core" --assets "$PWD/desktop/assets" --evidence "$run_parent/scrolling"
```

Exit 0 is a named runtime pass, 1 is observed failure, and 2 is inconclusive or
unavailable. Unsupported journeys and actual-Codex requests are refused. There is
no implicit legacy fallback. Existing Python drivers require --legacy-reproduction
for selected historical reproduction/parity work; they do not extend native
coverage. Read the capability gaps in the owner README before claiming completion.

## Evidence

Inspect checks.json, doctor.json, containment.json, sandbox.json,
observations.json, actions.jsonl, the process identities and screenshots.
observations.json lists every declared case with its status, its expectations
and the values it observed. For scrolling, inspect both wheel directions and
normal history.
Verify the candidate and verifier fingerprints. The action ledger distinguishes
an intent, acknowledgement and later observation. Do not infer rendered behavior
from a service reply alone. Review ETC, ORTH and DRY against the owning criteria in
tests/native/README.md; retain the independent review and source identity.

On a failure, preserve the original directory. Distinguish setup/driver failure
from an observed product defect. Repair a confirmed fixture problem in this common
source, prove the repair with an independent negative control, then rerun the
affected app behavior. Record a bounded unresolved result and next action if the
repair cannot be completed; do not silently substitute a custom rig. Never replay an uncertain effect or weaken an assertion.

## Negative control

Each journey has a control patch in tests/native/controls/. A candidate built
with the patch must fail the journey's control case. Follow Negative controls
in tests/native/README.md, in a checkout that you can discard. If the control
run passes, the journey cannot detect that defect. Report a fixture defect.

## Cleanup

The run stops its recorded viewer, asks only its dedicated Core to stop through
the existing Core API, checks recorded program exits, then stops its owned Xvfb.
Inspect cleanupErrors and evidenceRetained. A cleanup error prevents a pass.
In actions.jsonl, a `repeated-stop` event names a process that needed a second
SIGTERM, and a `forced-stop` event says where a process that had to be killed
was stuck.
Raw evidence and the run's home folder remain. When the run ends for any reason,
a kill of the verifier included, the kernel kills every process in its
namespace. Do not kill by process name, edit global configuration or delete a
previous run. An interrupted run has no checks.json. Treat it as inconclusive.

## Maintenance

Use pstack maintain-verification-skill's source/feature and live reproof principles
within this fixture's actual scope. Its historical skill-directory edit scope is
adapted to the existing owning tests/native source; do not duplicate scripts inside
the skill directory. Use verification-lifecycle when changing the run gate. A
source-only audit is not native coverage. This skill does not authorize merge,
release, global installation or changes to the user's running app.
