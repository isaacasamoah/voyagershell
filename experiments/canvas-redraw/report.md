# Terminal output redraws the whole canvas

Branch `experiment/canvas-redraw`, off main b2cc7447. Experiment only, with no product PR.

## Answer in brief

- **Cause.** A terminal Pane's `cx.notify()` makes GPUI dirty every ancestor view. The cached canvas ScriptView then misses its cache and rebuilds, lays out and paints its whole element tree, and every terminal under it renders again. Herdr App avoids this because no terminal sits inside a JavaScript view.
- **How much of a frame that is.** It is less than expected. With 8 busy terminals the canvas's own work is 4.3 ms of a 12.6 ms frame. With 20 it is 10.0 ms of 21.2 ms. The rest of the frame is the busy terminals' own rendering and GPUI's per-view work, and no change to the canvas removes those.
- **Best prototype.** P3, cached canvas boundaries, keeps a terminal's output to its own Vessel's subtree. It removes most of the canvas cost: the canvas's own prepaint falls from 4.3 to 0.9 ms per frame, and from 10.0 to 2.2 ms. The whole frame improves only about 8 to 10% with 20 busy terminals (19.8 to 20.4 ms becomes 18.2 to 18.3 ms), and it is within noise with 8. Drag lag does not change materially. Cached Panes alone (P1), the terminal layer in Herdr's shape (P2) and boundaries with uncached Panes (P4) gave nothing measurable.
- **Recommendation.** Do not take the canvas restructure for the drag. For the drag, the small change is the avatar-motion v2 recommendation: hold terminal output while the avatar moves. P3 is a medium change (about 200 lines once cleaned up, no SDK patch) for a modest gain in every busy frame, and it can wait. The larger targets these runs found are the busy terminals' own per-frame cost, and Core's echo delay of 110 to 150 ms when typing with 8 busy terminals.

## Goal

Isaac, 22 Nov: the avatar drag should be "smooth and fast even up to maximal load", and "lets take the proper fix to an experiment - and see what we find, and decide based on scope then." The avatar-motion experiment (`reports/avatar-motion.md`, Question 2 item 2) found that every terminal output frame rebuilds the whole canvas workspace, costing 5 to 8 ms in prepaint and about 1.6 ms per streaming Pane, with or without a drag.

## Question 1. Why a terminal update redraws the canvas

The view nesting in the native window is `CanvasHost` (window root) → canvas `ScriptView` → each terminal `Pane`.

1. **The Pane notifies.** `Pane::pump` (`desktop/src/terminal.rs:237`) parses output and calls `cx.notify()` whenever it consumed bytes (`terminal.rs:280`).
2. **GPUI dirties every ancestor.** `Window::mark_view_dirty` (gpui-pre 0.3.10 `src/window.rs:2264`) walks `dispatch_tree.view_path_reversed(view_id)` (`src/key_dispatch.rs:588`) and inserts every ancestor view into `dirty_views`. The Pane's ancestors are the ScriptView and CanvasHost.
3. **The canvas cache misses.** `CanvasHost::render` (`desktop/src/host.rs:759-768`) draws the ScriptView as a cached view. GPUI reuses a cached view only when it is not in `dirty_views` (gpui-pre `src/view.rs:550`). The ScriptView is dirty because its child is, so the cache misses.
4. **The ScriptView rebuilds its whole tree.** `ScriptView::render` (gpui-shell at SDK 94480398, `crates/shell/src/view.rs:304-342`) does not run JavaScript unless the script changed. It does call `materialize(&self.runtime, snapshot, …)` (`crates/shell/src/materialize.rs:685`) on every render, which turns the whole retained snapshot into a new GPUI element tree. GPUI then lays out, prepaints and paints that whole tree.
5. **Every Pane renders again.** The terminal component places its Pane uncached: `request.finish(div().size_full().child(pane))` (`desktop/src/terminal.rs:627`). An uncached child view renders whenever its parent does, so every visible Pane re-renders and repaints, not only the one that changed.

