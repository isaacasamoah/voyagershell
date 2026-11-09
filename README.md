# VoyagerShell

VoyagerShell is a configurable workspace for people and agents, built on Herdr Core. The native foundation is being developed in Rust and GPUI, with TypeScript-authored composition running as JavaScript. Herdr Core owns terminals and programs. Voyager owns the workspace, content placement and explicit avatar context.

The selected native development baseline includes the retained avatar layer and conservative terminal drawing changes. Prepare its pinned SDK with `python3 desktop/prepare-sdk.py` before the native checks in [CONTRIBUTING.md](CONTRIBUTING.md). Complete foundation and whole-app performance acceptance remain open.

The working Electron prototype is preserved in [experiments/electron-reference](experiments/electron-reference/README.md). Earlier native avatar, content-host and typed-content work remains organised under [experiments](experiments/README.md), with its scoped findings and limits.

The reported-activity source candidate uses Core's OSC 7501 events in existing
Vessel/Portal headers and scoped process inspection. Its native protocol proof is
pending. Reported done remains separate from process exit and verified work.
See [reported activity](docs/terminal.md#program-reported-activity).

## Run the reference

Use Node 24 and Herdr Core 0.1.16 on PATH. Chat and voice require the existing configured Codex installation.

```sh
npm --prefix experiments/electron-reference ci
VOYAGER_WORKSPACE_SESSION=voyager-reference-check npm --prefix experiments/electron-reference start
```

Use a fresh dedicated session for trials. Existing demo profiles, runtime state and native sessions are not part of this source move.

## Workspace and content

A Voyage is a workspace. A Fleet is a tab within it. A Vessel places content inside a Fleet; a Portal places content across a Voyage. One content implementation serves both scopes. The preserved Electron prototype uses legacy names internally.

This native candidate creates and names Voyages, Fleets and placements. A Core-backed shell can appear inside a Fleet or as a persistent Voyage Portal. The current combined candidate remains under review. Its terminal grid and private process controls have separately reviewed providers; their combined behavior still needs native verification.

The viewer-controls candidate adds shared split, maximize and close controls to Vessels and Portals. Closing retains the existing content and backend. The split chooser can reopen an eligible hidden viewer into the selected slot. Process stopping remains an explicit terminal or agent command. A newly created Home contains an ordinary read-only Agents view; existing Home layouts stay unchanged. These changes remain subject to the native review and full foundation acceptance gates.

The Notes integration uses the same package and data owner in a Fleet Vessel or persistent Voyage Portal. Its Linux native journey checks editing, save/reopen, delayed reads, refusal and uncertain confirmation, independent drafts, Portal persistence and retained terminal input. The combined proof-size gate, agent data updates and full package lifecycle remain open. The shipped Notes composition now shares the strict TypeScript/emission gate with the interface, using its restricted private declarations. Personal seeded JavaScript stays editable and unchanged. See [native Notes](docs/content.md) for the precise boundary and limits.

The foundation will retain the established avatar, docking, animation, original sounds, private chat and real voice while making contracts and state ownership explicit. Their integration remains unfinished. Read [CONTRIBUTING.md](CONTRIBUTING.md) for checks and [experiments/README.md](experiments/README.md) for retained source and current limits. Browser/game and collaboration extensions follow the working foundation.

Selected-program Stop has passed its native private-Chat journey. The selected terminal ends with its final screen retained, while another terminal and a separate Core session remain running. A source candidate now waits for the existing session, private provider and audio owners before explicit Quit. Its full native Quit/reopen journey remains unfinished. See [terminal lifecycle](docs/terminal.md#explicit-session-quit) and [conversation tools](docs/conversation.md).

The source adds a compact worker creation picker with profile-local Codex defaults and installed program choices. It uses the existing Rust/Core owner and does not change the private administrator. Source/refusal checks are available; the integrated native creation/answer journey remains pending. See [worker creation](docs/agent-launch.md).

## Development

Selected product code belongs in contract/, app/, desktop/ and content/. Keep experimental source under experiments/<name>/. Original artwork is shared from desktop/assets. Keep local task documents, profiles and evidence outside commits.

The maintained proving entry is prove.py. Select --foundation for current native application journeys or --reference for the retained Electron fixture. Historical experiments have explicit routes; there is no default Electron fallback. Current native helpers and journeys live in tests/native/. Build native performance candidates with cargo build --release and measure the executable in target/release. Debug timings are not performance acceptance.

## License

MIT. Herdr Core remains an external dependency. Upstream source attribution and component licenses remain with their respective projects.
