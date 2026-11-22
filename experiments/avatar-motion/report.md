# Avatar drag under load

## Goal

Isaac, 22 Nov 2026: "when I'm moving voyager avatar myself - which I feel is a primary action, its a bit janky and jerky under load, could we investigate ways to get this smooth and fast even up to maximal load - how do we make the moving maximally efficient. we can adjust hover and dock animations if needed."

A drag should draw the avatar under the pointer on every display frame, however busy the app and the machine are. This experiment measures the drag today, names what limits it, compares three prototypes and recommends one. It ships no product change.

## Answer in brief

- **Cost today.** At idle a drag is at the display floor: 14 ms from pointer move to present, and all 228 frames are shown. With eight terminals streaming, 89 to 92 of 228 frames are shown and the median latency is 57 ms. With builds on every core, 6 to 16 frames are shown and the avatar trails the pointer by 0.6 to 2 s.
- **Limiter.** The drag itself is cheap. It shares one UI thread with two costs it does not need. Every pointer move enters the canvas's JavaScript handlers, about 1 ms per move. Every terminal output frame rebuilds the whole canvas workspace and repaints the streaming terminals, about 15 ms per frame. Under builds, the CPU contention multiplies both.
- **Best option.** Stop pointer moves at the avatar during a drag, and let terminals wait until the drag rests (prototype v2). With streaming terminals, latency falls from 57 ms to 21 ms and frames shown rise from about 90 to 202 to 221 of 228. Running builds at `nice 19` takes the builds case from 0.6 to 2 s down to 53 to 59 ms.
- **Recommendation.** A product PR that does both parts of v2 behind an explicit drag state, about 40 lines in `desktop/src/avatar.rs`, `desktop/src/avatar/view.rs` and `desktop/src/terminal.rs`. Run machine builds at low priority in heavy. Hover and dock animations need no change, and the rocket-pack dock-home clip stays possible.

## Method

### Surface

The measurements come from `experiments/avatar-motion/wayland-drag.py`. It runs the release candidate in a private Core session and profile, on a headless mutter Wayland compositor (`--virtual-monitor 2560x1600`, 60 Hz) using the machine's NVIDIA GPU. Pointer input goes through mutter's RemoteDesktop D-Bus interface as relative motion at 250 Hz. The candidate is built with `--features voyager-desktop/frame-profiler`, so the GPUI foreground journal records every event, task, draw and present.

The maintained environment in `tests/native/` gained the same journey, `avatar-drag`, and it passes and records frames. It runs only on Xvfb with Mesa llvmpipe software rendering, where a present alone takes 40 to 117 ms. Its numbers are not the app's numbers on a GPU, so they are not used below. See Gaps.

### Drag and load

Each case drags the held avatar along the same 950-point path: 50 approach points, then a Lissajous figure of 330 by 230 logical pixels around (1000, 540). One move goes every 4 ms, so a drag lasts 3.8 s and spans 228 frames at 60 Hz. The loads are cumulative.

| Load | What runs |
|---|---|
| idle | One quiet terminal in the shown Fleet. |
| streaming | Eight visible terminals, each looping `seq` over a coloured, cargo-like line of about 85 characters. |
| fleets | Also three hidden Fleets with four streaming terminals each. |
| builds | Also one `while :; do :; done` busy loop per processor, 24 in all. |

### Numbers

`analyse.py` matches each injected move to the first `mouse_move` input record after it. Latency runs from the move's wall time to the present end of the first frame whose draw starts after that input was handled. Frames shown is the number of presents in the drag window, against 228 expected. Dropped frames count the 60 Hz slots missed between presents. Draw is the median CPU time of one frame. Input share is the share of the UI thread spent in pointer handlers. `compare.py` prints the tables from the run folders.

The idle floor of 14 ms is the display, not the app. A move waits on average half a 16.7 ms frame for the next frame, then the frame draws in 0.4 ms and presents. No change to the app lowers it at 60 Hz.

## Question 1. What a drag costs today

Three baseline runs, interleaved with the prototype runs. Latency is in ms.

