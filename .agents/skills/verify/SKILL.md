---
name: verify
description: Verify VoyagerShell native behavior through its maintained fixture, preserving candidate identity, raw evidence and owned cleanup. Use for native feature changes and fixture diagnosis; the first Rust journey covers Linux X11 terminal scrolling only.
---

# Verify VoyagerShell

Read CONSTRAINTS.md, CONTRIBUTING.md and tests/native/README.md. Functionality,
easy change, orthogonality and one authoritative definition per rule all matter.
Use the existing prove.py entry point. Never create a feature-private runner or
drive the human's app. Keep native observations, finite checks and quality review
as separate evidence. Missing proof is not a pass.

## Launch

Work in the selected checkout. Prepare the pinned SDK and build once:

```sh
python3 desktop/prepare-sdk.py
CARGO_BUILD_JOBS=1 cargo build --manifest-path tests/native/Cargo.toml --locked --offline
```

The scoped example below uses an actual retained build and reviewed hash. Select
another candidate only with its source/build receipt. Each run automatically owns
a new Xvfb, D-Bus session, profile, XDG paths and Core session. Never provide a
live desktop or existing profile. The checked viewport is 1450 by 940.

## Doctor

Run this read-only check first and after anything surprising:

```sh
candidate=/home/isaac/the-workshop/.worktrees/experiment-pstack-replay/experiments/pstack-replay/current/artifacts/voyager-shell-current
expected=eae291d9f8c772371de788884efc2469841cb8c817bfa57c95bcdc17e1f7f62d
python3 prove.py --foundation --rust --doctor --binary "$candidate" --sha256 "$expected"
```

Doctor establishes the candidate hash and tool availability. Launch readiness
additionally verifies the actual window, Core and shell. A stopped Core must not
be implicitly restarted by an observation. The Rust adapter uses existing-only
socket requests. A changed verifier source fingerprint requires a rebuild.

## Drive

Read features/README.md and the selected feature file. For scrolling:

```sh
run_parent=$(mktemp -d /var/tmp/voyager-verification-XXXXXX)
python3 prove.py --foundation --rust --journey terminal-scrolling --binary "$candidate" --sha256 "$expected" --evidence "$run_parent/scrolling"
```

Exit 0 is a named runtime pass, 1 is observed failure, and 2 is inconclusive or
unavailable. Unsupported journeys and actual-Codex requests are refused. There is
no implicit legacy fallback. Other surfaces retain their existing explicit route;
they have not migrated into this Rust acceptance claim.

## Evidence

Inspect checks.json, doctor.json, observations.json, actions.jsonl, the process
identities and screenshots. Inspect both wheel directions and normal history.
Verify the candidate and verifier fingerprints. The action ledger distinguishes
an intent, acknowledgement and later observation. Do not infer rendered behavior
from a service reply alone. Review ETC, ORTH and DRY against the owning criteria in
tests/native/README.md; retain the independent review and source identity.

On a failure, preserve the original directory. Distinguish setup/driver failure
from an observed product defect. Repair a confirmed fixture problem in this common
source, prove the repair with an independent negative control, then rerun the
affected app behavior. Never replay an uncertain effect or weaken an assertion.

## Cleanup

The run stops its recorded viewer, asks only its dedicated Core to stop through
the existing Core API, checks recorded program exits, then stops its owned Xvfb.
Inspect cleanupErrors and evidenceRetained. A cleanup error prevents a pass.
Raw evidence and named scratch state remain. Do not kill by process name, edit
global configuration or delete a previous run. After an interrupted/unknown run,
inspect the exact recorded identities before any further effect.

## Maintenance

Use pstack maintain-verification-skill's source/feature and live reproof principles
within this fixture's actual scope. Its historical skill-directory edit scope is
adapted to the existing owning tests/native source; do not duplicate scripts inside
the skill directory. Use verification-lifecycle when changing the run gate. A
source-only audit is not native coverage. This skill does not authorize merge,
release, global installation or changes to the user's running app.
