# Feature map

Generated from [tests/native/features.toml](../../../../tests/native/features.toml).
Edit the registry, then run `voyager-verification features --write`. The `--check`
mode fails when this table is stale. `covered` means a native journey proves the
tier. `python-only` means only the retained Python fixture does. `none` means nothing.

<!-- features:begin -->
| Feature | Behavior | Performance | Visual | Debug | Native journeys | Python journeys | Platforms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Voyages | covered | none | none | covered | workspace | demo-feedback | linux |
| Fleets | covered | none | none | covered | workspace | - | linux |
| Fleet arrangement | python-only | none | python-only | python-only | - | layouts, arrangement | linux |
| Vessels | covered | none | none | covered | workspace | - | linux |
| Agent Vessels | python-only | none | python-only | python-only | - | arrangement, terminal-agent | linux |
| Portals | python-only | none | python-only | python-only | - | placement, portal-terminal, portal-close | linux |
| Split / resize / maximize | python-only | none | none | python-only | - | split-resize, pane-maximize, workspace-ux | linux |
| Terminal I/O | python-only | none | python-only | python-only | - | terminal, terminal-grid, portal-terminal | linux |
| Terminal scroll | covered | none | covered | covered | terminal-scrolling | terminal-scrolling | linux |
| Selection | python-only | none | python-only | python-only | - | terminal-grid | linux |
| Clipboard | python-only | none | none | python-only | - | terminal-grid, notes-lifetime | linux |
| Notes | python-only | none | python-only | python-only | - | notes, notes-lifetime | linux |
| Avatar docking / drag | python-only | none | python-only | python-only | - | avatar, portal-avatar | linux |
| Chat / conversation | python-only | none | python-only | python-only | - | conversation, conversation-interrupt, conversation-administrator, conversation-workspace-refresh, conversation-process, conversation-ux, conversation-scroll, conversation-stop, conversation-content | linux |
| Voice | python-only | none | none | python-only | - | conversation-voice | linux |
| Layouts / Home | python-only | none | python-only | python-only | - | layouts, workspace-ux | linux |
| Worktrees | python-only | none | none | python-only | - | demo-feedback | linux |
| Close Voyage / quit / restore | covered | none | python-only | covered | quit-restore, voyage-close | voyage-close, placement | linux |
| Scripts live edit | python-only | python-only | python-only | python-only | - | canvas-stack | linux |
<!-- features:end -->

Recipes: [terminal-scrolling.md](terminal-scrolling.md) and
[workspace.md](workspace.md).

The table claims native coverage for four features. `terminal-scrolling`
proves Terminal scroll. `workspace` proves Voyages, Fleets and Vessels, and
only the actions that its recipe lists: create, switch and rename a Voyage or
a Fleet, and split and rename a terminal Vessel. Fleet arrangement, agent
Vessels, Notes, conversation, voice, actual Codex, the real compositor and
performance journeys remain in the existing Python fixture and are not
migrated or re-proved here. Preserve them. Add a mapped feature only with
source entry points, prerequisites, actual actions and observable success. No
fixture-private design or hidden pass criterion belongs in another feature's
script.
