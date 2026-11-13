# Building VoyagerShell

This repository is the standalone successor to the core-workspace prototype in voyagershellapp. The native candidate uses Rust application code and GPUI views. The Electron workspace and its local content packages remain under experiments/electron-reference/. Herdr Core is an external dependency, not copied implementation code.

Use Node 24 and the hc command on PATH. The generated Core input is pinned to 0.1.16. The 7 November native restore and Notes/shutdown journeys passed against installed Core 0.1.18. This is evidence for that tested additive upgrade, not every future release. Codex is needed only for real companion chat or voice. Ordinary tests do not call a model.

From the repository root, for the retained Electron reference:

```sh
npm --prefix experiments/electron-reference ci
npm --prefix experiments/electron-reference run format:check
npm --prefix experiments/electron-reference test
npm --prefix experiments/electron-reference start
```

Use a dedicated VOYAGER_WORKSPACE_SESSION for experiments. The default profile name is unchanged from the source prototype. Do not point destructive proving at an owner's session. Application start does not establish that an agent completed work.

On contract branches, also run npm run typecheck and npm run contract:check. The earlier experimental content Rust crate lives in experiments/typed-content/contract/. When changing it, run cargo fmt --check, cargo test --locked and cargo clippy --locked --all-targets -- -D warnings from that directory. Keep lockfiles and generated declaration drift checks intact.

New native verification uses the Rust environment in [tests/native](tests/native/README.md), invoked directly as `tests/native/target/debug/voyager-verification`. Read the project verify skill. Build the locked verifier after SDK preparation, run doctor against a reviewed candidate/hash, and use a named supported journey with a fresh evidence directory. The current implemented journey is Linux X11 terminal scrolling. Workspace, Portal, compositor, provider and other legacy journeys are migration gaps, not implicit fallbacks. Do not infer microphone audibility, compositor behavior or another operating system from X11.

Extend the shared environment when a capability is missing. Preserve failing evidence, diagnose fixture versus product, independently demonstrate a fixture repair and rerun the affected behavior. Reuse shared actions, identities, evidence and cleanup; do not create feature-private runners or ad hoc Python/shell proving programs. ETC, orthogonality and DRY apply to this environment as well as the app. Runtime pass, finite proof and quality review remain separate required evidence. Follow CONSTRAINTS.md even when calling code development infrastructure.

The retained Python routes require `--legacy-reproduction` for driver execution. Route help remains available without effects. These routes preserve earlier coverage and enable parity comparison; they do not establish that coverage in Rust. Their non-launch path checks use `python3 -m unittest discover -s tests/native -p test_routes.py`; the default-refusal regression uses `test_rust_route.py`. Unit/source checks do not establish a native journey. Retire old drivers only after named real-surface parity and applicable approval.

The selected native workspace uses one root Cargo workspace and build-only Node dependencies:

```sh
python3 desktop/prepare-sdk.py
npm ci --ignore-scripts
npm run format:check
npm test
npm run contract:check
cargo fmt --all --check
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo build --release --locked -p voyager-desktop --bin voyager-shell
```

`prepare-sdk.py` checks out the pinned upstream GPUI Kit revision in the user
cache, applies the reviewed native-overlay patch in `desktop/patches/`
and writes a local Cargo override for the shared SDK crates. Run it before
native Cargo or Node checks. Later Cargo commands use that configuration
normally. `python3 desktop/prepare-sdk.py --check` verifies the prepared source
and configuration without changing them. Existing unrelated source or Cargo
configuration is preserved with an explicit error. The cache path includes
the revision and patch digest and is shared by matching worktrees. Keep the
machine-local `.cargo/config.toml` out of commits. The SDK patch adds one native
view slot below sheets/dialogs; application code still owns Voyager's avatar.

The preparer also verifies the checksum-pinned Linux platform archive and applies
the presentation patches described in [desktop/patches/README.md](desktop/patches/README.md).
Their separate cache path includes both patch digests. X11 presentation and the
window's monitor clock stay in that platform boundary. Application contracts,
terminal ownership and avatar timing remain in their existing owners. Installed
registry sources are preserved. Record the selected patches with the measured
release artifact; preparing a dependency does not establish a performance gain.

