# Avatar redraw comparison

This diagnostic compared two optimized native builds using the same saved profile, Core session and viewport. It used baseline–candidate–candidate–baseline order, an eight-second warmup after viewport readiness, and fifteen seconds of app/Core CPU and PSS samples per run. PSS divides shared memory between processes. App and Core measurements stay separate.

The candidate moved the avatar beside the cached script workspace. CPU remained around 88–91% of one core in both variants, and app memory ranges overlapped. The native change was reverted. The candidate artifact and patch remain available for inspection. This result does not identify the remaining CPU cause.

The two automated drag recordings did not show the avatar following the requested pointer movement. They do not establish successful dragging or latency. The existing recorder produces a resampled 30 fps visual record, not calibrated input-to-pixel timings. Startup-to-usable time was not measured.

`compare.py` takes one explicit JSON protocol path. It reuses the native fixture's Core, process-identity and Mutter input/capture helpers. It closes viewers through normal Quit, checks the recorded backend identities and layout, and uses cloned profiles. It does not stop Core or run model requests. Treat it as an exploratory coordinator, not the foundation's accepted load fixture. Keep raw attempts and source with each result, including failed setup and resumed phases.

The single project walkthrough contains the results and remaining limits. Complete foundation acceptance still requires the agreed native UX, whole-process resource accounting, latency/frame measurements, increasing-load comparison, stability run and proving-code inventory.

## Redraw-source observation

The later opt-in `probe.rs` counted native render calls and their triggers through the existing Header poll. It requested no redraws and capped structured reports at forty. Its temporary hooks were removed from product source after observation.

In the quiet three-terminal scene, normal animation repeatedly rebuilt the native workspace and terminal views without new terminal bytes; accessibility was inactive. The existing reduced-motion control stopped that work. App CPU was 96.48% with original animation and 1.53% with reduced motion. This diagnoses animation-driven rebuild breadth. Reduced motion changes the experience and is not a selected optimization. Counts are not displayed frame rate, precise input latency or per-function CPU timing.

The earlier relocation stayed inside ShellRoot's cached Header. GPUI therefore still rebuilt that cached ancestor and its descendants on avatar updates. Herdr App separates changing overlays from cached mod content, redraws visible terminal screen changes and retains unchanged row drawing. The next experiment should use the actual independent native overlay boundary while preserving original animation and menu, sheet, accessibility, focus and docking behavior.
