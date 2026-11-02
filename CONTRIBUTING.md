# Building VoyagerShell

This repository is the standalone successor to the core-workspace prototype in voyagershellapp. The native candidate uses Rust application code and GPUI views. The Electron workspace and its local content packages remain under experiments/electron-reference/. Herdr Core is an external dependency, not copied implementation code.

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

Native journeys use the candidate revision's prove.py and focused modules in tests/native/. Choose exactly one route: --foundation for the current native app, --reference for the retained Electron fixture, or --native-mod-host/--native-avatar for the named historical experiments. There is no default route. `python prove.py --help` describes those choices; append --help to a route for its driver options. Supply a unique session, debugging port and new evidence directory. A later --quit uses that same explicit route, evidence and candidate. Do not infer microphone audibility, compositor behavior or another operating system from an X11 test.

The non-launch dispatcher/path checks use `python -m unittest discover -s tests/native -p test_routes.py`. They check mode refusal, help and source paths. They do not establish a native journey. Keep historical avatar/Notes experiment source in experiments/ and new product journeys with the current shared native helpers in tests/native/.

The selected native workspace uses one root Cargo workspace and build-only Node dependencies:

```sh
npm ci --ignore-scripts
npm run format:check
npm test
npm run contract:check
cargo fmt --all --check
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo build --release --locked -p voyager-desktop --bin voyager-shell
python prove.py --foundation --journey workspace --launch --session voyager-unique-name --evidence /absolute/new/evidence --desktop-env /absolute/desktop-environment.json
```

The current workspace checkpoint is described in [docs/workspace.md](docs/workspace.md). Its Core-backed shell works in a Fleet Vessel or persistent Voyage Portal. The terminal-grid candidate demonstrated native colored Unicode, alternate screen and dynamic sizing, as described in [docs/terminal.md](docs/terminal.md). Its continuation adds selection, clipboard and native composition source, with the actual native journeys and proof-size gate still open. Full terminal behavior and integrated avatar/chat remain unfinished. The combined checkpoint is under review. Performance measurements use the resulting `target/release/voyager-shell` and record the exact artifact and workload. Debug build timings do not establish release runtime performance.

The focused native terminal journey uses the same maintained fixture:

```sh
python prove.py --foundation --journey portal-terminal --launch --binary target/release/voyager-shell --session voyager-unique-name --evidence /absolute/new/evidence --desktop-env /absolute/desktop-environment.json
```

This journey verifies shell input/output, known refusal and explicit Refresh, retained Portal process identity across Fleet changes, rename-to-terminal focus and a refused sibling that must not block the Portal. Its final cleanup explicitly stops only its dedicated Core session after the application quits. It does not establish the application's full Quit lifecycle.

CONSTRAINTS.md owns the complete acceptance-code inventory and review rules. Count shared helpers once, include temporary proving code and map production ranges actually exercised. Keep a fresh independent review and relevant negative control. A dependency install or green unit suite does not complete a user-facing increment.

Make one logical change per PR. Preserve the existing MIT license and source attribution. Local task specs/plans remain untracked. Do not commit profiles, screenshots, transcripts or credentials. Merging, installation and replacing a demo are separate owner decisions.

The native avatar and content experiments are retained under experiments/gpui-avatar/ and experiments/native-content/. Their Cargo manifests build those experiments only; they do not establish the working foundation. Shared original artwork lives in desktop/assets. Use the root prove.py native routes with an explicitly selected isolated binary/session. Native performance measurements require cargo build --release and the resulting target/release executable, with the exact artifact and all helper processes recorded.

`npm test` checks the current TypeScript composition and generated JavaScript
before its Node tests. It runs the headless Rust declaration exporter and needs
the native linker libraries. After contract changes run `npm run contract:generate`;
after composition or registration changes run `npm run scripts:generate`.
The profile's seeded JavaScript remains independently editable. See
[script authoring](docs/workspace.md#script-authoring-and-checking).