So one terminal's output costs a full canvas materialize, layout, prepaint and paint, plus a render of every visible terminal. With eight streaming terminals this happens on nearly every frame.

GPUI cannot stop step 2 at a boundary. A cached view replays its recorded prepaint and paint ranges as one block (`Window::reuse_prepaint`, `reuse_paint`, `src/window.rs:4014` and `:4079`). There is no way to repaint a child inside a replayed parent, so any descendant change has to invalidate every cached ancestor.

## Herdr App

Pinned revision: herdr-app b67715e8985e6097f83f8120fc9b9e52e6596f50 (14 Nov 2026), read at `/var/tmp/voyager-crew/upstream/herdr-app`.

Herdr App keeps terminals out of its JavaScript views altogether.

- Its Rust `AppWindow` builds the pane layout itself (`src/window.rs:4291` `render_node`, `:5130` `impl Render for AppWindow`).
- Each terminal is a cached sibling view: `shown_terminal` → `cached(view)` (`src/window.rs:4755-4765`), with the comment "A view drawn again only when it changed: a terminal's output then redraws that terminal, not every mod and pane in the window."
- Each mod (a JavaScript `ShellRoot` / ScriptView) is a separate slot, and `ShellRoot` caches the mod's view itself (`src/window.rs:4444-4446`). The comment there names our problem: "GPUI rebuilds all under a cached view that changed, so a spinner step would rebuild the mod."
- A terminal's output therefore dirties only that terminal and `AppWindow`. AppWindow's Rust render is cheap, and the other terminals and every mod replay from cache.

Voyager differs: its canvas is a JavaScript ScriptView that owns placement layout and places terminals as components inside it. That is why a terminal's output reaches the whole canvas.

## Method

All runs use the avatar-motion Wayland harness (`experiments/avatar-motion/`, from `experiment/avatar-motion` bd1023b0), extended on this branch. It runs the release candidate built with `--features voyager-desktop/frame-profiler` in a private Core session and profile, on headless mutter (2560 by 1600 at 60 Hz, NVIDIA GPU). Each build went through `heavy`, and each run through `heavy perf`.

Changes to the harness:

- **Tiled terminals.** Each new terminal splits the largest one, along its longer side. Before this change, each terminal split the newest one in half, so at 8 or 20 terminals most were 18 px slivers stacked on each other. The avatar-motion experiment's "eight visible terminals" had that same layout, so it understated the drawing load. Now 8 streams give 10 terminals of about 295 by 175 to 391 px, and 20 streams give 22 terminals of 142 to 295 by 176 px, in the default 1450 by 940 window.
- **Load levels.** `idle` has one quiet terminal and the typing terminal. `streaming` has 8 terminals looping coloured, cargo-like lines. `streaming20` has 20 of them, all in the shown Fleet.
- **Drag.** The same 950-move glide as avatar-motion: 250 Hz relative motion through RemoteDesktop, 228 frames.
- **Typing.** The typing terminal runs a raw-mode echo loop. Before each drag the harness clicks it and types 40 keys, 150 ms apart. A frame-profiler-only line in `Pane::pump` stamps when each echo is parsed. Key to screen is split into three parts: key handled by the app (the journal's `key_down`), echo back from Core (the parse stamp), and echo drawn (the first present whose draw starts after the parse). The first key after the focus click is lost in every run, so each run counts 39 of 40 keys.
- **Frame time.** This is the workspace window's draw time in the typing window, with no pointer moving. Drag frames give the same picture.

Runs, in the order they ran, under `/var/tmp/voyager-crew/scratch/canvas-redraw/wayland/`:

- `base-b`, `p1-b`, `p2-b`, `p3-b`. P1's run overlapped another crew's load (5-minute load average 13.7, against 6.6 to 7.1), so it is excluded.
- `p2-probe`.
- `base-c`, `p1-c`, `p3-c`, on a quiet machine, given a free slot by Build.
- `p4-d`, `p4-e`, quiet.

`p4-b` and `p4-c` failed at setup. A copy step interrupted earlier had left a truncated 16 KB binary. It was restored from the same build (sha256 `ac578920d551…`) before `p4-d` and `p4-e`.

## Question 2. Ways to keep a terminal update to its own Pane

Each prototype is a patch in `experiments/canvas-redraw/` against this branch's measuring commit.

- **P1, cached Panes.** Each Pane is drawn as a cached view inside the canvas. The canvas still rebuilds on every terminal frame, but quiet Panes replay.
- **P2, terminal layer (Herdr's shape).** The canvas's `Terminal` component becomes a placeholder that records its bounds and clip. A layer in `CanvasHost`, after the cached ScriptView, draws each Pane at those bounds in the same frame. A Pane's notify no longer reaches the ScriptView.
- **P3, cached canvas boundaries plus cached Panes.** This adds a native `Cached` component (`desktop/src/cached.rs`). It takes the canvas's `.content()` slot as a gpui-shell slot factory and builds it inside its own cached view. The canvas wraps each Vessel panel, the sidebar and the Fleet strip. An observer in `CanvasHost` invalidates every boundary when the script rebuilds. A terminal frame then rebuilds the canvas skeleton and its own panel, and the other panels replay.
- **P4, P3 without cached Panes.**

Frame time while typing, median / p95 in ms:

| variant | 8 streams | 20 streams |
|---|---|---|
| baseline (b, c) | 12.2 / 17.8, 13.4 / 18.2 | 20.4 / 26.0, 19.8 / 25.4 |
| P1 (c) | 12.1 / 17.3 | 19.1 / 24.5 |
| P2 (b) | 11.9 / 16.8 | 21.6 / 24.2 |
| P3 (b, c) | 12.0 / 16.7, 12.0 / 16.7 | 18.3 / 23.4, 18.2 / 23.6 |
| P4 (d, e) | 12.2 / 17.3, 12.4 / 17.9 | 21.8 / 24.9, 21.5 / 24.7 |

At idle every variant takes 2.5 to 3.3 ms.

Avatar drag latency, median / p95 in ms, with frames shown of 228:

| variant | idle | 8 streams | 20 streams |
|---|---|---|---|
| baseline (b, c) | 15.0 / 23.0 (226), 14.2 / 22.2 (226) | 44.6 / 71.2 (113), 47.6 / 80.5 (106) | 94.0 / 154.6 (58), 85.2 / 137.2 (64) |
| P1 (c) | 14.6 / 22.5 (227) | 43.4 / 72.1 (115) | 89.1 / 139.4 (62) |
| P2 (b) | 14.8 / 22.5 (226) | 41.4 / 62.7 (120) | 80.5 / 135.6 (66) |
| P3 (b, c) | 14.6 / 22.3 (227), 14.4 / 22.1 (226) | 42.3 / 73.3 (119), 46.5 / 72.9 (108) | 87.1 / 140.7 (62), 92.5 / 158.3 (58) |
| P4 (d, e) | 14.8 / 22.5 (227), 14.0 / 21.8 (227) | 45.6 / 118.5 (106), 42.5 / 70.0 (116) | 102.0 / 165.5 (55), 92.5 / 142.6 (58) |

Typing, key to screen median in ms, with its three parts (handled / echo back / drawn):

| variant | idle | 8 streams | 20 streams |
|---|---|---|---|
| baseline (b, c) | 5.9, 5.1 | 140.2 (9.1 / 123.4 / 15.9), 144.8 (8.3 / 127.3 / 17.6) | 57.2 (21.9 / 26.3 / 28.7), 60.7 (22.2 / 34.0 / 27.7) |
| P1 (c) | 5.1 | 141.7 (11.0 / 123.9 / 16.7) | 52.6 (21.5 / 24.1 / 27.4) |
| P2 (b) | 5.9 | 137.8 (12.2 / 120.3 / 16.8) | 59.6 (20.8 / 30.2 / 30.2) |
| P3 (b, c) | 5.6, 5.1 | 138.5 (9.7 / 121.2 / 15.6), 136.1 (11.3 / 117.5 / 15.8) | 51.3 (23.1 / 24.5 / 28.8), 53.4 (20.7 / 23.1 / 26.7) |
| P4 (d, e) | 6.0, 5.1 | 131.9 (7.0 / 113.8 / 16.5), 147.6 (10.5 / 129.0 / 17.3) | 61.0 (22.9 / 32.4 / 28.6), 55.3 (21.7 / 26.5 / 27.7) |

What the profile shows. Figures are journal view times, means per frame in the typing window of the b runs. A view's time is recorded only when its own work reaches 0.5 ms:

1. **The canvas's own work is part of each frame, not most of it.** In the baseline, ScriptView prepaint and paint take 4.3 + 0.9 ms of a 12.6 ms frame with 8 streams, and 10.0 + 1.9 ms of 21.2 ms with 20. Busy Pane paints take about 2.4 ms with 8 streams. The rest is below the timing floor: Pane work, GPUI's cache replay and scene building.
2. **P3 takes the canvas out, and the frame keeps most of its cost.** ScriptView prepaint falls from 4.3 to 0.9 ms and from 10.0 to 2.2 ms. Panel boundaries re-render on 54 of 346 frames with 8 streams. The time below the floor rises by nearly as much, from 2.4 to 5.0 ms and from 3.0 to 8.8 ms. That is the busy Panes' own layout, prepaint and paint, plus replaying about 24 cached boundaries. When every terminal is busy, every Pane and every panel boundary is dirty on most frames, so caching saves little. This is inferred from the phase times and the record counts. It was not isolated in a single run.
3. **P4 is slower than P3 at 20 streams** (21.5 to 21.8 ms against 18.2 to 18.3 ms), in two runs each. Caching the Pane inside each boundary therefore matters once boundaries exist. The mechanism was not isolated.
4. **P2 removed nothing.** Its ScriptView still missed its cache on nearly every frame: 3.7 to 3.9 ms of prepaint per frame, against 4.1 to 4.3 ms in the baseline. These were ruled out by measurement in `p2-probe`: script rebuilds (about 9 a second during a drag, from hover changes, and 0 to 0.2 a second while typing), workspace notices (0) and accessibility mode (inactive). These were ruled out by reading source: GPUI's ancestor walk, gpui-shell observers, `window.refresh` callers and the split component's measuring. The cause was not found.
5. **Drag lag follows the frame and the pointer path, not the canvas alone.** No variant moves drag latency beyond run-to-run spread. The avatar-motion report's v1 and v2, which stop canvas pointer handlers and hold terminals during a drag, remain the direct fix: 57 ms became 21 ms in that report's sliver layout.
6. **Typing with 8 busy terminals waits on the echo, not on drawing.** The app handles the key in 7 to 12 ms and draws the echo in 16 to 18 ms. The echo comes back from Core 110 to 150 ms after the key, on every key, in every variant. With 20 busy terminals it comes back in 23 to 34 ms. This is outside the canvas and not explained. A likely place to look is Core's per-terminal output scheduling or credit under load.

## Question 3. Cost of each as a product change

| | Files | Size | SDK change | Risk to existing behaviour | Measured gain |
|---|---|---|---|---|---|
| P1 | `desktop/src/terminal.rs` | 1 line | none | Low. Accessibility mode should bypass the cache, as `CanvasHost` does. | none |
| P2 | new `desktop/src/terminal_layer.rs`, `terminal.rs`, `host.rs` | about 120 lines as prototyped. A product version is a large canvas restructure. | none for the prototype | High. Terminals draw over the avatar, menus, the chat overlay, Portal overlays and drag previews. Terminal hitboxes sit above the canvas. Keys from a focused terminal stop reaching canvas key handlers, such as the maximize shortcut. Fixing that means splitting the canvas into layers under and over the terminals. | none |
| P3 | new `desktop/src/cached.rs`, `lib.rs`, `host.rs`, `terminal.rs`, `desktop/canvas/main.ts` | about 100 lines as prototyped, about 200 once finished | none (uses gpui-shell slot factories) | Medium. See the list below. | 8 to 10% of the frame at 20 busy terminals; none at 8 |
| P4 | as P3, without the `terminal.rs` line | about 100 lines | none | as P3 | none |

To finish P3 as a product change:

- Regenerate and typecheck the canvas TypeScript. The prototype edited the emitted `main.js` by hand.
- Own the boundary map per window and prune removed entries. The prototype uses a thread-local map that is never pruned.
- Invalidate boundaries on every path that can make the script dirty. A theme change applied inside render is missed today.
- Bypass boundaries in accessibility mode.
- Wrap only regions with a definite size. Cached views need a sized parent, so the content-sized context bar stays unwrapped.
- Add a native check that a panel's controls, hover and drag still work inside a boundary.

Every script rebuild invalidates every boundary. That is correct and conservative, and on hover it costs what it costs today.

## Question 4. Recommendation and scope

- **For the avatar drag:** do the avatar-motion v2 change. Stop canvas pointer handlers once the avatar drag moves, and hold terminal output while it moves. That is a **small** change of about 40 lines. Nothing measured here changes the drag more.
- **For the canvas redraw:** don't do it now. P3 is the only shape that kept a terminal's output to its own Vessel. It is a **medium** change, about 200 lines in the desktop crate with no SDK patch, and it buys about 2 ms per frame with 20 busy terminals and nothing measurable with 8. P2, Herdr's shape, would be a **rewrite** of how the canvas layers its content, and it measured no gain.
- **Worth measuring next, in order of what a user feels:**
  1. Core's echo delay when typing with 8 busy terminals, 110 to 150 ms of a 140 ms key to screen.
  2. The busy terminals' own per-frame cost: dirty Pane layout, prepaint and paint, and their frame rate. Busy terminals repaint on most frames (33 to 57 frames a second in the typing windows). Capping how often a terminal the user is not working in repaints could lower every busy frame. That is untested.

## Gaps

- **Repeats.** Two quiet runs per variant at most. P1 and P2 have one valid run each. The tables give ranges, not confidence intervals.
- **Surface.** Linux, headless mutter on Wayland, 60 Hz. No X11 or macOS numbers. Latency ends at the client's present.
- **Attribution.** Below the 0.5 ms floor the journal does not attribute work to a view. The split between Pane work and cache replay is inferred.
- **P2's cache miss** is unexplained. A per-frame dirty-view probe inside GPUI would settle it. That needs a patched gpui-pre.
- **Layout.** Terminals are tiled by halving the largest one. A user's real layout of many terminals may be smaller or partly hidden.
- **Visual check.** No screenshot confirms that P2 and P3 draw correctly. The harness's drag and typing checks passed in every valid run.

## Files on the branch

- `experiments/avatar-motion/wayland-drag.py`, `analyse.py`, `compare.py` and `wayland-run.sh`: the harness changes above.
- `desktop/src/terminal.rs`: the frame-profiler-only echo stamp.
- `experiments/canvas-redraw/p1-cached-panes.patch`, `p2-terminal-layer.patch`, `p3-cached-boundaries.patch` and `p4-boundaries-uncached-panes.patch`.
- `experiments/canvas-redraw/probe-canvas-invalidation.patch` is P2's `host.rs` with the invalidation probes added. Use it in place of P2's `host.rs` hunk.
- `experiments/canvas-redraw/results.md`: the comparison tables printed by `compare.py` for every run.

To repeat a run, build a variant with the frame profiler, then run `experiments/avatar-motion/wayland-run.sh <folder with voyager-shell and voyager> <label> idle,streaming,streaming20` and `python3 -I experiments/avatar-motion/compare.py <scratch>/wayland <labels…>`.

## Budget note

On 22 Nov the meter read `level=tight raw_pct=82` at 15:16. Voyager paused the work twice for budget and resumed it on Isaac's word. Builds and runs were held for Build's voice runs, and each perf run went only in a gap Build gave.
