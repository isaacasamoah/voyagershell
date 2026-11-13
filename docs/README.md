# Learn VoyagerShell by running it

In this tutorial we build VoyagerShell from source and run it in a throwaway
workspace. We open each kind of placement, dock the avatar, quit and restore,
and edit the interface while it runs. Then we follow one click through the code
to Herdr Core and back. At the end we know where each kind of change starts and
which checks prove it.

The tutorial is for agents who build VoyagerShell and for people who want to
understand it. The [project README](../README.md) describes the product. The
guides linked at each step explain the design in depth.

Plan for about 30 minutes. The release build took three minutes from a clean
`target/` folder on the development laptop.

## Before you start

You need the tools listed in the README's
[Build and run](../README.md#build-and-run) section. They are Git, Python 3,
Node.js 24, Rust, Zig 0.17, a working Vulkan driver, the GPUI native libraries
and Herdr Core's `hc` command on `PATH`. Voyager's Core API is generated from
Core 0.1.16. Other Core releases need compatibility verification. Linux with
X11 is the verified platform.

We use two terminals. The first runs the app. The second runs commands while
the app is open. If either terminal is inside VoyagerShell, run this in it
first:

```sh
unset HC_SOCKET HC_SESSION HC_TERMINAL_ID
```

Those variables point at the session you are working in. Without the `unset`,
the `hc` commands below can type into your real workspace.

## Step 1. Build the app

From the repository root, prepare the pinned SDK, install the build tools and
build the release binary:

```sh
python3 desktop/prepare-sdk.py
npm ci --ignore-scripts
cargo build --release --locked -p voyager-desktop --bin voyager-shell
```

The last line of output starts with `Finished` and names the `release` profile.
The binary is `target/release/voyager-shell`.

If the build stops with `failed to execute zig build`, set `ZIG` to your Zig
0.17 executable. If the linker reports `unable to find library -lxkbcommon`, set
`LIBRARY_PATH` to the folder that holds `libxkbcommon.so`.

## Step 2. Start a throwaway workspace

In the first terminal, keep the repository path, then make an empty project
folder and move into it:

```sh
export VOYAGER_REPO="$PWD"
mkdir -p /var/tmp/voyager-try/project
cd /var/tmp/voyager-try/project
```

The folder matters. The first Voyage uses the directory you launch from, and
Notes writes its Markdown files into a `notes/` folder there. Launching from the
repository would put notes into your checkout.

Start the app with a new profile and its own Core session:

```sh
"$VOYAGER_REPO/target/release/voyager-shell" \
	--profile /var/tmp/voyager-try/profile \
	--session voyager-try
```

The window shows one Voyage named **Voyager** in the sidebar, a Fleet tab named
**Fleet 1**, and one terminal Vessel running `bash` in `project`. The bottom
right corner reads **Overwatch**.

The session name must use only lowercase letters, digits and hyphens. Otherwise
the command exits with `--session must contain lowercase letters, digits or
hyphens`. The name must also start with `voyager-`. Otherwise the window shows
`invalid_session`.

## Step 3. Reach the program from outside the app

Herdr Core runs the shell, not VoyagerShell. In the second terminal, list the
session's programs:

```sh
export HC_SESSION=voyager-try
hc ls
```

The output lists terminal `t1`, running `bash` in
`/var/tmp/voyager-try/project`, with `"state":"live"`. Send it a command:

```sh
hc send t1 'echo hello from Core'
```

The command and its output appear in the app's terminal Vessel. The app shows
the screen. Core owns the process. [Terminal input and
lifecycle](terminal.md) describes that split.

## Step 4. Split a Fleet and open Notes

1. Hover over the terminal. Split, maximize and close buttons appear in its top
   right corner.
2. Click the first split button. A chooser lists **Terminal**, **Codex**,
   **Claude**, **Notes** and **Agents**. Codex and Claude appear only when they
   are installed.
3. Click **Notes**.

A Notes Vessel opens beside the terminal and shows **Title**. In your second
terminal, `ls /var/tmp/voyager-try/project/notes` prints `Title.md`.

Both Vessels belong to Fleet 1. A Vessel places content inside one Fleet.

## Step 5. Add a Fleet and a Portal

1. Click **+** beside the Fleet tabs, then click **Terminal**. **Fleet 2** opens
   with a new shell.
2. Click **‹** at the right end of the tab bar, then click **Notes**. A Portal
   column opens on the right.
3. Click the **Fleet 1** tab.

The Portal stays on screen when you change Fleets. A Portal places content
across a whole Voyage. Vessels and Portals use the same content model. Only the
placement differs.

## Step 6. Dock the avatar

Drag the avatar from the sidebar and drop it on the Portal.

The avatar moves into the Portal, and the bottom right corner changes from
**Overwatch** to **Voyager / Title.md**. Drop it on a Vessel instead and the
label shows the full path, such as **Voyager / Fleet 1 / Title.md**.

Docking sets what the private assistant sees and what it may change.
**Overwatch** means the whole workspace. Docking does not move keyboard focus,
and it never limits your own clicks. The [avatar guide](avatar.md) and the
[private conversation guide](conversation.md) explain both.

## Step 7. Quit and restore

Press **Ctrl+Q**. Closing the window does not quit. It leaves the avatar
floating on the desktop.

In your second terminal, `hc ls` still lists both shells as live. Quitting the
app leaves Core programs running.

Start the app again with the same command from step 2. Both Fleets, the
terminal history with `hello from Core`, the Portal and the docked avatar come
back. The workspace is a document in Core, so it survives the app.

## Step 8. Edit the interface while it runs

The interface is TypeScript compiled to JavaScript. On first launch the app
copies that JavaScript into the profile, and the running app reloads it when it
changes.

1. In your second terminal, rename the sidebar heading:

   ```sh
   cd /var/tmp/voyager-try/profile/mods/header
   cp navigation-view.js navigation-view.js.bak
   sed -i 's/\.child("Voyages"),/.child("My Voyages"),/' navigation-view.js
   ```

   The sidebar heading changes to **My Voyages** without a restart.

2. Break the script:

   ```sh
   echo 'this is not javascript (' >> navigation-view.js
   ```

   A bar at the top reads **Reload failed** with the syntax error. The previous
   view stays usable.

3. Restore the original file:

   ```sh
   mv navigation-view.js.bak navigation-view.js
   ```

   The bar closes and the heading reads **Voyages** again.

The app copies each file only when the profile lacks it. A rebuilt binary does
not update an existing profile, so test a script change with a new profile.
[Script authoring](workspace.md#script-authoring-and-checking) describes the
full workflow.

## Step 9. Follow one click through the code

This step follows what happens when you pick **Terminal** in the split chooser
from step 4. Open each file as you read and find the named function.

1. [`desktop/mods/header/creation.ts`](../desktop/mods/header/creation.ts)
   builds the action
   `{operation: "create-content", destination, typeId: "terminal", launch}`.
   The `launch` entry comes from `launches.json` in the profile.
2. The generated `invoke` in
   [`contract/generated/workspace.ts`](../contract/generated/workspace.ts) adds a
   request ID and validates the request against the contract schema.
3. The `call` host function in [`desktop/src/host.rs`](../desktop/src/host.rs)
   parses it into a Rust `Request` from
   [`contract/src/lib.rs`](../contract/src/lib.rs).
4. `Client::queue_workspace` in [`app/src/client.rs`](../app/src/client.rs)
   puts the request on an eight-slot queue. One owner thread holds the
   workspace and applies requests in order. It refuses a request when the
   workspace changed since the caller read it. For a request from the
   assistant, `scope::check` in [`app/src/scope.rs`](../app/src/scope.rs) also
   refuses an action outside the docked context. Your own clicks carry no scope.
5. `Model::apply` in [`app/src/workspace.rs`](../app/src/workspace.rs) and
   `panels::insert` in [`app/src/panels.rs`](../app/src/panels.rs) change a
   copy of the `Layout`. They record the content and its placement separately.
6. `Core::document_set` in [`app/src/core.rs`](../app/src/core.rs) saves the
   whole `Layout` as the Core document `voyager-layout-v1`. Only after Core
   accepts the save does the owner adopt the new layout.
7. The response carries a `Status` of `Applied`, `Rejected` or `Uncertain`.
   Rejected means nothing changed. Uncertain means the effect may have happened,
   and the app never repeats it automatically.
8. The script adopts the new layout and calls `openTerminal`. `open_terminal` in
   `app/src/client.rs` saves a start marker to Core before it starts the
   program, so a crash mid-start cannot start the program twice. Then it runs
   the command through Core and attaches to its output stream.
9. The `Terminal` component in [`desktop/src/terminal.rs`](../desktop/src/terminal.rs)
   feeds the program's output to libghostty and paints the rows with GPUI.

Every workspace operation from the interface takes this path. The assistant's
tools join it at item 4, through `Client::scoped_call`, which
`app/src/administrator.rs` calls. The data lives in three places:

- Core holds the workspace document and the running programs.
- The profile holds interface scripts, the theme, `launches.json`, avatar
  artwork and older Notes data.
- Each Voyage's directory holds its Notes as Markdown files in `notes/`.

[Workspace](workspace.md) and [Notes and content ownership](content.md) explain
the owners in depth.

## Step 10. Run the checks

In the second terminal, go back to the repository root. The app can keep
running. Run the checks that every change must pass:

```sh
npm run format:check
npm test
npm run contract:check
cargo fmt --all --check
cargo test --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
```

`npm test` compiles the interface TypeScript, fails if the committed
JavaScript differs from it, and runs the script tests. `npm run contract:check`
fails if the generated schemas and types differ from the Rust contract. `cargo
test` includes tests that start their own Core sessions, so it needs `hc`.

These checks do not prove that the app works on screen. Native journeys drive
the real app. The [native proving fixture](../tests/native/README.md) describes
them, and they take over the desktop's pointer and keyboard while they run.

## Step 11. Clean up

Quit the app with **Ctrl+Q**. Then stop the trial's Core session:

```sh
HC_SESSION=voyager-try hc server stop
```

The command prints `{"stopped":true}`. It stops only the `voyager-try` session.

Core keeps the session's saved workspace after it stops. Delete the trial
folders and that saved state, so a second run of this tutorial starts with an
empty workspace:

```sh
rm -rf /var/tmp/voyager-try ~/.local/state/herdr-core/voyager-try
```

If you set `XDG_STATE_HOME`, Core's state is in
`$XDG_STATE_HOME/herdr-core/voyager-try` instead.

## Next steps

Each kind of change starts in one place. The linked guides give the full
procedure.

- **A workspace operation.** Start at `Action` in `contract/src/lib.rs`, then
  `Model::apply` in `app/src/workspace.rs` and `scope::check`. See
  [Workspace](workspace.md).
- **An interface change.** Start at the `.ts` files in `desktop/mods/header/`
  or `content/`. See
  [Script authoring](workspace.md#script-authoring-and-checking).
- **A native view.** Start at `native_registry` in `desktop/src/lib.rs`. See
  [Workspace](workspace.md).
- **A content type.** Start at `IMPLEMENTATIONS` in
  `app/src/content/description.rs`. See [Notes and content
  ownership](content.md).
- **An assistant tool.** Start at the tool catalog in
  `app/src/administrator.rs`. See [Private conversation](conversation.md).
- **A Core call.** Start at `app/src/core.rs` and `app/core-schema.cjs`. See
  [Workspace](workspace.md).

Read [CONTRIBUTING.md](../CONTRIBUTING.md) before you open a pull request, and
[AGENTS.md](../AGENTS.md) for the rules agents follow in this repository.
