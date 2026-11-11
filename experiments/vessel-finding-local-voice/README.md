# Vessel finding and local voice

This is an unmerged experiment on `experiment/vessel-finding-local-voice`. It starts from main as of 11 November 2026, the product README merge. Nothing here is accepted product behavior. One native journey has run in the real application with the real avatar, and it is described below.

Isaac's main complaint about the avatar is the delay between asking for an action and seeing it happen. Neither prototype may add a model tool call.

## Prototype 1: finding the right vessel

The avatar used to read a stored name such as "Terminal 1" while the screen showed the folder name, and several panels could share one name. It also had to work out "top right" from a tree of splits.

### What changed

- **One name.** The application observation numbers repeated on-screen names among siblings, for example "voyagershell" and "voyagershell 2". The header shows the same numbered name. A deliberate name stays authoritative on screen and only gains the number.
- **One address.** Every Vessel and Portal has `Voyage/Fleet/Vessel` or `Voyage/Portals/Portal`. Repeated Voyage and Fleet names are numbered the same way, and a final pass keeps every address unique across the workspace.
- **A position.** Each shown panel has a column counted from the left along its row, a row counted from the top along its column, the size of the grid and the corners it occupies. Every corner of a Fleet belongs to exactly one shown panel, so "top right" resolves to one Vessel. When no Fleet is named, a position means the selected Fleet.
- **No extra call.** Every `voyager_workspace` response now carries `panels`, taken from the same observation the screen uses.
- **One title.** A panel title showed the folder and then the folder again with its number. A numbered folder name now replaces the folder, for example `bash · voyagershell 2`.

### How it works

Source stays comment-free, so the mechanism is recorded here.

- `app/src/locate.rs` holds the pure logic. `distinct` numbers repeats in layout order. `positions` lays out the visible split tree with integer arithmetic on the split shares, then ranks each panel behind the panels to its left in the same row and above it in the same column. `locate` builds names, addresses and positions for the whole layout.
- `app/src/observation.rs` calls `locate` on the whole layout before it narrows to the caller's focus. A Vessel therefore keeps the same name and address whether the avatar is docked to the workspace, its Fleet or the Vessel itself.
- A hidden panel, a panel covered by a maximized sibling and a Portal in a hidden column have no position.
- `app/src/administrator.rs` asks for the observation at the version the workspace just returned and stores its panels in the typed `Response.panels`. If that observation itself moved the layout, an inspection is repeated once inside the application so the model holds a current version. An effect is never repeated.
- When a response exceeds the 24 KiB tool bound the layout is dropped and `panels` is kept.
- Numbers follow layout order. Closing "voyagershell" turns "voyagershell 2" into "voyagershell".

### Evidence so far

Run on Linux on 11 November 2026, in this worktree.

- `cargo fmt --all --check` and `cargo clippy -p voyager-contract -p voyager-app --all-targets --locked -- -D warnings` pass.
- `cargo test -p voyager-contract -p voyager-app --locked` passes, 140 tests, with `HC_SOCKET`, `HC_SESSION` and `HC_TERMINAL_ID` cleared as the suite requires.
- `npm run format:check` and `npm run contract:check` pass. The Node tests for the validator, terminal, rename, Notes and canvas pass.
- Negative control: disabling the numbering failed the naming test, and treating a side-by-side split as stacked failed the position test. Both were restored.
- The tests were written after the code. The negative control stands in for a first failing run.
- A real model used the list. Claude Haiku 5.5, acting through the stand-in workspace below, was graded on the calls it made. Each figure is one run.

| Layout | With `panels` | Without `panels` |
| --- | --- | --- |
| Small: three panels, tall left beside two stacked | 8 of 8 actions right, 2 of 2 impossible requests left alone | 8 of 8, 2 of 2 |
| Crowded: five terminals in one folder, three over two, stored names with gaps | 7 of 7, 1 of 1 | 5 of 7, 0 of 1 |

On the crowded layout without `panels`, "Hide voyagershell 4" hid the Vessel stored as "Terminal 4", "Rename voyagershell 2" found nothing, and "Hide voyagershell 6", which does not exist, hid a real Vessel. Requests by position were right both ways, so the measured gain is in names.

