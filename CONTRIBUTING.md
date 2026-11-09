# Building VoyagerShell

This repository is the standalone successor to the core-workspace prototype in voyagershellapp. It contains the Electron workspace and its local content packages. Herdr Core is an external dependency, not copied implementation code.

Use Node 24 and the hc command on PATH. The latest migration proof uses Herdr Core 0.1.16. Codex is needed only for real companion chat or voice. Ordinary tests do not call a model.

From the repository root, for the retained Electron reference:

```sh
npm --prefix experiments/electron-reference ci
npm --prefix experiments/electron-reference run format:check
npm --prefix experiments/electron-reference test
npm --prefix experiments/electron-reference start
```

Use a dedicated VOYAGER_WORKSPACE_SESSION for experiments. The default profile name is unchanged from the source prototype. Do not point destructive proving at an owner's session. Application start does not establish that an agent completed work.

On contract branches, also run npm run typecheck and npm run contract:check. The earlier experimental content Rust crate lives in experiments/typed-content/contract/. When changing it, run cargo fmt --check, cargo test --locked and cargo clippy --locked --all-targets -- -D warnings from that directory. Keep lockfiles and generated declaration drift checks intact.

Native journeys use the candidate revision's prove.py and focused modules. Supply a unique session, debugging port and new evidence directory. A later --quit uses that same evidence and candidate. Do not infer microphone audibility, compositor behavior or another operating system from an X11 test.

CONSTRAINTS.md owns the complete acceptance-code inventory and review rules. Count shared helpers once, include temporary proving code and map production ranges actually exercised. Keep a fresh independent review and relevant negative control. A dependency install or green unit suite does not complete a user-facing increment.

Make one logical change per PR. Preserve the existing MIT license and source attribution. Local task specs/plans remain untracked. Do not commit profiles, screenshots, transcripts or credentials. Merging, installation and replacing a demo are separate owner decisions.

The native avatar and content experiments are retained under experiments/gpui-avatar/ and experiments/native-content/. Their Cargo manifests build those experiments only; they do not establish the working foundation. Shared original artwork lives in desktop/assets. Use the root prove.py native routes with an explicitly selected isolated binary/session. Native performance measurements require cargo build --release and the resulting target/release executable, with the exact artifact and all helper processes recorded.

## Integration and release sequence

1. Commit and push each complete increment, then open its PR against main or its published prerequisite. Keep one clear dependency path. Record experiment-only and unfinished work separately.
2. Review the increment against the master outcome, architecture and exact UX references. Run the required ordinary checks, actual interaction and relevant failure. Preserve failed evidence and report open acceptance gates.
3. Build review candidates from committed source. Record the source revision, dependency preparation and immutable release executable. A canonical build must not depend on unpublished edits or an untracked implementation.
4. Merge verified increments with the owner's applicable approval while work continues. Verify main contains the selected source and reconcile the PR stack before beginning another independent feature. Do not defer all integration until release day.
5. Archive completed task records and finished experiments, retaining experiment branches. Delete merged feature branches only after preservation and ancestry checks. Keep any checkout still needed by a running session or build until its replacement is verified.
6. Run the complete foundation and release checks on the integrated main revision. Resolve or explicitly report remaining gates before release. A merged PR or a working preview does not itself establish release acceptance.
