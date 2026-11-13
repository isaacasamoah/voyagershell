# VoyagerShell

VoyagerShell is a canvas for agents and humans to collaborate.

## Docking and collaboration

VoyagerShell introduces a new human-to-agent collaboration primitive called docking.

The avatar lets you choose the context you share with your assistant. Work with
the whole workspace, or dock to a Voyage (space), Fleet (tab), Vessel (panel), or
Portal (a panel that persists across a space's tabs).

Docking selects the context for your request. Your authority stays the same
wherever you dock. A worker does not gain your rank or permissions by sharing
that context. An accepted request keeps the context captured when you sent it.
Changing keyboard focus does not silently retarget it.

The current private assistant uses Codex and is separate from agents running in
terminal panels. Broader delegated authority is still design and experimental
work.

## How it works

[Herdr Core](https://github.com/herdrdev/herdr-core) owns terminal programs and
screens. Voyager connects through a typed Core adapter. The Rust application owns
workspace state, content data, explicit context and application policy.

JavaScript and TypeScript define content and interface layouts through the
supported host. Rust and GPUI provide native rendering and registered
terminal, editor and interface components. This lets people and agents change
content, look and feel while keeping rendering local and native. Responsive
interaction and performance as work grows are architectural aims. Whole-app
performance still needs verification.

| Directory              | Responsibility                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| [contract/](contract/) | Shared Rust commands, identities and results, with generated script types and validators. |
| [app/](app/)           | Workspace, content, context and policy owners, plus Core and provider adapters.           |
| [desktop/](desktop/)   | GPUI views, native terminal and editors, avatar presentation and interface composition.   |
| [content/](content/)   | Shipped content presentation, currently Notes, using the Rust content owner.              |

A Vessel places content inside a tab. A Portal keeps content visible across a
space's tabs. Both use the same content model. Content identity, saved data and
an optional Core backend stay separate from the placement. Hiding a view does
not stop its program.

The extensible design allows content backed by a Core program and presented
through JavaScript/TypeScript and supported native Rust components. Main currently
supports Terminal and Notes content. Terminal panels render shells and terminal
agents, with local history scrolling and wheel input for full-screen programs.
Notes supports Markdown editing and preview in either placement. You can edit
interface scripts and themes in a personal profile. For supported live edits, a
broken script leaves the previous usable view in place. Arbitrary program-window
embedding and browser, game or dashboard renderers remain unimplemented.

Workspace operations share a typed contract used by views and supported agent
tools. The Rust application checks each action before applying it. A schema, panel
placement or Fleet membership grants no authority.

## What we're focusing on next

We plan to develop richer docking interactions, improve human-agent collaboration
and make the interface more intuitive. This work is planned, not shipped.

## Build and run

The verified native target is Linux/X11. Wayland is included in the build;
equivalent behavior on Wayland, macOS and Windows is not established.

You need Git, Python 3, Node.js 24, a current Rust/Cargo toolchain and Zig 0.17.x
on PATH or selected through `ZIG`. Linux needs a working Vulkan driver and the
GPUI platform's native development libraries, including X11/Wayland, font,
`xkbcommon` and `xkbcommon-x11` linker libraries. Package names depend on your
distribution. See the pinned [terminal library build guide](https://github.com/Uzaaft/libghostty-rs/tree/83634421c232385f9fd7c61f454961341453d661#building)
for its Zig requirement.

Install Herdr Core separately with `hc` on PATH. Voyager's generated Core API is
pinned to 0.1.16; its terminal scrolling has been verified with runtime 0.1.19.
Other Core releases need compatibility verification. Codex and a configured
account are needed for private chat or a Codex terminal agent, not ordinary shells
and Notes.

From the repository root:

```sh
python3 desktop/prepare-sdk.py
npm ci --ignore-scripts
cargo build --release --locked -p voyager-desktop --bin voyager-shell
./target/release/voyager-shell --profile "$HOME/.local/share/voyagershell-dev" --session voyager-dev
```

The [SDK preparer](desktop/patches/README.md) checks pinned source and reviewed
patches and writes local Cargo overrides. Choose a fresh absolute profile path
and unique Core session for an independent trial. The profile stores personal
scripts, configuration and content. Quitting the viewer leaves Core programs
running. Confirmed Close Voyage is a separate action that saves Notes and stops
that Voyage's verified programs.

## Development and limits

[CONTRIBUTING.md](CONTRIBUTING.md) covers development and required checks.
[CONSTRAINTS.md](CONSTRAINTS.md) defines proving and review requirements. Changes
go through pull requests. Complete application acceptance, broader input coverage,
voice integration and increasing-load performance remain open.

- [Learn VoyagerShell by running it](docs/README.md), a tutorial for agents and
  new contributors
- [Workspace and script authoring](docs/workspace.md#script-authoring-and-checking)
- [Terminal input and lifecycle](docs/terminal.md)
- [Notes and content ownership](docs/content.md)
- [Private conversation and providers](docs/conversation.md)
- [Native proving fixture](tests/native/README.md), entered through `prove.py --foundation`
- [Retained experiments and Electron UX reference](experiments/README.md)

Experiments remain separate from the native product. Authority and animation
trials do not establish accepted capabilities on main.

## License

[MIT](LICENSE). Herdr Core is an external dependency. Upstream components and
artwork retain their respective licenses and attribution.