The current workspace checkpoint is described in [docs/workspace.md](docs/workspace.md). Its Core-backed shell works in a Fleet Vessel or persistent Voyage Portal. The terminal-grid candidate demonstrated native colored Unicode, alternate screen and dynamic sizing, as described in [docs/terminal.md](docs/terminal.md). Its continuation adds selection, clipboard and native composition source, with the actual native journeys still open. Full terminal behavior and integrated avatar/chat remain unfinished. The combined checkpoint is under review. Performance measurements use the resulting `target/release/voyager-shell` and record the exact artifact and workload. Debug build timings do not establish release runtime performance.

## Retained journey reproduction

The following describes retained Python coverage pending migration. Use it only for an explicitly selected reproduction or parity comparison. Preserve its candidate, unique session, debugging port and new evidence directory. A later --quit requires that same explicit route, evidence and candidate. The focused terminal journey is:

```sh
python3 prove.py --legacy-reproduction --foundation --journey portal-terminal --launch --binary target/release/voyager-shell --session voyager-unique-name --evidence /absolute/new/evidence --desktop-env /absolute/desktop-environment.json
```

This journey verifies shell input/output, known refusal and explicit Refresh, retained Portal process identity across Fleet changes, rename-to-terminal focus and a refused sibling that must not block the Portal. Its final cleanup explicitly stops only its dedicated Core session after the application quits. It does not establish the application's full Quit lifecycle.

The `terminal-reported-status` journey uses two ordinary Fleets and
literal OSC 7501 shell reports, with Chat closed and no Refresh. It requires
`--compositor` for word-by-word native review when static AX text is unavailable.
Its cleanup observes product Quit and recorded exits without a later Core call.
Its bounded Linux run checks the reported words, clear/child-only/nonreporting
unknown and hidden-Fleet arrival. Constructed shell reports do not establish
that every agent integration emits them or that a reported done means success.

CONSTRAINTS.md owns the review rules. Keep a fresh independent review and relevant negative control. A dependency install or green unit suite does not complete a user-facing increment.

Make one logical change per PR. Preserve the existing MIT license and source attribution. Local task specs/plans remain untracked. Do not commit profiles, screenshots, transcripts or credentials. Merging, installation and replacing a demo are separate owner decisions.

The native avatar and content experiments are retained under experiments/gpui-avatar/ and experiments/native-content/. Their Cargo manifests build those experiments only; they do not establish the working foundation. Shared original artwork lives in desktop/assets. Historical reproduction uses the root prove.py routes with --legacy-reproduction and an explicitly selected isolated binary/session. New verification extends the native Rust environment. Native performance measurements require cargo build --release and the resulting target/release executable, with the exact artifact and all helper processes recorded.

`npm test` checks the current TypeScript composition and generated JavaScript
before its Node tests. It runs the headless Rust declaration exporter and needs
the native linker libraries. After contract changes run `npm run contract:generate`;
after composition or registration changes run `npm run scripts:generate`.
The profile's seeded JavaScript remains independently editable. See
[script authoring](docs/workspace.md#script-authoring-and-checking).

## Integration and release sequence

1. Commit and push each complete increment, then open its PR against main or its published prerequisite. Keep one clear dependency path. Record experiment-only and unfinished work separately.
2. Review the increment against the master outcome, architecture and exact UX references. Run the required ordinary checks, actual interaction and relevant failure. Preserve failed evidence and report open acceptance gates.
3. Build review candidates from committed source. Record the source revision, dependency preparation and immutable release executable. A canonical build must not depend on unpublished edits or an untracked implementation.
4. Merge verified increments with the owner's applicable approval while work continues. Verify main contains the selected source and reconcile the PR stack before beginning another independent feature. Do not defer all integration until release day.
5. Archive completed task records and finished experiments, retaining experiment branches. Delete merged feature branches only after preservation and ancestry checks. Keep any checkout still needed by a running session or build until its replacement is verified.
6. Run the complete foundation and release checks on the integrated main revision. Resolve or explicitly report remaining gates before release. A merged PR or a working preview does not itself establish release acceptance.
