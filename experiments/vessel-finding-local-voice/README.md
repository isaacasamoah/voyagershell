# Vessel finding and local voice

This is an unmerged experiment on `experiment/vessel-finding-local-voice`. It starts from main as of 11 November 2026, the product README merge. Nothing here is accepted product behavior, and no native app journey has run yet.

Isaac's main complaint about the avatar is the delay between asking for an action and seeing it happen. Neither prototype may add a model tool call.

## Prototype 1: finding the right vessel

The avatar used to read a stored name such as "Terminal 1" while the screen showed the folder name, and several panels could share one name. It also had to work out "top right" from a tree of splits.

### What changed

- **One name.** The application observation numbers repeated on-screen names among siblings, for example "voyagershell" and "voyagershell 2". The header shows the same numbered name. A deliberate name stays authoritative on screen and only gains the number.
- **One address.** Every Vessel and Portal has `Voyage/Fleet/Vessel` or `Voyage/Portals/Portal`. Repeated Voyage and Fleet names are numbered the same way, and a final pass keeps every address unique across the workspace.
- **A position.** Each shown panel has a column counted from the left along its row, a row counted from the top along its column, the size of the grid and the corners it occupies. Every corner of a Fleet belongs to exactly one shown panel, so "top right" resolves to one Vessel. When no Fleet is named, a position means the selected Fleet.
- **No extra call.** Every `voyager_workspace` response now carries `panels`, taken from the same observation the screen uses.

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

Not run:

- `npm test` as a whole and any build of the desktop crate. The type check builds the native exporter, which needs `zig`, and `zig` is not on this shell's path.
- Any native application journey. The desktop is reserved for another Vessel's task.
- The avatar's own Codex model against the new list.

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
- **Codex headless is blocked.** `codex exec` refused the stand-in tool for want of an approval, with approvals set to never inside the read-only sandbox. It was not run with the sandbox bypassed.

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
```

Start and stop the Omni server by hand. Project rules bar a second process supervisor.

### Not proven

- Anything inside the application. The Claude adapter still has to be written behind `app/src/provider.rs`, with its tool channel in front of the existing dispatcher and each call bound to the accepted turn.
- A real microphone, a real speaker, Isaac's voice, interruption and end-of-speech detection.
- The settings file. `conversation.json` still accepts only model and effort.
- Codex with the local voice. Inside the application Codex already holds the tools through its app-server, so the hand-off would be a turn on the existing thread.