### Native journey

`python3 prove.py --foundation --journey vessel-finding` drives the release build in its own session and profile. It opens three terminals in one folder, reads the names the panel titles expose, then types two requests to the real avatar and checks the layout the application stored.

- The three panels showed the folder name, the folder name with 2 and the folder name with 3. Their stored names were still Terminal 1, 2 and 3.
- "Rename the vessel called (folder) 3 to Port." The avatar inspected once and renamed the panel that showed that name.
- "Maximize the top right vessel." The avatar inspected once and maximized the tall right panel.
- It passed twice, on the first build and on the final committed build. The avatar ran Codex `gpt-6.1-sol` at high effort, the application default.
- Negative control: the same journey against a build of main fails at the first step, because all three panels show the same name.
- The effect landed 9.1 to 17.5 seconds after the application accepted each request, over four requests. Each request used two tool calls, an inspection and the effect. This is the delay Isaac reports, and this branch does not change it.

### Where the avatar's time goes

The journey can set the avatar's model and effort through the profile's `conversation.json` (`VOYAGER_PROOF_AVATAR_SETTINGS`) and records when each step first shows in the conversation. `VOYAGER_PROOF_POSITION_ONLY` skips the name steps so the same request can run on a build of main.

| Avatar setting | Requests | Accepted request to effect |
| --- | --- | --- |
| `gpt-6.1-sol`, high effort, the default | 4 | 9.1 to 17.5 s, mean 13.5 s |
| `gpt-6.1-sol`, low effort | 6 | 7.0 to 12.5 s, mean 9.9 s |
| `gpt-6.1-terra`, low effort | 2 | 9.4 and 11.7 s |
| `gpt-6-luna`, low effort | 1 | Failed. It inspected, then could not form the rename call. |
| Build of main, `gpt-6.1-sol`, low effort, position request only | 2 | 11.6 and 16.4 s |

- Low effort saves about a quarter. A smaller model saves nothing more, and the smallest cannot use the tool.
- At low effort the inspection result showed 1.7 to 4.0 seconds after the request was accepted. The effect followed 3.1 to 9.8 seconds after that, and in five of six requests 7.5 to 9.8 seconds. The answer began 1.1 to 2.3 seconds after the effect.
- The slow part is therefore the model's step after it reads the inspection. The build of main shows the same gap, 8.2 and 11.4 seconds, so the panel list did not add it.
- Codex on its own, outside the application, took 11.9 and 13.8 seconds for a one-word reply at low effort including start-up, with 12,822 tokens of context.
- These are small samples from one layout on one evening. Twelve timed runs were started and three stopped in the fixture before any request: one split that did not land and two accessibility read errors. The journey is not yet steady enough for acceptance.
- With the native toolchain on the path, `npm test` now passes as a whole: the type check and 80 Node tests.

Limits of the journey:

- One layout, one folder and two requests. The fixture runs the application as an X11 client, so it says nothing about a Wayland-native window or another operating system.
- The journey has its own setup. The existing `split-resize` and `pane-maximize` setup fails on main before any assertion of theirs, because it expects a single content and no content picker. Main now adds the Home Agents view and asks which content a split should open. That repair is outside this branch.
- With the agent switch below, the branch has about 610 lines of tests against about 960 lines of product source, inside the project's test-size limit.

Not run:

- Any other native journey, and the `cargo` checks for the desktop crate beyond its release build.
- An independent or fresh-context review.

### Known gaps

- The Agents view and the focus path still use the earlier names.
- Fleets or Voyages that already share a name are numbered in addresses but not on their tabs.
- Creating or renaming something does not store the numbered name.
- Focus rules are unchanged. Docked to a Fleet, the avatar still sees only that Fleet.

## Prototype 2: local voice for Claude or Codex

LFM3-Omni listens and speaks on the laptop. An acting agent, Claude Code or Codex, does the workspace work. Nothing in this prototype is wired into the application yet. It runs beside it, against a stand-in workspace, on WAV files.

### The loop

1. Omni hears the request and decides in text mode. Workspace work becomes one hand-off with the request in words. Greetings and small talk it answers itself.
2. The acting agent receives the words with the focus, calls `voyager_workspace` and returns one short sentence.
3. Omni reads that sentence aloud word for word.

