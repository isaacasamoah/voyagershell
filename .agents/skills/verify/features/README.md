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
| Fleet arrangement | covered | none | python-only | covered | arrangement | layouts, arrangement | linux |
| Vessels | covered | none | none | covered | workspace | - | linux |
| Agent Vessels | covered | none | python-only | python-only | terminal-agent | arrangement | linux |
| Portals | covered | none | python-only | covered | portals | portal-terminal | linux |
| Split / resize / maximize | covered | none | none | covered | arrangement | workspace-ux | linux |
| Terminal I/O | covered | none | covered | covered | terminal-input | terminal-grid, portal-terminal | linux |
| Terminal scroll | covered | none | covered | covered | terminal-scrolling | terminal-scrolling | linux |
| Selection | covered | none | covered | covered | terminal-input | - | linux |
| Clipboard | python-only | none | none | python-only | terminal-input | conversation-ux | linux |
| Avatar docking / drag | python-only | none | python-only | python-only | avatar-drag, socket-dock | avatar, portal-avatar | linux |
| Chat / conversation | python-only | none | python-only | python-only | chat | conversation, conversation-interrupt, conversation-administrator, conversation-workspace-refresh, conversation-process, conversation-ux, conversation-scroll, conversation-stop | linux |
| Voice | covered | none | none | python-only | voice, voice-talk-over | conversation-voice | linux |
| Layouts / Home | covered | none | python-only | python-only | arrangement | layouts, workspace-ux | linux |
| Worktrees | covered | none | none | covered | worktrees | - | linux |
| Close Voyage / quit / restore | covered | none | none | covered | quit-restore, voyage-close, daily-start, release-update | - | linux |
| Window drag bar | covered | none | none | covered | workspace | - | linux |
| Profile theme | covered | none | none | covered | profile | - | linux |
| Profile updates | covered | none | none | covered | profile-updates | - | linux |
| Manifest Vessels | covered | none | none | none | manifest-vessel | - | linux |
| Scripts live edit | covered | none | none | none | canvas-stack | - | linux |
| Stored layout across builds | covered | none | none | covered | layout-compat, layout-refused, layout-corrupt | - | linux |
| Front door | covered | none | none | covered | slow-save | - | linux |
| Refused and uncertain results | covered | none | none | covered | outcomes | - | linux |
| Core reports and slow reads | covered | none | none | covered | core-events, slow-list | - | linux |
| Labelled programs as Vessels | covered | none | none | covered | adopt-by-label, socket-dock, agent-split, home-create | - | linux |
| Voyager without its command | covered | none | none | covered | voyager-command | - | linux |
| Verification environment | none | none | none | none | - | - | linux |
<!-- features:end -->

The recipes are [terminal-scrolling.md](terminal-scrolling.md),
[workspace.md](workspace.md), [quit-restore.md](quit-restore.md) and
[terminal-input.md](terminal-input.md).

The table says which features a native journey covers. `terminal-scrolling`
proves Terminal scroll. `workspace` proves Voyages, Fleets and Vessels, and
only the actions that its recipe lists. Those are create, switch and rename a
Voyage or a Fleet, and split and rename a terminal Vessel. `terminal-input`
proves Terminal I/O and Selection, and only the checks that its recipe lists.
It also drives copy and paste in a terminal, but the Clipboard feature stays
`python-only` because copy and paste in the chat composer has no native
journey. A feature whose tier the table marks `python-only`, such as agent
Vessels or chat, stays in the retained Python fixture and is not re-proved
here. Preserve those Python journeys. Add a mapped feature only with
source entry points, prerequisites, actual actions and observable success. No
fixture-private design or hidden pass criterion belongs in another feature's
script.
