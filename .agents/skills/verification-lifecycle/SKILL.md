---
name: verification-lifecycle
description: Check VoyagerShell's finite Rust verification reporting gate and keep its properties synchronized with the actual code. Use after changes to run transitions, verdicts, evidence or cleanup classification; this does not verify the whole application or external concurrency.
---

# Verification lifecycle

Read tests/native/README.md and the project constraints. The checked promise is
that an unobserved, unfinished, unrecorded or unclean run cannot report passed.
A false pass would let later work rely on behavior that was never established.

## Coverage and scope

The implementation is Run::step and Run::verdict in tests/native/src/lifecycle.rs.
The independent invariant checker is tests/native/src/proof.rs. Runtime calls are
in tests/native/src/main.rs. The current event list and finite Rust state type
define the entire checked domain. The checker explores all reachable states and
all ten events, including cycles. The platform, semantic validity of observations,
OS scheduling, physical input and product-wide behavior are outside that proof.

The event macro generates both the enum and exhaustive event list. A new field or
event changes the domain and needs invariant review. Read every covered-code diff,
including moved code, before calling a previous pass current. The executable
rejects source drift against its embedded fingerprint. A successful rebuild does
not replace checking that the stated properties still describe the changed code.

## Run

From the selected checkout:

```sh
python3 desktop/prepare-sdk.py
CARGO_BUILD_JOBS=1 cargo build --manifest-path tests/native/Cargo.toml --locked --offline
tests/native/target/debug/voyager-verification check-lifecycle
```

The result names the source fingerprint and reachable state count. A failed check
prints the shortest discovered path in Rust event names. Translate that sequence
into plain steps and check each step against actual runtime code. Classify a
failure as a code defect, verification drift or unavailable check. Do not weaken a
property to make it pass. A blocked check cannot advance its sync record.

## Show that the check can fail

In an isolated, coordinated mutation window with no native run using this build,
remove the unfinished-state guard from Run::verdict, rebuild and run the same
command. The checker must reject the variant because a pass is possible before
Finish. Restore exact bytes, rebuild, then confirm the original check passes.
Preserve both outputs and source hashes. Never leave the mutation in place.

An independent reviewer must choose and run a relevant negative control. The
first review found that the earlier invariant missed this break; the original
missed-mutation receipt remains preserved. The corrected invariant explicitly
requires Finished. Passing a model without demonstrating defect detection is not
a completed skill.

## Maintenance and sync record

The source sync and exercised fingerprint are recorded in
tests/native/verification-sync.json. Advance them only after reviewing covered
source, checking the unchanged properties and repeating a relevant mutation. Use
pstack maintain-formal-verification-skill for this upkeep, adapting its ownership
to the existing Rust fixture. Kani and TLA+ are not used by this check; a different
tool needs a concrete property and explicit supported scope. ETC, orthogonality
and DRY still require the separate code review described in the owner README.
