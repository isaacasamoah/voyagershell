# Feature map

Generated from [tests/native/features.toml](../../../../tests/native/features.toml).
Edit the registry, then run `voyager-verification features --write`. The `--check`
mode fails when this table is stale. `covered` means a native journey proves the
tier. `python-only` means only the retained Python fixture does. `none` means nothing.

<!-- features:begin -->
| Feature | Behavior | Performance | Visual | Debug | Native journeys | Python journeys | Platforms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Voyages | python-only | none | python-only | python-only | - | workspace, placement, demo-feedback | linux |
| Fleets | python-only | none | python-only | python-only | - | workspace, layouts, arrangement | linux |
| Vessels | python-only | none | python-only | python-only | - | workspace, arrangement, terminal-agent | linux |
| Portals | python-only | none | python-only | python-only | - | placement, portal-terminal, portal-close | linux |
| Split / resize / maximize | python-only | none | none | python-only | - | split-resize, pane-maximize, workspace-ux | linux |
| Terminal I/O | python-only | none | python-only | python-only | - | terminal, terminal-grid, portal-terminal | linux |
| Terminal scroll | covered | none | covered | covered | terminal-scrolling | terminal-scrolling | linux |
| Selection | python-only | none | python-only | python-only | - | terminal-grid | linux |
| Clipboard | python-only | none | none | python-only | - | terminal-grid, canvas, notes-lifetime | linux |
| Notes | python-only | none | python-only | python-only | - | notes, notes-lifetime | linux |
| Avatar docking / drag | python-only | none | python-only | python-only | - | avatar, portal-avatar | linux |
| Chat / conversation | python-only | none | python-only | python-only | - | conversation, conversation-interrupt, conversation-administrator, conversation-workspace-refresh, conversation-process, conversation-ux, conversation-scroll, conversation-stop, conversation-content | linux |
| Voice | python-only | none | none | python-only | - | conversation-voice | linux |
| Layouts / Home | python-only | none | python-only | python-only | - | layouts, workspace-ux | linux |
| Worktrees | python-only | none | none | python-only | - | demo-feedback | linux |
| Close Voyage / quit / restore | python-only | none | python-only | python-only | - | session-quit, voyage-close, workspace | linux |
| Scripts live edit | python-only | python-only | python-only | python-only | - | canvas, canvas-stack | linux |
<!-- features:end -->

Recipes: [terminal-scrolling.md](terminal-scrolling.md).

This seed deliberately claims one proven feature. Workspace arrangement, Notes,
conversation, voice, actual Codex, the real compositor and performance journeys
remain in the existing Python fixture and are not migrated or re-proved here.
Preserve them. Add a mapped feature only with source entry points, prerequisites,
actual actions and observable success. No fixture-private design or hidden pass
criterion belongs in another feature's script.