| Load | Latency median | p95 | Frames shown of 228 | Dropped | Draw median | Input share |
|---|---|---|---|---|---|---|
| idle | 13.8 to 14.1 | 21.4 to 21.8 | 225 to 228 | 1 to 3 | 0.4 ms | 29 to 33% |
| streaming | 57.3 to 58.2 | 84.2 to 94.6 | 89 to 92 | 132 to 136 | 15.5 ms | 36 to 37% |
| fleets | 68.7 to 77.0 | 110.5 to 131.2 | 69 to 75 | 149 to 158 | 17.2 to 18.8 ms | 43 to 45% |
| builds | 568 to 2049 | 1009 to 3149 | 6 to 16 | 141 to 209 | 45.8 to 52.2 ms | 73 to 87% |

The builds latency has no stable value, because the pointer queue grows for as long as the drag lasts. In two of three runs, 252 and 113 of the 950 moves had not been handled when the profile window closed.

## Question 2. What limits it

The avatar's own work is small. Idle draw is 0.4 ms per frame. Hover is ignored while dragging, undock is off and no dock animation plays during a drag, so the hover and dock animations add no work. Hit tests are not visible in any profile. Everything else shares the one UI thread.

1. **Every pointer move enters the canvas's JavaScript.** The Vessel title bar, Fleet tab and Voyage row register `on_mouse_move` handlers (`desktop/canvas/panel-view.ts:208`, `desktop/canvas/navigation-view.ts:241` and `:585`). Each calls `workspace.targetDrag`, which serves the canvas's own reordering drags and returns at once during an avatar drag (`desktop/canvas/main.ts:1115`). Reaching it still costs about 1 ms per move: `ShellRuntime::dispatch_mouse_move`, its job drain and the QuickJS JIT's feedback bookkeeping. At 250 moves a second that is 29 to 37% of the UI thread at idle and with streaming. Under builds it is 73 to 87%, and moves queue one behind another. Evidence: the input share column above falls to 0 to 2% in v1, which changes only this.
2. **Terminal output rebuilds the whole workspace.** A terminal pump notifies its Pane. GPUI marks the Pane and every ancestor view dirty, so the next frame re-renders the canvas's ScriptView. That rebuilds the workspace element tree and its layout: the prepaint phase median is 8.3 ms with streaming. It then repaints each streaming Pane, about 1.6 ms each. Terminal parsing also runs on the UI thread, at most 2 ms or 64 KiB per pump, and takes 19% of it. Hidden Fleets add parsing work but, inferred from the view times, no painting. That is why fleets costs more than streaming. Evidence: v2 pauses only this, and draw falls from 15.5 ms to 5.6 ms.
3. **A floor of about 5 ms from GPUI's scene.** In v2 the canvas is cached and nothing but the avatar changes. A frame still takes 5.2 ms in paint, nearly all of it under `CanvasHost`. GPUI rebuilds the scene every frame: a cached view replays every primitive it drew last frame (`Window::reuse_paint` in gpui-pre 0.3.10 `window.rs:4079`, then `Scene::replay` and `insert_primitive` in `scene.rs:141`), and `Scene::finish` sorts them all again. Eight full terminals of glyphs make this about 5 ms. Inferred from the source and the phase times. Not isolated by a run.
4. **CPU contention from builds.** With 24 busy loops at normal priority the UI thread and the compositor get a share of the CPU, not a core. The same v2 frame that takes 5.6 ms without them takes 32 to 37 ms. At `nice 19` it takes 26 to 28 ms. Part of the remaining slowdown is unexplained. It may come from SMT siblings, clock speed or the compositor, which also competes.

## Question 3. Options compared

Each prototype is a patch in this folder against main 0bd92f60. They were built through `heavy` and measured with the same harness, interleaved with the baseline runs.

- **v1, quiet canvas** (`v1-quiet-canvas.patch`, 7 lines). Once an avatar drag has moved, the avatar's capture-phase listener stops the pointer move from propagating, so canvas handlers do not run. The canvas's own drags are separate gestures and are unaffected.
- **v2, terminals wait** (`v2-terminals-wait.patch`). v1, plus: each pointer move of a drag stamps a time. While the last stamp is under 120 ms old, `Pane::pump` returns at once and its existing 5 ms retry polls again. Terminals catch up when the pointer stops or the drag ends.
- **v3, terminals tick** (`v3-terminals-tick.patch`). v1, plus: during a drag all terminals pump together once every 100 ms instead of waiting.
- **Build priority.** The builds load started under `nice -n 19`, measured with the baseline and with v2. This models heavy running builds at low priority.

