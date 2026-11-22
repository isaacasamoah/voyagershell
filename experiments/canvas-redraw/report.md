# Terminal output redraws the whole canvas

Status: cause traced in source; prototypes in progress. Branch `experiment/canvas-redraw`, off main b2cc7447.

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

## Budget note

At 15:16 the budget meter read `level=tight raw_pct=82`. Voyager paused the work and then resumed it, saying the allowance had been reset. The meter had not yet shown a reset when work resumed.