### Choosing the agent and the voice

`agents.choose` reads two optional settings, `agent` and `voice`.

- With no setting, the agent is Claude when Claude Code is installed, otherwise Codex.
- With Claude the voice is local. With Codex the voice stays Codex's own unless `voice` is set to `local`.
- A missing agent or an impossible pair is refused with a plain message.

### Files

| File | Purpose |
| --- | --- |
| `agents.py` | The choice rule, a cold Claude turn, a kept-alive Claude session and a headless Codex turn. |
| `workspace_stub.py`, `world.py` | A stand-in workspace owner over MCP. It serves the real generated tool schema, keeps the version rule and applies the few effects the tests use. |
| `act_test.py`, `speed_test.py` | Grade the calls an agent makes, and time requests in a kept-alive session. |
| `inband_test.py` | Gives Claude Code the tool over the pipe the host already holds, with no server process. |
| `voice_loop.py` | The whole loop on WAV files. |
| `voice_handoff.py`, `voice_ws.py`, `voice_t10_*`, `voice_t11_*`, `voice_t12_*` | The earlier measurements of Omni's hand-off decision, typed and spoken, and of the live voice channel. |
| `retest_*.py` | The earlier retest of LFM3 calling Voyager's tools itself, which found the two schema defects below. |
| `local/` | Model files and audio, ignored by Git. |

### Results

Single runs on 11 November 2026 with Claude Code 2.1.322, Claude Haiku 5.5, LFM3-Omni-2B at Q8 on the laptop GPU, and synthetic speech.

- **Claude can hold Voyager's tool.** It received the real schema over MCP and made the right call in the table above.
- **A cold start is too slow.** Starting Claude Code for a one-word reply took 5.4 and 7.4 seconds. A whole cold request took a median of 6.3 to 9.7 seconds.
- **A kept-alive session is fast.** After the first request, the effect landed a median 1.9 seconds after the request and the answer was ready at 3.1 seconds. Each later request used one tool call, because the session already held a current version and the focus revision confirmed it.
- **The spoken loop worked on five of five requests.** Omni decided in 0.24 to 0.44 seconds. A greeting was answered aloud 0.3 seconds after the request ended. Once Claude was running, an action took effect 2.3 to 3.1 seconds after the request ended and its spoken answer began at 3.7 to 4.4 seconds. The first action of the session took 7.2 and 9.0 seconds.
- **Mishearing was absorbed.** Omni wrote "Deployes" and "Voyager shell 2". Claude matched Deploys and "voyagershell 2".
- **Claude Code needs no separate server.** `inband_test.py` declares the tool as an in-process server. Claude Code then sends each tool message down its own output pipe and reads the reply from its input pipe. Two requests were right, with the effect at 3.5 and 1.8 seconds, the same as the separate server.
- **Codex headless is blocked.** `codex exec` refused the stand-in tool for want of an approval, with approvals set to never inside the read-only sandbox. It was not run with the sandbox bypassed.

### Swapping the acting agent, and the panel list in each request

Two changes followed the timings above.

- **The panel list travels with each request.** The application already inspects the workspace before a turn starts. The panels from that observation now go with the turn as `voyager.panels`, and the instructions let the avatar act at the focus revision without inspecting again. The version check still refuses a stale effect.
- **The acting agent is a setting.** `conversation.json` accepts `agent` beside `model` and `effort`. `{"agent":"claude"}` selects Claude Code with `claude-haiku-5-5` at low effort. Codex stays the default. Claude Code gets Voyager's four tools as an in-process server, so each tool message travels on the pipe the application already holds and reaches the same dispatcher, identity checks and version checks as Codex. `app/src/claude.rs` holds the adapter.

Results in the native journey, timed from the moment the application recorded the request, so agent start-up counts. Each figure is one request.

| Acting agent | Requests | Submitted to effect | Submitted to answer |
| --- | --- | --- | --- |
| Codex `gpt-6.1-sol`, low effort, panel list in the request | 2 | 7.6 and 15.2 s | 9.3 and 16.6 s |
| Claude Code `claude-haiku-5-5`, low effort, panel list in the request | 4 | 1.2 to 2.1 s | 2.2 to 3.0 s |

