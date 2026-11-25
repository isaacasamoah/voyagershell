# Native shell host

The native shell is the program that draws the canvas, the whole window surface,
in the native candidate. The canvas is an editable JavaScript view that GPUI
Shell renders. This guide says how to build and run the shell and how it
recovers from a broken edit.

## What the host provides

The host seeds its default script, generated bindings and theme into the
selected profile. [First-party profile files](content.md#first-party-profile-files)
says how a later build updates those files and keeps the ones you edited. The
host gives the script a read-only color projection and the typed workspace
connection that [the workspace guide](workspace.md) describes.

A source reload keeps the previous view if the new source cannot load. A theme
error is shown without replacing the last valid theme.

## Build and run

Build with a Rust toolchain and the native development libraries that the GPUI
platform needs. Linux needs the X11 or Wayland and font libraries that the
platform crate selects, including the xkbcommon and xkbcommon-x11 development
linker libraries. Package names differ by distribution.

```sh
CARGO_BUILD_JOBS=1 cargo build --release --locked -p voyager-desktop --bin voyager-shell
```

Run it with an absolute profile path and a session name. The session name uses
lowercase letters, digits and hyphens.

```sh
./target/release/voyager-shell --profile /absolute/path/to/profile --session voyager-trial
```

## Recovering from a failed first load

The first package load can fail, for example after a bad edit. While it is
failed, a background scan watches the visible JavaScript sources, including
relative imports, for changes. It skips hidden entries, `node_modules`, `target`
and symlinks. The scan fails on a tree more than 8 folders deep or with more
than 4,096 source files. It
stops after the first successful load, and the shell's own watcher handles
later edits. A corrected theme can also recover a first load that depended on
it. This is live authoring. It is separate from restarting programs or agent
sessions.

## Status

The native shell is part of the native candidate. It is not an accepted
replacement for the retained Electron reference. Full workspace UX, terminal
rendering, voice and increasing-load performance remain separate acceptance
work. The shell connects to Core's document API, runs Core programs in terminal
Vessels and connects to the conversation provider. Quitting closes the shell's
own viewers and leaves Core programs running, as
[the terminal guide](terminal.md#lifecycle) describes. The demonstrated native
target is Linux with X11 under GNOME.
