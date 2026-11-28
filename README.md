# VoyagerShell

VoyagerShell is a canvas where people and agents work together. It is a Linux
desktop app. A panel can hold a terminal, a coding agent or content of a type
that you declare in a JSON file. Drag the Voyager avatar onto a panel, a tab or a
whole space, and that is what it can see and change.

VoyagerShell 0.1 is an early release for a small group of users. Build it from
source.

## Docking

The workspace has four kinds of place. A **Voyage** is a space for one project.
A **Fleet** is a tab in a Voyage. A **Vessel** is one piece of content, such as a
terminal or a coding agent, of a Vessel type. A Vessel sits in a Fleet. A
**Portal** is a Vessel that stays on screen across every Fleet in its Voyage.

The **Voyager avatar** is the assistant you dock. Drag it onto any of those
places to dock it there. The status bar shows the dock, such as **Voyager / Terminal 1** for
a Portal in the Voyage named Voyager. **Overwatch** means the whole workspace.
For example, dock on the terminal where a test failed and ask why it failed.

Docking sets what the Voyager avatar can see and change. It never moves your
keyboard focus or limits your own clicks. A request keeps the context it was
sent with, so docking somewhere else never changes a request already sent.

## What you can do

- **Run terminals and coding agents in panels.** Shells, Codex, Claude Code and
  other agent programs run in [Herdr Core](https://github.com/herdrdev/herdr-core),
  so they keep running after you quit the app.
- **Arrange your work.** Add Voyages, Fleets, Vessels and Portals. Split,
  resize and maximize any panel.
- **Talk to Voyager.** Click the avatar's voice control and speak. Voyager is a
  Claude Code session that the app starts in a Portal on Home. It reads where
  the avatar is docked with every prompt, acts through the `voyager` command
  and its reply is read aloud. Speech is heard and spoken by a local model, so
  no audio goes to a cloud service. Another click turns voice off.
- **Chat with the avatar.** The chat panel is a private Codex conversation. It
  can arrange panels, read and type into terminals and create Git worktrees,
  only where you dock it. It does not edit your code. Coding agents in panels
  do that.
- **Make your own Vessel type.** Write a JSON manifest in your profile that
  declares the type's state and actions. No build or restart is needed. The app checks it while it runs and
  lists every problem it finds. A broken edit keeps the last version that
  worked. [Make a Vessel type](docs/voyager-command.md#make-a-vessel-type)
  shows how.
- **Let agents arrange the workspace.** An agent in a Vessel runs the
  `voyager` command to read the workspace, add Fleets and Vessels and move
  them. `voyager --skill` prints its guide.
- **Change the interface while it runs.** The interface is TypeScript compiled
  to JavaScript. The app copies that JavaScript into your profile. Edit a file
  there and the view reloads. A broken edit shows its error and keeps the last
  working view.
- **Quit and pick up where you left off.** Your programs keep running in Herdr
  Core after **Ctrl+Q**. Reopen the app and your layout and live terminals come
  back. After a reboot, terminals reopen as new shells.

## Build and run

VoyagerShell runs on Linux. It is tested on X11 and also builds for Wayland.
macOS and Windows are not supported.

You need Git, Python 3, Node.js 24, Rust, Zig 0.17, a working Vulkan driver,
and the GPUI native libraries for X11 or Wayland. Install
[Herdr Core](https://github.com/herdrdev/herdr-core) so that `hc` is on
`PATH`. VoyagerShell's Core API is generated from Core 0.1.18, the oldest release
it supports, and CI tests against Core 0.1.21.

The assistant and voice need more:

- Claude Code for Voyager, which the app starts on launch.
- Codex for the chat panel.
- For voice, `llama-server`, the local Omni model files, and `parec` and
  `paplay` from the `pulseaudio-utils` package. [Set up voice](#set-up-voice)
  shows how to install them.

Shells need none of these.

Build from the repository root:

```sh
python3 desktop/prepare-sdk.py
npm ci --ignore-scripts
cargo build --release --locked -p voyager-desktop -p voyager-app --bin voyager-shell --bin voyager
```

Start the app from the project you want to work in. The first Voyage and its
terminals open in that directory:

```sh
cd ~/your-project
/path/to/voyagershell/target/release/voyager-shell \
	--profile "$HOME/.local/share/voyagershell" \
	--session voyager-main
```

Both flags are required. `--profile` is an absolute path to the folder that
holds your interface scripts, theme and settings. `--session` names your Herdr
Core session. It starts with `voyager-` and uses lowercase letters, digits and
hyphens.

Quit with **Ctrl+Q**. The window's close button quits the same way. Both keep
your programs running in Herdr Core.

### Daily start from an install

An install keeps each build in `builds/` beside `current`, `previous` and
`next` links and a `start.json` that names the profile and session:

```json
{"profile": "/home/you/.local/share/voyagershell-profile", "session": "voyager-daily"}
```

Run these commands with the `voyager` from the install:

- `voyager start` raises the running window, or starts the current build and
  waits until it is ready. A staged build becomes current first. If it exits
  before it is ready, start goes back to the previous build and prints the
  failed build's log.
- `voyager update --from ~/voyagershell/target/release` copies a local build
  into the install, checks it and stages it for the next start.
- `voyager update` downloads the latest release, checks its sha256 and that it
  runs, and stages it for the next start. It stages nothing when the current
  build is that release or a newer one.

A release build checks for a newer release a little after it opens and then
hourly. It downloads and checks the new build quietly, then offers Restart. Restart
quits, keeps your programs running and opens the new build. If you choose Later,
the new build starts the next time you open VoyagerShell.
- `voyager rollback` stages the previous build for the next start.

None of these restarts or updates Herdr Core, and none stops a program.

To learn the app by using it, follow the tutorial,
[Learn VoyagerShell by running it](docs/README.md). It walks through every
part of the workspace and traces one click through the code.

## Install a release

Releases are Linux x86_64 builds on GitHub Releases. They run on Ubuntu 22.04
and newer. Install one with:

```sh
curl -fsSL https://github.com/isaacasamoah/voyagershell/releases/latest/download/install.sh | sh
```

The installer reads `latest.json`, checks the archive's sha256 and that the
build runs, then lays out the install described in
[Daily start from an install](#daily-start-from-an-install). It writes
`start.json` only when none exists and adds a launcher entry. It installs
Herdr Core with Core's own installer only when no Core is found. It leaves an
older Core alone and tells you.

## Releasing

Releasing takes two words from the owner. `scripts/release publish` is the
first. Approving the `release` environment in GitHub is the second.

1. Add the version's entry to `CHANGELOG.md` as `## [x.y.z] - YYYY-MM-DD` in
   plain words. When a release changes the shape of stored data, say so,
   because `voyager rollback` does not convert it.
2. Run `scripts/release prepare x.y.z`. It checks that the version is plain
   semver, that the entry exists, that the tree is clean and equal to
   `origin/main` and that no such tag exists. It sets the crate versions,
   refreshes the generated files, commits `Release x.y.z` on
   `release/x.y.z`, runs `npm run ci:local`, prints the commits since the last
   tag and opens a pull request. It never tags. When the crates already read
   `x.y.z`, as for the first release, it says so and stops. Run it under your
   load control, for example `heavy`, because `ci:local` builds.
3. Merge that pull request through the normal path.
4. Run `scripts/release publish x.y.z` from a clean checkout of `origin/main`.
   It waits for the `checks` run on that exact commit. On red it prints
   `nothing published` and tags nothing. On green it tags `vx.y.z` and pushes
   the tag.
5. The `release` workflow waits for `checks` on the tagged commit, builds on
   Ubuntu 22.04 with `VOYAGER_RELEASE=1`, checks that the build reports the
   tag's version, packs `voyagershell-linux-x86_64.tar.gz` and waits for the
   environment's required reviewer. After approval it creates the release from
   the changelog entry, uploads the archive and `install.sh`, and uploads
   `latest.json` last.

Set this up once in GitHub, in the repository's settings, before the first
release. Create the environment `release` and add yourself as its required
reviewer. The repository names no account. The workflow reads with a read-only
token and only its publish job may write release contents. Anyone who may push
tags can start the workflow, but nothing publishes until the required reviewer
approves that run.

A pull request that changes the release files, and a hand-run of the
`release` workflow from the Actions tab, rehearse a release. They build the
archive and write `latest.json` as a workflow artifact named
`voyagershell-dist`, and publish nothing. Neither reaches the `release`
environment. Check that the archive's sha256 matches the manifest's.

## Set up voice

Voice runs on LiquidAI's LFM3 Omni model through llama.cpp's `llama-server`, on
your own computer. In 0.1 you install both by hand. Codex voice isn't available
in 0.1. The model is under the LFM Open License v1.0, which is on the model's
Hugging Face page. Read it before you download. Its commercial use rights depend
on revenue. The licence sets a threshold of "annual revenue of 10 million United
States dollars ($10,000,000) or more". It says that commercial use by a company
or other legal entity that exceeds the threshold "is not licensed under this
Agreement".

The app looks for voice files in `~/.cache/voyager/voice/omni/`, the voice
folder. If `XDG_CACHE_HOME` is set to an absolute path, the voice folder is
`$XDG_CACHE_HOME/voyager/voice/omni/` instead. Voice also needs `parec` and
`paplay` from the `pulseaudio-utils` package.

1. Get `llama-server` from llama.cpp, build b12242 or newer. Pick the kind of
	build by where you want the model to run. A CPU-only build always runs the
	model on the processor, and the graphics card setting in step 3 does
	nothing with it. To use a graphics card, get a GPU build.
	- For an NVIDIA graphics card, get a CUDA build, from the llama.cpp release
		page or built from source. A CUDA build from the release page also needs
		the page's matching CUDA runtime bundle, unless the CUDA runtime is already
		installed. Without it, `llama-server` can't find the CUDA libraries it
		needs. Use the same CUDA version for the build and the bundle. For example,
		CUDA 12.8 worked with NVIDIA driver 580. To build from source, run:

		```sh
		cmake -B build -DGGML_CUDA=ON
		cmake --build build --config Release
		```

	- For another graphics card, download a llama.cpp release build for Linux
		that uses Vulkan.
	- Without a graphics card, download a llama.cpp CPU release build for Linux.

	Copy `llama-server` and the libraries that come with it into the voice
	folder. To leave a build where it is, set `VOYAGER_OMNI_SERVER` to the full
	path of its `llama-server` instead.
2. Download `LFM3-Omni-2B-Q4_K_M.gguf` and `mmproj-LFM3-Omni-2B-Q4_K_M.gguf`
	from [LiquidAI/LFM3-Omni-2B-GGUF](https://huggingface.co/LiquidAI/LFM3-Omni-2B-GGUF)
	on Hugging Face. Put both files in the voice folder. The app also finds them
	in the Hugging Face cache, so files that the Hugging Face command-line tool
	downloaded can stay where they are.
3. To run the model on your graphics card with a GPU build from step 1, start
	the app with `VOYAGER_OMNI_GPU_LAYERS=999` set. The default, 0, runs the
	model on the processor.

	```sh
	VOYAGER_OMNI_GPU_LAYERS=999 /path/to/voyagershell/target/release/voyager-shell \
		--profile "$HOME/.local/share/voyagershell" \
		--session voyager-main
	```

4. Start the app and click the avatar's voice control. The app looks for the
	voice files once, when it starts. If a file is missing, the voice control
	stays off. Hold the pointer over it to see "Local voice is not installed"
	and the missing parts. Add the missing files, then restart the app.

[Local voice](docs/voice.md) explains how hearing and speaking work. [Where the
files are found](docs/voice.md#where-the-files-are-found) lists every voice
setting.

## How it works

```mermaid
flowchart LR
	UI["Interface scripts<br/>TypeScript"] -->|"typed operations"| App["VoyagerShell<br/>Rust"]
	Agent["Chat<br/>Codex"] -->|"docked tool calls"| App
	Voyager["Voyager<br/>Claude Code in a Vessel"] -->|"voyager command"| App
	App -->|"workspace document and programs"| Core["Herdr Core"]
	App -->|"layout and terminal output"| View["Native views<br/>GPUI and libghostty"]
	UI --> View
```

Herdr Core owns programs, terminals and the saved workspace document.
VoyagerShell's Rust application owns placement, content and the dock. Your
clicks, the chat's tool calls and the `voyager` command run the same Rust
operations. The app also checks each chat tool call against where the avatar
is docked. One contract,
written in Rust, generates the TypeScript types and validators that the
interface uses.

| Directory              | Contents                                                                  |
| ---------------------- | ------------------------------------------------------------------------- |
| [contract/](contract/) | Shared operations, identities and results, with generated types.          |
| [app/](app/)           | Workspace, content and dock owners, plus the Core and Codex connectors.   |
| [desktop/](desktop/)   | Native views, the terminal, the Voyager avatar and the interface scripts. |
| [content/](content/)   | Built-in Vessel type manifests, agent programs and shared controls.       |
| [tests/](tests/)       | The native verification environment and the architecture checks.          |

## Documentation

- [Learn VoyagerShell by running it](docs/README.md) is the hands-on tutorial.
- [The voyager command](docs/voyager-command.md) is the guide for agents in
  Vessels, including how to make a Vessel type. `voyager --skill` prints it.
- [Glossary](docs/glossary.md) defines Voyage, Fleet, Vessel, Portal and the
  other words the app uses.

Design notes for contributors:

- [Workspace](docs/workspace.md) covers placement, layouts and script
  authoring.
- [Terminal](docs/terminal.md) covers input, scrolling and program lifetime.
- [Agent launch](docs/agent-launch.md) covers `launches.json`, which adds
  agents beyond Codex and Claude Code.
- [Vessel types and content](docs/content.md) covers Vessel types and their data.
- [Local voice](docs/voice.md) covers hearing, speaking and the local model.
- [Private conversation](docs/conversation.md) covers the chat and its tools.
- [Avatar](docs/avatar.md) covers docking and motion.
- [Inspection](docs/inspection.md) covers the `--inspect` report of where
  controls are on screen.
- [Feature map](docs/features.md) lists each feature and the checks that
  prove it.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the checks every change passes and
[CONSTRAINTS.md](CONSTRAINTS.md) for the review rules. Agents start with
[AGENTS.md](AGENTS.md). Every pull request runs the checks in GitHub Actions.

## License

[MIT](LICENSE). Herdr Core is an external dependency. Upstream components and
artwork keep their own licenses and attribution.