- With the panel list, Codex skipped the inspection in seven of eight requests across four runs, yet its time to effect stayed at 7.5 to 15 seconds. Its delay is the model's step, not the extra round trip.
- Claude made one tool call per request and was right in all four, across two runs. The first request of each run includes starting Claude Code.
- Once Codex at high effort used the contentId in place of the placementId. The application refused it as "Panel not found", and Codex corrected itself. The instructions now name the placementId.
- Claude has no native file tools in this session and no native voice. A voice start with Claude is refused and text stays available.
- Claude Code's in-process server channel is documented only through Anthropic's Agent SDK, so a Claude Code update may change it.

### Why Claude uses MCP when Codex does not

Codex's app-server accepts tool definitions from its host when a thread starts (`dynamicTools` in `app/src/codex_protocol.rs`) and calls the host back on the same pipe. Claude Code has no such option. Its only command-line door for outside tools is `--mcp-config`. Claude itself does not need MCP. There are three ways to give it Voyager's tools:

| Channel | What it needs | What it costs |
| --- | --- | --- |
| Claude Code, tool messages on the pipe Voyager already holds | The Claude login already on the laptop | The messages are MCP-shaped. Anthropic documents this channel only through its Agent SDK, so a Claude Code update may change it. Measured here. |
| Claude Code with a separate small server | The Claude login | One more process per session, and that process must reach back into the application. Measured here. |
| The Anthropic API called directly, tools in each request | An API key billed apart from the Claude subscription | No MCP and no Claude Code. Voyager runs the model loop and manages the conversation itself. Not measured. |

The administrator instructions tell the Codex avatar not to invoke MCP tools. Read in context, that keeps it off other servers configured on the machine. Claude Code is started with `--strict-mcp-config` and no built-in tools, so it sees Voyager's tool and nothing else.

### What LFM3 alone could not do

The earlier retest gave LFM3-1.7B and Omni Voyager's tools directly. Two defects in how the generated schema reaches a local server caused every wrong action:

- The schema lists fields alphabetically, so `operation` follows the arguments in most operations, and a constrained model can only finish the few where it sorts first.
- The workspace, Notes and worktree tools each define a type named `Action`, so with all four tools loaded one tool emitted another's operation.

With both fixed the text model scored 7 to 10 of 10 at a median 4.6 seconds, and Omni 3 to 5 of 10. That is why Omni only listens and speaks here. Neither defect is fixed on this branch.

### Running it

```sh
L=/home/isaac/voyagershell/.worktrees/experiment-lfm3-avatar/experiments/lfm3-avatar/local/llama-cuda
LD_LIBRARY_PATH=$L $L/llama-server -m local/LFM3-Omni-2B-Q8_0.gguf -mm local/mmproj-LFM3-Omni-2B-Q8_0.gguf \
  --host 127.0.0.1 --port 8112 -c 32768 --jinja -ngl 999 --reasoning off --temp 0
python3 voice_loop.py local/audio/request-2.wav
python3 act_test.py claude
VOYAGER_WORLD=crowded python3 act_test.py claude --no-panels
python3 speed_test.py
python3 inband_test.py
```

The native journey needs the release build and the desktop. On this laptop the build needs `zig` on the path and `LIBRARY_PATH` pointing at the native link libraries, as other worktrees set them.

```sh
cargo build --release --locked -p voyager-desktop --bin voyager-shell
python3 prove.py --foundation --journey vessel-finding --launch --compositor --binary "$PWD/target/release/voyager-shell" \
  --session voyager-unique-name --evidence /absolute/new/evidence --desktop-env /absolute/desktop-environment.json
```

Start and stop the Omni server by hand. Project rules bar a second process supervisor.

### Not proven

- Claude with the local voice inside the application. Claude has no native voice, so voice in the application still needs Codex.
- A real microphone, a real speaker, Isaac's voice, interruption and end-of-speech detection.
- The settings file. `conversation.json` still accepts only model and effort.
- Codex with the local voice. Inside the application Codex already holds the tools through its app-server, so the hand-off would be a turn on the existing thread.
