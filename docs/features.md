# Feature map

Generated from `tests/native/features.toml`, `architecture/atlas-features.yaml` and the context owners in `tests/architecture/vocabulary.yaml` by `npm run features:generate`. Edit those inputs, then regenerate. The complete map with code paths and state is `architecture/features.yaml`.

`proof` is `native` when a native journey covers the feature, `python-only` when only a retained Python journey does, and `tests` when it has no journey and a CI step named in `architecture/atlas-features.yaml` is its proof, shown as proven by its tests. Only a feature with no journey may take such a step.

## The change gate

On a pull request, `npm run features:check -- --base <base>` fails when a change touches a feature's source paths with no change to its map entry and no recorded run. Record the run by adding a line `Journeys run: <journey>, <journey>` to the PR description, then push a new commit, because editing the description does not rerun CI. Every such line counts. A feature needs all of its native journeys, or one Python journey when it has no native journey. Another way through is to change the feature's entry in `tests/native/features.toml` and run `npm run features:generate`. A feature proven by its tests needs no record, because that CI step runs on the same pull request.

| Feature | Group | Owner | Proof | Native journeys | Python journeys | Docs |
| --- | --- | --- | --- | --- | --- | --- |
| Voyages | Workspace layout | desktop-presentation | native | workspace | demo-feedback | [docs/content.md](content.md), [docs/terminal.md](terminal.md), [docs/workspace.md](workspace.md) |
| Fleets | Workspace layout | desktop-presentation | native | workspace | - | [docs/terminal.md](terminal.md), [docs/workspace.md](workspace.md) |
| Fleet arrangement | Workspace layout | desktop-presentation | native | arrangement | layouts, arrangement | [docs/arrangement.md](arrangement.md), [docs/terminal.md](terminal.md), [docs/workspace.md](workspace.md) |
| Vessels | Workspace layout | desktop-presentation | native | workspace | - | [docs/terminal.md](terminal.md), [docs/workspace.md](workspace.md) |
| Agent Vessels | Terminal agents | desktop-presentation | python-only | - | arrangement, terminal-agent | [docs/terminal.md](terminal.md), [docs/workspace.md](workspace.md) |
| Portals | Workspace layout | content | native | portals | portal-terminal | [.agents/skills/verify/features/portals.md](../.agents/skills/verify/features/portals.md), [docs/content.md](content.md), [docs/terminal.md](terminal.md), [docs/workspace.md](workspace.md) |
| Split / resize / maximize | Workspace layout | desktop-presentation | native | arrangement | workspace-ux | [docs/terminal.md](terminal.md), [docs/workspace.md](workspace.md) |
| Terminal I/O | Terminals | desktop-presentation | native | terminal-input | terminal-grid, portal-terminal | [docs/terminal.md](terminal.md) |
| Terminal scroll | Terminals | desktop-presentation | native | terminal-scrolling | terminal-scrolling | [.agents/skills/verify/features/terminal-scrolling.md](../.agents/skills/verify/features/terminal-scrolling.md), [docs/terminal.md](terminal.md) |
| Selection | Terminals | desktop-presentation | native | terminal-input | - | [docs/terminal.md](terminal.md) |
| Clipboard | Platform | desktop-presentation | native | terminal-input | notes-lifetime | [docs/terminal.md](terminal.md) |
| Notes | Notes | desktop-presentation | python-only | - | notes, notes-lifetime | [docs/terminal.md](terminal.md) |
| Avatar docking / drag | Avatar | desktop-presentation | python-only | - | avatar, portal-avatar | [docs/terminal.md](terminal.md) |
| Chat / conversation | Private assistant | conversation-provider | native | chat | conversation, conversation-interrupt, conversation-administrator, conversation-workspace-refresh, conversation-process, conversation-ux, conversation-scroll, conversation-stop, conversation-content | [.agents/skills/verify/features/chat.md](../.agents/skills/verify/features/chat.md), [docs/conversation.md](conversation.md), [docs/terminal.md](terminal.md) |
| Voice | Voice | conversation-provider | python-only | - | conversation-voice | [docs/conversation.md](conversation.md), [docs/terminal.md](terminal.md) |
| Layouts / Home | Workspace layout | desktop-presentation | python-only | - | layouts, workspace-ux | [docs/layouts.md](layouts.md), [docs/terminal.md](terminal.md) |
| Worktrees | Worktrees | desktop-presentation | python-only | - | demo-feedback | [docs/terminal.md](terminal.md), [docs/workspace.md](workspace.md) |
| Close Voyage / quit / restore | Start-up and quit | desktop-presentation | native | quit-restore, voyage-close | - | [docs/terminal.md](terminal.md), [docs/workspace.md](workspace.md) |
| Window drag bar | Workspace layout | desktop-presentation | native | workspace | - | [docs/terminal.md](terminal.md) |
| Profile theme | Script host | desktop-presentation | native | profile | - | [docs/terminal.md](terminal.md) |
| Profile updates | Content model | content | native | profile-updates | - | [docs/content.md](content.md), [docs/terminal.md](terminal.md) |
| Scripts live edit | Script host | desktop-presentation | python-only | - | canvas-stack | [docs/terminal.md](terminal.md) |
| Stored layout across builds | Workspace layout | application-queue | native | layout-compat, layout-refused, layout-corrupt | - | [docs/workspace.md](workspace.md) |
| Front door | Shared contract | application-queue | native | slow-save | - | [docs/terminal.md](terminal.md), [docs/workspace.md](workspace.md) |
| Refused and uncertain results | Shared contract | desktop-presentation | native | outcomes | - | [.agents/skills/verify/features/outcomes.md](../.agents/skills/verify/features/outcomes.md), [docs/terminal.md](terminal.md), [docs/workspace.md](workspace.md) |
| Core reports and slow reads | Core adapter | application-queue | native | core-events, slow-list | - | [docs/terminal.md](terminal.md), [docs/workspace.md](workspace.md) |
| Labelled programs as Vessels | Content model | application-queue | native | adopt-by-label | - | [docs/terminal.md](terminal.md), [docs/voyager-command.md](voyager-command.md), [docs/workspace.md](workspace.md) |
| Verification environment | Diagnostics | verification | tests | - | - | [tests/native/README.md](../tests/native/README.md) |
