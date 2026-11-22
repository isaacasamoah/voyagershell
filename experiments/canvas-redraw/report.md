# Terminal output redraws the whole canvas

Status: **paused for budget, 22 Nov evening.** Cause traced. Four prototypes built; three measured once each. No recommendation yet: one measured round is not enough, and the numbers point at a second cost the plan did not expect. Branch `experiment/canvas-redraw`, off main b2cc7447.

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

## Prototype plan

Each prototype is a patch against main b2cc7447, built through `heavy` with `--features voyager-desktop/frame-profiler`, and measured with the avatar-motion Wayland harness (`experiments/avatar-motion/` from `experiment/avatar-motion` bd1023b0). The measurements are:

- frame (draw) time and phase times with 8 and with 20 visible busy terminals,
- avatar drag latency and frames shown under the same loads,
- typing latency in a quiet terminal while the others stream (harness extension needed).

Prototypes:

- **P1, cached Panes.** Draw each Pane as a cached view inside the canvas (`terminal.rs:627`). The canvas still rebuilds on every terminal frame, but the other Panes replay instead of rendering. One line, no SDK change. It shows how much of the cost is Pane repaint and how much is the canvas tree.
- **P2, terminals outside the canvas tree (Herdr's shape).** The canvas's `Terminal` component becomes a placeholder that records its bounds and clip. A layer in `CanvasHost`, after the cached ScriptView, draws each Pane as a cached view at those bounds in the same frame. A Pane notify then dirties only that Pane and CanvasHost; the canvas replays. Known costs to assess: z-order (canvas content meant to sit over a terminal, such as menus, Portal overlays and drag ghosts, would draw under it), pointer hit order, and clearing entries when the canvas stops placing a terminal.
- **P3, cached canvas subtrees.** Keep terminals in the canvas, but let the canvas wrap each Vessel placement in a cached boundary, so a terminal frame rebuilds only its own placement's chrome plus the canvas root. Needs either a native component or a gpui-shell materialize change (SDK patch). Built only if P1 and P2 leave the question open.

Not prototyped: a GPUI patch that repaints a dirty child inside a replayed parent. It would change GPUI's frame replay model (prepaint and paint ranges, dispatch tree reuse, element id and content mask stacks), which is a rewrite-sized SDK change.

## Harness changes

The avatar-motion Wayland harness (`experiments/avatar-motion/`) gained these, on this branch:

- **Tiled terminals.** Each new terminal splits the largest one, along its longer side. Before this change, every terminal split the newest one in half, so at 8 or 20 terminals most were 18 px slivers stacked on each other. The earlier drag experiment's "eight visible terminals" had that same layout, so it understated the drawing load. Now 8 streams give 10 terminals of about 295 by 175 to 391 px, and 20 streams give 22 terminals of 142 to 295 by 176 px, in the default 1450 by 940 window.
- **Twenty streams.** The `streaming20` level adds terminals until 20 stream at once, all in the shown Fleet.
- **Typing.** A `typing` terminal runs a raw-mode echo loop. Before each drag, the harness clicks that terminal and types 40 keys, 150 ms apart. A frame-profiler-only line in `Pane::pump` stamps when the echo is parsed. The analysis splits key to screen into three parts: key handled by the app, echo back from Core, and echo drawn.
- `VOYAGER_REDRAW_PROBE` passes through to the app.

## Measurements so far (one run each, not yet repeatable)

Run folders are under `/var/tmp/voyager-crew/scratch/canvas-redraw/wayland/`: `base-b`, `p1-b`, `p2-b` and `p3-b`, plus `p2-probe`. P1's run overlapped another crew's load: the 5-minute load average was 13.7 to 13.9, against 6.6 to 7.1 for the baseline. P1's numbers are therefore not trusted. Its idle drag p95 also rose to 89 ms.

Drag, 950 moves over 228 frames:

| variant | load | latency median / p95 ms | frames shown | frame median ms |
|---|---|---|---|---|
| baseline | idle | 15.0 / 23.0 | 226 | 0.83 |
| baseline | 8 streams | 44.6 / 71.2 | 113 | 13.5 |
| baseline | 20 streams | 94.0 / 154.6 | 58 | 24.3 |
| P1 cached Panes (load) | 8 / 20 | 234 / 280 median | 26 / 21 | 20.7 / 33.5 |
| P2 terminal layer | 8 streams | 41.4 / 62.7 | 120 | 12.4 |
| P2 terminal layer | 20 streams | 80.5 / 135.6 | 66 | 21.5 |
| P3 boundaries + cached Panes | 8 streams | 42.3 / 73.3 | 119 | 12.4 |
| P3 boundaries + cached Panes | 20 streams | 87.1 / 140.7 | 62 | 23.4 |

Typing, 40 keys. Times are medians in ms, except the frame column, which gives median / p95:

| variant | load | key to screen | key handled | echo back | echo drawn | frame |
|---|---|---|---|---|---|---|
| baseline | idle | 5.9 | 1.2 | 1.9 | 3.9 | 3.2 / 3.6 |
| baseline | 8 streams | 140.2 | 9.1 | 123.4 | 15.9 | 12.2 / 17.8 |
| baseline | 20 streams | 57.2 | 21.9 | 26.3 | 28.7 | 20.4 / 26.0 |
| P2 | 8 / 20 streams | 137.8 / 59.6 | 12.2 / 20.8 | 120.3 / 30.2 | 16.8 / 30.2 | 11.9 / 21.6 |
| P3 | 8 / 20 streams | 138.5 / 51.3 | 9.7 / 23.1 | 121.2 / 24.5 | 15.6 / 28.8 | 12.0 / 18.3 |

What these show so far:

1. **The canvas rebuild is real, but it is only part of each frame.** In the baseline at 8 streams, the ScriptView's own prepaint is 4.3 ms of a 12.6 ms frame (typing window, mean per frame). At 20 streams it is 10.0 ms of 21.2 ms. Pane paint, GPUI's cache replay and other work below the profiler's 0.5 ms view floor make up the rest.
2. **P3 removes most of the canvas's own cost.** ScriptView prepaint per frame falls from 4.3 to 0.9 ms at 8 streams and from 10.0 to 2.2 ms at 20 streams. The panel boundaries render on 54 of 346 frames, so the others replay. The frame still falls only from 12.6 to 12.4 ms and from 21.2 to 19.3 ms. The time not attributed to any view rises by about as much as the canvas saved: from 2.4 to 5.0 ms, and from 3.0 to 8.8 ms. A likely cause, inferred and not yet isolated, is that P3 includes P1. With every terminal busy, every cached Pane is dirty, so caching only adds a separate layout and state bookkeeping per Pane. Replaying about 24 cached boundaries also has a cost. P4, which keeps the boundaries but leaves Panes uncached, was built to test this but not measured.
3. **P2 showed no gain, for a reason not found.** P2 moves terminals out of the canvas tree, Herdr's shape, yet its ScriptView still misses its cache on nearly every frame: 3.7 to 3.9 ms of prepaint per frame. Ruled out by measurement: script rebuilds (the probe counts about 9 a second during a drag, from hover changes, and 0 to 0.2 a second while typing), workspace notices (0), and accessibility mode (inactive). Ruled out by reading source: GPUI's ancestor walk, gpui-shell observers and `window.refresh` callers. Its structural costs are below. Given those costs, finding this cause has low priority.
4. **Typing with 8 streams waits on the echo, not on drawing.** The app handles the key in 9 ms and draws the echo in 16 ms. The echo comes back from Core 110 to 150 ms after the key, on every key. With 20 streams it comes back in 25 to 30 ms. This is outside the canvas question and not explained. A likely place to look is Core's per-terminal output batching or credit under load. It is worth its own investigation, because it is the largest part of the typing delay a user sees.
5. **Drag lag follows frame time.** None of the variants changes the drag much (44.6 to 41 ms median at 8 streams). The avatar-motion v2 recommendation, which pauses terminals during a drag, remains the direct fix for the drag. The canvas work lowers the cost of every frame, with or without a drag.

## Prototype costs as product changes (preliminary)

- **P1, cached Panes.** 1 line in `desktop/src/terminal.rs`. No SDK change. It probably makes frames slower when terminals are busy (see item 2). To be confirmed in a quiet run.
- **P2, terminal layer (Herdr's shape).** About 120 lines: `desktop/src/terminal_layer.rs`, plus `terminal.rs` and `host.rs`. No SDK change. Its risks break agreed behaviour. Terminals draw over everything in the canvas: the avatar, menus, the chat overlay, Portal overlays and drag previews. Terminal hitboxes sit on top of the canvas. Keys from a focused terminal no longer reach canvas key handlers, such as the maximize shortcut. A product version needs the canvas split into a layer under the terminals and a layer over them. That is a large canvas architecture change, and this prototype measured no gain.
- **P3 / P4, cached canvas boundaries.** About 100 lines: a native `Cached` component in `desktop/src/cached.rs`, which takes the canvas's `.content()` slot as a lazy factory. Plus a registry line in `lib.rs`, an observer in `host.rs` that invalidates boundaries when the script rebuilds, and three wrap sites in `desktop/canvas/main.ts`. No SDK patch: it uses gpui-shell's slot factories. Prototype shortcuts are still to settle:
  - The emitted `main.js` was edited by hand, and TypeScript was not regenerated or typechecked.
  - Boundaries are kept in a thread-local map and never pruned.
  - A theme change applied inside render does not invalidate the boundaries.
  - Every script rebuild invalidates every boundary. That is conservative and correct, but it costs the same as today on hover.
  - Cached views need a parent with a definite size, so content-sized regions such as the context bar cannot be wrapped.
  - Accessibility mode should bypass the boundaries, as CanvasHost already does for the canvas.

## Files on the branch

- `experiments/canvas-redraw/p1-cached-panes.patch`, `p2-terminal-layer.patch`, `p3-cached-boundaries.patch` and `p4-boundaries-uncached-panes.patch`. Each applies to the branch's measuring commit.
- `experiments/canvas-redraw/probe-canvas-invalidation.patch` is P2's `host.rs` with the invalidation probes added. Use it in place of P2's `host.rs` hunk.
- Built binaries are under `/var/tmp/voyager-crew/scratch/canvas-redraw/variants/`: baseline, p1, p2, p2-probe, p3 and p4.

## Next steps after the reset

1. Run P4 once, and run a second interleaved round of baseline, P1, P3 and P4 on a quiet machine. Builds go only through heavy, niced, at most 4 jobs. Runs go after the voice tests.
2. If P4 beats P3, attribute the remaining frame time at 20 streams: Pane paint against replay.
3. Answer question 4 with a recommendation and its scope. On the evidence so far, the likely answer is P4 as a medium change (about 100 lines, no SDK patch), with the drag pause from avatar-motion v2 still needed for the drag.
4. Record the Core echo delay at 8 streams as its own question.

## Budget note

At 15:16 the budget meter read `level=tight raw_pct=82`. Voyager paused the work, then resumed it, saying the allowance had been reset. The meter had not yet shown a reset when work resumed. Voyager paused the work again later on 22 Nov, until the weekly reset.