Latency in ms, frames shown of 228. Each cell gives the range over the runs.

| Variant (runs) | streaming latency median / p95 | streaming frames | fleets latency median / p95 | fleets frames | builds latency median / p95 | builds frames |
|---|---|---|---|---|---|---|
| baseline (3) | 57 to 58 / 84 to 95 | 89 to 92 | 69 to 77 / 111 to 131 | 69 to 75 | 568 to 2049 / 1009 to 3149 | 6 to 16 |
| v1 (2) | 42 / 58 to 59 | 113 to 115 | 46 / 65 to 67 | 107 to 109 | 74 to 94 / 145 to 165 | 60 to 75 |
| v2 (3) | 21 / 31 to 39 | 202 to 221 | 22 / 41 to 43 | 205 to 209 | 73 to 81 / 115 to 161 | 65 to 75 |
| v3 (2) | 25 / 46 | 176 to 177 | 30 / 54 to 55 | 165 to 166 | 106 to 141 / 293 to 359 | 45 to 52 |
| baseline, builds niced (1) | 63 / 129 | 80 | 105 / 193 | 52 | 147 / 329 | 37 |
| v2, builds niced (2) | 21 / 35 to 36 | 213 to 216 | 21 to 23 / 42 to 47 | 192 to 205 | 53 to 59 / 116 | 90 to 92 |

Idle stays at the floor in every variant: median 13.4 to 14.1 ms and 223 to 228 frames.

The niced runs change only the builds load. Their streaming and fleets rows show the spread between runs of the same build. The one niced baseline run's fleets row, 105 ms, sits above the three normal baseline runs, 69 to 77 ms.

v3 is worse than v2 for a reason that matters for design. Each 100 ms tick brings back one full workspace rebuild plus eight Pane paints, a frame of about 15 ms that misses two or three slots. Ten ticks a second cost about 50 frames per drag. Under builds those ticks also get slower, so v3 is worse than v1 there.

## Question 4. Recommendation

Build v2 as a product change, with two corrections the prototype skipped, and lower build priority in heavy.

### What the product PR changes

1. `desktop/src/avatar/view.rs`. Stop pointer-move propagation once the avatar drag has moved, as in v1.
2. `desktop/src/avatar.rs`. Publish an explicit drag state, held while the avatar is dragged and moving, and cleared on release or after 120 ms at rest. Replace the prototype's thread-local timestamp with it.
3. `desktop/src/terminal.rs`. While the state is held, the Pane pump does not take output. The pump task waits for the state to clear instead of polling every 5 ms. In v2 the polling costs 9% of the UI thread, the `small_polls` share.
4. `docs/avatar.md` and `docs/terminal.md`. Describe the drag state and the deferred pump.
5. `tests/native`. The `avatar-drag` journey and its control are on this branch. Its cases prove the avatar follows under each load. They cannot judge a frame budget until the environment has a GPU surface.

### Cost

About 40 changed lines in three files, plus documents. One build and the existing journey.

### Risks

- **Terminals freeze while the avatar moves.** Output resumes within 120 ms of the pointer stopping. How quickly a terminal catches up after a long drag was not measured. This is a visible change to an agreed interaction, so it is Isaac's call. v3's measurements show that a cheap partial refresh costs most of the gain.
- **Output held back for a long drag.** While the Pane takes nothing, it presumably grants Core no credit. Whether a fast producer then blocks on its pty, or Core keeps reading into its screen, is not settled here. The Wayland harness records how many load programs it started, not whether they kept running. The PR must read Core's viewer credit behaviour and cover a multi-second drag.
- **Pointer handlers under the drag.** Stopping propagation also stops any other bubble-phase move handler in the window during an avatar drag. Today the only ones are the canvas reorder handlers, which return at once. Dock targets are computed in Rust by the avatar's own listener, which runs before the stop. The runs dragged without docking, so docking under v1 is not yet measured.
- **Builds stay a limit.** Without lower build priority, v2 still shows only 65 to 75 of 228 frames under builds.

### Build priority

heavy is a Workshop tool, not product code. Running its build and battery slots under `nice 19`, or `SCHED_IDLE`, keeps machine builds from taking the UI thread's CPU. It does not help a build that a user starts elsewhere. A product-side answer would be a higher UI-thread priority through rtkit, which is unexplored.

