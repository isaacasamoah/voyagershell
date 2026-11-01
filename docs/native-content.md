# Native shell host

The native shell is an editable JavaScript view rendered through GPUI Shell. The host copies its default script, generated bindings and theme into the selected profile only when those files do not already exist. It exposes a read-only color projection and the typed workspace connection described in [workspace.md](workspace.md). A source reload keeps the previous view if the new source cannot load; theme errors are shown without replacing the last valid theme. The accepted earlier header established hosting, not the new workspace operations. Closing this checkpoint quits its own process and bridge, leaving the dedicated Core server running. The complete viewer/quit lifecycle is not yet implemented.

Run the owned trial with an absolute dedicated profile and session:

```sh
./target/release/voyager-shell --profile /absolute/path/to/profile --session voyager-trial
```

Build with a Rust toolchain and the GPUI platform's native development libraries available. Linux needs the X11/Wayland and font libraries selected by the platform crate, including the xkbcommon and xkbcommon-x11 development linker libraries. Package names differ by distribution.

```sh
CARGO_BUILD_JOBS=1 cargo build --release --locked -p voyager-desktop --bin voyager-shell
```

While an initial package load has failed, a background scan detects changes to visible JavaScript sources, including relative imports. It skips hidden entries, node_modules, target and symlinks, with depth 8 and 4,096 source-file limits. It stops after the first successful load; the maintained shell watcher handles subsequent source edits. A corrected theme can also recover an initial load that depended on it. These are live-authoring operations, separate from program or agent-session recovery.

The demonstrated native target is Linux/X11 under GNOME. This checkpoint connects to Core's document API, but has no Core program or provider connection. Full workspace UX, terminal rendering, voice and increasing-load performance remain separate acceptance work.
