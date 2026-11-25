# Building VoyagerShell

This repository is the standalone successor to the core-workspace prototype in voyagershellapp. The native candidate uses Rust application code and GPUI views. The Electron workspace and its local Vessel packages remain under experiments/electron-reference/. Herdr Core is an external dependency, not copied implementation code.

Use Node 24 and the hc command on PATH. The generated Core input is pinned to 0.1.18, the oldest supported release; see [the Core adapter](docs/terminal.md#core-adapter) for its evidence. Newer releases are tested additive upgrades, not a guarantee for every future release. Claude Code is needed only to run Voyager and Codex only for the chat panel. Voice runs on a local model. Ordinary tests use stand-ins and do not call a model.

From the repository root, for the retained Electron reference:

```sh
npm --prefix experiments/electron-reference ci
npm --prefix experiments/electron-reference run format:check
npm --prefix experiments/electron-reference test
npm --prefix experiments/electron-reference start
```

Use a dedicated VOYAGER_WORKSPACE_SESSION for experiments. The default profile name is unchanged from the source prototype. Do not point destructive proving at an owner's session. Application start does not establish that an agent completed work.

On contract branches, also run npm run typecheck and npm run contract:check. The earlier experimental content Rust crate lives in experiments/typed-content/contract/. When changing it, run cargo fmt --check, cargo test --locked and cargo clippy --locked --all-targets -- -D warnings from that directory. Keep lockfiles and generated declaration drift checks intact.

New native verification uses the Rust environment in [tests/native](tests/native/README.md), invoked directly as `tests/native/target/debug/voyager-verification`. Read the project verify skill. Build the locked verifier after SDK preparation, run doctor against a reviewed candidate/hash, and use a named supported journey with a fresh evidence directory. `voyager-verification journeys` lists the implemented Linux X11 journeys. Journeys and behavior it does not list, including compositor and other legacy ones, are migration gaps, not implicit fallbacks. Do not infer microphone audibility, compositor behavior or another operating system from X11.

Extend the shared environment when a capability is missing. Preserve failing evidence, diagnose fixture versus product, independently demonstrate a fixture repair and rerun the affected behavior. Reuse shared actions, identities, evidence and cleanup; do not create feature-private runners or ad hoc Python/shell proving programs. ETC, orthogonality and DRY apply to this environment as well as the app. Runtime pass, finite proof and quality review remain separate required evidence. Follow CONSTRAINTS.md even when calling code development infrastructure.

The retained Python routes require `--legacy-reproduction` for driver execution. Route help remains available without effects. These routes preserve earlier coverage and enable parity comparison; they do not establish that coverage in Rust. Their non-launch path checks use `python3 -m unittest discover -s tests/native -p test_routes.py`; the default-refusal regression uses `test_rust_route.py`. Unit/source checks do not establish a native journey. Retire old drivers only after named real-surface parity and applicable approval.

The selected native workspace uses one root Cargo workspace and build-only Node dependencies:

```sh
python3 desktop/prepare-sdk.py
npm ci --ignore-scripts
npm run format:check
npm test
npm run contract:check
npm run vocabulary:check
npm run comments:check
npm run prose:check
cargo fmt --all --check
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo build --release --locked -p voyager-desktop -p voyager-app --bin voyager-shell --bin voyager
```

Run `npm run ci:local` before you call a change code-ready. CI stops at the feature map change gate when it fails and skips every later step, so a fault in a later step reaches main unseen. The script reads each step from `.github/workflows/checks.yml` after that gate and runs it here, in order and without stopping at a failure, so one run shows every fault. It prints the head first, each command with its exit status and a final summary line, and exits non-zero if any step failed. It also runs `npm test`. It takes the base for the comment, prose and gate checks from `--base <rev>` and otherwise from the merge base of `origin/main` and `HEAD`, so commit first. It leaves out the CI setup step that needs sudo, by a list in `scripts/ci-steps-local.cjs`. A step it cannot run, such as an action step, makes it stop with the step named, and `scripts/ci-steps-local-test.cjs` fails the same way when the workflow changes. It clears `HC_SOCKET`, `HC_SESSION`, `HC_TERMINAL_ID`, `HC_SCOPE`, `HC_TERMINAL_SOCKET`, `WAYLAND_DISPLAY` and `DISPLAY` from the environment of every step and says so on its first lines, so no step reaches the caller's session or display. Wrap it in your own load control, for example `heavy`, because it starts the cargo builds.

`npm run architecture:check` gives every Rust and TypeScript source file under
`app/`, `contract/`, `desktop/` and `content/` exactly one owning context in
`tests/architecture/vocabulary.yaml`. It fails on a file in no context or in two.
It also fails on a use or import between modules of different contexts that
`tests/architecture/intended.yaml` does not list, and on a listed edge that is
gone. A PR that adds an edge runs `npm run architecture:intended` and commits the
change, so reviewers see the new dependency.

`npm run comments:check` and `npm run prose:check` read the diff from the merge
base of `origin/main` to `HEAD`, so commit first. Pass `--base <rev>` to compare
against another revision. The comment check fails on a comment in an added line
of Rust or TypeScript under `app/`, `desktop/src/`, `contract/src/`,
`desktop/canvas/` and `tests/native/src/`. `desktop/patches/` is exempt. The
prose check fails on a long dash, a curly quote or a mid-sentence colon, outside
code spans and fenced code. It reads every line of each rule file, whether or not
the change touched it. The rule files are every `AGENTS.md` outside
`experiments/` and `tests/native/fixtures/`, `CONSTRAINTS.md`,
`CONTRIBUTING.md`, `docs/*.md`, `tests/native/README.md`, the project skills
under `.agents/skills/` and the `says` statements of
`tests/native/declared-invariants.toml`. `ruleFile` in `scripts/prose-check.cjs`
is the only list, and its test plants a tell in each tracked rule file. For
`README.md` it reads added lines only. Each finding names the file, the line and
the fix. CI compares the pull request's merge commit with its first parent.

`prepare-sdk.py` checks out the pinned upstream GPUI Kit revision in the user
cache, applies the reviewed native-overlay, engine-limits and window-drag patches in `desktop/patches/`
and writes a local Cargo override for the shared SDK crates. Run it before
native Cargo or Node checks. Later Cargo commands use that configuration
normally. `python3 desktop/prepare-sdk.py --check` verifies the prepared source
and configuration without changing them. Existing unrelated source or Cargo
configuration is preserved with an explicit error. The cache path includes
the revision and patch digest and is shared by matching worktrees. The
configuration is checked on every native build by `desktop/build.rs`, which fails
when it points at an SDK prepared from an older patch list. Rerun the script in
an existing worktree to refresh it. Keep the
machine-local `.cargo/config.toml` out of commits. The SDK patch adds one native
view slot below sheets/dialogs; application code still owns Voyager's avatar.

The preparer also verifies the checksum-pinned Linux platform archive and applies
the presentation patches described in [desktop/patches/README.md](desktop/patches/README.md).
Their separate cache path includes both patch digests. X11 presentation and the
window's monitor clock stay in that platform boundary. Application contracts,
terminal ownership and avatar timing remain in their existing owners. Installed
registry sources are preserved. Record the selected patches with the measured
release artifact; preparing a dependency does not establish a performance gain.

The current workspace checkpoint is described in [docs/workspace.md](docs/workspace.md). Its Core-backed shell works in a Fleet Vessel or persistent Voyage Portal. The terminal-grid candidate demonstrated native colored Unicode, alternate screen and dynamic sizing, as described in [docs/terminal.md](docs/terminal.md). Its continuation adds selection, clipboard and native composition source. The native `terminal-input` journey covers terminal typing, selection and copy and paste, and native composition remains Python-only. Full terminal behavior and integrated avatar/chat remain unfinished. Performance measurements use the resulting `target/release/voyager-shell` and record the exact artifact and workload. Debug build timings do not establish release runtime performance.

## How a change is verified

Every change passes one verification chain. Declared invariants in
`tests/native/declared-invariants.toml` state what the app promises. Types
guard each promise where they can, and a `type_gap` says where they cannot
yet. Unit tests check one owner at a time. Native journeys in `tests/native`
drive the real app with `voyager-verification`. The feature map in
`tests/native/features.toml` and `architecture/features.yaml` ties each feature
to its sources and journeys, and `npm run features:check` asks for a recorded
run when a feature's sources change. The architecture checks in
`tests/architecture` keep each file with one owner, as
[the architecture gate](docs/architecture-gate.md) describes.
[How a change is verified](tests/native/README.md#how-a-change-is-verified)
says what each link is, where it lives, what checks it and how you use it.

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