### Hover, dock and the backflip

No animation change is needed, because none of them run during a drag. The recommended change touches only pointer routing and the terminal pump. A dock-home clip such as the rocket-pack backflip plays after release, when the drag state is clear, so it can be added later unchanged.

### Larger follow-ups, unproven

- **Keep terminal output from rebuilding the workspace.** This costs 5 to 8 ms in every frame with streaming terminals, with or without a drag. A Pane notify dirties the ScriptView, so the canvas rebuilds its whole tree. Fixing it would speed up all streaming, not only drags, and it needs SDK or canvas architecture work.
- **Draw the avatar on its own surface during a drag**, to escape the 5 ms full-scene replay. GPUI has no subsurface support, so this needs research.
- **Parse terminal output off the UI thread.**

## Proposed declared invariant

No entry covered drag smoothness. The verifier's gate requires every journey case to serve one, so this branch adds `avatar-drag-follows-pointer` to `tests/native/declared-invariants.toml`. It is a proposal for Isaac to accept or reword before it reaches main:

> While the user drags the avatar, it is drawn under the pointer on every display frame, at idle and up to the load in the usage envelope.

It names `type:desktop/src/avatar.rs#Drag` as its guard. That guard covers the following, not the timing. Its check is the four `avatar-drag` cases. Its gap says that no frame budget is judged until the environment has a GPU surface. A usage-envelope entry for drag load, the counts of streaming terminals and hidden Fleets in real use, would give the budget its numbers.

## Gaps

- **Surface.** The maintained environment covers X11 on Xvfb and llvmpipe only, and it cannot measure GPU frame timing. The Wayland numbers come from an exploratory harness under `experiments/avatar-motion/`, not product proof. A headless mutter and RemoteDesktop backend in `tests/native` would let `avatar-drag` judge a budget.
- **Display.** The virtual monitor runs at 60 Hz. Isaac's display may refresh faster, which lowers the floor and raises the work per second.
- **Pointer.** Moves are relative motion through RemoteDesktop at 250 Hz, not a physical mouse. A gaming mouse at 1000 Hz sends four times as many moves, which makes the per-move canvas cost worse in the baseline.
- **Present.** Latency ends at the client's present, not at light on the screen. Compositor latency is excluded.
- **Repeats.** Two or three runs per variant on one machine. The tables give ranges, not confidence intervals.
- **Profiling.** Stack sampling with `eu-stack` took about one sample a second and gave 8 samples. One was decisive, and it agreed with the journal's attribution. The limiter rests on the journal's phase, view and task times, and on each prototype changing one cause.
- **Sandbox numbers.** The X11 journey ran a baseline: idle latency median 72 to 208 ms and streaming 1214 to 1425 ms. llvmpipe dominates both, so they are recorded and not compared.

## A defect seen on the way

After a drag ended in a dock in the X11 sandbox, the workspace status line read: "cx.notify() is not allowed during the `render` phase; request a re-render from an event handler instead". It was seen once, in one run's inspection. It was not traced. A likely origin is an avatar update made while the canvas renders. It needs its own issue.

## Files on the branch

- `tests/native/src/journey/avatar_drag.rs`, the `avatar-drag` journey, and `tests/native/controls/avatar-drag.patch`, its control. With the control, which pins the avatar at its starting point, `idle` fails with the product blamed.
- `Native::glide` in `tests/native/src/native/input.rs` injects a timed held glide and records each move's wall time.
- `desktop/src/diagnostics_frame.rs` gains `VOYAGER_FRAME_PROFILE_WINDOW`, `VOYAGER_FRAME_PROFILE_RECORDS` and `VOYAGER_FRAME_PROFILE_SECONDS`, so a profile can cover one window of a long journey. It is behind the `frame-profiler` feature.
- `experiments/avatar-motion/` holds the Wayland harness (`wayland-drag.py`, `wayland-run.sh`), the sandbox runner (`run.sh`), the analysis (`analyse.py`, `compare.py`, `stacks.py`) and the three prototype patches.

To repeat a run: build a candidate with the frame profiler, then run `experiments/avatar-motion/wayland-run.sh <folder holding voyager-shell and voyager> <label>`. Then run `python3 -I experiments/avatar-motion/compare.py <scratch>/wayland <labels...>`.
